import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = client
      .from('tools')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: tools, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取工具列表失败');
    }

    return NextResponse.json({ tools: tools || [] });
  } catch (error) {
    console.error('获取工具列表错误:', error);
    return ApiErrors.validation('获取工具列表失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    if (body.nature === 'physical' && (body.stock === undefined || body.stock === null || body.stock === '')) {
      return ApiErrors.validation('实物工具必须设置库存数量');
    }

    if (body.nature === 'physical' && (body.teamLimit === undefined || body.teamLimit === null || body.teamLimit === '')) {
      return ApiErrors.validation('实物工具必须设置小队领用量');
    }

    const { data: tool, error } = await client
      .from('tools')
      .insert({
        name: body.name,
        description: body.description,
        icon: body.icon || '🔧',
        category: body.category,
        image_url: body.imageUrl,
        stock: body.stock !== undefined && body.stock !== '' ? Number(body.stock) : null,
        nature: body.nature || 'physical',
        team_limit: body.teamLimit !== undefined && body.teamLimit !== '' ? Number(body.teamLimit) : null,
        needs_return: body.needsReturn !== undefined ? body.needsReturn : true,
      })
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '创建工具失败');
    }

    return NextResponse.json({ success: true, tool });
  } catch (error) {
    console.error('创建工具错误:', error);
    return ApiErrors.validation('创建工具失败');
  }
}