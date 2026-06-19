import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

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

    // 检查文件大小（最大50MB）
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return ApiErrors.validation('文件大小不能超过50MB');
    }

    // 获取文件类型
    const contentType = file.type || 'application/octet-stream';
    
    // 检查文件类型是否支持
    const allowedTypes = [
      // 图片
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
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

    // 判断是否为支持的文件类型
    const isImage = contentType.startsWith('image/');
    const isVideo = contentType.startsWith('video/');
    const isDocument = allowedTypes.includes(contentType) || 
      contentType.includes('pdf') || 
      contentType.includes('document') || 
      contentType.includes('sheet') ||
      contentType.includes('presentation') ||
      contentType.includes('text');

    if (!isImage && !isVideo && !isDocument) {
      return ApiErrors.validation('不支持的文件类型，请上传图片、视频或文档文件');
    }

    // 读取文件内容
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 生成文件名（保留原始扩展名）
    const timestamp = Date.now();
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
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
