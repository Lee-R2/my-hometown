'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { DataSyncProvider } from '@/contexts/data-sync-context';

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
          // API 认证失败，检查 localStorage 降级
          const cached = localStorage.getItem('user');
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              // localStorage 缓存也可能过期，跳转登录
              if (parsed?.id && parsed?.role) {
                setUser(parsed);
                setChecked(true);
                return;
              }
            } catch {}
          }
          // 都失败，跳转登录
          localStorage.removeItem('user');
          window.location.href = '/admin/login';
        }
      })
      .catch(() => {
        // 网络错误时降级到 localStorage
        const cached = localStorage.getItem('user');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.id && parsed?.role) {
              setUser(parsed);
              setChecked(true);
              return;
            }
          } catch {}
        }
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
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
