'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// 全局存储当前滚动位置
const scrollPositions = new Map<string, { x: number; y: number }>();

/**
 * 全局滚动位置恢复组件
 * 
 * 功能：
 * - 当用户离开页面时，保存当前滚动位置
 * - 当用户返回页面时，恢复之前的滚动位置
 * - 适用于所有角色、所有页面
 */
export default function ScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRestoringRef = useRef(false);
  const currentScrollRef = useRef({ x: 0, y: 0 });
  const prevPathRef = useRef<string>('');

  // 获取完整路径
  const getFullPath = () => {
    return pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
  };

  // 保存滚动位置
  const savePosition = (path: string, x: number, y: number) => {
    if (!path || isRestoringRef.current) return;
    if (y > 30 || x > 0) {
      scrollPositions.set(path, { x, y });
      // 同时保存到 sessionStorage 作为备份
      try {
        sessionStorage.setItem(`scroll_${path}`, JSON.stringify({ scrollX: x, scrollY: y }));
      } catch (e) {
        // ignore
      }
    } else {
      scrollPositions.delete(path);
      try {
        sessionStorage.removeItem(`scroll_${path}`);
      } catch (e) {
        // ignore
      }
    }
  };

  // 恢复滚动位置
  const restorePosition = (path: string) => {
    if (!path) return;

    // 先从内存中获取，如果没有再从 sessionStorage 获取
    let position = scrollPositions.get(path);
    if (!position) {
      try {
        const saved = sessionStorage.getItem(`scroll_${path}`);
        if (saved) {
          position = JSON.parse(saved);
        }
      } catch (e) {
        // ignore
      }
    }

    if (position && (position.y > 30 || position.x > 0)) {
      const { x, y } = position;
      isRestoringRef.current = true;

      const doScroll = (attempt = 0) => {
        if (attempt > 15) {
          isRestoringRef.current = false;
          return;
        }

        const docHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );

        if (docHeight >= y) {
          window.scrollTo(x, y);
          
          // 验证
          if (Math.abs(window.scrollY - y) < 10) {
            setTimeout(() => {
              isRestoringRef.current = false;
            }, 200);
          } else if (attempt < 10) {
            setTimeout(() => doScroll(attempt + 1), 80);
          } else {
            isRestoringRef.current = false;
          }
        } else {
          setTimeout(() => doScroll(attempt + 1), 50);
        }
      };

      // 延迟执行，等待 Next.js 的默认滚动完成
      setTimeout(() => {
        requestAnimationFrame(() => doScroll());
      }, 50);
    }
  };

  // 初始化：禁用浏览器默认滚动恢复
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  // 监听滚动事件，实时记录位置
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      if (!isRestoringRef.current) {
        currentScrollRef.current = { x: window.scrollX, y: window.scrollY };
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 路由变化处理
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentPath = getFullPath();
    const prevPath = prevPathRef.current;

    // 如果是路由变化（不是首次加载）
    if (prevPath && prevPath !== currentPath) {
      // 保存上一个路径的滚动位置（使用记录的位置，不是当前的 window.scrollY）
      const { x, y } = currentScrollRef.current;
      savePosition(prevPath, x, y);
    }

    // 尝试恢复当前路径的滚动位置
    restorePosition(currentPath);

    // 更新上一个路径
    prevPathRef.current = currentPath;

    // 清理函数：在组件卸载或路由变化前保存
    return () => {
      const path = getFullPath();
      // 使用记录的位置保存
      const { x, y } = currentScrollRef.current;
      if (path && (y > 30 || x > 0)) {
        savePosition(path, x, y);
      }
    };
  }, [pathname, searchParams]);

  // 定期保存当前位置
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const interval = setInterval(() => {
      const path = getFullPath();
      const { x, y } = currentScrollRef.current;
      if (path && (y > 30 || x > 0)) {
        savePosition(path, x, y);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [pathname, searchParams]);

  // 页面关闭前保存
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      const path = getFullPath();
      const { x, y } = currentScrollRef.current;
      savePosition(path, x, y);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pathname, searchParams]);

  return null;
}
