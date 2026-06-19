import { requireAdmin, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

/**
 * 跨智能体通信 API
 * 支持银蛇博士和蜡象助手之间的消息传递
 */

// 发送消息
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { sender, receiver, messageType, content, context } = body;

    // 验证参数
    if (!sender || !receiver || !messageType || !content) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 验证发送者和接收者
    const validAgents = ['yinhe_boshi', 'laxiang_zhushou'];
    if (!validAgents.includes(sender) || !validAgents.includes(receiver)) {
      return ApiErrors.validation('无效的智能体标识');
    }

    const client = getSupabaseClient();

    // 保存消息
    const { data, error } = await client
      .from('agent_communications')
      .insert({
        sender,
        receiver,
        message_type: messageType,
        content,
        context: context || null
      })
      .select()
      .single();

    if (error) throw error;

    // 如果是银蛇博士发给蜡象助手的任务反馈，自动提取并存储到知识库
    if (sender === 'yinhe_boshi' && receiver === 'laxiang_zhushou') {
      await extractAndStoreFeedback(client, data.id, content, context);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        sentAt: data.created_at
      }
    });
  } catch (error: any) {
    console.error('[跨智能体通信] 发送消息失败:', error);
    return safeError(error);
  }
}

// 获取消息列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent');      // 当前智能体
    const type = searchParams.get('type');         // 消息类型筛选
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!agent) {
      return ApiErrors.validation('缺少 agent 参数');
    }

    const client = getSupabaseClient();
    
    let query = client
      .from('agent_communications')
      .select('*')
      .eq('receiver', agent)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq('message_type', type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // 标记消息为已读
    const unreadIds = (data || [])
      .filter((msg) => !msg.read_at)
      .map((msg) => msg.id);

    if (unreadIds.length > 0) {
      await client
        .from('agent_communications')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      unread: unreadIds.length
    });
  } catch (error: any) {
    console.error('[跨智能体通信] 获取消息失败:', error);
    return safeError(error);
  }
}

/**
 * 从消息内容中提取反馈并存储到知识库
 */
async function extractAndStoreFeedback(
  client: any,
  communicationId: string,
  content: string,
  context: any
) {
  try {
    // 根据内容特征提取反馈类型
    let category = 'general';
    let feedbackType = 'observation';
    let suggestions: string[] = [];

    const lowerContent = content.toLowerCase();

    // 检测反馈类型
    if (lowerContent.includes('困难') || lowerContent.includes('不会') || lowerContent.includes('难')) {
      category = 'difficulty';
      feedbackType = 'negative';
    } else if (lowerContent.includes('创意') || lowerContent.includes('创新') || lowerContent.includes('好想法')) {
      category = 'creativity';
      feedbackType = 'positive';
    } else if (lowerContent.includes('喜欢') || lowerContent.includes('有趣') || lowerContent.includes('好玩')) {
      category = 'engagement';
      feedbackType = 'positive';
    } else if (lowerContent.includes('建议') || lowerContent.includes('改进')) {
      category = 'suggestion';
      feedbackType = 'improvement';
    }

    // 存储到知识库
    await client.from('task_feedback_knowledge').insert({
      theme_id: context?.themeId || null,
      theme_name: context?.themeName || null,
      category,
      feedback_type: feedbackType,
      content: content.substring(0, 500), // 限制长度
      team_name: context?.teamName || null,
      source_conversation_id: communicationId,
      suggestions
    });
  } catch (error) {
    console.error('[跨智能体通信] 提取反馈失败:', error);
  }
}
