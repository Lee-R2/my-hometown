import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';

// 生成签名URL
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { keys } = body;

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return ApiErrors.validation('缺少文件key列表');
    }

    const urls = await Promise.all(
      keys.map((key: string) =>
        generateSignedUrl({ key, expireTime: 3600 })
      )
    );

    return NextResponse.json({
      success: true,
      data: urls,
    });
  } catch (error: any) {
    console.error('生成签名URL失败:', error);
    return safeError(error);
  }
}
