import { getConversations } from '@/lib/agent-memory';

/**
 * 对话限制统计
 * 从 route.ts POST 函数中提取（L1888-1932）
 * 统计今日对话轮次和时长、计算离题比例
 */

// 任务相关关键词（与原文件保持一致）
const TASK_RELATED_KEYWORDS = [
  '任务', '主题', '积分', '技能', '工具', '小队', '阶段', '产出', '提交',
  '学习', '探索', '观察', '实验', '制作', '调查', '设计', '报告', '评价',
  '审核', '志愿者', '老师', '学校', '激励', '宝石', '碎片', '点赞',
  '归还', '赠送', '借用', '成员', '口号', '周期', '完成'
];

export interface ConversationStats {
  conversationRounds: number;
  dailyMinutes: number;
  offTopicCount: number;
  totalAnalyzed: number;
  offTopicRatio: number;
}

/**
 * 统计今日对话轮次、估算时长、计算离题比例
 * @param agentUsername 智能体用户名
 * @param sessionId 会话ID
 */
export async function getConversationStats(
  agentUsername: string,
  sessionId: string
): Promise<ConversationStats> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const todayConversations = await getConversations(agentUsername, sessionId, 200);

  const todayUserMessages = todayConversations.filter((conv: any) => {
    if (conv.role !== 'user') return false;
    const convDate = conv.created_at ? new Date(conv.created_at).toISOString().split('T')[0] : '';
    return convDate === today;
  });
  const conversationRounds = todayUserMessages.length;

  // 获取今日累计对话时长（从数据库元数据或计算）
  const todayAllMessages = todayConversations.filter((conv: any) => {
    const convDate = conv.created_at ? new Date(conv.created_at).toISOString().split('T')[0] : '';
    return convDate === today;
  });
  // 估算对话时长：每条消息约1分钟
  const estimatedMinutes = todayAllMessages.length * 1;
  const dailyMinutes = estimatedMinutes;

  // 计算离题比例（从今日对话历史中判断）
  let offTopicCount = 0;
  const userMessagesForAnalysis = todayUserMessages.slice(-20); // 分析最近20条
  for (const msg of userMessagesForAnalysis) {
    const content = (msg.content || '').toLowerCase();
    const isTaskRelated = TASK_RELATED_KEYWORDS.some(k => content.includes(k));
    if (!isTaskRelated && content.length > 0) {
      offTopicCount++;
    }
  }
  const offTopicRatio = userMessagesForAnalysis.length > 0
    ? offTopicCount / userMessagesForAnalysis.length
    : 0;

  console.log('[银蛇博士API] 对话统计:', {
    conversationRounds,
    dailyMinutes,
    offTopicCount,
    totalAnalyzed: userMessagesForAnalysis.length,
    offTopicRatio: (offTopicRatio * 100).toFixed(1) + '%'
  });

  return {
    conversationRounds,
    dailyMinutes,
    offTopicCount,
    totalAnalyzed: userMessagesForAnalysis.length,
    offTopicRatio
  };
}
