import { NextRequest, NextResponse } from 'next/server';
import { requireAnyAuth, authError } from '@/lib/api-auth';
import { invalidateSession, SESSION_COOKIE_NAME } from '@/lib/session';
import { ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    // LE-A05: 从 Authorization header 和 Cookie 双路径提取 token,确保登出能正确失效会话
    const headerToken = request.headers.get('authorization')?.replace('Bearer ', '') || '';
    const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value || '';
    const token = headerToken || cookieToken;
    if (token) {
      await invalidateSession(token);
    }

    const response = NextResponse.json({ success: true, message: '登出成功' });
    // LE-A05: 使用正确的 cookie 名(SESSION_COOKIE_NAME),而非硬编码的 'session_token'
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    return ApiErrors.internal('登出失败');
  }
}
