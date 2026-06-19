import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const volunteerId = searchParams.get('volunteerId');

    if (!volunteerId) {
      return ApiErrors.validation('缺少志愿者ID');
    }

    // 1. 获取志愿者指导的所有小队
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select(`
        id,
        code,
        name,
        current_theme_id,
        current_task_id,
        points,
        status,
        cycle
      `)
      .eq('assigned_volunteer_id', volunteerId)
      .eq('status', 'active');

    if (teamsError) {
      return ApiErrors.validation('获取小队列表失败');
    }

    // 2. 获取所有活跃主题
    const { data: themes, error: themesError } = await client
      .from('task_themes')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (themesError) {
      return ApiErrors.validation('获取主题列表失败');
    }

    // 3. 获取所有主题下的任务数量
    const themeIds = (themes || []).map(t => t.id);
    let themeTaskCountMap: Record<string, number> = {};
    
    if (themeIds.length > 0) {
      const { data: tasksData } = await client
        .from('tasks')
        .select('theme_id')
        .in('theme_id', themeIds)
        .eq('is_active', true)
        .eq('task_type', 'main'); // 只统计主线任务

      (tasksData || []).forEach(task => {
        themeTaskCountMap[task.theme_id] = (themeTaskCountMap[task.theme_id] || 0) + 1;
      });
    }

    // 4. 获取每个小队当前任务的阶段
    const taskIds = (teams || []).map(t => t.current_task_id).filter(Boolean);
    let taskStageMap: Record<string, number> = {};
    let taskInfoMap: Record<string, { id: string; title: string; stage: number }> = {};

    if (taskIds.length > 0) {
      const { data: tasksData } = await client
        .from('tasks')
        .select('id, title, stage')
        .in('id', taskIds);

      (tasksData || []).forEach(task => {
        taskStageMap[task.id] = task.stage;
        taskInfoMap[task.id] = task;
      });
    }

    // 4.5 获取每个小队已完成的任务数量（用于判断是否真正完成所有任务）
    const teamIds = (teams || []).map(t => t.id);
    let teamCompletedTaskCountMap: Record<string, number> = {};
    
    if (teamIds.length > 0) {
      const { data: submissionsData } = await client
        .from('task_submissions')
        .select('team_id, task_id')
        .in('team_id', teamIds)
        .in('status', ['approved', 'excellent']);

      // 统计每个小队已完成的任务数量
      (submissionsData || []).forEach(sub => {
        teamCompletedTaskCountMap[sub.team_id] = (teamCompletedTaskCountMap[sub.team_id] || 0) + 1;
      });
    }

    // 5. 组装主题数据，包含选择该主题的小队信息
    const themesWithTeams = (themes || []).map(theme => {
      // 找到选择该主题的小队
      const teamsWithTheme = (teams || [])
        .filter(t => t.current_theme_id === theme.id)
        .map(t => ({
          id: t.id,
          code: t.code,
          name: t.name,
          currentTaskId: t.current_task_id,
          currentStage: taskStageMap[t.current_task_id || ''] || 0,
          currentTask: taskInfoMap[t.current_task_id || ''] || null,
          points: t.points,
          cycle: t.cycle || 1,
        }));

      const totalStages = themeTaskCountMap[theme.id] || 0;

      // 计算主题状态
      let status: 'unselected' | 'selected' | 'pending_assign' | 'in_progress' | 'completed';
      
      if (teamsWithTheme.length === 0) {
        // 未选择：没有小队选择该主题
        status = 'unselected';
      } else {
        // 有小队选择了主题
        const allTeamsWithoutTask = teamsWithTheme.every(t => !t.currentTaskId);
        const hasTeamsWithTask = teamsWithTheme.some(t => t.currentTaskId);
        
        // 状态判断优先级：
        // 1. 有小队正在执行任务 → 执行中
        // 2. 所有小队都没有任务 → 待下发（可能刚选择主题或刚完成新周期任务）
        // 注意：completed 状态需要明确的小队+主题+周期完成标记才能判断
        // 当前系统设计下，通过 current_task_id 判断更准确
        
        if (hasTeamsWithTask) {
          // 有小队正在执行任务
          status = 'in_progress';
        } else if (allTeamsWithoutTask) {
          // 所有小队都没有正在执行的任务 → 待下发
          status = 'pending_assign';
        } else {
          status = 'selected';
        }
      }

      return {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        icon: theme.icon,
        school_id: theme.school_id,
        is_exclusive: theme.is_exclusive,
        created_by: theme.created_by,
        totalStages,
        teams: teamsWithTheme,
        status,
        // 当前正在进行的阶段（取所有选择该主题的小队中最大的阶段）
        activeStage: teamsWithTheme.length > 0 
          ? Math.max(...teamsWithTheme.map(t => t.currentStage || 0))
          : 0,
      };
    });

    // 获取所有不同时期的周期列表（用于筛选器）
    const allCycles = [...new Set((teams || []).map(t => t.cycle || 1))].sort((a, b) => a - b);

    return NextResponse.json({
      themes: themesWithTeams,
      teams: teams || [],
      cycles: allCycles,
    });
  } catch (error) {
    console.error('获取任务管理数据错误:', error);
    return safeError(error);
  }
}
