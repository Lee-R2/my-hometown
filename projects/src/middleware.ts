import { NextRequest, NextResponse } from 'next/server';

/**
 * 安全中间件 — 集中处理 CORS、CSRF 校验和安全响应头。
 *
 * 修复历史：
 * - VULN-API-014 (P2): 全项目无 CORS 配置。同源应用对 /api/* 校验 Origin。
 * - VULN-P3-CSRF: POST/PUT/DELETE/PATCH 接口未校验 CSRF token。
 * - VULN-P3-HEADERS: 安全响应头（X-Content-Type-Options / Referrer-Policy / Permissions-Policy）缺失。
 *
 * CORS 逻辑（P2 已加，保留）：
 * - 生产环境下，若 Origin 不在允许列表中则返回 403，防止跨站请求
 * - 允许的域名从环境变量 ALLOWED_ORIGINS 读取，默认 http://localhost:3000
 * - 开发环境（NODE_ENV !== 'production'）放宽限制，便于本地调试
 * - 同源请求（无 Origin header）默认放行
 *
 * CSRF 逻辑（P3 新增）：
 * - 对 /api/* 的 POST/PUT/DELETE/PATCH 方法校验 Origin 或 Referer header
 * - 若 Origin 和 Referer 都不存在或不匹配允许域名，返回 403
 * - GET/HEAD/OPTIONS 放行
 *
 * 安全响应头（P3 新增，作为 API 响应的额外保障）：
 * - X-Content-Type-Options: nosniff
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: camera=(), microphone=(), geolocation=()
 * 注：next.config.ts 已全局配置这些头，此处对 API 响应做二次保障。
 */

/** 安全的 HTTP 方法，不需要 CSRF 校验 */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * 从 Origin 或 Referer header 中提取请求来源 origin。
 * 优先使用 Origin header；若不存在则尝试从 Referer 解析 origin。
 * @returns origin 字符串（如 "https://example.com"），无法确定时返回 null
 */
function extractRequestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (origin) {
    return origin;
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      // Referer 格式非法，视为无来源
      return null;
    }
  }

  return null;
}

/** 读取允许的域名列表 */
function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** 为响应注入安全响应头 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export function middleware(request: NextRequest) {
  const allowedOrigins = getAllowedOrigins();
  const isProduction = process.env.NODE_ENV === 'production';

  // 仅对 /api/* 路径做 CORS 与 CSRF 校验
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');

    // 1. CORS 校验（P2 修复，保留）
    // 生产环境下，若 Origin 存在且不在允许列表中则返回 403
    if (origin && !allowedOrigins.includes(origin) && isProduction) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'CORS 禁止' }, { status: 403 })
      );
    }

    // 2. CSRF 校验（P3 新增）
    // 对非安全方法（POST/PUT/DELETE/PATCH）校验 Origin 或 Referer
    if (!SAFE_METHODS.includes(request.method.toUpperCase())) {
      const requestOrigin = extractRequestOrigin(request);

      // Origin 和 Referer 都不存在，或不匹配允许域名，返回 403
      if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'CSRF 校验失败：无效的来源' }, { status: 403 })
        );
      }
    }
  }

  // 3. 注入安全响应头
  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: '/api/:path*',
};
