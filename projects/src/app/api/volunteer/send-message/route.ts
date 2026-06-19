import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 志愿者发送消息给小队
 * POST /api/volunteer/send-message
 */
export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { teamId, title, content, senderName } = body;

    if (!teamId || !content) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 发送者身份从认证令牌获取，防止客户端伪造 senderId 冒充其他志愿者
    const senderId = auth.payload!.userId;

    // 验证发送人是否为志愿者/老师/管理员（从令牌获取，非客户端传入）
    const { data: sender } = await client
      .from('users')
      .select('id, role, name')
      .eq('id', senderId)
      .single();

    if (!sender || !['volunteer', 'teacher', 'admin'].includes(sender.role)) {
      return ApiErrors.forbidden('无权发送消息');
    }

    // 验证志愿者是否可以操作该小队
    if (sender.role === 'volunteer') {
      const { data: team } = await client
        .from('teams')
        .select('created_by')
        .eq('id', teamId)
        .single();

      if (team?.created_by !== senderId) {
        return ApiErrors.forbidden('无权向该小队发送消息');
      }
    }

    // 发送通知
    // 当发送者是助学老师时，使用"雾影博士"作为显示名称
    const senderDisplayName = sender?.role === 'teacher' ? '雾影博士' : (senderName || undefined);
    const notificationTitle = sender?.role === 'teacher' 
      ? '雾影博士发来消息'
      : (title || '志愿者老师发来消息');

    const { data: notification, error } = await client
      .from('team_notifications')
      .insert({
        team_id: teamId,
        type: 'volunteer_message',
        title: notificationTitle,
        content,
        sender_id: senderId,
        sender_name: senderDisplayName,
        extra_data: {
          sender_role: sender?.role || undefined,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('发送消息失败', error);
      return supabaseErrorResponse(error, '发送消息失败');
    }

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error('发送消息错误', error);
    return ApiErrors.validation('发送消息失败');
  }
}
