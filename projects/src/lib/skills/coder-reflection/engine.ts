/**
 * 编码助手自省引擎
 * 
 * 与银蛇博士/蜡象助手的自省不同，编码助手的自省机制是：
 * 1. 跨会话持久化（通过 Supabase agent_reflections 表）
 * 2. 会话初始化时自动加载历史反思
 * 3. 每次出错后主动记录反思
 * 4. 统计分析帮助避免重复犯错
 */

import { saveReflection, getReflections, updateReflectionStatus } from '../self-improving/reflection-store';
import { generateStatsSummary, getErrorTypeStatsSQL, getAreaStatsSQL, getWeeklyTrendSQL, getKnowledgeGapsSQL } from '../self-improving/learning-stats';
import { executeStatsQuery } from '../self-improving/reflection-store';
import type { LearningCategory, LearningArea, ReflectionEntry } from '../self-improving/reflection-engine';

export const CODER_AGENT_TYPE = 'coding-assistant';

/** 编码助手常见的错误类型 */
export const CODER_ERROR_TYPES = {
  // 代码错误
  TYPE_ERROR: 'type_error',                    // TypeScript类型错误
  BUILD_ERROR: 'build_error',                  // 构建失败
  RUNTIME_ERROR: 'runtime_error',              // 运行时错误
  IMPORT_ERROR: 'import_error',                // 导入/依赖错误

  // 逻辑错误
  DATA_MODEL_MISMATCH: 'data_model_mismatch',  // 数据模型不匹配
  API_CONTRACT_ERROR: 'api_contract_error',     // API 接口契约违反
  PERMISSION_ERROR: 'permission_error',         // 权限/行级安全遗漏
  BUSINESS_LOGIC_ERROR: 'business_logic_error', // 业务逻辑错误

  // 流程错误
  REQUIREMENT_MISUNDERSTAND: 'requirement_misunderstand', // 需求误解
  INCOMPLETE_IMPLEMENTATION: 'incomplete_implementation', // 实现不完整
  MISSING_EDGE_CASE: 'missing_edge_case',                 // 遗漏边界情况
  RACE_CONDITION: 'race_condition',                       // 并发/竞态问题

  // 设计错误
  HARDCODED_VALUE: 'hardcoded_value',           // 硬编码值
  MISSING_ERROR_HANDLING: 'missing_error_handling', // 缺少错误处理
  POOR_PERFORMANCE: 'poor_performance',         // 性能问题
  ACCESSIBILITY_ISSUE: 'accessibility_issue',   // 可访问性问题
} as const;

export type CoderErrorType = typeof CODER_ERROR_TYPES[keyof typeof CODER_ERROR_TYPES];

/** 编码助手的上下文标签 */
export const CODER_CONTEXT_TAGS = {
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  DATABASE: 'database',
  API: 'api',
  AUTH: 'auth',
  UI_COMPONENT: 'ui_component',
  DEPLOYMENT: 'deployment',
  INTEGRATION: 'integration',
  STATE_MANAGEMENT: 'state_management',
  RESPONSIVE: 'responsive',
} as const;

export interface CoderReflection {
  errorType: CoderErrorType;
  errorDescription: string;
  cause: string;
  improvementStrategy: string;
  contextTag: string;
  filePath?: string;
  functionName?: string;
}

/**
 * 记录编码助手的自省
 */
export async function recordCoderReflection(reflection: CoderReflection): Promise<void> {
  const entry: Omit<ReflectionEntry, 'id' | 'created_at' | 'resolved_at' | 'occurrence_count'> = {
    agent_id: CODER_AGENT_TYPE,
    user_id: 'system',
    session_id: '',
    category: mapErrorTypeToCategory(reflection.errorType),
    area: mapContextTagToArea(reflection.contextTag),
    priority: 'medium',
    status: 'pending',
    trigger_context: reflection.cause,
    learning: reflection.errorDescription,
    action_item: reflection.improvementStrategy,
  };
  await saveReflection(entry as ReflectionEntry);
}

/**
 * 获取编码助手的历史反思摘要（用于会话初始化）
 */
export async function getCoderReflectionSummary(): Promise<string> {
  try {
    const [errorTypeRows, areaRows, weeklyTrendRows, gapRows] = await Promise.all([
      executeStatsQuery(getErrorTypeStatsSQL(CODER_AGENT_TYPE, 10)),
      executeStatsQuery(getAreaStatsSQL(CODER_AGENT_TYPE)),
      executeStatsQuery(getWeeklyTrendSQL(CODER_AGENT_TYPE)),
      executeStatsQuery(getKnowledgeGapsSQL(CODER_AGENT_TYPE, 5)),
    ]);

    const recentReflections = await getReflections(CODER_AGENT_TYPE, { limit: 5 });

    let summary = '## 编码助手自省回顾\n\n';

    if (errorTypeRows.length > 0) {
      summary += '### 高频错误类型\n';
      for (const ef of errorTypeRows) {
        const row = ef as Record<string, unknown>;
        summary += `- **${row.category}**: ${row.count}次${row.percentage ? ` (${row.percentage}%)` : ''}\n`;
      }
      summary += '\n';
    }

    if (areaRows.length > 0) {
      summary += '### 薄弱领域\n';
      for (const ar of areaRows) {
        const row = ar as Record<string, unknown>;
        summary += `- **${row.area}**: 总计${row.total}次, 解决率${row.resolution_rate}%\n`;
      }
      summary += '\n';
    }

    if (recentReflections.length > 0) {
      summary += '### 最近反思记录\n';
      for (const r of recentReflections) {
        summary += `- [${new Date(r.created_at).toLocaleDateString()}] **${r.category}**: ${r.learning?.slice(0, 60)}... → 改进: ${r.action_item?.slice(0, 60)}...\n`;
      }
    }

    if (errorTypeRows.length === 0 && recentReflections.length === 0) {
      summary += '_暂无反思记录，继续积累中_\n';
    }

    return summary;
  } catch {
    return '_反思数据加载失败，跳过自省回顾_\n';
  }
}

/**
 * 从错误信息中自动推断错误类型
 */
export function inferErrorType(errorMessage: string): CoderErrorType {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('type') && (msg.includes('error') || msg.includes('mismatch'))) return CODER_ERROR_TYPES.TYPE_ERROR;
  if (msg.includes('build') || msg.includes('compile') || msg.includes('webpack')) return CODER_ERROR_TYPES.BUILD_ERROR;
  if (msg.includes('runtime') || msg.includes('cannot read') || msg.includes('undefined is not')) return CODER_ERROR_TYPES.RUNTIME_ERROR;
  if (msg.includes('import') || msg.includes('module not found') || msg.includes('cannot find module')) return CODER_ERROR_TYPES.IMPORT_ERROR;
  if (msg.includes('column') && (msg.includes('does not exist') || msg.includes('relation'))) return CODER_ERROR_TYPES.DATA_MODEL_MISMATCH;
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) return CODER_ERROR_TYPES.PERMISSION_ERROR;
  if (msg.includes('rls') || msg.includes('row level security') || msg.includes('policy')) return CODER_ERROR_TYPES.PERMISSION_ERROR;
  if (msg.includes('hardcoded') || msg.includes('localhost') || msg.includes('#000')) return CODER_ERROR_TYPES.HARDCODED_VALUE;
  if (msg.includes('catch') || msg.includes('try') || msg.includes('unhandled')) return CODER_ERROR_TYPES.MISSING_ERROR_HANDLING;
  if (msg.includes('slow') || msg.includes('timeout') || msg.includes('n+1')) return CODER_ERROR_TYPES.POOR_PERFORMANCE;
  if (msg.includes('hydration') || msg.includes('ssr') || msg.includes('client')) return CODER_ERROR_TYPES.RACE_CONDITION;

  return CODER_ERROR_TYPES.BUSINESS_LOGIC_ERROR;
}

/**
 * 从文件路径推断上下文标签
 */
export function inferContextTag(filePath: string): string {
  const path = filePath.toLowerCase();

  if (path.includes('/app/api/')) return CODER_CONTEXT_TAGS.API;
  if (path.includes('/app/admin/') || path.includes('/app/team/')) return CODER_CONTEXT_TAGS.FRONTEND;
  if (path.includes('/components/ui/')) return CODER_CONTEXT_TAGS.UI_COMPONENT;
  if (path.includes('/components/')) return CODER_CONTEXT_TAGS.FRONTEND;
  if (path.includes('/storage/') || path.includes('supabase')) return CODER_CONTEXT_TAGS.DATABASE;
  if (path.includes('/hooks/')) return CODER_CONTEXT_TAGS.STATE_MANAGEMENT;
  if (path.includes('/lib/skills/')) return CODER_CONTEXT_TAGS.INTEGRATION;
  if (path.includes('auth') || path.includes('login') || path.includes('session')) return CODER_CONTEXT_TAGS.AUTH;

  return CODER_CONTEXT_TAGS.BACKEND;
}

function mapErrorTypeToCategory(errorType: string): LearningCategory {
  if (errorType.includes('type') || errorType.includes('import') || errorType.includes('build')) return 'error_pattern';
  if (errorType.includes('permission') || errorType.includes('data_model') || errorType.includes('api_contract')) return 'knowledge_gap';
  if (errorType.includes('missing') || errorType.includes('incomplete') || errorType.includes('edge_case')) return 'skill_gap';
  return 'error_pattern';
}

function mapContextTagToArea(contextTag: string): LearningArea {
  if (contextTag === 'frontend' || contextTag === 'ui_component') return 'tool_usage';
  if (contextTag === 'database') return 'data_analysis';
  if (contextTag === 'api' || contextTag === 'integration') return 'task_handling';
  if (contextTag === 'auth') return 'safety';
  return 'domain_knowledge';
}
