'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

interface SyncStatus {
  teams: number;
  tasks: number;
  submissions: number;
  rewards: number;
  skills: number;
  tools: number;
  messages: number;
  members: number;
  user_rewards: number;
  task_themes: number;
  team_side_tasks: number;
  permissions: number;
}

interface SyncContextType {
  lastSync: number;
  status: SyncStatus | null;
  isSyncing: boolean;
  hasUpdates: boolean;
  changes: string[];
  syncNow: () => Promise<void>;
  markSynced: () => void;
  subscribe: (key: string, callback: () => void) => () => void;
}

const DataSyncContext = createContext<SyncContextType | null>(null);

interface DataSyncProviderProps {
  children: React.ReactNode;
  teamId?: string;
  userId?: string;
  userRole?: string;
  interval?: number; // 同步间隔，默认30秒
  enabled?: boolean;
}

export function DataSyncProvider({
  children,
  teamId,
  userId,
  userRole,
  interval = 30000,
  enabled = true,
}: DataSyncProviderProps) {
  const [lastSync, setLastSync] = useState(Date.now());
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());

  const syncNow = useCallback(async () => {
    if (!enabled) return;
    
    setIsSyncing(true);
    try {
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (userId) params.append('userId', userId);
      if (userRole) params.append('userRole', userRole);
      params.append('lastSync', lastSync.toString());

      const res = await fetch(`/api/sync?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setStatus(data.status);
        
        if (data.hasUpdates && data.changes.length > 0) {
          setHasUpdates(true);
          setChanges(data.changes);
          
          // 通知订阅者
          data.changes.forEach((key: string) => {
            const callbacks = subscribersRef.current.get(key);
            if (callbacks) {
              callbacks.forEach(cb => cb());
            }
          });
          
          // 同时通知 'all' 订阅者
          const allCallbacks = subscribersRef.current.get('all');
          if (allCallbacks) {
            allCallbacks.forEach(cb => cb());
          }
        }
      }
    } catch (error) {
      console.error('同步失败:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, teamId, userId, userRole, lastSync]);

  const markSynced = useCallback(() => {
    setLastSync(Date.now());
    setHasUpdates(false);
    setChanges([]);
  }, []);

  const subscribe = useCallback((key: string, callback: () => void) => {
    if (!subscribersRef.current.has(key)) {
      subscribersRef.current.set(key, new Set());
    }
    subscribersRef.current.get(key)!.add(callback);

    return () => {
      subscribersRef.current.get(key)?.delete(callback);
    };
  }, []);

  // 定期同步
  useEffect(() => {
    if (!enabled) return;

    // 初始同步
    syncNow();

    // 设置定时器
    const timer = setInterval(syncNow, interval);

    return () => clearInterval(timer);
  }, [enabled, interval, syncNow]);

  // 页面可见性变化时同步
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, syncNow]);

  return (
    <DataSyncContext.Provider
      value={{
        lastSync,
        status,
        isSyncing,
        hasUpdates,
        changes,
        syncNow,
        markSynced,
        subscribe,
      }}
    >
      {children}
    </DataSyncContext.Provider>
  );
}

export function useDataSync() {
  const context = useContext(DataSyncContext);
  if (!context) {
    throw new Error('useDataSync must be used within a DataSyncProvider');
  }
  return context;
}

// 用于组件级别的数据刷新Hook
export function useSyncRefresh(key: string, onRefresh: () => void) {
  const { subscribe, changes, hasUpdates, markSynced } = useDataSync();

  useEffect(() => {
    return subscribe(key, onRefresh);
  }, [subscribe, key, onRefresh]);

  return {
    hasUpdates,
    changes: changes.includes(key),
    markSynced,
  };
}

// 用于检查特定数据是否有更新
export function useSyncStatus(key: string) {
  const { status, lastSync, hasUpdates, changes } = useDataSync();
  
  const keyHasUpdate = changes.includes(key);
  const keyLastUpdate = status?.[key as keyof SyncStatus] || 0;

  return {
    lastSync,
    lastUpdate: keyLastUpdate,
    hasUpdate: keyHasUpdate,
    isStale: keyLastUpdate > lastSync,
  };
}
