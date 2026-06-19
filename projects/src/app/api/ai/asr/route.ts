import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';

/**
 * 语音识别API
 * 将音频数据转换为文字
 */

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { audioData, audioUrl } = await request.json();

    if (!audioData && !audioUrl) {
      return ApiErrors.validation('缺少音频数据或音频URL');
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
      url: audioUrl,
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
