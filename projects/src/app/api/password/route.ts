import { requireAnyAuth, requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword, verifyPassword } from '@/lib/security';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  // 频率限制：每小时最多3次密码修改
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(`${ip}_${auth.payload?.userId || 'anon'}`, 'sensitive');
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.message || '密码修改过于频繁，请稍后再试' },
      { status: 429 }
    );
  }

  try {
    const { userId, oldPassword, newPassword } = await request.json();

    if (!userId || !oldPassword || !newPassword) {
      return ApiErrors.validation('缺少必要参数');
    }

    if (newPassword.length < 6) {
      return ApiErrors.validation('密码长度至少6位');
    }

    const client = getSupabaseClient();

    const { data: user, error: fetchError } = await client
      .from('users')
      .select('id, password')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return ApiErrors.notFound('用户不存在');
    }

    if (!verifyPassword(oldPassword, user.password)) {
      return NextResponse.json(
        { error: '原密码错误' },
        { status: 401 }
      );
    }

    const { error: updateError } = await client
      .from('users')
      .update({
        password: hashPassword(newPassword),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('更新密码错误:', updateError);
      return supabaseErrorResponse(updateError, '密码更新失败');
    }

    return NextResponse.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    return ApiErrors.validation('密码修改失败，请稍后重试');
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { targetId, targetType } = await request.json();

    if (!targetId || !targetType) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 身份从认证令牌获取，防止客户端伪造
    const operatorId = auth.payload!.userId;

    const client = getSupabaseClient();

    const { data: operator, error: operatorError } = await client
      .from('users')
      .select('id, role, school_id')
      .eq('id', operatorId)
      .single();

    if (operatorError || !operator) {
      if (operatorError) return supabaseErrorResponse(operatorError, '查询操作者失败');
      return ApiErrors.notFound('操作者不存在');
    }

    if (!['super_admin', 'admin', 'teacher'].includes(operator.role)) {
      return ApiErrors.forbidden('无权限重置密码');
    }

    const { data: targetUser, error: targetError } = await client
      .from('users')
      .select('id, role, school_id')
      .eq('id', targetId)
      .single();

    if (targetError || !targetUser) {
      return ApiErrors.notFound('目标用户不存在');
    }

    if (operator.role === 'teacher') {
      if (targetUser.role !== 'volunteer') {
        return ApiErrors.forbidden('助学老师只能重置志愿者的密码');
      }
      if (targetUser.school_id !== operator.school_id) {
        return ApiErrors.forbidden('无权限操作其他学校的用户');
      }
    }

    const defaultPassword = '123456';

    const { error: updateError } = await client
      .from('users')
      .update({
        password: hashPassword(defaultPassword),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetId);

    if (updateError) {
      console.error('重置密码错误:', updateError);
      return ApiErrors.validation('密码重置失败');
    }

    return NextResponse.json({
      success: true,
      defaultPassword,
      message: '密码已重置'
    });
  } catch (error) {
    console.error('重置密码错误:', error);
    return ApiErrors.validation('密码重置失败');
  }
}
