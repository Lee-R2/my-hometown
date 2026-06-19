import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 身份从认证令牌获取，防止客户端伪造角色查看越权数据
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;

    const client = getSupabaseClient();

    // 根据角色获取不同的统计数据
    if (userRole === 'volunteer' && userId) {
      // 授课志愿者：只显示自己指导的小队数据
      return await getVolunteerStats(client, userId);
    } else if (userRole === 'teacher' && userId) {
      // 助学老师：显示本校数据
      return await getTeacherStats(client, userId);
    } else {
      // 超级管理员：显示全部数据
      return await getAdminStats(client);
    }
  } catch (error) {
    console.error('获取统计数据错误:', error);
    return safeError(error);
  }
}

// 超级管理员统计数据
async function getAdminStats(client: any) {
  // 获取小队总数
  const { count: totalTeams, error: teamsError } = await client
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (teamsError) {
    console.error('获取小队总数失败:', teamsError);
  }

  // 获取待审核产出数
  const { count: pendingSubmissions, error: pendingError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (pendingError) {
    console.error('获取待审核产出失败:', pendingError);
  }

  // 获取已通过产出数
  const { count: approvedSubmissions, error: approvedError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');

  if (approvedError) {
    console.error('获取已通过产出失败:', approvedError);
  }

  // 获取已拒绝产出数
  const { count: rejectedSubmissions, error: rejectedError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'rejected');

  if (rejectedError) {
    console.error('获取已拒绝产出失败:', rejectedError);
  }

  // 获取学生总数（当期项目周期内所有活跃小队的成员总数）
  // 1. 获取所有活跃小队的ID
  const { data: activeTeams, error: activeTeamsError } = await client
    .from('teams')
    .select('id')
    .eq('status', 'active');

  if (activeTeamsError) {
    console.error('获取活跃小队失败:', activeTeamsError);
  }

  const activeTeamIds = (activeTeams || []).map((t: any) => t.id);
  
  // 2. 统计这些小队的成员总数
  let totalStudents = 0;
  if (activeTeamIds.length > 0) {
    const { count: memberCount, error: membersError } = await client
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .in('team_id', activeTeamIds);

    if (membersError) {
      console.error('获取学生总数失败:', membersError);
    }
    totalStudents = memberCount || 0;
  }

  // 获取志愿者总数
  const { count: totalVolunteers, error: volunteersError } = await client
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'volunteer');

  if (volunteersError) {
    console.error('获取志愿者总数失败:', volunteersError);
  }

  // 获取学校总数
  const { count: totalSchools, error: schoolsError } = await client
    .from('schools')
    .select('*', { count: 'exact', head: true });

  if (schoolsError) {
    console.error('获取学校总数失败:', schoolsError);
  }

  return NextResponse.json({
    success: true,
    stats: {
      totalTeams: totalTeams || 0,
      pendingSubmissions: pendingSubmissions || 0,
      approvedSubmissions: approvedSubmissions || 0,
      rejectedSubmissions: rejectedSubmissions || 0,
      totalStudents: totalStudents || 0,
      totalVolunteers: totalVolunteers || 0,
      totalSchools: totalSchools || 0,
    },
  });
}

// 授课志愿者统计数据
async function getVolunteerStats(client: any, volunteerId: string) {
  // 获取志愿者创建的小队
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id')
    .eq('assigned_volunteer_id', volunteerId)
    .eq('status', 'active');

  if (teamsError) {
    console.error('获取志愿者小队失败:', teamsError);
  }

  const teamIds = (teams || []).map((t: any) => t.id);
  const totalTeams = teamIds.length;

  // 如果没有小队，返回空数据
  if (totalTeams === 0) {
    return NextResponse.json({
      success: true,
      stats: {
        totalTeams: 0,
        pendingSubmissions: 0,
        approvedSubmissions: 0,
        rejectedSubmissions: 0,
        totalStudents: 0,
        totalVolunteers: 0,
        totalSchools: 0,
      },
    });
  }

  // 获取这些小队的待审核产出数
  const { count: pendingSubmissions, error: pendingError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .in('team_id', teamIds);

  if (pendingError) {
    console.error('获取待审核产出失败:', pendingError);
  }

  // 获取这些小队的已通过产出数
  const { count: approvedSubmissions, error: approvedError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .in('team_id', teamIds);

  if (approvedError) {
    console.error('获取已通过产出失败:', approvedError);
  }

  // 获取这些小队的已拒绝产出数
  const { count: rejectedSubmissions, error: rejectedError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .in('team_id', teamIds);

  if (rejectedError) {
    console.error('获取已拒绝产出失败:', rejectedError);
  }

  // 获取这些小队的成员总数（学生总数）
  const { count: totalStudents, error: membersError } = await client
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .in('team_id', teamIds);

  if (membersError) {
    console.error('获取学生总数失败:', membersError);
  }

  return NextResponse.json({
    success: true,
    stats: {
      totalTeams: totalTeams || 0,
      pendingSubmissions: pendingSubmissions || 0,
      approvedSubmissions: approvedSubmissions || 0,
      rejectedSubmissions: rejectedSubmissions || 0,
      totalStudents: totalStudents || 0,
      totalVolunteers: 0, // 志愿者不显示此数据
      totalSchools: 0, // 志愿者不显示此数据
    },
  });
}

// 助学老师统计数据
async function getTeacherStats(client: any, teacherId: string) {
  // 获取老师对接的小队（teacher_id = teacherId）
  const { data: teams, error: teamsError } = await client
    .from('teams')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active');

  if (teamsError) {
    console.error('获取老师对接的小队失败:', teamsError);
  }

  const teamIds = (teams || []).map((t: any) => t.id);
  const totalTeams = teamIds.length;

  // 如果没有对接小队，返回空数据
  if (totalTeams === 0) {
    return NextResponse.json({
      success: true,
      stats: {
        totalTeams: 0,
        pendingSubmissions: 0,
        approvedSubmissions: 0,
        rejectedSubmissions: 0,
        totalStudents: 0,
        totalVolunteers: 0,
        totalSchools: 0,
      },
    });
  }

  // 获取待审核产出数
  const { count: pendingSubmissions, error: pendingError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .in('team_id', teamIds);

  if (pendingError) {
    console.error('获取待审核产出失败:', pendingError);
  }

  // 获取已通过产出数
  const { count: approvedSubmissions, error: approvedError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .in('team_id', teamIds);

  if (approvedError) {
    console.error('获取已通过产出失败:', approvedError);
  }

  // 获取已拒绝产出数
  const { count: rejectedSubmissions, error: rejectedError } = await client
    .from('task_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .in('team_id', teamIds);

  if (rejectedError) {
    console.error('获取已拒绝产出失败:', rejectedError);
  }

  // 获取学生总数（小队成员）
  const { count: totalStudents, error: membersError } = await client
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .in('team_id', teamIds);

  if (membersError) {
    console.error('获取学生总数失败:', membersError);
  }

  return NextResponse.json({
    success: true,
    stats: {
      totalTeams: totalTeams || 0,
      pendingSubmissions: pendingSubmissions || 0,
      approvedSubmissions: approvedSubmissions || 0,
      rejectedSubmissions: rejectedSubmissions || 0,
      totalStudents: totalStudents || 0,
      totalVolunteers: 0, // 助学老师不显示此数据
      totalSchools: 0, // 助学老师不显示此数据
    },
  });
}
