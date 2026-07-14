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
  // 阶段1：7 个独立查询并行（teams count + 活跃小队 id 列表合并为 1 次查询）
  const [teamsResult, pendingResult, approvedResult, rejectedResult, volunteersResult, schoolsResult] = await Promise.all([
    // 同时获取 count 和 id 列表（合并原来的 2 次查询为 1 次）
    client.from('teams').select('id', { count: 'exact' }).eq('status', 'active'),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    client.from('users').select('*', { count: 'exact', head: true }).eq('role', 'volunteer'),
    client.from('schools').select('*', { count: 'exact', head: true }),
  ]);

  if (teamsResult.error) console.error('获取小队总数失败:', teamsResult.error);
  if (pendingResult.error) console.error('获取待审核产出失败:', pendingResult.error);
  if (approvedResult.error) console.error('获取已通过产出失败:', approvedResult.error);
  if (rejectedResult.error) console.error('获取已拒绝产出失败:', rejectedResult.error);
  if (volunteersResult.error) console.error('获取志愿者总数失败:', volunteersResult.error);
  if (schoolsResult.error) console.error('获取学校总数失败:', schoolsResult.error);

  const activeTeamIds = (teamsResult.data || []).map((t: any) => t.id);

  // 阶段2：成员总数查询（依赖阶段1的 activeTeamIds）
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

  return NextResponse.json({
    success: true,
    stats: {
      totalTeams: teamsResult.count || 0,
      pendingSubmissions: pendingResult.count || 0,
      approvedSubmissions: approvedResult.count || 0,
      rejectedSubmissions: rejectedResult.count || 0,
      totalStudents: totalStudents || 0,
      totalVolunteers: volunteersResult.count || 0,
      totalSchools: schoolsResult.count || 0,
    },
  });
}

// 授课志愿者统计数据
async function getVolunteerStats(client: any, volunteerId: string) {
  // 阶段1：获取志愿者创建的小队
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

  // 阶段2：4 个独立查询并行
  const [pendingResult, approvedResult, rejectedResult, membersResult] = await Promise.all([
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending').in('team_id', teamIds),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved').in('team_id', teamIds),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'rejected').in('team_id', teamIds),
    client.from('team_members').select('*', { count: 'exact', head: true }).in('team_id', teamIds),
  ]);

  if (pendingResult.error) console.error('获取待审核产出失败:', pendingResult.error);
  if (approvedResult.error) console.error('获取已通过产出失败:', approvedResult.error);
  if (rejectedResult.error) console.error('获取已拒绝产出失败:', rejectedResult.error);
  if (membersResult.error) console.error('获取学生总数失败:', membersResult.error);

  return NextResponse.json({
    success: true,
    stats: {
      totalTeams: totalTeams || 0,
      pendingSubmissions: pendingResult.count || 0,
      approvedSubmissions: approvedResult.count || 0,
      rejectedSubmissions: rejectedResult.count || 0,
      totalStudents: membersResult.count || 0,
      totalVolunteers: 0,
      totalSchools: 0,
    },
  });
}

// 助学老师统计数据
async function getTeacherStats(client: any, teacherId: string) {
  // 阶段1：获取老师对接的小队（teacher_id = teacherId）
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

  // 阶段2：4 个独立查询并行
  const [pendingResult, approvedResult, rejectedResult, membersResult] = await Promise.all([
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending').in('team_id', teamIds),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved').in('team_id', teamIds),
    client.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'rejected').in('team_id', teamIds),
    client.from('team_members').select('*', { count: 'exact', head: true }).in('team_id', teamIds),
  ]);

  if (pendingResult.error) console.error('获取待审核产出失败:', pendingResult.error);
  if (approvedResult.error) console.error('获取已通过产出失败:', approvedResult.error);
  if (rejectedResult.error) console.error('获取已拒绝产出失败:', rejectedResult.error);
  if (membersResult.error) console.error('获取学生总数失败:', membersResult.error);

  return NextResponse.json({
    success: true,
    stats: {
      totalTeams: totalTeams || 0,
      pendingSubmissions: pendingResult.count || 0,
      approvedSubmissions: approvedResult.count || 0,
      rejectedSubmissions: rejectedResult.count || 0,
      totalStudents: membersResult.count || 0,
      totalVolunteers: 0,
      totalSchools: 0,
    },
  });
}
