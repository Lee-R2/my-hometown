'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Share, PlusSquare } from 'lucide-react';

/**
 * PWA 安装引导提示
 *
 * 三种场景：
 * 1. Android Chrome: 监听 beforeinstallprompt，显示"安装"按钮，点击触发系统安装弹窗
 * 2. iOS Safari: 不支持 beforeinstallprompt，显示手动操作引导（分享 → 添加到主屏幕）
 * 3. 已安装（standalone 模式）: 不显示任何提示
 *
 * 防打扰策略：
 * - 用户点击"关闭"后 7 天内不再提示
 * - 用户点击"安装"后不再提示（无论是否成功安装）
 */
export default function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 仅生产环境显示
    if (process.env.NODE_ENV !== 'production') return;

    // 已安装为独立应用，不显示
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((window.navigator as any).standalone === true) return; // iOS Safari

    // 检查是否在关闭冷却期内（7 天）
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < sevenDays) return;
    }

    // 检测平台
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/.test(ua);
    const isChrome = /Chrome/.test(ua) && !/Edg|OPR/.test(ua);

    if (isIOS) {
      // iOS 不支持 beforeinstallprompt，延迟 3 秒后显示手动引导
      setPlatform('ios');
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }

    if (isAndroid && isChrome) {
      // Android Chrome 监听 beforeinstallprompt
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setPlatform('android');
        setShow(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    // 其他浏览器（桌面 Chrome/Edge 等）也监听 beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('android');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // 处理 Android 安装
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDeferredPrompt(null);
      setShow(false);
      // 用户已交互，不再提示
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }
  };

  // 关闭提示
  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!show || !platform) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="mx-auto max-w-md px-4 pb-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
          {/* 图标 */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            {platform === 'ios' ? (
              <Share className="h-5 w-5 text-primary" />
            ) : (
              <Download className="h-5 w-5 text-primary" />
            )}
          </div>

          {/* 文案 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {platform === 'ios' ? '添加到主屏幕' : '安装到桌面'}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {platform === 'ios'
                ? '点击底部分享按钮，选择「添加到主屏幕」'
                : '像 APP 一样使用，离线也能访问'}
            </p>
          </div>

          {/* 操作按钮 */}
          {platform === 'android' ? (
            <Button size="sm" onClick={handleInstall} className="shrink-0">
              安装
            </Button>
          ) : (
            <div className="flex items-center gap-1 shrink-0 text-primary">
              <Share className="h-4 w-4" />
              <PlusSquare className="h-4 w-4" />
            </div>
          )}

          {/* 关闭 */}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
