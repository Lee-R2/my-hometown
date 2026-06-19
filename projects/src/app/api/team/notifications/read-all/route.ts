import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 标记全部通知为已读
 */
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { type } = body;
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    let query = client
      .from('team_notifications')
      .update({ is_read: true })
      .eq('team_id', teamId)
      .eq('is_read', false);

    // 如果指定类型，只标记该类型的通知
    if (type) {
      query = query.eq('type', type);
    }

    const { error } = await query;

    if (error) {
      console.error('全部标记已读失败:', error);
      return supabaseErrorResponse(error, '操作失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('全部标记已读错误:', error);
    return safeError(error);
  }
}
