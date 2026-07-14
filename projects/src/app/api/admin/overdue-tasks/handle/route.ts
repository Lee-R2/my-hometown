import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

// 发送通知的辅助函数
async function sendNotification(client: any, params: {
  teamId: string;
  type: string;
  title: string;
  content: string;
  taskId?: string;
  senderId?: string;
  senderName?: string;
  extraData?: any;
}) {
  try {
    await client
      .from('team_notifications')
      .insert({
        team_id: params.teamId,
        type: params.type,
        title: params.title,
        content: params.content,
        task_id: params.taskId,
        sender_id: params.senderId,
        sender_name: params.senderName,
        extra_data: params.extraData,
      });
  } catch (error) {
    console.error('发送通知失败:', error);
  }
}

/**
 * 处理超时未提交的任务
 * 支持：extend（延期扣分）和 skip（跳过任务）
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const body = await request.json();

    const {
      teamId,
      taskId,
      action,
      newDeadline,
      pointDeduction,
      nextTaskDeadline,
    } = body;

    // 操作者身份从认证令牌获取，防止客户端伪造 reviewerId
    const reviewerId = auth.payload!.userId;
    const { data: reviewer } = await client
      .from('users')
      .select('name')
      .eq('id', reviewerId)
      .single();
    const reviewerName = reviewer?.name || '管理员';

    if (!teamId || !taskId || !action) {
      return ApiErrors.validation('缺少必要参数');
    }

    if (!['extend', 'skip'].includes(action)) {
      return ApiErrors.validation('无效的操作类型');
    }

    // 延期操作必须提供新截止时间和扣分
    if (action === 'extend' && (!newDeadline || pointDeduction === undefined)) {
      return ApiErrors.validation('延期操作需要提供新截止时间和扣分');
    }
    
    // 获取小队信息
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, name, points, current_theme_id, current_task_id, cycle')
      .eq('id', teamId)
      .single();
    
    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }
    
    // 获取任务信息
    const { data: task, error: taskError } = await client
      .from('tasks')
      .select('id, title, points, theme_id, stage, task_type')
      .eq('id', taskId)
      .single();
    
    if (taskError || !task) {
      return ApiErrors.notFound('任务不存在');
    }
    
    let message = '';
    
    if (action === 'extend') {
      // ========== 延期扣分逻辑 ==========
      const deduction = Math.min(pointDeduction, task.points); // 扣分不能超过任务基础分
      
      // 更新小队积分（扣除）和截止日期
      const newPoints = Math.max(0, (team.points || 0) - deduction);
      
      await client
        .from('teams')
        .update({ 
          points: newPoints,
          next_task_deadline: newDeadline,
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);
      
      // 记录超时处理
      await client
        .from('overdue_task_records')
        .insert({
          team_id: teamId,
          task_id: taskId,
          action: 'extend',
          point_deduction: deduction,
          new_deadline: newDeadline,
          handled_by: reviewerId,
          handled_at: new Date().toISOString(),
        });
      
      message = `已延期至 ${new Date(newDeadline).toLocaleString('zh-CN')}，扣除 ${deduction} 积分`;
      
      // 发送通知给小队
      await sendNotification(client, {
        teamId,
        type: 'deadline_extended',
        title: '⏰ 任务延期通知',
        content: `你的任务「${task.title}」已获准延期。新截止时间：${new Date(newDeadline).toLocaleString('zh-CN')}。因延期扣除 ${deduction} 积分，请按时完成提交！`,
        taskId,
        senderId: reviewerId,
        senderName: reviewerName,
        extraData: {
          deduction,
          newDeadline,
        },
      });
      
    } else if (action === 'skip') {
      // ========== 跳过任务逻辑 ==========
      
      // 标记任务为"未完成"状态
      await client
        .from('overdue_task_records')
        .insert({
          team_id: teamId,
          task_id: taskId,
          action: 'skip',
          point_deduction: task.points, // 该任务的所有积分都不获得
          handled_by: reviewerId,
          handled_at: new Date().toISOString(),
        });
      
      // 查找下一个任务
      let nextTaskId = null;
      
      // 1. 先检查是否有未完成的支线任务
      const { data: nextSideTask } = await client
        .from('team_side_tasks')
        .select('task_id')
        .eq('team_id', teamId)
        .in('status', ['assigned', 'in_progress'])
        .order('assigned_at', { ascending: true })
        .limit(1)
        .single();
      
      if (nextSideTask) {
        nextTaskId = nextSideTask.task_id;
      } else {
        // 2. 查找下一个主线任务
        const themeId = team.current_theme_id;
        if (themeId) {
          const { data: mainTasks } = await client
            .from('tasks')
            .select('id, stage, order_index')
            .eq('theme_id', themeId)
            .eq('is_active', true)
            .eq('task_type', 'main')
            .order('stage', { ascending: true })
            .order('order_index', { ascending: true });
          
          // 获取小队已完成和已跳过的任务
          const { data: completedSubmissions } = await client
            .from('task_submissions')
            .select('task_id')
            .eq('team_id', teamId)
            .in('status', ['approved']);
          
          const { data: skippedTasks } = await client
            .from('overdue_task_records')
            .select('task_id')
            .eq('team_id', teamId)
            .eq('action', 'skip');
          
          const processedTaskIds = new Set([
            ...(completedSubmissions || []).map(s => s.task_id),
            ...(skippedTasks || []).map(s => s.task_id),
          ]);
          
          // 找到下一个未处理的主线任务
          const nextMainTask = (mainTasks || []).find((t: any) => !processedTaskIds.has(t.id));
          if (nextMainTask) {
            nextTaskId = nextMainTask.id;
          }
        }
      }
      
      // 更新小队当前任务
      await client
        .from('teams')
        .update({ 
          current_task_id: nextTaskId,
          next_task_deadline: nextTaskDeadline || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);
      
      // 如果没有下一个任务，且当前是最后任务，则归档主题
      if (!nextTaskId && task.task_type === 'final') {
        const cycle = team.cycle || 1;

        // 计算该主题获得的总积分
        const { data: themeSubmissions } = await client
          .from('task_submissions')
          .select('task_id, rating')
          .eq('team_id', teamId)
          .eq('status', 'approved');

        const { data: themeTasks } = await client
          .from('tasks')
          .select('id, points')
          .eq('theme_id', task.theme_id)
          .eq('is_active', true);

        const taskPointsMap = new Map((themeTasks || []).map((t: any) => [t.id, t.points]));
        const themeTotalPoints = (themeSubmissions || [])
          .filter((s: any) => taskPointsMap.has(s.task_id))
          .reduce((sum: number, s: any) => sum + (taskPointsMap.get(s.task_id) || 0), 0);

        // 计算该主题获得的激励数量（只计算该主题下任务的激励）
        const themeTaskIds = (themeTasks || []).map((t: any) => t.id);
        let themeRewardsCount = 0;
        if (themeTaskIds.length > 0) {
          const { count } = await client
            .from('user_rewards')
            .select('id', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .in('task_id', themeTaskIds);
          themeRewardsCount = count || 0;
        }

        // 计算完成任务数
        const completedTaskIds = new Set((themeSubmissions || []).map((s: any) => s.task_id));
        const themeTaskIdSet = new Set(themeTaskIds);
        const completedThemeTasks = [...completedTaskIds].filter(id => themeTaskIdSet.has(id)).length;

        // 步骤1：归档到 theme_completions（带 cycle，onConflict 含 cycle 防覆盖历史周期）
        const { error: completionError } = await client
          .from('theme_completions')
          .upsert({
            team_id: teamId,
            theme_id: task.theme_id,
            cycle: cycle,
            total_points: themeTotalPoints,
            total_rewards: themeRewardsCount || 0,
            total_tasks: completedThemeTasks,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'team_id,theme_id,cycle' });

        if (completionError) {
          console.error('[overdue-skip] 归档主题完成记录失败，终止清零以防数据不一致:', {
            teamId, themeId: task.theme_id, cycle, error: completionError.message,
          });
        } else {
          // 步骤2：更新 team_theme_selections 为 completed
          await client
            .from('team_theme_selections')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('team_id', teamId)
            .eq('theme_id', task.theme_id)
            .eq('cycle', cycle);

          // 步骤3：重置 teams 表当前主题/任务状态 + cycle+1
          // 积分跨周期累积，不清零；乐观锁 .eq('cycle', cycle) 防并发双归档
          const { data: clearedTeam, error: clearError } = await client
            .from('teams')
            .update({
              current_theme_id: null,
              current_task_id: null,
              next_task_deadline: null,
              cycle: cycle + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', teamId)
            .eq('cycle', cycle)
            .select('id');

          if (clearError) {
            console.error('[overdue-skip] 关键：归档已完成但 teams 清零失败，存在数据不一致风险:', {
              teamId, themeId: task.theme_id, cycle, error: clearError.message,
            });
          } else if (!clearedTeam || clearedTeam.length === 0) {
            console.warn(`[overdue-skip] 周期 ${cycle} 已被并发归档，跳过: team=${teamId}`);
          }
        }
      }
      
      message = '已跳过该任务，小队将进入下一任务';
      
      // 发送通知给小队
      const deadlineText = nextTaskDeadline 
        ? `下一个任务截止时间：${new Date(nextTaskDeadline).toLocaleString('zh-CN')}。` 
        : '';
      await sendNotification(client, {
        teamId,
        type: 'task_skipped',
        title: '⏭️ 任务已跳过',
        content: `你的任务「${task.title}」因超时未提交已被跳过。该任务的积分和激励无法获得。${deadlineText}${nextTaskId ? '请继续完成下一个任务！' : '当前主题已结束。'}`,
        taskId,
        senderId: reviewerId,
        senderName: reviewerName,
        extraData: {
          skippedTaskId: taskId,
          nextTaskId,
          nextTaskDeadline,
        },
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      message,
      action,
    });
  } catch (error) {
    console.error('处理超时任务错误:', error);
    return safeError(error);
  }
}
