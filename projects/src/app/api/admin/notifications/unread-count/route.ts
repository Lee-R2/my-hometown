import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAnyAuth, authError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取管理员/志愿者的未读通知数量
 * GET /api/admin/notifications/unread-count?userId=xxx&userRole=xxx
 */

export async function GET(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const userRole = searchParams.get('userRole');

    if (!userId) {
      return ApiErrors.validation('缺少用户ID');
    }

    const client = getSupabaseClient();

    // 查询未读通知数量
    const { count, error } = await client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .or(`target_id.eq.${userId},target_type.eq.all${userRole === 'admin' || userRole === 'super_admin' ? ',target_type.eq.admin' : ''}${userRole === 'volunteer' ? ',target_type.eq.volunteer' : ''}${userRole === 'teacher' ? ',target_type.eq.teacher' : ''}`);

    if (error) {
      console.error('获取未读通知数量失败:', error);
      return ApiErrors.validation('获取失败');
    }

    return NextResponse.json({ 
      success: true,
      count: count || 0 
    });
  } catch (error) {
    console.error('获取未读通知数量失败:', error);
    return ApiErrors.validation('获取未读通知数量失败');
  }
}
