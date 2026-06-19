/**
 * context-builder.ts
 * 蜡象助手 — 数据上下文构建模块
 *
 * 根据用户角色（超级管理员 / 志愿者 / 助学老师 / 家长）构建对应的数据上下文，
 * 供 AI 助手在对话中引用。
 */

export async function getAdminDataContext(client: any, userId: string, userRole: string) {
  const data: Record<string, any> = {};

  try {
    if (userRole === 'admin' || userRole === 'super_admin') {
      // 超级管理员：获取全部数据
      return await getFullAdminContext(client);
    } else if (userRole === 'volunteer') {
      // 志愿者：获取自己指导的小队数据
      return await getVolunteerContext(client, userId);
    } else if (userRole === 'teacher') {
      // 助学老师：获取本校数据
      return await getTeacherContext(client, userId);
    } else if (userRole === 'parent') {
      // 家长：获取关注的小队数据
      return await getParentContext(client, userId);
    }
  } catch (error) {
    console.error('[蜡象助手] 获取数据上下文失败:', error);
  }

  return data;
}

// 超级管理员完整数据上下文
export async function getFullAdminContext(client: any) {
  const data: Record<string, any> = {};

  // 1. 学校统计（学校表没有is_active字段）
  const { data: schools } = await client
    .from('schools')
    .select('id, name, city, province');
  data.schools = schools || [];
  data.schoolCount = schools?.length || 0;

  // 2. 志愿者统计
  const { data: volunteers } = await client
    .from('users')
    .select('id, name, username, school_id, created_at')
    .eq('role', 'volunteer');
  data.volunteers = volunteers || [];
  data.volunteerCount = volunteers?.length || 0;

  // 3. 助学老师统计
  const { data: teachers } = await client
    .from('users')
    .select('id, name, username, school_id')
    .eq('role', 'teacher');
  data.teachers = teachers || [];
  data.teacherCount = teachers?.length || 0;

  // 4. 小队统计（不使用join，避免外键关系问题）
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id, name, code, points, status, current_theme_id, current_task_id, created_by, created_at, next_task_deadline, school_id')
    .eq('status', 'active');

  if (teamsError) {
    console.error('[蜡象助手] 获取小队数据错误:', teamsError);
  }
  data.teams = teams || [];
  data.teamCount = teams?.length || 0;

  // 4.1 获取小队详情（关联主题和任务）
  if (data.teams.length > 0) {
    const teamIds = data.teams.map((t: any) => t.id);

    // 获取小队主题信息
    const themeIds = [...new Set(data.teams.filter((t: any) => t.current_theme_id).map((t: any) => t.current_theme_id))];
    if (themeIds.length > 0) {
      const { data: teamThemes } = await client
        .from('task_themes')
        .select('id, name, icon, description')
        .in('id', themeIds);
      data.themesMap = {};
      (teamThemes || []).forEach((t: any) => {
        data.themesMap[t.id] = t;
      });
    }

    // 获取小队当前任务信息
    const taskIds = [...new Set(data.teams.filter((t: any) => t.current_task_id).map((t: any) => t.current_task_id))];
    if (taskIds.length > 0) {
      const { data: teamTasks } = await client
        .from('tasks')
        .select('id, title, stage, points, description')
        .in('id', taskIds);
      data.tasksMap = {};
      (teamTasks || []).forEach((t: any) => {
        data.tasksMap[t.id] = t;
      });
    }

    // 获取小队提交统计
    const { data: teamSubs } = await client
      .from('task_submissions')
      .select('team_id, status, rating')
      .in('team_id', teamIds);

    // 按小队统计提交
    data.teamSubmissions = {};
    (teamSubs || []).forEach((s: any) => {
      if (!data.teamSubmissions[s.team_id]) {
        data.teamSubmissions[s.team_id] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      }
      data.teamSubmissions[s.team_id].total++;
      if (s.status === 'pending') data.teamSubmissions[s.team_id].pending++;
      if (s.status === 'approved') data.teamSubmissions[s.team_id].approved++;
      if (s.status === 'rejected') data.teamSubmissions[s.team_id].rejected++;
    });
  }

  // 5. 小队成员统计
  const { count: memberCount } = await client
    .from('team_members')
    .select('*', { count: 'exact', head: true });
  data.memberCount = memberCount || 0;

  // 6. 主题统计
  const { data: themes } = await client
    .from('task_themes')
    .select('id, name, description, icon, is_active, is_exclusive, school_id')
    .eq('is_active', true);
  data.themes = themes || [];
  data.themeCount = themes?.length || 0;

  // 6.1 获取小队主题选择状态
  if (data.teams.length > 0) {
    // 获取所有小队的周期
    const teamCycleMap = new Map<string, number>();
    (data.teams || []).forEach((t: any) => {
      teamCycleMap.set(t.id, t.cycle || 1);
    });

    // 获取所有小队在各自周期的选择状态
    const { data: allSelections } = await client
      .from('team_theme_selections')
      .select('team_id, theme_id, cycle, status');

    // 按小队分组
    const teamSelectionStatus: Record<string, { status: string; themeId: string; cycle: number }> = {};
    (allSelections || []).forEach((s: any) => {
      const teamCycle = teamCycleMap.get(s.team_id);
      // 只记录当前周期状态
      if (teamCycle && s.cycle === teamCycle) {
        teamSelectionStatus[s.team_id] = {
          status: s.status,
          themeId: s.theme_id,
          cycle: s.cycle
        };
      }
    });

    // 标记每小队的周期完成状态
    data.teamThemeStatus = {};
    (data.teams || []).forEach((t: any) => {
      const status = teamSelectionStatus[t.id];
      data.teamThemeStatus[t.id] = {
        currentThemeId: t.current_theme_id,
        cycle: t.cycle || 1,
        selectionStatus: status?.status || 'in_progress',
        canSelectNewTheme: !status || status.status === 'completed'
      };
    });

    // 获取需要选择新主题的小队
    data.teamsNeedingTheme = (data.teams || [])
      .filter((t: any) => {
        const status = teamSelectionStatus[t.id];
        return !status || status.status === 'completed';
      })
      .map((t: any) => t.name || t.code || t.id);

    // 所有可用主题（已完成当前周期的小队可以选择的）
    if (data.teamsNeedingTheme.length > 0) {
      data.availableThemes = data.themes;
    }
  }

  // 7. 任务统计
  const { data: tasks } = await client
    .from('tasks')
    .select('id, title, stage, points, task_type, theme_id, is_active, description, requirements, learning_goals, task_group_id, group_name, difficulty')
    .eq('is_active', true);
  data.tasks = tasks || [];
  data.taskCount = tasks?.length || 0;

  // 7.1 获取任务关联信息
  if (data.tasks.length > 0) {
    const taskIds = data.tasks.map((t: any) => t.id);

    // 获取任务关联的工具
    const { data: taskTools } = await client
      .from('task_tools')
      .select('task_id, is_required, tools(id, name, category)')
      .in('task_id', taskIds);
    data.taskToolsMap = {};
    (taskTools || []).forEach((tt: any) => {
      if (!data.taskToolsMap[tt.task_id]) {
        data.taskToolsMap[tt.task_id] = [];
      }
      data.taskToolsMap[tt.task_id].push({
        name: tt.tools?.name,
        category: tt.tools?.category,
        isRequired: tt.is_required
      });
    });

    // 获取任务关联的技能
    const { data: taskSkills } = await client
      .from('task_skills')
      .select('task_id, points, is_required, skills(id, name, category)')
      .in('task_id', taskIds);
    data.taskSkillsMap = {};
    (taskSkills || []).forEach((ts: any) => {
      if (!data.taskSkillsMap[ts.task_id]) {
        data.taskSkillsMap[ts.task_id] = [];
      }
      data.taskSkillsMap[ts.task_id].push({
        name: ts.skills?.name,
        category: ts.skills?.category,
        points: ts.points,
        isRequired: ts.is_required
      });
    });

    // 获取任务关联的激励
    const { data: taskRewards } = await client
      .from('task_rewards')
      .select('task_id, rewards(id, name, type, points, icon)')
      .in('task_id', taskIds);
    data.taskRewardsMap = {};
    (taskRewards || []).forEach((tr: any) => {
      if (!data.taskRewardsMap[tr.task_id]) {
        data.taskRewardsMap[tr.task_id] = [];
      }
      data.taskRewardsMap[tr.task_id].push({
        name: tr.rewards?.name,
        type: tr.rewards?.type,
        points: tr.rewards?.points,
        icon: tr.rewards?.icon
      });
    });
  }

  // 8. 提交产出统计
  const { data: submissions } = await client
    .from('task_submissions')
    .select('id, status, rating, created_at, reviewed_at, task_id, team_id, content, file_urls, review_comment, points_earned')
    .order('created_at', { ascending: false })
    .limit(200);
  data.submissions = submissions || [];

  // 统计各状态数量
  data.submissionStats = {
    pending: submissions?.filter((s: any) => s.status === 'pending').length || 0,
    approved: submissions?.filter((s: any) => s.status === 'approved').length || 0,
    rejected: submissions?.filter((s: any) => s.status === 'rejected').length || 0,
    excellent: submissions?.filter((s: any) => s.rating === 'excellent').length || 0,
  };

  // 8.1 提取小队产出详情（供AI分析使用）
  if (data.submissions.length > 0) {
    const taskIds = [...new Set(data.submissions.map((s: any) => s.task_id).filter(Boolean))];
    const teamIds = [...new Set(data.submissions.map((s: any) => s.team_id).filter(Boolean))];

    // 获取任务详情
    const { data: taskDetails } = taskIds.length > 0
      ? await client.from('tasks').select('id, title, description, requirements, stage, theme_id').in('id', taskIds)
      : { data: [] };
    const taskMap = new Map((taskDetails || []).map((t: any) => [t.id, t]));

    // 获取主题详情
    const themeIds = [...new Set((taskDetails || []).map((t: any) => t.theme_id).filter(Boolean))];
    const { data: themeDetails } = themeIds.length > 0
      ? await client.from('task_themes').select('id, name').in('id', themeIds)
      : { data: [] };
    const themeMap = new Map((themeDetails || []).map((t: any) => [t.id, t.name]));

    // 获取小队详情
    const { data: teamDetails } = teamIds.length > 0
      ? await client.from('teams').select('id, name, code, cycle').in('id', teamIds)
      : { data: [] };
    const teamMap = new Map((teamDetails || []).map((t: any) => [t.id, t]));

    // 构建小队产出详情列表
    data.submissionDetails = (submissions || []).map((s: any) => {
      const task: any = taskMap.get(s.task_id);
      const team: any = teamMap.get(s.team_id);
      const themeName = task?.theme_id ? themeMap.get(task.theme_id) : null;

      return {
        submissionId: s.id,
        teamId: s.team_id,
        teamName: team?.name || team?.code || '未知小队',
        teamCycle: team?.cycle || 1,
        taskId: s.task_id,
        taskTitle: task?.title || '未知任务',
        taskDescription: task?.description || '',
        taskRequirements: task?.requirements || '',
        taskStage: task?.stage || 1,
        themeName: themeName || '未知主题',
        status: s.status,
        rating: s.rating,
        reviewComment: s.review_comment || '',
        pointsEarned: s.points_earned || 0,
        content: s.content || '',
        fileUrls: s.file_urls || {},
        createdAt: s.created_at,
        reviewedAt: s.reviewed_at
      };
    });

    // 按小队分组产出
    data.teamSubmissionMap = {};
    (data.submissionDetails || []).forEach((sub: any) => {
      const key = sub.teamName;
      if (!data.teamSubmissionMap[key]) {
        data.teamSubmissionMap[key] = [];
      }
      data.teamSubmissionMap[key].push(sub);
    });
  }

  // 9. 技能学习统计
  const { data: skillLearnings } = await client
    .from('team_skill_learnings')
    .select('id, status, skill_id, team_id')
    .limit(100);
  data.skillLearnings = skillLearnings || [];
  data.skillLearningStats = {
    completed: skillLearnings?.filter((s: any) => s.status === 'completed').length || 0,
    inProgress: skillLearnings?.filter((s: any) => s.status === 'in_progress').length || 0,
  };

  // 10. 激励发放统计
  const { data: userRewards } = await client
    .from('user_rewards')
    .select('id, reward_id, team_id, created_at')
    .limit(100);
  data.userRewards = userRewards || [];
  data.rewardCount = userRewards?.length || 0;

  // 11. 消息统计
  const { count: messageCount } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true });
  data.messageCount = messageCount || 0;

  // 12. 最后任务反馈统计
  const { data: finalTaskFeedbacks } = await client
    .from('final_task_feedbacks')
    .select('id, team_id, task_id, created_at')
    .limit(50);
  data.finalTaskFeedbacks = finalTaskFeedbacks || [];

  // 13. 获取工具和技能基础数据
  const { data: tools } = await client
    .from('tools')
    .select('id, name, category, description')
    .eq('is_active', true);
  data.tools = tools || [];

  const { data: skills } = await client
    .from('skills')
    .select('id, name, category, description')
    .eq('is_active', true);
  data.skills = skills || [];

  const { data: rewards } = await client
    .from('rewards')
    .select('id, name, type, points, icon, description')
    .eq('is_active', true);
  data.rewards = rewards || [];

  return data;
}

// 志愿者数据上下文
export async function getVolunteerContext(client: any, volunteerId: string) {
  const data: Record<string, any> = {};

  // 获取志愿者信息
  const { data: volunteer } = await client
    .from('users')
    .select('id, name, username, school_id')
    .eq('id', volunteerId)
    .single();
  data.volunteer = volunteer;

  // 获取志愿者指导的小队
  const { data: teams } = await client
    .from('teams')
    .select(`
      id, name, code, points, status, current_theme_id, current_task_id,
      created_at, next_task_deadline, cycle, assigned_volunteer_id
    `)
    .eq('assigned_volunteer_id', volunteerId)
    .eq('status', 'active');
  data.teams = teams || [];
  data.teamCount = teams?.length || 0;

  const teamIds = (teams || []).map((t: any) => t.id);

  // 获取小队可选择的主题（基于 team_theme_selections 表）
  if (teamIds.length > 0) {
    // 获取所有小队的周期和当前主题状态
    const teamCycleMap = new Map<string, { cycle: number; currentThemeId: string | null }>();
    (teams || []).forEach((t: any) => {
      teamCycleMap.set(t.id, {
        cycle: t.cycle || 1,
        currentThemeId: t.current_theme_id
      });
    });

    // 查询每个小队在当前周期的选择状态
    const selections: any[] = [];
    for (const team of (teams || [])) {
      const currentCycle = team.cycle || 1;
      const { data: selection } = await client
        .from('team_theme_selections')
        .select('team_id, theme_id, cycle, status')
        .eq('team_id', team.id)
        .eq('cycle', currentCycle)
        .maybeSingle();
      if (selection) {
        selections.push(selection);
      }
    }

    // 按小队分组选择状态
    const teamSelectionMap = new Map<string, { status: string; themeId: string }>();
    selections.forEach(s => {
      teamSelectionMap.set(s.team_id, { status: s.status, themeId: s.theme_id });
    });

    // 判断哪些小队可以重新选择主题（已完成当前周期）
    const selectableThemes: any[] = [];
    const teamsNeedingTheme: string[] = [];

    for (const team of (teams || [])) {
      const selection = teamSelectionMap.get(team.id);

      // 如果小队没有选择记录，或已完成当前周期，则可以重新选择主题
      if (!selection || selection.status === 'completed') {
        teamsNeedingTheme.push(team.name || team.code || team.id);
      }
    }

    // 如果有需要选择主题的小队，获取所有可选择的主题
    if (teamsNeedingTheme.length > 0) {
      // 获取当前志愿者所有小队所在周期已选择的主题（不能重复选择）
      const currentCycles = [...new Set((teams || []).map((t: any) => t.cycle || 1))];
      const { data: unavailableThemes } = await client
        .from('team_theme_selections')
        .select('theme_id')
        .eq('team_id', teamIds[0]) // 志愿者的小队应该在同一周期
        .in('cycle', currentCycles)
        .eq('status', 'in_progress');

      const unavailableThemeIds = new Set((unavailableThemes || []).map((t: any) => t.theme_id));

      // 获取所有活跃主题
      const { data: allThemes } = await client
        .from('task_themes')
        .select('id, name, icon, description, is_exclusive')
        .eq('is_active', true);

      // 过滤出可用主题
      data.availableThemes = (allThemes || []).filter((t: any) => !unavailableThemeIds.has(t.id));
      data.teamsNeedingTheme = teamsNeedingTheme;
    }

    // 获取小队成员
    const { data: members } = await client
      .from('team_members')
      .select('id, name, role, team_id')
      .in('team_id', teamIds);
    data.members = members || [];
    data.memberCount = members?.length || 0;

    // 获取提交产出
    const { data: submissions } = await client
      .from('task_submissions')
      .select('id, status, rating, created_at, reviewed_at, task_id, team_id')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })
      .limit(50);
    data.submissions = submissions || [];
    data.submissionStats = {
      pending: submissions?.filter((s: any) => s.status === 'pending').length || 0,
      approved: submissions?.filter((s: any) => s.status === 'approved').length || 0,
      rejected: submissions?.filter((s: any) => s.status === 'rejected').length || 0,
    };

    // 获取激励
    const { data: userRewards } = await client
      .from('user_rewards')
      .select('id, reward_id, team_id')
      .in('team_id', teamIds);
    data.userRewards = userRewards || [];
    data.rewardCount = userRewards?.length || 0;
  }

  // 获取系统工具、技能、激励数据（用于任务配置建议）
  const { data: tools } = await client
    .from('tools')
    .select('id, name, category, description')
    .eq('is_active', true);
  data.tools = tools || [];

  const { data: skills } = await client
    .from('skills')
    .select('id, name, category, description')
    .eq('is_active', true);
  data.skills = skills || [];

  const { data: rewards } = await client
    .from('rewards')
    .select('id, name, type, points, icon, description')
    .eq('is_active', true);
  data.rewards = rewards || [];

  return data;
}

// 助学老师数据上下文
export async function getTeacherContext(client: any, teacherId: string) {
  const data: Record<string, any> = {};

  // 获取老师信息
  const { data: teacher } = await client
    .from('users')
    .select('id, name, username, school_id')
    .eq('id', teacherId)
    .single();
  data.teacher = teacher;

  if (teacher?.school_id) {
    // 获取学校信息
    const { data: school } = await client
      .from('schools')
      .select('id, name, city, province')
      .eq('id', teacher.school_id)
      .single();
    data.school = school;

    // 获取本校志愿者
    const { data: volunteers } = await client
      .from('users')
      .select('id, name, username')
      .eq('role', 'volunteer')
      .eq('school_id', teacher.school_id);
    data.volunteers = volunteers || [];
    data.volunteerCount = volunteers?.length || 0;

    // 获取本校小队
    const { data: teams } = await client
      .from('teams')
      .select(`
        id, name, code, points, status, current_theme_id, current_task_id,
        assigned_volunteer_id, created_at
      `)
      .eq('school_id', teacher.school_id)
      .eq('status', 'active');
    data.teams = teams || [];
    data.teamCount = teams?.length || 0;

    const teamIds = (teams || []).map((t: any) => t.id);

    if (teamIds.length > 0) {
      // 获取小队成员
      const { count: memberCount } = await client
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .in('team_id', teamIds);
      data.memberCount = memberCount || 0;

      // 获取提交产出
      const { data: submissions } = await client
        .from('task_submissions')
        .select('id, status, rating, created_at, task_id, team_id')
        .in('team_id', teamIds)
        .order('created_at', { ascending: false })
        .limit(50);
      data.submissions = submissions || [];
      data.submissionStats = {
        pending: submissions?.filter((s: any) => s.status === 'pending').length || 0,
        approved: submissions?.filter((s: any) => s.status === 'approved').length || 0,
      };
    }
  }

  return data;
}

/**
 * 按需上下文加载 — 根据意图类型只加载相关数据
 * 减少不必要的数据库查询，提升响应速度
 */
export async function getIntentAwareContext(
  client: any,
  userId: string,
  userRole: string,
  intentType: string
): Promise<Record<string, any>> {
  // 对于执行型和查询型，加载完整上下文（需要全面数据支持决策）
  if (intentType === 'execution' || intentType === 'multi_step' || intentType === 'query') {
    return await getAdminDataContext(client, userId, userRole);
  }
  
  // 对于导航型和确认型，只加载轻量上下文
  if (intentType === 'navigation' || intentType === 'confirmation') {
    const data: Record<string, any> = {};
    
    try {
      if (userRole === 'admin' || userRole === 'super_admin') {
        // 管理员：只加载统计摘要
        const { count: schoolCount } = await client.from('schools').select('*', { count: 'exact', head: true });
        const { count: teamCount } = await client.from('teams').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const { count: volunteerCount } = await client.from('users').select('*', { count: 'exact', head: true }).eq('role', 'volunteer');
        data.schoolCount = schoolCount || 0;
        data.teamCount = teamCount || 0;
        data.volunteerCount = volunteerCount || 0;
      } else if (userRole === 'volunteer') {
        const { data: teams } = await client
          .from('teams')
          .select('id, name, code, points')
          .eq('assigned_volunteer_id', userId)
          .eq('status', 'active');
        data.teams = teams || [];
        data.teamCount = teams?.length || 0;
      } else if (userRole === 'teacher') {
        const { data: user } = await client
          .from('users')
          .select('school_id')
          .eq('id', userId)
          .single();
        if (user?.school_id) {
          const { data: teams } = await client
            .from('teams')
            .select('id, name, code, points')
            .eq('school_id', user.school_id)
            .eq('status', 'active');
          data.teams = teams || [];
          data.teamCount = teams?.length || 0;
        }
      }
    } catch (error) {
      console.error('[上下文构建] 轻量上下文加载失败:', error);
    }
    
    return data;
  }
  
  // 对于开放型，加载中等量上下文（需要数据支持创意建议）
  if (intentType === 'creative') {
    const fullContext = await getAdminDataContext(client, userId, userRole);
    // 只保留核心数据，移除详细列表
    const lightContext: Record<string, any> = {
      schoolCount: fullContext.schoolCount,
      teamCount: fullContext.teamCount,
      volunteerCount: fullContext.volunteerCount,
      teacherCount: fullContext.teacherCount,
      themeCount: fullContext.themeCount,
      taskCount: fullContext.taskCount,
      submissionStats: fullContext.submissionStats,
      themes: fullContext.themes,
      teams: fullContext.teams?.slice(0, 10), // 最多10个小队
    };
    return lightContext;
  }
  
  // 默认：加载完整上下文
  return await getAdminDataContext(client, userId, userRole);
}

// 家长数据上下文
export async function getParentContext(client: any, parentId: string) {
  const data: Record<string, any> = {};

  try {
    // 获取家长信息
    const { data: parent } = await client
      .from('parents')
      .select('id, name, phone, school_name')
      .eq('id', parentId)
      .single();
    data.parent = parent;

    // 获取家长关注的小队（只获取已审核通过的）
    const { data: follows } = await client
      .from('parent_team_follows')
      .select(`
        id,
        child_name,
        child_grade,
        relation,
        school_id,
        school_name,
        team_id,
        status,
        is_active,
        followed_at
      `)
      .eq('parent_id', parentId)
      .eq('is_active', true)
      .eq('status', 'approved')
      .order('followed_at', { ascending: false });

    if (!follows || follows.length === 0) {
      return data;
    }

    const teamIds = follows.map((f: any) => f.team_id);

    // 获取关注的小队信息
    const { data: teams } = await client
      .from('teams')
      .select(`
        id, name, code, points, slogan, status,
        current_theme_id, current_task_id, cycle,
        school_id
      `)
      .in('id', teamIds)
      .eq('status', 'active');

    data.teams = teams || [];

    // 获取小队成员
    if (teamIds.length > 0) {
      const { data: members } = await client
        .from('team_members')
        .select('id, name, role, team_id')
        .in('team_id', teamIds);
      data.members = members || [];

      // 获取小队当前任务
      const currentTaskIds = (teams || [])
        .filter((t: any) => t.current_task_id)
        .map((t: any) => t.current_task_id);

      if (currentTaskIds.length > 0) {
        const { data: tasks } = await client
          .from('tasks')
          .select('id, title, stage, description, points')
          .in('id', currentTaskIds);

        data.currentTasks = tasks || [];
        data.tasksMap = {};
        (tasks || []).forEach((t: any) => {
          data.tasksMap[t.id] = t;
        });
      }

      // 获取小队主题
      const themeIds = (teams || [])
        .filter((t: any) => t.current_theme_id)
        .map((t: any) => t.current_theme_id);

      if (themeIds.length > 0) {
        const { data: themes } = await client
          .from('task_themes')
          .select('id, name, icon, description')
          .in('id', themeIds);

        data.themesMap = {};
        (themes || []).forEach((t: any) => {
          data.themesMap[t.id] = t;
        });
      }

      // 获取任务提交统计
      const { data: submissions } = await client
        .from('task_submissions')
        .select('id, team_id, status, rating, points_earned, created_at, task_id')
        .in('team_id', teamIds)
        .order('created_at', { ascending: false });

      data.submissions = submissions || [];

      // 按小队统计
      data.submissionStats = {};
      (submissions || []).forEach((s: any) => {
        if (!data.submissionStats[s.team_id]) {
          data.submissionStats[s.team_id] = {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            totalPoints: 0
          };
        }
        data.submissionStats[s.team_id].total++;
        data.submissionStats[s.team_id][s.status]++;
        if (s.points_earned) {
          data.submissionStats[s.team_id].totalPoints += s.points_earned;
        }
      });

      // 获取已完成的主题（从 team_theme_selections）
      const { data: completions } = await client
        .from('team_theme_selections')
        .select('team_id, theme_id, cycle, status, completed_at')
        .in('team_id', teamIds)
        .eq('status', 'completed');
      data.completions = completions || [];

      // 获取激励物品
      const { data: rewards } = await client
        .from('user_rewards')
        .select('id, team_id, reward_id, earned_at')
        .in('team_id', teamIds)
        .order('earned_at', { ascending: false })
        .limit(20);
      data.rewards = rewards || [];
    }

    // 整理关注信息（包含孩子姓名等）
    data.follows = follows.map((f: any) => {
      const team = (teams || []).find((t: any) => t.id === f.team_id);
      const members = (data.members || []).filter((m: any) => m.team_id === f.team_id);
      const stats = data.submissionStats?.[f.team_id] || {};
      const theme = data.themesMap?.[team?.current_theme_id];
      const task = data.tasksMap?.[team?.current_task_id];

      return {
        id: f.id,
        childName: f.child_name,
        childGrade: f.child_grade,
        relation: f.relation,
        teamName: team?.name || '未知小队',
        teamSlogan: team?.slogan || '',
        teamPoints: team?.points || 0,
        teamCycle: team?.cycle || 1,
        currentTheme: theme?.name || '暂无主题',
        currentTask: task?.title || '暂无任务',
        currentStage: task?.stage || 0,
        members: members,
        submissions: stats,
        schoolName: f.school_name || ''
      };
    });

  } catch (error) {
    console.error('[蜡象助手] 获取家长数据上下文失败:', error);
  }

  return data;
}
