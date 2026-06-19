import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';

/**
 * 图片上传API
 * 用于上传智能体对话中的图片，返回可访问的URL
 */

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return ApiErrors.validation('缺少文件');
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
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
