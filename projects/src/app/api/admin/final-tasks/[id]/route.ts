import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

function mapDbToForm(dbRow: any) {
  return {
    id: dbRow.id,
    name: dbRow.title || dbRow.name || '',
    description: dbRow.description || '',
    icon: dbRow.icon || '🏆',
    is_global: dbRow.is_global ?? (dbRow.school_id === null),
    school_id: dbRow.school_id || null,
    team_role: dbRow.team_role || dbRow.role || null,
    form_config: dbRow.form_config || dbRow.fields || [],
    created_at: dbRow.created_at,
    updated_at: dbRow.updated_at || dbRow.created_at,
    is_active: dbRow.is_active ?? true,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    const { data, error } = await client
      .from('final_task_forms')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('获取最后任务表单失败:', error);
      return ApiErrors.notFound('表单不存在');
    }

    return NextResponse.json({ 
      success: true, 
      form: mapDbToForm(data) 
    });
  } catch (error) {
    console.error('获取最后任务表单错误:', error);
    return safeError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    const { role: userRole } = body;

    // 权限验证：只有超级管理员可以更新最后任务表单
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return ApiErrors.forbidden('只有超级管理员可以更新最后任务表单');
    }

    const updateData: Record<string, any> = {};

    if (body.name !== undefined) updateData.title = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isGlobal !== undefined) {
      updateData.school_id = body.isGlobal ? null : (body.schoolId || null);
    }
    if (body.formConfig !== undefined) updateData.fields = body.formConfig;
    if (body.teamRole !== undefined) updateData.role = body.teamRole || null;

    const { data, error } = await client
      .from('final_task_forms')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新最后任务表单失败:', error);
      return supabaseErrorResponse(error, '更新最后任务表单失败');
    }

    return NextResponse.json({ 
      success: true, 
      form: mapDbToForm(data),
      message: '更新成功' 
    });
  } catch (error) {
    console.error('更新最后任务表单错误:', error);
    return safeError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { id } = await params;

    // 从请求头获取角色信息
    const role = request.headers.get('x-user-role');

    // 权限验证：只有超级管理员可以删除最后任务表单
    if (role !== 'admin' && role !== 'super_admin') {
      return ApiErrors.forbidden('只有超级管理员可以删除最后任务表单');
    }

    // 检查是否被主题引用
    const { count } = await client
      .from('themes')
      .select('id', { count: 'exact', head: true })
      .eq('final_task_form_id', id);

    if (count && count > 0) {
      return NextResponse.json({ 
        error: `该表单已被 ${count} 个主题引用，无法删除` 
      }, { status: 400 });
    }

    // 硬删除（DB没有is_active列）
    const { error } = await client
      .from('final_task_forms')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除最后任务表单失败:', error);
      return ApiErrors.validation('删除失败');
    }

    return NextResponse.json({ 
      success: true, 
      message: '删除成功' 
    });
  } catch (error) {
    console.error('删除最后任务表单错误:', error);
    return ApiErrors.validation('删除最后任务表单失败');
  }
}
