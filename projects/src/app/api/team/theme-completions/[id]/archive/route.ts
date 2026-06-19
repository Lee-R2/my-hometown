import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取已完成主题的存档数据
 * 包括：已完成的任务、技能学习记录、获得的激励奖励
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取主题完成记录
    const { data: completion, error: completionError } = await client
      .from('theme_completions')
      .select(`
        id,
        team_id,
        theme_id,
        completed_at,
        total_points,
        total_rewards,
        total_tasks,
        cycle
      `)
      .eq('id', id)
      .single();

    if (completionError || !completion) {
      return ApiErrors.notFound('未找到主题完成记录');
    }

    const { team_id, theme_id, cycle: completionCycle } = completion;

    // 获取主题详情
    const { data: theme } = await client
      .from('task_themes')
      .select('id, name, icon, description')
      .eq('id', theme_id)
      .single();

    // 1. 获取该主题下所有已完成的任务
    // 首先获取该主题的所有任务ID
    const { data: themeTasks } = await client
      .from('tasks')
      .select('id, title, stage, points, description')
      .eq('theme_id', theme_id)
      .eq('is_active', true)
      .order('stage', { ascending: true });

    const taskIds = (themeTasks || []).map(t => t.id);
    
    // 创建任务映射（供后续使用）
    const tasksMap = new Map((themeTasks || []).map(t => [t.id, t]));

    // 获取已完成的任务提交记录（按周期过滤）
    let completedTasks: any[] = [];
    if (taskIds.length > 0) {
      const { data: submissions, error: submissionError } = await client
        .from('task_submissions')
        .select(`
          id,
          task_id,
          status,
          rating,
          reviewed_at,
          review_comment,
          file_urls,
          content
        `)
        .eq('team_id', team_id)
        .in('task_id', taskIds)
        .eq('cycle', completionCycle || 1)
        .eq('status', 'approved')
        .order('created_at', { ascending: true });

      if (submissionError) {
        console.error('[Archive API] Submissions query error:', submissionError);
      }

      // 收集所有文件 key，批量生成签名 URL
      // 注意：file_urls 有两种格式：
      // 1. 旧格式：{ name, size, type, url } - 没有 key，url 是签名 URL
      // 2. 新格式：{ key, name, size, type, url } - 有 key，需要重新生成签名 URL
      const allFileKeys: string[] = [];
      (submissions || []).forEach(s => {
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

      // 合并任务信息，并为文件生成新的签名 URL
      completedTasks = (submissions || []).map(s => {
        const filesWithSignedUrls = (s.file_urls || []).map((f: { key?: string; url?: string; name?: string; type?: string; size?: number }) => {
          // 如果有 key，使用新生成的签名 URL
          // 如果没有 key 但有 url，使用原始 url（旧数据）
          // 如果都没有，url 为空字符串
          const finalUrl = f.key && signedUrlMap.get(f.key) ? signedUrlMap.get(f.key)! : (f.url || '');
          return {
            name: f.name || '未命名文件',
            url: finalUrl,
            type: f.type,
            size: f.size,
          };
        });
        
        return {
          ...s,
          file_urls: filesWithSignedUrls,
          task: tasksMap.get(s.task_id) || null,
        };
      });
    }

    // 2. 获取该主题相关的技能学习记录
    let skillLearnings: any[] = [];
    if (taskIds.length > 0) {
      const { data: learnings } = await client
        .from('team_skill_learnings')
        .select(`
          id,
          status,
          started_at,
          completed_at,
          points_earned,
          skill_id,
          task_id
        `)
        .eq('team_id', team_id)
        .in('task_id', taskIds);

      // 获取技能详情
      const skillIds = [...new Set((learnings || []).map(l => l.skill_id))];
      const { data: skillsData } = await client
        .from('skills')
        .select('id, name, description, icon, category')
        .in('id', skillIds);

      const skillsMap = new Map((skillsData || []).map(s => [s.id, s]));

      skillLearnings = (learnings || []).map(l => ({
        ...l,
        skill: skillsMap.get(l.skill_id) || null,
        task: tasksMap.get(l.task_id) || null,
      }));
    }

    // 3. 获取该主题获得的激励奖励
    // 通过任务ID关联获取
    let rewards: any[] = [];
    if (taskIds.length > 0) {
      const { data: userRewards } = await client
        .from('user_rewards')
        .select('id, earned_at, task_id, reward_id')
        .eq('team_id', team_id)
        .in('task_id', taskIds);

      // 获取奖励详情
      const rewardIds = [...new Set((userRewards || []).map(r => r.reward_id))];
      const { data: rewardsData } = await client
        .from('rewards')
        .select('id, name, description, icon, points, type, image_url')
        .in('id', rewardIds);

      const rewardsMap = new Map((rewardsData || []).map(r => [r.id, r]));

      rewards = (userRewards || []).map(ur => ({
        ...ur,
        reward: rewardsMap.get(ur.reward_id) || null,
        task: tasksMap.get(ur.task_id) || null,
      }));
    }

    // 4. 统计数据
    // 使用 theme_completions 表中存储的数据，确保与卡片显示一致
    // 卡片显示的 total_tasks 是完成的任务数，total_points 是获得的积分，total_rewards 是激励数
    const stats = {
      totalTasks: completion.total_tasks || completedTasks.length,
      completedTasks: completedTasks.length,
      totalPointsEarned: completion.total_points || 0,
      totalSkillsLearned: skillLearnings.filter(l => l.status === 'completed').length,
      totalRewardsEarned: completion.total_rewards || rewards.length,
    };

    return NextResponse.json({
      completion: {
        ...completion,
        theme: theme || { id: theme_id, name: '未知主题', icon: '🎯' },
      },
      completedTasks,
      skillLearnings,
      rewards,
      stats,
    });
  } catch (error) {
    console.error('获取主题存档数据错误:', error);
    return safeError(error);
  }
}
