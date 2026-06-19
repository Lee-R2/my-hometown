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

  // team 角色只能给自己的小队添加成员
  if (auth.payload?.role === 'team' && auth.payload?.userId !== (await params).id) {
    return ApiErrors.forbidden('只能给自己的小队添加成员');
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

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
