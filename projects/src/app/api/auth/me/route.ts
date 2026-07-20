import { NextRequest, NextResponse } from 'next/server';
import { requireAnyAuth, authError } from '@/lib/api-auth';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * /api/auth/me
 * 通过 HttpOnly Cookie 中的 session token 获取当前用户信息
 * 前端启动时调用此接口，不再依赖 localStorage 存储敏感数据
 * LE-A06 修复: 改用 requireAnyAuth(含 verifySession 数据库校验),并修正表名 parent_follows → parent_team_follows
 */
export async function GET(request: NextRequest) {
  // LE-A06: 使用 requireAnyAuth 统一鉴权(含 verifySession is_active 检查),
  // 同时支持 Authorization header 和 Cookie 两种 token 提取方式
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { userId, role, schoolId } = auth.payload!;
    const client = getSupabaseAdminClient();

    // 根据角色获取用户信息
    if (role === 'team') {
      // 小队身份
      const { data: team, error } = await client
        .from('teams')
        .select('id, code, name, points, school_id, status')
        .eq('id', userId)
        .single();

      if (error || !team) {
        if (error) return ApiErrors.validation('查询小队失败');
        return ApiErrors.unauthorized('小队不存在');
      }

      return NextResponse.json({
        authenticated: true,
        role: 'team',
        user: {
          id: team.id,
          code: team.code,
          name: team.name,
          points: team.points,
          school_id: team.school_id,
        },
      });
    }

    if (role === 'parent') {
      // 家长身份
      const { data: parent, error } = await client
        .from('parents')
        .select('id, name, phone')
        .eq('id', userId)
        .single();

      if (error || !parent) {
        return NextResponse.json(
          { authenticated: false, error: '家长账号不存在' },
          { status: 401 }
        );
      }

      // 获取家长关注的列表
      // LE-A06: 表名从 parent_follows 改为 parent_team_follows(与其他路由一致)
      const { data: follows } = await client
        .from('parent_team_follows')
        .select('team_id, team:teams(id, name, code)')
        .eq('parent_id', userId);

      return NextResponse.json({
        authenticated: true,
        role: 'parent',
        user: {
          id: parent.id,
          name: parent.name,
        },
        follows: follows || [],
      });
    }

    // 管理端用户（super_admin / admin / volunteer / teacher）
    const { data: user, error } = await client
      .from('users')
      .select('id, username, name, role, school_id, is_active')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { authenticated: false, error: '用户不存在' },
        { status: 401 }
      );
    }

    if (user.is_active === false) {
      return NextResponse.json(
        { authenticated: false, error: '账号已被禁用' },
        { status: 403 }
      );
    }

    // 获取学校名称（如果有）
    let schoolName: string | null = null;
    if (user.school_id) {
      const { data: school } = await client
        .from('schools')
        .select('name')
        .eq('id', user.school_id)
        .single();
      schoolName = school?.name || null;
    }

    return NextResponse.json({
      authenticated: true,
      role: user.role,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        school_id: user.school_id,
        school_name: schoolName,
      },
    });
  } catch (error) {
    console.error('[/api/auth/me] 错误:', error);
    return ApiErrors.validation('获取用户信息失败');
  }
}
