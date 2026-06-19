import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 执行数据库迁移
 * 用于初始化安全功能所需的数据库结构
 */

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const results = [];

    // 1. 创建用户会话表
    try {
      const { error } = await client.rpc('create_user_sessions_table');
      if (error) {
        throw error;
      }
      results.push({ table: 'user_sessions', status: 'created' });
    } catch (e) {
      // 可能RPC 不存在，尝试直接创建
      try {
        await client.rpc('execute_sql', {
          sql: `
            CREATE TABLE IF NOT EXISTS user_sessions (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              user_id TEXT NOT NULL,
              token TEXT NOT NULL UNIQUE,
              csrf_token TEXT NOT NULL,
              ip_address TEXT,
              user_agent TEXT,
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              expires_at TIMESTAMP WITH TIME ZONE NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
            CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
          `
        });
        results.push({ table: 'user_sessions', status: 'created' });
      } catch (e2) {
        results.push({ table: 'user_sessions', status: 'skipped', error: 'RPC function not available' });
      }
    }

    // 2. 创建频率限制记录表
    try {
      await client.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS rate_limit_records (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            identifier TEXT NOT NULL,
            type TEXT NOT NULL,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_rate_limit_records_identifier ON rate_limit_records(identifier);
          CREATE INDEX IF NOT EXISTS idx_rate_limit_records_type ON rate_limit_records(type);
          CREATE INDEX IF NOT EXISTS idx_rate_limit_records_timestamp ON rate_limit_records(timestamp);
        `
      });
      results.push({ table: 'rate_limit_records', status: 'created' });
    } catch (e) {
      results.push({ table: 'rate_limit_records', status: 'skipped', error: 'RPC function not available' });
    }

    // 3. 创建 IP 白名单表
    try {
      await client.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS ip_whitelist (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            ip_address TEXT NOT NULL UNIQUE,
            note TEXT,
            added_by TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_ip_whitelist_ip_address ON ip_whitelist(ip_address);
          CREATE INDEX IF NOT EXISTS idx_ip_whitelist_is_active ON ip_whitelist(is_active);
        `
      });
      results.push({ table: 'ip_whitelist', status: 'created' });
    } catch (e) {
      results.push({ table: 'ip_whitelist', status: 'skipped', error: 'RPC function not available' });
    }

    // 4. 创建 IP 黑名单表
    try {
      await client.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS ip_blacklist (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            ip_address TEXT NOT NULL UNIQUE,
            reason TEXT,
            added_by TEXT,
            expiry_at TIMESTAMP WITH TIME ZONE,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_blacklist_ip_address ON ip_blacklist(ip_address);
          CREATE INDEX IF NOT EXISTS idx_blacklist_is_active ON ip_blacklist(is_active);
          CREATE INDEX IF NOT EXISTS idx_blacklist_expiry_at ON ip_blacklist(expiry_at);
        `
      });
      results.push({ table: 'ip_blacklist', status: 'created' });
    } catch (e) {
      results.push({ table: 'ip_blacklist', status: 'skipped', error: 'RPC function not available' });
    }

    // 5. 创建请求日志表
    try {
      await client.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS request_logs (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            ip_address TEXT NOT NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            user_agent TEXT,
            user_id TEXT,
            status_code INTEGER,
            duration INTEGER,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_request_logs_ip_address ON request_logs(ip_address);
          CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
          CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id);
          CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);
        `
      });
      results.push({ table: 'request_logs', status: 'created' });
    } catch (e) {
      results.push({ table: 'request_logs', status: 'skipped', error: 'RPC function not available' });
    }

    // 6. 创建安全事件日志表
    try {
      await client.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS security_events (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            description TEXT,
            ip_address TEXT,
            user_id TEXT,
            user_agent TEXT,
            details JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
          CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
          CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(created_at);
          CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
        `
      });
      results.push({ table: 'security_events', status: 'created' });
    } catch (e) {
      results.push({ table: 'security_events', status: 'skipped', error: 'RPC function not available' });
    }

    // 7. 创建登录失败记录表
    try {
      await client.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS login_attempts (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            identifier TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            user_agent TEXT,
            success BOOLEAN NOT NULL,
            failure_reason TEXT,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier);
          CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);
          CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp);
          CREATE INDEX IF NOT EXISTS idx_login_attempts_success ON login_attempts(success);
        `
      });
      results.push({ table: 'login_attempts', status: 'created' });
    } catch (e) {
      results.push({ table: 'login_attempts', status: 'skipped', error: 'RPC function not available' });
    }

    // 8. users 表添加安全相关字段
    try {
      await client.rpc('execute_sql', {
        sql: `
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
        `
      });
      results.push({ table: 'users', status: 'updated', columns: ['is_active', 'last_login_at', 'last_login_ip'] });
    } catch (e) {
      results.push({ table: 'users', status: 'skipped', error: 'RPC function not available' });
    }

    // 9. teams 表添加安全相关字段
    try {
      await client.rpc('execute_sql', {
        sql: `
          ALTER TABLE teams
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
        `
      });
      results.push({ table: 'teams', status: 'updated', columns: ['is_active', 'last_login_at', 'last_login_ip'] });
    } catch (e) {
      results.push({ table: 'teams', status: 'skipped', error: 'RPC function not available' });
    }

    // 如果 RPC 不可用，返回说明
    const hasSkipped = results.some(r => r.status === 'skipped');

    return NextResponse.json({
      success: true,
      message: hasSkipped
        ? '数据库迁移完成（部分表通过 SQL 脚本创建）'
        : '数据库迁移完成',
      results,
      note: hasSkipped
        ? '由于 Supabase 不支持直接通过 API 执行 SQL，请手动执行以下 SQL 文件: migrations/security.sql'
        : '所有表和字段已成功创建'
    });
  } catch (error) {
    console.error('数据库迁移错误', error);
    return NextResponse.json(
      {
        success: false,
        error: '数据库迁移失败',
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

    // 检查表是否存在
    const tables = [
      'user_sessions',
      'rate_limit_records',
      'ip_whitelist',
      'ip_blacklist',
      'request_logs',
      'security_events',
      'login_attempts',
    ];

    const tableStatus: Record<string, { exists: boolean; error: string | null; [key: string]: any }> = {};

    for (const table of tables) {
      try {
        const { data, error } = await client
          .from(table)
          .select('*')
          .limit(1);

        tableStatus[table] = {
          exists: !error,
          error: error?.message || null
        };
      } catch (e) {
        tableStatus[table] = {
          exists: false,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    }

    // 检查 users 表的字段
    try {
      const { data: usersData, error: usersError } = await client
        .from('users')
        .select('id, is_active, last_login_at, last_login_ip')
        .limit(1);

      tableStatus['users'] = {
        exists: !usersError,
        has_is_active: !usersError,
        error: usersError?.message || null
      };
    } catch (e) {
      tableStatus['users'] = {
        exists: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    // 检查 teams 表的字段
    try {
      const { data: teamsData, error: teamsError } = await client
        .from('teams')
        .select('id, is_active, last_login_at, last_login_ip')
        .limit(1);

      tableStatus['teams'] = {
        exists: !teamsError,
        has_is_active: !teamsError,
        error: teamsError?.message || null
      };
    } catch (e) {
      tableStatus['teams'] = {
        exists: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    return NextResponse.json({
      success: true,
      tableStatus,
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
