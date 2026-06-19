import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { saveConversation, addMemory } from '@/lib/agent-memory';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';
import type { Message } from './message-builder';

/**
 * 流式响应处理器
 * 从 route.ts POST 函数中提取（L2321-2629）
 * 负责：LLM 调用、流式输出、图片/视频生成命令处理、对话保存、记忆提取
 */

export interface StreamHandlerContext {
  messages: Message[];
  model: string;
  request: NextRequest;
  teamId: string;
  sessionId: string;
  agentUsername: string;
  userName: string;
  message: string;
  conversationRounds: number;
  dailyMinutes: number;
  offTopicRatio: number;
  offTopicCount: number;
  totalAnalyzed: number;
}

/**
 * 从对话中提取重要信息到记忆（与银蛇博士身份融合）
 * 提取 7 类记忆：用户名、学习困难、学习兴趣、任务进展、互动偏好、小队信息、教学关键点
 */
async function extractMemoriesFromConversation(
  agentUsername: string,
  teamId: string,
  message: string,
  assistantMessage: string
): Promise<void> {
  // 1. 提取用户名信息
  const nameMatch = (message || '').match(/(?:我叫|我是)\s*(\S+)/);
  if (nameMatch) {
    await addMemory(
      agentUsername,
      'user_info',
      `用户名字: ${nameMatch[1]}`,
      'team_id',
      teamId,
      7
    );
    console.log('[银蛇博士API] 保存用户名记忆:', nameMatch[1]);
  }

  // 2. 提取学习困难/卡点 — 银蛇博士最关心的
  const difficultyPatterns = [
    /(?:不懂|不会|搞不懂|搞不清|不明白|不理解|看不懂|想不通|太难了|好难|太难|搞不定|做不出|想不出|找不到头绪)/,
    /(?:卡住了|做不来|没思路|不知道怎么|不知道从哪|无从下手|完全没有方向)/,
    /(?:为什么|怎么会|怎么回事|到底是)/,
  ];
  const hasDifficulty = difficultyPatterns.some(p => p.test(message || ''));
  if (hasDifficulty) {
    const difficultyInfo = `学习卡点: ${message?.substring(0, 80)}...`;
    await addMemory(
      agentUsername,
      'learning_difficulty',
      difficultyInfo,
      'team_id',
      teamId,
      6
    );
    console.log('[银蛇博士API] 保存学习困难记忆');
  }

  // 3. 提取学习兴趣/热情 — 用于调整教学风格
  const interestPatterns = [
    /(?:好有趣|好有意思|好棒|太酷了|好神奇|我想知道更多|还想学|继续讲|再给我讲讲)/,
    /(?:我喜欢|最爱|特别爱|对.*感兴趣|觉得.*好玩)/,
  ];
  const hasInterest = interestPatterns.some(p => p.test(message || ''));
  if (hasInterest) {
    const interestInfo = `学习兴趣点: ${message?.substring(0, 80)}...`;
    await addMemory(
      agentUsername,
      'learning_interest',
      interestInfo,
      'team_id',
      teamId,
      5
    );
    console.log('[银蛇博士API] 保存学习兴趣记忆');
  }

  // 4. 提取任务进展 — 与小队任务体系对接
  const taskProgressPatterns = [
    /(?:完成了|做完了|交了|提交了|搞定了|做好了)/,
    /(?:正在做|在写|在画|在做|开始做|准备做)/,
    /(?:还差|还剩|还要做|还缺|没完成|没做完)/,
  ];
  const hasTaskProgress = taskProgressPatterns.some(p => p.test(message || ''));
  if (hasTaskProgress) {
    const progressInfo = `任务进展: ${message?.substring(0, 80)}...`;
    await addMemory(
      agentUsername,
      'task_progress',
      progressInfo,
      'team_id',
      teamId,
      5
    );
    console.log('[银蛇博士API] 保存任务进展记忆');
  }

  // 5. 提取互动偏好 — 小队喜欢什么互动方式
  const interactionPatterns = [
    /(?:再出一个|再来一道|还要|再玩一次|继续挑战)/,
    /(?:太简单了|不够难|能不能难一点|再来个难的)/,
    /(?:不要提示|不要帮忙|让我自己想|我自己来)/,
  ];
  const hasInteractionPref = interactionPatterns.some(p => p.test(message || ''));
  if (hasInteractionPref) {
    const interactionInfo = `互动偏好: ${message?.substring(0, 60)}...`;
    await addMemory(
      agentUsername,
      'interaction_style',
      interactionInfo,
      'team_id',
      teamId,
      5
    );
    console.log('[银蛇博士API] 保存互动偏好记忆');
  }

  // 6. 提取小队相关信息
  const teamMatch = (message || '').match(/(?:我们小队|我们团队)[^\w]*(\S+)/);
  if (teamMatch) {
    await addMemory(
      agentUsername,
      'team_info',
      `用户提到的小队/团队信息: ${teamMatch[1]}`,
      'team_id',
      teamId,
      6
    );
    console.log('[银蛇博士API] 保存小队信息记忆:', teamMatch[1]);
  }

  // 7. 从助手回复中提取关键教学结论 — 让银蛇博士记住自己教过什么
  const teachingKeyPatterns = [
    /(?:记住|要记住|重点|关键|核心|最重要的|一定要注意)/,
    /(?:这就是为什么|所以|原因是|道理是|原理是)/,
  ];
  const hasTeachingKey = teachingKeyPatterns.some(p => p.test(assistantMessage || ''));
  if (hasTeachingKey) {
    const keyLines = (assistantMessage || '').split('\n').filter((line: string) =>
      teachingKeyPatterns.some(p => p.test(line)) && line.length < 100
    );
    if (keyLines.length > 0) {
      await addMemory(
        agentUsername,
        'teaching_point',
        `教过的关键知识: ${keyLines[0].trim().substring(0, 80)}`,
        'team_id',
        teamId,
        4
      );
      console.log('[银蛇博士API] 保存教学关键点记忆');
    }
  }
}

/**
 * 创建流式响应
 * 包含：LLM 流式调用、图片/视频生成命令处理、对话保存、记忆提取
 */
export async function createStreamResponse(ctx: StreamHandlerContext): Promise<Response> {
  const {
    messages, model, request, teamId, sessionId, agentUsername, userName,
    message, conversationRounds, dailyMinutes, offTopicRatio, offTopicCount, totalAnalyzed
  } = ctx;

  // 调用LLM
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config({
    apiKey: AI_API_KEY,
    baseUrl: AI_BASE_URL,
    modelBaseUrl: AI_MODEL_BASE_URL,
  });
  const llmClient = new LLMClient(config, customHeaders);

  // 创建流式响应
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let assistantMessage = '';

      try {
        const llmStream = llmClient.stream(messages, {
          model,
          temperature: 0.7,
        });

        for await (const chunk of llmStream) {
          if (chunk.content) {
            const text = chunk.content.toString();
            assistantMessage += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          }
        }

        // ===== 处理图片和视频生成命令 =====
        console.log('[银蛇博士API] 检查是否需要生成图片或视频...');

        // 检测图片生成命令
        const imageCommandRegex = /\[生成图片\]\s*prompt:([^|]+)(?:\|.*)?/gi;
        const imageMatch = imageCommandRegex.exec(assistantMessage);
        if (imageMatch) {
          const prompt = imageMatch[1].trim();
          console.log('[银蛇博士API] 检测到图片生成命令, prompt:', prompt);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'image_generating',
            prompt: prompt
          })}\n\n`));

          try {
            const baseUrl = process.env.DEPLOY_RUN_PORT
              ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
              : 'http://localhost:5000';

            const imageResponse = await fetch(`${baseUrl}/api/ai/yinhe-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, teamId })
            });

            const imageData = await imageResponse.json();
            console.log('[银蛇博士API] 图片生成结果:', imageData.success ? '成功' : '失败');

            if (imageData.success && imageData.imageUrls && imageData.imageUrls.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'image_generated',
                imageUrl: imageData.imageUrls[0],
                prompt: prompt
              })}\n\n`));
              console.log('[银蛇博士API] 已发送图片到SSE流');
            }
          } catch (error) {
            console.error('[银蛇博士API] 图片生成失败:', error);
          }
        }

        // 检测视频生成命令
        const videoCommandRegex = /\[生成视频\]\s*prompt:([^|]+)(?:\|duration:(\d+))?(?:\|ratio:([^|]+))?(?:\|.*)?/gi;
        const videoMatch = videoCommandRegex.exec(assistantMessage);
        if (videoMatch) {
          const prompt = videoMatch[1].trim();
          const duration = videoMatch[2] ? parseInt(videoMatch[2]) : 5;
          const ratio = videoMatch[3] || '16:9';
          console.log('[银蛇博士API] 检测到视频生成命令, prompt:', prompt);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'video_generating',
            prompt: prompt
          })}\n\n`));

          try {
            const baseUrl = process.env.DEPLOY_RUN_PORT
              ? `http://localhost:${process.env.DEPLOY_RUN_PORT}`
              : 'http://localhost:5000';

            const videoResponse = await fetch(`${baseUrl}/api/ai/yinhe-video`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, duration, ratio, teamId })
            });

            const videoData = await videoResponse.json();
            console.log('[银蛇博士API] 视频生成结果:', videoData.success ? '成功' : '失败');

            if (videoData.success && videoData.videoUrl) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'video_generated',
                videoUrl: videoData.videoUrl,
                prompt: prompt,
                duration: videoData.duration,
                resolution: videoData.resolution
              })}\n\n`));
              console.log('[银蛇博士API] 已发送视频到SSE流');
            }
          } catch (error) {
            console.error('[银蛇博士API] 视频生成失败:', error);
          }
        }

        // 发送对话限制元数据
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'usage_stats',
          conversationRounds,
          dailyMinutes,
          offTopicRatio: Math.round(offTopicRatio * 100) / 100,
          offTopicCount,
          totalAnalyzed,
        })}\n\n`));

        // 发送 [DONE] 信号
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // ===== 保存对话到数据库 =====
        console.log('[银蛇博士API] 保存对话到数据库...');

        // 保存用户消息
        await saveConversation(
          agentUsername,
          sessionId,
          'user',
          message || '(发送图片)',
          undefined,
          userName
        );

        // 保存助手回复
        if (assistantMessage) {
          await saveConversation(
            agentUsername,
            sessionId,
            'assistant',
            assistantMessage,
            undefined,
            '银蛇博士'
          );
        }

        // ===== 提取重要信息到记忆（与银蛇博士身份融合） =====
        console.log('[银蛇博士API] 提取重要信息到记忆...');
        await extractMemoriesFromConversation(agentUsername, teamId, message, assistantMessage);

        console.log('[银蛇博士API] 对话保存完成');

      } catch (error) {
        console.error('LLM流式输出错误:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: '回答生成失败' })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
}
