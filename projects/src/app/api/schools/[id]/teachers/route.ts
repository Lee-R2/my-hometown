import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';
import { requireAdminOrVolunteer, requireAdmin, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取学校的老师列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();

    // 验证学校是否存在
    const { data: school, error: schoolError } = await client
      .from('schools')
      .select('id, name')
      .eq('id', id)
      .single();

    if (schoolError || !school) {
      if (schoolError) return supabaseErrorResponse(schoolError, '查询学校失败');
      return ApiErrors.notFound('学校不存在');
    }

    // 获取学校的老师列表
    const { data: teachers, error } = await client
      .from('users')
      .select('id, username, name, role, grade, class_name, created_at')
      .eq('school_id', id)
      .in('role', ['teacher', 'admin'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取老师列表失败:', error);
      return ApiErrors.validation('获取老师列表失败');
    }

    return NextResponse.json({
      success: true,
      teachers: teachers || [],
    });
  } catch (error) {
    console.error('获取老师列表错误:', error);
    return ApiErrors.validation('获取老师列表失败');
  }
}

// 为学校添加老师
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const { name, phone, grade, className, studentCount } = body;

    if (!phone) {
      return ApiErrors.validation('手机号不能为空');
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return ApiErrors.validation('请输入正确的手机号格式');
    }

    // 验证学校是否存在
    const { data: school, error: schoolError } = await client
      .from('schools')
      .select('id, name')
      .eq('id', id)
      .single();

    if (schoolError || !school) {
      if (schoolError) return supabaseErrorResponse(schoolError, '查询学校失败');
      return ApiErrors.notFound('学校不存在');
    }

    // 检查手机号是否已被使用
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('username', phone)
      .single();

    if (existingUser) {
      return ApiErrors.validation('该手机号已被使用');
    }

    // 创建老师账号
    const { data: user, error: userError } = await client
      .from('users')
      .insert({
        username: phone,
        password: hashPassword('123456'),
        name: name || phone,
        role: 'teacher',
        school_id: id,
        grade: grade || null,
        class_name: className || null,
        student_count: studentCount || null,
      })
      .select()
      .single();

    if (userError) {
      console.error('创建老师账号失败:', userError);
      return ApiErrors.validation('创建老师账号失败');
    }

    return NextResponse.json({
      success: true,
      teacher: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        grade: user.grade,
        class_name: user.class_name,
        student_count: user.student_count,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('添加老师错误:', error);
    return ApiErrors.validation('添加老师失败');
  }
}

// 编辑老师信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const { teacherId, name, phone, grade, className, studentCount } = body;

    if (!teacherId) {
      return ApiErrors.validation('老师ID不能为空');
    }

    // 验证老师是否属于该学校
    const { data: existingTeacher, error: teacherError } = await client
      .from('users')
      .select('id, username')
      .eq('id', teacherId)
      .eq('school_id', id)
      .in('role', ['teacher', 'admin'])
      .single();

    if (teacherError || !existingTeacher) {
      return ApiErrors.notFound('老师不存在或不属于该学校');
    }

    // 如果要修改手机号，检查新手机号是否已被使用
    if (phone && phone !== existingTeacher.username) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return ApiErrors.validation('请输入正确的手机号格式');
      }

      const { data: phoneUser } = await client
        .from('users')
        .select('id')
        .eq('username', phone)
        .neq('id', teacherId)
        .single();

      if (phoneUser) {
        return ApiErrors.conflict('该手机号已被使用');
      }
    }

    // 构建更新数据
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.username = phone;
    if (grade !== undefined) updateData.grade = grade || null;
    if (className !== undefined) updateData.class_name = className || null;
    if (studentCount !== undefined) updateData.student_count = studentCount || null;

    // 更新老师信息
    const { data: updatedTeacher, error: updateError } = await client
      .from('users')
      .update(updateData)
      .eq('id', teacherId)
      .select()
      .single();

    if (updateError) {
      console.error('更新老师信息失败:', updateError);
      return supabaseErrorResponse(updateError, '更新老师信息失败');
    }

    return NextResponse.json({
      success: true,
      teacher: {
        id: updatedTeacher.id,
        username: updatedTeacher.username,
        name: updatedTeacher.name,
        role: updatedTeacher.role,
        grade: updatedTeacher.grade,
        class_name: updatedTeacher.class_name,
        student_count: updatedTeacher.student_count,
      },
    });
  } catch (error) {
    console.error('编辑老师错误:', error);
    return ApiErrors.validation('编辑老师失败');
  }
}

// 删除老师
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');

    if (!teacherId) {
      return ApiErrors.validation('老师ID不能为空');
    }

    const client = getSupabaseAdminClient();

    // 验证老师是否属于该学校
    const { data: existingTeacher, error: teacherError } = await client
      .from('users')
      .select('id, role')
      .eq('id', teacherId)
      .eq('school_id', id)
      .single();

    if (teacherError || !existingTeacher) {
      if (teacherError) return supabaseErrorResponse(teacherError, '查询老师失败');
      return ApiErrors.notFound('老师不存在或不属于该学校');
    }

    // 不允许删除admin角色（学校主管理员）
    if (existingTeacher.role === 'admin' || existingTeacher.role === 'super_admin') {
      return ApiErrors.validation('不能删除学校主管理员');
    }

    // 检查老师是否有对接的志愿者
    const { data: volunteers } = await client
      .from('users')
      .select('id, name')
      .eq('assigned_teacher_id', teacherId);

    if (volunteers && volunteers.length > 0) {
      return NextResponse.json({ 
        error: `该老师还有 ${volunteers.length} 名对接志愿者，请先解除对接关系` 
      }, { status: 400 });
    }

    // 删除老师
    const { error: deleteError } = await client
      .from('users')
      .delete()
      .eq('id', teacherId);

    if (deleteError) {
      console.error('删除老师失败:', deleteError);
      return ApiErrors.validation('删除老师失败');
    }

    return NextResponse.json({
      success: true,
      message: '老师已删除',
    });
  } catch (error) {
    console.error('删除老师错误:', error);
    return ApiErrors.validation('删除老师失败');
  }
}
