import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 获取小队偏好难度
 * GET /api/team/difficulty-preference?team_id=xxx
 */
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const team_id = auth.payload!.userId;

    if (!team_id) {
      return ApiErrors.validation('认证令牌无效');
    }

    const client = getAuthenticatedClient(request, auth);

    const { data, error } = await client
      .from('teams')
      .select('preferred_difficulty')
      .eq('id', team_id)
      .single();

    if (error) {
      return supabaseErrorResponse(error, '获取难度偏好失败');
    }

    return NextResponse.json({
      success: true,
      preferred_difficulty: data?.preferred_difficulty || 'medium',
    });
  } catch (error) {
    console.error('获取难度偏好错误:', error);
    return safeError(error);
  }
}

/**
 * 更新小队偏好难度
 * PUT /api/team/difficulty-preference
 * Body: { team_id, difficulty }
 */
export async function PUT(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    // 强制使用认证令牌中的 userId 作为 team_id，防止横向越权
    const team_id = auth.payload!.userId;
    const { difficulty } = body;

    if (!team_id) {
      return ApiErrors.validation('认证令牌无效');
    }

    if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
      return ApiErrors.validation('难度参数无效，应为 easy/medium/hard');
    }

    const client = getAuthenticatedClient(request, auth);

    const { error } = await client
      .from('teams')
      .update({ preferred_difficulty: difficulty })
      .eq('id', team_id);

    if (error) {
      return supabaseErrorResponse(error, '更新难度偏好失败');
    }

    return NextResponse.json({
      success: true,
      message: '难度偏好已更新',
      preferred_difficulty: difficulty,
    });
  } catch (error) {
    console.error('更新难度偏好错误:', error);
    return safeError(error);
  }
}
