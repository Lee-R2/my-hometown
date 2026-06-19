// 来源：src/app/api/ai/chat/route.ts
// - L2287-2399: formatTeamContext 函数
// - L2543-2816: formatAdminContext 函数

export function formatTeamContext(context: any): string {
  const lines: string[] = [];
  
  // 小队基本信息
  if (context.team) {
    lines.push(`═══════ 小队信息 ═══════`);
    lines.push(`小队名称: ${context.team.name}`);
    lines.push(`小队代码: ${context.team.code}`);
    lines.push(`当前积分: ${context.team.points}`);
    if (context.team.schoolName) lines.push(`所属学校: ${context.team.schoolName}`);
    if (context.team.volunteerName) lines.push(`对接志愿者: ${context.team.volunteerName}`);
    if (context.team.nextTaskDeadline) {
      lines.push(`任务截止时间: ${new Date(context.team.nextTaskDeadline).toLocaleString('zh-CN')}`);
    }
  }
  
  // 当前主题
  if (context.currentTheme) {
    lines.push(`\n═══════ 当前主题 ═══════`);
    lines.push(`主题名称: ${context.currentTheme.name}`);
    if (context.currentTheme.description) lines.push(`主题描述: ${context.currentTheme.description}`);
  }
  
  // 当前任务
  if (context.currentTask) {
    lines.push(`\n═══════ 当前任务 ═══════`);
    lines.push(`任务名称: ${context.currentTask.title}`);
    lines.push(`任务阶段: 第${context.currentTask.stage}阶段`);
    lines.push(`可获得积分: ${context.currentTask.points}分`);
    if (context.currentTask.description) lines.push(`任务描述: ${context.currentTask.description}`);
    if (context.currentTask.requirements?.length > 0) {
      lines.push(`任务要求:`);
      context.currentTask.requirements.forEach((r: string, i: number) => {
        lines.push(`  ${i + 1}. ${r}`);
      });
    }
  }
  
  // 任务工具
  if (context.currentTaskTools?.length > 0) {
    lines.push(`\n═══════ 任务工具 ═══════`);
    context.currentTaskTools.forEach((t: any) => {
      lines.push(`- ${t.name}${t.isRequired ? '(必选)' : '(可选)'}: ${t.description || '无描述'}`);
    });
  }
  
  // 任务技能
  if (context.currentTaskSkills?.length > 0) {
    lines.push(`\n═══════ 任务技能 ═══════`);
    context.currentTaskSkills.forEach((s: any) => {
      const statusText = s.status === 'completed' ? '✅已学习' : 
                         s.status === 'in_progress' ? '📖学习中' : '📚未学习';
      lines.push(`- ${s.name}(${s.points}分) ${statusText}`);
    });
  }
  
  // 小队成员
  if (context.members?.length > 0) {
    lines.push(`\n═══════ 小队成员 ═══════`);
    context.members.forEach((m: any) => {
      lines.push(`- ${m.name} (${m.roleLabel})`);
    });
  }
  
  // 统计数据
  if (context.stats) {
    lines.push(`\n═══════ 数据统计 ═══════`);
    lines.push(`成员总数: ${context.stats.totalMembers}`);
    lines.push(`待审核产出: ${context.stats.pendingSubmissions}`);
    lines.push(`已通过产出: ${context.stats.approvedSubmissions}`);
    lines.push(`已获奖励: ${context.stats.totalRewards}`);
    lines.push(`收到点赞: ${context.stats.likesReceived}`);
    lines.push(`送出点赞: ${context.stats.likesGiven}`);
    lines.push(`未读通知: ${context.stats.unreadNotifications}`);
  }
  
  // 最近提交
  if (context.submissions?.length > 0) {
    lines.push(`\n═══════ 最近提交记录 ═══════`);
    context.submissions.slice(0, 5).forEach((s: any) => {
      const statusText = s.status === 'pending' ? '⏳待审核' : 
                         s.status === 'approved' ? '✅已通过' : '❌已退回';
      lines.push(`- ${s.taskTitle}(阶段${s.stage}): ${statusText}`);
    });
  }
  
  // 已获奖励
  if (context.userRewards?.length > 0) {
    lines.push(`\n═══════ 已获奖励 ═══════`);
    context.userRewards.slice(0, 5).forEach((r: any) => {
      lines.push(`- ${r.icon || '🎁'} ${r.name} (${r.type})`);
    });
  }
  
  // 爱心宝石
  if (context.heartGems) {
    lines.push(`\n═══════ 爱心宝石 ═══════`);
    lines.push(`碎片数量: ${context.heartGems.fragments}/10`);
    lines.push(`宝石数量: ${context.heartGems.gems}`);
  }
  
  // 所有任务列表
  if (context.tasks?.length > 0) {
    lines.push(`\n═══════ 主题任务列表 ═══════`);
    context.tasks.forEach((t: any) => {
      const typeText = t.taskType === 'main' ? '主线' : 
                       t.taskType === 'side' ? '支线' : '最终';
      lines.push(`阶段${t.stage}: ${t.title} (${t.points}分) [${typeText}]`);
    });
  }
  
  return lines.join('\n');
}

export function formatAdminContext(context: any, userRole: string): string {
  const lines: string[] = [];
  
  lines.push(`【当前角色】${context.role || '管理员'}`);
  
  if (userRole === 'admin' || userRole === 'super_admin') {
    // ===== 超级管理员完整数据 =====
    
    // 任务管理
    if (context.tasksManagement) {
      lines.push(`\n═══════ 任务管理 ═══════`);
      lines.push(`主题总数: ${context.tasksManagement.themesCount}`);
      lines.push(`任务总数: ${context.tasksManagement.tasksStats?.total || 0}`);
      lines.push(`- 激活任务: ${context.tasksManagement.tasksStats?.active || 0}`);
      lines.push(`- 主线任务: ${context.tasksManagement.tasksStats?.mainTasks || 0}`);
      lines.push(`- 支线任务: ${context.tasksManagement.tasksStats?.sideTasks || 0}`);
      lines.push(`- 最终任务: ${context.tasksManagement.tasksStats?.finalTasks || 0}`);
      
      if (context.tasksManagement.themes?.length > 0) {
        lines.push(`\n最近主题:`);
        context.tasksManagement.themes.slice(0, 5).forEach((t: any) => {
          lines.push(`- ${t.icon || '🎯'} ${t.name}`);
        });
      }
    }
    
    // 最后任务
    if (context.finalTasks) {
      lines.push(`\n═══════ 最后任务表单 ═══════`);
      lines.push(`表单总数: ${context.finalTasks.stats?.total || 0}`);
      lines.push(`- 全局表单: ${context.finalTasks.stats?.global || 0}`);
      lines.push(`- 专属表单: ${context.finalTasks.stats?.school || 0}`);
    }
    
    // 小队管理
    if (context.teamsManagement) {
      lines.push(`\n═══════ 小队管理 ═══════`);
      lines.push(`小队总数: ${context.teamsManagement.teamsCount}`);
      lines.push(`学生总数: ${context.teamsManagement.totalStudents}`);
      
      if (context.teamsManagement.teams?.length > 0) {
        lines.push(`\n最近创建的小队:`);
        context.teamsManagement.teams.slice(0, 5).forEach((t: any) => {
          lines.push(`- ${t.name}(${t.code}) ${t.points}分 - ${t.schools?.name || '未知学校'}`);
        });
      }
    }
    
    // 产出审核
    if (context.submissionsManagement) {
      lines.push(`\n═══════ 产出审核 ═══════`);
      lines.push(`待审核: ${context.submissionsManagement.pending}`);
      lines.push(`已通过: ${context.submissionsManagement.approved}`);
      lines.push(`已拒绝: ${context.submissionsManagement.rejected}`);
      
      if (context.submissionsManagement.recentPending?.length > 0) {
        lines.push(`\n最近待审核产出:`);
        context.submissionsManagement.recentPending.slice(0, 5).forEach((s: any) => {
          lines.push(`- ${s.teamName}: ${s.taskTitle}(阶段${s.stage || '?'})`);
        });
      }
    }
    
    // 项目小学
    if (context.schoolsManagement) {
      lines.push(`\n═══════ 项目小学 ═══════`);
      lines.push(`学校总数: ${context.schoolsManagement.schoolsCount}`);
      if (context.schoolsManagement.schools?.length > 0) {
        lines.push(`\n学校列表:`);
        context.schoolsManagement.schools.slice(0, 5).forEach((s: any) => {
          lines.push(`- ${s.name} (${s.region || '未知地区'})`);
        });
      }
    }
    
    // 志愿者
    if (context.volunteersManagement) {
      lines.push(`\n═══════ 授课志愿者 ═══════`);
      lines.push(`志愿者总数: ${context.volunteersManagement.volunteersCount}`);
      if (context.volunteersManagement.volunteers?.length > 0) {
        lines.push(`\n最近注册的志愿者:`);
        context.volunteersManagement.volunteers.slice(0, 5).forEach((v: any) => {
          lines.push(`- ${v.name}(${v.username})`);
        });
      }
    }
    
    // 工具管理
    if (context.toolsManagement) {
      lines.push(`\n═══════ 工具管理 ═══════`);
      lines.push(`工具总数: ${context.toolsManagement.stats?.total || 0}`);
      lines.push(`激活工具: ${context.toolsManagement.stats?.active || 0}`);
    }
    
    // 技能学习
    if (context.skillsManagement) {
      lines.push(`\n═══════ 技能学习 ═══════`);
      lines.push(`技能总数: ${context.skillsManagement.stats?.total || 0}`);
      lines.push(`激活技能: ${context.skillsManagement.stats?.active || 0}`);
    }
    
    // 消息管理
    if (context.messagesManagement) {
      lines.push(`\n═══════ 消息管理 ═══════`);
      lines.push(`消息总数: ${context.messagesManagement.total}`);
      lines.push(`未读消息: ${context.messagesManagement.unread}`);
    }
    
    // 激励配置
    if (context.rewardsManagement) {
      lines.push(`\n═══════ 激励配置 ═══════`);
      lines.push(`激励卡片总数: ${context.rewardsManagement.stats?.total || 0}`);
      lines.push(`激活卡片: ${context.rewardsManagement.stats?.active || 0}`);
      const byType = context.rewardsManagement.stats?.byType || {};
      lines.push(`- 徽章: ${byType.badge || 0}`);
      lines.push(`- 宝石: ${byType.gem || 0}`);
      lines.push(`- 技能卡: ${byType.skill_card || 0}`);
      lines.push(`- 工具卡: ${byType.tool_card || 0}`);
      lines.push(`- 成就: ${byType.achievement || 0}`);
    }
    
    // 反馈查看
    if (context.feedbackManagement) {
      lines.push(`\n═══════ 反馈查看 ═══════`);
      lines.push(`反馈提交总数: ${context.feedbackManagement.total}`);
    }
    
  } else if (userRole === 'volunteer') {
    // ===== 志愿者数据 =====
    
    if (context.volunteerName) {
      lines.push(`\n【志愿者信息】`);
      lines.push(`姓名: ${context.volunteerName}`);
      if (context.schoolName) lines.push(`所属学校: ${context.schoolName}`);
    }
    
    // 小队管理
    if (context.teamsManagement) {
      lines.push(`\n═══════ 我的小队 ═══════`);
      lines.push(`小队总数: ${context.teamsManagement.teamsCount}`);
      lines.push(`学生总数: ${context.teamsManagement.totalStudents}`);
      
      // 统计正在执行任务的小队
      const teamsWithTask = (context.teamsManagement.teams || []).filter((t: any) => t.currentTaskId);
      lines.push(`正在执行任务的小队数: ${teamsWithTask.length}`);
      
      if (context.teamsManagement.teams?.length > 0) {
        lines.push(`\n小队列表:`);
        context.teamsManagement.teams.forEach((t: any) => {
          const taskStatus = t.currentTaskId ? '【执行中】' : '';
          lines.push(`- ${t.name || '未命名'}(${t.code}) ${t.points}分 ${taskStatus}`);
        });
      }
    }
    
    // 小队进度
    if (context.teamProgress?.length > 0) {
      lines.push(`\n═══════ 小队进度 ═══════`);
      context.teamProgress.forEach((p: any) => {
        lines.push(`- ${p.teamName || '未命名'}: ${p.currentTheme?.name || '未选主题'} ${p.points}分`);
      });
    }
    
    // 产出审核
    if (context.submissionsManagement) {
      lines.push(`\n═══════ 产出审核 ═══════`);
      lines.push(`待审核: ${context.submissionsManagement.pending}`);
      lines.push(`已通过: ${context.submissionsManagement.approved}`);
      lines.push(`已拒绝: ${context.submissionsManagement.rejected}`);
      
      if (context.submissionsManagement.recentPending?.length > 0) {
        lines.push(`\n最近待审核产出:`);
        context.submissionsManagement.recentPending.slice(0, 5).forEach((s: any) => {
          lines.push(`- ${s.teamName}: ${s.taskTitle}`);
        });
      }
    }
    
    // 任务主题
    if (context.tasksManagement) {
      lines.push(`\n═══════ 任务主题 ═══════`);
      lines.push(`可查看主题数: ${context.tasksManagement.themesCount}`);
    }
    
    // 工具和技能
    if (context.toolsManagement?.tools?.length) {
      lines.push(`\n═══════ 可用工具 ═══════`);
      lines.push(`工具总数: ${context.toolsManagement.tools.length}`);
    }
    
    if (context.skillsManagement?.skills?.length) {
      lines.push(`\n═══════ 可学技能 ═══════`);
      lines.push(`技能总数: ${context.skillsManagement.skills.length}`);
    }
    
    // 消息
    if (context.messagesManagement) {
      lines.push(`\n═══════ 消息 ═══════`);
      lines.push(`收到消息: ${context.messagesManagement.received}`);
      lines.push(`未读消息: ${context.messagesManagement.unread}`);
    }
    
    // 反馈
    if (context.feedbackManagement?.feedbacks?.length) {
      lines.push(`\n═══════ 小队反馈 ═══════`);
      lines.push(`反馈提交数: ${context.feedbackManagement.feedbacks.length}`);
    }
    
  } else if (userRole === 'teacher') {
    // ===== 助学老师数据 =====
    
    if (context.teacherName) {
      lines.push(`\n【助学老师信息】`);
      lines.push(`姓名: ${context.teacherName}`);
      if (context.schoolName) lines.push(`所属学校: ${context.schoolName}`);
    }
    
    // 学校信息
    if (context.schoolInfo) {
      lines.push(`\n═══════ 学校信息 ═══════`);
      lines.push(`学校名称: ${context.schoolInfo.name}`);
      if (context.schoolInfo.region) lines.push(`所在地区: ${context.schoolInfo.region}`);
    }
    
    // 小队管理
    if (context.teamsManagement) {
      lines.push(`\n═══════ 对接小队 ═══════`);
      lines.push(`小队总数: ${context.teamsManagement.teamsCount}`);
      lines.push(`学生总数: ${context.teamsManagement.totalStudents}`);
      
      // 统计正在执行任务的小队
      const teamsWithTask = (context.teamsManagement.teams || []).filter((t: any) => t.currentTaskId);
      lines.push(`正在执行任务的小队数: ${teamsWithTask.length}`);
      
      if (context.teamsManagement.teams?.length > 0) {
        lines.push(`\n小队列表:`);
        context.teamsManagement.teams.forEach((t: any) => {
          const taskStatus = t.currentTaskId ? '【执行中】' : '';
          lines.push(`- ${t.name || '未命名'}(${t.code}) ${t.points}分 - 志愿者:${t.volunteerName || '未知'} ${taskStatus}`);
        });
      }
    }
    
    // 小队进度
    if (context.teamProgress?.length > 0) {
      lines.push(`\n═══════ 小队进度 ═══════`);
      context.teamProgress.forEach((p: any) => {
        lines.push(`- ${p.teamName || '未命名'}: ${p.currentTheme?.name || '未选主题'} ${p.points}分`);
      });
    }
    
    // 产出统计
    if (context.submissionsManagement) {
      lines.push(`\n═══════ 产出统计 ═══════`);
      lines.push(`待审核: ${context.submissionsManagement.pending}`);
      lines.push(`已通过: ${context.submissionsManagement.approved}`);
      lines.push(`已拒绝: ${context.submissionsManagement.rejected}`);
    }
    
    // 志愿者
    if (context.volunteersManagement?.volunteers?.length) {
      lines.push(`\n═══════ 志愿者 ═══════`);
      lines.push(`志愿者数量: ${context.volunteersManagement.volunteers.length}`);
    }
    
    // 反馈
    if (context.feedbackManagement?.feedbacks?.length) {
      lines.push(`\n═══════ 反馈 ═══════`);
      lines.push(`反馈数量: ${context.feedbackManagement.feedbacks.length}`);
    }
  }
  
  return lines.join('\n');
}
