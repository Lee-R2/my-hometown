import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { receiver_id, title, content, related_type, related_id, notification_type } = body;

    if (!receiver_id || !notification_type) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 发送者身份从认证令牌获取（notifications 表无 sender_id 字段，仅用于审计日志）
    const senderId = auth.payload!.userId;
    console.log(`[通知发送] sender: ${senderId}, receiver: ${receiver_id}, type: ${notification_type}`);

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        type: notification_type,
        title: title || '',
        content: content || '',
        target_type: 'user',
        target_id: receiver_id,
        related_type,
        related_id,
        notification_type,
        is_read: false
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('发送通知失败:', error);
    return safeError(error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { notifications } = body;

    if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
      return ApiErrors.validation('缺少通知数据');
    }

    const supabase = getSupabaseClient();

    const insertData = notifications.map((n: any) => ({
      type: n.notification_type || 'system',
      title: n.title || '',
      content: n.content || '',
      target_type: 'user',
      target_id: n.receiver_id,
      related_type: n.related_type,
      related_id: n.related_id,
      notification_type: n.notification_type,
      is_read: false
    }));

    const { data, error } = await supabase
      .from('notifications')
      .insert(insertData)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('批量发送通知失败:', error);
    return safeError(error);
  }
}
