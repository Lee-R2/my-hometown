import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';
import { isDangerousExtension } from '@/lib/security';

/**
 * 图片上传API
 * 用于上传智能体对话中的图片，返回可访问的URL
 */

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return ApiErrors.validation('缺少文件');
    }

    // 安全修复（P3 输入校验）：扩展名黑名单校验，禁止可执行脚本/可含 XSS 的文件
    if (isDangerousExtension(file.name)) {
      return ApiErrors.validation('不支持的文件类型，禁止上传可执行脚本或可含脚本的文件（exe/bat/cmd/sh/php/js/html/svg）');
    }

    // 验证文件类型
    // 安全修复（P3 输入校验）：显式排除 image/svg+xml，避免 startsWith('image/') 放行含脚本的 SVG
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return ApiErrors.validation('只能上传图片文件');
    }

    // 验证文件大小（最大10MB）
    if (file.size > 10 * 1024 * 1024) {
      return ApiErrors.validation('图片大小不能超过10MB');
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `ai-chat-images/${timestamp}_${randomStr}.${ext}`;

    // 上传文件
    const key = await uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    // 生成签名URL（有效期1小时）
    const signedUrl = await generateSignedUrl({
      key,
      expireTime: 3600,
    });

    console.log('[图片上传] 成功:', { fileName, key, urlLength: signedUrl.length });

    return NextResponse.json({
      success: true,
      url: signedUrl,
      key,
    });
  } catch (error: any) {
    console.error('[图片上传] 失败:', error);
    return safeError(error);
  }
}
