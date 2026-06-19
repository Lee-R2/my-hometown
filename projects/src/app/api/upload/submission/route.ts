import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';

// 支持的文件类型
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mov'];
const ALLOWED_TEXT_TYPES = [
  'text/plain', 
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// 最大文件大小 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// 获取文件类型分类
function getFileCategory(mimeType: string): 'image' | 'video' | 'text' | 'unknown' {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_TEXT_TYPES.includes(mimeType)) return 'text';
  return 'unknown';
}

// 任务产出文件上传API
export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const teamId = formData.get('teamId') as string;
    const teamName = formData.get('teamName') as string;
    const themeName = formData.get('themeName') as string;
    const stage = formData.get('stage') as string;
    const fileIndex = formData.get('fileIndex') as string;

    if (!file) {
      return ApiErrors.validation('未找到上传文件');
    }

    // 验证文件类型
    const allAllowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_TEXT_TYPES];
    if (!allAllowedTypes.includes(file.type)) {
      return ApiErrors.validation('不支持的文件类型，支持图片(JPG/PNG/GIF)、视频(MP4/MOV)、文档(PDF/Word/Excel/PPT/TXT)');
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return ApiErrors.validation('文件大小不能超过 100MB');
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 获取文件扩展名
    const ext = file.name.split('.').pop() || 'bin';
    
    // 生成文件名：小队名+任务主题名+任务阶段名+文件顺序号+格式扩展
    // 格式：小队名_主题名_第X阶段_文件序号.扩展名
    let displayFileName: string;
    if (teamName && themeName && stage && fileIndex) {
      // 清理名称中的特殊字符
      const safeTeamName = teamName.replace(/[\\/:*?"<>|]/g, '_');
      const safeThemeName = themeName.replace(/[\\/:*?"<>|]/g, '_');
      displayFileName = `${safeTeamName}_${safeThemeName}_第${stage}阶段_${fileIndex}.${ext}`;
    } else {
      // 兜底：使用原始文件名
      displayFileName = file.name;
    }

    // 存储路径：submissions/小队ID/时间戳_原文件名.扩展名
    const timestamp = Date.now();
    const storageFileName = teamId 
      ? `submissions/${teamId}/${timestamp}_${file.name}`
      : `submissions/${timestamp}_${file.name}`;

    // 上传到对象存储
    const fileKey = await uploadFile({
      fileContent: fileBuffer,
      fileName: storageFileName,
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
      fileName: displayFileName, // 返回格式化的文件名
      fileSize: file.size,
      fileType: getFileCategory(file.type),
      mimeType: file.type,
    });
  } catch (error) {
    console.error('任务产出上传错误:', error);
    return ApiErrors.validation('文件上传失败，请重试');
  }
}
