import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdminOrVolunteer, authError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return ApiErrors.validation('缺少用户ID');
    }

    const client = getSupabaseClient();

    // 查询未读theme_selected 类型通知
    const { data: notifications, error } = await client
      .from('notifications')
      .select('id, title, content, created_at, related_team_id, related_theme_id')
      .eq('target_type', 'volunteer')
      .eq('target_id', userId)
      .eq('type', 'theme_selected')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('获取提示气泡数据失败:', error);
      return ApiErrors.validation('获取失败');
    }

    // 获取关联的小队名称
    const teamIds = notifications?.map(n => n.related_team_id).filter(Boolean) || [];
    const themeIds = notifications?.map(n => n.related_theme_id).filter(Boolean) || [];

    let teams: Record<string, string> = {};
    let themes: Record<string, string> = {};

    if (teamIds.length > 0) {
      const { data: teamData } = await client
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      
      if (teamData) {
        teams = teamData.reduce((acc, t) => ({ ...acc, [t.id]: t.name }), {});
      }
    }

    if (themeIds.length > 0) {
      const { data: themeData } = await client
        .from('task_themes')
        .select('id, name')
        .in('id', themeIds);
      
      if (themeData) {
        themes = themeData.reduce((acc, t) => ({ ...acc, [t.id]: t.name }), {});
      }
    }

    // 格式化返回数据
    const hints = notifications?.map(n => ({
      id: n.id,
      title: n.title,
      content: n.content,
      teamName: teams[n.related_team_id!] || '未知小队',
      themeName: themes[n.related_theme_id!] || '未知主题',
      teamId: n.related_team_id,
      themeId: n.related_theme_id,
      createdAt: n.created_at
    })) || [];

    return NextResponse.json({ 
      success: true,
      hints,
      count: hints.length
    });
  } catch (error) {
    console.error('获取提示气泡数据失败:', error);
    return ApiErrors.validation('获取提示气泡数据失败');
  }
}
