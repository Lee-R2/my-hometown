import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LIKE_POINTS, REWARD_TYPE_LABELS } from '@/lib/constants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // team 角色只能查看自己的小队
    if (auth.payload!.role === 'team' && auth.payload!.userId !== id) {
      return ApiErrors.forbidden('只能查看自己的小队信息');
    }

    // parent 角色只能查看已关注的小队
    if (auth.payload!.role === 'parent') {
      const { data: followRecord } = await client
        .from('parent_team_follows')
        .select('id')
        .eq('team_id', id)
        .eq('parent_id', auth.payload!.userId)
        .maybeSingle();
      if (!followRecord) {
        return ApiErrors.forbidden('只能查看已关注的小队');
      }
    }

    // volunteer/teacher 角色按学校范围校验
    if (auth.payload!.role === 'volunteer' || auth.payload!.role === 'teacher') {
      const { data: targetTeam } = await client
        .from('teams')
        .select('school_id')
        .eq('id', id)
        .maybeSingle();
      if (!targetTeam) {
        return ApiErrors.notFound('小队不存在');
      }
      if (targetTeam.school_id !== auth.payload!.schoolId) {
        return ApiErrors.forbidden('无权查看其他学校的小队');
      }
    }

    // 获取小队信息
    const { data: team, error } = await client
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 获取主题信息
    let theme = null;
    if (team.current_theme_id) {
      const { data: themeData } = await client
        .from('task_themes')
        .select('id, name, icon')
        .eq('id', team.current_theme_id)
        .single();
      theme = themeData;
    }
    
    // 获取学校信息
    let school = null;
    if (team.school_id) {
      const { data: schoolData } = await client
        .from('schools')
        .select('id, name')
        .eq('id', team.school_id)
        .single();
      school = schoolData;
    }
    
    // 获取当前任务信息
    let currentTask = null;
    if (team.current_task_id) {
      const { data: taskData } = await client
        .from('tasks')
        .select('id, title, stage, description, points')
        .eq('id', team.current_task_id)
        .single();
      currentTask = taskData;
    }
    
    // 获取主题下的任务总数（用于显示进度）
    let themeTasksCount = 0;
    if (team.current_theme_id) {
      const { count } = await client
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('theme_id', team.current_theme_id);
      themeTasksCount = count || 0;
    }

    // 获取小队成员
    const { data: members } = await client
      .from('team_members')
      .select('*')
      .eq('team_id', id);

    // ========== 激励数据（与激励中心同步） ==========
    
    // 获取当前主题下的所有任务ID
    let themeTaskIds: string[] = [];
    if (team.current_theme_id) {
      const { data: themeTasks } = await client
        .from('tasks')
        .select('id')
        .eq('theme_id', team.current_theme_id)
        .eq('is_active', true);
      themeTaskIds = (themeTasks || []).map(t => t.id);
    }

    // 获取小队激励记录（仅当前主题）
    let userRewards: any[] = [];
    if (themeTaskIds.length > 0) {
      const { data } = await client
        .from('user_rewards')
        .select('id, earned_at, task_id, reward_id')
        .eq('team_id', id)
        .in('task_id', themeTaskIds)
        .order('earned_at', { ascending: false });
      userRewards = data || [];
    }

    // 获取奖励详情
    let rewardsData: any[] = [];
    if (userRewards.length > 0) {
      const rewardIds = [...new Set(userRewards.map(r => r.reward_id))];
      const { data } = await client
        .from('rewards')
        .select('id, name, description, icon, points, type, image_url, conditions, condition_logic')
        .in('id', rewardIds);
      rewardsData = data || [];
    }

    // 组装奖励数据
    const rewardsMap = new Map(rewardsData.map(r => [r.id, r]));
    const rewards = userRewards.map(ur => ({
      ...ur,
      rewards: rewardsMap.get(ur.reward_id) || null,
    }));

    // 按类型分组
    const groupedRewards: Record<string, typeof rewards> = {};
    rewards.forEach(reward => {
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
      totalPoints: rewards.reduce((sum, r) => sum + (r.rewards?.points || 0), 0),
    };

    // 获取点赞数据
    let likesStats = { received: 0, given: 0, pointsFromLikes: 0 };
    
    // 获得的点赞总数（to_team_id 是被点赞的小队）
    const { count: likesReceived } = await client
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('to_team_id', id);
    
    // 送出的点赞总数（team_id 字段存储点赞者）
    const { count: likesGiven } = await client
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', id);
    
    likesStats = {
      received: likesReceived || 0,
      given: likesGiven || 0,
      pointsFromLikes: (likesReceived || 0) * LIKE_POINTS,
    };

    // 获取爱心宝石数据（从 teams 表读取权威值，heart_gems 表仅读 total_sent_likes）
    const { data: heartGemsData } = await client
      .from('heart_gems')
      .select('total_sent_likes')
      .eq('team_id', id)
      .maybeSingle();

    const heartGems = {
      fragments: team.heart_shards || 0,
      gems: team.heart_gems || 0,
      totalSentLikes: heartGemsData?.total_sent_likes || 0,
      fragmentsPerGem: 10,
    };

    const { password: _, ...teamWithoutPassword } = team;

    return NextResponse.json({
      team: {
        ...teamWithoutPassword,
        theme,
        school,
        currentTask,
        themeTasksCount,
        members: members || [],
        // 激励数据（与激励中心同步）
        rewards,
        groupedRewards,
        typeLabels: REWARD_TYPE_LABELS,
        stats,
        likesStats,
        heartGems,
      },
    });
  } catch (error) {
    console.error('获取小队信息错误:', error);
    return ApiErrors.validation('获取小队信息失败');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // parent 角色无权修改小队信息
  if (auth.payload!.role === 'parent') {
    return ApiErrors.forbidden('家长无权修改小队信息');
  }

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // team 角色只能修改自己的小队
    if (auth.payload!.role === 'team' && auth.payload!.userId !== id) {
      return ApiErrors.forbidden('无权修改其他小队信息');
    }

    // volunteer/teacher 角色只能修改自己学校的小队
    if (auth.payload!.role === 'volunteer' || auth.payload!.role === 'teacher') {
      const { data: targetTeam } = await client
        .from('teams')
        .select('school_id')
        .eq('id', id)
        .maybeSingle();
      if (!targetTeam) {
        return ApiErrors.notFound('小队不存在');
      }
      if (targetTeam.school_id !== auth.payload!.schoolId) {
        return ApiErrors.forbidden('无权修改其他学校的小队');
      }
    }

    const body = await request.json();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    // team 角色只能修改基本字段，admin/volunteer/teacher 可以修改所有字段
    const allowedFields = auth.payload!.role === 'team'
      ? ['name', 'slogan', 'rules', 'description', 'icon']
      : ['name', 'password', 'teacher_id', 'assigned_volunteer_id', 'grade', 'school_id', 'icon', 'description', 'status', 'slogan', 'rules', 'is_active', 'current_theme_id', 'current_task_id', 'points', 'cycle'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: team, error } = await client
      .from('teams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新小队错误:', error);
      return supabaseErrorResponse(error, '更新小队失败');
    }

    // 剥离 password 字段，防止密码哈希泄露
    const { password: _pw, ...teamWithoutPassword } = team;
    return NextResponse.json({ success: true, team: teamWithoutPassword });
  } catch (error) {
    console.error('更新小队信息错误:', error);
    return ApiErrors.validation('更新小队信息失败');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 检查小队是否存在
    const { data: team, error: fetchError } = await client
      .from('teams')
      .select('id, code')
      .eq('id', id)
      .single();

    if (fetchError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 删除小队成员
    await client
      .from('team_members')
      .delete()
      .eq('team_id', id);

    // 删除小队
    const { error: deleteError } = await client
      .from('teams')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return supabaseErrorResponse(deleteError, '删除小队失败');
    }

    return NextResponse.json({ success: true, message: `小队 ${team.code} 已删除` });
  } catch (error) {
    console.error('删除小队错误:', error);
    return ApiErrors.validation('删除小队失败');
  }
}
