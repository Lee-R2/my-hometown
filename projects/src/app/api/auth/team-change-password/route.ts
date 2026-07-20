import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { verifyPassword, hashPassword, needsRehash } from '@/lib/security';
import { invalidateAllUserSessions } from '@/lib/session';

export async function POST(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { teamId: bodyTeamId, oldPassword, newPassword } = await request.json();

    if (!oldPassword || !newPassword) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 密码长度验证
    if (newPassword.length < 4 || newPassword.length > 50) {
      return ApiErrors.validation('密码长度需要在4-50个字符之间');
    }

    // 安全:强制使用认证身份作为操作目标,防止越权修改其他小队密码
    // 请求体中的 teamId 仅作兼容校验,若与登录身份不一致则拒绝
    const authenticatedTeamId = auth.payload!.userId;
    if (bodyTeamId && bodyTeamId !== authenticatedTeamId) {
      return ApiErrors.forbidden('无权修改其他小队的密码');
    }
    const teamId = authenticatedTeamId;

    const client = getSupabaseAdminClient();

    // 验证旧密码
    const { data: team, error: fetchError } = await client
      .from('teams')
      .select('id, password')
      .eq('id', teamId)
      .single();

    if (fetchError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    // 验证旧密码是否正确
    if (!verifyPassword(oldPassword, team.password)) {
      return NextResponse.json(
        { error: '原密码错误' },
        { status: 401 }
      );
    }

    // 更新密码（使用 bcrypt 哈希）
    const { error: updateError } = await client
      .from('teams')
      .update({
        password: hashPassword(newPassword),
        updated_at: new Date().toISOString()
      })
      .eq('id', teamId);

    if (updateError) {
      console.error('更新密码错误:', updateError);
      return ApiErrors.validation('密码更新失败');
    }

    // SEC-008: 密码修改后失效该小队的所有已有会话
    await invalidateAllUserSessions(teamId);

    return NextResponse.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    return safeError(error);
  }
}
