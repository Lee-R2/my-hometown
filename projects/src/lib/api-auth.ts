import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyToken, TokenPayload } from './security';
import { SESSION_COOKIE_NAME, verifySession } from './session';
import { getSupabaseAnonClient } from '@/storage/database/supabase-client';

export interface AuthResult {
  authenticated: boolean;
  payload: TokenPayload | null;
  error?: string;
  status?: number;
}

export interface AuthOptions {
  requiredRoles?: string[];
  allowTeam?: boolean;
  allowParent?: boolean;
}

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    return sessionCookie.value;
  }

  return null;
}

// ========== 会话状态内存缓存 ==========
// 安全:verifySession 每次会查数据库,直接在 authenticateRequest 中调用会显著增加每个 API 的延迟。
// 这里用短期缓存(60秒)在内存中保存 token -> is_active 的结果,平衡安全性与性能:
// - 登出后 60 秒内旧 token 仍可能通过缓存(可接受的窗口)
// - 60 秒后强制重新查库,确保 is_active=false 的会话被拒绝
// - 缓存大小限制为 1000 条,避免内存无限增长
interface SessionCacheEntry {
  valid: boolean;
  checkedAt: number;
}
const SESSION_CACHE_TTL_MS = 60 * 1000;
const SESSION_CACHE_MAX_SIZE = 1000;
const sessionCache = new Map<string, SessionCacheEntry>();

function getCachedSessionValid(token: string): boolean | null {
  const entry = sessionCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.checkedAt > SESSION_CACHE_TTL_MS) {
    sessionCache.delete(token);
    return null;
  }
  return entry.valid;
}

function setCachedSessionValid(token: string, valid: boolean): void {
  // 容量控制:超过上限时清空(简单 LRU 替代)
  if (sessionCache.size >= SESSION_CACHE_MAX_SIZE) {
    sessionCache.clear();
  }
  sessionCache.set(token, { valid, checkedAt: Date.now() });
}

/**
 * 认证请求。
 *
 * 安全流程:
 * 1. 提取 token(Authorization header 或 session cookie)
 * 2. 验证 token 签名与过期时间(verifyToken,本地 HMAC 校验,无 DB 开销)
 * 3. 校验角色权限
 * 4. **校验会话仍处于活跃状态**(verifySession,查 user_sessions 表 is_active=true)
 *    - 带 60 秒内存缓存,避免每个 API 都打 DB
 *    - 登出后最长 60 秒内旧 token 失效
 *
 * 注意:此函数是异步的(verifySession 需查数据库),所有调用方需 await。
 */
export async function authenticateRequest(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<AuthResult> {
  const token = extractToken(request);

  if (!token) {
    return {
      authenticated: false,
      payload: null,
      error: '未提供认证令牌',
      status: 401,
    };
  }

  const payload = verifyToken(token);

  if (!payload) {
    return {
      authenticated: false,
      payload: null,
      error: '认证令牌无效或已过期',
      status: 401,
    };
  }

  if (options.requiredRoles && options.requiredRoles.length > 0) {
    const allowedRoles = [...options.requiredRoles];
    if (options.allowTeam) allowedRoles.push('team');
    if (options.allowParent) allowedRoles.push('parent');

    if (!allowedRoles.includes(payload.role)) {
      return {
        authenticated: false,
        payload: null,
        error: '权限不足',
        status: 403,
      };
    }
  }

  // 安全:校验会话是否仍处于活跃状态(防止登出后 token 仍可用)
  // 先查内存缓存,缓存未命中再查数据库
  const cached = getCachedSessionValid(token);
  if (cached === false) {
    // 缓存明确记录会话已失效
    return {
      authenticated: false,
      payload: null,
      error: '会话已失效,请重新登录',
      status: 401,
    };
  }
  if (cached !== true) {
    // 缓存未命中,查数据库
    const session = await verifySession(token);
    if (!session) {
      setCachedSessionValid(token, false);
      return {
        authenticated: false,
        payload: null,
        error: '会话已失效,请重新登录',
        status: 401,
      };
    }
    setCachedSessionValid(token, true);
  }

  return {
    authenticated: true,
    payload,
  };
}

export function requireAdmin(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin'],
  });
}

export function requireSuperAdmin(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request).then((auth) => {
    if (!auth.authenticated) return auth;
    if (auth.payload!.role !== 'super_admin') {
      return {
        authenticated: false,
        payload: null,
        status: 403,
        error: '需要超级管理员权限',
      };
    }
    return auth;
  });
}

export function requireAdminOrVolunteer(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer'],
  });
}

export function requireAdminOrTeacher(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'teacher'],
  });
}

export function requireTeam(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request, {
    requiredRoles: ['team'],
    allowTeam: true,
  });
}

export function requireParent(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request, {
    requiredRoles: ['parent'],
    allowParent: true,
  });
}

export function requireAnyAuth(request: NextRequest): Promise<AuthResult> {
  return authenticateRequest(request);
}

export function authError(result: AuthResult): NextResponse {
  return NextResponse.json(
    { error: result.error || '认证失败' },
    { status: result.status || 401 }
  );
}

export function safeError(error: unknown): NextResponse {
  console.error('API错误:', error);
  // 生产环境只返回通用消息，开发环境附带调试信息
  const isDev = process.env.NODE_ENV === 'development';
  const body: Record<string, unknown> = { error: '服务器内部错误，请稍后重试' };
  if (isDev) {
    body.detail = error instanceof Error ? error.message : String(error);
  }
  return NextResponse.json(body, { status: 500 });
}

/**
 * 安全修复 VULN-API-015: 构建内部 fetch 调用所需的鉴权头。
 *
 * 在服务端发起内部 fetch（调用同项目其他 /api 路由）时，原始请求的
 * Authorization 头和 Cookie 不会自动透传，会导致内部接口返回 401。
 * 此函数从原始请求中提取这些凭据并返回一个新的 headers 对象，供内部
 * fetch 调用使用，避免凭据丢失引发鉴权失败。
 *
 * 注意：仅返回包含凭据的头，调用方按需合并其他自定义头。
 */
export function buildInternalAuthHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;
  const cookie = request.headers.get('cookie');
  if (cookie) headers['Cookie'] = cookie;
  return headers;
}

/**
 * 安全修复 SEC-001: 获取绑定当前请求用户身份的 Supabase 客户端。
 *
 * 使用 anon key + 用户 token 创建客户端,RLS 策略会对查询/写入生效,
 * 替代默认的 service_role 客户端(绕过所有 RLS)。
 *
 * 使用场景: 普通业务接口(用户/小队/家长/AI 记忆等)的数据库操作。
 * 不适用场景: 系统初始化、数据迁移、admin 跨用户聚合统计 —— 这些应
 *             显式调用 getSupabaseAdminClient()。
 *
 * @param request NextRequest 对象,用于提取 token
 * @param auth 可选的鉴权结果。若调用方已执行 requireXxx,传入可避免重复提取 token
 * @returns 绑定用户身份的 anon 客户端(RLS 生效)。无 token 时返回纯 anon 客户端
 *          (RLS 会拒绝所有私有数据,相当于显式拒绝)
 */
export function getAuthenticatedClient(
  request: NextRequest,
  auth?: AuthResult
): SupabaseClient {
  // 优先从已完成的鉴权结果中复用 token 提取结果(extractToken 是私有函数,
  // 但 auth 已携带 payload,说明 token 已被验证过,这里重新提取以获取原始 token 字符串)
  const token = extractToken(request);
  return getSupabaseAnonClient(token ?? undefined);
}

/**
 * LE-A21 修复: 后端模块级权限校验 helper。
 *
 * 用于在 API 路由中做 defense-in-depth 校验,防止"前端隐藏但后端开放"风险。
 * 与 permissions.ts 中的 DEFAULT_ROLE_CONFIGS 配置保持一致。
 *
 * 使用示例:
 *   const auth = await requireModuleAccess(request, 'rewards', ['write', 'full']);
 *   if (!auth.authenticated) return authError(auth);
 *
 * 注意: 此 helper 是可选的 defense-in-depth 措施。现有的 requireAdmin /
 * requireAdminOrVolunteer 已经提供基于角色的粗粒度访问控制,此函数提供
 * 基于 moduleId 的细粒度校验,供需要严格区分 read/write 权限的路由使用。
 *
 * @param request NextRequest 对象
 * @param moduleId 模块 ID(见 permissions.ts MODULES 列表)
 * @param requiredLevels 需要的权限级别,任一匹配即通过(默认 ['read','write','full'])
 */
export async function requireModuleAccess(
  request: NextRequest,
  moduleId: string,
  requiredLevels: Array<'read' | 'write' | 'full'> = ['read', 'write', 'full']
): Promise<AuthResult> {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return auth;

  const role = auth.payload?.role as 'super_admin' | 'admin' | 'volunteer' | 'teacher' | undefined;
  if (!role) {
    return { authenticated: false, payload: null, error: '无效角色', status: 403 };
  }

  // super_admin / admin 拥有所有模块的 full 权限,直接放行
  if (role === 'super_admin' || role === 'admin') {
    return auth;
  }

  // volunteer / teacher 按 DEFAULT_ROLE_CONFIGS 校验模块权限
  // 此处内联权限表以避免循环依赖;若 permissions.ts 配置变更,需同步更新
  const ROLE_MODULE_PERMISSIONS: Record<string, Record<string, 'none' | 'read' | 'write' | 'full'>> = {
    volunteer: {
      pretest: 'read', tasks: 'read', 'final-tasks': 'read', teams: 'write',
      submissions: 'write', schools: 'read', volunteers: 'none', tools: 'read',
      skills: 'read', messages: 'write', rewards: 'read', feedback: 'full',
      blackboard: 'write', market: 'read', settings: 'none',
      'follow-verifies': 'write',
    },
    teacher: {
      pretest: 'read', tasks: 'read', 'final-tasks': 'none', teams: 'read',
      submissions: 'read', schools: 'write', volunteers: 'read', tools: 'read',
      skills: 'read', messages: 'read', rewards: 'none', feedback: 'none',
      blackboard: 'read', market: 'read', settings: 'none',
      'follow-verifies': 'write',
    },
  };

  const rolePerms = ROLE_MODULE_PERMISSIONS[role];
  if (!rolePerms) {
    return { authenticated: false, payload: null, error: '未知角色', status: 403 };
  }

  const level = rolePerms[moduleId];
  if (!level || level === 'none') {
    return { authenticated: false, payload: null, error: '无权访问该模块', status: 403 };
  }

  if (!requiredLevels.includes(level)) {
    return { authenticated: false, payload: null, error: '权限不足', status: 403 };
  }

  return auth;
}
