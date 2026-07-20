import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 使用服务角色密钥直接访问数据库，绕过RLS（未配置时自动回退到 anon key）
const supabaseAdmin = getSupabaseAdminClient();

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { data: questions, error } = await supabaseAdmin
      .from('pretest_questions')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取题目失败:', error);
      return supabaseErrorResponse(error, '获取题目失败');
    }

    // options列现在存储纯数组 [{label, value}]，兼容旧格式 {choices: [...]}
    const mappedQuestions = (questions || []).map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : (q.options?.choices || []),
    }));

    return NextResponse.json({ success: true, questions: mappedQuestions });
  } catch (error) {
    console.error('获取题目失败:', error);
    return safeError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { title, description, question_type, options, dimension, part, is_active, order_index } = body;

    if (!title?.trim()) {
      return ApiErrors.validation('题目内容不能为空');
    }

    // 获取当前最大排序
    const { data: maxOrder } = await supabaseAdmin
      .from('pretest_questions')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)
      .single();

    const newOrderIndex = order_index ?? ((maxOrder?.order_index || 0) + 1);

    const { data: question, error } = await supabaseAdmin
      .from('pretest_questions')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        question_type,
        dimension: dimension || null,
        part: part || null,
        is_required: true,
        options: options || [],
        is_active: is_active !== undefined ? is_active : true,
        order_index: newOrderIndex,
      })
      .select()
      .single();

    if (error) {
      console.error('创建题目失败:', error);
      return ApiErrors.validation('创建题目失败');
    }

    // options列现在存储纯数组，兼容旧格式
    const mappedQuestion = {
      ...question,
      options: Array.isArray(question.options) ? question.options : (question.options?.choices || []),
    };

    return NextResponse.json({ success: true, question: mappedQuestion });
  } catch (error) {
    console.error('创建题目失败:', error);
    return ApiErrors.validation('创建题目失败');
  }
}
