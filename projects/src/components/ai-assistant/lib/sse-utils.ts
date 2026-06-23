/**
 * SSE 流式响应处理工具
 * 从 ai-assistant.tsx 提取，负责解析 SSE 数据流
 */

/**
 * SSE 事件回调接口
 */
export interface SSEEventCallbacks {
  /** 收到文本内容 */
  onContent: (content: string, fullText: string) => void;
  /** 收到使用统计 */
  onUsageStats: (stats: {
    conversationRounds: number;
    dailyMinutes: number;
    offTopicRatio: number;
    offTopicCount: number;
  }) => void;
  /** 图片生成中 */
  onImageGenerating: (prompt: string) => void;
  /** 视频生成中 */
  onVideoGenerating: (prompt: string) => void;
  /** 图片生成完成 */
  onImageGenerated: (imageUrl: string, prompt?: string) => void;
  /** 视频生成完成 */
  onVideoGenerated: (data: {
    videoUrl: string;
    prompt?: string;
    duration?: number;
    resolution?: string;
  }) => void;
  /** 收到 TTS 音频 */
  onAudio: (base64Audio: string) => void;
}

/**
 * 读取并处理 SSE 流
 * @param reader - ReadableStreamDefaultReader
 * @param callbacks - 事件回调集合
 * @returns 完整的助手消息文本
 */
export async function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: SSEEventCallbacks
): Promise<string> {
  const decoder = new TextDecoder();
  let assistantMessage = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            assistantMessage += parsed.content;
            callbacks.onContent(parsed.content, assistantMessage);
          }
          if (parsed.type === 'usage_stats') {
            callbacks.onUsageStats({
              conversationRounds: parsed.conversationRounds || 0,
              dailyMinutes: parsed.dailyMinutes || 0,
              offTopicRatio: parsed.offTopicRatio || 0,
              offTopicCount: parsed.offTopicCount || 0,
            });
          }
          if (parsed.type === 'image_generating' && parsed.prompt) {
            callbacks.onImageGenerating(parsed.prompt);
          }
          if (parsed.type === 'video_generating' && parsed.prompt) {
            callbacks.onVideoGenerating(parsed.prompt);
          }
          if (parsed.type === 'image_generated' && parsed.imageUrl) {
            callbacks.onImageGenerated(parsed.imageUrl, parsed.prompt);
          }
          if (parsed.type === 'video_generated' && parsed.videoUrl) {
            callbacks.onVideoGenerated({
              videoUrl: parsed.videoUrl,
              prompt: parsed.prompt,
              duration: parsed.duration,
              resolution: parsed.resolution,
            });
          }
          if (parsed.type === 'audio' && parsed.audio) {
            callbacks.onAudio(parsed.audio);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  return assistantMessage;
}

/**
 * 上传单张图片到服务器
 * @param file - 要上传的图片文件
 * @returns 签名后的图片 URL
 */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/ai/upload-image', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('图片上传失败');
  }

  const data = await response.json();
  return data.url;
}
