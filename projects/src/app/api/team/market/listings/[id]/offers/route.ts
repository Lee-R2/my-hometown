import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { validateCreateOffer } from '@/lib/market-validation';
import { CreateOfferInput } from '@/lib/market-types';

const supabase = getSupabaseClient();

// 对挂单报价（议价 / 兑换响应）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const body = await request.json();
    const input: CreateOfferInput = body;

    const { data: listing, error: getErr } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可报价');
    if (listing.team_id === teamId) return ApiErrors.validation('不能对自己挂单报价');

    const validation = validateCreateOffer(input, listing.listing_type);
    if (!validation.valid) {
      return ApiErrors.validation((validation as any).message);
    }

    if (input.offerType === 'barter' && input.offerItemRef) {
      const { data: userReward } = await supabase
        .from('user_rewards')
        .select('id, team_id')
        .eq('id', input.offerItemRef)
        .single();
      if (!userReward || userReward.team_id !== teamId) {
        return ApiErrors.validation('响应物品不属于当前小队');
      }
    }

    const { data: offer, error: insertErr } = await supabase
      .from('cloud_market_offers')
      .insert({
        listing_id: id,
        from_team_id: teamId,
        offer_type: input.offerType,
        offer_price: input.offerPrice ?? null,
        offer_item_type: input.offerItemType || null,
        offer_item_ref: input.offerItemRef || null,
        offer_item_name: input.offerItemName || null,
        offer_quantity: input.offerQuantity ?? 1,
        status: 'pending',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    await supabase.from('team_notifications').insert({
      team_id: listing.team_id,
      type: 'market_offer_received',
      title: '收到新报价',
      content: `你上架的「${listing.item_name}」收到新报价`,
      is_read: false,
      extra_data: { offerId: offer.id, listingId: id },
    });

    return NextResponse.json({ success: true, data: offer });
  } catch (error: any) {
    return safeError(error);
  }
}
