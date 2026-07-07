/**
 * 记忆系统模块
 * 从 src/app/api/ai/chat/route.ts 提取的记忆相关函数（方案B拆分）
 * 包含：saveToMemory、extractImportantInfo、getRelevantMemories、getOrCreateSession
 * 原文件保持不变，本模块仅创建不引用。
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 安全修复（P3 输入校验）：对从 AI 输出中正则提取的内容做基本 sanitization
 * - 移除控制字符与 null bytes，防止污染下游存储/渲染
 * - 限制长度，避免超长字符串攻击
 */
function sanitizeExtracted(text: string, maxLen = 1000): string {
  if (!text) return '';
  return text
    .replace(/[\x00-\x1f\x7f]/g, '') // 移除控制字符与 null bytes
    .slice(0, maxLen);
}

/**
 * 格式化时间标签（如"3天前"、"刚刚"、"2小时前"）
 * 让 LLM 能感知记忆的时间远近，避免把旧记忆当近期内容主动提及
 */
function formatTimeLabel(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '刚刚';
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}周前`;
  return `${Math.floor(diffDay / 30)}个月前`;
}

/**
 * 批量更新记忆的最后访问时间（时间衰减系统的基础）
 * access_count 递增由蒸馏器在后台定期处理，避免并发写入冲突
 */
async function touchMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const client = getSupabaseClient();
    await client
      .from('agent_memories')
      .update({ last_accessed_at: new Date().toISOString() })
      .in('id', ids);
  } catch (e) {
    // 访问时间更新失败不影响主流程
  }
}

export async function saveToMemory(
  agentUsername: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  userId?: string,
  userName?: string
) {
  try {
    const client = getSupabaseClient();
    
    // 保存对话消息
    await client.from('agent_conversations').insert({
      agent_username: agentUsername,
      user_id: userId,
      user_name: userName,
      session_id: sessionId,
      role,
      content,
    });

    // 更新会话活动时间
    await client
      .from('agent_sessions')
      .update({
        last_activity_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .eq('is_active', true);

    // 如果是助手回复，检查是否需要提取重要信息到记忆
    if (role === 'assistant') {
      await extractImportantInfo(agentUsername, content, userId, userName, sessionId);
    }
  } catch (error) {
    console.error('[记忆系统] 保存对话失败:', error);
  }
}

export async function extractImportantInfo(
  agentUsername: string,
  content: string,
  userId?: string,
  userName?: string,
  sessionId?: string
) {
  try {
    const client = getSupabaseClient();
    
    // 提取用户姓名
    const namePatterns = [
      /(?:用户|同学|队员)[^\w]*(\S{2,4})(?:同学|队员|小伙伴)?/,
      /(?:我叫|我是|叫我)\s*(\S{2,4})/,
      /^(.{2,4})(?:同学|队员)?\s*[说问讲]/,
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match && userId) {
        // 安全修复（P3 输入校验）：对正则提取内容做 sanitization
        const extractedName = sanitizeExtracted(match[1], 20);
        // 检查是否已存在该用户的姓名记忆
        const { data: existing } = await client
          .from('agent_memories')
          .select('id')
          .eq('agent_username', agentUsername)
          .eq('memory_type', 'user_info')
          .eq('context_key', 'user_id')
          .eq('context_value', userId)
          .eq('is_active', true)
          .single();

        if (!existing) {
          await client.from('agent_memories').insert({
            agent_username: agentUsername,
            memory_type: 'user_info',
            content: `用户姓名: ${extractedName}`,
            context_key: 'user_id',
            context_value: userId,
            importance: 7,
            is_active: true,
            layer: 3,
            user_id: userId,
            status: 'active',
          });
        }
        break;
      }
    }

    // 提取小队信息
    const teamPatterns = [
      /(?:小队|团队)[^\w]*(\S{2,8})(?:小队|团队)?/,
      /(?:我们|咱们)(?:小队|团队)\s*叫?\s*(\S+)/,
    ];

    for (const pattern of teamPatterns) {
      const match = content.match(pattern);
      if (match && userId) {
        // 安全修复（P3 输入校验）：对正则提取内容做 sanitization
        const extractedTeam = sanitizeExtracted(match[1], 50);
        const { data: existing } = await client
          .from('agent_memories')
          .select('id')
          .eq('agent_username', agentUsername)
          .eq('memory_type', 'team_info')
          .eq('context_key', 'user_id')
          .eq('context_value', userId)
          .eq('is_active', true)
          .single();

        if (!existing) {
          await client.from('agent_memories').insert({
            agent_username: agentUsername,
            memory_type: 'team_info',
            content: `用户提到的小队/团队: ${extractedTeam}`,
            context_key: 'user_id',
            context_value: userId,
            importance: 5,
            is_active: true,
            layer: 3,
            user_id: userId,
            status: 'active',
          });
        }
        break;
      }
    }

    // 提取任务进度信息（L1 短期记忆，24小时过期）
    if (content.includes('任务') && content.includes('完成') && userId) {
      await client.from('agent_memories').insert({
        agent_username: agentUsername,
        memory_type: 'task_progress',
        content: `用户完成了某个任务，具体内容需要查看平台数据`,
        context_key: 'user_id',
        context_value: userId,
        importance: 6,
        is_active: true,
        layer: 1,
        user_id: userId,
        status: 'active',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // 蜡象助手专属：提取用户意图偏好（帮助后续对话更精准）
    if (agentUsername === 'laxiang_zhushou' && userId) {
      // 检测用户关注焦点
      const focusAreas: Record<string, string> = {
        '审核': '产出审核',
        '产出': '产出管理',
        '进度': '任务进度',
        '激励': '激励配置',
        '积分': '积分排名',
        '技能': '技能学习',
        '工具': '工具管理',
        '主题': '主题任务',
        '学校': '学校管理',
        '志愿者': '志愿者管理',
        '消息': '消息通知',
        '反馈': '反馈管理',
        '小队': '小队管理',
        '配置': '系统配置',
      };

      for (const [keyword, area] of Object.entries(focusAreas)) {
        if (content.includes(keyword)) {
          // 更新或创建用户关注偏好记忆
          const { data: existing } = await client
            .from('agent_memories')
            .select('id, content, importance')
            .eq('agent_username', agentUsername)
            .eq('memory_type', 'user_focus')
            .eq('context_key', 'user_id')
            .eq('context_value', userId)
            .eq('is_active', true)
            .limit(1);

          if (existing && existing.length > 0) {
            // 追加关注领域（去重）
            const existingContent = existing[0].content;
            if (!existingContent.includes(area)) {
              await client
                .from('agent_memories')
                .update({
                  content: `${existingContent}、${area}`,
                  importance: Math.min(existing[0].importance + 1, 9),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing[0].id);
            } else {
              // 已有的关注领域再次出现，提升重要性
              await client
                .from('agent_memories')
                .update({
                  importance: Math.min(existing[0].importance + 1, 9),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing[0].id);
            }
          } else {
            await client.from('agent_memories').insert({
              agent_username: agentUsername,
              memory_type: 'user_focus',
              content: `用户关注领域: ${area}`,
              context_key: 'user_id',
              context_value: userId,
              importance: 5,
              is_active: true,
              layer: 2,
            });
          }
          break; // 每条消息只记录一个最匹配的关注领域
        }
      }

      // 检测用户操作意图（用于预判下一步）
      const intentPatterns: { pattern: RegExp; intent: string; importance: number }[] = [
        { pattern: /想?(创建|添加|新增|配置)(?:一个)?(?:任务|主题)/, intent: '用户打算创建/配置任务或主题', importance: 7 },
        { pattern: /想?(审核|查看|检查)(?:一下)?(?:产出|提交)/, intent: '用户打算审核产出', importance: 7 },
        { pattern: /想?(发|发送|推送)(?:一个)?(?:消息|通知)/, intent: '用户打算发送消息', importance: 6 },
        { pattern: /想?(调整|修改|优化)(?:一下)?/, intent: '用户打算修改/优化现有配置', importance: 6 },
        { pattern: /需要(?:跟进|关注|处理)/, intent: '用户有待处理的关注事项', importance: 7 },
        { pattern: /不知道(?:怎么|如何|该不该)/, intent: '用户需要操作指导或决策支持', importance: 5 },
      ];

      for (const { pattern, intent, importance } of intentPatterns) {
        if (pattern.test(content)) {
          await client.from('agent_memories').insert({
            agent_username: agentUsername,
            memory_type: 'user_intent',
            content: intent,
            context_key: 'user_id',
            context_value: userId,
            importance,
            is_active: true,
            layer: importance >= 9 ? 2 : 1,
            user_id: userId,
            status: 'active',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          break;
        }
      }
    } // 闭合 if (agentUsername === 'laxiang_zhushou' && userId)
  } catch (error) {
    console.error('[记忆系统] 提取重要信息失败:', error);
  }
}

export async function getRelevantMemories(
  agentUsername: string,
  userId?: string,
  teamId?: string,
  sessionId?: string
): Promise<string> {
  try {
    const client = getSupabaseClient();
    const memories: string[] = [];

    // 构建查询条件
    let query = client
      .from('agent_memories')
      .select('*')
      .eq('agent_username', agentUsername)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .limit(20);

    // 查询与用户相关的记忆
    if (userId) {
      const nowIso = new Date().toISOString();
      const { data: userMemories } = await client
        .from('agent_memories')
        .select('*')
        .eq('agent_username', agentUsername)
        .eq('context_key', 'user_id')
        .eq('context_value', userId)
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('importance', { ascending: false })
        .limit(10);

      if (userMemories && userMemories.length > 0) {
        memories.push('【用户相关信息】');
        userMemories.forEach((m) => {
          memories.push(`- [${formatTimeLabel(m.created_at)}] ${m.content}`);
        });
        await touchMemories(userMemories.map((m: any) => m.id));
      }
    }

    // 查询与小队相关的记忆
    if (teamId) {
      const nowIso = new Date().toISOString();
      const { data: teamMemories } = await client
        .from('agent_memories')
        .select('*')
        .eq('agent_username', agentUsername)
        .eq('context_key', 'team_id')
        .eq('context_value', teamId)
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('importance', { ascending: false })
        .limit(10);

      if (teamMemories && teamMemories.length > 0) {
        memories.push('\n【小队相关信息】');
        teamMemories.forEach((m) => {
          memories.push(`- [${formatTimeLabel(m.created_at)}] ${m.content}`);
        });
        await touchMemories(teamMemories.map((m: any) => m.id));
      }
    }

    // 银蛇博士专属：获取小队完整数据
    if (agentUsername === 'yinhe_boshi' && teamId) {
      memories.push('\n【小队完整数据】');
      
      try {
        // 获取小队基础信息
        const { data: team } = await client
          .from('teams')
          .select('id, name, points, cycle, current_theme_id, current_task_id, status, grade, slogan')
          .eq('id', teamId)
          .single();

        if (team) {
          memories.push(`\n【小队基础信息】`);
          memories.push(`- 小队名称：${team.name}`);
          memories.push(`- 当前周期：第 ${team.cycle || 1} 周期`);
          memories.push(`- 当前积分：${team.points || 0}`);
          memories.push(`- 小队状态：${team.status || 'active'}`);
          if (team.grade) memories.push(`- 年级：${team.grade}`);
          if (team.slogan) memories.push(`- 口号：${team.slogan}`);

          // 获取小队成员
          const { data: members } = await client
            .from('team_members')
            .select('name, role')
            .eq('team_id', teamId)
            .eq('is_approved', true);
          
          if (members && members.length > 0) {
            memories.push(`- 成员：${members.map(m => `${m.name}(${m.role})`).join('、')}`);
          }

          // 获取当前主题
          if (team.current_theme_id) {
            const { data: theme } = await client
              .from('task_themes')
              .select('name, description')
              .eq('id', team.current_theme_id)
              .single();
            
            if (theme) {
              memories.push(`\n【当前主题】`);
              memories.push(`- 主题名称：${theme.name}`);
              if (theme.description) {
                memories.push(`- 主题描述：${theme.description.substring(0, 100)}...`);
              }
            }
          }

          // 获取积分排名
          const { data: ranking } = await client
            .from('teams')
            .select('id, points')
            .eq('cycle', team.cycle || 1)
            .order('points', { ascending: false })
            .limit(50);
          
          const rank = (ranking?.findIndex((t: any) => t.id === teamId) ?? -1) + 1;
          const total = ranking?.length || 0;
          memories.push(`- 积分排名：第 ${rank} 名（共 ${total} 支小队）`);

          // 获取积分历史
          const { data: pointTx } = await client
            .from('point_transactions')
            .select('points, change_type, description, created_at')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false })
            .limit(10);
          
          if (pointTx && pointTx.length > 0) {
            memories.push(`\n【最近积分变动】`);
            pointTx.slice(0, 5).forEach(tx => {
              const sign = tx.points > 0 ? '+' : '';
              memories.push(`- ${sign}${tx.points} (${tx.change_type}): ${tx.description || ''}`);
            });
          }

          // 获取已获得的激励
          const { data: rewards } = await client
            .from('user_rewards')
            .select('earned_at, rewards(name, icon, points)')
            .eq('team_id', teamId)
            .order('earned_at', { ascending: false })
            .limit(10);
          
          if (rewards && rewards.length > 0) {
            memories.push(`\n【已获得激励】`);
            memories.push(`- 共获得 ${rewards.length} 个激励`);
            rewards.slice(0, 5).forEach((r: any) => {
              memories.push(`  - ${r.rewards?.name || '未知激励'}`);
            });
          }

          // 获取未读消息数
          const { count: unreadMsg } = await client
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .eq('is_read', false);
          
          const { count: unreadNoti } = await client
            .from('team_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .eq('is_read', false);
          
          if (unreadMsg || unreadNoti) {
            memories.push(`\n【未读消息】`);
            if (unreadMsg) memories.push(`- 未读消息：${unreadMsg}`);
            if (unreadNoti) memories.push(`- 未读通知：${unreadNoti}`);
          }

          // 获取其他同期小队进度
          const { data: peers } = await client
            .from('teams')
            .select('name, points, cycle, current_theme_id')
            .eq('cycle', team.cycle || 1)
            .eq('is_active', true)
            .neq('id', teamId)
            .order('points', { ascending: false })
            .limit(5);
          
          if (peers && peers.length > 0) {
            memories.push(`\n【同期小队排名（前5）】`);
            let rank = 1;
            peers.forEach(p => {
              memories.push(`${rank}. ${p.name} - ${p.points || 0}分`);
              rank++;
            });
          }

          // 获取技能学习进度
          const { data: skills } = await client
            .from('team_skill_learnings')
            .select('status, points_earned, skills(name)')
            .eq('team_id', teamId);
          
          if (skills && skills.length > 0) {
            const completed = skills.filter(s => s.status === 'completed').length;
            const total = skills.length;
            const totalPoints = skills.reduce((sum, s) => sum + (s.points_earned || 0), 0);
            memories.push(`\n【技能学习】`);
            memories.push(`- 已学技能：${completed}/${total}`);
            memories.push(`- 技能积分：${totalPoints}`);
          }

        }
      } catch (error) {
        console.error('[银蛇博士] 获取小队数据失败:', error);
        memories.push('\n（小队数据加载失败，请检查数据是否完整）');
      }
    }

    // 蜡象助手专属：获取未读的提醒事项
    if (agentUsername === 'laxiang_zhushou') {
      const { data: unreadReminders } = await client
        .from('agent_reminders')
        .select('*')
        .eq('agent_username', 'laxiang_zhushou')
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .order('priority', { ascending: false })  // 高优先级优先
        .order('created_at', { ascending: false })
        .limit(5);

      if (unreadReminders && unreadReminders.length > 0) {
        memories.push('\n【来自银蛇博士的重要提醒】');
        unreadReminders.forEach((r) => {
          const priorityLabel = r.priority === 'high' ? '🔴高优先级' : 
                               r.priority === 'normal' ? '🟡普通' : '🟢低优先级';
          memories.push(`- [${priorityLabel}] ${r.title}`);
          if (r.content && r.content.length > 150) {
            memories.push(`  ${r.content.substring(0, 150)}...`);
          } else if (r.content) {
            memories.push(`  ${r.content}`);
          }
          if (r.action_required) {
            memories.push(`  ⚠️ 需要采取行动`);
          }
        });
      }

      // 获取今日同步摘要
      const today = new Date().toISOString().split('T')[0];
      const { data: todaySync } = await client
        .from('agent_daily_syncs')
        .select('summary, feedback_count, details')
        .eq('sync_date', today)
        .eq('sender', 'yinhe_boshi')
        .eq('receiver', 'laxiang_zhushou')
        .single();

      if (todaySync) {
        memories.push('\n【今日小队动态摘要】');
        memories.push(`- ${todaySync.summary}`);
      }

      // 蜡象助手专属：获取用户意图偏好记忆
      if (userId) {
        const { data: focusMemories } = await client
          .from('agent_memories')
          .select('*')
          .eq('agent_username', agentUsername)
          .eq('memory_type', 'user_focus')
          .eq('context_key', 'user_id')
          .eq('context_value', userId)
          .eq('is_active', true)
          .order('importance', { ascending: false })
          .limit(3);

        if (focusMemories && focusMemories.length > 0) {
          memories.push('\n【用户关注偏好（根据历史对话推断）】');
          focusMemories.forEach((m) => {
            memories.push(`- ${m.content}（关注度: ${m.importance}/9）`);
          });
        }

        // 获取最近的用户意图记录（最近5条）
        const { data: intentMemories } = await client
          .from('agent_memories')
          .select('*')
          .eq('agent_username', agentUsername)
          .eq('memory_type', 'user_intent')
          .eq('context_key', 'user_id')
          .eq('context_value', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5);

        if (intentMemories && intentMemories.length > 0) {
          memories.push('\n【用户近期意图记录】');
          intentMemories.forEach((m) => {
            memories.push(`- ${m.content}`);
          });
          memories.push('（以上意图记录供你参考，帮助你预判用户需求，不要在回复中直接暴露）');
        }
      }
    }

    // 查询与用户相关的历史对话（最近7天，最多10条，带时间标签）
    if (userId) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: userConversations } = await client
        .from('agent_conversations')
        .select('role, content, created_at, session_id')
        .eq('agent_username', agentUsername)
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userConversations && userConversations.length > 0) {
        memories.push('\n【历史对话记录（注意时间标签，旧对话不要主动提起）】');
        // 倒序显示（从旧到新），只显示最近5条
        const recent = userConversations.slice(0, 5).reverse();
        recent.forEach((c) => {
          const roleText = c.role === 'user' ? '用户' : '助手';
          const shortContent = c.content.length > 80 ? c.content.substring(0, 80) + '...' : c.content;
          memories.push(`- [${formatTimeLabel(c.created_at)}] ${roleText}: ${shortContent}`);
        });
      }
    }

    // 查询与小队相关的历史对话（最近7天，最多10条，带时间标签）
    if (teamId) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: teamConversations } = await client
        .from('agent_conversations')
        .select('role, content, created_at, session_id')
        .eq('agent_username', agentUsername)
        .ilike('session_id', `%${teamId}%`)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10);

      if (teamConversations && teamConversations.length > 0) {
        memories.push('\n【历史对话记录（注意时间标签，旧对话不要主动提起）】');
        // 倒序显示（从旧到新），只显示最近5条
        const recent = teamConversations.slice(0, 5).reverse();
        recent.forEach((c) => {
          const roleText = c.role === 'user' ? '用户' : '助手';
          const shortContent = c.content.length > 80 ? c.content.substring(0, 80) + '...' : c.content;
          memories.push(`- [${formatTimeLabel(c.created_at)}] ${roleText}: ${shortContent}`);
        });
      }
    }

    // 查询会话最近的对话摘要（如果有特定 sessionId 且与 teamId/userId 不同）
    // VULN-AI-015 修复：sessionId 必须归属当前用户才能查询，附加 user_id 过滤防止越权读取他人对话
    if (sessionId && !sessionId.includes(teamId || '') && !sessionId.includes(userId || '')) {
      let sessionQuery = client
        .from('agent_conversations')
        .select('role, content, created_at')
        .eq('agent_username', agentUsername)
        .eq('session_id', sessionId);

      // 附加 user_id 过滤，确保只能查到当前用户自己的对话历史
      if (userId) {
        sessionQuery = sessionQuery.eq('user_id', userId);
      }

      const { data: recentConversations } = await sessionQuery
        .order('created_at', { ascending: false })
        .limit(6);

      if (recentConversations && recentConversations.length > 0) {
        memories.push('\n【最近对话】');
        // 倒序显示（从旧到新）
        recentConversations.reverse().forEach((c) => {
          const roleText = c.role === 'user' ? '用户' : '助手';
          const shortContent = c.content.length > 100 ? c.content.substring(0, 100) + '...' : c.content;
          memories.push(`- [${formatTimeLabel(c.created_at)}] ${roleText}: ${shortContent}`);
        });
      }
    }

    // 加载分层记忆（L0-L4）
    try {
      const nowIso = new Date().toISOString();
      const { data: layeredMemories } = await client
        .from('agent_memories')
        .select('id, content, memory_type, layer, importance, access_count, created_at')
        .eq('agent_username', agentUsername)
        .eq('is_active', true)
        .not('layer', 'is', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('importance', { ascending: false })
        .limit(20);

      if (layeredMemories && layeredMemories.length > 0) {
        // 按层级分组（与设计一致：L3长期、L4永恒）
        const l3 = layeredMemories.filter(m => m.layer === 3); // 长期记忆
        const l4 = layeredMemories.filter(m => m.layer === 4); // 永恒记忆

        if (l3.length > 0) {
          memories.push('\n【长期记忆】');
          l3.forEach(m => memories.push(`- [${formatTimeLabel(m.created_at)}] ${m.content}`));
        }
        if (l4.length > 0) {
          memories.push('\n【永恒记忆·核心】');
          l4.forEach(m => memories.push(`- [${formatTimeLabel(m.created_at)}] ${m.content}`));
        }

        // 更新访问时间（时间衰减系统）
        await touchMemories(layeredMemories.map((m: any) => m.id));
      }
    } catch (e) {
      // 分层记忆加载失败不影响主流程
      console.error('[记忆系统] 分层记忆加载失败:', e);
    }

    // 加载已内化的知识技能（来自 Inkwell 阅读提炼）
    try {
      // 优先加载可实操的技能规则，其次加载知识概览和洞察
      const { data: knowledgeSkills } = await client
        .from('agent_memories')
        .select('content, context_key, context_value, memory_type, created_at')
        .eq('agent_username', agentUsername)
        .in('memory_type', ['knowledge_skill', 'knowledge_insight', 'knowledge'])
        .eq('is_active', true)
        .eq('layer', 3)
        .order('importance', { ascending: false })
        .limit(20);

      if (knowledgeSkills && knowledgeSkills.length > 0) {
        const skills = knowledgeSkills.filter(m => m.memory_type === 'knowledge_skill');
        const insights = knowledgeSkills.filter(m => m.memory_type === 'knowledge_insight');
        const overviews = knowledgeSkills.filter(m => m.memory_type === 'knowledge');

        if (skills.length > 0) {
          memories.push('\n【已内化的知识技能·可直接实操】');
          skills.forEach(m => {
            memories.push(`- ${m.content}`);
          });
          memories.push('（以上是从阅读文章中提炼的可实操技能规则，回答问题时直接运用，不需要说明来源）');
        }
        if (insights.length > 0) {
          memories.push('\n【已内化的知识洞察】');
          insights.forEach(m => {
            memories.push(`- ${m.content}`);
          });
        }
        if (overviews.length > 0) {
          memories.push('\n【已内化的知识概览】');
          overviews.forEach(m => {
            memories.push(`- ${m.content}`);
          });
        }
      }
    } catch (e) {
      console.error('[知识系统] 内化知识加载失败:', e);
    }

    // 如果没有特定记忆，获取一些通用重要记忆
    if (memories.length === 0) {
      const { data: generalMemories } = await client
        .from('agent_memories')
        .select('*')
        .eq('agent_username', agentUsername)
        .eq('is_active', true)
        .gte('importance', 7)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (generalMemories && generalMemories.length > 0) {
        memories.push('【重要记忆】');
        generalMemories.forEach((m) => {
          memories.push(`- ${m.content}`);
        });
      }
    }

    return memories.join('\n');
  } catch (error) {
    console.error('[记忆系统] 获取相关记忆失败:', error);
    return '';
  }
}

export async function getOrCreateSession(
  agentUsername: string,
  userId?: string,
  teamId?: string,
  sessionId?: string
): Promise<string> {
  try {
    const client = getSupabaseClient();
    
    // 如果传入了 sessionId，直接使用（前端已基于 teamId/userId 生成固定 ID）
    if (sessionId) {
      // 检查会话是否已存在
      const { data: existing } = await client
        .from('agent_sessions')
        .select('id')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .single();

      if (!existing) {
        // 创建新会话
        await client.from('agent_sessions').insert({
          agent_username: agentUsername,
          user_id: userId,
          team_id: teamId,
          session_id: sessionId,
        });
      } else {
        // 更新会话活动时间
        await client
          .from('agent_sessions')
          .update({
            last_activity_at: new Date().toISOString()
          })
          .eq('session_id', sessionId)
          .eq('is_active', true);
      }
      return sessionId;
    }
    
    // 如果没有传入 sessionId，基于 teamId 或 userId 生成固定的 sessionId
    let finalSessionId = '';
    if (teamId) {
      finalSessionId = `yinhe_team_${teamId}`;
    } else if (userId) {
      finalSessionId = `laxiang_user_${userId}`;
    } else {
      finalSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    // 检查会话是否已存在
    const { data: existing } = await client
      .from('agent_sessions')
      .select('id')
      .eq('session_id', finalSessionId)
      .eq('is_active', true)
      .single();

    if (!existing) {
      // 创建新会话
      await client.from('agent_sessions').insert({
        agent_username: agentUsername,
        user_id: userId,
        team_id: teamId,
        session_id: finalSessionId,
      });
    } else {
      // 更新会话活动时间
      await client
        .from('agent_sessions')
        .update({
          last_activity_at: new Date().toISOString()
        })
        .eq('session_id', finalSessionId)
        .eq('is_active', true);
    }

    return finalSessionId;
  } catch (error) {
    console.error('[记忆系统] 创建会话失败:', error);
    return sessionId || `session_${Date.now()}`;
  }
}
