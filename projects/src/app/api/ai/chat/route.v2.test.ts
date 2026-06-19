/**
 * AI Chat 路由 V2（模块化版本）测试
 *
 * 测试目标：验证 route.v2.ts 的 POST 函数与原 route.ts 行为一致
 * 1. 认证守卫（无 token / 无效 token / 有效 token）
 * 2. 频率限制（mock rate-limit 放行/拒绝）
 * 3. 参数验证（messages 格式 / assistantType 白名单）
 * 4. 正常流程（SSE 流式响应）
 *
 * 本测试与 route.test.ts 并行存在，用于方案B灰度验证。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ===== Mock 依赖（必须在 import route 之前）=====

// 1. Mock Supabase 客户端
const supabaseChainable = {
  select: vi.fn(() => supabaseChainable),
  insert: vi.fn(() => supabaseChainable),
  update: vi.fn(() => supabaseChainable),
  upsert: vi.fn(() => supabaseChainable),
  delete: vi.fn(() => supabaseChainable),
  eq: vi.fn(() => supabaseChainable),
  neq: vi.fn(() => supabaseChainable),
  order: vi.fn(() => supabaseChainable),
  limit: vi.fn(() => supabaseChainable),
  range: vi.fn(() => supabaseChainable),
  single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
};
supabaseChainable.limit.mockImplementation(() =>
  Promise.resolve({ data: [], error: null })
);

const mockSupabaseClient = {
  from: vi.fn(() => supabaseChainable),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
};

vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  getSupabaseAdminClient: vi.fn(() => mockSupabaseClient),
}));

// 2. Mock rate-limit — 使用 vi.hoisted 确保 mock 变量在 vi.mock 工厂中可用
const { mockCheckRateLimit } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(() => Promise.resolve({ allowed: true, message: '' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

// 3. Mock coze-coding-dev-sdk
const mockStream = vi.fn();
vi.mock('coze-coding-dev-sdk', () => ({
  LLMClient: vi.fn(() => ({ stream: mockStream })),
  Config: vi.fn(function (this: any, opts: any) {
    Object.assign(this, opts);
  }),
  HeaderUtils: {
    extractForwardHeaders: vi.fn(() => ({})),
  },
}));

// 4. Mock global fetch（用于 /api/ai/context 调用）
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ===== 在 mock 之后导入被测模块 =====
import { generateToken } from '@/lib/security';
import { makeAuthRequest, makeUnauthRequest } from '@tests/helpers';
import { POST as CHAT_POST } from '@/app/api/ai/chat/route.v2';

/** 读取 SSE 流并解析所有 data 事件（检测到 [DONE] 后立即返回，避免无限等待） */
async function readSSEStream(response: Response): Promise<any[]> {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = '';
  const events: any[] = [];
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          events.push({ __done: true });
          done = true;
          break;
        } else {
          try {
            events.push(JSON.parse(data));
          } catch {
            // 忽略无法解析的行
          }
        }
      }
    }
  }
  try {
    reader.releaseLock();
  } catch {
    // 忽略
  }
  return events;
}

// ===== 测试用例 =====

describe('POST /api/ai/chat (V2) — 认证守卫', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, message: '' });
  });

  it('无认证 token → 返回 401', async () => {
    const req = makeUnauthRequest({
      messages: [{ role: 'user', content: '你好' }],
      assistantType: 'yinhe',
    });
    const res = await CHAT_POST(req);
    expect(res.status).toBe(401);
  });

  it('无效 token → 返回 401', async () => {
    const req = makeAuthRequest(
      {
        messages: [{ role: 'user', content: '你好' }],
        assistantType: 'yinhe',
      },
      'invalid.token'
    );
    const res = await CHAT_POST(req);
    expect(res.status).toBe(401);
  });

  it('有效 token → 通过认证（进入参数验证）', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest({}, token);
    const res = await CHAT_POST(req);
    expect(res.status).not.toBe(401);
  });
});

describe('POST /api/ai/chat (V2) — 频率限制', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('频率限制触发 → 返回 429', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      message: '请求过于频繁',
    });
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest(
      {
        messages: [{ role: 'user', content: '你好' }],
        assistantType: 'yinhe',
      },
      token
    );
    const res = await CHAT_POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('频率限制放行 → 继续处理请求', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, message: '' });
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest({}, token);
    const res = await CHAT_POST(req);
    expect(res.status).not.toBe(429);
  });
});

describe('POST /api/ai/chat (V2) — 参数验证', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, message: '' });
  });

  it('缺少 messages → 返回 400 VALIDATION_ERROR', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest({ assistantType: 'yinhe' }, token);
    const res = await CHAT_POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('messages 不是数组 → 返回 400', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest(
      { messages: 'not-an-array', assistantType: 'yinhe' },
      token
    );
    const res = await CHAT_POST(req);
    expect(res.status).toBe(400);
  });

  it('无效的 assistantType → 返回 400', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest(
      {
        messages: [{ role: 'user', content: '你好' }],
        assistantType: 'invalid_agent',
      },
      token
    );
    const res = await CHAT_POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('助手');
  });

  it('有效的 assistantType（yinhe）→ 通过验证', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest(
      {
        messages: [{ role: 'user', content: '你好' }],
        assistantType: 'yinhe',
        teamId: 't1',
      },
      token
    );
    const res = await CHAT_POST(req);
    expect(res.status).not.toBe(400);
  });

  it('有效的 assistantType（laxiang）→ 通过验证', async () => {
    const token = generateToken('admin-001', 'admin');
    const req = makeAuthRequest(
      {
        messages: [{ role: 'user', content: '你好' }],
        assistantType: 'laxiang',
        userId: 'admin-001',
        userRole: 'admin',
      },
      token
    );
    const res = await CHAT_POST(req);
    expect(res.status).not.toBe(400);
  });
});

describe('POST /api/ai/chat (V2) — 正常流程（SSE 流式响应）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, message: '' });

    supabaseChainable.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    supabaseChainable.limit.mockResolvedValue({ data: [], error: null });
    supabaseChainable.single.mockResolvedValue({
      data: null,
      error: null,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, context: null }),
    });

    mockStream.mockImplementation(async function* () {
      yield { content: '你好' };
      yield { content: '，我是' };
      yield { content: '银蛇博士' };
    });
  });

  it(
    '完整请求（yinhe）→ 返回 200 且 Content-Type 为 text/event-stream',
    async () => {
      const token = generateToken('team-001', 'team');
      const req = makeAuthRequest(
        {
          messages: [{ role: 'user', content: '你好' }],
          assistantType: 'yinhe',
          teamId: 't1',
        },
        token
      );
      const res = await CHAT_POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    },
    15000
  );

  it(
    'SSE 流包含 AI 回复内容',
    async () => {
      const token = generateToken('team-001', 'team');
      const req = makeAuthRequest(
        {
          messages: [{ role: 'user', content: '你好' }],
          assistantType: 'yinhe',
          teamId: 't1',
        },
        token
      );
      const res = await CHAT_POST(req);
      const events = await readSSEStream(res);

      const contentEvents = events.filter((e) => e.content !== undefined);
      expect(contentEvents.length).toBeGreaterThan(0);

      const fullContent = contentEvents.map((e) => e.content).join('');
      expect(fullContent).toContain('银蛇博士');
    },
    15000
  );

  it(
    '响应头包含 X-Session-Id',
    async () => {
      const token = generateToken('team-001', 'team');
      const req = makeAuthRequest(
        {
          messages: [{ role: 'user', content: '你好' }],
          assistantType: 'yinhe',
          teamId: 't1',
        },
        token
      );
      const res = await CHAT_POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Session-Id')).toBeTruthy();
    },
    15000
  );
});
