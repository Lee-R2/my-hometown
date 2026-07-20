import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 安全 JSON 解析。
 * 安全修复 LE-F03: localStorage/sessionStorage 数据可能因版本升级、手动篡改、
 * 存储 quota 溢出等原因损坏,直接 JSON.parse 会抛错导致 React 组件白屏。
 * 此函数解析失败时返回 fallback,保证 UI 不崩。
 *
 * @param text 待解析的字符串(可能为 null/undefined/非 JSON)
 * @param fallback 解析失败时的返回值,默认为 null
 */
export function safeJSONParse<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string' || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * 从 localStorage 读取并安全解析 JSON。
 * 安全修复 LE-F03: 封装 localStorage.getItem + JSON.parse 的常见组合,
 * 任何环节失败(key 不存在、存储不可用、JSON 损坏)都返回 fallback,不抛错。
 *
 * @param key localStorage 键名
 * @param fallback 解析失败或键不存在时的返回值
 */
export function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return safeJSONParse(raw, fallback);
  } catch {
    // localStorage 本身可能在隐私模式下不可用
    return fallback;
  }
}

/**
 * 从 sessionStorage 读取并安全解析 JSON。
 * 用途同 safeGetJSON,针对 sessionStorage。
 */
export function safeGetSessionJSON<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return safeJSONParse(raw, fallback);
  } catch {
    return fallback;
  }
}

