/**
 * 图片处理工具函数
 * 从 ai-assistant.tsx 提取的纯工具函数（无状态依赖、无副作用）
 */

/**
 * 将 File 对象转换为 base64 Data URL
 * @param file - 要转换的文件
 * @returns base64 编码的 Data URL 字符串
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 图片上传约束常量
 */
export const IMAGE_LIMITS = {
  MAX_IMAGES: 3,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

/**
 * 校验图片文件是否符合上传约束
 * @param file - 待校验的文件
 * @returns 校验通过返回 null，否则返回错误消息
 */
export function validateImageFile(file: File): string | null {
  if (file.size > IMAGE_LIMITS.MAX_FILE_SIZE) {
    return `图片 "${file.name}" 大小超过10MB，请选择更小的图片`;
  }
  return null;
}
