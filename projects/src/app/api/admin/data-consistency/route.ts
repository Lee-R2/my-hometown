import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest } from 'next/server';

// 获取任务组信息（工具/技能不再强制一致性，仅供查看）
async function getTaskGroupInfo(supabase: ReturnType<typeof getSupabaseClient>) {
  const groups: Array<{
    taskGroupId: string;
    groupName: string;
    taskCount: number;
    tasks: Array<{ id: string; title: string; difficulty: string; tools: number; skills: number }>;
  }> = [];

  // 获取所有有 task_group_id 的任务
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, group_name, difficulty, task_group_id')
    .eq('is_active', true)
    .not('task_group_id', 'is', null);

  if (!tasks) return groups;

  // 按 task_group_id 分组
  const groupMap: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    const gid = task.task_group_id as string;
    if (!groupMap[gid]) groupMap[gid] = [];
    groupMap[gid].push(task);
  }

  // 获取每个任务的工具和技能数量
  for (const [groupId, groupTasks] of Object.entries(groupMap)) {
    const taskIds = groupTasks.map(t => t.id);

    const { data: toolLinks } = await supabase
      .from('task_tools')
      .select('task_id')
      .in('task_id', taskIds);

    const { data: skillLinks } = await supabase
      .from('task_skills')
      .select('task_id')
      .in('task_id', taskIds);

    const toolCounts: Record<string, number> = {};
    for (const link of toolLinks || []) {
      toolCounts[link.task_id] = (toolCounts[link.task_id] || 0) + 1;
    }

    const skillCounts: Record<string, number> = {};
    for (const link of skillLinks || []) {
      skillCounts[link.task_id] = (skillCounts[link.task_id] || 0) + 1;
    }

    groups.push({
      taskGroupId: groupId,
      groupName: groupTasks[0].group_name || '未命名',
      taskCount: groupTasks.length,
      tasks: groupTasks.map(t => ({
        id: t.id,
        title: t.title,
        difficulty: t.difficulty,
        tools: toolCounts[t.id] || 0,
        skills: skillCounts[t.id] || 0,
      })),
    });
  }

  return groups;
}

// GET：查看任务组信息（不再检查一致性）
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const supabase = getSupabaseClient();
    const groups = await getTaskGroupInfo(supabase);

    return Response.json({
      success: true,
      groupCount: groups.length,
      groups,
      note: '任务组内的工具/技能按任务独立配置，不再强制同步一致性',
    });
  } catch (error) {
    console.error('获取任务组信息失败:', error);
    return safeError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    return Response.json({
      success: true,
      message: '工具/技能按任务独立配置，无需同步修复',
      fixesApplied: 0,
      fixes: [],
    });
  } catch (error) {
    console.error('操作失败:', error);
    return safeError(error);
  }
}
