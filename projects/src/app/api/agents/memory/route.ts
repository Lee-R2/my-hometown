import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// 智能体白名单
const ALLOWED_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

// 添加记忆
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { agentUsername, memoryType, content, contextKey, contextValue, importance } = body;

    // 验证智能体
    if (!agentUsername || !ALLOWED_AGENTS.includes(agentUsername)) {
      return ApiErrors.validation('无效的智能体');
    }

    // 验证记忆类型
    const validTypes = ['user_info', 'team_info', 'task_progress', 'preference', 'important_fact', 'conversation_summary'];
    if (!memoryType || !validTypes.includes(memoryType)) {
      return ApiErrors.validation('无效的记忆类型');
    }

    // 验证内容
    if (!content || content.trim().length === 0) {
      return ApiErrors.validation('记忆内容不能为空');
    }

    const client = getSupabaseAdminClient();

    // 检查是否已存在相同的记忆（避免重复）
    if (contextKey && contextValue) {
      const { data: existing } = await client
        .from('agent_memories')
        .select('id')
        .eq('agent_username', agentUsername)
        .eq('memory_type', memoryType)
        .eq('context_key', contextKey)
        .eq('context_value', contextValue)
        .eq('is_active', true)
        .single();

      if (existing) {
        // 更新已有记忆
        const { data, error } = await client
          .from('agent_memories')
          .update({
            content,
            importance: importance || 5,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: '记忆已更新',
          memory: data
        });
      }
    }

    // 新增记忆
    const { data, error } = await client
      .from('agent_memories')
      .insert({
        agent_username: agentUsername,
        memory_type: memoryType,
        content,
        context_key: contextKey,
        context_value: contextValue,
        importance: importance || 5,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '记忆已添加',
      memory: data
    });

  } catch (error: any) {
    console.error('添加记忆失败:', error);
    return safeError(error);
  }
}

// 获取记忆列表
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const agentUsername = searchParams.get('agentUsername');
    const memoryType = searchParams.get('memoryType');
    const contextKey = searchParams.get('contextKey');
    const contextValue = searchParams.get('contextValue');
    const minImportance = searchParams.get('minImportance');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

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
      .range(offset, offset + limit - 1);

    if (memoryType) {
      query = query.eq('memory_type', memoryType);
    }

    if (contextKey && contextValue) {
      query = query.eq('context_key', contextKey).eq('context_value', contextValue);
    }

    if (minImportance) {
      query = query.gte('importance', parseInt(minImportance));
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      memories: data || [],
      total: count || 0
    });

  } catch (error: any) {
    console.error('获取记忆失败:', error);
    return safeError(error);
  }
}
