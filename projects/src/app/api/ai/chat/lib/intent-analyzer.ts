// 来源：src/app/api/ai/chat/route.ts (L64-151, analyzeUserIntent 函数)

export function analyzeUserIntent(userMessage: string, allMessages: any[]): string {
  const msg = userMessage.trim();
  const hints: string[] = [];

  // 1. 意图分类检测
  const dataQueryPatterns = [
    /多少|几个|数量|统计|列表|有哪些|是不是|有没有|查|看看|看一下|看一下/,
    /进展|进度|情况|状态|概览|总览|数据|排名/,
  ];
  const problemPatterns = [
    /怎么(没|不|没法|不能|无法|总是|一直)/,
    /问题|bug|错误|失败|报错|卡(住|了)|卡在/,
    /质量(不行|不好|差|低)|太(难|简单|慢|快)/,
    /搞不定|弄不了|不知道(怎么|为什么)/,
  ];
  const operationPatterns = [
    /怎么(配置|设置|创建|添加|删除|修改|审核|操作|用|做)/,
    /如何|步骤|流程|教程|方法|能不能|可以(吗|不可以)/,
    /帮我|请帮我|需要(怎么|做什么)/,
  ];
  const decisionPatterns = [
    /该不该|选哪个|哪个好|建议|推荐|意见|要不要|还是/,
    /优缺点|利弊|比较|对比|区别/,
  ];
  const emotionPatterns = [
    /太(麻烦|累|难|烦|忙|辛苦|无语)了/,
    /算了|无语|受不了|头大|崩溃|烦死/,
    /又(出问题|出bug|失败|卡了)/,
  ];

  if (dataQueryPatterns.some(p => p.test(msg))) {
    hints.push('【意图识别】用户可能在查询数据，请主动提供关键数字和异常标注');
  }
  if (problemPatterns.some(p => p.test(msg))) {
    hints.push('【意图识别】用户可能在诊断问题，请先定位根因，再给解决方案');
  }
  if (operationPatterns.some(p => p.test(msg))) {
    hints.push('【意图识别】用户可能在寻求操作指导，请提供步骤化的操作指南');
  }
  if (decisionPatterns.some(p => p.test(msg))) {
    hints.push('【意图识别】用户可能在做决策，请提供利弊分析和明确推荐');
  }
  if (emotionPatterns.some(p => p.test(msg))) {
    hints.push('【意图识别】用户可能带有情绪，先共情理解，再给解决方案');
  }

  // 2. 简短消息深度推断 — 用户只说了几个字，意图很模糊
  if (msg.length <= 6 && !hints.length) {
    hints.push('【意图推断】用户消息非常简短，意图可能不明确。请尝试：');
    hints.push('- 结合对话历史推断用户可能在追问什么');
    hints.push('- 如果历史对话有相关话题，主动延续该话题');
    hints.push('- 如果无法推断，给出最可能的回答并追问确认');
  }

  // 3. 多轮对话上下文追踪 — 检测是否在追问同一话题
  const recentMessages = allMessages.filter((m: any) => m.role === 'user').slice(-5);
  if (recentMessages.length >= 2) {
    const lastTwo = recentMessages.slice(-2).map((m: any) => m.content?.trim() || '');
    // 检测关键词重叠（用户在追问同一领域）
    const domainKeywords = ['小队', '任务', '产出', '审核', '激励', '技能', '工具', '主题', '学校', '志愿者', '消息'];
    const overlapKeywords = domainKeywords.filter(kw =>
      lastTwo.every(msg => msg.includes(kw))
    );
    if (overlapKeywords.length > 0) {
      hints.push(`【上下文追踪】用户连续在追问"${overlapKeywords.join('、')}"相关话题，之前的回答可能没有完全满足需求，请尝试换角度或更深层次回答`);
    }

    // 检测用户在反复问同一类问题（可能对答案不满意）
    if (recentMessages.length >= 3) {
      const lastThree = recentMessages.slice(-3).map((m: any) => m.content?.trim() || '');
      const commonWords = lastThree[0].split('').filter((ch: string) =>
        lastThree.every(msg => msg.includes(ch)) && ch.trim()
      );
      if (commonWords.length >= 2) {
        hints.push('【重复追问检测】用户多次追问相似问题，可能对之前回答不满意。请换种方式/更深层次回答');
      }
    }
  }

  // 4. 特定角色意图推断
  if (msg.includes('我的') || msg.includes('我们学校')) {
    hints.push('【角色上下文】用户可能在查询与自己相关的数据，请关注其角色权限范围内的信息');
  }

  return hints.length > 0
    ? `\n【系统意图分析（供你参考，不要在回复中暴露）】\n${hints.join('\n')}`
    : '';
}
