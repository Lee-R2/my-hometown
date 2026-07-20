import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { moderateContent } from '@/lib/content-moderation';
import { uploadFile, generateSignedUrl } from '@/lib/storage-utils';
import { ApiErrors } from '@/lib/api-error';
import { isDangerousExtension } from '@/lib/security';

// 获取帖子列表 - 支持排序和按主题筛选
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const supabase = getAuthenticatedClient(request, auth);
    const searchParams = request.nextUrl.searchParams;
    const teamId = auth.payload?.userId;
    const themeId = searchParams.get('theme_id');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '10');

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: '认证信息无效' },
        { status: 401 }
      );
    }

    // 获取小队当前主题
    let targetThemeId = themeId;
    if (!targetThemeId) {
      const { data: team } = await supabase
        .from('teams')
        .select('current_theme_id')
        .eq('id', teamId)
        .single();
      targetThemeId = team?.current_theme_id;
    }

    if (!targetThemeId) {
      return NextResponse.json({
        success: true,
        data: { posts: [], total: 0, hasMore: false },
      });
    }

    // 查询同主题的帖子
    let query = supabase
      .from('blackboard_posts')
      .select(`
        id,
        team_id,
        theme_id,
        title,
        content,
        media_urls,
        media_types,
        status,
        likes_count,
        comments_count,
        created_at,
        updated_at
      `, { count: 'exact' })
      .eq('theme_id', targetThemeId)
      .eq('is_deleted', false)
      .eq('status', 'approved');

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

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: posts, error, count } = await query;

    if (error) throw error;

    // 批量获取小队信息
    const teamIds = [...new Set((posts || []).map((p: any) => p.team_id).filter(Boolean))];
    let teamMap: Record<string, any> = {};
    if (teamIds.length > 0) {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, code, school_id')
        .in('id', teamIds);
      
      if (teamsError) {
        console.error('[黑板报] 批量查询小队失败:', teamsError);
      }
      (teamsData || []).forEach((t: any) => { teamMap[t.id] = t; });
    }

    // 批量获取主题信息
    const themeIds = [...new Set((posts || []).map((p: any) => p.theme_id).filter(Boolean))];
    let themeMap: Record<string, any> = {};
    if (themeIds.length > 0) {
      const { data: themesData } = await supabase
        .from('task_themes')
        .select('id, name')
        .in('id', themeIds);
      (themesData || []).forEach((t: any) => { themeMap[t.id] = t; });
    }

    // 查询当前小队对帖子是否已点赞
    let likedPostIds: string[] = [];
    if (posts && posts.length > 0) {
      const postIds = posts.map((p: any) => p.id);
      const { data: likes } = await supabase
        .from('blackboard_likes')
        .select('post_id')
        .eq('team_id', teamId)
        .in('post_id', postIds);
      likedPostIds = (likes || []).map((l: any) => l.post_id);
    }

    // 为帖子中的媒体URL生成签名URL
    const enrichedPosts = await Promise.all((posts || []).map(async (post: any) => {
      let signedMediaUrls: string[] = [];
      if (post.media_urls && post.media_urls.length > 0) {
        try {
          signedMediaUrls = await Promise.all(
            post.media_urls.map((key: string) =>
              generateSignedUrl({ key, expireTime: 3600 })
            )
          );
        } catch (e) {
          console.error('生成签名URL失败:', e);
          signedMediaUrls = post.media_urls;
        }
      }
      return {
        ...post,
        like_count: post.likes_count,
        comment_count: post.comments_count,
        teams: teamMap[post.team_id] || null,
        themes: themeMap[post.theme_id] || null,
        signed_media_urls: signedMediaUrls,
        is_liked: likedPostIds.includes(post.id),
        is_own: post.team_id === teamId,
      };
    }));

    return NextResponse.json({
      success: true,
      data: {
        posts: enrichedPosts,
        total: count || 0,
        hasMore: (count || 0) > page * pageSize,
      },
    });
  } catch (error: any) {
    console.error('获取黑板报帖子失败:', error);
    return safeError(error);
  }
}

// 创建帖子
export async function POST(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const supabase = getAuthenticatedClient(request, auth);
    const contentType = request.headers.get('content-type') || '';
    const teamId = auth.payload?.userId;
    let themeId: string | null = null;
    let title: string;
    let content: string;
    let mediaUrls: string[] = [];
    let mediaTypeList: string[] = [];
    let files: File[] = [];

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: '认证信息无效' },
        { status: 401 }
      );
    }

    if (contentType.includes('application/json')) {
      const body = await request.json();
      themeId = body.theme_id || null;
      title = body.title;
      content = body.content;
      mediaUrls = body.media_urls || [];
      mediaTypeList = body.media_types || [];
    } else {
      const formData = await request.formData();
      themeId = formData.get('theme_id') as string | null;
      title = formData.get('title') as string;
      content = formData.get('content') as string;
      files = formData.getAll('files') as File[];
      mediaUrls = (formData.getAll('media_urls') as string[]).filter(Boolean);
      mediaTypeList = (formData.getAll('media_types') as string[]).filter(Boolean);
    }

    // 获取小队当前主题
    let targetThemeId = themeId;
    if (!targetThemeId) {
      const { data: team } = await supabase
        .from('teams')
        .select('current_theme_id')
        .eq('id', teamId)
        .single();
      targetThemeId = team?.current_theme_id;
    }

    if (!targetThemeId) {
      return ApiErrors.validation('小队尚未选择任务主题，无法发帖');
    }

    if (!title || !title.trim()) {
      return ApiErrors.validation('请输入帖子标题');
    }

    if (!content || !content.trim()) {
      return ApiErrors.validation('请输入帖子内容');
    }

    // 内容审核
    const moderation = await moderateContent(content, title);
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

    // 上传媒体文件（FormData 模式）
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    if (files && files.length > 0) {
      // 最多允许9个媒体文件
      if (files.length > 9) {
        return ApiErrors.validation('最多可上传9个媒体文件');
      }

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { success: false, error: `文件 ${file.name} 超过10MB大小限制` },
            { status: 400 }
          );
        }

        // 安全修复（P3 输入校验）：扩展名黑名单，禁止可执行脚本/可含 XSS 的文件
        if (isDangerousExtension(file.name)) {
          return NextResponse.json(
            { success: false, error: `文件 ${file.name} 格式不支持，禁止上传可执行脚本或可含脚本的文件` },
            { status: 400 }
          );
        }

        // 安全修复（P3 输入校验）：显式排除 image/svg+xml，避免 startsWith('image/') 放行含脚本的 SVG
        const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
          return NextResponse.json(
            { success: false, error: `文件 ${file.name} 格式不支持，仅支持图片和视频` },
            { status: 400 }
          );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = await uploadFile({
          fileContent: buffer,
          fileName: `blackboard/${safeName}`,
          contentType: file.type,
        });
        mediaUrls.push(key);
        mediaTypeList.push(isVideo ? 'video' : 'image');
      }
    }

    // 创建帖子（status默认为approved，关键词审核已通过）
    const { data: teamInfo } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    const { data: post, error } = await supabase
      .from('blackboard_posts')
      .insert({
        team_id: teamId,
        author_id: teamId,
        author_name: teamInfo?.name || '小队',
        author_type: 'team',
        theme_id: targetThemeId,
        title: title.trim(),
        content: content.trim(),
        media_urls: mediaUrls,
        media_types: mediaTypeList,
        status: 'approved',
        is_deleted: false,
        likes_count: 0,
        comments_count: 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        ...post,
        like_count: post?.likes_count || 0,
        comment_count: post?.comments_count || 0,
      },
    });
  } catch (error: any) {
    console.error('创建黑板报帖子失败:', error);
    return safeError(error);
  }
}
