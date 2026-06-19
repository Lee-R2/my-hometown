import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取单个技能详情（包含关联的工具）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取技能信息
    const { data: skill, error } = await client
      .from('skills')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !skill) {
      return ApiErrors.notFound('技能不存在');
    }

    // 获取关联的工具
    const { data: skillTools } = await client
      .from('tool_skills')
      .select(`
        id,
        is_auto_add,
        tools (
          id,
          name,
          description,
          icon,
          category,
          image_url
        )
      `)
      .eq('skill_id', id);

    return NextResponse.json({ 
      skill: {
        ...skill,
        linkedTools: skillTools || [],
      }
    });
  } catch (error) {
    console.error('获取技能详情错误:', error);
    return ApiErrors.validation('获取技能详情失败');
  }
}

// 更新技能
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    const updateData: Record<string, any> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.videoUrl !== undefined) updateData.video_url = body.videoUrl;
    if (body.usage !== undefined) updateData.usage = body.usage;
    if (body.learningMaterials !== undefined) updateData.learning_materials = body.learningMaterials;
    if (body.isRequired !== undefined) updateData.is_required = body.isRequired;

    const { data: skill, error } = await client
      .from('skills')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新技能失败:');
    }

    // 更新关联的工具
    if (body.linkedTools !== undefined) {
      // 先删除现有关联
      await client
        .from('tool_skills')
        .delete()
        .eq('skill_id', id);

      // 插入新关联
      if (body.linkedTools.length > 0) {
        const insertData = body.linkedTools.map((tool: any) => ({
          tool_id: tool.toolId || tool.id,
          skill_id: id,
          is_auto_add: tool.isAutoAdd ?? true,
        }));

        await client
          .from('tool_skills')
          .insert(insertData);
      }
    }

    return NextResponse.json({ success: true, skill });
  } catch (error) {
    console.error('更新技能错误:', error);
    return ApiErrors.validation('更新技能失败');
  }
}

// 删除技能（软删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 软删除
    const { error } = await client
      .from('skills')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return supabaseErrorResponse(error, '删除技能失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除技能错误:', error);
    return ApiErrors.validation('删除技能失败');
  }
}
