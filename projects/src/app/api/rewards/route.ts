import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取奖励列表
export async function GET(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    let query = client
      .from('rewards')
      .select('*')
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data: rewards, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取奖励列表失败');
    }

    return NextResponse.json({ rewards: rewards || [] });
  } catch (error) {
    console.error('获取奖励列表错误:', error);
    return ApiErrors.validation('获取奖励列表失败');
  }
}

// 创建新奖励
export async function POST(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    const { data: reward, error } = await client
      .from('rewards')
      .insert({
        name: body.name,
        description: body.description,
        icon: body.icon || '🏆',
        points: body.points || 0,
        type: body.type || 'badge',
        requirement: body.requirement,
        conditions: body.conditions || [],
        condition_logic: body.conditionLogic || 'and',
        image_url: body.imageUrl,
        distribution_method: body.distributionMethod || 'auto',
      })
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '创建奖励失败:');
    }

    return NextResponse.json({ success: true, reward });
  } catch (error) {
    console.error('创建奖励错误:', error);
    return ApiErrors.validation('创建奖励失败');
  }
}
