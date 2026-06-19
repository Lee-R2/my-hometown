/**
 * 数据上下文构建模块
 *
 * 从 ai/assistant/route.ts 提取的 buildDataContext 函数
 * 将小队数据转换为 AI 可读的文本上下文
 */

// 角色名称映射
const ROLE_NAMES: Record<string, string> = {
  guider: '指引者',
  light_mage: '光影法师',
  secret_scholar: '秘语学者',
};

/**
 * 构建数据上下文
 * 将小队数据转换为 AI 可读的文本上下文
 */
export function buildDataContext(teamData: Record<string, any>, siblingData?: any): string {
  const context: string[] = [];

  // 0. 检查小队信息完整性（选择主题的前置条件）
  const teamName = teamData.team?.name?.trim();
  const hasValidName = teamName && teamName !== '我的小队' && teamName !== '未命名小队';
  const hasSlogan = teamData.team?.slogan && teamData.team.slogan.trim().length > 0;
  const hasMembers = teamData.members && teamData.members.length > 0;
  const canSelectTheme = hasValidName && hasSlogan && hasMembers;

  if (!teamData.team?.current_theme_id) {
    context.push(`【选择主题状态】`);
    if (canSelectTheme) {
      context.push(`✅ 小队信息已完善，可以选择主题开始探索！`);
    } else {
      context.push(`⚠️ 还不能选择主题，需要先完善以下信息：`);
      if (!hasValidName) {
        context.push(`  ❌ 队名还是默认的"${teamData.team?.name || '我的小队'}"，需要改成有意义的名字`);
      } else {
        context.push(`  ✅ 队名已设置：${teamName}`);
      }
      if (!hasSlogan) {
        context.push(`  ❌ 还没有小队口号，需要添加一句响亮的口号`);
      } else {
        context.push(`  ✅ 口号已设置："${teamData.team.slogan}"`);
      }
      if (!hasMembers) {
        context.push(`  ❌ 还没有添加队员，需要至少添加一名成员`);
      } else {
        context.push(`  ✅ 已有${teamData.members.length}名成员`);
      }
    }
    context.push('');
  }

  // 1. 小队基本信息
  if (teamData.team) {
    context.push(`【小队基本信息】`);
    context.push(`小队名称：${teamData.team.name || '未命名小队'}`);
    context.push(`小队编码：${teamData.team.code}`);
    if (teamData.team.slogan) {
      context.push(`小队口号："${teamData.team.slogan}"`);
    }
    context.push(`当前积分：${teamData.team.points || 0}分`);
    if (teamData.team.next_task_deadline) {
      const deadline = new Date(teamData.team.next_task_deadline);
      const now = new Date();
      const isExpired = deadline < now;
      context.push(`任务截止时间：${deadline.toLocaleString('zh-CN')}${isExpired ? '（已超时）' : ''}`);
    }
    context.push('');
  }

  // 2. 小队成员
  if (teamData.members?.length > 0) {
    context.push(`【小队成员】（共${teamData.members.length}人）`);
    teamData.members.forEach((m: any) => {
      const roleName = ROLE_NAMES[m.role] || m.role;
      const intro = m.intro ? ` - ${m.intro}` : '';
      context.push(`• ${m.name}（${roleName}）${intro}`);
    });
    context.push('');
  }

  // 3. 当前探索主题
  if (teamData.theme) {
    context.push(`【当前探索主题】`);
    context.push(`${teamData.theme.icon || '🎯'} ${teamData.theme.name}`);
    if (teamData.theme.description) {
      context.push(`主题描述：${teamData.theme.description}`);
    }
    context.push('');
  }

  // 4. 任务进度总览
  if (teamData.allTasks?.length > 0) {
    context.push(`【任务进度总览】`);
    const completedIds = teamData.completedTaskIds || [];
    const currentTaskId = teamData.team?.current_task_id;

    teamData.allTasks.forEach((t: any) => {
      let status = '⏳待完成';
      if (completedIds.includes(t.id)) {
        status = '✅已完成';
      } else if (t.id === currentTaskId) {
        status = '🔄进行中';
      }
      context.push(`第${t.stage}阶段：${t.title}（${t.points}分）${status}`);
    });

    const completedCount = completedIds.length;
    const totalCount = teamData.allTasks.length;
    context.push(`进度：${completedCount}/${totalCount}（${Math.round(completedCount / totalCount * 100)}%）`);
    context.push('');
  }

  // 5. 当前任务详情
  if (teamData.currentTask) {
    context.push(`【正在执行的任务】`);
    const task = teamData.currentTask;
    context.push(`任务名称：${task.title}`);
    context.push(`任务阶段：第${task.stage}阶段`);
    context.push(`可获得积分：${task.points}分`);

    if (task.description) {
      context.push(`任务描述：${task.description}`);
    }

    if (task.requirements?.length > 0) {
      context.push(`任务要求：`);
      task.requirements.forEach((r: string, i: number) => {
        context.push(`  ${i + 1}. ${r}`);
      });
    }

    if (task.learning_goals?.length > 0) {
      context.push(`学习目标：`);
      task.learning_goals.forEach((g: string, i: number) => {
        context.push(`  ${i + 1}. ${g}`);
      });
    }
    context.push('');
  }

  // 6. 任务可用工具
  if (teamData.currentTaskTools?.length > 0) {
    context.push(`【任务可用工具】`);
    teamData.currentTaskTools.forEach((tt: any) => {
      const tool = tt.tools;
      const required = tt.is_required ? '（必选）' : '（可选）';
      context.push(`🔧 ${tool.name}${required}`);
      if (tool.description) {
        context.push(`   用途：${tool.description}`);
      }
    });
    context.push('');
  }

  // 7. 任务相关技能
  if (teamData.currentTaskSkills?.length > 0) {
    context.push(`【任务相关技能】`);
    teamData.currentTaskSkills.forEach((ts: any) => {
      const skill = ts.skills;
      const required = ts.is_required ? '（必学）' : '（选学）';

      // 查找学习状态
      const learning = teamData.skillLearnings?.find((l: any) => l.skill_id === skill.id);
      let status = '📚未学习';
      if (learning?.status === 'completed') {
        status = '✅已学会';
      } else if (learning?.status === 'in_progress') {
        status = '📖学习中';
      }

      context.push(`📖 ${skill.name}（${ts.points}分）${required} ${status}`);
    });
    context.push('');
  }

  // 8. 任务完成激励
  if (teamData.currentTaskRewards?.length > 0) {
    context.push(`【完成任务可获得激励】`);
    teamData.currentTaskRewards.forEach((tr: any) => {
      const reward = tr.rewards;
      context.push(`🎁 ${reward.icon || '🎁'} ${reward.name}`);
      if (reward.description) {
        context.push(`   ${reward.description}`);
      }
    });
    context.push('');
  }

  // 9. 已获得的激励
  if (teamData.userRewards?.length > 0) {
    context.push(`【已获得的激励】（共${teamData.rewardsStats?.total || 0}个）`);
    // 按类型分组显示
    const byType: Record<string, any[]> = {};
    teamData.userRewards.forEach((ur: any) => {
      const type = ur.rewards?.type || 'other';
      if (!byType[type]) byType[type] = [];
      byType[type].push(ur);
    });

    Object.entries(byType).forEach(([type, rewards]) => {
      const typeNames: Record<string, string> = {
        badge: '徽章',
        gem: '宝石',
        skill_card: '技能卡',
        tool_card: '工具卡',
        achievement: '成就',
        certificate: '证书',
        heart_fragment: '爱心碎片',
        heart_gem: '爱心宝石',
      };
      context.push(`${typeNames[type] || type}：${rewards.map((r: any) => r.rewards?.icon + r.rewards?.name).join('、')}`);
    });
    context.push('');
  }

  // 10. 点赞和爱心宝石
  if (teamData.likesStats?.total > 0 || teamData.heartGems?.gems > 0 || teamData.heartGems?.fragments > 0) {
    context.push(`【互动奖励】`);
    if (teamData.likesStats?.total > 0) {
      context.push(`获得点赞：${teamData.likesStats.total}次（+${teamData.likesStats.points}积分）`);
    }
    if (teamData.heartGems) {
      context.push(`送出爱心：${teamData.heartGems.total_sent_likes || 0}次`);
      context.push(`爱心宝石碎片：${teamData.heartGems.fragments || 0}/10`);
      context.push(`爱心宝石：${teamData.heartGems.gems || 0}颗`);
    }
    context.push('');
  }

  // 11. 未读消息
  if (teamData.unreadCount > 0) {
    context.push(`【消息提醒】`);
    context.push(`有${teamData.unreadCount}条未读消息`);
    context.push('');
  }

  // 12. 其他小队进度比较
  if (siblingData?.teams?.length > 0) {
    context.push(`【同志愿者指导的其他小队进度】`);
    context.push(`（注：这些小队和你们一样，都是由同一位志愿者老师指导的哦～）`);
    context.push('');

    // 按是否同周期分组
    const sameCycleTeams = siblingData.teams.filter((t: any) => t.isInSameCycle);
    const otherCycleTeams = siblingData.teams.filter((t: any) => !t.isInSameCycle);

    if (sameCycleTeams.length > 0) {
      context.push(`同周期小队：`);
      sameCycleTeams.forEach((t: any) => {
        let progressText = '';
        if (t.isCompleted) {
          progressText = `✅已完成主题`;
        } else if (t.currentTheme) {
          progressText = `第${t.currentStage}/${t.totalStages}阶段`;
        } else {
          progressText = `⏳未选择主题`;
        }
        const themeInfo = t.currentTheme ? `${t.currentTheme.icon}${t.currentTheme.name}` : '未选择主题';
        context.push(`• ${t.name}：${themeInfo}，${progressText}，${t.points}积分`);
      });
      context.push('');
    }

    if (otherCycleTeams.length > 0) {
      context.push(`其他周期小队：`);
      otherCycleTeams.forEach((t: any) => {
        const cycleInfo = t.cycleGap > 0 ? `领先${t.cycleGap}轮` : t.cycleGap < 0 ? `落后${Math.abs(t.cycleGap)}轮` : '同轮次';
        context.push(`• ${t.name}：已完成${t.completedThemesCount}个主题（${cycleInfo}）`);
      });
      context.push('');
    }

    // 比较分析
    const currentTeamPoints = teamData.team?.points || 0;
    const currentTeamProgress = teamData.completedTaskIds?.length || 0;

    context.push(`【小队比较分析】`);

    // 找出积分最高的小队
    const highestPointsTeam = siblingData.teams.reduce((max: any, t: any) =>
      t.points > max.points ? t : max, { points: 0, name: '' });
    if (highestPointsTeam.name && highestPointsTeam.points > currentTeamPoints) {
      context.push(`积分最高：${highestPointsTeam.name}（${highestPointsTeam.points}积分）`);
      context.push(`你们的积分：${currentTeamPoints}分，相差${highestPointsTeam.points - currentTeamPoints}分`);
    } else if (highestPointsTeam.name === '') {
      context.push(`你们目前的积分在所有小队中是最高的！继续保持！🎉`);
    }

    // 找出进度最快的小队
    const fastestTeam = sameCycleTeams.reduce((max: any, t: any) =>
      (t.currentStage || 0) > (max.currentStage || 0) ? t : max, { currentStage: 0, name: '' });
    if (fastestTeam.name && (fastestTeam.currentStage || 0) > currentTeamProgress) {
      context.push(`进度最快：${fastestTeam.name}（第${fastestTeam.currentStage}阶段）`);
      context.push(`你们的进度：第${teamData.currentTask?.stage || 0}阶段`);
    }

    context.push('');
  }

  return context.join('\n');
}
