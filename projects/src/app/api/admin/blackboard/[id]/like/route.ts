import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 管理员点赞/取消点赞
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const body = await request.json();
    const { admin_id } = body;

    if (!admin_id) {
      return ApiErrors.validation('缺少管理员ID');
    }

    // 验证帖子存在
    const { data: post } = await supabase
      .from('blackboard_posts')
      .select('id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return ApiErrors.notFound('帖子不存在');
    }

    // 检查是否已点赞
    const { data: existing } = await supabase
      .from('blackboard_likes')
      .select('id')
      .eq('post_id', id)
      .eq('team_id', admin_id)
      .single();

    let is_liked: boolean;

    if (existing) {
      const { error } = await supabase
        .from('blackboard_likes')
        .delete()
        .eq('post_id', id)
        .eq('team_id', admin_id);

      if (error) throw error;
      is_liked = false;
    } else {
      const { error } = await supabase
        .from('blackboard_likes')
        .insert({
          post_id: id,
          team_id: admin_id,
        });

      if (error) throw error;
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
    console.error('管理员点赞失败:', error);
    return safeError(error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const admin_id = request.nextUrl.searchParams.get('admin_id');

    if (!admin_id) {
      return NextResponse.json({ success: true, data: { is_liked: false } });
    }

    const { data } = await supabase
      .from('blackboard_likes')
      .select('id')
      .eq('post_id', id)
      .eq('team_id', admin_id)
      .single();

    return NextResponse.json({ success: true, data: { is_liked: !!data } });
  } catch (error: any) {
    console.error('检查点赞状态失败:', error);
    return safeError(error);
  }
}
