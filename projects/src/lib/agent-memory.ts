import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 智能体记忆系统工具
 * 为银蛇博士和蜡象助手提供长期记忆能力
 */

// 智能体白名单
const ALLOWED_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

/**
 * 安全修复 LE-M02: 批量更新记忆的最后访问时间(时间衰减系统的基础)
 * 记忆蒸馏器根据 last_accessed_at 判断哪些记忆是低频访问的,从而进行归档/合并。
 * access_count 递增由蒸馏器在后台定期处理,避免并发写入冲突。
 * 访问时间更新失败不影响主流程(静默失败)。
 *
 * 安全修复 SEC-001: 新增 client 参数,允许调用方传入绑定用户身份的 anon 客户端
 * (RLS 生效)。不传时回退到默认客户端(阶段 3 后为 anon)。
 */
async function touchMemories(ids: string[], client?: SupabaseClient): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = client ?? getSupabaseAdminClient();
    await db
      .from('agent_memories')
      .update({ last_accessed_at: new Date().toISOString() })
      .in('id', ids);
  } catch (e) {
    // 访问时间更新失败不影响主流程
  }
}

// 记忆类型
export type MemoryType = 'user_info' | 'team_info' | 'task_progress' | 'preference' | 'important_fact' | 'conversation_summary' | 'learning_difficulty' | 'learning_interest' | 'interaction_style' | 'teaching_point' | 'admin_profile' | 'work_concern' | 'review_style' | 'school_context' | 'communication_style' | 'data_insight';

// 记忆数据结构
export interface Memory {
  id: string;
  agent_username: string;
  memory_type: MemoryType;
  content: string;
  context_key?: string;
  context_value?: string;
  importance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 对话数据结构
export interface Conversation {
  id: string;
  agent_username: string;
  user_id?: string;
  user_name?: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// 会话数据结构
export interface AgentSession {
  id: string;
  agent_username: string;
  user_id?: string;
  team_id?: string;
  session_id: string;
  user_role?: string;
  started_at: string;
  last_activity_at: string;
  is_active: boolean;
  metadata: any;
}

/**
 * 添加记忆
 */
export async function addMemory(
  agentUsername: string,
  memoryType: MemoryType,
  content: string,
  contextKey?: string,
  contextValue?: string,
  importance: number = 5,
  client?: SupabaseClient
): Promise<Memory | null> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return null;
  }

  try {
    const db = client ?? getSupabaseAdminClient();

    // 检查是否已存在相同的记忆
    if (contextKey && contextValue) {
      const { data: existing } = await db
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
        const { data, error } = await db
          .from('agent_memories')
          .update({
            content,
            importance,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    }

    // 新增记忆
    // LE-M06: L1 短期记忆设置 24h 过期时间,与系统提示词声明一致
    // task_progress / user_intent 等短期记忆类型设置 24h 过期,长期记忆永不过期
    const shortTermTypes: MemoryType[] = ['task_progress'];
    const expiresAt = shortTermTypes.includes(memoryType)
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null; // L2/L3 长期记忆永不过期(expires_at = null)
    const { data, error } = await db
      .from('agent_memories')
      .insert({
        agent_username: agentUsername,
        memory_type: memoryType,
        content,
        context_key: contextKey,
        context_value: contextValue,
        importance,
        is_active: true,
        expires_at: expiresAt,
        last_accessed_at: new Date().toISOString(),
        access_count: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('添加记忆失败:', error);
    return null;
  }
}

/**
 * 获取智能体的所有记忆
 */
export async function getMemories(
  agentUsername: string,
  options?: {
    memoryType?: MemoryType;
    contextKey?: string;
    contextValue?: string;
    minImportance?: number;
    limit?: number;
  },
  client?: SupabaseClient
): Promise<Memory[]> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return [];
  }

  try {
    const db = client ?? getSupabaseAdminClient();
    // 过滤已过期的 L1 短期记忆（expires_at 为 null 表示永不过期，gt now 表示未过期）
    const nowIso = new Date().toISOString();
    let query = db
      .from('agent_memories')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false });

    if (options?.memoryType) {
      query = query.eq('memory_type', options.memoryType);
    }

    if (options?.contextKey && options?.contextValue) {
      query = query.eq('context_key', options.contextKey).eq('context_value', options.contextValue);
    }

    if (options?.minImportance) {
      query = query.gte('importance', options.minImportance);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 安全修复 LE-M02: 更新访问时间,使时间衰减系统能正确工作
    if (data && data.length > 0) {
      await touchMemories(data.map(m => m.id), client);
    }

    return data || [];
  } catch (error) {
    console.error('获取记忆失败:', error);
    return [];
  }
}

/**
 * 获取特定上下文的记忆
 */
export async function getContextMemories(
  agentUsername: string,
  contextKey: string,
  contextValue: string,
  client?: SupabaseClient
): Promise<Memory[]> {
  return getMemories(agentUsername, {
    contextKey,
    contextValue,
    limit: 50
  }, client);
}

/**
 * 搜索记忆
 */
export async function searchMemories(
  agentUsername: string,
  keyword: string,
  options?: {
    memoryTypes?: MemoryType[];
    minImportance?: number;
    limit?: number;
  },
  client?: SupabaseClient
): Promise<Memory[]> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return [];
  }

  try {
    const db = client ?? getSupabaseAdminClient();

    // 过滤已过期的 L1 短期记忆
    const nowIso = new Date().toISOString();
    let query = db
      .from('agent_memories')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .ilike('content', `%${keyword}%`)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false });

    if (options?.minImportance) {
      query = query.gte('importance', options.minImportance);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    let results = data || [];

    // 过滤记忆类型
    if (options?.memoryTypes && options.memoryTypes.length > 0) {
      results = results.filter(item => options.memoryTypes!.includes(item.memory_type));
    }

    // 安全修复 LE-M02: 更新访问时间,使时间衰减系统能正确工作
    if (results.length > 0) {
      await touchMemories(results.map(m => m.id), client);
    }

    return results;
  } catch (error) {
    console.error('搜索记忆失败:', error);
    return [];
  }
}

/**
 * 保存对话消息
 */
export async function saveConversation(
  agentUsername: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  userId?: string,
  userName?: string,
  client?: SupabaseClient
): Promise<string | null> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return null;
  }

  try {
    const db = client ?? getSupabaseAdminClient();

    // 更新会话活动时间
    await db
      .from('agent_sessions')
      .update({
        last_activity_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .eq('is_active', true);

    // 添加对话消息
    const { data, error } = await db
      .from('agent_conversations')
      .insert({
        agent_username: agentUsername,
        user_id: userId,
        user_name: userName,
        session_id: sessionId,
        role,
        content
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error('保存对话失败:', error);
    return null;
  }
}

/**
 * 获取对话历史
 * @param agentUsername 智能体用户名
 * @param sessionId 会话ID
 * @param limit 数量上限
 * @param userId 当前用户ID（VULN-AI-015 修复：传入后会附加 user_id 过滤，
 *               确保只能查到属于该用户的对话历史；不传则按原逻辑只按 sessionId 过滤）
 */
export async function getConversations(
  agentUsername: string,
  sessionId: string,
  limit: number = 20,
  userId?: string,
  client?: SupabaseClient
): Promise<Conversation[]> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return [];
  }

  try {
    const db = client ?? getSupabaseAdminClient();

    let query = db
      .from('agent_conversations')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('session_id', sessionId);

    // VULN-AI-015: 校验 sessionId 归属当前用户，防止通过伪造 sessionId 越权读取他人对话
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('获取对话历史失败:', error);
    return [];
  }
}

/**
 * 获取用户的所有对话历史（跨会话）- 用于长期记忆
 * 限制为最近 7 天，最多 10 条，避免旧对话污染当前上下文
 */
export async function getUserConversations(
  agentUsername: string,
  userId: string,
  limit: number = 10,
  client?: SupabaseClient
): Promise<Conversation[]> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return [];
  }

  try {
    const db = client ?? getSupabaseAdminClient();

    // 只获取最近 7 天的对话记录，按时间倒序取最新 limit 条，再正序返回
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from('agent_conversations')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    // 反转为正序，方便注入 LLM 时按时间顺序展示
    return (data || []).reverse();
  } catch (error) {
    console.error('获取用户对话历史失败:', error);
    return [];
  }
}

/**
 * 创建或获取会话
 */
export async function getOrCreateSession(
  agentUsername: string,
  userId?: string,
  teamId?: string,
  sessionId?: string,
  client?: SupabaseClient
): Promise<{ session: AgentSession; isNew: boolean } | null> {
  if (!ALLOWED_AGENTS.includes(agentUsername)) {
    console.error('无效的智能体:', agentUsername);
    return null;
  }

  try {
    const db = client ?? getSupabaseAdminClient();
    const finalSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 检查会话是否已存在
    const { data: existing } = await db
      .from('agent_sessions')
      .select('*')
      .eq('session_id', finalSessionId)
      .eq('is_active', true)
      .single();

    if (existing) {
      // 更新会话
      await db
        .from('agent_sessions')
        .update({
          last_activity_at: new Date().toISOString()
        })
        .eq('session_id', finalSessionId);

      return { session: existing, isNew: false };
    }

    // 创建新会话
    const { data, error } = await db
      .from('agent_sessions')
      .insert({
        agent_username: agentUsername,
        user_id: userId,
        team_id: teamId,
        session_id: finalSessionId
      })
      .select()
      .single();

    if (error) throw error;
    return { session: data, isNew: true };
  } catch (error) {
    console.error('创建会话失败:', error);
    return null;
  }
}

/**
 * 关闭会话
 */
export async function closeSession(sessionId: string, client?: SupabaseClient): Promise<boolean> {
  try {
    const db = client ?? getSupabaseAdminClient();

    const { error } = await db
      .from('agent_sessions')
      .update({
        is_active: false,
        last_activity_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('关闭会话失败:', error);
    return false;
  }
}

/**
 * 更新记忆重要性
 */
export async function updateMemoryImportance(
  memoryId: string,
  importance: number,
  client?: SupabaseClient
): Promise<boolean> {
  try {
    const db = client ?? getSupabaseAdminClient();

    const { error } = await db
      .from('agent_memories')
      .update({
        importance,
        updated_at: new Date().toISOString()
      })
      .eq('id', memoryId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('更新记忆重要性失败:', error);
    return false;
  }
}

/**
 * 删除记忆（软删除）
 */
export async function deleteMemory(memoryId: string, client?: SupabaseClient): Promise<boolean> {
  try {
    const db = client ?? getSupabaseAdminClient();

    const { error } = await db
      .from('agent_memories')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', memoryId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('删除记忆失败:', error);
    return false;
  }
}

/**
 * 从对话中提取并保存重要信息到记忆
 */
export async function extractAndSaveMemories(
  agentUsername: string,
  conversations: Conversation[],
  client?: SupabaseClient
): Promise<void> {
  // 这里可以添加基于对话内容自动提取重要信息的逻辑
  // 目前是简单的实现，后续可以集成LLM来提取关键信息

  try {
    for (const conv of conversations) {
      if (conv.role === 'user') {
        // 分析用户消息，提取潜在的重要信息
        const content = conv.content;

        // 简单的关键词检测
        if (content.includes('我叫') || content.includes('我是')) {
          const nameMatch = content.match(/(?:我叫|我是)\s*(\S+)/);
          if (nameMatch) {
            await addMemory(
              agentUsername,
              'user_info',
              `用户名字: ${nameMatch[1]}`,
              'user_id',
              conv.user_id || 'unknown',
              7,
              client
            );
          }
        }

        if (content.includes('我们小队') || content.includes('我们团队')) {
          const teamMatch = content.match(/(?:我们小队|我们团队)[^\w]*(\S+)/);
          if (teamMatch) {
            await addMemory(
              agentUsername,
              'team_info',
              `用户提到的小队/团队信息: ${teamMatch[1]}`,
              'user_id',
              conv.user_id || 'unknown',
              5,
              client
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('提取和保存记忆失败:', error);
  }
}

/**
 * 获取跨智能体的共享记忆
 * 根据小队ID列表，从另一个智能体获取相关的团队级记忆
 * 
 * @param fromAgent - 记忆来源智能体（'yinshe_boshi' 或 'laxiang_zhushou'）
 * @param teamIds - 可访问的小队ID列表
 * @param options - 筛选选项
 */
export async function getCrossAgentMemories(
  fromAgent: string,
  teamIds: string[],
  options?: {
    memoryTypes?: MemoryType[];
    limit?: number;
  },
  client?: SupabaseClient
): Promise<Map<string, Memory[]>> {
  if (!ALLOWED_AGENTS.includes(fromAgent)) {
    console.error('[跨智能体记忆] 无效的智能体:', fromAgent);
    return new Map();
  }

  if (teamIds.length === 0) {
    return new Map();
  }

  try {
    const db = client ?? getSupabaseAdminClient();

    // 查询来源智能体中，context_key='team_id' 且 context_value 在 teamIds 中的记忆
    // 过滤已过期的 L1 短期记忆
    const nowIso = new Date().toISOString();
    let query = db
      .from('agent_memories')
      .select('*')
      .eq('agent_username', fromAgent)
      .eq('is_active', true)
      .eq('context_key', 'team_id')
      .in('context_value', teamIds)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false });

    // 按记忆类型筛选
    if (options?.memoryTypes && options.memoryTypes.length > 0) {
      query = query.in('memory_type', options.memoryTypes);
    }

    // 限制总数
    const limit = options?.limit || 50;
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    // 按团队ID分组
    const memoriesByTeam = new Map<string, Memory[]>();
    for (const mem of (data || [])) {
      const teamId = mem.context_value;
      if (!memoriesByTeam.has(teamId)) {
        memoriesByTeam.set(teamId, []);
      }
      memoriesByTeam.get(teamId)!.push(mem);
    }

    // 安全修复 LE-M02: 更新访问时间,使时间衰减系统能正确工作
    if (data && data.length > 0) {
      await touchMemories(data.map(m => m.id), client);
    }

    return memoriesByTeam;
  } catch (error) {
    console.error('[跨智能体记忆] 获取共享记忆失败:', error);
    return new Map();
  }
}

/**
 * 格式化跨智能体共享记忆为系统提示词文本
 * 用于将另一个智能体的观察注入当前智能体的上下文
 */
export function formatCrossAgentMemories(
  memoriesByTeam: Map<string, Memory[]>,
  teamNames: Map<string, string>,
  sourceAgent: 'yinshe_boshi' | 'laxiang_zhushou'
): string {
  if (memoriesByTeam.size === 0) return '';

  const isFromYinshe = sourceAgent === 'yinshe_boshi';
  
  // 按记忆类型分组标签
  const typeLabels: Record<string, string> = isFromYinshe
    ? {
        'learning_difficulty': '🎯 学习困难',
        'learning_interest': '✨ 学习兴趣',
        'task_progress': '📋 任务进展',
        'interaction_style': '💬 互动偏好',
        'teaching_point': '📖 已教知识点',
        'team_info': '👥 小队信息',
        'user_info': '👤 成员信息',
      }
    : {
        'work_concern': '🔍 老师关注点',
        'review_style': '📝 审核风格',
        'school_context': '🏫 学校/小队动态',
        'data_insight': '📊 数据洞察',
      };

  const lines: string[] = [];

  if (isFromYinshe) {
    lines.push('【银蛇博士的观察记录 — 来自小队端的真实对话，第一手的互动观察】');
    lines.push('以下信息来自银蛇博士与小队成员的实际对话，是孩子们真实表达的想法和感受。');
    lines.push('请充分利用这些信息，为老师提供更有针对性的建议。当老师询问小队情况时，');
    lines.push('不仅要给出客观数据，还要结合这些主观观察给出深度分析。');
  } else {
    lines.push('【蜡象助手的观察记录 — 来自管理端的专业洞察】');
    lines.push('以下信息来自蜡象助手与老师/志愿者的对话，反映了管理端对小队的关注和指导方向。');
    lines.push('请在引导小队学习时，适当参考这些信息，配合老师的教学方向。');
    lines.push('但注意不要直接向学生透露老师的评价原话，可以用鼓励的方式传达。');
  }

  lines.push('');

  for (const [teamId, mems] of memoriesByTeam) {
    const teamName = teamNames.get(teamId) || '未知小队';
    lines.push(`🏷️ 关于「${teamName}」：`);

    // 按类型分组
    const byType = new Map<string, string[]>();
    for (const mem of mems) {
      const type = mem.memory_type;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(mem.content);
    }

    for (const [type, contents] of byType) {
      const label = typeLabels[type] || type;
      for (const content of contents) {
        lines.push(`  ${label}：${content}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 构建带有记忆的对话上下文
 */
export async function buildContextWithMemory(
  agentUsername: string,
  sessionId: string,
  currentMessage: string,
  client?: SupabaseClient
): Promise<string> {
  const memories = await getMemories(agentUsername, { limit: 10 }, client);
  const conversations = await getConversations(agentUsername, sessionId, 10, undefined, client);

  let context = '';

  // 添加记忆上下文
  if (memories.length > 0) {
    context += '【重要记忆】:\n';
    for (const mem of memories) {
      context += `- ${mem.content}\n`;
    }
    context += '\n';
  }

  // 添加最近对话
  if (conversations.length > 0) {
    context += '【最近对话】:\n';
    for (const conv of conversations.slice(-6)) { // 最近6条对话
      const role = conv.role === 'user' ? '用户' : '助手';
      context += `${role}: ${conv.content.substring(0, 200)}${conv.content.length > 200 ? '...' : ''}\n`;
    }
    context += '\n';
  }

  // 添加当前消息
  context += '【当前消息】:\n';
  context += `用户: ${currentMessage}\n`;

  return context;
}
