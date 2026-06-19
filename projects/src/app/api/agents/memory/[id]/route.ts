import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 获取单个记忆
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return ApiErrors.validation('缺少记忆ID');
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('agent_memories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return ApiErrors.notFound('记忆不存在');
    }

    return NextResponse.json({
      success: true,
      memory: data
    });

  } catch (error: any) {
    console.error('获取记忆失败:', error);
    return safeError(error);
  }
}

// 更新记忆
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, importance, isActive } = body;

    if (!id) {
      return ApiErrors.validation('缺少记忆ID');
    }

    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (content !== undefined) updates.content = content;
    if (importance !== undefined) updates.importance = importance;
    if (isActive !== undefined) updates.is_active = isActive;

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('agent_memories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '记忆已更新',
      memory: data
    });

  } catch (error: any) {
    console.error('更新记忆失败:', error);
    return safeError(error);
  }
}

// 删除记忆（软删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;

    if (!id) {
      return ApiErrors.validation('缺少记忆ID');
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from('agent_memories')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '记忆已删除'
    });

  } catch (error: any) {
    console.error('删除记忆失败:', error);
    return safeError(error);
  }
}
