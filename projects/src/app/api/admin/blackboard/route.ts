import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { requireAnyAuth, requireAdmin, authError, safeError } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '20');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const themesOnly = searchParams.get('themes_only') === 'true';
    // 身份从认证令牌获取，防止伪造角色查看越权数据
    const userId = auth.payload!.userId;
    const userRole = auth.payload!.role;

    const client = getSupabaseAdminClient();

    if (themesOnly) {
      const { data: themes, error: themeError } = await client
        .from('task_themes')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (themeError) throw themeError;

      return NextResponse.json({
        success: true,
        data: { themes: themes || [] },
      });
    }

    let allowedTeamIds: string[] | null = null;
    if (userId && userRole && userRole !== 'admin' && userRole !== 'super_admin') {
      if (userRole === 'teacher') {
        const { data: adminUser } = await client
          .from('users')
          .select('school_id')
          .eq('id', userId)
          .single();
        if (adminUser?.school_id) {
          const { data: schoolTeams } = await client
            .from('teams')
            .select('id')
            .eq('school_id', adminUser.school_id)
            .eq('status', 'active');
          allowedTeamIds = (schoolTeams || []).map((t: any) => t.id);
        } else {
          allowedTeamIds = [];
        }
      } else if (userRole === 'volunteer') {
        const { data: volunteerTeams } = await client
          .from('teams')
          .select('id')
          .eq('assigned_volunteer_id', userId)
          .eq('status', 'active');
        allowedTeamIds = (volunteerTeams || []).map((t: any) => t.id);
      }
    }

    let query = client
      .from('blackboard_posts')
      .select(`
        id,
        team_id,
        author_id,
        author_name,
        author_type,
        content,
        media_urls,
        likes_count,
        comments_count,
        theme_id,
        title,
        media_types,
        status,
        is_deleted,
        created_at,
        updated_at
      `, { count: 'exact' });

    if (allowedTeamIds !== null) {
      if (allowedTeamIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            posts: [],
            total: 0,
            hasMore: false,
            stats: { totalPosts: 0, totalComments: 0, totalLikes: 0 },
          },
        });
      }
      query = query.in('team_id', allowedTeamIds);
    }

    if (search) {
      query = query.ilike('content', `%${search}%`);
    }

    query = query.eq('is_deleted', false);

    // 排序
    switch (sortBy) {
      case 'comment_count':
        query = query.order('comments_count', { ascending: false });
        break;
      case 'like_count':
        query = query.order('likes_count', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: posts, error, count } = await query;

    if (error) throw error;

    const teamIds = [...new Set((posts || []).map((p: any) => p.team_id).filter(Boolean))];
    const themeIds = [...new Set((posts || []).map((p: any) => p.theme_id).filter(Boolean))];

    let teamMap: Record<string, any> = {};
    let themeMap: Record<string, any> = {};

    // teams 和 themes 查询并行
    if (teamIds.length > 0 || themeIds.length > 0) {
      const [teamsResult, themesResult] = await Promise.all([
        teamIds.length > 0
          ? client.from('teams').select('id, name, code, school_id').in('id', teamIds)
          : Promise.resolve({ data: [] }),
        themeIds.length > 0
          ? client.from('task_themes').select('id, name').in('id', themeIds)
          : Promise.resolve({ data: [] }),
      ]);

      const teams = teamsResult.data || [];
      const themes = themesResult.data || [];

      // 查询学校名称
      const schoolIds = [...new Set(teams.map((t: any) => t.school_id).filter(Boolean))];
      let schoolMap: Record<string, string> = {};
      if (schoolIds.length > 0) {
        const { data: schools } = await client
          .from('schools')
          .select('id, name')
          .in('id', schoolIds);
        (schools || []).forEach((s: any) => { schoolMap[s.id] = s.name; });
      }
      teams.forEach((t: any) => {
        teamMap[t.id] = { ...t, school_name: schoolMap[t.school_id] || '' };
      });
      themes.forEach((t: any) => { themeMap[t.id] = t; });
    }

    const enrichedPosts = (posts || []).map((post: any) => ({
      ...post,
      like_count: post.likes_count,
      comment_count: post.comments_count,
      teams: teamMap[post.team_id] || null,
      task_themes: themeMap[post.theme_id] || null,
    }));

    let totalPosts = 0;
    let totalComments = 0;
    let totalLikes = 0;

    if (allowedTeamIds !== null && allowedTeamIds.length > 0) {
      // 先取 post ids（comment/like count 依赖）
      const { data: scopePosts } = await client
        .from('blackboard_posts')
        .select('id')
        .in('team_id', allowedTeamIds);
      const scopePostIds = (scopePosts || []).map((p: any) => p.id);
      totalPosts = scopePostIds.length;

      if (scopePostIds.length > 0) {
        // 2 个 count 查询并行
        const [commentResult, likeResult] = await Promise.all([
          client.from('blackboard_comments').select('*', { count: 'exact', head: true }).in('post_id', scopePostIds),
          client.from('blackboard_likes').select('*', { count: 'exact', head: true }).in('post_id', scopePostIds),
        ]);
        totalComments = commentResult.count || 0;
        totalLikes = likeResult.count || 0;
      }
    } else if (allowedTeamIds === null) {
      // admin 路径：3 个 count 查询并行
      const [postsCountResult, commentsCountResult, likesCountResult] = await Promise.all([
        client.from('blackboard_posts').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
        client.from('blackboard_comments').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
        client.from('blackboard_likes').select('*', { count: 'exact', head: true }),
      ]);
      totalPosts = postsCountResult.count || 0;
      totalComments = commentsCountResult.count || 0;
      totalLikes = likesCountResult.count || 0;
    }

    return NextResponse.json({
      success: true,
      data: {
        posts: enrichedPosts,
        total: count || 0,
        hasMore: (count || 0) > page * pageSize,
        stats: {
          totalPosts: totalPosts || 0,
          totalComments: totalComments || 0,
          totalLikes: totalLikes || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('管理员获取黑板报失败:', error);
    return safeError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { post_id, reason } = body;

    if (!post_id) {
      return ApiErrors.validation('缺少帖子ID');
    }

    const client = getSupabaseAdminClient();

    const { data: post } = await client
      .from('blackboard_posts')
      .select('team_id, author_name')
      .eq('id', post_id)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return ApiErrors.notFound('帖子不存在或已删除');
    }

    const { error } = await client
      .from('blackboard_posts')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', post_id);

    if (error) throw error;

    await client
      .from('blackboard_comments')
      .update({ is_deleted: true })
      .eq('post_id', post_id);

    await client
      .from('blackboard_likes')
      .delete()
      .eq('post_id', post_id);

    if (post) {
      await client.from('team_notifications').insert({
        team_id: post.team_id,
        type: 'system',
        title: '黑板报帖子被删除',
        content: reason
          ? `黑板报帖子已被管理员删除，原因：${reason}`
          : '黑板报帖子已被管理员删除',
        is_read: false,
      });
    }

    return NextResponse.json({
      success: true,
      message: '帖子已删除',
    });
  } catch (error: any) {
    console.error('管理员删除帖子失败:', error);
    return safeError(error);
  }
}
