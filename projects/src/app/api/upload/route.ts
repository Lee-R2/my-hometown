import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { ApiErrors } from '@/lib/api-error';
import { isDangerousExtension } from '@/lib/security';

// 图片上传API（支持图片和视频）
export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // 频率限制：每小时最多20次上传
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(ip, 'upload');
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.message || '上传过于频繁，请稍后再试' },
      { status: 429 }
    );
  }

  try {
    const uploadType = request.nextUrl.searchParams.get('type') || 'image';
    const isVideo = uploadType === 'video';

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return ApiErrors.validation('未找到上传文件');
    }

    // 安全修复（P3 输入校验）：扩展名黑名单校验，禁止可执行脚本/可含 XSS 的文件
    if (isDangerousExtension(file.name)) {
      return NextResponse.json({
        error: '不支持的文件类型，禁止上传可执行脚本或可含脚本的文件（exe/bat/cmd/sh/php/js/html/svg）'
      }, { status: 400 });
    }

    // 根据上传类型验证文件类型
    const imageAllowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const videoAllowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    const allowedTypes = isVideo ? videoAllowedTypes : imageAllowedTypes;

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: isVideo
          ? '不支持的文件类型，仅支持 MP4、WebM、MOV、AVI 格式的视频'
          : '不支持的文件类型，仅支持 JPG、PNG、GIF、WebP 格式的图片'
      }, { status: 400 });
    }

    // 验证文件大小（图片最大10MB，视频最大100MB）
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: isVideo ? '文件大小不能超过 100MB' : '文件大小不能超过 10MB'
      }, { status: 400 });
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 生成文件名
    // 安全修复：清理文件名中的特殊字符，防止路径遍历
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    const timestamp = Date.now();
    const folder = isVideo ? 'videos' : 'tools';
    const safeBaseName = file.name.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_');
    const fileName = `${folder}/${safeBaseName}_${timestamp}.${ext}`;

    // 上传到对象存储
    const fileKey = await uploadFile({
      fileContent: fileBuffer,
      fileName: fileName,
      contentType: file.type,
    });

    // 生成签名URL（有效期7天）
    const signedUrl = await generateSignedUrl({
      key: fileKey,
      expireTime: 7 * 24 * 60 * 60, // 7天
    });

    return NextResponse.json({ 
      success: true,
      url: signedUrl,
      key: fileKey,
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    return ApiErrors.validation('文件上传失败，请重试');
  }
}
