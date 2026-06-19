/**
 * API 安全中间件
 * 提供 API 路由的安全检查功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { verifyCSRFToken } from '@/lib/security';
import { checkRateLimit, isIPWhitelisted, isIPBlacklisted, detectSuspiciousActivity, getClientIP } from '@/lib/rate-limit';
import { isSafeSqlInput, sanitizeHtml } from '@/lib/security';

// ========== 安全中间件选项 ==========

export interface SecurityOptions {
  requireAuth?: boolean; // 是否需要认证
  requireRole?: string[]; // 需要的角色
  rateLimitType?: string; // 频率限制类型
  requireCSRF?: boolean; // 是否需要 CSRF 令牌
  enableIPWhitelist?: boolean; // 是否启用 IP 白名单
  enableIPBlacklist?: boolean; // 是否启用 IP 黑名单
  enableSuspiciousDetection?: boolean; // 是否启用异常检测
  sanitizeInput?: boolean; // 是否清理输入
}

// 默认安全选项
const DEFAULT_SECURITY_OPTIONS: SecurityOptions = {
  requireAuth: false,
  requireRole: [],
  rateLimitType: 'api',
  requireCSRF: false,
  enableIPWhitelist: false,
  enableIPBlacklist: true,
  enableSuspiciousDetection: false,
  sanitizeInput: true,
};

// ========== 安全错误响应 ==========

function createSecurityErrorResponse(message: string, status: number = 403): NextResponse {
  return NextResponse.json(
    { error: message },
    { status }
  );
}

// ========== API 安全中间件 ==========

/**
 * API 安全中间件
 * @param request Next.js 请求对象
 * @param options 安全选项
 */
export async function apiSecurityMiddleware(
  request: NextRequest,
  options: SecurityOptions = {}
): Promise<NextResponse | null> {
  const opts = { ...DEFAULT_SECURITY_OPTIONS, ...options };
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';
  const path = request.nextUrl.pathname;

  // 1. IP 白名单检查
  if (opts.enableIPWhitelist) {
    const isWhitelisted = await isIPWhitelisted(ip);
    if (!isWhitelisted) {
      return createSecurityErrorResponse('您的 IP 无权访问', 403);
    }
  }

  // 2. IP 黑名单检查
  if (opts.enableIPBlacklist) {
    const isBlacklisted = await isIPBlacklisted(ip);
    if (isBlacklisted) {
      return createSecurityErrorResponse('您的 IP 已被封禁', 403);
    }
  }

  // 3. 异常活动检测
  if (opts.enableSuspiciousDetection) {
    const suspicious = await detectSuspiciousActivity(ip);
    if (suspicious.isSuspicious) {
      console.warn('检测到异常活动:', ip, suspicious.reasons);
      // 可以选择返回错误或记录日志
      // return createSecurityErrorResponse('检测到异常活动，请稍后再试', 403);
    }
  }

  // 4. 频率限制
  if (opts.rateLimitType) {
    const rateLimitResult = await checkRateLimit(ip, opts.rateLimitType);
    if (!rateLimitResult.allowed) {
      const response = createSecurityErrorResponse(
        rateLimitResult.message || '请求过于频繁，请稍后再试',
        429
      );
      response.headers.set('X-RateLimit-Limit', '100');
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());
      return response;
    }
  }

  // 5. 认证检查
  let session = null;
  if (opts.requireAuth) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return createSecurityErrorResponse('未提供认证令牌', 401);
    }

    session = await verifySession(token);
    if (!session) {
      return createSecurityErrorResponse('认证令牌无效或已过期', 401);
    }

    // 6. 角色检查
    if (opts.requireRole && opts.requireRole.length > 0) {
      if (!opts.requireRole.includes(session.role)) {
        return createSecurityErrorResponse('权限不足', 403);
      }
    }
  }

  // 7. CSRF 检查（仅对修改操作）
  if (opts.requireCSRF && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const csrfToken = request.headers.get('x-csrf-token');

    if (!csrfToken) {
      return createSecurityErrorResponse('缺少 CSRF 令牌', 403);
    }

    // 从会话中获取 CSRF 令牌
    const sessionToken = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!sessionToken) {
      return createSecurityErrorResponse('CSRF 验证失败', 403);
    }

    const sessionData = await verifySession(sessionToken);
    if (!sessionData || !verifyCSRFToken(csrfToken, sessionData.csrfToken)) {
      return createSecurityErrorResponse('CSRF 令牌无效', 403);
    }
  }

  // 8. 输入清理（仅对 POST/PUT/PATCH 请求）
  if (opts.sanitizeInput && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      const body = await request.clone().json();

      // 检查 SQL 注入
      for (const key in body) {
        if (typeof body[key] === 'string') {
          if (!isSafeSqlInput(body[key])) {
            return createSecurityErrorResponse('输入包含非法字符', 400);
          }
          // 清理 HTML
          body[key] = sanitizeHtml(body[key]);
        }
      }
    } catch (error) {
      // JSON 解析失败，忽略
    }
  }

  return null; // 安全检查通过
}

// ========== 创建安全的 API 路由包装器 ==========

export function createSecureAPIHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  options: SecurityOptions = {}
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    // 执行安全检查
    const securityError = await apiSecurityMiddleware(request, options);
    if (securityError) {
      return securityError;
    }

    // 执行处理函数
    try {
      const response = await handler(request, ...args);

      // 添加安全响应头
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      return response;
    } catch (error) {
      console.error('API 错误:', error);
      return createSecurityErrorResponse('服务器内部错误', 500);
    }
  };
}

// ========== 预定义的安全包装器 ==========

/**
 * 公开 API 包装器（无需认证）
 */
export function publicAPIHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return createSecureAPIHandler(handler, {
    requireAuth: false,
    rateLimitType: 'general',
  });
}

/**
 * 认证 API 包装器（需要认证）
 */
export function authenticatedAPIHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  allowedRoles?: string[]
) {
  return createSecureAPIHandler(handler, {
    requireAuth: true,
    requireRole: allowedRoles,
    rateLimitType: 'api',
    requireCSRF: true,
  });
}

/**
 * 管理员 API 包装器（需要管理员权限）
 */
export function adminAPIHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return createSecureAPIHandler(handler, {
    requireAuth: true,
    requireRole: ['super_admin', 'teacher'],
    rateLimitType: 'api',
    requireCSRF: true,
  });
}

/**
 * 敏感操作 API 包装器（需要认证和严格限制）
 */
export function sensitiveAPIHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return createSecureAPIHandler(handler, {
    requireAuth: true,
    rateLimitType: 'sensitive',
    requireCSRF: true,
  });
}
