/**
 * 内容审核工具
 * 用于检测发帖内容中的隐私信息、敏感词汇和不文明用语
 * 结合关键词过滤和LLM智能审核
 * 
 * 审核级别：最高级（标题单独严格审核 + 内容全面审核）
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';
import { AI_API_KEY, AI_BASE_URL, AI_MODEL_BASE_URL } from './ai-config';

// ============================================
// 不文明用语词库 - 最高级别覆盖
// ============================================

// 直接侮辱/攻击性词汇
const PROFANITY_SEVERE = [
  '傻逼', '操你', '妈的', '草泥马', '滚蛋', '白痴', '废物',
  '混蛋', '王八蛋', '龟孙子', '老不死', '去死', '贱人',
  '死全家', '脑残', '智障', '弱智', '变态', '流氓', '无耻',
  '下流', '贱货', '婊子', '狗日', '日狗', '畜生', '杂种',
  '婊子养的', '狗娘养的', '养不教', '烂货', '骚货',
  'fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard',
  'motherfucker', 'cunt', 'dick', 'piss', 'slut', 'whore',
];

// 轻度贬损/歧视性词汇
const PROFANITY_MILD = [
  '垃圾', '恶心', '丑八怪', '矮冬瓜', '胖猪', '肥猪',
  '笨蛋', '蠢货', '白痴', '废物', '怂包', '胆小鬼',
  '丑死', '穷鬼', '乡下人', '土包子', '乡巴佬',
  '娘炮', '男人婆', '女汉子', '绿茶', '小三',
  'idiot', 'stupid', 'moron', 'loser', 'ugly', 'dumb',
  'fool', 'trash', 'scum',
];

// 网络暴力/恐吓性词汇
const PROFANITY_THREAT = [
  '打死', '弄死', '杀了', '砍了', '削你', '揍你',
  '别想活', '等着瞧', '弄死你', '打死你', '搞死你',
  '灭了你', '整死你', '不要脸', '去跳楼', '去自杀',
  'kill', 'die', 'murder', 'suicide',
];

// 合并所有不文明用语
const PROFANITY_WORDS = [...PROFANITY_SEVERE, ...PROFANITY_MILD, ...PROFANITY_THREAT];

// ============================================
// 隐私信息检测模式 - 最高级别
// ============================================

const PRIVACY_PATTERNS = [
  // 手机号（更宽松匹配，覆盖带空格、横线等变体）
  { pattern: /1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g, name: '手机号码' },
  // 身份证号
  { pattern: /\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, name: '身份证号' },
  // 邮箱
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, name: '电子邮箱' },
  // QQ号（多种变体）
  { pattern: /[QqＱｑ][:：\s]*\d{5,11}/g, name: 'QQ号码' },
  // 微信号（多种变体）
  { pattern: /微[信心][:：\s]*[a-zA-Z0-9_-]{6,20}/g, name: '微信号' },
  // 详细地址
  { pattern: /[\u4e00-\u9fa5]{2,}(省|市|区|县|镇|乡|村|路|街|道|号|楼|室|栋)/g, name: '详细地址' },
  // 银行卡号
  { pattern: /\d{16,19}/g, name: '银行卡号' },
  // 护照号
  { pattern: /[EeDdGgPpSsHh]\d{8}/g, name: '护照号' },
  // 学籍号
  { pattern: /[GgLl]\d{1,6}[\dXx]{1}/g, name: '学籍号' },
];

// ============================================
// 标题专用敏感词 - 最高级别（标题比正文更严格）
// ============================================

// 标题中不应出现的词汇（包含正文允许但标题不允许的轻量词）
const TITLE_FORBIDDEN_EXTRA = [
  // 侮辱性简称/绰号
  '死', '杀', '血', '毒', '暴', '砍',
  // 网络黑话（标题中更不应出现）
  'nmsl', 'cnm', 'rnm', 'sb', 'zz', 'rz', 'nc',
  'tmd', 'wtf', 'omg', 'stfu',
  // 诱导性词汇
  '点击领取', '免费送', '转发有奖', '集赞',
  // 过度情绪化（标题应保持客观友好）
  '恨死', '烦死', '气死', '讨厌死', '最丑', '最烂', '最差',
];

// 合并标题完整禁止词
const TITLE_PROFANITY_WORDS = [...PROFANITY_WORDS, ...TITLE_FORBIDDEN_EXTRA];

interface ModerationResult {
  allowed: boolean;
  reasons: string[];
  keywordHits: string[];
  privacyHits: string[];
}

/**
 * 关键词过滤 - 快速初筛
 * @param content 正文内容
 * @param title 标题内容（可选，标题使用更严格的词库）
 */
function keywordFilter(content: string, title?: string): { profanityHits: string[]; privacyHits: string[] } {
  const profanityHits: string[] = [];
  const privacyHits: string[] = [];

  // 合并标题和正文进行隐私检测
  const combinedText = title ? `${title} ${content}` : content;

  // 检测隐私信息（标题+正文合并检测）
  for (const { pattern, name } of PRIVACY_PATTERNS) {
    const matches = combinedText.match(pattern);
    if (matches && matches.length > 0) {
      // 银行卡号误报率较高，需要长度恰好匹配
      if (name === '银行卡号') {
        const validMatches = matches.filter((m: string) => /^\d{16,19}$/.test(m));
        if (validMatches.length > 0) {
          privacyHits.push(name);
        }
      } else {
        privacyHits.push(name);
      }
    }
  }

  // 正文不文明用语检测（使用标准词库）
  const lowerContent = content.toLowerCase();
  for (const word of PROFANITY_WORDS) {
    if (lowerContent.includes(word.toLowerCase())) {
      profanityHits.push(word);
    }
  }

  // 标题不文明用语检测（使用更严格词库）
  if (title) {
    const lowerTitle = title.toLowerCase();
    for (const word of TITLE_PROFANITY_WORDS) {
      if (lowerTitle.includes(word.toLowerCase())) {
        // 去重：避免与正文字词重复
        if (!profanityHits.includes(word)) {
          profanityHits.push(word);
        }
      }
    }
  }

  return { profanityHits, privacyHits };
}

/**
 * LLM智能审核 - 深度分析
 * 对标题使用更严格的审核标准
 */
async function llmModeration(content: string, title?: string): Promise<string[]> {
  try {
    const config = new Config({
      apiKey: AI_API_KEY,
      baseUrl: AI_BASE_URL,
      modelBaseUrl: AI_MODEL_BASE_URL,
    });
    const client = new LLMClient(config);

    const titleSection = title
      ? `帖子标题：「${title}」

【重要】标题审核标准（最高级别）：
- 标题不得包含任何形式的人身攻击、侮辱、贬损性语言，即使是很轻微的也不允许
- 标题不得包含任何个人隐私信息（真实姓名、电话、地址、学校全称等）
- 标题不得包含暴力、恐怖、自残暗示
- 标题不得使用过度负面情绪化表达
- 标题应友好、积极、适合未成年人阅读`
      : '';

    const prompt = `你是一个面向小学生的STEM教育平台内容审核助手，审核标准为最高级别。请检查以下内容是否包含：

1. 个人隐私信息：真实姓名（非昵称）、家庭住址、联系方式（电话、QQ、微信、邮箱等）、学校全称
2. 不文明用语或攻击性语言（包括谐音、拼音缩写、隐晦表达）
3. 敏感或不当内容（暴力、色情、政治敏感、自残暗示等）
4. 诱导他人泄露隐私的信息
5. 网络暴力、霸凌相关内容
6. 歧视性语言（性别、地域、外貌、家庭背景等）

${titleSection}

帖子内容：${content}

请仅回复JSON格式，不要输出任何其他内容：
- 如果内容合规，回复：{"allowed": true, "reasons": []}
- 如果内容不合规，回复：{"allowed": false, "reasons": ["具体原因1", "具体原因2"]}`;

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: '你是一个面向未成年人的内容安全审核助手，审核标准为最高级别。对于标题中的任何负面、攻击性、隐私内容零容忍。只输出JSON格式的审核结果，不要输出任何其他内容。' },
      { role: 'user', content: prompt },
    ];

    const LLM_TIMEOUT_MS = 5000;
    const llmPromise = client.invoke(messages, {
      model: 'doubao-seed-1-6-lite-251015',
      temperature: 0.1,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM审核超时')), LLM_TIMEOUT_MS)
    );

    const response = await Promise.race([llmPromise, timeoutPromise]);

    const text = response.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result.reasons || [];
    }
    return [];
  } catch (error) {
    console.error('LLM审核失败(已降级为关键词过滤):', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 综合内容审核
 * 先进行关键词快速过滤，再进行LLM深度审核
 * 
 * @param content 正文内容
 * @param title 标题内容（标题使用更严格的审核标准）
 * @param skipLLM 是否跳过LLM审核（默认false）
 */
export async function moderateContent(
  content: string,
  title?: string,
  skipLLM: boolean = false
): Promise<ModerationResult> {
  const reasons: string[] = [];

  // 第一步：关键词快速过滤（标题+正文合并检测）
  const { profanityHits, privacyHits } = keywordFilter(content, title);

  // 根据命中来源生成具体原因
  if (profanityHits.length > 0) {
    // 检测是否在标题中命中了标题专用词
    const titleOnlyHits: string[] = [];
    const contentHits: string[] = [];
    
    if (title) {
      const lowerTitle = title.toLowerCase();
      for (const word of profanityHits) {
        if (lowerTitle.includes(word.toLowerCase())) {
          titleOnlyHits.push(word);
        } else {
          contentHits.push(word);
        }
      }
    } else {
      contentHits.push(...profanityHits);
    }

    if (titleOnlyHits.length > 0) {
      reasons.push(`标题包含不当用语，请修改标题后重新发布`);
    }
    if (contentHits.length > 0) {
      reasons.push(`内容包含不文明用语`);
    }
  }

  if (privacyHits.length > 0) {
    // 检测隐私信息是否出现在标题中
    const titleHasPrivacy = title && PRIVACY_PATTERNS.some(({ pattern }) => {
      const matches = title.match(pattern);
      if (!matches) return false;
      return matches.length > 0;
    });

    if (titleHasPrivacy) {
      reasons.push(`标题包含隐私信息：${[...new Set(privacyHits)].join('、')}，请勿在标题中透露个人信息`);
    } else {
      reasons.push(`内容包含隐私信息：${[...new Set(privacyHits)].join('、')}`);
    }
  }

  // 如果关键词过滤已经发现问题，直接返回（不通过）
  if (reasons.length > 0) {
    return {
      allowed: false,
      reasons,
      keywordHits: profanityHits,
      privacyHits,
    };
  }

  // 第二步：LLM深度审核（可选跳过）
  if (!skipLLM) {
    const llmReasons = await llmModeration(content, title);
    if (llmReasons.length > 0) {
      return {
        allowed: false,
        reasons: llmReasons,
        keywordHits: [],
        privacyHits: [],
      };
    }
  }

  return {
    allowed: true,
    reasons: [],
    keywordHits: [],
    privacyHits: [],
  };
}
