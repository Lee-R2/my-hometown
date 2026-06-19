'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const ParentAssistant = dynamic(() => import('@/components/parent-assistant'), {
  ssr: false,
  loading: () => null,
});

interface ParentData {
  id: string;
  name: string;
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [parent, setParent] = useState<ParentData | null>(null);

  useEffect(() => {
    // 优先从 /api/auth/me 获取家长信息（基于 HttpOnly Cookie 认证）
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.role === 'parent') {
          const parentData: ParentData = {
            id: data.user.id,
            name: data.user.name,
          };
          setParent(parentData);
          // 更新 localStorage 缓存（最小化信息）
          localStorage.setItem('parent', JSON.stringify({
            id: parentData.id,
            name: parentData.name,
          }));
        } else {
          // API 认证失败，降级到 localStorage
          try {
            const stored = localStorage.getItem('parent');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (parsed?.id) {
                setParent({ id: parsed.id, name: parsed.name || '' });
                return;
              }
            }
          } catch {}
          // 家长端不强制跳转登录，只是不显示助手
        }
      })
      .catch(() => {
        // 网络错误时降级到 localStorage
        try {
          const stored = localStorage.getItem('parent');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.id) {
              setParent({ id: parsed.id, name: parsed.name || '' });
            }
          }
        } catch {}
      });
  }, [pathname]);

  // 登录页面不显示智能体
  const isLoginPage = pathname === '/parent/login';

  return (
    <>
      {children}
      {parent && !isLoginPage && (
        <ParentAssistant parentId={parent.id} parentName={parent.name} />
      )}
    </>
  );
}
