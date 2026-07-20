import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

/**
 * 密码迁移 API
 * 将现有用户的明文密码转换为哈希密码
 *
 * API 会：
 * 1. 检测哪些用户的密码是明文（不包含冒号）
 * 2. 将这些密码转换为哈希格式
 * 3. 返回迁移结果
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

    // 1. 查询所有用户
    const { data: users, error: fetchError } = await client
      .from('users')
      .select('id, username, password');

    if (fetchError) {
      throw new Error('获取用户列表失败');
    }

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要迁移的用户',
        migrated: 0,
      });
    }

    // 2. 检测明文密码并迁移
    let migratedCount = 0;
    const migrationResults: Array<{
      userId: string;
      username: string;
      status: 'migrated' | 'already-hashed' | 'error';
      error?: string;
    }> = [];

    for (const user of users) {
      try {
        // 检查密码格式（哈希密码包含冒号）
        const isHashed = user.password.includes(':');

        if (isHashed) {
          migrationResults.push({
            userId: user.id,
            username: user.username,
            status: 'already-hashed',
          });
          continue;
        }

        // 迁移明文密码
        const hashedPassword = hashPassword(user.password);

        const { error: updateError } = await client
          .from('users')
          .update({ password: hashedPassword })
          .eq('id', user.id);

        if (updateError) {
          migrationResults.push({
            userId: user.id,
            username: user.username,
            status: 'error',
            error: updateError.message,
          });
        } else {
          migratedCount++;
          migrationResults.push({
            userId: user.id,
            username: user.username,
            status: 'migrated',
          });
        }
      } catch (error) {
        migrationResults.push({
          userId: user.id,
          username: user.username,
          status: 'error',
          error: '操作失败',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功迁移 ${migratedCount} 个用户的密码`,
      total: users.length,
      migrated: migratedCount,
      results: migrationResults,
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
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();

    // 查询所有用户
    const { data: users, error: fetchError } = await client
      .from('users')
      .select('id, username, password');

    if (fetchError) {
      throw new Error('获取用户列表失败');
    }

    if (!users) {
      return NextResponse.json({
        total: 0,
        plaintext: 0,
        hashed: 0,
      });
    }

    // 统计明文和哈希密码
    let plaintextCount = 0;
    let hashedCount = 0;

    for (const user of users) {
      if (user.password.includes(':')) {
        hashedCount++;
      } else {
        plaintextCount++;
      }
    }

    return NextResponse.json({
      total: users.length,
      plaintext: plaintextCount,
      hashed: hashedCount,
      needsMigration: plaintextCount > 0,
    });
  } catch (error) {
    console.error('查询迁移状态错误:', error);
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
