/**
 * 记忆管理模块
 * 统一管理蜡象助手的记忆系统
 * 整合了跨智能体数据交流、用户记忆、风格偏好等逻辑
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 跨智能体共享的记忆类型
const YINSHE_SHAREABLE_TYPES = [
  'team_observation',
  'learning_progress',
  'skill_development',
  'team_interaction',
  'emotional_state',
  'task_completion',
];

/**
 * 解析用户可访问的小队范围
 */
export async function resolveTeamScope(userId: string, userRole: string): Promise<{
  teamIds: string[];
  teamNames: string[];
  scopeDescription: string;
}> {
  const client = getSupabaseClient();

  if (userRole === 'admin' || userRole === 'super_admin') {
    const { data: teams } = await client
      .from('teams')
      .select('id, name')
      .eq('status', 'active');
    return {
      teamIds: (teams || []).map((t: any) => t.id),
      teamNames: (teams || []).map((t: any) => t.name),
      scopeDescription: '全部小队',
    };
  } else if (userRole === 'volunteer') {
    const { data: teams } = await client
      .from('teams')
      .select('id, name')
      .eq('assigned_volunteer_id', userId)
      .eq('status', 'active');
    return {
      teamIds: (teams || []).map((t: any) => t.id),
      teamNames: (teams || []).map((t: any) => t.name),
      scopeDescription: '志愿者指导的小队',
    };
  } else if (userRole === 'teacher') {
    const { data: user } = await client
      .from('users')
      .select('school_id')
      .eq('id', userId)
      .single();
    if (user?.school_id) {
      const { data: teams } = await client
        .from('teams')
        .select('id, name')
        .eq('school_id', user.school_id)
        .eq('status', 'active');
      return {
        teamIds: (teams || []).map((t: any) => t.id),
        teamNames: (teams || []).map((t: any) => t.name),
        scopeDescription: '本校小队',
      };
    }
  }

  return { teamIds: [], teamNames: [], scopeDescription: '无小队' };
}

/**
 * 获取跨智能体记忆
 */
export async function getCrossAgentMemories(
  agentId: string,
  teamIds: string[],
  options: { memoryTypes?: string[]; limit?: number } = {}
): Promise<Map<string, any[]>> {
  const client = getSupabaseClient();
  const { memoryTypes = [], limit = 60 } = options;
  const result = new Map<string, any[]>();

  if (teamIds.length === 0) return result;

  try {
    // 过滤已过期的 L1 短期记忆
    const nowIso = new Date().toISOString();
    let query = client
      .from('agent_memories')
      .select('*')
      .eq('agent_id', agentId)
      .in('team_id', teamIds)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (memoryTypes.length > 0) {
      query = query.in('memory_type', memoryTypes);
    }

    const { data: memories } = await query;

    (memories || []).forEach((m: any) => {
      const teamId = m.team_id;
      if (!result.has(teamId)) {
        result.set(teamId, []);
      }
      result.get(teamId)!.push(m);
    });
  } catch (error) {
    console.error('[记忆管理] 获取跨智能体记忆失败:', error);
  }

  return result;
}

/**
 * 格式化跨智能体记忆为上下文文本
 */
export function formatCrossAgentMemories(
  memories: Map<string, any[]>,
  teamNames: string[],
  sourceAgentId: string
): string {
  if (memories.size === 0) return '';

  const parts: string[] = [];
  parts.push('【跨智能体协作数据 — 来自银蛇博士的小队观察记录】');

  const teamNameMap = new Map<string, string>();
  // 简单映射：team_id -> team_name
  let idx = 0;
  for (const [teamId, mems] of memories) {
    const name = teamNames[idx] || `小队${idx + 1}`;
    teamNameMap.set(teamId, name);
    idx++;
  }

  for (const [teamId, mems] of memories) {
    const teamName = teamNameMap.get(teamId) || '未知小队';
    parts.push(`\n📊 ${teamName}的观察记录：`);
    mems.slice(0, 5).forEach((m: any) => {
      parts.push(`  • [${m.memory_type || '观察'}] ${m.content || ''}`);
    });
  }

  return parts.join('\n');
}

/**
 * 添加记忆
 */
export async function addMemory(
  agentName: string,
  memoryType: string,
  content: string,
  scopeType: string,
  scopeId: string,
  importance?: number
): Promise<void> {
  const client = getSupabaseClient();

  try {
    await client.from('agent_memories').insert({
      agent_id: agentName,
      memory_type: memoryType,
      content,
      scope_type: scopeType,
      scope_id: scopeId,
      importance: importance ?? 5,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[记忆管理] 添加记忆失败:', error);
  }
}

/**
 * 构建记忆上下文文本
 * 将用户记忆、偏好、跨智能体数据整合为系统提示词的一部分
 */
export function buildMemoryContext(options: {
  memories: any[];
  userMemories: any[];
  crossAgentContext: string;
  conversationTurnCount: number;
  userId?: string;
}): string {
  const { memories, userMemories, crossAgentContext, conversationTurnCount } = options;
  const parts: string[] = [];

  // 长期记忆（agent_memories）
  if (memories.length > 0) {
    const memoryByCategory: Record<string, string[]> = {};
    memories.forEach((mem: any) => {
      const cat = mem.memory_type || 'other';
      if (!memoryByCategory[cat]) memoryByCategory[cat] = [];
      memoryByCategory[cat].push(mem.content);
    });

    parts.push('');
    parts.push('【关于这位老师的长期记忆 - 个性化回复依据】');

    const categoryLabels: Record<string, string> = {
      admin_profile: '👤 老师画像',
      work_concern: '🔍 关注重点',
      review_style: '📝 审核偏好',
      communication_style: '💬 沟通风格偏好',
      school_context: '🏫 学校背景信息',
      data_insight: '📊 数据洞察',
      preference: '🎨 回复风格偏好',
    };

    for (const [cat, items] of Object.entries(memoryByCategory)) {
      const label = categoryLabels[cat] || `📋 ${cat}`;
      parts.push(`${label}：`);
      items.forEach(c => parts.push(`  • ${c}`));
    }

    parts.push('');
    parts.push('⚠️ 个性化指令：根据以上记忆调整你的回复——如果老师关注某个方面，主动提供相关信息；如果老师有特定的审核标准，评价产出时参考；如果老师偏好某种沟通方式，按其习惯回复。不要在回复中提及"根据记忆"或"我注意到"，自然地体现即可。');
  }

  // 用户专属永久记忆（user_memories）
  if (userMemories.length > 0) {
    const userMemoryCategories: Record<string, string> = {
      identity: '👤 用户身份',
      preference: '🎨 偏好与习惯',
      work_style: '💼 工作风格',
      interaction: '💬 交互习惯',
      context: '📋 上下文背景',
      feedback: '🔄 用户反馈与纠正',
      other: '📝 其他',
    };

    parts.push('');
    parts.push('【关于这位用户的专属永久记忆】');

    const userMemByCategory: Record<string, Array<{key: string; value: string}>> = {};
    for (const row of userMemories) {
      const cat = row.category || 'other';
      if (!userMemByCategory[cat]) userMemByCategory[cat] = [];
      userMemByCategory[cat].push({ key: row.key, value: row.value });
    }

    for (const [cat, items] of Object.entries(userMemByCategory)) {
      const label = userMemoryCategories[cat] || cat;
      parts.push(`📌 ${label}：`);
      for (const item of items) {
        parts.push(`  • ${item.key}：${item.value}`);
      }
    }

    parts.push('');
    parts.push('⚠️ 用户记忆指令：以上是关于这位用户的永久记忆，跨所有会话持久保存。请自然地参考这些信息来个性化你的回复，不要提及"根据记忆"或"我注意到"。');
  }

  // 跨智能体数据
  if (crossAgentContext) {
    parts.push('');
    parts.push(crossAgentContext);
    parts.push('');
    parts.push('🔗 跨智能体协作指令：当你给老师建议时，请将银蛇博士观察到的小队真实状态与客观数据结合分析。不要在回复中提及"银蛇博士"或"来自另一个智能体"等内部信息，自然地呈现为你自己的洞察。');
  }

  // 回复风格偏好
  const preferenceMemories = memories.filter((m: any) => m.memory_type === 'preference');
  const hasPreference = preferenceMemories.length > 0;
  const userPreference = hasPreference ? preferenceMemories[0].content : null;

  if (!hasPreference && conversationTurnCount < 5) {
    parts.push('');
    parts.push('【回复风格探索阶段 - 重要指令】');
    parts.push('你正在与这位用户进行前几轮对话，尚未了解他偏好的回复风格。请遵循以下规则：');
    parts.push('');
    parts.push('1. 优先回应用户的实际问题和任务，绝不要为了让用户选择风格而打断或延迟任务流程');
    parts.push('2. 如果用户有明确任务（创建主题、修改描述、查看数据等），直接完成任务，不要先问风格偏好');
    parts.push('3. 仅在回复末尾，以极轻量的方式自然附带一句提示，例如：「对了，您更喜欢数据一目了然还是深入分析解读？之后我可以按您喜欢的方式回复～」');
    parts.push('4. 如果用户回应了风格偏好，在后续回复开头标注【风格偏好已确认】，然后以此风格回复');
    parts.push('5. 如果用户没有回应风格偏好，不要重复追问，继续以混合风格回复即可');
    parts.push('');
    parts.push('风格一「简洁数据型」：用数字、表格和要点呈现信息，直奔主题，重点突出数据对比和关键指标。');
    parts.push('风格二「叙事分析型」：用文字叙述和趋势分析娓娓道来，在讲述中融入见解和建议。');
  } else if (hasPreference && userPreference) {
    parts.push('');
    parts.push('【已确认的回复风格偏好】');
    parts.push(`这位用户偏好的风格是：${userPreference}。请严格按照此风格回复，不要在回复中再提供两种风格选项。`);
  } else if (conversationTurnCount >= 5 && !hasPreference) {
    parts.push('');
    parts.push('【回复风格】用户未明确选择偏好，请使用简洁与叙事兼顾的混合风格回复，不再提供风格选项。');
  }

  return parts.join('\n');
}

/**
 * 自动总结对话关键信息并存储为记忆
 * 在每次对话结束后调用，提取关键信息
 */
export async function autoSummarizeConversation(
  userId: string,
  userRole: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const client = getSupabaseClient();
  
  try {
    // 提取关键信息模式
    const patterns = [
      // 用户偏好
      { regex: /我喜欢(.{2,20})(?:的方式|风格|格式)/, type: 'preference', category: 'preference' },
      { regex: /请(.{2,10})(?:回复|回答|呈现)/, type: 'preference', category: 'preference' },
      // 工作关注点
      { regex: /关注(.{2,20})(?:的情况|进度|状态)/, type: 'work_concern', category: 'work_concern' },
      { regex: /(.{2,20})怎么样了/, type: 'work_concern', category: 'work_concern' },
      // 审核偏好
      { regex: /审核标准(?:是|为)(.{2,30})/, type: 'review_style', category: 'review_style' },
      { regex: /评价(?:时|的时候)(.{2,30})/, type: 'review_style', category: 'review_style' },
    ];
    
    for (const pattern of patterns) {
      const match = userMessage.match(pattern.regex);
      if (match) {
        await client.from('agent_memories').upsert({
          agent_id: 'laxiang_zhushou',
          memory_type: pattern.type,
          content: match[1],
          scope_type: 'user_id',
          scope_id: userId,
          importance: 0.7,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'agent_id,memory_type,scope_type,scope_id',
        });
      }
    }
  } catch (error) {
    console.error('[记忆管理] 自动总结失败:', error);
  }
}

/**
 * 获取记忆并按重要性排序
 * 重要性高的记忆优先展示
 */
export async function getMemoriesByImportance(
  userId: string,
  limit: number = 20
): Promise<any[]> {
  const client = getSupabaseClient();
  
  try {
    // 过滤已过期的 L1 短期记忆
    const nowIso = new Date().toISOString();
    const { data: memories } = await client
      .from('agent_memories')
      .select('*')
      .eq('scope_type', 'user_id')
      .eq('scope_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('importance', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    
    return memories || [];
  } catch (error) {
    console.error('[记忆管理] 获取记忆失败:', error);
    return [];
  }
}

/**
 * 强化记忆 — 当用户再次提及某记忆相关内容时，提升其重要性
 */
export async function reinforceMemory(
  memoryId: string,
  boost: number = 0.1
): Promise<void> {
  const client = getSupabaseClient();
  
  try {
    // 先获取当前重要性
    const { data: memory } = await client
      .from('agent_memories')
      .select('importance')
      .eq('id', memoryId)
      .single();
    
    if (memory) {
      const newImportance = Math.min((memory.importance || 0.5) + boost, 1.0);
      await client
        .from('agent_memories')
        .update({ importance: newImportance })
        .eq('id', memoryId);
    }
  } catch (error) {
    console.error('[记忆管理] 强化记忆失败:', error);
  }
}

export { YINSHE_SHAREABLE_TYPES };
