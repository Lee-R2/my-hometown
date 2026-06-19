import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 每日定时同步 API
 * 银蛇博士 -> 蜡象助手 的每日信息同步
 * 
 * 功能：
 * 1. 汇总今日收到的反馈
 * 2. 生成同步摘要
 * 3. 创建提醒事项
 * 4. 更新蜡象助手的记忆
 */

// 手动触发同步（管理员可调用）
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json().catch(() => ({}));
    const forceSync = body.force === true; // 是否强制同步（不受每日限制）
    
    const result = await performDailySync(forceSync);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[每日同步] 同步失败:', error);
    return safeError(error);
  }
}

// 获取同步状态
export async function GET() {
  try {
    const client = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];
    
    // 查询今日同步记录
    const { data: todaySync } = await client
      .from('agent_daily_syncs')
      .select('*')
      .eq('sync_date', today)
      .eq('sender', 'yinhe_boshi')
      .eq('receiver', 'laxiang_zhushou')
      .single();
    
    // 查询最近的同步记录
    const { data: recentSyncs } = await client
      .from('agent_daily_syncs')
      .select('*')
      .eq('sender', 'yinhe_boshi')
      .order('sync_date', { ascending: false })
      .limit(7);
    
    // 查询未读提醒数量
    const { count: unreadReminders } = await client
      .from('agent_reminders')
      .select('*', { count: 'exact', head: true })
      .eq('agent_username', 'laxiang_zhushou')
      .eq('is_read', false)
      .eq('is_dismissed', false);
    
    return NextResponse.json({
      success: true,
      data: {
        todaySynced: !!todaySync,
        lastSyncAt: todaySync?.created_at || null,
        recentSyncs: recentSyncs || [],
        unreadReminders: unreadReminders || 0
      }
    });
  } catch (error: any) {
    return safeError(error);
  }
}

/**
 * 执行每日同步
 */
async function performDailySync(forceSync: boolean = false) {
  const client = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];
  
  // 检查今日是否已同步（除非强制同步）
  if (!forceSync) {
    const { data: existingSync } = await client
      .from('agent_daily_syncs')
      .select('id')
      .eq('sync_date', today)
      .eq('sender', 'yinhe_boshi')
      .eq('receiver', 'laxiang_zhushou')
      .single();
    
    if (existingSync) {
      return {
        success: true,
        message: '今日已同步，无需重复同步',
        synced: false
      };
    }
  }
  
  // 1. 查询过去24小时内的新反馈
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: recentFeedbacks } = await client
    .from('task_feedback_knowledge')
    .select('*')
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false });
  
  // 2. 按主题分类统计
  const themeStats: Record<string, { positive: number; negative: number; total: number }> = {};
  const typeStats: Record<string, number> = { creativity: 0, difficulty: 0, suggestion: 0, engagement: 0, general: 0 };
  const teamStats: Record<string, number> = {};
  
  for (const feedback of recentFeedbacks || []) {
    // 主题统计
    if (feedback.theme_name) {
      if (!themeStats[feedback.theme_name]) {
        themeStats[feedback.theme_name] = { positive: 0, negative: 0, total: 0 };
      }
      themeStats[feedback.theme_name].total++;
      if (feedback.feedback_type === 'positive') {
        themeStats[feedback.theme_name].positive++;
      } else if (feedback.feedback_type === 'negative') {
        themeStats[feedback.theme_name].negative++;
      }
    }
    
    // 类型统计
    if (feedback.category && typeStats.hasOwnProperty(feedback.category)) {
      typeStats[feedback.category]++;
    }
    
    // 小队统计
    if (feedback.team_name) {
      teamStats[feedback.team_name] = (teamStats[feedback.team_name] || 0) + 1;
    }
  }
  
  // 3. 生成同步摘要
  const totalFeedback = recentFeedbacks?.length || 0;
  let summary = `今日共收到 ${totalFeedback} 条小队反馈。`;
  
  if (totalFeedback > 0) {
    const topTheme = Object.entries(themeStats).sort((a, b) => b[1].total - a[1].total)[0];
    if (topTheme) {
      summary += `「${topTheme[0]}」主题反馈最多（${topTheme[1].total}条）。`;
    }
    
    if (typeStats.difficulty > 0) {
      summary += `有 ${typeStats.difficulty} 条关于任务难度的反馈需要注意。`;
    }
    if (typeStats.creativity > 0) {
      summary += `小队展现了 ${typeStats.creativity} 次创意表现。`;
    }
    if (typeStats.suggestion > 0) {
      summary += `收集到 ${typeStats.suggestion} 条改进建议。`;
    }
  } else {
    summary += '各小队任务进展顺利，暂无特殊反馈。';
  }
  
  // 4. 创建提醒事项
  const reminders = [];
  
  // 高优先级提醒：任务困难
  if (typeStats.difficulty > 0) {
    const difficultyFeedbacks = recentFeedbacks?.filter(f => f.category === 'difficulty') || [];
    reminders.push({
      agent_username: 'laxiang_zhushou',
      reminder_type: 'task_feedback',
      title: `有 ${typeStats.difficulty} 条任务困难反馈需要关注`,
      content: difficultyFeedbacks.slice(0, 3).map(f => 
        `- ${f.team_name || '未知小队'}：${f.content.substring(0, 100)}`
      ).join('\n'),
      source: 'yinhe_boshi',
      related_theme_id: difficultyFeedbacks[0]?.theme_id,
      priority: 'high',
      action_required: true
    });
  }
  
  // 创意亮点提醒
  if (typeStats.creativity > 0) {
    reminders.push({
      agent_username: 'laxiang_zhushou',
      reminder_type: 'task_feedback',
      title: `小队创意亮点（${typeStats.creativity}条）`,
      content: recentFeedbacks?.filter(f => f.category === 'creativity').slice(0, 3).map(f => 
        `- ${f.team_name || '未知小队'}：${f.content.substring(0, 100)}`
      ).join('\n') || '无',
      source: 'yinhe_boshi',
      priority: 'normal'
    });
  }
  
  // 改进建议提醒
  if (typeStats.suggestion > 0) {
    reminders.push({
      agent_username: 'laxiang_zhushou',
      reminder_type: 'task_feedback',
      title: `收到 ${typeStats.suggestion} 条改进建议`,
      content: recentFeedbacks?.filter(f => f.category === 'suggestion').slice(0, 3).map(f => 
        `- ${f.team_name || '未知小队'}：${f.content.substring(0, 100)}`
      ).join('\n') || '无',
      source: 'yinhe_boshi',
      priority: 'normal',
      action_required: true
    });
  }
  
  // 同步摘要提醒
  reminders.push({
    agent_username: 'laxiang_zhushou',
    reminder_type: 'sync_summary',
    title: `每日同步摘要（${today}）`,
    content: summary,
    source: 'yinhe_boshi',
    priority: 'normal'
  });
  
  // 插入提醒
  if (reminders.length > 0) {
    await client.from('agent_reminders').insert(reminders);
  }
  
  // 5. 保存同步记录
  await client.from('agent_daily_syncs').insert({
    sync_date: today,
    sender: 'yinhe_boshi',
    receiver: 'laxiang_zhushou',
    feedback_count: totalFeedback,
    summary,
    details: {
      themeStats,
      typeStats,
      teamStats,
      recentFeedbacks: recentFeedbacks?.slice(0, 10)
    }
  });
  
  return {
    success: true,
    message: '同步完成',
    synced: true,
    summary,
    stats: {
      totalFeedback,
      themes: Object.keys(themeStats).length,
      teams: Object.keys(teamStats).length,
      remindersCreated: reminders.length
    }
  };
}
