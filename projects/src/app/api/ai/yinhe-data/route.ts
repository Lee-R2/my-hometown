import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 银蛇博士数据查询 API
 * 提供小队账号的完整数据读取能力
 * 
 * 支持查询：
 * 1. 小队基础信息（主题、周期、进度）
 * 2. 任务和主题详情
 * 3. 任务配套工具
 * 4. 学习资料
 * 5. 激励和积分
 * 6. 消息中心
 * 7. 其他小队进度
 * 8. 技能学习
 */

// 查询小队的完整数据
export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const dataType = searchParams.get('type');  // all, team, theme, task, tool, material, reward, point, message, peer, skill

    if (!teamId) {
      return ApiErrors.validation('缺少 teamId 参数');
    }

    const client = getSupabaseAdminClient();
    const result: any = { success: true, teamId };

    // 记录数据访问
    if (teamId && dataType) {
      await logDataAccess(client, teamId, dataType === 'all' ? 'all' : dataType);
    }

    // 根据类型查询数据
    if (!dataType || dataType === 'all') {
      // 返回完整数据
      result.data = await getAllTeamData(client, teamId);
    } else {
      switch (dataType) {
        case 'team':
          result.data = await getTeamInfo(client, teamId);
          break;
        case 'theme':
          result.data = await getThemeData(client, teamId);
          break;
        case 'task':
          result.data = await getTaskData(client, teamId);
          break;
        case 'tool':
          result.data = await getToolData(client, teamId);
          break;
        case 'material':
          result.data = await getMaterialData(client, teamId);
          break;
        case 'reward':
          result.data = await getRewardData(client, teamId);
          break;
        case 'point':
          result.data = await getPointData(client, teamId);
          break;
        case 'message':
          result.data = await getMessageData(client, teamId);
          break;
        case 'peer':
          result.data = await getPeerTeamsData(client, teamId);
          break;
        case 'skill':
          result.data = await getSkillData(client, teamId);
          break;
        default:
          return ApiErrors.validation('未知的数据类型');
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[银蛇博士数据] 查询失败:', error);
    return safeError(error);
  }
}

/**
 * 获取小队完整数据
 */
async function getAllTeamData(client: any, teamId: string) {
  return {
    team: await getTeamInfo(client, teamId),
    theme: await getThemeData(client, teamId),
    tasks: await getTaskData(client, teamId),
    tools: await getToolData(client, teamId),
    materials: await getMaterialData(client, teamId),
    rewards: await getRewardData(client, teamId),
    points: await getPointData(client, teamId),
    messages: await getMessageData(client, teamId),
    peerTeams: await getPeerTeamsData(client, teamId),
    skills: await getSkillData(client, teamId)
  };
}

/**
 * 获取小队基础信息
 */
async function getTeamInfo(client: any, teamId: string) {
  const { data: team } = await client
    .from('teams')
    .select('id, code, name, points, status, school_id, teacher_id, assigned_volunteer_id, created_by, created_at, updated_at, grade, current_theme_id, slogan, is_active, cycle')
    .eq('id', teamId)
    .single();

  if (!team) return null;

  // 获取小队成员
  const { data: members } = await client
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_approved', true);

  // 获取当前周期信息
  const { data: currentSelection } = await client
    .from('team_theme_selections')
    .select('*, task_themes(*)')
    .eq('team_id', teamId)
    .eq('cycle', team.cycle || 1)
    .single();

  return {
    ...team,
    members: members || [],
    currentCycle: team.cycle || 1,
    currentTheme: currentSelection?.task_themes || null,
    themeSelection: currentSelection || null
  };
}

/**
 * 获取主题相关数据
 */
async function getThemeData(client: any, teamId: string) {
  // 获取小队的主题选择历史
  const { data: selections } = await client
    .from('team_theme_selections')
    .select('*, task_themes(*)')
    .eq('team_id', teamId)
    .order('cycle', { ascending: true });

  // 获取当前主题的任务列表
  const currentThemeId = selections?.[selections.length - 1]?.theme_id;
  let tasks = [];
  if (currentThemeId) {
    const { data } = await client
      .from('tasks')
      .select('*')
      .eq('theme_id', currentThemeId)
      .eq('is_active', true)
      .order('order_index');
    tasks = data || [];
  }

  // 获取主题完成记录
  const { data: completions } = await client
    .from('theme_completions')
    .select('*')
    .eq('team_id', teamId)
    .order('completed_at', { ascending: false });

  return {
    selections: selections || [],
    currentTasks: tasks,
    completions: completions || []
  };
}

/**
 * 获取任务相关数据
 */
async function getTaskData(client: any, teamId: string) {
  // 获取当前主题的任务
  const { data: currentTasks } = await client
    .from('tasks')
    .select('*')
    .eq('theme_id', 
      (await client.from('teams').select('current_theme_id').eq('id', teamId).single())?.data?.current_theme_id
    )
    .eq('is_active', true)
    .order('order_index');

  // 获取任务提交记录
  const { data: submissions } = await client
    .from('task_submissions')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(20);

  // 获取侧边任务
  const { data: sideTasks } = await client
    .from('team_side_tasks')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  return {
    currentTasks: currentTasks || [],
    submissions: submissions || [],
    sideTasks: sideTasks || []
  };
}

/**
 * 获取工具相关数据
 */
async function getToolData(client: any, teamId: string) {
  // 获取小队已选的工具
  const { data: teamTools } = await client
    .from('team_tools')
    .select('*, tools(*)')
    .eq('team_id', teamId);

  // 获取当前任务需要的工具
  const currentTaskId = (await client.from('teams').select('current_task_id').eq('id', teamId).single())?.data?.current_task_id;
  let taskTools = [];
  if (currentTaskId) {
    const { data } = await client
      .from('task_tools')
      .select('*, tools(*)')
      .eq('task_id', currentTaskId);
    taskTools = data || [];
  }

  return {
    owned: teamTools || [],
    required: taskTools || []
  };
}

/**
 * 获取学习资料
 */
async function getMaterialData(client: any, teamId: string) {
  // 获取当前主题的学习资料
  const currentThemeId = (await client.from('teams').select('current_theme_id').eq('id', teamId).single())?.data?.current_theme_id;
  let materials = [];
  
  if (currentThemeId) {
    // 先获取主题下的所有任务
    const { data: tasks } = await client
      .from('tasks')
      .select('id')
      .eq('theme_id', currentThemeId)
      .eq('is_active', true);

    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map((t: any) => t.id);
      const { data } = await client
        .from('learning_materials')
        .select('*')
        .in('task_id', taskIds)
        .order('order_index');
      materials = data || [];
    }
  }

  // 获取小队的资料学习进度
  const { data: progress } = await client
    .from('team_material_progress')
    .select('*')
    .eq('team_id', teamId);

  return {
    materials,
    progress: progress || []
  };
}

/**
 * 获取激励数据
 */
async function getRewardData(client: any, teamId: string) {
  // 获取小队获得的激励
  const { data: rewards } = await client
    .from('user_rewards')
    .select('*, rewards(*)')
    .eq('team_id', teamId)
    .order('earned_at', { ascending: false })
    .limit(30);

  // 获取可用激励
  const { data: availableRewards } = await client
    .from('rewards')
    .select('*')
    .eq('is_active', true)
    .order('points');

  return {
    earned: rewards || [],
    available: availableRewards || []
  };
}

/**
 * 获取积分数据
 */
async function getPointData(client: any, teamId: string) {
  // 获取当前积分
  const { data: team } = await client
    .from('teams')
    .select('points')
    .eq('id', teamId)
    .single();

  // 获取积分变动历史
  const { data: transactions } = await client
    .from('point_transactions')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(50);

  // 获取收到的点赞
  const { data: likes } = await client
    .from('like_records')
    .select('*')
    .eq('to_team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(20);

  // 计算排名
  const { data: ranking } = await client
    .from('teams')
    .select('id, points, name')
    .order('points', { ascending: false });

  const currentPoints = team?.points || 0;
  const rank = ranking?.findIndex((t: any) => t.id === teamId) + 1 || 0;

  return {
    current: currentPoints,
    rank,
    totalTeams: ranking?.length || 0,
    transactions: transactions || [],
    receivedLikes: likes || [],
    topTeams: ranking?.slice(0, 10) || []
  };
}

/**
 * 获取消息数据
 */
async function getMessageData(client: any, teamId: string) {
  // 获取消息列表
  const { data: messages } = await client
    .from('messages')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(50);

  // 获取通知
  const { data: notifications } = await client
    .from('team_notifications')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(30);

  // 统计未读
  const unreadMessages = messages?.filter((m: any) => !m.is_read).length || 0;
  const unreadNotifications = notifications?.filter((n: any) => !n.is_read).length || 0;

  return {
    messages: messages || [],
    notifications: notifications || [],
    unreadMessages,
    unreadNotifications
  };
}

/**
 * 获取其他小队进度数据
 */
async function getPeerTeamsData(client: any, teamId: string) {
  // 获取当前小队的学校和周期
  const { data: currentTeam } = await client
    .from('teams')
    .select('school_id, cycle')
    .eq('id', teamId)
    .single();

  if (!currentTeam) return { peers: [] };

  // 获取同校或同期的小队
  const { data: peers } = await client
    .from('teams')
    .select('id, name, cycle, points, current_theme_id, status')
    .eq('cycle', currentTeam.cycle)
    .eq('is_active', true)
    .neq('id', teamId)  // 排除自己
    .order('points', { ascending: false })
    .limit(20);

  // 获取这些小队的主题选择
  const peerIds = peers?.map((p: any) => p.id) || [];
  let peerThemes: any[] = [];
  
  if (peerIds.length > 0) {
    const { data } = await client
      .from('team_theme_selections')
      .select('*, task_themes(name)')
      .in('team_id', peerIds)
      .eq('cycle', currentTeam.cycle);
    peerThemes = data || [];
  }

  return {
    peers: peers || [],
    peerThemes,
    totalPeerCount: peers?.length || 0
  };
}

/**
 * 获取技能学习数据
 */
async function getSkillData(client: any, teamId: string) {
  // 获取小队学习进度
  const { data: learnings } = await client
    .from('team_skill_learnings')
    .select('*, skills(*)')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  // 获取当前任务的技能要求
  const currentTaskId = (await client.from('teams').select('current_task_id').eq('id', teamId).single())?.data?.current_task_id;
  let requiredSkills: any[] = [];
  
  if (currentTaskId) {
    const { data } = await client
      .from('task_skills')
      .select('*, skills(*)')
      .eq('task_id', currentTaskId);
    requiredSkills = data || [];
  }

  // 统计学习状态
  const stats = {
    total: learnings?.length || 0,
    completed: learnings?.filter((l: any) => l.status === 'completed').length || 0,
    inProgress: learnings?.filter((l: any) => l.status === 'in_progress').length || 0,
    totalPoints: learnings?.reduce((sum: number, l: any) => sum + (l.points_earned || 0), 0) || 0
  };

  return {
    learnings: learnings || [],
    requiredSkills,
    stats
  };
}

/**
 * 记录数据访问日志
 */
async function logDataAccess(client: any, teamId: string, dataType: string) {
  try {
    // 更新访问记录
    const { data: existing } = await client
      .from('yinhe_data_access_logs')
      .select('id, access_count')
      .eq('team_id', teamId)
      .eq('data_type', dataType)
      .single();

    if (existing) {
      await client
        .from('yinhe_data_access_logs')
        .update({
          access_count: existing.access_count + 1,
          last_accessed_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await client.from('yinhe_data_access_logs').insert({
        team_id: teamId,
        data_type: dataType
      });
    }
  } catch (error) {
    console.error('[银蛇博士] 记录访问日志失败:', error);
  }
}
