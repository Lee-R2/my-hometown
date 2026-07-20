import { requireAnyAuth, requireAdminOrVolunteer, requireTeam, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { generateSignedUrl } from '@/lib/storage-utils';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 创建任务产出提交
 */
export async function POST(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getAuthenticatedClient(request, auth);
    const body = await request.json();
    
    const { teamId, taskId, content, fileUrls, fileKeys, fileNames, fileSizes, fileTypes } = body;

    if (!teamId || !taskId) {
      return ApiErrors.validation('缺少小队ID或任务ID');
    }

    // 校验提交者只能为自己的小队提交，防止身份伪造
    if (teamId !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权为其他小队提交作品');
    }

    // 验证必学技能是否完成
    const { data: taskSkills } = await client
      .from('task_skills')
      .select('skill_id')
      .eq('task_id', taskId);
    
    if (taskSkills && taskSkills.length > 0) {
      const skillIds = taskSkills.map(ts => ts.skill_id);
      
      // 查询小队历史上已完成的技能
      const { data: completedLearnings } = await client
        .from('team_skill_learnings')
        .select('skill_id')
        .eq('team_id', teamId)
        .eq('status', 'completed');
      
      const completedSkillIds = new Set((completedLearnings || []).map(l => l.skill_id));
      
      // 检查是否有必学技能未完成（首次学习的技能）
      const requiredSkills = skillIds.filter(id => !completedSkillIds.has(id));
      
      if (requiredSkills.length > 0) {
        // 检查当前任务中这些必学技能是否已完成
        const { data: currentTaskLearnings } = await client
          .from('team_skill_learnings')
          .select('skill_id, status')
          .eq('team_id', teamId)
          .eq('task_id', taskId)
          .in('skill_id', requiredSkills);
        
        const incompleteRequired = requiredSkills.filter(skillId => {
          const learning = (currentTaskLearnings || []).find(l => l.skill_id === skillId);
          return !learning || learning.status !== 'completed';
        });
        
        if (incompleteRequired.length > 0) {
          return ApiErrors.validation('请先完成所有必学技能');
        }
      }
    }

    // 获取小队当前周期
    const { data: teamInfo } = await client
      .from('teams')
      .select('cycle')
      .eq('id', teamId)
      .single();
    const currentCycle = teamInfo?.cycle || 1;

    // 检查是否已有待审核的提交（按周期过滤）
    const { data: existingSubmission } = await client
      .from('task_submissions')
      .select('id')
      .eq('team_id', teamId)
      .eq('task_id', taskId)
      .eq('cycle', currentCycle)
      .eq('status', 'pending')
      .single();

    if (existingSubmission) {
      return ApiErrors.conflict('已有待审核的提交，请等待审核后再提交');
    }

    // 查询小队领取的且需要归还的工具
    // 1. 获取任务的所有工具（必选+已选的可选工具）
    const { data: taskTools } = await client
      .from('task_tools')
      .select(`
        is_required,
        tools (
          id,
          name,
          icon,
          nature,
          team_limit,
          needs_return
        )
      `)
      .eq('task_id', taskId);

    // 2. 获取小队已选择的工具
    const { data: selectedTools } = await client
      .from('team_tools')
      .select('tool_id')
      .eq('team_id', teamId)
      .eq('task_id', taskId);

    const selectedToolIds = new Set((selectedTools || []).map(t => t.tool_id));

    // 3. 筛选需要归还的工具
    const toolsToReturn: Array<{
      id: string;
      name: string;
      icon: string;
      quantity: number;
    }> = [];

    for (const taskTool of (taskTools || [])) {
      const tool = taskTool.tools as any;
      if (!tool) continue;

      // 必选工具 或 已选的可选工具
      const isSelected = taskTool.is_required || selectedToolIds.has(tool.id);
      
      // 需要归还（needs_return !== false 且是实物工具）
      const needsReturn = tool.needs_return !== false && tool.nature === 'physical';

      if (isSelected && needsReturn) {
        toolsToReturn.push({
          id: tool.id,
          name: tool.name,
          icon: tool.icon || '🔧',
          quantity: tool.team_limit || 1,
        });
      }
    }

    // 组装文件信息数组（存储 key 而不是 url，避免签名过期）
    const fileInfoList = (fileKeys || fileUrls || []).map((keyOrUrl: string, index: number) => ({
      key: fileKeys?.[index] || '',  // 存储 key 用于后续生成签名 URL
      url: fileUrls?.[index] || '',  // 原始 URL（可选，可能过期）
      name: fileNames?.[index] || keyOrUrl.split('/').pop() || `文件${index + 1}`,
      type: fileTypes?.[index] || 'unknown',
      size: fileSizes?.[index] || 0,
    }));

    // 创建提交记录
    const { data: submission, error } = await client
      .from('task_submissions')
      .insert({
        team_id: teamId,
        task_id: taskId,
        content: content || '',
        file_urls: fileInfoList,
        status: 'pending',
        cycle: currentCycle,
      })
      .select()
      .single();

    if (error) {
      console.error('创建提交错误:', error);
      return supabaseErrorResponse(error, '提交失败');
    }

    return NextResponse.json({ 
      success: true, 
      submission,
      message: '提交成功，等待审核',
      toolsToReturn, // 需要归还的工具列表
    });
  } catch (error) {
    console.error('创建提交错误:', error);
    return ApiErrors.validation('提交失败');
  }
}

/**
 * 获取产出提交列表
 * 支持筛选：status（状态）、themeId（主题）、schoolId（学校）、createdBy（志愿者筛选）
 */
export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getAuthenticatedClient(request, auth);
    const { searchParams } = new URL(request.url);
    
    const status = searchParams.get('status'); // pending, approved, rejected, excellent, all
    const themeId = searchParams.get('themeId');
    const schoolId = searchParams.get('schoolId');
    const teamId = searchParams.get('teamId');
    // LE-A14: 强制使用认证身份,防止客户端伪造 role/createdBy 查看他人提交
    const createdBy = auth.payload!.userId; // 志愿者/老师筛选：只显示其指导的小队
    const role = auth.payload!.role; // 用户角色

    // 获取关联的小队信息（先筛选小队）
    let teamQuery = client
      .from('teams')
      .select('id, code, name, school_id, current_theme_id, assigned_volunteer_id, teacher_id');

    // 小队查询自己的记录
    if (teamId && (role === 'team')) {
      // LE-A14: 小队身份强制使用认证 userId,防止查看其他小队
      teamQuery = teamQuery.eq('id', auth.payload!.userId);
    }
    // 志愿者只能看到自己创建的小队的提交
    else if (role === 'volunteer') {
      teamQuery = teamQuery.eq('assigned_volunteer_id', createdBy);
    }
    // 助学老师能看到本校所有小队的提交（包括志愿者创建的）
    else if (role === 'teacher') {
      // 先获取助学老师的学校
      const { data: teacherData } = await client
        .from('users')
        .select('school_id')
        .eq('id', createdBy)
        .single();

      if (teacherData?.school_id) {
        // 查询该校所有小队
        teamQuery = teamQuery.eq('school_id', teacherData.school_id);
      } else {
        // 如果没有学校信息，只显示自己对接的小队
        teamQuery = teamQuery.eq('teacher_id', createdBy);
      }
    }
    // admin/super_admin 可以指定 teamId 查看
    else if (teamId && (role === 'admin' || role === 'super_admin')) {
      teamQuery = teamQuery.eq('id', teamId);
    }
    
    const { data: teams } = await teamQuery;
    const teamIds = (teams || []).map(t => t.id);
    
    // 如果没有符合条件的小队，返回空
    if (teamIds.length === 0) {
      return NextResponse.json({ submissions: [], total: 0, stats: { pending: 0, approved: 0, rejected: 0, excellent: 0 } });
    }

    // 小队查看自己的记录时，需要检查是否已完成主题
    // 如果小队的 current_theme_id 为空，说明已完成主题，返回空数组
    let currentThemeTaskIds: string[] | null = null;
    let currentCycle: number | null = null;
    if (teamId && !createdBy) {
      const team = (teams || []).find(t => t.id === teamId);
      if (team && !team.current_theme_id) {
        return NextResponse.json({ submissions: [], total: 0, stats: { pending: 0, approved: 0, rejected: 0, excellent: 0 } });
      }
      // 获取当前主题下的所有任务ID，用于过滤
      if (team?.current_theme_id) {
        const { data: themeTasks } = await client
          .from('tasks')
          .select('id')
          .eq('theme_id', team.current_theme_id)
          .eq('is_active', true);
        currentThemeTaskIds = (themeTasks || []).map(t => t.id);
      }
      // 获取小队当前周期，用于按周期过滤
      const { data: teamCycleData } = await client
        .from('teams')
        .select('cycle')
        .eq('id', teamId)
        .single();
      currentCycle = teamCycleData?.cycle || 1;
    }

    // 构建查询
    let query = client
      .from('task_submissions')
      .select(`
        id,
        team_id,
        task_id,
        content,
        file_urls,
        status,
        review_comment,
        reviewer_id,
        reviewed_at,
        created_at,
        updated_at,
        rating
      `)
      .in('team_id', teamIds)
      .order('created_at', { ascending: false });

    // 注意：不再在数据库查询层应用状态筛选
    // 状态筛选改为在应用层处理，确保统计始终基于全量数据
    
    // 按小队筛选
    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    // 小队查看时，只返回当前主题的任务提交
    if (currentThemeTaskIds && currentThemeTaskIds.length > 0) {
      query = query.in('task_id', currentThemeTaskIds);
      // 按当前周期过滤，确保只看到当前周期的提交
      if (currentCycle) {
        query = query.eq('cycle', currentCycle);
      }
    } else if (currentThemeTaskIds !== null) {
      // 当前主题没有任务，返回空
      return NextResponse.json({ submissions: [], total: 0, stats: { pending: 0, approved: 0, rejected: 0, excellent: 0 } });
    }

    // 获取数据
    const { data: submissions, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取产出列表失败');
    }

    if (!submissions || submissions.length === 0) {
      return NextResponse.json({ submissions: [], total: 0, stats: { pending: 0, approved: 0, rejected: 0, excellent: 0 } });
    }

    // 获取学校信息
    const schoolIds = [...new Set((teams || []).map(t => t.school_id).filter(Boolean))];
    const { data: schools } = await client
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);

    // 获取任务信息
    const taskIds = [...new Set(submissions.map(s => s.task_id).filter(Boolean))];
    const { data: tasks } = await client
      .from('tasks')
      .select('id, title, theme_id, stage')
      .in('id', taskIds);

    // 获取主题信息
    const themeIds = [...new Set((tasks || []).map(t => t.theme_id).filter(Boolean))];
    const { data: themes } = await client
      .from('task_themes')
      .select('id, name, icon')
      .in('id', themeIds);

    // 组装数据
    const teamMap = new Map((teams || []).map(t => [t.id, t]));
    const schoolMap = new Map((schools || []).map(s => [s.id, s]));
    const taskMap = new Map((tasks || []).map(t => [t.id, t]));
    const themeMap = new Map((themes || []).map(t => [t.id, t]));

    // 收集所有需要生成签名 URL 的文件 key
    const allFileKeys: string[] = [];
    submissions.forEach(s => {
      const files = s.file_urls || [];
      files.forEach((f: { key?: string }) => {
        if (f.key) allFileKeys.push(f.key);
      });
    });

    // 批量生成签名 URL
    const signedUrlMap = new Map<string, string>();
    await Promise.all(
      [...new Set(allFileKeys)].map(async (key) => {
        try {
          const url = await generateSignedUrl({
            key,
            expireTime: 7 * 24 * 60 * 60, // 7天
          });
          signedUrlMap.set(key, url);
        } catch (err) {
          console.error('生成签名URL失败:', key, err);
        }
      })
    );

    let result = submissions.map(s => {
      const team = teamMap.get(s.team_id);
      const task = taskMap.get(s.task_id);
      const theme = task?.theme_id ? themeMap.get(task.theme_id) : null;
      const school = team?.school_id ? schoolMap.get(team.school_id) : null;

      // 为每个文件生成新的签名 URL
      const filesWithSignedUrls = (s.file_urls || []).map((f: { key?: string; url?: string; name?: string; type?: string; size?: number }) => ({
        ...f,
        url: f.key && signedUrlMap.get(f.key) || f.url || '',  // 优先使用新生成的签名 URL
      }));

      return {
        id: s.id,
        team_id: s.team_id,
        team_name: team?.name || team?.code || '未知小队',
        team_code: team?.code,
        task_id: s.task_id,
        task_title: task?.title || '未知任务',
        task_stage: task?.stage,
        theme_id: task?.theme_id,
        theme_name: theme?.name,
        theme_icon: theme?.icon,
        school_id: team?.school_id,
        school_name: school?.name,
        content: s.content,
        file_urls: filesWithSignedUrls,
        status: s.status,
        rating: s.rating, // excellent, approved, rejected
        review_comment: s.review_comment,
        reviewer_id: s.reviewer_id,
        reviewed_at: s.reviewed_at,
        created_at: s.created_at,
      };
    });

    // 额外筛选（在应用层）
    // stats 始终基于全量数据计算（不受状态筛选影响，但受主题和学校筛选影响）
    
    // 应用学校和主题筛选（这些筛选同时影响展示列表和统计）
    let allData = result;
    if (schoolId && schoolId !== 'all') {
      allData = allData.filter(s => s.school_id === schoolId);
    }
    if (themeId && themeId !== 'all') {
      allData = allData.filter(s => s.theme_id === themeId);
    }
    
    // 统计始终基于未按状态筛选的数据
    const stats = {
      pending: allData.filter(s => s.status === 'pending').length,
      approved: allData.filter(s => s.status === 'approved' && s.rating !== 'excellent').length,
      rejected: allData.filter(s => s.status === 'rejected').length,
      excellent: allData.filter(s => s.rating === 'excellent').length,
    };

    // 状态筛选只影响展示列表
    let filteredData = allData;
    if (status && status !== 'all') {
      if (status.includes(',')) {
        const statusList = status.split(',');
        filteredData = filteredData.filter(s => statusList.includes(s.status));
      } else {
        filteredData = filteredData.filter(s => s.status === status);
      }
    }

    return NextResponse.json({ 
      submissions: filteredData, 
      total: filteredData.length,
      stats,
    });
  } catch (error) {
    console.error('获取产出列表错误:', error);
    return ApiErrors.validation('获取产出列表失败');
  }
}
