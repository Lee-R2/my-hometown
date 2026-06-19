'use client';

import { useEffect, useCallback, useState } from 'react';
import { useDataSync } from '@/contexts/data-sync-context';

interface UseDataRefreshOptions {
  keys: string | string[];
  onRefresh: () => void | Promise<void>;
  immediate?: boolean;
}

/**
 * 数据自动刷新Hook
 * 当指定的数据键有更新时自动触发刷新回调
 */
export function useDataRefresh({ keys, onRefresh, immediate = false }: UseDataRefreshOptions) {
  const { subscribe, changes, hasUpdates, markSynced, isSyncing } = useDataSync();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const keyArray = Array.isArray(keys) ? keys : [keys];

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastRefresh(Date.now());
    } catch (error) {
      console.error('刷新失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing]);

  // 订阅数据变化
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    keyArray.forEach(key => {
      unsubscribers.push(subscribe(key, handleRefresh));
    });

    // 也订阅 'all' 键
    unsubscribers.push(subscribe('all', handleRefresh));

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [keyArray, subscribe, handleRefresh]);

  // 立即刷新
  useEffect(() => {
    if (immediate) {
      handleRefresh();
    }
  }, [immediate, handleRefresh]);

  // 检查是否有相关更新
  const hasRelevantUpdates = changes.some(key => keyArray.includes(key));

  return {
    isRefreshing,
    isSyncing,
    lastRefresh,
    hasUpdates: hasUpdates && hasRelevantUpdates,
    refreshNow: handleRefresh,
    markSynced,
  };
}

/**
 * 用于显示数据更新提示的Hook
 */
export function useUpdateNotification(keys: string | string[]) {
  const { hasUpdates, changes, markSynced } = useDataSync();
  const keyArray = Array.isArray(keys) ? keys : [keys];
  
  const hasRelevantUpdates = hasUpdates && changes.some(key => keyArray.includes(key));

  return {
    hasUpdates: hasRelevantUpdates,
    changes: changes.filter(key => keyArray.includes(key)),
    dismissUpdate: markSynced,
  };
}
