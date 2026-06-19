import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { userId, hintIds } = await request.json();

    if (!userId) {
      return ApiErrors.validation('缺少用户ID');
    }

    const client = getSupabaseClient();

    let query = client
      .from('notifications')
      .update({ is_read: true })
      .eq('target_type', 'volunteer')
      .eq('target_id', userId)
      .eq('type', 'theme_selected');

    if (hintIds && hintIds.length > 0) {
      query = query.in('id', hintIds);
    }

    const { error } = await query;

    if (error) {
      console.error('标记提示已读失败:', error);
      return supabaseErrorResponse(error, '标记提示已读失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('标记提示已读失败:', error);
    return ApiErrors.validation('标记提示已读失败');
  }
}
