import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 小队选择主题
 * 支持多周期：完成当前主题后可选择新主题
 */
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { teamId, themeId } = await request.json();

    if (!teamId || !themeId) {
      return ApiErrors.validation('缺少必要参数');
    }

    // IDOR 防护：禁止为其他小队选择主题
    if (teamId !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权为其他小队选择主题');
    }

    const client = getSupabaseClient();

    // 1. 检查小队是否存在
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, current_theme_id, current_task_id, assigned_volunteer_id, teacher_id, name, cycle')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 2. 检查主题是否存在
    const { data: theme, error: themeError } = await client
      .from('task_themes')
      .select('id, name')
      .eq('id', themeId)
      .single();

    if (themeError || !theme) {
      return ApiErrors.notFound('主题不存在');
    }

    // 3. 确定当前周期
    const currentCycle = team.cycle || 1;

    // 4. 检查当前周期是否已有选择记录
    const { data: existingSelection, error: selectionError } = await client
      .from('team_theme_selections')
      .select('id, status')
      .eq('team_id', teamId)
      .eq('cycle', currentCycle)
      .single();

    // 如果当前周期已有选择且未完成，不允许重新选择
    if (existingSelection && existingSelection.status !== 'completed') {
      return ApiErrors.conflict('当前周期已选择主题，请先完成当前主题');
    }

    // 5. 如果是选择新周期（当前主题已完成）
    let newCycle = currentCycle;
    if (existingSelection && existingSelection.status === 'completed') {
      // 进入下一个周期
      newCycle = currentCycle + 1;
    }

    // 6. 检查主题是否已被同一指导老师下的其他小队在当前周期选择（排除自己）
    // 同一指导老师 = 同一志愿者(created_by) 或 同一助学老师(teacher_id)
    const siblingTeamIds: string[] = [];
    
    if (team.assigned_volunteer_id) {
      const { data: volunteerTeams } = await client
        .from('teams')
        .select('id')
        .eq('assigned_volunteer_id', team.assigned_volunteer_id)
        .eq('status', 'active')
        .neq('id', teamId);
      (volunteerTeams || []).forEach(t => siblingTeamIds.push(t.id));
    }
    
    if (team.teacher_id) {
      const { data: teacherTeams } = await client
        .from('teams')
        .select('id')
        .eq('teacher_id', team.teacher_id)
        .eq('status', 'active')
        .neq('id', teamId);
      (teacherTeams || []).forEach(t => {
        if (!siblingTeamIds.includes(t.id)) siblingTeamIds.push(t.id);
      });
    }
    
    let sameCycleTeamsWithSameTheme: Array<{ team_id: string }> = [];
    let checkError: { message: string } | null | undefined = null;
    if (siblingTeamIds.length > 0) {
      const { data: conflictData, error: selCheckError } = await client
        .from('team_theme_selections')
        .select('team_id')
        .eq('theme_id', themeId)
        .eq('cycle', newCycle)
        .eq('status', 'in_progress')
        .in('team_id', siblingTeamIds);
      
      checkError = selCheckError;
      if (!selCheckError && conflictData) {
        sameCycleTeamsWithSameTheme = conflictData;
      }
    }

    if (!checkError && sameCycleTeamsWithSameTheme.length > 0) {
      // 获取选择小队的名称
      const teamIds = sameCycleTeamsWithSameTheme.map(t => t.team_id);
      const { data: teams } = await client
        .from('teams')
        .select('name')
        .in('id', teamIds);
      
      const teamName = teams && teams.length > 0 ? teams[0].name : '其他小队';
      return ApiErrors.conflict(`该主题已被「${teamName}」在第${newCycle}周期选择`);
    }

    // 7. 记录选择到 team_theme_selections 表
    const { error: insertError } = await client
      .from('team_theme_selections')
      .insert({
        team_id: teamId,
        theme_id: themeId,
        cycle: newCycle,
        selected_at: new Date().toISOString(),
        status: 'in_progress',
      });

    if (insertError) {
      console.error('记录主题选择失败:', insertError);
      return supabaseErrorResponse(insertError, '记录选择失败');
    }

    // 8. 更新小队信息
    const updateData: Record<string, unknown> = {
      current_theme_id: themeId,
      updated_at: new Date().toISOString(),
    };

    // 如果是新周期，清空当前任务
    if (newCycle > currentCycle) {
      updateData.cycle = newCycle;
      updateData.current_task_id = null;
    }

    const { error: updateTeamError } = await client
      .from('teams')
      .update(updateData)
      .eq('id', teamId);

    if (updateTeamError) {
      console.error('更新小队主题失败:', updateTeamError);
      // 回滚选择记录
      await client
        .from('team_theme_selections')
        .delete()
        .eq('team_id', teamId)
        .eq('cycle', newCycle);
      return supabaseErrorResponse(updateTeamError, '更新小队主题失败');
    }

    // 9. 给志愿者发送通知
    const notifyVolunteerId = team.assigned_volunteer_id;
    if (notifyVolunteerId) {
      try {
        await client
          .from('notifications')
          .insert({
            type: 'theme_selected',
            title: newCycle > 1 ? '小队开始新周期' : '新小队选择主题',
            content: `小队「${team.name}」选择了主题「${theme.name}」（第${newCycle}周期），请及时下发任务！`,
            target_type: 'volunteer',
            target_id: notifyVolunteerId,
            related_team_id: teamId,
            related_theme_id: themeId,
            is_read: false,
          });
      } catch (notifyError) {
        console.error('发送通知失败:', notifyError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: newCycle > 1 ? `成功进入第${newCycle}周期，选择「${theme.name}」` : '主题选择成功',
      themeId,
      cycle: newCycle,
    });
  } catch (error) {
    console.error('选择主题错误:', error);
    return ApiErrors.validation('选择主题失败');
  }
}
