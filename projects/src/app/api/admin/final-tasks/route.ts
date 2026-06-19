import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 获取最后任务表单列表
 * GET /api/admin/final-tasks
 * 
 * DB列名 → 前端字段映射:
 *   role → team_role
 *   title → name
 *   fields → form_config
 *   (school_id IS NULL) → is_global = true
 */
function mapDbToForm(dbRow: any) {
  return {
    id: dbRow.id,
    name: dbRow.title || dbRow.name || '',
    description: dbRow.description || '',
    icon: dbRow.icon || '🏆',
    is_global: dbRow.is_global ?? (dbRow.school_id === null),
    school_id: dbRow.school_id || null,
    team_role: dbRow.team_role || dbRow.role || null,
    form_config: dbRow.form_config || dbRow.fields || [],
    created_at: dbRow.created_at,
    updated_at: dbRow.updated_at || dbRow.created_at,
    is_active: dbRow.is_active ?? true,
  };
}

function mapFormToDb(body: any) {
  return {
    role: body.teamRole || null,
    title: body.name,
    description: body.description || '',
    school_id: body.isGlobal ? null : (body.schoolId || null),
    fields: body.formConfig,
  };
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const schoolId = searchParams.get('schoolId');

    let query = client
      .from('final_task_forms')
      .select('*')
      .order('created_at', { ascending: false });

    // 根据角色过滤数据
    if (role === 'admin' || role === 'super_admin') {
      // 超级管理员可以看到所有表单
    } else if (role === 'volunteer' || role === 'teacher') {
      // 志愿者和助学老师可以看到全局表单 + 本校专属表单
      query = query.or(`school_id.is.null,school_id.eq.${schoolId}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取最后任务表单失败:', error);
      return ApiErrors.validation('获取失败');
    }

    // 获取每个表单被引用的主题数量 + 映射字段
    const formsWithUsage = await Promise.all((data || []).map(async (form) => {
      const { count } = await client
        .from('themes')
        .select('id', { count: 'exact', head: true })
        .eq('final_task_form_id', form.id);
      
      return {
        ...mapDbToForm(form),
        usageCount: count || 0,
      };
    }));

    return NextResponse.json({ 
      success: true, 
      forms: formsWithUsage 
    });
  } catch (error) {
    console.error('获取最后任务表单错误:', error);
    return safeError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    const { name, formConfig, role: userRole } = body;

    // 权限验证：只有超级管理员可以创建最后任务表单
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return ApiErrors.forbidden('只有超级管理员可以创建最后任务表单');
    }

    if (!name || !formConfig) {
      return ApiErrors.validation('缺少必要参数');
    }

    const dbData = mapFormToDb(body);

    const { data, error } = await client
      .from('final_task_forms')
      .insert(dbData)
      .select()
      .single();

    if (error) {
      console.error('创建最后任务表单失败:', error);
      return supabaseErrorResponse(error, '创建最后任务表单失败');
    }

    return NextResponse.json({ 
      success: true, 
      form: mapDbToForm(data),
      message: '创建成功' 
    });
  } catch (error) {
    console.error('创建最后任务表单错误:', error);
    return ApiErrors.validation('创建最后任务表单失败');
  }
}
