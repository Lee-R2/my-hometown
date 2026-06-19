import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取小队详细信息
 * 安全修复：team 角色只能查自己的信息，忽略客户端传入的 team_id
 */
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('teams')
      .select('id, code, name, points, heart_shards, heart_gems, created_by, has_completed_pretest, preferred_difficulty')
      .eq('id', teamId)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return safeError(error);
  }
}
