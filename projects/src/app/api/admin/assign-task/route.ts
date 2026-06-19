import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 下发任务API
 * 支持单个和批量下发
 * 为小队设置当前任务和截止时间
 */
export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { teamIds, themeId, deadline } = body;

    if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
      return ApiErrors.validation('请选择要下发任务的小队');
    }

    if (!themeId) {
      return ApiErrors.validation('请选择任务主题');
    }

    const client = getSupabaseClient();

    // 1. 获取该主题下第一阶段的所有任务（含 task_group_id 和难度）
    const { data: firstStageTasks, error: tasksError } = await client
      .from('tasks')
      .select('id, title, stage, difficulty, task_group_id, order_index, task_type')
      .eq('theme_id', themeId)
      .eq('is_active', true)
      .eq('task_type', 'main')
      .order('stage', { ascending: true });

    if (tasksError) {
      return ApiErrors.validation('获取任务失败');
    }

    if (!firstStageTasks || firstStageTasks.length === 0) {
      return ApiErrors.validation('该主题下没有可用的任务');
    }

    // 按任务组分组，取第一个未完成组中对应难度的变体
    const groupMap = new Map<string, any[]>();
    for (const t of firstStageTasks) {
      const gid = t.task_group_id || t.id;
      if (!groupMap.has(gid)) groupMap.set(gid, []);
      groupMap.get(gid)!.push(t);
    }

    // 排序任务组
    const sortedGroups = Array.from(groupMap.entries()).sort(([, a], [, b]) => {
      const aFirst = a[0], bFirst = b[0];
      if (aFirst.stage !== bFirst.stage) return aFirst.stage - bFirst.stage;
      return (aFirst.order_index || 0) - (bFirst.order_index || 0);
    });

    // 第一个任务组即为要下发的任务
    const firstGroupVariants = sortedGroups.length > 0 ? sortedGroups[0][1] : [];

    // 2. 验证所有小队是否已选择该主题（考虑周期）并获取偏好难度
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, name, current_theme_id, current_task_id, cycle, preferred_difficulty')
      .in('id', teamIds);

    if (teamsError) {
      return ApiErrors.validation('获取小队信息失败');
    }

    // 检查是否有小队未选择该主题
    const invalidTeams = (teams || []).filter(t => t.current_theme_id !== themeId);
    if (invalidTeams.length > 0) {
      return NextResponse.json({ 
        error: `以下小队尚未选择该主题：${invalidTeams.map(t => t.name).join('、')}` 
      }, { status: 400 });
    }

    // 检查是否有小队已有当前任务
    const teamsWithTask = (teams || []).filter(t => t.current_task_id);
    if (teamsWithTask.length > 0) {
      return NextResponse.json({ 
        error: `以下小队已有进行中的任务：${teamsWithTask.map(t => t.name).join('、')}` 
      }, { status: 400 });
    }

    // 3. 按难度匹配函数 - 从同一任务组中选择对应难度
    const getTaskByDifficulty = (variants: any[], difficulty: string) => {
      return variants.find(t => (t.difficulty || 'medium') === difficulty);
    };

    // 4. 为每个小队分配第一个任务组中对应难度的变体
    const results: { teamId: string; teamName: string; taskId: string; taskTitle: string; difficulty: string }[] = [];
    
    for (const team of (teams || [])) {
      const preferredDifficulty = team.preferred_difficulty || 'medium';
      
      // 从第一个任务组中按难度匹配
      let matchedTask = getTaskByDifficulty(firstGroupVariants, preferredDifficulty);
      if (!matchedTask && preferredDifficulty !== 'medium') {
        matchedTask = getTaskByDifficulty(firstGroupVariants, 'medium');
      }
      if (!matchedTask) {
        matchedTask = firstGroupVariants[0];
      }

      // 更新小队的当前任务和截止时间
      const updateData: any = { current_task_id: matchedTask.id };
      
      if (deadline) {
        const dateOnly = new Date(deadline);
        const normalizedDeadline = new Date(dateOnly.getFullYear(), dateOnly.getMonth(), dateOnly.getDate(), 23, 59, 59);
        updateData.next_task_deadline = normalizedDeadline.toISOString();
      }

      const { error: updateError } = await client
        .from('teams')
        .update(updateData)
        .eq('id', team.id);

      if (updateError) {
        console.error(`为小队 ${team.name} 下发任务失败:`, updateError);
        continue;
      }

      // 更新 team_theme_selections 中当前周期的状态为 in_progress
      const teamCycle = team.cycle || 1;
      await client
        .from('team_theme_selections')
        .update({ status: 'in_progress' })
        .eq('team_id', team.id)
        .eq('theme_id', themeId)
        .eq('cycle', teamCycle);

      results.push({
        teamId: team.id,
        teamName: team.name,
        taskId: matchedTask.id,
        taskTitle: matchedTask.title,
        difficulty: matchedTask.difficulty || 'medium'
      });
    }

    return NextResponse.json({
      success: true,
      message: `已为 ${results.length} 个小队按偏好难度下发任务`,
      results,
    });
  } catch (error) {
    console.error('下发任务错误:', error);
    return safeError(error);
  }
}
