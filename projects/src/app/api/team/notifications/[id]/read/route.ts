import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 标记单条通知为已读
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const { error } = await client
      .from('team_notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('team_id', teamId);

    if (error) {
      console.error('标记已读失败:', error);
      return supabaseErrorResponse(error, '标记已读失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('标记已读错误:', error);
    return safeError(error);
  }
}
