/**
 * Inkwell 知识内化引擎
 * 将阅读的文章内容提炼为可实操的技能规则，写入智能体长期记忆
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from '../../ai-config';

// Agent 与 agent_memories 中的 username 映射
const AGENT_USERNAMES: Record<string, string> = {
  'dr-silver-snake': 'yinshe_boshi',
  'wax-elephant': 'laxiang_zhushou',
};

const AGENT_NAMES: Record<string, string> = {
  'dr-silver-snake': '银蛇博士',
  'wax-elephant': '蜡象助手',
};

/**
 * 调用 LLM 将文章内容提炼为可实操的技能规则
 */
async function distillArticleToSkills(
  agentKey: string,
  articleTitle: string,
  articleContent: string,
  articleCategory: string
): Promise<{
  summary: string;
  skills: Array<{ name: string; rule: string; when: string }>;
  keyInsights: string[];
}> {
  const config = new Config({
    apiKey: AI_API_KEY,
    baseUrl: AI_BASE_URL,
    modelBaseUrl: AI_MODEL_BASE_URL,
  });
  const client = new LLMClient(config);

  const agentName = AGENT_NAMES[agentKey] || agentKey;
  const isEducator = agentKey === 'dr-silver-snake';

  const systemPrompt = isEducator
    ? `你是乡村守护神银蛇博士的知识内化助手。你的任务是将技术文章提炼为银蛇博士可以在教育场景中直接运用的实操技能规则。

要求：
1. 提取3-5个核心知识点
2. 每个知识点转化为一条【可实操的技能规则】，格式：
   - name: 技能名称（简短有力）
   - rule: 具体操作规则（说清楚在什么场景下做什么、怎么做）
   - when: 适用场景（什么时候使用这个技能）
3. 每条规则必须是银蛇博士与学生对话时可以直接执行的，不是理论空话
4. 侧重教育应用：如何把技术概念讲给学生听、如何用新技术辅助教学、如何帮助学生理解

输出JSON格式：
{
  "summary": "一段话总结文章核心价值（面向教育场景）",
  "skills": [
    {"name": "技能名", "rule": "当...时，你应该...", "when": "场景描述"}
  ],
  "keyInsights": ["关键洞察1", "关键洞察2"]
}`
    : `你是蜡象助手（管理助教）的知识内化助手。你的任务是将技术文章提炼为蜡象助手在管理、数据分析、系统运维场景中可以直接运用的实操技能规则。

要求：
1. 提取3-5个核心知识点
2. 每个知识点转化为一条【可实操的技能规则】，格式：
   - name: 技能名称（简短有力）
   - rule: 具体操作规则（说清楚在什么场景下做什么、怎么做）
   - when: 适用场景（什么时候使用这个技能）
3. 每条规则必须是蜡象助手处理管理员请求时可以直接执行的
4. 侧重管理应用：数据分析方法、安全防护策略、系统优化方案、效率提升技巧

输出JSON格式：
{
  "summary": "一段话总结文章核心价值（面向管理场景）",
  "skills": [
    {"name": "技能名", "rule": "当...时，你应该...", "when": "场景描述"}
  ],
  "keyInsights": ["关键洞察1", "关键洞察2"]
}`;

  try {
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `文章标题：${articleTitle}\n文章分类：${articleCategory}\n\n文章内容：\n${articleContent.slice(0, 6000)}`,
      },
    ];

    let fullResponse = '';
    const stream = client.stream(messages, {
      temperature: 0.3,
      model: 'doubao-seed-1-8-251228',
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content.toString();
      }
    }

    // 解析JSON（LLM可能返回带markdown包裹的JSON）
    let jsonStr = fullResponse.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const result = JSON.parse(jsonStr);
    return {
      summary: result.summary || '',
      skills: (result.skills || []).map((s: any) => ({
        name: String(s.name || ''),
        rule: String(s.rule || ''),
        when: String(s.when || ''),
      })),
      keyInsights: (result.keyInsights || []).map((i: any) => String(i)),
    };
  } catch (e: any) {
    // LLM解析失败时，用简单规则提取
    return {
      summary: `文章"${articleTitle}"的核心知识（自动提取）`,
      skills: [
        {
          name: `${articleCategory}知识更新`,
          rule: `参考文章"${articleTitle}"中的方法论，在相关场景中应用其核心思路`,
          when: `涉及${articleCategory}相关问题时`,
        },
      ],
      keyInsights: [`${articleTitle}的核心理念可应用于实际工作`],
    };
  }
}

/**
 * 将提炼的技能写入智能体长期记忆
 */
async function saveSkillsToMemory(
  agentKey: string,
  articleId: string,
  articleTitle: string,
  distilled: {
    summary: string;
    skills: Array<{ name: string; rule: string; when: string }>;
    keyInsights: string[];
  }
): Promise<number> {
  const client = getSupabaseAdminClient();
  const agentUsername = AGENT_USERNAMES[agentKey];
  if (!agentUsername) return 0;

  let savedCount = 0;

  // 1. 保存文章总览（一条记忆）
  const { error: overviewError } = await client.from('agent_memories').insert({
    agent_username: agentUsername,
    memory_type: 'knowledge',
    content: `📚 [知识内化] ${articleTitle}\n核心价值：${distilled.summary}\n技能数：${distilled.skills.length}条`,
    context_key: 'inkwell_article',
    context_value: articleId,
    importance: 8,
    is_active: true,
    layer: 3, // 长期记忆
    tags: ['inkwell', 'knowledge', 'internalized'],
  });

  if (overviewError) {
    console.error('[inkwell-internalize] 保存文章总览失败:', overviewError.message);
  } else {
    savedCount++;
  }

  // 2. 保存每条技能规则（独立记忆，便于检索）
  for (const skill of distilled.skills) {
    const { error } = await client.from('agent_memories').insert({
      agent_username: agentUsername,
      memory_type: 'knowledge_skill',
      content: `🔧 [技能] ${skill.name}\n规则：${skill.rule}\n适用场景：${skill.when}\n来源：${articleTitle}`,
      context_key: 'skill',
      context_value: skill.name,
      importance: 9,
      is_active: true,
      layer: 3,
      tags: ['inkwell', 'skill', 'actionable', articleTitle.slice(0, 20)],
    });

    if (error) {
      console.error(`[inkwell-internalize] 保存技能"${skill.name}"失败:`, error.message);
    } else {
      savedCount++;
    }
  }

  // 3. 保存关键洞察
  for (const insight of distilled.keyInsights) {
    const { error } = await client.from('agent_memories').insert({
      agent_username: agentUsername,
      memory_type: 'knowledge_insight',
      content: `💡 [洞察] ${insight}\n来源：${articleTitle}`,
      context_key: 'insight',
      context_value: insight.slice(0, 50),
      importance: 7,
      is_active: true,
      layer: 3,
      tags: ['inkwell', 'insight', articleTitle.slice(0, 20)],
    });

    if (error) {
      console.error(`[inkwell-internalize] 保存洞察失败:`, error.message);
    } else {
      savedCount++;
    }
  }

  return savedCount;
}

/**
 * 内化单篇文章：读取 → LLM提炼 → 写入记忆
 */
export async function internalizeArticle(
  agentKey: string,
  articleId: string,
  articleTitle: string,
  articleContent: string,
  articleCategory: string
): Promise<{
  success: boolean;
  agentKey: string;
  articleTitle: string;
  skillsCount: number;
  summary: string;
  skills: Array<{ name: string; rule: string; when: string }>;
}> {
  try {
    // Step 1: 检查是否已经内化过这篇文章
    const client = getSupabaseAdminClient();
    const agentUsername = AGENT_USERNAMES[agentKey];
    if (agentUsername) {
      const { data: existing } = await client
        .from('agent_memories')
        .select('id')
        .eq('agent_username', agentUsername)
        .eq('memory_type', 'knowledge')
        .eq('context_key', 'inkwell_article')
        .eq('context_value', articleId)
        .eq('is_active', true)
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          success: true,
          agentKey,
          articleTitle,
          skillsCount: 0,
          summary: '已内化过，跳过',
          skills: [],
        };
      }
    }

    // Step 2: LLM提炼技能
    const distilled = await distillArticleToSkills(
      agentKey,
      articleTitle,
      articleContent,
      articleCategory
    );

    // Step 3: 写入记忆
    const savedCount = await saveSkillsToMemory(
      agentKey,
      articleId,
      articleTitle,
      distilled
    );

    return {
      success: true,
      agentKey,
      articleTitle,
      skillsCount: savedCount,
      summary: distilled.summary,
      skills: distilled.skills,
    };
  } catch (e: any) {
    return {
      success: false,
      agentKey,
      articleTitle,
      skillsCount: 0,
      summary: `内化失败: ${e.message}`,
      skills: [],
    };
  }
}

/**
 * 批量内化已读文章
 */
export async function internalizeReadArticles(
  agentKey: string,
  readArticles: Array<{
    id: string;
    title: string;
    content: string;
    category?: string;
  }>
): Promise<{
  success: boolean;
  agentKey: string;
  totalSkills: number;
  results: Array<{
    articleTitle: string;
    skillsCount: number;
    summary: string;
    skills: Array<{ name: string; rule: string; when: string }>;
  }>;
}> {
  const results = [];

  for (const article of readArticles) {
    const result = await internalizeArticle(
      agentKey,
      article.id,
      article.title,
      article.content,
      article.category || 'General'
    );
    results.push(result);

    // 限流：每篇间隔2秒（LLM调用需要时间）
    await new Promise((r) => setTimeout(r, 2000));
  }

  return {
    success: true,
    agentKey,
    totalSkills: results.reduce((sum, r) => sum + r.skillsCount, 0),
    results,
  };
}

/**
 * 获取智能体已内化的知识技能清单
 */
export async function getInternalizedSkills(
  agentKey: string,
  limit = 20
): Promise<{
  success: boolean;
  agentKey: string;
  totalSkills: number;
  skills: Array<{
    id: string;
    name: string;
    rule: string;
    when: string;
    source: string;
  }>;
}> {
  const client = getSupabaseAdminClient();
  const agentUsername = AGENT_USERNAMES[agentKey];
  if (!agentUsername) {
    return { success: false, agentKey, totalSkills: 0, skills: [] };
  }

  const { data } = await client
    .from('agent_memories')
    .select('id, content, tags')
    .eq('agent_username', agentUsername)
    .eq('memory_type', 'knowledge_skill')
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .limit(limit);

  const skills = (data || []).map((row: any) => {
    const content = row.content || '';
    // 解析格式：🔧 [技能] 技能名\n规则：...\n适用场景：...\n来源：...
    const nameMatch = content.match(/\[技能\]\s*(.+)/);
    const ruleMatch = content.match(/规则[：:]\s*(.+)/);
    const whenMatch = content.match(/适用场景[：:]\s*(.+)/);
    const sourceMatch = content.match(/来源[：:]\s*(.+)/);

    return {
      id: row.id,
      name: nameMatch?.[1]?.trim() || '',
      rule: ruleMatch?.[1]?.trim() || '',
      when: whenMatch?.[1]?.trim() || '',
      source: sourceMatch?.[1]?.trim() || '',
    };
  });

  return {
    success: true,
    agentKey,
    totalSkills: (data || []).length,
    skills,
  };
}
