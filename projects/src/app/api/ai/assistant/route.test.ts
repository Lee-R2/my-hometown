/**
 * AI 助手路由（银蛇博士）测试
 *
 * 测试目标：覆盖 POST /api/ai/assistant 的关键路径
 * 1. 认证守卫（无 token / 无效 token / 有效 token）
 * 2. 参数验证（缺少 teamId / 缺少 message 和 images）
 * 3. 正常流程（mock 依赖，验证 SSE 流式响应）
 *
 * 这组测试是 ai/assistant/route.ts 拆分（方案B）前的基线，
 * 拆分后必须保持全部通过，才能进行替换。
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

// 2. Mock agent-memory
vi.mock('@/lib/agent-memory', () => ({
  getOrCreateSession: vi.fn(() => Promise.resolve({ id: 'session-001' })),
  saveConversation: vi.fn(() => Promise.resolve(true)),
  getConversations: vi.fn(() => Promise.resolve([])),
  getMemories: vi.fn(() => Promise.resolve([])),
  addMemory: vi.fn(() => Promise.resolve(true)),
  getCrossAgentMemories: vi.fn(() => Promise.resolve([])),
  formatCrossAgentMemories: vi.fn(() => ''),
}));

// 3. Mock coze-coding-dev-sdk — 提供 stream 方法返回 async iterable
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

// 4. Mock agent-scope（提供常量）
vi.mock('@/lib/agent-scope', () => ({
  LAXIANG_SHAREABLE_TYPES: ['user_info', 'team_info'],
}));

// ===== 在 mock 之后导入被测模块 =====
import { POST } from '@/app/api/ai/assistant/route';
import { generateToken } from '@/lib/security';
import {
  makeAuthRequest,
  makeUnauthRequest,
} from '@tests/helpers';

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
          done = true; // 检测到 [DONE] 立即结束读取
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
  // 主动释放 reader，避免流挂起
  try {
    reader.releaseLock();
  } catch {
    // 忽略
  }
  return events;
}

// ===== 测试用例 =====

describe('POST /api/ai/assistant — 认证守卫', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无认证 token → 返回 401', async () => {
    const req = makeUnauthRequest({ teamId: 't1', message: '你好' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('无效 token（乱码）→ 返回 401', async () => {
    const req = makeAuthRequest(
      { teamId: 't1', message: '你好' },
      'invalid.token.string'
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('过期 token → 返回 401', async () => {
    // 构造一个签名正确但已过期的 token
    const payload = {
      userId: 'team-001',
      role: 'team',
      iat: Date.now() - 200000,
      exp: Date.now() - 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const crypto = require('node:crypto');
    const sig = crypto
      .createHmac('sha256', process.env.TOKEN_SECRET!)
      .update(encoded)
      .digest('hex');
    const token = `${encoded}.${sig}`;

    const req = makeAuthRequest({ teamId: 't1', message: '你好' }, token);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('有效 team token → 通过认证（进入参数验证）', async () => {
    // 有效 token + 缺少参数，应该返回 400 而非 401
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest({}, token);
    const res = await POST(req);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400); // 缺少 teamId
  });
});

describe('POST /api/ai/assistant — 参数验证', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('缺少 teamId → 返回 400 VALIDATION_ERROR', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest({ message: '你好' }, token);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('teamId');
  });

  it('teamId 为空字符串 → 返回 400', async () => {
    const token = generateToken('team-001', 'team');
    const req = makeAuthRequest({ teamId: '', message: '你好' }, token);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('有 teamId 但 message 和 images 都为空 → 返回 400', async () => {
    const token = generateToken('t1', 'team');
    const req = makeAuthRequest({ teamId: 't1' }, token);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    // 错误消息应包括"问题"或"图片"之一
    expect(
      body.error.includes('问题') || body.error.includes('图片')
    ).toBe(true);
  });

  it('有 teamId 且 message 为纯空格 → 返回 400', async () => {
    const token = generateToken('t1', 'team');
    const req = makeAuthRequest({ teamId: 't1', message: '   ' }, token);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/assistant — 正常流程（SSE 流式响应）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 supabase 默认返回
    supabaseChainable.maybeSingle.mockResolvedValue({
      data: {
        id: 't1',
        name: '测试小队',
        code: 'T001',
        points: 100,
        assigned_volunteer_id: 'v1',
      },
      error: null,
    });
    supabaseChainable.limit.mockResolvedValue({ data: [], error: null });
    supabaseChainable.single.mockResolvedValue({
      data: { id: 't1', name: '测试小队' },
      error: null,
    });

    // mock stream 方法返回 async iterable
    mockStream.mockImplementation(async function* () {
      yield { content: '你好' };
      yield { content: '，我是' };
      yield { content: '银蛇博士' };
    });
  });

  it('完整请求 → 返回 200 且 Content-Type 为 text/event-stream', async () => {
    const token = generateToken('t1', 'team');
    const req = makeAuthRequest(
      { teamId: 't1', message: '你好，银蛇博士' },
      token
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('SSE 流包含 AI 回复内容和 [DONE] 结束标记', async () => {
    const token = generateToken('t1', 'team');
    const req = makeAuthRequest(
      { teamId: 't1', message: '你好，银蛇博士' },
      token
    );
    const res = await POST(req);
    const events = await readSSEStream(res);

    // 应该有内容事件
    const contentEvents = events.filter((e) => e.content !== undefined);
    expect(contentEvents.length).toBeGreaterThan(0);

    // 拼接内容应该是完整的 AI 回复
    const fullContent = contentEvents.map((e) => e.content).join('');
    expect(fullContent).toContain('银蛇博士');

    // 应该有 [DONE] 标记
    expect(events.some((e) => e.__done)).toBe(true);
  });

  it('SSE 流包含 usage_stats 元数据', async () => {
    const token = generateToken('t1', 'team');
    const req = makeAuthRequest(
      { teamId: 't1', message: '你好，银蛇博士' },
      token
    );
    const res = await POST(req);
    const events = await readSSEStream(res);

    const statsEvent = events.find((e) => e.type === 'usage_stats');
    expect(statsEvent).toBeDefined();
    expect(statsEvent).toHaveProperty('conversationRounds');
    expect(statsEvent).toHaveProperty('dailyMinutes');
  });
});
