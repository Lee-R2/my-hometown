/**
 * 自省 API — 自我改进技能的 HTTP 接口
 * 
 * POST /api/ai/reflection
 * - action=reflect: 对话后自省（替代 OpenClaw Hook）
 * - action=stats: 获取学习统计报告
 * - action=resolve: 标记已解决
 * - action=history: 获取自省历史
 */

import { requireAnyAuth, authError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ApiErrors } from '@/lib/api-error';
import { detectReflectionTriggers, buildReflectionPrompt, parseReflectionMarks, type ReflectionEntry, type LearningCategory, type LearningArea, type LearningStatus } from '@/lib/skills/self-improving/reflection-engine';
import { 
  saveReflections, 
  getReflections, 
  updateReflectionStatus,
  ensureReflectionTable,
  executeStatsQuery,
} from '@/lib/skills/self-improving/reflection-store';
import {
  generateStatsSummary,
  getErrorTypeStatsSQL,
  getAreaStatsSQL,
  getWeeklyTrendSQL,
  getKnowledgeGapsSQL,
  formatErrorTypeChartData,
  formatWeeklyTrendChartData,
  formatAreaProgressChartData,
  type StatsReportConfig,
  type ErrorTypeStat,
  type AreaStat,
  type WeeklyTrend,
  type KnowledgeGap,
} from '@/lib/skills/self-improving/learning-stats';

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { action, agentId, messages, assistantReply, reflectionId, status, correction, statsConfig } = body as {
      action: 'reflect' | 'stats' | 'resolve' | 'history';
      agentId: string;
      messages?: Array<{ role: string; content: string }>;
      assistantReply?: string;
      reflectionId?: string;
      status?: string;
      correction?: string;
      statsConfig?: StatsReportConfig;
    };

    // 确保表存在
    await ensureReflectionTable();

    switch (action) {
      case 'reflect': {
        if (!agentId) {
          return ApiErrors.validation('缺少 agentId');
        }

        if (!messages || messages.length === 0) {
          return NextResponse.json({
            success: true,
            data: { reflections: [], message: '无对话消息，无需自省' },
          });
        }

        const triggers = detectReflectionTriggers(messages);

        const hasTriggers = Object.values(triggers).some(v => v === true);
        if (!hasTriggers) {
          return NextResponse.json({
            success: true,
            data: { reflections: [], message: '本次对话无需自省' },
          });
        }

        const prompt = buildReflectionPrompt(triggers, agentId);

        let parsedReflections: Array<{
          category: LearningCategory;
          area: LearningArea;
          priority: 'low' | 'medium' | 'high' | 'critical';
          content: string;
          action: string;
        }> = [];

        if (assistantReply) {
          parsedReflections = parseReflectionMarks(assistantReply);
        }

        const reflections: ReflectionEntry[] = parsedReflections.map((r, idx) => ({
          id: `${agentId}-${Date.now()}-${idx}`,
          agent_id: agentId,
          user_id: auth.payload?.userId || '',
          session_id: '',
          category: r.category,
          area: r.area,
          priority: r.priority,
          status: 'pending' as const,
          trigger_context: prompt,
          learning: r.content,
          action_item: r.action,
          created_at: new Date().toISOString(),
          occurrence_count: 1,
        }));

        let savedCount = 0;
        if (reflections.length > 0) {
          savedCount = await saveReflections(reflections);
        }

        return NextResponse.json({
          success: true,
          data: {
            triggers,
            reflections: reflections.map(r => ({
              id: r.id,
              category: r.category,
              area: r.area,
              learning: r.learning,
              priority: r.priority,
              action_item: r.action_item,
            })),
            savedCount,
            prompt: prompt || undefined,
          },
        });
      }

      case 'stats': {
        if (!agentId) {
          return ApiErrors.validation('缺少 agentId');
        }

        const config: StatsReportConfig = statsConfig || { agent_id: agentId, agent_name: agentId, period: 'week' };

        const [errorTypeRows, areaRows, weeklyTrendRows, gapRows] = await Promise.all([
          executeStatsQuery(getErrorTypeStatsSQL(agentId)),
          executeStatsQuery(getAreaStatsSQL(agentId)),
          executeStatsQuery(getWeeklyTrendSQL(agentId)),
          executeStatsQuery(getKnowledgeGapsSQL(agentId)),
        ]);

        const errorStats = errorTypeRows as unknown as ErrorTypeStat[];
        const areaStats = areaRows as unknown as AreaStat[];
        const weeklyTrends = weeklyTrendRows as unknown as WeeklyTrend[];
        const gaps = gapRows as unknown as KnowledgeGap[];

        const report = generateStatsSummary(errorStats, areaStats, weeklyTrends, gaps, config);

        // 生成图表数据
        const errorTypeChart = formatErrorTypeChartData(errorStats);
        const weeklyTrendChart = formatWeeklyTrendChartData(weeklyTrends);
        const areaProgressChart = formatAreaProgressChartData(areaStats);

        return NextResponse.json({
          success: true,
          data: {
            report,
            charts: {
              errorTypes: errorTypeChart,
              weeklyTrends: weeklyTrendChart,
              areaProgress: areaProgressChart,
            },
          },
        });
      }

      case 'resolve': {
        if (!reflectionId || !status) {
          return ApiErrors.validation('缺少 reflectionId 或 status');
        }

        const ok = await updateReflectionStatus(
          reflectionId,
          status as 'resolved' | 'promoted',
          correction
        );

        return NextResponse.json({
          success: ok,
          data: { reflectionId, status, updated: ok },
        });
      }

      case 'history': {
        if (!agentId) {
          return ApiErrors.validation('缺少 agentId');
        }

        const { category, area, status: filterStatus, limit, since } = body as {
          category?: string;
          area?: string;
          status?: string;
          limit?: number;
          since?: string;
        };

        const entries = await getReflections(agentId, {
          category: mapCategory(category) as LearningCategory | undefined,
          area: mapArea(area) as LearningArea | undefined,
          status: mapStatus(filterStatus) as LearningStatus | undefined,
          limit: limit || 20,
          since,
        });

        return NextResponse.json({
          success: true,
          data: { entries, count: entries.length },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `未知 action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[reflection API] 错误:', error);
    return ApiErrors.validation('自省处理失败');
  }
}

function mapCategory(val?: string): string | undefined {
  if (!val) return undefined;
  const map: Record<string, string> = {
    error_correction: 'correction',
    knowledge_gap: 'knowledge_gap',
    style_improvement: 'best_practice',
    feedback_integration: 'insight',
  };
  return map[val] || val;
}

function mapArea(val?: string): string | undefined {
  if (!val) return undefined;
  const map: Record<string, string> = {
    nlg: 'communication',
    intent: 'communication',
    style: 'teaching',
    interaction: 'communication',
    knowledge: 'domain_knowledge',
  };
  return map[val] || val;
}

function mapStatus(val?: string): string | undefined {
  if (!val) return undefined;
  if (val === 'dismissed') return 'resolved';
  return val;
}
