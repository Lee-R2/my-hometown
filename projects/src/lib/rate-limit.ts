/**
 * 访问限制
 * 提供频率限制、IP 白名单、黑名单等功能
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';

// ========== 频率限制配置 ==========

export interface RateLimitConfig {
  windowMs: number; // 时间窗口（毫秒）
  maxRequests: number; // 最大请求数
  message?: string; // 限制消息
}

// 默认限制配置
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // 登录：每15分钟最多5次
  login: { windowMs: 15 * 60 * 1000, maxRequests: 5, message: '登录尝试过于频繁，请15分钟后再试' },
  // API：每分钟最多60次
  api: { windowMs: 60 * 1000, maxRequests: 60, message: '请求过于频繁，请稍后再试' },
  // 上传：每小时最多20次
  upload: { windowMs: 60 * 60 * 1000, maxRequests: 20, message: '上传过于频繁，请稍后再试' },
  // 敏感操作：每天最多10次
  sensitive: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 10, message: '操作过于频繁，请明天再试' },
  // 一般页面：每分钟最多100次
  general: { windowMs: 60 * 1000, maxRequests: 100, message: '访问过于频繁，请稍后再试' },
  // AI 接口速率限制（按成本分级）
  // AI 对话：每分钟最多10次（高频，中等成本）
  ai_chat: { windowMs: 60 * 1000, maxRequests: 10, message: 'AI对话请求过于频繁，请1分钟后再试' },
  // AI 语音合成：每小时最多20次（中频，高成本）
  ai_tts: { windowMs: 60 * 60 * 1000, maxRequests: 20, message: '语音合成请求过于频繁，请稍后再试' },
  // AI 语音识别：每小时最多20次（中频，高成本）
  ai_asr: { windowMs: 60 * 60 * 1000, maxRequests: 20, message: '语音识别请求过于频繁，请稍后再试' },
  // AI 图片生成：每天最多10次（低频，极高成本）
  ai_image: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 10, message: '图片生成次数已达每日上限，请明天再试' },
  // AI 视频生成：每天最多3次（低频，极高成本）
  ai_video: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 3, message: '视频生成次数已达每日上限，请明天再试' },
  // AI 审核提交：每小时最多15次（中频，中等成本）
  ai_review: { windowMs: 60 * 60 * 1000, maxRequests: 15, message: 'AI审核请求过于频繁，请稍后再试' },
  // AI 主题创建：每天最多5次（低频，中等成本）
  ai_create_theme: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 5, message: '主题创建次数已达每日上限，请明天再试' },
  // AI 墨水井阅读：每小时最多10次（低频，中等成本）
  ai_inkwell: { windowMs: 60 * 60 * 1000, maxRequests: 10, message: '阅读分析请求过于频繁，请稍后再试' },
};

// ========== 频率限制结果 ==========

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  message?: string;
}

// ========== 获取客户端 IP ==========

/**
 * 获取客户端 IP 地址
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return '0.0.0.0';
}

// ========== 频率限制 ==========

/**
 * 检查频率限制
 * @param identifier 标识符（IP地址、用户ID等）
 * @param type 限制类型
 */
export async function checkRateLimit(
  identifier: string,
  type: string
): Promise<RateLimitResult> {
  const config = DEFAULT_RATE_LIMITS[type] || DEFAULT_RATE_LIMITS.general;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    const client = getSupabaseClient();

    // 获取该标识符在时间窗口内的请求记录
    const { data: existing, error } = await client
      .from('rate_limit_records')
      .select('*')
      .eq('identifier', identifier)
      .eq('type', type)
      .gte('timestamp', new Date(windowStart).toISOString())
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('频率限制检查错误:', error);
      return { allowed: true, remaining: config.maxRequests, resetTime: now + config.windowMs };
    }

    const requestCount = existing?.length || 0;
    const remaining = Math.max(0, config.maxRequests - requestCount);
    const allowed = requestCount < config.maxRequests;

    // 如果允许，记录此次请求
    if (allowed) {
      await client.from('rate_limit_records').insert({
        identifier,
        type,
        timestamp: new Date().toISOString(),
      });
    }

    // 返回结果
    return {
      allowed,
      remaining,
      resetTime: windowStart + config.windowMs,
      message: allowed ? undefined : config.message,
    };
  } catch (error) {
    console.error('频率限制检查错误:', error);
    // 出错时默认允许，避免影响正常访问
    return { allowed: true, remaining: config.maxRequests, resetTime: now + config.windowMs };
  }
}

/**
 * AI 接口速率限制辅助函数
 * 从请求中提取用户ID（优先）或IP作为标识符，检查频率限制
 * @param request NextRequest 对象
 * @param userId 已认证的用户ID（优先使用）
 * @param type 速率限制类型（如 'ai_chat', 'ai_tts' 等）
 * @returns 限制结果，allowed 为 false 时应直接返回 429 响应
 */
export async function checkAiRateLimit(
  request: NextRequest,
  userId: string | undefined,
  type: string
): Promise<RateLimitResult> {
  // 优先使用用户ID，其次使用IP
  const identifier = userId || getClientIP(request);
  return checkRateLimit(identifier, type);
}

/**
 * 重置频率限制
 */
export async function resetRateLimit(identifier: string, type: string): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client
      .from('rate_limit_records')
      .delete()
      .eq('identifier', identifier)
      .eq('type', type);
  } catch (error) {
    console.error('重置频率限制错误:', error);
  }
}

/**
 * 清理过期的频率限制记录
 */
export async function cleanupExpiredRateLimitRecords(): Promise<number> {
  try {
    const client = getSupabaseClient();
    const oldestWindow = Math.max(
      ...Object.values(DEFAULT_RATE_LIMITS).map(c => c.windowMs)
    );
    const cutoff = new Date(Date.now() - oldestWindow).toISOString();

    const { data, error } = await client
      .from('rate_limit_records')
      .delete()
      .lt('timestamp', cutoff)
      .select('id');

    if (error) {
      console.error('清理过期频率限制记录错误:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('清理过期频率限制记录错误:', error);
    return 0;
  }
}

// ========== IP 白名单和黑名单 ==========

/**
 * 检查 IP 是否在白名单中
 */
export async function isIPWhitelisted(ip: string): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('ip_whitelist')
      .select('id')
      .eq('ip_address', ip)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('IP 白名单检查错误:', error);
    return false;
  }
}

/**
 * 检查 IP 是否在黑名单中
 */
export async function isIPBlacklisted(ip: string): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('ip_blacklist')
      .select('id')
      .eq('ip_address', ip)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('IP 黑名单检查错误:', error);
    return false;
  }
}

/**
 * 添加 IP 到白名单
 */
export async function addIPToWhitelist(
  ip: string,
  note?: string,
  addedBy?: string
): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.from('ip_whitelist').insert({
      ip_address: ip,
      note,
      added_by: addedBy,
      is_active: true,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('添加 IP 到白名单错误:', error);
    throw error;
  }
}

/**
 * 添加 IP 到黑名单
 */
export async function addIPToBlacklist(
  ip: string,
  reason?: string,
  addedBy?: string,
  expiryAt?: Date
): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.from('ip_blacklist').insert({
      ip_address: ip,
      reason,
      added_by: addedBy,
      expiry_at: expiryAt?.toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('添加 IP 到黑名单错误:', error);
    throw error;
  }
}

/**
 * 从白名单中移除 IP
 */
export async function removeIPFromWhitelist(ip: string): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client
      .from('ip_whitelist')
      .update({ is_active: false })
      .eq('ip_address', ip);
  } catch (error) {
    console.error('从白名单移除 IP 错误:', error);
    throw error;
  }
}

/**
 * 从黑名单中移除 IP
 */
export async function removeIPFromBlacklist(ip: string): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client
      .from('ip_blacklist')
      .update({ is_active: false })
      .eq('ip_address', ip);
  } catch (error) {
    console.error('从黑名单移除 IP 错误:', error);
    throw error;
  }
}

// ========== 请求日志 ==========

/**
 * 记录请求日志
 */
export async function logRequest(
  ip: string,
  method: string,
  path: string,
  userAgent?: string,
  userId?: string,
  statusCode?: number,
  duration?: number
): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.from('request_logs').insert({
      ip_address: ip,
      method,
      path,
      user_agent: userAgent,
      user_id: userId,
      status_code: statusCode,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('记录请求日志错误:', error);
  }
}

/**
 * 检测异常访问模式
 */
export async function detectSuspiciousActivity(ip: string): Promise<{
  isSuspicious: boolean;
  reasons: string[];
}> {
  const reasons: string[] = [];
  const isSuspicious = false;

  try {
    const client = getSupabaseClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // 检查短时间内大量请求
    const { data: recentRequests } = await client
      .from('request_logs')
      .select('id')
      .eq('ip_address', ip)
      .gte('timestamp', oneHourAgo);

    if (recentRequests && recentRequests.length > 1000) {
      reasons.push('1小时内请求次数过多');
    }

    // 检查失败率过高
    const { data: failedRequests } = await client
      .from('request_logs')
      .select('id')
      .eq('ip_address', ip)
      .gte('timestamp', oneHourAgo)
      .in('status_code', [400, 401, 403, 404, 500]);

    if (failedRequests && recentRequests && failedRequests.length / recentRequests.length > 0.5) {
      reasons.push('请求失败率过高');
    }

    // 检查访问敏感路径
    const { data: sensitivePaths } = await client
      .from('request_logs')
      .select('path')
      .eq('ip_address', ip)
      .gte('timestamp', oneHourAgo)
      .ilike('path', '%/api/%');

    if (sensitivePaths && sensitivePaths.length > 500) {
      reasons.push('频繁访问 API 路径');
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
    };
  } catch (error) {
    console.error('检测异常活动错误:', error);
    return { isSuspicious: false, reasons: [] };
  }
}
