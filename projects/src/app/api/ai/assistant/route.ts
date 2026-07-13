import { requireAnyAuth, authError, safeError, buildInternalAuthHeaders } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { checkAiRateLimit } from '@/lib/rate-limit';

import { getTeamData, getSiblingTeamsProgress } from './lib/team-data';
import { buildDataContext } from './lib/data-context';
import { getConversationStats } from './lib/conversation-stats';
import { getMemoryIntegration } from './lib/memory-integration';
import { buildMessages } from './lib/message-builder';
import { createStreamResponse } from './lib/stream-handler';
import { SYSTEM_PROMPT } from './lib/system-prompt';

/**
 * 智能体"银蛇博士"API（V2 模块化版本）
 *
 * 本文件是方案B拆分的产物：将原 route.ts 的 2634 行单体 POST 函数
 * 拆分为 7 个独立模块，由本文件组装。
 *
 * 模块结构：
 * - lib/system-prompt.ts      系统提示词
 * - lib/team-data.ts          小队数据查询
 * - lib/data-context.ts       数据上下文构建
 * - lib/conversation-stats.ts 对话统计
 * - lib/memory-integration.ts 记忆系统集成
 * - lib/message-builder.ts    消息构建（含多模态、跨智能体、风格偏好）
 * - lib/stream-handler.ts     流式响应（含图片/视频生成、对话保存、记忆提取）
 * - lib/image-utils.ts        图片转换工具
 *
 * 对话对象：4-6年级小学生（约9-12岁）
 */

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_chat');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { teamId, message, images, history, sessionId: clientSessionId, pageContext } = body;

    console.log('[银蛇博士API] 收到请求:', {
      teamId,
      messageLength: message?.length || 0,
      imageCount: images?.length || 0,
      hasHistory: !!history,
      sessionId: clientSessionId,
      pageContextType: pageContext?.type,
      authRole: auth.payload?.role,
      authUserId: auth.payload?.userId,
    });

    if (!teamId) {
      return ApiErrors.validation('缺少teamId参数');
    }

    // 安全修复：teamId 归属校验，防止横向越权
    const authRole = auth.payload?.role;
    const authUserId = auth.payload?.userId;

    if (authRole === 'team') {
      // team 身份只能访问自己的小队
      if (teamId !== authUserId) {
        return ApiErrors.forbidden('无权访问其他小队的数据');
      }
    } else if (authRole === 'volunteer') {
      // volunteer 身份需校验是否为该小队的指导志愿者
      const client = getSupabaseClient();
      const { data: team, error: teamError } = await client
        .from('teams')
        .select('assigned_volunteer_id')
        .eq('id', teamId)
        .single();
      if (teamError || !team) {
        return ApiErrors.notFound('小队不存在');
      }
      if (team.assigned_volunteer_id !== authUserId) {
        return ApiErrors.forbidden('无权访问未指导的小队');
      }
    } else if (authRole === 'parent') {
      // parent 身份需校验是否关注了该小队
      const client = getSupabaseClient();
      const { data: follow } = await client
        .from('parent_team_follows')
        .select('id')
        .eq('parent_id', authUserId)
        .eq('team_id', teamId)
        .eq('is_active', true)
        .maybeSingle();
      if (!follow) {
        return ApiErrors.forbidden('未关注该小队，无权访问');
      }
    }
    // super_admin / teacher 不做额外限制（teacher 可查看本校小队，由前端控制）

    // 如果没有消息也没有图片，返回提示
    if ((!message || !message.trim()) && (!images || images.length === 0)) {
      return ApiErrors.validation('请输入问题或上传图片');
    }

    const client = getSupabaseClient();

    // 获取小队完整数据
    const teamData = await getTeamData(client, teamId);

    // 获取其他小队进度数据
    let siblingData = { teams: [] };
    if (teamData.team?.assigned_volunteer_id) {
      siblingData = await getSiblingTeamsProgress(client, teamId, teamData.team.assigned_volunteer_id);
    }

    const dataContext = buildDataContext(teamData, siblingData);

    // ===== 对话限制统计 =====
    const agentUsername = 'yinshe_boshi';
    // VULN-AI-015 修复：校验 clientSessionId 必须归属当前 teamId，防止通过伪造 sessionId 越权读取他人对话
    let sessionId = `yinhe_team_${teamId}_${Date.now()}`;
    if (clientSessionId) {
      if (clientSessionId.includes(teamId)) {
        sessionId = clientSessionId;
      } else {
        console.warn('[银蛇博士API] 拒绝使用与 teamId 不匹配的 clientSessionId，回退到默认会话ID');
      }
    }
    const stats = await getConversationStats(agentUsername, sessionId);

    // ===== 记忆系统集成 =====
    const memoryIntegration = await getMemoryIntegration(agentUsername, teamId, sessionId);

    // ===== 构建消息 =====
    const userName = teamData.members?.[0]?.name || teamData.team?.name || '小队成员';
    const built = await buildMessages({
      teamData,
      dataContext,
      pageContext,
      conversations: memoryIntegration.conversations,
      memories: memoryIntegration.memories,
      memoryContext: memoryIntegration.memoryContext,
      history,
      message: message || '',
      images,
      dailyMinutes: stats.dailyMinutes,
      conversationRounds: stats.conversationRounds,
      offTopicRatio: stats.offTopicRatio,
      client,
      teamId,
      systemPrompt: SYSTEM_PROMPT,
    });

    // ===== 创建流式响应 =====
    return await createStreamResponse({
      messages: built.messages,
      model: built.model,
      request,
      teamId,
      sessionId,
      agentUsername,
      userName,
      message: message || '',
      conversationRounds: stats.conversationRounds,
      dailyMinutes: stats.dailyMinutes,
      offTopicRatio: stats.offTopicRatio,
      offTopicCount: stats.offTopicCount,
      totalAnalyzed: stats.totalAnalyzed,
      authHeaders: buildInternalAuthHeaders(request),
    });

  } catch (error) {
    console.error('智能体API错误:', error);
    return ApiErrors.externalError('AI服务暂时不可用');
  }
}
