import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取未读通知数量
 * GET /api/team/notifications/unread-count?teamId=xxx
 */
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getAuthenticatedClient(request, auth);
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取总未读数
    const { count: totalCount } = await client
      .from('team_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_read', false);

    // 按类型分组统计
    const { data: typeCounts } = await client
      .from('team_notifications')
      .select('type')
      .eq('team_id', teamId)
      .eq('is_read', false);

    const countsByType: Record<string, number> = {};
    (typeCounts || []).forEach((item: { type: string }) => {
      countsByType[item.type] = (countsByType[item.type] || 0) + 1;
    });

    return NextResponse.json({
      total: totalCount || 0,
      byType: countsByType,
    });
  } catch (error) {
    console.error('获取未读数量错误:', error);
    return safeError(error);
  }
}
