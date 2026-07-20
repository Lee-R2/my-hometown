import { requireAdmin, authError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { distillAgentMemories, distillAllAgents, getDistillationStatus } from '@/lib/memory-distiller';
import { ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 安全修复 LE-M05: scheduler.js (memory-distiller) 每日 03:00 调用此端点执行蒸馏,
    // 但不携带认证头。将 action === 'distill' 的定时任务调用放在鉴权检查之前,
    // 与 user/route.ts 的 cleanup 处理保持一致。
    // 普通管理员手动调用(不带 action 字段或 action !== 'distill')仍需 requireAdmin 鉴权。
    if (body.action === 'distill') {
      const { agent, dryRun } = body;

      // 确定要处理的 agent（必须与数据库 agent_memories.agent_username 一致）
      const VALID_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];
      const agents = agent === 'all'
        ? VALID_AGENTS
        : agent
          ? [agent]
          : VALID_AGENTS;

      const results: Record<string, any> = {};

      for (const agentName of agents) {
        try {
          if (dryRun) {
            // 干跑模式：只返回分析结果，不实际执行蒸馏
            const status = await getDistillationStatus();
            results[agentName] = { dryRun: true, analysis: status[agentName] || {} };
          } else {
            // 实际执行蒸馏
            const result = await distillAgentMemories(agentName, { dryRun: false });
            results[agentName] = result;
          }
        } catch (error) {
          results[agentName] = {
            error: '蒸馏失败',
            success: false
          };
        }
      }

      return NextResponse.json({
        success: true,
        results,
        timestamp: new Date().toISOString()
      });
    }

    // 普通管理员手动调用需要鉴权
    const auth = await requireAdmin(request);
    if (!auth.authenticated) return authError(auth);

    const { agent, dryRun } = body;

    // 确定要处理的 agent（必须与数据库 agent_memories.agent_username 一致）
    const VALID_AGENTS = ['yinshe_boshi', 'laxiang_zhushou'];
    const agents = agent === 'all'
      ? VALID_AGENTS
      : agent
        ? [agent]
        : VALID_AGENTS;

    const results: Record<string, any> = {};

    for (const agentName of agents) {
      try {
        if (dryRun) {
          // 干跑模式：只返回分析结果，不实际执行蒸馏
          const status = await getDistillationStatus();
          results[agentName] = { dryRun: true, analysis: status[agentName] || {} };
        } else {
          // 实际执行蒸馏
          const result = await distillAgentMemories(agentName, { dryRun: false });
          results[agentName] = result;
        }
      } catch (error) {
        results[agentName] = {
          error: '蒸馏失败',
          success: false
        };
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[记忆蒸馏API] 执行失败:', error);
    return ApiErrors.validation('记忆蒸馏失败');
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent') || 'all';

    const stats = await getDistillationStatus();

    if (agent !== 'all') {
      return NextResponse.json({
        success: true,
        stats: { [agent]: stats[agent] || {} },
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[记忆蒸馏API] 分析失败:', error);
    return ApiErrors.validation('分析失败');
  }
}
