/**
 * TTS 语音合成服务模块
 * 将蜡象助手生成的文本内容转换为自然语音
 * 使用火山引擎 TTS API
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';

// 需要过滤的符号和emoji（朗读时不读出）
const TTS_FILTER_PATTERNS = [
  /[【】「」『』〔〕〈〉《》]/g,  // 中文书名号等
  /[📍💡⚠️→•📋🎯🔍📝💬🎨📊🏫👤🔄⏳🔗📌📋]/g,  // emoji
  /^\s*[-*•]\s/gm,  // 列表标记
  /\[.*?\]/g,  // 方括号标记
  /#{1,6}\s/g,  // Markdown标题标记
  /\*\*|__/g,  // 加粗标记
  /\*|_/g,  // 斜体标记
  /```[\s\S]*?```/g,  // 代码块
  /`[^`]+`/g,  // 行内代码
  /\|[^\n]+\|/g,  // 表格行
  /^\s*\d+\.\s/gm,  // 有序列表数字
];

/**
 * 清理文本用于TTS朗读
 * 去除符号、emoji、Markdown标记，只保留纯文本内容
 */
export function cleanTextForTTS(text: string): string {
  let cleaned = text;

  // 先处理代码块和表格（整块移除）
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\|[^\n]+\|/g, '');

  // 处理Markdown标题（保留文字，去掉#号）
  cleaned = cleaned.replace(/^#{1,6}\s+(.+)/gm, '$1');

  // 处理加粗和斜体（保留文字，去掉标记符号）
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.+?)__/g, '$1');
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/_(.+?)_/g, '$1');

  // 移除方括号标记（如[创建主题]等命令标记）
  cleaned = cleaned.replace(/\[([^\]]*)\]/g, (match, content) => {
    // 如果方括号内容是命令标记（如"创建主题"、"发送消息"等），直接移除
    if (/^(创建|添加|配置|删除|修改|调整|发送|布置|移除|编辑|更新|审核|评价|查看)/.test(content)) {
      return '';
    }
    // 其他方括号内容保留文字
    return content;
  });

  // 移除中文特殊符号
  cleaned = cleaned.replace(/[【】「」『』〔〕〈〉《》]/g, '');

  // 移除emoji
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{FE00}-\u{FE0F}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F000}-\u{1FAFF}]/gu, '');

  // 处理列表标记
  cleaned = cleaned.replace(/^\s*[-*•]\s/gm, '');
  cleaned = cleaned.replace(/^\s*\d+\.\s/gm, '');

  // 处理行内代码
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 清理多余空行和空格
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * TTS合成结果
 */
export interface TTSResult {
  audioBase64: string;
  duration: number;  // 预估时长（毫秒）
}

/**
 * 调用TTS API将文本转换为语音
 * @param text 要朗读的文本（已清理）
 * @returns 音频的base64编码和预估时长
 */
export async function synthesizeSpeech(text: string): Promise<TTSResult | null> {
  if (!text || text.trim().length === 0) return null;

  // 限制单次TTS文本长度（避免API超时）
  const MAX_TTS_LENGTH = 500;
  const ttsText = text.length > MAX_TTS_LENGTH
    ? text.substring(0, MAX_TTS_LENGTH) + '。'
    : text;

  try {
    const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
    const baseUrl = process.env.COZE_INTEGRATION_MODEL_BASE_URL;

    if (!apiKey || !baseUrl) {
      console.log('[TTS服务] 缺少API配置，跳过语音合成');
      return null;
    }

    // 使用火山引擎TTS API
    const response = await fetch(`${baseUrl}/tts/v1`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'doubao-seed-tts',
        text: ttsText,
        voice_type: 'zh_female_shuangkuaisisi_mars_bigtts',
        encoding: 'mp3',
        speed_ratio: 1.0,
      }),
    });

    if (!response.ok) {
      console.log(`[TTS服务] API调用失败: ${response.status}`);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // 预估时长：中文约4字/秒
    const estimatedDuration = Math.ceil(ttsText.length / 4) * 1000;

    return {
      audioBase64,
      duration: estimatedDuration,
    };
  } catch (error) {
    console.error('[TTS服务] 语音合成失败:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * 将流式文本分段，适合TTS处理
 * 按句子分割，每段不超过指定长度
 */
export function segmentTextForTTS(text: string, maxLength = 200): string[] {
  // 按句号、问号、感叹号分割
  const sentences = text.split(/(?<=[。！？；\n])/);
  const segments: string[] = [];
  let currentSegment = '';

  for (const sentence of sentences) {
    if (currentSegment.length + sentence.length > maxLength && currentSegment.length > 0) {
      segments.push(currentSegment.trim());
      currentSegment = sentence;
    } else {
      currentSegment += sentence;
    }
  }

  if (currentSegment.trim().length > 0) {
    segments.push(currentSegment.trim());
  }

  return segments.filter(s => s.length > 0);
}
