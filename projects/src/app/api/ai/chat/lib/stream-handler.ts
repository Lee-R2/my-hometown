import { processMediaCommands, extractAndForwardFeedback } from './commands';
import { saveToMemory } from './memory';
import { getAppBaseUrl } from '@/lib/app-url';

/**
 * 流式响应处理器
 * 从 route.ts POST 函数中提取（L2016-2269）
 * 负责：LLM 流式调用、命令处理（数据分析/自省/记忆/创建主题/媒体生成）、保存回复、提取反馈
 */

export interface StreamHandlerContext {
  client: any; // LLMClient 实例
  fullMessages: any[];
  assistantType: string;
  userId?: string;
  userRole?: string;
  teamId?: string;
  contextData: any;
  agentInfo: { username: string; role: string };
  currentSessionId: string;
  temperature: number;
  model: string;
  /** 内部 API 调用时透传的认证头（Authorization/Cookie），避免内部 fetch 被认证拦截 */
  authHeaders?: Record<string, string>;
}

/**
 * 创建流式响应
 * 包含：LLM 流式输出 + 命令处理 + 保存回复 + 提取反馈
 */
export function createStreamResponse(ctx: StreamHandlerContext): Response {
  const {
    client, fullMessages, assistantType, userId, userRole, teamId,
    contextData, agentInfo, currentSessionId, temperature, model, authHeaders
  } = ctx;

  // 内部 fetch 默认 headers：优先使用透传的 authHeaders，否则仅 Content-Type
  const internalHeaders = authHeaders || { 'Content-Type': 'application/json' };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const llmStream = client.stream(fullMessages, {
          temperature,
          model,
        });

        let fullResponse = '';

        for await (const chunk of llmStream) {
          if (chunk.content) {
            const text = chunk.content.toString();
            fullResponse += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          }
        }

        // 处理数据分析命令（银蛇博士和蜡象助手）
        if (fullResponse && (assistantType === 'yinhe' || assistantType === 'laxiang')) {
          const dataAnalysisPattern = /\[数据分析\]\s*问题:(.*?)(?:\s*\|\s*图表类型:(\w+))?\s*$/m;
          const daMatch = fullResponse.match(dataAnalysisPattern);
          if (daMatch) {
            const daQuestion = daMatch[1]?.trim();
            const daChartType = daMatch[2]?.trim() || '';
            if (daQuestion) {
              try {
                const daRes = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/ai/data-analysis`, {
                  method: 'POST',
                  headers: internalHeaders,
                  body: JSON.stringify({
                    question: daQuestion,
                    role: assistantType === 'laxiang' ? 'wax-elephant' : 'dr-snake',
                    dataScope: {
                      userId: userId || '',
                      userRole: userRole || 'teacher',
                      schoolId: contextData?.context?.team?.school_id || contextData?.context?.school?.id || '',
                      teamId: teamId || '',
                      volunteerTeamIds: contextData?.context?.volunteerTeams?.map((t: any) => t.id) || [],
                    },
                  }),
                });
                const daData = await daRes.json();
                if (daData.success) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'data_analysis', data: daData.data })}\n\n`));
                } else {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'data_analysis_error', error: daData.error || '数据分析失败' })}\n\n`));
                }
              } catch (daErr) {
                console.error('[数据分析] 命令执行失败:', daErr);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'data_analysis_error', error: '数据分析服务暂时不可用' })}\n\n`));
              }
            }
          }
        }

          // 处理 [自省] 命令 — 自动记录错误和改进策略
          const reflectionPattern = /\[自省\]\s*发现:(.*?)\s*\|\s*归因:(.*?)\s*\|\s*策略:(.*?)\s*$/m;
          const reflMatch = fullResponse?.match(reflectionPattern);
          if (reflMatch) {
            try {
              const reflRes = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/ai/reflection`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({
                  action: 'reflect',
                  agentId: assistantType === 'laxiang' ? 'laxiang_zhushou' : 'dr_silver_snake',
                  messages: [{ role: 'assistant', content: fullResponse }],
                  assistantReply: fullResponse,
                })
              });
              const reflData = await reflRes.json();
              if (reflData.success) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reflection_recorded', message: '自省记录已保存' })}\n\n`));
              }
            } catch (reflErr: unknown) {
              console.error('[自省] 命令执行失败:', reflErr);
            }
          }

          // 处理 [自省统计] 命令 — 查询学习统计
          const statsPattern = /\[自省统计\]\s*维度:(.*?)\s*$/m;
          const statsMatch = fullResponse?.match(statsPattern);
          if (statsMatch) {
            try {
              const statsRes = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/ai/reflection`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({
                  action: 'stats',
                  agentId: assistantType === 'laxiang' ? 'laxiang_zhushou' : 'dr_silver_snake',
                  statsConfig: {
                    agent_id: assistantType === 'laxiang' ? 'laxiang_zhushou' : 'dr_silver_snake',
                    agent_name: assistantType === 'laxiang' ? '蜡象助手' : '银蛇博士',
                    period: 'week',
                  }
                })
              });
              const statsData = await statsRes.json();
              if (statsData.success) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reflection_stats', data: statsData.data })}\n\n`));
              }
            } catch (statsErr: unknown) {
              console.error('[自省统计] 命令执行失败:', statsErr);
            }
          }

          // 处理 [记忆] 命令 — 分层记忆操作
          const memCmdPattern = /\[记忆\]\s*(保存|查询|清空)\s*(.*)\s*$/m;
          const memCmdMatch = fullResponse?.match(memCmdPattern);
          if (memCmdMatch && (assistantType === 'yinhe' || assistantType === 'laxiang')) {
            try {
              const memAction = memCmdMatch[1].trim();
              const memContent = memCmdMatch[2].trim();

              if (memAction === '保存' && memContent) {
                // 解析: [记忆] 保存 L3:核心知识|类型:knowledge|内容:光合作用是植物...
                const layerMatch = memContent.match(/L(\d):/);
                const typeMatch = memContent.match(/类型:(\w+)/);
                const contentMatch = memContent.match(/内容:(.+)$/);

                if (layerMatch && typeMatch && contentMatch) {
                  const layer = parseInt(layerMatch[1]);
                  const memType = typeMatch[1];
                  const memVal = contentMatch[1].trim();
                  const agentName = assistantType === 'yinhe' ? 'yinshe_boshi' : 'laxiang_zhushou';

                  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
                  const supabase = getSupabaseClient();
                  await supabase.from('agent_memories').insert({
                    agent_username: agentName,
                    user_id: userId || '',
                    memory_type: memType,
                    content: memVal,
                    layer: Math.min(4, Math.max(0, layer)),
                    importance: layer >= 3 ? 8 : layer >= 2 ? 5 : 3,
                    status: 'active',
                    created_at: new Date().toISOString()
                  });
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'memory_saved', layer, memoryType: memType })}\n\n`));
                }
              } else if (memAction === '查询' && memContent) {
                const agentName = assistantType === 'yinhe' ? 'yinshe_boshi' : 'laxiang_zhushou';
                const layerFilter = memContent.match(/L(\d)/);
                const typeFilter = memContent.match(/类型:(\w+)/);

                const { getSupabaseClient } = await import('@/storage/database/supabase-client');
                const supabase = getSupabaseClient();
                let query = supabase.from('agent_memories')
                  .select('content, memory_type, layer, importance, created_at')
                  .eq('agent_username', agentName)
                  .eq('user_id', userId || '')
                  .order('importance', { ascending: false })
                  .limit(10);

                if (layerFilter) query = query.eq('layer', parseInt(layerFilter[1]));
                if (typeFilter) query = query.eq('memory_type', typeFilter[1]);

                const { data: memResults } = await query;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'memory_query', data: memResults || [] })}\n\n`));
              }
            } catch (memErr: unknown) {
              console.error('[记忆] 命令执行失败:', memErr);
            }
          }

          // [创建主题] 命令处理 - 蜡象助手专属
          const createThemePattern = /\[创建主题\]\s*([\s\S]*?)(?:$|\[\/创建主题\])/;
          const createThemeMatch = fullResponse?.match(createThemePattern);
          if (createThemeMatch && assistantType === 'laxiang') {
            try {
              const themeJsonStr = createThemeMatch[1].trim();
              const themeData = JSON.parse(themeJsonStr);

              const createRes = await fetch(`${getAppBaseUrl()}/api/ai/create-theme`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({ ...themeData, userId, userRole })
              });
              const createResult = await createRes.json();

              if (createResult.success) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'theme_created',
                  theme: createResult.theme
                })}\n\n`));
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'theme_create_error',
                  error: createResult.error
                })}\n\n`));
              }
            } catch (themeErr: unknown) {
              console.error('[创建主题] 命令执行失败:', themeErr);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'theme_create_error',
                error: '主题创建失败，请检查数据格式'
              })}\n\n`));
            }
          }

        // 处理图片和视频生成命令
        if (fullResponse && assistantType === 'yinhe') {
          console.log('[银蛇博士] 开始处理媒体命令, 回复长度:', fullResponse.length);

          // 调试：检查是否包含生成命令
          if (fullResponse.includes('[生成图片]') || fullResponse.includes('生成图片')) {
            console.log('[银蛇博士] 回复中包含图片生成请求');
          }

          const mediaResults = await processMediaCommands(fullResponse, teamId || '', internalHeaders);
          console.log('[银蛇博士] 媒体生成结果:', mediaResults.length, '个');

          for (const result of mediaResults) {
            const dataStr = JSON.stringify(result);
            console.log('[银蛇博士] 发送 SSE 数据:', dataStr.substring(0, 200));
            controller.enqueue(encoder.encode(`data: ${dataStr}\n\n`));
          }

          console.log('[银蛇博士] SSE 数据发送完成，即将发送 [DONE]');
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        console.log('[银蛇博士] [DONE] 已发送');

        // 关键：发送完 [DONE] 后立即关闭流，避免连接挂起导致客户端超时
        controller.close();

        // 后续处理（保存记忆、提取反馈）在流关闭后异步执行，不阻塞响应
        if (fullResponse) {
          try {
            await saveToMemory(
              agentInfo.username,
              currentSessionId,
              'assistant',
              fullResponse,
              userId,
              userRole
            );

            // 如果是银蛇博士，自动提取反馈并发送给蜡象助手
            if (agentInfo.username === 'yinhe_boshi') {
              await extractAndForwardFeedback(fullResponse, {
                teamId,
                themeId: contextData?.context?.team?.current_theme_id,
                themeName: contextData?.context?.theme?.name,
                teamName: contextData?.context?.team?.name
              }, internalHeaders);
            }
          } catch (postError) {
            // 后处理失败不影响已返回的响应
            console.error('[流式响应] 后处理（记忆保存/反馈提取）失败:', postError);
          }
        }
      } catch (error) {
        console.error('LLM Stream Error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'AI响应出错，请稍后重试' })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': currentSessionId, // 返回会话ID给前端
    },
  });
}
