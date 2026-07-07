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

  // parent 角色无权修改成员
  if (auth.payload!.role === 'parent') {
    return ApiErrors.forbidden('家长无权修改小队成员');
  }

  try {
    const { id, memberId } = await params;
    const client = getSupabaseClient();

    // team 角色只能修改自己小队的成员
    if (auth.payload!.role === 'team' && auth.payload!.userId !== id) {
      return ApiErrors.forbidden('只能修改自己小队的成员');
    }

    // volunteer/teacher 角色按学校范围校验
    if (auth.payload!.role === 'volunteer' || auth.payload!.role === 'teacher') {
      const { data: targetTeam } = await client
        .from('teams')
        .select('school_id')
        .eq('id', id)
        .maybeSingle();
      if (!targetTeam) {
        return ApiErrors.notFound('小队不存在');
      }
      if (targetTeam.school_id !== auth.payload!.schoolId) {
        return ApiErrors.forbidden('无权操作其他学校的小队');
      }
    }

    const body = await request.json();

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

  // parent 角色无权删除成员
  if (auth.payload!.role === 'parent') {
    return ApiErrors.forbidden('家长无权删除小队成员');
  }

  try {
    const { id, memberId } = await params;
    const client = getSupabaseClient();

    // team 角色只能删除自己小队的成员
    if (auth.payload!.role === 'team' && auth.payload!.userId !== id) {
      return ApiErrors.forbidden('只能删除自己小队的成员');
    }

    // volunteer/teacher 角色按学校范围校验
    if (auth.payload!.role === 'volunteer' || auth.payload!.role === 'teacher') {
      const { data: targetTeam } = await client
        .from('teams')
        .select('school_id')
        .eq('id', id)
        .maybeSingle();
      if (!targetTeam) {
        return ApiErrors.notFound('小队不存在');
      }
      if (targetTeam.school_id !== auth.payload!.schoolId) {
        return ApiErrors.forbidden('无权操作其他学校的小队');
      }
    }

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
