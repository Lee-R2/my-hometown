import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

/**
 * 数据恢复和修复 API
 * 用于恢复和修复现有数据
 */

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { repairAccounts = true, repairPasswords = false } = body;

    const results = {
      users: {
        total: 0,
        repaired: 0,
        unchanged: 0,
        errors: [] as string[],
      },
      teams: {
        total: 0,
        repaired: 0,
        unchanged: 0,
        errors: [] as string[],
      },
    };

    // 1. 修复 users
    const { data: users, error: usersError } = await client
      .from('users')
      .select('id, username, name, role, is_active, password');

    if (usersError) {
      throw new Error(`查询用户失败: ${usersError.message}`);
    }

    if (users) {
      results.users.total = users.length;

      for (const user of users) {
        try {
          let needsUpdate = false;
          const updates: Record<string, any> = {};

          // 修复 is_active 字段
          if (repairAccounts && (user.is_active === null || user.is_active === undefined)) {
            updates.is_active = true;
            needsUpdate = true;
          }

          // 修复密码格式（如果是明文，转换为哈希）
          if (repairPasswords && user.password && !user.password.includes(':')) {
            updates.password = hashPassword(user.password);
            needsUpdate = true;
          }

          if (needsUpdate) {
            const { error: updateError } = await client
              .from('users')
              .update(updates)
              .eq('id', user.id);

            if (updateError) {
              results.users.errors.push(`${user.username}: ${updateError.message}`);
            } else {
              results.users.repaired++;
            }
          } else {
            results.users.unchanged++;
          }
        } catch (error) {
          results.users.errors.push(`${user.username}: 操作失败`);
        }
      }
    }

    // 2. 修复 teams
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, code, name, is_active, password');

    if (teamsError) {
      throw new Error(`查询小队失败: ${teamsError.message}`);
    }

    if (teams) {
      results.teams.total = teams.length;

      for (const team of teams) {
        try {
          let needsUpdate = false;
          const updates: Record<string, any> = {};

          // 修复 is_active 字段
          if (repairAccounts && (team.is_active === null || team.is_active === undefined)) {
            updates.is_active = true;
            needsUpdate = true;
          }

          // 修复密码格式（如果是明文，转换为哈希）
          if (repairPasswords && team.password && !team.password.includes(':')) {
            updates.password = hashPassword(team.password);
            needsUpdate = true;
          }

          if (needsUpdate) {
            const { error: updateError } = await client
              .from('teams')
              .update(updates)
              .eq('id', team.id);

            if (updateError) {
              results.teams.errors.push(`${team.code}: ${updateError.message}`);
            } else {
              results.teams.repaired++;
            }
          } else {
            results.teams.unchanged++;
          }
        } catch (error) {
          results.teams.errors.push(`${team.code}: 操作失败`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `数据恢复完成：用户 ${results.users.repaired} 个修复，小队 ${results.teams.repaired} 个修复`,
      results,
    });
  } catch (error) {
    console.error('数据恢复错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: '数据恢复失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}

/**
 * 查询现有数据
 * 安全修复：添加管理员鉴权
 */
export async function GET(request: NextRequest) {
  try {
    // 安全修复：强制管理员鉴权
    const auth = requireAdmin(request);
    if (!auth.authenticated) return authError(auth);

    const client = getSupabaseClient();

    const { data: users, error: usersError } = await client
      .from('users')
      .select('id, username, name, role, is_active, created_at')
      .order('created_at', { ascending: true });

    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, code, name, is_active, created_at')
      .order('created_at', { ascending: true });

    return NextResponse.json({
      success: true,
      users: {
        count: users?.length || 0,
        error: usersError?.message || null,
        data: users || [],
      },
      teams: {
        count: teams?.length || 0,
        error: teamsError?.message || null,
        data: teams || [],
      },
    });
  } catch (error) {
    console.error('查询数据错误:', error);
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
