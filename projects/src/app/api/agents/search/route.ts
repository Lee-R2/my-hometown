import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 智能体白名单
const ALLOWED_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

// 搜索记忆
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const agentUsername = searchParams.get('agentUsername');
    const keyword = searchParams.get('keyword');
    const memoryTypes = searchParams.get('types')?.split(',') || [];
    const minImportance = parseInt(searchParams.get('minImportance') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    if (!keyword) {
      return ApiErrors.validation('缺少搜索关键词');
    }

    const client = getSupabaseClient();

    // 使用模糊搜索
    const { data, error } = await client
      .from('agent_memories')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .gte('importance', minImportance)
      .ilike('content', `%${keyword}%`)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // 过滤记忆类型
    let filteredData = data || [];
    if (memoryTypes.length > 0) {
      filteredData = filteredData.filter(item => memoryTypes.includes(item.memory_type));
    }

    return NextResponse.json({
      success: true,
      memories: filteredData,
      count: filteredData.length
    });

  } catch (error: any) {
    console.error('搜索记忆失败:', error);
    return safeError(error);
  }
}
