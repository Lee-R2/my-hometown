import { toast } from 'sonner';

/**
 * API 错误码到用户友好消息的映射
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  NOT_FOUND: '请求的资源不存在',
  CONFLICT: '数据已存在，请检查是否有重复',
  FORBIDDEN: '没有操作权限',
  UNAUTHORIZED: '请先登录',
  VALIDATION_ERROR: '请求参数有误，请检查后重试',
  RATE_LIMITED: '操作过于频繁，请稍后重试',
  DB_ERROR: '数据库操作失败，请稍后重试',
  EXTERNAL_ERROR: '外部服务暂时不可用，请稍后重试',
  INTERNAL: '服务器内部错误，请稍后重试',
};

/**
 * API 响应类型（与后端 @/lib/api-error 的 errorResponse 格式一致）
 */
export interface ApiErrorResponse {
  error: string;       // 用户可读消息
  code?: string;       // 错误码
  retryable?: boolean; // 是否可重试
  detail?: string;     // 调试信息（仅开发环境）
}

/**
 * API 响应类型（成功）
 */
export interface ApiSuccessResponse {
  success?: boolean;
  [key: string]: unknown;
}

/**
 * 判断是否为 API 错误响应
 */
function isApiErrorResponse(data: unknown): data is ApiErrorResponse {
  return typeof data === 'object' && data !== null && 'error' in data;
}

/**
 * 根据错误码获取用户友好的错误消息
 */
export function getErrorMessage(data: ApiErrorResponse, fallback?: string): string {
  if (data.code && ERROR_CODE_MESSAGES[data.code]) {
    return data.error || ERROR_CODE_MESSAGES[data.code];
  }
  return data.error || fallback || '操作失败';
}

/**
 * 显示 API 错误提示
 * 根据错误码差异化展示不同类型的 toast
 */
export function showApiError(data: ApiErrorResponse, fallback?: string): void {
  const message = getErrorMessage(data, fallback);
  const code = data.code;

  // 根据错误码选择不同的 toast 类型
  if (code === 'UNAUTHORIZED') {
    toast.error(message, { description: '请重新登录' });
  } else if (code === 'FORBIDDEN') {
    toast.warning(message);
  } else if (code === 'RATE_LIMITED') {
    toast.warning(message, { description: data.retryable ? '请稍后重试' : undefined });
  } else if (code === 'VALIDATION_ERROR') {
    toast.warning(message);
  } else if (code === 'NOT_FOUND') {
    toast.error(message);
  } else if (data.retryable) {
    toast.error(message, { description: '可以稍后重试' });
  } else {
    toast.error(message);
  }
}

/**
 * 统一的 fetch 封装
 * 自动解析错误响应并可选显示 toast
 */
export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit & {
    /** 出错时是否自动显示 toast，默认 true */
    showErrorToast?: boolean;
    /** 错误时的回退消息 */
    fallbackErrorMessage?: string;
  }
): Promise<{ data: T | null; error: ApiErrorResponse | null; ok: boolean }> {
  const { showErrorToast = true, fallbackErrorMessage, ...fetchOptions } = options || {};

  try {
    const response = await fetch(url, fetchOptions);
    const json = await response.json();

    if (!response.ok || isApiErrorResponse(json)) {
      if (isApiErrorResponse(json)) {
        if (showErrorToast) {
          showApiError(json, fallbackErrorMessage);
        }
        return { data: null, error: json, ok: false };
      }

      // 兼容旧格式 { error: '...' }（无 code 字段）
      if (typeof json.error === 'string') {
        const err: ApiErrorResponse = { error: json.error, code: 'INTERNAL' };
        if (showErrorToast) {
          showApiError(err, fallbackErrorMessage);
        }
        return { data: null, error: err, ok: false };
      }

      // 兼容旧格式 { success: false, message: '...' }
      if (json.success === false && json.message) {
        const err: ApiErrorResponse = { error: json.message, code: 'INTERNAL' };
        if (showErrorToast) {
          showApiError(err, fallbackErrorMessage);
        }
        return { data: null, error: err, ok: false };
      }

      // 未知错误格式
      const err: ApiErrorResponse = {
        error: fallbackErrorMessage || '操作失败',
        code: 'INTERNAL',
      };
      if (showErrorToast) {
        toast.error(err.error);
      }
      return { data: null, error: err, ok: false };
    }

    return { data: json as T, error: null, ok: true };
  } catch (error) {
    const err: ApiErrorResponse = {
      error: fallbackErrorMessage || '网络连接异常，请检查网络后重试',
      code: 'INTERNAL',
      retryable: true,
    };
    if (showErrorToast) {
      toast.error(err.error);
    }
    return { data: null, error: err, ok: false };
  }
}
