'use client';

import { useState, useEffect, useRef } from 'react';
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
  // LE-F05: AbortController 防止卸载后 setState
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // LE-F05: 取消上一个未完成请求,防止快速切换路由时卸载组件后 setState
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // 优先从 /api/auth/me 获取家长信息（基于 HttpOnly Cookie 认证）
    fetch('/api/auth/me', { signal: controller.signal })
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
        }
        // API 认证失败时不显示助手（不降级到 localStorage，避免鉴权绕过）
      })
      .catch((err: any) => {
        // LE-F05: 主动 abort 不算错误,静默忽略
        if (err?.name === 'AbortError') return;
        // 网络错误时不显示助手（不降级到 localStorage，避免鉴权绕过）
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
