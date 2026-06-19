/**
 * 编码助手自省模块 - 统一导出
 * 
 * 此模块为编码助手（即项目开发AI）提供自省能力，
 * 复用银蛇博士/蜡象助手的 ReflectionStore 和 LearningStats 基础设施。
 */

export {
  CODER_AGENT_TYPE,
  CODER_ERROR_TYPES,
  CODER_CONTEXT_TAGS,
  recordCoderReflection,
  getCoderReflectionSummary,
  inferErrorType,
  inferContextTag,
} from './engine';

export type {
  CoderErrorType,
  CoderReflection,
} from './engine';
