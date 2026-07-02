import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

// 我的挂单 + 收到报价 + 我的报价 + 交易历史
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    // 1. 我的挂单
    const { data: myListings } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    // 2. 收到报价（对我挂单的报价）
    const myListingIds = (myListings || []).map(l => l.id);
    let receivedOffers: any[] = [];
    if (myListingIds.length > 0) {
      const { data } = await supabase
        .from('cloud_market_offers')
        .select(`*, listing:listing_id(id, item_name, item_type), from_team:from_team_id(id, name, icon)`)
        .in('listing_id', myListingIds)
        .order('created_at', { ascending: false });
      receivedOffers = data || [];
    }

    // 3. 我的报价
    const { data: myOffers } = await supabase
      .from('cloud_market_offers')
      .select(`*, listing:listing_id(id, item_name, item_type, price, status, team:team_id(id, name))`)
      .eq('from_team_id', teamId)
      .order('created_at', { ascending: false });

    // 4. 交易历史（作为买方或卖方）
    const { data: tradesAsBuyer } = await supabase
      .from('cloud_market_trades')
      .select(`*, listing:listing_id(id, item_name), seller:seller_team_id(id, name), buyer:buyer_team_id(id, name)`)
      .eq('buyer_team_id', teamId)
      .order('created_at', { ascending: false });

    const { data: tradesAsSeller } = await supabase
      .from('cloud_market_trades')
      .select(`*, listing:listing_id(id, item_name), seller:seller_team_id(id, name), buyer:buyer_team_id(id, name)`)
      .eq('seller_team_id', teamId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        myListings: myListings || [],
        receivedOffers,
        myOffers: myOffers || [],
        trades: [...(tradesAsBuyer || []), ...(tradesAsSeller || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      },
    });
  } catch (error: any) {
    return safeError(error);
  }
}
