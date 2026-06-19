import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LIKE_POINTS, REWARD_TYPE_LABELS } from '@/lib/constants';

// 获取小队赠送积分总数（transfer_out 的绝对值之和）
async function getTotalTransferredPoints(client: ReturnType<typeof getSupabaseClient>, teamId: string): Promise<number> {
  const { data } = await client
    .from('point_transactions')
    .select('points')
    .eq('team_id', teamId)
    .eq('change_type', 'transfer_out');
  if (!data || data.length === 0) return 0;
  return data.reduce((sum: number, r: { points: number }) => sum + Math.abs(r.points), 0);
}

export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;
    
    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const client = getSupabaseClient();

    // 获取小队当前的 theme_id，用于过滤当前轮次的数据
    const { data: team } = await client
      .from('teams')
      .select('current_theme_id')
      .eq('id', teamId)
      .single();

    // 如果没有当前主题，返回空数据（已完成主题后或未选择主题）
    if (!team?.current_theme_id) {
      return NextResponse.json({
        rewards: [],
        groupedRewards: {},
        typeLabels: {},
        stats: { total: 0, byType: {}, totalPoints: 0 },
        likes: { total: 0, points: 0 },
        heartGems: {
          fragments: 0,
          gems: 0,
          totalSentLikes: 0,
          totalTransferredPoints: 0,
          fragmentsPerGem: 10,
        },
      });
    }

    // 获取当前主题下的所有任务ID
    const { data: themeTasks } = await client
      .from('tasks')
      .select('id')
      .eq('theme_id', team.current_theme_id)
      .eq('is_active', true);

    const themeTaskIds = (themeTasks || []).map(t => t.id);

    // 如果当前主题没有任务，返回空数据
    if (themeTaskIds.length === 0) {
      // 获取 teams 表中的碎片和宝石数据（两种碎片已合并计算）
      const { data: teamData } = await client
        .from('teams')
        .select('heart_shards, heart_gems')
        .eq('id', teamId)
        .maybeSingle();

      // 获取点赞统计
      const { data: heartGemsData } = await client
        .from('heart_gems')
        .select('total_sent_likes')
        .eq('team_id', teamId)
        .maybeSingle();

      return NextResponse.json({
        rewards: [],
        groupedRewards: {},
        typeLabels: {},
        stats: { total: 0, byType: {}, totalPoints: 0 },
        likes: { total: 0, points: 0 },
        heartGems: {
          fragments: teamData?.heart_shards || 0,
          gems: teamData?.heart_gems || 0,
          totalSentLikes: heartGemsData?.total_sent_likes || 0,
          totalTransferredPoints: await getTotalTransferredPoints(client, teamId),
          fragmentsPerGem: 10,
        },
      });
    }

    // 1. 获取小队当前主题下的激励记录
    const { data: userRewards, error } = await client
      .from('user_rewards')
      .select('id, earned_at, task_id, reward_id')
      .eq('team_id', teamId)
      .in('task_id', themeTaskIds) // 只查询当前主题下的任务
      .order('earned_at', { ascending: false });

    if (error) {
      console.error('获取激励列表错误:', error);
      return supabaseErrorResponse(error, '获取激励列表失败');
    }

    // 如果没有激励记录，返回空数据
    if (!userRewards || userRewards.length === 0) {
      // 获取点赞统计
      const { data: submissions } = await client
        .from('task_submissions')
        .select('id')
        .eq('team_id', teamId)
        .in('task_id', themeTaskIds);

      const submissionIds = (submissions || []).map(s => s.id);

      let likesStats = { total: 0, points: 0 };
      if (submissionIds.length > 0) {
        const { count: likeCount } = await client
          .from('likes')
          .select('id', { count: 'exact', head: true })
          .in('submission_id', submissionIds);

        likesStats = {
          total: likeCount || 0,
          points: (likeCount || 0) * LIKE_POINTS,
        };
      }

      // 获取 teams 表中的碎片和宝石数据（两种碎片已合并计算）
      const { data: teamData } = await client
        .from('teams')
        .select('heart_shards, heart_gems')
        .eq('id', teamId)
        .maybeSingle();

      // 获取点赞统计
      const { data: heartGemsData } = await client
        .from('heart_gems')
        .select('total_sent_likes')
        .eq('team_id', teamId)
        .maybeSingle();

      return NextResponse.json({
        rewards: [],
        groupedRewards: {},
        typeLabels: {},
        stats: { total: 0, byType: {}, totalPoints: 0 },
        likes: likesStats,
        heartGems: {
          fragments: teamData?.heart_shards || 0,
          gems: teamData?.heart_gems || 0,
          totalSentLikes: heartGemsData?.total_sent_likes || 0,
          totalTransferredPoints: await getTotalTransferredPoints(client, teamId),
          fragmentsPerGem: 10,
        },
      });
    }

    // 2. 获取所有奖励详情
    const rewardIds = [...new Set(userRewards.map((r: any) => r.reward_id))];
    const { data: rewardsData, error: rewardsError } = await client
      .from('rewards')
      .select('id, name, description, icon, points, type, image_url, conditions, condition_logic')
      .in('id', rewardIds);

    if (rewardsError) {
      console.error('获取奖励详情错误:', rewardsError);
      return ApiErrors.validation('获取奖励详情失败');
    }

    // 3. 组装数据
    const rewardsMap = new Map((rewardsData || []).map((r: any) => [r.id, r]));
    const rewards = userRewards.map((ur: any) => ({
      ...ur,
      rewards: rewardsMap.get(ur.reward_id) || null,
    }));

    // 按类型分组统计
    const groupedRewards: Record<string, typeof rewards> = {};
    const typeLabels = REWARD_TYPE_LABELS;

    rewards.forEach((reward: any) => {
      const type = reward.rewards?.type || 'other';
      if (!groupedRewards[type]) {
        groupedRewards[type] = [];
      }
      groupedRewards[type].push(reward);
    });

    // 计算统计信息
    const stats = {
      total: rewards.length,
      byType: Object.keys(groupedRewards).reduce((acc, type) => {
        acc[type] = groupedRewards[type].length;
        return acc;
      }, {} as Record<string, number>),
      totalPoints: rewards.reduce((sum: number, r: any) => sum + (r.rewards?.points || 0), 0),
    };

    // 获取点赞数据
    // 获取当前主题下的所有提交ID
    const { data: submissions } = await client
      .from('task_submissions')
      .select('id')
      .eq('team_id', teamId)
      .in('task_id', themeTaskIds);

    const submissionIds = (submissions || []).map(s => s.id);

    // 获取这些提交获得的点赞数
    let likesStats = { total: 0, points: 0 };
    if (submissionIds.length > 0) {
      const { count: likeCount } = await client
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .in('submission_id', submissionIds);

      likesStats = {
        total: likeCount || 0,
        points: (likeCount || 0) * LIKE_POINTS,
      };
    }

    // 获取 teams 表中的碎片和宝石数据（两种碎片已合并计算）
    const { data: teamData } = await client
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', teamId)
      .maybeSingle();

    // 获取点赞统计
    const { data: heartGemsData } = await client
      .from('heart_gems')
      .select('total_sent_likes')
      .eq('team_id', teamId)
      .maybeSingle();

    return NextResponse.json({
      rewards,
      groupedRewards,
      typeLabels,
      stats,
      likes: likesStats,
      heartGems: {
        fragments: teamData?.heart_shards || 0,
        gems: teamData?.heart_gems || 0,
        totalSentLikes: heartGemsData?.total_sent_likes || 0,
        totalTransferredPoints: await getTotalTransferredPoints(client, teamId),
        fragmentsPerGem: 10,
      },
    });
  } catch (error) {
    console.error('获取激励列表错误:', error);
    return safeError(error);
  }
}
