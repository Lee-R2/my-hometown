import { requireAdminOrVolunteer, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取单个工具详情（包含关联的技能）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 获取工具信息
    const { data: tool, error } = await client
      .from('tools')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tool) {
      return ApiErrors.notFound('工具不存在');
    }

    // 获取关联的技能
    const { data: toolSkills } = await client
      .from('tool_skills')
      .select(`
        id,
        is_auto_add,
        skills (
          id,
          name,
          description,
          icon,
          category
        )
      `)
      .eq('tool_id', id);

    return NextResponse.json({ 
      tool: {
        ...tool,
        linkedSkills: toolSkills || [],
      }
    });
  } catch (error) {
    console.error('获取工具详情错误:', error);
    return ApiErrors.validation('获取工具详情失败');
  }
}

// 更新工具
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

    // 如果更新了性质，需要验证实物工具必须有库存
    if (body.nature === 'physical' && (body.stock === undefined || body.stock === null || body.stock === '')) {
      return ApiErrors.validation('实物工具必须设置库存数量');
    }

    // 验证实物工具必须有小队领用量
    if (body.nature === 'physical' && (body.teamLimit === undefined || body.teamLimit === null || body.teamLimit === '')) {
      return ApiErrors.validation('实物工具必须设置小队领用量');
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.imageUrl !== undefined) updateData.image_url = body.imageUrl;
    if (body.stock !== undefined) {
      updateData.stock = body.stock !== '' ? Number(body.stock) : null;
    }
    if (body.nature !== undefined) updateData.nature = body.nature;
    if (body.teamLimit !== undefined) {
      updateData.team_limit = body.teamLimit !== '' ? Number(body.teamLimit) : null;
    }
    if (body.needsReturn !== undefined) updateData.needs_return = body.needsReturn;

    const { data: tool, error } = await client
      .from('tools')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新工具失败:');
    }

    // 更新关联的技能
    if (body.linkedSkills !== undefined) {
      // 先删除现有关联
      await client
        .from('tool_skills')
        .delete()
        .eq('tool_id', id);

      // 插入新关联
      if (body.linkedSkills.length > 0) {
        const insertData = body.linkedSkills.map((skill: any) => ({
          tool_id: id,
          skill_id: skill.skillId || skill.id,
          is_auto_add: skill.isAutoAdd ?? true,
        }));

        await client
          .from('tool_skills')
          .insert(insertData);
      }
    }

    return NextResponse.json({ success: true, tool });
  } catch (error) {
    console.error('更新工具错误:', error);
    return ApiErrors.validation('更新工具失败');
  }
}

// 删除工具（软删除）
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
      .from('tools')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return supabaseErrorResponse(error, '删除工具失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除工具错误:', error);
    return ApiErrors.validation('删除工具失败');
  }
}
