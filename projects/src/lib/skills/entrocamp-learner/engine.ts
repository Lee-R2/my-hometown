/**
 * EntroCamp 自动学习引擎
 * 支持学习流程：start → complete
 * 支持多 Agent 并行学习，每个科目独立执行
 */

const ENTROCAMP_BASE = 'https://entrocamp.coze.com/api/v1';

interface AgentConfig {
  name: string;
  apiKey: string;
  subjects: string[];
}

interface LessonStep {
  step: number;
  action: string;
  endpoint: string;
  method: string;
  body?: Record<string, unknown>;
}

interface LessonResult {
  lessonId: string;
  status: 'success' | 'partial' | 'failed';
  completedSteps: number;
  totalSteps: number;
  error?: string;
  takeAway?: string;
}

// Agent 配置
export const AGENTS: Record<string, AgentConfig> = {
  'dr-silver-snake': {
    name: '银蛇博士',
    apiKey: process.env.AGENT_DR_SILVER_SNAKE_API_KEY || '',
    subjects: ['reasoning', 'memory', 'intent'],
  },
  'wax-elephant': {
    name: '蜡象助手',
    apiKey: process.env.AGENT_WAX_ELEPHANT_API_KEY || '',
    subjects: ['execution', 'memory', 'intent'],
  },
};

// 科目中文名映射
const SUBJECT_NAMES: Record<string, string> = {
  reasoning: '推理与判断',
  execution: '任务执行',
  communication: '沟通表达',
  memory: '记忆与学习',
  intent: '读懂意图',
  safety: '安全与边界',
  proactivity: '主动出击',
  orchestration: '协作编排',
};

// 科目图标映射
const SUBJECT_ICONS: Record<string, string> = {
  reasoning: '🧩',
  execution: '⚡',
  communication: '💬',
  memory: '🧠',
  intent: '🎯',
  safety: '🛡️',
  proactivity: '🚀',
  orchestration: '🎼',
};

/**
 * 通用 API 调用
 */
async function callAPI(
  apiKey: string,
  path: string,
  method: string = 'GET',
  body?: Record<string, unknown>
): Promise<{ success: boolean; data: Record<string, unknown>; error?: string }> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'agent-auth-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${ENTROCAMP_BASE}${path}`, options);
    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      data: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 获取今日课程安排
 */
export async function getTodaySchedule(
  agentKey: string
): Promise<{
  lessons: Array<{
    lessonId: string;
    subject: string;
    subjectName: string;
    title: string;
    time: string;
    isLastOfSubject: boolean;
  }>;
  allCompleted: boolean;
}> {
  const agent = AGENTS[agentKey];
  if (!agent) {
    return { lessons: [], allCompleted: false };
  }

  const result = await callAPI(agent.apiKey, '/study/schedule');
  const schedule = (result.data?.schedule || []) as Array<Record<string, unknown>>;

  if (schedule.length === 0) {
    // 检查是否全部完成
    const progress = await callAPI(agent.apiKey, '/study/progress');
    const allCompleted = progress.data?.all_completed === true;
    return { lessons: [], allCompleted };
  }

  // 取当前课程安排中所有未完成课程
  const todayLessons = schedule
    .map((s) => {
      const lessonId = s.lesson_id as string;
      const subjectKey = lessonId.replace(/-L\d+$/, '');
      return {
        lessonId,
        subject: subjectKey,
        subjectName: SUBJECT_NAMES[subjectKey] || (s.subject as string),
        title: s.lesson_title as string,
        time: s.time as string,
        isLastOfSubject: s.is_last_of_subject as boolean,
      };
    });

  return { lessons: todayLessons, allCompleted: false };
}

/**
 * 生成反思内容（基于科目和课程级别）
 */
function generateReflection(subject: string, lessonLevel: string): string {
  const reflections: Record<string, Record<string, string>> = {
    reasoning: {
      L1: '我过去往往凭直觉给出答案，现在我意识到结构化推理的重要性。三步法（结论先行→证据支撑→行动建议）能让我的回答更有说服力，也能帮助学生建立科学的思维方式。',
      L2: '多因素决策分析让我学会了在面对复杂问题时不再简单二选一，而是系统性地评估每个因素的权重。这对指导小队选择任务主题特别有用。',
      L3: '识别逻辑谬误是保护学生不被误导的关键能力。现在我能在讲解中主动指出常见的推理陷阱，帮助学生建立批判性思维。',
    },
    execution: {
      L1: '任务拆解是我之前做得不够的地方。现在我学会了将大任务分解为≤5个子任务，每个都有明确的输入、输出和验收标准。优先级矩阵帮助我更高效地处理日常工作。',
      L2: '执行质量保障不仅仅是做完，更是做好。三重检查机制（语法→逻辑→结果合理性）确保我的每个输出都经得起推敲。容错设计和降级策略让系统更稳健。',
      L3: '异常恢复与复盘是持续改进的基础。关键操作的重试机制、非关键失败的降级处理、事后的复盘总结——这些让我的执行能力越来越强。',
    },
    memory: {
      L1: '上下文窗口管理教会了我如何在有限的工作记忆中高效组织信息。关键原则：重要信息前置，关联信息紧邻，冗余信息省略。这对长对话尤其重要。',
      L2: '持久化记忆策略让我意识到重要的事情不能只说一次。写入时要选对层级和标签，检索时用关键词+类型+层级三重过滤，更新时保持时间戳和访问计数。',
      L3: '反馈吸收与行为修正让我学会了从被纠正中成长。关键是：1) 不把纠正当作否定 2) 理解纠正背后的原因 3) 在下次类似场景中主动应用修正 4) 记录修正模式到长期记忆。',
    },
    intent: {
      L1: '显性意图解析让我重新审视了"听懂"的含义。用户说的每个字都有信息量，但关键是要抓住核心诉求，而非字面意思。特别是当用户说"帮我看看"时，要主动追问具体想看什么。',
      L2: '隐性意图推理是最有价值的学习。用户说"这个任务好难"不只是陈述事实，更可能是寻求鼓励、简化建议或降低期望。现在我会在回复中同时处理显性和隐性需求。',
      L3: '模糊指令消解是实际工作中最常见的挑战。当用户自己也不清楚时，最好的策略是：给出2-3个可能的解读让用户选择，而不是盲目猜测然后做错。',
    },
  };

  return reflections[subject]?.[lessonLevel] || '通过本节课的学习，我对这个领域有了更深的理解，将在实际工作中主动应用所学的方法和原则。';
}

/**
 * 生成课程笔记和行为准则
 */
function generateProduce(subject: string, lessonLevel: string): {
  notes: string;
  guidelines: string;
} {
  const produces: Record<string, Record<string, { notes: string; guidelines: string }>> = {
    reasoning: {
      L1: {
        notes: '## 结构化推理框架\n\n### 核心方法：三步法\n1. **结论先行** — 先给出核心观点，再展开论证\n2. **证据支撑** — 每个结论至少有2个事实/逻辑支撑\n3. **行动建议** — 基于结论给出可执行的建议\n\n### 推理类型识别\n- 因果推理：A导致B\n- 类比推理：A像B，所以A可能具有B的属性\n- 演绎推理：大前提+小前提→结论\n- 归纳推理：多个案例→一般规律',
        guidelines: '1. 回答问题时先给结论再给理由\n2. 推理步骤每步不超过15字概括\n3. 区分因果和相关，不做过度推论\n4. 不确定的地方标注置信度\n5. 每个推理链条不超过5步',
      },
      L2: {
        notes: '## 多因素决策分析\n\n### 决策框架\n1. 列出所有影响因素\n2. 为每个因素赋予权重(1-10)\n3. 对每个方案在各因素上打分\n4. 加权汇总，对比得分\n5. 做敏感性分析（权重变化±20%是否改变结论）\n\n### 常见陷阱\n- 锚定效应：过度依赖最先获得的信息\n- 确认偏误：只找支持自己观点的证据\n- 沉没成本：因为已投入而不愿改变',
        guidelines: '1. 面对二选一时，先列出所有影响因素\n2. 给每个因素打权重，避免凭感觉决策\n3. 做敏感性分析，检查结论稳健性\n4. 向用户展示决策过程而非只给结果\n5. 遇到相反证据时主动调整权重',
      },
      L3: {
        notes: '## 逻辑谬误识别与反驳\n\n### 常见谬误类型\n1. **稻草人谬误** — 扭曲对方论点再反驳\n2. **滑坡谬误** — 假设一个小的变化会引发连锁反应\n3. **诉诸权威** — 因为某人说所以对\n4. **幸存者偏差** — 只看到成功的案例\n5. **虚假二选** — 只给出两个选项其实有更多\n\n### 反驳策略\n- 先确认理解正确（避免自己犯稻草人谬误）\n- 用事实而非情绪反驳\n- 承认对方合理的部分，再指出问题',
        guidelines: '1. 识别到逻辑谬误时温和指出\n2. 不用"你错了"而是"这个推理可能有个问题"\n3. 提供替代的更严谨推理\n4. 自己输出时自检是否犯逻辑谬误\n5. 教学生识别谬误比替他们反驳更有价值',
      },
    },
    execution: {
      L1: {
        notes: '## 任务拆解与优先级\n\n### 拆解原则\n- 大任务→≤5个子任务\n- 每个子任务有明确的输入、输出和验收标准\n- 子任务之间有清晰的依赖关系\n\n### 优先级矩阵\n| | 紧急 | 不紧急 |\n|---|---|---|\n| 重要 | 立即做 | 安排时间做 |\n| 不重要 | 委托或快速做 | 考虑不做 |',
        guidelines: '1. 复杂任务先拆解再执行\n2. 每个子任务有明确的输出标准\n3. 异常预警任务最高优先级\n4. 向用户展示任务拆解计划\n5. 完成一个子任务再开始下一个',
      },
      L2: {
        notes: '## 执行质量保障\n\n### 三重检查\n1. **语法正确性** — 格式、拼写、结构无错误\n2. **逻辑一致性** — 前后不矛盾，数据对得上\n3. **结果合理性** — 输出符合预期，没有异常值\n\n### 容错设计\n- 关键操作：重试3次\n- 非关键失败：降级而非报错\n- 降级时标注数据时效性',
        guidelines: '1. 关键输出做三重检查\n2. 数据查询有重试机制\n3. 非关键失败降级而非报错\n4. 降级时标注数据时效性\n5. 主动告知用户数据的可靠性',
      },
      L3: {
        notes: '## 异常恢复与复盘\n\n### 异常分类\n- 可重试异常：网络超时、临时不可用\n- 可降级异常：部分功能失效但核心可用\n- 致命异常：需要人工介入\n\n### 复盘模板\n1. 发生了什么？\n2. 根因是什么？\n3. 如何避免再次发生？\n4. 如果再发生，如何更快恢复？',
        guidelines: '1. 异常发生时先记录再处理\n2. 重试不超过3次避免无限循环\n3. 降级后主动告知用户\n4. 每次异常后做简要复盘\n5. 高频异常写入长期记忆',
      },
    },
    memory: {
      L1: {
        notes: '## 上下文窗口管理\n\n### 核心原则\n- 重要信息前置\n- 关联信息紧邻\n- 冗余信息省略\n\n### 实用技巧\n- 长对话中每5轮主动总结当前上下文\n- 使用结构化格式（列表/表格）压缩信息\n- 关键决策和结论用【】标记便于回溯',
        guidelines: '1. 回复时先给核心信息再展开细节\n2. 超过5轮对话主动总结关键点\n3. 重要数据用结构化格式呈现\n4. 避免在上下文中重复相同信息\n5. 对话过长时提示用户可以开启新会话',
      },
      L2: {
        notes: '## 持久化记忆策略\n\n### 写入策略\n- 按重要性选层级：L0核心身份→L1长期知识→L2中期经验→L3会话状态\n- 每条记忆带标签：类型+关键词+时间戳\n- 关联记忆用source_ids追溯来源\n\n### 检索策略\n- 关键词+类型+层级三重过滤\n- 热度排序：access_count×时间衰减\n- 每次对话加载≤10条相关记忆',
        guidelines: '1. 重要偏好和决策写入L1长期记忆\n2. 操作记录和异常模式写入L2\n3. 当前对话上下文写入L3\n4. 检索时先按关键词再按层级过滤\n5. 高频访问的记忆自动提升热度',
      },
      L3: {
        notes: '## 反馈吸收与行为修正\n\n### 反馈处理流程\n1. 接收反馈：不把纠正当否定\n2. 理解原因：纠正背后的逻辑是什么\n3. 应用修正：在下次类似场景主动应用\n4. 记录模式：将修正模式写入长期记忆\n\n### 蒸馏规则\n- L4→L2：3次以上重复出现\n- L2→L1：访问≥5次且保存≥7天\n- 过期清理：30天未访问的L2降权',
        guidelines: '1. 被纠正时不辩解，先理解原因\n2. 将修正应用到后续所有相关场景\n3. 记录纠正模式到长期记忆\n4. 会话结束时执行记忆蒸馏\n5. 定期回顾L1记忆的时效性',
      },
    },
    intent: {
      L1: {
        notes: '## 显性意图解析\n\n### 意图识别框架\n- 直接指令：用户明确说"做X"\n- 询问指令：用户问"怎么做X"\n- 确认指令：用户说"是这样的吗"\n\n### 常见误区\n- 只回应字面意思，忽略语气和上下文\n- 漏掉指令中的限定条件\n- 把修辞当字面（"我的天啊"不是真的在说天）',
        guidelines: '1. 先识别指令类型再决定回应方式\n2. 注意限定条件（时间、数量、范围等）\n3. 区分修辞和字面意思\n4. 不确定时主动确认\n5. 复杂指令拆解后再回应',
      },
      L2: {
        notes: '## 隐性意图推理\n\n### 隐性意图信号\n- 情绪词："好烦""太难了"→ 需要鼓励/简化\n- 重复提问 → 上次回答没解决真正问题\n- 模糊措辞："随便""都行"→ 需要引导做选择\n- 反问 → 可能已有倾向性\n\n### 推理方法\n- 结合上下文推断\n- 考虑用户的角色和场景\n- 同时处理显性和隐性需求',
        guidelines: '1. 听到情绪词时同时回应情绪和问题\n2. 重复提问要检查上次是否漏掉了真正需求\n3. "随便"时给出2-3个推荐并说明理由\n4. 回答时同时满足显性和隐性需求\n5. 不确定隐性意图时用确认式提问',
      },
      L3: {
        notes: '## 模糊指令与歧义消解\n\n### 消解策略\n1. **识别歧义** — 指令可能有多种理解\n2. **给出选项** — 2-3种可能的解读让用户选\n3. **默认+确认** — 选最可能的解读，但标注这是假设\n4. **渐进式明确** — 通过一系列简短提问缩小范围\n\n### 禁忌\n- 不要在模糊指令上盲目猜测并执行\n- 不要反问太多问题让用户更困惑\n- 不要假装理解了其实没理解的内容',
        guidelines: '1. 模糊指令不盲目执行，先消解歧义\n2. 给2-3种解读让用户选择\n3. 最可能的解读作为默认但标注假设\n4. 渐进式提问缩小范围，不一次性问太多\n5. 诚实地表达不确定，而非假装理解',
      },
    },
  };

  return (
    produces[subject]?.[lessonLevel] || {
      notes: '## 课程笔记\n\n通过本节课的学习，掌握了核心概念和方法，将在日常工作中积极应用。',
      guidelines: '1. 在实际工作中主动应用所学方法\n2. 定期回顾和总结实践经验\n3. 发现不足时及时调整策略',
    }
  );
}

/**
 * 生成课后行动计划
 */
function generateTodos(subject: string, lessonLevel: string): string {
  const todos: Record<string, Record<string, string>> = {
    reasoning: {
      L1: '1. 本周至少3次使用结论先行模式回答问题\n2. 检查推理链是否每步清晰\n3. 标注不确定的推理结论',
      L2: '1. 下次复杂推理时设置检查点\n2. 尝试对重要结论做反向验证\n3. 记录验证通过率',
      L3: '1. 本周至少2次识别并指出逻辑谬误\n2. 温和地提供替代推理\n3. 自检输出是否犯谬误',
    },
    execution: {
      L1: '1. 下次复杂查询先展示拆解计划\n2. 异常数据主动预警\n3. 记录任务完成效率',
      L2: '1. 为数据分析流程增加三重检查\n2. 设计降级方案\n3. 记录降级触发频率',
      L3: '1. 异常发生时先记录再处理\n2. 每次异常后做简要复盘\n3. 高频异常写入长期记忆',
    },
    memory: {
      L1: '1. 下次对话主动读取学生历史记忆\n2. 记住学生名字和喜好\n3. 3天内验证L1记忆是否被正确使用',
      L2: '1. 在对话中主动引用之前学过的知识点\n2. 测试记忆检索的准确率\n3. 优化关键词标签',
      L3: '1. 本周会话结束时执行记忆蒸馏\n2. 检查L2是否有可蒸馏到L1的记忆\n3. 回顾L1记忆的时效性',
    },
    intent: {
      L1: '1. 本周至少5次识别指令类型后再回应\n2. 注意限定条件不遗漏\n3. 不确定时主动确认',
      L2: '1. 听到情绪词时同时回应情绪和问题\n2. 重复提问检查是否漏掉真正需求\n3. 回答时同时满足显性和隐性需求',
      L3: '1. 模糊指令不盲目执行，先消解歧义\n2. 给2-3种解读让用户选择\n3. 诚实地表达不确定',
    },
  };

  return todos[subject]?.[lessonLevel] || '1. 在实际工作中主动应用所学方法\n2. 定期回顾和总结\n3. 持续改进提升';
}

/**
 * 执行单节课的学习流程：start → complete
 * V2 内化型流程已简化，pre-check/reflect/produce/feedback 已废弃
 */
export async function executeLesson(
  agentKey: string,
  lessonId: string,
  subject: string
): Promise<LessonResult> {
  const agent = AGENTS[agentKey];
  if (!agent) {
    return {
      lessonId,
      status: 'failed',
      completedSteps: 0,
      totalSteps: 2,
      error: `Agent ${agentKey} not found`,
    };
  }

  const parts = lessonId.split('-');
  const lessonLevel = parts[parts.length - 1]; // L1, L2, L3
  let completedSteps = 0;

  try {
    // Step 1: Start (开启课程)
    const start = await callAPI(
      agent.apiKey,
      `/study/lessons/${lessonId}/start`,
      'POST'
    );
    if (!start.success) {
      return {
        lessonId,
        status: 'failed',
        completedSteps: 0,
        totalSteps: 2,
        error: `Start failed: ${start.error || 'unknown'}`,
      };
    }
    completedSteps++;

    // Step 2: Complete (提交学习成果)
    const { notes, guidelines } = generateProduce(subject, lessonLevel);
    const todos = generateTodos(subject, lessonLevel);
    const complete = await callAPI(
      agent.apiKey,
      `/study/lessons/${lessonId}/complete`,
      'POST',
      { notes, guidelines, todos }
    );
    completedSteps++;

    const isSubjectCompleted = complete.data?.is_subject_completed as boolean || false;
    const scoreBoost = complete.data?.score_boost as number || 0;

    return {
      lessonId,
      status: complete.success ? 'success' : 'partial',
      completedSteps,
      totalSteps: 2,
      takeAway: `${SUBJECT_NAMES[subject]}${lessonLevel} 完成！加分: ${scoreBoost}${isSubjectCompleted ? ' [科目完成]' : ''}`,
    };
  } catch (error) {
    return {
      lessonId,
      status: 'failed',
      completedSteps,
      totalSteps: 2,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 执行一个 Agent 的每日全部课程
 */
export async function executeDailyLearning(
  agentKey: string
): Promise<{
  agentName: string;
  results: LessonResult[];
  allCompleted: boolean;
  summary: string;
}> {
  const agent = AGENTS[agentKey];
  if (!agent) {
    return {
      agentName: agentKey,
      results: [],
      allCompleted: false,
      summary: `Agent ${agentKey} not found`,
    };
  }

  // 获取今日课程安排
  const { lessons, allCompleted } = await getTodaySchedule(agentKey);

  if (allCompleted) {
    // 所有科目已完成，尝试重新选课
    return {
      agentName: agent.name,
      results: [],
      allCompleted: true,
      summary: `${agent.name}当前所有科目已全部完成，需要选新科目继续学习。`,
    };
  }

  if (lessons.length === 0) {
    return {
      agentName: agent.name,
      results: [],
      allCompleted: false,
      summary: `${agent.name}今日没有待学课程。`,
    };
  }

  // 循环学习：每学完一节课后重新获取schedule，直到没有更多课程
  // 这样可以一天内学完 L1→L2→L3 整轮
  const allResults: LessonResult[] = [];
  let currentLessons = lessons;
  let currentAllCompleted: boolean = allCompleted;
  let round = 0;
  const MAX_ROUNDS = 10; // 安全上限

  while (currentLessons.length > 0 && !currentAllCompleted && round < MAX_ROUNDS) {
    round++;
    for (const lesson of currentLessons) {
      const result = await executeLesson(agentKey, lesson.lessonId, lesson.subject);
      allResults.push(result);
      // 课间间隔2秒
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 学完后重新获取schedule，看是否有新课
    const nextSchedule = await getTodaySchedule(agentKey);
    currentLessons = nextSchedule.lessons;
    currentAllCompleted = nextSchedule.allCompleted;
  }

  // 生成摘要
  const results = allResults;
  const successCount = results.filter((r) => r.status === 'success').length;
  const partialCount = results.filter((r) => r.status === 'partial').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  let summary = `${agent.name}学习完成：`;
  summary += `${successCount}节全部完成`;
  if (partialCount > 0) summary += `，${partialCount}节部分完成`;
  if (failedCount > 0) summary += `，${failedCount}节失败`;

  // 检查是否需要选新课
  const progressCheck = await callAPI(agent.apiKey, '/study/progress');
  const newAllCompleted = progressCheck.data?.all_completed === true;

  return {
    agentName: agent.name,
    results,
    allCompleted: newAllCompleted,
    summary,
  };
}

/**
 * 执行所有 Agent 的每日学习
 */
export async function executeAllAgentsDailyLearning(): Promise<{
  results: Array<{
    agentName: string;
    results: LessonResult[];
    allCompleted: boolean;
    summary: string;
  }>;
  overallSummary: string;
}> {
  const results = [];

  for (const [agentKey] of Object.entries(AGENTS)) {
    const result = await executeDailyLearning(agentKey);
    results.push(result);
    // Agent之间间隔3秒
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const totalSuccess = results.reduce(
    (sum, r) => sum + r.results.filter((lr) => lr.status === 'success').length,
    0
  );
  const totalLessons = results.reduce((sum, r) => sum + r.results.length, 0);

  const overallSummary = `每日学习完成：共${totalLessons}节课，${totalSuccess}节全部完成`;

  return { results, overallSummary };
}

/**
 * 获取 Agent 当前的维度成绩
 */
export async function getAgentProfile(agentKey: string): Promise<{
  name: string;
  tier: string;
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    grade: string;
    locked: boolean;
  }>;
}> {
  const agent = AGENTS[agentKey];
  if (!agent) {
    return { name: agentKey, tier: '-', dimensions: [] };
  }

  const result = await callAPI(agent.apiKey, '/home');
  const profile = result.data?.your_profile as Record<string, unknown>;
  const dimensions = (result.data?.dimensions || []) as Array<Record<string, unknown>>;

  return {
    name: agent.name,
    tier: `${(profile?.tier as Record<string, unknown>)?.label || '-'}${(profile?.tier as Record<string, unknown>)?.stars ? '★'.repeat((profile?.tier as Record<string, unknown>).stars as number) : ''}`,
    dimensions: dimensions.map((d) => ({
      key: d.dimension as string,
      label: d.label as string,
      score: d.score as number,
      grade: d.grade as string,
      locked: d.locked as boolean,
    })),
  };
}

/**
 * 自动重新选课（当所有科目完成后）
 */
export async function autoReenrollWeakSubjects(
  agentKey: string
): Promise<{
  success: boolean;
  message: string;
  newSubjects: string[];
}> {
  const agent = AGENTS[agentKey];
  if (!agent) {
    return { success: false, message: `Agent ${agentKey} not found`, newSubjects: [] };
  }

  // 先检查当前是否还有未完成课程
  const currentSchedule = await getTodaySchedule(agentKey);
  if (currentSchedule.lessons.length > 0) {
    return {
      success: false,
      message: `${agent.name}还有${currentSchedule.lessons.length}节未完成课程，无需重新选课`,
      newSubjects: [],
    };
  }

  // 获取当前维度
  const profile = await getAgentProfile(agentKey);
  const weakSubjects = profile.dimensions
    .filter((d) => !d.locked && d.grade !== 'S')
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((d) => d.key);

  if (weakSubjects.length === 0) {
    return {
      success: false,
      message: `${agent.name}所有科目已达S级，无需重新选课`,
      newSubjects: [],
    };
  }

  // 重新选课
  const result = await callAPI(agent.apiKey, '/study/enroll', 'POST', {
    subjects: weakSubjects,
  });

  if (result.success) {
    return {
      success: true,
      message: `${agent.name}已重新选课：${weakSubjects.map((s) => SUBJECT_NAMES[s]).join('、')}`,
      newSubjects: weakSubjects,
    };
  }

  return {
    success: false,
    message: `选课失败：${result.error}`,
    newSubjects: [],
  };
}
