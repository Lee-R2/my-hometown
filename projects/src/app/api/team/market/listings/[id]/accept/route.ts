import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { executeTrade } from '@/lib/market-trade';

const supabase = getSupabaseClient();

// 卖方接受某报价
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id: listingId } = await params;
    const { offer_id } = await request.json();

    if (!offer_id) return ApiErrors.validation('缺少 offer_id');

    const { data: listing, error: lErr } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('id', listingId)
      .single();
    if (lErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.team_id !== teamId) return ApiErrors.forbidden('无权操作他人挂单');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可接受报价');

    const { data: offer, error: oErr } = await supabase
      .from('cloud_market_offers')
      .select('*')
      .eq('id', offer_id)
      .eq('listing_id', listingId)
      .single();
    if (oErr || !offer) return ApiErrors.notFound('报价不存在');
    if (offer.status !== 'pending') return ApiErrors.validation('报价已处理');

    const tradeResult = await executeTrade({
      listingId,
      buyerTeamId: offer.from_team_id,
      sellerTeamId: teamId,
      tradeType: offer.offer_type === 'barter' ? 'barter' : 'buy',
      itemType: listing.item_type,
      itemName: listing.item_name,
      quantity: 1,
      pointsPaid: offer.offer_price || 0,
      scope: listing.scope,
      themeId: listing.theme_id,
      schoolId: listing.school_id,
      offerId: offer.id,
      barterItemType: offer.offer_item_type,
      barterItemRef: offer.offer_item_ref,
      barterItemName: offer.offer_item_name,
      barterQuantity: offer.offer_quantity,
      sellerItemRef: listing.item_ref,
      buyerItemRef: offer.offer_item_ref,
    });

    if (!tradeResult.success) {
      return NextResponse.json(
        { success: false, error: tradeResult.error },
        { status: tradeResult.errorCode === 'INSUFFICIENT_POINTS' ? 400 : 409 }
      );
    }

    await supabase
      .from('cloud_market_offers')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', offer_id);
    await supabase
      .from('cloud_market_offers')
      .update({ status: 'auto_expired', responded_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .eq('status', 'pending')
      .neq('id', offer_id);

    return NextResponse.json({ success: true, data: { tradeId: tradeResult.tradeId } });
  } catch (error: any) {
    return safeError(error);
  }
}
