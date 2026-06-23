/**
 * 对话限制监控工具函数
 * 从 ai-assistant.tsx 提取的纯判断逻辑（无状态依赖）
 */

/**
 * 对话限制阈值常量
 */
export const CONVERSATION_LIMITS = {
  MAX_DAILY_MINUTES: 120,    // 每日最大对话时长（分钟）
  MAX_ROUNDS: 50,            // 最大对话轮数
  OFF_TOPIC_THRESHOLD: 0.5,  // 离题率阈值
} as const;

/**
 * 对话限制警告类型
 * - 'end': 超时，主动结束对话
 * - 'task': 离题过多，提醒回归任务
 * - 'rest': 轮数过多，提示休息
 */
export type LimitWarningType = 'end' | 'task' | 'rest' | null;

/**
 * 对话使用统计
 */
export interface UsageStats {
  conversationRounds: number;
  dailyMinutes: number;
  offTopicRatio: number;
  offTopicCount: number;
}

/**
 * 根据使用统计判断应显示的警告类型
 * @param stats - 当前使用统计
 * @param storedMinutes - 本地存储的累计分钟数
 * @returns 警告类型，null 表示无需警告
 */
export function checkConversationLimit(
  stats: UsageStats | null,
  storedMinutes: number
): LimitWarningType {
  if (!stats) return null;

  // 超过2小时（120分钟）主动结束对话
  if (storedMinutes >= CONVERSATION_LIMITS.MAX_DAILY_MINUTES ||
      stats.dailyMinutes >= CONVERSATION_LIMITS.MAX_DAILY_MINUTES) {
    return 'end';
  }

  // 离题超过50% - 提醒回归任务
  if (stats.offTopicRatio >= CONVERSATION_LIMITS.OFF_TOPIC_THRESHOLD) {
    return 'task';
  }

  // 超过50轮 - 提示休息
  if (stats.conversationRounds >= CONVERSATION_LIMITS.MAX_ROUNDS) {
    return 'rest';
  }

  return null;
}
