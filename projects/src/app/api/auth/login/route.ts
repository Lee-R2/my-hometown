import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyPassword, checkPasswordStrength } from '@/lib/security';
import { createSession, setSessionCookie } from '@/lib/session';
import { checkRateLimit, logRequest, getClientIP } from '@/lib/rate-limit';
import { safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';
  const startTime = Date.now();

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return ApiErrors.validation(!username ? '用户名不能为空' : '密码不能为空');
    }

    // 1. 频率限制检查（防止暴力破解）
    const rateLimitResult = await checkRateLimit(ip, 'login');
    if (!rateLimitResult.allowed) {
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, undefined, 429);
      return ApiErrors.rateLimited(rateLimitResult.message || '登录尝试过于频繁，请15分钟后再试');
    }

    // 2. 验证输入安全性
    if (!/^[a-zA-Z0-9_@.-]+$/.test(username)) {
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, undefined, 400);
      return NextResponse.json(
        { error: '用户名格式不正确', field: 'username' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 3. 查询用户（确保包含 is_active 字段）
    // 先尝试精确匹配
    let { data: user, error: userError } = await client
      .from('users')
      .select('*, is_active')
      .eq('username', username)
      .single();

    // 如果精确匹配失败，尝试不区分大小写匹配
    if (userError || !user) {
      const { data: userILike, error: userILikeError } = await client
        .from('users')
        .select('*, is_active')
        .ilike('username', username)
        .single();

      if (!userILikeError && userILike) {
        user = userILike;
        userError = null;
      }
    }

    if (userError || !user) {
      console.error('用户查询失败:', {
        username,
        error: userError,
        user: user,
      });
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, undefined, 401);
      return NextResponse.json(
        { error: '用户名不存在', field: 'username' },
        { status: 401 }
      );
    }

    // 4. 验证密码（使用哈希验证）
    const isPasswordValid = verifyPassword(password, user.password);
    if (!isPasswordValid) {
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, user.id, 401);
      return ApiErrors.unauthorized('密码错误');
    }

    // 5. 检查账号状态（NULL 或 true 视为活跃，false 视为禁用）
    if (user.is_active === false) {
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, user.id, 403);
      return ApiErrors.forbidden('账号已被禁用，请联系管理员');
    }

    // 6. 创建会话
    const session = await createSession(user.id, user.role, user.school_id, ip, userAgent);

    // 7. 更新最后登录时间和 IP
    await client
      .from('users')
      .update({
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // 8. 记录成功登录
    await logRequest(ip, 'POST', '/api/auth/login', userAgent, user.id, 200, Date.now() - startTime);

    // 9. 返回用户信息（不包含密码）
    const { password: _, ...userWithoutPassword } = user;

    const response = NextResponse.json({
      success: true,
      user: userWithoutPassword,
      csrfToken: session.csrfToken,
    });

    // 10. 设置会话 Cookie（使用统一函数，含环境自适应 Secure 标志）
    setSessionCookie(session.token, response);

    // 11. 添加安全响应头
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  } catch (error) {
    console.error('登录错误:', error);
    await logRequest(ip, 'POST', '/api/auth/login', userAgent, undefined, 500, Date.now() - startTime);
    return ApiErrors.validation('登录失败');
  }
}
