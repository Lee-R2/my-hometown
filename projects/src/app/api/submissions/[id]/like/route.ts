import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import {
  LIKE_POINTS,
  LIKER_POINTS,
  MAX_LIKES_PER_STAGE,
  FRAGMENTS_PER_GEM
} from '@/lib/constants';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 更新点赞者的爱心宝石碎片（存入 teams 表）
 * 安全修复 VULN-BIZ-013：加乐观锁防止并发点赞导致数据不一致
 * @param client Supabase 客户端
 * @param teamId 小队ID
 * @param deltaLikes 点赞变化量（+1 或 -1）
 * @returns 返回更新后的统计信息
 */
async function updateHeartGems(
  client: ReturnType<typeof getSupabaseAdminClient>,
  teamId: string,
  deltaLikes: number
): Promise<{
  newGems: number;
  totalFragments: number;
  totalGems: number;
  totalSentLikes: number;
  shardsEarned: number;
}> {
  // 安全修复 LE-P02: 之前乐观锁只校验 heart_gems(整数),不校验 heart_shards(浮点),
  // 注释说"浮点数不作为锁条件"。但两个并发点赞都读到相同 heart_gems,都通过乐观锁,
  // 各自计算后写入 heart_shards,后写覆盖前写,导致碎片丢失。
  //
  // 修复方案:把 heart_shards 也加入乐观锁条件。虽然浮点 .eq() 比较不如整数精确,
  // 但在本场景中 heart_shards 只有 0.1 的倍数(每 3 个点赞得 0.1),PostgreSQL 的
  // numeric 类型可以精确比较。任何一方被并发修改都能检测到并重试。
  // 同时把重试次数从 3 提升到 5,进一步降低冲突概率。
  const MAX_RETRIES = 5;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // 获取 teams 表中的碎片和宝石数据
    const { data: teamData } = await client
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', teamId)
      .maybeSingle();

    let currentFragments = teamData?.heart_shards || 0;
    let currentGems = teamData?.heart_gems || 0;

    // 获取 heart_gems 表中的点赞统计
    const { data: heartGemData } = await client
      .from('heart_gems')
      .select('total_sent_likes')
      .eq('team_id', teamId)
      .maybeSingle();

    let totalSentLikes = heartGemData?.total_sent_likes || 0;

    // 计算获得的碎片：每3个点赞兑换0.1个碎片（不足3次不兑换）
    const prevSentLikes = totalSentLikes;
    totalSentLikes = Math.max(0, totalSentLikes + deltaLikes);

    // 根据点赞总数计算已兑换碎片（只有3的倍数部分才兑换）
    const prevEarnedShards = Math.floor(prevSentLikes / 3) * 0.1;
    const newEarnedShards = Math.floor(totalSentLikes / 3) * 0.1;
    const shardsEarned = newEarnedShards - prevEarnedShards;
    const newFragments = currentFragments + shardsEarned;

    let newGems = currentGems;

    // 处理碎片的增减和合成
    if (deltaLikes > 0) {
      // 增加碎片，检查是否可以合成宝石
      if (newFragments >= FRAGMENTS_PER_GEM) {
        const gemsToCreate = Math.floor(newFragments / FRAGMENTS_PER_GEM);
        newGems = currentGems + gemsToCreate;
        currentFragments = newFragments % FRAGMENTS_PER_GEM;
      } else {
        currentFragments = newFragments;
      }
    } else if (deltaLikes < 0) {
      // 减少碎片
      const decreaseShards = Math.abs(shardsEarned);
      let remainingDecrease = decreaseShards;

      // 先从现有碎片中扣除
      if (currentFragments >= remainingDecrease) {
        currentFragments -= remainingDecrease;
        remainingDecrease = 0;
      } else {
        remainingDecrease -= currentFragments;
        currentFragments = 0;

        // 碎片不够，从宝石中拆分
        if (newGems > 0) {
          newGems -= 1;
          currentFragments = FRAGMENTS_PER_GEM - remainingDecrease;
        }
      }
    }

    // 四舍五入保留2位小数
    currentFragments = Math.round(currentFragments * 100) / 100;

    // 更新 teams 表(乐观锁:同时校验 heart_gems 和 heart_shards 未被并发修改)
    // LE-P02 修复:之前只校验 heart_gems,现在 heart_shards 也加入乐观锁条件,
    // 任何一方被并发修改都会导致 0 行更新,触发重试。
    const { data: updated, error: updateError } = await client
      .from('teams')
      .update({
        heart_shards: currentFragments,
        heart_gems: newGems,
        updated_at: new Date().toISOString()
      })
      .eq('id', teamId)
      .eq('heart_gems', currentGems)
      .eq('heart_shards', teamData?.heart_shards ?? 0)
      .select('id');

    if (updateError) {
      lastError = updateError;
      // 数据库错误，重试可能无法解决，但仍尝试
      continue;
    }

    if (!updated || updated.length === 0) {
      // 乐观锁冲突：heart_gems 或 heart_shards 已被并发修改，重试
      lastError = new Error('乐观锁冲突，heart_gems 或 heart_shards 已被并发修改');
      continue;
    }

    // 更新 heart_gems 表的点赞统计
    await client
      .from('heart_gems')
      .upsert({
        team_id: teamId,
        total_sent_likes: totalSentLikes,
        updated_at: new Date().toISOString()
      }, { onConflict: 'team_id' });

    return {
      newGems: newGems - currentGems,
      totalFragments: currentFragments,
      totalGems: newGems,
      totalSentLikes,
      shardsEarned: Math.round(shardsEarned * 100) / 100,
    };
  }

  // 重试耗尽，记录告警并抛出错误，由调用方处理
  console.error('[updateHeartGems] 乐观锁重试耗尽，放弃更新', {
    teamId,
    deltaLikes,
    lastError: lastError?.message || lastError,
  });
  throw new Error('爱心碎片更新冲突，请重试');
}

/**
 * 安全修复 LE-P03: 校验 teams 积分 update 的乐观锁结果。
 * 之前 4 处 update 都不检查返回值,并发触发时可能多次加减积分。
 * 现在统一封装:返回 true 表示成功,false 表示乐观锁冲突(0 行更新)。
 */
async function updateTeamPoints(
  client: ReturnType<typeof getSupabaseAdminClient>,
  teamId: string,
  newPoints: number,
  expectedPoints: number
): Promise<boolean> {
  const { data, error } = await client
    .from('teams')
    .update({
      points: newPoints,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId)
    .eq('points', expectedPoints)
    .select('id');
  if (error) {
    console.error('[updateTeamPoints] 数据库错误:', error);
    return false;
  }
  return !!(data && data.length > 0);
}

/**
 * 点赞/取消点赞 任务提交
 * 每获得1个爱心，被点赞的小队加5积分
 * 每送出1个爱心，点赞的小队获得1个爱心宝石碎片和1积分
 * 10个爱心宝石碎片合成1颗爱心宝石
 * 每个小队在同一个任务阶段内最多可为归属于不同小队的三个不同的任务产出点赞
 *
 * 安全修复 LE-P03: 所有 teams 积分 update 必须检查乐观锁结果,
 * 任一更新失败时回滚已执行操作,防止并发刷取积分。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id: submissionId } = await params;
    const body = await request.json();
    const { fromTeamId, toTeamId, stage } = body;

    if (!fromTeamId || !toTeamId || stage === undefined) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 不能给自己点赞
    if (fromTeamId === toTeamId) {
      return ApiErrors.validation('不能给自己点赞');
    }

    // 安全修复：校验 fromTeamId 归属，防止冒充其他小队点赞盗刷积分
    const authRole = auth.payload?.role;
    const authUserId = auth.payload?.userId;

    if (authRole === 'team') {
      // team 身份只能用自己的 teamId 发起点赞
      if (fromTeamId !== authUserId) {
        return ApiErrors.forbidden('无权冒充其他小队发起点赞');
      }
    }
    // super_admin / volunteer / teacher 可代为操作，但需记录日志
    if (authRole !== 'team' && authRole !== 'super_admin' && authRole !== 'volunteer' && authRole !== 'teacher') {
      return ApiErrors.forbidden('无权执行点赞操作');
    }

    console.log('[点赞API] 操作记录:', {
      fromTeamId,
      toTeamId,
      submissionId,
      operatorRole: authRole,
      operatorId: authUserId,
    });

    const client = getSupabaseAdminClient();

    // 验证提交记录是否存在
    const { data: submission, error: submissionError } = await client
      .from('task_submissions')
      .select('id, team_id')
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      return ApiErrors.notFound('提交记录不存在');
    }

    // 验证提交记录是否属于被点赞的小队
    if (submission.team_id !== toTeamId) {
      return ApiErrors.validation('提交记录不属于该小队');
    }

    // 检查是否已点赞（team_id 字段存储点赞者，原代码误用 from_team_id 字段不存在）
    const { data: existingLike } = await client
      .from('likes')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('team_id', fromTeamId)
      .maybeSingle();

    if (existingLike) {
      // 已点赞，执行取消点赞
      const { error: deleteError } = await client
        .from('likes')
        .delete()
        .eq('id', existingLike.id);

      if (deleteError) {
        console.error('取消点赞失败:', deleteError);
        return supabaseErrorResponse(deleteError, '取消点赞失败');
      }

      // 给被点赞的小队减积分（乐观锁 + 结果校验）
      const { data: toTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', toTeamId)
        .single();

      const toTeamPoints = toTeamData?.points || 0;
      const newToTeamPoints = Math.max(0, toTeamPoints - LIKE_POINTS);

      // 安全修复 LE-P03: 校验减积分结果,失败时回滚 likes 删除(重新插入)
      const toDeductOk = await updateTeamPoints(client, toTeamId, newToTeamPoints, toTeamPoints);
      if (!toDeductOk) {
        // 回滚:重新插入被删除的 likes 记录
        await client.from('likes').insert({
          id: existingLike.id,
          submission_id: submissionId,
          team_id: fromTeamId,
          to_team_id: toTeamId,
          stage: stage,
        });
        return NextResponse.json(
          { success: false, error: '操作冲突，请重试' },
          { status: 409 }
        );
      }

      // 给点赞的小队减积分（乐观锁 + 结果校验）
      const { data: fromTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', fromTeamId)
        .single();

      const fromTeamPoints = fromTeamData?.points || 0;
      const newFromTeamPoints = Math.max(0, fromTeamPoints - LIKER_POINTS);

      const fromDeductOk = await updateTeamPoints(client, fromTeamId, newFromTeamPoints, fromTeamPoints);
      if (!fromDeductOk) {
        // 回滚:把 toTeam 减掉的积分加回去,并重新插入 likes 记录
        await updateTeamPoints(client, toTeamId, toTeamPoints, newToTeamPoints);
        await client.from('likes').insert({
          id: existingLike.id,
          submission_id: submissionId,
          team_id: fromTeamId,
          to_team_id: toTeamId,
          stage: stage,
        });
        return NextResponse.json(
          { success: false, error: '操作冲突，请重试' },
          { status: 409 }
        );
      }

      // 更新爱心宝石碎片（减少）— updateHeartGems 内部已带 3 次重试,失败会抛错
      let heartGemResult;
      try {
        heartGemResult = await updateHeartGems(client, fromTeamId, -1);
      } catch (e) {
        // 碎片更新失败,回滚双方积分变更并恢复 likes 记录
        await updateTeamPoints(client, toTeamId, toTeamPoints, newToTeamPoints);
        await updateTeamPoints(client, fromTeamId, fromTeamPoints, newFromTeamPoints);
        await client.from('likes').insert({
          id: existingLike.id,
          submission_id: submissionId,
          team_id: fromTeamId,
          to_team_id: toTeamId,
          stage: stage,
        });
        console.error('[取消点赞] updateHeartGems 失败,已回滚:', e);
        return NextResponse.json(
          { success: false, error: '碎片更新冲突，请重试' },
          { status: 409 }
        );
      }

      // LE-P20: 写入 point_transactions 审计记录(取消点赞场景)
      const { error: unlikeToTxErr } = await client.from('point_transactions').insert({
        team_id: toTeamId,
        points: -LIKE_POINTS,
        change_type: 'unlike_received',
        related_id: submissionId,
        description: `取消点赞扣除 ${LIKE_POINTS} 积分（点赞方: ${fromTeamId}）`,
      });
      if (unlikeToTxErr) console.error('[取消点赞] 写入被点赞方审计记录失败:', unlikeToTxErr);
      const { error: unlikeFromTxErr } = await client.from('point_transactions').insert({
        team_id: fromTeamId,
        points: -LIKER_POINTS,
        change_type: 'unlike_sent',
        related_id: submissionId,
        description: `取消点赞扣除 ${LIKER_POINTS} 积分（取消对 ${toTeamId} 的点赞）`,
      });
      if (unlikeFromTxErr) console.error('[取消点赞] 写入点赞方审计记录失败:', unlikeFromTxErr);

      // 构建返回消息
      let message = '已取消点赞';
      if (heartGemResult.newGems < 0) {
        message = `已取消点赞，1颗爱心宝石拆分为碎片`;
      }

      return NextResponse.json({
        success: true,
        liked: false,
        message,
        heartGems: {
          fragments: heartGemResult.totalFragments,
          gems: heartGemResult.totalGems,
          newGems: heartGemResult.newGems,
        }
      });
    } else {
      // 未点赞，检查同阶段点赞限制（team_id 字段存储点赞者）
      const { count: stageLikeCount } = await client
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', fromTeamId)
        .eq('stage', stage);

      if (stageLikeCount && stageLikeCount >= MAX_LIKES_PER_STAGE) {
        return ApiErrors.validation(`本阶段点赞次数已达上限（${MAX_LIKES_PER_STAGE}次）`);
      }

      // 执行点赞（team_id 字段存储点赞者，to_team_id 和 stage 由迁移 017 添加）
      const { error: insertError } = await client
        .from('likes')
        .insert({
          submission_id: submissionId,
          team_id: fromTeamId,
          to_team_id: toTeamId,
          stage: stage,
        });

      if (insertError) {
        console.error('点赞失败:', insertError);
        return supabaseErrorResponse(insertError, '点赞失败');
      }

      // 给被点赞的小队加积分（乐观锁 + 结果校验）
      const { data: toTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', toTeamId)
        .single();

      const toTeamPoints = toTeamData?.points || 0;

      // 安全修复 LE-P03: 校验加积分结果,失败时回滚 likes insert
      const toCreditOk = await updateTeamPoints(client, toTeamId, toTeamPoints + LIKE_POINTS, toTeamPoints);
      if (!toCreditOk) {
        // 回滚:删除刚插入的 likes 记录
        await client.from('likes')
          .delete()
          .eq('submission_id', submissionId)
          .eq('team_id', fromTeamId);
        return NextResponse.json(
          { success: false, error: '操作冲突，请重试' },
          { status: 409 }
        );
      }

      // 给点赞的小队加积分（乐观锁 + 结果校验）
      const { data: fromTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', fromTeamId)
        .single();

      const fromTeamPoints = fromTeamData?.points || 0;

      const fromCreditOk = await updateTeamPoints(client, fromTeamId, fromTeamPoints + LIKER_POINTS, fromTeamPoints);
      if (!fromCreditOk) {
        // 回滚:把 toTeam 加的积分减回去,并删除 likes 记录
        await updateTeamPoints(client, toTeamId, toTeamPoints, toTeamPoints + LIKE_POINTS);
        await client.from('likes')
          .delete()
          .eq('submission_id', submissionId)
          .eq('team_id', fromTeamId);
        return NextResponse.json(
          { success: false, error: '操作冲突，请重试' },
          { status: 409 }
        );
      }

      // 更新爱心宝石碎片（增加），并检查是否合成宝石
      let heartGemResult;
      try {
        heartGemResult = await updateHeartGems(client, fromTeamId, 1);
      } catch (e) {
        // 碎片更新失败,回滚双方积分变更并删除 likes 记录
        await updateTeamPoints(client, toTeamId, toTeamPoints, toTeamPoints + LIKE_POINTS);
        await updateTeamPoints(client, fromTeamId, fromTeamPoints, fromTeamPoints + LIKER_POINTS);
        await client.from('likes')
          .delete()
          .eq('submission_id', submissionId)
          .eq('team_id', fromTeamId);
        console.error('[点赞] updateHeartGems 失败,已回滚:', e);
        return NextResponse.json(
          { success: false, error: '碎片更新冲突，请重试' },
          { status: 409 }
        );
      }

      // LE-P20: 写入 point_transactions 审计记录(点赞场景)
      const { error: likeToTxErr } = await client.from('point_transactions').insert({
        team_id: toTeamId,
        points: LIKE_POINTS,
        change_type: 'like_received',
        related_id: submissionId,
        description: `被点赞获得 ${LIKE_POINTS} 积分（点赞方: ${fromTeamId}）`,
      });
      if (likeToTxErr) console.error('[点赞] 写入被点赞方审计记录失败:', likeToTxErr);
      const { error: likeFromTxErr } = await client.from('point_transactions').insert({
        team_id: fromTeamId,
        points: LIKER_POINTS,
        change_type: 'like_sent',
        related_id: submissionId,
        description: `点赞获得 ${LIKER_POINTS} 积分（被点赞方: ${toTeamId}）`,
      });
      if (likeFromTxErr) console.error('[点赞] 写入点赞方审计记录失败:', likeFromTxErr);

      // 构建返回消息
      let message = '点赞成功！';
      if (heartGemResult.newGems > 0) {
        message = `点赞成功！恭喜你集齐碎片，合成了${heartGemResult.newGems}颗爱心宝石💎！`;
      } else {
        message = `点赞成功！获得${heartGemResult.shardsEarned}个爱心宝石碎片💝（${heartGemResult.totalFragments}/10）`;
      }

      return NextResponse.json({
        success: true,
        liked: true,
        message,
        heartGems: {
          fragments: heartGemResult.totalFragments,
          gems: heartGemResult.totalGems,
          newGems: heartGemResult.newGems,
        }
      });
    }
  } catch (error) {
    console.error('点赞操作错误:', error);
    return ApiErrors.validation('操作失败');
  }
}

/**
 * 获取提交记录的点赞状态和数量
 * LE-A08: 添加 requireAnyAuth 鉴权,防止未认证用户批量爬取点赞数据
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // LE-A08: 原 GET handler 完全无鉴权,任意未认证用户可查询任意 submissionId 的点赞状态
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id: submissionId } = await params;
    const { searchParams } = new URL(request.url);
    const fromTeamId = searchParams.get('fromTeamId');

    const client = getSupabaseAdminClient();

    // 获取点赞总数
    const { count, error: countError } = await client
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submissionId);

    if (countError) {
      console.error('获取点赞数失败:', countError);
      return supabaseErrorResponse(countError, '获取点赞数失败');
    }

    // 检查当前小队是否已点赞（team_id 字段存储点赞者）
    let liked = false;
    if (fromTeamId) {
      const { data: existingLike } = await client
        .from('likes')
        .select('id')
        .eq('submission_id', submissionId)
        .eq('team_id', fromTeamId)
        .maybeSingle();
      liked = !!existingLike;
    }

    return NextResponse.json({
      likeCount: count || 0,
      liked,
    });
  } catch (error) {
    console.error('获取点赞状态错误:', error);
    return ApiErrors.validation('获取失败');
  }
}
