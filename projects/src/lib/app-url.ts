/**
 * 获取应用基础 URL — 用于服务端内部 fetch 调用
 *
 * 优先级：
 * 1. VERCEL_URL（Vercel 自动注入，如 xxx.vercel.app）
 * 2. NEXT_PUBLIC_APP_URL（手动配置的自定义域名）
 * 3. http://localhost:${DEPLOY_RUN_PORT || 5000}（本地开发）
 *
 * 注意：VERCEL_URL 不含协议，需要补 https://
 */
export function getAppBaseUrl(): string {
  // Vercel 部署环境（自动注入）
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  // 自定义域名（如已绑定 Vercel custom domain）
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    return appUrl.replace(/\/$/, ''); // 去掉末尾斜杠
  }

  // 本地开发
  const port = process.env.DEPLOY_RUN_PORT || '5000';
  return `http://localhost:${port}`;
}
