import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils, Content } from 'coze-coding-dev-sdk';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';

/**
 * 银蛇博士视频生成 API
 * 支持小队端生成创意视频、动画、解说视频等
 */

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { prompt, duration = 5, resolution = '720p', ratio = '16:9', imageUrl, teamId, taskContext } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return ApiErrors.validation('请提供有效的视频描述');
    }

    // 提取转发请求头（用于认证和追踪）
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化视频生成客户端
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new VideoGenerationClient(config, customHeaders as Record<string, string>);

    // 构建内容数组
    const content: Content[] = [];

    // 如果有参考图片，添加为第一帧
    if (imageUrl && typeof imageUrl === 'string') {
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl },
        role: 'first_frame'
      } as Content);
    }

    // 添加文本描述
    content.push({
      type: 'text',
      text: prompt
    } as Content);

    // 生成视频
    const response = await client.videoGeneration(content, {
      model: 'doubao-seedance-1-5-pro-251215',
      duration: duration,
      resolution: resolution as '480p' | '720p' | '1080p',
      ratio: ratio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive',
      watermark: true,
      generateAudio: true, // 自动生成配音和背景音乐
    });

    if (response.videoUrl) {
      // 将视频上传到对象存储
      const originalVideoUrl = response.videoUrl;
      const originalPosterUrl = response.lastFrameUrl;

      try {
        // 下载视频并上传到对象存储
        const videoResponse = await fetch(originalVideoUrl, { signal: AbortSignal.timeout(120000) });
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        const videoKey = await uploadFile({
          fileContent: videoBuffer,
          fileName: `ai-generated/video/${Date.now()}.mp4`,
          contentType: videoResponse.headers.get('content-type') || 'video/mp4',
        });

        // 生成签名 URL（30天有效期）
        const videoUrl = await generateSignedUrl({
          key: videoKey,
          expireTime: 2592000, // 30天
        });

        // 如果有封面图，也上传
        let posterUrl = originalPosterUrl;
        if (originalPosterUrl) {
          try {
            const posterResponse = await fetch(originalPosterUrl, { signal: AbortSignal.timeout(60000) });
            const posterBuffer = Buffer.from(await posterResponse.arrayBuffer());
            const posterKey = await uploadFile({
              fileContent: posterBuffer,
              fileName: `ai-generated/poster/${Date.now()}.jpg`,
              contentType: posterResponse.headers.get('content-type') || 'image/jpeg',
            });
            posterUrl = await generateSignedUrl({
              key: posterKey,
              expireTime: 2592000,
            });
          } catch (posterError) {
            console.error('[银蛇博士视频生成] 封面上传失败:', posterError);
          }
        }

        console.log('[银蛇博士视频生成] 成功上传到对象存储', videoKey);

        return NextResponse.json({
          success: true,
          videoUrl: videoUrl,
          posterUrl: posterUrl,
          lastFrameUrl: originalPosterUrl,
          fileKey: videoKey,
          model: response.response.model,
          status: response.response.status,
          duration: response.response.duration,
          resolution: response.response.resolution,
          prompt,
          teamId,
          taskContext
        });
      } catch (uploadError: any) {
        console.error('[银蛇博士视频生成] 上传到对象存储失败:', uploadError);
        // 如果上传失败，返回原URL
        return NextResponse.json({
          success: true,
          videoUrl: originalVideoUrl,
          lastFrameUrl: originalPosterUrl,
          model: response.response.model,
          status: response.response.status,
          duration: response.response.duration,
          resolution: response.response.resolution,
          prompt,
          teamId,
          taskContext,
          warning: '视频未保存到本地存储，仅临时可用'
        });
      }
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: response.response.error_message || '视频生成失败',
          status: response.response.status
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[银蛇博士视频生成] 错误:', error);
    return safeError(error);
  }
}

/**
 * GET 请求 - 获取支持的参数
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, -1],
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    defaultDuration: 5,
    defaultResolution: '720p',
    defaultRatio: '16:9',
    tips: [
      '视频将自动生成配音和背景音乐',
      '支持 4-12 秒时长，或使用-1 让AI自动选择最佳时长',
      '支持根据参考图片生成视频（传入imageUrl 参数）',
      '建议在描述中用引号包裹需要配音的对话'
    ]
  });
}
