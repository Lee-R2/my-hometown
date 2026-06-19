import { NextResponse } from 'next/server';

/**
 * 统一 API 错误处理工具
 * 
 * 解决的问题：
 * 1. 错误消息无区分度 — 统一用"操作失败"
 * 2. HTTP状态码滥用 — 所有catch都返回500
 * 3. 错误信息泄露/过度隐藏 — 缺乏安全序列化
 * 4. 缺少结构化错误码 — 前端无法做差异化处理
 * 5. Supabase 错误未分类 — 不区分404/409/403
 */

// ===== 错误码定义 =====
export type ErrorCode =
  | 'NOT_FOUND'           // 资源不存在
  | 'CONFLICT'            // 唯一约束冲突/数据冲突
  | 'FORBIDDEN'           // 权限不足（RLS/角色限制）
  | 'UNAUTHORIZED'        // 未认证
  | 'VALIDATION_ERROR'    // 请求参数校验失败
  | 'RATE_LIMITED'        // 频率限制
  | 'DB_ERROR'            // 数据库操作失败
  | 'EXTERNAL_ERROR'      // 外部服务调用失败（AI/TTS等）
  | 'INTERNAL';           // 未知内部错误

// ===== 结构化错误对象 =====
export interface ApiError {
  code: ErrorCode;
  message: string;        // 用户可读消息
  detail?: string;        // 调试信息（仅开发环境返回）
  retryable: boolean;     // 是否可重试
}

// ===== HTTP 状态码映射 =====
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  DB_ERROR: 500,
  EXTERNAL_ERROR: 502,
  INTERNAL: 500,
};

// ===== Supabase 错误码映射 =====
// 参考：https://www.postgresql.org/docs/current/errcodes-appendix.html
const SUPABASE_CODE_MAP: Record<string, { code: ErrorCode; message: string }> = {
  // 唯一约束冲突
  '23505': { code: 'CONFLICT', message: '该数据已存在，请检查是否有重复' },
  // 外键约束冲突
  '23503': { code: 'VALIDATION_ERROR', message: '关联数据不存在，请检查引用关系' },
  // 非空约束
  '23502': { code: 'VALIDATION_ERROR', message: '必填字段不能为空' },
  // 检查约束
  '23514': { code: 'VALIDATION_ERROR', message: '数据不符合约束条件' },
  // RLS 权限不足
  '42501': { code: 'FORBIDDEN', message: '没有操作权限' },
  // PostgREST 记录不存在
  'PGRST116': { code: 'NOT_FOUND', message: '记录不存在' },
  // PostgREST 多条记录
  'PGRST101': { code: 'VALIDATION_ERROR', message: '查询到多条记录，请使用更精确的条件' },
};

/**
 * 分类 Supabase 错误
 * 将 Supabase/PostgreSQL 错误码映射为结构化 ApiError
 */
export function classifySupabaseError(error: any, fallbackMessage?: string): ApiError {
  const code = error?.code || error?.details?.code;
  
  if (code && SUPABASE_CODE_MAP[code]) {
    const mapped = SUPABASE_CODE_MAP[code];
    return {
      code: mapped.code,
      message: mapped.message,
      detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
      retryable: false,
    };
  }

  // RLS 错误通常表现为空结果集而非报错，但有时也会直接报错
  if (error?.message?.includes('row-level security') || error?.message?.includes('policy')) {
    return {
      code: 'FORBIDDEN',
      message: '没有操作权限',
      detail: process.env.NODE_ENV === 'development' ? String(error?.message) : undefined,
      retryable: false,
    };
  }

  // 网络相关错误
  if (error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('timeout')) {
    return {
      code: 'DB_ERROR',
      message: '数据库连接异常，请稍后重试',
      detail: process.env.NODE_ENV === 'development' ? String(error?.message) : undefined,
      retryable: true,
    };
  }

  // 通用数据库错误
  return {
    code: 'DB_ERROR',
    message: fallbackMessage || '数据库操作失败，请稍后重试',
    detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined,
    retryable: true,
  };
}

/**
 * 分类通用错误
 * 将任意 catch 到的 error 分类为结构化 ApiError
 */
export function classifyError(error: unknown, fallbackMessage?: string): ApiError {
  // 已经是 ApiError
  if (isApiError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  // JSON 解析错误
  if (message.includes('JSON') || message.includes('json')) {
    return {
      code: 'VALIDATION_ERROR',
      message: '请求数据格式错误',
      detail: process.env.NODE_ENV === 'development' ? message : undefined,
      retryable: false,
    };
  }

  // 网络错误
  if (message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED') || message.includes('timeout')) {
    return {
      code: 'DB_ERROR',
      message: '服务连接异常，请稍后重试',
      detail: process.env.NODE_ENV === 'development' ? message : undefined,
      retryable: true,
    };
  }

  // 未知错误
  return {
    code: 'INTERNAL',
    message: fallbackMessage || '操作失败，请稍后重试',
    detail: process.env.NODE_ENV === 'development' ? message : undefined,
    retryable: true,
  };
}

function isApiError(obj: unknown): obj is ApiError {
  return typeof obj === 'object' && obj !== null && 'code' in obj && 'message' in obj && 'retryable' in obj;
}

/**
 * 构建错误响应
 * 将 ApiError 转为 NextResponse，自动设置正确的 HTTP 状态码
 */
export function errorResponse(apiError: ApiError): NextResponse {
  const status = ERROR_STATUS_MAP[apiError.code] || 500;
  
  const body: Record<string, any> = {
    error: apiError.message,
    code: apiError.code,
    retryable: apiError.retryable,
  };

  if (apiError.detail) {
    body.detail = apiError.detail;
  }

  return NextResponse.json(body, { status });
}

/**
 * 便捷函数：从 Supabase 错误直接构建响应
 * 
 * 用法：
 *   if (error) return supabaseErrorResponse(error, '创建学校失败');
 */
export function supabaseErrorResponse(error: any, fallbackMessage?: string): NextResponse {
  const apiError = classifySupabaseError(error, fallbackMessage);
  return errorResponse(apiError);
}

/**
 * 便捷函数：从 catch error 直接构建响应
 * 
 * 用法：
 *   catch (error) {
 *     console.error('xxx失败:', error);
 *     return catchErrorResponse(error, '创建学校失败');
 *   }
 */
export function catchErrorResponse(error: unknown, fallbackMessage?: string): NextResponse {
  const apiError = classifyError(error, fallbackMessage);
  return errorResponse(apiError);
}

/**
 * 便捷函数：快速构建特定类型错误响应
 */
export const ApiErrors = {
  notFound: (message = '资源不存在'): NextResponse =>
    errorResponse({ code: 'NOT_FOUND', message, retryable: false }),

  conflict: (message = '数据已存在'): NextResponse =>
    errorResponse({ code: 'CONFLICT', message, retryable: false }),

  forbidden: (message = '没有操作权限'): NextResponse =>
    errorResponse({ code: 'FORBIDDEN', message, retryable: false }),

  unauthorized: (message = '请先登录'): NextResponse =>
    errorResponse({ code: 'UNAUTHORIZED', message, retryable: false }),

  validation: (message: string): NextResponse =>
    errorResponse({ code: 'VALIDATION_ERROR', message, retryable: false }),

  rateLimited: (message = '操作过于频繁，请稍后重试'): NextResponse =>
    errorResponse({ code: 'RATE_LIMITED', message, retryable: true }),

  externalError: (message = '外部服务暂时不可用'): NextResponse =>
    errorResponse({ code: 'EXTERNAL_ERROR', message, retryable: true }),
};
