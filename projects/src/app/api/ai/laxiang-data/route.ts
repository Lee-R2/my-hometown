import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getLaxiangData } from '@/lib/laxiang-data';

/**
 * 蜡象助手管理后台数据查询 API
 * 整合管理员后台所有模块的数据查询能力
 */

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') ?? undefined;
    const userRole = searchParams.get('role') ?? undefined;
    const dataType = searchParams.get('type') ?? 'dashboard';
    const schoolId = searchParams.get('schoolId') ?? undefined;

    const result: Record<string, any> = { success: true, userRole, dataType };

    // 根据类型查询数据
    result.data = await getLaxiangData(dataType, userRole, userId, schoolId);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[蜡象助手数据] 查询失败:', error);
    return safeError(error);
  }
}
