import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireAdminOrVolunteer, authError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

/**
 * 获取反馈提交列表
 * GET /api/admin/feedback?userId=xxx&userRole=xxx&schoolId=xxx
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminOrVolunteer(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const client = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const userRole = searchParams.get('userRole');
    const schoolId = searchParams.get('schoolId');
    const formId = searchParams.get('formId');
    const teamId = searchParams.get('teamId');

    if (!userId || !userRole) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 先获取小队ID列表（根据角色权限过滤）
    let teamIds: string[] = [];
    
    if (userRole === 'admin' || userRole === 'super_admin') {
      // 超级管理员可以看到所有反馈
      const { data: allTeams } = await client
        .from('teams')
        .select('id');
      teamIds = (allTeams || []).map((t: any) => t.id);
    } else if (userRole === 'teacher' && schoolId) {
      // 助学老师只能看到本校小队的反馈
      const { data: schoolTeams } = await client
        .from('teams')
        .select('id')
        .eq('school_id', schoolId);
      teamIds = (schoolTeams || []).map((t: any) => t.id);
    } else if (userRole === 'volunteer' && userId) {
      // 志愿者只能看到自己对接小队的反馈
      const { data: volunteerTeams } = await client
        .from('teams')
        .select('id')
        .eq('created_by', userId);
      teamIds = (volunteerTeams || []).map((t: any) => t.id);
    }

    if (teamIds.length === 0) {
      return NextResponse.json({ feedbacks: [] });
    }

    // 构建查询 - 获取反馈提交记录
    let query = client
      .from('final_task_submissions')
      .select(`
        id,
        team_id,
        task_id,
        member_id,
        member_role,
        form_id,
        form_data,
        submitted_at,
        cycle,
        final_task_forms (
          id,
          name,
          icon,
          team_role
        )
      `)
      .in('team_id', teamId ? [teamId] : teamIds)
      .order('submitted_at', { ascending: false });

    // 额外过滤条件
    if (formId) {
      query = query.eq('form_id', formId);
    }

    const { data: feedbacks, error } = await query;

    if (error) {
      console.error('获取反馈列表失败:', error);
      return ApiErrors.validation('获取失败');
    }

    // 获取相关小队、学校、志愿者、助学老师信息
    const feedbacksWithContext = await Promise.all((feedbacks || []).map(async (feedback: any) => {
      // 获取小队信息
      const { data: team } = await client
        .from('teams')
        .select('id, name, school_id, teacher_id, created_by')
        .eq('id', feedback.team_id)
        .single();

      let schoolName = '';
      let volunteerName = '';
      let teacherName = '';

      // 获取学校名称
      if (team?.school_id) {
        const { data: school } = await client
          .from('schools')
          .select('name')
          .eq('id', team.school_id)
          .single();
        schoolName = school?.name || '';
      }

      // 获取志愿者名称
      if (team?.created_by) {
        const { data: volunteer } = await client
          .from('users')
          .select('name')
          .eq('id', team.created_by)
          .single();
        volunteerName = volunteer?.name || '';
      }

      // 获取助学老师名称
      if (team?.teacher_id) {
        const { data: teacher } = await client
          .from('users')
          .select('name')
          .eq('id', team.teacher_id)
          .single();
        teacherName = teacher?.name || '';
      }

      // 获取成员名称
      const { data: member } = await client
        .from('team_members')
        .select('name')
        .eq('id', feedback.member_id)
        .single();

      return {
        id: feedback.id,
        teamId: feedback.team_id,
        teamName: team?.name || '',
        schoolName,
        volunteerName,
        teacherName,
        taskId: feedback.task_id,
        memberId: feedback.member_id,
        memberName: member?.name || '',
        memberRole: feedback.member_role,
        formId: feedback.form_id,
        formName: (feedback.final_task_forms as any)?.name || '',
        formIcon: (feedback.final_task_forms as any)?.icon || '',
        formData: feedback.form_data,
        submittedAt: feedback.submitted_at,
        cycle: feedback.cycle || 1,
      };
    }));

    return NextResponse.json({
      success: true,
      feedbacks: feedbacksWithContext,
    });
  } catch (error) {
    console.error('获取反馈列表错误:', error);
    return ApiErrors.validation('获取反馈列表失败');
  }
}
