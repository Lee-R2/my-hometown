import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

/**
 * 修复账号状态 API
 * 将所有 NULL is_active 字段设置为 true
 */

export async function POST(request: NextRequest) {
  // SEC-006: 迁移接口不应在生产环境暴露,即使有 requireAdmin 保护
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();

    const results = {
      users: { total: 0, fixed: 0, errors: [] as string[] },
      teams: { total: 0, fixed: 0, errors: [] as string[] },
    };

    // 1. 修复 users
    const { data: users, error: usersError } = await client
      .from('users')
      .select('id, username, is_active');

    if (!usersError && users) {
      results.users.total = users.length;

      for (const user of users) {
        try {
          // 如果 is_active 为 NULL 或 false，则设置为 true
          if (user.is_active === null || user.is_active === false) {
            const { error: updateError } = await client
              .from('users')
              .update({ is_active: true })
              .eq('id', user.id);

            if (updateError) {
              results.users.errors.push(`${user.username}: ${updateError.message}`);
            } else {
              results.users.fixed++;
            }
          }
        } catch (error) {
          results.users.errors.push(`${user.username}: 操作失败`);
        }
      }
    }

    // 2. 修复 teams
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, code, is_active');

    if (!teamsError && teams) {
      results.teams.total = teams.length;

      for (const team of teams) {
        try {
          // 如果 is_active 为 NULL 或 false，则设置为 true
          if (team.is_active === null || team.is_active === false) {
            const { error: updateError } = await client
              .from('teams')
              .update({ is_active: true })
              .eq('id', team.id);

            if (updateError) {
              results.teams.errors.push(`${team.code}: ${updateError.message}`);
            } else {
              results.teams.fixed++;
            }
          }
        } catch (error) {
          results.teams.errors.push(`${team.code}: 操作失败`);
        }
      }
    }

    const totalFixed = results.users.fixed + results.teams.fixed;
    const totalErrors = results.users.errors.length + results.teams.errors.length;

    return NextResponse.json({
      success: true,
      message: totalErrors === 0
        ? `成功修复 ${totalFixed} 个账号状态`
        : `修复完成：${totalFixed} 个成功，${totalErrors} 个失败`,
      results,
    });
  } catch (error) {
    console.error('修复账号状态错误', error);
    return NextResponse.json(
      {
        success: false,
        error: '修复失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}

/**
 * 查询账号状态
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();

    const status = {
      users: { total: 0, active: 0, inactive: 0, null: 0 },
      teams: { total: 0, active: 0, inactive: 0, null: 0 },
    };

    // 查询 users
    const { data: users } = await client
      .from('users')
      .select('is_active');

    if (users) {
      status.users.total = users.length;
      for (const user of users) {
        if (user.is_active === true) {
          status.users.active++;
        } else if (user.is_active === false) {
          status.users.inactive++;
        } else {
          status.users.null++;
        }
      }
    }

    // 查询 teams
    const { data: teams } = await client
      .from('teams')
      .select('is_active');

    if (teams) {
      status.teams.total = teams.length;
      for (const team of teams) {
        if (team.is_active === true) {
          status.teams.active++;
        } else if (team.is_active === false) {
          status.teams.inactive++;
        } else {
          status.teams.null++;
        }
      }
    }

    const totalNull = status.users.null + status.teams.null;

    return NextResponse.json({
      status,
      total: {
        active: status.users.active + status.teams.active,
        inactive: status.users.inactive + status.teams.inactive,
        null: totalNull,
        needsFix: totalNull > 0,
      },
    });
  } catch (error) {
    console.error('查询账号状态错误', error);
    return NextResponse.json(
      {
        success: false,
        error: '查询失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}
