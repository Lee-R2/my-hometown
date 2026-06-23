'use client';

import { useState, useEffect } from 'react';
import { subscribeAssistantContext } from '@/lib/assistant-context';

/**
 * 页面上下文类型
 */
export interface PageContext {
  type: string;
  title: string;
  data: Record<string, unknown>;
}

/**
 * 页面上下文订阅 Hook
 * 从 ai-assistant.tsx 提取，订阅当前打开页面的上下文数据
 * 返回当前页面上下文，供 AI 助手感知用户所在页面
 */
export function usePageContext() {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAssistantContext((context) => {
      setPageContext(context);
    });
    return unsubscribe;
  }, []);

  return pageContext;
}
