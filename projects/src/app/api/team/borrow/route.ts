import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 获取可借用的小队列表（同志愿者下的其他小队）
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

// 创建借用申请
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { borrower_id, lender_id, points, interest_rate, overdue_interest_rate, repay_date, message } = body;

    // 验证必填字段
    if (!borrower_id || !lender_id || !points || !repay_date) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 校验调用方只能为自己发起借用，防止横向越权
    if (borrower_id !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权操作其他小队');
    }

    // 不能自己借给自己
    if (borrower_id === lender_id) {
      return ApiErrors.validation('不能向自己借用积分');
    }

    // 验证积分数
    if (typeof points !== 'number' || points <= 0) {
      return ApiErrors.validation('积分数量必须大于0');
    }

    // 验证日期
    const repayDateObj = new Date(repay_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (repayDateObj <= today) {
      return ApiErrors.validation('归还日期必须晚于今天');
    }

    // 获取借出小队的信息
    const { data: lenderTeam, error: lenderError } = await supabase
      .from('teams')
      .select('id, name, points')
      .eq('id', lender_id)
      .single();

    if (lenderError || !lenderTeam) {
      return ApiErrors.notFound('借出小队不存在');
    }

    // 检查借出小队积分是否足够
    if (lenderTeam.points < points) {
      return NextResponse.json(
        { success: false, error: `对方积分不足，当前可用积分: ${lenderTeam.points}` },
        { status: 400 }
      );
    }

    // 计算利息（四舍五入保留1位小数）
    const interestRate = parseFloat(interest_rate) || 0;
    const overdueRate = parseFloat(overdue_interest_rate) || 0;
    const totalPoints = Math.round(points * (1 + interestRate / 100) * 10) / 10;

    // 创建借用申请
    const { data: borrowRecord, error: createError } = await supabase
      .from('point_borrows')
      .insert({
        borrower_id,
        lender_id,
        points,
        interest_rate: interestRate,
        overdue_interest_rate: overdueRate,
        repay_date,
        message: message || null,
        status: 'pending'
      })
      .select()
      .single();

    if (createError) throw createError;

    // 获取借入方信息用于通知
    const { data: borrowerTeam, error: borrowerError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', borrower_id)
      .single();

    // 通知借出方有新的借用申请
    let notificationContent = `「${borrowerTeam?.name || '某小队'}」向你申请借 ${points} 积分\n`;
    notificationContent += `利息：${interestRate}%，逾期利率：${overdueRate}%/天\n`;
    notificationContent += `约定归还日期：${new Date(repay_date).toLocaleDateString('zh-CN')}\n`;
    notificationContent += `到期应还：${totalPoints} 积分`;
    if (message) {
      notificationContent += `\n留言：${message}`;
    }

    await supabase.from('team_notifications').insert({
      team_id: lender_id,
      type: 'borrow_request',
      title: '收到借积分申请',
      content: notificationContent,
      is_read: false,
      extra_data: { borrowId: borrowRecord.id, points, interestRate, overdueRate, repayDate: repay_date }
    });

    // 同时通知借入方申请已提交
    await supabase.from('team_notifications').insert({
      team_id: borrower_id,
      type: 'borrow_submitted',
      title: '借积分申请已提交',
      content: `你向「${lenderTeam?.name}」申请的 ${points} 积分已提交，等待对方确认\n约定归还日期：${new Date(repay_date).toLocaleDateString('zh-CN')}\n到期应还：${totalPoints} 积分`,
      is_read: false,
      extra_data: { borrowId: borrowRecord.id, points, lenderName: lenderTeam?.name }
    });

    return NextResponse.json({
      success: true,
      data: {
        id: borrowRecord.id,
        borrower_id,
        lender_id,
        lender_name: lenderTeam.name,
        points,
        interest_rate: interestRate,
        overdue_interest_rate: overdueRate,
        repay_date,
        total_points: totalPoints,
        status: 'pending'
      }
    });

  } catch (error: any) {
    console.error('创建借用申请错误:', error);
    return safeError(error);
  }
}

// 同意借用申请
export async function PUT(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { borrow_id, action, rejection_reason } = body; // action: approve, reject

    if (!borrow_id || !action) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 获取借用记录
    const { data: borrowRecord, error: getError } = await supabase
      .from('point_borrows')
      .select('*, borrower:borrower_id(id, name, points), lender:lender_id(id, name, points)')
      .eq('id', borrow_id)
      .single();

    if (getError || !borrowRecord) {
      return ApiErrors.notFound('借用记录不存在');
    }

    if (borrowRecord.status !== 'pending') {
      return ApiErrors.validation('该申请已被处理');
    }

    // 只有出借方可以审批借款，防止 IDOR
    if (borrowRecord.lender_id !== auth.payload!.userId) {
      return ApiErrors.forbidden('只有出借方可以审批借款');
    }

    if (action === 'reject') {
      // 拒绝申请，记录拒绝原因
      await supabase
        .from('point_borrows')
        .update({ 
          status: 'rejected',
          rejection_reason: rejection_reason || null
        })
        .eq('id', borrow_id);

      // 通知借入方被拒绝
      await supabase.from('team_notifications').insert({
        team_id: borrowRecord.borrower_id,
        type: 'borrow_rejected',
        title: '借积分申请被拒绝',
        content: `很遗憾，你向「${borrowRecord.lender?.name}」申请的 ${borrowRecord.points} 积分被拒绝了${rejection_reason ? `\n拒绝原因：${rejection_reason}` : ''}`,
        is_read: false,
        extra_data: { borrowId: borrow_id, lenderName: borrowRecord.lender?.name }
      });

      return NextResponse.json({ 
        success: true, 
        message: rejection_reason ? '已拒绝，并发送了拒绝原因' : '已拒绝借用申请' 
      });
    }

    if (action === 'approve') {
      // 同意申请，转移积分
      const borrowPointsInt = Math.round(Number(borrowRecord.points));

      const { data: lenderTeam, error: lenderError } = await supabase
        .from('teams')
        .select('id, name, points')
        .eq('id', borrowRecord.lender_id)
        .single();

      if (lenderError || !lenderTeam) {
        return ApiErrors.notFound('借出小队不存在');
      }

      if (lenderTeam.points < borrowPointsInt) {
        return ApiErrors.validation('对方积分不足，无法借出');
      }

      // 扣除借出小队积分（乐观锁，防止并发双花）
      const { data: deductedLender, error: deductError } = await supabase
        .from('teams')
        .update({ points: lenderTeam.points - borrowPointsInt })
        .eq('id', borrowRecord.lender_id)
        .eq('points', lenderTeam.points)
        .select('id');

      // 乐观锁失败：0 行更新表示积分已被其他请求修改
      if (deductError || !deductedLender || deductedLender.length === 0) {
        return NextResponse.json(
          { success: false, error: '操作冲突，请重试' },
          { status: 409 }
        );
      }

      // 增加借入小队积分（乐观锁，防止并发问题）
      const { data: borrowerTeam } = await supabase
        .from('teams')
        .select('id, name, points')
        .eq('id', borrowRecord.borrower_id)
        .single();

      const borrowerCurrentPoints = borrowerTeam?.points || 0;
      const { data: creditedBorrower, error: creditError } = await supabase
        .from('teams')
        .update({ points: borrowerCurrentPoints + borrowPointsInt })
        .eq('id', borrowRecord.borrower_id)
        .eq('points', borrowerCurrentPoints)
        .select('id');

      if (creditError || !creditedBorrower || creditedBorrower.length === 0) {
        // 借入方加积分失败，需要回滚借出方扣减的积分（带乐观锁，避免覆盖并发变更）
        const rollbackResult = await supabase
          .from('teams')
          .update({ points: lenderTeam.points })
          .eq('id', borrowRecord.lender_id)
          .eq('points', lenderTeam.points - borrowPointsInt)
          .select('id');
        if (!rollbackResult.data || rollbackResult.data.length === 0) {
          // 回滚失败说明积分已被其他请求修改，记录告警日志
          console.error('[borrow/approve] 回滚借出方积分失败，可能产生积分差异', {
            lenderId: borrowRecord.lender_id,
            expectedPoints: lenderTeam.points,
            deductedPoints: lenderTeam.points - borrowPointsInt
          });
        }
        return NextResponse.json(
          { success: false, error: '操作冲突，请重试' },
          { status: 409 }
        );
      }

      // 更新借用记录状态（带乐观锁，防止 TOCTOU 竞态导致双重处理）
      const { data: statusUpdate, error: statusError } = await supabase
        .from('point_borrows')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', borrow_id)
        .eq('status', 'pending')
        .select('id');

      if (statusError || !statusUpdate || statusUpdate.length === 0) {
        // 状态已被并发请求处理，需回滚积分转移
        await supabase
          .from('teams')
          .update({ points: lenderTeam.points })
          .eq('id', borrowRecord.lender_id)
          .eq('points', lenderTeam.points - borrowPointsInt);
        await supabase
          .from('teams')
          .update({ points: borrowerCurrentPoints })
          .eq('id', borrowRecord.borrower_id)
          .eq('points', borrowerCurrentPoints + borrowPointsInt);
        return NextResponse.json(
          { success: false, error: '该申请已被并发处理，请刷新后重试' },
          { status: 409 }
        );
      }

      // 记录积分变动（integer 列）
      await supabase.from('point_transactions').insert({
        team_id: borrowRecord.borrower_id,
        points: borrowPointsInt,
        change_type: 'borrow_in',
        related_id: borrowRecord.id,
        description: `收到「${lenderTeam.name}」借出的 ${borrowPointsInt} 积分`
      });

      await supabase.from('point_transactions').insert({
        team_id: borrowRecord.lender_id,
        points: -borrowPointsInt,
        change_type: 'borrow_out',
        related_id: borrowRecord.id,
        description: `向「${borrowerTeam?.name || '未知小队'}」借出 ${borrowPointsInt} 积分`
      });

      // 计算到期应还金额用于通知
      const totalRepay = Math.round(borrowPointsInt * (1 + Number(borrowRecord.interest_rate) / 100) * 10) / 10;

      const borrowerNewPoints = (borrowerTeam?.points || 0) + borrowPointsInt;
      const lenderNewPoints = lenderTeam.points - borrowPointsInt;

      // 通知借入方申请已通过（获得积分）
      await supabase.from('team_notifications').insert({
        team_id: borrowRecord.borrower_id,
        type: 'borrow_approved',
        title: '借积分申请已通过',
        content: `恭喜！「${lenderTeam.name}」已同意你的借积分申请\n已收到 ${borrowPointsInt} 积分\n当前小队积分：${borrowerNewPoints.toFixed(1)}\n约定归还日期：${new Date(borrowRecord.repay_date).toLocaleDateString('zh-CN')}\n到期应还：${totalRepay} 积分\n请按时归还哦！`,
        is_read: false,
        extra_data: { borrowId: borrow_id, points: borrowPointsInt, lenderName: lenderTeam.name, totalRepay, currentPoints: borrowerNewPoints }
      });

      // 通知借出方已同意（支出积分）
      await supabase.from('team_notifications').insert({
        team_id: borrowRecord.lender_id,
        type: 'borrow_lent',
        title: '已同意借积分申请',
        content: `你已同意向「${borrowerTeam?.name}」借出 ${borrowPointsInt} 积分\n当前小队积分：${lenderNewPoints.toFixed(1)}\n约定归还日期：${new Date(borrowRecord.repay_date).toLocaleDateString('zh-CN')}\n到期应还：${totalRepay} 积分`,
        is_read: false,
        extra_data: { borrowId: borrow_id, points: borrowPointsInt, borrowerName: borrowerTeam?.name, totalRepay, currentPoints: lenderNewPoints }
      });

      return NextResponse.json({
        success: true,
        message: '已同意借用申请，积分已转账'
      });
    }

    return ApiErrors.validation('无效的操作');

  } catch (error: any) {
    console.error('处理借用申请错误:', error);
    return safeError(error);
  }
}
