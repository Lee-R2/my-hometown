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
    const teamId = searchParams.get('teamId'); // 当前小队ID
    const volunteerId = searchParams.get('volunteerId'); // 志愿者ID

    // 查询当前小队信息
    let currentTeamCycle: number = 1;
    let currentTeamThemeId: string | null = null;
    let isCurrentCycleCompleted = false;
    let completedThemeIds = new Set<string>();
    let currentTeamCreatedBy: string | null = null; // 志愿者ID
    let currentTeamTeacherId: string | null = null; // 助学老师ID
    
    if (teamId) {
      const { data: currentTeam } = await client
        .from('teams')
        .select('id, current_theme_id, cycle, created_by, teacher_id')
        .eq('id', teamId)
        .single();
      
      if (currentTeam) {
        currentTeamThemeId = currentTeam.current_theme_id || null;
        currentTeamCycle = currentTeam.cycle || 1;
        currentTeamCreatedBy = currentTeam.created_by || null;
        currentTeamTeacherId = currentTeam.teacher_id || null;
      }
      
      // 检查当前周期的选择记录
      if (currentTeamThemeId) {
        const { data: currentCycleSelection } = await client
          .from('team_theme_selections')
          .select('status')
          .eq('team_id', teamId)
          .eq('theme_id', currentTeamThemeId)
          .eq('cycle', currentTeamCycle)
          .maybeSingle();
        
        isCurrentCycleCompleted = currentCycleSelection?.status === 'completed';
      }

      // 获取当前小队已完成的主题列表
      const { data: teamCompletions } = await client
        .from('theme_completions')
        .select('theme_id')
        .eq('team_id', teamId);
      
      completedThemeIds = new Set((teamCompletions || []).map(c => c.theme_id));
    }

    /**
     * 获取同一指导老师下的其他小队在当前周期已选主题
     * 指导老师 = 同一志愿者(created_by) 或 同一助学老师(teacher_id)
     */
    async function getSiblingsSelectedThemes(cycle: number, excludeTeamId: string): Promise<Set<string>> {
      const selectedThemeIds = new Set<string>();
      
      // 构建查询条件：同一志愿者下的活跃小队 或 同一助学老师下的活跃小队
      const conditions: string[] = [];
      
      if (currentTeamCreatedBy) {
        // 同一志愿者下的小队
        const { data: volunteerTeams } = await client
          .from('teams')
          .select('id')
          .eq('created_by', currentTeamCreatedBy)
          .eq('status', 'active')
          .neq('id', excludeTeamId);
        (volunteerTeams || []).forEach(t => conditions.push(t.id));
      }
      
      if (currentTeamTeacherId) {
        // 同一助学老师下的小队
        const { data: teacherTeams } = await client
          .from('teams')
          .select('id')
          .eq('teacher_id', currentTeamTeacherId)
          .eq('status', 'active')
          .neq('id', excludeTeamId);
        (teacherTeams || []).forEach(t => {
          if (!conditions.includes(t.id)) conditions.push(t.id);
        });
      }
      
      if (conditions.length === 0) return selectedThemeIds;
      
      // 查询这些小队在指定周期的选择记录
      const { data: selections } = await client
        .from('team_theme_selections')
        .select('theme_id')
        .in('team_id', conditions)
        .eq('cycle', cycle)
        .eq('status', 'in_progress');
      
      (selections || []).forEach(s => selectedThemeIds.add(s.theme_id));
      return selectedThemeIds;
    }

    /**
     * 获取同一指导老师下其他小队的选择详情（用于显示进度信息）
     */
    async function getSiblingTeamDetails(cycle: number, excludeTeamId: string, themeIds: string[]): Promise<Record<string, {
      teamId: string; teamName: string; currentStage: number; totalStages: number; points: number; isCompleted: boolean;
    }>> {
      const result: Record<string, {
        teamId: string; teamName: string; currentStage: number; totalStages: number; points: number; isCompleted: boolean;
      }> = {};
      
      if (themeIds.length === 0) return result;
      
      // 获取同一指导老师下的其他小队
      const siblingTeamIds: string[] = [];
      
      if (currentTeamCreatedBy) {
        const { data: volunteerTeams } = await client
          .from('teams')
          .select('id')
          .eq('created_by', currentTeamCreatedBy)
          .eq('status', 'active')
          .neq('id', excludeTeamId);
        (volunteerTeams || []).forEach(t => siblingTeamIds.push(t.id));
      }
      
      if (currentTeamTeacherId) {
        const { data: teacherTeams } = await client
          .from('teams')
          .select('id')
          .eq('teacher_id', currentTeamTeacherId)
          .eq('status', 'active')
          .neq('id', excludeTeamId);
        (teacherTeams || []).forEach(t => {
          if (!siblingTeamIds.includes(t.id)) siblingTeamIds.push(t.id);
        });
      }
      
      if (siblingTeamIds.length === 0) return result;
      
      // 获取这些小队在指定周期选择这些主题的记录
      const { data: selections } = await client
        .from('team_theme_selections')
        .select('team_id, theme_id')
        .in('team_id', siblingTeamIds)
        .eq('cycle', cycle)
        .in('theme_id', themeIds);
      
      const selectedTeamIdsForThemes = [...new Set((selections || []).map(s => s.team_id))];
      
      if (selectedTeamIdsForThemes.length === 0) return result;
      
      // 获取这些小队的信息
      const { data: teamsInfo } = await client
        .from('teams')
        .select('id, name, current_theme_id, current_task_id, points')
        .in('id', selectedTeamIdsForThemes);
      
      // 获取任务信息用于计算进度
      const taskIds = (teamsInfo || []).map(t => t.current_task_id).filter(Boolean) as string[];
      const taskStageMap: Record<string, number> = {};
      
      if (taskIds.length > 0) {
        const { data: tasksData } = await client
          .from('tasks')
          .select('id, stage')
          .in('id', taskIds);
        (tasksData || []).forEach(task => {
          taskStageMap[task.id] = task.stage;
        });
      }
      
      // 获取任务数量
      const { data: allTasksData } = await client
        .from('tasks')
        .select('id, theme_id')
        .in('theme_id', themeIds)
        .eq('is_active', true)
        .eq('task_type', 'main');
      
      const themeTaskCountMap: Record<string, number> = {};
      (allTasksData || []).forEach(task => {
        if (task.theme_id) {
          themeTaskCountMap[task.theme_id] = (themeTaskCountMap[task.theme_id] || 0) + 1;
        }
      });
      
      // 获取完成状态
      const { data: siblingCompletions } = await client
        .from('theme_completions')
        .select('team_id, theme_id')
        .in('team_id', selectedTeamIdsForThemes);
      
      const siblingCompletionsMap = new Map<string, Set<string>>();
      (siblingCompletions || []).forEach(c => {
        if (!siblingCompletionsMap.has(c.team_id)) siblingCompletionsMap.set(c.team_id, new Set());
        siblingCompletionsMap.get(c.team_id)!.add(c.theme_id);
      });
      
      // 构建结果
      (teamsInfo || []).forEach(t => {
        if (t.current_theme_id && themeIds.includes(t.current_theme_id)) {
          const completedThemes = siblingCompletionsMap.get(t.id) || new Set();
          result[t.current_theme_id] = {
            teamId: t.id,
            teamName: t.name || '未命名小队',
            currentStage: taskStageMap[t.current_task_id || ''] || 1,
            totalStages: themeTaskCountMap[t.current_theme_id] || 1,
            points: t.points || 0,
            isCompleted: completedThemes.has(t.current_theme_id),
          };
        }
      });
      
      return result;
    }

    // 如果小队已选择主题
    if (currentTeamThemeId) {
      // 收集需要返回的主题ID
      const themeIdsToShow = new Set<string>([currentTeamThemeId]);

      if (isCurrentCycleCompleted) {
        // 当前周期已完成，显示所有主题供下一周期选择
        const { data: allThemes } = await client
          .from('task_themes')
          .select('id')
          .eq('is_active', true);
        
        (allThemes || []).forEach(t => themeIdsToShow.add(t.id));
      } else {
        // 当前周期未完成，也显示同一指导老师下其他小队选择的主题
        const { data: siblingSelections } = await client
          .from('team_theme_selections')
          .select('theme_id')
          .eq('cycle', currentTeamCycle)
          .eq('status', 'in_progress')
          .neq('team_id', teamId || '');
        
        (siblingSelections || []).forEach(s => themeIdsToShow.add(s.theme_id));
      }

      // 查询这些主题的详细信息
      const { data: themes, error: themesError } = await client
        .from('task_themes')
        .select('*')
        .in('id', Array.from(themeIdsToShow))
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (themesError) {
        return supabaseErrorResponse(themesError, '获取主题列表失败');
      }

      // 获取同一指导老师下其他小队在当前周期的已选主题
      const nextCycle = isCurrentCycleCompleted ? currentTeamCycle + 1 : currentTeamCycle;
      const siblingsSelectedThemes = await getSiblingsSelectedThemes(nextCycle, teamId || '');
      
      // 获取其他小队的详情
      const siblingDetails = await getSiblingTeamDetails(
        isCurrentCycleCompleted ? nextCycle : currentTeamCycle,
        teamId || '',
        Array.from(themeIdsToShow)
      );

      // 获取任务数量
      const themeTaskCountMap: Record<string, number> = {};
      const allThemeIds = Array.from(themeIdsToShow);
      
      if (allThemeIds.length > 0) {
        const { data: allTasksData } = await client
          .from('tasks')
          .select('id, stage, theme_id')
          .in('theme_id', allThemeIds)
          .eq('is_active', true)
          .eq('task_type', 'main');
        
        (allTasksData || []).forEach(task => {
          if (task.theme_id) {
            themeTaskCountMap[task.theme_id] = (themeTaskCountMap[task.theme_id] || 0) + 1;
          }
        });
      }

      // 构建返回数据
      const themesWithStatus = (themes || []).map(theme => {
        const isCurrentTeamTheme = theme.id === currentTeamThemeId;
        const totalStages = themeTaskCountMap[theme.id] || 1;
        
        // 当前主题的任务阶段
        let currentTeamStage: number | null = null;
        if (isCurrentTeamTheme) {
          // 需要从当前任务获取阶段
          // 这里暂时用 null，前端会通过 currentTask 获取
        }

        // 判断是否被同一指导老师下同一周期的其他小队选择
        const selectedByOtherTeam = !isCurrentCycleCompleted && siblingsSelectedThemes.has(theme.id);
        const selectedByOtherTeamInfo = siblingDetails[theme.id];

        return {
          ...theme,
          isCurrentTeamTheme,
          currentTeamStage: isCurrentTeamTheme ? currentTeamStage : null,
          currentTeamTotalStages: isCurrentTeamTheme ? totalStages : null,
          isCompletedByTeam: completedThemeIds.has(theme.id),
          isTeamCompletedCurrentTheme: isCurrentCycleCompleted,
          // 其他小队选择状态
          selectedByOtherTeam,
          selectedByTeamId: selectedByOtherTeamInfo?.teamId ?? null,
          selectedByTeamName: selectedByOtherTeamInfo?.teamName ?? null,
          selectedByTeamStage: selectedByOtherTeamInfo?.currentStage ?? null,
          selectedByTeamTotalStages: selectedByOtherTeamInfo?.totalStages ?? null,
          selectedByTeamPoints: selectedByOtherTeamInfo?.points ?? 0,
          selectedByTeamCompleted: selectedByOtherTeamInfo?.isCompleted ?? false,
          // 其他小队信息
          otherTeamInfo: selectedByOtherTeamInfo ? {
            teamId: selectedByOtherTeamInfo.teamId,
            teamName: selectedByOtherTeamInfo.teamName,
            currentStage: selectedByOtherTeamInfo.currentStage,
            totalStages: selectedByOtherTeamInfo.totalStages,
            points: selectedByOtherTeamInfo.points,
            isCompleted: selectedByOtherTeamInfo.isCompleted,
          } : null,
          // 新周期可选性标记
          isAvailableForNewCycle: isCurrentCycleCompleted ? !siblingsSelectedThemes.has(theme.id) : null,
        };
      });

      return NextResponse.json({ themes: themesWithStatus });
    }

    // 如果小队未选择主题（可以首次选择或进入新周期）
    if (!currentTeamThemeId) {
      // 查询所有活跃主题
      const { data: themes, error: themesError } = await client
        .from('task_themes')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (themesError) {
        return supabaseErrorResponse(themesError, '获取主题列表失败');
      }

      // 获取同一指导老师下其他小队在当前周期的已选主题
      const siblingsSelectedThemes = await getSiblingsSelectedThemes(currentTeamCycle, teamId || '');
      
      // 获取其他小队的详情
      const allThemeIds = (themes || []).map(t => t.id);
      const siblingDetails = await getSiblingTeamDetails(currentTeamCycle, teamId || '', allThemeIds);

      // 构建返回数据
      const themesWithStatus = (themes || []).map(theme => {
        const selectedByOtherTeam = siblingsSelectedThemes.has(theme.id);
        const selectedByOtherTeamInfo = siblingDetails[theme.id];

        return {
          ...theme,
          isCurrentTeamTheme: false,
          currentTeamStage: null,
          currentTeamTotalStages: null,
          isCompletedByTeam: completedThemeIds.has(theme.id),
          isTeamCompletedCurrentTheme: false,
          // 其他小队选择状态
          selectedByOtherTeam,
          selectedByTeamId: selectedByOtherTeamInfo?.teamId ?? null,
          selectedByTeamName: selectedByOtherTeamInfo?.teamName ?? null,
          selectedByTeamStage: selectedByOtherTeamInfo?.currentStage ?? null,
          selectedByTeamTotalStages: selectedByOtherTeamInfo?.totalStages ?? null,
          selectedByTeamPoints: selectedByOtherTeamInfo?.points ?? 0,
          selectedByTeamCompleted: selectedByOtherTeamInfo?.isCompleted ?? false,
          otherTeamInfo: selectedByOtherTeamInfo ? {
            teamId: selectedByOtherTeamInfo.teamId,
            teamName: selectedByOtherTeamInfo.teamName,
            currentStage: selectedByOtherTeamInfo.currentStage,
            totalStages: selectedByOtherTeamInfo.totalStages,
            points: selectedByOtherTeamInfo.points,
            isCompleted: selectedByOtherTeamInfo.isCompleted,
          } : null,
        };
      });

      return NextResponse.json({ themes: themesWithStatus });
    }

    // 查询所有活跃主题（兜底）
    const { data: themes, error } = await client
      .from('task_themes')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      return supabaseErrorResponse(error, '获取主题列表失败');
    }

    // 统计每个主题被选择的次数
    const { data: allTeams } = await client
      .from('teams')
      .select('current_theme_id')
      .eq('status', 'active')
      .not('current_theme_id', 'is', null);

    const themeSelectionCountMap: Record<string, number> = {};
    (allTeams || []).forEach(team => {
      if (team.current_theme_id) {
        themeSelectionCountMap[team.current_theme_id] = (themeSelectionCountMap[team.current_theme_id] || 0) + 1;
      }
    });

    const themesWithStatus = (themes || []).map(theme => ({
      ...theme,
      selectionCount: themeSelectionCountMap[theme.id] || 0,
      isCompletedByTeam: completedThemeIds.has(theme.id),
      isTeamCompletedCurrentTheme: isCurrentCycleCompleted,
    }));

    return NextResponse.json({ themes: themesWithStatus });
  } catch (error) {
    console.error('获取主题列表错误:', error);
    return ApiErrors.validation('获取主题列表失败');
  }
}

// ===== 创建主题 =====
export async function POST(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { name, description, icon, schoolId, isExclusive } = body;

    // 创建者身份从认证令牌获取，防止客户端伪造
    const createdBy = auth.payload!.userId;

    console.log('[创建主题] 收到请求:', { name, createdBy, schoolId, isExclusive });

    // 参数验证
    if (!name || !name.trim()) {
      return ApiErrors.validation('请输入主题名称');
    }

    const client = getSupabaseAdminClient();

    console.log('[创建主题] 查询创建者 ID:', createdBy);

    // 查询 users 表获取创建者信息
    const { data: userData, error: userError } = await client
      .from('users')
      .select('id, role, school_id')
      .eq('id', createdBy)
      .single();

    console.log('[创建主题] users 表查询结果:', { userData, userError });

    if (userError || !userData) {
      console.error('[创建主题] 获取创建者信息失败:', userError);
      return ApiErrors.unauthorized('无法验证用户权限');
    }

    // 权限检查：只有 super_admin 和 volunteer 可以创建主题
    if (userData.role !== 'super_admin' && userData.role !== 'volunteer' && userData.role !== 'admin') {
      return ApiErrors.forbidden('您没有权限创建主题');
    }

    // 志愿者只能创建专属主题
    let finalSchoolId = schoolId || null;
    let finalIsExclusive = isExclusive ?? false;

    if (userData.role === 'volunteer') {
      // 志愿者必须指定学校
      if (!userData.school_id) {
        return ApiErrors.validation('志愿者未关联学校，无法创建专属主题');
      }
      finalSchoolId = userData.school_id;
      finalIsExclusive = true;
    }

    console.log('[创建主题] 创建者信息:', userData);

    // 重名检查：同一范围内（专属主题按学校，公共主题全局）不允许同名
    const trimmedName = name.trim();
    let duplicateQuery = client
      .from('task_themes')
      .select('id, name, is_exclusive, school_id')
      .eq('name', trimmedName)
      .eq('is_active', true);

    if (finalIsExclusive && finalSchoolId) {
      // 专属主题：检查同一学校下是否已有同名主题
      duplicateQuery = duplicateQuery.eq('school_id', finalSchoolId);
    } else {
      // 公共主题：检查是否已有同名公共主题
      duplicateQuery = duplicateQuery.eq('is_exclusive', false);
    }

    const { data: existingTheme } = await duplicateQuery.maybeSingle();

    if (existingTheme) {
      return ApiErrors.conflict(
        finalIsExclusive
          ? '该学校下已存在同名主题，请使用其他名称'
          : '已存在同名公共主题，请使用其他名称'
      );
    }

    // 获取当前最大排序值
    const { data: maxOrder } = await client
      .from('task_themes')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)
      .single();

    const newOrderIndex = (maxOrder?.order_index ?? 0) + 1;

    // 创建主题
    const { data: newTheme, error: createError } = await client
      .from('task_themes')
      .insert({
        name: name.trim(),
        description: description?.trim() || '',
        icon: icon || '🎯',
        is_active: true,
        is_exclusive: finalIsExclusive,
        school_id: finalSchoolId,
        created_by: userData.id,
        order_index: newOrderIndex,
      })
      .select()
      .single();

    if (createError) {
      console.error('[创建主题] 创建失败:', createError);
      return supabaseErrorResponse(createError, '创建主题失败');
    }

    console.log('[创建主题] 成功:', newTheme.id);

    // 自动创建默认反馈表单（引导者、光明法师、秘密学者）
    const autoConfiguredForms: Record<string, string> = {};

    try {
      // 获取角色ID
      const { data: roles } = await client
        .from('feedback_roles')
        .select('id, role_key')
        .in('role_key', ['guider', 'light_mage', 'secret_scholar']);

      if (roles && roles.length > 0) {
        const formInserts = roles.map(role => ({
          theme_id: newTheme.id,
          role_id: role.id,
          form_config: {
            fields: [
              { type: 'text', label: '整体表现', required: true },
              { type: 'textarea', label: '优点与亮点', required: false },
              { type: 'textarea', label: '改进建议', required: false },
              { type: 'rating', label: '综合评分', required: true, min: 1, max: 5 },
            ],
          },
          created_by: userData.id,
        }));

        const { error: formsError } = await client
          .from('feedback_forms')
          .insert(formInserts);

        if (!formsError) {
          roles.forEach(role => {
            autoConfiguredForms[role.role_key] = role.id;
          });
          console.log('[创建主题] 自动创建反馈表单成功');
        } else {
          console.error('[创建主题] 自动创建反馈表单失败:', formsError);
        }
      }
    } catch (formError) {
      console.error('[创建主题] 自动创建反馈表单异常:', formError);
    }

    return NextResponse.json({
      success: true,
      theme: newTheme,
      autoConfiguredForms,
    });

  } catch (error) {
    console.error('[创建主题] 异常:', error);
    return ApiErrors.validation('创建主题失败');
  }
}
