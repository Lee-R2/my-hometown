import { requireParent, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { calculateCurrentGrade } from '@/lib/calculate-grade';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 获取关注的小队列表
export async function GET(request: NextRequest) {
  const auth = requireParent(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    if (!parentId) {
      return ApiErrors.validation('缺少家长ID');
    }

    // 先获取关注记录
    let query = supabase
      .from('parent_team_follows')
      .select('*')
      .eq('parent_id', parentId)
      .order('followed_at', { ascending: false });

    if (!includeHistory) {
      query = query.eq('is_active', true);
    }

    const { data: follows, error } = await query;

    if (error) {
      console.error('[获取关注列表] 查询失败:', error);
      return supabaseErrorResponse(error, '获取关注列表失败');
    }

    // 获取小队信息
    const teamIds = (follows || []).map(f => f.team_id).filter(Boolean);
    let teamsMap: Record<string, any> = {};

    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name, slogan, points, cycle, school_id, current_theme_id')
        .in('id', teamIds);

      if (teams) {
        teamsMap = teams.reduce((acc, team) => {
          acc[team.id] = team;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // 格式化返回数据
    const result = (follows || []).map(f => ({
      followId: f.id,
      childName: f.child_name,
      childGrade: calculateCurrentGrade(f.child_grade, f.followed_at),
      relation: f.relation,
      guardianReason: f.guardian_reason,
      schoolId: f.school_id,
      schoolName: f.school_name,
      isActive: f.is_active,
      status: f.status || 'approved', // 默认已通过兼容旧数据
      followedAt: f.followed_at,
      unfollowedAt: f.unfollowed_at,
      reviewedAt: f.reviewed_at,
      reviewRemark: f.review_remark,
      team: teamsMap[f.team_id] ? {
        id: teamsMap[f.team_id].id,
        name: teamsMap[f.team_id].name,
        slogan: teamsMap[f.team_id].slogan,
        points: teamsMap[f.team_id].points,
        cycle: teamsMap[f.team_id].cycle,
        schoolId: teamsMap[f.team_id].school_id,
        currentThemeId: teamsMap[f.team_id].current_theme_id
      } : null
    }));

    return NextResponse.json({
      success: true,
      teams: result
    });

  } catch (error: any) {
    console.error('[获取关注列表] 错误:', error);
    return ApiErrors.validation('获取关注列表失败');
  }
}

// 关注小队 - 提交审核申请
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parentId, teamId, childName, childGrade, relation, relationType, guardianReason, schoolId, schoolName } = body;

    if (!parentId || !teamId || !childName) {
      return ApiErrors.validation('缺少必要参数');
    }
    
    // 如果是其他关系类型，必须提供监护人说明
    if (relationType === '其他' && !guardianReason) {
      return ApiErrors.validation('请说明为何由你作为此学生监护人');
    }

    // 获取学校信息（如果没提供）
    let actualSchoolId = schoolId;
    let actualSchoolName = schoolName;

    if (!actualSchoolId) {
      const { data: team } = await supabase
        .from('teams')
        .select('school_id')
        .eq('id', teamId)
        .single();

      if (team) {
        actualSchoolId = team.school_id;
      }
    }

    if (!actualSchoolName && actualSchoolId) {
      const { data: school } = await supabase
        .from('schools')
        .select('name')
        .eq('id', actualSchoolId)
        .single();
      actualSchoolName = school?.name;
    }

    // 获取家长信息
    const { data: parent } = await supabase
      .from('parents')
      .select('id, name, phone')
      .eq('id', parentId)
      .single();

    // 检查是否已存在相同的关注记录
    const { data: existing } = await supabase
      .from('parent_team_follows')
      .select('id, is_active, status')
      .eq('parent_id', parentId)
      .eq('team_id', teamId)
      .eq('child_name', childName)
      .single();

    if (existing) {
      if (existing.status === 'approved') {
        return ApiErrors.conflict('已经关注过该小队');
      }
      if (existing.status === 'pending') {
        return ApiErrors.conflict('关注申请正在审核中，请等待');
      }
      // 被拒绝的，重新提交审核
      const { error: updateError } = await supabase
        .from('parent_team_follows')
        .update({
          is_active: true,
          status: 'pending',
          child_grade: childGrade || null,
          school_id: actualSchoolId,
          school_name: actualSchoolName,
          reviewed_by: null,
          reviewed_at: null,
          review_remark: null
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[关注小队] 更新失败:', updateError);
        return NextResponse.json(
          { success: false, error: `提交失败: ${updateError.message}` },
          { status: 500 }
        );
      }

      // 向老师发送审核通知
      await sendReviewNotification(actualSchoolId, teamId, '', parent, childName, childGrade, relation, guardianReason, existing.id);

      return NextResponse.json({
        success: true,
        message: '已重新提交关注申请，请等待老师审核',
        pending: true,
        followId: existing.id
      });
    }

    // 创建新的关注记录，状态为 pending
    // 注意：is_active = true 表示这是活跃的申请记录，审核通过/拒绝后变为 false（存档）
    const { data: newFollow, error: insertError } = await supabase
      .from('parent_team_follows')
      .insert({
        parent_id: parentId,
        team_id: teamId,
        child_name: childName,
        child_grade: childGrade || null,
        relation: relation || null,
        guardian_reason: guardianReason || null,
        school_id: actualSchoolId,
        school_name: actualSchoolName,
        is_active: true,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[关注小队] 创建失败:', insertError);
      return supabaseErrorResponse(insertError, '提交失败');
    }

    // 向对应学校的老师发送审核通知
    await sendReviewNotification(actualSchoolId, teamId, '', parent, childName, childGrade, relation, guardianReason, newFollow.id);

    return NextResponse.json({
      success: true,
      message: '已提交关注申请，请等待老师审核',
      pending: true,
      followId: newFollow.id
    });

  } catch (error: any) {
    console.error('[关注小队] 错误:', error);
    return ApiErrors.validation('关注小队失败');
  }
}

// PUT: 修改并重新提交关注申请
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { parentId, followId, childName, childGrade, relation, guardianReason } = body;

    if (!parentId || !followId || !childName) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 如果是其他关系类型，必须提供监护人说明
    if (relation && ['父亲', '母亲', '爷爷', '奶奶', '姥姥', '姥爷'].indexOf(relation) === -1 && !guardianReason) {
      return ApiErrors.validation('请说明为何由你作为此学生监护人');
    }

    // 获取关注记录
    const { data: existing, error: fetchError } = await supabase
      .from('parent_team_follows')
      .select('*')
      .eq('id', followId)
      .eq('parent_id', parentId)
      .single();

    if (fetchError || !existing) {
      return ApiErrors.notFound('关注记录不存在');
    }

    if (existing.status !== 'rejected') {
      return ApiErrors.validation('只有被拒绝的申请可以修改');
    }

    // 更新关注记录，重新设为待审核
    const { error: updateError } = await supabase
      .from('parent_team_follows')
      .update({
        child_name: childName,
        child_grade: childGrade || null,
        relation: relation || null,
        guardian_reason: guardianReason || null,
        status: 'pending',
        is_active: true,
        reviewed_by: null,
        reviewed_at: null,
        review_remark: null,
        followed_at: new Date().toISOString()
      })
      .eq('id', followId);

    if (updateError) {
      console.error('[修改关注申请] 更新失败:', updateError);
      return supabaseErrorResponse(updateError, '修改失败');
    }

    // 获取家长信息
    const { data: parent } = await supabase
      .from('parents')
      .select('id, name, phone')
      .eq('id', parentId)
      .single();

    // 获取小队信息
    let teamName = '';
    if (existing.team_id) {
      const { data: team } = await supabase
        .from('teams')
        .select('name')
        .eq('id', existing.team_id)
        .single();
      teamName = team?.name || '';
    }

    // 向老师发送审核通知
    await sendReviewNotification(
      existing.school_id,
      existing.team_id,
      teamName,
      parent,
      childName,
      childGrade,
      relation,
      guardianReason,
      followId
    );

    return NextResponse.json({
      success: true,
      message: '已重新提交申请，请等待老师审核'
    });

  } catch (error: any) {
    console.error('[修改关注申请] 错误:', error);
    return ApiErrors.validation('修改关注申请失败');
  }
}

// 发送审核通知给老师
async function sendReviewNotification(schoolId: string, teamId: string, teamName: string, parent: any, childName: string, childGrade: string | null, relation: string | null, guardianReason: string | null, followId: string) {
  if (!schoolId) return;

  // 查找该学校下的所有老师
  const { data: teachers } = await supabase
    .from('users')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true);

  if (!teachers || teachers.length === 0) return;

  // 构建通知内容
  const relationText = relation ? `（${relation}）` : '';
  let content = `家长「${parent?.name || '未知'}」${relationText}(${parent?.phone || ''}) 申请关注小队「${teamName}」，孩子姓名：${childName}${childGrade ? `，年级：${childGrade}` : ''}。`;
  
  // 如果是其他关系，添加监护人说明
  if (guardianReason) {
    content += `\n监护人说明：${guardianReason}`;
  }
  content += '\n请及时审核。';
  
  const messages = teachers.map(teacher => ({
    type: 'parent_follow_verify',
    title: '家长关注申请待审核',
    content,
    target_type: 'user',
    target_id: teacher.id,
    related_team_id: teamId,
    related_follow_id: followId,
    is_read: false,
    created_at: new Date().toISOString()
  }));

  await supabase.from('notifications').insert(messages);
}

// 取消关注
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const followId = searchParams.get('followId');
    const parentId = searchParams.get('parentId');

    if (!followId && !parentId) {
      return ApiErrors.validation('缺少参数');
    }

    if (followId) {
      // 软删除：标记为不活跃
      const { error } = await supabase
        .from('parent_team_follows')
        .update({
          is_active: false,
          unfollowed_at: new Date().toISOString()
        })
        .eq('id', followId);

      if (error) {
        return supabaseErrorResponse(error, '取消关注失败');
      }
    } else if (parentId) {
      // 取消所有关注
      const { error } = await supabase
        .from('parent_team_follows')
        .update({
          is_active: false,
          unfollowed_at: new Date().toISOString()
        })
        .eq('parent_id', parentId);

      if (error) {
        return supabaseErrorResponse(error, '取消关注失败');
      }
    }

    return NextResponse.json({
      success: true,
      message: '已取消关注'
    });

  } catch (error: any) {
    console.error('[取消关注] 错误:', error);
    return ApiErrors.validation('取消关注失败');
  }
}

// 切换小队
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { followId, newTeamId, childGrade } = body;

    if (!followId || !newTeamId) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 获取原关注记录
    const { data: oldFollow } = await supabase
      .from('parent_team_follows')
      .select('id, child_name, school_id')
      .eq('id', followId)
      .single();

    if (!oldFollow) {
      return ApiErrors.validation('关注记录不存在');
    }

    // 获取新小队信息
    const { data: newTeam } = await supabase
      .from('teams')
      .select('id, name, school_id')
      .eq('id', newTeamId)
      .single();

    if (!newTeam) {
      return ApiErrors.validation('新小队不存在');
    }

    // 获取新学校名称
    let schoolName = null;
    if (newTeam.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('name')
        .eq('id', newTeam.school_id)
        .single();
      schoolName = school?.name;
    }

    // 获取家长信息
    const { data: parentFollow } = await supabase
      .from('parent_team_follows')
      .select('parent:parents(id, name, phone), relation, guardian_reason')
      .eq('id', followId)
      .single();

    const parentInfo = Array.isArray(parentFollow?.parent) ? (parentFollow.parent as any[])[0] : parentFollow?.parent;
    const parentId = (parentInfo as any)?.id;

    // 软删除原关注
    await supabase
      .from('parent_team_follows')
      .update({
        is_active: false,
        unfollowed_at: new Date().toISOString()
      })
      .eq('id', followId);

    // 创建新的关注记录（待审核）
    const { data: newFollow, error: insertError } = await supabase
      .from('parent_team_follows')
      .insert({
        parent_id: parentId,
        team_id: newTeamId,
        child_name: oldFollow.child_name,
        child_grade: childGrade || null,
        school_id: newTeam.school_id,
        school_name: schoolName,
        is_active: false,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      return ApiErrors.validation('切换失败');
    }

    // 向老师发送审核通知
    await sendReviewNotification(newTeam.school_id, newTeam.id, newTeam.name, parentInfo, oldFollow.child_name, childGrade, parentFollow?.relation || null, parentFollow?.guardian_reason || null, newFollow.id);

    return NextResponse.json({
      success: true,
      message: '已提交切换申请，请等待老师审核',
      pending: true,
      followId: newFollow.id
    });

  } catch (error: any) {
    console.error('[切换小队] 错误:', error);
    return ApiErrors.validation('切换小队失败');
  }
}
