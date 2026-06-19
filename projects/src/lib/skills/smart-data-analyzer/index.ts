/**
 * 智能数据分析技能 - 统一入口
 * 整合 SQL 安全过滤、NL2SQL Prompt、图表输出、数据清洗四大模块
 * 供银蛇博士和蜡象助手的 API 路由调用
 */

export { validateSqlSafety, addSafeLimit, validateTableAccess, injectRowLevelSecurity, enforceDataScope } from './sql-safety-filter';
export type { DataScope, SqlValidationResult } from './sql-safety-filter';
export { buildNL2SQLPrompt, buildNL2SQLPromptLegacy, buildSQLErrorFixPrompt, DATABASE_SCHEMA_OVERVIEW, NL2SQL_SYSTEM_PROMPT } from './nl2sql-prompt';
export type { RoleDataScope } from './nl2sql-prompt';
export { buildChartConfig, inferChartType, generateDataSummary } from './chart-builder';
export type { ChartConfig, ChartType } from './chart-builder';
export { cleanUserInput, extractQueryKeywords, preprocessQueryResult, generateDataQualityHints } from './data-cleaner';
