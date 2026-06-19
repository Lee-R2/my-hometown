/**
 * command-executor.ts
 * 蜡象助手命令执行模块
 * 包含消息发送、产出查看、产出评价等命令的解析与执行逻辑
 */

// 获取产出详情
async function getSubmissionDetail(client: any, submissionId: string): Promise<any> {
  // 直接查询，不使用外键关联
  const { data: submission, error } = await client
    .from('task_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (error || !submission) {
    console.error('[蜡象助手] 获取产出详情失败:', error);
    return null;
  }

  // 获取小队信息
  const { data: team } = await client
    .from('teams')
    .select('id, name, code')
    .eq('id', submission.team_id)
    .single();

  // 获取任务信息
  const { data: task } = await client
    .from('tasks')
    .select('id, title, description, stage, requirements, learning_goals, points')
    .eq('id', submission.task_id)
    .single();

  // 获取产出内容
  const { data: contents } = await client
    .from('submission_contents')
    .select('id, content_type, content_value, file_url')
    .eq('submission_id', submissionId);

  return {
    ...submission,
    teams: team,
    tasks: task,
    contents: contents || []
  };
}

// 按小队名称查找产出
async function findSubmissionByTeamName(
  client: any,
  teamName: string,
  phase?: number
): Promise<{ submissions: any[]; teamsFound: any[]; suggestion?: string }> {
  // 1. 先查找可能匹配的小队
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id, name, code')
    .eq('status', 'active');

  if (teamsError || !teams) {
    console.error('[蜡象助手] 查询小队失败:', teamsError);
    return { submissions: [], teamsFound: [], suggestion: '查询小队信息失败，请稍后重试' };
  }

  // 模糊匹配小队名称（添加空值保护）
  const matchedTeams = (teams || []).filter((t: any) => 
    (t.name && t.name.includes(teamName)) || (t.code && t.code.includes(teamName))
  );

  if (matchedTeams.length === 0) {
    // 尝试更宽松的匹配
    const partialMatches = (teams || []).filter((t: any) => 
      (t.name && t.name.includes(teamName.substring(0, Math.min(2, teamName.length)))) ||
      (t.code && t.code.includes(teamName.substring(0, Math.min(2, teamName.length))))
    );
    
    if (partialMatches.length > 0) {
      return { 
        submissions: [], 
        teamsFound: partialMatches,
        suggestion: `未找到"${teamName}"，是否要找：${partialMatches.map((t: any) => t.name).join('、')}？` 
      };
    }
    
    return { submissions: [], teamsFound: [], suggestion: `未找到名为"${teamName}"的小队` };
  }

  const teamIds = matchedTeams.map((t: any) => t.id);
  
  // 2. 查找这些小队的产出（不使用外键关联，直接用team_id查询）
  const { data: submissions, error: submissionsError } = await client
    .from('task_submissions')
    .select('*')
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  if (submissionsError) {
    console.error('[蜡象助手] 查询产出失败:', submissionsError);
    return { submissions: [], teamsFound: matchedTeams, suggestion: '查询产出记录失败，请稍后重试' };
  }

  if (!submissions || submissions.length === 0) {
    return { 
      submissions: [], 
      teamsFound: matchedTeams,
      suggestion: `小队"${matchedTeams[0].name}"存在，但暂无产出记录` 
    };
  }

  // 3. 获取任务详情
  const taskIds = submissions.map((s: any) => s.task_id).filter(Boolean);
  let tasks: any[] = [];
  if (taskIds.length > 0) {
    const { data } = await client
      .from('tasks')
      .select('id, title, stage, requirements, learning_goals, points')
      .in('id', taskIds);
    tasks = data || [];
  }
  const taskMap = new Map(tasks.map((t: any) => [t.id, t]));

  // 4. 关联数据
  const submissionsWithDetails = submissions.map((s: any) => ({
    ...s,
    teams: matchedTeams.find((t: any) => t.id === s.team_id),
    tasks: taskMap.get(s.task_id)
  }));

  // 5. 如果指定了阶段，过滤产出
  let filteredSubmissions = submissionsWithDetails;
  if (phase !== undefined) {
    filteredSubmissions = submissionsWithDetails.filter((s: any) => s.tasks?.stage === phase);
    if (filteredSubmissions.length === 0) {
      return { 
        submissions: filteredSubmissions, 
        teamsFound: matchedTeams,
        suggestion: `小队"${matchedTeams[0].name}"暂无第${phase}阶段的产出记录` 
      };
    }
  }

  console.log('[蜡象助手] 查询到小队产出:', matchedTeams[0].name, '产出数量:', filteredSubmissions.length, phase !== undefined ? `阶段${phase}` : '');
  return { submissions: filteredSubmissions, teamsFound: matchedTeams };
}

// 解析消息发送命令
function parseMessageCommand(text: string): { type: string; targetName: string; content: string } | null {
  // 匹配格式: [发送消息] 目标类型:xxx | 目标名称:xxx | 消息内容:xxx
  const match = text.match(/\[发送消息\]\s*目标类型:(.+?)\s*\|\s*目标名称:(.+?)\s*\|\s*消息内容:(.+?)(?:\n|$)/);
  if (match) {
    return {
      type: match[1].trim(),
      targetName: match[2].trim(),
      content: match[3].trim(),
    };
  }
  return null;
}

// 解析查看产出命令
function parseViewSubmissionCommand(text: string): { teamName: string; taskName?: string } | null {
  // 匹配格式: [查看产出] 小队名称:xxx | 任务名称:xxx
  const match = text.match(/\[查看产出\]\s*小队名称:(.+?)(?:\s*\|\s*任务名称:(.+?))?(?:\n|$)/);
  if (match) {
    return {
      teamName: match[1].trim(),
      taskName: match[2]?.trim(),
    };
  }
  return null;
}

// 解析评价产出命令
function parseEvaluateCommand(text: string): { teamName: string; taskName: string; evaluation: string } | null {
  // 匹配格式: [评价产出] 小队名称:xxx | 任务名称:xxx | 评价结果:xxx
  const match = text.match(/\[评价产出\]\s*小队名称:(.+?)\s*\|\s*任务名称:(.+?)\s*\|\s*评价结果:([\s\S]*?)(?:\n|$)/);
  if (match) {
    return {
      teamName: match[1].trim(),
      taskName: match[2].trim(),
      evaluation: match[3].trim(),
    };
  }
  return null;
}

// 执行消息发送 - 调用消息中心API
async function executeSendMessage(
  client: any,
  senderId: string,
  senderRole: string,
  command: { type: string; targetName: string; content: string }
): Promise<{ success: boolean; message: string; count?: number }> {
  const { type, targetName, content } = command;

  try {
    let targetIds: string[] = [];
    let targetType = 'team';

    // 根据目标类型获取目标ID
    switch (type) {
      case 'team': {
        // 按名称查找小队
        const { data: team } = await client
          .from('teams')
          .select('id, name')
          .ilike('name', `%${targetName}%`)
          .eq('status', 'active')
          .limit(1)
          .single();
        
        if (!team) {
          return { success: false, message: `未找到名为"${targetName}"的小队` };
        }
        targetIds = [team.id];
        targetType = 'team';
        break;
      }

      case 'volunteer': {
        // 按名称查找志愿者
        const { data: volunteer } = await client
          .from('users')
          .select('id, name')
          .ilike('name', `%${targetName}%`)
          .eq('role', 'volunteer')
          .limit(1)
          .single();
        
        if (!volunteer) {
          return { success: false, message: `未找到名为"${targetName}"的志愿者` };
        }
        targetIds = [volunteer.id];
        targetType = 'volunteer';
        break;
      }

      case 'teacher': {
        // 按名称查找助学老师
        const { data: teacher } = await client
          .from('users')
          .select('id, name')
          .ilike('name', `%${targetName}%`)
          .eq('role', 'teacher')
          .limit(1)
          .single();
        
        if (!teacher) {
          return { success: false, message: `未找到名为"${targetName}"的助学老师` };
        }
        targetIds = [teacher.id];
        targetType = 'teacher';
        break;
      }

      case 'all_teams': {
        // 所有活跃小队
        const { data: teams } = await client
          .from('teams')
          .select('id')
          .eq('status', 'active');
        targetIds = (teams || []).map((t: any) => t.id);
        targetType = 'team';
        break;
      }

      case 'all_volunteers': {
        // 所有志愿者
        const { data: volunteers } = await client
          .from('users')
          .select('id')
          .eq('role', 'volunteer');
        targetIds = (volunteers || []).map((v: any) => v.id);
        targetType = 'volunteer';
        break;
      }

      case 'all_teachers': {
        // 所有助学老师
        const { data: teachers } = await client
          .from('users')
          .select('id')
          .eq('role', 'teacher');
        targetIds = (teachers || []).map((t: any) => t.id);
        targetType = 'teacher';
        break;
      }

      case 'school_teams': {
        // 按学校名称查找小队
        const { data: school } = await client
          .from('schools')
          .select('id')
          .ilike('name', `%${targetName}%`)
          .limit(1)
          .single();
        
        if (!school) {
          return { success: false, message: `未找到名为"${targetName}"的学校` };
        }

        const { data: teams } = await client
          .from('teams')
          .select('id')
          .eq('school_id', school.id)
          .eq('status', 'active');
        targetIds = (teams || []).map((t: any) => t.id);
        targetType = 'team';
        break;
      }

      case 'progress_slow_teams': {
        // 进度落后的小队（积分较低的前20%）
        const { data: allTeams } = await client
          .from('teams')
          .select('id, points')
          .eq('status', 'active')
          .order('points', { ascending: true });
        
        if (!allTeams || allTeams.length === 0) {
          return { success: false, message: '当前没有活跃的小队' };
        }
        
        // 取积分最低的20%（至少1个）
        const slowCount = Math.max(1, Math.ceil(allTeams.length * 0.2));
        targetIds = allTeams.slice(0, slowCount).map((t: any) => t.id);
        targetType = 'team';
        break;
      }

      case 'pending_review_teams': {
        // 有待审核产出的小队
        const { data: pendingSubmissions } = await client
          .from('task_submissions')
          .select('team_id')
          .eq('status', 'pending');
        
        if (!pendingSubmissions || pendingSubmissions.length === 0) {
          return { success: false, message: '当前没有待审核的产出' };
        }
        
        // 去重获取小队ID
        const teamSet = new Set<string>(pendingSubmissions.map((s: any) => s.team_id).filter(Boolean));
        targetIds = Array.from(teamSet) as string[];
        targetType = 'team';
        break;
      }

      case 'high_achieving_teams': {
        // 表现优秀的小队（积分较高的前20%）
        const { data: allTeams } = await client
          .from('teams')
          .select('id, points')
          .eq('status', 'active')
          .order('points', { ascending: false });
        
        if (!allTeams || allTeams.length === 0) {
          return { success: false, message: '当前没有活跃的小队' };
        }
        
        // 取积分最高的20%（至少1个）
        const topCount = Math.max(1, Math.ceil(allTeams.length * 0.2));
        targetIds = allTeams.slice(0, topCount).map((t: any) => t.id);
        targetType = 'team';
        break;
      }

      case 'zero_points_teams': {
        // 积分为零的小队
        const { data: zeroTeams } = await client
          .from('teams')
          .select('id')
          .eq('status', 'active')
          .or('points.is.null,points.eq.0');
        
        if (!zeroTeams || zeroTeams.length === 0) {
          return { success: false, message: '当前没有积分为零的小队' };
        }
        
        targetIds = zeroTeams.map((t: any) => t.id);
        targetType = 'team';
        break;
      }

      default:
        return { success: false, message: `未知的目标类型: ${type}` };
    }

    if (targetIds.length === 0) {
      return { success: false, message: '未找到有效的接收对象' };
    }

    // 调用消息中心API发送消息（服务器端直接调用本地地址）
    const apiUrl = `http://localhost:${process.env.DEPLOY_RUN_PORT || 5000}/api/messages`;
    
    console.log('[蜡象助手] 调用消息中心API:', apiUrl, '目标数量:', targetIds.length);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetIds: targetIds,
        targetType: targetType,
        content: content,
        type: 'notification',
        contentType: 'text',
        senderId: senderId,
        senderRole: senderRole,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('[蜡象助手] 调用消息中心API失败:', result);
      return { 
        success: false, 
        message: result.error || '消息发送失败，请稍后重试' 
      };
    }

    const targetLabel = targetType === 'team' ? '小队' : targetType === 'volunteer' ? '志愿者' : '助学老师';
    return {
      success: true,
      message: `消息已成功发送给 ${result.count} 个${targetLabel}`,
      count: result.count,
    };
  } catch (error) {
    console.error('[蜡象助手] 发送消息异常:', error);
    return { success: false, message: '消息发送失败，请稍后重试' };
  }
}

// 执行查看产出
async function executeViewSubmission(
  client: any,
  command: { teamName: string; taskName?: string; phase?: number }
): Promise<{ success: boolean; message: string; data?: any; suggestion?: string }> {
  try {
    // 查找产出
    const { submissions, teamsFound, suggestion } = await findSubmissionByTeamName(client, command.teamName, command.phase);
    
    if (!submissions || submissions.length === 0) {
      // 如果有匹配的小队但没有产出
      if (teamsFound && teamsFound.length > 0) {
        return { 
          success: false, 
          message: suggestion || `小队"${teamsFound[0].name}"存在，但暂无产出记录`,
          suggestion: `请确认该小队是否已经提交了任务产出`
        };
      }
      // 如果没有匹配的小队
      return { 
        success: false, 
        message: suggestion || `未找到名为"${command.teamName}"的小队`,
        suggestion: `可以尝试：\n1. 确认小队名称是否正确\n2. 使用小队编码查询\n3. 在"产出审核"页面查看所有小队产出`
      };
    }

    // 如果指定了任务名称，进一步筛选
    let targetSubmission = submissions[0];
    if (command.taskName) {
      const filtered = submissions.filter((s: any) => 
        s.tasks?.title?.includes(command.taskName!) || 
        s.tasks?.stage?.toString()?.includes(command.taskName!)
      );
      if (filtered.length > 0) {
        targetSubmission = filtered[0];
      } else {
        return {
          success: false,
          message: `小队"${submissions[0].teams?.name}"暂无"${command.taskName}"相关的产出`,
          suggestion: `可选的产出任务：${submissions.map((s: any) => s.tasks?.title).filter(Boolean).join('、')}`
        };
      }
    }

    // 获取产出详情
    const detail = await getSubmissionDetail(client, targetSubmission.id);
    
    if (!detail) {
      return { success: false, message: '获取产出详情失败' };
    }

    // 格式化输出，增强产出内容展示
    const contents = detail.contents?.map((c: any) => {
      const item: any = {
        type: c.content_type,
        hasFile: !!c.file_url,
        fileUrl: c.file_url || null
      };
      
      // 根据内容类型设置展示信息
      switch (c.content_type) {
        case 'text':
          item.value = c.content_value || '';
          item.preview = (c.content_value || '').substring(0, 500);
          break;
        case 'image':
          item.value = c.content_value || '图片';
          item.preview = c.file_url || c.content_value || '';
          break;
        case 'video':
          item.value = c.content_value || '视频';
          item.preview = c.file_url || c.content_value || '';
          break;
        case 'file':
          item.value = c.content_value || '文档';
          item.preview = c.file_url || c.content_value || '';
          break;
        default:
          item.value = c.content_value || '';
          item.preview = c.file_url || c.content_value || '';
      }
      
      return item;
    }) || [];

    // 获取任务信息用于评价参考
    const taskInfo = detail.tasks ? {
      title: detail.tasks.title,
      stage: detail.tasks.stage,
      requirements: detail.tasks.requirements,
      learningGoals: detail.tasks.learning_goals
    } : null;

    const result = {
      teamName: detail.teams?.name || '未知小队',
      taskName: detail.tasks?.title || '未知任务',
      phase: detail.tasks?.stage ? `第${detail.tasks.stage}阶段` : '未知阶段',
      status: detail.status === 'approved' ? '已通过' : detail.status === 'rejected' ? '已退回' : '待审核',
      submittedAt: detail.submitted_at ? new Date(detail.submitted_at).toLocaleString('zh-CN') : '未提交',
      reviewedAt: detail.reviewed_at ? new Date(detail.reviewed_at).toLocaleString('zh-CN') : '未审核',
      deadline: detail.tasks?.next_task_deadline || null,
      feedback: detail.feedback || '无',
      contents,
      taskInfo
    };

    return {
      success: true,
      message: `找到"${result.teamName}"的产出`,
      data: result
    };
  } catch (error) {
    console.error('[蜡象助手] 查看产出异常:', error);
    return { success: false, message: '查看产出失败，请稍后重试' };
  }
}

// 执行评价产出 - 保存AI生成的评价结果
async function executeEvaluateSubmission(
  client: any,
  command: { teamName: string; taskName: string; evaluation: string }
): Promise<{ success: boolean; message: string; suggestion?: string }> {
  try {
    // 查找产出
    const { submissions, teamsFound, suggestion } = await findSubmissionByTeamName(client, command.teamName);
    
    if (!submissions || submissions.length === 0) {
      if (teamsFound && teamsFound.length > 0) {
        return { 
          success: false, 
          message: suggestion || `小队"${teamsFound[0].name}"存在，但暂无产出记录`,
          suggestion: `请先让该小队提交任务产出后再进行评价`
        };
      }
      return { 
        success: false, 
        message: suggestion || `未找到名为"${command.teamName}"的小队`,
        suggestion: `请确认小队名称是否正确`
      };
    }

    // 筛选指定任务
    const filtered = submissions.filter((s: any) => 
      s.tasks?.title?.includes(command.taskName) || 
      s.tasks?.stage?.toString()?.includes(command.taskName)
    );
    
    if (filtered.length === 0) {
      return { 
        success: false, 
        message: `未找到"${command.teamName}"关于"${command.taskName}"的产出`,
        suggestion: `该小队已有的产出任务：${submissions.map((s: any) => s.tasks?.title).filter(Boolean).join('、')}`
      };
    }

    const submissionId = filtered[0].id;
    
    // 解析评价结果中的分数（如果包含）
    let feedbackText = command.evaluation;
    
    // 如果评价中包含分数信息，提取并格式化
    const scoreMatch = command.evaluation.match(/总分[：:]\s*(\d+)/);
    if (scoreMatch) {
      const totalScore = parseInt(scoreMatch[1]);
      // 格式化反馈，添加AI评价标签
      feedbackText = `【蜡象助手AI评价】\n${command.evaluation}`;
    } else {
      feedbackText = `【蜡象助手AI评价】\n${command.evaluation}`;
    }

    // 更新产出反馈
    await client
      .from('task_submissions')
      .update({ 
        feedback: feedbackText,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', submissionId);

    return {
      success: true,
      message: `已成功评价"${command.teamName}"的产出`
    };
  } catch (error) {
    console.error('[蜡象助手] 评价产出异常:', error);
    return { success: false, message: '评价产出失败，请稍后重试' };
  }
}

/**
 * 解析主题ID：支持UUID或主题名称
 * 如果传入的是UUID格式，直接返回
 * 如果传入的是主题名称，查询数据库获取对应UUID
 */
async function resolveThemeId(themeIdOrName: string): Promise<{ id: string; name: string } | null> {
  // UUID 格式检测
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(themeIdOrName)) {
    return { id: themeIdOrName, name: '' };
  }
  
  // 按主题名称查询
  try {
    const res = await fetch(`http://localhost:${process.env.DEPLOY_RUN_PORT || 5000}/api/ai/create-theme`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.themes)) {
        // 精确匹配
        const exactMatch = data.themes.find((t: { id: string; name: string }) => t.name === themeIdOrName);
        if (exactMatch) {
          return { id: exactMatch.id, name: exactMatch.name };
        }
        // 模糊匹配（包含关键词）
        const fuzzyMatch = data.themes.find((t: { id: string; name: string }) => 
          t.name.includes(themeIdOrName) || themeIdOrName.includes(t.name)
        );
        if (fuzzyMatch) {
          return { id: fuzzyMatch.id, name: fuzzyMatch.name };
        }
      }
    }
  } catch (e) {
    console.error('[resolveThemeId] 查询主题失败:', e);
  }
  
  return null;
}

/**
 * 创建主题命令执行
 */
export async function executeCreateTheme(
  client: any,
  themeName: string,
  description: string,
  options: {
    icon?: string;
    isExclusive?: boolean;
    schoolId?: string;
  } = {}
): Promise<{ success: boolean; themeId?: string; message: string }> {
  try {
    const { data: theme, error } = await client
      .from('task_themes')
      .insert({
        id: `theme_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: themeName,
        description: description || '',
        icon: options.icon || '🎯',
        is_active: true,
        is_exclusive: options.isExclusive ?? true,
        school_id: options.schoolId || null,
      })
      .select('id, name')
      .single();

    if (error) {
      return { success: false, message: `创建主题失败：${error.message}` };
    }

    return { success: true, themeId: theme?.id, message: `主题「${themeName}」创建成功` };
  } catch (error) {
    return { success: false, message: `创建主题异常：${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * 发送通知命令执行（比发消息更正式）
 */
export async function executeSendNotification(
  client: any,
  targetTeamIds: string[],
  title: string,
  content: string,
  senderId: string
): Promise<{ success: boolean; sentCount: number; message: string }> {
  let sentCount = 0;
  
  try {
    for (const teamId of targetTeamIds) {
      const { error } = await client
        .from('messages')
        .insert({
          title: title || '系统通知',
          content,
          sender_id: senderId,
          receiver_id: teamId,
          type: 'notification',
          is_read: false,
        });
      
      if (!error) sentCount++;
    }

    return { 
      success: sentCount > 0, 
      sentCount,
      message: `通知已发送给${sentCount}个小队` 
    };
  } catch (error) {
    return { success: false, sentCount: 0, message: `发送通知异常：${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * 查看进度概览命令执行
 */
export async function executeViewProgress(
  client: any,
  teamIds: string[]
): Promise<{ success: boolean; data: any[]; message: string }> {
  try {
    if (teamIds.length === 0) {
      return { success: false, data: [], message: '没有可查询的小队' };
    }

    // 批量获取小队信息
    const { data: teams } = await client
      .from('teams')
      .select('id, name, code, points, current_theme_id, current_task_id, cycle')
      .in('id', teamIds);

    // 批量获取提交统计
    const { data: submissions } = await client
      .from('task_submissions')
      .select('team_id, status')
      .in('team_id', teamIds);

    // 构建进度概览
    const progressData = (teams || []).map((team: any) => {
      const teamSubs = (submissions || []).filter((s: any) => s.team_id === team.id);
      return {
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        points: team.points || 0,
        cycle: team.cycle || 1,
        totalSubmissions: teamSubs.length,
        approvedSubmissions: teamSubs.filter((s: any) => s.status === 'approved').length,
        pendingSubmissions: teamSubs.filter((s: any) => s.status === 'pending').length,
      };
    });

    return { 
      success: true, 
      data: progressData, 
      message: `已获取${progressData.length}个小队的进度概览` 
    };
  } catch (error) {
    return { success: false, data: [], message: `查询进度异常：${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * 生成分析报告命令执行
 */
export async function executeGenerateReport(
  client: any,
  reportType: string,
  scope: { teamIds?: string[]; schoolId?: string; themeId?: string }
): Promise<{ success: boolean; reportData: any; message: string }> {
  try {
    const reportData: Record<string, any> = { type: reportType, generatedAt: new Date().toISOString() };

    if (reportType === 'team_progress' && scope.teamIds && scope.teamIds.length > 0) {
      const progressResult = await executeViewProgress(client, scope.teamIds);
      reportData.progress = progressResult.data;
    } else if (reportType === 'submission_overview') {
      let query = client
        .from('task_submissions')
        .select('id, status, rating, created_at, team_id')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (scope.teamIds && scope.teamIds.length > 0) {
        query = query.in('team_id', scope.teamIds);
      }
      
      const { data: submissions } = await query;
      reportData.submissions = submissions || [];
      reportData.stats = {
        total: submissions?.length || 0,
        pending: submissions?.filter((s: any) => s.status === 'pending').length || 0,
        approved: submissions?.filter((s: any) => s.status === 'approved').length || 0,
        rejected: submissions?.filter((s: any) => s.status === 'rejected').length || 0,
      };
    }

    return { 
      success: true, 
      reportData, 
      message: `${reportType}报告生成成功` 
    };
  } catch (error) {
    return { success: false, reportData: null, message: `生成报告异常：${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * 命令链执行器 — 按顺序执行多个命令
 */
export async function executeCommandChain(
  client: any,
  commands: Array<{ type: string; params: Record<string, any> }>,
  context: { userId: string; userRole: string }
): Promise<Array<{ type: string; success: boolean; result: any; message: string }>> {
  const results: Array<{ type: string; success: boolean; result: any; message: string }> = [];

  for (const cmd of commands) {
    let result: { success: boolean; message: string; [key: string]: any } = { success: false, message: '未知命令' };

    switch (cmd.type) {
      case 'send_message':
        result = await executeSendMessage(client, context.userId, context.userRole, cmd.params as any);
        break;
      case 'view_submission':
        result = await executeViewSubmission(client, cmd.params as any);
        break;
      case 'evaluate_submission':
        result = await executeEvaluateSubmission(client, cmd.params as any);
        break;
      case 'create_theme':
        result = await executeCreateTheme(client, cmd.params.name, cmd.params.description, cmd.params.options);
        break;
      case 'send_notification':
        result = await executeSendNotification(client, cmd.params.teamIds, cmd.params.title, cmd.params.content, context.userId);
        break;
      case 'view_progress':
        result = await executeViewProgress(client, cmd.params.teamIds);
        break;
      case 'generate_report':
        result = await executeGenerateReport(client, cmd.params.reportType, cmd.params.scope);
        break;
      default:
        result = { success: false, message: `不支持的命令类型：${cmd.type}` };
    }

    results.push({ type: cmd.type, success: result.success, result, message: result.message });

    // 如果某步失败，停止执行后续命令
    if (!result.success) {
      break;
    }
  }

  return results;
}

export {
  getSubmissionDetail,
  findSubmissionByTeamName,
  parseMessageCommand,
  parseViewSubmissionCommand,
  parseEvaluateCommand,
  executeSendMessage,
  executeViewSubmission,
  executeEvaluateSubmission,
  resolveThemeId,
};
