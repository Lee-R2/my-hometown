import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

// 获取小队的技能学习记录
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;
    const taskId = searchParams.get('taskId');

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取小队当前的 theme_id 和 cycle，用于过滤当前轮次的数据
    const { data: team } = await client
      .from('teams')
      .select('current_theme_id, cycle')
      .eq('id', teamId)
      .single();

    // 如果没有当前主题，返回空数组（已完成主题后或未选择主题）
    if (!team?.current_theme_id) {
      return NextResponse.json({ learnings: [] });
    }

    // 获取当前主题下的所有任务ID
    const { data: themeTasks } = await client
      .from('tasks')
      .select('id')
      .eq('theme_id', team.current_theme_id)
      .eq('is_active', true);

    const themeTaskIds = (themeTasks || []).map(t => t.id);

    // 如果当前主题没有任务，返回空数组
    if (themeTaskIds.length === 0) {
      return NextResponse.json({ learnings: [] });
    }

    // 查询技能学习记录，只返回当前主题相关的且属于当前周期的
    let query = client
      .from('team_skill_learnings')
      .select(`
        id,
        status,
        started_at,
        completed_at,
        points_earned,
        created_at,
        cycle,
        skill_id,
        task_id,
        skills (
          id,
          name,
          description,
          icon,
          category,
          content,
          video_url
        )
      `)
      .eq('team_id', teamId)
      .eq('cycle', team.cycle) // 只查询当前周期的记录
      .in('task_id', themeTaskIds); // 只查询当前主题下的任务

    if (taskId) {
      query = query.eq('task_id', taskId);
    }

    const { data: learnings, error } = await query;

    if (error) {
      return supabaseErrorResponse(error, '获取学习记录失败');
    }

    return NextResponse.json({ learnings: learnings || [] });
  } catch (error) {
    console.error('获取学习记录错误:', error);
    return safeError(error);
  }
}

// 开始学习技能
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    // 强制使用认证令牌中的 userId 作为 teamId，防止横向越权
    const teamId = auth.payload!.userId;
    const client = getSupabaseClient();

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取小队的当前周期
    const { data: team } = await client
      .from('teams')
      .select('cycle')
      .eq('id', teamId)
      .single();

    const currentCycle = team?.cycle || 1;

    // 检查当前周期是否已存在记录
    const { data: existing } = await client
      .from('team_skill_learnings')
      .select('*')
      .eq('team_id', teamId)
      .eq('skill_id', body.skillId)
      .eq('task_id', body.taskId)
      .eq('cycle', currentCycle)
      .single();
	
    if (existing) {
      // 更新状态为进行中
      const { data: learning, error } = await client
        .from('team_skill_learnings')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return supabaseErrorResponse(error, '开始学习失败');
      }

      return NextResponse.json({ success: true, learning });
    }

    // 创建新的学习记录（包含当前周期）
    const { data: learning, error } = await client
      .from('team_skill_learnings')
      .insert({
        team_id: teamId,
        skill_id: body.skillId,
        task_id: body.taskId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        cycle: currentCycle, // 关联当前周期
      })
      .select()
      .single();

    if (error) {
      // 安全修复：不直接返回 error.message，避免泄露数据库内部信息
      return supabaseErrorResponse(error, '开始学习失败');
    }

    return NextResponse.json({ success: true, learning });
  } catch (error) {
    console.error('开始学习错误:', error);
    return safeError(error);
  }
}

// 完成技能学习
export async function PUT(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    // 强制使用认证令牌中的 userId 作为 teamId，防止横向越权
    const teamId = auth.payload!.userId;
    const client = getSupabaseClient();

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取小队的当前周期
    const { data: team } = await client
      .from('teams')
      .select('cycle')
      .eq('id', teamId)
      .single();

    const currentCycle = team?.cycle || 1;

    // 获取任务技能的积分设置
    const { data: taskSkill } = await client
      .from('task_skills')
      .select('points')
      .eq('task_id', body.taskId)
      .eq('skill_id', body.skillId)
      .single();

    const pointsEarned = taskSkill?.points || 5;

    // 更新学习记录（按周期更新）
    const { data: learning, error } = await client
      .from('team_skill_learnings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        points_earned: pointsEarned,
      })
      .eq('team_id', teamId)
      .eq('skill_id', body.skillId)
      .eq('task_id', body.taskId)
      .eq('cycle', currentCycle)
      .select()
      .single();

    if (error) {
      return supabaseErrorResponse(error, '完成学习失败');
    }

    // 给小队增加积分（乐观锁，防止并发双花）
    const { data: teamData } = await client
      .from('teams')
      .select('points')
      .eq('id', teamId)
      .single();

    if (teamData) {
      const currentPoints = teamData.points || 0;
      const { data: updatedTeam, error: pointsError } = await client
        .from('teams')
        .update({ points: currentPoints + pointsEarned })
        .eq('id', teamId)
        .eq('points', currentPoints)
        .select('id');

      if (pointsError || !updatedTeam || updatedTeam.length === 0) {
        return NextResponse.json(
          { success: false, error: '积分更新冲突，请重试' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({ 
      success: true, 
      learning,
      pointsEarned 
    });
  } catch (error) {
    console.error('完成学习错误:', error);
    return safeError(error);
  }
}
