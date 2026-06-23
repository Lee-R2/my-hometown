import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 数据库诊断API
 * 用于诊断数据库连接和数据状态
 */

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const diagnostics = {
      tables: {} as Record<string, any>,
      users: {
        count: 0,
        sample: null as any,
      },
      teams: {
        count: 0,
        sample: null as any,
      },
    };

    // 1. 检查 users
    try {
      const { data: users, error: usersError } = await client
        .from('users')
        .select('id, username, name, role, password, is_active')
        .limit(5);

      if (usersError) {
        diagnostics.tables.users = { status: 'error', message: usersError.message };
      } else {
        diagnostics.tables.users = { status: 'ok', count: users?.length || 0 };
        diagnostics.users.count = users?.length || 0;
        diagnostics.users.sample = users;
      }
    } catch (e) {
      diagnostics.tables.users = { status: 'error', message: String(e) };
    }

    // 2. 检查 teams
    try {
      const { data: teams, error: teamsError } = await client
        .from('teams')
        .select('id, code, name, is_active')
        .limit(5);

      if (teamsError) {
        diagnostics.tables.teams = { status: 'error', message: teamsError.message };
      } else {
        diagnostics.tables.teams = { status: 'ok', count: teams?.length || 0 };
        diagnostics.teams.count = teams?.length || 0;
        diagnostics.teams.sample = teams;
      }
    } catch (e) {
      diagnostics.tables.teams = { status: 'error', message: String(e) };
    }

    // 3. 检查其他相关表
    const tableNames = [
      'user_sessions',
      'rate_limit_records',
      'ip_whitelist',
      'ip_blacklist',
      'request_logs',
      'security_events',
      'login_attempts',
    ];

    for (const tableName of tableNames) {
      try {
        const { data, error } = await client
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          diagnostics.tables[tableName] = { status: 'error', message: '操作失败' };
        } else {
          diagnostics.tables[tableName] = { status: 'ok' };
        }
      } catch (e) {
        diagnostics.tables[tableName] = { status: 'error', message: String(e) };
      }
    }

    return NextResponse.json({
      success: true,
      diagnostics,
    });
  } catch (error) {
    console.error('数据库诊断错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: '诊断失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}
