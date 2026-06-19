/**
 * Vitest 全局测试设置
 *
 * 负责：
 * 1. 注入 @testing-library/jest-dom 的 DOM 断言扩展
 * 2. 提供测试环境变量（避免读取真实 .env.local）
 * 3. 清理副作用（mock、定时器、DOM）
 *
 * 重要：环境变量必须在顶层设置（不能放在 beforeAll 中），
 * 因为被测模块在导入时就初始化了 TOKEN_SECRET 等常量。
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// ===== 环境变量（必须在顶层设置，确保模块导入前生效）=====
// 认证相关
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-token-secret-for-vitest-only';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-token-secret-for-vitest-only';

// Supabase（测试用占位符，真实请求会被 mock）
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:5432';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

// AI 配置（测试用占位符，真实请求会被 mock）
process.env.COZE_WORKLOAD_IDENTITY_API_KEY = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || 'test-ai-key';
process.env.COZE_INTEGRATION_BASE_URL = process.env.COZE_INTEGRATION_BASE_URL || 'https://test.coze.cn';
process.env.COZE_INTEGRATION_MODEL_BASE_URL = process.env.COZE_INTEGRATION_MODEL_BASE_URL || 'https://test.ark.cn-beijing.volces.com/api/v3';

// 部署端口
process.env.DEPLOY_RUN_PORT = process.env.DEPLOY_RUN_PORT || '5000';

// 标记为测试环境
process.env.NODE_ENV = 'test';

// ===== jsdom 缺失 API 的 polyfill =====
// scrollIntoView 在 jsdom 中未实现，组件自动滚动到底部会用到
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {} as any;
}

// ===== 每个测试后清理 =====
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});
