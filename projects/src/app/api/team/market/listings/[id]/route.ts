import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 挂单详情（求购单含推荐商品）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const { data: listing, error } = await supabase
      .from('cloud_market_listings')
      .select(`*, team:team_id(id, name, icon)`)
      .eq('id', id)
      .single();

    if (error || !listing) return ApiErrors.notFound('挂单不存在');

    let recommendations: any[] = [];
    if (listing.listing_type === 'buy' && listing.status === 'active') {
      let recQuery = supabase
        .from('cloud_market_listings')
        .select(`*, team:team_id(id, name, icon)`)
        .eq('listing_type', 'sell')
        .eq('item_type', listing.item_type)
        .eq('status', 'active')
        .neq('team_id', teamId)
        .order('price', { ascending: true, nullsFirst: false })
        .limit(10);

      if (listing.scope === 'theme') {
        recQuery = recQuery.eq('scope', 'theme').eq('theme_id', listing.theme_id);
      } else if (listing.scope === 'school') {
        recQuery = recQuery.eq('scope', 'school').eq('school_id', listing.school_id);
      }

      const { data: recs } = await recQuery;
      recommendations = recs || [];
    }

    return NextResponse.json({
      success: true,
      data: listing,
      recommendations,
    });
  } catch (error: any) {
    return safeError(error);
  }
}

// 修改自己的挂单
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const body = await request.json();
    const { price, item_description, item_image_url, status } = body;

    const { data: listing, error: getErr } = await supabase
      .from('cloud_market_listings')
      .select('id, team_id, status')
      .eq('id', id)
      .single();
    if (getErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.team_id !== teamId) return ApiErrors.forbidden('无权操作他人挂单');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可修改');

    const updateData: any = { updated_at: new Date().toISOString() };
    if (price !== undefined) updateData.price = price;
    if (item_description !== undefined) updateData.item_description = item_description;
    if (item_image_url !== undefined) updateData.item_image_url = item_image_url;
    if (status !== undefined) updateData.status = status;

    const { data: updated, error: updErr } = await supabase
      .from('cloud_market_listings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updErr) throw updErr;

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return safeError(error);
  }
}

// 下架自己的挂单
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const { data: listing, error: getErr } = await supabase
      .from('cloud_market_listings')
      .select('id, team_id, status')
      .eq('id', id)
      .single();
    if (getErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.team_id !== teamId) return ApiErrors.forbidden('无权操作他人挂单');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可下架');

    const { error: updErr } = await supabase
      .from('cloud_market_listings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updErr) throw updErr;

    return NextResponse.json({ success: true, message: '已下架' });
  } catch (error: any) {
    return safeError(error);
  }
}
