import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const themeId = searchParams.get('themeId');
    const stage = searchParams.get('stage');
    const taskType = searchParams.get('taskType');
    const difficulty = searchParams.get('difficulty');
    const taskGroupId = searchParams.get('taskGroupId');

    if (!themeId && !taskGroupId) {
      return ApiErrors.validation('缺少主题ID或任务组ID');
    }

    let query = client
      .from('tasks')
      .select('*')
      .eq('is_active', true);

    if (taskGroupId) {
      query = query.eq('task_group_id', taskGroupId);
    } else {
      query = query.eq('theme_id', themeId!);
    }

    // 按阶段筛选
    if (stage) {
      query = query.eq('stage', parseInt(stage));
    }

    // 按任务类型筛选（main=主线，side=支线）
    if (taskType) {
      query = query.eq('task_type', taskType);
    }

    // 按难度筛选
    if (difficulty) {
      query = query.eq('difficulty', difficulty);
    }

    query = query.order('stage', { ascending: true })
      .order('order_index', { ascending: true });

    const { data: tasks, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取任务列表失败');
    }

    return NextResponse.json({ tasks: tasks || [] });
  } catch (error) {
    console.error('获取任务列表错误:', error);
    return ApiErrors.validation('获取任务列表失败');
  }
}

// 检查用户是否有权限操作主题下的任务
async function checkTaskPermission(
  client: ReturnType<typeof getSupabaseAdminClient>,
  themeId: string,
  userId: string,
  userRole: string
): Promise<{ allowed: boolean; error?: string }> {
  // 超级管理员有所有权限
  if (userRole === 'admin' || userRole === 'super_admin') {
    return { allowed: true };
  }

  // 志愿者和助学老师只能操作本校专属主题的任务
  if (userRole === 'volunteer' || userRole === 'teacher') {
    // 获取用户信息
    const { data: user, error: userError } = await client
      .from('users')
      .select('school_id')
      .eq('id', userId)
      .single();

    if (userError || !user?.school_id) {
      return { allowed: false, error: '您没有关联的学校' };
    }

    // 获取主题信息
    const { data: theme, error: themeError } = await client
      .from('task_themes')
      .select('school_id')
      .eq('id', themeId)
      .single();

    if (themeError || !theme) {
      return { allowed: false, error: '主题不存在' };
    }

    // 全局主题的任务不能操作
    if (!theme.school_id) {
      return { allowed: false, error: '全局主题的任务只能查看，无法编辑或删除' };
    }

    // 检查是否是本校专属主题
    if (theme.school_id !== user.school_id) {
      return { allowed: false, error: '您没有权限操作此主题下的任务' };
    }

    return { allowed: true };
  }

  return { allowed: false, error: '无权限' };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    // 权限验证：身份从认证令牌获取，防止客户端伪造
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;

    const permission = await checkTaskPermission(client, body.themeId, userId, userRole);
    if (!permission.allowed) {
      return ApiErrors.forbidden(permission.error || '无权限');
    }

    // 获取当前主题下最大的阶段号
    const { data: existingTasks } = await client
      .from('tasks')
      .select('stage')
      .eq('theme_id', body.themeId)
      .eq('is_active', true)
      .order('stage', { ascending: false })
      .limit(1);

    const nextStage = existingTasks && existingTasks.length > 0 
      ? existingTasks[0].stage + 1 
      : 1;

    // 获取指定阶段内当前最大的 order_index，用于正确排序新任务
    const targetStage = body.stage || nextStage;
    const { data: stageTasks } = await client
      .from('tasks')
      .select('order_index')
      .eq('theme_id', body.themeId)
      .eq('is_active', true)
      .eq('stage', targetStage)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrderIndex = stageTasks && stageTasks.length > 0
      ? stageTasks[0].order_index + 1
      : 1;

    // 支持两种创建模式：
    // 1. 任务组模式：一次创建3个难度变体（body.taskGroup = [{difficulty, title, description, ...}, ...]）
    // 2. 单任务模式：创建单个任务（向后兼容）
    type CreatedTask = { id: string; task_group_id?: string; [key: string]: unknown };
    let createdTasks: CreatedTask[] = [];
    const autoConfiguredForms = null;

    if (body.taskGroup && Array.isArray(body.taskGroup) && body.taskGroup.length > 0) {
      // 任务组模式：生成一个共享的 task_group_id
      const taskGroupId = crypto.randomUUID();
      const stage = body.stage || targetStage;

      const insertRecords = body.taskGroup.map((variant: {
        difficulty: string;
        title: string;
        description?: string;
        requirements?: string[];
        learningGoals?: string[];
        points?: number;
        rewards?: string[];
        groupName?: string;
        groupDescription?: string;
      }) => ({
        theme_id: body.themeId,
        stage,
        group_name: variant.groupName || body.groupName || null,
        group_description: variant.groupDescription || body.groupDescription || null,
        title: variant.title,
        description: variant.description || '',
        requirements: variant.requirements || [],
        learning_goals: variant.learningGoals || [],
        points: variant.points || body.points || 10,
        order_index: body.orderIndex || nextOrderIndex,
        task_type: body.taskType || 'main',
        difficulty: variant.difficulty || 'medium',
        task_group_id: taskGroupId,
        created_by: userId,
      }));

      const { data: tasks, error } = await client
        .from('tasks')
        .insert(insertRecords)
        .select();

      if (error) {
        return supabaseErrorResponse(error, '创建任务组失败');
      }

      createdTasks = tasks || [];

      // 为每个难度变体关联激励
      if (createdTasks.length > 0) {
        const rewardInserts: { task_id: string; reward_id: string }[] = [];
        body.taskGroup.forEach((variant: { difficulty: string; rewards?: string[] }, index: number) => {
          const task = createdTasks[index];
          if (task && variant.rewards && variant.rewards.length > 0) {
            variant.rewards.forEach((rewardId: string) => {
              rewardInserts.push({ task_id: task.id, reward_id: rewardId });
            });
          }
        });
        if (rewardInserts.length > 0) {
          await client.from('task_rewards').insert(rewardInserts);
        }
      }
    } else {
      // 单任务模式（向后兼容）
      const { data: task, error } = await client
        .from('tasks')
        .insert({
          theme_id: body.themeId,
          stage: body.stage || targetStage,
          group_name: body.groupName || null,
          group_description: body.groupDescription || null,
          title: body.title,
          description: body.description,
          requirements: body.requirements || [],
          learning_goals: body.learningGoals || [],
          points: body.points || 10,
          order_index: body.orderIndex || nextOrderIndex,
          task_type: body.taskType || 'main',
          difficulty: body.difficulty || 'medium',
          task_group_id: body.taskGroupId || crypto.randomUUID(),
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        return supabaseErrorResponse(error, '创建任务失败');
      }

      createdTasks = [task];

      // 关联激励
      if (task && body.rewards && Array.isArray(body.rewards) && body.rewards.length > 0) {
        const rewardInserts = body.rewards.map((rewardId: string) => ({
          task_id: task.id,
          reward_id: rewardId,
        }));
        await client.from('task_rewards').insert(rewardInserts);
      }

      // 新任务加入已有组时，不再自动同步工具/技能到同组其他任务
      // 工具、技能、激励从属于单个任务，各任务独立配置
    }

    return NextResponse.json({ 
      success: true, 
      tasks: createdTasks,
      task: createdTasks[0], // 向后兼容
    });
  } catch (error) {
    console.error('创建任务错误:', error);
    return ApiErrors.validation('创建任务失败');
  }
}
