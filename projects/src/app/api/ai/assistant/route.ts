import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

  try {
    const body = await request.json();
    const { teamId, message, images, history, sessionId: clientSessionId, pageContext } = body;

    console.log('[银蛇博士API] 收到请求:', {
      teamId,
      messageLength: message?.length || 0,
      imageCount: images?.length || 0,
      hasHistory: !!history,
      sessionId: clientSessionId,
      pageContextType: pageContext?.type
    });

    // 放宽条件：只要有 teamId 就可以处理
    if (!teamId) {
      return ApiErrors.validation('缺少teamId参数');
    }

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
    const sessionId = clientSessionId || `yinhe_team_${teamId}_${Date.now()}`;
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
    });

  } catch (error) {
    console.error('智能体API错误:', error);
    return ApiErrors.externalError('AI服务暂时不可用');
  }
}
