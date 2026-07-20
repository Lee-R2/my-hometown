import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';
import { checkAiRateLimit } from '@/lib/rate-limit';
import { isPrivateIp, isInternalHost } from '@/lib/security';

/**
 * 语音识别API
 * 将音频数据转换为文字
 */

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_asr');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const { audioData, audioUrl } = await request.json();

    if (!audioData && !audioUrl) {
      return ApiErrors.validation('缺少音频数据或音频URL');
    }

    // 安全修复（P3 SSRF）：当传入 audioUrl 时严格校验，禁止访问内网/本机地址
    let safeAudioUrl: string | undefined;
    if (audioUrl) {
      if (typeof audioUrl !== 'string') {
        return ApiErrors.validation('音频URL格式错误');
      }
      // 必须是 https 开头，避免明文与协议混淆
      if (!audioUrl.startsWith('https://')) {
        return ApiErrors.validation('音频URL必须使用 https 协议');
      }
      let parsed: URL;
      try {
        parsed = new URL(audioUrl);
      } catch {
        return ApiErrors.validation('音频URL格式错误');
      }
      // 拒绝内网主机名/IP，防止 SSRF 访问内部服务
      const host = parsed.hostname;
      if (isInternalHost(host) || isPrivateIp(host)) {
        return ApiErrors.validation('音频URL指向的地址不被允许');
      }
      safeAudioUrl = audioUrl;
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new ASRClient(config, customHeaders);

    const result = await client.recognize({
      uid: 'user-' + Date.now(),
      base64Data: audioData,
      url: safeAudioUrl,
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      duration: result.duration
    });
  } catch (error: any) {
    console.error('ASR error:', error);
    return safeError(error);
  }
}
