import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取单个激励详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();
    
    const { data: reward, error } = await client
      .from('rewards')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !reward) {
      return ApiErrors.notFound('激励不存在');
    }

    return NextResponse.json({ reward });
  } catch (error) {
    console.error('获取激励详情失败:', error);
    return ApiErrors.validation('获取激励详情失败');
  }
}

// 更新激励
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const {
      name,
      description,
      icon,
      type,
      points,
      imageUrl,
      conditions,
      conditionLogic,
      distributionMethod,
    } = body;

    // 更新激励
    const { data: reward, error } = await client
      .from('rewards')
      .update({
        name,
        description,
        icon,
        type,
        points: points || 0,
        conditions: conditions || [],
        condition_logic: conditionLogic || 'and',
        image_url: imageUrl,
        distribution_method: distributionMethod || 'auto',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新激励失败:');
    }

    if (!reward) {
      return ApiErrors.notFound('激励不存在');
    }

    return NextResponse.json({ success: true, message: '激励已更新' });
  } catch (error) {
    console.error('更新激励失败:', error);
    return ApiErrors.validation('更新激励失败');
  }
}

// 删除激励
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('rewards')
      .delete()
      .eq('id', id);

    if (error) {
      return supabaseErrorResponse(error, '删除激励失败:');
    }

    return NextResponse.json({ success: true, message: '激励已删除' });
  } catch (error) {
    console.error('删除激励失败:', error);
    return ApiErrors.validation('删除激励失败');
  }
}
