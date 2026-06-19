import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取小队当前任务API
 * 
 * 核心概念：任务组（task_group_id）
 * - 同一个概念任务有3个难度变体（easy/medium/hard），共享同一个 task_group_id
 * - 小队完成任一难度变体即视为完成该任务组
 * - 小队根据 preferred_difficulty 获取对应难度的变体
 * - 完成后自动进入下一个任务组
 * 
 * 逻辑：
 * 1. 优先检查是否有未完成的支线任务
 * 2. 如果没有支线任务，返回下一个未完成的主线任务组中对应难度的变体
 * 3. 如果所有主线任务组都完成，检查最后任务
 */

// 辅助函数：获取任务的必学技能完成状态（按周期过滤）
async function getRequiredSkillsStatus(client: any, taskId: string, teamId: string, cycle: number) {
  try {
    const { data: taskSkills, error: skillsError } = await client
      .from('task_skills')
      .select(`
        is_required,
        skills (
          id,
          name,
          icon,
          category,
          description
        )
      `)
      .eq('task_id', taskId);

    if (skillsError || !taskSkills) {
      return { requiredSkillsTotal: 0, requiredSkillsCompleted: 0, allRequiredSkillsCompleted: true };
    }

    const skillIds = taskSkills.map((ts: any) => ts.skills.id);
    const { data: learnings, error: learningsError } = await client
      .from('team_skill_learnings')
      .select('skill_id, status')
      .eq('team_id', teamId)
      .eq('cycle', cycle)
      .in('skill_id', skillIds);

    if (learningsError) {
      return { requiredSkillsTotal: 0, requiredSkillsCompleted: 0, allRequiredSkillsCompleted: true };
    }

    const requiredSkillsOriginal = taskSkills.filter((ts: any) => ts.is_required);
    const requiredSkillsTotal = requiredSkillsOriginal.length;
    const requiredSkillsCompleted = requiredSkillsOriginal.filter((ts: any) => {
      const learning = learnings?.find((l: any) => l.skill_id === ts.skills.id);
      return learning?.status === 'completed';
    }).length;

    const allRequiredSkillsCompleted = requiredSkillsTotal === 0 || requiredSkillsCompleted === requiredSkillsTotal;

    return { requiredSkillsTotal, requiredSkillsCompleted, allRequiredSkillsCompleted };
  } catch (error) {
    console.error('获取必学技能状态失败:', error);
    return { requiredSkillsTotal: 0, requiredSkillsCompleted: 0, allRequiredSkillsCompleted: true };
  }
}

/**
 * 从任务组中选择对应难度的变体
 * 优先级：偏好难度 → medium → 任意可用
 */
function selectVariantFromGroup(
  groupVariants: any[],
  preferredDifficulty: string
): any | null {
  if (groupVariants.length === 0) return null;

  // 优先匹配偏好难度
  const preferred = groupVariants.find(t => (t.difficulty || 'medium') === preferredDifficulty);
  if (preferred) return preferred;

  // 回退到中等难度
  if (preferredDifficulty !== 'medium') {
    const medium = groupVariants.find(t => (t.difficulty || 'medium') === 'medium');
    if (medium) return medium;
  }

  // 回退到任意
  return groupVariants[0];
}

/**
 * 将任务列表按 task_group_id 分组
 * 返回有序的任务组数组，每组包含该组的所有难度变体
 */
function groupTasksByGroupId(tasks: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  
  for (const task of tasks) {
    const groupId = task.task_group_id || task.id; // 向后兼容：没有 task_group_id 时用自身 id
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId)!.push(task);
  }
  
  return groups;
}

export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取小队信息（包含周期和偏好难度）
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, current_theme_id, current_task_id, next_task_deadline, points, cycle, preferred_difficulty')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    const currentCycle = team.cycle || 1;
    const teamPoints = team.points || 0;

    // 检查是否超时
    let isDeadlineExpired = false;
    if (team.next_task_deadline) {
      isDeadlineExpired = new Date(team.next_task_deadline) < new Date();
    }

    // 1. 先检查是否有未完成的支线任务
    const { data: sideTasks, error: sideTasksError } = await client
      .from('team_side_tasks')
      .select(`
        id,
        task_id,
        status,
        assigned_at,
        tasks (
          id,
          theme_id,
          stage,
          title,
          description,
          requirements,
          learning_goals,
          points,
          task_type,
          difficulty
        )
      `)
      .eq('team_id', teamId)
      .in('status', ['assigned', 'in_progress'])
      .order('assigned_at', { ascending: true });

    if (sideTasksError) {
      console.error('获取支线任务失败:', sideTasksError);
    }

    // 如果有未完成的支线任务，返回第一个
    if (sideTasks && sideTasks.length > 0) {
      const sideTask = sideTasks[0];
      const task = sideTask.tasks as any;
      
      if (task) {
        const skillsStatus = await getRequiredSkillsStatus(client, task.id, teamId, currentCycle);
        
        // 获取支线任务的待审核提交
        const { data: sidePendingSubmission } = await client
          .from('task_submissions')
          .select('id, status')
          .eq('team_id', teamId)
          .eq('task_id', task.id)
          .eq('cycle', currentCycle)
          .in('status', ['pending', 'approved', 'excellent', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(1);

        const sideHasSubmission = sidePendingSubmission && sidePendingSubmission.length > 0;

        return NextResponse.json({
          task: {
            ...task,
            isSideTask: true,
            sideTaskId: sideTask.id,
            sideTaskStatus: sideTask.status,
            assignedAt: sideTask.assigned_at,
            nextTaskDeadline: team.next_task_deadline,
            isDeadlineExpired,
            ...skillsStatus,
            hasSubmission: sideHasSubmission,
            submissionId: sideHasSubmission ? sidePendingSubmission[0].id : null,
          },
          teamPoints
        });
      }
    }

    // 2. 没有支线任务，获取主线任务
    if (!team.current_theme_id) {
      return NextResponse.json({ 
        task: null,
        message: '小队尚未选择主题',
        teamPoints
      });
    }

    const preferredDifficulty = team.preferred_difficulty || 'medium';

    // 获取当前主题下的所有主线任务（含 task_group_id 和 difficulty）
    const { data: mainTasks, error: mainTasksError } = await client
      .from('tasks')
      .select(`
        id,
        theme_id,
        stage,
        title,
        description,
        requirements,
        learning_goals,
        points,
        task_type,
        difficulty,
        task_group_id,
        order_index
      `)
      .eq('theme_id', team.current_theme_id)
      .eq('task_type', 'main')
      .eq('is_active', true)
      .order('stage', { ascending: true })
      .order('order_index', { ascending: true });

    if (mainTasksError || !mainTasks) {
      return NextResponse.json({ 
        task: null,
        message: '获取任务失败',
        teamPoints
      });
    }

    // 获取小队已完成的任务提交（按周期过滤）
    const { data: completedTasks, error: completedError } = await client
      .from('task_submissions')
      .select('task_id')
      .eq('team_id', teamId)
      .eq('cycle', currentCycle)
      .in('status', ['approved', 'excellent']);

    if (completedError) {
      console.error('获取已完成任务失败:', completedError);
    }

    const completedTaskIds = new Set((completedTasks || []).map((s: any) => s.task_id));

    // 按任务组分组
    const taskGroups = groupTasksByGroupId(mainTasks);
    
    // 将 Map 转为有序数组（保留插入顺序，即 stage+order_index 排序）
    const orderedGroups = Array.from(taskGroups.entries());

    // 判断一个任务组是否已完成：组内任一变体被完成即视为完成
    const isGroupCompleted = (variants: any[]): boolean => {
      return variants.some(v => completedTaskIds.has(v.id));
    };

    // 找到下一个未完成的任务组
    let nextTask = null;
    let nextGroupId = null;
    let availableDifficulties: string[] = [];
    for (const [groupId, variants] of orderedGroups) {
      if (!isGroupCompleted(variants)) {
        nextGroupId = groupId;
        nextTask = selectVariantFromGroup(variants, preferredDifficulty);
        // 收集该任务组中实际存在的难度等级
        availableDifficulties = variants
          .map(v => v.difficulty || 'medium')
          .filter((d, i, arr) => arr.indexOf(d) === i); // 去重
        break;
      }
    }

    // 如果所有主线任务组都完成了，检查是否有最后任务（从 final_task_forms 获取）
    if (!nextTask) {
      // 获取主题关联的最后任务表单
      const { data: theme, error: themeError } = await client
        .from('task_themes')
        .select('id, name, final_task_form_id, guider_form_id, light_mage_form_id, secret_scholar_form_id')
        .eq('id', team.current_theme_id)
        .single();

      if (!themeError && theme) {
        // 检查是否有任何角色表单或通用表单
        const hasFormConfig = theme.guider_form_id || theme.light_mage_form_id || theme.secret_scholar_form_id || theme.final_task_form_id;
        
        if (hasFormConfig) {
          // 检查最后任务是否已完成（检查 final_task_submissions 中是否所有成员都已提交）
          const { data: members } = await client
            .from('team_members')
            .select('id')
            .eq('team_id', teamId);

          const memberCount = (members || []).length;
          
          const { count: submittedCount } = await client
            .from('final_task_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .eq('theme_id', team.current_theme_id)
            .eq('cycle', currentCycle);

          const allMembersSubmitted = memberCount > 0 && (submittedCount || 0) >= memberCount;

          if (!allMembersSubmitted) {
            // 返回合成的最后任务对象
            nextTask = {
              id: `final-${team.current_theme_id}`, // 合成ID，用于前端路由
              theme_id: team.current_theme_id,
              stage: 999,
              title: '最后任务',
              description: '所有成员完成反馈表单后，任务自动完成',
              requirements: ['小队所有成员都需填写对应身份的反馈表单'],
              learning_goals: ['完成项目反馈'],
              points: 0,
              task_type: 'final',
              difficulty: 'medium',
              task_group_id: null,
            };
          }
        }
      }
    }

    // 如果仍然没有任务，返回提示信息
    if (!nextTask) {
      return NextResponse.json({
        task: null,
        message: '当前主题所有任务已完成',
        teamPoints
      });
    }

    // 获取必学技能完成状态（按周期过滤）
    const skillsStatus = await getRequiredSkillsStatus(client, nextTask.id, teamId, currentCycle);

    // 获取当前任务的待审核提交（用于银蛇博士评价）
    const { data: pendingSubmission } = await client
      .from('task_submissions')
      .select('id, content, file_urls, status, created_at')
      .eq('team_id', teamId)
      .eq('task_id', nextTask.id)
      .eq('cycle', currentCycle)
      .in('status', ['pending', 'approved', 'excellent', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(1);

    const hasSubmittedSubmission = pendingSubmission && pendingSubmission.length > 0;

    return NextResponse.json({
      task: {
        ...nextTask,
        isSideTask: false,
        nextTaskDeadline: team.next_task_deadline,
        isDeadlineExpired,
        ...skillsStatus,
        hasSubmission: hasSubmittedSubmission,
        submissionId: hasSubmittedSubmission ? pendingSubmission[0].id : null,
      },
      teamPoints,
      preferredDifficulty,
      availableDifficulties
    });
  } catch (error) {
    console.error('获取当前任务失败:', error);
    return safeError(error);
  }
}
