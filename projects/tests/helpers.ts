/**
 * 测试工具函数
 *
 * 提供：
 * 1. 生成有效/无效认证令牌
 * 2. 构造带认证的 NextRequest
 * 3. Mock Supabase 客户端
 * 4. Mock AI/LLM 客户端
 */
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { generateToken } from '@/lib/security';
import { SESSION_COOKIE_NAME } from '@/lib/session';

// ===== 认证工具 =====

/** 生成一个有效的团队令牌 */
export function makeTeamToken(teamId = 'team-001'): string {
  return generateToken(teamId, 'team');
}

/** 生成一个有效的管理员令牌 */
export function makeAdminToken(adminId = 'admin-001'): string {
  return generateToken(adminId, 'admin');
}

/** 生成一个过期的令牌 */
export function makeExpiredToken(userId = 'team-001', role = 'team'): string {
  // 直接构造过期 payload（绕过 generateToken 的正常 exp）
  const payload = {
    userId,
    role,
    iat: Date.now() - 100000,
    exp: Date.now() - 1000, // 已过期
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  // 签名仍需正确，否则会先因签名失败返回 null
  const crypto = require('node:crypto');
  const signature = crypto
    .createHmac('sha256', process.env.TOKEN_SECRET || 'test-token-secret-for-vitest-only')
    .update(encoded)
    .digest('hex');
  return `${encoded}.${signature}`;
}

/** 构造一个带认证 cookie 的 NextRequest */
export function makeAuthRequest(
  body: unknown,
  token: string,
  init: { method?: string; url?: string } = {}
): NextRequest {
  const { method = 'POST', url = 'http://localhost:5000/api/test' } = init;
  const request = new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 注入认证 cookie（使用项目实际的 cookie 名）
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

/** 构造一个无认证的 NextRequest */
export function makeUnauthRequest(
  body: unknown,
  init: { method?: string; url?: string } = {}
): NextRequest {
  const { method = 'POST', url = 'http://localhost:5000/api/test' } = init;
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ===== Supabase Mock =====

/** 创建一个链式可调用的 Supabase mock 客户端 */
export function createSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chainable = {
    select: vi.fn(() => chainable),
    insert: vi.fn(() => chainable),
    update: vi.fn(() => chainable),
    delete: vi.fn(() => chainable),
    upsert: vi.fn(() => chainable),
    eq: vi.fn(() => chainable),
    neq: vi.fn(() => chainable),
    gt: vi.fn(() => chainable),
    lt: vi.fn(() => chainable),
    gte: vi.fn(() => chainable),
    lte: vi.fn(() => chainable),
    like: vi.fn(() => chainable),
    ilike: vi.fn(() => chainable),
    in: vi.fn(() => chainable),
    order: vi.fn(() => chainable),
    limit: vi.fn(() => chainable),
    range: vi.fn(() => chainable),
    single: vi.fn(() => chainable),
    maybeSingle: vi.fn(() => chainable),
    then: undefined,
  };

  // 默认返回空数据
  const defaultResult = { data: null, error: null, count: 0 };
  Object.keys(chainable).forEach((key) => {
    if (typeof chainable[key] === 'function' && key !== 'then') {
      chainable[key].mockReturnValue(chainable);
    }
  });

  // 让链式调用最终能被 await（返回 Promise<{data, error}>）
  // 通过覆盖 single/maybeSingle/limit 等终结方法
  chainable.single.mockResolvedValue(defaultResult);
  chainable.maybeSingle.mockResolvedValue(defaultResult);
  // 对于 select().eq().order().limit() 这种链式，需要 limit 返回 Promise
  chainable.limit.mockImplementation(() => Promise.resolve(defaultResult));
  chainable.range.mockImplementation(() => Promise.resolve(defaultResult));

  const client = {
    from: vi.fn(() => chainable),
    rpc: vi.fn(() => Promise.resolve(defaultResult)),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn() })),
      subscribe: vi.fn(),
    })),
    ...overrides,
  };

  return { client, chainable };
}

// ===== LLM Mock =====

/** 创建一个 mock 的 LLMClient，返回固定的 AI 回复 */
export function createLLMMock(responseText = '这是测试用的 AI 回复') {
  return {
    LLMClient: vi.fn().mockImplementation(() => ({
      chat: vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: responseText },
          },
        ],
        usage: { total_tokens: 100 },
      }),
      chatStream: vi.fn().mockImplementation(async function* () {
        yield { choices: [{ delta: { content: responseText } }] };
      }),
    })),
    Config: {
      default: vi.fn(),
    },
    HeaderUtils: {
      default: vi.fn(),
    },
  };
}
