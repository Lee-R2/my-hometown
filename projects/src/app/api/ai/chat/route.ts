import { requireAnyAuth, authError, buildInternalAuthHeaders } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';

import { buildSystemPrompt } from './lib/system-prompts';
import { saveToMemory, getRelevantMemories, getOrCreateSession } from './lib/memory';
import { analyzeUserIntent } from './lib/intent-analyzer';
import { formatTeamContext, formatAdminContext } from './lib/context-formatter';
import { createStreamResponse } from './lib/stream-handler';

/**
 * AI 聊天路由（V2 模块化版本）
 *
 * 本文件是方案B拆分的产物：将原 route.ts 的 2816 行单体文件
 * 拆分为 6 个独立模块，由本文件组装。
 *
 * 模块结构：
 * - lib/system-prompts.ts     系统提示词（银蛇博士/蜡象助手/默认）
 * - lib/memory.ts             记忆系统（保存/提取/获取/会话管理）
 * - lib/intent-analyzer.ts    意图分析（蜡象助手专属）
 * - lib/context-formatter.ts  上下文格式化（小队端/管理员端）
 * - lib/commands.ts           命令处理（媒体生成/反馈转发）
 * - lib/stream-handler.ts     流式响应（LLM调用/命令处理/保存回复）
 *
 * 支持两个智能体：银蛇博士（小队用）、蜡象助手（管理员用）
 */

// 智能体白名单
const ALLOWED_AGENTS: Record<string, { username: string; role: string }> = {
  yinhe: { username: 'yinshe_boshi', role: 'yinhe' },
  laxiang: { username: 'laxiang_zhushou', role: 'laxiang' },
};

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // 频率限制：每分钟最多20次AI请求
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(`${ip}_${auth.payload?.userId || 'anon'}`, 'api');
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.message || '请求过于频繁，请稍后重试' },
      { status: 429 }
    );
  }

  try {
    const { messages, assistantType, contextPrompt, teamId: bodyTeamId, sessionId } = await request.json();

    // 强制使用 auth.payload 中的身份信息，忽略 body 中可能伪造的 userId/userRole
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;
    // teamId：team 角色强制用 auth.payload.userId，其他角色可用 bodyTeamId
    const teamId = userRole === 'team' ? auth.payload!.userId : bodyTeamId;

    if (!messages || !Array.isArray(messages)) {
      return ApiErrors.validation('消息格式错误');
    }

    // 安全修复（P3 输入校验）：限制单条用户消息长度，避免超长输入消耗资源
    const MAX_CHAT_MESSAGE_LENGTH = 4000;
    for (const m of messages) {
      if (m && typeof m === 'object' && m.role === 'user') {
        const c = typeof m.content === 'string' ? m.content : String(m.content ?? '');
        if (c.length > MAX_CHAT_MESSAGE_LENGTH) {
          return ApiErrors.validation(`单条消息过长，最大支持 ${MAX_CHAT_MESSAGE_LENGTH} 字符`);
        }
      }
    }

    // 获取智能体信息
    const agentInfo = ALLOWED_AGENTS[assistantType];
    if (!agentInfo) {
      return ApiErrors.validation('无效的助手类型');
    }

    // 构造内部 API 调用所需的认证头，透传 Authorization 和 Cookie，
    // 避免 stream-handler/commands 中的内部 fetch 因缺失认证被拦截。
    const internalAuthHeaders = buildInternalAuthHeaders(request);

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new LLMClient(config, customHeaders);

    // 创建或获取会话（用于记忆系统）
    const currentSessionId = await getOrCreateSession(
      agentInfo.username,
      userId,
      teamId,
      sessionId
    );

    // 保存用户消息到记忆系统
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    if (lastUserMessage) {
      await saveToMemory(
        agentInfo.username,
        currentSessionId,
        'user',
        lastUserMessage.content,
        userId,
        userRole
      );
    }

    // 蜡象助手：意图预处理 — 在消息到达LLM前先解析用户意图
    let intentHint = '';
    if (assistantType === 'laxiang' && lastUserMessage) {
      intentHint = analyzeUserIntent(lastUserMessage.content, messages);
    }

    // 获取与上下文相关的记忆
    const relevantMemories = await getRelevantMemories(
      agentInfo.username,
      userId,
      teamId,
      currentSessionId
    );

    // 获取数据上下文（根据角色或小队ID）
    let dataContext = '';
    let contextData: any = null;
    if (teamId && assistantType === 'yinhe') {
      // 银蛇博士：获取小队端数据上下文
      const contextResponse = await fetch(
        `${process.env.DEPLOY_RUN_PORT ? `http://localhost:${process.env.DEPLOY_RUN_PORT}` : 'http://localhost:5000'}/api/ai/context?teamId=${teamId}`,
        { headers: internalAuthHeaders }
      );
      if (contextResponse.ok) {
        contextData = await contextResponse.json();
        if (contextData.success && contextData.context) {
          dataContext = formatTeamContext(contextData.context);
        }
      }
    } else if (userId && userRole && assistantType === 'laxiang') {
      // 蜡象助手：获取管理员端数据上下文
      const contextResponse = await fetch(
        `${process.env.DEPLOY_RUN_PORT ? `http://localhost:${process.env.DEPLOY_RUN_PORT}` : 'http://localhost:5000'}/api/ai/context?userId=${userId}&userRole=${userRole}`,
        { headers: internalAuthHeaders }
      );
      if (contextResponse.ok) {
        contextData = await contextResponse.json();
        if (contextData.success && contextData.context) {
          dataContext = formatAdminContext(contextData.context, userRole);
        }
      }
    }

    // 合并上下文：意图提示 + 上下文提示 + 记忆 + 实时数据
    const contexts = [intentHint, contextPrompt, relevantMemories, dataContext].filter(Boolean);
    const finalContext = contexts.join('\n\n');

    // 构建系统提示词（使用模块化函数）
    const systemPrompt = buildSystemPrompt(assistantType, finalContext);

    // 构建消息数组
    // 限制历史对话条数和总字符数，避免 LLM token 爆炸
    const MAX_HISTORY_MESSAGES = 10;
    const MAX_TOTAL_CHARS = 8000;
    let limitedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    let totalChars = limitedMessages.reduce((sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
    while (totalChars > MAX_TOTAL_CHARS && limitedMessages.length > 1) {
      const removed = limitedMessages.shift();
      totalChars -= (typeof removed.content === 'string' ? removed.content.length : 0);
    }

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...limitedMessages,
    ];

    // 根据助手类型设置温度
    const temperature = assistantType === 'yinhe' ? 0.7 : assistantType === 'laxiang' ? 0.6 : 0.5;
    const model = 'doubao-seed-1-8-251228';

    // 创建流式响应（使用模块化函数）
    return createStreamResponse({
      client,
      fullMessages,
      assistantType,
      userId,
      userRole,
      teamId,
      contextData,
      agentInfo,
      currentSessionId,
      temperature,
      model,
      authHeaders: internalAuthHeaders,
    });

  } catch (error) {
    console.error('AI Chat Error:', error);
    return ApiErrors.externalError('AI服务暂时不可用');
  }
}
