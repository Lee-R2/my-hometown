import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 检查用户是否有权限操作任务
async function checkTaskPermission(
  client: any,
  taskId: string,
  userId: string,
  userRole: string,
  action: 'edit' | 'delete'
): Promise<{ allowed: boolean; error?: string; task?: any }> {
  // 超级管理员有所有权限
  if (userRole === 'admin' || userRole === 'super_admin') {
    const { data: task } = await client
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    return { allowed: true, task };
  }

  // 志愿者和助学老师只能操作本校专属主题的任务
  if (userRole === 'volunteer' || userRole === 'teacher') {
    // 获取用户信息
    const { data: user, error: userError } = await client
      .from('users')
      .select('school_id, cycle')
      .eq('id', userId)
      .single();

    if (userError || !user?.school_id) {
      return { allowed: false, error: '您没有关联的学校' };
    }

    // 获取任务信息
    const { data: task, error: taskError } = await client
      .from('tasks')
      .select('*, theme_id')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { allowed: false, error: '任务不存在' };
    }

    // 获取主题信息
    const { data: theme, error: themeError } = await client
      .from('task_themes')
      .select('school_id, is_exclusive')
      .eq('id', task.theme_id)
      .single();

    if (themeError || !theme) {
      return { allowed: false, error: '主题不存在' };
    }

    // 检查主题是否关联了用户的学校
    // 1. 首先检查 school_id 字段（单学校关联）
    if (theme.school_id && theme.school_id === user.school_id) {
      return { allowed: true, task };
    }

    // 2. 检查 theme_schools 表（多学校关联）
    const { data: themeSchools, error: tsError } = await client
      .from('theme_schools')
      .select('school_id, cycle')
      .eq('theme_id', task.theme_id);

    if (tsError) {
      console.error('查询主题学校关联失败:', tsError);
    }

    // 如果主题没有关联任何学校，说明是全局主题
    if (!theme.school_id && (!themeSchools || themeSchools.length === 0)) {
      return { allowed: false, error: '全局主题的任务只能查看，无法编辑或删除' };
    }

    // 检查用户学校是否在关联学校列表中
    const userSchoolInTheme = themeSchools?.some((ts: { school_id: string }) => ts.school_id === user.school_id);
    
    if (!userSchoolInTheme && theme.school_id !== user.school_id) {
      return { allowed: false, error: '您没有权限操作此任务（非本校专属主题）' };
    }

    return { allowed: true, task };
  }

  return { allowed: false, error: '无权限' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId'); // 当前小队ID，用于查询工具选择状态
    const client = getSupabaseClient();

    // 检查是否为合成最后任务ID（final-{themeId}）
    if (id.startsWith('final-')) {
      const themeId = id.substring(6);
      
      // 从 final_task_forms 获取最后任务信息
      const { data: theme, error: themeError } = await client
        .from('task_themes')
        .select('id, name, description, icon, final_task_form_id, guider_form_id, light_mage_form_id, secret_scholar_form_id')
        .eq('id', themeId)
        .single();

      if (themeError || !theme) {
        return ApiErrors.notFound('主题不存在');
      }

      // 构造合成的最后任务对象
      const finalTask = {
        id: id,
        title: '最后任务 - 反馈表单',
        description: `请所有队员完成反馈表单提交。完成所有成员的反馈后，本主题探索即告完成。`,
        task_type: 'final',
        theme_id: themeId,
        stage: 999,
        order_index: 999,
        points: 0,
        is_active: true,
        themes: { id: theme.id, name: theme.name, description: theme.description, icon: theme.icon },
        skills: [],
        tools: [],
        rewards: [],
        task_skills: [],
        task_tools: [],
        task_rewards: [],
      };

      return NextResponse.json({ task: finalTask });
    }

    // 1. 获取任务详情
    const { data: task, error: taskError } = await client
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return ApiErrors.notFound('任务不存在');
    }

    // 1.1 获取关联主题信息
    let themeData: { id: string; name: string; description: string; icon: string } | null = null;
    if (task.theme_id) {
      const { data: themeResult } = await client
        .from('task_themes')
        .select('id, name, description, icon')
        .eq('id', task.theme_id)
        .single();
      themeData = themeResult;
    }
    (task as any).themes = themeData;

    // 2. 获取关联技能详情
    const { data: taskSkills, error: taskSkillsError } = await client
      .from('task_skills')
      .select(`
        id,
        is_required,
        points,
        skills (
          id,
          name,
          description,
          icon,
          category,
          content,
          video_url
        )
      `)
      .eq('task_id', id);

    if (taskSkillsError) {
      console.error('获取技能关联失败:', taskSkillsError);
    }

    // 处理技能数据（保持与前端期望的嵌套结构一致）
    const skills = (taskSkills || []).map((ts: any) => ({
      id: ts.id,
      is_required: ts.is_required,
      points: ts.points,
      skills: {
        id: ts.skills?.id,
        name: ts.skills?.name,
        description: ts.skills?.description,
        icon: ts.skills?.icon,
        category: ts.skills?.category,
        content: ts.skills?.content,
        video_url: ts.skills?.video_url,
        learning_materials: ts.skills?.learning_materials,
      },
    }));

    // 3. 获取关联工具
    const { data: taskTools, error: taskToolsError } = await client
      .from('task_tools')
      .select(`
        id,
        is_required,
        tools (
          id,
          name,
          description,
          icon,
          category
        )
      `)
      .eq('task_id', id);

    if (taskToolsError) {
      console.error('获取工具关联失败:', taskToolsError);
    }

    // 处理工具数据
    const tools = (taskTools || []).map((tt: any) => ({
      id: tt.tools?.id,
      name: tt.tools?.name,
      description: tt.tools?.description,
      icon: tt.tools?.icon,
      category: tt.tools?.category,
      isRequired: tt.is_required,
    }));

    // 3.5 获取关联激励
    const { data: taskRewards, error: taskRewardsError } = await client
      .from('task_rewards')
      .select(`
        id,
        reward_id,
        rewards (
          id,
          name,
          description,
          icon,
          type,
          points,
          distribution_method
        )
      `)
      .eq('task_id', id);

    if (taskRewardsError) {
      console.error('获取激励关联失败:', taskRewardsError);
    }

    // 处理激励数据
    const rewards = (taskRewards || []).map((tr: any) => ({
      id: tr.rewards?.id,
      name: tr.rewards?.name,
      description: tr.rewards?.description,
      icon: tr.rewards?.icon,
      type: tr.rewards?.type,
      points: tr.rewards?.points,
      distribution_method: tr.rewards?.distribution_method,
      linkId: tr.id,
    }));

    // 4. 获取小队当前任务的截止日期
    let nextTaskDeadline: string | null = null;
    let currentCycle = 1;
    
    if (teamId) {
      // 获取小队当前任务截止日期和周期
      const { data: teamData } = await client
        .from('teams')
        .select('next_task_deadline, cycle')
        .eq('id', teamId)
        .single();

      if (teamData) {
        nextTaskDeadline = teamData.next_task_deadline;
        currentCycle = teamData.cycle || 1;
      }
      
      // 获取当前任务中的技能学习状态（按周期过滤）
      const { data: learnings } = await client
        .from('team_skill_learnings')
        .select('skill_id, status, points_earned, cycle')
        .eq('cycle', currentCycle)
        .eq('team_id', teamId)
        .eq('task_id', id);
      const skillLearnings = learnings || [];
      
      // 处理技能数据，判断是否为必学技能（按当前周期判断）
      // 逻辑：本周期内没有学过的技能为必学，本周期内已学过的为可选
      const processedSkills = (taskSkills || []).map((ts: any) => {
        const skillId = (ts.skills as any)?.id;
        const currentTaskLearning = skillLearnings.find((l: any) => l.skill_id === skillId);
        
        // 判断是否为必学技能（原始设置）
        // is_required_original: 任务设置中标记为必学
        // is_required: 本周期内未完成的必学技能（用于前端显示"必学"徽章）
        const hasLearnedInCurrentCycle = currentTaskLearning?.status === 'completed';
        const isRequiredOriginal = ts.is_required; // 原始必学设置
        const isRequiredForCurrentCycle = ts.is_required && !hasLearnedInCurrentCycle; // 当前周期需要学习的
        
        // 返回嵌套结构，与前端期望一致
        return {
          id: ts.id,
          status: currentTaskLearning?.status || 'not_started',
          points: ts.points,
          points_earned: currentTaskLearning?.points_earned || 0,
          is_required: isRequiredForCurrentCycle, // 用于前端显示"必学/可选"徽章
          is_required_original: isRequiredOriginal, // 保留原始设置
          skills: {
            id: (ts.skills as any)?.id,
            name: (ts.skills as any)?.name,
            description: (ts.skills as any)?.description,
            icon: (ts.skills as any)?.icon,
            category: (ts.skills as any)?.category,
            content: (ts.skills as any)?.content,
            video_url: (ts.skills as any)?.video_url,
            learning_materials: (ts.skills as any)?.learning_materials,
          },
        };
      });

      // 计算必学技能完成状态（基于原始必学设置）
      const totalRequiredSkills = processedSkills.filter((s: any) => s.is_required_original).length;
      const completedRequiredSkills = processedSkills.filter((s: any) => s.is_required_original && s.status === 'completed').length;
      const allRequiredCompleted = totalRequiredSkills === 0 || completedRequiredSkills === totalRequiredSkills;

      // 获取小队对工具的选择状态（仅返回当前任务的工具）
      const toolIds = (taskTools || []).map((tt: any) => tt.tools?.id);
      let selectedTools: string[] = [];
      
      if (toolIds.length > 0) {
        const { data: toolSelections } = await client
          .from('team_tool_selections')
          .select('tool_id')
          .eq('team_id', teamId)
          .eq('task_id', id);
        
        selectedTools = (toolSelections || []).map((ts: any) => ts.tool_id);
      }

      // 返回包含小队特定信息的数据（保持与前端期望的嵌套结构一致）
      return NextResponse.json({
        task: {
          ...task,
          skills: processedSkills,
          tools: taskTools?.map((tt: any) => ({
            id: tt.id,
            is_required: tt.is_required,
            isSelected: selectedTools.includes(tt.tools?.id),
            nature: tt.tools?.nature || 'physical',
            stock: tt.tools?.stock,
            remaining: tt.tools?.remaining,
            tools: {
              id: tt.tools?.id,
              name: tt.tools?.name,
              description: tt.tools?.description,
              icon: tt.tools?.icon,
              category: tt.tools?.category,
              nature: tt.tools?.nature || 'physical',
              stock: tt.tools?.stock,
              stock_quantity: tt.tools?.stock_quantity,
              remaining: tt.tools?.remaining,
              needs_return: tt.tools?.needs_return,
              team_limit: tt.tools?.team_limit,
            },
          })),
          rewards,
          nextTaskDeadline,
          currentCycle,
          // 添加必学技能完成状态（基于原始必学设置）
          requiredSkillsTotal: totalRequiredSkills,
          requiredSkillsCompleted: completedRequiredSkills,
          allRequiredSkillsCompleted: allRequiredCompleted,
        },
      });
    }

    // 返回不包含小队特定信息的数据（保持与前端期望的嵌套结构一致）
    return NextResponse.json({
      task: {
        ...task,
        skills,
        tools: taskTools?.map((tt: any) => ({
          id: tt.id,
          is_required: tt.is_required,
          nature: tt.tools?.nature || 'physical',
          stock: tt.tools?.stock,
          remaining: tt.tools?.remaining,
          tools: {
            id: tt.tools?.id,
            name: tt.tools?.name,
            description: tt.tools?.description,
            icon: tt.tools?.icon,
            category: tt.tools?.category,
            nature: tt.tools?.nature || 'physical',
            stock: tt.tools?.stock,
            stock_quantity: tt.tools?.stock_quantity,
            remaining: tt.tools?.remaining,
            needs_return: tt.tools?.needs_return,
            team_limit: tt.tools?.team_limit,
          },
        })),
        rewards,
        nextTaskDeadline,
        requiredSkillsTotal: skills.filter((s: any) => s.is_required).length,
        requiredSkillsCompleted: skills.filter((s: any) => s.is_required && s.status === 'completed').length,
        allRequiredSkillsCompleted: skills.filter((s: any) => s.is_required).every((s: any) => s.status === 'completed'),
      },
    });
  } catch (error) {
    console.error('获取任务详情失败:', error);
    return ApiErrors.validation('获取任务详情失败');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    // 从 body 中提取权限字段和关联字段，避免传入 tasks 表不存在的列
    const { skills, tools, themes, theme_id, ...updateData } = body;
    // 身份从认证令牌获取，防止客户端伪造
    const effectiveUserId = auth.payload!.userId;
    const effectiveUserRole = auth.payload!.role;

    // 验证权限
    const permission = await checkTaskPermission(client, id, effectiveUserId, effectiveUserRole, 'edit');
    if (!permission.allowed) {
      return ApiErrors.forbidden(permission.error || '无权限');
    }

    // 映射驼峰字段名为数据库列名
    const dbUpdateData: Record<string, any> = {};
    if (updateData.taskType !== undefined) { dbUpdateData.task_type = updateData.taskType; delete updateData.taskType; }
    if (updateData.learningGoals !== undefined) { dbUpdateData.learning_goals = updateData.learningGoals; delete updateData.learningGoals; }
    if (updateData.groupName !== undefined) { dbUpdateData.group_name = updateData.groupName; delete updateData.groupName; }
    if (updateData.groupDescription !== undefined) { dbUpdateData.group_description = updateData.groupDescription; delete updateData.groupDescription; }
    Object.assign(dbUpdateData, updateData);

    // 更新任务基本信息
    const { error: taskError } = await client
      .from('tasks')
      .update(dbUpdateData)
      .eq('id', id);

    if (taskError) {
      return supabaseErrorResponse(taskError, '更新任务失败');
    }

    // 如果提供了技能关联，更新技能关联
    if (skills !== undefined) {
      // 删除现有关联
      await client.from('task_skills').delete().eq('task_id', id);

      // 添加新关联
      if (skills.length > 0) {
        const skillInserts = skills.map((skill: any) => ({
          task_id: id,
          skill_id: skill.skill_id,
          is_required: skill.is_required ?? false,
          points: skill.points ?? 5,
        }));

        const { error: skillsError } = await client
          .from('task_skills')
          .insert(skillInserts);

        if (skillsError) {
          console.error('更新技能关联失败:', skillsError);
        }
      }
    }

    // 如果提供了工具关联，更新工具关联
    if (tools !== undefined) {
      // 删除现有关联
      await client.from('task_tools').delete().eq('task_id', id);

      // 添加新关联
      if (tools.length > 0) {
        const toolInserts = tools.map((tool: any) => ({
          task_id: id,
          tool_id: tool.tool_id,
          is_required: tool.is_required ?? false,
        }));

        const { error: toolsError } = await client
          .from('task_tools')
          .insert(toolInserts);

        if (toolsError) {
          console.error('更新工具关联失败:', toolsError);
        }
      }
    }

    // requirements 和 learning_goals 现在按任务独立，不再自动同步到同组

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新任务失败:', error);
    return ApiErrors.validation('更新任务失败');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();
    // 身份从认证令牌获取，防止客户端伪造
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;

    // 验证权限
    const permission = await checkTaskPermission(client, id, userId, userRole, 'delete');
    if (!permission.allowed) {
      return ApiErrors.forbidden(permission.error || '无权限');
    }

    // 删除任务（级联删除关联的技能和工具）
    const { error: deleteError } = await client
      .from('tasks')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return supabaseErrorResponse(deleteError, '删除任务失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除任务失败:', error);
    return ApiErrors.validation('删除任务失败');
  }
}
