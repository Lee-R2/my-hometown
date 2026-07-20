import { requireAnyAuth, requireAdminOrTeacher, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { hashPassword, verifyPassword } from '@/lib/security';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { invalidateAllUserSessions } from '@/lib/session';

export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(request);
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
    const { oldPassword, newPassword } = await request.json();
    const userId = auth.payload!.userId;

    if (!userId || !oldPassword || !newPassword) {
      return ApiErrors.validation('缺少必要参数');
    }

    if (newPassword.length < 6) {
      return ApiErrors.validation('密码长度至少6位');
    }

    const client = getSupabaseAdminClient();

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

    // SEC-008: 密码修改后失效该用户的所有已有会话,防止旧会话继续访问
    await invalidateAllUserSessions(userId);

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
  const auth = await requireAdminOrTeacher(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { targetId, targetType } = await request.json();

    if (!targetId || !targetType) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 身份从认证令牌获取，防止客户端伪造
    const operatorId = auth.payload!.userId;

    const client = getSupabaseAdminClient();

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

    // LE-A11: admin 角色也需校验学校范围(原代码仅限制 teacher,admin 可跨校重置)
    if (operator.role === 'admin') {
      if (targetUser.school_id !== operator.school_id) {
        return ApiErrors.forbidden('无权限操作其他学校的用户');
      }
    }

    // LE-A11: 默认密码改为随机 8 位字符串(原硬编码 '123456' 为弱密码)
    const defaultPassword = Math.random().toString(36).slice(2, 10);

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

    // SEC-008: 密码重置后失效目标用户的所有已有会话
    await invalidateAllUserSessions(targetId);

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
