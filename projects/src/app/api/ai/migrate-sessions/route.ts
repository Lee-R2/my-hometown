import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

/**
 * 迁移旧的随机 sessionId 为固定格式
 * 旧的格式: yinhe_team_{teamId}_{timestamp}
 * 新的格式: yinhe_team_{teamId}
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const results = {
      updated_conversations: 0,
      updated_sessions: 0,
      errors: [] as string[]
    };

    // 1. 迁移银蛇博士的会话和对话
    // 查询所有银蛇博士的会话
    const { data: sessions, error: sessionsError } = await client
      .from('agent_sessions')
      .select('*')
      .eq('agent_username', 'yinshe_boshi')
      .eq('is_active', true);

    if (sessionsError) {
      return NextResponse.json({ success: false, error: sessionsError.message });
    }

    // 按 teamId 分组处理
    const teamIdMap = new Map<string, string[]>();
    for (const session of sessions || []) {
      if (session.team_id) {
        // 提取 teamId
        const teamId = session.team_id;
        if (!teamIdMap.has(teamId)) {
          teamIdMap.set(teamId, []);
        }
        teamIdMap.get(teamId)!.push(session.session_id);
      }
    }

    // 为每个 teamId 更新会话
    for (const [teamId, oldSessionIds] of teamIdMap) {
      const newSessionId = `yinhe_team_${teamId}`;

      // 先删除旧的会话记录（保留对话）
      const { error: deleteError } = await client
        .from('agent_sessions')
        .delete()
        .eq('agent_username', 'yinshe_boshi')
        .eq('team_id', teamId)
        .eq('is_active', true);

      // 如果删除失败，说明新会话已存在，直接使用
      if (deleteError) {
        // 更新为新格式的会话 ID
        const { error: updateSessionError } = await client
          .from('agent_sessions')
          .update({ session_id: newSessionId })
          .eq('agent_username', 'yinshe_boshi')
          .eq('team_id', teamId)
          .eq('is_active', true);

        if (!updateSessionError) {
          results.updated_sessions += oldSessionIds.length;
        } else {
          results.errors.push(`更新会话失败 (teamId: ${teamId}): ${updateSessionError.message}`);
        }
      } else {
        // 创建新格式的会话
        await client.from('agent_sessions').insert({
          agent_username: 'yinshe_boshi',
          team_id: teamId,
          session_id: newSessionId,
          is_active: true
        });
        results.updated_sessions += oldSessionIds.length;
      }

      // 更新对话记录
      const { error: updateConvError } = await client
        .from('agent_conversations')
        .update({ session_id: newSessionId })
        .eq('agent_username', 'yinshe_boshi')
        .ilike('session_id', `%${teamId}%`);

      if (updateConvError) {
        results.errors.push(`更新对话失败 (teamId: ${teamId}): ${updateConvError.message}`);
      } else {
        // 统计更新数量
        const { count } = await client
          .from('agent_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('agent_username', 'yinshe_boshi')
          .eq('session_id', newSessionId);
        results.updated_conversations += count || 0;
      }
    }

    // 2. 迁移蜡象助手的会话和对话
    const { data: laxiangSessions, error: laxiangError } = await client
      .from('agent_sessions')
      .select('*')
      .eq('agent_username', 'laxiang_zhushou')
      .eq('is_active', true);

    if (!laxiangError && laxiangSessions) {
      const userIdMap = new Map<string, string[]>();
      for (const session of laxiangSessions) {
        if (session.user_id) {
          const userId = session.user_id;
          if (!userIdMap.has(userId)) {
            userIdMap.set(userId, []);
          }
          userIdMap.get(userId)!.push(session.session_id);
        }
      }

      for (const [userId, oldSessionIds] of userIdMap) {
        const newSessionId = `laxiang_user_${userId}`;

        await client
          .from('agent_sessions')
          .update({ session_id: newSessionId })
          .eq('agent_username', 'laxiang_zhushou')
          .eq('user_id', userId)
          .eq('is_active', true);

        await client
          .from('agent_conversations')
          .update({ session_id: newSessionId })
          .eq('agent_username', 'laxiang_zhushou')
          .eq('user_id', userId);
      }
    }

    return NextResponse.json({
      success: true,
      message: '会话迁移完成',
      results
    });
  } catch (error: any) {
    console.error('[会话迁移] 失败:', error);
    return safeError(error);
  }
}

/**
 * 获取迁移状态
 */
export async function GET() {
  try {
    const client = getSupabaseAdminClient();

    // 统计各智能体的会话和对话数量
    const { data: sessions, error } = await client
      .from('agent_sessions')
      .select('agent_username, session_id, team_id, user_id');

    if (error) throw error;

    // 按智能体分组统计
    const stats = {
      yinshe_boshi: {
        total_sessions: 0,
        fixed_format_sessions: 0,
        old_format_sessions: 0
      },
      laxiang_zhushou: {
        total_sessions: 0,
        fixed_format_sessions: 0,
        old_format_sessions: 0
      }
    };

    for (const session of sessions || []) {
      const username = session.agent_username as keyof typeof stats;
      if (stats[username]) {
        stats[username].total_sessions++;
        const isFixed = 
          (username === 'yinshe_boshi' && session.session_id === `yinhe_team_${session.team_id}`) ||
          (username === 'laxiang_zhushou' && session.session_id === `laxiang_user_${session.user_id}`);
        if (isFixed) {
          stats[username].fixed_format_sessions++;
        } else {
          stats[username].old_format_sessions++;
        }
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return safeError(error);
  }
}
