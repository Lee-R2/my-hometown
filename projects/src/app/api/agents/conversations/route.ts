import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 智能体白名单
const ALLOWED_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

// 添加对话消息
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { agentUsername, userId, userName, sessionId, role, content } = body;

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    // 验证会话ID
    if (!sessionId) {
      return ApiErrors.validation('缺少会话ID');
    }

    // 验证角色
    if (!role || !['user', 'assistant'].includes(role)) {
      return ApiErrors.validation('无效的角色');
    }

    // 验证内容
    if (!content || content.trim().length === 0) {
      return ApiErrors.validation('消息内容不能为空');
    }

    const client = getSupabaseClient();

    // 更新会话的最后活动时间
    await client
      .from('agent_sessions')
      .update({
        last_activity_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .eq('is_active', true);

    // 添加对话消息
    const { data, error } = await client
      .from('agent_conversations')
      .insert({
        agent_username: agentUsername,
        user_id: userId,
        user_name: userName,
        session_id: sessionId,
        role,
        content
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '消息已保存',
      messageId: data.id
    });

  } catch (error: any) {
    console.error('保存对话失败:', error);
    return safeError(error);
  }
}

// 获取对话历史
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const agentUsername = searchParams.get('agentUsername');
    const sessionId = searchParams.get('sessionId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    // 验证会话ID
    if (!sessionId) {
      return ApiErrors.validation('缺少会话ID');
    }

    const client = getSupabaseClient();
    const { data, error, count } = await client
      .from('agent_conversations')
      .select('*', { count: 'exact' })
      .eq('agent_username', agentUsername)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      conversations: data || [],
      total: count || 0
    });

  } catch (error: any) {
    console.error('获取对话历史失败:', error);
    return safeError(error);
  }
}
