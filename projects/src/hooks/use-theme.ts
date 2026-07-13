'use client';

import { useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'theme';

/**
 * 从 localStorage 或系统偏好获取初始主题
 */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/**
 * 判断系统当前是否为暗色模式
 */
function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 将主题应用到 documentElement
 */
function applyTheme(theme: Theme) {
  const isDark = theme === 'dark' || (theme === 'system' && getSystemDark());
  document.documentElement.classList.toggle('dark', isDark);
}

/**
 * 暗黑模式 Hook
 *
 * 支持 light / dark / system 三种模式：
 * - system：跟随系统偏好，系统切换时自动响应
 * - light/dark：用户手动指定，覆盖系统偏好
 *
 * 用法：
 *   const { theme, setTheme, isDark } = useTheme();
 *   <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [isDark, setIsDark] = useState(false);

  // 初始化：读取存储的主题并应用
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
    setIsDark(stored === 'dark' || (stored === 'system' && getSystemDark()));
  }, []);

  // 监听系统主题变化（仅在 system 模式下响应）
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme('system');
      setIsDark(getSystemDark());
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    setIsDark(newTheme === 'dark' || (newTheme === 'system' && getSystemDark()));
  }, []);

  return { theme, setTheme, isDark };
}
