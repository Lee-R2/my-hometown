/**
 * 小队数据查询模块
 *
 * 从 ai/assistant/route.ts 提取的数据查询函数
 * 包括：小队完整数据、兄弟小队进度、兄弟小队任务详情
 */

import { LIKE_POINTS } from '@/lib/constants';

/**
 * 获取小队完整数据
 * 包括：基本信息、成员、当前主题、任务、提交记录、激励、技能学习、爱心宝石、未读消息
 */
export async function getTeamData(client: any, teamId: string) {
  const data: Record<string, any> = {};

  try {
    // 1. 获取小队基本信息
    const { data: team } = await client
      .from('teams')
      .select('id, name, code, slogan, rules, points, current_theme_id, current_task_id, next_task_deadline, assigned_volunteer_id, cycle')
      .eq('id', teamId)
      .single();
    data.team = team;

    if (!team) return data;

    // 获取当前周期信息
    const currentCycle = team.cycle || 1;

    // 查询当前周期的选择记录
    const { data: themeSelection } = await client
      .from('team_theme_selections')
      .select('id, theme_id, status, cycle')
      .eq('team_id', teamId)
      .eq('cycle', currentCycle)
      .maybeSingle();
    data.currentThemeSelection = themeSelection;

    // 判断小队是否可以重新选择主题（当前周期已完成）
    data.canSelectNewTheme = !themeSelection || themeSelection.status === 'completed';

    // 2. 获取小队成员信息
    const { data: members } = await client
      .from('team_members')
      .select('id, name, role, intro')
      .eq('team_id', teamId);
    data.members = members || [];

    // 3. 如果有当前主题，获取主题相关数据
    if (team.current_theme_id) {
      // 3.1 获取主题信息
      const { data: theme } = await client
        .from('task_themes')
        .select('id, name, description, icon')
        .eq('id', team.current_theme_id)
        .single();
      data.theme = theme;

      // 3.2 获取主题下的所有任务（主线任务）
      const { data: allTasks } = await client
        .from('tasks')
        .select('id, title, description, stage, points, requirements, learning_goals, task_type, is_active')
        .eq('theme_id', team.current_theme_id)
        .eq('is_active', true)
        .eq('task_type', 'main')
        .order('stage', { ascending: true });
      data.allTasks = allTasks || [];

      // 3.3 获取小队的任务提交记录（含产出内容）
      const themeTaskIds = (allTasks || []).map((t: any) => t.id);
      if (themeTaskIds.length > 0) {
        const { data: submissions } = await client
          .from('task_submissions')
          .select('id, task_id, status, rating, points_earned, review_comment, created_at, reviewed_at, content, file_urls')
          .eq('team_id', teamId)
          .in('task_id', themeTaskIds)
          .order('created_at', { ascending: false });
        data.submissions = submissions || [];

        // 提取产出内容详情（供AI分析）
        data.submissionContents = (submissions || []).map((s: any) => ({
          submissionId: s.id,
          taskId: s.task_id,
          status: s.status,
          rating: s.rating,
          reviewComment: s.review_comment,
          content: s.content || '',
          fileUrls: s.file_urls || {},
          createdAt: s.created_at
        }));

        // 统计已完成的任务
        const completedTaskIds = new Set(
          (submissions || [])
            .filter((s: any) => s.status === 'approved')
            .map((s: any) => s.task_id)
        );
        data.completedTaskIds = Array.from(completedTaskIds);
      }

      // 3.4 获取当前任务的详细信息
      if (team.current_task_id) {
        const { data: currentTask } = await client
          .from('tasks')
          .select('id, title, description, stage, points, requirements, learning_goals, task_type')
          .eq('id', team.current_task_id)
          .single();
        data.currentTask = currentTask;

        // 获取当前任务关联的工具
        if (currentTask) {
          const { data: taskTools } = await client
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
                usage_guide
              )
            `)
            .eq('task_id', currentTask.id);
          data.currentTaskTools = taskTools || [];

          // 获取当前任务关联的技能
          const { data: taskSkills } = await client
            .from('task_skills')
            .select(`
              id,
              points,
              is_required,
              skills (
                id,
                name,
                description,
                icon,
                category,
                content
              )
            `)
            .eq('task_id', currentTask.id);
          data.currentTaskSkills = taskSkills || [];

          // 获取当前任务的激励
          const { data: taskRewards } = await client
            .from('task_rewards')
            .select(`
              id,
              rewards (
                id,
                name,
                description,
                icon,
                type,
                points
              )
            `)
            .eq('task_id', currentTask.id);
          data.currentTaskRewards = taskRewards || [];
        }
      }

      // 3.5 获取小队已获得的激励（当前主题）
      if (themeTaskIds && themeTaskIds.length > 0) {
        const { data: userRewards } = await client
          .from('user_rewards')
          .select(`
            id,
            earned_at,
            task_id,
            rewards (
              id,
              name,
              description,
              icon,
              type,
              points
            )
          `)
          .eq('team_id', teamId)
          .in('task_id', themeTaskIds)
          .order('earned_at', { ascending: false });
        data.userRewards = userRewards || [];

        // 激励统计
        const rewardsByType: Record<string, number> = {};
        (userRewards || []).forEach((ur: any) => {
          const type = ur.rewards?.type || 'other';
          rewardsByType[type] = (rewardsByType[type] || 0) + 1;
        });
        data.rewardsStats = {
          total: (userRewards || []).length,
          byType: rewardsByType,
          totalPoints: (userRewards || []).reduce((sum: number, ur: any) => sum + (ur.rewards?.points || 0), 0),
        };

        // 3.6 获取点赞统计
        const { data: submissions } = await client
          .from('task_submissions')
          .select('id')
          .eq('team_id', teamId)
          .in('task_id', themeTaskIds);

        const submissionIds = (submissions || []).map((s: any) => s.id);
        if (submissionIds.length > 0) {
          const { count: likeCount } = await client
            .from('likes')
            .select('id', { count: 'exact', head: true })
            .in('submission_id', submissionIds);

          data.likesStats = {
            total: likeCount || 0,
            points: (likeCount || 0) * LIKE_POINTS,
          };
        } else {
          data.likesStats = { total: 0, points: 0 };
        }
      }
    }

    // 4. 获取技能学习状态
    const { data: skillLearnings } = await client
      .from('team_skill_learnings')
      .select(`
        id,
        status,
        points_earned,
        started_at,
        completed_at,
        skill_id,
        task_id,
        skills (
          id,
          name,
          description,
          icon,
          category
        )
      `)
      .eq('team_id', teamId);
    data.skillLearnings = skillLearnings || [];

    // 5. 获取爱心宝石统计（从 teams 表读取权威值）
    const { data: teamForGems } = await client
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', teamId)
      .maybeSingle();
    // total_sent_likes 从 heart_gems 表读取（仅 like 路由写入此字段）
    const { data: heartGemsExtra } = await client
      .from('heart_gems')
      .select('total_sent_likes')
      .eq('team_id', teamId)
      .maybeSingle();
    data.heartGems = {
      fragments: teamForGems?.heart_shards || 0,
      gems: teamForGems?.heart_gems || 0,
      total_sent_likes: heartGemsExtra?.total_sent_likes || 0,
    };

    // 6. 获取未读消息数量
    const { count: unreadCount } = await client
      .from('team_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_read', false);
    data.unreadCount = unreadCount || 0;

  } catch (error) {
    console.error('获取小队数据失败:', error);
  }

  return data;
}

/**
 * 获取同志愿者指导的其他小队进度信息
 */
export async function getSiblingTeamsProgress(client: any, teamId: string, volunteerId: string) {
  try {
    // 获取当前小队信息
    const { data: currentTeam } = await client
      .from('teams')
      .select('current_theme_id, cycle')
      .eq('id', teamId)
      .single();
    const currentCycle = currentTeam?.cycle || 1;

    // 获取当前小队的已完成主题数（通过 team_theme_selections）
    const { data: currentTeamSelections } = await client
      .from('team_theme_selections')
      .select('theme_id, status, cycle')
      .eq('team_id', teamId);
    const currentTeamCompletedCount = (currentTeamSelections || [])
      .filter((s: any) => s.status === 'completed').length;
    const currentTeamCurrentSelection = (currentTeamSelections || [])
      .find((s: any) => s.cycle === currentCycle);
    const isCurrentTeamCompletedCurrentTheme = currentTeamCurrentSelection?.status === 'completed' || false;

    // 获取同志愿者指导的其他小队
    const { data: siblingTeams } = await client
      .from('teams')
      .select('id, name, points, current_theme_id, current_task_id, cycle')
      .eq('assigned_volunteer_id', volunteerId)
      .eq('status', 'active')
      .neq('id', teamId)
      .eq('cycle', currentCycle || 1);

    if (!siblingTeams || siblingTeams.length === 0) {
      return { teams: [] };
    }

    // 收集主题ID和任务ID
    const themeIds = siblingTeams.filter((t: any) => t.current_theme_id).map((t: any) => t.current_theme_id);
    const taskIds = siblingTeams.filter((t: any) => t.current_task_id).map((t: any) => t.current_task_id);

    // 获取主题信息
    const themesMap = new Map();
    if (themeIds.length > 0) {
      const { data: themes } = await client
        .from('task_themes')
        .select('id, name, icon')
        .in('id', themeIds);
      (themes || []).forEach((t: any) => themesMap.set(t.id, t));
    }

    // 获取任务信息
    const tasksMap = new Map();
    if (taskIds.length > 0) {
      const { data: tasks } = await client
        .from('tasks')
        .select('id, stage, theme_id, title')
        .in('id', taskIds);
      (tasks || []).forEach((t: any) => tasksMap.set(t.id, t));
    }

    // 获取每个主题的总任务数
    const themeTaskCountMap = new Map<string, number>();
    if (themeIds.length > 0) {
      const { data: taskCounts } = await client
        .from('tasks')
        .select('theme_id')
        .in('theme_id', themeIds)
        .eq('is_active', true)
        .eq('task_type', 'main');
      (taskCounts || []).forEach((t: any) => {
        const count = themeTaskCountMap.get(t.theme_id) || 0;
        themeTaskCountMap.set(t.theme_id, count + 1);
      });
    }

    // 获取其他小队的完成记录
    const siblingTeamIds = siblingTeams.map((t: any) => t.id);
    const { data: completions } = await client
      .from('theme_completions')
      .select('team_id, theme_id, completed_at, total_points, total_tasks')
      .in('team_id', siblingTeamIds);

    // 构建完成记录映射
    const completionsMap = new Map<string, typeof completions>();
    (completions || []).forEach((c: any) => {
      const existing = completionsMap.get(c.team_id) || [];
      existing.push(c);
      completionsMap.set(c.team_id, existing);
    });

    // 获取其他小队的任务提交记录（用于统计完成进度）
    const siblingTaskIds = taskIds.length > 0 ? taskIds : [];
    const submissionsMap = new Map<string, Set<string>>();

    if (siblingTaskIds.length > 0) {
      const { data: siblingSubmissions } = await client
        .from('task_submissions')
        .select('team_id, task_id, status')
        .in('team_id', siblingTeamIds)
        .in('task_id', siblingTaskIds)
        .eq('status', 'approved');

      (siblingSubmissions || []).forEach((s: any) => {
        if (!submissionsMap.has(s.team_id)) {
          submissionsMap.set(s.team_id, new Set());
        }
        submissionsMap.get(s.team_id)!.add(s.task_id);
      });
    }

    // 组装数据
    const teamsWithProgress = siblingTeams.map((team: any) => {
      const currentTheme = team.current_theme_id ? themesMap.get(team.current_theme_id) : null;
      const currentTask = team.current_task_id ? tasksMap.get(team.current_task_id) : null;
      const totalStages = team.current_theme_id ? (themeTaskCountMap.get(team.current_theme_id) || 1) : 0;
      const currentStage = currentTask?.stage || 0;
      const completedTasks = submissionsMap.get(team.id)?.size || 0;

      // 获取该小队的完成记录
      const teamCompletions = completionsMap.get(team.id) || [];
      const completedCurrentTheme = team.current_theme_id
        ? teamCompletions.some((c: any) => c.theme_id === team.current_theme_id)
        : false;

      // 是否在同一周期
      const isInSameCycle = (
        (!isCurrentTeamCompletedCurrentTheme && !completedCurrentTheme) ||
        (isCurrentTeamCompletedCurrentTheme && completedCurrentTheme)
      );

      return {
        id: team.id,
        name: team.name,
        points: team.points || 0,
        currentTheme: currentTheme ? {
          id: currentTheme.id,
          name: currentTheme.name,
          icon: currentTheme.icon,
        } : null,
        currentTask: currentTask ? {
          id: currentTask.id,
          title: currentTask.title,
          stage: currentTask.stage,
        } : null,
        currentStage,
        totalStages,
        completedTasks,
        progress: totalStages > 0 ? `${currentStage}/${totalStages}` : null,
        isCompleted: completedCurrentTheme,
        completedThemesCount: teamCompletions.length,
        isInSameCycle,
        cycleGap: teamCompletions.length - currentTeamCompletedCount,
      };
    });

    return {
      teams: teamsWithProgress,
      currentTeamCompletedCount,
      isCurrentTeamCompletedCurrentTheme,
    };
  } catch (error) {
    console.error('获取其他小队进度失败:', error);
    return { teams: [] };
  }
}

/**
 * 获取指定小队的任务详情（用于比较）
 */
export async function getSiblingTeamTaskDetails(client: any, teamId: string, themeId: string) {
  try {
    // 获取主题下的所有任务
    const { data: tasks } = await client
      .from('tasks')
      .select('id, title, stage, points, task_type')
      .eq('theme_id', themeId)
      .eq('is_active', true)
      .eq('task_type', 'main')
      .order('stage', { ascending: true });

    if (!tasks || tasks.length === 0) {
      return { tasks: [] };
    }

    const taskIds = tasks.map((t: any) => t.id);

    // 获取该小队在这些任务上的提交记录
    const { data: submissions } = await client
      .from('task_submissions')
      .select('task_id, status, rating, review_comment, created_at, reviewed_at')
      .eq('team_id', teamId)
      .in('task_id', taskIds);

    // 获取每个提交的点赞数
    const submissionIds = (submissions || []).map((s: any) => s.id);
    let likeCounts = new Map<string, number>();

    if (submissionIds.length > 0) {
      const { data: likes } = await client
        .from('likes')
        .select('submission_id')
        .in('submission_id', submissionIds);

      (likes || []).forEach((like: any) => {
        const count = likeCounts.get(like.submission_id) || 0;
        likeCounts.set(like.submission_id, count + 1);
      });
    }

    // 组装任务进度
    const tasksWithProgress = tasks.map((task: any) => {
      const submission = (submissions || []).find((s: any) => s.task_id === task.id);
      return {
        id: task.id,
        title: task.title,
        stage: task.stage,
        points: task.points,
        status: submission?.status || 'pending',
        rating: submission?.rating || null,
        hasReview: !!submission?.review_comment,
        likeCount: submission ? (likeCounts.get(submission.id) || 0) : 0,
        submittedAt: submission?.created_at || null,
        reviewedAt: submission?.reviewed_at || null,
      };
    });

    return { tasks: tasksWithProgress };
  } catch (error) {
    console.error('获取小队任务详情失败:', error);
    return { tasks: [] };
  }
}
