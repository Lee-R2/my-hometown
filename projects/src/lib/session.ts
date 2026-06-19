/**
 * 会话管理
 * 管理用户会话、令牌、CSRF 令牌等
 */

import { generateToken, verifyToken, generateCSRFToken, verifyCSRFToken } from './security';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

// ========== 会话配置 ==========

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7天

// ========== 会话接口 ==========

export interface Session {
  userId: string;
  role: string;
  schoolId?: string;
  token: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

// ========== 会话管理 ==========

/**
 * 创建会话
 */
export async function createSession(
  userId: string,
  role: string,
  schoolId?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<Session> {
  const token = generateToken(userId, role, schoolId);
  const csrfToken = generateCSRFToken();

  const session: Session = {
    userId,
    role,
    schoolId,
    token,
    csrfToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE,
    ipAddress,
    userAgent,
  };

  const client = getSupabaseAdminClient();
  const { error: insertError } = await client.from('user_sessions').insert({
    user_id: userId,
    token,
    csrf_token: csrfToken,
    ip_address: ipAddress,
    user_agent: userAgent,
    expires_at: new Date(session.expiresAt).toISOString(),
    created_at: new Date(session.createdAt).toISOString(),
  });

  if (insertError) {
    console.error('会话写入数据库失败:', {
      error: insertError,
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
      userId,
    });
    throw new Error(`会话写入失败: ${insertError.message}`);
  }

  return session;
}

/**
 * 验证会话
 */
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const payload = verifyToken(token);
    if (!payload) return null;

    const client = getSupabaseAdminClient();
    const { data: sessionData, error } = await client
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('会话查询失败:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }

    if (!sessionData) {
      return null;
    }

    if (new Date(sessionData.expires_at) < new Date()) {
      await invalidateSession(token);
      return null;
    }

    return {
      userId: payload.userId,
      role: payload.role,
      schoolId: payload.schoolId,
      token: sessionData.token,
      csrfToken: sessionData.csrf_token,
      createdAt: new Date(sessionData.created_at).getTime(),
      expiresAt: new Date(sessionData.expires_at).getTime(),
      ipAddress: sessionData.ip_address,
      userAgent: sessionData.user_agent,
    };
  } catch (error) {
    console.error('会话验证错误:', error);
    return null;
  }
}

/**
 * 刷新会话
 */
export async function refreshSession(oldToken: string): Promise<Session | null> {
  try {
    // 验证旧令牌
    const session = await verifySession(oldToken);
    if (!session) return null;

    // 创建新会话
    const newSession = await createSession(
      session.userId,
      session.role,
      session.schoolId,
      session.ipAddress,
      session.userAgent
    );

    // 使旧会话失效
    await invalidateSession(oldToken);

    return newSession;
  } catch (error) {
    console.error('会话刷新错误:', error);
    return null;
  }
}

/**
 * 使会话失效
 */
export async function invalidateSession(token: string): Promise<void> {
  try {
    const client = getSupabaseAdminClient();
    const { error } = await client
      .from('user_sessions')
      .update({ is_active: false })
      .eq('token', token);

    if (error) {
      console.error('会话失效操作失败:', error.message);
    }
  } catch (error) {
    console.error('会话失效错误:', error);
  }
}

/**
 * 使用户的所有会话失效
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  try {
    const client = getSupabaseAdminClient();
    const { error } = await client
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) {
      console.error('用户所有会话失效操作失败:', error.message);
    }
  } catch (error) {
    console.error('用户所有会话失效错误:', error);
  }
}

/**
 * 清理过期会话
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const client = getSupabaseAdminClient();
    const { data, error } = await client
      .from('user_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('清理过期会话错误:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('清理过期会话错误:', error);
    return 0;
  }
}

/**
 * 获取用户的所有活跃会话
 */
export async function getUserActiveSessions(userId: string): Promise<Session[]> {
  try {
    const client = getSupabaseAdminClient();
    const { data, error } = await client
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((item) => ({
      userId: userId,
      role: '', // 需要从令牌中获取
      token: item.token,
      csrfToken: item.csrf_token,
      createdAt: new Date(item.created_at).getTime(),
      expiresAt: new Date(item.expires_at).getTime(),
      ipAddress: item.ip_address,
      userAgent: item.user_agent,
    }));
  } catch (error) {
    console.error('获取用户活跃会话错误:', error);
    return [];
  }
}

// ========== Cookie 辅助函数 ==========

/**
 * 设置会话 Cookie
 */
export function setSessionCookie(token: string, response?: Response): void {
  // 生产环境启用 Secure 标志，本地开发(http)不启用否则浏览器不接受
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=${SESSION_MAX_AGE / 1000}`;

  if (response) {
    // 在服务端设置
    response.headers.set('Set-Cookie', cookie);
  } else {
    // 在客户端设置
    document.cookie = cookie;
  }
}

