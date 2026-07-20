import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors, supabaseErrorResponse } from '@/lib/api-error';

/**
 * 获取小队详细信息
 * 安全修复：team 角色只能查自己的信息，忽略客户端传入的 team_id
 */
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('teams')
      .select('id, code, name, points, heart_shards, heart_gems, created_by, has_completed_pretest, preferred_difficulty')
      .eq('id', teamId)
      .single();

    if (error) {
      // 安全修复：不直接返回 error.message，避免泄露数据库内部信息
      // 生产环境返回通用消息，开发环境通过 supabaseErrorResponse 返回调试详情
      return supabaseErrorResponse(error, '获取小队信息失败');
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return safeError(error);
  }
}
