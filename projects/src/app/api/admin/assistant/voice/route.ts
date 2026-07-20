import { NextRequest, NextResponse } from 'next/server';
import { TTSClient, ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';

/**
 * 管理员智能体语音接口
 * GET: 获取可用的语音列表
 * POST: 处理TTS（文本转语音）和ASR（语音转文本）请求
 */

// 可用的语音列表
const AVAILABLE_VOICES = [
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi', description: '中文女声，自然流畅', recommended: true },
  { id: 'zh_female_xiaohe_uranus_bigtts', name: '小荷', description: '中文女声，通用' },
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟', description: '中文男声，沉稳' },
  { id: 'zh_male_taocheng_uranus_bigtts', name: '晓天', description: '中文男声，亲切' },
];

// 获取可用的语音列表
export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  return NextResponse.json({ voices: AVAILABLE_VOICES });
}

// 处理TTS和ASR请求
export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { action, text, audioUrl, audioBase64, speaker } = body;

    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // TTS: 文本转语音
    if (action === 'tts' && text) {
      console.log('[语音API] TTS请求:', { text: text.substring(0, 50), speaker });

      const ttsClient = new TTSClient(config, customHeaders);

      try {
        const response = await ttsClient.synthesize({
          uid: 'admin-assistant',
          text,
          speaker: speaker || 'zh_female_vv_uranus_bigtts',
          audioFormat: 'mp3',
          sampleRate: 24000,
        });

        console.log('[语音API] TTS成功:', { audioUri: response.audioUri, audioSize: response.audioSize });

        return NextResponse.json({
          success: true,
          audioUri: response.audioUri,
          audioSize: response.audioSize,
        });
      } catch (ttsError: any) {
        // 临时调试：把详细错误返回给前端，便于定位
        console.error('[语音API] TTS失败详情:', {
          message: ttsError?.message,
          stack: ttsError?.stack,
          response: ttsError?.response?.data || ttsError?.response,
          status: ttsError?.status || ttsError?.statusCode,
          name: ttsError?.name,
        });
        return NextResponse.json({
          success: false,
          error: 'TTS 调用失败',
          debug: {
            message: ttsError?.message || String(ttsError),
            name: ttsError?.name,
            status: ttsError?.status || ttsError?.statusCode,
            responseData: ttsError?.response?.data || ttsError?.response || null,
            stack: process.env.NODE_ENV === 'development' ? ttsError?.stack?.split('\n').slice(0, 5) : undefined,
          },
        }, { status: 500 });
      }
    }

    // ASR: 语音转文本
    if (action === 'asr' && (audioUrl || audioBase64)) {
      console.log('[语音API] ASR请求:', { hasUrl: !!audioUrl, hasBase64: !!audioBase64 });
      
      const asrClient = new ASRClient(config, customHeaders);
      
      const response = await asrClient.recognize({
        uid: 'admin-assistant',
        url: audioUrl,
        base64Data: audioBase64,
      });

      console.log('[语音API] ASR成功:', { text: response.text, duration: response.duration });
      
      return NextResponse.json({
        success: true,
        text: response.text,
        duration: response.duration,
      });
    }

    return ApiErrors.validation('无效的请求参数');
  } catch (error: any) {
    console.error('[语音API] 错误:', error);
    return safeError(error);
  }
}
