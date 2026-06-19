import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

/**
 * 完整密码迁移 API
 * 迁移 users 和 teams 表中的所有明文密码
 */

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();

    const results = {
      users: { total: 0, migrated: 0, errors: [] as string[] },
      teams: { total: 0, migrated: 0, errors: [] as string[] },
    };

    // 1. 迁移 users
    const { data: users, error: usersError } = await client
      .from('users')
      .select('id, username, password');

    if (!usersError && users) {
      results.users.total = users.length;

      for (const user of users) {
        try {
          const isHashed = user.password.includes(':');

          if (isHashed) continue;

          const hashedPassword = hashPassword(user.password);

          const { error: updateError } = await client
            .from('users')
            .update({ password: hashedPassword })
            .eq('id', user.id);

          if (updateError) {
            results.users.errors.push(`${user.username}: ${updateError.message}`);
          } else {
            results.users.migrated++;
          }
        } catch (error) {
          results.users.errors.push(`${user.username}: 操作失败`);
        }
      }
    }

    // 2. 迁移 teams
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, code, password');

    if (!teamsError && teams) {
      results.teams.total = teams.length;

      for (const team of teams) {
        try {
          const isHashed = team.password.includes(':');

          if (isHashed) continue;

          const hashedPassword = hashPassword(team.password);

          const { error: updateError } = await client
            .from('teams')
            .update({ password: hashedPassword })
            .eq('id', team.id);

          if (updateError) {
            results.teams.errors.push(`${team.code}: ${updateError.message}`);
          } else {
            results.teams.migrated++;
          }
        } catch (error) {
          results.teams.errors.push(`${team.code}: 操作失败`);
        }
      }
    }

    const totalMigrated = results.users.migrated + results.teams.migrated;
    const totalErrors = results.users.errors.length + results.teams.errors.length;

    return NextResponse.json({
      success: true,
      message: totalErrors === 0
        ? `成功迁移 ${totalMigrated} 个密码`
        : `迁移完成：${totalMigrated} 个成功，${totalErrors} 个失败`,
      results,
    });
  } catch (error) {
    console.error('密码迁移错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: '密码迁移失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}

/**
 * 查询迁移状态
 */
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();

    const status = {
      users: { total: 0, plaintext: 0, hashed: 0 },
      teams: { total: 0, plaintext: 0, hashed: 0 },
    };

    // 查询 users
    const { data: users } = await client
      .from('users')
      .select('password');

    if (users) {
      status.users.total = users.length;
      for (const user of users) {
        if (user.password.includes(':')) {
          status.users.hashed++;
        } else {
          status.users.plaintext++;
        }
      }
    }

    // 查询 teams
    const { data: teams } = await client
      .from('teams')
      .select('password');

    if (teams) {
      status.teams.total = teams.length;
      for (const team of teams) {
        if (team.password.includes(':')) {
          status.teams.hashed++;
        } else {
          status.teams.plaintext++;
        }
      }
    }

    const totalPlaintext = status.users.plaintext + status.teams.plaintext;
    const totalHashed = status.users.hashed + status.teams.hashed;

    return NextResponse.json({
      status,
      total: {
        plaintext: totalPlaintext,
        hashed: totalHashed,
        needsMigration: totalPlaintext > 0,
      },
    });
  } catch (error) {
    console.error('查询迁移状态错误', error);
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
