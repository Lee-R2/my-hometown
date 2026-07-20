import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { checkAiRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/ai/create-theme
 * 蜡象助手创建任务主题API
 * 
 * 必填字段：name, description
 * 可选字段：icon, is_exclusive, school_id, created_by
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_create_theme');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const {
      name,
      description,
      icon = '🎯',
      is_exclusive = false,
      school_id = null,
      created_by,
    } = body;

    // 校验必填字段
    if (!name || !name.trim()) {
      return ApiErrors.validation('主题名称不能为空');
    }

    if (!description || !description.trim()) {
      return ApiErrors.validation('主题描述不能为空');
    }

    // 名称长度校验
    if (name.trim().length > 50) {
      return ApiErrors.validation('主题名称不能超过50个字');
    }

    // 描述长度校验
    if (description.trim().length > 500) {
      return ApiErrors.validation('主题描述不能超过500个字');
    }

    // 专属主题必须关联学校，否则创建后小队端无法看到（幽灵主题）
      if (is_exclusive && !school_id) {
      return ApiErrors.validation('专属主题必须关联一所学校，请指定学校后再创建');
    }

    // 校验主题名称唯一
    const supabase = getSupabaseAdminClient();
    const { data: existing, error: checkError } = await supabase
      .from('task_themes')
      .select('id, name')
      .eq('name', name.trim())
      .eq('is_active', true)
      .limit(1);

    if (checkError) {
      console.error('[创建主题] 查询失败:', checkError);
      return ApiErrors.validation('查询主题失败');
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: `主题「${name}」已存在，请更换名称` },
        { status: 409 }
      );
    }

    // 获取当前最大排序
    const { data: maxOrder } = await supabase
      .from('task_themes')
      .select('order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrder = (maxOrder?.[0]?.order_index ?? 0) + 1;

    // 插入主题（只创建主题，不创建阶段任务）
    const insertData: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      icon,
      is_exclusive,
      is_active: true,
      order_index: nextOrder,
      created_by: created_by || null,
    };

    // 专属主题才关联学校
    if (is_exclusive && school_id) {
      insertData.school_id = school_id;
    }

    const { data: newTheme, error: insertError } = await supabase
      .from('task_themes')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('[创建主题] 插入失败:', insertError);
      return NextResponse.json(
        { success: false, error: `创建主题失败: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log(`[创建主题] 成功: ${name} (ID: ${newTheme.id})`);

    return NextResponse.json({
      success: true,
      theme: newTheme,
      message: `主题「${name}」创建成功！接下来可以在任务管理中为该主题配置各阶段任务。`,
    });

  } catch (error) {
    console.error('[创建主题] 异常:', error);
    return ApiErrors.validation('创建主题失败，请稍后重试');
  }
}

/**
 * GET /api/ai/create-theme
 * 查询现有主题列表（供蜡象助手参考）
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const supabase = getSupabaseAdminClient();
    const { data: themes, error } = await supabase
      .from('task_themes')
      .select('id, name, description, icon, is_exclusive, school_id, order_index, created_at')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      return ApiErrors.validation('查询主题列表失败');
    }

    return NextResponse.json({
      success: true,
      themes: themes || [],
      total: themes?.length || 0,
    });
  } catch (error) {
    console.error('[创建主题-查询] 异常:', error);
    return ApiErrors.validation('查询失败');
  }
}
