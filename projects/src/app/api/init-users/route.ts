import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/security';
import { ApiErrors } from '@/lib/api-error';

/**
 * 用户数据查询和初始化 API
 * 安全修复：所有接口均需管理员鉴权
 */

/**
 * 查询所有用户列表
 */
export async function GET(request: NextRequest) {
  try {
    // 安全修复：强制管理员鉴权
    const auth = requireAdmin(request);
    if (!auth.authenticated) return authError(auth);

    const client = getSupabaseClient();
    const { data: users, error } = await client
      .from('users')
      .select('id, username, name, role, school_id, is_active, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      count: users?.length || 0,
      users: users || [],
    });
  } catch (error) {
    console.error('查询用户列表错误:', error);
    return ApiErrors.validation('查询失败');
  }
}

/**
 * 初始化测试用户数据
 * 安全修复：无条件要求管理员鉴权
 */
export async function POST(request: NextRequest) {
  try {
    // 安全修复：无条件要求管理员鉴权，不再根据用户表是否为空绕过
    const auth = requireAdmin(request);
    if (!auth.authenticated) return authError(auth);

    const client = getSupabaseClient();

    // 默认测试用户
    const defaultUsers = [
      {
        username: 'admin',
        password: '123456',
        name: '超级管理员',
        role: 'super_admin',
        is_active: true,
      },
      {
        username: 'teacher1',
        password: '123456',
        name: '张老师',
        role: 'teacher',
        is_active: true,
      },
      {
        username: 'teacher2',
        password: '123456',
        name: '李老师',
        role: 'teacher',
        is_active: true,
      },
      {
        username: 'volunteer1',
        password: '123456',
        name: '王志愿者',
        role: 'volunteer',
        is_active: true,
      },
      {
        username: 'volunteer2',
        password: '123456',
        name: '赵志愿者',
        role: 'volunteer',
        is_active: true,
      },
    ];

    const results = {
      total: defaultUsers.length,
      created: 0,
      errors: [] as Array<{ username: string; error: string }>,
    };

    for (const userData of defaultUsers) {
      try {
        // 检查用户名是否已存在
        const { data: existing } = await client
          .from('users')
          .select('id')
          .eq('username', userData.username)
          .single();

        if (existing) {
          results.errors.push({
            username: userData.username,
            error: '用户名已存在',
          });
          continue;
        }

        // 创建用户
        const hashedPassword = hashPassword(userData.password);
        const { error: insertError } = await client.from('users').insert({
          ...userData,
          password: hashedPassword,
        });

        if (insertError) {
          results.errors.push({
            username: userData.username,
            error: insertError.message,
          });
        } else {
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          username: userData.username,
          error: '操作失败',
        });
      }
    }

    return NextResponse.json({
      success: results.created > 0,
      message: `成功创建 ${results.created} 个用户`,
      results,
    });
  } catch (error) {
    console.error('初始化用户数据错误:', error);
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
