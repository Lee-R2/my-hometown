import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateSignedUrl } from '@/lib/storage-utils';

/**
 * 获取其他小队的任务进度详情
 * 包括：每个任务的介绍、产出、产出状态、老师评语、审核结果、点赞状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id: teamId } = await params;
    const { searchParams } = new URL(request.url);
    const fromTeamId = searchParams.get('fromTeamId'); // 当前小队ID，用于查询点赞状态
    
    const client = getSupabaseClient();

    // 获取小队信息
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, name, current_theme_id, cycle')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    if (!team.current_theme_id) {
      return NextResponse.json({ 
        team: { id: team.id, name: team.name },
        theme: null,
        tasks: [],
        submissions: [],
      });
    }

    const currentCycle = team.cycle || 1;

    // 获取当前主题信息
    const { data: theme } = await client
      .from('task_themes')
      .select('id, name, icon, description')
      .eq('id', team.current_theme_id)
      .single();

    // 获取该主题下的所有任务
    const { data: tasks, error: tasksError } = await client
      .from('tasks')
      .select('id, title, stage, points, description, task_type')
      .eq('theme_id', team.current_theme_id)
      .eq('is_active', true)
      .order('stage', { ascending: true });

    if (tasksError) {
      console.error('获取任务列表失败:', tasksError);
      return supabaseErrorResponse(tasksError, '获取任务列表失败');
    }

    // 获取该小队在该主题下的所有任务提交记录（按当前周期过滤）
    const taskIds = (tasks || []).map(t => t.id);
    let submissions: any[] = [];
    
    if (taskIds.length > 0) {
      const { data: submissionData, error: submissionError } = await client
        .from('task_submissions')
        .select(`
          id,
          task_id,
          status,
          rating,
          review_comment,
          reviewed_at,
          created_at,
          content,
          file_urls,
          reviewer_id
        `)
        .eq('team_id', teamId)
        .eq('cycle', currentCycle)
        .in('task_id', taskIds)
        .order('created_at', { ascending: true });

      if (submissionError) {
        console.error('获取提交记录失败:', submissionError);
      }

      // 获取审核者信息
      const reviewerIds = [...new Set((submissionData || []).map(s => s.reviewer_id).filter(Boolean))];
      const reviewersMap = new Map();
      if (reviewerIds.length > 0) {
        const { data: reviewers } = await client
          .from('users')
          .select('id, name')
          .in('id', reviewerIds);
        (reviewers || []).forEach(r => reviewersMap.set(r.id, r.name));
      }

      // 收集所有文件 key，批量生成签名 URL
      const allFileKeys: string[] = [];
      (submissionData || []).forEach(s => {
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

      // 处理提交记录
      submissions = (submissionData || []).map(s => {
        const filesWithSignedUrls = (s.file_urls || []).map((f: { key?: string; url?: string; name?: string; type?: string; size?: number }) => {
          const finalUrl = f.key && signedUrlMap.get(f.key) ? signedUrlMap.get(f.key)! : (f.url || '');
          return {
            name: f.name || '未命名文件',
            url: finalUrl,
            type: f.type,
            size: f.size,
          };
        });

        return {
          id: s.id,
          task_id: s.task_id,
          status: s.status,
          rating: s.rating,
          review_comment: s.review_comment,
          reviewer_name: s.reviewer_id ? reviewersMap.get(s.reviewer_id) || '未知' : null,
          reviewed_at: s.reviewed_at,
          created_at: s.created_at,
          content: s.content,
          file_urls: filesWithSignedUrls,
        };
      });

      // 获取每个提交的点赞数
      const submissionIds = submissions.map(s => s.id);
      let likesMap = new Map<string, { count: number; liked: boolean }>();
      
      if (submissionIds.length > 0) {
        // 批量获取点赞数
        const { data: likesData } = await client
          .from('likes')
          .select('submission_id')
          .in('submission_id', submissionIds);

        // 统计每个提交的点赞数
        const likeCounts = new Map<string, number>();
        (likesData || []).forEach(like => {
          const count = likeCounts.get(like.submission_id) || 0;
          likeCounts.set(like.submission_id, count + 1);
        });

        // 如果有当前小队ID，查询是否已点赞（team_id 字段存储点赞者）
        let likedSubmissionIds = new Set<string>();
        if (fromTeamId) {
          const { data: myLikes } = await client
            .from('likes')
            .select('submission_id')
            .eq('team_id', fromTeamId)
            .in('submission_id', submissionIds);
          (myLikes || []).forEach(like => likedSubmissionIds.add(like.submission_id));
        }

        // 合并到map
        submissionIds.forEach(sid => {
          likesMap.set(sid, {
            count: likeCounts.get(sid) || 0,
            liked: likedSubmissionIds.has(sid),
          });
        });
      }

      // 给提交记录添加点赞信息
      submissions = submissions.map(s => ({
        ...s,
        likeCount: likesMap.get(s.id)?.count || 0,
        liked: likesMap.get(s.id)?.liked || false,
      }));
    }

    // 组装任务进度数据
    const tasksWithProgress = (tasks || []).map(task => {
      const submission = submissions.find(s => s.task_id === task.id);
      return {
        ...task,
        submission: submission || null,
      };
    });

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
      },
      theme: theme ? {
        id: theme.id,
        name: theme.name,
        icon: theme.icon,
        description: theme.description,
      } : null,
      tasks: tasksWithProgress,
    });
  } catch (error) {
    console.error('获取其他小队任务进度错误:', error);
    return ApiErrors.validation('获取其他小队任务进度错误');
  }
}
