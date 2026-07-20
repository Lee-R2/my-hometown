/**
 * 记忆蒸馏引擎 (Memory Distiller)
 * 
 * 参考 Claude 的 Auto Dream 机制，定期对智能体记忆进行：
 * 1. 去重合并：将相似/重复的记忆合并为一条精炼记录
 * 2. 压缩归档：将过时/低价值的记忆归档
 * 3. 重要性提升：将高频引用的记忆提升重要性
 * 4. 过期清理：删除超过保留期的临时记忆
 * 
 * 适用于：银蛇博士、蜡象助手
 */

import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

// 允许使用蒸馏的智能体（必须与数据库 agent_memories.agent_username 一致）
const DISTILLABLE_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];

// 中文显示名映射
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'yinshe_boshi': '银蛇博士',
  'laxiang_zhushou': '蜡象助手',
};

// 记忆类型配置：不同类型的保留策略
const MEMORY_RETENTION: Record<string, {
  maxAge: number;       // 最大保留天数
  maxCount: number;     // 最大保留条数
  canArchive: boolean;  // 是否可以归档
  canMerge: boolean;    // 是否可以合并
}> = {
  // 用户偏好 - 长期保留
  preference: { maxAge: 365, maxCount: 50, canArchive: false, canMerge: true },
  // 行为修正 - 长期保留
  feedback: { maxAge: 180, maxCount: 100, canArchive: true, canMerge: true },
  // 项目上下文 - 中期保留
  project_context: { maxAge: 90, maxCount: 80, canArchive: true, canMerge: true },
  // 外部引用 - 中期保留
  reference: { maxAge: 90, maxCount: 50, canArchive: true, canMerge: false },
  // 知识记忆 - 长期保留
  knowledge: { maxAge: 365, maxCount: 200, canArchive: true, canMerge: true },
  // 知识技能 - 长期保留
  knowledge_skill: { maxAge: 365, maxCount: 200, canArchive: true, canMerge: true },
  // 知识洞察 - 长期保留
  knowledge_insight: { maxAge: 365, maxCount: 100, canArchive: true, canMerge: true },
  // 用户记忆 - 长期保留
  user_memory: { maxAge: 365, maxCount: 100, canArchive: false, canMerge: true },
};

// 蒸馏结果统计
export interface DistillationResult {
  agent: string;
  totalBefore: number;
  totalAfter: number;
  merged: number;
  archived: number;
  deleted: number;
  promoted: number;
  details: string[];
}

/**
 * 对指定智能体执行记忆蒸馏
 */
export async function distillAgentMemories(
  agentUsername: string,
  options?: {
    dryRun?: boolean;      // 只分析不执行
    maxMergeGroups?: number; // 最大合并组数
  }
): Promise<DistillationResult> {
  if (!DISTILLABLE_AGENTS.includes(agentUsername)) {
    return {
      agent: agentUsername,
      totalBefore: 0, totalAfter: 0,
      merged: 0, archived: 0, deleted: 0, promoted: 0,
      details: [`智能体 ${agentUsername} 不在可蒸馏列表中`]
    };
  }

  const dryRun = options?.dryRun ?? false;
  const result: DistillationResult = {
    agent: agentUsername,
    totalBefore: 0, totalAfter: 0,
    merged: 0, archived: 0, deleted: 0, promoted: 0,
    details: []
  };

  try {
    const client = getSupabaseAdminClient();

    // 1. 获取所有活跃记忆
    const { data: memories, error } = await client
      .from('agent_memories')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .order('importance', { ascending: false });

    if (error) throw error;
    result.totalBefore = memories?.length || 0;

    if (!memories || memories.length === 0) {
      result.details.push('没有活跃记忆需要蒸馏');
      result.totalAfter = 0;
      return result;
    }

    // 2. 按类型分组处理
    for (const [memoryType, config] of Object.entries(MEMORY_RETENTION)) {
      const typeMemories = memories.filter(m => m.memory_type === memoryType);
      if (typeMemories.length === 0) continue;

      // 2a. 清理过期记忆（基于最后访问时间，而非创建时间）
      const expiredMemories = typeMemories.filter(m => {
        // 优先用 last_accessed_at，没有则回退到 created_at
        const refDate = m.last_accessed_at || m.created_at;
        const ref = new Date(refDate);
        const ageInDays = (Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24);
        return ageInDays > config.maxAge;
      });

      if (expiredMemories.length > 0 && !dryRun) {
        // 归档而非删除
        if (config.canArchive) {
          const expiredIds = expiredMemories.map(m => m.id);
          await client
            .from('agent_memories')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .in('id', expiredIds);
          result.archived += expiredMemories.length;
          result.details.push(`[${memoryType}] 归档 ${expiredMemories.length} 条过期记忆（>${config.maxAge}天）`);
        } else {
          // 不可归档的类型只删除 importance 最低的
          const lowImportance = expiredMemories.filter(m => (m.importance || 0) < 3);
          if (lowImportance.length > 0) {
            await client
              .from('agent_memories')
              .delete()
              .in('id', lowImportance.map(m => m.id));
            result.deleted += lowImportance.length;
            result.details.push(`[${memoryType}] 删除 ${lowImportance.length} 条低价值过期记忆`);
          }
        }
      } else if (expiredMemories.length > 0 && dryRun) {
        result.details.push(`[${memoryType}] 将归档/删除 ${expiredMemories.length} 条过期记忆（dryRun）`);
      }

      // 2b. 合并相似记忆
      if (config.canMerge && typeMemories.length > 1) {
        const mergeGroups = findSimilarGroups(typeMemories);
        const maxGroups = options?.maxMergeGroups ?? 10;

        for (let i = 0; i < Math.min(mergeGroups.length, maxGroups); i++) {
          const group = mergeGroups[i];
          if (group.length < 2) continue;

          // 保留 importance 最高的那条，将其他标记为已合并
          const sorted = [...group].sort((a, b) => (b.importance || 0) - (a.importance || 0));
          const keeper = sorted[0];
          const mergedOnes = sorted.slice(1);

          // 合并内容：将低优先级的内容追加到保留条目的 content 中
          const mergedContent = mergeContents(
            keeper.content,
            mergedOnes.map(m => m.content)
          );

          if (!dryRun) {
            // 更新保留条目
            await client
              .from('agent_memories')
              .update({
                content: mergedContent,
                importance: Math.min(10, (keeper.importance || 5) + 1), // 合并后重要性+1
                updated_at: new Date().toISOString()
              })
              .eq('id', keeper.id);

            // 归档被合并的条目
            await client
              .from('agent_memories')
              .update({
                is_active: false,
                updated_at: new Date().toISOString()
              })
              .in('id', mergedOnes.map(m => m.id));
          }

          result.merged += mergedOnes.length;
          result.details.push(
            `[${memoryType}] 合并 ${mergedOnes.length + 1} 条相似记忆 → 1条` +
            (dryRun ? '（dryRun）' : '')
          );
        }
      }

      // 2c. 数量超限处理：保留 importance 最高的
      const activeTypeMemories = typeMemories.filter(m => {
        if (expiredMemories.some(e => e.id === m.id)) return false;
        return true;
      });

      if (activeTypeMemories.length > config.maxCount) {
        const sorted = [...activeTypeMemories].sort((a, b) => (b.importance || 0) - (a.importance || 0));
        const toArchive = sorted.slice(config.maxCount);

        if (toArchive.length > 0 && !dryRun) {
          await client
            .from('agent_memories')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .in('id', toArchive.map(m => m.id));
          result.archived += toArchive.length;
          result.details.push(`[${memoryType}] 归档 ${toArchive.length} 条低价值记忆（超出上限 ${config.maxCount}）`);
        }
      }
    }

    // 3. 提升高频引用的记忆
    const { data: activeAfter } = await client
      .from('agent_memories')
      .select('id, importance, access_count')
      .eq('agent_username', agentUsername)
      .eq('is_active', true);

    if (activeAfter && !dryRun) {
      const toPromote = activeAfter.filter(m => {
        const count = (m as any).access_count || 0;
        return count >= 5 && (m.importance || 0) < 8;
      });

      for (const mem of toPromote) {
        await client
          .from('agent_memories')
          .update({
            importance: Math.min(10, (mem.importance || 5) + 1),
            updated_at: new Date().toISOString()
          })
          .eq('id', mem.id);
        result.promoted++;
      }

      if (toPromote.length > 0) {
        result.details.push(`提升 ${toPromote.length} 条高频引用记忆的重要性`);
      }
    }

    // 4. 计算最终数量
    const { count: finalCount } = await client
      .from('agent_memories')
      .select('*', { count: 'exact', head: true })
      .eq('agent_username', agentUsername)
      .eq('is_active', true);

    result.totalAfter = finalCount || 0;
    result.details.push(`蒸馏完成：${result.totalBefore} → ${result.totalAfter} 条活跃记忆`);

  } catch (error) {
    console.error(`[记忆蒸馏] 蒸馏 ${agentUsername} 记忆失败:`, error);
    result.details.push(`蒸馏失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * 对所有智能体执行记忆蒸馏
 */
export async function distillAllAgents(options?: { dryRun?: boolean }): Promise<DistillationResult[]> {
  const results: DistillationResult[] = [];

  for (const agent of DISTILLABLE_AGENTS) {
    const result = await distillAgentMemories(agent, options);
    results.push(result);
  }

  return results;
}

/**
 * 获取蒸馏状态概览
 */
export async function getDistillationStatus(): Promise<Record<string, {
  totalActive: number;
  totalArchived: number;
  byType: Record<string, number>;
  oldestMemory: string | null;
  newestMemory: string | null;
}>> {
  const client = getSupabaseAdminClient();
  const status: Record<string, any> = {};

  for (const agent of DISTILLABLE_AGENTS) {
    const { data: active } = await client
      .from('agent_memories')
      .select('memory_type, created_at')
      .eq('agent_username', agent)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    const { count: archivedCount } = await client
      .from('agent_memories')
      .select('*', { count: 'exact', head: true })
      .eq('agent_username', agent)
      .eq('is_active', false);

    const byType: Record<string, number> = {};
    if (active) {
      for (const mem of active) {
        byType[mem.memory_type] = (byType[mem.memory_type] || 0) + 1;
      }
    }

    status[agent] = {
      totalActive: active?.length || 0,
      totalArchived: archivedCount || 0,
      byType,
      oldestMemory: active?.[0]?.created_at || null,
      newestMemory: active?.[active.length - 1]?.created_at || null,
    };
  }

  return status;
}

/**
 * 查找相似记忆分组
 * 使用简单的文本相似度（关键词重叠 + 长度相似度）
 */
function findSimilarGroups(memories: any[]): any[][] {
  const groups: any[][] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    if (assigned.has(memories[i].id)) continue;

    const group = [memories[i]];
    assigned.add(memories[i].id);

    for (let j = i + 1; j < memories.length; j++) {
      if (assigned.has(memories[j].id)) continue;

      const similarity = computeSimilarity(memories[i].content, memories[j].content);
      if (similarity > 0.5) {
        group.push(memories[j]);
        assigned.add(memories[j].id);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * 计算两段文本的简单相似度
 * 基于 Jaccard 相似系数（关键词集合的交集/并集）
 */
function computeSimilarity(textA: string, textB: string): number {
  const keywordsA = extractKeywords(textA);
  const keywordsB = extractKeywords(textB);

  if (keywordsA.size === 0 || keywordsB.size === 0) return 0;

  const intersection = new Set([...keywordsA].filter(x => keywordsB.has(x)));
  const union = new Set([...keywordsA, ...keywordsB]);

  return intersection.size / union.size;
}

/**
 * 提取中文文本关键词（简单分词：2-4字滑动窗口 + 去停用词）
 */
function extractKeywords(text: string): Set<string> {
  const cleanText = text.replace(/[，。！？、；：""''（）【】《》\s\d\w]/g, '');
  const keywords = new Set<string>();

  // 2字词
  for (let i = 0; i < cleanText.length - 1; i++) {
    keywords.add(cleanText.substring(i, i + 2));
  }
  // 3字词
  for (let i = 0; i < cleanText.length - 2; i++) {
    keywords.add(cleanText.substring(i, i + 3));
  }

  return keywords;
}

/**
 * 合并多条记忆的内容
 * 保留最完整的那条，将其他条的独特信息追加
 */
function mergeContents(mainContent: string, otherContents: string[]): string {
  if (otherContents.length === 0) return mainContent;

  // 提取其他内容中的独特信息
  const mainKeywords = extractKeywords(mainContent);
  const additions: string[] = [];

  for (const other of otherContents) {
    const otherKeywords = extractKeywords(other);
    const uniqueKeywords = [...otherKeywords].filter(k => !mainKeywords.has(k));

    // 如果其他记忆有独特信息且不太长，追加
    if (uniqueKeywords.length > 3 && other.length < mainContent.length * 0.5) {
      additions.push(other.trim());
    }
  }

  if (additions.length === 0) return mainContent;

  // 合并：主内容 + 补充信息
  const merged = mainContent.trimEnd() + '\n\n[补充] ' + additions.join('；');
  
  // 限制总长度
  if (merged.length > 2000) {
    return merged.substring(0, 2000) + '...';
  }

  return merged;
}

/**
 * 从对话历史中提取用户记忆
 * 在对话结束时调用，将关键信息蒸馏为持久记忆
 */
export async function extractUserMemories(
  agentUsername: string,
  userId: string,
  conversations: Array<{ role: string; content: string }>
): Promise<number> {
  if (!DISTILLABLE_AGENTS.includes(agentUsername)) return 0;
  if (conversations.length < 4) return 0; // 对话太短不提取

  const { addMemory } = await import('./agent-memory');

  let extracted = 0;

  try {
    // 分析对话，提取关键信息
    // 简单策略：提取用户明确表达的偏好、需求、反馈
    const userMessages = conversations
      .filter(c => c.role === 'user')
      .map(c => c.content);

    const assistantMessages = conversations
      .filter(c => c.role === 'assistant')
      .map(c => c.content);

    // 提取偏好类记忆
    const preferencePatterns = [
      /我喜欢(.{2,20})/g,
      /我更倾向于(.{2,20})/g,
      /请用(.{2,10})风格/g,
      /我的(.{2,10})是(.{2,20})/g,
      /我们学校(.{2,30})/g,
    ];

    for (const msg of userMessages) {
      for (const pattern of preferencePatterns) {
        const matches = [...msg.matchAll(pattern)];
        for (const match of matches) {
          const prefText = match[0];
          if (prefText.length > 3 && prefText.length < 100) {
            await addMemory(agentUsername, 'preference', prefText, 'user_id', userId);
            extracted++;
          }
        }
      }
    }

    // 提取任务决策记忆（如选择了什么主题、什么难度）
    const decisionPatterns = [
      /选择[了]?["']?(.{2,30})["']?主题/g,
      /确认[了]?(.{2,30})方案/g,
      /决定[了]?(.{2,30})/g,
    ];

    for (const msg of userMessages) {
      for (const pattern of decisionPatterns) {
        const matches = [...msg.matchAll(pattern)];
        for (const match of matches) {
          const decisionText = `决策: ${match[0]}`;
          if (decisionText.length > 5 && decisionText.length < 100) {
            await addMemory(agentUsername, 'important_fact', decisionText, 'user_id', userId);
            extracted++;
          }
        }
      }
    }

  } catch (error) {
    console.error(`[记忆提取] 提取用户 ${userId} 的记忆失败:`, error);
  }

  return extracted;
}
