/**
 * AI 配置集中管理
 * 统一管理所有 AI 相关的 API 密钥、基础 URL 等配置
 * 避免在多个文件中重复相同的回退链
 */

/** AI API 密钥（统一回退链） */
export const AI_API_KEY =
  process.env.COZE_WORKLOAD_IDENTITY_API_KEY ||
  process.env.AGENT_LAXIANG_ZHUSHOU_API_KEY ||
  process.env.AGENT_YINSHE_BOSHI_API_KEY ||
  '';

/** Coze 集成基础 URL */
export const AI_BASE_URL =
  process.env.COZE_INTEGRATION_BASE_URL ||
  process.env.COZE_BASE_URL ||
  'https://api.coze.cn';

/** 模型 API 基础 URL（火山引擎 Ark） */
export const AI_MODEL_BASE_URL =
  process.env.COZE_INTEGRATION_MODEL_BASE_URL ||
  process.env.COZE_MODEL_BASE_URL ||
  'https://ark.cn-beijing.volces.com/api/v3';
