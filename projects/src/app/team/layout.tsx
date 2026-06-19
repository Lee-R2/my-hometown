'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { DataSyncProvider } from '@/contexts/data-sync-context';

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
          // API 认证失败，检查 localStorage 降级
          const cached = localStorage.getItem('team');
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed?.id && parsed?.code) {
                setTeam(parsed);
                setChecked(true);
                return;
              }
            } catch {}
          }
          localStorage.removeItem('team');
          window.location.href = '/team/login';
        }
      })
      .catch(() => {
        // 网络错误时降级到 localStorage
        const cached = localStorage.getItem('team');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.id && parsed?.code) {
              setTeam(parsed);
              setChecked(true);
              return;
            }
          } catch {}
        }
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <DataSyncProvider teamId={team?.id} enabled={!!team}>
      {children}
      {team && <AIAssistant assistantType="yinhe" position="bottom-right" teamId={team?.id} />}
    </DataSyncProvider>
  );
}
