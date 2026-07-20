import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authError, safeError } from '@/lib/api-auth';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { resolveTeamScope } from '@/lib/agent-scope';

const supabase = getSupabaseAdminClient();

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer', 'teacher'],
  });
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const tradeType = searchParams.get('trade_type');
    const itemType = searchParams.get('item_type');
    const scope = searchParams.get('scope');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const teamName = searchParams.get('team_name');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '50');

    const teamScope = await resolveTeamScope(auth.payload!.userId, auth.payload!.role);
    const allowedTeamIds = teamScope.teamIds;

    let query = supabase
      .from('cloud_market_trades')
      .select(`*, buyer:buyer_team_id(id, name), seller:seller_team_id(id, name)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (auth.payload!.role !== 'super_admin' && auth.payload!.role !== 'admin') {
      query = query.or(`buyer_team_id.in.(${allowedTeamIds.join(',')}),seller_team_id.in.(${allowedTeamIds.join(',')})`);
    }

    if (tradeType) query = query.eq('trade_type', tradeType);
    if (itemType) query = query.eq('item_type', itemType);
    if (scope) query = query.eq('scope', scope);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: trades, count } = await query;

    let filteredTrades = trades || [];
    if (teamName) {
      filteredTrades = filteredTrades.filter(t =>
        (t.buyer?.name || '').includes(teamName) || (t.seller?.name || '').includes(teamName)
      );
    }

    const totalPoints = filteredTrades.reduce((sum, t) => sum + (t.points_paid || 0), 0);

    return NextResponse.json({
      success: true,
      data: filteredTrades,
      pagination: { page, pageSize, total: count || 0 },
      stats: {
        totalTrades: filteredTrades.length,
        totalPointsFlow: totalPoints,
      },
    });
  } catch (error: any) {
    return safeError(error);
  }
}
