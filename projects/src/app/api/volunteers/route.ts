import { requireAnyAuth, requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const available = searchParams.get('available');
    const schoolIdParam = searchParams.get('schoolId');
    const search = searchParams.get('search'); // 搜索关键词（姓名、手机号）

    // 身份从认证令牌获取，防止客户端伪造 teacherId/schoolId 越权查看
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;
    const authSchoolId = auth.payload!.schoolId;

    const client = getSupabaseAdminClient();

    let query = client
      .from('users')
      .select('id, username, name, school_id, assigned_teacher_id, created_at')
      .eq('role', 'volunteer');

    // 根据角色强制筛选（不信任客户端传入的 teacherId/schoolId）
    if (userRole === 'teacher') {
      // 助学老师只能看到自己对接的志愿者
      query = query.eq('assigned_teacher_id', userId);
    } else if (userRole === 'volunteer') {
      // 志愿者只能看到自己
      query = query.eq('id', userId);
    } else if (userRole === 'team' || userRole === 'parent') {
      // 小队/家长无权浏览志愿者列表
      return NextResponse.json({ success: true, volunteers: [], currentSchoolVolunteers: [] });
    } else if (schoolIdParam && schoolIdParam !== 'all') {
      // 超级管理员/管理员按学校筛选
      query = query.eq('school_id', schoolIdParam);
    }

    // 如果只获取可分配的志愿者（未分配学校的）
    if (available === 'true') {
      query = query.is('school_id', null);
    }

    // 如果有搜索关键词，按姓名或手机号搜索
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`);
    }

    query = query.order('created_at', { ascending: false });

    const { data: volunteers, error } = await query;

    if (error) {
      console.error('获取志愿者列表失败:', error);
      return supabaseErrorResponse(error, '获取志愿者列表失败');
    }

    // 获取学校信息
    const schoolIds = [...new Set((volunteers || []).map(v => v.school_id).filter(Boolean))];
    let schoolsMap: Record<string, { id: string; name: string }> = {};
    if (schoolIds.length > 0) {
      const { data: schools } = await client
        .from('schools')
        .select('id, name')
        .in('id', schoolIds);
      (schools || []).forEach(s => {
        schoolsMap[s.id] = s;
      });
    }

    // 获取对接老师信息
    const teacherIds = [...new Set((volunteers || []).map(v => v.assigned_teacher_id).filter(Boolean))];
    let teachersMap: Record<string, { id: string; username: string; name: string }> = {};
    if (teacherIds.length > 0) {
      const { data: teachers } = await client
        .from('users')
        .select('id, username, name')
        .in('id', teacherIds);
      (teachers || []).forEach(t => {
        teachersMap[t.id] = t;
      });
    }

    // 获取每个志愿者创建的小队数量
    const volunteerIds = (volunteers || []).map(v => v.id);
    let teamCountMap: Record<string, number> = {};
    if (volunteerIds.length > 0) {
      const { data: createdTeams } = await client
        .from('teams')
        .select('created_by')
        .in('created_by', volunteerIds);
      (createdTeams || []).forEach(t => {
        if (t.created_by) {
          teamCountMap[t.created_by] = (teamCountMap[t.created_by] || 0) + 1;
        }
      });
      const { data: assignedTeams } = await client
        .from('teams')
        .select('assigned_volunteer_id')
        .in('assigned_volunteer_id', volunteerIds);
      (assignedTeams || []).forEach(t => {
        if (t.assigned_volunteer_id) {
          teamCountMap[t.assigned_volunteer_id] = (teamCountMap[t.assigned_volunteer_id] || 0) + 1;
        }
      });
    }

    // 组装完整数据
    const volunteersWithDetails = (volunteers || []).map(v => ({
      ...v,
      school: v.school_id ? schoolsMap[v.school_id] : null,
      assignedTeacher: v.assigned_teacher_id ? teachersMap[v.assigned_teacher_id] : null,
      teamCount: teamCountMap[v.id] || 0,
    }));

    // 如果指定了学校ID，获取该学校的志愿者数（teacher 用自身学校，admin 用查询参数）
    const effectiveSchoolId = userRole === 'teacher' ? authSchoolId : schoolIdParam;
    let currentSchoolVolunteers: Array<{id: string; username: string; name: string}> = [];
    if (effectiveSchoolId && effectiveSchoolId !== 'all') {
      const { data: schoolVolunteers } = await client
        .from('users')
        .select('id, username, name')
        .eq('school_id', effectiveSchoolId)
        .eq('role', 'volunteer');
      currentSchoolVolunteers = schoolVolunteers || [];
    }

    return NextResponse.json({
      success: true,
      volunteers: volunteersWithDetails,
      currentSchoolVolunteers,
    });
  } catch (error) {
    console.error('获取志愿者列表错误:', error);
    return ApiErrors.validation('获取志愿者列表失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const { username, name } = body;

    // 身份从认证令牌获取，teacher 只能创建本校志愿者
    const userRole = auth.payload!.role;
    const authSchoolId = auth.payload!.schoolId;
    const schoolId = userRole === 'teacher' ? authSchoolId : (body.schoolId || null);

    if (!username) {
      return ApiErrors.validation('手机号不能为空');
    }

    // 检查用户名是否已存在
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return ApiErrors.conflict('该手机号已被使用');
    }

    // 创建志愿者账号
    const { data: user, error } = await client
      .from('users')
      .insert({
        username,
        password: hashPassword('123456'),
        name: name || username,
        role: 'volunteer',
        school_id: schoolId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('创建志愿者失败:', error);
      return supabaseErrorResponse(error, '创建志愿者失败');
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('创建志愿者错误:', error);
    return ApiErrors.validation('创建志愿者失败');
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { volunteers } = body;
    const client = getSupabaseAdminClient();

    if (!volunteers || !Array.isArray(volunteers) || volunteers.length === 0) {
      return ApiErrors.validation('请提供有效的导入数据');
    }

    // 身份从认证令牌获取，teacher 只能导入本校志愿者
    const userRole = auth.payload!.role;
    const authSchoolId = auth.payload!.schoolId;

    // 获取所有学校，用于匹配学校名称（仅 admin 需要按名称匹配）
    const schoolMap = new Map<string, string>();
    if (userRole !== 'teacher') {
      const { data: schools } = await client
        .from('schools')
        .select('id, name');
      (schools || []).forEach(s => schoolMap.set(s.name, s.id));
    }

    const results = {
      success: [] as Array<{ username: string; name: string }>,
      errors: [] as Array<{ username: string; error: string }>,
    };

    for (const volunteer of volunteers) {
      const { username, password, name, schoolName } = volunteer;

      if (!username || !name) {
        results.errors.push({ username: username || '未知', error: '缺少必填字段' });
        continue;
      }

      // 检查用户名是否已存在
      const { data: existingUser } = await client
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        results.errors.push({ username, error: '该手机号已被使用' });
        continue;
      }

      // 匹配学校ID：teacher 强制使用自身学校，admin 按名称匹配
      let schoolId = null;
      if (userRole === 'teacher') {
        schoolId = authSchoolId || null;
      } else if (schoolName && schoolMap.has(schoolName)) {
        schoolId = schoolMap.get(schoolName);
      }

      // 创建志愿者
      const { error } = await client
        .from('users')
        .insert({
          username,
          password: hashPassword(password || '123456'),
          name,
          role: 'volunteer',
          school_id: schoolId,
        });

      if (error) {
        results.errors.push({ username, error: '创建失败' });
      } else {
        results.success.push({ username, name });
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${results.success.length} 名志愿者，失败 ${results.errors.length} 名`,
      results,
    });
  } catch (error) {
    console.error('批量导入志愿者错误:', error);
    return ApiErrors.validation('批量导入志愿者失败');
  }
}
