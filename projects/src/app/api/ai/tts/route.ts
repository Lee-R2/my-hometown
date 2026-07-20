import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { TTSClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { ApiErrors } from '@/lib/api-error';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '@/lib/ai-config';
import { checkAiRateLimit } from '@/lib/rate-limit';

/**
 * 文字转语音API
 * 将文本转换为语音音频
 * 
 * 可用声音选项:
 * - zh_female_vv_uranus_bigtts (Vivi - 中英双语，自然友好，推荐用于AI助手)
 * - zh_female_xiaohe_uranus_bigtts (小何 - 默认通用)
 * - zh_male_m191_uranus_bigtts (云舟 - 男声稳重)
 * - zh_male_taocheng_uranus_bigtts (小天 - 男声)
 * - zh_female_xueayi_saturn_bigtts (儿童有声书风格)
 * - zh_female_mizai_saturn_bigtts (米仔 - 女声，适合视频配音)
 * - zh_male_dayi_saturn_bigtts (大艺 - 男声，适合视频配音)
 */

// 默认声音：Vivi（中英双语，自然友好，适合AI助手场景）
const DEFAULT_SPEAKER = 'zh_female_vv_uranus_bigtts';

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_tts');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const { text, speaker } = await request.json();

    if (!text || typeof text !== 'string') {
      return ApiErrors.validation('缺少文本内容');
    }

    // 安全修复（P3 输入校验）：限制输入文本长度，超过上限直接拒绝，避免资源滥用
    const MAX_TTS_TEXT_LENGTH = 500;
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      return ApiErrors.validation(`文本内容过长，最大支持 ${MAX_TTS_TEXT_LENGTH} 字符`);
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new TTSClient(config, customHeaders);

    const result = await client.synthesize({
      uid: 'user-' + Date.now(),
      text,
      speaker: speaker || DEFAULT_SPEAKER,
      audioFormat: 'mp3',
      sampleRate: 24000,
      speechRate: 0,  // 正常语速
      loudnessRate: 0, // 正常音量
    });

    return NextResponse.json({
      success: true,
      audioUri: result.audioUri,
      audioSize: result.audioSize,
      speaker: speaker || DEFAULT_SPEAKER
    });
  } catch (error: any) {
    console.error('TTS error:', error);
    return safeError(error);
  }
}
