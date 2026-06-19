import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

/**
 * 获取小队当前任务阶段及之前阶段的所有技能学习资料
 * 用于新知学习页面，复习模式不增加积分
 */
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取小队信息（包含周期）
    const { data: team, error: teamError } = await client
      .from('teams')
      .select('id, current_task_id, current_theme_id, cycle')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return ApiErrors.notFound('小队不存在');
    }

    const currentCycle = team.cycle || 1;

    if (!team.current_theme_id) {
      return NextResponse.json({ 
        skills: [], 
        currentStage: 0,
        message: '小队尚未选择任务主题' 
      });
    }

    // 获取当前任务信息
    let currentStage = 1;
    let currentTaskId = team.current_task_id;
    
    if (currentTaskId) {
      const { data: currentTask } = await client
        .from('tasks')
        .select('id, stage, title')
        .eq('id', currentTaskId)
        .single();
      
      if (currentTask) {
        currentStage = currentTask.stage;
      }
    }

    // 获取当前主题下当前阶段及之前阶段的所有任务
    const { data: tasks, error: tasksError } = await client
      .from('tasks')
      .select('id, title, stage, task_type')
      .eq('theme_id', team.current_theme_id)
      .eq('is_active', true)
      .lte('stage', currentStage)
      .order('stage', { ascending: true });

    if (tasksError) {
      console.error('获取任务列表失败:', tasksError);
      return ApiErrors.validation('获取任务列表失败');
    }

    const taskIds = (tasks || []).map(t => t.id);

    if (taskIds.length === 0) {
      return NextResponse.json({ 
        skills: [], 
        currentStage,
        tasks: [],
      });
    }

    // 获取这些任务关联的所有技能
    const { data: taskSkills, error: taskSkillsError } = await client
      .from('task_skills')
      .select(`
        id,
        task_id,
        skill_id,
        points,
        is_required,
        skills (
          id,
          name,
          description,
          icon,
          category,
          content,
          video_url,
          learning_materials,
          is_required
        ),
        tasks (
          id,
          title,
          stage
        )
      `)
      .in('task_id', taskIds);

    if (taskSkillsError) {
      console.error('获取技能列表失败:', taskSkillsError);
      return ApiErrors.validation('获取技能列表失败');
    }

    // 获取小队对这些技能的学习状态（按当前周期过滤）
    const skillIds = (taskSkills || []).map(ts => ts.skill_id);
    let learningStatusMap: Record<string, any> = {};

    if (skillIds.length > 0) {
      const { data: learnings } = await client
        .from('team_skill_learnings')
        .select('*')
        .eq('team_id', teamId)
        .eq('cycle', currentCycle) // 按当前周期过滤
        .in('skill_id', skillIds);

      learningStatusMap = (learnings || []).reduce((acc, l) => {
        acc[l.skill_id] = l;
        return acc;
      }, {} as Record<string, any>);
    }

    // 组装数据 - 按阶段分组
    const skillsByStage: Record<number, any[]> = {};
    
    (taskSkills || []).forEach(ts => {
      const skill = ts.skills as any;
      const task = ts.tasks as any;
      const stage = task?.stage || 1;
      
      if (!skillsByStage[stage]) {
        skillsByStage[stage] = [];
      }

      // 检查是否已添加过该技能（去重）
      const existingSkill = skillsByStage[stage].find(s => s.id === skill?.id);
      if (!existingSkill && skill) {
        skillsByStage[stage].push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          icon: skill.icon,
          category: skill.category,
          content: skill.content,
          videoUrl: skill.video_url,
          learningMaterials: skill.learning_materials,
          skillIsRequired: skill.is_required !== false,
          taskId: ts.task_id,
          taskTitle: task?.title,
          taskStage: stage,
          points: ts.points,
          isRequired: ts.is_required,
          // 学习状态
          learningStatus: learningStatusMap[skill.id]?.status || 'not_started',
          learningStartedAt: learningStatusMap[skill.id]?.started_at,
          learningCompletedAt: learningStatusMap[skill.id]?.completed_at,
          pointsEarned: learningStatusMap[skill.id]?.points_earned || 0,
        });
      }
    });

    // 统计
    const allSkills = Object.values(skillsByStage).flat();
    const total = allSkills.length;
    const completed = allSkills.filter(s => s.learningStatus === 'completed').length;
    const inProgress = allSkills.filter(s => s.learningStatus === 'in_progress').length;

    return NextResponse.json({
      skills: allSkills,
      skillsByStage,
      currentStage,
      tasks: tasks || [],
      stats: {
        total,
        completed,
        inProgress,
        notStarted: total - completed - inProgress,
      }
    });
  } catch (error) {
    console.error('获取学习资料错误:', error);
    return safeError(error);
  }
}

/**
 * 更新技能学习状态（复习模式，不增加积分）
 */
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    // 强制使用认证令牌中的 userId 作为 teamId，防止横向越权
    const teamId = auth.payload!.userId;
    const { skillId, taskId, action, isReview } = body;
	
    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    if (!skillId) {
      return ApiErrors.validation('缺少必要参数');
    }

    const now = new Date().toISOString();

    // 获取小队的当前周期
    const { data: team } = await client
      .from('teams')
      .select('cycle')
      .eq('id', teamId)
      .single();

    const currentCycle = team?.cycle || 1;

    // 获取当前状态（按周期过滤）
    const { data: existing } = await client
      .from('team_skill_learnings')
      .select('*')
      .eq('team_id', teamId)
      .eq('skill_id', skillId)
      .eq('task_id', taskId)
      .eq('cycle', currentCycle)
      .single();

    if (action === 'start' || action === 'review_start') {
      // 开始学习（复习模式）
      if (existing) {
        // 已有记录，仅更新状态，不增加积分
        const { error } = await client
          .from('team_skill_learnings')
          .update({
            status: 'in_progress',
            started_at: existing.started_at || now, // 保留首次开始时间
          })
          .eq('id', existing.id);

        if (error) {
          return supabaseErrorResponse(error, '更新失败');
        }
      } else {
        // 新建记录，但标记为复习模式（不增加积分）
        const { error } = await client
          .from('team_skill_learnings')
          .insert({
            team_id: teamId,
            skill_id: skillId,
            task_id: taskId,
            status: 'in_progress',
            started_at: now,
            cycle: currentCycle, // 关联当前周期
          });

        if (error) {
          return supabaseErrorResponse(error, '创建失败');
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: '开始学习',
        isReview: true,
        pointsEarned: 0
      });
    } else if (action === 'complete' || action === 'review_complete') {
      // 完成学习（复习模式，不增加积分）
      if (existing) {
        // 检查是否已经获得过积分
        const alreadyEarnedPoints = existing.points_earned > 0;
        
        const { error } = await client
          .from('team_skill_learnings')
          .update({
            status: 'completed',
            completed_at: now,
            // 如果已经获得过积分，保留；否则不增加
          })
          .eq('id', existing.id);

        if (error) {
          return supabaseErrorResponse(error, '更新失败');
        }

        return NextResponse.json({ 
          success: true, 
          message: alreadyEarnedPoints ? '复习完成（已获得过积分）' : '学习完成（复习模式，不计积分）',
          isReview: true,
          pointsEarned: 0,
          alreadyEarnedPoints
        });
      } else {
        // 新建记录
        const { error } = await client
          .from('team_skill_learnings')
          .insert({
            team_id: teamId,
            skill_id: skillId,
            task_id: taskId,
            status: 'completed',
            started_at: now,
            completed_at: now,
            points_earned: 0, // 复习模式不增加积分
            cycle: currentCycle, // 关联当前周期
          });

        if (error) {
          return supabaseErrorResponse(error, '创建失败');
        }

        return NextResponse.json({ 
          success: true, 
          message: '学习完成（复习模式，不计积分）',
          isReview: true,
          pointsEarned: 0
        });
      }
    }

    return ApiErrors.validation('无效操作');
  } catch (error) {
    console.error('更新学习状态错误:', error);
    return safeError(error);
  }
}
