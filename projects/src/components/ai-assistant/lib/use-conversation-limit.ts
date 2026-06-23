'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  checkConversationLimit,
  CONVERSATION_LIMITS,
  type UsageStats,
  type LimitWarningType,
} from './conversation-limit';

/**
 * 对话限制监控 Hook
 * 从 ai-assistant.tsx 提取，负责追踪对话时长/轮数/离题率并显示警告
 * @param teamId - 团队 ID，用于隔离不同团队的统计数据
 */
export function useConversationLimit(teamId: string) {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [limitWarningType, setLimitWarningType] = useState<LimitWarningType>('rest');

  // 每日累计对话时长追踪 - 日期变更时重置
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const storedDate = localStorage.getItem(`yinshe_usage_date_${teamId}`);

    if (storedDate !== today) {
      localStorage.setItem(`yinshe_usage_date_${teamId}`, today);
      localStorage.setItem(`yinshe_usage_minutes_${teamId}`, '0');
    }
  }, [teamId]);

  // 每次对话增加时长（每轮约2分钟）
  const addConversationTime = useCallback(
    (minutes: number) => {
      const today = new Date().toISOString().split('T')[0];
      const storedDate = localStorage.getItem(`yinshe_usage_date_${teamId}`);
      if (storedDate !== today) return;

      const currentMinutes = parseInt(
        localStorage.getItem(`yinshe_usage_minutes_${teamId}`) || '0'
      );
      const newMinutes = currentMinutes + minutes;
      localStorage.setItem(`yinshe_usage_minutes_${teamId}`, String(newMinutes));
    },
    [teamId]
  );

  // 监控对话限制，显示提醒
  useEffect(() => {
    if (!usageStats) return;

    const today = new Date().toISOString().split('T')[0];
    const storedDate = localStorage.getItem(`yinshe_usage_date_${teamId}`);
    const storedMinutes = parseInt(
      localStorage.getItem(`yinshe_usage_minutes_${teamId}`) || '0'
    );
    const totalMinutes = storedDate === today ? storedMinutes : 0;

    const warningType = checkConversationLimit(usageStats, totalMinutes);

    if (warningType) {
      setLimitWarningType(warningType);
      setShowLimitWarning(true);
    } else {
      setShowLimitWarning(false);
    }
  }, [usageStats, teamId]);

  return {
    usageStats,
    setUsageStats,
    showLimitWarning,
    limitWarningType,
    setShowLimitWarning,
    addConversationTime,
    CONVERSATION_LIMITS,
  };
}
