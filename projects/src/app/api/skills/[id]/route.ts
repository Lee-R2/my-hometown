import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';
import { requireAdminOrVolunteer, requireAdmin, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

// 获取学校列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    
    const province = searchParams.get('province');
    const city = searchParams.get('city');
    const county = searchParams.get('county');
    const keyword = searchParams.get('keyword');
    const volunteerId = searchParams.get('volunteerId'); // 志愿者筛选
    const schoolId = searchParams.get('schoolId'); // 直接按学校ID筛选

    // 如果是志愿者筛选，先获取志愿者的学校信息
    if (volunteerId && !schoolId) {
      const { data: volunteer } = await client
        .from('users')
        .select('school_id')
        .eq('id', volunteerId)
        .single();
      
      if (volunteer?.school_id) {
        // 使用志愿者的学校ID进行筛选
        const schoolRes = await client
          .from('schools')
          .select('*')
          .eq('id', volunteer.school_id)
          .single();
        
        if (schoolRes.data) {
          // 获取学校统计信息
          const { count: teamCount } = await client
            .from('teams')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', schoolRes.data.id);

          const { count: adminCount } = await client
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', schoolRes.data.id)
            .in('role', ['teacher', 'admin']);

          return NextResponse.json({
            success: true,
            schools: [{
              ...schoolRes.data,
              teamCount: teamCount || 0,
              adminCount: adminCount || 0,
            }],
          });
        }
      }
      
      // 志愿者没有分配学校
      return NextResponse.json({
        success: true,
        schools: [],
      });
    }

    let query = client
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false });

    // 直接按学校ID筛选
    if (schoolId) {
      query = query.eq('id', schoolId);
    }

    // 按省筛选
    if (province && province !== 'all') {
      query = query.eq('province', province);
    }

    // 按市筛选
    if (city && city !== 'all') {
      query = query.eq('city', city);
    }

    // 按县筛选
    if (county && county !== 'all') {
      query = query.eq('county', county);
    }

    // 关键词搜索
    if (keyword && keyword.trim()) {
      query = query.or(`name.ilike.%${keyword.trim()}%,address.ilike.%${keyword.trim()}%`);
    }

    const { data: schools, error } = await query;

    if (error) {
      console.error('获取学校列表失败:', error);
      return ApiErrors.validation('获取学校列表失败');
    }

    // 获取每个学校的小队数量和管理员数量
    const schoolsWithStats = await Promise.all(
      (schools || []).map(async (school) => {
        const { count: teamCount } = await client
          .from('teams')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', school.id);

        const { count: adminCount } = await client
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', school.id)
          .in('role', ['teacher', 'admin']);

        return {
          ...school,
          teamCount: teamCount || 0,
          adminCount: adminCount || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      schools: schoolsWithStats,
    });
  } catch (error) {
    console.error('获取学校列表错误:', error);
    return ApiErrors.validation('获取学校列表失败');
  }
}

// 创建学校
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const { name, address, teacherName, teacherPhone, province, city, county } = body;

    if (!name) {
      return ApiErrors.validation('学校名称不能为空');
    }

    if (!teacherPhone) {
      return ApiErrors.validation('老师手机号不能为空');
    }

    // 检查手机号是否已被使用
    const { data: existingUser } = await client
      .from('users')
      .select('id, name')
      .eq('username', teacherPhone)
      .single();

    if (existingUser) {
      return ApiErrors.conflict(`该手机号已被使用，关联用户：${existingUser.name || teacherPhone}`);
    }

    // 创建学校
    const { data: school, error: schoolError } = await client
      .from('schools')
      .insert({
        name,
        address,
        teacher_name: teacherName,
        teacher_phone: teacherPhone,
        province: province || null,
        city: city || null,
        county: county || null,
      })
      .select()
      .single();

    if (schoolError) {
      console.error('创建学校失败:', schoolError);
      return ApiErrors.validation('创建学校失败');
    }

    // 创建管理员账号（使用手机号作为用户名，初始密码123456）
    const { data: user, error: userError } = await client
      .from('users')
      .insert({
        username: teacherPhone,
        password: hashPassword('123456'),
        name: teacherName || teacherPhone,
        role: 'teacher',
        school_id: school.id,
      })
      .select()
      .single();

    if (userError) {
      console.error('创建管理员账号失败:', userError);
      // 回滚学校创建
      await client.from('schools').delete().eq('id', school.id);
      return ApiErrors.validation('创建管理员账号失败');
    }

    return NextResponse.json({
      success: true,
      school: {
        ...school,
        teamCount: 0,
        adminCount: 1,
      },
      admin: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('创建学校错误:', error);
    return ApiErrors.validation('创建学校失败');
  }
}
