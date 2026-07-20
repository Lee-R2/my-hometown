import { requireAnyAuth, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

// GET: 获取用户记忆
export async function GET(request: NextRequest) {
  const auth = await requireAnyAuth(request);
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

    // 安全修复 SEC-002: 校验查询的 userId 与认证身份一致,防止 IDOR 越权读取他人记忆
    // super_admin 可查询任意用户(管理后台用),其他角色只能查自己
    if (auth.payload!.role !== 'super_admin' && userId !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权查询其他用户的记忆');
    }

    const supabase = getAuthenticatedClient(request, auth);

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
// 注意：scheduler.js 调用 cleanup action 时不带认证，需在认证检查前处理
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 定时任务清理：归档长期未更新且低重要性的用户记忆
    // scheduler.js (memory-distiller) 每日 03:00 调用，不携带认证
    if (body.action === 'cleanup') {
      // SEC-001: scheduler 无认证调用,需用 admin 客户端执行跨用户归档
      const supabase = getSupabaseAdminClient();
      const now = new Date();
      // 90 天未更新且重要性 < 3 的记忆归档（软删除）
      const threshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const { data: archived, error } = await supabase
        .from('user_memories')
        .update({ is_active: false, updated_at: now.toISOString() })
        .eq('is_active', true)
        .lt('importance', 3)
        .lt('updated_at', threshold)
        .select('id');

      if (error) {
        console.error('[用户记忆API] cleanup 失败:', error);
        return NextResponse.json({ success: false, error: '清理失败' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        cleaned: archived?.length || 0,
        timestamp: now.toISOString(),
      });
    }

    // 普通写入流程需要认证
    const auth = await requireAnyAuth(request);
    if (!auth.authenticated) return authError(auth);

    const { userId, agentType, category, key, value, importance, source } = body;

    if (!userId || !category || !key || !value) {
      return ApiErrors.validation('缺少必填字段: userId, category, key, value');
    }

    const supabase = getAuthenticatedClient(request, auth);
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
  const auth = await requireAnyAuth(request);
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

    const supabase = getAuthenticatedClient(request, auth);
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
  const auth = await requireAnyAuth(request);
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

    const supabase = getAuthenticatedClient(request, auth);

    if (id) {
      // LE-A22: 软删除指定记忆,必须校验该记忆归属于当前用户(或 super_admin)
      // 先查询该记忆的 user_id,然后校验归属,防止管理员越权删除其他用户的记忆
      if (auth.payload!.role !== 'super_admin') {
        const { data: mem } = await supabase
          .from('user_memories')
          .select('user_id')
          .eq('id', id)
          .maybeSingle();
        if (mem && mem.user_id !== auth.payload!.userId) {
          return ApiErrors.forbidden('无权删除其他用户的记忆');
        }
      }

      const { error } = await supabase
        .from('user_memories')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        return ApiErrors.validation('删除失败');
      }
    } else if (userId) {
      // 软删除用户所有记忆(userId 已在上方校验归属)
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
