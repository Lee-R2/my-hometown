import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 逾期提醒API
 * 检查所有已逾期但未归还的借用记录，发送每日提醒
 * 建议每日定时调用一次（如每天早上9点）
 */
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const supabase = getSupabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 查询所有已批准且已逾期的记录
    const { data: overdueRecords, error } = await supabase
      .from('point_borrows')
      .select(`
        id,
        borrower_id,
        lender_id,
        points,
        interest_rate,
        overdue_interest_rate,
        repay_date,
        status,
        last_reminder_at,
        reminder_count,
        borrower:borrower_id(id, name),
        lender:lender_id(id, name)
      `)
      .eq('status', 'approved');

    if (error) throw error;

    // 过滤出今天需要提醒的记录（上次提醒是昨天或更早）
    const recordsToRemind = (overdueRecords || []).filter((record: any) => {
      const repayDate = new Date(record.repay_date);
      repayDate.setHours(0, 0, 0, 0);
      
      // 只处理已逾期的记录
      if (repayDate >= today) return false;
      
      // 如果没有发送过提醒，需要发送
      if (!record.last_reminder_at) return true;
      
      // 检查上次提醒是否在今天之前
      const lastReminder = new Date(record.last_reminder_at);
      lastReminder.setHours(0, 0, 0, 0);
      
      return lastReminder < today;
    });

    if (recordsToRemind.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要提醒的逾期记录',
        reminded_count: 0
      });
    }

    // 批量发送提醒
    const notifications = [];
    let updatedRecords = [];

    for (const record of recordsToRemind) {
      const repayDate = new Date(record.repay_date);
      repayDate.setHours(0, 0, 0, 0);
      const overdueDays = Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // 计算当前应还金额
      const basePoints = record.points;
      const interest = Math.round(basePoints * (record.interest_rate / 100) * 10) / 10;
      const totalRepay = Math.round((basePoints + interest) * 10) / 10;
      const overdueInterest = Math.round(basePoints * (record.overdue_interest_rate / 100) * overdueDays * 10) / 10;
      const actualRepay = Math.round((totalRepay + overdueInterest) * 10) / 10;

      // 通知借入方
      const borrower = record.borrower as any;
      const lender = record.lender as any;
      const borrowerName = Array.isArray(borrower) ? borrower[0]?.name : borrower?.name;
      const lenderName = Array.isArray(lender) ? lender[0]?.name : lender?.name;
      
      notifications.push({
        sender_id: null,
        receiver_id: record.borrower_id,
        team_id: record.borrower_id,
        topic: '归还提醒',
        extension: JSON.stringify({ borrowId: record.id, type: 'borrow_overdue_reminder', overdueDays }),
        title: '⏰ 归还提醒',
        content: `你向「${lenderName}」借的 ${basePoints} 积分已逾期 ${overdueDays} 天！\n本金 ${basePoints} + 利息 ${interest} + 逾期利息 ${overdueInterest} = 应还 ${actualRepay} 积分\n请尽快归还！`,
        type: 'notification',
        notification_type: 'borrow_overdue_reminder',
        related_type: 'borrow',
        related_id: record.id,
        is_read: false
      });

      updatedRecords.push({
        id: record.id,
        last_reminder_at: today.toISOString(),
        reminder_count: (record.reminder_count || 0) + 1
      });
    }

    // 批量插入通知
    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from('messages')
        .insert(notifications);

      if (insertError) {
        console.error('发送逾期提醒失败:', insertError);
      }

      // 更新提醒记录
      for (const record of updatedRecords) {
        await supabase
          .from('point_borrows')
          .update({
            last_reminder_at: record.last_reminder_at,
            reminder_count: record.reminder_count
          })
          .eq('id', record.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `已发送 ${recordsToRemind.length} 条逾期提醒`,
      reminded_count: recordsToRemind.length
    });

  } catch (error: any) {
    console.error('逾期提醒错误:', error);
    return safeError(error);
  }
}

/**
 * 获取逾期统计
 */
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const supabase = getSupabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 统计逾期记录
    const { data: overdueRecords, error } = await supabase
      .from('point_borrows')
      .select('id, borrower_id, lender_id, points, overdue_interest_rate, repay_date, borrower:borrower_id(name), lender:lender_id(name)')
      .eq('status', 'approved');

    if (error) throw error;

    const overdue = (overdueRecords || []).filter((record: any) => {
      const repayDate = new Date(record.repay_date);
      repayDate.setHours(0, 0, 0, 0);
      return repayDate < today;
    });

    // 计算总逾期金额
    let totalOverduePoints = 0;
    const details = [];

    for (const record of overdue) {
      const repayDate = new Date(record.repay_date);
      repayDate.setHours(0, 0, 0, 0);
      const overdueDays = Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const basePoints = record.points;
      const interest = Math.round(basePoints * (record.overdue_interest_rate / 100) * 10) / 10;
      const overdueInterest = Math.round(basePoints * (record.overdue_interest_rate / 100) * overdueDays * 10) / 10;
      const totalRepay = Math.round((basePoints + interest + overdueInterest) * 10) / 10;
      
      totalOverduePoints += totalRepay;
      
      const borrower = record.borrower as any;
      const lender = record.lender as any;
      const borrowerName = Array.isArray(borrower) ? borrower[0]?.name : borrower?.name;
      const lenderName = Array.isArray(lender) ? lender[0]?.name : lender?.name;
      
      details.push({
        id: record.id,
        borrower: borrowerName,
        lender: lenderName,
        principal: basePoints,
        overdue_days: overdueDays,
        total_repay: totalRepay
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        overdue_count: overdue.length,
        total_overdue_points: totalOverduePoints,
        details
      }
    });

  } catch (error: any) {
    return safeError(error);
  }
}
