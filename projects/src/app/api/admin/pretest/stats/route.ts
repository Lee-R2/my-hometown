import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest } from 'next/server';

// 使用服务角色密钥直接访问数据库，绕过RLS（未配置时自动回退到 anon key）
const supabaseAdmin = getSupabaseAdminClient();

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 获取题目统计
    const { count: totalQuestions } = await supabaseAdmin
      .from('pretest_questions')
      .select('*', { count: 'exact', head: true });

    const { count: activeQuestions } = await supabaseAdmin
      .from('pretest_questions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // 获取回答统计
    const { count: totalResponses } = await supabaseAdmin
      .from('pretest_responses')
      .select('*', { count: 'exact', head: true });

    // 获取小队完成状态统计
    const { data: teamStatuses } = await supabaseAdmin
      .from('team_pretest_status')
      .select('status');

    const completedTeams = teamStatuses?.filter(t => t.status === 'completed').length || 0;
    const pendingTeams = teamStatuses?.filter(t => t.status !== 'completed').length || 0;

    // 如果没有状态记录，检查有多少小队需要填写
    if (teamStatuses?.length === 0) {
      const { count: totalTeams } = await supabaseAdmin
        .from('teams')
        .select('*', { count: 'exact', head: true });

      return NextResponse.json({
        success: true,
        stats: {
          totalQuestions: totalQuestions || 0,
          activeQuestions: activeQuestions || 0,
          totalResponses: totalResponses || 0,
          completedTeams: 0,
          pendingTeams: totalTeams || 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalQuestions: totalQuestions || 0,
        activeQuestions: activeQuestions || 0,
        totalResponses: totalResponses || 0,
        completedTeams,
        pendingTeams,
      },
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    return safeError(error);
  }
}
