import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 智能体白名单
const ALLOWED_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

// 创建或获取会话
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { agentUsername, userId, teamId, sessionId, userRole, metadata } = body;

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    // LE-A09: 强制使用认证令牌中的身份,防止冒充其他用户创建会话
    const effectiveUserId = auth.payload!.userId;
    const effectiveUserRole = auth.payload!.role;
    if (auth.payload!.role !== 'super_admin' && userId && userId !== effectiveUserId) {
      return ApiErrors.forbidden('无权为其他用户创建会话');
    }
    const finalUserId = (auth.payload!.role === 'super_admin' && userId) ? userId : effectiveUserId;

    // 如果没有提供sessionId，生成一个新的
    const finalSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const client = getSupabaseAdminClient();

    // 检查会话是否已存在
    const { data: existingSession } = await client
      .from('agent_sessions')
      .select('*')
      .eq('session_id', finalSessionId)
      .eq('is_active', true)
      .single();

    if (existingSession) {
      // 更新会话
      const { data, error } = await client
        .from('agent_sessions')
        .update({
          last_activity_at: new Date().toISOString(),
          metadata: metadata || existingSession.metadata
        })
        .eq('session_id', finalSessionId)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        session: data,
        isNew: false
      });
    }

    // 创建新会话
    const { data, error } = await client
      .from('agent_sessions')
      .insert({
        agent_username: agentUsername,
        user_id: finalUserId,
        team_id: teamId,
        session_id: finalSessionId,
        user_role: effectiveUserRole,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      session: data,
      isNew: true
    });

  } catch (error: any) {
    console.error('创建会话失败:', error);
    return safeError(error);
  }
}

// 获取会话列表
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const agentUsername = searchParams.get('agentUsername');
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    const client = getSupabaseAdminClient();
    let query = client
      .from('agent_sessions')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      sessions: data || [],
      total: count || 0
    });

  } catch (error: any) {
    console.error('获取会话列表失败:', error);
    return safeError(error);
  }
}
