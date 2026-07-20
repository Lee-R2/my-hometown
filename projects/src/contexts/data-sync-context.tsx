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

  // 安全修复 LE-F01: 把 lastSync 放进 ref,避免 syncNow 依赖 lastSync state。
  // 之前 markSynced() 调用 setLastSync(Date.now()) 会重建 syncNow,
  // 进而触发 [enabled, interval, syncNow] 的 effect 重新执行 → 立即 syncNow() 一次 + 重建 interval,
  // 形成"标记已读 → 触发同步 → 又有更新 → 再次标记"的乒乓效应。
  // 改为 ref 后,syncNow 依赖列表不再包含 lastSync,effect 不会因 markSynced 而重建。
  const lastSyncRef = useRef<number>(lastSync);

  const syncNow = useCallback(async () => {
    if (!enabled) return;

    setIsSyncing(true);
    try {
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (userId) params.append('userId', userId);
      if (userRole) params.append('userRole', userRole);
      params.append('lastSync', lastSyncRef.current.toString());

      const res = await fetch(`/api/sync?${params.toString()}`);

      // 检查 response.ok，避免 HTML 错误页导致 JSON 解析失败
      if (!res.ok) {
        return;
      }

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
      // 静默处理网络错误（热重载、离线、请求取消等），避免控制台刷屏
      // 同步失败不影响主功能，下次定时器会重试
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, teamId, userId, userRole]);

  const markSynced = useCallback(() => {
    const now = Date.now();
    // 同步更新 ref 和 state:ref 供 syncNow 读取最新值,state 供 UI 显示
    lastSyncRef.current = now;
    setLastSync(now);
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
