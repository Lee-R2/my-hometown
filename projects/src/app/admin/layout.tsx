'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { DataSyncProvider } from '@/contexts/data-sync-context';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';

const AdminAssistant = dynamic(() => import('@/components/admin-assistant'), {
  ssr: false,
  loading: () => null,
});

interface User {
  id: string;
  username?: string;
  name: string;
  role: string;
  school_id?: string;
  school_name?: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // 登录页面不需要检查
    if (pathname === '/admin/login') {
      setChecked(true);
      return;
    }

    // 优先从 /api/auth/me 获取用户信息（基于 HttpOnly Cookie 认证）
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.role !== 'team' && data.role !== 'parent') {
          const userData: User = {
            id: data.user.id,
            username: data.user.username,
            name: data.user.name,
            role: data.user.role,
            school_id: data.user.school_id,
            school_name: data.user.school_name,
          };
          setUser(userData);
          // 更新 localStorage 缓存（最小化信息）
          localStorage.setItem('user', JSON.stringify({
            id: userData.id,
            name: userData.name,
            role: userData.role,
          }));
          setChecked(true);
        } else {
          // API 认证失败，一律跳转登录页（不降级到 localStorage，避免鉴权绕过）
          localStorage.removeItem('user');
          window.location.href = '/admin/login';
        }
      })
      .catch(() => {
        // 网络错误时也一律跳转登录页（不降级到 localStorage，避免鉴权绕过）
        localStorage.removeItem('user');
        window.location.href = '/admin/login';
      });
  }, [pathname]);

  // 登录页面直接显示
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // 其他页面等待检查完成
  if (!checked) {
    return <DashboardSkeleton />;
  }

  return (
    <DataSyncProvider 
      userId={user?.id}
      userRole={user?.role as 'admin' | 'volunteer' | 'teacher'}
      enabled={!!user}
    >
      {children}
      {user && <AdminAssistant userId={user.id} userRole={user.role as 'admin' | 'volunteer' | 'teacher'} />}
    </DataSyncProvider>
  );
}
