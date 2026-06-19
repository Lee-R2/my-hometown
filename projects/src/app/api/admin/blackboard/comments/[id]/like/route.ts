import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id: commentId } = await params;
    const body = await request.json();
    const { admin_id } = body;

    if (!admin_id) {
      return ApiErrors.validation('缺少管理员ID');
    }

    const supabase = getSupabaseClient();

    const { data: commentInfo } = await supabase
      .from('blackboard_comments')
      .select('id, team_id')
      .eq('id', commentId)
      .single();

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
      .eq('liker_id', admin_id)
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
        .insert({ comment_id: commentId, liker_id: admin_id, team_id: commentInfo?.team_id || admin_id });

      if (insertError) {
        console.error('评论点赞失败:', insertError);
        return ApiErrors.validation('操作失败');
      }
      is_liked = true;
    }

    const { count: likeCount } = await supabase
      .from('blackboard_comment_likes')
      .select('*', { count: 'exact', head: true })
      .eq('comment_id', commentId);

    like_count = likeCount || 0;

    await supabase
      .from('blackboard_comments')
      .update({ likes_count: like_count })
      .eq('id', commentId);

    return NextResponse.json({ is_liked, like_count });
  } catch (error) {
    console.error('管理员评论点赞API错误:', error);
    return ApiErrors.validation('管理员评论点赞失败');
  }
}
