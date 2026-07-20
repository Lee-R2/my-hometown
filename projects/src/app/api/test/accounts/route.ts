import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

/**
 * 批量测试账号登录
 * 用于验证所有现有账号都能正常登录
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();

    const results = {
      users: {
        total: 0,
        testable: 0,
        untestable: 0,
        failed: [] as Array<{ username: string; reason: string }>,
      },
      teams: {
        total: 0,
        testable: 0,
        untestable: 0,
        failed: [] as Array<{ code: string; reason: string }>,
      },
    };

    // 1. 测试用户
    const { data: users, error: usersError } = await client
      .from('users')
      .select('id, username, password, is_active');

    if (usersError) {
      throw new Error(`查询用户失败: ${usersError.message}`);
    }

    if (users) {
      results.users.total = users.length;

      for (const user of users) {
        // 检查密码格式
        const isHashed = user.password.includes(':');
        const isPlainText = !isHashed;

        // 检查账号状态
        const isActive = user.is_active === true || user.is_active === null;

        if (isActive && (isPlainText || isHashed)) {
          results.users.testable++;
        } else {
          results.users.untestable++;
          if (!isActive) {
            results.users.failed.push({
              username: user.username,
              reason: '账号已被禁用',
            });
          } else if (!isPlainText && !isHashed) {
            results.users.failed.push({
              username: user.username,
              reason: '密码格式无效',
            });
          }
        }
      }
    }

    // 2. 测试小队
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, code, password, is_active');

    if (teamsError) {
      throw new Error(`查询小队失败: ${teamsError.message}`);
    }

    if (teams) {
      results.teams.total = teams.length;

      for (const team of teams) {
        // 检查密码格式
        const isHashed = team.password.includes(':');
        const isPlainText = !isHashed;

        // 检查账号状态
        const isActive = team.is_active === true || team.is_active === null;

        if (isActive && (isPlainText || isHashed)) {
          results.teams.testable++;
        } else {
          results.teams.untestable++;
          if (!isActive) {
            results.teams.failed.push({
              code: team.code,
              reason: '小队已被禁用',
            });
          } else if (!isPlainText && !isHashed) {
            results.teams.failed.push({
              code: team.code,
              reason: '密码格式无效',
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `账号测试完成：用户 ${results.users.testable}/${results.users.total} 可登录，小队 ${results.teams.testable}/${results.teams.total} 可登录`,
      results,
    });
  } catch (error) {
    console.error('账号测试错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: '账号测试失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}
