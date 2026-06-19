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

    const { data: theme, error } = await client
      .from('task_themes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !theme) {
      return ApiErrors.notFound('主题不存在');
    }

    // 获取该主题下的任务组数量（按 task_group_id 去重）
    const { data: taskGroups } = await client
      .from('tasks')
      .select('task_group_id')
      .eq('theme_id', id)
      .eq('is_active', true);

    const taskGroupCount = new Set((taskGroups || []).map((t: { task_group_id: string | null }) => t.task_group_id)).size;

    // 获取已选择该主题的小队数量
    const { count: teamCount } = await client
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('current_theme_id', id);

    return NextResponse.json({ 
      theme: {
        ...theme,
        taskCount: taskGroupCount,
        teamCount: teamCount || 0,
      }
    });
  } catch (error) {
    console.error('获取主题详情错误:', error);
    return ApiErrors.validation('获取主题详情失败');
  }
}

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

    const { 
      userId, 
      userRole, 
      schoolIds, 
      finalTaskFormId, // 保留兼容性
      guiderFormId,
      lightMageFormId,
      secretScholarFormId,
      ...themeData 
    } = body;

    // 构建更新数据
    const updateData: Record<string, any> = {
      ...themeData,
      updated_at: new Date().toISOString(),
    };

    // 如果更新了主题名称，检查重名（同一范围内不允许同名）
    if (themeData.name && themeData.name.trim()) {
      const trimmedName = themeData.name.trim();
      // 先获取当前主题信息，判断其范围
      const { data: currentTheme } = await client
        .from('task_themes')
        .select('id, is_exclusive, school_id')
        .eq('id', id)
        .maybeSingle();

      if (currentTheme) {
        let dupQuery = client
          .from('task_themes')
          .select('id, name')
          .eq('name', trimmedName)
          .eq('is_active', true)
          .neq('id', id); // 排除自身

        if (currentTheme.is_exclusive && currentTheme.school_id) {
          dupQuery = dupQuery.eq('school_id', currentTheme.school_id);
        } else {
          dupQuery = dupQuery.eq('is_exclusive', false);
        }

        const { data: dupTheme } = await dupQuery.maybeSingle();
        if (dupTheme) {
          return ApiErrors.conflict(
            currentTheme.is_exclusive
              ? '该学校下已存在同名主题，请使用其他名称'
              : '已存在同名公共主题，请使用其他名称'
          );
        }
      }
    }

    // 处理最后任务表单ID（兼容旧逻辑）
    if (finalTaskFormId !== undefined) {
      updateData.final_task_form_id = finalTaskFormId || null;
    }

    // 处理三个角色的表单ID
    if (guiderFormId !== undefined) {
      updateData.guider_form_id = guiderFormId || null;
    }
    if (lightMageFormId !== undefined) {
      updateData.light_mage_form_id = lightMageFormId || null;
    }
    if (secretScholarFormId !== undefined) {
      updateData.secret_scholar_form_id = secretScholarFormId || null;
    }

    // 更新主题基本信息
    const { data: theme, error } = await client
      .from('task_themes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '更新主题失败');
    }

    return NextResponse.json({ success: true, theme });
  } catch (error) {
    console.error('更新主题错误:', error);
    return ApiErrors.validation('更新主题失败');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id } = await params;
    const client = getSupabaseClient();

    // 检查主题下是否有任务
    const { count: taskCount } = await client
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('theme_id', id)
      .eq('is_active', true);

    if (taskCount && taskCount > 0) {
      return ApiErrors.validation('该主题下已有任务，无法删除');
    }

    const { error } = await client
      .from('task_themes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return supabaseErrorResponse(error, '删除主题失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除主题错误:', error);
    return ApiErrors.validation('删除主题失败');
  }
}
