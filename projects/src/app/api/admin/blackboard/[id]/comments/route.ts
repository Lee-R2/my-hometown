import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { moderateContent } from '@/lib/content-moderation';
import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 管理员获取评论列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const pageSize = parseInt(request.nextUrl.searchParams.get('page_size') || '100');
    const currentLikerId = request.nextUrl.searchParams.get('liker_id') || '';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: comments, error, count } = await supabase
      .from('blackboard_comments')
      .select(`
        id,
        post_id,
        team_id,
        commenter_id,
        content,
        reply_to_id,
        is_admin,
        admin_info,
        anonymous_identity,
        likes_count,
        created_at
      `, { count: 'exact' })
      .eq('post_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // 批量获取小队信息（仅非管理员评论）
    const commentTeamIds = [...new Set((comments || []).filter((c: any) => !c.is_admin).map((c: any) => c.team_id).filter(Boolean))];
    let commentTeamMap: Record<string, any> = {};
    if (commentTeamIds.length > 0) {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, code, school_id')
        .in('id', commentTeamIds);
      (teamsData || []).forEach((t: any) => { commentTeamMap[t.id] = t; });
    }

    // 获取被回复评论的内容和小队信息
    const replyToIds = [...new Set((comments || []).map((c: any) => c.reply_to_id).filter(Boolean))];
    let replyCommentMap: Record<string, any> = {};
    if (replyToIds.length > 0) {
      const { data: replyComments } = await supabase
        .from('blackboard_comments')
        .select('id, content, team_id, is_admin, admin_info, anonymous_identity')
        .in('id', replyToIds);

      const replyTeamIds = [...new Set((replyComments || []).filter((c: any) => !c.is_admin).map((c: any) => c.team_id).filter(Boolean))];
      let replyTeamMap: Record<string, any> = {};
      if (replyTeamIds.length > 0) {
        const { data: replyTeamsData } = await supabase
          .from('teams')
          .select('id, name, code')
          .in('id', replyTeamIds);
        (replyTeamsData || []).forEach((t: any) => { replyTeamMap[t.id] = t; });
      }

      (replyComments || []).forEach((c: any) => {
        replyCommentMap[c.id] = { ...c, teams: replyTeamMap[c.team_id] || null };
      });
    }

    // 批量查询当前用户对评论的点赞状态
    let likedCommentIds: string[] = [];
    if (currentLikerId && (comments || []).length > 0) {
      const commentIds = (comments || []).map((c: any) => c.id);
      const { data: likes } = await supabase
        .from('blackboard_comment_likes')
        .select('comment_id')
        .eq('liker_id', currentLikerId)
        .in('comment_id', commentIds);
      likedCommentIds = (likes || []).map((l: any) => l.comment_id);
    }

    const enrichedComments = (comments || []).map((comment: any) => ({
      ...comment,
      like_count: comment.likes_count,
      teams: comment.is_admin ? null : (commentTeamMap[comment.team_id] || null),
      reply_to: comment.reply_to_id ? (replyCommentMap[comment.reply_to_id] || null) : null,
      is_liked: likedCommentIds.includes(comment.id),
    }));

    return NextResponse.json({
      success: true,
      data: {
        comments: enrichedComments || [],
        total: count || 0,
        hasMore: (count || 0) > page * pageSize,
      },
    });
  } catch (error: any) {
    console.error('获取评论失败:', error);
    return safeError(error);
  }
}

// 管理员添加评论
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { id } = await params;
    const body = await request.json();
    const { admin_id, admin_name, admin_role, school_name, content, reply_to_id, anonymous_identity } = body;

    if (!admin_id) {
      return ApiErrors.validation('缺少管理员ID');
    }

    if (!content || !content.trim()) {
      return ApiErrors.validation('请输入评论内容');
    }

    // 如果是回复，验证被回复的评论存在
    if (reply_to_id) {
      const { data: replyComment } = await supabase
        .from('blackboard_comments')
        .select('id, team_id')
        .eq('id', reply_to_id)
        .eq('post_id', id)
        .eq('is_deleted', false)
        .single();

      if (!replyComment) {
        return ApiErrors.notFound('回复的评论不存在');
      }
    }

    // 验证帖子存在
    const { data: post, error: postError } = await supabase
      .from('blackboard_posts')
      .select('id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (postError || !post) {
      return ApiErrors.notFound('帖子不存在');
    }

    // 内容审核
    const moderation = await moderateContent(content, undefined);
    if (!moderation.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `内容审核未通过：${moderation.reasons.join('；')}`,
          reasons: moderation.reasons,
        },
        { status: 400 }
      );
    }

    // 角色显示名称
    const roleLabel = admin_role === 'admin' || admin_role === 'super_admin' ? '管理员' 
      : admin_role === 'volunteer' ? '志愿者' 
      : admin_role === 'teacher' ? '老师' 
      : '管理员';

    // 查询管理员学校名称
    let finalSchoolName = school_name || '';
    if (!finalSchoolName && admin_id) {
      const { data: adminUser } = await supabase
        .from('users')
        .select('school_id')
        .eq('id', admin_id)
        .single();
      if (adminUser?.school_id) {
        const { data: school } = await supabase
          .from('schools')
          .select('name')
          .eq('id', adminUser.school_id)
          .single();
        if (school?.name) finalSchoolName = school.name;
      }
    }

    // 创建评论 - 使用 commenter_id 存储管理员ID，team_id 为 null
    // admin_info 存储管理员信息，is_admin 标识管理员评论
    // anonymous_identity: 管理员可选择隐藏真实身份，用"银蛇博士"或"雾影博士"发表
    const validIdentities = ['银蛇博士', '雾影博士'];
    const identity = anonymous_identity && validIdentities.includes(anonymous_identity) ? anonymous_identity : null;
    const insertData: any = {
      post_id: id,
      team_id: admin_id,
      author_id: admin_id,
      author_name: identity || admin_name || '管理员',
      author_type: 'admin',
      commenter_id: admin_id,
      content: content.trim(),
      is_deleted: false,
      is_admin: true,
      likes_count: 0,
      anonymous_identity: identity,
      admin_info: {
        name: admin_name || '管理员',
        role: admin_role || 'admin',
        role_label: roleLabel,
        school_name: finalSchoolName,
        anonymous_identity: identity,
      },
    };
    if (reply_to_id) {
      insertData.reply_to_id = reply_to_id;
    }

    const { data: comment, error } = await supabase
      .from('blackboard_comments')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    const { data: updatedPost } = await supabase
      .from('blackboard_posts')
      .select('comments_count')
      .eq('id', id)
      .single();
    if (updatedPost) {
      const newCommentCount = (updatedPost.comments_count || 0) + 1;
      await supabase
        .from('blackboard_posts')
        .update({
          comments_count: newCommentCount,
        })
        .eq('id', id);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...comment,
        isAdminComment: true,
        adminName: admin_name,
      },
    });
  } catch (error: any) {
    console.error('管理员评论失败:', error);
    return safeError(error);
  }
}
