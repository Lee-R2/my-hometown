/**
 * 自省引擎 — 替代 OpenClaw Hook 的对话内自省机制
 * 
 * 核心思路：不再依赖外部 Hook 框架，而是在每轮对话结束后
 * 自动评估对话质量，提取学习点，存入持久化存储。
 */

// ========== 自省触发条件 ==========

export interface ReflectionTrigger {
  /** 用户纠正了智能体 */
  userCorrection: boolean;
  /** 智能体承认错误并修正 */
  agentAdmittedError: boolean;
  /** 智能体说"我不确定"或"让我想想" */
  uncertaintyDetected: boolean;
  /** 对话轮次超过阈值 */
  longConversation: boolean;
  /** 用户表达了不满 */
  userDissatisfaction: boolean;
  /** 产出了高质量回答（可复用模式） */
  highQualityOutput: boolean;
}

// ========== 自省条目 ==========

export type LearningCategory = 
  | 'correction'       // 被纠正的错误
  | 'insight'          // 新发现
  | 'knowledge_gap'    // 知识缺口
  | 'best_practice'    // 最佳实践
  | 'error_pattern'    // 错误模式
  | 'skill_gap';       // 技能短板

export type LearningArea =
  | 'teaching'         // 教学方法
  | 'data_analysis'    // 数据分析
  | 'communication'    // 沟通表达
  | 'task_handling'    // 任务处理
  | 'safety'           // 安全边界
  | 'domain_knowledge' // 领域知识
  | 'emotional_intel'  // 情感智能
  | 'tool_usage';      // 工具使用

export type LearningStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'resolved' 
  | 'promoted';

export interface ReflectionEntry {
  id: string;
  agent_id: string;          // 银蛇博士 or 蜡象助手
  user_id: string;           // 关联的用户
  session_id: string;        // 对话会话
  category: LearningCategory;
  area: LearningArea;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: LearningStatus;
  
  /** 发生了什么 */
  trigger_context: string;
  /** 学到了什么 */
  learning: string;
  /** 下次怎么做 */
  action_item: string;
  
  /** 关联的对话片段（脱敏后） */
  related_messages?: Array<{
    role: 'user' | 'assistant';
    content_snippet: string;  // 最多200字
  }>;
  
  /** 是否涉及特定小队/学校 */
  team_id?: string;
  school_id?: string;
  
  created_at: string;
  resolved_at?: string;
  occurrence_count: number;   // 同类问题出现次数
}

// ========== 对话质量评估 ==========

export interface ConversationQuality {
  /** 整体评分 1-5 */
  overall_score: number;
  /** 是否有可提取的学习点 */
  has_learnings: boolean;
  /** 触发条件 */
  triggers: ReflectionTrigger;
  /** 具体学习点 */
  reflections: Omit<ReflectionEntry, 'id' | 'created_at' | 'occurrence_count'>[];
}

/**
 * 从对话历史中检测自省触发条件
 */
export function detectReflectionTriggers(
  messages: Array<{ role: string; content: string }>
): ReflectionTrigger {
  const triggers: ReflectionTrigger = {
    userCorrection: false,
    agentAdmittedError: false,
    uncertaintyDetected: false,
    longConversation: false,
    userDissatisfaction: false,
    highQualityOutput: false,
  };

  const correctionKeywords = [
    '不对', '错了', '不是这样', '你说错了', '纠正一下', '搞错了',
    '不是的', '错了啊', '你理解错了', '我说的是', '不是这个意思',
    '别瞎说', '胡说', '不准确', '有误', '错误', '你搞混了',
  ];

  const admitErrorKeywords = [
    '抱歉', '对不起', '我说错了', '确实不对', '我理解有误',
    '我的错', '感谢纠正', '你说得对', '我搞混了', '我记错了',
  ];

  const uncertaintyKeywords = [
    '让我想想', '我不太确定', '可能', '也许', '大概',
    '我不太清楚', '不确定', '据我所知', '可能不准确',
  ];

  const dissatisfactionKeywords = [
    '不满意', '太差了', '什么破', '没用的', '算了',
    '不想说了', '太慢了', '你不会', '还是不行',
    '没什么用', '帮不上忙', '浪费时间',
  ];

  const highQualityPatterns = [
    // 结构化输出
    /(?:首先|第一步|1\.|一、)[\s\S]*(?:其次|第二步|2\.|二、)[\s\S]*(?:最后|第三步|3\.|三、)/,
    // 有数据支撑
    /根据.*数据|统计.*显示|查询.*结果|一共.*个/,
    // 有具体行动建议
    /建议你|你可以.*试试|下一步.*可以|推荐.*方案/,
  ];

  for (const msg of messages) {
    const content = msg.content.toLowerCase();

    if (msg.role === 'user') {
      if (correctionKeywords.some(kw => content.includes(kw))) {
        triggers.userCorrection = true;
      }
      if (dissatisfactionKeywords.some(kw => content.includes(kw))) {
        triggers.userDissatisfaction = true;
      }
    }

    if (msg.role === 'assistant') {
      if (admitErrorKeywords.some(kw => content.includes(kw))) {
        triggers.agentAdmittedError = true;
      }
      if (uncertaintyKeywords.some(kw => content.includes(kw))) {
        triggers.uncertaintyDetected = true;
      }
      if (highQualityPatterns.some(p => p.test(content))) {
        triggers.highQualityOutput = true;
      }
    }
  }

  if (messages.length >= 10) {
    triggers.longConversation = true;
  }

  return triggers;
}

/**
 * 从对话历史中提取自省条目
 * 供 LLM 在系统提示词中使用，而非直接调用
 */
export function buildReflectionPrompt(
  triggers: ReflectionTrigger,
  agentId: string
): string {
  const parts: string[] = [];

  if (triggers.userCorrection) {
    parts.push('- 用户纠正了你的回答 → 记录到"纠正日志"，分析为什么会出错，下次如何避免');
  }
  if (triggers.agentAdmittedError) {
    parts.push('- 你主动承认了错误 → 记录错误原因和正确做法，标记为"错误模式"');
  }
  if (triggers.uncertaintyDetected) {
    parts.push('- 你表达了不确定 → 记录知识缺口，标记为"待学习"');
  }
  if (triggers.userDissatisfaction) {
    parts.push('- 用户表达了不满 → 分析不满原因（速度？准确率？语气？），标记为"高优先级改进"');
  }
  if (triggers.highQualityOutput) {
    parts.push('- 你产出了高质量回答 → 提炼可复用模式，标记为"最佳实践"');
  }

  if (parts.length === 0) {
    return '';
  }

  const agentName = agentId === 'dr-silver-snake' ? '银蛇博士' : '蜡象助手';

  return `## 🧠 自省提醒
${agentName}，本轮对话中检测到以下可学习点：
${parts.join('\n')}

**自省规则**：
1. 不需要在回复中提及自省过程，安静地记录
2. 在回复末尾用 [自省] 标记记录（用户不可见，仅后台存储）
3. 格式：[自省] 类别:xxx | 领域:xxx | 优先级:xxx | 内容:xxx | 行动:xxx
4. 同类错误出现3次以上，自动升级优先级`;
}

/**
 * 解析智能体回复中的 [自省] 标记
 */
export function parseReflectionMarks(
  assistantReply: string
): Array<{
  category: LearningCategory;
  area: LearningArea;
  priority: 'low' | 'medium' | 'high' | 'critical';
  content: string;
  action: string;
}> {
  const results: Array<{
    category: LearningCategory;
    area: LearningArea;
    priority: 'low' | 'medium' | 'high' | 'critical';
    content: string;
    action: string;
  }> = [];

  // 格式1: [自省] 类别:xxx | 领域:xxx | 优先级:xxx | 内容:xxx | 行动:xxx
  const regex1 = /\[自省\]\s*类别:(\S+)\s*\|\s*领域:(\S+)\s*\|\s*优先级:(\S+)\s*\|\s*内容:(.+?)\s*\|\s*行动:(.+?)$/gm;

  let match;
  while ((match = regex1.exec(assistantReply)) !== null) {
    results.push({
      category: match[1] as LearningCategory,
      area: match[2] as LearningArea,
      priority: match[3] as 'low' | 'medium' | 'high' | 'critical',
      content: match[4].trim(),
      action: match[5].trim(),
    });
  }

  // 格式2: [自省] 发现:xxx | 归因:xxx | 策略:xxx
  const regex2 = /\[自省\]\s*发现:(.*?)\s*\|\s*归因:(.*?)\s*\|\s*策略:(.*?)$/gm;
  while ((match = regex2.exec(assistantReply)) !== null) {
    const discovery = match[1].trim();
    const cause = match[2].trim();
    const strategy = match[3].trim();
    results.push({
      category: 'insight' as LearningCategory,
      area: 'teaching' as LearningArea,
      priority: 'medium' as const,
      content: `${discovery}（归因：${cause}）`,
      action: strategy,
    });
  }

  return results;
}

/**
 * 从回复中移除 [自省] 标记（用户不可见）
 */
export function stripReflectionMarks(reply: string): string {
  return reply.replace(/\[自省\].+$/gm, '').trimEnd();
}
