import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取小队已下发的支线任务列表
 */
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;
    
    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const client = getSupabaseClient();

    // 获取小队已下发的支线任务
    const { data: sideTasks, error } = await client
      .from('team_side_tasks')
      .select(`
        id,
        task_id,
        assigned_by,
        assigned_at,
        status,
        completed_at
      `)
      .eq('team_id', teamId)
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('获取支线任务列表错误:', error);
      return supabaseErrorResponse(error, '获取支线任务列表失败');
    }

    // 手动获取关联的任务信息
    const taskIds = [...new Set((sideTasks || []).map((s: any) => s.task_id).filter(Boolean))];
    let taskMap: Record<string, any> = {};
    if (taskIds.length > 0) {
      const { data: tasks } = await client
        .from('tasks')
        .select('id, title, description, stage, points')
        .in('id', taskIds);
      (tasks || []).forEach((t: any) => { taskMap[t.id] = t; });
    }

    const enrichedSideTasks = (sideTasks || []).map((s: any) => ({
      ...s,
      tasks: taskMap[s.task_id] || null,
    }));

    return NextResponse.json({
      sideTasks: enrichedSideTasks,
    });
  } catch (error) {
    console.error('获取支线任务列表错误:', error);
    return ApiErrors.validation('获取支线任务列表错误');
  }
}
