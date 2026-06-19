import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('messages')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      return supabaseErrorResponse(error, '标记已读失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('标记已读错误:', error);
    return ApiErrors.validation('标记已读失败');
  }
}
