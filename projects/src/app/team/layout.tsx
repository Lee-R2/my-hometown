'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { DataSyncProvider } from '@/contexts/data-sync-context';
import { BottomNav } from '@/components/bottom-nav';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';

const AIAssistant = dynamic(() => import('@/components/ai-assistant'), {
  ssr: false,
  loading: () => null,
});

interface Team {
  id: string;
  code: string;
  name: string;
}

export default function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [team, setTeam] = useState<Team | null>(null);
  const [checked, setChecked] = useState(false);
  // LE-F05: AbortController 防止卸载后 setState
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // 登录页面不需要检查
    if (pathname === '/team/login') {
      setChecked(true);
      return;
    }

    // LE-F05: 取消上一个未完成请求,防止快速切换路由时卸载组件后 setState
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // 优先从 /api/auth/me 获取小队信息（基于 HttpOnly Cookie 认证）
    fetch('/api/auth/me', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.role === 'team') {
          const teamData: Team = {
            id: data.user.id,
            code: data.user.code,
            name: data.user.name,
          };
          setTeam(teamData);
          // 更新 localStorage 缓存（最小化信息）
          localStorage.setItem('team', JSON.stringify({
            id: teamData.id,
            code: teamData.code,
            name: teamData.name,
          }));
          setChecked(true);
        } else {
          // API 认证失败，一律跳转登录页（不降级到 localStorage，避免鉴权绕过）
          localStorage.removeItem('team');
          window.location.href = '/team/login';
        }
      })
      .catch((err: any) => {
        // LE-F05: 主动 abort 不算错误,不跳转
        if (err?.name === 'AbortError') return;
        // 网络错误时也一律跳转登录页（不降级到 localStorage，避免鉴权绕过）
        localStorage.removeItem('team');
        window.location.href = '/team/login';
      });
  }, [pathname]);

  // 登录页面直接显示
  if (pathname === '/team/login') {
    return <>{children}</>;
  }

  // 其他页面等待检查完成
  if (!checked) {
    return <DashboardSkeleton />;
  }

  return (
    <DataSyncProvider teamId={team?.id} enabled={!!team}>
      {children}
      {team && <AIAssistant assistantType="yinhe" position="bottom-right" teamId={team?.id} />}
      <BottomNav />
    </DataSyncProvider>
  );
}
