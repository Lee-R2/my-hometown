import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 智能体白名单
const ALLOWED_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

// 获取与上下文相关的记忆
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const agentUsername = searchParams.get('agentUsername');
    const contextKey = searchParams.get('contextKey');
    const contextValue = searchParams.get('contextValue');
    const limit = parseInt(searchParams.get('limit') || '20');

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    const client = getSupabaseAdminClient();

    let query = client
      .from('agent_memories')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    // 如果提供了上下文参数，优先查询特定上下文
    if (contextKey && contextValue) {
      query = query.eq('context_key', contextKey).eq('context_value', contextValue);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      memories: data || [],
      count: data?.length || 0
    });

  } catch (error: any) {
    console.error('获取上下文记忆失败:', error);
    return safeError(error);
  }
}
