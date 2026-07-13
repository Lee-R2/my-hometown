import type { Metadata, Viewport } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Suspense } from 'react';
import Script from 'next/script';
import { Toaster } from '@/components/ui/sonner';
import ScrollRestoration from '@/components/scroll-restoration';
import PWARegister from '@/components/pwa-register';
import PWAInstallPrompt from '@/components/pwa-install-prompt';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '我们的家乡 — 少年数字乡建',
    template: '%s | 我们的家乡',
  },
  description:
    '乡村少年 STEM 协作学习平台 — 小队协作完成任务，与银蛇博士对话，积累爱心碎片',
  keywords: [
    '我们的家乡',
    '少年数字乡建',
    'STEM教育',
    '协作学习',
    '乡村教育',
    '银蛇博士',
    '蜡象助手',
  ],
  authors: [{ name: 'Our Home Team' }],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: '我们的家乡',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: '我们的家乡 — 少年数字乡建',
    description: '乡村少年 STEM 协作学习平台',
    siteName: '我们的家乡',
    locale: 'zh_CN',
    type: 'website',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: '我们的家乡 — 少年数字乡建',
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#4f46e5',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`antialiased safe-top safe-bottom`} suppressHydrationWarning>
        {/* 主题初始化 — 在首帧渲染前应用，防止暗黑模式 FOUC */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`}
        </Script>
        {/* Global ChunkLoadError recovery: auto-reload when stale chunks detected after server restart */}
        <Script id="chunk-load-error-recovery" strategy="beforeInteractive">
          {`(function(){var r=false;window.addEventListener('error',function(e){if(!r&&(e.message&&(/loading chunk/i.test(e.message)||/failed to fetch dynamically imported module/i.test(e.message)))){r=true;console.warn('[ChunkLoadError] Auto-reloading...');window.location.reload();}});window.addEventListener('unhandledrejection',function(e){if(!r&&e.reason&&(e.reason.name==='ChunkLoadError'||(e.reason.message&&(/loading chunk/i.test(e.reason.message)||/failed to fetch dynamically imported module/i.test(e.reason.message))))){r=true;console.warn('[ChunkLoadError] Auto-reloading...');window.location.reload();}});})();`}
        </Script>
        <Suspense fallback={null}>
          <ScrollRestoration />
        </Suspense>
        <PWARegister />
        <PWAInstallPrompt />
        {isDev && <Inspector />}
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
