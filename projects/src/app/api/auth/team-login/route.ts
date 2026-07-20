import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { verifyPasswordAsync, hashPasswordAsync, needsRehash } from '@/lib/security';
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

    const client = getSupabaseAdminClient();

    // 3. 查询小队（直接用 ilike 不区分大小写，省去 eq→ilike 双查询）
    let { data: team, error: teamError } = await client
      .from('teams')
      .select('*')
      .ilike('code', code)
      .single();

    if (teamError || !team) {
      console.error('小队查询失败:', {
        code,
        error: teamError,
        team: team,
      });
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, undefined, 401);
      // SEC-003: 统一错误消息,防止账号枚举(原本返回"小队编码不存在"会暴露小队是否注册)
      return NextResponse.json(
        { error: '小队编码或密码错误', field: 'code' },
        { status: 401 }
      );
    }

    // 4. 验证密码（异步 bcrypt.compare，不阻塞事件循环）
    const isPasswordValid = await verifyPasswordAsync(password, team.password);
    if (!isPasswordValid) {
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, team.id, 401);
      // SEC-003: 统一错误消息,防止账号枚举
      return NextResponse.json(
        { error: '小队编码或密码错误', field: 'password' },
        { status: 401 }
      );
    }

    // 4.1 若密码哈希为旧 SHA-256 算法，登录成功后自动升级为 bcrypt（fire-and-forget）
    if (needsRehash(team.password)) {
      hashPasswordAsync(password).then((newHash) => {
        client
          .from('teams')
          .update({ password: newHash, updated_at: new Date().toISOString() })
          .eq('id', team.id)
          .then(undefined, () => {});
      }, () => {});
    }

    // 5. 检查小队状态（NULL 或 true 视为活跃，false 视为禁用）
    if (team.is_active === false) {
      await logRequest(ip, 'POST', '/api/auth/team-login', userAgent, team.id, 403);
      return ApiErrors.forbidden('小队已被禁用，请联系管理员');
    }

    // 6. 创建会话 + 获取小队成员（并行，两者无依赖关系）
    const [session, membersResult] = await Promise.all([
      createSession(team.id, 'team', team.school_id, ip, userAgent),
      client.from('team_members').select('*').eq('team_id', team.id),
    ]);
    const members = membersResult.data || [];

    // 7. 非关键操作 fire-and-forget：更新登录时间 + 写日志
    client
      .from('teams')
      .update({
        last_login_at: new Date().toISOString(),
        last_login_ip: ip,
        updated_at: new Date().toISOString(),
      })
      .eq('id', team.id)
      .then(undefined, () => {});
    logRequest(ip, 'POST', '/api/auth/team-login', userAgent, team.id, 200, Date.now() - startTime).then(undefined, () => {});

    // 8. 返回小队信息（不包含密码）
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
