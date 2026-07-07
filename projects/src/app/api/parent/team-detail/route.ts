import { requireParent, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 获取小队详细信息
export async function GET(request: NextRequest) {
  const auth = requireParent(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const childName = searchParams.get('childName');

    if (!teamId) {
      return ApiErrors.validation('缺少小队ID');
    }

    // IDOR 防护：验证家长是否关注了该小队
    // 注意：parent_team_relations 表无 is_active/status 字段，只能校验存在关注关系
    const { data: follow, error: followError } = await supabase.from('parent_team_relations')
      .select('id')
      .eq('parent_id', auth.payload.userId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (followError) {
      console.error('[家长查看小队详情] 关注关系校验查询失败:', followError);
      return ApiErrors.forbidden('关注关系校验失败');
    }
    if (!follow) return ApiErrors.forbidden('未关注该小队');

    // 获取小队基本信息
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(`
        id,
        name,
        slogan,
        points,
        cycle,
        created_at,
        current_theme_id,
        current_task_id,
        theme:task_themes!teams_current_theme_id_fkey(
          id,
          name,
          description,
          icon
        )
      `)
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 获取成员列表
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, role, intro')
      .eq('team_id', teamId);

    // 获取当前主题的所有任务及产出
    let tasks: any[] = [];
    let submissions: any[] = [];
    const currentCycle = team.cycle || 1;

    if (team.current_theme_id) {
      // 获取该主题的任务（简化查询，避免嵌套关联）
      const { data: themeTasks, error: themeTasksError } = await supabase
        .from('tasks')
        .select('id, title, description, stage, points')
        .eq('theme_id', team.current_theme_id)
        .order('stage');

      tasks = themeTasks || [];

      // 获取该小队的所有产出提交（按当前周期过滤）
      const taskIds = tasks.map(t => t.id);
      if (taskIds.length > 0) {
        const { data: teamSubmissions } = await supabase
          .from('task_submissions')
          .select(`
            id,
            task_id,
            content,
            status,
            rating,
            review_comment,
            created_at,
            updated_at,
            file_urls,
            cycle
          `)
          .eq('team_id', teamId)
          .eq('cycle', currentCycle)
          .in('task_id', taskIds)
          .order('created_at', { ascending: false });

        // 获取每个提交的点赞数
        if (teamSubmissions && teamSubmissions.length > 0) {
          const submissionIds = teamSubmissions.map(s => s.id);
          const { data: likesData } = await supabase
            .from('likes')
            .select('submission_id')
            .in('submission_id', submissionIds);
          
          // 统计每个提交的点赞数
          const likesCount = new Map<string, number>();
          (likesData || []).forEach((like: any) => {
            likesCount.set(like.submission_id, (likesCount.get(like.submission_id) || 0) + 1);
          });
          
          // 添加点赞数到提交记录
          submissions = teamSubmissions.map(s => ({
            ...s,
            likes: likesCount.get(s.id) || 0
          }));
        } else {
          submissions = [];
        }
      }
    }

    // 获取已完成的主题记录（从 team_theme_selections 表）
    const { data: themeSelections, error: themeSelError } = await supabase
      .from('team_theme_selections')
      .select(`
        id,
        theme_id,
        cycle,
        status,
        selected_at,
        completed_at
      `)
      .eq('team_id', teamId)
      .order('cycle', { ascending: true });

    // 获取 theme_completions 作为容错数据源
    const { data: themeCompletions } = await supabase
      .from('theme_completions')
      .select('id, theme_id, cycle, completed_at, total_points, total_rewards, total_tasks')
      .eq('team_id', teamId);

    // 构建 completions 的快速查找 Map
    const completionMap = new Map<string, any>();
    (themeCompletions || []).forEach((c: any) => {
      completionMap.set(`${c.theme_id}_${c.cycle}`, c);
    });

    // 获取已完成主题的任务和产出（存档）
    let completedThemes: any[] = [];
    
    if (themeSelections && themeSelections.length > 0) {
      for (const selection of themeSelections) {
        // 判断是否已完成：selection.status === 'completed' 或者 theme_completions 中有对应记录
        const completionKey = `${selection.theme_id}_${selection.cycle}`;
        const completionRecord = completionMap.get(completionKey);
        const isCompleted = selection.status === 'completed' || !!completionRecord;

        if (isCompleted && selection.theme_id) {
          const themeId = selection.theme_id;
          
          // 获取主题信息
          const { data: themeInfo } = await supabase
            .from('task_themes')
            .select('id, name, description, icon')
            .eq('id', themeId)
            .single();
          
          if (!themeInfo) continue;
          
          // 获取该主题的任务
          const { data: completedTasks } = await supabase
            .from('tasks')
            .select(`
              id,
              title,
              description,
              stage,
              points
            `)
            .eq('theme_id', themeId)
            .order('stage');

          // 获取该主题的产出（按对应周期过滤）
          const completedTaskIds = (completedTasks || []).map(t => t.id);
          let completedSubmissions: any[] = [];
          const selectionCycle = selection.cycle || 1;
          
          if (completedTaskIds.length > 0) {
            const { data: subs } = await supabase
              .from('task_submissions')
              .select(`
                id,
                task_id,
                content,
                status,
                rating,
                review_comment,
                file_urls,
                created_at,
                updated_at
              `)
              .eq('team_id', teamId)
              .eq('cycle', selectionCycle)
              .in('task_id', completedTaskIds)
              .order('created_at', { ascending: false });

            // 获取每个提交的点赞数
            if (subs && subs.length > 0) {
              const subIds = subs.map(s => s.id);
              const { data: likesData } = await supabase
                .from('likes')
                .select('submission_id')
                .in('submission_id', subIds);
              
              const likesCount = new Map<string, number>();
              (likesData || []).forEach((like: any) => {
                likesCount.set(like.submission_id, (likesCount.get(like.submission_id) || 0) + 1);
              });
              
              completedSubmissions = subs.map(s => ({
                ...s,
                likes: likesCount.get(s.id) || 0
              }));
            }
          }

          // 获取该周期的技能学习记录
          const { data: cycleSkillLearnings } = await supabase
            .from('team_skill_learnings')
            .select(`
              skill_id,
              status,
              started_at,
              completed_at,
              skills(id, name, description, icon, category, content, learning_materials)
            `)
            .eq('team_id', teamId)
            .eq('cycle', selectionCycle);

          // 查找对应的 theme_completion 记录（用于报告链接）
          // 优先使用已预加载的 completionMap，避免额外查询
          const completionKey = `${themeId}_${selection.cycle}`;
          const completionRecord = completionMap.get(completionKey);
          const completionId = completionRecord?.id || null;
          const completedAtValue = selection.completed_at || completionRecord?.completed_at || null;
          const totalPoints = completionRecord?.total_points || 0;
          const totalRewards = completionRecord?.total_rewards || 0;
          const totalTasks = completionRecord?.total_tasks || 0;

          completedThemes.push({
            id: selection.id,
            completionId,
            cycle: selection.cycle,
            selectedAt: selection.selected_at,
            completedAt: completedAtValue,
            theme: themeInfo,
            totalPoints,
            totalRewards,
            totalTasks,
            tasks: (completedTasks || []).map(t => ({
              ...t,
              submissions: completedSubmissions.filter(s => s.task_id === t.id)
            })),
            skills: (cycleSkillLearnings || []).map((sl: any) => ({
              id: sl.skills?.id,
              name: sl.skills?.name,
              description: sl.skills?.description,
              icon: sl.skills?.icon,
              category: sl.skills?.category,
              content: sl.skills?.content,
              learningMaterials: sl.skills?.learning_materials,
              learningStatus: sl.status,
              learningStartedAt: sl.started_at,
              learningCompletedAt: sl.completed_at
            }))
          });
        }
      }
    }

    // 获取新知学习内容（skill_records 表）
    const { data: skillRecords } = await supabase
      .from('skill_records')
      .select(`
        id,
        skill_id,
        status,
        completed_at,
        created_at,
        skill:skills(id, name, description, category),
        task_id,
        task:tasks(id, title, stage)
      `)
      .eq('team_id', teamId)
      .order('completed_at', { ascending: false });

    // 获取激励物品记录（user_rewards 表）
    const { data: userRewards } = await supabase
      .from('user_rewards')
      .select(`
        id,
        earned_at,
        reward:rewards(id, name, description, icon, type, points_required)
      `)
      .eq('team_id', teamId)
      .order('earned_at', { ascending: false });

    // 获取积分变化记录
    const { data: pointHistory } = await supabase
      .from('point_history')
      .select(`
        id,
        points,
        reason,
        created_at,
        task_id,
        task:tasks(id, title, stage)
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(50);

    // 获取该孩子的前测结果（如果有）
    let pretestResponses: any[] = [];
    if (childName) {
      const { data: responses } = await supabase
        .from('pretest_responses')
        .select(`
          id,
          question_id,
          answer,
          created_at,
          question:pretest_questions(id, title, question_type, options)
        `)
        .eq('team_id', teamId)
        .eq('member_name', childName);

      pretestResponses = responses || [];
    }

    // 获取该孩子的最后任务反馈（如果有）
    let finalFeedbacks: any[] = [];
    if (childName) {
      const { data: feedbacks } = await supabase
        .from('final_task_feedbacks')
        .select(`
          id,
          form_data,
          submitted_at,
          final_task:final_tasks(id, title)
        `)
        .eq('team_id', teamId)
        .eq('member_name', childName);

      finalFeedbacks = feedbacks || [];
    }

    // 获取转账记录
    const { data: transferRecords } = await supabase
      .from('point_transfers')
      .select(`
        id,
        points,
        message,
        status,
        created_at,
        from_team_id,
        to_team_id,
        from_team:from_team_id(id, name, code),
        to_team:to_team_id(id, name, code)
      `)
      .or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    // 处理转账记录，添加类型标识
    const processedTransfers = (transferRecords || []).map((record: any) => ({
      ...record,
      type: record.from_team_id === teamId ? 'sent' : 'received'
    }));

    // 获取借积分记录
    const { data: borrowRecords } = await supabase
      .from('point_borrows')
      .select(`
        id,
        points,
        interest_rate,
        overdue_interest_rate,
        repay_date,
        status,
        message,
        rejection_reason,
        created_at,
        approved_at,
        repaid_at,
        actual_points,
        borrower_id,
        lender_id,
        borrower:borrower_id(id, name, code),
        lender:lender_id(id, name, code)
      `)
      .or(`borrower_id.eq.${teamId},lender_id.eq.${teamId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    // 处理借积分记录
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const processedBorrows = (borrowRecords || []).map((record: any) => {
      const isBorrower = record.borrower_id === teamId;
      const repayDate = new Date(record.repay_date);
      repayDate.setHours(0, 0, 0, 0);
      const isOverdue = record.status === 'approved' && repayDate < today;
      
      const basePoints = record.points;
      const interest = Math.round(basePoints * (record.interest_rate / 100) * 10) / 10;
      const totalRepay = Math.round((basePoints + interest) * 10) / 10;
      
      let overdueInterest = 0;
      if (isOverdue) {
        const overdueDays = Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
        overdueInterest = Math.round(basePoints * (record.overdue_interest_rate / 100) * overdueDays * 10) / 10;
      }
      const actualRepay = Math.round((totalRepay + overdueInterest) * 10) / 10;

      return {
        ...record,
        type: isBorrower ? 'borrowed' : 'lent',
        is_overdue: isOverdue,
        overdue_days: isOverdue ? Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
        total_repay: totalRepay,
        actual_repay: actualRepay,
        interest,
        overdue_interest: overdueInterest
      };
    });

    // 计算统计数据 - 使用 teams.points 作为当前总积分（实时准确）
    // 累计获得积分从 point_transactions 所有正向收入类型汇总
    const { data: incomeData } = await supabase
      .from('point_transactions')
      .select('points')
      .eq('team_id', teamId)
      .in('change_type', ['transfer_in', 'borrow_in', 'receive_repay', 'receive_partial_repay']);

    const totalEarnedPoints = incomeData?.reduce((sum: number, t: { points: number }) => sum + Math.abs(t.points), 0) || 0;

    // 任务奖励积分（从已通过的提交中汇总任务积分）
    const { data: taskPointsData } = await supabase
      .from('task_submissions')
      .select('task_id')
      .eq('team_id', teamId)
      .eq('status', 'approved');

    let taskPoints = 0;
    if (taskPointsData && taskPointsData.length > 0) {
      const taskIds = [...new Set(taskPointsData.map((t: { task_id: string }) => t.task_id))];
      if (taskIds.length > 0) {
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('id, points')
          .in('id', taskIds);
        const taskPointsMap = new Map(tasksData?.map((t: { id: string; points: number }) => [t.id, t.points || 0]));
        // 每个已通过的提交都计算积分（不同周期的重复任务分别计分）
        taskPoints = taskPointsData.reduce((sum: number, t: { task_id: string }) => sum + (taskPointsMap.get(t.task_id) || 0), 0);
      }
    }

    // 总积分 = 当前余额(teams.points)，这是最准确和实时的
    const totalPoints = team.points || 0;
    // 累计获得积分 = 任务奖励 + 转入 + 借入 + 归还收入（供参考）
    const totalEarned = taskPoints + totalEarnedPoints;

    // 获取所有周期的已通过提交数（而非仅当前周期的 submissions）
    const { count: allApprovedCount } = await supabase
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'approved');

    const completedTasksCount = allApprovedCount || 0;

    // 获取所有周期的小队收到点赞总数
    const { count: allReceivedLikesCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('to_team_id', teamId);

    const totalLikes = allReceivedLikesCount || 0;
    const skillsLearned = skillRecords?.filter(r => r.status === 'completed').length || 0;
    const rewardsEarned = userRewards?.length || 0;

    // 获取爱心宝石数据（从 teams 表读取权威值，heart_gems 表的 gems 从未被写入）
    const { data: teamForGems } = await supabase
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', teamId)
      .maybeSingle();

    // 获取徽章数量（rewards.type = 'badge'）
    const { data: badgeRewards } = await supabase
      .from('user_rewards')
      .select('id, reward_id, rewards!inner(id, type)')
      .eq('team_id', teamId)
      .eq('rewards.type', 'badge');

    // 获取技能卡数量（rewards.type = 'skill_card'）
    const { data: skillCardRewards } = await supabase
      .from('user_rewards')
      .select('id, reward_id, rewards!inner(id, type)')
      .eq('team_id', teamId)
      .eq('rewards.type', 'skill_card');

    // 整理当前主题的任务进度
    // 将提交记录映射到任务上
    const taskSubmissionMap = new Map<string, any[]>();
    for (const s of submissions) {
      const list = taskSubmissionMap.get(s.task_id) || [];
      list.push(s);
      taskSubmissionMap.set(s.task_id, list);
    }
    const taskList: any[] = tasks.map((t: any) => ({
      ...t,
      submissions: taskSubmissionMap.get(t.id) || []
    }));
    
    // 判断当前主题状态（与小队端一致）
    // current_task_id 为 null 表示待下发状态
    let currentThemeStatus: 'pending_assign' | 'in_progress' | 'completed' = 'pending_assign';
    let currentTaskInfo: any = null;
    
    if (team.current_task_id) {
      // 有正在执行的任务
      currentThemeStatus = 'in_progress';
      currentTaskInfo = taskList.find((t: any) => t.id === team.current_task_id) || null;
      
      // 获取当前任务的必学技能完成状态
      if (currentTaskInfo) {
        // 获取当前任务的所有技能（包含学习内容）
        const { data: taskSkills } = await supabase
          .from('task_skills')
          .select(`
            skill_id,
            is_required,
            points,
            skills(
              id,
              name,
              description,
              icon,
              category,
              content,
              video_url,
              learning_materials
            )
          `)
          .eq('task_id', team.current_task_id);
        
        const requiredSkillIds = (taskSkills || []).filter((ts: any) => ts.is_required).map((ts: any) => ts.skill_id);
        
        // 获取本周期所有技能的学习记录
        const { data: completedLearnings } = await supabase
          .from('team_skill_learnings')
          .select('skill_id, status, started_at, completed_at')
          .eq('team_id', teamId)
          .eq('cycle', currentCycle)
          .in('skill_id', (taskSkills || []).map((ts: any) => ts.skill_id));
        
        const learningStatusMap = new Map<string, any>();
        (completedLearnings || []).forEach((l: any) => {
          learningStatusMap.set(l.skill_id, l);
        });
        
        const completedRequiredSkills = (completedLearnings || []).filter(
          (l: any) => requiredSkillIds.includes(l.skill_id) && l.status === 'completed'
        ).length;
        
        // 计算必学技能完成状态
        const requiredSkillsTotal = requiredSkillIds.length;
        const allRequiredSkillsCompleted = requiredSkillsTotal === 0 || completedRequiredSkills === requiredSkillsTotal;
        
        // 处理技能学习状态和内容
        const processedSkills = (taskSkills || []).map((ts: any) => {
          const learning = learningStatusMap.get(ts.skill_id);
          return {
            id: ts.skills?.id,
            name: ts.skills?.name,
            description: ts.skills?.description,
            icon: ts.skills?.icon,
            category: ts.skills?.category,
            content: ts.skills?.content,
            videoUrl: ts.skills?.video_url,
            learningMaterials: ts.skills?.learning_materials,
            isRequired: ts.is_required,
            points: ts.points,
            learningStatus: learning?.status || 'not_started',
            learningStartedAt: learning?.started_at,
            learningCompletedAt: learning?.completed_at
          };
        });
        
        // 判断任务状态
        const hasSubmission = currentTaskInfo.submissions && currentTaskInfo.submissions.length > 0;
        const submission = hasSubmission ? currentTaskInfo.submissions[0] : null;
        
        let taskPhase: 'learning' | 'ready_submit' | 'pending_review' | 'completed' | 'rejected' = 'learning';
        
        if (submission?.status === 'approved') {
          taskPhase = 'completed';
        } else if (submission?.status === 'rejected') {
          taskPhase = 'rejected';
        } else if (submission?.status === 'pending') {
          taskPhase = 'pending_review';
        } else if (allRequiredSkillsCompleted) {
          taskPhase = 'ready_submit';
        } else {
          taskPhase = 'learning';
        }
        
        currentTaskInfo.taskPhase = taskPhase;
        currentTaskInfo.requiredSkillsTotal = requiredSkillsTotal;
        currentTaskInfo.requiredSkillsCompleted = completedRequiredSkills;
        currentTaskInfo.allRequiredSkillsCompleted = allRequiredSkillsCompleted;
        currentTaskInfo.skills = processedSkills; // 添加技能学习内容
      }
    } else if (taskList.length > 0) {
      // 有主题但没有当前任务 → 待下发
      currentThemeStatus = 'pending_assign';
    }
    
    const currentThemeProgress = {
      totalTasks: taskList.length,
      completedTasks: taskList.filter(t => 
        t.submissions && t.submissions.some((s: any) => s.status === 'approved')
      ).length,
      pendingTasks: taskList.filter(t => 
        !t.submissions || t.submissions.length === 0 || 
        t.submissions.every((s: any) => s.status === 'pending')
      ).length,
      status: currentThemeStatus,
      currentTask: currentTaskInfo ? {
        id: currentTaskInfo.id,
        title: currentTaskInfo.title,
        description: currentTaskInfo.description,
        stage: currentTaskInfo.stage,
        points: currentTaskInfo.points,
        submission: currentTaskInfo.submissions?.[0] || null,
        // 任务阶段状态
        taskPhase: currentTaskInfo.taskPhase || 'learning',
        requiredSkillsTotal: currentTaskInfo.requiredSkillsTotal || 0,
        requiredSkillsCompleted: currentTaskInfo.requiredSkillsCompleted || 0,
        allRequiredSkillsCompleted: currentTaskInfo.allRequiredSkillsCompleted || false,
        // 技能学习内容
        skills: currentTaskInfo.skills || []
      } : null,
      tasks: taskList.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        stage: t.stage,
        points: t.points,
        skills: [],
        tools: [],
        submission: t.submissions?.[0] || null // 取最新的产出
      }))
    };

    return NextResponse.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          slogan: team.slogan,
          points: team.points,
          cycle: team.cycle,
          createdAt: team.created_at,
          theme: team.theme
        },
        stats: {
          totalPoints,
          totalEarned,
          completedTasksCount,
          totalLikes,
          skillsLearned,
          rewardsEarned,
          heartFragments: teamForGems?.heart_shards || 0,
          heartGems: teamForGems?.heart_gems || 0,
          badgeCount: badgeRewards?.length || 0,
          skillCardCount: skillCardRewards?.length || 0
        },
        members,
        currentTheme: {
          ...team.theme,
          progress: currentThemeProgress
        },
        completedThemes,
        skills: skillRecords || [],
        rewards: userRewards || [],
        pointHistory: pointHistory || [],
        pretestResponses,
        finalFeedbacks,
        transferRecords: processedTransfers,
        borrowRecords: processedBorrows
      }
    });

  } catch (error: any) {
    console.error('[小队详情] 错误:', error);
    return safeError(error);
  }
}
