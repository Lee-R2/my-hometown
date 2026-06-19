/**
 * 学习统计分析模块 — 高频错误类型、学习曲线、知识缺口可视化
 * 
 * 解决原始技能缺乏统计分析的问题：
 * - 高频错误类型排行
 * - 学习曲线（每周自省条目趋势）
 * - 知识缺口热力图
 * - 改进进度追踪
 */

import type { LearningCategory, LearningArea, LearningStatus } from './reflection-engine';

// ========== 统计维度 ==========

export interface ErrorTypeStat {
  category: LearningCategory;
  count: number;
  percentage: number;
  recent_examples: string[];  // 最近3条示例
  trend: 'up' | 'down' | 'stable';  // 趋势
}

export interface AreaStat {
  area: LearningArea;
  total: number;
  resolved: number;
  pending: number;
  resolution_rate: number;  // 解决率 0-1
  top_error: string;        // 该领域最常见错误
}

export interface WeeklyTrend {
  week: string;             // e.g. "2026-W21"
  total_reflections: number;
  corrections: number;
  insights: number;
  knowledge_gaps: number;
  resolution_rate: number;
}

export interface KnowledgeGap {
  area: LearningArea;
  gap_description: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  status: LearningStatus;
  related_categories: LearningCategory[];
}

export interface ImprovementProgress {
  agent_id: string;
  period_start: string;
  period_end: string;
  total_reflections: number;
  resolved_count: number;
  critical_count: number;
  critical_resolved: number;
  overall_resolution_rate: number;
  top_3_areas: AreaStat[];
  top_3_errors: ErrorTypeStat[];
  biggest_improvement: string;   // 进步最大的领域
  biggest_gap: string;           // 最大缺口
  weekly_trend: WeeklyTrend[];
}

// ========== 统计查询 SQL 生成 ==========

/**
 * 生成高频错误类型统计 SQL
 */
export function getErrorTypeStatsSQL(agentId: string, limit: number = 10): string {
  return `
    SELECT 
      category,
      COUNT(*) as count,
      ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER() * 100, 1) as percentage,
      CASE 
        WHEN COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') > 
             COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days')
        THEN 'up'
        WHEN COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') < 
             COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days')
        THEN 'down'
        ELSE 'stable'
      END as trend
    FROM agent_reflections
    WHERE agent_id = '${agentId}'
    GROUP BY category
    ORDER BY count DESC
    LIMIT ${limit}`;
}

/**
 * 生成领域统计 SQL
 */
export function getAreaStatsSQL(agentId: string): string {
  return `
    SELECT 
      area,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'in_progress') as pending,
      ROUND(COUNT(*) FILTER (WHERE status = 'resolved')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as resolution_rate
    FROM agent_reflections
    WHERE agent_id = '${agentId}'
    GROUP BY area
    ORDER BY total DESC`;
}

/**
 * 生成每周趋势 SQL
 */
export function getWeeklyTrendSQL(agentId: string, weeks: number = 8): string {
  return `
    SELECT 
      TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-WW') as week,
      COUNT(*) as total_reflections,
      COUNT(*) FILTER (WHERE category = 'correction') as corrections,
      COUNT(*) FILTER (WHERE category = 'insight') as insights,
      COUNT(*) FILTER (WHERE category = 'knowledge_gap') as knowledge_gaps,
      ROUND(COUNT(*) FILTER (WHERE status = 'resolved')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as resolution_rate
    FROM agent_reflections
    WHERE agent_id = '${agentId}'
      AND created_at >= NOW() - INTERVAL '${weeks} weeks'
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY week ASC`;
}

/**
 * 生成知识缺口 SQL
 */
export function getKnowledgeGapsSQL(agentId: string, limit: number = 10): string {
  return `
    SELECT 
      area,
      learning as gap_description,
      COUNT(*) as occurrence_count,
      MIN(created_at) as first_seen,
      MAX(created_at) as last_seen,
      status,
      category
    FROM agent_reflections
    WHERE agent_id = '${agentId}'
      AND (category = 'knowledge_gap' OR category = 'error_pattern')
      AND status != 'resolved'
    GROUP BY area, learning, status, category
    ORDER BY occurrence_count DESC, last_seen DESC
    LIMIT ${limit}`;
}

// ========== 统计报告生成 ==========

export interface StatsReportConfig {
  agent_id: string;
  agent_name: string;
  period: 'week' | 'month' | 'quarter';
}

/**
 * 生成统计报告（供智能体在提示词中引用）
 */
export function generateStatsSummary(
  errorStats: ErrorTypeStat[],
  areaStats: AreaStat[],
  weeklyTrend: WeeklyTrend[],
  gaps: KnowledgeGap[],
  config: StatsReportConfig
): string {
  const lines: string[] = [];
  
  lines.push(`## ${config.agent_name} 学习统计（近${config.period === 'week' ? '一周' : config.period === 'month' ? '一月' : '一季'}）`);
  
  // 高频错误
  if (errorStats.length > 0) {
    lines.push('\n### 高频错误类型');
    errorStats.forEach((stat, i) => {
      const trendIcon = stat.trend === 'up' ? '↑恶化' : stat.trend === 'down' ? '↓改善' : '→稳定';
      lines.push(`${i + 1}. **${formatCategory(stat.category)}** — ${stat.count}次 (${stat.percentage}%) ${trendIcon}`);
    });
  }
  
  // 领域分布
  if (areaStats.length > 0) {
    lines.push('\n### 领域改进进度');
    areaStats.forEach(stat => {
      const bar = '█'.repeat(Math.round(stat.resolution_rate / 10)) + '░'.repeat(10 - Math.round(stat.resolution_rate / 10));
      lines.push(`- ${formatArea(stat.area)}: ${bar} ${stat.resolution_rate}%已解决 (${stat.resolved}/${stat.total})`);
    });
  }
  
  // 学习曲线
  if (weeklyTrend.length > 0) {
    lines.push('\n### 学习曲线');
    weeklyTrend.forEach(w => {
      const bar = '▓'.repeat(Math.min(Math.round(w.total_reflections / 2), 20));
      lines.push(`${w.week}: ${bar} ${w.total_reflections}条 (解决率${w.resolution_rate}%)`);
    });
  }
  
  // 知识缺口
  if (gaps.length > 0) {
    lines.push('\n### 待填补知识缺口');
    gaps.forEach((gap, i) => {
      lines.push(`${i + 1}. [${formatArea(gap.area)}] ${gap.gap_description} (出现${gap.occurrence_count}次, 状态:${formatStatus(gap.status)})`);
    });
  }

  return lines.join('\n');
}

// ========== 格式化辅助 ==========

function formatCategory(cat: LearningCategory): string {
  const map: Record<LearningCategory, string> = {
    correction: '被纠正',
    insight: '新发现',
    knowledge_gap: '知识缺口',
    best_practice: '最佳实践',
    error_pattern: '错误模式',
    skill_gap: '技能短板',
  };
  return map[cat] || cat;
}

function formatArea(area: LearningArea): string {
  const map: Record<LearningArea, string> = {
    teaching: '教学方法',
    data_analysis: '数据分析',
    communication: '沟通表达',
    task_handling: '任务处理',
    safety: '安全边界',
    domain_knowledge: '领域知识',
    emotional_intel: '情感智能',
    tool_usage: '工具使用',
  };
  return map[area] || area;
}

function formatStatus(status: LearningStatus): string {
  const map: Record<LearningStatus, string> = {
    pending: '待处理',
    in_progress: '改进中',
    resolved: '已解决',
    promoted: '已内化',
  };
  return map[status] || status;
}

/**
 * 图表数据格式化（与 chart-builder 兼容）
 */
export function formatErrorTypeChartData(errorStats: ErrorTypeStat[]) {
  return {
    chart_type: 'bar' as const,
    title: '高频错误类型分布',
    data: errorStats.map(s => ({
      name: formatCategory(s.category),
      value: s.count,
      percentage: s.percentage,
      trend: s.trend,
    })),
  };
}

export function formatWeeklyTrendChartData(weeklyTrend: WeeklyTrend[]) {
  return {
    chart_type: 'line' as const,
    title: '学习曲线趋势',
    data: weeklyTrend.map(w => ({
      name: w.week,
      total: w.total_reflections,
      corrections: w.corrections,
      insights: w.insights,
      resolution_rate: w.resolution_rate,
    })),
  };
}

export function formatAreaProgressChartData(areaStats: AreaStat[]) {
  return {
    chart_type: 'bar' as const,
    title: '各领域改进进度',
    data: areaStats.map(s => ({
      name: formatArea(s.area),
      total: s.total,
      resolved: s.resolved,
      pending: s.pending,
      resolution_rate: s.resolution_rate,
    })),
  };
}
