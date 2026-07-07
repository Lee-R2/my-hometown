import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 发送通知的辅助函数
async function sendNotification(client: any, params: {
  teamId: string;
  type: string;
  title: string;
  content: string;
  taskId?: string;
  submissionId?: string;
  senderId?: string;
  senderName?: string;
  extraData?: any;
}) {
  try {
    await client
      .from('team_notifications')
      .insert({
        team_id: params.teamId,
        type: params.type,
        title: params.title,
        content: params.content,
        task_id: params.taskId,
        submission_id: params.submissionId,
        sender_id: params.senderId,
        sender_name: params.senderName,
        extra_data: params.extraData,
      });
  } catch (error) {
    console.error('发送通知失败:', error);
  }
}

/**
 * 审核产出提交
 * 权限说明：
 * - 管理员：可以审核所有产出
 * - 志愿者：只能审核其指导的小队的产出
 * - 助学老师：只读权限，不能执行审核操作
 *
 * 支持评价：rejected（不合格-退回）、approved（合格）、excellent（优秀）
 * 优秀时可分配额外激励：隐藏工具、隐藏技能卡
 * 审核通过时可下发支线任务
 * 额外加分：优秀3-5分，合格1-2分，不合格0分
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const reviewerId = auth.payload!.userId;
    const reviewerRole = auth.payload!.role;

    const body = await request.json();
    const {
      status,
      rating,
      reviewComment,
      bonusPoints = 0,
      sideTaskId,
      nextTaskDeadline,
      rewards
    } = body;

    if (reviewerRole === 'teacher') {
      return ApiErrors.forbidden('助学老师没有审核权限，只能查看产出详情');
    }

    // 获取提交信息（手动查询，避免 PostgREST join 问题）
    const { data: submission, error: fetchError } = await client
      .from('task_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !submission) {
      return ApiErrors.notFound('提交记录不存在');
    }

    // 状态守卫：已审核的提交不可重复审核
    if (submission.status !== 'pending') {
      return ApiErrors.validation('该提交已审核，不可重复审核');
    }

    // 获取小队信息
    const { data: teamData } = await client
      .from('teams')
      .select('id, name, code, school_id, assigned_volunteer_id')
      .eq('id', submission.team_id)
      .single();

    // 权限验证：志愿者只能审核其指导的小队的产出
    if (reviewerRole === 'volunteer') {
      if (!teamData || teamData.assigned_volunteer_id !== reviewerId) {
        return ApiErrors.forbidden('您只能审核您指导的小队的产出');
      }
    }

    // 获取审核人名称（提前获取，用于后续通知）
    let reviewerName = '审核老师';
    if (reviewerId) {
      const { data: reviewer } = await client
        .from('users')
        .select('name')
        .eq('id', reviewerId)
        .single();
      if (reviewer?.name) {
        reviewerName = reviewer.name;
      }
    }

    // 验证状态
    if (!status || !['approved', 'rejected'].includes(status)) {
      return ApiErrors.validation('无效的审核状态');
    }

    // 验证评价
    if (rating && !['approved', 'excellent', 'rejected'].includes(rating)) {
      return ApiErrors.validation('无效的评价等级');
    }

    // 如果是退回，必须有审核意见
    if (status === 'rejected' && !reviewComment) {
      return ApiErrors.validation('退回时必须填写修改建议');
    }

    // 更新产出状态
    const updateData: Record<string, unknown> = {
      status,
      rating: rating || (status === 'approved' ? 'approved' : 'rejected'),
      review_comment: reviewComment || null,
      reviewer_id: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedSubmission, error } = await client
      .from('task_submissions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '审核失败');
    }

    // 已分配的激励列表
    let assignedRewards: { id: string; name: string; icon: string; type: string }[] = [];

    // 如果审核通过，给小队加分，分配任务激励，更新当前任务
    if (status === 'approved' && submission.team_id) {
      // 获取任务信息
      const { data: task } = await client
        .from('tasks')
        .select('points, task_type, theme_id')
        .eq('id', submission.task_id)
        .single();

      const taskPoints = task?.points || 10;

      // 额外积分范围校验（0-5）
      if (bonusPoints < 0 || bonusPoints > 5) {
        return ApiErrors.validation('额外积分必须在 0-5 之间');
      }

      const totalPoints = taskPoints + bonusPoints; // 基础分 + 额外加分

      // 获取小队当前积分
      const { data: team } = await client
        .from('teams')
        .select('points, current_theme_id')
        .eq('id', submission.team_id)
        .single();

      const currentPoints = team?.points || 0;

      // 更新小队积分（乐观锁，防止并发双花）
      const { data: updatedTeam, error: pointsError } = await client
        .from('teams')
        .update({
          points: currentPoints + totalPoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', submission.team_id)
        .eq('points', currentPoints)
        .select('id');

      if (pointsError || !updatedTeam || updatedTeam.length === 0) {
        // 安全修复：积分更新失败时回滚提交状态，避免数据不一致
        await client
          .from('task_submissions')
          .update({
            status: 'pending',
            rating: null,
            review_comment: null,
            reviewer_id: null,
            reviewed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        console.error('[审核API] 积分更新失败，已回滚提交状态:', { submissionId: id, teamId: submission.team_id });
        return NextResponse.json(
          { success: false, error: '积分更新冲突，提交状态已回滚，请重试' },
          { status: 409 }
        );
      }

      // 最后任务的归档逻辑已迁移至 final-task-feedback API（所有成员提交反馈后触发）

      // 分配任务关联的激励奖励
      const { data: taskRewards } = await client
        .from('task_rewards')
        .select('reward_id')
        .eq('task_id', submission.task_id);

      if (taskRewards && taskRewards.length > 0) {
        // 获取奖励详情
        const rewardIds = taskRewards.map((tr: any) => tr.reward_id);
        const { data: rewardsData } = await client
          .from('rewards')
          .select('id, name, icon, type')
          .in('id', rewardIds);
        
        const rewardsMap = new Map((rewardsData || []).map((r: any) => [r.id, r]));

        for (const tr of taskRewards) {
          // 检查是否已经获得过该激励
          const { data: existingReward } = await client
            .from('user_rewards')
            .select('id')
            .eq('team_id', submission.team_id)
            .eq('reward_id', tr.reward_id)
            .eq('task_id', submission.task_id)
            .single();

          if (!existingReward) {
            await client
              .from('user_rewards')
              .insert({
                team_id: submission.team_id,
                reward_id: tr.reward_id,
                task_id: submission.task_id,
              });
            
            // 添加到已分配激励列表
            const reward = rewardsMap.get(tr.reward_id);
            if (reward) {
              assignedRewards.push({
                id: reward.id,
                name: reward.name,
                icon: reward.icon || '🎁',
                type: reward.type,
              });
            }
          }
        }
      }

      // 检查并更新支线任务状态为完成
      const { data: sideTaskRecords } = await client
        .from('team_side_tasks')
        .select('id, status')
        .eq('team_id', submission.team_id)
        .eq('task_id', submission.task_id)
        .in('status', ['assigned', 'in_progress'])
        .limit(1);

      const sideTaskRecord = sideTaskRecords?.[0];

      if (sideTaskRecord) {
        await client
          .from('team_side_tasks')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', sideTaskRecord.id);
      }

      // 更新小队当前任务为下一个任务
      // 1. 先检查是否有未完成的支线任务
      const { data: nextSideTaskData } = await client
        .from('team_side_tasks')
        .select('task_id')
        .eq('team_id', submission.team_id)
        .in('status', ['assigned', 'in_progress'])
        .order('assigned_at', { ascending: true })
        .limit(1);

      const nextSideTask = nextSideTaskData?.[0];

      if (nextSideTask) {
        // 有支线任务，更新为支线任务，并设置截止日期
        const updateData: Record<string, unknown> = { 
          current_task_id: nextSideTask.task_id 
        };
        if (nextTaskDeadline) {
          updateData.next_task_deadline = nextTaskDeadline;
        }
        await client
          .from('teams')
          .update(updateData)
          .eq('id', submission.team_id);
      } else {
        // 没有支线任务，查找下一个主线任务或最后任务
        const themeId = team?.current_theme_id;
        if (themeId) {
          // 获取当前主题下的所有主线任务（含 task_group_id 和 difficulty）
          const { data: allTasks } = await client
            .from('tasks')
            .select('id, stage, order_index, task_type, task_group_id, difficulty')
            .eq('theme_id', themeId)
            .eq('is_active', true)
            .eq('task_type', 'main');

          // 按任务组分组：同一 task_group_id 的任务视为同一概念任务的不同难度版本
          const groupMap = new Map<string, any[]>();
          for (const t of (allTasks || [])) {
            const gid = t.task_group_id || t.id; // 向后兼容
            if (!groupMap.has(gid)) groupMap.set(gid, []);
            groupMap.get(gid)!.push(t);
          }

          // 排序任务组：取每组第一个任务的 stage/order_index 作为组排序依据
          const sortedGroups = Array.from(groupMap.entries()).sort(([, a], [, b]) => {
            const aFirst = a[0], bFirst = b[0];
            if (aFirst.stage !== bFirst.stage) return aFirst.stage - bFirst.stage;
            return (aFirst.order_index || 0) - (bFirst.order_index || 0);
          });

          // 获取小队已完成的任务（按当前周期过滤）
          const { data: currentTeamData } = await client
            .from('teams')
            .select('cycle, preferred_difficulty')
            .eq('id', submission.team_id)
            .single();
          const currentCycle = currentTeamData?.cycle || 1;
          const preferredDifficulty = currentTeamData?.preferred_difficulty || 'medium';

          const { data: completedSubmissions } = await client
            .from('task_submissions')
            .select('task_id')
            .eq('team_id', submission.team_id)
            .eq('cycle', currentCycle)
            .in('status', ['approved', 'excellent']);

          const completedTaskIds = new Set(
            (completedSubmissions || []).map((s: any) => s.task_id)
          );

          // 判断任务组是否已完成：组内任一变体被完成即视为完成
          const isGroupCompleted = (variants: any[]): boolean => {
            return variants.some(v => completedTaskIds.has(v.id));
          };

          // 从任务组中选择对应难度的变体
          const selectVariant = (variants: any[], prefDiff: string): any | null => {
            if (variants.length === 0) return null;
            const preferred = variants.find((t: any) => (t.difficulty || 'medium') === prefDiff);
            if (preferred) return preferred;
            if (prefDiff !== 'medium') {
              const medium = variants.find((t: any) => (t.difficulty || 'medium') === 'medium');
              if (medium) return medium;
            }
            return variants[0];
          };

          // 找到下一个未完成的任务组，从中选择对应难度的变体
          let nextTask: any = null;
          let isFinalTaskFromForm = false;
          for (const [, variants] of sortedGroups) {
            if (!isGroupCompleted(variants)) {
              nextTask = selectVariant(variants, preferredDifficulty);
              break;
            }
          }

          // 如果所有主线任务组都已完成，检查是否有最后任务表单
          if (!nextTask) {
            const { data: theme } = await client
              .from('task_themes')
              .select('id, final_task_form_id, guider_form_id, light_mage_form_id, secret_scholar_form_id')
              .eq('id', themeId)
              .single();

            if (theme && (theme.final_task_form_id || theme.guider_form_id || theme.light_mage_form_id || theme.secret_scholar_form_id)) {
              // 使用合成ID标记最后任务（从 final_task_forms 获取）
              isFinalTaskFromForm = true;
              nextTask = { id: `final-${themeId}`, task_type: 'final', theme_id: themeId };
            }
          }

          if (nextTask) {
            const updateData: Record<string, unknown> = { 
              current_task_id: nextTask.id 
            };
            if (nextTaskDeadline) {
              updateData.next_task_deadline = nextTaskDeadline;
            }
            await client
              .from('teams')
              .update(updateData)
              .eq('id', submission.team_id);

            // 如果下发的是最后任务，发送特殊通知
            if (isFinalTaskFromForm) {
              // 获取小队成员数量
              const { count: memberCount } = await client
                .from('team_members')
                .select('id', { count: 'exact', head: true })
                .eq('team_id', submission.team_id);

              await sendNotification(client, {
                teamId: submission.team_id,
                type: 'final_task',
                title: '🏆 最后任务已开启！',
                content: `恭喜！你已完成所有主线任务。现在进入最后任务阶段，请所有队员完成反馈表单提交。共 ${memberCount || 0} 名队员需要提交反馈。`,
                taskId: nextTask.id,
                senderId: reviewerId,
                senderName: reviewerName,
              });
            }
          }
        }
      }
    }

    // 如果是优秀评价，分配额外激励
    if (rating === 'excellent' && rewards && submission.team_id) {
      const { tools, skills, bonusTaskId } = rewards;
      
      // 分配隐藏工具
      if (tools && tools.length > 0) {
        for (const toolId of tools) {
          // 获取工具对应的奖励
          const { data: toolReward } = await client
            .from('rewards')
            .select('id, name, icon, type')
            .eq('id', toolId)
            .single();
          
          if (toolReward) {
            await client
              .from('user_rewards')
              .insert({
                team_id: submission.team_id,
                reward_id: toolReward.id,
                task_id: submission.task_id,
              });
            assignedRewards.push({
              id: toolReward.id,
              name: toolReward.name,
              icon: toolReward.icon || '🔧',
              type: toolReward.type,
            });
          }
        }
      }
      
      // 分配隐藏技能卡
      if (skills && skills.length > 0) {
        for (const skillId of skills) {
          // 获取技能对应的奖励
          const { data: skillReward } = await client
            .from('rewards')
            .select('id, name, icon, type')
            .eq('id', skillId)
            .single();
          
          if (skillReward) {
            await client
              .from('user_rewards')
              .insert({
                team_id: submission.team_id,
                reward_id: skillReward.id,
                task_id: submission.task_id,
              });
            assignedRewards.push({
              id: skillReward.id,
              name: skillReward.name,
              icon: skillReward.icon || '✨',
              type: skillReward.type,
            });
          }
        }
      }
    }

    // 下发支线任务（审核通过时，合格和优秀都可以下发）
    if (status === 'approved' && sideTaskId && submission.team_id) {
      // 检查是否已经下发过该支线任务
      const { data: existingSideTask } = await client
        .from('team_side_tasks')
        .select('id')
        .eq('team_id', submission.team_id)
        .eq('task_id', sideTaskId)
        .single();

      if (!existingSideTask) {
        // 获取支线任务信息
        const { data: sideTask } = await client
          .from('tasks')
          .select('title')
          .eq('id', sideTaskId)
          .single();

        // 插入支线任务记录
        await client
          .from('team_side_tasks')
          .insert({
            team_id: submission.team_id,
            task_id: sideTaskId,
            assigned_by: reviewerId,
            status: 'assigned',
          });
      }
    }

    // 构建返回消息
    let message = '';
    if (status === 'rejected') {
      message = '已退回修改';
    } else {
      const parts = [];
      if (rating === 'excellent') {
        parts.push('已评为优秀');
      } else {
        parts.push('审核通过');
      }
      if (bonusPoints > 0) {
        parts.push(`额外加分 ${bonusPoints} 分`);
      }
      if (sideTaskId) {
        parts.push('已下发支线任务');
      }
      message = parts.join('，');
    }

    // 发送通知给小队
    if (submission.team_id) {
      // 获取任务信息用于通知内容
      const { data: taskInfo } = await client
        .from('tasks')
        .select('title, stage')
        .eq('id', submission.task_id)
        .single();

      // 根据审核结果发送不同类型的通知
      if (status === 'approved') {
        // 审核通过通知
        const { data: teamInfo } = await client
          .from('teams')
          .select('points')
          .eq('id', submission.team_id)
          .single();
        
        // 获取任务积分
        const { data: taskPoints } = await client
          .from('tasks')
          .select('points')
          .eq('id', submission.task_id)
          .single();
        
        const totalPoints = (taskPoints?.points || 10) + bonusPoints;

        // 构建通知内容
        let notificationContent = `你提交的「${taskInfo?.title || '任务'}」产出已通过审核${rating === 'excellent' ? '，被评为优秀！' : '！'}获得 ${totalPoints} 积分。`;
        if (reviewComment) {
          notificationContent += `审核意见：${reviewComment}`;
        }
        if (nextTaskDeadline) {
          const deadlineStr = new Date(nextTaskDeadline).toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          notificationContent += ` 下一个任务请在 ${deadlineStr} 前完成提交。`;
        }

        await sendNotification(client, {
          teamId: submission.team_id,
          type: 'submission_feedback',
          title: rating === 'excellent' ? '🎉 恭喜！产出被评为优秀' : '✅ 产出审核通过',
          content: notificationContent,
          taskId: submission.task_id,
          submissionId: id,
          senderId: reviewerId,
          senderName: reviewerName,
          extraData: {
            rating,
            points: totalPoints,
            bonusPoints,
            nextTaskDeadline,
          },
        });

        // 如果下发支线任务，发送支线任务通知
        if (sideTaskId) {
          const { data: sideTaskInfo } = await client
            .from('tasks')
            .select('title, stage, description')
            .eq('id', sideTaskId)
            .single();

          await sendNotification(client, {
            teamId: submission.team_id,
            type: 'side_task',
            title: '🎯 新的支线任务已下发',
            content: `${reviewerName}为你分配了一个支线任务：「${sideTaskInfo?.title || '任务'}」。点击查看详情并开始挑战吧！`,
            taskId: sideTaskId,
            senderId: reviewerId,
            senderName: reviewerName,
            extraData: {
              sideTaskTitle: sideTaskInfo?.title,
              sideTaskStage: sideTaskInfo?.stage,
              sideTaskDescription: sideTaskInfo?.description,
            },
          });
        }

        // 如果分配了额外激励，发送激励通知
        if (assignedRewards.length > 0) {
          const rewardNames = assignedRewards.map(r => `${r.icon} ${r.name}`).join('、');
          await sendNotification(client, {
            teamId: submission.team_id,
            type: 'reward_earned',
            title: '🎁 恭喜获得额外激励',
            content: `${reviewerName}为你分配了 ${assignedRewards.length} 个额外激励：${rewardNames}。快去激励中心查看吧！`,
            senderId: reviewerId,
            senderName: reviewerName,
            extraData: {
              rewards: assignedRewards,
              taskTitle: taskInfo?.title,
            },
          });
        }
      } else if (status === 'rejected') {
        // 退回通知
        await sendNotification(client, {
          teamId: submission.team_id,
          type: 'submission_feedback',
          title: '📝 产出需要修改',
          content: `你提交的「${taskInfo?.title || '任务'}」产出需要修改。修改建议：${reviewComment || '请查看审核意见后重新提交'}`,
          taskId: submission.task_id,
          submissionId: id,
          senderId: reviewerId,
          senderName: reviewerName,
          extraData: {
            rating: 'rejected',
          },
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      submission: updatedSubmission,
      message
    });
  } catch (error) {
    console.error('审核产出错误:', error);
    return ApiErrors.validation('审核失败');
  }
}
