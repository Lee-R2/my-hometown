import { getSupabaseClient } from '@/storage/database/supabase-client';
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
  const supabase = getSupabaseClient();
  const {
    listingId, buyerTeamId, sellerTeamId, tradeType,
    itemType, itemName, quantity, pointsPaid, scope,
    themeId, schoolId, offerId,
    barterItemType, barterItemRef, barterItemName, barterQuantity,
    sellerItemRef, buyerItemRef,
  } = params;

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
      // 回滚买方扣减
      await supabase
        .from('teams')
        .update({ points: buyerPoints })
        .eq('id', buyerTeamId)
        .eq('points', newBuyerPoints);
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
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '复制作品失败' };
    }
  }

  // 3b. 兑换场景：买方物品转移给卖方
  if (tradeType === 'barter' && barterItemType && buyerItemRef) {
    const reverseResult = await transferItem(supabase, barterItemType, buyerItemRef, buyerTeamId, sellerTeamId, barterQuantity || 1);
    if (!reverseResult.success) {
      console.error('[market-trade] 兑换反向转移失败', reverseResult);
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
  const { error: updListingErr } = await supabase
    .from('cloud_market_listings')
    .update({ available_quantity: newAvail, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', listingId);
  if (updListingErr) {
    console.error('[market-trade] 更新挂单数量失败', updListingErr);
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
    console.error('[market-trade] 写交易记录失败', tradeErr);
    return { success: false, errorCode: 'INTERNAL', error: '记录交易失败' };
  }

  // 6. 写 point_transactions（仅积分交易）
  if (pointsPaid > 0) {
    await supabase.from('point_transactions').insert({
      team_id: buyerTeamId,
      points: -pointsPaid,
      change_type: 'market_buy',
      related_id: trade.id,
      description: `云朵市集购买 ${itemName} x${quantity}`,
    });
    await supabase.from('point_transactions').insert({
      team_id: sellerTeamId,
      points: pointsPaid,
      change_type: 'market_sell',
      related_id: trade.id,
      description: `云朵市集出售 ${itemName} x${quantity}`,
    });
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
  const { data: buyer } = await supabase.from('teams').select('points').eq('id', buyerTeamId).single();
  if (buyer) {
    await supabase.from('teams').update({ points: r1(Number(buyer.points) + pointsPaid) }).eq('id', buyerTeamId);
  }
  const { data: seller } = await supabase.from('teams').select('points').eq('id', sellerTeamId).single();
  if (seller) {
    await supabase.from('teams').update({ points: r1(Number(seller.points) - pointsPaid) }).eq('id', sellerTeamId);
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
