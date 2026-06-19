import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Suspense } from 'react';
import Script from 'next/script';
import { Toaster } from '@/components/ui/sonner';
import ScrollRestoration from '@/components/scroll-restoration';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '新应用 | 扣子编程',
    template: '%s | 扣子编程',
  },
  description:
    '扣子编程是一款一站式云端 Vibe Coding 开发平台。通过对话轻松构建智能体、工作流和网站，实现从创意到上线的无缝衔接。',
  keywords: [
    '扣子编程',
    'Coze Code',
    'Vibe Coding',
    'AI 编程',
    '智能体搭建',
    '工作流搭建',
    '网站搭建',
    '网站部署',
    '全栈开发',
    'AI 工程师',
  ],
  authors: [{ name: 'Coze Code Team', url: 'https://code.coze.cn' }],
  generator: 'Coze Code',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: '扣子编程 | 你的 AI 工程师已就位',
    description:
      '我正在使用扣子编程 Vibe Coding，让创意瞬间上线。告别拖拽，拥抱心流。',
    url: 'https://code.coze.cn',
    siteName: '扣子编程',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: '扣子编程 - 你的 AI 工程师',
    //   },
    // ],
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="en">
      <body className={`antialiased`} suppressHydrationWarning>
        {/* Global ChunkLoadError recovery: auto-reload when stale chunks detected after server restart */}
        <Script id="chunk-load-error-recovery" strategy="beforeInteractive">
          {`(function(){var r=false;window.addEventListener('error',function(e){if(!r&&(e.message&&(/loading chunk/i.test(e.message)||/failed to fetch dynamically imported module/i.test(e.message)))){r=true;console.warn('[ChunkLoadError] Auto-reloading...');window.location.reload();}});window.addEventListener('unhandledrejection',function(e){if(!r&&e.reason&&(e.reason.name==='ChunkLoadError'||(e.reason.message&&(/loading chunk/i.test(e.reason.message)||/failed to fetch dynamically imported module/i.test(e.reason.message))))){r=true;console.warn('[ChunkLoadError] Auto-reloading...');window.location.reload();}});})();`}
        </Script>
        <Suspense fallback={null}>
          <ScrollRestoration />
        </Suspense>
        {isDev && <Inspector />}
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
