import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const client = getSupabaseClient();

    // 从 teams 表读取权威的碎片和宝石数据（heart_gems 表的 fragments/gems 从未被写入）
    const { data: teamData, error: teamError } = await client
      .from('teams')
      .select('heart_shards, heart_gems')
      .eq('id', teamId)
      .maybeSingle();

    if (teamError) {
      console.error('获取爱心宝石统计失败:', teamError);
      return ApiErrors.validation('获取统计失败');
    }

    // total_sent_likes 从 heart_gems 表读取（仅 like 路由写入此字段）
    const { data: heartGemsData } = await client
      .from('heart_gems')
      .select('total_sent_likes')
      .eq('team_id', teamId)
      .maybeSingle();

    const result = {
      fragments: teamData?.heart_shards || 0,
      gems: teamData?.heart_gems || 0,
      totalSentLikes: heartGemsData?.total_sent_likes || 0,
      fragmentsPerGem: 10,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('获取爱心宝石统计错误:', error);
    return safeError(error);
  }
}