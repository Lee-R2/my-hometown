import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 逾期检查和自动还款
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const body = await request.json();
    const { action = 'check' } = body;

    // 获取所有已批准/逾期/部分归还的借贷记录（partial_repaid 仍需继续追讨剩余债务）
    const { data: borrowRecords, error: fetchError } = await supabase
      .from('point_borrows')
      .select(`
        *,
        borrower:borrower_id(id, name, points),
        lender:lender_id(id, name, points)
      `)
      .in('status', ['approved', 'overdue', 'partial_repaid']);

    if (fetchError) {
      return ApiErrors.validation('获取借贷记录失败');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const results = {
      processed: 0,
      reminders: 0,
      autoRepaid: 0,
      overdueRecords: [] as any[],
      errors: [] as string[]
    };

    for (const record of borrowRecords || []) {
      try {
        const repayDate = new Date(record.repay_date);
        repayDate.setHours(0, 0, 0, 0);
        const isOverdue = repayDate < today;
        const isDueToday = repayDate.getTime() === today.getTime();

        // 计算应还积分
        const basePoints = record.points;
        const interest = Math.round(basePoints * (record.interest_rate / 100) * 10) / 10;
        let totalRepay = Math.round((basePoints + interest) * 10) / 10;

        // 计算逾期利息
        let overdueInterest = 0;
        if (isOverdue) {
          const overdueDays = Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
          overdueInterest = Math.round(basePoints * (record.overdue_interest_rate / 100) * overdueDays * 10) / 10;
          totalRepay = Math.round((totalRepay + overdueInterest) * 10) / 10;

          // 如果状态还是approved，更新为 overdue
          if (record.status === 'approved') {
            await supabase
              .from('point_borrows')
              .update({ status: 'overdue' })
              .eq('id', record.id);
          }
        }

        const borrowerTeam = record.borrower;
        const lenderTeam = record.lender;

        if (isOverdue || isDueToday) {
          results.overdueRecords.push({
            id: record.id,
            borrowerName: borrowerTeam?.name,
            lenderName: lenderTeam?.name,
            points: basePoints,
            interest,
            overdueInterest,
            totalRepay,
            overdueDays: isOverdue ? Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
            borrowerPoints: borrowerTeam?.points,
            status: record.status
          });

          // 检查是否可以自动还款（积分不足时自动全部还款）
          if (borrowerTeam && (borrowerTeam.points >= totalRepay || borrowerTeam.points > 0)) {
            const actualRepay = Math.min(borrowerTeam.points, totalRepay);
            const isPartialRepay = borrowerTeam.points < totalRepay;

            // 重新查询借入方当前积分，避免使用初始查询的快照值（循环中可能已被其他请求修改）
            const { data: freshBorrower } = await supabase
              .from('teams')
              .select('id, points')
              .eq('id', borrowerTeam.id)
              .single();
            const borrowerCurrentPoints = freshBorrower?.points || 0;

            // 重新计算基于最新积分的实际还款额
            const freshActualRepay = Math.min(borrowerCurrentPoints, totalRepay);
            const freshIsPartial = borrowerCurrentPoints < totalRepay;

            if (freshActualRepay <= 0) {
              // 最新积分为零，跳过自动还款（下方零积分分支处理）
              results.processed++;
              continue;
            }

            // 自动还款逻辑（乐观锁，防止并发双花）
            // 1. 扣除借入小队积分（按实际扣除额计算，而非直接设为0，避免超额扣减）
            const newBorrowerPoints = Math.round((borrowerCurrentPoints - freshActualRepay) * 10) / 10;
            const { data: deductedBorrower } = await supabase
              .from('teams')
              .update({ points: newBorrowerPoints })
              .eq('id', borrowerTeam.id)
              .eq('points', borrowerCurrentPoints)
              .select('id');

            if (!deductedBorrower || deductedBorrower.length === 0) {
              // 乐观锁失败，跳过此条记录的自动还款
              continue;
            }

            // 2. 增加借出小队积分（乐观锁 + 回滚）
            const lenderCurrentPoints = lenderTeam?.points || 0;
            const newLenderPoints = Math.round((lenderCurrentPoints + freshActualRepay) * 10) / 10;
            const { data: creditedLender } = await supabase
              .from('teams')
              .update({ points: newLenderPoints })
              .eq('id', lenderTeam?.id)
              .eq('points', lenderCurrentPoints)
              .select('id');

            if (!creditedLender || creditedLender.length === 0) {
              // 借出方加积分失败，回滚借入方扣减（带乐观锁）
              const rollbackResult = await supabase
                .from('teams')
                .update({ points: borrowerCurrentPoints })
                .eq('id', borrowerTeam.id)
                .eq('points', newBorrowerPoints)
                .select('id');
              if (!rollbackResult.data || rollbackResult.data.length === 0) {
                console.error('[overdue] 回滚借入方积分失败，可能产生积分差异', {
                  borrowerId: borrowerTeam.id,
                  expectedPoints: borrowerCurrentPoints,
                  deductedPoints: newBorrowerPoints
                });
              }
              continue;
            }

            // 3. 更新借用记录状态（部分归还标记为 partial_repaid，全部还清才标记为 repaid）
            const newStatus = freshIsPartial ? 'partial_repaid' : 'repaid';
            const unpaidPoints = freshIsPartial ? Math.round((totalRepay - freshActualRepay) * 10) / 10 : 0;
            const { data: statusUpdate } = await supabase
              .from('point_borrows')
              .update({
                status: newStatus,
                repaid_at: freshIsPartial ? null : new Date().toISOString(),
                actual_points: freshActualRepay,
                auto_repaid: true,
                unpaid_points: unpaidPoints
              })
              .eq('id', record.id)
              .in('status', ['approved', 'overdue', 'partial_repaid'])
              .select('id');

            if (!statusUpdate || statusUpdate.length === 0) {
              // 状态已被并发处理，回滚积分转移
              await supabase
                .from('teams')
                .update({ points: borrowerCurrentPoints })
                .eq('id', borrowerTeam.id)
                .eq('points', newBorrowerPoints);
              await supabase
                .from('teams')
                .update({ points: lenderCurrentPoints })
                .eq('id', lenderTeam?.id)
                .eq('points', newLenderPoints);
              continue;
            }

            // 4. 记录积分变动
            await supabase.from('point_transactions').insert({
              team_id: borrowerTeam.id,
              points: -freshActualRepay,
              change_type: 'auto_repay',
              related_id: record.id,
              description: `系统自动还款 ${freshActualRepay} 积分${freshIsPartial ? `（积分不足，实际偿还 ${freshActualRepay}/${totalRepay}）` : ''}`
            });

            await supabase.from('point_transactions').insert({
              team_id: lenderTeam?.id,
              points: freshActualRepay,
              change_type: 'receive_auto_repay',
              related_id: record.id,
              description: `系统自动收回 ${freshActualRepay} 积分${freshIsPartial ? `（部分收回 ${freshActualRepay}/${totalRepay}）` : ''}`
            });

            // 5. 发送通知给借入方
            await supabase.from('team_notifications').insert({
              team_id: borrowerTeam.id,
              type: 'borrow_auto_repaid',
              title: freshIsPartial ? '积分已用尽自动还款' : '逾期自动还款',
              content: freshIsPartial
                ? `由于你小队积分不足（${borrowerCurrentPoints}积分），系统已将全部积分 ${freshActualRepay} 用于还款。\n原应还${totalRepay} 积分，尚有${unpaidPoints} 积分未还清。`
                : `你已逾期 ${Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24))} 天，系统自动还款 ${freshActualRepay} 积分${overdueInterest > 0 ? `（含逾期利息 ${overdueInterest}）` : ''}`,
              is_read: false,
              extra_data: {
                borrowId: record.id,
                repaidPoints: freshActualRepay,
                originalTotal: totalRepay,
                isPartialRepay: freshIsPartial,
                lenderName: lenderTeam?.name
              }
            });

            // 6. 发送通知给借出方
            await supabase.from('team_notifications').insert({
              team_id: lenderTeam?.id,
              type: 'borrow_auto_received',
              title: freshIsPartial ? '收到部分自动还款' : '收到自动还款',
              content: freshIsPartial
                ? `「${borrowerTeam.name}」的小队积分已用尽，系统自动收回 ${freshActualRepay} 积分（部分收回 ${freshActualRepay}/${totalRepay}）。`
                : `「${borrowerTeam.name}」已逾期 ${Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24))} 天，系统自动收回 ${freshActualRepay} 积分${overdueInterest > 0 ? `（含逾期利息 ${overdueInterest}）` : ''}`,
              is_read: false,
              extra_data: {
                borrowId: record.id,
                repaidPoints: freshActualRepay,
                originalTotal: totalRepay,
                isPartialRepay: freshIsPartial,
                borrowerName: borrowerTeam?.name
              }
            });

            results.autoRepaid++;
          } else if (borrowerTeam && borrowerTeam.points === 0) {
            // 积分为零，无法自动还款，保持债务状态（标记为 partial_repaid 并记录未还金额，而非豁免债务）
            await supabase
              .from('point_borrows')
              .update({
                status: 'partial_repaid',
                auto_repaid: true,
                actual_points: 0,
                unpaid_points: totalRepay
              })
              .eq('id', record.id)
              .in('status', ['approved', 'overdue', 'partial_repaid']);
          }

          results.processed++;
        }

        // 发送提醒消息（逾期后每天提醒一次）
        if (isOverdue && borrowerTeam) {
          // 检查今天是否已经发送过提醒
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const { data: existingReminder } = await supabase
            .from('team_notifications')
            .select('id')
            .eq('team_id', borrowerTeam.id)
            .eq('type', 'borrow_overdue_reminder')
            .eq('extra_data->>borrowId', record.id)
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .single();

          // 只有今天没发过提醒才发
          if (!existingReminder) {
            const overdueDays = Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));

            await supabase.from('team_notifications').insert({
              team_id: borrowerTeam.id,
              type: 'borrow_overdue_reminder',
              title: '还款提醒',
              content: `你小队尚有${totalRepay} 积分未归还给「${lenderTeam?.name}」\n已逾期 ${overdueDays} 天\n请尽快归还！${borrowerTeam.points > 0 && borrowerTeam.points < totalRepay ? `\n注意：你的小队积分不足，系统将自动扣减全部积分${borrowerTeam.points} 进行还款。` : ''}`,
              is_read: false,
              extra_data: { 
                borrowId: record.id, 
                totalRepay,
                overdueDays,
                borrowerPoints: borrowerTeam.points,
                lenderName: lenderTeam?.name
              }
            });

            results.reminders++;
          }
        }
      } catch (err: any) {
        results.errors.push(`处理记录 ${record.id} 失败: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: '逾期检查完成',
      data: results
    });

  } catch (error: any) {
    console.error('[逾期检查] 错误:', error);
    return safeError(error);
  }
}

// 获取逾期统计
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  try {
    const { data: borrowRecords, error } = await supabase
      .from('point_borrows')
      .select(`
        *,
        borrower:borrower_id(id, name, points),
        lender:lender_id(id, name, points)
      `)
      .in('status', ['approved', 'overdue', 'partial_repaid']);

    if (error) {
      return ApiErrors.validation('获取借贷记录失败');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueRecords: any[] = [];
    const upcomingRecords: any[] = [];
    let totalOverduePoints = 0;

    for (const record of borrowRecords || []) {
      const repayDate = new Date(record.repay_date);
      repayDate.setHours(0, 0, 0, 0);
      const isOverdue = repayDate < today;
      const isDueToday = repayDate.getTime() === today.getTime();

      // 计算应还积分
      const basePoints = record.points;
      const interest = Math.round(basePoints * (record.interest_rate / 100) * 10) / 10;
      let totalRepay = Math.round((basePoints + interest) * 10) / 10;

      let overdueDays = 0;
      if (isOverdue) {
        overdueDays = Math.ceil((today.getTime() - repayDate.getTime()) / (1000 * 60 * 60 * 24));
        const overdueInterest = Math.round(basePoints * (record.overdue_interest_rate / 100) * overdueDays * 10) / 10;
        totalRepay = Math.round((totalRepay + overdueInterest) * 10) / 10;
        totalOverduePoints += totalRepay;
      }

      const recordInfo = {
        id: record.id,
        borrowerName: record.borrower?.name,
        borrowerPoints: record.borrower?.points,
        lenderName: record.lender?.name,
        points: basePoints,
        totalRepay,
        repayDate: record.repay_date,
        overdueDays,
        status: record.status,
        canAutoRepay: record.borrower?.points >= totalRepay,
        willAutoRepay: record.borrower?.points > 0 && record.borrower?.points < totalRepay
      };

      if (isOverdue) {
        overdueRecords.push(recordInfo);
      } else if (isDueToday || (repayDate.getTime() - today.getTime()) <= 3 * 24 * 60 * 60 * 1000) {
        upcomingRecords.push(recordInfo);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        overdueCount: overdueRecords.length,
        upcomingCount: upcomingRecords.length,
        totalOverduePoints: Math.round(totalOverduePoints * 10) / 10,
        overdueRecords,
        upcomingRecords
      }
    });

  } catch (error: any) {
    console.error('[逾期统计] 错误:', error);
    return safeError(error);
  }
}
