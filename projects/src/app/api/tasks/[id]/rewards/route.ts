import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 先获取任务关联的奖励ID
    const { data: taskRewards, error: taskRewardError } = await client
      .from('task_rewards')
      .select('id, reward_id')
      .eq('task_id', id);

    if (taskRewardError) {
      console.error('获取任务奖励关联失败:', taskRewardError);
      return supabaseErrorResponse(taskRewardError, '获取任务奖励失败');
    }

    // 如果没有关联的奖励，返回空数组
    if (!taskRewards || taskRewards.length === 0) {
      return NextResponse.json({ rewards: [] });
    }

    // 获取奖励详情
    const rewardIds = taskRewards.map(tr => tr.reward_id);
    const { data: rewards, error: rewardsError } = await client
      .from('rewards')
      .select('id, name, description, icon, points, type, requirement')
      .in('id', rewardIds);

    if (rewardsError) {
      console.error('获取奖励详情失败:', rewardsError);
      return supabaseErrorResponse(rewardsError, '获取任务奖励失败');
    }

    // 组合数据
    const result = (rewards || []).map(reward => {
      const link = taskRewards.find(tr => tr.reward_id === reward.id);
      return {
        ...reward,
        linkId: link?.id,
      };
    });

    return NextResponse.json({ rewards: result });
  } catch (error) {
    console.error('获取任务奖励错误:', error);
    return ApiErrors.validation('获取任务奖励失败');
  }
}

// 更新任务的关联奖励
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const { rewardIds } = body;

    if (!Array.isArray(rewardIds)) {
      return ApiErrors.validation('参数格式错误');
    }

    // 先删除现有关联
    await client
      .from('task_rewards')
      .delete()
      .eq('task_id', id);

    // 插入新关联
    if (rewardIds.length > 0) {
      const insertData = rewardIds.map(rewardId => ({
        task_id: id,
        reward_id: rewardId,
      }));

      const { error } = await client
        .from('task_rewards')
        .insert(insertData);

      if (error) {
        return supabaseErrorResponse(error, '更新任务奖励失败');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新任务奖励错误:', error);
    return ApiErrors.validation('更新任务奖励失败');
  }
}

// 删除任务的某个奖励关联
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const rewardId = searchParams.get('rewardId');
    const client = getSupabaseClient();

    if (!rewardId) {
      return ApiErrors.validation('缺少奖励ID');
    }

    const { error } = await client
      .from('task_rewards')
      .delete()
      .eq('task_id', id)
      .eq('reward_id', rewardId);

    if (error) {
      return supabaseErrorResponse(error, '删除关联失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除任务奖励关联错误:', error);
    return ApiErrors.validation('删除关联失败');
  }
}
