import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';

/**
 * 小队数据查询和初始化 API
 */

/**
 * 查询所有小队列表
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseAdminClient();
    const { data: teams, error } = await client
      .from('teams')
      .select('id, code, name, school_id, is_active, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      count: teams?.length || 0,
      teams: teams || [],
    });
  } catch (error) {
    console.error('查询小队列表错误:', error);
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

/**
 * 初始化测试小队数据
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const body = await request.json();
    const { force = false } = body;

    // 检查是否已有小队
    const { data: existingTeams, error: checkError } = await client
      .from('teams')
      .select('id')
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    if (existingTeams && existingTeams.length > 0 && !force) {
      return NextResponse.json({
        success: false,
        error: '数据库中已存在小队数据',
        count: existingTeams.length,
        message: '如需重新初始化，请设置force=true',
      });
    }

    // 默认测试小队
    const defaultTeams = [
      {
        code: 'TEAM001',
        password: '123456',
        name: '探索者小队',
        is_active: true,
      },
      {
        code: 'TEAM002',
        password: '123456',
        name: '创新者小队',
        is_active: true,
      },
      {
        code: 'TEAM003',
        password: '123456',
        name: '未来星小队',
        is_active: true,
      },
    ];

    const results = {
      total: defaultTeams.length,
      created: 0,
      errors: [] as Array<{ code: string; error: string }>,
    };

    for (const teamData of defaultTeams) {
      try {
        // 检查小队编码是否已存在
        const { data: existing } = await client
          .from('teams')
          .select('id')
          .eq('code', teamData.code)
          .single();

        if (existing) {
          results.errors.push({
            code: teamData.code,
            error: '小队编码已存在',
          });
          continue;
        }

        // 创建小队
        const hashedPassword = hashPassword(teamData.password);
        const { error: insertError } = await client.from('teams').insert({
          ...teamData,
          password: hashedPassword,
        });

        if (insertError) {
          results.errors.push({
            code: teamData.code,
            error: insertError.message,
          });
        } else {
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          code: teamData.code,
          error: '操作失败',
        });
      }
    }

    return NextResponse.json({
      success: results.created > 0,
      message: `成功创建 ${results.created} 个小队`,
      results,
    });
  } catch (error) {
    console.error('初始化小队数据错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: '初始化失败',
        details: '操作失败，请查看服务器日志',
      },
      { status: 500 }
    );
  }
}
