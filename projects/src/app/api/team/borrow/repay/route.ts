import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 归还借用积分
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { borrow_id, team_id, force_partial } = body;

    if (!borrow_id || !team_id) {
      return ApiErrors.validation('缺少必要参数');
    }

    // 校验调用方只能归还自己的借款，防止横向越权
    if (team_id !== auth.payload!.userId) {
      return ApiErrors.forbidden('无权操作其他小队');
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

    // 验证是否为借入方操作
    if (borrowRecord.borrower_id !== team_id) {
      return ApiErrors.forbidden('只有借入方可以归还积分');
    }

    // 验证状态
    if (borrowRecord.status !== 'approved' && borrowRecord.status !== 'overdue') {
      return ApiErrors.validation('该借用申请尚未被批准，无法归还');
    }

    // 使用中国时区计算逾期
    const nowCN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const todayStr = `${nowCN.getFullYear()}-${String(nowCN.getMonth() + 1).padStart(2, '0')}-${String(nowCN.getDate()).padStart(2, '0')}`;
    const repayDateStr = new Date(borrowRecord.repay_date).toISOString().slice(0, 10);
    const isOverdue = repayDateStr < todayStr;

    // 基础利息（保留一位小数）
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const basePoints = Number(borrowRecord.points);
    const interest = r1(basePoints * (Number(borrowRecord.interest_rate) / 100));
    let totalRepay = r1(basePoints + interest);

    // 逾期利息
    let overdueInterest = 0;
    let overdueDays = 0;
    if (isOverdue) {
      const todayParts = todayStr.split('-').map(Number);
      const repayParts = repayDateStr.split('-').map(Number);
      const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
      const repayDate = new Date(repayParts[0], repayParts[1] - 1, repayParts[2]);
      overdueDays = Math.ceil((todayDate.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
      overdueInterest = r1(basePoints * (Number(borrowRecord.overdue_interest_rate) / 100) * overdueDays);
      totalRepay = r1(totalRepay + overdueInterest);
    }

    // 获取借入小队当前积分
    const { data: borrowerTeam } = await supabase
      .from('teams')
      .select('id, name, points')
      .eq('id', team_id)
      .single();

    if (!borrowerTeam) {
      return ApiErrors.notFound('借入小队不存在');
    }

    const borrowerPoints = Number(borrowerTeam.points) || 0;

    // 判断是否为部分归还（积分不足自动扣除全部积分）
    const isPartialRepay = borrowerPoints < totalRepay;
    const actualDeduct = isPartialRepay ? r1(borrowerPoints) : totalRepay;

    if (actualDeduct <= 0) {
      return ApiErrors.validation('当前积分为零，无法归还');
    }

    // 扣除借入小队积分（乐观锁，防止并发双花）
    const newBorrowerPoints = r1(borrowerPoints - actualDeduct);
    const { data: deductedBorrower, error: deductError } = await supabase
      .from('teams')
      .update({ points: newBorrowerPoints })
      .eq('id', team_id)
      .eq('points', borrowerPoints)
      .select('id');

    // 乐观锁失败：0 行更新表示积分已被其他请求修改
    if (deductError || !deductedBorrower || deductedBorrower.length === 0) {
      return NextResponse.json(
        { success: false, error: '操作冲突，请重试' },
        { status: 409 }
      );
    }

    // 增加借出小队积分（乐观锁，防止并发问题）
    const { data: lenderTeam } = await supabase
      .from('teams')
      .select('id, name, points')
      .eq('id', borrowRecord.lender_id)
      .single();

    const lenderCurrentPoints = Number(lenderTeam?.points) || 0;
    const newLenderPoints = r1(lenderCurrentPoints + actualDeduct);
    const { data: creditedLender, error: lenderError } = await supabase
      .from('teams')
      .update({ points: newLenderPoints })
      .eq('id', borrowRecord.lender_id)
      .eq('points', lenderCurrentPoints)
      .select('id');

    if (lenderError || !creditedLender || creditedLender.length === 0) {
      // 借出方加积分失败，回滚借入方扣减的积分
      await supabase
        .from('teams')
        .update({ points: borrowerPoints })
        .eq('id', team_id);
      console.error('[repay] 增加借出方积分失败', lenderError);
      return NextResponse.json(
        { success: false, error: '操作冲突，请重试' },
        { status: 409 }
      );
    }

    // 更新借用记录状态
    const newStatus = isPartialRepay ? 'partial_repaid' : 'repaid';
    await supabase
      .from('point_borrows')
      .update({
        status: newStatus,
        repaid_at: new Date().toISOString(),
        actual_points: actualDeduct
      })
      .eq('id', borrow_id);

    // 记录积分变动
    const repayDesc = isPartialRepay
      ? `部分归还「${lenderTeam?.name}」借款 ${actualDeduct} 积分（应还${totalRepay}，积分不足已扣除全部）`
      : `归还「${lenderTeam?.name}」借款 ${basePoints} 积分${interest > 0 ? ` + 利息 ${interest} 积分` : ''}${overdueInterest > 0 ? ` + 逾期利息 ${overdueInterest} 积分` : ''}`;

    await supabase.from('point_transactions').insert({
      team_id: borrowRecord.borrower_id,
      points: -actualDeduct,
      change_type: isPartialRepay ? 'partial_repay' : 'repay',
      related_id: borrowRecord.id,
      description: repayDesc
    });

    await supabase.from('point_transactions').insert({
      team_id: borrowRecord.lender_id,
      points: actualDeduct,
      change_type: isPartialRepay ? 'receive_partial_repay' : 'receive_repay',
      related_id: borrowRecord.id,
      description: isPartialRepay
        ? `收到「${borrowerTeam?.name}」部分归还 ${actualDeduct} 积分（应还${totalRepay}）`
        : `收到「${borrowerTeam?.name}」归还借款 ${basePoints} 积分${interest > 0 ? ` + 利息 ${interest} 积分` : ''}${overdueInterest > 0 ? ` + 逾期利息 ${overdueInterest} 积分` : ''}`
    });

    // 通知借入方
    await supabase.from('team_notifications').insert({
      team_id: borrowRecord.borrower_id,
      type: 'borrow_repaid',
      title: isPartialRepay ? '积分已部分归还' : '积分已归还',
      content: isPartialRepay
        ? `你已向「${lenderTeam?.name}」部分归还 ${actualDeduct} 积分（应还${totalRepay}，积分不足已扣除全部）\n当前小队积分：${newBorrowerPoints}`
        : `你已向「${lenderTeam?.name}」归还 ${actualDeduct} 积分（本金${basePoints} + 利息 ${interest}${overdueInterest > 0 ? ` + 逾期利息 ${overdueInterest}` : ''}）\n当前小队积分：${newBorrowerPoints}`,
      is_read: false,
      extra_data: { borrowId: borrow_id, repaidPoints: actualDeduct, isPartial: isPartialRepay, lenderName: lenderTeam?.name, currentPoints: newBorrowerPoints }
    });

    // 通知借出方
    await supabase.from('team_notifications').insert({
      team_id: borrowRecord.lender_id,
      type: 'borrow_received_repay',
      title: isPartialRepay ? '收到部分积分归还' : '收到积分归还',
      content: isPartialRepay
        ? `「${borrowerTeam?.name}」已部分归还 ${actualDeduct} 积分（应还${totalRepay}，对方积分不足）\n当前小队积分：${newLenderPoints}`
        : `「${borrowerTeam?.name}」已归还 ${actualDeduct} 积分（本金${basePoints} + 利息 ${interest}${overdueInterest > 0 ? ` + 逾期利息 ${overdueInterest}` : ''}）\n当前小队积分：${newLenderPoints}`,
      is_read: false,
      extra_data: { borrowId: borrow_id, repaidPoints: actualDeduct, isPartial: isPartialRepay, borrowerName: borrowerTeam?.name, currentPoints: newLenderPoints }
    });

    return NextResponse.json({
      success: true,
      data: {
        borrowed_points: basePoints,
        interest,
        overdue_interest: overdueInterest,
        actual_repay: totalRepay,
        total_repaid: actualDeduct,
        is_overdue: isOverdue,
        overdue_days: overdueDays,
        is_partial: isPartialRepay,
        remaining_debt: isPartialRepay ? r1(totalRepay - actualDeduct) : 0
      }
    });

  } catch (error: any) {
    console.error('归还积分错误:', error);
    return safeError(error);
  }
}
