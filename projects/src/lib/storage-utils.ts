/**
 * 文件存储工具 - 使用 Supabase Storage
 * 替代 S3Storage，无需额外配置 S3/TOS 服务
 */

import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

const BUCKET_NAME = 'uploads';

/**
 * 确保 storage bucket 存在（需要 service role 权限）
 */
export async function ensureBucket(): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  // 检查 bucket 是否存在
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 100 * 1024 * 1024, // 100MB
    });
    if (error) {
      console.error('[storage] 创建 bucket 失败:', error.message);
      return false;
    }
  }

  return true;
}

/**
 * 上传文件到 Supabase Storage（使用 admin client 确保有写入权限）
 */
export async function uploadFile(options: {
  fileContent: Buffer;
  fileName: string;
  contentType?: string;
}): Promise<string> {
  const supabase = getSupabaseAdminClient();

  await ensureBucket();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(options.fileName, options.fileContent, {
      contentType: options.contentType || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    throw new Error(`文件上传失败: ${error.message}`);
  }

  return data.path;
}

/**
 * 生成签名 URL（用于读取文件）
 */
export async function generateSignedUrl(options: {
  key: string;
  expireTime?: number; // 秒，默认 1 小时
}): Promise<string> {
  const supabase = getSupabaseAdminClient();

  const expireSeconds = options.expireTime || 3600;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(options.key, expireSeconds);

  if (error) {
    throw new Error(`生成签名URL失败: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * 批量生成签名 URL
 */
export async function generateSignedUrls(options: {
  keys: string[];
  expireTime?: number;
}): Promise<string[]> {
  const supabase = getSupabaseAdminClient();

  const expireSeconds = options.expireTime || 3600;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrls(options.keys, expireSeconds);

  if (error) {
    throw new Error(`批量生成签名URL失败: ${error.message}`);
  }

  return data?.map((d: { signedUrl: string }) => d.signedUrl) || [];
}

/**
 * 删除文件
 */
export async function deleteFile(options: {
  key: string;
}): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([options.key]);

  if (error) {
    throw new Error(`删除文件失败: ${error.message}`);
  }

  return true;
}

/**
 * 读取文件
 */
export async function readFile(options: {
  key: string;
}): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(options.key);

  if (error) {
    throw new Error(`读取文件失败: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * 检查文件是否存在
 */
export async function fileExists(options: {
  key: string;
}): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list('', { search: options.key });

  if (error) return false;
  return data.length > 0;
}

/**
 * 列出文件
 */
export async function listFiles(options?: {
  prefix?: string;
  maxKeys?: number;
}): Promise<{ keys: string[] }> {
  const supabase = getSupabaseAdminClient();

  const path = options?.prefix || '';
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(path, { limit: options?.maxKeys || 1000 });

  if (error) {
    throw new Error(`列出文件失败: ${error.message}`);
  }

  return {
    keys: data?.map(f => path ? `${path}/${f.name}` : f.name) || [],
  };
}

/**
 * 兼容 S3Storage 接口的适配器
 * 用于最小化改动替换 S3Storage
 */
export const storageAdapter = {
  uploadFile,
  generatePresignedUrl: generateSignedUrl,
  readFile,
  deleteFile,
  fileExists,
  listFiles,
};
