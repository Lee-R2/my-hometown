import { createClient, SupabaseClient } from '@supabase/supabase-js';

let envLoaded = false;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * 加载环境变量。
 *
 * 优先级：
 * 1. 已存在的 process.env（Vercel/Docker 等平台已注入）
 * 2. 本地 .env 文件（通过 dotenv 加载）
 * 3. Coze 平台的 Python workload identity（仅本地开发兜底）
 *
 * 注意：execSync + python3 的 Coze 兜底逻辑仅在非构建环境执行，
 * 避免 Vercel 构建时因缺少 python3 / coze_workload_identity 而失败。
 */
function loadEnv(): void {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    return;
  }

  try {
    // 尝试 dotenv 加载 .env 文件
    try {
      require('dotenv').config();
      if (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    // 仅在非构建环境尝试 Coze Python 注入（Vercel 构建环境无 python3）
    const isBuildPhase = !process.env.COZE_SUPABASE_URL && (
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.CI === 'true' ||
      process.env.VERCEL === '1'
    );
    if (isBuildPhase) {
      return;
    }

    const { execSync } = require('child_process');
    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

function getSupabaseCredentials(): SupabaseCredentials {
  loadEnv();

  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;
  const serviceRoleKey =
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    undefined;

  if (!url) {
    throw new Error('COZE_SUPABASE_URL is not set');
  }
  if (!anonKey) {
    throw new Error('COZE_SUPABASE_ANON_KEY is not set');
  }

  return { url, anonKey, serviceRoleKey };
}

// ========== 单例客户端缓存 ==========
// 避免每次 API 调用都 createClient，复用 HTTP keep-alive 连接
let adminClientSingleton: SupabaseClient | null = null;
let anonClientSingleton: SupabaseClient | null = null;
const tokenClientCache = new Map<string, SupabaseClient>();

function getSupabaseClient(token?: string): SupabaseClient {
  return getSupabaseAdminClient(token);
}

function getSupabaseAnonClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  // 无 token 时复用单例
  if (!token) {
    if (!anonClientSingleton) {
      anonClientSingleton = createClient(url, anonKey, {
        db: { timeout: 60000 },
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return anonClientSingleton;
  }

  // 有 token 时按 token 缓存（避免内存泄漏，限制缓存大小）
  if (tokenClientCache.size > 50) {
    tokenClientCache.clear();
  }
  const cacheKey = `anon:${token}`;
  let client = tokenClientCache.get(cacheKey);
  if (!client) {
    client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      db: { timeout: 60000 },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    tokenClientCache.set(cacheKey, client);
  }
  return client;
}

function getSupabaseAdminClient(token?: string): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseCredentials();

  if (!serviceRoleKey) {
    console.warn('SERVICE_ROLE_KEY 未配置，回退到 anon key 客户端（可能受 RLS 限制）');
    return getSupabaseAnonClient(token);
  }

  // 无 token 时复用单例（绝大多数 API 调用走这里）
  if (!token) {
    if (!adminClientSingleton) {
      adminClientSingleton = createClient(url, serviceRoleKey, {
        db: { timeout: 60000 },
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return adminClientSingleton;
  }

  // 有 token 时按 token 缓存
  if (tokenClientCache.size > 50) {
    tokenClientCache.clear();
  }
  const cacheKey = `admin:${token}`;
  let client = tokenClientCache.get(cacheKey);
  if (!client) {
    client = createClient(url, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      db: { timeout: 60000 },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    tokenClientCache.set(cacheKey, client);
  }
  return client;
}

export { loadEnv, getSupabaseCredentials, getSupabaseClient, getSupabaseAdminClient, getSupabaseAnonClient };
