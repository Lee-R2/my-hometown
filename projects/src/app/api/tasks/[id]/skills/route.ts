import { requireAnyAuth, requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取任务关联的技能
    const { data: taskSkills, error } = await client
      .from('task_skills')
      .select(`
        id,
        points,
        is_required,
        created_at,
        skills (
          id,
          name,
          description,
          icon,
          category,
          content,
          video_url
        )
      `)
      .eq('task_id', id);

    if (error) {
      return supabaseErrorResponse(error, '获取任务技能失败');
    }

    return NextResponse.json({ taskSkills: taskSkills || [] });
  } catch (error) {
    console.error('获取任务技能错误:', error);
    return ApiErrors.validation('获取任务技能失败');
  }
}

// 为任务添加技能
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    // 检查是否已存在（幂等：已存在则直接返回成功）
    const { data: existing } = await client
      .from('task_skills')
      .select('id, points, is_required')
      .eq('task_id', id)
      .eq('skill_id', body.skillId)
      .single();

    if (existing) {
      // 已存在，返回成功（支持同步场景下的幂等调用）
      return NextResponse.json({ success: true, taskSkill: existing, alreadyExists: true });
    }

    const { data: taskSkill, error } = await client
      .from('task_skills')
      .insert({
        task_id: id,
        skill_id: body.skillId,
        points: body.points || 5,
        is_required: body.isRequired ?? true,
      })
      .select(`
        id,
        points,
        is_required,
        skills (
          id,
          name,
          description,
          icon,
          category,
          content
        )
      `)
      .single();

    if (error) {
      return supabaseErrorResponse(error, '添加技能失败');
    }

    return NextResponse.json({ success: true, taskSkill });
  } catch (error) {
    console.error('添加任务技能错误:', error);
    return ApiErrors.validation('添加技能失败');
  }
}

// 批量更新任务技能
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    // 先删除现有技能
    await client
      .from('task_skills')
      .delete()
      .eq('task_id', id);

    // 批量插入新技能
    if (body.skills && body.skills.length > 0) {
      const insertData = body.skills.map((skill: any) => ({
        task_id: id,
        skill_id: skill.skillId || skill.id,
        points: skill.points || 5,
        is_required: skill.isRequired ?? true,
      }));

      const { error } = await client
        .from('task_skills')
        .insert(insertData);

      if (error) {
        return supabaseErrorResponse(error, '更新技能失败');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新任务技能错误:', error);
    return ApiErrors.validation('更新技能失败');
  }
}

// 删除任务技能
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skillId');
    const client = getSupabaseClient();

    if (!skillId) {
      // 删除任务的所有技能
      const { error } = await client
        .from('task_skills')
        .delete()
        .eq('task_id', id);

      if (error) {
        return supabaseErrorResponse(error, '删除技能失败');
      }
    } else {
      // 删除特定技能
      const { error } = await client
        .from('task_skills')
        .delete()
        .eq('task_id', id)
        .eq('skill_id', skillId);

      if (error) {
        return supabaseErrorResponse(error, '删除技能失败');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除任务技能错误:', error);
    return ApiErrors.validation('删除技能失败');
  }
}
