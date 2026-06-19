import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // team 角色只能修改自己小队的成员
  if (auth.payload?.role === 'team' && auth.payload?.userId !== (await params).id) {
    return ApiErrors.forbidden('只能修改自己小队的成员');
  }

  try {
    const { id, memberId } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const { data: member, error } = await client
      .from('team_members')
      .update({
        name: body.name,
        role: body.role,
        intro: body.intro,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('team_id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新成员失败');
    }

    return NextResponse.json({ success: true, member });
  } catch (error) {
    console.error('更新成员信息错误:', error);
    return ApiErrors.validation('更新成员信息失败');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // team 角色只能删除自己小队的成员
  if (auth.payload?.role === 'team' && auth.payload?.userId !== (await params).id) {
    return ApiErrors.forbidden('只能删除自己小队的成员');
  }

  try {
    const { id, memberId } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', id);

    if (error) {
      return supabaseErrorResponse(error, '删除成员失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除成员错误:', error);
    return ApiErrors.validation('删除成员失败');
  }
}
