import { requireAnyAuth, requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取志愿者信息
    const { data: volunteer, error: volunteerError } = await client
      .from('users')
      .select('id, username, name, role, school_id, assigned_teacher_id, created_at')
      .eq('id', id)
      .eq('role', 'volunteer')
      .single();

    if (volunteerError || !volunteer) {
      return ApiErrors.notFound('志愿者不存在');
    }

    // 获取关联的学校信息
    let school = null;
    if (volunteer.school_id) {
      const { data: schoolData } = await client
        .from('schools')
        .select('id, name, address')
        .eq('id', volunteer.school_id)
        .single();
      school = schoolData;
    }

    // 获取对接老师信息
    let assignedTeacher = null;
    if (volunteer.assigned_teacher_id) {
      const { data: teacherData } = await client
        .from('users')
        .select('id, username, name')
        .eq('id', volunteer.assigned_teacher_id)
        .single();
      assignedTeacher = teacherData;
    }

    // 获取该志愿者创建的小队
    const { data: volunteerTeams, count: volunteerTeamCount } = await client
      .from('teams')
      .select('id, code, name, points, status, current_theme_id, created_at, created_by, teacher_id, school_id', { count: 'exact' })
      .or(`created_by.eq.${id},assigned_volunteer_id.eq.${id}`)
      .order('created_at', { ascending: false });

    let teams = volunteerTeams || [];

    // 获取每个小队当前主题名称
    const themeIds = teams.map(t => t.current_theme_id).filter(Boolean);
    if (themeIds.length > 0) {
      const { data: themes } = await client
        .from('task_themes')
        .select('id, name')
        .in('id', themeIds);
      
      const themeMap = new Map((themes || []).map(t => [t.id, t.name]));
      teams = teams.map(t => ({
        ...t,
        themeName: t.current_theme_id ? themeMap.get(t.current_theme_id) : null,
        createdByVolunteer: true,
      }));
    } else {
      teams = teams.map(t => ({
        ...t,
        themeName: null,
        createdByVolunteer: true,
      }));
    }

    // 获取志愿者审核的产出数量
    const { count: reviewedCount } = await client
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('reviewer_id', id);

    // 获取待审核的产出数量（该志愿者创建的小队的待审核产出）
    const teamIds = teams.map(t => t.id);
    let pendingCount = 0;
    if (teamIds.length > 0) {
      const { count } = await client
        .from('task_submissions')
        .select('*', { count: 'exact', head: true })
        .in('team_id', teamIds)
        .eq('status', 'pending');
      pendingCount = count || 0;
    }

    return NextResponse.json({
      volunteer: {
        ...volunteer,
        school,
        assignedTeacher,
      },
      teams,
      stats: {
        teamCount: volunteerTeamCount || 0,
        reviewedCount: reviewedCount || 0,
        pendingCount: pendingCount,
      },
    });
  } catch (error) {
    console.error('获取志愿者详情错误:', error);
    return ApiErrors.validation('获取志愿者详情失败');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const updateData: Record<string, any> = {};
    if (body.name) updateData.name = body.name;
    if (body.schoolId !== undefined) {
      updateData.school_id = body.schoolId || null;
    }
    if (body.password) {
      updateData.password = hashPassword(body.password);
    }
    // 支持对接老师字段
    if (body.assignedTeacherId !== undefined) {
      updateData.assigned_teacher_id = body.assignedTeacherId || null;
    }

    const { data: volunteer, error } = await client
      .from('users')
      .update(updateData)
      .eq('id', id)
      .eq('role', 'volunteer')
      .select()
      .single();

    if (error) {
      console.error('更新志愿者错误:', error);
      return supabaseErrorResponse(error, '更新志愿者失败');
    }

    return NextResponse.json({ success: true, volunteer });
  } catch (error) {
    console.error('更新志愿者错误:', error);
    return ApiErrors.validation('更新志愿者失败');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('users')
      .delete()
      .eq('id', id)
      .eq('role', 'volunteer');

    if (error) {
      return supabaseErrorResponse(error, '删除志愿者失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除志愿者错误:', error);
    return ApiErrors.validation('删除志愿者失败');
  }
}
