import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { isDangerousExtension } from '@/lib/security';

/**
 * 智能体文件上传API
 * 支持上传图片、视频、文档等文件到对象存储
 */

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return ApiErrors.validation('未找到上传文件');
    }

    // 安全修复（P3 输入校验）：扩展名黑名单校验，禁止可执行脚本/可含 XSS 的文件
    if (isDangerousExtension(file.name)) {
      return ApiErrors.validation('不支持的文件类型，禁止上传可执行脚本或可含脚本的文件（exe/bat/cmd/sh/php/js/html/svg）');
    }

    // 检查文件大小（最大50MB）
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return ApiErrors.validation('文件大小不能超过50MB');
    }

    // 获取文件类型
    const contentType = file.type || 'application/octet-stream';

    // 检查文件类型是否支持
    const allowedTypes = [
      // 图片（SVG 已移除：SVG 可内嵌脚本导致 XSS）
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // 视频
      'video/mp4', 'video/webm', 'video/avi', 'video/quicktime', 'video/x-msvideo',
      // 文档
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
    ];

    // 严格文档类型白名单（避免 contentType.includes('text') 等模糊匹配
    // 误放行 text/html、application/javascript 等危险类型）
    const documentTypes = ['application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

    // 判断是否为支持的文件类型
    // 安全修复（P3 输入校验）：显式排除 image/svg+xml，避免 startsWith('image/') 放行含脚本的 SVG
    const isImage = contentType.startsWith('image/') && contentType !== 'image/svg+xml';
    const isVideo = contentType.startsWith('video/');
    const isDocument = documentTypes.includes(contentType);

    if (!isImage && !isVideo && !isDocument) {
      return ApiErrors.validation('不支持的文件类型，请上传图片、视频或文档文件');
    }

    // 读取文件内容
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 生成文件名（保留原始扩展名）
    const timestamp = Date.now();
    // 文件名清洗：去除特殊字符，并阻止 .. 路径穿越
    const originalName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.\./g, '_');
    const fileName = `assistant-uploads/${timestamp}_${originalName}`;

    // 上传文件
    const fileKey = await uploadFile({
      fileContent: fileBuffer,
      fileName: fileName,
      contentType: contentType,
    });

    // 生成签名URL（有效期24小时）
    const fileUrl = await generateSignedUrl({
      key: fileKey,
      expireTime: 86400,
    });

    // 返回文件信息
    return NextResponse.json({
      success: true,
      file: {
        key: fileKey,
        url: fileUrl,
        name: file.name,
        type: isImage ? 'image' : isVideo ? 'video' : 'document',
        contentType: contentType,
        size: file.size,
      }
    });

  } catch (error) {
    console.error('[智能体文件上传] 错误:', error);
    return safeError(error);
  }
}
