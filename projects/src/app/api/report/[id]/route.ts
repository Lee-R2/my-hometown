import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * 获取任务主题报告数据（公开可访问，无需登录）
 * 通过 theme_completion 的 id 查询
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id: completionId } = await params;
    if (!completionId) {
      return ApiErrors.validation('缺少报告ID');
    }

    const client = getSupabaseClient();

    // 1. 获取主题完成记录
    const { data: completion, error: completionError } = await client
      .from('theme_completions')
      .select('id, team_id, theme_id, completed_at, total_points, total_rewards, total_tasks, cycle')
      .eq('id', completionId)
      .single();

    if (completionError || !completion) {
      return ApiErrors.notFound('报告不存在');
    }

    // 2. 获取小队信息
    const { data: team } = await client
      .from('teams')
      .select('id, name, slogan')
      .eq('id', completion.team_id)
      .single();

    // 3. 获取主题信息
    const { data: theme } = await client
      .from('task_themes')
      .select('id, name, icon, description')
      .eq('id', completion.theme_id)
      .single();

    // 4. 获取该主题下所有任务
    const { data: tasks } = await client
      .from('tasks')
      .select('id, title, task_type, stage, points')
      .eq('theme_id', completion.theme_id);

    const allTasks = tasks || [];
    const mainTasks = allTasks.filter(t => t.task_type === 'main' || !t.task_type);
    const sideTasks = allTasks.filter(t => t.task_type === 'side');
    const finalTasks = allTasks.filter(t => t.task_type === 'final');

    // 5. 获取小队在该周期内的所有提交
    const { data: submissions } = await client
      .from('task_submissions')
      .select('id, task_id, status, rating, file_urls, content, created_at')
      .eq('team_id', completion.team_id)
      .eq('cycle', completion.cycle);

    const allSubmissions = submissions || [];

    // 6. 统计提交状态
    const approvedSubmissions = allSubmissions.filter(s => s.status === 'approved');
    const rejectedSubmissions = allSubmissions.filter(s => s.status === 'rejected');
    const pendingSubmissions = allSubmissions.filter(s => s.status === 'pending');
    const excellentSubmissions = allSubmissions.filter(s => s.status === 'approved' && s.rating === 'excellent');

    // 计算完成任务数（有approved提交的任务）
    const completedTaskIds = new Set(approvedSubmissions.map(s => s.task_id));
    const completedTaskCount = allTasks.filter(t => completedTaskIds.has(t.id)).length;

    // 7. 获取点赞数
    const { count: likesCount } = await client
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('to_team_id', completion.team_id);

    // 8. 获取宝石碎片（从 teams 表读取权威值）
    const { data: teamForGems } = await client
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', completion.team_id)
      .maybeSingle();

    // 9. 获取徽章数
    const { count: badgeCount } = await client
      .from('user_rewards')
      .select('*, rewards!inner(type)', { count: 'exact', head: true })
      .eq('team_id', completion.team_id)
      .eq('rewards.type', 'badge');

    // 用另一种方式统计，因为 head:true 不支持 join 过滤
    const { data: badgeRewards } = await client
      .from('user_rewards')
      .select('reward_id, rewards(type)')
      .eq('team_id', completion.team_id);
    const badgeCountValue = (badgeRewards || []).filter(r => {
      const reward = Array.isArray(r.rewards) ? r.rewards[0] : r.rewards;
      return reward?.type === 'badge';
    }).length;

    // 10. 获取技能卡数
    const skillCardCount = (badgeRewards || []).filter(r => {
      const reward = Array.isArray(r.rewards) ? r.rewards[0] : r.rewards;
      return reward?.type === 'skill_card';
    }).length;

    // 11. 从小队产出中选出2-3个截图展示（优先选优秀的，再补充其他已通过的）
    const approvedWithImages = approvedSubmissions
      .filter(s => {
        const urls: string[] = s.file_urls ? (typeof s.file_urls === 'string' ? JSON.parse(s.file_urls) : s.file_urls) : [];
        return urls.length > 0;
      });

    // 排序：优秀的排前面，再按创建时间倒序
    const sortedForShow = [...approvedWithImages].sort((a, b) => {
      if (a.rating === 'excellent' && b.rating !== 'excellent') return -1;
      if (a.rating !== 'excellent' && b.rating === 'excellent') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }).slice(0, 3);

    // 收集产出截图
    const excellentWorks: Array<{
      submissionId: string;
      taskTitle: string;
      imageUrl: string;
      rating: string | null;
    }> = [];

    for (const sub of sortedForShow) {
      const urls: string[] = sub.file_urls ? (typeof sub.file_urls === 'string' ? JSON.parse(sub.file_urls) : sub.file_urls) : [];
      const task = allTasks.find(t => t.id === sub.task_id);
      if (urls.length > 0) {
        excellentWorks.push({
          submissionId: sub.id,
          taskTitle: task?.title || '未知任务',
          imageUrl: urls[0],
          rating: sub.rating,
        });
      }
    }

    // 12. 获取最后任务表单的话语
    let finalTaskQuotes: string[] = [];
    if (finalTasks.length > 0) {
      const finalTaskIds = finalTasks.map(t => t.id);
      const { data: finalSubmissions } = await client
        .from('final_task_submissions')
        .select('form_data')
        .eq('team_id', completion.team_id)
        .eq('cycle', completion.cycle)
        .in('task_id', finalTaskIds);

      if (finalSubmissions && finalSubmissions.length > 0) {
        const allTexts: string[] = [];
        for (const fs of finalSubmissions) {
          const formData = fs.form_data;
          if (formData && typeof formData === 'object') {
            // 提取所有文本值（跳过空值和太短的值）
            Object.values(formData as Record<string, unknown>).forEach(val => {
              if (typeof val === 'string' && val.trim().length >= 5) {
                allTexts.push(val.trim());
              }
            });
          }
        }
        // 随机取3句
        finalTaskQuotes = allTexts.sort(() => Math.random() - 0.5).slice(0, 3);
      }
    }

    // 13. 获取小队成员
    const { data: members } = await client
      .from('team_members')
      .select('id, name, role')
      .eq('team_id', completion.team_id);

    // 构建报告数据
    const report = {
      completion: {
        id: completion.id,
        completedAt: completion.completed_at,
        totalPoints: completion.total_points,
        totalTasks: completion.total_tasks,
        cycle: completion.cycle,
      },
      team: {
        id: team?.id,
        name: team?.name || '未知小队',
        slogan: team?.slogan || '',
        icon: '🚀',
        members: (members || []).map(m => ({
          name: m.name,
          role: m.role,
        })),
      },
      theme: {
        id: theme?.id,
        name: theme?.name || '未知主题',
        icon: theme?.icon || '🎯',
        description: theme?.description || '',
      },
      // 基础数据
      stats: {
        totalPoints: completion.total_points,
        likesReceived: likesCount || 0,
        gemFragments: teamForGems?.heart_shards || 0,
        gems: teamForGems?.heart_gems || 0,
        badgeCount: badgeCountValue,
        skillCardCount: skillCardCount,
      },
      // 图表数据
      charts: {
        // 任务完成比例
        taskCompletion: {
          completed: completedTaskCount,
          total: allTasks.length,
          percentage: allTasks.length > 0 ? Math.round((completedTaskCount / allTasks.length) * 100) : 0,
        },
        // 主线/支线任务比例
        taskTypeRatio: {
          main: mainTasks.length,
          side: sideTasks.length,
          final: finalTasks.length,
        },
        // 审核结果比例
        reviewRatio: {
          excellent: excellentSubmissions.length,
          approved: approvedSubmissions.filter(s => s.rating !== 'excellent').length,
          rejected: rejectedSubmissions.length,
          pending: pendingSubmissions.length,
        },
      },
      // 优秀产出
      excellentWorks,
      // 最后任务话语
      finalTaskQuotes,
    };

    return NextResponse.json({ report });
  } catch (error) {
    console.error('获取任务报告错误:', error);
    return ApiErrors.validation('获取报告失败');
  }
}
