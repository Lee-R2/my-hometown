import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 删除帖子（软删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const teamId = auth.payload?.userId;

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: '认证信息无效' },
        { status: 401 }
      );
    }

    // 验证帖子属于该小队
    const { data: post, error: fetchError } = await supabase
      .from('blackboard_posts')
      .select('id, team_id, media_urls')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !post) {
      return ApiErrors.notFound('帖子不存在');
    }

    if (post.team_id !== teamId) {
      return ApiErrors.forbidden('只能删除自己的帖子');
    }

    // 软删除
    const { error } = await supabase
      .from('blackboard_posts')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    // 同时软删除相关评论和点赞
    await supabase
      .from('blackboard_comments')
      .update({ is_deleted: true })
      .eq('post_id', id);

    await supabase
      .from('blackboard_likes')
      .delete()
      .eq('post_id', id);

    return NextResponse.json({
      success: true,
      message: '帖子已删除',
    });
  } catch (error: any) {
    console.error('删除帖子失败:', error);
    return safeError(error);
  }
}
