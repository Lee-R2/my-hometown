/**
 * 记忆引擎 — 分层记忆的核心调度模块
 * 
 * 职责：
 * 1. 对话开始时加载上下文记忆
 * 2. 对话结束时提取并存储重要信息
 * 3. 定期蒸馏短期→长期记忆
 * 4. 管理会话状态和工作缓冲区
 */

import {
  saveMemory,
  loadMemories,
  searchMemories,
  distillMemories,
  cleanExpiredMemories,
  saveSessionState,
  loadSessionState,
  type MemoryEntry,
  type MemoryLayer,
  type SessionState,
} from './memory-store';

// 感觉缓冲区（L0，纯内存，不持久化）
interface SensoryBuffer {
  recentInputs: string[];
  recentOutputs: string[];
  currentEmotion?: string;
  activeTopics: string[];
}

const sensoryBuffers = new Map<string, SensoryBuffer>();

function getBufferKey(agent: string, userId?: string): string {
  return `${agent}:${userId || 'global'}`;
}

function getSensoryBuffer(agent: string, userId?: string): SensoryBuffer {
  const key = getBufferKey(agent, userId);
  if (!sensoryBuffers.has(key)) {
    sensoryBuffers.set(key, {
      recentInputs: [],
      recentOutputs: [],
      activeTopics: [],
    });
  }
  return sensoryBuffers.get(key)!;
}

/**
 * 更新感觉缓冲区（每次对话调用）
 */
export function updateSensoryBuffer(params: {
  agent: string;
  userId?: string;
  userInput: string;
  agentOutput: string;
  emotion?: string;
  topics?: string[];
}): void {
  const buffer = getSensoryBuffer(params.agent, params.userId);
  buffer.recentInputs.push(params.userInput);
  buffer.recentOutputs.push(params.agentOutput);
  // 只保留最近10轮
  if (buffer.recentInputs.length > 10) buffer.recentInputs.shift();
  if (buffer.recentOutputs.length > 10) buffer.recentOutputs.shift();
  if (params.emotion) buffer.currentEmotion = params.emotion;
  if (params.topics) {
    buffer.activeTopics = [...new Set([...buffer.activeTopics, ...params.topics])].slice(-10);
  }
}

/**
 * 获取感觉缓冲区
 */
export function getSensoryData(agent: string, userId?: string): SensoryBuffer {
  return getSensoryBuffer(agent, userId);
}

/**
 * 加载完整上下文记忆（对话开始时调用）
 * 返回按层级组织的记忆摘要
 */
export async function loadContextMemory(params: {
  agent: string;
  userId?: string;
  sessionId?: string;
}): Promise<{
  l4_identity: string;
  l3_longterm: string;
  l2_shortterm: string;
  l1_working: string;
  l0_sensory: string;
  full_context: string;
}> {
  const { agent, userId, sessionId } = params;

  // L4 核心身份
  const l4Memories = await loadMemories({ agent_username: agent, user_id: userId, layer: 4, limit: 20 });
  const l4Text = l4Memories.map(m => `[${m.key}] ${m.content}`).join('\n');

  // L3 长期记忆
  const l3Memories = await loadMemories({ agent_username: agent, user_id: userId, layer: 3, limit: 30 });
  const l3Text = l3Memories.map(m => `[${m.key}] ${m.content}`).join('\n');

  // L2 短期记忆
  const l2Memories = await loadMemories({ agent_username: agent, user_id: userId, layer: 2, limit: 20 });
  const l2Text = l2Memories.map(m => `[${m.key}] ${m.content}`).join('\n');

  // L1 工作记忆（会话状态）
  let l1Text = '';
  if (sessionId) {
    const session = await loadSessionState(sessionId, agent);
    if (session) {
      l1Text = JSON.stringify(session.state_data, null, 2);
    }
  }

  // L0 感觉缓冲
  const sensory = getSensoryBuffer(agent, userId);
  const l0Text = sensory.recentInputs.length > 0
    ? `最近话题: ${sensory.activeTopics.join(', ')}\n最近情绪: ${sensory.currentEmotion || '平静'}`
    : '';

  // 组装完整上下文
  const sections: string[] = [];
  if (l4Text) sections.push(`【核心身份-永不变】\n${l4Text}`);
  if (l3Text) sections.push(`【长期记忆-跨会话】\n${l3Text}`);
  if (l2Text) sections.push(`【近期记忆-本周期】\n${l2Text}`);
  if (l1Text) sections.push(`【工作记忆-本次会话】\n${l1Text}`);
  if (l0Text) sections.push(`【即时感知】\n${l0Text}`);

  return {
    l4_identity: l4Text,
    l3_longterm: l3Text,
    l2_shortterm: l2Text,
    l1_working: l1Text,
    l0_sensory: l0Text,
    full_context: sections.join('\n\n'),
  };
}

/**
 * 提取并存储重要信息（对话结束时调用）
 * 使用分层策略自动分配记忆层级
 */
export async function captureAndStore(params: {
  agent: string;
  userId?: string;
  userInput: string;
  agentOutput: string;
  sessionId?: string;
  extractedInfo?: Array<{
    type: string;
    key: string;
    content: string;
    importance: number;
  }>;
}): Promise<number> {
  const { agent, userId, sessionId, extractedInfo } = params;
  let storedCount = 0;

  // 1. 更新感觉缓冲
  updateSensoryBuffer({
    agent,
    userId,
    userInput: params.userInput,
    agentOutput: params.agentOutput,
  });

  // 2. 存储提取的信息到适当层级
  if (extractedInfo && extractedInfo.length > 0) {
    for (const info of extractedInfo) {
      const layer = determineLayer(info.type, info.importance);
      const id = await saveMemory({
        agent_username: agent,
        user_id: userId,
        layer,
        memory_type: info.type,
        key: info.key,
        content: info.content,
        importance: info.importance,
        source_ids: [sessionId || 'unknown'],
      });
      if (id) storedCount++;
    }
  }

  // 3. 更新会话工作记忆
  if (sessionId) {
    const existingSession = await loadSessionState(sessionId, agent);
    const currentBuffer = getSensoryBuffer(agent, userId);
    await saveSessionState({
      session_id: sessionId,
      agent_username: agent,
      user_id: userId,
      state_data: {
        ...(existingSession?.state_data || {}),
        last_user_input: params.userInput,
        last_agent_output: params.agentOutput,
        active_topics: currentBuffer.activeTopics,
        updated_at: new Date().toISOString(),
      },
      working_buffer: {
        ...(existingSession?.working_buffer || {}),
        turn_count: ((existingSession?.working_buffer as Record<string, number>)?.turn_count || 0) + 1,
      },
    });
  }

  return storedCount;
}

/**
 * 根据信息类型和重要性确定记忆层级
 */
function determineLayer(type: string, importance: number): MemoryLayer {
  // 核心身份类 → L4
  if (['personality', 'core_value', 'permanent_preference', 'identity'].includes(type)) {
    return 4;
  }
  // 高重要性（≥0.8）→ L3 长期
  if (importance >= 0.8) {
    return 3;
  }
  // 中等重要性（≥0.5）→ L2 短期
  if (importance >= 0.5) {
    return 2;
  }
  // 低重要性 → L1 工作记忆
  return 1;
}

/**
 * 执行记忆维护（定期调用）
 * 1. 蒸馏短期→长期
 * 2. 清理过期记忆
 * 3. 合并重复记忆
 */
export async function maintainMemories(params: {
  agent: string;
  userId?: string;
}): Promise<{
  distilled: number;
  cleaned: number;
  merged: number;
}> {
  const [distilled, cleaned] = await Promise.all([
    distillMemories({
      agent_username: params.agent,
      user_id: params.userId,
      minImportance: 0.7,
      minAccessCount: 2,
    }),
    cleanExpiredMemories(params.agent),
  ]);

  // 查找重复记忆并合并
  let merged = 0;
  try {
    const memories = await loadMemories({
      agent_username: params.agent,
      user_id: params.userId,
      limit: 200,
    });

    // 按 key 分组找重复
    const keyMap = new Map<string, MemoryEntry[]>();
    for (const m of memories) {
      if (!keyMap.has(m.key)) keyMap.set(m.key, []);
      keyMap.get(m.key)!.push(m);
    }

    for (const [, entries] of keyMap) {
      if (entries.length > 1) {
        // 保留重要性最高的，删除其余
        entries.sort((a, b) => b.importance - a.importance);
        const toDelete = entries.slice(1).map(e => e.id).filter(Boolean) as string[];
        if (toDelete.length > 0) {
          const supabase = (await import('@/storage/database/supabase-client')).getSupabaseClient();
          await supabase.from('agent_memories').delete().in('id', toDelete);
          merged += toDelete.length;
        }
      }
    }
  } catch (err) {
    console.error('[MemoryEngine] Merge error:', err);
  }

  return { distilled, cleaned, merged };
}

/**
 * 生成记忆摘要（供 LLM 上下文使用）
 */
export async function generateMemorySummary(params: {
  agent: string;
  userId?: string;
  focusTopic?: string;
}): Promise<string> {
  let memories: MemoryEntry[] = [];

  if (params.focusTopic) {
    // 有关注主题时，搜索相关记忆
    memories = await searchMemories({
      agent_username: params.agent,
      user_id: params.userId,
      keyword: params.focusTopic,
      limit: 15,
    });
  }

  // 补充核心身份和高重要性记忆
  const coreMemories = await loadMemories({
    agent_username: params.agent,
    user_id: params.userId,
    layer: 4,
    limit: 10,
  });
  const importantMemories = await loadMemories({
    agent_username: params.agent,
    user_id: params.userId,
    limit: 10,
  });

  // 去重
  const allIds = new Set<string>();
  const all = [...memories, ...coreMemories, ...importantMemories].filter(m => {
    if (allIds.has(m.id!)) return false;
    allIds.add(m.id!);
    return true;
  });

  if (all.length === 0) return '';

  // 按层级分组
  const grouped = {
    identity: all.filter(m => m.layer === 4).map(m => `${m.key}: ${m.content}`),
    longterm: all.filter(m => m.layer === 3).map(m => `${m.key}: ${m.content}`),
    shortterm: all.filter(m => m.layer === 2).map(m => `${m.key}: ${m.content}`),
  };

  const parts: string[] = [];
  if (grouped.identity.length) parts.push(`身份: ${grouped.identity.join('; ')}`);
  if (grouped.longterm.length) parts.push(`长期: ${grouped.longterm.join('; ')}`);
  if (grouped.shortterm.length) parts.push(`近期: ${grouped.shortterm.join('; ')}`);

  return parts.join(' | ');
}
