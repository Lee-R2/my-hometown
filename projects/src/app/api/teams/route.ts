import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

/**
 * 获取当前学期信息
 * 春季学期：1-6月，学期码为1
 * 秋季学期：7-12月，学期码为2
 */
function getCurrentSemester(): { year: number; semester: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() 返回 0-11
  const semester = month >= 1 && month <= 6 ? 1 : 2;
  return { year, semester };
}

/**
 * 批量生成小队编码（全局唯一）
 * 格式：年份（4位）+ 学期（1位）+ 顺序码（3位）
 * 例如：20261001 表示2026年春季学期第1个小队
 * 
 * 编码规则：在系统中查询当前学期的最大顺序码，然后+1生成新编码
 */
async function generateTeamCodes(client: any, count: number): Promise<string[]> {
  const { year, semester } = getCurrentSemester();
  
  // 构建编码前缀：年份 + 学期
  const prefix = `${year}${semester}`;
  
  // 查询当前学期系统中已有小队的最大顺序码（全局查询，不按学校筛选）
  const { data: existingTeams, error } = await client
    .from('teams')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1);
  
  let startSequence = 1;
  
  if (!error && existingTeams && existingTeams.length > 0) {
    // 提取最大顺序码并加1
    const lastCode = existingTeams[0].code;
    // 编码格式：年份(4位) + 学期(1位) + 顺序码(3位)
    const lastSequence = parseInt(lastCode.slice(-3), 10);
    if (!isNaN(lastSequence)) {
      startSequence = lastSequence + 1;
    }
  }
  
  // 批量生成编码
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const sequenceStr = (startSequence + i).toString().padStart(3, '0');
    codes.push(`${prefix}${sequenceStr}`);
  }
  
  return codes;
}


export async function GET(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    // 身份从认证令牌获取，防止客户端伪造角色查看越权数据
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;
    const schoolId = searchParams.get('schoolId');
    const keyword = searchParams.get('keyword');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = client
      .from('teams')
      .select(`
        id,
        code,
        name,
        points,
        status,
        school_id,
        teacher_id,
        assigned_volunteer_id,
        created_by,
        created_at,
        updated_at,
        grade,
        current_theme_id,
        slogan,
        is_active,
        cycle
      `)
      .order('created_at', { ascending: false });

    // 根据角色筛选小队（身份从令牌获取，不信任客户端传入）
    if (userRole === 'volunteer') {
      // 志愿者只能看到自己负责的小队（assigned_volunteer_id）或自己创建的小队
      query = query.or(`created_by.eq.${userId},assigned_volunteer_id.eq.${userId}`);
    } else if (userRole === 'teacher') {
      // 助学老师只能看到自己对接的小队（teacher_id = 自己的ID）
      query = query.eq('teacher_id', userId);
    } else if (userRole === 'team') {
      // 小队只能看到自己
      query = query.eq('id', userId);
    } else if (userRole === 'parent') {
      // 家长暂无权直接浏览小队列表
      query = query.eq('id', '__none__');
    } else if (schoolId) {
      // 超级管理员/管理员按学校筛选
      query = query.eq('school_id', schoolId);
    }

    // 关键词搜索（编码或名称）
    if (keyword) {
      query = query.or(`code.ilike.%${keyword}%,name.ilike.%${keyword}%`);
    }

    // 创建时间范围筛选
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      // 结束日期包含当天，所以加一天
      const endDateTime = new Date(endDate);
      endDateTime.setDate(endDateTime.getDate() + 1);
      query = query.lt('created_at', endDateTime.toISOString());
    }

    const { data: teams, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取小队列表失败');
    }

    // 获取学校信息
    const schoolIds = [...new Set((teams || []).map(t => t.school_id).filter(Boolean))];
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

    // 获取主题信息
    const themeIds = [...new Set((teams || []).map(t => t.current_theme_id).filter(Boolean))];
    let themesMap: Record<string, { id: string; name: string; icon: string }> = {};
    
    if (themeIds.length > 0) {
      const { data: themes } = await client
        .from('task_themes')
        .select('id, name, icon')
        .in('id', themeIds);
      
      (themes || []).forEach(t => {
        themesMap[t.id] = t;
      });
    }

    // 组装数据
    const teamsWithSchool = (teams || []).map(team => ({
      ...team,
      school: team.school_id ? schoolsMap[team.school_id] || null : null,
      theme: team.current_theme_id ? themesMap[team.current_theme_id] || null : null,
    }));

    return NextResponse.json({ teams: teamsWithSchool });
  } catch (error) {
    console.error('获取小队列表错误:', error);
    return ApiErrors.validation('获取小队列表失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseClient();

    // 身份从认证令牌获取，防止客户端伪造归属
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;

    // 支持批量创建：如果传入了 count 参数，则批量创建
    const createCount = body.count && body.count > 1 ? Math.min(body.count, 99) : 1;

    // 准备小队数据基础信息
    const baseTeamData: Record<string, any> = {
      password: body.password ? hashPassword(body.password) : null,
      name: body.name || null,
      school_id: body.schoolId || null,
      teacher_id: body.teacherId || null,
      created_by: userId, // 创建者始终记录为当前操作者
    };

    // 志愿者创建小队：归属必须是自己；管理员可指定任意志愿者
    let volunteerId: string | null = null;
    if (userRole === 'volunteer') {
      volunteerId = userId;
      baseTeamData.assigned_volunteer_id = userId;
    } else if (userRole === 'super_admin' || userRole === 'admin') {
      // 管理员可指定志愿者，未指定则不归属
      volunteerId = body.assignedVolunteerId || null;
      if (volunteerId) {
        baseTeamData.assigned_volunteer_id = volunteerId;
      }
    }

    // 如果指定了志愿者，查询其信息
    if (volunteerId) {
      const { data: creator } = await client
        .from('users')
        .select('id, role, assigned_teacher_id, school_id')
        .eq('id', volunteerId)
        .single();

      if (creator) {
        if (creator.role === 'volunteer') {
          if (creator.school_id) {
            baseTeamData.school_id = creator.school_id;
          }
          if (creator.assigned_teacher_id && !baseTeamData.teacher_id) {
            baseTeamData.teacher_id = creator.assigned_teacher_id;
          }
        }
      }
    }

    // 校验：必须有学校ID
    if (!baseTeamData.school_id) {
      return ApiErrors.validation('创建小队失败：缺少学校信息');
    }

    // 批量生成小队编码（全局唯一）
    const codes = await generateTeamCodes(client, createCount);
    
    // 批量创建小队数据
    const teamsToInsert = codes.map(code => ({
      ...baseTeamData,
      code,
    }));

    // 批量插入
    const { data: teams, error } = await client
      .from('teams')
      .insert(teamsToInsert)
      .select();

    if (error) {
      return supabaseErrorResponse(error, '创建小队失败');
    }

    // 返回结果（剥离 password 字段，防止密码哈希泄露）
    const sanitizeTeam = (t: any) => {
      if (!t) return t;
      const { password: _pw, ...rest } = t;
      return rest;
    };

    if (createCount === 1) {
      return NextResponse.json({ success: true, team: sanitizeTeam(teams[0]) });
    } else {
      return NextResponse.json({
        success: true,
        teams: (teams || []).map(sanitizeTeam),
        count: teams.length,
        message: `成功创建 ${teams.length} 个小队`
      });
    }
  } catch (error) {
    console.error('创建小队错误:', error);
    return ApiErrors.validation('创建小队失败');
  }
}
