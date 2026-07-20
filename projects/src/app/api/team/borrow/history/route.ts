import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError, getAuthenticatedClient } from '@/lib/api-auth';
import { ApiErrors } from '@/lib/api-error';

// 获取当前小队的借用记录
export async function GET(request: NextRequest) {
  const auth = await requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const searchParams = request.nextUrl.searchParams;
  const teamId = auth.payload!.userId;
  const type = searchParams.get('type') || 'all'; // all, borrowed, lent
  const status = searchParams.get('status'); // pending, approved, rejected, repaid, overdue

  if (!teamId) {
    return ApiErrors.validation('认证令牌无效');
  }

  try {
    const supabase = getAuthenticatedClient(request, auth);
    let query = supabase
      .from('point_borrows')
      .select(`
        id,
        points,
        interest_rate,
        overdue_interest_rate,
        repay_date,
        status,
        message,
        rejection_reason,
        requested_at,
        approved_at,
        repaid_at,
        actual_points,
        borrower_id,
        lender_id
      `)
      .order('requested_at', { ascending: false });

    if (type === 'borrowed') {
      query = query.eq('borrower_id', teamId);
    } else if (type === 'lent') {
      query = query.eq('lender_id', teamId);
    } else {
      query = query.or(`borrower_id.eq.${teamId},lender_id.eq.${teamId}`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 手动获取 borrower/lender 名称（避免依赖外键约束）
    const teamIds = [...new Set([
      ...(data || []).map((r: any) => r.borrower_id),
      ...(data || []).map((r: any) => r.lender_id),
    ].filter(Boolean))];

    let teamMap: Record<string, any> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name, code')
        .in('id', teamIds);
      (teams || []).forEach((t: any) => { teamMap[t.id] = t; });
    }

    // 处理数据，添加类型标识和计算字段
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const processedData = (data || []).map((record: any) => {
      const isBorrower = record.borrower_id === teamId;
      // 只比较日期部分，避免时区问题
      const repayDateStr = record.repay_date ? String(record.repay_date).substring(0, 10) : '';
      const isOverdue = record.status === 'approved' && repayDateStr < todayStr;
      
      // 计算到期应还积分
      const basePoints = Number(record.points);
      const interest = Math.round(basePoints * (Number(record.interest_rate) / 100) * 10) / 10;
      const totalRepay = Math.round((basePoints + interest) * 10) / 10;
      
      // 计算逾期额外利息
      let overdueInterest = 0;
      let overdueDays = 0;
      if (isOverdue) {
        const todayParts = todayStr.split('-').map(Number);
        const repayParts = repayDateStr.split('-').map(Number);
        const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
        const repayDate = new Date(repayParts[0], repayParts[1] - 1, repayParts[2]);
        overdueDays = Math.ceil((todayDate.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
        overdueInterest = Math.round(basePoints * (Number(record.overdue_interest_rate) / 100) * overdueDays * 10) / 10;
      }
      const actualRepay = Math.round((totalRepay + overdueInterest) * 10) / 10;

      return {
        ...record,
        created_at: record.requested_at,
        borrower: teamMap[record.borrower_id] || { id: record.borrower_id, name: '未知小队', code: '' },
        lender: teamMap[record.lender_id] || { id: record.lender_id, name: '未知小队', code: '' },
        type: isBorrower ? 'borrowed' : 'lent',
        is_overdue: isOverdue,
        overdue_days: overdueDays,
        total_repay: totalRepay,
        actual_repay: actualRepay,
        interest,
        overdue_interest: overdueInterest
      };
    });

    // 异步发送逾期提醒（不阻塞响应）
    sendOverdueNotifications(supabase, teamId, processedData).catch(() => {});

    return NextResponse.json({ success: true, data: processedData });
  } catch (error: any) {
    return safeError(error);
  }
}

// 检查并发送逾期提醒通知
async function sendOverdueNotifications(
  supabase: any,
  teamId: string,
  records: Array<{
    id: string;
    borrower_id: string;
    lender_id: string;
    points: number;
    repay_date: string;
    status: string;
    is_overdue: boolean;
    overdue_days: number;
    type: string;
  }>
) {
  try {
    // 找出借入且逾期的记录
    const overdueRecords = records.filter(
      (r) => r.type === 'borrowed' && r.is_overdue && r.status === 'approved'
    );
    if (overdueRecords.length === 0) return;

    // 检查今天是否已发送过逾期提醒（避免重复发送）
    const today = new Date().toISOString().split('T')[0];
    const { data: existingNotifs } = await supabase
      .from('team_notifications')
      .select('id, extra_data')
      .eq('team_id', teamId)
      .eq('type', 'overdue_reminder')
      .gte('created_at', today);

    // 已发送过的借款ID集合
    const sentBorrowIds = new Set<string>();
    if (existingNotifs) {
      for (const n of existingNotifs) {
        const borrowId = n.extra_data?.borrow_id;
        if (borrowId) sentBorrowIds.add(borrowId);
      }
    }

    // 对每条逾期记录发送通知
    for (const record of overdueRecords) {
      if (sentBorrowIds.has(record.id)) continue;

      // 获取出借方名称
      const { data: lenderTeam } = await supabase
        .from('teams')
        .select('name')
        .eq('id', record.lender_id)
        .single();

      const lenderName = lenderTeam?.name || '其他小队';

      await supabase.from('team_notifications').insert({
        team_id: teamId,
        type: 'overdue_reminder',
        title: '积分归还逾期提醒',
        content: `你向「${lenderName}」借入的 ${record.points} 积分已逾期 ${record.overdue_days} 天，请尽快归还！逾期期间将按日产生逾期利息。`,
        is_read: false,
        extra_data: {
          borrow_id: record.id,
          overdue_days: record.overdue_days,
          points: record.points,
          lender_name: lenderName,
        },
      });
    }
  } catch (err) {
    console.error('发送逾期提醒失败:', err);
  }
}
