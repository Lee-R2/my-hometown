import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { authenticateRequest, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取超时未提交的任务列表
 * 条件：小队有 current_task_id next_task_deadline，且 deadline 已过期，且没有该任务的待审核提交
 * 权限：admin/super_admin 可看全部；volunteer 只看自己创建的小队；teacher 看本校小队
 */
export async function GET(request: NextRequest) {
  // 认证：仅允许 admin/volunteer/teacher 角色
  const auth = authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer', 'teacher'],
  });
  if (!auth.authenticated) return authError(auth);

  try {
    // 从认证令牌获取身份，不信任客户端传入
    const callerId = auth.payload!.userId;
    const callerRole = auth.payload!.role;

    const client = getSupabaseClient();

    // 获取小队有截止日期且已过期的数量
    let teamQuery = client
      .from('teams')
      .select('id, code, name, school_id, current_task_id, next_task_deadline, created_by, points')
      .not('current_task_id', 'is', null)
      .not('next_task_deadline', 'is', null);

    // 志愿者只能看到自己创建的小队
    if (callerRole === 'volunteer') {
      teamQuery = teamQuery.eq('created_by', callerId);
    }
    // 助学老师能看到本校所有小队
    else if (callerRole === 'teacher') {
      const { data: teacherData } = await client
        .from('users')
        .select('school_id')
        .eq('id', callerId)
        .single();

      if (teacherData?.school_id) {
        teamQuery = teamQuery.eq('school_id', teacherData.school_id);
      } else {
        teamQuery = teamQuery.eq('teacher_id', callerId);
      }
    }
    // admin/super_admin 看全部，不加过滤
    
    const { data: teams, error: teamError } = await teamQuery;
    
    if (teamError) {
      console.error('获取小队数据失败:', teamError);
      return ApiErrors.validation('获取数据失败');
    }
    
    if (!teams || teams.length === 0) {
      return NextResponse.json({ overdueTasks: [] });
    }
    
    // 过滤出已超时的小队
    const now = new Date();
    const overdueTeams = teams.filter(team => 
      team.next_task_deadline && new Date(team.next_task_deadline) < now
    );
    
    if (overdueTeams.length === 0) {
      return NextResponse.json({ overdueTasks: [] });
    }
    
    // 获取这些小队的任务信息
    const taskIds = [...new Set(overdueTeams.map(t => t.current_task_id).filter(Boolean))];
    const teamIds = overdueTeams.map(t => t.id);
    
    // 获取任务详情
    const { data: tasks } = await client
      .from('tasks')
      .select('id, title, stage, points, theme_id, task_type')
      .in('id', taskIds);
    
    // 获取主题信息
    const themeIds = [...new Set((tasks || []).map(t => t.theme_id).filter(Boolean))];
    const { data: themes } = await client
      .from('task_themes')
      .select('id, name, icon')
      .in('id', themeIds);
    
    // 获取学校信息
    const schoolIds = [...new Set(overdueTeams.map(t => t.school_id).filter(Boolean))];
    const { data: schools } = await client
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);
    
    // 检查是否有待审核的提交
    const { data: pendingSubmissions } = await client
      .from('task_submissions')
      .select('team_id, task_id, status')
      .in('team_id', teamIds)
      .in('task_id', taskIds)
      .eq('status', 'pending');
    
    // 构建已有提交的集合
    const submissionSet = new Set(
      (pendingSubmissions || []).map(s => `${s.team_id}-${s.task_id}`)
    );
    
    // 组装数据
    const taskMap = new Map((tasks || []).map(t => [t.id, t]));
    const themeMap = new Map((themes || []).map(t => [t.id, t]));
    const schoolMap = new Map((schools || []).map(s => [s.id, s]));
    
    const overdueTasks = overdueTeams
      .filter(team => {
        // 排除已有待审核提交的小队
        const key = `${team.id}-${team.current_task_id}`;
        return !submissionSet.has(key);
      })
      .map(team => {
        const task = taskMap.get(team.current_task_id);
        const theme = task?.theme_id ? themeMap.get(task.theme_id) : null;
        const school = team.school_id ? schoolMap.get(team.school_id) : null;
        
        return {
          id: `overdue-${team.id}-${team.current_task_id}`, // 复合ID
          team_id: team.id,
          team_name: team.name || team.code,
          team_code: team.code,
          team_points: team.points || 0,
          task_id: team.current_task_id,
          task_title: task?.title || '未知任务',
          task_stage: task?.stage,
          task_points: task?.points || 0,
          task_type: task?.task_type,
          theme_id: task?.theme_id,
          theme_name: theme?.name,
          theme_icon: theme?.icon,
          school_id: team.school_id,
          school_name: school?.name,
          deadline: team.next_task_deadline,
          is_overdue: true,
        };
      });
    
    return NextResponse.json({ overdueTasks });
  } catch (error) {
    console.error('获取超时任务列表错误:', error);
    return ApiErrors.validation('获取超时任务列表失败');
  }
}
