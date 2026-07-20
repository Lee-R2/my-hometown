import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, getAuthenticatedClient } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 获取同志愿者指导的其他小队信息
 * 包括：当前任务进度、已完成主题的小队
 * 区分项目周期：已完成当前主题的小队进入新一轮
 */
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { searchParams } = new URL(request.url);
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;
    const createdBy = searchParams.get('createdBy'); // 志愿者ID

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const client = getAuthenticatedClient(request, auth);

    // 获取当前小队信息（包含 cycle）
    const { data: currentTeam, error: currentTeamError } = await client
      .from('teams')
      .select('id, created_by, current_theme_id, cycle')
      .eq('id', teamId)
      .single();

    if (currentTeamError || !currentTeam) {
      return supabaseErrorResponse(currentTeamError, '获取小队信息失败');
    }

    // 获取当前小队的周期
    const currentTeamCycle = currentTeam.cycle || 1;

    // 使用传入的 createdBy 或从小队数据获取
    const volunteerId = createdBy || currentTeam.created_by;

    if (!volunteerId) {
      return NextResponse.json({ teams: [] });
    }

    // 获取当前小队的已完成主题列表
    const { data: currentTeamCompletions } = await client
      .from('theme_completions')
      .select('theme_id, completed_at')
      .eq('team_id', teamId)
      .order('completed_at', { ascending: false });
    
    const currentTeamCompletedThemeIds = new Set((currentTeamCompletions || []).map(c => c.theme_id));
    const currentTeamCompletionCount = currentTeamCompletedThemeIds.size;

    // 获取同志愿者指导的所有其他小队（包含 cycle）
    const { data: siblingTeams, error: siblingError } = await client
      .from('teams')
      .select(`
        id,
        code,
        name,
        points,
        cycle,
        current_theme_id,
        current_task_id,
        status,
        created_at
      `)
      .eq('assigned_volunteer_id', volunteerId)
      .eq('status', 'active')
      .neq('id', teamId)
      .order('created_at', { ascending: false });

    if (siblingError) {
      console.error('获取同志愿者小队失败:', siblingError);
      return supabaseErrorResponse(siblingError, '获取数据失败');
    }

    if (!siblingTeams || siblingTeams.length === 0) {
      return NextResponse.json({ teams: [], currentTeamCycle: currentTeamCycle });
    }

    // 收集所有主题ID
    const themeIds = siblingTeams
      .filter(t => t.current_theme_id)
      .map(t => t.current_theme_id);
    
    // 收集所有当前任务ID
    const taskIds = siblingTeams
      .filter(t => t.current_task_id)
      .map(t => t.current_task_id);

    // 获取主题信息
    const themesMap = new Map();
    if (themeIds.length > 0) {
      const { data: themes } = await client
        .from('task_themes')
        .select('id, name, icon')
        .in('id', themeIds);
      (themes || []).forEach(t => themesMap.set(t.id, t));
    }

    // 获取任务信息（阶段、标题）
    const tasksMap = new Map();
    if (taskIds.length > 0) {
      const { data: tasks } = await client
        .from('tasks')
        .select('id, stage, theme_id, title')
        .in('id', taskIds);
      (tasks || []).forEach(t => tasksMap.set(t.id, t));
    }

    // 获取每个主题的总任务数
    const themeTaskCountMap = new Map<string, number>();
    if (themeIds.length > 0) {
      const { data: taskCounts } = await client
        .from('tasks')
        .select('theme_id')
        .in('theme_id', themeIds)
        .eq('is_active', true)
        .eq('task_type', 'main');
      (taskCounts || []).forEach(t => {
        const count = themeTaskCountMap.get(t.theme_id) || 0;
        themeTaskCountMap.set(t.theme_id, count + 1);
      });
    }

    // 获取已完成主题的小队的完成记录
    const siblingTeamIds = siblingTeams.map(t => t.id);
    const { data: completions } = await client
      .from('theme_completions')
      .select(`
        id,
        team_id,
        theme_id,
        completed_at,
        total_points,
        total_rewards,
        total_tasks
      `)
      .in('team_id', siblingTeamIds)
      .order('completed_at', { ascending: false });

    // 构建完成记录映射
    const completionsMap = new Map<string, typeof completions>();
    (completions || []).forEach(c => {
      const existing = completionsMap.get(c.team_id) || [];
      existing.push(c);
      completionsMap.set(c.team_id, existing);
    });

    // 为完成记录添加主题信息
    const completionThemeIds = (completions || []).map(c => c.theme_id);
    const completionThemesMap = new Map();
    if (completionThemeIds.length > 0) {
      const { data: completionThemes } = await client
        .from('task_themes')
        .select('id, name, icon')
        .in('id', completionThemeIds);
      (completionThemes || []).forEach(t => completionThemesMap.set(t.id, t));
    }

    // 组装返回数据
    const teamsWithProgress = siblingTeams.map(team => {
      const currentTheme = team.current_theme_id ? themesMap.get(team.current_theme_id) : null;
      const currentTask = team.current_task_id ? tasksMap.get(team.current_task_id) : null;
      const totalStages = team.current_theme_id ? (themeTaskCountMap.get(team.current_theme_id) || 1) : 0;
      const currentStage = currentTask?.stage || 0;

      // 获取该小队的完成记录
      const teamCompletions = (completionsMap.get(team.id) || []).map(c => ({
        ...c,
        theme: completionThemesMap.get(c.theme_id) || { id: c.theme_id, name: '未知主题', icon: '🎯' },
      }));

      // 判断该小队是否已完成当前主题
      const completedCurrentTheme = team.current_theme_id 
        ? teamCompletions.some(c => c.theme_id === team.current_theme_id)
        : false;

      // 判断该小队是否与当前小队在同一周期
      // 同一周期 = 两队的 cycle 相同
      const siblingCycle = team.cycle || 1;
      const isInSameCycle = siblingCycle === currentTeamCycle;

      // 计算周期差距：其他小队周期 - 当前小队周期
      const cycleGap = siblingCycle - currentTeamCycle;

      return {
        id: team.id,
        code: team.code,
        name: team.name,
        points: team.points || 0,
        status: team.status,
        createdAt: team.created_at,
        // 当前主题进度
        currentTheme: currentTheme ? {
          id: currentTheme.id,
          name: currentTheme.name,
          icon: currentTheme.icon,
        } : null,
        // 当前任务信息
        currentTask: currentTask ? {
          id: currentTask.id,
          title: currentTask.title,
          stage: currentTask.stage,
        } : null,
        currentStage,
        totalStages,
        progress: totalStages > 0 ? `${currentStage}/${totalStages}` : null,
        isCompleted: completedCurrentTheme,
        // 已完成主题记录
        completedThemes: teamCompletions,
        completedThemesCount: teamCompletions.length,
        // 周期标记
        isInSameCycle,
        completedCurrentTheme,
        // 周期差距
        cycleGap,
      };
    });

    // 按同周期优先、然后按完成状态和进度排序
    teamsWithProgress.sort((a, b) => {
      // 同周期的在前
      if (a.isInSameCycle !== b.isInSameCycle) {
        return a.isInSameCycle ? -1 : 1;
      }
      // 都在进行中，按进度排序
      if (!a.isCompleted && !b.isCompleted) {
        return (b.currentStage || 0) - (a.currentStage || 0);
      }
      // 都已完成，按完成数量排序
      if (a.isCompleted && b.isCompleted) {
        return (b.completedThemesCount || 0) - (a.completedThemesCount || 0);
      }
      // 进行中的在前
      return a.isCompleted ? 1 : -1;
    });

    return NextResponse.json({ 
      teams: teamsWithProgress,
      total: teamsWithProgress.length,
      currentTeamCycle: currentTeamCycle,
      currentTeamCompletedThemes: (currentTeamCompletions || []).map(c => ({
        theme_id: c.theme_id,
        completed_at: c.completed_at,
      })),
    });
  } catch (error) {
    console.error('获取同志愿者小队信息错误:', error);
    return ApiErrors.validation('获取同志愿者小队信息错误');
  }
}
