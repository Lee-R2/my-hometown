import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';
import { verifyPassword, hashPassword, needsRehash } from '@/lib/security';

export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { teamId, oldPassword, newPassword } = await request.json();

    if (!teamId || !oldPassword || !newPassword) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 密码长度验证
    if (newPassword.length < 4 || newPassword.length > 50) {
      return ApiErrors.validation('密码长度需要在4-50个字符之间');
    }

    const client = getSupabaseClient();

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

    return NextResponse.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    return safeError(error);
  }
}
