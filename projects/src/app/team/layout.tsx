'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    // 登录页面不需要检查
    if (pathname === '/team/login') {
      setChecked(true);
      return;
    }

    // 优先从 /api/auth/me 获取小队信息（基于 HttpOnly Cookie 认证）
    fetch('/api/auth/me')
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
      .catch(() => {
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
