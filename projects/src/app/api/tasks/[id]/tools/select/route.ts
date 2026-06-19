import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 获取任务的工具列表（含库存和选择状态）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const client = getSupabaseClient();

    // 获取任务关联的工具
    const { data: taskTools, error } = await client
      .from('task_tools')
      .select(`
        id,
        is_required,
        tools (
          id,
          name,
          description,
          icon,
          category,
          image_url,
          nature,
          team_limit
        )
      `)
      .eq('task_id', taskId);

    if (error) {
      return supabaseErrorResponse(error, '获取任务工具失败');
    }

    // 如果没有提供teamId，直接返回工具列表
    if (!teamId) {
      return NextResponse.json({ 
        tools: (taskTools || []).map(tt => ({
          ...tt,
          stock: 999,
          used: 0,
          remaining: 999,
          isSelected: false,
        }))
      });
    }

    // 获取小队信息
    const { data: team } = await client
      .from('teams')
      .select('id, school_id')
      .eq('id', teamId)
      .single();

    if (!team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 获取小队已选择的工具
    const { data: selectedTools } = await client
      .from('team_tools')
      .select('tool_id')
      .eq('team_id', teamId)
      .eq('task_id', taskId);

    const selectedToolIds = new Set((selectedTools || []).map(t => t.tool_id));

    // 获取学校内各工具的使用情况
    const result = [];
    for (const tt of (taskTools || [])) {
      const tool = tt.tools as any;
      if (!tool) continue;

      const isPhysical = tool.nature === 'physical';
      const teamLimit = tool.team_limit || 1;
      let stock = 999; // 默认无限制
      let used = 0;
      let remaining = 999;

      // 如果有学校ID，查询学校工具库存
      if (team.school_id) {
        const { data: schoolTool } = await client
          .from('school_tools')
          .select('stock, used')
          .eq('school_id', team.school_id)
          .eq('tool_id', tool.id)
          .single();

        if (schoolTool) {
          stock = schoolTool.stock || 0;
          // 查询已选择该工具的小队数量（同一任务组去重：同小队在组内不同任务选同一工具只计1次）
          // 先获取当前任务的 task_group_id
          const { data: currentTask } = await client
            .from('tasks')
            .select('task_group_id')
            .eq('id', taskId)
            .single();
          
          used = 0;
          if (currentTask?.task_group_id) {
            // 获取同组所有任务ID
            const { data: siblingTasks } = await client
              .from('tasks')
              .select('id')
              .eq('task_group_id', currentTask.task_group_id)
              .eq('is_active', true);
            
            const siblingTaskIds = (siblingTasks || []).map(t => t.id);
            if (siblingTaskIds.length > 0) {
              // 查询同组任务中选择了该工具的不同小队数量（去重）
              const { data: distinctTeams } = await client
                .from('team_tools')
                .select('team_id')
                .in('task_id', siblingTaskIds)
                .eq('tool_id', tool.id);
              
              // 去重计算小队数
              const uniqueTeamIds = new Set((distinctTeams || []).map(t => t.team_id));
              used = uniqueTeamIds.size;
            }
          } else {
            // 无任务组时按原逻辑
            const { count } = await client
              .from('team_tools')
              .select('id', { count: 'exact', head: true })
              .eq('tool_id', tool.id)
              .eq('task_id', taskId);
            used = count || 0;
          }
          
          // 计算剩余库存
          // 实物工具：剩余库存 = 总库存 - (已选择小队数 × 小队领用量)
          // 虚拟工具：剩余库存为 999（无限制）
          if (isPhysical && stock !== 999) {
            const usedAmount = used * teamLimit;
            remaining = Math.max(0, stock - usedAmount);
          } else {
            remaining = 999;
          }
        }
      }

      result.push({
        ...tt,
        tools: tool,
        stock,
        used,
        remaining,
        isSelected: selectedToolIds.has(tool.id),
        nature: tool.nature || 'physical',
        teamLimit: tool.team_limit,
      });
    }

    return NextResponse.json({ tools: result });
  } catch (error) {
    console.error('获取任务工具错误:', error);
    return ApiErrors.validation('获取任务工具失败');
  }
}

/**
 * 小队选择/取消选择工具
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id: taskId } = await params;
    const body = await request.json();
    const { teamId, toolId, action = 'select' } = body; // action: 'select' | 'deselect'
    const client = getSupabaseClient();

    if (!teamId || !toolId) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 检查工具是否是任务的必选工具，同时获取工具信息
    const { data: taskTool } = await client
      .from('task_tools')
      .select(`
        is_required,
        tools (
          id,
          nature,
          team_limit
        )
      `)
      .eq('task_id', taskId)
      .eq('tool_id', toolId)
      .single();

    if (!taskTool) {
      return ApiErrors.validation('该工具不属于当前任务');
    }

    // 获取工具属性
    const toolInfo = taskTool.tools as any;
    const isPhysical = toolInfo?.nature === 'physical';
    const teamLimit = toolInfo?.team_limit || 1; // 小队领用量，默认1

    // 必选工具自动选择，不能取消
    if (taskTool.is_required && action === 'deselect') {
      return ApiErrors.validation('必选工具不能取消选择');
    }

    // 处理选择/取消选择
    if (action === 'select') {
      // 检查是否已选择
      const { data: existing } = await client
        .from('team_tools')
        .select('id')
        .eq('team_id', teamId)
        .eq('task_id', taskId)
        .eq('tool_id', toolId)
        .single();

      if (existing) {
        return NextResponse.json({ success: true, message: '该工具已选择' });
      }

      // 检查库存（实体工具都需要检查库存，无论是否必选）
      if (isPhysical) {
        const { data: team } = await client
          .from('teams')
          .select('school_id')
          .eq('id', teamId)
          .single();

        if (team?.school_id) {
          const { data: schoolTool } = await client
            .from('school_tools')
            .select('stock')
            .eq('school_id', team.school_id)
            .eq('tool_id', toolId)
            .single();

          // 实物工具有库存限制时，检查剩余库存（同一任务组去重）
          if (schoolTool && schoolTool.stock && schoolTool.stock !== 999) {
            // 先获取当前任务的 task_group_id
            const { data: currentTask } = await client
              .from('tasks')
              .select('task_group_id')
              .eq('id', taskId)
              .single();
            
            let usedCount = 0;
            if (currentTask?.task_group_id) {
              // 获取同组所有任务ID
              const { data: siblingTasks } = await client
                .from('tasks')
                .select('id')
                .eq('task_group_id', currentTask.task_group_id)
                .eq('is_active', true);
              
              const siblingTaskIds = (siblingTasks || []).map(t => t.id);
              if (siblingTaskIds.length > 0) {
                // 查询同组任务中选择了该工具的不同小队数量（去重）
                const { data: distinctTeams } = await client
                  .from('team_tools')
                  .select('team_id')
                  .in('task_id', siblingTaskIds)
                  .eq('tool_id', toolId);
                
                const uniqueTeamIds = new Set((distinctTeams || []).map(t => t.team_id));
                usedCount = uniqueTeamIds.size;
              }
            } else {
              // 无任务组时按原逻辑
              const { count } = await client
                .from('team_tools')
                .select('id', { count: 'exact', head: true })
                .eq('tool_id', toolId)
                .eq('task_id', taskId);
              usedCount = count || 0;
            }

            // 计算剩余库存 = 总库存 - (已选择小队数 × 小队领用量)
            const usedAmount = usedCount * teamLimit;
            const remaining = schoolTool.stock - usedAmount;

            // 剩余库存不足一个小队领用量时，不能选择
            if (remaining < teamLimit) {
              return ApiErrors.validation('该工具库存不足，暂无法选择');
            }
          }
        }
      }

      // 添加选择记录
      const { error } = await client
        .from('team_tools')
        .insert({
          team_id: teamId,
          task_id: taskId,
          tool_id: toolId,
        });

      if (error) {
        // 如果表不存在，返回友好提示
        if (error.message.includes('does not exist')) {
          return ApiErrors.validation('工具选择功能尚未初始化，请联系管理员');
        }
        return supabaseErrorResponse(error, '选择工具失败');
      }

      // 如果是实物工具，查询链接的技能并自动添加学习记录
      let linkedSkills: any[] = [];
      if (isPhysical && !taskTool.is_required) {
        // 获取工具链接的技能
        const { data: toolSkills } = await client
          .from('tool_skills')
          .select(`
            skill_id,
            is_auto_add,
            skills (
              id,
              name,
              icon,
              category
            )
          `)
          .eq('tool_id', toolId);

        if (toolSkills && toolSkills.length > 0) {
          linkedSkills = toolSkills
            .filter(ts => ts.is_auto_add && ts.skills)
            .map(ts => ts.skills);

          // 为每个链接技能创建学习记录
          for (const ts of toolSkills) {
            if (ts.is_auto_add && ts.skill_id) {
              // 检查是否已存在学习记录
              const { data: existingLearning } = await client
                .from('team_skill_learnings')
                .select('id')
                .eq('team_id', teamId)
                .eq('skill_id', ts.skill_id)
                .eq('task_id', taskId)
                .single();

              if (!existingLearning) {
                await client
                  .from('team_skill_learnings')
                  .insert({
                    team_id: teamId,
                    skill_id: ts.skill_id,
                    task_id: taskId,
                    status: 'not_started',
                  });
              }
            }
          }
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: '工具选择成功',
        linkedSkills,
        teamLimit: isPhysical ? teamLimit : undefined,
      });

    } else if (action === 'deselect') {
      // 如果是实物工具，先查询链接的技能
      let linkedSkillIds: string[] = [];
      if (isPhysical) {
        const { data: toolSkills } = await client
          .from('tool_skills')
          .select('skill_id, is_auto_add')
          .eq('tool_id', toolId)
          .eq('is_auto_add', true);

        linkedSkillIds = (toolSkills || [])
          .filter(ts => ts.skill_id)
          .map(ts => ts.skill_id);
      }

      // 取消选择工具
      const { error } = await client
        .from('team_tools')
        .delete()
        .eq('team_id', teamId)
        .eq('task_id', taskId)
        .eq('tool_id', toolId);

      if (error) {
        return supabaseErrorResponse(error, '取消选择失败');
      }

      // 如果是实物工具，删除链接的技能学习记录（仅删除未开始学习的）
      if (isPhysical && linkedSkillIds.length > 0) {
        for (const skillId of linkedSkillIds) {
          await client
            .from('team_skill_learnings')
            .delete()
            .eq('team_id', teamId)
            .eq('skill_id', skillId)
            .eq('task_id', taskId)
            .eq('status', 'not_started'); // 只删除未开始学习的记录
        }
      }

      return NextResponse.json({ success: true, message: '已取消选择该工具' });
    }

    return ApiErrors.validation('无效的操作');
  } catch (error) {
    console.error('工具选择错误:', error);
    return ApiErrors.validation('操作失败');
  }
}
