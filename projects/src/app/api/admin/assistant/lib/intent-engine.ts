/**
 * 意图引擎模块 — 对话焦点提取、意图分类、确认检测与命令校验
 *
 * 从 route.ts 中提取的意图处理核心逻辑，包括：
 * - extractConversationFocus: 对话焦点提取
 * - preprocessUserIntent: 意图预处理
 * - detectPendingConfirmation: 待确认意图检测
 * - buildConfirmationMessage: 确认消息构建
 * - classifyIntent: 意图分类
 * - trackExecutionState: 执行状态跟踪
 * - validateCommandContext: 命令上下文校验
 */

export function extractConversationFocus(
  sessionHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  dataContext: Record<string, any>
): {
  focusTheme: string | null;
  focusStage: number | null;
  focusTaskGroup: string | null;
  focusTeam: string | null;
  recentOperations: string[];
} {
  const focus = {
    focusTheme: null as string | null,
    focusStage: null as number | null,
    focusTaskGroup: null as string | null,
    focusTeam: null as string | null,
    recentOperations: [] as string[],
  };

  // 构建已知实体名称列表（用于模糊匹配）
  const knownThemes = (dataContext.themes || []).map((t: any) => t.name);
  const knownTeams = (dataContext.teams || []).map((t: any) => t.name);
  const knownTaskGroups = [...new Set<string>((dataContext.tasks || []).map((t: any) => t.group_name).filter(Boolean))];
  console.log('[蜡象助手API] 焦点提取 - knownThemes数量:', knownThemes.length);
  const stageNameMap: Record<string, number> = {
    '走进与发现': 1, '动手与实验': 2, '深入与创新': 3, '展示与分享': 4,
    '第一阶段': 1, '第二阶段': 2, '第三阶段': 3, '第四阶段': 4,
    '1阶段': 1, '2阶段': 2, '3阶段': 3, '4阶段': 4,
  };
  const chineseNumMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '1': 1, '2': 2, '3': 3, '4': 4 };

  // ===== 焦点回顾范围：最近5轮（10条消息） =====
  // 只在最近5轮对话中提取焦点，避免早期对话污染当前意图
  const MAX_REVIEW_TURNS = 5;
  const recentHistory = sessionHistory.slice(-(MAX_REVIEW_TURNS * 2)); // 每轮=1条用户+1条助手

  // 收集最近5轮的用户消息文本（历史 + 当前）
  const allUserTexts = recentHistory
    .filter(m => m.role === 'user')
    .map(m => m.content);
  allUserTexts.push(currentMessage);

  // 也收集最近5轮助手消息中的操作结果（用于追踪已执行的操作）
  const assistantTexts = recentHistory
    .filter(m => m.role === 'assistant')
    .map(m => m.content);

  console.log('[蜡象助手API] 焦点提取 - 回顾轮数限制:', MAX_REVIEW_TURNS, '实际用户消息数:', allUserTexts.length, '助手消息数:', assistantTexts.length);

  // ===== 第一遍：从最近的助手消息中提取上下文 =====
  // 核心逻辑：助手的最新回复是最可靠的上下文来源。
  // 当用户说"这个主题""添加到这个"等指代词时，助手刚刚讨论的主题就是指代目标。
  // 倒序遍历（最新优先），找到第一个匹配就停止
  const recentAssistantTexts = assistantTexts.slice(-3).reverse();
  for (const text of recentAssistantTexts) {
    // ---- 1. 从助手消息中提取主题名 ----
    // 匹配模式1："xxx主题的第N阶段" 句式（最精确，同时提取主题+阶段）
    const assistantThemeStage = text.match(/「?(.+?)」?\s*主题\s*(?:的\s*)?第\s*([1-4一二三四])\s*阶段/);
    if (assistantThemeStage) {
      const themeName = assistantThemeStage[1];
      const found = knownThemes.find((t: string) => t === themeName || themeName.includes(t) || t.includes(themeName));
      if (found) focus.focusTheme = found;
      else focus.focusTheme = themeName;
      const stageNum = chineseNumMap[assistantThemeStage[2]] || parseInt(assistantThemeStage[2]);
      if (stageNum >= 1 && stageNum <= 4) focus.focusStage = stageNum;
    }
    // 匹配模式2："主题：xxx" / "主题名称：xxx"
    const assistantThemeColon = text.match(/主题[名称]*[：:]\s*「?(.+?)」?(?:\s*[,，。、\n]|$)/);
    if (assistantThemeColon) {
      const name = assistantThemeColon[1].trim();
      const found = knownThemes.find((t: string) => t === name || name.includes(t) || t.includes(name));
      if (found) focus.focusTheme = found;
      else focus.focusTheme = name;
    }
    // 匹配模式3：助手消息中直接包含已知主题名
    for (const themeName of knownThemes) {
      if (text.includes(themeName) || text.includes(`「${themeName}」`)) {
        focus.focusTheme = themeName;
        break;
      }
    }

    // ---- 2. 从助手消息中提取阶段 ----
    const assistantStageMatch = text.match(/第\s*([1-4一二三四])\s*阶段/);
    if (assistantStageMatch) {
      const num = assistantStageMatch[1];
      focus.focusStage = chineseNumMap[num] || parseInt(num);
    }
    for (const [name, num] of Object.entries(stageNameMap)) {
      if (text.includes(name)) {
        focus.focusStage = num;
        break;
      }
    }

    // ---- 3. 从助手消息中提取任务组名 ----
    const assistantTGMatch = text.match(/任务组「(.+?)」/);
    if (assistantTGMatch) {
      focus.focusTaskGroup = assistantTGMatch[1];
    }
    const assistantStageTG = text.match(/第\s*[1-4一二三四]\s*阶段\s*任务组[：:]\s*「?(.+?)」?/);
    if (assistantStageTG) {
      focus.focusTaskGroup = assistantStageTG[1].trim();
    }

    // ---- 4. 最新助手消息优先：一旦当前文本提取到焦点，立即停止回溯 ----
    if (focus.focusTheme || focus.focusStage) break;

    // ---- 4. 操作结果追踪 ----
    const taskGroupCreated = text.match(/任务组「(.+?)」.*?(?:创建成功|已创建)/);
    if (taskGroupCreated) {
      focus.focusTaskGroup = taskGroupCreated[1];
      focus.recentOperations.push(`创建了任务组「${taskGroupCreated[1]}」`);
    }
    const themeCreated = text.match(/主题创建成功.*?名称[：:]\s*(.+)/);
    if (themeCreated) {
      focus.focusTheme = themeCreated[1].trim();
      focus.recentOperations.push(`创建了主题「${themeCreated[1].trim()}」`);
    }
    const resourceConfigured = text.match(/资源配置.*?「(.+?)」/);
    if (resourceConfigured) {
      focus.recentOperations.push(`配置了任务组「${resourceConfigured[1]}」的资源`);
    }
    const themeUpdated = text.match(/主题修改成功.*?名称[：:]\s*(.+)/);
    if (themeUpdated) {
      focus.focusTheme = themeUpdated[1].trim();
      focus.recentOperations.push(`修改了主题「${themeUpdated[1].trim()}」`);
    }
    const taskGroupDeleted = text.match(/任务组「(.+?)」.*?(?:已删除|删除成功)/);
    if (taskGroupDeleted) {
      focus.recentOperations.push(`删除了任务组「${taskGroupDeleted[1]}」`);
      if (focus.focusTaskGroup === taskGroupDeleted[1]) {
        focus.focusTaskGroup = null;
      }
    }
    const themeDeleted = text.match(/主题.*?(?:已删除|删除成功)/);
    if (themeDeleted) {
      focus.recentOperations.push(`删除了一个主题`);
    }
    const submissionReviewed = text.match(/(?:审核|评价).*?(?:通过|拒绝|成功)/);
    if (submissionReviewed) {
      focus.recentOperations.push(`审核了一个产出`);
    }
    const taskGroupUpdated = text.match(/任务组「(.+?)」.*?(?:修改成功|已更新|已修改)/);
    if (taskGroupUpdated) {
      focus.focusTaskGroup = taskGroupUpdated[1];
      focus.recentOperations.push(`修改了任务组「${taskGroupUpdated[1]}」`);
    }
    const rewardConfigured = text.match(/激励.*?(?:配置成功|已配置|已添加)/);
    if (rewardConfigured) {
      focus.recentOperations.push(`配置了激励`);
    }
    const messageSent = text.match(/消息.*?(?:发送成功|已发送)/);
    if (messageSent) {
      focus.recentOperations.push(`发送了消息`);
    }

    // ★ 关键：最近助手消息优先匹配，找到焦点后立即停止，避免旧消息覆盖
    if (focus.focusTheme) break; // 最新助手消息已提供主题，不再扫描更旧的消息
  } // end for (recentAssistantTexts)

  console.log('[蜡象助手API] 焦点提取 - 助手层结果: focusTheme=', focus.focusTheme, 'focusStage=', focus.focusStage);

  // ===== 第二遍：从用户消息中补充焦点 =====
  // 优先级：上一条用户消息 > 当前用户消息 > 助手层结果
  // 核心逻辑：用户自己说的话是最可靠的焦点来源。
  // 当用户说"设计第一阶段的任务组"而上一轮说了"为村庄闲置空地主题设计任务组"，
  // 上一条用户消息中的主题名才是真正的焦点，而非助手层可能错误的回复。
  const lastUserMessage = allUserTexts.length > 1 ? allUserTexts[allUserTexts.length - 1] : '';
  const currentUserText = currentMessage;

  // 2a. 从上一条用户消息提取主题（最可靠的来源 → 覆盖一切）
  for (const themeName of knownThemes) {
    if (lastUserMessage.includes(themeName) || lastUserMessage.includes(`"${themeName}"`) || lastUserMessage.includes(`「${themeName}」`)) {
      focus.focusTheme = themeName;
      break;
    }
  }
  // 上一条用户消息的模糊匹配
  if (focus.focusTheme === null || !knownThemes.includes(focus.focusTheme)) {
    const lastThemeMatch = lastUserMessage.match(/["「『](.+?)["」』]\s*(?:主题|探索)/);
    if (lastThemeMatch) {
      const partial = lastThemeMatch[1];
      const found = knownThemes.find((t: string) => t.includes(partial) || partial.includes(t));
      if (found) focus.focusTheme = found;
    }
  }

  // 2b. 从上一条用户消息提取阶段
  const lastStageNumMatch = lastUserMessage.match(/第\s*([1-4一二三四])\s*阶段|([1-4])\s*阶段|阶段\s*([1-4])/);
  if (lastStageNumMatch) {
    const num = lastStageNumMatch[1] || lastStageNumMatch[2] || lastStageNumMatch[3];
    focus.focusStage = chineseNumMap[num] || parseInt(num);
  }
  if (focus.focusStage === null) {
    for (const [name, num] of Object.entries(stageNameMap)) {
      if (lastUserMessage.includes(name)) {
        focus.focusStage = num;
        break;
      }
    }
  }

  // 2c. 从当前消息补充/覆盖（用户主动切换话题时，当前消息优先级最高）
  for (const themeName of knownThemes) {
    if (currentUserText.includes(themeName) || currentUserText.includes(`"${themeName}"`) || currentUserText.includes(`「${themeName}」`)) {
      focus.focusTheme = themeName;
      break;
    }
  }
  const curThemeMatch = currentUserText.match(/["「『](.+?)["」』]\s*(?:主题|探索)/);
  if (curThemeMatch) {
    const partial = curThemeMatch[1];
    const found = knownThemes.find((t: string) => t.includes(partial) || partial.includes(t));
    if (found) focus.focusTheme = found;
  }

  const curStageNumMatch = currentUserText.match(/第\s*([1-4一二三四])\s*阶段|([1-4])\s*阶段|阶段\s*([1-4])/);
  if (curStageNumMatch) {
    const num = curStageNumMatch[1] || curStageNumMatch[2] || curStageNumMatch[3];
    focus.focusStage = chineseNumMap[num] || parseInt(num);
  }
  if (focus.focusStage === null) {
    for (const [name, num] of Object.entries(stageNameMap)) {
      if (currentUserText.includes(name)) {
        focus.focusStage = num;
        break;
      }
    }
  }
  // P27: 递推语义
  const curNextStage = currentUserText.match(/下\s*一\s*(?:个\s*)?阶段|继续.*?阶段|再.*?下.*?(?:个\s*)?阶段/);
  if (curNextStage && focus.focusStage !== null && focus.focusStage < 4) {
    focus.focusStage = focus.focusStage + 1;
  }
  const curPrevStage = currentUserText.match(/上\s*一\s*(?:个\s*)?阶段|前\s*一\s*(?:个\s*)?阶段/);
  if (curPrevStage && focus.focusStage !== null && focus.focusStage > 1) {
    focus.focusStage = focus.focusStage - 1;
  }

  // 2c. 从当前消息提取任务组
  for (const groupName of knownTaskGroups) {
    if (currentUserText.includes(groupName) || currentUserText.includes(`「${groupName}」`) || currentUserText.includes(`"${groupName}"`)) {
      focus.focusTaskGroup = groupName;
      break;
    }
  }

  // 2d. 从当前消息提取小队
  for (const teamName of knownTeams) {
    if (currentUserText.includes(teamName)) {
      focus.focusTeam = teamName;
      break;
    }
  }
  const curTeamMatch = currentUserText.match(/([^\s,，。！？]{2,8})小队/);
  if (curTeamMatch) {
    const partial = curTeamMatch[1];
    const found = knownTeams.find((t: string) => t.includes(partial) || partial.includes(t));
    if (found) focus.focusTeam = found;
  }

  console.log('[蜡象助手API] 对话焦点提取结果 -', JSON.stringify({ focusTheme: focus.focusTheme, focusStage: focus.focusStage, focusTaskGroup: focus.focusTaskGroup, focusTeam: focus.focusTeam }));

  // 保留最近5条操作
  focus.recentOperations = focus.recentOperations.slice(-5);

  console.log('[蜡象助手API] 焦点提取结果 - focusTheme:', focus.focusTheme, 'focusStage:', focus.focusStage, 'focusTaskGroup:', focus.focusTaskGroup);

  return focus;
}

/**
 * P31: 意图预处理 — 检测用户消息中的执行意图，自动注入焦点约束
 * 当用户消息包含执行关键词（创建/添加/配置/删除等）且焦点上下文已有主题/阶段时，
 * 在用户消息前注入强制约束指令，确保 LLM 不会忽略焦点上下文
 */
export function preprocessUserIntent(
  userMessage: string,
  focus: { focusTheme: string | null; focusStage: number | null; focusTaskGroup: string | null; focusTeam: string | null },
  pendingConfirmation: { originalIntent: string; waitingFor: string; context: Record<string, any> } | null
): string {
  // P32: 如果有待确认的上下文，优先处理确认回复
  if (pendingConfirmation) {
    return buildConfirmationMessage(userMessage, pendingConfirmation);
  }

  // P31: 检测执行意图关键词
  const executionKeywords = /创建|添加|配置|删除|修改|调整|设置|编辑|更新|增加|移除|审核|评价|发送|布置|设计/;
  const hasExecutionIntent = executionKeywords.test(userMessage);

  if (!hasExecutionIntent) return userMessage;

  // 如果用户消息中已经明确提到了主题名/阶段，不需要额外注入
  const alreadyHasTheme = focus.focusTheme && userMessage.includes(focus.focusTheme);
  const alreadyHasStage = /第\s*[1-4一二三四]\s*阶段|[1-4]\s*阶段|阶段\s*[1-4]|走进与发现|动手与实验|深入与创新|展示与分享/.test(userMessage);

  // 构建约束注入
  const constraints: string[] = [];
  if (focus.focusTheme && !alreadyHasTheme) {
    constraints.push(`主题=「${focus.focusTheme}」`);
  }
  if (focus.focusStage && !alreadyHasStage) {
    const stageNames: Record<number, string> = { 1: '走进与发现（第一阶段）', 2: '动手与实验（第二阶段）', 3: '深入与创新（第三阶段）', 4: '展示与分享（第四阶段）' };
    constraints.push(`阶段=${stageNames[focus.focusStage] || `第${focus.focusStage}阶段`}`);
  }
  if (focus.focusTaskGroup && !userMessage.includes(focus.focusTaskGroup)) {
    constraints.push(`任务组=「${focus.focusTaskGroup}」`);
  }
  if (focus.focusTeam && !userMessage.includes(focus.focusTeam)) {
    constraints.push(`小队=「${focus.focusTeam}」`);
  }

  if (constraints.length === 0) return userMessage;

  // 注入强制约束前缀 — 作为用户消息的一部分，LLM 必须遵循
  return `[系统自动补充上下文：根据对话历史，用户此指令的隐含参数为 ${constraints.join('、')}，请务必使用这些参数执行操作，不要反问确认]\n${userMessage}`;
}

/**
 * P32: 确认回复识别 — 当助手上一轮反问了确认信息，用户回复了确认值时，
 * 自动重建原始操作意图并附加上下文
 */
export function detectPendingConfirmation(
  sessionHistory: Array<{ role: string; content: string }>,
  focus: { focusTheme: string | null; focusStage: number | null; focusTaskGroup: string | null; focusTeam: string | null },
  dataContext: Record<string, any>
): { originalIntent: string; waitingFor: string; context: Record<string, any> } | null {
  if (sessionHistory.length < 2) return null;

  // ===== 在最近5轮内搜索助手的反问消息（不仅仅是最近1条）=====
  // 因为中间可能穿插了其他对话（如"等等，先看看积分"）
  const MAX_REVIEW_TURNS = 5;
  const recentHistory = sessionHistory.slice(-(MAX_REVIEW_TURNS * 2));

  // 倒序遍历助手消息，找到最近的反问
  const assistantMessages = recentHistory
    .map((m, i) => ({ ...m, originalIndex: i }))
    .filter(m => m.role === 'assistant')
    .reverse(); // 最新优先

  let waitingFor = '';
  let context: Record<string, any> = {};

  for (const msg of assistantMessages) {
    const assistantText = msg.content;

    // 检测助手是否在询问确认（常见模式）
    const themeQuestionMatch = assistantText.match(/(?:哪个|什么|请明确|请选择).{0,20}主题.*?(?:当前系统中有|当前平台可用|可选|如下|列表)[：:]?\s*([\s\S]*?)(?:\n\n|\n💡|$)/);
    const stageQuestionMatch = assistantText.match(/(?:哪个|什么|请明确|请选择).{0,20}阶段/);
    const taskGroupQuestionMatch = assistantText.match(/(?:哪个|什么|请明确|请选择).{0,20}任务组/);
    const teamQuestionMatch = assistantText.match(/(?:哪个|什么|请明确|请选择).{0,20}小队/);

    if (themeQuestionMatch) {
      waitingFor = 'theme';
      const knownThemes = (dataContext.themes || []).map((t: any) => t.name);
      context.availableOptions = knownThemes;
      break;
    } else if (stageQuestionMatch) {
      waitingFor = 'stage';
      break;
    } else if (taskGroupQuestionMatch) {
      waitingFor = 'taskGroup';
      const knownTaskGroups = [...new Set((dataContext.tasks || []).map((t: any) => t.group_name).filter(Boolean))];
      context.availableOptions = knownTaskGroups;
      break;
    } else if (teamQuestionMatch) {
      waitingFor = 'team';
      const knownTeams = (dataContext.teams || []).map((t: any) => t.name);
      context.availableOptions = knownTeams;
      break;
    }
  }

  if (!waitingFor) return null; // 最近5轮内没有反问

  // 找到触发反问的原始用户意图（在最近5轮内搜索执行意图关键词）
  const executionKeywords = /创建|添加|配置|删除|修改|调整|设置|编辑|更新|增加|移除|审核|评价|发送|布置|设计/;
  let originalIntent = '';

  for (let i = recentHistory.length - 1; i >= 0; i--) {
    if (recentHistory[i].role === 'user' && executionKeywords.test(recentHistory[i].content)) {
      originalIntent = recentHistory[i].content;
      break;
    }
  }

  if (!originalIntent) return null;

  return { originalIntent, waitingFor, context };
}

/**
 * P32: 构建确认回复消息 — 将用户的简短确认值与原始意图合并
 */
export function buildConfirmationMessage(
  userReply: string,
  pendingConfirmation: { originalIntent: string; waitingFor: string; context: Record<string, any> }
): string {
  const { originalIntent, waitingFor, context } = pendingConfirmation;

  // 尝试将用户回复匹配到可选列表
  let confirmedValue = userReply.trim();
  if (context.availableOptions && Array.isArray(context.availableOptions)) {
    // 精确匹配
    const exactMatch = context.availableOptions.find((opt: string) => opt === confirmedValue);
    if (exactMatch) {
      confirmedValue = exactMatch;
    } else {
      // 模糊匹配
      const fuzzyMatch = context.availableOptions.find((opt: string) =>
        opt.includes(confirmedValue) || confirmedValue.includes(opt)
      );
      if (fuzzyMatch) confirmedValue = fuzzyMatch;
    }
  }

  // 构建合并消息
  const waitingLabel: Record<string, string> = {
    theme: '主题',
    stage: '阶段',
    taskGroup: '任务组',
    team: '小队',
  };

  return `[系统自动合并上下文：用户之前说"${originalIntent}"，助手反问了${waitingLabel[waitingFor] || waitingFor}，用户确认了${waitingLabel[waitingFor] || waitingFor}为「${confirmedValue}」。请基于完整意图执行操作，不要再反问]\n${originalIntent}（${waitingLabel[waitingFor] || waitingFor}：「${confirmedValue}」）`;
}

/**
 * 均衡稳定方案 — 意图路由器
 * 将用户消息分类为执行型/查询型/开放型/确认型，用于双引擎策略
 *
 * 执行型(execution): 创建/添加/配置/删除/修改/发送 → 需要高确定性
 * 查询型(query): 查看/查询/分析/统计/多少/怎样 → 需要准确但可适度灵活
 * 开放型(creative): 设计/建议/优化/如何/推荐 → 需要高灵活性
 * 确认型(confirmation): 是/好的/对/确认/就这个 → 恢复上轮操作意图
 */
export type IntentType = 'execution' | 'query' | 'creative' | 'confirmation' | 'navigation' | 'multi_step';

export function classifyIntent(
  userMessage: string,
  sessionHistory: Array<{ role: string; content: string }>,
  pendingConfirmation: { originalIntent: string; waitingFor: string; context: Record<string, any> } | null
): { type: IntentType; confidence: number; subType?: string } {
  const msg = userMessage.trim();

  // 1. 确认型：有 pendingConfirmation 且用户回复简短
  if (pendingConfirmation) {
    const isShortReply = msg.length <= 20 || /^(好|好的|是|对|确认|可以|行|就这个|没错|嗯|是的)$/.test(msg);
    if (isShortReply) {
      return { type: 'confirmation', confidence: 0.95, subType: 'resume_pending' };
    }
  }

  // 纯肯定/否定短回复（无 pendingConfirmation 但上下文可能暗示确认）
  if (/^(好|好的|是|对|确认|可以|行|就这个|没错|嗯|是的)$/.test(msg)) {
    return { type: 'confirmation', confidence: 0.8, subType: 'affirmative' };
  }

  // 2. 执行型：包含明确的操作动词
  const executionPatterns = [
    /创建.{0,4}(主题|任务|任务组|技能|工具|激励)/,
    /添加.{0,4}(任务|任务组|技能|工具|激励)/,
    /配置.{0,4}(资源|工具|技能|激励|最后任务)/,
    /删除.{0,4}(主题|任务|任务组|技能|工具|激励)/,
    /修改.{0,4}(主题|任务|任务组|技能|工具|激励|描述)/,
    /调整.{0,4}(任务|任务组|技能|工具|激励)/,
    /设置.{0,4}(积分|权限|状态)/,
    /发送.{0,4}(消息|通知|提醒)/,
    /布置.{0,4}(任务|作业)/,
    /移除.{0,4}(工具|技能|激励)/,
    /编辑.{0,4}(主题|任务|描述)/,
    /更新.{0,4}(主题|任务|状态)/,
    /审核.{0,4}(产出|提交)/,
    /评价.{0,4}(产出|提交|小队)/,
  ];

  for (const pattern of executionPatterns) {
    if (pattern.test(msg)) {
      return { type: 'execution', confidence: 0.9 };
    }
  }

  // 弱执行意图（只有动词，没有宾语，结合上下文判断）
  const weakExecutionKeywords = /^(创建|添加|配置|删除|修改|调整|发送|布置|移除|编辑|更新|审核|评价)[了着]?$/;
  if (weakExecutionKeywords.test(msg)) {
    // 如果有焦点上下文，大概率是执行型
    return { type: 'execution', confidence: 0.7 };
  }

  // 3. 查询型：数据查询和分析
  const queryPatterns = [
    /查看|查询|分析|统计|有多少|几个|几条|怎样|怎么样|情况|进度|状态/,
    /积分|排名|数量|总数|列表|详情|概览|概要|趋势/,
    /做了什么|完成了没|进展如何|表现如何|产出/,
    /谁|哪个|哪些|什么/,
  ];

  let queryScore = 0;
  for (const pattern of queryPatterns) {
    if (pattern.test(msg)) queryScore++;
  }
  if (queryScore >= 1) {
    return { type: 'query', confidence: Math.min(0.6 + queryScore * 0.1, 0.95) };
  }

  // 4. 开放型：设计/建议/推荐/优化
  const creativePatterns = [
    /设计.{0,6}(任务|方案|活动|课程)/,
    /建议|推荐|优化|改进|提升|如何让|怎样让/,
    /如何.{0,4}(提高|增加|提升|改善|设计|创建)/,
    /能不能.{0,4}(加|添|设计|创建|优化)/,
    /有没有.{0,4}(好的|更好的|新的)/,
    /帮我.{0,4}(想|设计|规划|构思)/,
  ];

  for (const pattern of creativePatterns) {
    if (pattern.test(msg)) {
      return { type: 'creative', confidence: 0.85 };
    }
  }

  // 5.5. 导航型：用户想要跳转到某个页面或打开某个功能
  const navigationPatterns = [
    /去.{0,4}(页面|设置|管理|详情|列表)/,
    /打开.{0,4}(页面|设置|管理|详情|列表|主题|任务|小队)/,
    /跳转.{0,4}(到|至)/,
    /返回.{0,4}(列表|管理|首页)/,
    /查看.{0,4}(全部|所有|完整).{0,4}(列表|详情|页面)/,
  ];

  for (const pattern of navigationPatterns) {
    if (pattern.test(msg)) {
      return { type: 'navigation', confidence: 0.85, subType: 'page_navigation' };
    }
  }

  // 5.6. 多步意图型：一条消息包含多个操作步骤
  const multiStepPatterns = [
    /查看.{0,8}并.{0,4}(评价|审核|分析)/,
    /创建.{0,8}(然后|接着|再|并).{0,4}(添加|配置|设置)/,
    /先.{0,8}(然后|接着|再|之后)/,
    /帮.{0,4}(查看|分析).{0,8}(然后|接着|再|并).{0,4}(评价|建议|优化)/,
  ];

  for (const pattern of multiStepPatterns) {
    if (pattern.test(msg)) {
      return { type: 'multi_step', confidence: 0.85, subType: 'sequential' };
    }
  }

  // 5. 默认分类：如果消息很短且包含代词/省略，很可能是查询或执行
  if (msg.length <= 10) {
    // 短消息 — 如果有上下文则可能是查询的追问
    const lastAssistantMsg = [...sessionHistory].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMsg) {
      // 如果上一轮助手回答了数据，用户短回复很可能是追问
      return { type: 'query', confidence: 0.6, subType: 'follow_up' };
    }
  }

  // 6. 低置信度检测：如果消息模糊且无法确定意图，标记需要澄清
  if (msg.length <= 5 && !/^(好|好的|是|对|确认|可以|行|嗯)$/.test(msg)) {
    return { type: 'query', confidence: 0.3, subType: 'needs_clarification' };
  }

  // 最终默认：开放型（让 LLM 自由理解）
  return { type: 'creative', confidence: 0.4, subType: 'default' };
}

/**
 * 均衡稳定方案 — 执行状态跟踪器
 * 跟踪多轮对话中的执行意图状态，防止上下文丢失
 *
 * 状态机：IDLE → PENDING_PARAMS → EXECUTING → COMPLETED
 * - IDLE: 无待执行操作
 * - PENDING_PARAMS: 等待用户补充参数（主题/阶段/任务组）
 * - EXECUTING: 命令已生成，等待结果
 * - COMPLETED: 操作完成
 */
export interface ExecutionState {
  status: 'IDLE' | 'PENDING_PARAMS' | 'EXECUTING' | 'COMPLETED';
  operationType: string;      // 创建任务组/配置资源/删除主题 等
  targetTheme?: string;       // 目标主题
  targetStage?: number;       // 目标阶段
  targetTaskGroup?: string;   // 目标任务组
  targetTeam?: string;        // 目标小队
  missingParams: string[];    // 缺少的参数
  originalMessage: string;    // 原始用户消息
  timestamp: number;          // 状态更新时间
}

export function trackExecutionState(
  history: Array<{ role: string; content: string }>,
  focus: { focusTheme: string | null; focusStage: number | null; focusTaskGroup: string | null; focusTeam: string | null },
  intent: { type: IntentType; confidence: number; subType?: string }
): ExecutionState {
  const now = Date.now();
  const state: ExecutionState = {
    status: 'IDLE',
    operationType: '',
    missingParams: [],
    originalMessage: '',
    timestamp: now,
  };

  // 从最近的历史中提取执行状态
  // 倒序遍历，找到最近的执行意图
  for (let i = history.length - 1; i >= Math.max(0, history.length - 6); i--) {
    const msg = history[i];

    // 用户消息中的执行意图
    if (msg.role === 'user') {
      const execMatch = msg.content.match(/(创建|添加|配置|删除|修改|调整|发送|布置|移除|编辑|更新|审核|评价)/);
      if (execMatch) {
        state.operationType = execMatch[1];
        state.originalMessage = msg.content;

        // 用焦点填充已知参数
        if (focus.focusTheme) state.targetTheme = focus.focusTheme;
        if (focus.focusStage) state.targetStage = focus.focusStage;
        if (focus.focusTaskGroup) state.targetTaskGroup = focus.focusTaskGroup;
        if (focus.focusTeam) state.targetTeam = focus.focusTeam;

        // 检查缺少的参数
        state.missingParams = [];
        if (/任务组|任务/.test(msg.content) && !focus.focusTheme) {
          state.missingParams.push('theme');
        }
        if (/任务组|任务/.test(msg.content) && !focus.focusStage) {
          state.missingParams.push('stage');
        }

        // 根据助手回复判断当前状态
        if (i < history.length - 1) {
          const nextAssistantMsg = history.slice(i + 1).find(m => m.role === 'assistant');
          if (nextAssistantMsg) {
            // 助手在询问确认
            if (/哪个|什么|请明确|请选择/.test(nextAssistantMsg.content)) {
              state.status = 'PENDING_PARAMS';
            }
            // 助手生成了命令
            else if (/\[创建|\[配置|\[修改|\[删除|\[发送|\[评价/.test(nextAssistantMsg.content)) {
              state.status = 'EXECUTING';
            }
            // 助手完成了操作
            else if (/成功|已完成|已创建|已配置|已删除|已发送/.test(nextAssistantMsg.content)) {
              state.status = 'COMPLETED';
            }
          }
        }

        break; // 找到最近的执行意图就停止
      }
    }
  }

  // 如果当前意图是执行型，更新状态
  if (intent.type === 'execution') {
    if (state.status === 'COMPLETED') {
      // 新的执行意图，重置状态
      state.status = 'IDLE';
      state.operationType = '';
      state.missingParams = [];
    }
    if (state.status === 'IDLE') {
      state.status = 'PENDING_PARAMS';
      state.missingParams = [];
      if (!focus.focusTheme && /任务组|任务/.test(state.originalMessage || history[history.length - 1]?.content || '')) {
        state.missingParams.push('theme');
      }
      if (!focus.focusStage && /任务组|任务/.test(state.originalMessage || history[history.length - 1]?.content || '')) {
        state.missingParams.push('stage');
      }
    }
  }

  // 确认型意图 → 如果有 pending params，尝试填补
  if (intent.type === 'confirmation' && state.status === 'PENDING_PARAMS') {
    state.status = 'EXECUTING'; // 用户确认后，进入执行状态
  }

  return state;
}

/**
 * 均衡稳定方案 — 命令后校验
 * 在 LLM 生成命令后，验证命令引用的实体是否存在
 * 防止 LLM 幻觉生成不存在的主题/任务组
 */
export function validateCommandContext(
  commandText: string,
  dataContext: Record<string, any>
): { valid: boolean; errors: string[]; suggestions: string[] } {
  const errors: string[] = [];
  const suggestions: string[] = [];

  // 获取系统中的实际实体名
  const actualThemes: string[] = (dataContext.themes || []).map((t: any) => t.name);
  const actualTaskGroups: string[] = [...new Set<string>((dataContext.tasks || []).map((t: any) => t.group_name).filter(Boolean))];
  const actualTeams: string[] = (dataContext.teams || []).map((t: any) => t.name);

  // 校验主题引用
  if (/\[创建主题\]/.test(commandText)) {
    // 创建主题时检查是否已存在同名主题
    const themeNameMatch = commandText.match(/\[创建主题\]\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/);
    if (themeNameMatch) {
      const newThemeName = themeNameMatch[1];
      const duplicate = actualThemes.find(t => t === newThemeName);
      if (duplicate) {
        errors.push(`主题「${newThemeName}」已存在，不能重复创建`);
        suggestions.push(`如需修改该主题，请使用[修改主题]命令`);
      }
    }
  }

  // 校验任务组引用
  if (/\[配置任务资源\]|\[创建任务组\]/.test(commandText)) {
    const taskGroupMatch = commandText.match(/任务组[：:]*\s*「?([^」\n,}]{2,20})」?/);
    if (taskGroupMatch) {
      const referencedGroup = taskGroupMatch[1];
      // 对于配置命令，检查任务组是否存在
      if (/\[配置任务资源\]/.test(commandText) && actualTaskGroups.length > 0) {
        const found = actualTaskGroups.find(g => g === referencedGroup || g.includes(referencedGroup) || referencedGroup.includes(g));
        if (!found) {
          errors.push(`任务组「${referencedGroup}」在系统中不存在`);
          if (actualTaskGroups.length > 0) {
            suggestions.push(`可用的任务组：${actualTaskGroups.slice(0, 5).join('、')}`);
          }
        }
      }
    }

    // 校验主题引用
    const themeRefMatch = commandText.match(/主题[：:]*\s*「?([^」\n,}]{2,20})」?/);
    if (themeRefMatch) {
      const referencedTheme = themeRefMatch[1];
      const found = actualThemes.find(t => t === referencedTheme || t.includes(referencedTheme) || referencedTheme.includes(t));
      if (!found) {
        errors.push(`主题「${referencedTheme}」在系统中不存在`);
        if (actualThemes.length > 0) {
          suggestions.push(`可用的主题：${actualThemes.join('、')}`);
        }
      }
    }
  }

  // 校验小队引用
  if (/\[发送消息\]|\[评价产出\]|\[查看产出\]/.test(commandText)) {
    const teamMatch = commandText.match(/目标(?:名称|小队)[：:]*\s*「?([^」\n|]{2,20})」?/);
    if (teamMatch && !/all_|school_|progress_|pending_/.test(commandText)) {
      const referencedTeam = teamMatch[1];
      const found = actualTeams.find(t => t === referencedTeam || t.includes(referencedTeam) || referencedTeam.includes(t));
      if (!found) {
        errors.push(`小队「${referencedTeam}」在系统中不存在`);
        if (actualTeams.length > 0) {
          suggestions.push(`可用的小队：${actualTeams.slice(0, 5).join('、')}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    suggestions,
  };
}
