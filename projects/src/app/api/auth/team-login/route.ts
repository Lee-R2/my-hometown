import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyPassword } from '@/lib/security';
import { checkRateLimit, logRequest, getClientIP } from '@/lib/rate-limit';
import { createSession, setSessionCookie } from '@/lib/session';
import { safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';
  const startTime = Date.now();

  try {
    const { code, password } = await request.json();

    if (!code || !password) {
      return NextResponse.json(
        { error: '小队编码和密码不能为空', field: !code ? 'code' : 'password' },
        { status: 400 }
      );
    }

    // 1. 频率限制检查
    const rateLimitResult = await checkRateLimit(ip, 'login');
    if (!rateLimitResult.allowed) {
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, undefined, 429);
      return NextResponse.json(
        {
          error: rateLimitResult.message || '登录尝试过于频繁，请15分钟后再试',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      );
    }

    // 2. 验证输入安全性
    if (!/^[A-Za-z0-9-]+$/.test(code)) {
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, undefined, 400);
      return NextResponse.json(
        { error: '小队编码格式不正确', field: 'code' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 3. 查询小队（确保包含 is_active 字段）
    // 先尝试精确匹配
    let { data: team, error: teamError } = await client
      .from('teams')
      .select('*, is_active')
      .eq('code', code)
      .single();

    // 如果精确匹配失败，尝试不区分大小写匹配
    if (teamError || !team) {
      const { data: teamILike, error: teamILikeError } = await client
        .from('teams')
        .select('*, is_active')
        .ilike('code', code)
        .single();

      if (!teamILikeError && teamILike) {
        team = teamILike;
        teamError = null;
      }
    }

    if (teamError || !team) {
      console.error('小队查询失败:', {
        code,
        error: teamError,
        team: team,
      });
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, undefined, 401);
      return NextResponse.json(
        { error: '小队编码不存在', field: 'code' },
        { status: 401 }
      );
    }

    // 4. 验证密码（使用哈希验证）
    const isPasswordValid = verifyPassword(password, team.password);
    if (!isPasswordValid) {
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, team.id, 401);
      return NextResponse.json(
        { error: '密码错误', field: 'password' },
        { status: 401 }
      );
    }

    // 5. 检查小队状态（NULL 或 true 视为活跃，false 视为禁用）
    if (team.is_active === false) {
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, team.id, 403);
      return ApiErrors.forbidden('小队已被禁用，请联系管理员');
    }

    // 6. 创建小队会话
    const session = await createSession(team.id, 'team', team.school_id, ip, userAgent);

    // 7. 获取小队成员
    const { data: members } = await client
      .from('team_members')
      .select('*')
      .eq('team_id', team.id);

    // 8. 更新最后登录时间和 IP
    await client
      .from('teams')
      .update({
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
        updated_at: new Date().toISOString(),
      })
      .eq('id', team.id);

    // 9. 记录成功登录
    await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, team.id, 200, Date.now() - startTime);

    // 10. 返回小队信息（不包含密码）
    const { password: _, ...teamWithoutPassword } = team;

    // 字段名映射：数据库蛇形命名 → 前端驼峰命名
    const teamForFrontend = {
      ...teamWithoutPassword,
      currentThemeId: teamWithoutPassword.current_theme_id,
      currentTaskId: teamWithoutPassword.current_task_id,
      hasCompletedPretest: teamWithoutPassword.has_completed_pretest,
      createdBy: teamWithoutPassword.created_by,
      members: members || [],
    };

    const response = NextResponse.json({
      success: true,
      team: teamForFrontend,
      csrfToken: session.csrfToken,
    });

    // 11. 设置会话 Cookie（使用统一函数，含环境自适应 Secure 标志）
    setSessionCookie(session.token, response);

    // 12. 添加安全响应头
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  } catch (error) {
    console.error('小队登录错误:', error);
    await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, undefined, 500, Date.now() - startTime);
    return safeError(error);
  }
}
