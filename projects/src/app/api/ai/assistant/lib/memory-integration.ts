import {
  getOrCreateSession,
  getConversations,
  getMemories
} from '@/lib/agent-memory';

/**
 * 记忆系统集成
 * 从 route.ts POST 函数中提取（L1934-2003）
 * 创建或获取会话、获取对话历史、获取相关记忆、构建记忆上下文
 */

export interface MemoryIntegrationResult {
  sessionResult: any;
  conversations: any[];
  memories: any[];
  memoryContext: string;
}

/**
 * 集成记忆系统：会话管理 + 对话历史 + 记忆上下文
 * @param agentUsername 智能体用户名
 * @param teamId 小队ID
 * @param sessionId 会话ID
 */
export async function getMemoryIntegration(
  agentUsername: string,
  teamId: string,
  sessionId: string
): Promise<MemoryIntegrationResult> {
  // 1. 创建或获取会话
  const sessionResult = await getOrCreateSession(agentUsername, undefined, teamId, sessionId);
  if (!sessionResult) {
    console.error('[银蛇博士API] 会话管理初始化失败，使用默认会话ID');
  }

  // 2. 获取对话历史
  const conversations = await getConversations(agentUsername, sessionId, 20);
  console.log('[银蛇博士API] 加载对话历史:', conversations.length, '条');

  // 3. 获取相关记忆
  const memories = await getMemories(agentUsername, {
    contextKey: 'team_id',
    contextValue: teamId,
    limit: 10
  });

  // 4. 构建记忆上下文 — 按类别分组，与银蛇博士身份融合
  let memoryContext = '';
  if (memories.length > 0) {
    // 按类别分组记忆
    const memoryByCategory: Record<string, string[]> = {};
    memories.forEach((mem: any) => {
      const cat = mem.memory_type || 'other';
      if (!memoryByCategory[cat]) memoryByCategory[cat] = [];
      memoryByCategory[cat].push(mem.content);
    });

    memoryContext = '\n\n【你关于这位小伙伴的记忆】\n';

    // 按银蛇博士关心的维度呈现
    if (memoryByCategory['user_info']?.length) {
      memoryContext += '🏷️ 关于他/她：\n';
      memoryByCategory['user_info'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    if (memoryByCategory['learning_difficulty']?.length) {
      memoryContext += '🧩 他/她卡过的地方（下次遇到类似问题要主动帮忙）：\n';
      memoryByCategory['learning_difficulty'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    if (memoryByCategory['learning_interest']?.length) {
      memoryContext += '✨ 他/她感兴趣的点（可以用这些来举例和引入）：\n';
      memoryByCategory['learning_interest'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    if (memoryByCategory['task_progress']?.length) {
      memoryContext += '📋 任务进展记录：\n';
      memoryByCategory['task_progress'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    if (memoryByCategory['interaction_style']?.length) {
      memoryContext += '🎮 互动偏好（调整出题和互动方式）：\n';
      memoryByCategory['interaction_style'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    if (memoryByCategory['teaching_point']?.length) {
      memoryContext += '📖 你教过的关键知识（避免重复，适时复习）：\n';
      memoryByCategory['teaching_point'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    if (memoryByCategory['team_info']?.length) {
      memoryContext += '🛡️ 小队信息：\n';
      memoryByCategory['team_info'].forEach(c => memoryContext += `  • ${c}\n`);
    }
    // 其他类别
    const knownCats = ['user_info','learning_difficulty','learning_interest','task_progress','interaction_style','teaching_point','team_info','preference','other'];
    Object.keys(memoryByCategory).filter(c => !knownCats.includes(c)).forEach(cat => {
      memoryContext += `📝 ${cat}：\n`;
      memoryByCategory[cat].forEach(c => memoryContext += `  • ${c}\n`);
    });
  }
  console.log('[银蛇博士API] 加载记忆:', memories.length, '条');

  return {
    sessionResult,
    conversations,
    memories,
    memoryContext
  };
}
