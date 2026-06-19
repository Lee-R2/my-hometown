import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { searchParams } = new URL(request.url);
    const userRole = searchParams.get('userRole');
    const schoolId = searchParams.get('schoolId');
    const countOnly = searchParams.get('countOnly') === 'true';

    const client = getSupabaseClient();

    let query = client
      .from('parent_team_relations')
      .select('id, parent_id, team_id, relation, created_at', { count: 'exact' });

    if (userRole === 'teacher' && schoolId) {
      const { data: schoolTeams } = await client
        .from('teams')
        .select('id')
        .eq('school_id', schoolId);
      const teamIds = (schoolTeams || []).map((t: any) => t.id);
      if (teamIds.length === 0) {
        return NextResponse.json({ success: true, follows: [], count: 0 });
      }
      query = query.in('team_id', teamIds);
    }

    const { data: relations, count, error } = await query;

    if (error) {
      console.error('[获取家长关注列表] 查询失败:', error);
      if (countOnly) {
        return NextResponse.json({ success: true, count: 0 });
      }
      return NextResponse.json({ success: true, follows: [] });
    }

    if (countOnly) {
      return NextResponse.json({ success: true, count: count || 0 });
    }

    const parentIds = (relations || []).map((r: any) => r.parent_id).filter(Boolean);
    const teamIds = (relations || []).map((r: any) => r.team_id).filter(Boolean);

    let parentsMap: Record<string, any> = {};
    let teamsMap: Record<string, any> = {};

    if (parentIds.length > 0) {
      const { data: parents } = await client
        .from('parent_accounts')
        .select('id, name, phone')
        .in('id', parentIds);
      if (parents) {
        parentsMap = parents.reduce((acc: any, p: any) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    if (teamIds.length > 0) {
      const { data: teams } = await client
        .from('teams')
        .select('id, name, slogan')
        .in('id', teamIds);
      if (teams) {
        teamsMap = teams.reduce((acc: any, t: any) => {
          acc[t.id] = t;
          return acc;
        }, {});
      }
    }

    const result = (relations || []).map((r: any) => ({
      id: r.id,
      relation: r.relation,
      status: 'approved',
      isActive: true,
      followedAt: r.created_at,
      parent: parentsMap[r.parent_id] ? {
        id: parentsMap[r.parent_id].id,
        name: parentsMap[r.parent_id].name,
        phone: parentsMap[r.parent_id].phone
      } : null,
      team: teamsMap[r.team_id] ? {
        id: teamsMap[r.team_id].id,
        name: teamsMap[r.team_id].name,
        slogan: teamsMap[r.team_id].slogan
      } : null
    }));

    return NextResponse.json({
      success: true,
      follows: result
    });
  } catch (error: any) {
    console.error('[获取家长关注列表] 错误:', error);
    return ApiErrors.validation('获取家长关注列表失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { relationId, action, remark, userId } = body;

    if (!relationId || !action) {
      return ApiErrors.validation('缺少必要参数');
    }

    const client = getSupabaseClient();

    if (action === 'remove') {
      const { error: deleteError } = await client
        .from('parent_team_relations')
        .delete()
        .eq('id', relationId);

      if (deleteError) {
        console.error('[移除家长关注] 失败:', deleteError);
        return NextResponse.json(
          { success: false, error: `操作失败: ${deleteError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: '已移除该关注关系'
      });
    }

    return ApiErrors.validation('无效的操作');
  } catch (error: any) {
    console.error('[家长关注操作] 错误:', error);
    return ApiErrors.validation('家长关注操作失败');
  }
}
