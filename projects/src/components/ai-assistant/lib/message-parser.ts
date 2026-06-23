/**
 * AI 助手组件 - 消息解析工具函数
 *
 * 从 ai-assistant.tsx 提取的纯函数，无副作用，无状态依赖
 * 负责解析助手回复中的推荐问题、方案选择等结构化内容
 */

/**
 * 解析消息中的推荐问题
 *
 * 助手回复可能包含如下结构：
 * ```
 * 正文内容...
 * ---
 * 💡还想了解什么？
 * 1. 问题一
 * 2. 问题二
 * ```
 *
 * 本函数将正文与推荐问题分离，便于 UI 分别渲染
 *
 * @param content 助手回复的原始内容
 * @returns mainContent 去除推荐问题段落后的正文；questions 推荐问题数组（可能为空）
 */
export function parseSuggestedQuestions(content: string): {
  mainContent: string;
  questions: string[];
} {
  // 匹配 "---\n💡还想了解什么？\n1. xxx\n2. xxx" 格式
  const pattern = /---\s*\n💡还想了解什么[？?]\s*\n((?:\d+[\.\.、].+\n?)+)/;
  const match = content.match(pattern);

  if (match) {
    const questionsText = match[1];
    const questions = questionsText
      .split(/\n/)
      .map((q) => q.replace(/^\d+[\.\.、]\s*/, '').trim())
      .filter((q) => q.length > 0);

    const mainContent = content.replace(pattern, '').trim();
    return { mainContent, questions };
  }

  return { mainContent: content, questions: [] };
}

/**
 * 从消息内容中检测是否包含方案 A/B/C 选择
 *
 * 当助手回复包含多个"方案X"时，返回存在的方案字母
 * 用于在消息下方渲染快捷选择按钮
 *
 * @param content 助手回复内容
 * @returns 存在的方案字母数组（如 ['A', 'B']），无方案时返回空数组
 */
export function detectPlanOptions(content: string): string[] {
  const planMatch = content.match(/方案[A-C]/g);
  // 至少出现 2 次才认为是方案选择场景
  if (!planMatch || planMatch.length < 2) return [];

  // 去重并返回存在的方案字母
  const letters = new Set<string>();
  for (const m of planMatch) {
    letters.add(m.replace('方案', ''));
  }
  return Array.from(letters);
}

/**
 * 从消息内容中提取指定方案的名称
 *
 * 匹配格式：【方案A】方案名称
 *
 * @param content 助手回复内容
 * @param letter 方案字母（A/B/C）
 * @returns 方案名称，未找到时返回"方案X"
 */
export function extractPlanName(content: string, letter: string): string {
  const planNameMatch = content.match(new RegExp(`【方案${letter}】([^\\n]+)`));
  return planNameMatch ? planNameMatch[1].trim() : `方案${letter}`;
}
