import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { supabaseErrorResponse, ApiErrors } from '@/lib/api-error';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { FRAGMENTS_PER_GEM } from '@/lib/constants';

const supabase = getSupabaseClient();

// 获取可赠送的小队列表（同志愿者下的其他小队）
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  // 强制使用认证令牌中的 userId，防止横向越权
  const teamId = auth.payload!.userId;

  try {
    // 从当前小队数据获取其志愿者，不信任客户端传入
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('assigned_volunteer_id, created_by')
      .eq('id', teamId)
      .maybeSingle();

    const volunteerId = currentTeam?.assigned_volunteer_id || currentTeam?.created_by;

    let query = supabase
      .from('teams')
      .select('id, code, name, points')
      .eq('is_active', true)
      .neq('id', teamId)
      .order('name');

    // 只返回同一志愿者负责的小队
    if (volunteerId) {
      query = query.eq('assigned_volunteer_id', volunteerId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return safeError(error);
  }
}

// 执行积分转账
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { from_team_id, to_team_id, points, message } = body;

    // 验证必填字段
    if (!from_team_id || !to_team_id || !points) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 校验调用方只能转出自己的积分，防止横向越权
    if (from_team_id !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权操作其他小队');
    }

    // 不能给自己转账
    if (from_team_id === to_team_id) {
      return ApiErrors.validation('不能给自己转账');
    }

    // 验证积分数
    if (typeof points !== 'number' || points <= 0) {
      return ApiErrors.validation('积分数量必须大于0');
    }

    // 获取转出小队的信息（包含爱心碎片和宝石）
    const { data: fromTeam, error: fromError } = await supabase
      .from('teams')
      .select('id, name, points, heart_shards, heart_gems')
      .eq('id', from_team_id)
      .single();

    if (fromError || !fromTeam) {
      return ApiErrors.notFound('转出小队不存在');
    }

    // 检查积分是否足够
    if (fromTeam.points < points) {
      return ApiErrors.validation(`积分不足，当前可用积分 ${fromTeam.points}`);
    }

    // 获取转入小队的信息
    const { data: toTeam, error: toError } = await supabase
      .from('teams')
      .select('id, name, points')
      .eq('id', to_team_id)
      .single();

    if (toError || !toTeam) {
      return ApiErrors.notFound('转入小队不存在');
    }

    // 计算获得的爱心碎片（每赠送10积分兑换0.1个碎片，不足10积分不兑换）
    const earnedShards = Math.floor(points / 10) * 0.1;
    
    // 计算新的碎片数量和是否获得宝石
    let currentShards = parseFloat(fromTeam.heart_shards) || 0;
    let currentGemsCount = parseInt(fromTeam.heart_gems) || 0;
    let newShards = currentShards + earnedShards;
    let newGemsEarned = 0;
    
    // 每 FRAGMENTS_PER_GEM 个碎片合成 1 个宝石（与 like 路由和前端显示一致）
    if (newShards >= FRAGMENTS_PER_GEM) {
      newGemsEarned = Math.floor(newShards / FRAGMENTS_PER_GEM);
      newShards = newShards % FRAGMENTS_PER_GEM;
      currentGemsCount += newGemsEarned;
    }

    // 执行积分转账（原子操作）
    // 1. 扣除转出小队积分和增加碎片
    const updateData: any = { 
      points: fromTeam.points - points,
      heart_shards: newShards
    };
    if (newGemsEarned > 0) {
      updateData.heart_gems = currentGemsCount;
    }

    // 1. 扣除转出小队积分和增加碎片（乐观锁，检查影响行数防止并发双花）
    // 修复：乐观锁同时校验 points 和 heart_shards，防止碎片并发问题
    const { data: deductedFrom, error: deductError } = await supabase
      .from('teams')
      .update(updateData)
      .eq('id', from_team_id)
      .eq('points', fromTeam.points) // 乐观锁，防止并发问题
      .eq('heart_shards', fromTeam.heart_shards || 0) // 修复：同时校验碎片
      .select('id');

    if (deductError || !deductedFrom || deductedFrom.length === 0) {
      return NextResponse.json(
        { success: false, error: '操作冲突，请重试' },
        { status: 409 }
      );
    }

    // 2. 增加转入小队积分（乐观锁，防止并发问题）
    const { data: creditedTo, error: addError } = await supabase
      .from('teams')
      .update({ points: (toTeam.points || 0) + points })
      .eq('id', to_team_id)
      .eq('points', toTeam.points || 0)
      .select('id');

    if (addError || !creditedTo || creditedTo.length === 0) {
      // 回滚转出小队积分
      await supabase
        .from('teams')
        .update({
          points: fromTeam.points,
          heart_shards: currentShards,
          ...(newGemsEarned > 0 && { heart_gems: currentGemsCount })
        })
        .eq('id', from_team_id);

      return NextResponse.json(
        { success: false, error: '操作冲突，请重试' },
        { status: 409 }
      );
    }

    // 3. 记录转账历史
    const { data: record, error: recordError } = await supabase
      .from('point_transfers')
      .insert({
        from_team_id,
        to_team_id,
        points,
        message: message || null,
        status: 'completed'
      })
      .select()
      .single();

    if (recordError) {
      console.error('记录转账历史失败:', recordError);
      // 转账已成功，只是记录失败，不影响主流程
    }

    // 4. 记录转出小队的积分变动
    await supabase.from('point_transactions').insert({
      team_id: from_team_id,
      points: -points,
      change_type: 'transfer_out',
      related_id: to_team_id,
      description: `向「${toTeam.name}」赠送 ${points} 积分${message ? `：${message}` : ''}`
    });

    // 5. 记录转入小队的积分变动
    await supabase.from('point_transactions').insert({
      team_id: to_team_id,
      points: points,
      change_type: 'transfer_in',
      related_id: from_team_id,
      description: `收到「${fromTeam.name}」赠送 ${points} 积分${message ? `：${message}` : ''}`
    });

    // 6. 记录爱心碎片获得（如果有）
    if (earnedShards > 0) {
      let shardDescription = `赠送积分 ${points} 个，获得 ${earnedShards} 个爱心碎片`;
      if (newGemsEarned > 0) {
        shardDescription += `，并合成了 ${newGemsEarned} 个爱心宝石！`;
      }
      
      await supabase.from('point_transactions').insert({
        team_id: from_team_id,
        points: 0,
        change_type: 'shard_earned',
        related_id: from_team_id,
        description: shardDescription
      });
    }

    // 7. 发送通知 - 通知赠送方（支出积分）
    const fromNewPoints = fromTeam.points - points;
    let fromNotification = `你向「${toTeam.name}」赠送了 ${points} 积分`;
    if (earnedShards > 0) {
      fromNotification += `\n获得 ${earnedShards} 个爱心碎片`;
      if (newGemsEarned > 0) {
        fromNotification += `，并合成了 ${newGemsEarned} 个爱心宝石！`;
      }
    }
    fromNotification += `\n当前小队积分：${fromNewPoints.toFixed(1)}`;
    
    await supabase.from('team_notifications').insert({
      team_id: from_team_id,
      type: 'transfer_sent',
      title: '积分已转出',
      content: fromNotification,
      is_read: false,
      extra_data: { transferId: record?.id, points, toTeamName: toTeam.name, currentPoints: fromNewPoints }
    });

    // 8. 发送通知 - 通知接收方（获得积分）
    const toNewPoints = (toTeam.points || 0) + points;
    let toNotification = `「${fromTeam.name}」向你赠送了 ${points} 积分`;
    if (message) {
      toNotification += `\n留言：${message}`;
    }
    toNotification += `\n当前小队积分：${toNewPoints.toFixed(1)}`;
    
    await supabase.from('team_notifications').insert({
      team_id: to_team_id,
      type: 'transfer_received',
      title: '收到积分赠送',
      content: toNotification,
      is_read: false,
      extra_data: { transferId: record?.id, points, fromTeamName: fromTeam.name, currentPoints: toNewPoints }
    });

    return NextResponse.json({
      success: true,
      data: {
        from_team: { 
          id: fromTeam.id, 
          name: fromTeam.name, 
          points: fromTeam.points - points,
          heart_shards: newShards,
          heart_gems: currentGemsCount
        },
        to_team: { id: toTeam.id, name: toTeam.name, points: (toTeam.points || 0) + points },
        transferred_points: points,
        earned_shards: earnedShards,
        new_gems_earned: newGemsEarned,
        message
      }
    });

  } catch (error: any) {
    console.error('积分转账错误:', error);
    return ApiErrors.validation('积分转账失败');
  }
}
