import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { verifyPasswordAsync, hashPasswordAsync, needsRehash } from '@/lib/security';
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

    const client = getSupabaseAdminClient();

    // 3. 查询用户（直接用 ilike 不区分大小写，省去 eq→ilike 双查询）
    let { data: user, error: userError } = await client
      .from('users')
      .select('*')
      .ilike('username', username)
      .single();

    if (userError || !user) {
      console.error('用户查询失败:', {
        username,
        error: userError,
        user: user,
      });
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, undefined, 401);
      // SEC-003: 统一错误消息,防止账号枚举(原本返回"用户名不存在"会暴露用户名是否注册)
      return NextResponse.json(
        { error: '用户名或密码错误', field: 'username' },
        { status: 401 }
      );
    }

    // 4. 验证密码（异步 bcrypt.compare，不阻塞事件循环）
    const isPasswordValid = await verifyPasswordAsync(password, user.password);
    if (!isPasswordValid) {
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, user.id, 401);
      // SEC-003: 统一错误消息,防止账号枚举
      return ApiErrors.unauthorized('用户名或密码错误');
    }

    // 4.1 若密码哈希为旧 SHA-256 算法，登录成功后自动升级为 bcrypt（fire-and-forget）
    if (needsRehash(user.password)) {
      hashPasswordAsync(password).then((newHash) => {
        client
          .from('users')
          .update({ password: newHash, updated_at: new Date().toISOString() })
          .eq('id', user.id)
          .then(undefined, () => {});
      }, () => {});
    }

    // 5. 检查账号状态（NULL 或 true 视为活跃，false 视为禁用）
    if (user.is_active === false) {
      await logRequest(ip, 'POST', '/api/auth/login', userAgent, user.id, 403);
      return ApiErrors.forbidden('账号已被禁用，请联系管理员');
    }

    // 6. 创建会话（关键路径，需 await）
    const session = await createSession(user.id, user.role, user.school_id, ip, userAgent);

    // 7. 非关键操作 fire-and-forget：更新登录时间 + 写日志
    client
      .from('users')
      .update({
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .then(undefined, () => {});
    logRequest(ip, 'POST', '/api/auth/login', userAgent, user.id, 200, Date.now() - startTime).then(undefined, () => {});

    // 8. 返回用户信息（不包含密码）
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
