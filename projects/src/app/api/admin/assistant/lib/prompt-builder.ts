/**
 * 提示词构建模块
 * 根据意图类型配置LLM参数，构建数据上下文文本
 */

import { IntentType } from './intent-engine';

export function getLLMParams(intent: { type: IntentType; confidence: number; subType?: string }): {
  temperature: number;
  topP: number;
  systemPromptSuffix: string;
} {
  switch (intent.type) {
    case 'execution':
      return {
        temperature: 0.15,
        topP: 0.85,
        systemPromptSuffix: `\n\n【当前模式：执行模式】用户正在执行具体操作，你必须严格按照对话焦点和系统数据生成命令，不要猜测或创造不存在的实体。如果焦点中有明确的主题/阶段/任务组，直接使用，不要反问。生成命令前先确认引用的实体在数据中存在。`,
      };
    case 'query':
      return {
        temperature: 0.3,
        topP: 0.9,
        systemPromptSuffix: `\n\n【当前模式：查询模式】用户正在查询数据，请基于当前系统数据准确回答，引用具体数字和名称。如果数据不全，指出缺少什么而不是猜测。`,
      };
    case 'creative':
      return {
        temperature: 0.5,
        topP: 0.95,
        systemPromptSuffix: `\n\n【当前模式：创意模式】用户正在寻求建议或创意方案，你可以更灵活地组合知识和数据来提供建议。但所有数据引用仍需基于真实数据，创意部分明确标注为建议。`,
      };
    case 'confirmation':
      return {
        temperature: 0.1,
        topP: 0.8,
        systemPromptSuffix: `\n\n【当前模式：确认模式】用户正在确认之前的操作意图，请直接合并确认值并执行，不要反问或重新解释。`,
      };
    case 'navigation':
      return {
        temperature: 0.3,
        topP: 0.8,
        systemPromptSuffix: '\n【模式：导航引导】用户想要跳转到某个页面或功能。请提供清晰的导航指引，包括页面路径和操作步骤。如果无法直接导航，告诉用户如何找到对应功能。',
      };
    case 'multi_step':
      return {
        temperature: 0.4,
        topP: 0.85,
        systemPromptSuffix: '\n【模式：多步执行】用户的消息包含多个操作步骤。请按顺序逐步执行，每完成一步报告进度，然后继续下一步。如果某一步失败，说明原因并询问是否继续后续步骤。',
      };
  }
}

// 构建数据上下文文本
export function buildContextText(data: Record<string, any>, userRole: string): string {
  const context: string[] = [];

  context.push('【当前系统数据】');

  if (userRole === 'parent') {
    // 家长数据上下文
    context.push(`用户角色：家长`);

    if (data.parent) {
      context.push(`家长姓名：${data.parent.name || '未知'}`);
      context.push(`关联学校：${data.parent.school_name || '未知'}`);
    }

    if (data.follows && data.follows.length > 0) {
      context.push('');
      context.push(`【关注的小队信息】`);

      data.follows.forEach((follow: any, index: number) => {
        context.push('');
        context.push(`【小队 ${index + 1}】`);
        context.push(`• 小队名称：${follow.teamName}`);
        if (follow.teamSlogan) {
          context.push(`• 小队口号：${follow.teamSlogan}`);
        }
        context.push(`• 当前积分：${follow.teamPoints} 分`);
        context.push(`• 当前周期：第 ${follow.teamCycle} 周期`);
        context.push(`• 探索主题：${follow.currentTheme}`);
        context.push(`• 当前任务：${follow.currentTask}（第${follow.currentStage}阶段）`);

        // 小队成员
        if (follow.members && follow.members.length > 0) {
          context.push(`• 小队成员（${follow.members.length}人）：`);
          follow.members.forEach((m: any) => {
            const isYourChild = m.name === data.parent?.child_name;
            const childMarker = isYourChild ? ' [您的孩子]' : '';
            context.push(`  - ${m.name}（${m.role || '成员'}${childMarker}）`);
          });
        }

        // 提交统计
        if (follow.submissions) {
          context.push(`• 任务提交：共${follow.submissions.total}次（待审核${follow.submissions.pending}次、已通过${follow.submissions.approved}次）`);
          if (follow.submissions.totalPoints > 0) {
            context.push(`• 已获积分：${follow.submissions.totalPoints}分`);
          }
        }

        // 孩子信息
        context.push(`• 您的孩子：${follow.childName}（${follow.childGrade}）`);
        context.push(`• 与孩子关系：${follow.relation}`);
      });
    } else {
      context.push('');
      context.push(`【关注的小队】`);
      context.push(`您还没有关注任何小队`);
    }

  } else {
    // 管理员/志愿者/助学老师数据上下文
    context.push(`用户角色：${userRole === 'admin' || userRole === 'super_admin' ? '超级管理员' : userRole === 'volunteer' ? '志愿者' : '助学老师'}`);
  context.push(`数据更新时间：${new Date().toLocaleString('zh-CN')}`);
  context.push('');

  if (userRole === 'admin' || userRole === 'super_admin') {
    // 超级管理员数据 - 更详细
    context.push(`【平台总体统计】`);
    context.push(`- 学校总数：${data.schoolCount || 0} 所`);
    context.push(`- 志愿者总数：${data.volunteerCount || 0} 人`);
    context.push(`- 助学老师总数：${data.teacherCount || 0} 人`);
    context.push(`- 活跃小队总数：${data.teamCount || 0} 个`);
    context.push(`- 学生总数：${data.memberCount || 0} 人`);
    context.push('');

    // 学校列表
    if (data.schools?.length > 0) {
      context.push(`【学校列表】`);
      data.schools.slice(0, 10).forEach((s: any) => {
        context.push(`• ${s.name}（${s.city || ''}）`);
      });
      if (data.schools.length > 10) {
        context.push(`  ... 还有 ${data.schools.length - 10} 所学校`);
      }
      context.push('');
    }

    // 探索主题列表
    if (data.themes?.length > 0) {
      context.push(`【探索主题列表】`);
      data.themes.forEach((t: any) => {
        const isExclusive = t.is_exclusive ? '[专属]' : '[全局]';
        context.push(`• ${t.icon || '📍'} ${t.name} ${isExclusive}`);
      });
      context.push('');
    }

    // 任务列表（按主题+阶段+任务组分组，方便上下文意图理解）
    if (data.tasks?.length > 0) {
      // 按主题分组
      const tasksByTheme: Record<string, any[]> = {};
      data.tasks.forEach((t: any) => {
        const theme = data.themes?.find((th: any) => th.id === t.theme_id);
        const themeName = theme?.name || '未关联主题';
        if (!tasksByTheme[themeName]) tasksByTheme[themeName] = [];
        tasksByTheme[themeName].push(t);
      });

      context.push(`【任务列表（按主题-阶段-任务组层级组织）】`);
      let displayedTasks = 0;
      const stageNames: Record<number, string> = { 1: '走进与发现', 2: '动手与实验', 3: '深入与创新', 4: '展示与分享' };

      for (const [themeName, themeTasks] of Object.entries(tasksByTheme)) {
        if (displayedTasks >= 30) break;
        context.push(`\n📌 主题「${themeName}」：`);

        // 按阶段分组
        const tasksByStage: Record<number, any[]> = {};
        themeTasks.forEach((t: any) => {
          if (!tasksByStage[t.stage]) tasksByStage[t.stage] = [];
          tasksByStage[t.stage].push(t);
        });

        for (const [stageNum, stageTasks] of Object.entries(tasksByStage).sort(([a], [b]) => Number(a) - Number(b))) {
          const stageLabel = stageNames[Number(stageNum)] || `阶段${stageNum}`;
          context.push(`  📂 第${stageNum}阶段 - ${stageLabel}：`);

          // 按任务组分组
          const tasksByGroup: Record<string, any[]> = {};
          stageTasks.forEach((t: any) => {
            const groupKey = t.group_name || t.task_group_id || '未分组';
            if (!tasksByGroup[groupKey]) tasksByGroup[groupKey] = [];
            tasksByGroup[groupKey].push(t);
          });

          for (const [groupName, groupTasks] of Object.entries(tasksByGroup)) {
            const difficulties = groupTasks.map((t: any) => {
              const diffLabel: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' };
              return `${diffLabel[t.difficulty] || t.difficulty}(${t.title}, ${t.points}分)`;
            }).join(' / ');
            context.push(`    📋 任务组「${groupName}」：${difficulties}`);
            displayedTasks += groupTasks.length;
          }
        }
      }
      if (data.tasks.length > 30) {
        context.push(`  ... 还有 ${data.tasks.length - 30} 个任务`);
      }
      context.push('');
    }

    // 小队列表（带详情）
    if (data.teams?.length > 0) {
      context.push(`【小队列表】`);
      data.teams.slice(0, 15).forEach((t: any) => {
        const theme = data.themesMap?.[t.current_theme_id];
        const task = data.tasksMap?.[t.current_task_id];
        const submissions = data.teamSubmissions?.[t.id];
        let status = '';
        if (theme) status += `主题:${theme.name} `;
        if (task) status += `任务:${task.title} `;
        if (submissions) status += `提交:${submissions.total}(待:${submissions.pending} 通:${submissions.approved})`;
        context.push(`• ${t.name} - ${t.points || 0}积分 - ${status || '暂无进行中任务'}`);
      });
      if (data.teams.length > 15) {
        context.push(`  ... 还有 ${data.teams.length - 15} 个小队`);
      }
      context.push('');
    }

    context.push(`【产出审核统计】`);
    context.push(`- 待审核：${data.submissionStats?.pending || 0} 条`);
    context.push(`- 已通过：${data.submissionStats?.approved || 0} 条`);
    context.push(`- 需修改：${data.submissionStats?.rejected || 0} 条`);
    if (data.submissionStats?.approved > 0) {
      const excellentRate = Math.round((data.submissionStats.excellent / data.submissionStats.approved) * 100);
      context.push(`- 优秀率：${excellentRate}%`);
    }
    context.push('');

    // 工具列表
    if (data.tools?.length > 0) {
      context.push(`【工具列表】`);
      context.push(data.tools.map((t: any) => `• [${t.id}] ${t.name}（${t.category || '未分类'}）${t.description ? ' - ' + t.description : ''}`).join('\n'));
      context.push('');
    }

    // 技能列表
    if (data.skills?.length > 0) {
      context.push(`【技能列表】`);
      context.push(data.skills.map((s: any) => `• [${s.id}] ${s.name}（${s.category || '未分类'}）${s.description ? ' - ' + s.description : ''}`).join('\n'));
      context.push('');
    }

    // 激励列表
    if (data.rewards?.length > 0) {
      context.push(`【激励列表】`);
      const typeNames: Record<string, string> = {
        badge: '徽章', gem: '宝石', skill_card: '技能卡', tool_card: '工具卡',
        achievement: '成就', certificate: '证书', heart_fragment: '爱心碎片', heart_gem: '爱心宝石'
      };
      context.push(data.rewards.map((r: any) =>
        `• [${r.id}] ${r.icon || '🎁'} ${r.name} - ${r.points || 0}积分（${typeNames[r.type] || r.type}）`
      ).join('\n'));
      context.push('');
    }

    context.push(`【学习与激励统计】`);
    context.push(`- 技能学习完成：${data.skillLearningStats?.completed || 0} 次`);
    context.push(`- 技能学习中：${data.skillLearningStats?.inProgress || 0} 次`);
    context.push(`- 已发放激励：${data.rewardCount || 0} 个`);
    context.push(`- 消息通知：${data.messageCount || 0} 条`);
    context.push('');

    // 数据关系说明
    context.push(`【数据关系】`);
    context.push(`- 归属链：学校 → 志愿者 → 小队 → 学生`);
    context.push(`- 内容链：主题 → 任务 → 技能/工具/激励`);
    context.push(`- 流程链：任务 → 提交 → 审核 → 反馈`);

  } else if (userRole === 'volunteer') {
    // 志愿者数据
    if (data.volunteer) {
      context.push(`【志愿者信息】`);
      context.push(`姓名：${data.volunteer.name || data.volunteer.username}`);
      context.push('');
    }

    context.push(`【指导小队统计】`);
    context.push(`- 小队总数：${data.teamCount || 0} 个`);
    context.push(`- 学生总数：${data.memberCount || 0} 人`);
    context.push('');

    if (data.teams?.length > 0) {
      context.push(`【小队详情】`);
      data.teams.slice(0, 10).forEach((team: any) => {
        const theme = data.themesMap?.[team.current_theme_id];
        const task = data.tasksMap?.[team.current_task_id];
        const submissions = data.teamSubmissions?.[team.id];
        let info = `${team.points || 0}积分`;
        if (theme) info += ` - 主题:${theme.name}`;
        if (task) info += ` - 任务:${task.title}`;
        if (submissions) info += ` - 提交:${submissions.total}(待:${submissions.pending} 通:${submissions.approved})`;
        context.push(`• ${team.name}：${info}`);
      });
      if (data.teams.length > 10) {
        context.push(`  ... 还有 ${data.teams.length - 10} 个小队`);
      }
      context.push('');
    }

    // 工具、技能、激励列表（志愿者可用的）
    if (data.tools?.length > 0) {
      context.push(`【可用工具】`);
      context.push(data.tools.map((t: any) => `• [${t.id}] ${t.name}（${t.category || '未分类'}）${t.description ? ' - ' + t.description : ''}`).join('\n'));
      context.push('');
    }

    if (data.skills?.length > 0) {
      context.push(`【可用技能】`);
      context.push(data.skills.map((s: any) => `• [${s.id}] ${s.name}（${s.category || '未分类'}）${s.description ? ' - ' + s.description : ''}`).join('\n'));
      context.push('');
    }

    if (data.rewards?.length > 0) {
      context.push(`【可用激励】`);
      const typeNames: Record<string, string> = {
        badge: '徽章', gem: '宝石', skill_card: '技能卡', tool_card: '工具卡',
        achievement: '成就', certificate: '证书', heart_fragment: '爱心碎片', heart_gem: '爱心宝石'
      };
      context.push(data.rewards.map((r: any) =>
        `• [${r.id}] ${r.icon || '🎁'} ${r.name} - ${r.points || 0}积分（${typeNames[r.type] || r.type}）`
      ).join('\n'));
      context.push('');
    }

    context.push(`【产出统计】`);
    context.push(`- 待审核：${data.submissionStats?.pending || 0} 条`);
    context.push(`- 已通过：${data.submissionStats?.approved || 0} 条`);
    context.push(`- 已发放激励：${data.rewardCount || 0} 个`);

  } else if (userRole === 'teacher') {
    // 助学老师数据
    if (data.school) {
      context.push(`【所属学校】`);
      context.push(`${data.school.name}（${data.school.city || ''}）`);
      context.push('');
    }

    context.push(`【本校统计】`);
    context.push(`- 志愿者：${data.volunteerCount || 0} 人`);
    context.push(`- 活跃小队：${data.teamCount || 0} 个`);
    context.push(`- 学生总数：${data.memberCount || 0} 人`);
    context.push('');

    if (data.teams?.length > 0) {
      context.push(`【本校小队】`);
      data.teams.slice(0, 10).forEach((team: any) => {
        const submissions = data.teamSubmissions?.[team.id];
        let info = `${team.points || 0}积分`;
        if (submissions) info += ` - 提交:${submissions.total}(待:${submissions.pending})`;
        context.push(`• ${team.name}：${info}`);
      });
      if (data.teams.length > 10) {
        context.push(`  ... 还有 ${data.teams.length - 10} 个小队`);
      }
      context.push('');
    }

    context.push(`【产出统计】`);
    context.push(`- 待审核：${data.submissionStats?.pending || 0} 条`);
    context.push(`- 已通过：${data.submissionStats?.approved || 0} 条`);
  }
  }

  context.push('');
  context.push(`【当前时间】${new Date().toLocaleString('zh-CN')}`);

  return context.join('\n');
}
