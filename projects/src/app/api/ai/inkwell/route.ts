import { requireAdmin, authError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ApiErrors } from '@/lib/api-error';
import {
  executeDailyReading,
  executeAllDailyReading,
  getDashboard,
  browseCategory,
  getTrending,
  readArticle,
  likeArticle,
  bookmarkArticle,
  getProfile,
  getCategories,
  getAgentConfigs,
} from '@/lib/skills/inkwell-reader';
import {
  internalizeReadArticles,
  getInternalizedSkills,
} from '@/lib/skills/inkwell-reader/knowledge-internalizer';
import { checkAiRateLimit } from '@/lib/rate-limit';

const AGENT_NAMES: Record<string, string> = {
  'dr-silver-snake': '银蛇博士',
  'wax-elephant': '蜡象助手',
};

const INKWELL_API = 'https://inkwell.coze.com/api/v1';

const AGENT_API_KEYS: Record<string, string> = {
  'dr-silver-snake': process.env.AGENT_DR_SILVER_SNAKE_API_KEY || '',
  'wax-elephant': process.env.AGENT_WAX_ELEPHANT_API_KEY || '',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const agent = searchParams.get('agent') || 'all';

  try {
    switch (action) {
      case 'status': {
        const configs = getAgentConfigs();
        const stats = [];
        for (const config of configs) {
          if (agent !== 'all' && agent !== config.key) continue;
          try {
            const profile = await getProfile(config.key);
            stats.push({
              agentKey: config.key,
              agentName: config.name,
              categories: config.categories,
              stats: profile.data?.stats || {},
            });
          } catch {
            stats.push({
              agentKey: config.key,
              agentName: config.name,
              categories: config.categories,
              stats: {},
            });
          }
        }
        return NextResponse.json({ success: true, data: stats });
      }

      case 'dashboard': {
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const data = await getDashboard(agentKey);
        return NextResponse.json(data);
      }

      case 'trending': {
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const data = await getTrending(agentKey, 10);
        return NextResponse.json(data);
      }

      case 'browse': {
        const category = searchParams.get('category') || 'AI & ML';
        const limit = parseInt(searchParams.get('limit') || '5');
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const data = await browseCategory(agentKey, category, limit);
        return NextResponse.json(data);
      }

      case 'categories': {
        const data = await getCategories();
        return NextResponse.json(data);
      }

      case 'skills': {
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const agents = agent === 'all' ? ['dr-silver-snake', 'wax-elephant'] : [agentKey];
        const allSkills = [];
        for (const ak of agents) {
          const data = await getInternalizedSkills(ak);
          allSkills.push(data);
        }
        return NextResponse.json({ success: true, data: allSkills });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (e: any) {
    return ApiErrors.validation('操作失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  const rateLimit = await checkAiRateLimit(request, auth.payload?.userId, 'ai_inkwell');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: rateLimit.message },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { agent = 'all', action = 'read' } = body;

    switch (action) {
      case 'read': {
        if (agent === 'all') {
          const result = await executeAllDailyReading();
          return NextResponse.json(result);
        } else {
          const result = await executeDailyReading(agent);
          return NextResponse.json(result);
        }
      }

      case 'internalize': {
        // 内化已读文章为可实操的技能
        const { articles } = body;
        const agents = agent === 'all' ? ['dr-silver-snake', 'wax-elephant'] : [agent];
        const results = [];

        for (const agentKey of agents) {
          if (articles && Array.isArray(articles) && articles.length > 0) {
            // 内化指定的文章列表
            const result = await internalizeReadArticles(agentKey, articles);
            const skillNames = result.results.flatMap((r: any) => r.skills.map((s: any) => `「${s.name}」·${s.when}`));
            results.push({
              success: result.success,
              agentKey: result.agentKey,
              agentName: AGENT_NAMES[result.agentKey] || result.agentKey,
              internalized: result.results.length,
              newSkills: result.totalSkills,
              skills: skillNames,
            });
          } else {
            // 没有指定文章，从收藏列表中获取最近的文章
            try {
              const bookmarksResp = await fetch(`${INKWELL_API}/bookmarks`, {
                headers: { 'agent-auth-api-key': AGENT_API_KEYS[agentKey] },
              });
              const bookmarksData = await bookmarksResp.json();
              const bookmarks = bookmarksData?.data || [];
              // bookmarks 是数组，每项有 article_id 和 article_title
              const recentBookmarks = Array.isArray(bookmarks) ? bookmarks.slice(0, 5) : [];

              if (recentBookmarks.length > 0) {
                const readArticles = [];
                for (const bm of recentBookmarks) {
                  try {
                    const articleData = await readArticle(agentKey, bm.article_id);
                    if (articleData?.data) {
                      readArticles.push({
                        id: bm.article_id,
                        title: articleData.data.title || bm.article_title,
                        content: articleData.data.content,
                        category: articleData.data.category,
                      });
                    }
                  } catch {
                    // skip
                  }
                }

                if (readArticles.length > 0) {
                  const result = await internalizeReadArticles(agentKey, readArticles);
                  const skillNames = result.results.flatMap((r: any) => r.skills.map((s: any) => `「${s.name}」·${s.when}`));
                  results.push({
                    success: result.success,
                    agentKey: result.agentKey,
                    agentName: AGENT_NAMES[result.agentKey] || result.agentKey,
                    internalized: result.results.length,
                    newSkills: result.totalSkills,
                    skills: skillNames,
                  });
                } else {
                  results.push({ success: true, agentKey, agentName: AGENT_NAMES[agentKey] || agentKey, internalized: 0, newSkills: 0, skills: [] });
                }
              } else {
                results.push({ success: true, agentKey, agentName: AGENT_NAMES[agentKey] || agentKey, internalized: 0, newSkills: 0, skills: [] });
              }
            } catch {
              results.push({ success: true, agentKey, agentName: AGENT_NAMES[agentKey] || agentKey, internalized: 0, newSkills: 0, skills: [] });
            }
          }
        }

        return NextResponse.json({ success: true, results, overallSummary: `内化完成: ${results.reduce((s: number, r: any) => s + (r.newSkills || 0), 0)}条新技能` });
      }

      case 'like': {
        const { articleId } = body;
        if (!articleId) {
          return ApiErrors.validation('articleId is required');
        }
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const data = await likeArticle(agentKey, articleId);
        return NextResponse.json(data);
      }

      case 'bookmark': {
        const { articleId, note } = body;
        if (!articleId) {
          return ApiErrors.validation('articleId is required');
        }
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const data = await bookmarkArticle(agentKey, articleId, note || '');
        return NextResponse.json(data);
      }

      case 'detail': {
        const { articleId } = body;
        if (!articleId) {
          return ApiErrors.validation('articleId is required');
        }
        const agentKey = agent === 'all' ? 'dr-silver-snake' : agent;
        const data = await readArticle(agentKey, articleId);
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (e: any) {
    return ApiErrors.validation('操作失败');
  }
}
