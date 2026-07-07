import { NextRequest, NextResponse } from 'next/server';

/**
 * 数据同步状态接口
 * 当前为 stub 实现：返回空状态，表示无更新
 * 后续可扩展为基于 lastSync 时间戳查询各表变更数量
 */

export async function GET(request: NextRequest) {
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
