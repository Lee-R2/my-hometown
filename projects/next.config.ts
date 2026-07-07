import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  // 安全响应头 — 防止XSS、点击劫持等攻击
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://emfluysvhghloklrmcxi.supabase.co https://lf-coze-web-cdn.coze.cn",
              "font-src 'self'",
              "connect-src 'self' https://emfluysvhghloklrmcxi.supabase.co https://api.coze.cn https://ark.cn-beijing.volces.com wss://ws-api.coze.cn",
              "media-src 'self' blob: data:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  // API 路由配置 - 允许大文件上传
  experimental: {
    serverActions: {
      bodySizeLimit: '120mb',
    },
  },
  // 开发服务器配置
  onDemandEntries: {
    // 在开发模式下保持页面缓存的时间
    maxInactiveAge: 60 * 1000,
    // 同时保持缓存的页面数
    pagesBufferLength: 10,
  },
  // 增加 API 路由的超时时间
  serverExternalPackages: ['@supabase/supabase-js'],
};

export default nextConfig;
