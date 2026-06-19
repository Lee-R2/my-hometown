/**
 * Agent 记忆存储模块
 * 
 * 分层架构（5层）：
 * L0 - 感觉缓冲：当前对话的原始输入，仅内存，不持久化
 * L1 - 工作记忆：当前会话的活跃上下文，session_state 表
 * L2 - 短期记忆：近期重要信息，agent_memories 表，有过期时间
 * L3 - 长期记忆：蒸馏后的核心知识，agent_memories 表，永不过期
 * L4 - 核心身份：不可变的人格/偏好，agent_memories 表，永不过期
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 记忆层级
export type MemoryLayer = 0 | 1 | 2 | 3 | 4;

export const LAYER_CONFIG = {
  0: { name: '感觉缓冲', ttl: 0, description: '当前对话原始输入，仅内存' },
  1: { name: '工作记忆', ttl: 4 * 60 * 60 * 1000, description: '当前会话活跃上下文，4小时过期' },
  2: { name: '短期记忆', ttl: 7 * 24 * 60 * 60 * 1000, description: '近期重要信息，7天过期' },
  3: { name: '长期记忆', ttl: null, description: '蒸馏后的核心知识，永不过期' },
  4: { name: '核心身份', ttl: null, description: '不可变的人格/偏好，永不过期' },
} as const;

export interface MemoryEntry {
  id?: string;
  agent_username: string;
  user_id?: string;
  layer: MemoryLayer;
  memory_type: string;
  key: string;
  content: string;
  importance: number; // 0-1
  access_count: number;
  source_ids?: string[];
  expires_at?: string;
  created_at?: string;
  last_accessed_at?: string;
}

export interface SessionState {
  session_id: string;
  agent_username: string;
  user_id?: string;
  state_data: Record<string, unknown>;
  working_buffer: Record<string, unknown>;
}

/**
 * 保存记忆到指定层级
 */
export async function saveMemory(entry: Omit<MemoryEntry, 'id' | 'access_count' | 'last_accessed_at'>): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const config = LAYER_CONFIG[entry.layer];
    
    const expiresAt = config.ttl 
      ? new Date(Date.now() + config.ttl).toISOString()
      : entry.layer >= 3 ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('agent_memories')
      .insert({
        agent_username: entry.agent_username,
        user_id: entry.user_id,
        layer: entry.layer,
        memory_type: entry.memory_type,
        key: entry.key,
        content: entry.content,
        importance: entry.importance,
        access_count: 0,
        source_ids: entry.source_ids,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[MemoryStore] Save failed:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.error('[MemoryStore] Save error:', err);
    return null;
  }
}

/**
 * 读取指定层级的记忆
 */
export async function loadMemories(params: {
  agent_username: string;
  user_id?: string;
  layer?: MemoryLayer;
  memory_type?: string;
  limit?: number;
  includeExpired?: boolean;
}): Promise<MemoryEntry[]> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('agent_memories')
      .select('*')
      .eq('agent_username', params.agent_username)
      .order('importance', { ascending: false });

    if (params.user_id) {
      query = query.eq('user_id', params.user_id);
    }
    if (params.layer !== undefined) {
      query = query.eq('layer', params.layer);
    }
    if (params.memory_type) {
      query = query.eq('memory_type', params.memory_type);
    }
    if (!params.includeExpired) {
      query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    }

    const limit = params.limit || 50;
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[MemoryStore] Load failed:', error.message);
      return [];
    }

    // 更新访问计数和最后访问时间
    if (data && data.length > 0) {
      const ids = data.map(d => d.id);
      await supabase
        .from('agent_memories')
        .update({ 
          access_count: supabase.rpc('increment', { x: 1 }),
          last_accessed_at: new Date().toISOString()
        })
        .in('id', ids);
    }

    return (data || []).map(d => ({
      ...d,
      layer: d.layer as MemoryLayer,
    }));
  } catch (err) {
    console.error('[MemoryStore] Load error:', err);
    return [];
  }
}

/**
 * 搜索记忆（模糊匹配）
 */
export async function searchMemories(params: {
  agent_username: string;
  user_id?: string;
  keyword: string;
  limit?: number;
}): Promise<MemoryEntry[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('agent_memories')
      .select('*')
      .eq('agent_username', params.agent_username)
      .or(`key.ilike.%${params.keyword}%,content.ilike.%${params.keyword}%`)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('importance', { ascending: false })
      .limit(params.limit || 20);

    if (error) {
      console.error('[MemoryStore] Search failed:', error.message);
      return [];
    }
    return (data || []).map(d => ({ ...d, layer: d.layer as MemoryLayer }));
  } catch (err) {
    console.error('[MemoryStore] Search error:', err);
    return [];
  }
}

/**
 * 蒸馏：将 L2 短期记忆中的重要内容提升到 L3 长期记忆
 */
export async function distillMemories(params: {
  agent_username: string;
  user_id?: string;
  minImportance?: number;
  minAccessCount?: number;
}): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const minImportance = params.minImportance || 0.7;
    const minAccessCount = params.minAccessCount || 2;

    // 查找符合条件的短期记忆
    const { data: shortTermMemories, error: fetchError } = await supabase
      .from('agent_memories')
      .select('*')
      .eq('agent_username', params.agent_username)
      .eq('layer', 2)
      .gte('importance', minImportance)
      .gte('access_count', minAccessCount);

    if (fetchError || !shortTermMemories || shortTermMemories.length === 0) {
      return 0;
    }

    // 批量提升到 L3
    const ids = shortTermMemories.map(m => m.id);
    const { error: updateError } = await supabase
      .from('agent_memories')
      .update({ 
        layer: 3, 
        expires_at: null,
        content: `[蒸馏] ${shortTermMemories.find(m => m.id === ids[0])?.content || ''}`
      })
      .in('id', ids);

    if (updateError) {
      console.error('[MemoryStore] Distill update failed:', updateError.message);
      return 0;
    }

    return ids.length;
  } catch (err) {
    console.error('[MemoryStore] Distill error:', err);
    return 0;
  }
}

/**
 * 清理过期记忆
 */
export async function cleanExpiredMemories(agentUsername: string): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('agent_memories')
      .delete()
      .eq('agent_username', agentUsername)
      .lt('expires_at', new Date().toISOString())
      .lt('layer', 3) // 不删除 L3/L4
      .select('id');

    if (error) {
      console.error('[MemoryStore] Clean failed:', error.message);
      return 0;
    }
    return data?.length || 0;
  } catch (err) {
    console.error('[MemoryStore] Clean error:', err);
    return 0;
  }
}

/**
 * 保存会话状态（L1 工作记忆）
 */
export async function saveSessionState(state: Omit<SessionState, 'created_at' | 'updated_at'>): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('agent_session_states')
      .upsert({
        session_id: state.session_id,
        agent_username: state.agent_username,
        user_id: state.user_id,
        state_data: state.state_data,
        working_buffer: state.working_buffer,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + LAYER_CONFIG[1].ttl).toISOString(),
      }, { onConflict: 'session_id' });

    if (error) {
      console.error('[MemoryStore] Session save failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[MemoryStore] Session save error:', err);
    return false;
  }
}

/**
 * 加载会话状态
 */
export async function loadSessionState(sessionId: string, agentUsername: string): Promise<SessionState | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('agent_session_states')
      .select('*')
      .eq('session_id', sessionId)
      .eq('agent_username', agentUsername)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data as SessionState;
  } catch (err) {
    console.error('[MemoryStore] Session load error:', err);
    return null;
  }
}
