/**
 * 自省存储模块 — 基于 Supabase 的持久化存储
 * 
 * 替代原始技能的文件系统存储（.learnings/ 目录），
 * 使用 Supabase 数据库确保数据持久化和跨会话共享。
 */

import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import type { LearningCategory, LearningArea, LearningStatus, ReflectionEntry } from './reflection-engine';

// ========== 数据库初始化 ==========

/**
 * 确保 agent_reflections 表存在
 * 注意：表需要预先在 Supabase SQL Editor 中创建（参见 sql-create-agent-reflections.sql）
 * 此函数仅做简单检查，不再尝试通过 RPC 创建表
 */
export async function ensureReflectionTable(): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  
  // 简单检查表是否存在
  const { error } = await supabase
    .from('agent_reflections')
    .select('id')
    .limit(1);
  
  if (error) {
    console.error('[self-improving] agent_reflections 表不存在，请在 Supabase SQL Editor 中执行建表 SQL');
    return false;
  }
  
  return true;
}

// ========== CRUD 操作 ==========

/**
 * 保存自省条目
 */
export async function saveReflection(entry: ReflectionEntry): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('agent_reflections')
    .insert({
      agent_id: entry.agent_id,
      user_id: entry.user_id || null,
      session_id: entry.session_id || null,
      category: entry.category,
      area: entry.area,
      priority: entry.priority,
      status: entry.status,
      trigger_context: entry.trigger_context || null,
      learning: entry.learning,
      action_item: entry.action_item || null,
      team_id: entry.team_id || null,
      school_id: entry.school_id || null,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('[self-improving] 保存自省条目失败:', error.message);
    return null;
  }
  
  return data?.id || null;
}

/**
 * 批量保存自省条目
 */
export async function saveReflections(entries: ReflectionEntry[]): Promise<number> {
  const supabase = getSupabaseAdminClient();
  
  const rows = entries.map(entry => ({
    agent_id: entry.agent_id,
    user_id: entry.user_id || null,
    session_id: entry.session_id || null,
    category: entry.category,
    area: entry.area,
    priority: entry.priority,
    status: entry.status,
    trigger_context: entry.trigger_context || null,
    learning: entry.learning,
    action_item: entry.action_item || null,
    team_id: entry.team_id || null,
    school_id: entry.school_id || null,
  }));
  
  const { error } = await supabase
    .from('agent_reflections')
    .insert(rows);
  
  if (error) {
    console.error('[self-improving] 批量保存失败:', error.message);
    return 0;
  }
  
  return rows.length;
}

/**
 * 获取智能体的自省历史
 */
export async function getReflections(
  agentId: string,
  options?: {
    category?: LearningCategory;
    area?: LearningArea;
    status?: LearningStatus;
    limit?: number;
    since?: string;  // ISO date
  }
): Promise<ReflectionEntry[]> {
  const supabase = getSupabaseAdminClient();
  
  let query = supabase
    .from('agent_reflections')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  
  if (options?.category) query = query.eq('category', options.category);
  if (options?.area) query = query.eq('area', options.area);
  if (options?.status) query = query.eq('status', options.status);
  if (options?.since) query = query.gte('created_at', options.since);
  if (options?.limit) query = query.limit(options.limit);
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[self-improving] 获取自省历史失败:', error.message);
    return [];
  }
  
  return (data || []).map(mapRowToEntry);
}

/**
 * 更新自省条目状态（标记已解决/已内化）
 */
export async function updateReflectionStatus(
  reflectionId: string,
  status: LearningStatus,
  correction?: string
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  
  const updates: Record<string, unknown> = { 
    status,
    resolved_at: status === 'resolved' || status === 'promoted' ? new Date().toISOString() : null,
  };
  if (correction) updates.correction = correction;
  
  const { error } = await supabase
    .from('agent_reflections')
    .update(updates)
    .eq('id', reflectionId);
  
  return !error;
}

/**
 * 批量更新：将同一错误的多个记录标记为已解决
 */
export async function resolveByPattern(
  agentId: string,
  area: LearningArea,
  learningKeyword: string
): Promise<number> {
  const supabase = getSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('agent_reflections')
    .update({ 
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('agent_id', agentId)
    .eq('area', area)
    .ilike('learning', `%${learningKeyword}%`)
    .neq('status', 'resolved')
    .select('id');
  
  if (error) return 0;
  return data?.length || 0;
}

/**
 * 执行统计查询 SQL（通过 exec_safe_sql RPC）
 */
export async function executeStatsQuery(sql: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdminClient();
  
  const { data, error } = await supabase.rpc('exec_safe_sql', { query_text: sql });
  
  if (error) {
    console.error('[self-improving] 统计查询失败:', error.message);
    return [];
  }
  
  // exec_safe_sql 返回 { success: true, data: [...] }
  if (data && typeof data === 'object' && data.success === true && Array.isArray(data.data)) {
    return data.data as Record<string, unknown>[];
  }
  
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  
  return [];
}

// ========== 映射辅助 ==========

function mapRowToEntry(row: Record<string, unknown>): ReflectionEntry {
  return {
    id: row.id as string,
    agent_id: row.agent_id as string,
    user_id: (row.user_id as string) || '',
    session_id: (row.session_id as string) || '',
    category: row.category as LearningCategory,
    area: row.area as LearningArea,
    priority: (row.priority as 'low' | 'medium' | 'high' | 'critical') || 'low',
    status: row.status as LearningStatus,
    trigger_context: (row.trigger_context as string) || (row.context as string) || '',
    learning: row.learning as string,
    action_item: (row.action_item as string) || '',
    team_id: row.team_id as string | undefined,
    school_id: row.school_id as string | undefined,
    created_at: row.created_at as string,
    resolved_at: row.resolved_at as string | undefined,
    occurrence_count: (row.occurrence_count as number) || 1,
  };
}
