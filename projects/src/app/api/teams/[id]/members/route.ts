import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { HeaderUtils } from 'coze-coding-dev-sdk';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // team 角色只能查看自己小队的成员
    if (auth.payload!.role === 'team' && auth.payload!.userId !== id) {
      return ApiErrors.forbidden('只能查看自己小队的成员');
    }

    // parent 角色只能查看已关注小队的成员
    if (auth.payload!.role === 'parent') {
      const { data: followRecord } = await client
        .from('parent_team_follows')
        .select('id')
        .eq('team_id', id)
        .eq('parent_id', auth.payload!.userId)
        .maybeSingle();
      if (!followRecord) {
        return ApiErrors.forbidden('只能查看已关注小队的成员');
      }
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
        return ApiErrors.forbidden('无权查看其他学校的小队成员');
      }
    }

    const { data: members, error } = await client
      .from('team_members')
      .select('*')
      .eq('team_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      return supabaseErrorResponse(error, '获取成员列表失败');
    }

    return NextResponse.json({ members: members || [] });
  } catch (error) {
    console.error('获取成员列表错误:', error);
    return ApiErrors.validation('获取成员列表失败');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // parent 角色无权添加成员
  if (auth.payload!.role === 'parent') {
    return ApiErrors.forbidden('家长无权添加小队成员');
  }

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // team 角色只能给自己的小队添加成员
    if (auth.payload!.role === 'team' && auth.payload!.userId !== id) {
      return ApiErrors.forbidden('只能给自己的小队添加成员');
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
      .insert({
        team_id: id,
        name: body.name,
        role: body.role || 'guider',
        intro: body.intro || '',
        is_approved: true,
      })
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '添加成员失败');
    }

    return NextResponse.json({ success: true, member });
  } catch (error) {
    console.error('添加成员错误:', error);
    return ApiErrors.validation('添加成员失败');
  }
}
