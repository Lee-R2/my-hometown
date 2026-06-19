import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 点赞/取消点赞
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const team_id = auth.payload?.userId;

    if (!team_id) {
      return NextResponse.json(
        { success: false, error: '认证信息无效' },
        { status: 401 }
      );
    }

    // 验证帖子存在
    const { data: post, error: postError } = await supabase
      .from('blackboard_posts')
      .select('id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (postError || !post) {
      return ApiErrors.notFound('帖子不存在');
    }

    // 检查是否已点赞
    const { data: existingLike } = await supabase
      .from('blackboard_likes')
      .select('id')
      .eq('post_id', id)
      .eq('team_id', team_id)
      .single();

    let is_liked: boolean;

    if (existingLike) {
      // 取消点赞
      const { error: deleteError } = await supabase
        .from('blackboard_likes')
        .delete()
        .eq('post_id', id)
        .eq('team_id', team_id);

      if (deleteError) throw deleteError;
      is_liked = false;
    } else {
      // 点赞
      const { error: insertError } = await supabase
        .from('blackboard_likes')
        .insert({
          post_id: id,
          team_id,
        });

      if (insertError) throw insertError;
      is_liked = true;
    }

    // 从 blackboard_likes 表直接 COUNT 真实点赞数，避免并发计算错误
    const { count: likeCount } = await supabase
      .from('blackboard_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', id);

    const newCount = likeCount || 0;

    // 更新帖子的点赞计数
    await supabase
      .from('blackboard_posts')
      .update({ likes_count: newCount })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      data: { is_liked, like_count: newCount },
    });
  } catch (error: any) {
    console.error('点赞操作失败:', error);
    return safeError(error);
  }
}
