import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 提醒事项管理 API
 * 支持蜡象助手管理来自银蛇博士的提醒
 */

// 标记提醒为已读
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, reminderIds } = body;

    if (!action || !reminderIds || !Array.isArray(reminderIds)) {
      return ApiErrors.validation('缺少必要参数');
    }

    const client = getSupabaseAdminClient();
    const now = new Date().toISOString();

    if (action === 'read') {
      // 标记为已读
      const { error } = await client
        .from('agent_reminders')
        .update({ 
          is_read: true,
          read_at: now
        })
        .in('id', reminderIds);

      if (error) throw error;
      return NextResponse.json({ success: true, message: '已标记为已读' });
    }

    if (action === 'dismiss') {
      // 忽略提醒
      const { error } = await client
        .from('agent_reminders')
        .update({ 
          is_dismissed: true,
          dismissed_at: now
        })
        .in('id', reminderIds);

      if (error) throw error;
      return NextResponse.json({ success: true, message: '已忽略' });
    }

    if (action === 'read_all') {
      // 全部标记为已读
      const { error } = await client
        .from('agent_reminders')
        .update({ 
          is_read: true,
          read_at: now
        })
        .eq('agent_username', 'laxiang_zhushou')
        .eq('is_read', false)
        .eq('is_dismissed', false);

      if (error) throw error;
      return NextResponse.json({ success: true, message: '全部已读' });
    }

    return ApiErrors.validation('未知操作');
  } catch (error: any) {
    console.error('[提醒管理] 操作失败:', error);
    return safeError(error);
  }
}

// 获取提醒列表
export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');  // unread, read, dismissed, all
    const priority = searchParams.get('priority');  // high, normal, low
    const limit = parseInt(searchParams.get('limit') || '20');

    const client = getSupabaseAdminClient();
    
    let query = client
      .from('agent_reminders')
      .select('*')
      .eq('agent_username', 'laxiang_zhushou')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status === 'unread') {
      query = query.eq('is_read', false).eq('is_dismissed', false);
    } else if (status === 'read') {
      query = query.eq('is_read', true);
    } else if (status === 'dismissed') {
      query = query.eq('is_dismissed', true);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      unreadCount: data?.filter(r => !r.is_read && !r.is_dismissed).length || 0
    });
  } catch (error: any) {
    return safeError(error);
  }
}
