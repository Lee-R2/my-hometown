import { requireAnyAuth, authError, safeError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// GET: 获取用户记忆
export async function GET(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const agentType = searchParams.get('agentType') || 'assistant'; // assistant | dr-silver-snake | wax-elephant
    const category = searchParams.get('category'); // preference | context | feedback | summary
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!userId) {
      return ApiErrors.validation('缺少 userId');
    }

    const supabase = getSupabaseClient();

    let query = supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_type', agentType)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[用户记忆API] 查询失败:', error);
      return ApiErrors.validation('查询失败');
    }

    return NextResponse.json({ success: true, memories: data || [] });
  } catch (error) {
    console.error('[用户记忆API] 获取失败:', error);
    return ApiErrors.validation('获取失败');
  }
}

// POST: 创建或更新用户记忆
export async function POST(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { userId, agentType, category, key, value, importance, source } = body;

    if (!userId || !category || !key || !value) {
      return ApiErrors.validation('缺少必填字段: userId, category, key, value');
    }

    const supabase = getSupabaseClient();
    const agent = agentType || 'assistant';

    // 检查是否已存在相同 key 的记忆（包括已软删除的）
    const { data: existing } = await supabase
      .from('user_memories')
      .select('id, access_count, importance, is_active')
      .eq('user_id', userId)
      .eq('agent_type', agent)
      .eq('category', category)
      .eq('key', key)
      .maybeSingle();

    if (existing) {
      if (existing.is_active) {
        // 更新已有的活跃记忆
        const { data, error } = await supabase
          .from('user_memories')
          .update({
            value,
            importance: importance || existing.importance,
            source: source || 'conversation',
            access_count: existing.access_count + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          console.error('[用户记忆API] 更新失败:', error);
          return ApiErrors.validation('更新失败');
        }

        return NextResponse.json({ success: true, memory: data, action: 'updated' });
      } else {
        // 重新激活已软删除的记忆
        const { data, error } = await supabase
          .from('user_memories')
          .update({
            value,
            is_active: true,
            importance: importance || existing.importance,
            source: source || 'conversation',
            access_count: existing.access_count + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          console.error('[用户记忆API] 重新激活失败:', error);
          return ApiErrors.validation('重新激活失败');
        }

        return NextResponse.json({ success: true, memory: data, action: 'reactivated' });
      }
    } else {
      // 创建新记忆
      const { data, error } = await supabase
        .from('user_memories')
        .insert({
          user_id: userId,
          agent_type: agent,
          category,
          key,
          value,
          importance: importance || 1,
          source: source || 'conversation',
          is_active: true,
          access_count: 1
        })
        .select()
        .single();

      if (error) {
        console.error('[用户记忆API] 创建失败:', error);
        return ApiErrors.validation('创建失败');
      }

      return NextResponse.json({ success: true, memory: data, action: 'created' });
    }
  } catch (error) {
    console.error('[用户记忆API] 创建/更新失败:', error);
    return ApiErrors.validation('操作失败');
  }
}

// PUT: 批量保存对话中提取的用户记忆
export async function PUT(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const body = await request.json();
    const { userId, agentType, memories } = body;

    if (!userId || !memories || !Array.isArray(memories)) {
      return ApiErrors.validation('缺少必填字段: userId, memories (array)');
    }

    // 校验只能操作自己的记忆，防止身份伪造
    if (userId !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权操作其他用户的记忆');
    }

    const supabase = getSupabaseClient();
    const agent = agentType || 'assistant';
    const results: Array<{ key: string; action: string }> = [];

    for (const mem of memories) {
      const { category, key, value, importance, source } = mem;

      if (!category || !key || !value) continue;

      // 检查是否已存在（包括已软删除的）
      const { data: existing } = await supabase
        .from('user_memories')
        .select('id, access_count, importance, is_active')
        .eq('user_id', userId)
        .eq('agent_type', agent)
        .eq('category', category)
        .eq('key', key)
        .maybeSingle();

      if (existing) {
        if (existing.is_active) {
          // 更新已有的活跃记忆
          await supabase
            .from('user_memories')
            .update({
              value,
              importance: Math.max(existing.importance, importance || 1),
              source: source || 'conversation',
              access_count: existing.access_count + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
          results.push({ key, action: 'updated' });
        } else {
          // 重新激活已软删除的记忆
          await supabase
            .from('user_memories')
            .update({
              value,
              is_active: true,
              importance: Math.max(existing.importance, importance || 1),
              source: source || 'conversation',
              access_count: existing.access_count + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
          results.push({ key, action: 'reactivated' });
        }
      } else {
        await supabase
          .from('user_memories')
          .insert({
            user_id: userId,
            agent_type: agent,
            category,
            key,
            value,
            importance: importance || 1,
            source: source || 'conversation',
            is_active: true,
            access_count: 1
          });
        results.push({ key, action: 'created' });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    });
  } catch (error) {
    console.error('[用户记忆API] 批量保存失败:', error);
    return ApiErrors.validation('操作失败');
  }
}

// DELETE: 删除用户记忆
export async function DELETE(request: NextRequest) {
  const auth = requireAnyAuth(request);
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!id && !userId) {
      return ApiErrors.validation('缺少 id 或 userId');
    }

    // 校验只能删除自己的记忆，防止身份伪造
    if (userId && userId !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权删除其他用户的记忆');
    }

    const supabase = getSupabaseClient();

    if (id) {
      // 软删除指定记忆
      const { error } = await supabase
        .from('user_memories')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        return ApiErrors.validation('删除失败');
      }
    } else if (userId) {
      // 软删除用户所有记忆
      const { error } = await supabase
        .from('user_memories')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) {
        return ApiErrors.validation('删除失败');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[用户记忆API] 删除失败:', error);
    return ApiErrors.validation('删除失败');
  }
}
