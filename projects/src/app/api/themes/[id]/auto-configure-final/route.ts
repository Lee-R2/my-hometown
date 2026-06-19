import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * POST: 一键自动配置最后任务表单
 * 查找 final_task_forms 中按角色匹配的表单，自动关联到指定主题
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { id: themeId } = await params;
    const client = getSupabaseClient();

    // 1. 检查主题是否存在
    const { data: theme, error: themeError } = await client
      .from('task_themes')
      .select('id, name')
      .eq('id', themeId)
      .single();

    if (themeError || !theme) {
      return ApiErrors.notFound('主题不存在');
    }

    // 2. 查找所有激活的最后任务表单，按角色分组
    const { data: forms, error: formsError } = await client
      .from('final_task_forms')
      .select('id, name, team_role, theme_id, is_global, school_id')
      .eq('is_active', true);

    if (formsError) {
      return ApiErrors.validation('查询表单失败');
    }

    // 3. 按角色匹配表单
    // 优先匹配：1) 专属该主题的表单 > 2) 专属该主题所属学校的表单 > 3) 全局表单
    const themeSchoolId = (theme as any).school_id;
    
    const roleForms: Record<string, string | null> = {
      guider: null,
      light_mage: null,
      secret_scholar: null,
    };

    const roleNames: Record<string, string> = {
      guider: '指引者',
      light_mage: '光影法师',
      secret_scholar: '秘语学者',
    };

    for (const role of Object.keys(roleForms)) {
      const roleCandidates = forms?.filter(f => f.team_role === role) || [];
      
      // 优先级1：专属该主题的表单
      let match = roleCandidates.find(f => f.theme_id === themeId);
      
      // 优先级2：专属该主题所属学校的表单
      if (!match && themeSchoolId) {
        match = roleCandidates.find(f => f.school_id === themeSchoolId && !f.theme_id);
      }
      
      // 优先级3：全局表单
      if (!match) {
        match = roleCandidates.find(f => f.is_global && !f.theme_id && !f.school_id);
      }
      
      // 优先级4：任意匹配角色的表单
      if (!match && roleCandidates.length > 0) {
        match = roleCandidates[0];
      }

      if (match) {
        roleForms[role] = match.id;
      }
    }

    // 4. 更新主题的角色表单配置
    const updateData: Record<string, any> = {
      guider_form_id: roleForms.guider,
      light_mage_form_id: roleForms.light_mage,
      secret_scholar_form_id: roleForms.secret_scholar,
      updated_at: new Date().toISOString(),
    };

    // 如果三个角色都有表单，也设置 final_task_form_id（兼容）
    if (roleForms.guider && roleForms.light_mage && roleForms.secret_scholar) {
      updateData.final_task_form_id = roleForms.guider; // 兼容旧逻辑
    }

    const { data: updatedTheme, error: updateError } = await client
      .from('task_themes')
      .update(updateData)
      .eq('id', themeId)
      .select()
      .single();

    if (updateError) {
      return ApiErrors.validation('更新主题配置失败');
    }

    // 5. 构建结果信息
    const configured: string[] = [];
    const missing: string[] = [];

    for (const [role, formId] of Object.entries(roleForms)) {
      if (formId) {
        const form = forms?.find(f => f.id === formId);
        configured.push(`${roleNames[role]}: ${form?.name || formId}`);
      } else {
        missing.push(roleNames[role]);
      }
    }

    return NextResponse.json({
      success: true,
      theme: updatedTheme,
      configured,
      missing,
      message: missing.length > 0
        ? `已配置: ${configured.join('、')}。缺少: ${missing.join('、')}的表单，请先在"最后任务"模块创建对应表单`
        : `已为所有角色自动配置最后任务表单: ${configured.join('、')}`,
    });
  } catch (error) {
    console.error('自动配置最后任务错误:', error);
    return ApiErrors.validation('自动配置失败');
  }
}
