import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TokenPayload } from './security';
import { SESSION_COOKIE_NAME } from './session';

export interface AuthResult {
  authenticated: boolean;
  payload: TokenPayload | null;
  error?: string;
  status?: number;
}

export interface AuthOptions {
  requiredRoles?: string[];
  allowTeam?: boolean;
  allowParent?: boolean;
}

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    return sessionCookie.value;
  }

  return null;
}

export function authenticateRequest(
  request: NextRequest,
  options: AuthOptions = {}
): AuthResult {
  const token = extractToken(request);

  if (!token) {
    return {
      authenticated: false,
      payload: null,
      error: '未提供认证令牌',
      status: 401,
    };
  }

  const payload = verifyToken(token);

  if (!payload) {
    return {
      authenticated: false,
      payload: null,
      error: '认证令牌无效或已过期',
      status: 401,
    };
  }

  if (options.requiredRoles && options.requiredRoles.length > 0) {
    const allowedRoles = [...options.requiredRoles];
    if (options.allowTeam) allowedRoles.push('team');
    if (options.allowParent) allowedRoles.push('parent');

    if (!allowedRoles.includes(payload.role)) {
      return {
        authenticated: false,
        payload: null,
        error: '权限不足',
        status: 403,
      };
    }
  }

  return {
    authenticated: true,
    payload,
  };
}

export function requireAdmin(request: NextRequest): AuthResult {
  return authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin'],
  });
}

export function requireSuperAdmin(request: NextRequest): AuthResult {
  const auth = authenticateRequest(request);
  if (!auth.authenticated) return auth;
  if (auth.payload!.role !== 'super_admin') {
    return {
      authenticated: false,
      status: 403,
      error: '需要超级管理员权限',
    };
  }
  return auth;
}

export function requireAdminOrVolunteer(request: NextRequest): AuthResult {
  return authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer'],
  });
}

export function requireAdminOrTeacher(request: NextRequest): AuthResult {
  return authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'teacher'],
  });
}

export function requireTeam(request: NextRequest): AuthResult {
  return authenticateRequest(request, {
    requiredRoles: ['team'],
    allowTeam: true,
  });
}

export function requireParent(request: NextRequest): AuthResult {
  return authenticateRequest(request, {
    requiredRoles: ['parent'],
    allowParent: true,
  });
}

export function requireAnyAuth(request: NextRequest): AuthResult {
  return authenticateRequest(request);
}

export function authError(result: AuthResult): NextResponse {
  return NextResponse.json(
    { error: result.error || '认证失败' },
    { status: result.status || 401 }
  );
}

export function safeError(error: unknown): NextResponse {
  console.error('API错误:', error);
  // 生产环境只返回通用消息，开发环境附带调试信息
  const isDev = process.env.NODE_ENV === 'development';
  const body: Record<string, unknown> = { error: '服务器内部错误，请稍后重试' };
  if (isDev) {
    body.detail = error instanceof Error ? error.message : String(error);
  }
  return NextResponse.json(body, { status: 500 });
}

/**
 * 安全修复 VULN-API-015: 构建内部 fetch 调用所需的鉴权头。
 *
 * 在服务端发起内部 fetch（调用同项目其他 /api 路由）时，原始请求的
 * Authorization 头和 Cookie 不会自动透传，会导致内部接口返回 401。
 * 此函数从原始请求中提取这些凭据并返回一个新的 headers 对象，供内部
 * fetch 调用使用，避免凭据丢失引发鉴权失败。
 *
 * 注意：仅返回包含凭据的头，调用方按需合并其他自定义头。
 */
export function buildInternalAuthHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;
  const cookie = request.headers.get('cookie');
  if (cookie) headers['Cookie'] = cookie;
  return headers;
}
