import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 获取当前小队的转账记录
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const searchParams = request.nextUrl.searchParams;
  const teamId = auth.payload!.userId;
  const type = searchParams.get('type') || 'all'; // all, sent, received
  const limit = parseInt(searchParams.get('limit') || '20');

  if (!teamId) {
    return ApiErrors.validation('认证令牌无效');
  }

  try {
    let query = supabase
      .from('point_transfers')
      .select(`
        id,
        points,
        message,
        status,
        created_at,
        from_team_id,
        to_team_id
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type === 'sent') {
      query = query.eq('from_team_id', teamId);
    } else if (type === 'received') {
      query = query.eq('to_team_id', teamId);
    } else {
      // 查询发送或接收的记录
      query = query.or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 手动获取 team 名称
    const teamIds = [...new Set([
      ...(data || []).map((r: any) => r.from_team_id),
      ...(data || []).map((r: any) => r.to_team_id),
    ].filter(Boolean))];

    let teamMap: Record<string, any> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name, code')
        .in('id', teamIds);
      (teams || []).forEach((t: any) => { teamMap[t.id] = t; });
    }

    // 处理数据，添加类型标识
    const processedData = (data || []).map((record: any) => ({
      ...record,
      from_team: teamMap[record.from_team_id] || { id: record.from_team_id, name: '未知小队', code: '' },
      to_team: teamMap[record.to_team_id] || { id: record.to_team_id, name: '未知小队', code: '' },
      type: record.from_team_id === teamId ? 'sent' : 'received'
    }));

    return NextResponse.json({ success: true, data: processedData });
  } catch (error: any) {
    return safeError(error);
  }
}
