/**
 * 媒体命令与反馈转发模块
 * 从 src/app/api/ai/chat/route.ts 提取的命令处理相关函数（方案B拆分）
 * 包含：processMediaCommands、extractAndForwardFeedback
 * 原文件保持不变，本模块仅创建不引用。
 */

export async function processMediaCommands(fullResponse: string, teamId: string): Promise<any[]> {
  const results: any[] = [];
  
  console.log('[银蛇博士] processMediaCommands 被调用');
  console.log('[银蛇博士] 回复内容预览:', fullResponse.substring(0, 500));

  // 检测图片生成命令
  const imageCommandRegex = /\[生成图片\]\s*prompt:([^|]+)(?:\|.*)?/gi;
  const imageMatches = fullResponse.match(imageCommandRegex);
  console.log('[银蛇博士] 检测到图片命令:', imageMatches?.length || 0);
  
  let imageMatch;
  while ((imageMatch = imageCommandRegex.exec(fullResponse)) !== null) {
    const prompt = imageMatch[1].trim();
    console.log('[银蛇博士] 提取到的 prompt:', prompt);
    try {
      const baseUrl = process.env.DEPLOY_RUN_PORT 
        ? `http://localhost:${process.env.DEPLOY_RUN_PORT}` 
        : 'http://localhost:5000';
      
      const response = await fetch(`${baseUrl}/api/ai/yinhe-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, teamId })
      });

      const data = await response.json();
      
      if (data.success && data.imageUrls && data.imageUrls.length > 0) {
        results.push({
          type: 'image_generated',
          imageUrl: data.imageUrls[0],
          prompt,
          model: data.model
        });
      }
    } catch (error) {
      console.error('[银蛇博士] 图片生成失败:', error);
    }
  }

  // 检测视频生成命令
  const videoCommandRegex = /\[生成视频\]\s*prompt:([^|]+)(?:\|duration:(\d+))?(?:\|ratio:([^|]+))?(?:\|.*)?/gi;
  let videoMatch;
  while ((videoMatch = videoCommandRegex.exec(fullResponse)) !== null) {
    const prompt = videoMatch[1].trim();
    const duration = videoMatch[2] ? parseInt(videoMatch[2]) : 5;
    const ratio = videoMatch[3] || '16:9';
    
    try {
      const baseUrl = process.env.DEPLOY_RUN_PORT 
        ? `http://localhost:${process.env.DEPLOY_RUN_PORT}` 
        : 'http://localhost:5000';
      
      const response = await fetch(`${baseUrl}/api/ai/yinhe-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration, ratio, teamId })
      });

      const data = await response.json();
      
      if (data.success && data.videoUrl) {
        results.push({
          type: 'video_generated',
          videoUrl: data.videoUrl,
          prompt,
          duration: data.duration,
          resolution: data.resolution,
          model: data.model
        });
      }
    } catch (error) {
      console.error('[银蛇博士] 视频生成失败:', error);
    }
  }

  return results;
}

export async function extractAndForwardFeedback(
  responseContent: string,
  context: {
    teamId?: string;
    themeId?: string;
    themeName?: string;
    teamName?: string;
  }
) {
  try {
    // 提取 [反馈] 标记的内容
    const feedbackRegex = /\[反馈\]\s*类型：\{([^}]+)\}\s*\|\s*内容：\{([^}]+)\}/g;
    const matches = [...responseContent.matchAll(feedbackRegex)];
    
    if (matches.length === 0) {
      return; // 没有反馈，直接返回
    }

    // 发送到跨智能体通信 API
    for (const match of matches) {
      const [, type, content] = match;
      
      // 构造发送给蜡象助手的消息
      const message = `【小队反馈】\n类型：${type}\n小队：${context.teamName || '未知小队'}\n主题：${context.themeName || '未知主题'}\n内容：${content}`;
      
      try {
        await fetch(
          `${process.env.DEPLOY_RUN_PORT ? `http://localhost:${process.env.DEPLOY_RUN_PORT}` : 'http://localhost:5000'}/api/ai/agent-communication`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: 'yinhe_boshi',
              receiver: 'laxiang_zhushou',
              messageType: 'task_feedback',
              content: message,
              context: {
                teamId: context.teamId,
                themeId: context.themeId,
                themeName: context.themeName,
                teamName: context.teamName
              }
            })
          }
        );
      } catch (error) {
        console.error('[跨智能体通信] 发送反馈失败:', error);
      }
    }
  } catch (error) {
    console.error('[跨智能体通信] 提取反馈失败:', error);
  }
}
