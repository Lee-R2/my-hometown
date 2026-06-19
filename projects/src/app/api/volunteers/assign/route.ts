import { requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 批量分配志愿者到老师
export async function POST(request: NextRequest) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseClient();

    const { schoolId, assignments } = body;
    // assignments 格式: [{ teacherId: string, volunteerIds: string[] }]

    if (!schoolId) {
      return ApiErrors.validation('学校ID不能为空');
    }

    if (!assignments || !Array.isArray(assignments)) {
      return ApiErrors.validation('请提供分配信息');
    }

    // 验证学校是否存在
    const { data: school, error: schoolError } = await client
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (schoolError || !school) {
      return ApiErrors.notFound('学校不存在');
    }

    // 先取消该学校所有志愿者的分配，让志愿者恢复自由状态
    // 获取该学校所有老师的ID
    const { data: teachers } = await client
      .from('users')
      .select('id')
      .eq('school_id', schoolId)
      .in('role', ['teacher', 'admin']);
    
    const teacherIds = (teachers || []).map(t => t.id);
    
    // 取消这些老师名下的志愿者分配，并将志愿者设为自由状态（school_id 设为 null）
    if (teacherIds.length > 0) {
      await client
        .from('users')
        .update({ assigned_teacher_id: null, school_id: null })
        .in('assigned_teacher_id', teacherIds)
        .eq('role', 'volunteer');
    }

    // 按照新的分配关系更新
    let totalAssigned = 0;
    for (const assignment of assignments) {
      const { teacherId, volunteerIds } = assignment;
      
      if (volunteerIds && volunteerIds.length > 0) {
        const { error: updateError } = await client
          .from('users')
          .update({ 
            assigned_teacher_id: teacherId,
            school_id: schoolId 
          })
          .in('id', volunteerIds)
          .eq('role', 'volunteer');

        if (updateError) {
          console.error('分配志愿者失败:', updateError);
        } else {
          totalAssigned += volunteerIds.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功分配 ${totalAssigned} 名志愿者`,
      assignedCount: totalAssigned,
    });
  } catch (error) {
    console.error('分配志愿者错误:', error);
    return ApiErrors.validation('分配志愿者失败');
  }
}

// 获取学校老师-志愿者分配情况
export async function GET(request: NextRequest) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    
    if (!schoolId) {
      return ApiErrors.validation('学校ID不能为空');
    }
    
    const client = getSupabaseClient();

    // 获取学校的老师列表
    const { data: teachers, error: teachersError } = await client
      .from('users')
      .select('id, username, name, role')
      .eq('school_id', schoolId)
      .in('role', ['teacher', 'admin']);

    if (teachersError) {
      console.error('获取老师列表失败:', teachersError);
      return supabaseErrorResponse(teachersError, '获取老师列表失败');
    }

    // 获取老师ID列表
    const teacherIds = (teachers || []).map(t => t.id);

    // 分开查询，确保逻辑正确：
    // 1. 未分配到任何学校的志愿者 (school_id is null) - 自由状态
    const { data: freeVolunteers, error: freeError } = await client
      .from('users')
      .select('id, username, name, school_id, assigned_teacher_id')
      .eq('role', 'volunteer')
      .is('school_id', null)
      .order('created_at', { ascending: false });

    // 2. 已分配到当前学校的志愿者 (school_id = schoolId)
    const { data: schoolVolunteers, error: schoolError } = await client
      .from('users')
      .select('id, username, name, school_id, assigned_teacher_id')
      .eq('role', 'volunteer')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (freeError || schoolError) {
      console.error('获取志愿者列表失败:', freeError || schoolError);
      return supabaseErrorResponse(freeError || schoolError, '获取志愿者列表失败');
    }

    // 合并两个列表
    const availableVolunteers = [...(freeVolunteers || []), ...(schoolVolunteers || [])];

    // 为每个老师构建志愿者列表
    const teachersWithVolunteers = (teachers || []).map(teacher => {
      const assignedVolunteers = availableVolunteers.filter(
        v => v.assigned_teacher_id === teacher.id
      );
      return {
        ...teacher,
        volunteers: assignedVolunteers,
        volunteerCount: assignedVolunteers.length,
      };
    });

    // 未分配的志愿者（自由状态 + 当前学校未分配）
    const unassignedVolunteers = availableVolunteers.filter(
      v => !v.assigned_teacher_id
    );

    // 已分配到当前学校的志愿者总数
    const assignedToSchoolCount = (schoolVolunteers || []).filter(
      v => v.assigned_teacher_id
    ).length;

    // 自由状态志愿者数量
    const freeCount = (freeVolunteers || []).length;

    return NextResponse.json({
      success: true,
      teachers: teachersWithVolunteers,
      availableVolunteers: availableVolunteers,
      unassignedVolunteers,
      stats: {
        totalAvailable: availableVolunteers.length,
        freeVolunteers: freeCount,
        assignedToSchool: assignedToSchoolCount,
        unassigned: unassignedVolunteers.length,
      }
    });
  } catch (error) {
    console.error('获取分配情况错误:', error);
    return ApiErrors.validation('获取分配情况失败');
  }
}
