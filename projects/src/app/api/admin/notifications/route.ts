import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireAnyAuth, authError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取管理志愿者的通知列表
 * GET /api/admin/notifications?userId=xxx&userRole=xxx&unreadOnly=true
 */

export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 身份从认证令牌获取，防止伪造身份查看他人通知
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const client = getSupabaseAdminClient();

    // 构建查询条件
    let query = client
      .from('notifications')
      .select('*')
      .or(`target_id.eq.${userId},target_type.eq.all${userRole === 'admin' || userRole === 'super_admin' ? ',target_type.eq.admin' : ''}${userRole === 'volunteer' ? ',target_type.eq.volunteer' : ''}${userRole === 'teacher' ? ',target_type.eq.teacher' : ''}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取通知列表失败:', error);
      return ApiErrors.validation('获取失败');
    }

    return NextResponse.json({ 
      success: true,
      notifications: data || [] 
    });
  } catch (error) {
    console.error('获取通知列表失败:', error);
    return ApiErrors.validation('获取通知列表失败');
  }
}

/**
 * 标记通知为已读
 * POST /api/admin/notifications
 * Body: { notificationId: string } { markAllRead: true, userId: string }
 */

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();
    // 身份从认证令牌获取，只能标记自己的通知为已读
    const userId = auth.payload!.userId;

    if (body.markAllRead) {
      // 标记所有通知为已读
      const { error } = await client
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('is_read', false)
        .eq('target_id', userId);

      if (error) {
        console.error('标记所有通知已读失败:', error);
        return ApiErrors.validation('操作失败');
      }

      return NextResponse.json({ success: true, message: '已全部标记为已读' });
    }

    if (body.notificationId) {
      // LE-A07/A12: 标记单个通知为已读时,必须校验通知归属(target_id === 当前用户),
      // 防止任意用户标记他人通知为已读
      const { error } = await client
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', body.notificationId)
        .eq('target_id', userId);

      if (error) {
        console.error('标记通知已读失败:', error);
        return ApiErrors.validation('操作失败');
      }

      return NextResponse.json({ success: true });
    }

    return ApiErrors.validation('缺少参数');
  } catch (error) {
    console.error('标记通知已读失败:', error);
    return ApiErrors.validation('标记通知已读失败');
  }
}
