import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';
import { checkAiRateLimit } from '@/lib/rate-limit';

/**
 * 银蛇博士图片生成 API
 * 支持小队端生成创意图片、示意图、故事配图等
 */

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_image');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const { prompt, size = '2K', teamId, taskContext } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return ApiErrors.validation('请提供有效的图片描述');
    }

    // 提取转发请求头（用于认证和追踪）
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 初始化图片生成客户端
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new ImageGenerationClient(config, customHeaders);

    // 生成图片
    const response = await client.generate({
      prompt,
      size,
      watermark: true,
      responseFormat: 'url',
    });

    // 使用 helper 提取结果
    const helper = client.getResponseHelper(response);

    if (helper.success && helper.imageUrls.length > 0) {
      // 将图片上传到对象存储，生成永久可访问URL
      const originalUrl = helper.imageUrls[0];
      
      try {
        // URL 下载图片并上传到对象存储
        const imageResponse = await fetch(originalUrl, { signal: AbortSignal.timeout(60000) });
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const urlPath = new URL(originalUrl).pathname;
        const ext = urlPath.split('.').pop() || 'png';
        const fileKey = await uploadFile({
          fileContent: imageBuffer,
          fileName: `ai-generated/${Date.now()}.${ext}`,
          contentType: imageResponse.headers.get('content-type') || 'image/png',
        });

        // 生成签名 URL（30天有效期）
        const imageUrl = await generateSignedUrl({
          key: fileKey,
          expireTime: 2592000, // 30天
        });

        console.log('[银蛇博士图片生成] 成功上传到对象存储', fileKey);

        return NextResponse.json({
          success: true,
          imageUrls: [imageUrl],
          originalUrl: originalUrl, // 保留原始 URL
          fileKey: fileKey, // 存储 key
          model: response.model,
          usage: response.usage,
          prompt,
          teamId,
          taskContext
        });
      } catch (uploadError: any) {
        console.error('[银蛇博士图片生成] 上传到对象存储失败', uploadError);
        // 如果上传失败，返回原URL
        return NextResponse.json({
          success: true,
          imageUrls: helper.imageUrls,
          model: response.model,
          usage: response.usage,
          prompt,
          teamId,
          taskContext,
          warning: '图片未保存到本地存储，仅临时可用'
        });
      }
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: '图片生成失败',
          details: helper.errorMessages 
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[银蛇博士图片生成] 错误:', error);
    return safeError(error);
  }
}

/**
 * GET 请求 - 获取支持的图片尺寸
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    supportedSizes: ['2K', '4K', '1024x1024', '1920x1080', '1080x1920', '2560x1440'],
    defaultSize: '2K',
    models: ['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128'],
    tips: [
      '图片将自动添加水印',
      '建议在描述中用引号包裹需要显示的文字',
      '支持的分辨率范围: 2560x1440 ~ 4096x4096'
    ]
  });
}
