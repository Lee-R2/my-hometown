'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 会话管理 Hook
 * 从 ai-assistant.tsx 提取，负责基于 teamId 生成和持久化会话 ID
 * 使用 sessionStorage：关闭标签即清空，重新进入算新会话
 * （符合"账号登录到退出期间连贯，退出再进入算新对话"的需求）
 * @param teamId - 团队 ID，用于隔离不同团队的会话
 */
export function useSession(teamId: string) {
  const [sessionId, setSessionId] = useState<string>('');

  // 初始化会话ID（基于 teamId 生成带时间戳的会话）
  useEffect(() => {
    if (teamId && !sessionId) {
      const storedSessionId = sessionStorage.getItem(`yinshe_session_${teamId}`);
      if (storedSessionId) {
        setSessionId(storedSessionId);
      } else {
        // 首次生成即带时间戳，避免会话永久固定导致上下文无限膨胀
        const newSessionId = `yinhe_team_${teamId}_${Date.now()}`;
        setSessionId(newSessionId);
        sessionStorage.setItem(`yinshe_session_${teamId}`, newSessionId);
      }
    }
  }, [teamId, sessionId]);

  /**
   * 重置会话（用于"开始新对话"等场景）
   */
  const resetSession = useCallback(() => {
    const newSessionId = `yinhe_team_${teamId}_${Date.now()}`;
    setSessionId(newSessionId);
    sessionStorage.setItem(`yinshe_session_${teamId}`, newSessionId);
  }, [teamId]);

  return {
    sessionId,
    setSessionId,
    resetSession,
  };
}
