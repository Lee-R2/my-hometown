'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 页面滚动位置记忆 Hook
 * 当用户从页面跳转到其他页面再返回时，恢复到之前的滚动位置
 * 
 * @param key 可选的自定义存储键，默认使用当前路径
 */
export function useScrollPosition(key?: string) {
  const pathname = usePathname();
  const storageKey = key || `scroll-position-${pathname}`;
  const isRestoredRef = useRef(false);

  // 恢复滚动位置
  useEffect(() => {
    // 只在客户端执行
    if (typeof window === 'undefined') return;

    // 避免重复恢复
    if (isRestoredRef.current) return;

    const savedPosition = sessionStorage.getItem(storageKey);
    if (savedPosition) {
      const position = parseInt(savedPosition, 10);
      if (!isNaN(position) && position > 0) {
        // 使用 setTimeout 确保 DOM 渲染完成后再滚动
        setTimeout(() => {
          window.scrollTo({
            top: position,
            behavior: 'instant' as ScrollBehavior,
          });
          isRestoredRef.current = true;
        }, 100);
      }
    }

    return () => {
      isRestoredRef.current = false;
    };
  }, [storageKey]);

  // 保存滚动位置
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ticking = false;

    const saveScrollPosition = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          if (scrollY > 0) {
            sessionStorage.setItem(storageKey, scrollY.toString());
          } else {
            // 如果滚动位置为 0，移除存储
            sessionStorage.removeItem(storageKey);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    // 监听滚动事件
    window.addEventListener('scroll', saveScrollPosition, { passive: true });

    // 页面卸载时保存当前位置
    const handleBeforeUnload = () => {
      const scrollY = window.scrollY;
      if (scrollY > 0) {
        sessionStorage.setItem(storageKey, scrollY.toString());
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('scroll', saveScrollPosition);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [storageKey]);

  // 清除保存的滚动位置
  const clearScrollPosition = () => {
    sessionStorage.removeItem(storageKey);
  };

  return { clearScrollPosition };
}

/**
 * 滚动位置管理工具函数
 */
export const scrollPositionManager = {
  /**
   * 清除所有保存的滚动位置
   */
  clearAll: () => {
    if (typeof window === 'undefined') return;
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('scroll-position-')) {
        sessionStorage.removeItem(key);
      }
    });
  },

  /**
   * 清除特定页面的滚动位置
   */
  clear: (pathname: string) => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(`scroll-position-${pathname}`);
  },

  /**
   * 获取保存的滚动位置
   */
  get: (pathname: string): number | null => {
    if (typeof window === 'undefined') return null;
    const saved = sessionStorage.getItem(`scroll-position-${pathname}`);
    return saved ? parseInt(saved, 10) : null;
  },
};
