import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 更新会话
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { isActive, metadata } = body;

    if (!sessionId) {
      return ApiErrors.validation('缺少会话ID');
    }

    const client = getSupabaseClient();
    const updates: any = {
      last_activity_at: new Date().toISOString()
    };

    if (isActive !== undefined) updates.is_active = isActive;
    if (metadata !== undefined) updates.metadata = metadata;

    const { data, error } = await client
      .from('agent_sessions')
      .update(updates)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      session: data
    });

  } catch (error: any) {
    console.error('更新会话失败:', error);
    return safeError(error);
  }
}

// 关闭会话
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return ApiErrors.validation('缺少会话ID');
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from('agent_sessions')
      .update({
        is_active: false,
        last_activity_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '会话已关闭'
    });

  } catch (error: any) {
    console.error('关闭会话失败:', error);
    return safeError(error);
  }
}
