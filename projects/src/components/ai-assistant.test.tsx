/**
 * AIAssistant 组件测试
 *
 * 测试目标：覆盖 ai-assistant.tsx 的关键交互行为
 * 1. 渲染（默认关闭状态、点击打开）
 * 2. 输入与发送（输入框、Enter 发送、空输入不发送）
 * 3. API 调用（mock fetch，验证请求体）
 * 4. 消息显示（用户消息、AI 回复）
 *
 * 这组测试是 ai-assistant.tsx 拆分（方案B）前的基线。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import AIAssistant from '@/components/ai-assistant';

// ===== Mock 依赖 =====

// 1. Mock assistant-context
vi.mock('@/lib/assistant-context', () => ({
  subscribeAssistantContext: vi.fn(() => () => {}),
}));

// 2. Mock use-assistant-adapt hook
vi.mock('@/hooks/use-assistant-adapt', () => ({
  useAssistantAdapt: vi.fn(() => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    screenWidth: 1024,
    screenHeight: 768,
    dialogWidth: '420px',
    dialogHeight: '580px',
    dialogMaxHeight: '80vh',
    buttonPosition: 'bottom-5 right-5',
    dialogPosition: 'bottom-20 right-6',
    isFullscreen: false,
    isCompactMode: false,
    mobileDialogClass: '',
    mobileDialogStyle: {},
  })),
}));

// 3. Mock sonner toast — 用 vi.hoisted 确保 spy 在 mock 工厂中可用
const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock('sonner', () => ({
  toast: toastMock,
}));

// 4. Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// 5. Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// 6. Mock fetch — 默认返回 SSE 流式响应
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** 创建一个模拟的 SSE 流式响应 */
function createSSEResponse(chunks: Array<{ content?: string; type?: string; [k: string]: any }>) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const chunk of chunks) {
    lines.push(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  lines.push('data: [DONE]\n\n');

  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Session-Id': 'test-session-001',
    },
  });
}

/** 打开对话框并返回输入框元素 */
async function openDialogAndGetType() {
  const user = userEvent.setup();
  render(<AIAssistant teamId="t1" />);

  // 点击浮动气泡按钮（第一个按钮）
  const buttons = screen.getAllByRole('button');
  await user.click(buttons[0]);

  // 等待对话框打开，输入框出现
  await waitFor(() => {
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
  });

  const input = screen.getAllByRole('textbox')[0];
  return { user, input };
}

// ===== 测试用例 =====

describe('AIAssistant 组件 — 渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockResolvedValue(
      createSSEResponse([{ content: '你好，我是银蛇博士' }])
    );
  });

  it('默认渲染关闭状态（不显示对话框标题）', () => {
    render(<AIAssistant teamId="t1" />);
    // 关闭状态下不应显示对话框标题（用更精确的文本"乡村守护神"避免匹配到欢迎语）
    expect(screen.queryByText(/乡村守护神/)).not.toBeInTheDocument();
  });

  it('点击浮动按钮后打开对话框', async () => {
    const user = userEvent.setup();
    render(<AIAssistant teamId="t1" />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    await user.click(buttons[0]);

    // 打开后应该显示对话框副标题（"乡村守护神 · 任务指引"是唯一的）
    await waitFor(() => {
      expect(screen.getByText(/乡村守护神/)).toBeInTheDocument();
    });
  });

  it('接受 assistantType 和 position 属性', () => {
    render(<AIAssistant teamId="t1" assistantType="laxiang" position="bottom-left" />);
    expect(true).toBe(true);
  });
});

describe('AIAssistant 组件 — 输入与发送', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockResolvedValue(
      createSSEResponse([{ content: '你好，我是银蛇博士' }])
    );
  });

  it('打开对话框后可以输入文本', async () => {
    const { input } = await openDialogAndGetType();
    const user = userEvent.setup();
    await user.type(input, '你好，银蛇博士');
    expect(input).toHaveValue('你好，银蛇博士');
  });

  it(
    '输入文本后按 Enter 键调用 API',
    async () => {
      const { input } = await openDialogAndGetType();
      const user = userEvent.setup();
      await user.type(input, '你好');

      // 按 Enter 键发送（不按 Shift）
      await user.keyboard('{Enter}');

      // 验证 fetch 被调用
      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalled();
        },
        { timeout: 5000 }
      );
    },
    15000
  );

  it('空输入不触发 API 调用', async () => {
    const { input } = await openDialogAndGetType();
    const user = userEvent.setup();

    // 不输入任何内容，直接按 Enter
    await user.keyboard('{Enter}');

    // 等待一小段时间，确认没有 fetch 调用
    await new Promise((r) => setTimeout(r, 200));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('AIAssistant 组件 — API 调用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it(
    '发送消息时请求体包含 teamId 和 message',
    async () => {
      mockFetch.mockResolvedValue(
        createSSEResponse([{ content: '你好，我是银蛇博士' }])
      );

      const { input } = await openDialogAndGetType();
      const user = userEvent.setup();
      await user.type(input, '你好，银蛇博士');
      await user.keyboard('{Enter}');

      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/ai/assistant',
            expect.objectContaining({
              method: 'POST',
              body: expect.stringContaining('你好，银蛇博士'),
            })
          );
        },
        { timeout: 5000 }
      );

      // 验证请求体中的 teamId
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.teamId).toBe('t1');
      expect(body.message).toBe('你好，银蛇博士');
    },
    15000
  );

  it(
    'API 返回 SSE 流后显示 AI 回复',
    async () => {
      mockFetch.mockResolvedValue(
        createSSEResponse([
          { content: '这是测试回复内容' },
          { content: '来自AI助手' },
        ])
      );

      const { input } = await openDialogAndGetType();
      const user = userEvent.setup();
      await user.type(input, '你好');
      await user.keyboard('{Enter}');

      // 等待 AI 回复显示（用唯一文本"这是测试回复内容"避免匹配到欢迎语）
      await waitFor(
        () => {
          expect(screen.getByText(/这是测试回复内容/)).toBeInTheDocument();
        },
        { timeout: 8000 }
      );
    },
    20000
  );

  it(
    'API 错误时在消息列表中显示错误提示',
    async () => {
      mockFetch.mockRejectedValue(new Error('网络错误'));

      const { input } = await openDialogAndGetType();
      const user = userEvent.setup();
      await user.type(input, '你好');
      await user.keyboard('{Enter}');

      // 等待错误处理：组件在 catch 块中添加一条助手消息（不调用 toast.error）
      // 真实代码见 ai-assistant.tsx:1052-1057
      await waitFor(
        () => {
          expect(screen.getByText(/网络连接出现问题/)).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    },
    15000
  );
});
