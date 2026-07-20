import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 用户查询测试 API
 * 用于测试用户查询逻辑
 * SEC-004: 生产环境禁用,仅开发环境可用
 */

export async function POST(request: NextRequest) {
  // SEC-004: 测试接口不应在生产环境暴露,即使有 requireAdmin 保护
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { username } = await request.json();

    if (!username) {
      return ApiErrors.validation('请提供用户名');
    }

    const client = getSupabaseAdminClient();

    // 测试1：直接查询所有用户
    const { data: allUsers, error: allUsersError } = await client
      .from('users')
      .select('id, username, name, role, is_active');

    // 测试2：查询指定用户名（不返回 password 字段）
    const { data: user, error: userError } = await client
      .from('users')
      .select('id, username, name, role, school_id, is_active, created_at')
      .eq('username', username)
      .single();

    // 测试3：使用 ILIKE 查询（不区分大小写，不返回 password 字段）
    const { data: userILike, error: userILikeError } = await client
      .from('users')
      .select('id, username, name, role, school_id, is_active, created_at')
      .ilike('username', username)
      .single();

    return NextResponse.json({
      success: true,
      query: {
        username,
      },
      results: {
        allUsers: {
          count: allUsers?.length || 0,
          error: allUsersError?.message || null,
          data: allUsers || [],
        },
        exactMatch: {
          found: !!user,
          error: userError?.message || null,
          data: user || null,
        },
        ilikeMatch: {
          found: !!userILike,
          error: userILikeError?.message || null,
          data: userILike || null,
        },
      },
    });
  } catch (error) {
    console.error('查询测试错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: '查询测试失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}
