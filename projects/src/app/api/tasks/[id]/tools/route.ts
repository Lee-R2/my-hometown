import { NextRequest, NextResponse } from 'next/server';
import { requireAnyAuth, authError } from '@/lib/api-auth';

/**
 * 数据同步状态接口
 * 当前为 stub 实现：返回空状态，表示无更新
 * 后续可扩展为基于 lastSync 时间戳查询各表变更数量
 */

export async function GET(request: NextRequest) {
  // 安全:必须认证后才能查询同步状态,防止未授权用户枚举 teamId/userId 是否存在
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const userId = searchParams.get('userId');
  const userRole = searchParams.get('userRole');
  const lastSync = searchParams.get('lastSync');

  // 基础校验（兼容团队端与管理员端两种调用方式）
  if (!teamId && !userId) {
    return NextResponse.json(
      { success: false, error: '缺少 teamId 或 userId 参数' },
      { status: 400 }
    );
  }

  // 安全:校验查询参数与认证身份一致,防止枚举其他用户/小队
  // admin/super_admin 可能查询任意小队/用户(管理后台用),其他角色只能查自己
  const authRole = auth.payload!.role;
  const authUserId = auth.payload!.userId;
  if (authRole !== 'super_admin' && authRole !== 'admin') {
    if (teamId && teamId !== authUserId) {
      return NextResponse.json(
        { success: false, error: '无权查询其他小队的同步状态' },
        { status: 403 }
      );
    }
    if (userId && userId !== authUserId) {
      return NextResponse.json(
        { success: false, error: '无权查询其他用户的同步状态' },
        { status: 403 }
      );
    }
  }

  // stub：返回空状态，表示当前无更新
  // 真正的同步逻辑可基于 lastSync 时间戳查询各表 updated_at > lastSync 的记录数
  return NextResponse.json({
    success: true,
    hasUpdates: false,
    changes: [],
    status: {
      teams: 0,
      tasks: 0,
      submissions: 0,
      rewards: 0,
      skills: 0,
      tools: 0,
      messages: 0,
      members: 0,
      user_rewards: 0,
      task_themes: 0,
      team_side_tasks: 0,
      permissions: 0,
    },
    serverTime: Date.now(),
  });
}
