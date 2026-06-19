import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 使用服务角色密钥直接访问数据库，绕过RLS（未配置时自动回退到 anon key）
const supabaseAdmin = getSupabaseAdminClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    
    const { data: question, error } = await supabaseAdmin
      .from('pretest_questions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !question) {
      return ApiErrors.notFound('题目不存在');
    }

    // options列现在存储纯数组，兼容旧格式
    const mappedQuestion = {
      ...question,
      options: Array.isArray(question.options) ? question.options : (question.options?.choices || []),
    };

    return NextResponse.json({ success: true, question: mappedQuestion });
  } catch (error) {
    console.error('获取题目失败:', error);
    return safeError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, question_type, options, dimension, part, is_active, order_index } = body;

    if (!title?.trim()) {
      return ApiErrors.validation('题目内容不能为空');
    }

    const { data: question, error } = await supabaseAdmin
      .from('pretest_questions')
      .update({
        title: title.trim(),
        description: description?.trim() || null,
        question_type,
        dimension: dimension || null,
        part: part || null,
        is_required: true,
        options: options || [],
        is_active: is_active !== undefined ? is_active : true,
        order_index: order_index !== undefined ? order_index : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新题目失败:', error);
      return supabaseErrorResponse(error, '更新题目失败');
    }

    // options列现在存储纯数组，兼容旧格式
    const mappedQuestion = {
      ...question,
      options: Array.isArray(question.options) ? question.options : (question.options?.choices || []),
    };

    return NextResponse.json({ success: true, question: mappedQuestion });
  } catch (error) {
    console.error('更新题目失败:', error);
    return safeError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const body = await request.json();
    const { is_active } = body;

    const { data: question, error } = await supabaseAdmin
      .from('pretest_questions')
      .update({
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新题目失败:', error);
      return ApiErrors.validation('更新题目失败');
    }

    // options列现在存储纯数组，兼容旧格式
    const mappedQuestion = {
      ...question,
      options: Array.isArray(question.options) ? question.options : (question.options?.choices || []),
    };

    return NextResponse.json({ success: true, question: mappedQuestion });
  } catch (error) {
    console.error('更新题目失败:', error);
    return safeError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;

    const { error } = await supabaseAdmin
      .from('pretest_questions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除题目失败:', error);
      return ApiErrors.validation('删除题目失败');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除题目失败:', error);
    return ApiErrors.validation('删除题目失败');
  }
}
