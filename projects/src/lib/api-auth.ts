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
  return NextResponse.json(
    { error: '服务器内部错误，请稍后重试' },
    { status: 500 }
  );
}
