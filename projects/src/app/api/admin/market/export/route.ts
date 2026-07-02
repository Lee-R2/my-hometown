import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveTeamScope } from '@/lib/agent-scope';

const supabase = getSupabaseClient();

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer', 'teacher'],
  });
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const teamScope = await resolveTeamScope(auth.payload!.userId, auth.payload!.role);
    const allowedTeamIds = teamScope.teamIds;

    let query = supabase
      .from('cloud_market_trades')
      .select(`*, buyer:buyer_team_id(id, name), seller:seller_team_id(id, name)`)
      .order('created_at', { ascending: false });

    if (auth.payload!.role !== 'super_admin' && auth.payload!.role !== 'admin') {
      query = query.or(`buyer_team_id.in.(${allowedTeamIds.join(',')}),seller_team_id.in.(${allowedTeamIds.join(',')})`);
    }
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: trades } = await query;

    const headers = [
      '交易ID', '交易时间', '交易类型', '范围', '物品类型', '物品名称', '数量',
      '支付积分', '买方小队', '卖方小队', '兑换物品', '状态',
    ];
    const rows = (trades || []).map(t => [
      t.id,
      new Date(t.created_at).toLocaleString('zh-CN'),
      t.trade_type === 'buy' ? '购买' : '兑换',
      t.scope === 'theme' ? '同主题' : '同学校',
      t.item_type,
      t.item_name,
      t.quantity,
      t.points_paid || 0,
      t.buyer?.name || '',
      t.seller?.name || '',
      t.barter_item_name || '',
      t.status,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const csvWithBom = '\uFEFF' + csv;

    return new NextResponse(csvWithBom, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloud-market-trades-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    return safeError(error);
  }
}
