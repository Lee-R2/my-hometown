import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

/**
 * 智能体数据上下文 API
 * 为蜡象助手提供各角色的实时数据，支持回答关于各功能页面的问题
 */

export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const userRole = searchParams.get('userRole');
    const teamId = searchParams.get('teamId'); // 小队端使用
    
    const client = getSupabaseAdminClient();

    // 小队端数据上下文（银蛇博士使用）
    if (teamId && !userId) {
      return await getTeamContext(client, teamId);
    }

    // 管理员端数据上下文（蜡象助手使用）
    if (!userId || !userRole) {
      return ApiErrors.validation('缺少用户信息');
    }

    // 根据角色获取不同的数据上下文
    if (userRole === 'admin' || userRole === 'super_admin') {
      return await getAdminContext(client);
    } else if (userRole === 'volunteer') {
      return await getVolunteerContext(client, userId);
    } else if (userRole === 'teacher') {
      return await getTeacherContext(client, userId);
    }

    return ApiErrors.validation('未知角色');
  } catch (error) {
    console.error('获取智能体数据上下文错误:', error);
    return ApiErrors.validation('获取数据失败');
  }
}

// ==================== 超级管理员数据上下文 ====================
async function getAdminContext(client: any) {
  // ===== 1. 任务管理数据 =====
  const { data: themes } = await client
    .from('task_themes')
    .select('id, name, description, icon, is_exclusive, school_id, created_at')
    .order('created_at', { ascending: false });

  const { data: tasks } = await client
    .from('tasks')
    .select('id, title, description, stage, points, task_type, theme_id, is_active')
    .order('created_at', { ascending: false });

  // 统计任务状态
  const tasksStats = {
    total: tasks?.length || 0,
    active: tasks?.filter((t: any) => t.is_active).length || 0,
    inactive: tasks?.filter((t: any) => !t.is_active).length || 0,
    mainTasks: tasks?.filter((t: any) => t.task_type === 'main').length || 0,
    sideTasks: tasks?.filter((t: any) => t.task_type === 'side').length || 0,
    finalTasks: tasks?.filter((t: any) => t.task_type === 'final').length || 0,
  };

  // ===== 2. 最后任务数据 =====
  const { data: finalTaskForms } = await client
    .from('final_task_forms')
    .select('id, name, description, is_global, school_id, created_at')
    .order('created_at', { ascending: false });

  const finalTasksStats = {
    total: finalTaskForms?.length || 0,
    global: finalTaskForms?.filter((f: any) => f.is_global).length || 0,
    school: finalTaskForms?.filter((f: any) => !f.is_global).length || 0,
  };

  // ===== 3. 小队管理数据 =====
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id, name, code, points, status, current_theme_id, current_task_id, school_id, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (teamsError) {
    console.error('获取小队数据错误:', teamsError);
  }

  // 获取学校名称映射
  const schoolIds = [...new Set((teams || []).map((t: any) => t.school_id).filter(Boolean))];
  let schoolsMap: Record<string, string> = {};
  if (schoolIds.length > 0) {
    const { data: schoolsData } = await client
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);
    (schoolsData || []).forEach((s: any) => {
      schoolsMap[s.id] = s.name;
    });
  }

  // 组装小队数据
  const teamsWithSchool = (teams || []).map((t: any) => ({
    ...t,
    schoolName: schoolsMap[t.school_id] || null,
  }));

  // 获取小队成员统计
  const { count: totalStudents } = await client
    .from('team_members')
    .select('*', { count: 'exact', head: true });

  // ===== 4. 产出审核数据 =====
  const { count: pendingSubmissions } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: approvedSubmissions } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');

  const { count: rejectedSubmissions } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'rejected');

  // 最近待审核产出
  const { data: recentPendingSubmissions } = await client
    .from('task_submissions')
    .select('id, team_id, task_id, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  // 获取待审核产出对应的小队名称
  const pendingTeamIds = [...new Set((recentPendingSubmissions || []).map((s: any) => s.team_id).filter(Boolean))];
  let pendingTeamsMap: Record<string, string> = {};
  if (pendingTeamIds.length > 0) {
    const { data: pendingTeams } = await client
      .from('teams')
      .select('id, name')
      .in('id', pendingTeamIds);
    (pendingTeams || []).forEach((t: any) => {
      pendingTeamsMap[t.id] = t.name;
    });
  }

  // 获取待审核产出对应的任务信息
  const pendingTaskIds = [...new Set((recentPendingSubmissions || []).map((s: any) => s.task_id).filter(Boolean))];
  let pendingTasksMap: Record<string, any> = {};
  if (pendingTaskIds.length > 0) {
    const { data: pendingTasks } = await client
      .from('tasks')
      .select('id, title, stage')
      .in('id', pendingTaskIds);
    (pendingTasks || []).forEach((t: any) => {
      pendingTasksMap[t.id] = t;
    });
  }

  // ===== 5. 项目小学数据 =====
  const { data: schools } = await client
    .from('schools')
    .select('id, name, province, city, county, address, teacher_name, teacher_phone')
    .order('created_at', { ascending: false });

  // ===== 6. 志愿者数据 =====
  const { data: volunteers } = await client
    .from('users')
    .select('id, name, username, school_id, created_at')
    .eq('role', 'volunteer')
    .order('created_at', { ascending: false });

  // ===== 7. 工具管理数据 =====
  const { data: tools } = await client
    .from('tools')
    .select('id, name, description, category, rarity, is_active')
    .order('created_at', { ascending: false });

  const toolsStats = {
    total: tools?.length || 0,
    active: tools?.filter((t: any) => t.is_active).length || 0,
  };

  // ===== 8. 技能学习数据 =====
  const { data: skills } = await client
    .from('skills')
    .select('id, name, description, category, rarity, is_active')
    .order('created_at', { ascending: false });

  const skillsStats = {
    total: skills?.length || 0,
    active: skills?.filter((s: any) => s.is_active).length || 0,
  };

  // ===== 9. 消息管理数据 =====
  const { count: totalMessages } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true });

  const { count: unreadMessages } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  // ===== 10. 激励配置数据 =====
  const { data: rewards } = await client
    .from('rewards')
    .select('id, name, description, type, points, rarity, is_active')
    .order('created_at', { ascending: false });

  const rewardsStats = {
    total: rewards?.length || 0,
    active: rewards?.filter((r: any) => r.is_active).length || 0,
    byType: {
      badge: rewards?.filter((r: any) => r.type === 'badge').length || 0,
      gem: rewards?.filter((r: any) => r.type === 'gem').length || 0,
      skill_card: rewards?.filter((r: any) => r.type === 'skill_card').length || 0,
      tool_card: rewards?.filter((r: any) => r.type === 'tool_card').length || 0,
      achievement: rewards?.filter((r: any) => r.type === 'achievement').length || 0,
    },
  };

  // ===== 11. 反馈查看数据 =====
  const { count: totalFeedbacks } = await client
    .from('feedback_submissions')
    .select('*', { count: 'exact', head: true });

  // 最近反馈
  const { data: recentFeedbacks } = await client
    .from('feedback_submissions')
    .select('id, team_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  // 获取反馈对应的小队名称
  const feedbackTeamIds = [...new Set((recentFeedbacks || []).map((f: any) => f.team_id).filter(Boolean))];
  let feedbackTeamsMap: Record<string, string> = {};
  if (feedbackTeamIds.length > 0) {
    const { data: feedbackTeams } = await client
      .from('teams')
      .select('id, name')
      .in('id', feedbackTeamIds);
    (feedbackTeams || []).forEach((t: any) => {
      feedbackTeamsMap[t.id] = t.name;
    });
  }

  return NextResponse.json({
    success: true,
    context: {
      role: '超级管理员',
      
      // 任务管理
      tasksManagement: {
        themes: themes?.slice(0, 10) || [],
        themesCount: themes?.length || 0,
        tasks: tasks?.slice(0, 20) || [],
        tasksStats,
      },
      
      // 最后任务
      finalTasks: {
        forms: finalTaskForms?.slice(0, 10) || [],
        stats: finalTasksStats,
      },
      
      // 小队管理
      teamsManagement: {
        teams: teamsWithSchool?.slice(0, 20).map((t: any) => ({
          id: t.id,
          name: t.name,
          code: t.code,
          points: t.points,
          status: t.status,
          schoolName: t.schoolName,
          currentThemeId: t.current_theme_id,
          currentTaskId: t.current_task_id,
          createdAt: t.created_at,
        })) || [],
        teamsCount: teamsWithSchool?.length || 0,
        totalStudents: totalStudents || 0,
      },
      
      // 产出审核
      submissionsManagement: {
        pending: pendingSubmissions || 0,
        approved: approvedSubmissions || 0,
        rejected: rejectedSubmissions || 0,
        recentPending: recentPendingSubmissions?.map((s: any) => ({
          id: s.id,
          teamName: pendingTeamsMap[s.team_id],
          taskTitle: pendingTasksMap[s.task_id]?.title,
          stage: pendingTasksMap[s.task_id]?.stage,
          createdAt: s.created_at,
        })) || [],
      },
      
      // 项目小学
      schoolsManagement: {
        schools: schools?.slice(0, 20) || [],
        schoolsCount: schools?.length || 0,
      },
      
      // 志愿者
      volunteersManagement: {
        volunteers: volunteers?.slice(0, 20) || [],
        volunteersCount: volunteers?.length || 0,
      },
      
      // 工具管理
      toolsManagement: {
        tools: tools?.slice(0, 20) || [],
        stats: toolsStats,
      },
      
      // 技能学习
      skillsManagement: {
        skills: skills?.slice(0, 20) || [],
        stats: skillsStats,
      },
      
      // 消息管理
      messagesManagement: {
        total: totalMessages || 0,
        unread: unreadMessages || 0,
      },
      
      // 激励配置
      rewardsManagement: {
        rewards: rewards?.slice(0, 20) || [],
        stats: rewardsStats,
      },
      
      // 反馈查看
      feedbackManagement: {
        total: totalFeedbacks || 0,
        recent: recentFeedbacks?.map((f: any) => ({
          id: f.id,
          teamName: feedbackTeamsMap[f.team_id],
          createdAt: f.created_at,
        })) || [],
      },
    },
  });
}

// ==================== 志愿者数据上下文 ====================
async function getVolunteerContext(client: any, volunteerId: string) {
  // 获取志愿者信息
  const { data: volunteer, error: volunteerError } = await client
    .from('users')
    .select('id, name, username, school_id')
    .eq('id', volunteerId)
    .maybeSingle();

  if (volunteerError) {
    console.error('获取志愿者信息错误:', volunteerError);
  }

  // 获取志愿者负责的小队（通过assigned_volunteer_id关联）
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id, name, code, points, current_theme_id, current_task_id, created_at, status, school_id, assigned_volunteer_id')
    .eq('assigned_volunteer_id', volunteerId)
    .order('created_at', { ascending: false });

  if (teamsError) {
    console.error('获取志愿者小队错误:', teamsError);
  }

  // 获取学校名称映射
  const schoolIds = [...new Set((teams || []).map((t: any) => t.school_id).filter(Boolean))];
  let schoolsMap: Record<string, string> = {};
  if (schoolIds.length > 0) {
    const { data: schools } = await client
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);
    (schools || []).forEach((s: any) => {
      schoolsMap[s.id] = s.name;
    });
  }

  // 组装小队数据
  const teamsWithSchool = (teams || []).map((t: any) => ({
    ...t,
    schoolName: schoolsMap[t.school_id] || null,
  }));

  const teamIds = (teams || []).map((t: any) => t.id);

  // ===== 1. 任务管理（只读）=====
  const { data: themes } = await client
    .from('task_themes')
    .select('id, name, description, icon')
    .eq('is_exclusive', false) // 全局主题
    .order('created_at', { ascending: false });

  // ===== 2. 最后任务（只读）=====
  const { data: finalTaskForms } = await client
    .from('final_task_forms')
    .select('id, name, description')
    .eq('is_global', true);

  // ===== 3. 小队管理 =====
  // 获取小队成员统计
  let totalStudents = 0;
  if (teamIds.length > 0) {
    const { count } = await client
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .in('team_id', teamIds);
    totalStudents = count || 0;
  }

  // ===== 4. 产出审核 =====
  let pendingSubmissions = 0, approvedSubmissions = 0, rejectedSubmissions = 0;
  let recentPendingSubmissions: any[] = [];
  
  if (teamIds.length > 0) {
    const { count: pending } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('team_id', teamIds);
    pendingSubmissions = pending || 0;

    const { count: approved } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .in('team_id', teamIds);
    approvedSubmissions = approved || 0;

    const { count: rejected } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected')
      .in('team_id', teamIds);
    rejectedSubmissions = rejected || 0;

    // 最近待审核产出（不使用join，手动查询关联数据）
    const { data: pendingData } = await client
      .from('task_submissions')
      .select('id, team_id, task_id, created_at')
      .eq('status', 'pending')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // 获取待审核产出对应的小队名称
    const pendingTeamIds = [...new Set((pendingData || []).map((s: any) => s.team_id).filter(Boolean))];
    let pendingTeamsMap: Record<string, string> = {};
    if (pendingTeamIds.length > 0) {
      const { data: pendingTeams } = await client
        .from('teams')
        .select('id, name')
        .in('id', pendingTeamIds);
      (pendingTeams || []).forEach((t: any) => {
        pendingTeamsMap[t.id] = t.name;
      });
    }
    
    // 获取待审核产出对应的任务信息
    const pendingTaskIds = [...new Set((pendingData || []).map((s: any) => s.task_id).filter(Boolean))];
    let pendingTasksMap: Record<string, any> = {};
    if (pendingTaskIds.length > 0) {
      const { data: pendingTasks } = await client
        .from('tasks')
        .select('id, title, stage')
        .in('id', pendingTaskIds);
      (pendingTasks || []).forEach((t: any) => {
        pendingTasksMap[t.id] = t;
      });
    }
    
    recentPendingSubmissions = (pendingData || []).map((s: any) => ({
      ...s,
      teamName: pendingTeamsMap[s.team_id],
      taskTitle: pendingTasksMap[s.task_id]?.title,
      taskStage: pendingTasksMap[s.task_id]?.stage,
    }));
  }

  // ===== 5. 项目小学（只读）=====
  let schoolInfo = null;
  if (volunteer?.school_id) {
    const { data: school } = await client
      .from('schools')
      .select('id, name, province, city, county, address')
      .eq('id', volunteer.school_id)
      .single();
    schoolInfo = school;
  }

  // ===== 6. 工具管理（只读）=====
  const { data: tools } = await client
    .from('tools')
    .select('id, name, description, category')
    .eq('is_active', true)
    .limit(20);

  // ===== 7. 技能学习（只读）=====
  const { data: skills } = await client
    .from('skills')
    .select('id, name, description, category')
    .eq('is_active', true)
    .limit(20);

  // ===== 8. 消息管理 =====
  const { count: receivedMessages } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', volunteerId);

  const { count: unreadMessages } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', volunteerId)
    .eq('is_read', false);

  // ===== 9. 激励配置（只读）=====
  const { data: rewards } = await client
    .from('rewards')
    .select('id, name, description, type, rarity')
    .eq('is_active', true)
    .limit(20);

  // ===== 10. 反馈查看（不使用join，手动查询）=====
  let feedbacks: any[] = [];
  if (teamIds.length > 0) {
    const { data: fb } = await client
      .from('feedback_submissions')
      .select('id, team_id, created_at')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // 获取反馈对应的小队名称
    const fbTeamIds = [...new Set((fb || []).map((f: any) => f.team_id).filter(Boolean))];
    let fbTeamsMap: Record<string, string> = {};
    if (fbTeamIds.length > 0) {
      const { data: fbTeams } = await client
        .from('teams')
        .select('id, name')
        .in('id', fbTeamIds);
      (fbTeams || []).forEach((t: any) => {
        fbTeamsMap[t.id] = t.name;
      });
    }
    
    feedbacks = (fb || []).map((f: any) => ({
      ...f,
      teamName: fbTeamsMap[f.team_id],
    }));
  }

  // ===== 11. 小队详细进度（批量查询，避免N+1）=====
  const progressTeams = (teams || []).slice(0, 5).filter((t: any) => t.current_theme_id);
  const progressThemeIds = [...new Set(progressTeams.map((t: any) => t.current_theme_id))];
  const progressTaskIds = [...new Set(progressTeams.map((t: any) => t.current_task_id).filter(Boolean))];

  let progressThemesMap: Record<string, any> = {};
  if (progressThemeIds.length > 0) {
    const { data: progressThemes } = await client
      .from('task_themes')
      .select('id, name, icon')
      .in('id', progressThemeIds);
    (progressThemes || []).forEach((t: any) => { progressThemesMap[t.id] = t; });
  }

  let progressTasksMap: Record<string, any> = {};
  if (progressTaskIds.length > 0) {
    const { data: progressTasks } = await client
      .from('tasks')
      .select('id, title, stage')
      .in('id', progressTaskIds);
    (progressTasks || []).forEach((t: any) => { progressTasksMap[t.id] = t; });
  }

  const teamProgress = progressTeams.map((team: any) => ({
    teamId: team.id,
    teamName: team.name,
    points: team.points,
    currentTheme: progressThemesMap[team.current_theme_id] || null,
    currentTask: team.current_task_id ? progressTasksMap[team.current_task_id] || null : null,
  }));

  // 获取学校名称
  let schoolName = schoolInfo?.name || '';
  
  return NextResponse.json({
    success: true,
    context: {
      role: '授课志愿者',
      volunteerName: volunteer?.name || '',
      schoolName,
      
      // 任务管理
      tasksManagement: {
        themes: themes || [],
        themesCount: themes?.length || 0,
      },
      
      // 最后任务
      finalTasks: {
        forms: finalTaskForms || [],
      },
      
      // 小队管理
      teamsManagement: {
        teams: teamsWithSchool?.map((t: any) => ({
          id: t.id,
          name: t.name,
          code: t.code,
          points: t.points,
          status: t.status,
          schoolName: t.schoolName,
          currentThemeId: t.current_theme_id,
          currentTaskId: t.current_task_id,
          createdAt: t.created_at,
        })) || [],
        teamsCount: teamsWithSchool?.length || 0,
        totalStudents,
      },
      
      // 产出审核
      submissionsManagement: {
        pending: pendingSubmissions,
        approved: approvedSubmissions,
        rejected: rejectedSubmissions,
        recentPending: recentPendingSubmissions.map((s: any) => ({
          id: s.id,
          teamName: s.teamName,
          taskTitle: s.taskTitle,
          stage: s.taskStage,
          createdAt: s.created_at,
        })),
      },
      
      // 项目小学
      schoolsManagement: {
        school: schoolInfo,
      },
      
      // 工具管理
      toolsManagement: {
        tools: tools || [],
      },
      
      // 技能学习
      skillsManagement: {
        skills: skills || [],
      },
      
      // 消息管理
      messagesManagement: {
        received: receivedMessages || 0,
        unread: unreadMessages || 0,
      },
      
      // 激励配置
      rewardsManagement: {
        rewards: rewards || [],
      },
      
      // 反馈查看
      feedbackManagement: {
        feedbacks: feedbacks.map((f: any) => ({
          id: f.id,
          teamName: f.teamName,
          createdAt: f.created_at,
        })),
      },
      
      // 小队进度
      teamProgress,
    },
  });
}

// ==================== 助学老师数据上下文 ====================
async function getTeacherContext(client: any, teacherId: string) {
  // 获取老师信息
  const { data: teacher, error: teacherError } = await client
    .from('users')
    .select('id, name, username, school_id, student_count')
    .eq('id', teacherId)
    .maybeSingle();

  if (teacherError) {
    console.error('获取助学老师信息错误:', teacherError);
  }

  // 获取学校信息
  let schoolInfo = null;
  if (teacher?.school_id) {
    const { data: school } = await client
      .from('schools')
      .select('id, name, province, city, county, address, teacher_name, teacher_phone')
      .eq('id', teacher.school_id)
      .maybeSingle();
    schoolInfo = school;
  }

  // 获取老师对接的小队（不使用join）
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id, name, code, points, current_theme_id, current_task_id, created_at, status, assigned_volunteer_id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (teamsError) {
    console.error('获取助学老师对接小队错误:', teamsError);
  }

  // 获取志愿者名称映射
  const volunteerIds = [...new Set((teams || []).map((t: any) => t.assigned_volunteer_id).filter(Boolean))];
  let volunteersMap: Record<string, string> = {};
  if (volunteerIds.length > 0) {
    const { data: volunteers } = await client
      .from('users')
      .select('id, name')
      .in('id', volunteerIds);
    (volunteers || []).forEach((v: any) => {
      volunteersMap[v.id] = v.name;
    });
  }

  // 组装小队数据
  const teamsWithVolunteer = (teams || []).map((t: any) => ({
    ...t,
    volunteerName: volunteersMap[t.assigned_volunteer_id] || null,
  }));

  const teamIds = (teams || []).map((t: any) => t.id);

  // ===== 1. 任务管理（只读）=====
  const { data: themes } = await client
    .from('task_themes')
    .select('id, name, description, icon')
    .eq('is_exclusive', false)
    .order('created_at', { ascending: false });

  // ===== 2. 小队管理 =====
  let totalStudents = 0;
  if (teamIds.length > 0) {
    const { count } = await client
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .in('team_id', teamIds);
    totalStudents = count || 0;
  }

  // ===== 3. 产出审核（只读）=====
  let pendingSubmissions = 0, approvedSubmissions = 0, rejectedSubmissions = 0;
  if (teamIds.length > 0) {
    const { count: pending } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('team_id', teamIds);
    pendingSubmissions = pending || 0;

    const { count: approved } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .in('team_id', teamIds);
    approvedSubmissions = approved || 0;

    const { count: rejected } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected')
      .in('team_id', teamIds);
    rejectedSubmissions = rejected || 0;
  }

  // ===== 4. 志愿者（只读）=====
  // 获取对接的志愿者
  const { data: linkedVolunteers } = await client
    .from('users')
    .select('id, name, username')
    .eq('role', 'volunteer')
    .eq('linked_teacher_id', teacherId);

  // 本校所有志愿者
  let schoolVolunteers: any[] = [];
  if (teacher?.school_id) {
    const { data: sv } = await client
      .from('users')
      .select('id, name, username')
      .eq('role', 'volunteer')
      .eq('school_id', teacher.school_id);
    schoolVolunteers = sv || [];
  }

  // ===== 5. 工具管理（只读）=====
  const { data: tools } = await client
    .from('tools')
    .select('id, name, description, category')
    .eq('is_active', true)
    .limit(20);

  // ===== 6. 技能学习（只读）=====
  const { data: skills } = await client
    .from('skills')
    .select('id, name, description, category')
    .eq('is_active', true)
    .limit(20);

  // ===== 7. 消息管理 =====
  const { count: receivedMessages } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', teacherId);

  const { count: unreadMessages } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', teacherId)
    .eq('is_read', false);

  // ===== 8. 小队详细进度（批量查询，避免N+1）=====
  const progressTeams = (teamsWithVolunteer || []).slice(0, 5).filter((t: any) => t.current_theme_id);
  const progressThemeIds = [...new Set(progressTeams.map((t: any) => t.current_theme_id))];

  let progressThemesMap: Record<string, any> = {};
  if (progressThemeIds.length > 0) {
    const { data: progressThemes } = await client
      .from('task_themes')
      .select('id, name, icon')
      .in('id', progressThemeIds);
    (progressThemes || []).forEach((t: any) => { progressThemesMap[t.id] = t; });
  }

  const teamProgress = progressTeams.map((team: any) => ({
    teamId: team.id,
    teamName: team.name,
    points: team.points,
    volunteerName: team.volunteerName,
    currentTheme: progressThemesMap[team.current_theme_id] || null,
  }));

  return NextResponse.json({
    success: true,
    context: {
      role: '助学老师',
      teacherName: teacher?.name || '',
      schoolName: schoolInfo?.name || '',
      studentCount: teacher?.student_count || 0,
      
      // 学校信息
      schoolInfo,
      
      // 任务管理
      tasksManagement: {
        themes: themes || [],
        themesCount: themes?.length || 0,
      },
      
      // 小队管理
      teamsManagement: {
        teams: teamsWithVolunteer?.map((t: any) => ({
          id: t.id,
          name: t.name,
          code: t.code,
          points: t.points,
          status: t.status,
          volunteerName: t.volunteerName,
          currentThemeId: t.current_theme_id,
          currentTaskId: t.current_task_id,
          createdAt: t.created_at,
        })) || [],
        teamsCount: teamsWithVolunteer?.length || 0,
        totalStudents,
      },
      
      // 产出审核
      submissionsManagement: {
        pending: pendingSubmissions,
        approved: approvedSubmissions,
        rejected: rejectedSubmissions,
      },
      
      // 志愿者
      volunteersManagement: {
        linkedVolunteers: linkedVolunteers || [],
        schoolVolunteers: schoolVolunteers.slice(0, 10),
        linkedCount: linkedVolunteers?.length || 0,
      },
      
      // 工具管理
      toolsManagement: {
        tools: tools || [],
      },
      
      // 技能学习
      skillsManagement: {
        skills: skills || [],
      },
      
      // 消息管理
      messagesManagement: {
        received: receivedMessages || 0,
        unread: unreadMessages || 0,
      },
      
      // 小队进度
      teamProgress,
    },
  });
}

// ==================== 小队端数据上下文（银蛇博士使用）====================
async function getTeamContext(client: any, teamId: string) {
  try {
    // 获取小队基本信息
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, name, code, points, current_theme_id, current_task_id, next_task_deadline, created_at, school_id, assigned_volunteer_id')
      .eq('id', teamId)
      .maybeSingle();

    if (teamError) {
      console.error('获取小队数据错误:', teamError);
      return supabaseErrorResponse(teamError, '获取小队数据失败');
    }

    if (!team) {
      return ApiErrors.notFound('小队不存在');
    }
    
    // 获取学校信息
    let schoolData = null;
    if (team.school_id) {
      const { data: school } = await client
        .from('schools')
        .select('name, province, city, county')
        .eq('id', team.school_id)
        .maybeSingle();
      schoolData = school;
    }
    
    // 获取志愿者信息
    let volunteerName = '';
    if (team.assigned_volunteer_id) {
      const { data: volunteer } = await client
        .from('users')
        .select('name')
        .eq('id', team.assigned_volunteer_id)
        .maybeSingle();
      volunteerName = volunteer?.name || '';
    }

    // 获取小队成员
    const { data: members } = await client
      .from('team_members')
      .select('id, name, role')
      .eq('team_id', teamId);

    // 获取当前主题
    let currentTheme: any = null;
    let tasks: any[] = [];
    let currentTask: any = null;
    let currentTaskTools: any[] = [];
    let currentTaskSkills: any[] = [];
    
    if (team.current_theme_id) {
      const { data: theme } = await client
        .from('task_themes')
        .select('id, name, description, icon')
        .eq('id', team.current_theme_id)
        .single();
      currentTheme = theme;

      // 获取主题下的所有任务
      const { data: themeTasks } = await client
        .from('tasks')
        .select('id, title, description, stage, points, task_type, requirements')
        .eq('theme_id', team.current_theme_id)
        .eq('is_active', true)
        .order('stage', { ascending: true });
      tasks = themeTasks || [];

      // 获取当前任务详情
      if (team.current_task_id) {
        const { data: task } = await client
          .from('tasks')
          .select('id, title, description, stage, points, requirements, learning_goals')
          .eq('id', team.current_task_id)
          .single();
        currentTask = task;

        // 获取当前任务的工具（不使用join，手动查询）
        const { data: taskTools } = await client
          .from('task_tools')
          .select('id, tool_id, is_required')
          .eq('task_id', team.current_task_id);
        
        // 获取工具详情
        const toolIds = [...new Set((taskTools || []).map((tt: any) => tt.tool_id).filter(Boolean))];
        let toolsMap: Record<string, any> = {};
        if (toolIds.length > 0) {
          const { data: toolsData } = await client
            .from('tools')
            .select('id, name, description, icon, category')
            .in('id', toolIds);
          (toolsData || []).forEach((t: any) => {
            toolsMap[t.id] = t;
          });
        }
        currentTaskTools = (taskTools || []).map((tt: any) => ({
          ...tt,
          toolDetail: toolsMap[tt.tool_id],
        }));

        // 获取当前任务的技能（不使用join，手动查询）
        const { data: taskSkills } = await client
          .from('task_skills')
          .select('id, skill_id, points, is_required')
          .eq('task_id', team.current_task_id);
        
        // 获取技能详情
        const skillIds = [...new Set((taskSkills || []).map((ts: any) => ts.skill_id).filter(Boolean))];
        let skillsMap: Record<string, any> = {};
        if (skillIds.length > 0) {
          const { data: skillsData } = await client
            .from('skills')
            .select('id, name, description, icon, category, content')
            .in('id', skillIds);
          (skillsData || []).forEach((s: any) => {
            skillsMap[s.id] = s;
          });
        }
        currentTaskSkills = (taskSkills || []).map((ts: any) => ({
          ...ts,
          skillDetail: skillsMap[ts.skill_id],
        }));
      }
    }

    // 获取小队技能学习状态
    const { data: skillLearnings } = await client
      .from('team_skill_learnings')
      .select('id, status, points_earned, skill_id, task_id')
      .eq('team_id', teamId);

    // 获取产出提交记录（不使用join，手动查询）
    const { data: submissions } = await client
      .from('task_submissions')
      .select('id, status, rating, points_earned, created_at, reviewed_at, task_id')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // 获取提交对应的任务信息
    const submissionTaskIds = [...new Set((submissions || []).map((s: any) => s.task_id).filter(Boolean))];
    let submissionTasksMap: Record<string, any> = {};
    if (submissionTaskIds.length > 0) {
      const { data: submissionTasks } = await client
        .from('tasks')
        .select('id, title, stage, points')
        .in('id', submissionTaskIds);
      (submissionTasks || []).forEach((t: any) => {
        submissionTasksMap[t.id] = t;
      });
    }

    // 统计产出
    const { count: pendingCount } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'pending');

    const { count: approvedCount } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'approved');

    // 获取已获得的奖励（不使用join，手动查询）
    const { data: userRewards } = await client
      .from('user_rewards')
      .select('id, reward_id, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    
    // 获取奖励详情
    const rewardIds = [...new Set((userRewards || []).map((ur: any) => ur.reward_id).filter(Boolean))];
    let rewardsMap: Record<string, any> = {};
    if (rewardIds.length > 0) {
      const { data: rewardsData } = await client
        .from('rewards')
        .select('id, name, description, icon, type, points')
        .in('id', rewardIds);
      (rewardsData || []).forEach((r: any) => {
        rewardsMap[r.id] = r;
      });
    }

    // 获取爱心宝石统计（从 teams 表读取权威值）
    const { data: teamForGems } = await client
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', teamId)
      .maybeSingle();
    const heartGems = teamForGems
      ? { fragments: teamForGems.heart_shards || 0, gems: teamForGems.heart_gems || 0 }
      : { fragments: 0, gems: 0 };

    // 获取点赞统计（likes表使用submission_id和team_id）
    const { count: likesReceived } = await client
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    // 获取该小队提交的产出被其他小队点赞的数量
    // 先获取该小队的所有提交ID
    const { data: teamSubmissionIds } = await client
      .from('task_submissions')
      .select('id')
      .eq('team_id', teamId);
    const subIds = (teamSubmissionIds || []).map((s: any) => s.id);
    let likesFromOthers = 0;
    if (subIds.length > 0) {
      const { count } = await client
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .in('submission_id', subIds)
        .neq('team_id', teamId);
      likesFromOthers = count || 0;
    }

    // 获取未读通知数
    const { count: unreadNotifications } = await client
      .from('team_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_read', false);

    return NextResponse.json({
      success: true,
      context: {
        role: '小队成员',
        team: {
          id: team.id,
          name: team.name,
          code: team.code,
          points: team.points,
          schoolName: schoolData?.name,
          volunteerName: volunteerName,
          nextTaskDeadline: team.next_task_deadline,
          createdAt: team.created_at,
        },
        currentTheme: currentTheme ? {
          id: currentTheme.id,
          name: currentTheme.name,
          description: currentTheme.description,
          icon: currentTheme.icon,
        } : null,
        currentTask: currentTask ? {
          id: currentTask.id,
          title: currentTask.title,
          description: currentTask.description,
          stage: currentTask.stage,
          points: currentTask.points,
          requirements: currentTask.requirements,
          learningGoals: currentTask.learning_goals,
        } : null,
        currentTaskTools: currentTaskTools.map((tt: any) => ({
          id: tt.toolDetail?.id,
          name: tt.toolDetail?.name,
          description: tt.toolDetail?.description,
          icon: tt.toolDetail?.icon,
          isRequired: tt.is_required,
        })),
        currentTaskSkills: currentTaskSkills.map((ts: any) => ({
          id: ts.skillDetail?.id,
          name: ts.skillDetail?.name,
          description: ts.skillDetail?.description,
          icon: ts.skillDetail?.icon,
          points: ts.points,
          isRequired: ts.is_required,
          status: skillLearnings?.find((l: any) => l.skill_id === ts.skill_id)?.status || 'not_started',
        })),
        tasks: tasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          stage: t.stage,
          points: t.points,
          taskType: t.task_type,
        })),
        members: members?.map((m: any) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          roleLabel: m.role === 'guider' ? '指引者' : 
                     m.role === 'light_mage' ? '光影法师' : '秘语学者',
        })) || [],
        skillLearnings: skillLearnings?.map((s: any) => ({
          skillId: s.skill_id,
          status: s.status,
          pointsEarned: s.points_earned,
        })) || [],
        submissions: submissions?.map((s: any) => ({
          id: s.id,
          taskTitle: submissionTasksMap[s.task_id]?.title,
          stage: submissionTasksMap[s.task_id]?.stage,
          status: s.status,
          rating: s.rating,
          pointsEarned: s.points_earned,
          createdAt: s.created_at,
          reviewedAt: s.reviewed_at,
        })) || [],
        stats: {
          totalMembers: members?.length || 0,
          pendingSubmissions: pendingCount || 0,
          approvedSubmissions: approvedCount || 0,
          totalRewards: userRewards?.length || 0,
          likesReceived: likesReceived || 0,
          likesGiven: likesFromOthers || 0,
          unreadNotifications: unreadNotifications || 0,
        },
        userRewards: userRewards?.slice(0, 10).map((ur: any) => ({
          id: ur.id,
          name: rewardsMap[ur.reward_id]?.name,
          description: rewardsMap[ur.reward_id]?.description,
          icon: rewardsMap[ur.reward_id]?.icon,
          type: rewardsMap[ur.reward_id]?.type,
          createdAt: ur.created_at,
        })) || [],
        heartGems: heartGems || { fragments: 0, gems: 0 },
      },
    });
  } catch (error) {
    console.error('获取小队数据上下文错误:', error);
    return ApiErrors.validation('获取小队数据失败');
  }
}
