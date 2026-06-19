import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  LIKE_POINTS, 
  LIKER_POINTS, 
  MAX_LIKES_PER_STAGE, 
  FRAGMENTS_PER_GEM 
} from '@/lib/constants';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 更新点赞者的爱心宝石碎片（存入 teams 表）
 * @param client Supabase 客户端
 * @param teamId 小队ID
 * @param deltaLikes 点赞变化量（+1 或 -1）
 * @returns 返回更新后的统计信息
 */
async function updateHeartGems(
  client: ReturnType<typeof getSupabaseClient>,
  teamId: string,
  deltaLikes: number
): Promise<{ 
  newGems: number; 
  totalFragments: number; 
  totalGems: number;
  totalSentLikes: number;
  shardsEarned: number;
}> {
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

  // 更新 teams 表
  await client
    .from('teams')
    .update({ 
      heart_shards: currentFragments,
      heart_gems: newGems,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId);

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

/**
 * 点赞/取消点赞 任务提交
 * 每获得1个爱心，被点赞的小队加5积分
 * 每送出1个爱心，点赞的小队获得1个爱心宝石碎片和1积分
 * 10个爱心宝石碎片合成1颗爱心宝石
 * 每个小队在同一个任务阶段内最多可为归属于不同小队的三个不同的任务产出点赞
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
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

    const client = getSupabaseClient();

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

    // 检查是否已点赞
    const { data: existingLike } = await client
      .from('likes')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('from_team_id', fromTeamId)
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

      // 给被点赞的小队减积分（乐观锁）
      const { data: toTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', toTeamId)
        .single();

      const toTeamPoints = toTeamData?.points || 0;
      const newToTeamPoints = Math.max(0, toTeamPoints - LIKE_POINTS);

      await client
        .from('teams')
        .update({
          points: newToTeamPoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', toTeamId)
        .eq('points', toTeamPoints);

      // 给点赞的小队减积分（乐观锁）
      const { data: fromTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', fromTeamId)
        .single();

      const fromTeamPoints = fromTeamData?.points || 0;
      const newFromTeamPoints = Math.max(0, fromTeamPoints - LIKER_POINTS);

      await client
        .from('teams')
        .update({
          points: newFromTeamPoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', fromTeamId)
        .eq('points', fromTeamPoints);

      // 更新爱心宝石碎片（减少）
      const heartGemResult = await updateHeartGems(client, fromTeamId, -1);

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
      // 未点赞，检查同阶段点赞限制
      const { count: stageLikeCount } = await client
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('from_team_id', fromTeamId)
        .eq('stage', stage);

      if (stageLikeCount && stageLikeCount >= MAX_LIKES_PER_STAGE) {
        return ApiErrors.validation(`本阶段点赞次数已达上限（${MAX_LIKES_PER_STAGE}次）`);
      }

      // 执行点赞
      const { error: insertError } = await client
        .from('likes')
        .insert({
          submission_id: submissionId,
          from_team_id: fromTeamId,
          to_team_id: toTeamId,
          stage: stage,
        });

      if (insertError) {
        console.error('点赞失败:', insertError);
        return supabaseErrorResponse(insertError, '点赞失败');
      }

      // 给被点赞的小队加积分（乐观锁）
      const { data: toTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', toTeamId)
        .single();

      const toTeamPoints = toTeamData?.points || 0;

      await client
        .from('teams')
        .update({
          points: toTeamPoints + LIKE_POINTS,
          updated_at: new Date().toISOString()
        })
        .eq('id', toTeamId)
        .eq('points', toTeamPoints);

      // 给点赞的小队加积分（乐观锁）
      const { data: fromTeamData } = await client
        .from('teams')
        .select('points')
        .eq('id', fromTeamId)
        .single();

      const fromTeamPoints = fromTeamData?.points || 0;

      await client
        .from('teams')
        .update({
          points: fromTeamPoints + LIKER_POINTS,
          updated_at: new Date().toISOString()
        })
        .eq('id', fromTeamId)
        .eq('points', fromTeamPoints);

      // 更新爱心宝石碎片（增加），并检查是否合成宝石
      const heartGemResult = await updateHeartGems(client, fromTeamId, 1);

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
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const { searchParams } = new URL(request.url);
    const fromTeamId = searchParams.get('fromTeamId');

    const client = getSupabaseClient();

    // 获取点赞总数
    const { count, error: countError } = await client
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submissionId);

    if (countError) {
      console.error('获取点赞数失败:', countError);
      return supabaseErrorResponse(countError, '获取点赞数失败');
    }

    // 检查当前小队是否已点赞
    let liked = false;
    if (fromTeamId) {
      const { data: existingLike } = await client
        .from('likes')
        .select('id')
        .eq('submission_id', submissionId)
        .eq('from_team_id', fromTeamId)
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
