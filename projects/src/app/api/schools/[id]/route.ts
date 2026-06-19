import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';
import { requireAdminOrVolunteer, requireAdmin, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();

    // 获取学校信息
    const { data: school, error: schoolError } = await client
      .from('schools')
      .select('*')
      .eq('id', id)
      .single();

    if (schoolError || !school) {
      if (schoolError) return supabaseErrorResponse(schoolError, '查询学校失败');
      return ApiErrors.notFound('学校不存在');
    }

    // 获取学校的管理员/老师
    const { data: admins, error: adminsError } = await client
      .from('users')
      .select('id, username, name, role, grade, class_name, student_count, created_at')
      .eq('school_id', id)
      .in('role', ['teacher', 'admin']);

    // 获取学校的志愿者
    const { data: volunteers, error: volunteersError } = await client
      .from('users')
      .select('id, username, name, role, assigned_teacher_id, created_at')
      .eq('school_id', id)
      .eq('role', 'volunteer');

    // 获取学校的小队，包含关联的老师信息
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, code, name, points, status, current_theme_id, grade, teacher_id, created_by, created_at')
      .eq('school_id', id)
      .order('created_at', { ascending: false });

    // 获取小队ID列表
    const teamIds = (teams || []).map(t => t.id);
    const teamMap = new Map((teams || []).map(t => [t.id, t]));

    // 获取本小学小队选择的执行中的主题
    // 执行主题：小队当前选择的主题（current_theme_id）
    let executingThemes: Array<{
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      is_active: boolean;
      school_id: string | null;
      selection_count: number;
    }> = [];
    
    // 主题ID到主题信息的映射
    let themesMap: Record<string, { id: string; name: string; icon: string | null }> = {};
    
    if (teamIds.length > 0) {
      // 获取所有小队当前选择的主题ID
      const currentThemeIds = (teams || [])
        .map(t => t.current_theme_id)
        .filter(Boolean);
      
      if (currentThemeIds.length > 0) {
        // 获取主题详情
        const { data: themesData, error: themesError } = await client
          .from('task_themes')
          .select('id, name, description, icon, is_active, school_id')
          .in('id', currentThemeIds);

        if (themesData) {
          // 构建主题映射
          themesData.forEach(theme => {
            themesMap[theme.id] = {
              id: theme.id,
              name: theme.name,
              icon: theme.icon,
            };
          });

          // 统计每个主题被选择次数
          const themeCountMap = new Map<string, number>();
          currentThemeIds.forEach((themeId: string) => {
            themeCountMap.set(themeId, (themeCountMap.get(themeId) || 0) + 1);
          });

          executingThemes = themesData.map(theme => ({
            id: theme.id,
            name: theme.name,
            description: theme.description,
            icon: theme.icon,
            is_active: theme.is_active,
            school_id: theme.school_id,
            selection_count: themeCountMap.get(theme.id) || 0,
          })).sort((a, b) => b.selection_count - a.selection_count); // 按被选择次数降序
        }
      }
    }

    // 构建老师-志愿者连接关系
    const adminsWithVolunteers = (admins || []).map(admin => {
      const assignedVolunteers = (volunteers || []).filter(
        v => v.assigned_teacher_id === admin.id
      );
      return {
        ...admin,
        volunteers: assignedVolunteers.map(v => ({
          id: v.id,
          username: v.username,
          name: v.name,
        })),
        volunteerCount: assignedVolunteers.length,
      };
    });

    // 为小队添加老师信息、创建者信息和主题信息
    const teamsWithTeacher = (teams || []).map(team => {
      const teacher = team.teacher_id 
        ? (admins || []).find(a => a.id === team.teacher_id)
        : null;
      
      // 找到创建小队的志愿者
      const creator = team.created_by
        ? (volunteers || []).find(v => v.id === team.created_by)
        : null;
      
      // 获取小队选择的主题信息
      const theme = team.current_theme_id 
        ? themesMap[team.current_theme_id] || null
        : null;
      
      return {
        ...team,
        teacher: teacher ? {
          id: teacher.id,
          name: teacher.name,
          username: teacher.username,
          grade: teacher.grade,
          class_name: teacher.class_name,
        } : null,
        creator: creator ? {
          id: creator.id,
          name: creator.name,
          username: creator.username,
        } : null,
        theme: theme ? {
          id: theme.id,
          name: theme.name,
          icon: theme.icon,
        } : null,
      };
    });

    return NextResponse.json({
      school,
      admins: adminsWithVolunteers,
      volunteers: volunteers || [],
      teams: teamsWithTeacher,
      themes: executingThemes,
      stats: {
        adminCount: admins?.length || 0,
        volunteerCount: volunteers?.length || 0,
        teamCount: teams?.length || 0,
        themeCount: executingThemes.length || 0,
      },
    });
  } catch (error) {
    console.error('获取学校详情错误:', error);
    return ApiErrors.validation('获取学校详情失败');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const { name, address, teacherName, teacherPhone, province, city, county } = body;

    if (!name) {
      return ApiErrors.validation('学校名称不能为空');
    }

    // 获取原学校信息
    const { data: oldSchool } = await client
      .from('schools')
      .select('*')
      .eq('id', id)
      .single();

    // 如果手机号变更，检查新手机号是否已被使用
    if (teacherPhone && teacherPhone !== oldSchool?.teacher_phone) {
      const { data: existingUser } = await client
        .from('users')
        .select('id')
        .eq('username', teacherPhone)
        .neq('school_id', id)
        .single();

      if (existingUser) {
        return ApiErrors.validation('该手机号已被其他学校使用');
      }
    }

    // 更新学校信息
    const { data: school, error } = await client
      .from('schools')
      .update({
        name,
        address,
        teacher_name: teacherName,
        teacher_phone: teacherPhone,
        province: province || null,
        city: city || null,
        county: county || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新学校失败');
    }

    // 如果手机号变更，更新管理员账号
    if (teacherPhone && teacherPhone !== oldSchool?.teacher_phone) {
      // 更新或创建管理员账号
      const { data: existingAdmin } = await client
        .from('users')
        .select('id')
        .eq('school_id', id)
        .eq('role', 'teacher')
        .single();

      if (existingAdmin) {
        // 更新现有账号
        await client
          .from('users')
          .update({
            username: teacherPhone,
            name: teacherName || teacherPhone,
          })
          .eq('id', existingAdmin.id);
      } else {
        // 创建新账号
        await client
          .from('users')
          .insert({
            username: teacherPhone,
            password: hashPassword('123456'),
            name: teacherName || teacherPhone,
            role: 'teacher',
            school_id: id,
          });
      }
    } else if (teacherName && teacherName !== oldSchool?.teacher_name) {
      // 只更新老师姓名
      await client
        .from('users')
        .update({ name: teacherName })
        .eq('school_id', id)
        .eq('role', 'teacher');
    }

    return NextResponse.json({ success: true, school });
  } catch (error) {
    console.error('更新学校错误:', error);
    return ApiErrors.validation('更新学校失败');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();

    // 检查是否有关联数据
    const { count: teamCount } = await client
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', id);

    const { count: adminCount } = await client
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', id);

    if ((teamCount && teamCount > 0) || (adminCount && adminCount > 0)) {
      return NextResponse.json({ 
        error: `无法删除：该学校关联了 ${adminCount || 0} 个管理员和 ${teamCount || 0} 个小队` 
      }, { status: 400 });
    }

    const { error } = await client
      .from('schools')
      .delete()
      .eq('id', id);

    if (error) {
      return supabaseErrorResponse(error, '删除学校失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除学校错误:', error);
    return ApiErrors.validation('删除学校失败');
  }
}
