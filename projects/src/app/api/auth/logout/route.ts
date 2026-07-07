import { NextRequest, NextResponse } from 'next/server';
import { requireAnyAuth, authError } from '@/lib/api-auth';
import { invalidateSession } from '@/lib/session';
import { ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') || '';
    await invalidateSession(token);

    const response = NextResponse.json({ success: true, message: '登出成功' });
    response.cookies.delete('session_token');
    return response;
  } catch (error) {
    return ApiErrors.internal('登出失败');
  }
}
