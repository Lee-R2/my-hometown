import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';

// 使用服务角色密钥直接访问数据库，绕过RLS（未配置时自动回退到 anon key）
const supabaseAdmin = getSupabaseAdminClient();

export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    // 强制使用认证令牌中的 userId，防止横向越权
    const teamId = auth.payload!.userId;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    // 获取激活的题目（仅素养测评部分，过滤掉角色倾向题目）
    const { data: questions, error } = await supabaseAdmin
      .from('pretest_questions')
      .select('*')
      .eq('is_active', true)
      .neq('part', 'role')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取题目失败:', error);
      return supabaseErrorResponse(error, '获取题目失败');
    }

    // options列现在存储纯数组 [{label, value}]，兼容旧格式 {choices: [...]}
    const mappedQuestions = (questions || []).map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : (q.options?.choices || []),
    }));

    // 获取小队的前测状态
    const { data: status } = await supabaseAdmin
      .from('team_pretest_status')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();

    // 获取该小队已提交的回答（按成员名分组）
    const { data: responses } = await supabaseAdmin
      .from('pretest_responses')
      .select('*')
      .eq('team_id', teamId);

    // 按成员名整理已提交的答案
    const responsesByMember: Record<string, Record<string, any>> = {};
    responses?.forEach(r => {
      if (!responsesByMember[r.member_name]) {
        responsesByMember[r.member_name] = {};
      }
      responsesByMember[r.member_name][r.question_id] = r.answer;
    });

    // 获取小队成员列表
    const { data: teamMembers } = await supabaseAdmin
      .from('team_members')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_approved', true)
      .order('created_at', { ascending: true });

    // 标记每个成员的答题情况
    const membersStatus = (teamMembers || []).map(member => ({
      id: member.id,
      name: member.name,
      answeredCount: Object.keys(responsesByMember[member.name] || {}).length,
      totalQuestions: mappedQuestions.length,
      isComplete: Object.keys(responsesByMember[member.name] || {}).length >= mappedQuestions.length,
    }));

    // 检查是否所有成员都完成了前测
    const allMembersCompleted = membersStatus.length > 0 && membersStatus.every(m => m.isComplete);

    return NextResponse.json({
      success: true,
      questions: mappedQuestions,
      status,
      responsesByMember,
      membersStatus,
      totalQuestions: mappedQuestions.length,
      teamMembers: teamMembers || [],
      allMembersCompleted,
    });
  } catch (error) {
    console.error('获取问卷失败:', error);
    return ApiErrors.validation('获取问卷失败');
  }
}

// 提交前测问卷回答
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    // 强制使用认证令牌中的 userId 作为 teamId，防止横向越权
    const teamId = auth.payload!.userId;
    const { memberName, questionId, answer } = body;

    if (!teamId) {
      return ApiErrors.validation('认证令牌无效');
    }

    if (!memberName || !questionId || answer === undefined) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 检查小队状态
    const { data: status } = await supabaseAdmin
      .from('team_pretest_status')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();

    // 如果状态不存在或已完成，不允许提交
    if (status?.status === 'completed') {
      return ApiErrors.validation('前测已完成，无需再次填写');
    }

    // 先删除旧回答（如果存在）
    await supabaseAdmin
      .from('pretest_responses')
      .delete()
      .eq('team_id', teamId)
      .eq('member_name', memberName.trim())
      .eq('question_id', questionId);

    // 插入新回答
    const { data: response, error } = await supabaseAdmin
      .from('pretest_responses')
      .insert({
        team_id: teamId,
        member_name: memberName.trim(),
        question_id: questionId,
        answer,
      })
      .select()
      .single();

    if (error) {
      console.error('提交回答失败:', error);
      return supabaseErrorResponse(error, '提交回答失败');
    }

    // 获取所有题目数量
    const { data: allQuestions } = await supabaseAdmin
      .from('pretest_questions')
      .select('id')
      .eq('is_active', true);

    const totalQuestions = allQuestions?.length || 0;

    // 获取当前成员的答题数量
    const { data: memberResponses } = await supabaseAdmin
      .from('pretest_responses')
      .select('question_id')
      .eq('team_id', teamId)
      .eq('member_name', memberName.trim());

    const memberAnsweredCount = memberResponses?.length || 0;
    const isComplete = memberAnsweredCount >= totalQuestions;

    // 获取小队成员列表
    const { data: teamMembers } = await supabaseAdmin
      .from('team_members')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_approved', true);

    // 获取所有成员的答题情况
    const { data: allResponses } = await supabaseAdmin
      .from('pretest_responses')
      .select('member_name, question_id')
      .eq('team_id', teamId);

    // 按成员名分组统计
    const responsesByMember: Record<string, Set<string>> = {};
    allResponses?.forEach(r => {
      if (!responsesByMember[r.member_name]) {
        responsesByMember[r.member_name] = new Set();
      }
      responsesByMember[r.member_name].add(r.question_id);
    });

    // 检查每个成员的完成状态
    const membersCompletion: Record<string, boolean> = {};
    (teamMembers || []).forEach(member => {
      const memberAnswers = responsesByMember[member.name] || new Set();
      membersCompletion[member.name] = memberAnswers.size >= totalQuestions;
    });

    // 检查是否所有成员都完成了
    const allMembersCompleted = (teamMembers || []).every(
      member => membersCompletion[member.name]
    );

    // 更新小队前测状态
    let pointsReward = 0;
    if (allMembersCompleted) {
      // 检查是否已获得过前测积分奖励
      const { data: existingReward } = await supabaseAdmin
        .from('point_transactions')
        .select('id')
        .eq('team_id', teamId)
        .eq('change_type', 'pretest_reward')
        .maybeSingle();

      if (!existingReward) {
        // 首次完成前测，奖励10积分（乐观锁，防止并发双花）
        const { data: teamData } = await supabaseAdmin
          .from('teams')
          .select('points')
          .eq('id', teamId)
          .single();

        const currentPoints = teamData?.points || 0;
        const newPoints = currentPoints + 10;

        const { data: updatedTeam, error: updateError } = await supabaseAdmin
          .from('teams')
          .update({ points: newPoints })
          .eq('id', teamId)
          .eq('points', currentPoints)
          .select('id');

        if (updateError || !updatedTeam || updatedTeam.length === 0) {
          return NextResponse.json(
            { success: false, error: '积分更新冲突，请重试' },
            { status: 409 }
          );
        }

        // 记录积分奖励
        await supabaseAdmin
          .from('point_transactions')
          .insert({
            team_id: teamId,
            points: 10,
            change_type: 'pretest_reward',
            related_id: teamId,
            description: '完成前测问卷奖励',
            created_at: new Date().toISOString(),
          });

        pointsReward = 10;
      }
    }

    if (status) {
      await supabaseAdmin
        .from('team_pretest_status')
        .update({
          status: allMembersCompleted ? 'completed' : 'in_progress',
          completed_at: allMembersCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('team_id', teamId);
    } else {
      await supabaseAdmin
        .from('team_pretest_status')
        .insert({
          team_id: teamId,
          status: allMembersCompleted ? 'completed' : 'in_progress',
          started_at: new Date().toISOString(),
          completed_at: allMembersCompleted ? new Date().toISOString() : null,
        });
    }

    // 如果所有成员都完成了前测，更新小队的前测完成标记
    if (allMembersCompleted) {
      await supabaseAdmin
        .from('teams')
        .update({ has_completed_pretest: true })
        .eq('id', teamId);
    }

    return NextResponse.json({
      success: true,
      response,
      isComplete,
      allMembersCompleted,
      membersCompletion,
      pointsReward,
    });
  } catch (error) {
    console.error('提交回答失败:', error);
    return ApiErrors.validation('提交回答失败');
  }
}
