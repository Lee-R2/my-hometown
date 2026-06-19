/**
 * EntroCamp 自动学习 API
 * 
 * POST /api/ai/entrocamp - 执行每日自动学习
 * GET /api/ai/entrocamp - 查询学习进度
 * 
 * 支持的参数：
 * - agent: 'dr-silver-snake' | 'wax-elephant' | 'all' (默认)
 * - action: 'learn' | 'status' | 'schedule' | 'auto-enroll'
 */

import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  AGENTS,
  executeDailyLearning,
  executeAllAgentsDailyLearning,
  getAgentProfile,
  autoReenrollWeakSubjects,
  getTodaySchedule,
} from '@/lib/skills/entrocamp-learner';

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { agent = 'all', action = 'learn' } = body;

    switch (action) {
      case 'learn': {
        if (agent === 'all') {
          const result = await executeAllAgentsDailyLearning();
          return NextResponse.json({
            success: true,
            data: result,
          });
        } else {
          const result = await executeDailyLearning(agent);
          return NextResponse.json({
            success: true,
            data: result,
          });
        }
      }

      case 'auto-enroll': {
        if (agent === 'all') {
          const results = [];
          for (const agentKey of Object.keys(AGENTS)) {
            const result = await autoReenrollWeakSubjects(agentKey);
            results.push({ agentKey, ...result });
          }
          return NextResponse.json({
            success: true,
            data: results,
          });
        } else {
          const result = await autoReenrollWeakSubjects(agent);
          return NextResponse.json({
            success: true,
            data: result,
          });
        }
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[EntroCamp API Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: '服务器内部错误',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent') || 'all';
    const action = searchParams.get('action') || 'status';

    switch (action) {
      case 'status': {
        if (agent === 'all') {
          const profiles = [];
          for (const agentKey of Object.keys(AGENTS)) {
            const profile = await getAgentProfile(agentKey);
            profiles.push({ agentKey, ...profile });
          }
          return NextResponse.json({
            success: true,
            data: profiles,
          });
        } else {
          const profile = await getAgentProfile(agent);
          return NextResponse.json({
            success: true,
            data: { agentKey: agent, ...profile },
          });
        }
      }

      case 'schedule': {
        if (agent === 'all') {
          const schedules = [];
          for (const agentKey of Object.keys(AGENTS)) {
            const schedule = await getTodaySchedule(agentKey);
            schedules.push({ agentKey, agentName: AGENTS[agentKey].name, ...schedule });
          }
          return NextResponse.json({
            success: true,
            data: schedules,
          });
        } else {
          const schedule = await getTodaySchedule(agent);
          return NextResponse.json({
            success: true,
            data: { agentKey: agent, agentName: AGENTS[agent]?.name, ...schedule },
          });
        }
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[EntroCamp API Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: '服务器内部错误',
      },
      { status: 500 }
    );
  }
}
