import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 获取待审核家长列表
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const schoolId = searchParams.get('schoolId');

    let query = supabase
      .from('parents')
      .select(`
        id,
        phone,
        name,
        school_id,
        school_name,
        status,
        created_at,
        reviewed_by,
        reviewed_at,
        review_remark
      `)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data: parents, error } = await query;

    if (error) {
      return ApiErrors.validation('获取列表失败');
    }

    // 对手机号脱敏后再返回，避免明文泄露
    const maskedParents = (parents || []).map((p: any) => ({
      ...p,
      phone: maskPhone(p.phone),
    }));

    return NextResponse.json({
      success: true,
      parents: maskedParents
    });

  } catch (error: any) {
    console.error('[获取家长列表] 错误:', error);
    return safeError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { parentId, action, remark, reviewerId } = body;

    if (!parentId || !action) {
      return ApiErrors.validation('缺少必要参数');
    }

    if (!['approve', 'reject'].includes(action)) {
      return ApiErrors.validation('无效的操作');
    }

    // 更新审核状态
    const { error } = await supabase
      .from('parents')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: auth.payload!.userId,
        reviewed_at: new Date().toISOString(),
        review_remark: remark || null
      })
      .eq('id', parentId);

    if (error) {
      return ApiErrors.validation('审核操作失败');
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? '已通过审核' : '已拒绝'
    });

  } catch (error: any) {
    console.error('[审核家长] 错误:', error);
    return safeError(error);
  }
}
