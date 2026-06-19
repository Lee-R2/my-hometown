/**
 * 自我改进技能 — 导出入口
 * 
 * 核心模块：
 * 1. reflection-engine — 对话内自省引擎（替代 OpenClaw Hook）
 * 2. learning-stats — 学习统计分析（高频错误/学习曲线/知识缺口）
 * 3. reflection-store — Supabase 持久化存储
 */

export { 
  detectReflectionTriggers, 
  buildReflectionPrompt, 
  parseReflectionMarks, 
  type ReflectionTrigger, 
  type ReflectionEntry, 
  type LearningCategory, 
  type LearningArea, 
  type LearningStatus,
} from './reflection-engine';

export {
  getErrorTypeStatsSQL,
  getAreaStatsSQL,
  getWeeklyTrendSQL,
  getKnowledgeGapsSQL,
  generateStatsSummary,
  formatErrorTypeChartData,
  formatWeeklyTrendChartData,
  formatAreaProgressChartData,
  type ErrorTypeStat,
  type AreaStat,
  type WeeklyTrend,
  type KnowledgeGap,
  type ImprovementProgress,
  type StatsReportConfig,
} from './learning-stats';

export {
  ensureReflectionTable,
  saveReflection,
  saveReflections,
  getReflections,
  updateReflectionStatus,
  resolveByPattern,
  executeStatsQuery,
} from './reflection-store';
