import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ItemType } from './market-types';

const r1 = (v: number) => Math.round(v * 10) / 10;

export interface ExecuteTradeParams {
  listingId: string;
  buyerTeamId: string;
  sellerTeamId: string;
  tradeType: 'buy' | 'barter';
  itemType: ItemType;
  itemName: string;
  quantity: number;
  pointsPaid: number;
  scope: string;
  themeId?: string;
  schoolId?: string;
  offerId?: string;
  // 兑换场景：响应方物品信息
  barterItemType?: ItemType;
  barterItemRef?: string;
  barterItemName?: string;
  barterQuantity?: number;
  // 卖方物品来源（user_reward_id 或 submission_id）
  sellerItemRef?: string;
  // 买方物品来源（仅兑换）
  buyerItemRef?: string;
}

export interface TradeResult {
  success: boolean;
  tradeId?: string;
  error?: string;
  errorCode?: 'INSUFFICIENT_POINTS' | 'LISTING_UNAVAILABLE' | 'OWNERSHIP_CHANGED' | 'CONFLICT' | 'INTERNAL';
}

/**
 * 执行一笔交易（原子操作，失败回滚已执行步骤）
 * 
 * 步骤：
 * 1. 乐观锁扣买方积分（仅 pointsPaid > 0 时）
 * 2. 乐观锁加卖方积分（仅 pointsPaid > 0 时）
 * 3. 转移物品归属
 *    - tool: 卖方 user_rewards 删除 quantity 条，买方插入 quantity 条
 *    - skill: 仅买方插入 quantity 条（复制）
 *    - work: 复制 task_submissions 记录给买方
 * 4. 递减 listing.available_quantity，为0则 status=sold_out
 * 5. 写 cloud_market_trades
 * 6. 写 point_transactions（双方各一条，仅 pointsPaid > 0 时）
 * 7. 通知双方
 */
export async function executeTrade(params: ExecuteTradeParams): Promise<TradeResult> {
  // SEC-001: 市场交易涉及跨小队原子操作(扣买方积分、加卖方积分、转移物品),
  // anon + 单一用户 token 无法操作其他小队数据,必须用 service_role
  const supabase = getSupabaseAdminClient();
  const {
    listingId, buyerTeamId, sellerTeamId, tradeType,
    itemType, itemName, quantity, pointsPaid, scope,
    themeId, schoolId, offerId,
    barterItemType, barterItemRef, barterItemName, barterQuantity,
    sellerItemRef, buyerItemRef,
  } = params;

  // 安全修复 VULN-BIZ-017：交易前再次校验挂单状态和买卖双方身份，防止 TOCTOU 竞态
  const { data: preCheckListing, error: preCheckError } = await supabase
    .from('cloud_market_listings')
    .select('id, status, team_id, available_quantity')
    .eq('id', listingId)
    .single();
  if (preCheckError || !preCheckListing) {
    return { success: false, errorCode: 'LISTING_UNAVAILABLE', error: '挂单不存在' };
  }
  if (preCheckListing.status !== 'active') {
    return { success: false, errorCode: 'LISTING_UNAVAILABLE', error: '挂单已下架或已售罄' };
  }
  if (preCheckListing.team_id === buyerTeamId) {
    return { success: false, errorCode: 'LISTING_UNAVAILABLE', error: '不能购买自己的挂单' };
  }

  // 1. 乐观锁扣买方积分
  if (pointsPaid > 0) {
    const { data: buyer } = await supabase
      .from('teams')
      .select('points')
      .eq('id', buyerTeamId)
      .single();
    const buyerPoints = Number(buyer?.points) || 0;
    if (buyerPoints < pointsPaid) {
      return { success: false, errorCode: 'INSUFFICIENT_POINTS', error: '积分不足' };
    }
    const newBuyerPoints = r1(buyerPoints - pointsPaid);
    const { data: deducted, error: deductErr } = await supabase
      .from('teams')
      .update({ points: newBuyerPoints })
      .eq('id', buyerTeamId)
      .eq('points', buyerPoints)
      .select('id');
    if (deductErr || !deducted || deducted.length === 0) {
      return { success: false, errorCode: 'CONFLICT', error: '操作冲突，请重试' };
    }

    // 2. 乐观锁加卖方积分
    const { data: seller } = await supabase
      .from('teams')
      .select('points')
      .eq('id', sellerTeamId)
      .single();
    const sellerPoints = Number(seller?.points) || 0;
    const newSellerPoints = r1(sellerPoints + pointsPaid);
    const { data: credited, error: creditErr } = await supabase
      .from('teams')
      .update({ points: newSellerPoints })
      .eq('id', sellerTeamId)
      .eq('points', sellerPoints)
      .select('id');
    if (creditErr || !credited || credited.length === 0) {
      // LE-P16: 回滚买方扣减(使用统一的 rollbackPoints 函数,带乐观锁 + 重试)
      await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'CONFLICT', error: '操作冲突，请重试' };
    }
  }

  // 3. 转移物品归属
  // 3a. 卖方物品转移给买方
  if (itemType === 'tool' && sellerItemRef) {
    const { data: sellerRewards } = await supabase
      .from('user_rewards')
      .select('id, reward_id, task_id')
      .eq('id', sellerItemRef)
      .limit(quantity);
    if (!sellerRewards || sellerRewards.length < quantity) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '物品归属已变更' };
    }
    const idsToDelete = sellerRewards.slice(0, quantity).map(r => r.id);
    const { error: delErr } = await supabase
      .from('user_rewards')
      .delete()
      .in('id', idsToDelete);
    if (delErr) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '转移物品失败' };
    }
    const insertRows = sellerRewards.slice(0, quantity).map(r => ({
      team_id: buyerTeamId,
      reward_id: r.reward_id,
      task_id: r.task_id,
    }));
    const { error: insErr } = await supabase.from('user_rewards').insert(insertRows);
    if (insErr) {
      // 回滚：重新插入卖方
      await supabase.from('user_rewards').insert(
        sellerRewards.slice(0, quantity).map(r => ({
          id: r.id, team_id: sellerTeamId, reward_id: r.reward_id, task_id: r.task_id,
        }))
      );
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '转移物品失败' };
    }
  } else if (itemType === 'skill' && sellerItemRef) {
    const { data: sellerReward } = await supabase
      .from('user_rewards')
      .select('reward_id, task_id')
      .eq('id', sellerItemRef)
      .single();
    if (!sellerReward) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '物品归属已变更' };
    }
    const insertRows = Array.from({ length: quantity }, () => ({
      team_id: buyerTeamId,
      reward_id: sellerReward.reward_id,
      task_id: sellerReward.task_id,
    }));
    const { error: insErr } = await supabase.from('user_rewards').insert(insertRows);
    if (insErr) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '转移物品失败' };
    }
  } else if (itemType === 'work' && sellerItemRef) {
    const { data: submission } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('id', sellerItemRef)
      .single();
    if (!submission) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '物品归属已变更' };
    }
    // 防止已售作品被重复出售
    if (submission.status === 'sold') {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '作品已售出' };
    }
    // 安全修复 LE-P04: 先用乐观锁把 submission 标记为 sold,
    // 防止两个并发买家都通过上面的 status !== 'sold' 检查后,各自都执行 insert 复制 + 标记 sold,
    // 导致同一作品被重复出售给多个买方。
    // 这里把"标记 sold"提到 insert 之前,且用 .neq('status', 'sold') 作为乐观锁条件,
    // 只有第一个并发请求能成功(返回 length === 1),后续请求会拿到 0 行更新。
    const { data: markSoldResult, error: markSoldErr } = await supabase
      .from('task_submissions')
      .update({
        status: 'sold',
        sold_at: new Date().toISOString(),
        sold_to_team_id: buyerTeamId,
      })
      .eq('id', sellerItemRef)
      .neq('status', 'sold')
      .select('id');
    if (markSoldErr || !markSoldResult || markSoldResult.length === 0) {
      // 已被并发请求标记为 sold,本次交易放弃,回滚积分
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '作品已被并发出售' };
    }
    // 标记 sold 成功后再 insert 复制给买方;若 insert 失败需回滚 sold 标记
    const { error: insErr } = await supabase.from('task_submissions').insert({
      team_id: buyerTeamId,
      task_id: submission.task_id,
      content: submission.content,
      file_urls: submission.file_urls,
      status: 'approved',
      rating: submission.rating,
      source_trade_id: null,
    });
    if (insErr) {
      // 回滚 sold 标记,恢复原状态
      await supabase
        .from('task_submissions')
        .update({
          status: submission.status,
          sold_at: null,
          sold_to_team_id: null,
        })
        .eq('id', sellerItemRef)
        .eq('status', 'sold');
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '复制作品失败' };
    }
  }

  // 3b. 兑换场景：买方物品转移给卖方
  // 安全修复 VULN-BIZ-018：反向转移失败时回滚积分，避免扣积分不回滚导致数据不一致
  if (tradeType === 'barter' && barterItemType && buyerItemRef) {
    const reverseResult = await transferItem(supabase, barterItemType, buyerItemRef, buyerTeamId, sellerTeamId, barterQuantity || 1);
    if (!reverseResult.success) {
      console.error('[market-trade] 兑换反向转移失败，开始回滚:', reverseResult);
      // 回滚积分（如果已扣）
      if (pointsPaid > 0) {
        await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      }
      // 回滚正向物品转移（卖方物品已转给买方，尝试转回）
      // 注意：正向转移可能已部分完成，此处为尽力回滚
      if (sellerItemRef) {
        const rollbackResult = await transferItem(supabase, itemType, sellerItemRef, buyerTeamId, sellerTeamId, quantity);
        if (!rollbackResult.success) {
          console.error('[market-trade] 正向物品回滚也失败，存在物品不一致风险:', rollbackResult);
        }
      }
      return { success: false, errorCode: 'INTERNAL', error: '兑换反向转移失败，已回滚积分' };
    }
  }

  // 4. 递减 listing.available_quantity
  const { data: listing } = await supabase
    .from('cloud_market_listings')
    .select('available_quantity')
    .eq('id', listingId)
    .single();
  if (!listing) {
    if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
    return { success: false, errorCode: 'LISTING_UNAVAILABLE', error: '挂单不存在' };
  }
  const newAvail = listing.available_quantity - quantity;
  const newStatus = newAvail <= 0 ? 'sold_out' : 'active';
  const { data: updateResult, error: updListingErr } = await supabase
    .from('cloud_market_listings')
    .update({ available_quantity: newAvail, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .eq('available_quantity', listing.available_quantity)  // 乐观锁
    .gt('available_quantity', 0)
    .select('id');

  if (updListingErr || !updateResult || updateResult.length === 0) {
    // 库存已被其他并发购买改走，回滚积分
    if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
    return { success: false, errorCode: 'LISTING_UNAVAILABLE', error: '商品已被购买或库存不足' };
  }

  // 5. 写 cloud_market_trades
  const { data: trade, error: tradeErr } = await supabase
    .from('cloud_market_trades')
    .insert({
      listing_id: listingId,
      buyer_team_id: buyerTeamId,
      seller_team_id: sellerTeamId,
      trade_type: tradeType,
      item_type: itemType,
      item_name: itemName,
      quantity,
      points_paid: pointsPaid,
      barter_item_type: barterItemType || null,
      barter_item_name: barterItemName || null,
      barter_quantity: barterQuantity || null,
      scope,
      theme_id: themeId || null,
      school_id: schoolId || null,
      offer_id: offerId || null,
      status: 'completed',
    })
    .select('id')
    .single();
  if (tradeErr || !trade) {
    // LE-P06: 交易记录写入失败时,回滚已执行的积分转移、物品转移和 listing 库存
    console.error('[market-trade] 写交易记录失败,开始回滚', tradeErr);
    // 1. 回滚积分
    if (pointsPaid > 0) {
      await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
    }
    // 2. 回滚物品转移(把买方刚获得的物品转回卖方)
    if (sellerItemRef) {
      const rollbackResult = await transferItem(supabase, itemType, sellerItemRef, buyerTeamId, sellerTeamId, quantity);
      if (!rollbackResult.success) {
        console.error('[market-trade] 交易记录失败后物品回滚也失败,存在物品不一致风险:', rollbackResult);
      }
    }
    // 3. 恢复 listing 库存(把刚扣减的 available_quantity 加回去)
    const { data: currentListing } = await supabase
      .from('cloud_market_listings')
      .select('available_quantity, status')
      .eq('id', listingId)
      .single();
    if (currentListing) {
      const restoredAvail = currentListing.available_quantity + quantity;
      await supabase
        .from('cloud_market_listings')
        .update({ available_quantity: restoredAvail, status: 'active', updated_at: new Date().toISOString() })
        .eq('id', listingId)
        .eq('available_quantity', currentListing.available_quantity);
    }
    return { success: false, errorCode: 'INTERNAL', error: '记录交易失败' };
  }

  // 6. 写 point_transactions（仅积分交易）
  // LE-P16: 加错误处理,避免静默丢失审计记录
  if (pointsPaid > 0) {
    const { error: buyerTxError } = await supabase.from('point_transactions').insert({
      team_id: buyerTeamId,
      points: -pointsPaid,
      change_type: 'market_buy',
      related_id: trade.id,
      description: `云朵市集购买 ${itemName} x${quantity}`,
    });
    if (buyerTxError) console.error('[market-trade] 写入买方审计记录失败:', buyerTxError);
    const { error: sellerTxError } = await supabase.from('point_transactions').insert({
      team_id: sellerTeamId,
      points: pointsPaid,
      change_type: 'market_sell',
      related_id: trade.id,
      description: `云朵市集出售 ${itemName} x${quantity}`,
    });
    if (sellerTxError) console.error('[market-trade] 写入卖方审计记录失败:', sellerTxError);
  }

  // 7. 通知双方
  await supabase.from('team_notifications').insert([
    {
      team_id: buyerTeamId,
      type: 'market_buy',
      title: '购买成功',
      content: `你已花费 ${pointsPaid} 积分购买 ${itemName} x${quantity}`,
      is_read: false,
      extra_data: { tradeId: trade.id, listingId },
    },
    {
      team_id: sellerTeamId,
      type: 'market_sell',
      title: '出售成功',
      content: `你已售出 ${itemName} x${quantity}，获得 ${pointsPaid} 积分`,
      is_read: false,
      extra_data: { tradeId: trade.id, listingId },
    },
  ]);

  return { success: true, tradeId: trade.id };
}

async function rollbackPoints(supabase: any, buyerTeamId: string, sellerTeamId: string, pointsPaid: number) {
  // LE-P05: 回滚也使用乐观锁,防止 TOCTOU(读后写期间另一请求给买方加积分,回滚会用旧快照覆盖丢失)
  const { data: buyer } = await supabase.from('teams').select('points').eq('id', buyerTeamId).single();
  if (buyer) {
    const buyerOldPoints = Number(buyer.points);
    const buyerNewPoints = r1(buyerOldPoints + pointsPaid);
    const { data: rb } = await supabase
      .from('teams')
      .update({ points: buyerNewPoints })
      .eq('id', buyerTeamId)
      .eq('points', buyerOldPoints)
      .select('id');
    if (!rb || rb.length === 0) {
      // 乐观锁失败,重试一次(读取最新值再更新)
      const { data: freshBuyer } = await supabase.from('teams').select('points').eq('id', buyerTeamId).single();
      if (freshBuyer) {
        await supabase
          .from('teams')
          .update({ points: r1(Number(freshBuyer.points) + pointsPaid) })
          .eq('id', buyerTeamId)
          .eq('points', Number(freshBuyer.points));
      }
    }
  }
  const { data: seller } = await supabase.from('teams').select('points').eq('id', sellerTeamId).single();
  if (seller) {
    const sellerOldPoints = Number(seller.points);
    const sellerNewPoints = r1(sellerOldPoints - pointsPaid);
    const { data: rs } = await supabase
      .from('teams')
      .update({ points: sellerNewPoints })
      .eq('id', sellerTeamId)
      .eq('points', sellerOldPoints)
      .select('id');
    if (!rs || rs.length === 0) {
      // 乐观锁失败,重试一次
      const { data: freshSeller } = await supabase.from('teams').select('points').eq('id', sellerTeamId).single();
      if (freshSeller) {
        await supabase
          .from('teams')
          .update({ points: r1(Number(freshSeller.points) - pointsPaid) })
          .eq('id', sellerTeamId)
          .eq('points', Number(freshSeller.points));
      }
    }
  }
}

async function transferItem(
  supabase: any,
  itemType: ItemType,
  itemRef: string,
  fromTeamId: string,
  toTeamId: string,
  quantity: number
): Promise<{ success: boolean; error?: string }> {
  if (itemType === 'tool') {
    const { data: rewards } = await supabase
      .from('user_rewards')
      .select('id, reward_id, task_id')
      .eq('id', itemRef)
      .limit(quantity);
    if (!rewards || rewards.length < quantity) return { success: false, error: '归属变更' };
    const ids = rewards.slice(0, quantity).map((r: any) => r.id);
    await supabase.from('user_rewards').delete().in('id', ids);
    await supabase.from('user_rewards').insert(
      rewards.slice(0, quantity).map((r: any) => ({ team_id: toTeamId, reward_id: r.reward_id, task_id: r.task_id }))
    );
  } else if (itemType === 'skill') {
    const { data: reward } = await supabase
      .from('user_rewards')
      .select('reward_id, task_id')
      .eq('id', itemRef)
      .single();
    if (!reward) return { success: false, error: '归属变更' };
    await supabase.from('user_rewards').insert(
      Array.from({ length: quantity }, () => ({ team_id: toTeamId, reward_id: reward.reward_id, task_id: reward.task_id }))
    );
  } else if (itemType === 'work') {
    const { data: submission } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('id', itemRef)
      .single();
    if (!submission) return { success: false, error: '归属变更' };
    // 安全修复 LE-P04: 同样使用 .neq('status', 'sold') 乐观锁防止重复出售
    if (submission.status === 'sold') return { success: false, error: '作品已售出' };
    const { data: markResult } = await supabase
      .from('task_submissions')
      .update({
        status: 'sold',
        sold_at: new Date().toISOString(),
        sold_to_team_id: toTeamId,
      })
      .eq('id', itemRef)
      .neq('status', 'sold')
      .select('id');
    if (!markResult || markResult.length === 0) return { success: false, error: '作品已被并发出售' };
    await supabase.from('task_submissions').insert({
      team_id: toTeamId,
      task_id: submission.task_id,
      content: submission.content,
      file_urls: submission.file_urls,
      status: 'approved',
      rating: submission.rating,
    });
  }
  return { success: true };
}
