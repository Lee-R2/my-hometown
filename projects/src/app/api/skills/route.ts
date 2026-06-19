import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取技能列表
export async function GET(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = client
      .from('skills')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: skills, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取技能列表失败');
    }

    return NextResponse.json({ skills: skills || [] });
  } catch (error) {
    console.error('获取技能列表错误', error);
    return ApiErrors.validation('获取技能列表失败');
  }
}

// 创建新技能
export async function POST(request: NextRequest) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const client = getSupabaseClient();

    const { data: skill, error } = await client
      .from('skills')
      .insert({
        name: body.name,
        description: body.description,
        icon: body.icon || '📚',
        category: body.category,
        content: body.content,
        video_url: body.videoUrl,
        usage: body.usage,
        learning_materials: body.learningMaterials,
        is_required: body.isRequired !== undefined ? body.isRequired : true,
      })
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '创建技能失败');
    }

    return NextResponse.json({ success: true, skill });
  } catch (error) {
    console.error('创建技能错误', error);
    return ApiErrors.validation('创建技能失败');
  }
}
