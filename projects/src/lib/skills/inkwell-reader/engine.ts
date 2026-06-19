/**
 * Inkwell 每日自动阅读引擎
 * 让银蛇博士和蜡象助手每天自动阅读最新技术文章，保持知识更新
 */

const BASE_URL = 'https://inkwell.coze.com/api/v1';

// Agent 配置
const AGENTS = {
  'dr-silver-snake': {
    apiKey: 'agent-world-dbb6ab75f51f40a90ac30ae694d2408419b6683ac2b85508',
    name: '银蛇博士',
    // 银蛇博士关注：AI&ML（教育应用）、Tech Culture、Essays
    categories: ['AI & ML', 'Tech Culture', 'Essays', 'Indie'],
    noteStyle: 'educational', // 教育视角的笔记
  },
  'wax-elephant': {
    apiKey: process.env.AGENT_WAX_ELEPHANT_API_KEY || '',
    name: '蜡象助手',
    // 蜡象助手关注：Systems、Security、AI&ML（工具应用）、Programming
    categories: ['Systems', 'Security', 'AI & ML', 'Programming'],
    noteStyle: 'management', // 管理视角的笔记
  },
};

// 分类轮换索引（每天轮换一个分类深入阅读）
let categoryRotationIndex = 0;

async function inkwellFetch(path: string, apiKey: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'agent-auth-api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res.json();
}

/**
 * 获取首页仪表盘
 */
export async function getDashboard(agentKey: string) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const data = await inkwellFetch('/home', agent.apiKey);
  return data;
}

/**
 * 浏览指定分类的文章
 */
export async function browseCategory(agentKey: string, category: string, limit = 5) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const encodedCategory = encodeURIComponent(category);
  const data = await inkwellFetch(
    `/articles?category=${encodedCategory}&limit=${limit}&sort=date`,
    agent.apiKey
  );
  return data;
}

/**
 * 获取热门文章
 */
export async function getTrending(agentKey: string, limit = 5) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const data = await inkwellFetch(
    `/articles?sort=likes&limit=${limit}`,
    agent.apiKey
  );
  return data;
}

/**
 * 阅读文章详情
 */
export async function readArticle(agentKey: string, articleId: string) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const data = await inkwellFetch(`/articles/${articleId}`, agent.apiKey);
  return data;
}

/**
 * 点赞文章
 */
export async function likeArticle(agentKey: string, articleId: string) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const data = await inkwellFetch(`/articles/${articleId}/like`, agent.apiKey, {
    method: 'POST',
  });
  return data;
}

/**
 * 收藏文章（带笔记）
 */
export async function bookmarkArticle(
  agentKey: string,
  articleId: string,
  note: string
) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const data = await inkwellFetch('/bookmarks', agent.apiKey, {
    method: 'POST',
    body: JSON.stringify({ article_id: articleId, note }),
  });
  return data;
}

/**
 * 获取个人统计
 */
export async function getProfile(agentKey: string) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const data = await inkwellFetch('/agents/me', agent.apiKey);
  return data;
}

/**
 * 获取所有分类
 */
export async function getCategories() {
  const data = await inkwellFetch('/categories', '');
  return data;
}

/**
 * 生成笔记内容
 */
function generateNote(
  agentKey: string,
  article: { title: string; category?: string },
  summary: string
): string {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) return summary;

  if (agent.noteStyle === 'educational') {
    // 银蛇博士风格：教育视角
    return `${article.title} - 教育启示：${summary.slice(0, 120)}`;
  } else {
    // 蜡象助手风格：管理视角
    return `${article.title} - 管理启示：${summary.slice(0, 120)}`;
  }
}

/**
 * 从HTML内容中提取纯文本摘要
 */
function extractSummary(htmlContent: string, maxLen = 200): string {
  if (!htmlContent) return '';
  const text = htmlContent
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#2019;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLen);
}

/**
 * 执行每日阅读流程
 * 1. 浏览首页获取最新和热门
 * 2. 阅读热门文章
 * 3. 轮换分类深入阅读
 * 4. 点赞和收藏有价值文章
 */
export async function executeDailyReading(agentKey: string) {
  const agent = AGENTS[agentKey as keyof typeof AGENTS];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const results: Array<{
    articleId: string;
    title: string;
    liked: boolean;
    bookmarked: boolean;
    note?: string;
  }> = [];

  try {
    // Step 1: 获取首页热门文章
    const homeData = await getDashboard(agentKey);
    if (!homeData.success) {
      throw new Error(`Failed to get dashboard: ${homeData.error}`);
    }

    const popularArticles = homeData.data?.popular_articles || [];

    // Step 2: 阅读并点赞热门文章（最多3篇）
    for (const article of popularArticles.slice(0, 3)) {
      try {
        // 阅读全文
        const detail = await readArticle(agentKey, article.id);
        if (!detail.success) continue;

        const content = detail.data?.content || '';
        const summary = extractSummary(content);

        // 点赞
        await likeArticle(agentKey, article.id);

        // 生成笔记并收藏
        const note = generateNote(agentKey, article, summary);
        await bookmarkArticle(agentKey, article.id, note);

        results.push({
          articleId: article.id,
          title: article.title,
          liked: true,
          bookmarked: true,
          note,
        });

        // 限流：每篇间隔1秒
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        results.push({
          articleId: article.id,
          title: article.title,
          liked: false,
          bookmarked: false,
        });
      }
    }

    // Step 3: 轮换分类深入阅读
    const todayCategory =
      agent.categories[categoryRotationIndex % agent.categories.length];
    categoryRotationIndex++;

    const categoryData = await browseCategory(agentKey, todayCategory, 3);
    const categoryArticles = Array.isArray(categoryData.data)
      ? categoryData.data
      : categoryData.data?.articles || [];

    for (const article of categoryArticles.slice(0, 2)) {
      try {
        // 阅读全文
        const detail = await readArticle(agentKey, article.id);
        if (!detail.success) continue;

        const content = detail.data?.content || '';
        const summary = extractSummary(content);

        // 点赞+收藏
        await likeArticle(agentKey, article.id);
        const note = generateNote(agentKey, article, summary);
        await bookmarkArticle(agentKey, article.id, note);

        results.push({
          articleId: article.id,
          title: article.title,
          liked: true,
          bookmarked: true,
          note,
        });

        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        results.push({
          articleId: article.id,
          title: article.title,
          liked: false,
          bookmarked: false,
        });
      }
    }

    // Step 4: 获取统计
    const profile = await getProfile(agentKey);
    const stats = profile.data?.stats || {};

    return {
      success: true,
      agentKey,
      agentName: agent.name,
      articlesRead: results.length,
      articlesLiked: results.filter((r) => r.liked).length,
      articlesBookmarked: results.filter((r) => r.bookmarked).length,
      todayCategory,
      stats,
      results,
    };
  } catch (e: any) {
    return {
      success: false,
      agentKey,
      agentName: agent.name,
      error: e.message,
      results,
    };
  }
}

/**
 * 执行所有Agent的每日阅读
 */
export async function executeAllDailyReading() {
  const agentKeys = Object.keys(AGENTS);
  const results = [];

  for (const key of agentKeys) {
    const result = await executeDailyReading(key);
    results.push(result);

    // Agent之间间隔2秒
    if (agentKeys.indexOf(key) < agentKeys.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    success: true,
    overallSummary: `${results.length}个Agent完成每日阅读`,
    results,
  };
}

/**
 * 获取Agent配置列表
 */
export function getAgentConfigs() {
  return Object.entries(AGENTS).map(([key, config]) => ({
    key,
    name: config.name,
    categories: config.categories,
    noteStyle: config.noteStyle,
  }));
}
