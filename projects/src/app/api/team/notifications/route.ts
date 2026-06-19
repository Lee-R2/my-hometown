import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 获取小队通知列表
 * GET /api/team/notifications?teamId=xxx&type=xxx&unreadOnly=true
 */
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;
    const type = searchParams.get('type');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    let query = client
      .from('team_notifications')
      .select('*', { count: 'exact' })
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq('type', type);
    }

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('获取通知列表失败:', error);
      return supabaseErrorResponse(error, '获取通知列表失败');
    }

    // 获取未读数量
    const { count: unreadCount } = await client
      .from('team_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_read', false);

    return NextResponse.json({
      notifications: data || [],
      total: count || 0,
      unreadCount: unreadCount || 0,
    });
  } catch (error) {
    console.error('获取通知列表错误:', error);
    return safeError(error);
  }
}

/**
 * 发送通知
 * POST /api/team/notifications
 * 
 * 通知类型：
 * - submission_feedback: 产出审核反馈
 * - volunteer_message: 志愿者消息
 * - reward_earned: 获得激励
 * - system: 系统通知
 * - side_task: 支线任务分配
 */
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const {
      type,
      title,
      content,
      submissionId,
      taskId,
      rewardId,
      senderName,
      extraData,
    } = body;

    if (!type || !title || !content) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 强制使用认证令牌中的 userId 作为 teamId，防止横向越权
    const teamId = auth.payload!.userId;
    // 发送者身份从认证令牌获取，防止小队伪造 senderId 冒充志愿者/老师
    const senderId = teamId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const { data, error } = await client
      .from('team_notifications')
      .insert({
        team_id: teamId,
        type,
        title,
        content,
        submission_id: submissionId,
        task_id: taskId,
        reward_id: rewardId,
        sender_id: senderId,
        sender_name: senderName,
        extra_data: extraData,
      })
      .select()
      .single();

    if (error) {
      console.error('发送通知失败:', error);
      return supabaseErrorResponse(error, '发送通知失败');
    }

    return NextResponse.json({ success: true, notification: data });
  } catch (error) {
    console.error('发送通知错误:', error);
    return safeError(error);
  }
}
