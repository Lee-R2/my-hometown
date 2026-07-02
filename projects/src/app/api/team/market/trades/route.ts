import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { executeTrade } from '@/lib/market-trade';

const supabase = getSupabaseClient();

// 一口价直接购买
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { listing_id, quantity } = await request.json();
    if (!listing_id) return ApiErrors.validation('缺少 listing_id');
    const buyQty = quantity || 1;
    if (!Number.isInteger(buyQty) || buyQty < 1) return ApiErrors.validation('数量必须是正整数');

    const { data: listing, error } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('id', listing_id)
      .single();
    if (error || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可购买');
    if (listing.listing_type !== 'sell') return ApiErrors.validation('仅出售挂单支持直接购买');
    if (listing.team_id === teamId) return ApiErrors.validation('不能购买自己的挂单');
    if (listing.available_quantity < buyQty) return ApiErrors.validation('剩余数量不足');

    const pointsPaid = (listing.price || 0) * buyQty;

    const tradeResult = await executeTrade({
      listingId: listing_id,
      buyerTeamId: teamId,
      sellerTeamId: listing.team_id,
      tradeType: 'buy',
      itemType: listing.item_type,
      itemName: listing.item_name,
      quantity: buyQty,
      pointsPaid,
      scope: listing.scope,
      themeId: listing.theme_id,
      schoolId: listing.school_id,
      sellerItemRef: listing.item_ref,
    });

    if (!tradeResult.success) {
      return NextResponse.json(
        { success: false, error: tradeResult.error },
        { status: tradeResult.errorCode === 'INSUFFICIENT_POINTS' ? 400 : 409 }
      );
    }

    return NextResponse.json({ success: true, data: { tradeId: tradeResult.tradeId } });
  } catch (error: any) {
    return safeError(error);
  }
}
