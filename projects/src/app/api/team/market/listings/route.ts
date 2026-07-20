import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { validateCreateListing } from '@/lib/market-validation';
import { CreateListingInput } from '@/lib/market-types';
import { isToolRewardType, isSkillRewardType } from '@/lib/market-validation';

const supabase = getSupabaseAdminClient();

// 查询挂单列表
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'theme' | 'school' | 'all' | null;
    const itemType = searchParams.get('item_type');
    const listingType = searchParams.get('listing_type');
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '20');

    const { data: currentTeam } = await supabase
      .from('teams')
      .select('current_theme_id, school_id')
      .eq('id', teamId)
      .single();

    let query = supabase
      .from('cloud_market_listings')
      .select(`*, team:team_id(id, name, icon)`, { count: 'exact' })
      .eq('status', 'active')
      .neq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (scope === 'theme' && currentTeam?.current_theme_id) {
      query = query.eq('scope', 'theme').eq('theme_id', currentTeam.current_theme_id);
    } else if (scope === 'school' && currentTeam?.school_id) {
      query = query.eq('scope', 'school').eq('school_id', currentTeam.school_id);
    }

    if (itemType) query = query.eq('item_type', itemType);
    if (listingType) query = query.eq('listing_type', listingType);
    if (keyword) query = query.ilike('item_name', `%${keyword}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, pageSize, total: count || 0 },
    });
  } catch (error: any) {
    return safeError(error);
  }
}

// 创建挂单
export async function POST(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const body = await request.json();
    const input: CreateListingInput = body;

    const validation = validateCreateListing(input);
    if (!validation.valid) {
      return ApiErrors.validation((validation as any).message);
    }

    const { data: currentTeam } = await supabase
      .from('teams')
      .select('current_theme_id, school_id')
      .eq('id', teamId)
      .single();
    if (!currentTeam) return ApiErrors.notFound('小队不存在');

    let finalThemeId = input.themeId;
    let finalSchoolId = input.schoolId;
    if (input.scope === 'theme') {
      if (!finalThemeId) finalThemeId = currentTeam.current_theme_id;
      if (!finalThemeId) return ApiErrors.validation('当前小队未选择任务主题');
    } else if (input.scope === 'school') {
      if (!finalSchoolId) finalSchoolId = currentTeam.school_id;
      if (!finalSchoolId) return ApiErrors.validation('当前小队未关联学校');
    }

    if (input.listingType !== 'buy' && input.itemRef) {
      if (input.itemType === 'work') {
        const { data: submission, error: subErr } = await supabase
          .from('task_submissions')
          .select('id, team_id, status')
          .eq('id', input.itemRef)
          .single();
        if (subErr || !submission || submission.team_id !== teamId) {
          return ApiErrors.validation('物品不属于当前小队');
        }
      } else {
        const { data: userReward, error: urErr } = await supabase
          .from('user_rewards')
          .select('reward_id, reward:reward_id(type)')
          .eq('id', input.itemRef)
          .single();
        if (urErr || !userReward) {
          return ApiErrors.validation('物品不属于当前小队');
        }
        const rewardType = (userReward.reward as any)?.type;
        if (input.itemType === 'tool' && !isToolRewardType(rewardType)) {
          return ApiErrors.validation('物品类型不匹配（期望工具类）');
        }
        if (input.itemType === 'skill' && !isSkillRewardType(rewardType)) {
          return ApiErrors.validation('物品类型不匹配（期望技能类）');
        }
        const { count: ownedCount } = await supabase
          .from('user_rewards')
          .select('id', { count: 'exact', head: true })
          .eq('reward_id', userReward.reward_id)
          .eq('team_id', teamId);
        const { data: myListings } = await supabase
          .from('cloud_market_listings')
          .select('quantity')
          .eq('team_id', teamId)
          .eq('item_ref', input.itemRef)
          .eq('status', 'active');
        const listedCount = (myListings || []).reduce((sum, l) => sum + l.quantity, 0);
        if ((ownedCount || 0) < input.quantity + listedCount) {
          return ApiErrors.validation(`持有数量不足（持有${ownedCount}，已挂单${listedCount}，本次上架${input.quantity}）`);
        }
      }
    }

    const { data: listing, error: insertErr } = await supabase
      .from('cloud_market_listings')
      .insert({
        team_id: teamId,
        listing_type: input.listingType,
        item_type: input.itemType,
        item_ref: input.itemRef || null,
        item_name: input.itemName,
        item_description: input.itemDescription || null,
        item_image_url: input.itemImageUrl || null,
        quantity: input.quantity,
        available_quantity: input.quantity,
        price: input.price ?? null,
        barter_for: input.barterFor || null,
        scope: input.scope,
        theme_id: finalThemeId || null,
        school_id: finalSchoolId || null,
        status: 'active',
        expires_at: input.expiresAt || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, data: listing });
  } catch (error: any) {
    console.error('[market/create] 错误:', error);
    return safeError(error);
  }
}
