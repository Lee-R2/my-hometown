import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取最后任务反馈表单的提交状态
 * GET /api/team/final-task-feedback?teamId=xxx&taskId=xxx
 *
 * DB列名映射:
 *   final_task_forms.role → team_role (前端)
 *   final_task_forms.title → name (前端)
 *   final_task_forms.fields → form_config (前端)
 *   final_task_forms.school_id IS NULL → is_global = true (前端)
 */
function mapFormToFrontend(dbRow: any) {
  return {
    id: dbRow.id,
    name: dbRow.title || '',
    description: dbRow.description || '',
    icon: dbRow.icon || '🏆',
    is_global: dbRow.is_global ?? (dbRow.school_id === null),
    school_id: dbRow.school_id || null,
    team_role: dbRow.team_role || dbRow.role || null,
    form_config: dbRow.form_config || dbRow.fields || [],
    created_at: dbRow.created_at,
    updated_at: dbRow.updated_at || dbRow.created_at,
    is_active: dbRow.is_active ?? true,
  };
}

export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const teamId = auth.payload!.userId;
    const taskId = searchParams.get('taskId');

    if (!teamId || !taskId) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 获取小队当前周期
    const { data: teamData } = await client
      .from('teams')
      .select('cycle, current_theme_id')
      .eq('id', teamId)
      .single();
    const currentCycle = teamData?.cycle || 1;

    // 解析 theme_id：taskId 可能是合成ID（final-{themeId}）或真实UUID
    let themeId: string | null = null;

    if (taskId.startsWith('final-')) {
      themeId = taskId.substring(6);
    } else {
      const { data: task, error: taskError } = await client
        .from('tasks')
        .select('id, task_type, theme_id')
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        return ApiErrors.notFound('任务不存在');
      }

      if (task.task_type !== 'final') {
        return ApiErrors.validation('不是最后任务');
      }
      themeId = task.theme_id;
    }

    // 获取主题关联的反馈表单
    // 兼容新旧schema：先尝试查询含表单ID列的schema，失败则用旧schema
    const { data: theme } = await client
      .from('task_themes')
      .select('*')
      .eq('id', themeId)
      .single();

    // 角色到表单字段的映射（新版schema）
    const roleToFormField: Record<string, string> = {
      'guider': 'guider_form_id',
      'light_mage': 'light_mage_form_id',
      'secret_scholar': 'secret_scholar_form_id',
    };

    // 收集需要查询的表单ID
    const formIds: string[] = [];
    const roleFormIdMap: Record<string, string | null> = {};

    if (theme) {
      // 新版：根据三个角色的表单ID字段获取
      for (const [role, fieldName] of Object.entries(roleToFormField)) {
        const formId = (theme as any)[fieldName];
        roleFormIdMap[role] = formId || null;
        if (formId) {
          formIds.push(formId);
        }
      }

      // 兼容旧版：如果有 final_task_form_id 但没有角色表单，使用旧表单
      if ((theme as any).final_task_form_id && formIds.length === 0) {
        formIds.push((theme as any).final_task_form_id);
      }
    }

    // 获取小队所有成员及其角色
    const { data: members, error: membersError } = await client
      .from('team_members')
      .select('id, name, role')
      .eq('team_id', teamId);

    if (membersError) {
      return ApiErrors.validation('获取小队成员失败');
    }

    // 查询所有需要的表单（使用 select * 避免列不存在的问题）
    let formConfigs: any[] = [];
    if (formIds.length > 0) {
      const { data: forms, error: formsError } = await client
        .from('final_task_forms')
        .select('*')
        .in('id', formIds);

      if (!formsError && forms) {
        formConfigs = forms;
      }
    }

    // 如果没有找到任何表单，尝试查找全局表单（兜底）
    // 兼容新旧schema：用 role 列（旧schema）或 team_role 列（新schema）
    if (formConfigs.length === 0) {
      const memberRoles = [...new Set((members || []).map(m => m.role || 'guider'))];

      // 先尝试新schema（is_global, is_active, team_role）
      const { data: globalForms, error: globalFormsError } = await client
        .from('final_task_forms')
        .select('*')
        .eq('is_global', true)
        .eq('is_active', true)
        .in('team_role', memberRoles);

      if (!globalFormsError && globalForms && globalForms.length > 0) {
        formConfigs = globalForms;
      } else {
        // 回退到旧schema：用 role 列，school_id IS NULL 表示全局
        const { data: legacyForms, error: legacyError } = await client
          .from('final_task_forms')
          .select('*')
          .is('school_id', null)
          .in('role', memberRoles);

        if (!legacyError && legacyForms && legacyForms.length > 0) {
          formConfigs = legacyForms;
        }
      }
    }

    if (formConfigs.length === 0) {
      return NextResponse.json({
        hasForm: false,
        message: '该主题未配置反馈表单'
      });
    }

    // 创建表单ID到表单配置的映射
    const formById = new Map(formConfigs.map(f => [f.id, f]));

    // ========== 获取小队上下文信息 ==========
    const { data: team } = await client
      .from('teams')
      .select('id, name, school_id, teacher_id, created_by')
      .eq('id', teamId)
      .single();

    let contextInfo = {
      teamName: team?.name || '',
      schoolName: '',
      volunteerName: '',
      teacherName: '',
    };

    if (team) {
      if (team.school_id) {
        const { data: school } = await client
          .from('schools')
          .select('name')
          .eq('id', team.school_id)
          .single();
        contextInfo.schoolName = school?.name || '';
      }

      if (team.teacher_id) {
        const { data: teacher } = await client
          .from('users')
          .select('name')
          .eq('id', team.teacher_id)
          .single();
        contextInfo.teacherName = teacher?.name || '';
      }

      if (team.created_by) {
        const { data: volunteer } = await client
          .from('users')
          .select('name')
          .eq('id', team.created_by)
          .single();
        contextInfo.volunteerName = volunteer?.name || '';
      }
    }

    // 获取已提交的反馈（按周期隔离）
    // 兼容新旧schema：先尝试含 task_id/cycle 列的查询，失败则用旧schema
    let submissions: any[] = [];
    const { data: newSubmissions, error: subError } = await client
      .from('final_task_submissions')
      .select('*')
      .eq('team_id', teamId)
      .eq('task_id', taskId)
      .eq('cycle', currentCycle);

    if (subError || !newSubmissions) {
      // 旧schema：没有 task_id/cycle 列，用 form_id 查询
      const formIdList = formConfigs.map(f => f.id);
      if (formIdList.length > 0) {
        const { data: legacySubmissions } = await client
          .from('final_task_submissions')
          .select('*')
          .eq('team_id', teamId)
          .in('form_id', formIdList);
        submissions = legacySubmissions || [];
      }
    } else {
      submissions = newSubmissions;
    }

    // 构建提交状态映射
    // 新schema用member_id，旧schema没有member_id，用form_id区分
    const submissionMap = new Map(
      (submissions || []).map(s => [
        s.member_id || s.form_id,
        s
      ])
    );

    // 根据成员角色确定每个成员应该填写哪个表单
    const memberStatus = members.map(member => {
      const memberRole = member.role || 'guider';
      const submission = submissionMap.get(member.id) || submissionMap.get(null);

      // 根据角色获取对应的表单ID
      const formId = roleFormIdMap[memberRole];
      const memberForm = formId ? formById.get(formId) : null;

      // 如果该角色没有配置表单，尝试使用旧版 final_task_form_id
      const fallbackForm = (theme as any)?.final_task_form_id ? formById.get((theme as any).final_task_form_id) : null;

      // 如果还没有，根据角色匹配表单的 role 字段
      const roleMatchForm = !memberForm && !fallbackForm
        ? formConfigs.find(f => (f.team_role || f.role) === memberRole)
        : null;

      const finalForm = memberForm || fallbackForm || roleMatchForm;

      // 如果找到表单，则该成员需要提交
      const needsToSubmit = !!finalForm;

      return {
        memberId: member.id,
        memberName: member.name,
        memberRole: memberRole,
        needsToSubmit,
        hasSubmitted: !!submission,
        submittedAt: submission?.submitted_at || null,
        formData: submission?.form_data || null,
        formId: finalForm?.id || null,
        formName: finalForm?.title || finalForm?.name || '',
        formIcon: finalForm?.icon || '🏆',
      };
    });

    // 计算完成状态
    const requiredMembers = memberStatus.filter(m => m.needsToSubmit);
    const submittedCount = requiredMembers.filter(m => m.hasSubmitted).length;
    const allSubmitted = requiredMembers.length > 0 && submittedCount === requiredMembers.length;

    // 返回所有表单配置（用于前端展示，映射字段名）
    const formsInfo = formConfigs.map(f => {
      const mapped = mapFormToFrontend(f);
      return {
        id: mapped.id,
        name: mapped.name,
        icon: mapped.icon,
        team_role: mapped.team_role,
        form_config: mapped.form_config,
      };
    });

    return NextResponse.json({
      hasForm: true,
      forms: formsInfo,
      roleFormIdMap,
      memberStatus,
      summary: {
        totalRequired: requiredMembers.length,
        submittedCount,
        allSubmitted,
      },
      contextInfo,
      cycle: currentCycle,
    });
  } catch (error) {
    console.error('获取反馈表单状态错误:', error);
    return safeError(error);
  }
}

/**
 * 提交反馈表单
 * POST /api/team/final-task-feedback
 */
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { teamId, taskId, memberId, memberRole, formId, formData } = body;

    // IDOR 防护：禁止为其他小队提交反馈
    if (teamId !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权为其他小队提交反馈');
    }

    if (!teamId || !taskId || !memberId || !formId) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 获取小队当前周期
    const { data: teamData } = await client
      .from('teams')
      .select('cycle')
      .eq('id', teamId)
      .single();
    const currentCycle = teamData?.cycle || 1;

    // 解析 taskId
    const isSyntheticId = taskId.startsWith('final-');

    if (!isSyntheticId) {
      const { data: task, error: taskError } = await client
        .from('tasks')
        .select('id, task_type')
        .eq('id', taskId)
        .single();

      if (taskError || !task || task.task_type !== 'final') {
        return ApiErrors.validation('任务无效');
      }
    }

    // 验证成员是否存在
    const { data: member, error: memberError } = await client
      .from('team_members')
      .select('id, role, team_id')
      .eq('id', memberId)
      .eq('team_id', teamId)
      .single();

    if (memberError || !member) {
      return ApiErrors.validation('成员不存在');
    }

    // 插入或更新提交记录
    // 先尝试新schema（含 task_id, member_id, form_data, cycle 列）
    const upsertData: Record<string, any> = {
      team_id: teamId,
      task_id: taskId,
      member_id: memberId,
      member_role: memberRole || member.role || 'guider',
      form_id: formId,
      form_data: formData,
      cycle: currentCycle,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('final_task_submissions')
      .upsert(upsertData, {
        onConflict: 'team_id,task_id,member_id,cycle',
      })
      .select()
      .single();

    if (error) {
      console.error('提交反馈失败 (新schema):', error.message);

      // 如果是因为列不存在，尝试旧schema
      if (error.message.includes('column') || error.message.includes('schema cache') ||
          error.code === 'PGRST204' || error.code === '42703') {
        console.log('尝试旧schema插入...');
        const legacyData = {
          team_id: teamId,
          form_id: formId,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        };

        const { data: legacyResult, error: legacyError } = await client
          .from('final_task_submissions')
          .insert(legacyData)
          .select()
          .single();

        if (legacyError) {
          console.error('旧schema插入也失败:', legacyError.message);
          return NextResponse.json({
            error: '数据库表结构需要更新，请联系管理员执行迁移',
            needsMigration: true,
            detail: process.env.NODE_ENV === 'development' ? legacyError.message : undefined,
          }, { status: 500 });
        }

        // 旧schema成功，但功能受限
        return NextResponse.json({
          success: true,
          submission: legacyResult,
          allSubmitted: false, // 旧schema无法判断
          message: '提交成功（注意：数据库需要迁移以支持完整功能）',
          needsMigration: true,
        });
      }

      return ApiErrors.validation('提交失败: ' + (process.env.NODE_ENV === 'development' ? error.message : '请稍后重试'));
    }

    // 检查是否所有成员都已提交
    const allSubmitted = await checkAllMembersSubmitted(client, teamId, taskId, currentCycle);

    // 如果所有成员都已提交，自动完成任务和归档主题
    if (allSubmitted) {
      await finalizeFinalTask(client, teamId, taskId, currentCycle);
    }

    return NextResponse.json({
      success: true,
      submission: data,
      allSubmitted,
      message: allSubmitted
        ? '所有成员已提交反馈，任务已完成'
        : '提交成功，等待其他成员提交',
    });
  } catch (error) {
    console.error('提交反馈表单错误:', error);
    return safeError(error);
  }
}

/**
 * 完成最后任务并归档主题
 */
async function finalizeFinalTask(
  client: ReturnType<typeof getSupabaseClient>,
  teamId: string,
  taskId: string,
  cycle: number
): Promise<void> {
  try {
    let themeId: string | null = null;

    if (taskId.startsWith('final-')) {
      themeId = taskId.substring(6);
    } else {
      const { data: task } = await client
        .from('tasks')
        .select('id, theme_id, points')
        .eq('id', taskId)
        .single();

      if (!task || !task.theme_id) return;
      themeId = task.theme_id;
    }

    if (!taskId.startsWith('final-')) {
      const { data: existingSubmission } = await client
        .from('task_submissions')
        .select('id')
        .eq('team_id', teamId)
        .eq('task_id', taskId)
        .eq('cycle', cycle)
        .single();

      if (!existingSubmission) {
        await client
          .from('task_submissions')
          .insert({
            team_id: teamId,
            task_id: taskId,
            content: '所有成员已完成反馈表单',
            status: 'approved',
            rating: 100,
            cycle: cycle,
            reviewed_at: new Date().toISOString(),
          });
      }
    }

    const { data: themeSubmissions } = await client
      .from('task_submissions')
      .select('task_id, rating')
      .eq('team_id', teamId)
      .eq('cycle', cycle)
      .eq('status', 'approved');

    const { data: themeTasks } = await client
      .from('tasks')
      .select('id, points')
      .eq('theme_id', themeId)
      .eq('is_active', true);

    const taskPointsMap = new Map((themeTasks || []).map((t: any) => [t.id, t.points]));
    const themeTotalPoints = (themeSubmissions || [])
      .filter((s: any) => taskPointsMap.has(s.task_id))
      .reduce((sum: number, s: any) => sum + (taskPointsMap.get(s.task_id) || 0), 0);

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

    const completedTaskIds = new Set((themeSubmissions || []).map((s: any) => s.task_id));
    const themeTaskIdSet = new Set(themeTaskIds);
    const completedThemeTasks = [...completedTaskIds].filter(id => themeTaskIdSet.has(id)).length;

    // 安全修复 VULN-BIZ-016：周期清零原子化改进
    // 顺序：先创建归档记录（theme_completions + team_theme_selections），再清零 teams
    // 每一步检查错误，归档失败则不执行清零，清零失败则记录关键告警

    // 步骤1：归档主题完成记录（upsert 幂等）
    const { error: completionError } = await client
      .from('theme_completions')
      .upsert({
        team_id: teamId,
        theme_id: themeId,
        cycle: cycle,
        total_points: themeTotalPoints,
        total_rewards: themeRewardsCount || 0,
        total_tasks: completedThemeTasks,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'team_id,theme_id,cycle' });

    if (completionError) {
      console.error('[finalizeFinalTask] 归档主题完成记录失败，终止清零以防数据不一致:', {
        teamId, themeId, cycle, error: completionError.message,
      });
      return;
    }

    // 步骤2：更新主题选择记录为 completed
    const { error: selectionUpdateError } = await client
      .from('team_theme_selections')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('team_id', teamId)
      .eq('theme_id', themeId)
      .eq('cycle', cycle);

    if (selectionUpdateError) {
      console.error('更新主题选择记录失败:', selectionUpdateError);
    }

    const { data: checkSelection } = await client
      .from('team_theme_selections')
      .select('id')
      .eq('team_id', teamId)
      .eq('cycle', cycle)
      .eq('status', 'completed')
      .single();

    if (!checkSelection) {
      console.warn(`主题选择记录未匹配theme_id，尝试按 cycle 更新: team=${teamId}, cycle=${cycle}`);
      await client
        .from('team_theme_selections')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('team_id', teamId)
        .eq('cycle', cycle);
    }

    // 步骤3：清零 teams 表（积分清零 + cycle+1）
    // 乐观锁：.eq('cycle', cycle) 防止并发双重归档导致 cycle 被多次递增
    const { data: clearedTeam, error: clearError } = await client
      .from('teams')
      .update({
        current_theme_id: null,
        current_task_id: null,
        next_task_deadline: null,
        points: 0,
        cycle: cycle + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', teamId)
      .eq('cycle', cycle)
      .select('id');

    if (clearError) {
      // 清零失败：归档已完成但 teams 未清零，记录关键告警供人工修复
      console.error('[finalizeFinalTask] 关键：归档已完成但 teams 清零失败，存在数据不一致风险:', {
        teamId, themeId, cycle, error: clearError.message,
      });
      return;
    }

    if (!clearedTeam || clearedTeam.length === 0) {
      // 乐观锁冲突：cycle 已被并发请求递增，说明该周期已被归档过，无需重复操作
      console.warn(`[finalizeFinalTask] 周期 ${cycle} 已被并发归档，跳过: team=${teamId}`);
      return;
    }

    console.log(`最后任务已完成并归档 team=${teamId}, task=${taskId}, cycle=${cycle}`);
  } catch (error) {
    console.error('完成最后任务失败:', error);
  }
}

/**
 * 检查是否所有需要提交的成员都已提交（按周期）
 */
async function checkAllMembersSubmitted(
  client: ReturnType<typeof getSupabaseClient>,
  teamId: string,
  taskId: string,
  cycle: number
): Promise<boolean> {
  let themeId: string | null = null;

  if (taskId.startsWith('final-')) {
    themeId = taskId.substring(6);
  } else {
    const { data: task } = await client
      .from('tasks')
      .select('theme_id')
      .eq('id', taskId)
      .single();

    if (!task) return false;
    themeId = task.theme_id;
  }

  const { data: members } = await client
    .from('team_members')
    .select('id, role')
    .eq('team_id', teamId);

  if (!members || members.length === 0) return true;

  // 获取主题关联的表单
  const { data: theme } = await client
    .from('task_themes')
    .select('*')
    .eq('id', themeId)
    .single();

  const roleToFormField: Record<string, string> = {
    'guider': 'guider_form_id',
    'light_mage': 'light_mage_form_id',
    'secret_scholar': 'secret_scholar_form_id',
  };

  const roleHasForm: Record<string, boolean> = {};

  if (theme) {
    for (const [role, fieldName] of Object.entries(roleToFormField)) {
      const formId = (theme as any)[fieldName];
      roleHasForm[role] = !!formId;
    }
  }

  // 兼容旧版
  const hasLegacyForm = (theme as any)?.final_task_form_id && !Object.values(roleHasForm).some(Boolean);

  // 如果主题没有配置表单，检查全局表单
  if (!Object.values(roleHasForm).some(Boolean) && !hasLegacyForm) {
    const memberRoles = [...new Set(members.map(m => m.role || 'guider'))];
    const { data: globalForms } = await client
      .from('final_task_forms')
      .select('id, role, team_role')
      .is('school_id', null)
      .in('role', memberRoles);

    if (globalForms && globalForms.length > 0) {
      for (const form of globalForms) {
        const formRole = form.team_role || form.role;
        if (formRole) roleHasForm[formRole] = true;
      }
    }
  }

  const requiredMembers = members.filter(m => {
    const role = m.role || 'guider';
    return roleHasForm[role] || hasLegacyForm;
  });

  if (requiredMembers.length === 0) return true;

  // 获取已提交的成员（先尝试新schema，失败则用旧schema）
  const { data: submissions, error: subError } = await client
    .from('final_task_submissions')
    .select('member_id')
    .eq('team_id', teamId)
    .eq('task_id', taskId)
    .eq('cycle', cycle);

  if (subError || !submissions) {
    // 旧schema：没有 task_id/cycle 列
    const formIds = Object.values(roleHasForm).filter(Boolean);
    if (formIds.length === 0) return true;

    const { data: legacySubmissions } = await client
      .from('final_task_submissions')
      .select('id')
      .eq('team_id', teamId)
      .in('form_id', formIds);

    return (legacySubmissions?.length || 0) >= requiredMembers.length;
  }

  const submittedIds = new Set(submissions.map(s => s.member_id));

  return requiredMembers.every(m => submittedIds.has(m.id));
}
