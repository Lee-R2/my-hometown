import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id: commentId } = await params;
    const body = await request.json();
    const { team_id, liker_id } = body;

    if (!team_id) {
      return ApiErrors.validation('缺少必要参数');
    }

    // liker_id 默认使用 team_id
    const effectiveLikerId = liker_id || team_id;

    const supabase = getSupabaseClient();

    // 验证评论存在
    const { data: comment, error: commentError } = await supabase
      .from('blackboard_comments')
      .select('id')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) {
      return ApiErrors.notFound('评论不存在');
    }

    // 检查是否已点赞
    const { data: existing } = await supabase
      .from('blackboard_comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('liker_id', effectiveLikerId)
      .single();

    let is_liked: boolean;
    let like_count: number;

    if (existing) {
      const { error: deleteError } = await supabase
        .from('blackboard_comment_likes')
        .delete()
        .eq('id', existing.id);

      if (deleteError) {
        console.error('取消评论点赞失败:', deleteError);
        return ApiErrors.validation('操作失败');
      }
      is_liked = false;
    } else {
      const { error: insertError } = await supabase
        .from('blackboard_comment_likes')
        .insert({ comment_id: commentId, liker_id: effectiveLikerId, team_id });

      if (insertError) {
        console.error('评论点赞失败:', insertError);
        return ApiErrors.validation('操作失败');
      }
      is_liked = true;
    }

    const { count: likeCountNum } = await supabase
      .from('blackboard_comment_likes')
      .select('*', { count: 'exact', head: true })
      .eq('comment_id', commentId);

    like_count = likeCountNum || 0;

    await supabase
      .from('blackboard_comments')
      .update({ likes_count: like_count })
      .eq('id', commentId);

    return NextResponse.json({ is_liked, like_count });
  } catch (error) {
    console.error('评论点赞API错误:', error);
    return safeError(error);
  }
}
