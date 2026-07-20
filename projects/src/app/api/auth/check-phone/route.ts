import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { safeError } from '@/lib/api-auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { ApiErrors } from '@/lib/api-error';

/**
 * 验证手机号是否已被使用
 * GET /api/auth/check-phone?phone=13800138000
 * 
 * 返回:
 * - exists: boolean - 手机号是否存在
 * - user: { name, role } | null - 如果存在，返回用户信息（不包含敏感信息）
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(ip, 'api');
  if (!rateLimitResult.allowed) {
    return ApiErrors.rateLimited(rateLimitResult.message || '请求过于频繁，请稍后再试');
  }
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const excludeUserId = searchParams.get('excludeUserId'); // 排除的用户ID（用于编辑时排除自己）

    if (!phone) {
      return ApiErrors.validation('手机号不能为空');
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json({ 
        valid: false, 
        error: '请输入正确的手机号格式' 
      }, { status: 200 });
    }

    const client = getSupabaseAdminClient();

    // 查询手机号是否已被使用
    let query = client
      .from('users')
      .select('id, name, role, username')
      .eq('username', phone);

    // 如果有排除的用户ID，则排除该用户（编辑场景）
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data: existingUser, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 表示没有找到记录，这是正常情况
      console.error('查询手机号失败:', error);
      return ApiErrors.validation('查询失败');
    }

    if (existingUser) {
      // 手机号已被使用
      const roleNames: Record<string, string> = {
        'super_admin': '超级管理员',
        'admin': '管理员',
        'volunteer': '授课志愿者',
        'teacher': '助学老师',
      };

      return NextResponse.json({
        valid: true,
        exists: true,
        user: {
          name: existingUser.name || existingUser.username,
          role: existingUser.role,
          roleName: roleNames[existingUser.role] || existingUser.role,
        },
        message: `该手机号已被使用，关联用户：${existingUser.name || existingUser.username}（${roleNames[existingUser.role] || existingUser.role}）`,
      }, { status: 200 });
    }

    // 手机号可用
    return NextResponse.json({
      valid: true,
      exists: false,
      message: '手机号可用',
    }, { status: 200 });

  } catch (error) {
    console.error('验证手机号错误:', error);
    return ApiErrors.validation('验证手机号失败');
  }
}
