import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 蜡象助手数据查询核心函数
 * 整合管理员后台所有模块的数据查询能力
 */

/**
 * 通用数据获取函数（供其他模块调用）
 */
export async function getLaxiangData(
  dataType: string,
  userRole?: string,
  userId?: string,
  schoolId?: string
): Promise<any> {
  const client = getSupabaseClient();

  switch (dataType) {
    case 'all':
    case 'dashboard':
      return getDashboardData(client, userRole);
    case 'teams':
      return getTeamsData(client, userRole, schoolId);
    case 'tasks':
      return getTasksData(client);
    case 'themes':
      return getThemesData(client);
    case 'submissions':
      return getSubmissionsData(client);
    case 'schools':
      return getSchoolsData(client);
    case 'volunteers':
      return getVolunteersData(client);
    case 'tools':
      return getToolsData(client);
    case 'skills':
      return getSkillsData(client);
    case 'messages':
      return getMessagesData(client);
    case 'rewards':
      return getRewardsData(client);
    case 'feedback':
      return getFeedbackData(client);
    case 'final-tasks':
      return getFinalTasksData(client);
    default:
      return getDashboardData(client, userRole);
  }
}

/**
 * 获取数据面板汇总
 */
async function getDashboardData(client: any, userRole: string | undefined) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const [
    teamsResult,
    schoolsResult,
    volunteersResult,
    themesResult,
    toolsResult,
    skillsResult,
    rewardsResult,
    submissionsResult
  ] = await Promise.all([
    getTeamsData(client, userRole, undefined),
    getSchoolsData(client),
    getVolunteersData(client),
    getThemesData(client),
    getToolsData(client),
    getSkillsData(client),
    getRewardsData(client),
    getSubmissionsData(client)
  ]);

  // 获取今日活跃
  const { count: todayActive } = await client
    .from('team_activity_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00`);

  return {
    summary: {
      totalTeams: teamsResult.total || 0,
      totalSchools: schoolsResult.total || 0,
      totalVolunteers: volunteersResult.total || 0,
      totalThemes: themesResult.total || 0,
      totalTools: toolsResult.total || 0,
      totalSkills: skillsResult.totalSkills || 0,
      totalRewards: rewardsResult.total || 0,
      todayActiveTeams: todayActive || 0
    },
    submissions: submissionsResult,
    topTeams: teamsResult.topByPoints || []
  };
}

/**
 * 获取小队管理数据
 */
async function getTeamsData(client: any, userRole: string | undefined, schoolId: string | undefined) {
  let query = client
    .from('teams')
    .select('id, name, code, points, status, current_theme_id, cycle, school_id')
    .eq('is_active', true);

  if (userRole === 'teacher' && schoolId) {
    query = query.eq('school_id', schoolId);
  } else if (userRole === 'volunteer') {
    query = query.eq('assigned_volunteer_id', userRole);
  }

  const { data: teams, error } = await query;
  if (error) throw error;

  // 获取小队成员
  const teamIds = (teams || []).map((t: any) => t.id);
  const { data: members } = teamIds.length > 0 
    ? await client.from('team_members').select('team_id, name, role').in('team_id', teamIds).eq('is_approved', true)
    : { data: [] };

  // 获取主题映射（通过 current_theme_id）
  const themeIds = [...new Set((teams || []).map((t: any) => t.current_theme_id).filter(Boolean))];
  const { data: themes } = themeIds.length > 0
    ? await client.from('task_themes').select('id, name').in('id', themeIds)
    : { data: [] };

  const themeMap = new Map((themes || []).map((t: any) => [t.id, t.name]));

  // 按积分排名
  const sortedTeams = (teams || []).sort((a: any, b: any) => (b.points || 0) - (a.points || 0));

  // 统计各周期小队数量
  const cycleStats: Record<number, number> = {};
  (teams || []).forEach((t: any) => {
    const cycle = t.cycle || 1;
    cycleStats[cycle] = (cycleStats[cycle] || 0) + 1;
  });

  // 按成员分组
  const membersByTeam = new Map<string, any[]>();
  (members || []).forEach((m: any) => {
    if (!membersByTeam.has(m.team_id)) {
      membersByTeam.set(m.team_id, []);
    }
    membersByTeam.get(m.team_id)!.push(m);
  });

  return {
    total: teams?.length || 0,
    byCycle: cycleStats,
    teams: (teams || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      cycle: t.cycle || 1,
      points: t.points || 0,
      status: t.status,
      rank: sortedTeams.findIndex((st: any) => st.id === t.id) + 1,
      members: membersByTeam.get(t.id) || [],
      currentTheme: t.current_theme_id ? (themeMap.get(t.current_theme_id) || '未知主题') : '未选择'
    })),
    topByPoints: sortedTeams.slice(0, 10).map((t: any, i: number) => ({
      name: t.name,
      points: t.points || 0,
      rank: i + 1
    }))
  };
}

/**
 * 获取任务管理数据
 */
async function getTasksData(client: any) {
  const { data: tasks, error } = await client
    .from('tasks')
    .select('*, task_themes(name)')
    .eq('is_active', true)
    .order('order_index');

  if (error) throw error;

  // 获取任务提交统计
  const taskIds = (tasks || []).map((t: any) => t.id);
  const { data: submissions } = taskIds.length > 0
    ? await client.from('task_submissions').select('task_id, status').in('task_id', taskIds)
    : { data: [] };

  // 按主题分组统计
  const themeStats: Record<string, { total: number; completed: number }> = {};
  (tasks || []).forEach((t: any) => {
    const themeName = (t.task_themes as any)?.name || '未分类';
    if (!themeStats[themeName]) {
      themeStats[themeName] = { total: 0, completed: 0 };
    }
    themeStats[themeName].total++;
  });

  // 统计提交
  (submissions || []).forEach((s: any) => {
    const task = tasks?.find((t: any) => t.id === s.task_id);
    if (task && s.status === 'approved') {
      const themeName = (task.task_themes as any)?.name || '未分类';
      if (themeStats[themeName]) {
        themeStats[themeName].completed++;
      }
    }
  });

  return {
    total: tasks?.length || 0,
    byTheme: themeStats,
    recentTasks: (tasks || []).slice(-10).reverse()
  };
}

/**
 * 获取主题管理数据
 */
async function getThemesData(client: any) {
  const { data: themes, error } = await client
    .from('task_themes')
    .select('*')
    .eq('is_active', true)
    .order('created_at');

  if (error) throw error;

  // 获取每个主题的任务数量
  const { data: taskCounts } = await client
    .from('tasks')
    .select('theme_id')
    .eq('is_active', true);

  // 获取每个主题的选择小队数量
  const { data: selectionCounts } = await client
    .from('team_theme_selections')
    .select('theme_id, status');

  // 统计
  const themeStats = new Map<string, { tasks: number; selections: number; completed: number }>();
  (themes || []).forEach((t: any) => {
    themeStats.set(t.id, { tasks: 0, selections: 0, completed: 0 });
  });

  (taskCounts || []).forEach((tc: any) => {
    const stat = themeStats.get(tc.theme_id);
    if (stat) stat.tasks++;
  });

  (selectionCounts || []).forEach((sc: any) => {
    const stat = themeStats.get(sc.theme_id);
    if (stat) {
      stat.selections++;
      if (sc.status === 'completed') stat.completed++;
    }
  });

  return {
    total: themes?.length || 0,
    themes: (themes || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      stats: themeStats.get(t.id) || { tasks: 0, selections: 0, completed: 0 }
    }))
  };
}

/**
 * 获取产出审核数据
 */
async function getSubmissionsData(client: any) {
  const { data: submissions, error } = await client
    .from('task_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  // 获取关联的团队和任务信息
  const teamIds = [...new Set((submissions || []).map((s: any) => s.team_id).filter(Boolean))];
  const taskIds = [...new Set((submissions || []).map((s: any) => s.task_id).filter(Boolean))];
  
  const { data: teams } = teamIds.length > 0
    ? await client.from('teams').select('id, name').in('id', teamIds)
    : { data: [] };
  const { data: tasks } = taskIds.length > 0
    ? await client.from('tasks').select('id, title').in('id', taskIds)
    : { data: [] };

  const teamMap = new Map((teams || []).map((t: any) => [t.id, t.name]));
  const taskMap = new Map((tasks || []).map((t: any) => [t.id, t.title]));

  // 统计各状态数量
  const statusStats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    total: submissions?.length || 0
  };

  (submissions || []).forEach((s: any) => {
    if (s.status === 'pending') statusStats.pending++;
    else if (s.status === 'approved') statusStats.approved++;
    else if (s.status === 'rejected') statusStats.rejected++;
  });

  // 最近提交
  const recent = (submissions || []).slice(0, 10).map((s: any) => ({
    id: s.id,
    teamName: teamMap.get(s.team_id) || '未知',
    taskTitle: taskMap.get(s.task_id) || '未知任务',
    status: s.status,
    createdAt: s.created_at
  }));

  return {
    ...statusStats,
    recent,
    pending: recent.filter((r: any) => r.status === 'pending')
  };
}

/**
 * 获取项目小学数据
 */
async function getSchoolsData(client: any) {
  const { data: schools, error } = await client
    .from('schools')
    .select('*');

  if (error) throw error;

  // 获取每个学校的小队数量
  const { data: teamCounts } = await client
    .from('teams')
    .select('school_id')
    .eq('is_active', true);

  // 统计
  const schoolStats = new Map<string, number>();
  (teamCounts || []).forEach((tc: any) => {
    schoolStats.set(tc.school_id, (schoolStats.get(tc.school_id) || 0) + 1);
  });

  return {
    total: schools?.length || 0,
    schools: (schools || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      region: (s.province || '') + (s.city || '') + (s.county || ''),
      teamCount: schoolStats.get(s.id) || 0
    }))
  };
}

/**
 * 获取授课志愿者数据
 */
async function getVolunteersData(client: any) {
  const { data: volunteers, error } = await client
    .from('users')
    .select('id, name, created_at')
    .eq('role', 'volunteer')
    .eq('is_active', true);

  if (error) throw error;

  // 获取每个志愿者指导的小队数量
  const { data: teamCounts } = await client
    .from('teams')
    .select('assigned_volunteer_id')
    .eq('is_active', true);

  // 统计
  const volunteerStats = new Map<string, number>();
  (teamCounts || []).forEach((tc: any) => {
    if (tc.assigned_volunteer_id) {
      volunteerStats.set(tc.assigned_volunteer_id, (volunteerStats.get(tc.assigned_volunteer_id) || 0) + 1);
    }
  });

  return {
    total: volunteers?.length || 0,
    volunteers: (volunteers || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      teamCount: volunteerStats.get(v.id) || 0,
      joinedAt: v.created_at
    }))
  };
}

/**
 * 获取工具管理数据
 */
async function getToolsData(client: any) {
  const { data: tools, error } = await client
    .from('tools')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  // 获取每个工具被多少小队使用
  const { data: teamTools } = await client
    .from('team_tools')
    .select('tool_id');

  // 统计
  const toolStats = new Map<string, number>();
  (teamTools || []).forEach((tt: any) => {
    toolStats.set(tt.tool_id, (toolStats.get(tt.tool_id) || 0) + 1);
  });

  // 按类型分组
  const typeStats: Record<string, number> = {};
  (tools || []).forEach((t: any) => {
    const type = t.type || '其他';
    typeStats[type] = (typeStats[type] || 0) + 1;
  });

  return {
    total: tools?.length || 0,
    byType: typeStats,
    tools: (tools || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      description: t.description,
      usageCount: toolStats.get(t.id) || 0
    }))
  };
}

/**
 * 获取技能学习数据
 */
async function getSkillsData(client: any) {
  const { data: skills, error } = await client
    .from('skills')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  // 获取小队学习进度
  const { data: learnings } = await client
    .from('team_skill_learnings')
    .select('*, skills(name), teams(name)');

  // 统计
  const stats = {
    totalSkills: skills?.length || 0,
    totalLearnings: learnings?.length || 0,
    completedLearnings: 0,
    inProgressLearnings: 0
  };

  (learnings || []).forEach((l: any) => {
    if (l.status === 'completed') stats.completedLearnings++;
    else if (l.status === 'in_progress') stats.inProgressLearnings++;
  });

  // 最近学习记录
  const recentLearnings = (learnings || []).slice(-10).reverse().map((l: any) => ({
    teamName: (l.teams as any)?.name || '未知',
    skillName: (l.skills as any)?.name || '未知',
    status: l.status,
    points: l.points_earned,
    completedAt: l.completed_at
  }));

  return {
    ...stats,
    recentLearnings
  };
}

/**
 * 获取消息管理数据
 */
async function getMessagesData(client: any) {
  const { data: messages, error } = await client
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  // 获取关联的团队信息
  const teamIds = [...new Set((messages || []).map((m: any) => m.team_id).filter(Boolean))];
  const { data: teams } = teamIds.length > 0
    ? await client.from('teams').select('id, name').in('id', teamIds)
    : { data: [] };

  const teamMap = new Map<string, string>();
  (teams || []).forEach((t: any) => {
    teamMap.set(t.id, t.name);
  });

  // 统计未读
  const { count: unreadCount } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  // 按小队统计
  const teamMessageStats = new Map<string, { total: number; unread: number; name: string }>();
  (messages || []).forEach((m: any) => {
    const teamId = m.team_id;
    if (!teamId) return;
    if (!teamMessageStats.has(teamId)) {
      teamMessageStats.set(teamId, { total: 0, unread: 0, name: (teamMap.get(teamId) ?? '未知') as string });
    }
    const stat = teamMessageStats.get(teamId);
    if (stat) {
      stat.total++;
      if (!m.is_read) stat.unread++;
    }
  });

  // 最近消息
  const recentMessages = (messages || []).slice(0, 10).map((m: any) => ({
    id: m.id,
    teamName: teamMap.get(m.team_id) || '未知',
    content: m.content?.substring(0, 100),
    isRead: m.is_read,
    createdAt: m.created_at
  }));

  return {
    total: messages?.length || 0,
    unread: unreadCount || 0,
    byTeam: Array.from(teamMessageStats.values()),
    recentMessages
  };
}

/**
 * 获取激励配置数据
 */
async function getRewardsData(client: any) {
  const { data: rewards, error } = await client
    .from('rewards')
    .select('*')
    .order('points');

  if (error) throw error;

  // 获取小队获得激励的统计
  const { data: earnedRewards } = await client
    .from('user_rewards')
    .select('reward_id');

  // 统计
  const rewardStats = new Map<string, number>();
  (earnedRewards || []).forEach((er: any) => {
    rewardStats.set(er.reward_id, (rewardStats.get(er.reward_id) || 0) + 1);
  });

  // 按类型分组
  const typeStats: Record<string, number> = {};
  (rewards || []).forEach((r: any) => {
    const type = r.type || '其他';
    typeStats[type] = (typeStats[type] || 0) + 1;
  });

  // 热门激励
  const topRewards = (rewards || [])
    .map((r: any) => ({ ...r, earnCount: rewardStats.get(r.id) || 0 }))
    .sort((a: any, b: any) => b.earnCount - a.earnCount)
    .slice(0, 10);

  return {
    total: rewards?.length || 0,
    byType: typeStats,
    totalEarned: earnedRewards?.length || 0,
    topRewards,
    rewards: (rewards || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      points: r.points,
      icon: r.icon,
      earnCount: rewardStats.get(r.id) || 0
    }))
  };
}

/**
 * 获取反馈查看数据
 */
async function getFeedbackData(client: any) {
  // 获取小队反馈知识库
  const { data: feedback, error } = await client
    .from('task_feedback_knowledge')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  // 统计
  const stats = {
    total: feedback?.length || 0,
    byCategory: {} as Record<string, number>,
    byTheme: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    integrated: 0
  };

  (feedback || []).forEach((f: any) => {
    // 类别统计
    stats.byCategory[f.category] = (stats.byCategory[f.category] || 0) + 1;
    // 主题统计
    if (f.theme_name) {
      stats.byTheme[f.theme_name] = (stats.byTheme[f.theme_name] || 0) + 1;
    }
    // 类型统计
    stats.byType[f.feedback_type] = (stats.byType[f.feedback_type] || 0) + 1;
    // 已整合
    if (f.is_integrated) stats.integrated++;
  });

  // 最近反馈
  const recentFeedback = (feedback || []).slice(0, 20).map((f: any) => ({
    id: f.id,
    teamName: f.team_name,
    themeName: f.theme_name,
    category: f.category,
    type: f.feedback_type,
    content: f.content?.substring(0, 100),
    createdAt: f.created_at
  }));

  return {
    ...stats,
    recentFeedback
  };
}

/**
 * 获取最后任务数据
 */
async function getFinalTasksData(client: any) {
  // 获取表单配置
  const { data: forms, error: formsError } = await client
    .from('final_task_forms')
    .select('*');

  if (formsError) throw formsError;

  // 获取提交记录
  const { data: submissions, error: subError } = await client
    .from('final_task_submissions')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(50);

  if (subError) throw subError;

  // 获取关联的团队信息
  const teamIds = [...new Set((submissions || []).map((s: any) => s.team_id).filter(Boolean))];
  const { data: teams } = teamIds.length > 0
    ? await client.from('teams').select('id, name').in('id', teamIds)
    : { data: [] };

  const teamMap = new Map((teams || []).map((t: any) => [t.id, t.name]));

  // 统计
  const stats = {
    totalForms: forms?.length || 0,
    totalSubmissions: submissions?.length || 0,
    pendingReview: 0,
    approved: 0
  };

  (submissions || []).forEach((s: any) => {
    if (s.status === 'pending') stats.pendingReview++;
    else if (s.status === 'approved') stats.approved++;
  });

  // 最近提交
  const recentSubmissions = (submissions || []).slice(0, 10).map((s: any) => ({
    id: s.id,
    teamName: teamMap.get(s.team_id) || '未知',
    status: s.status,
    score: s.score,
    reviewer: s.reviewer_name,
    createdAt: s.submitted_at
  }));

  return {
    ...stats,
    recentSubmissions
  };
}
