/**
 * 音频处理工具函数
 * 从 ai-assistant.tsx 提取的纯工具函数（无状态依赖）
 */

/**
 * 将 base64 字符串转换为 Blob 对象
 * @param base64 - base64 编码的字符串（不含 Data URL 前缀）
 * @param mimeType - MIME 类型，默认 audio/mp3
 * @returns 转换后的 Blob 对象
 */
export function base64ToBlob(base64: string, mimeType: string = 'audio/mp3'): Blob {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
}

/**
 * 将 base64 字符串转换为可播放的 Audio 对象和对象 URL
 * @param base64 - base64 编码的音频数据
 * @param mimeType - MIME 类型，默认 audio/mp3
 * @returns 包含 audio 对象和 url 的元组，使用后需调用 URL.revokeObjectURL(url) 释放
 */
export function base64ToAudio(
  base64: string,
  mimeType: string = 'audio/mp3'
): { audio: HTMLAudioElement; url: string } {
  const blob = base64ToBlob(base64, mimeType);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return { audio, url };
}
