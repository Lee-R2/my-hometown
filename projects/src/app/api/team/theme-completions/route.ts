import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取小队的主题完成记录（归档数据） */
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const client = getAuthenticatedClient(request, auth);

    // 获取主题完成记录
    const { data: completions, error } = await client
      .from('theme_completions')
      .select(`
        id,
        team_id,
        theme_id,
        completed_at,
        total_points,
        total_rewards,
        total_tasks,
        cycle,
        created_at
      `)
      .eq('team_id', teamId)
      .order('completed_at', { ascending: false });

    if (error) {
      console.error('获取主题完成记录失败:', error);
      return ApiErrors.validation('获取数据失败');
    }

    // 获取主题详情
    if (completions && completions.length > 0) {
      const themeIds = completions.map(c => c.theme_id);
      const { data: themes } = await client
        .from('task_themes')
        .select('id, name, icon')
        .in('id', themeIds);

      const themesMap = new Map((themes || []).map(t => [t.id, t]));

      // 合并主题信息
      const completionsWithTheme = completions.map(c => ({
        ...c,
        theme: themesMap.get(c.theme_id) || { id: c.theme_id, name: '未知主题', icon: '🎯' },
      }));

      return NextResponse.json({ completions: completionsWithTheme });
    }

    return NextResponse.json({ completions: [] });
  } catch (error) {
    console.error('获取主题完成记录错误:', error);
    return safeError(error);
  }
}
