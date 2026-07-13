'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * PWA Service Worker 注册组件
 *
 * - 仅在生产环境注册（开发环境避免缓存干扰调试）
 * - 检测到新 SW 时提示用户刷新
 */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        // 检测到新版本 SW，提示用户刷新
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // 新版本已就绪，提示用户刷新
              toast.info('发现新版本', {
                description: '刷新页面以获取最新更新',
                duration: 8000,
                action: {
                  label: '立即刷新',
                  onClick: () => window.location.reload(),
                },
              });
            }
          });
        });

        // 监听 controller 变化（SW 已接管）
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // 如果是首次安装（无 controller），不刷新
          // 如果是更新后的接管，由 toast 的 action 按钮触发刷新
        });
      } catch (error) {
        console.warn('[PWA] Service Worker 注册失败:', error);
      }
    };

    register();
  }, []);

  return null;
}
