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

    // 获取任务关联的工具
    const { data: taskTools, error } = await client
      .from('task_tools')
      .select(`
        id,
        is_required,
        created_at,
        tools (
          id,
          name,
          description,
          icon,
          category
        )
      `)
      .eq('task_id', id);

    if (error) {
      return supabaseErrorResponse(error, '获取任务工具失败');
    }

    return NextResponse.json({ taskTools: taskTools || [] });
  } catch (error) {
    console.error('获取任务工具错误:', error);
    return ApiErrors.validation('获取任务工具失败');
  }
}

// 为任务添加工具
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
      .from('task_tools')
      .select('id, is_required')
      .eq('task_id', id)
      .eq('tool_id', body.toolId)
      .single();

    if (existing) {
      // 已存在，返回成功（支持同步场景下的幂等调用）
      return NextResponse.json({ success: true, taskTool: existing, autoAddedSkills: [], alreadyExists: true });
    }

    const { data: taskTool, error } = await client
      .from('task_tools')
      .insert({
        task_id: id,
        tool_id: body.toolId,
        is_required: body.isRequired ?? true,
      })
      .select(`
        id,
        is_required,
        tools (
          id,
          name,
          description,
          icon,
          category
        )
      `)
      .single();

    if (error) {
      return supabaseErrorResponse(error, '添加工具失败');
    }

    // 自动添加关联的技能（如果设置了is_auto_add）
    let autoAddedSkills: string[] = [];
    if (body.autoAddSkills !== false) {
      const { data: toolSkills } = await client
        .from('tool_skills')
        .select('skill_id, is_auto_add')
        .eq('tool_id', body.toolId)
        .eq('is_auto_add', true);

      if (toolSkills && toolSkills.length > 0) {
        // 获取已存在的任务技能
        const { data: existingSkills } = await client
          .from('task_skills')
          .select('skill_id')
          .eq('task_id', id);

        const existingSkillIds = new Set(existingSkills?.map(s => s.skill_id) || []);

        // 过滤出不存在的技能
        const newSkillIds = toolSkills
          .map(ts => ts.skill_id)
          .filter(skillId => !existingSkillIds.has(skillId));

        if (newSkillIds.length > 0) {
          const skillInsertData = newSkillIds.map(skillId => ({
            task_id: id,
            skill_id: skillId,
            points: 5, // 默认积分
            is_required: true,
          }));

          await client
            .from('task_skills')
            .insert(skillInsertData);
          
          autoAddedSkills = newSkillIds;
        }
      }
    }

    return NextResponse.json({ success: true, taskTool, autoAddedSkills });
  } catch (error) {
    console.error('添加任务工具错误:', error);
    return ApiErrors.validation('添加工具失败');
  }
}

// 批量更新任务工具
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getSupabaseClient();

    // 先删除现有工具
    await client
      .from('task_tools')
      .delete()
      .eq('task_id', id);

    // 批量插入新工具
    if (body.tools && body.tools.length > 0) {
      const insertData = body.tools.map((tool: any) => ({
        task_id: id,
        tool_id: tool.toolId || tool.id,
        is_required: tool.isRequired ?? true,
      }));

      const { error } = await client
        .from('task_tools')
        .insert(insertData);

      if (error) {
        return supabaseErrorResponse(error, '更新工具失败');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新任务工具错误:', error);
    return ApiErrors.validation('更新工具失败');
  }
}

// 删除任务工具
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get('toolId');
    const client = getSupabaseClient();

    if (!toolId) {
      // 删除任务的所有工具
      const { error } = await client
        .from('task_tools')
        .delete()
        .eq('task_id', id);

      if (error) {
        return supabaseErrorResponse(error, '删除工具失败');
      }
    } else {
      // 删除特定工具
      const { error } = await client
        .from('task_tools')
        .delete()
        .eq('task_id', id)
        .eq('tool_id', toolId);

      if (error) {
        return supabaseErrorResponse(error, '删除工具失败');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除任务工具错误:', error);
    return ApiErrors.validation('删除工具失败');
  }
}
