'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, ArrowRight, Clock, Coins, AlertTriangle, CheckCircle2, XCircle, CalendarDays } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useResponsive } from '@/hooks/use-responsive';
import { toast } from 'sonner';
import { safeJSONParse } from '@/lib/utils';

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
  createdBy?: string;
}

interface BorrowRecord {
  id: string;
  points: number;
  interest_rate: number;
  overdue_interest_rate: number;
  repay_date: string;
  status: string;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  repaid_at: string | null;
  actual_points: number | null;
  borrower_id: string;
  lender_id: string;
  borrower: { id: string; name: string; code: string };
  lender: { id: string; name: string; code: string };
  type: 'borrowed' | 'lent';
  is_overdue: boolean;
  overdue_days: number;
  total_repay: number;
  actual_repay: number;
  interest: number;
  overdue_interest: number;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending: { label: '待确认', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Clock },
  approved: { label: '已借出', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle2 },
  rejected: { label: '已拒绝', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: XCircle },
  repaid: { label: '已归还', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: CheckCircle2 },
  overdue: { label: '已逾期', color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertTriangle },
  partial_repaid: { label: '部分归还', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: AlertTriangle },
};

  // 格式化积分显示（四舍五入保留1位小数）
  const formatPoints = (p: number | undefined | null): string => {
    if (p === undefined || p === null) return '0.0';
    return Number(p).toFixed(1);
  };

export default function BorrowPage() {
  const router = useRouter();
  const { isMobile } = useResponsive();

  const [team, setTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [points, setPoints] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [overdueRate, setOverdueRate] = useState('');
  const [repayDate, setRepayDate] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [records, setRecords] = useState<BorrowRecord[]>([]);
  const [activeTab, setActiveTab] = useState('borrow');
  const [repayLoading, setRepayLoading] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingRecord, setRejectingRecord] = useState<BorrowRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [borrowConfirmOpen, setBorrowConfirmOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approvingRecord, setApprovingRecord] = useState<BorrowRecord | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [repayConfirmOpen, setRepayConfirmOpen] = useState(false);
  const [repayingRecord, setRepayingRecord] = useState<BorrowRecord | null>(null);

  // 计算待确认和需还款数量
  const pendingRecords = records.filter(r => r.status === 'pending');
  const historyRecords = records.filter(r => r.status !== 'pending');
  
  // 已读跟踪 - 仅用于借/还记录tab
  const getReadHistoryIds = useCallback((): Set<string> => {
    if (typeof window === 'undefined' || !team) return new Set();
    try {
      const stored = localStorage.getItem(`readBorrowHistoryIds_${team.id}`);
      return stored ? new Set(safeJSONParse(stored, [])) : new Set();
    } catch { return new Set(); }
  }, [team]);

  // 待确认数量：只计算收到的借积分请求（type=lent, status=pending），即需要自己确认的请求
  const pendingCount = pendingRecords.filter(r => r.type === 'lent').length;
  // 未读借还记录数量（最近状态变更的记录）
  const [unreadHistoryCount, setUnreadHistoryCount] = useState(0);
  // 逾期未还数量：我借入的且已逾期的记录
  const overdueCount = records.filter(r => r.type === 'borrowed' && r.is_overdue).length;

  // 更新未读借还记录计数
  useEffect(() => {
    if (!team) return;
    const readHistoryIds = getReadHistoryIds();
    const unreadHistory = historyRecords.filter(r => !readHistoryIds.has(r.id)).length;
    setUnreadHistoryCount(unreadHistory);
  }, [records, team, getReadHistoryIds]);

  // 切换tab时标记已读
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (!team) return;
    
    if (tab === 'history') {
      // 切换到借/还记录tab，标记所有非待确认记录为已读
      const ids = historyRecords.map(r => r.id);
      if (ids.length > 0) {
        const existing = getReadHistoryIds();
        ids.forEach(id => existing.add(id));
        localStorage.setItem(`readBorrowHistoryIds_${team.id}`, JSON.stringify([...existing]));
        setUnreadHistoryCount(0);
      }
    }
  };

  // 计算应还积分预览（四舍五入保留1位小数）
  const calculatePreview = () => {
    const pts = parseFloat(points) || 0;
    const rate = parseFloat(interestRate) || 0;
    const interest = Math.round(pts * (rate / 100) * 10) / 10;
    const total = Math.round((pts + interest) * 10) / 10;
    return { principal: pts, interest, total };
  };

  const preview = calculatePreview();

  // 获取最小日期（明天）
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      const teamData = localStorage.getItem('team');
      if (!teamData) {
        router.push('/team/login');
        return;
      }

      const parsed = safeJSONParse(teamData, null as any);
      if (!parsed) {
        router.push('/team/login');
        return;
      }

      // 从数据库获取最新积分，避免 localStorage 数据过时
      try {
        const teamRes = await fetch(`/api/teams/${parsed.id}`);
        const teamResult = await teamRes.json();
        if (teamResult.success && teamResult.data) {
          const freshTeam = { ...parsed, points: teamResult.data.points };
          setTeam(freshTeam);
          localStorage.setItem('team', JSON.stringify(freshTeam));
        } else {
          setTeam(parsed);
        }
      } catch {
        setTeam(parsed);
      }

      // 获取同一志愿者下的其他小队
      let url = `/api/team/borrow?exclude_team_id=${parsed.id}`;
      if (parsed.created_by) {
        url += `&volunteer_id=${parsed.created_by}`;
      }
      const res = await fetch(url);
      const result = await res.json();
      if (result.success) {
        setTeams(result.data || []);
      }

      // 获取借用记录
      const recordsRes = await fetch(`/api/team/borrow/history?team_id=${parsed.id}`);
      const recordsResult = await recordsRes.json();
      if (recordsResult.success) {
        setRecords(recordsResult.data || []);
      }

    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 发起借用申请 - 打开二次确认
  const handleBorrow = () => {
    if (!team || !selectedTeam) {
      toast.error('请选择要借入的小队');
      return;
    }

    const pointsNum = parseFloat(points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      toast.error('请输入有效的积分数量');
      return;
    }

    if (selectedTeam.points < pointsNum) {
      toast.error(`对方积分不足，当前可用积分: ${selectedTeam.points}`);
      return;
    }

    if (!repayDate) {
      toast.error('请选择归还日期');
      return;
    }

    setBorrowConfirmOpen(true);
  };

  // 确认发起借用申请
  const confirmBorrow = async () => {
    if (!team || !selectedTeam) return;

    setSubmitting(true);

    try {
      const pointsNum = parseFloat(points);
      const res = await fetch('/api/team/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower_id: team.id,
          lender_id: selectedTeam.id,
          points: pointsNum,
          interest_rate: parseFloat(interestRate) || 0,
          overdue_interest_rate: parseFloat(overdueRate) || 0,
          repay_date: repayDate,
          message: message.trim() || null
        })
      });

      const result = await res.json();

      if (result.success) {
        toast.success(`借用申请已发送，等待「${selectedTeam.name}」确认`);
        // 清空表单
        setSelectedTeam(null);
        setPoints('');
        setInterestRate('');
        setOverdueRate('');
        setRepayDate('');
        setMessage('');
        setBorrowConfirmOpen(false);
        // 刷新记录
        loadData();
      } else {
        toast.error(result.error || '申请失败');
      }
    } catch (error) {
      console.error('申请失败:', error);
      toast.error('申请失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 同意借用申请 - 打开二次确认
  const openApproveConfirm = (record: BorrowRecord) => {
    setApprovingRecord(record);
    setApproveConfirmOpen(true);
  };

  // 确认同意借用申请
  const confirmApprove = async () => {
    if (!approvingRecord) return;
    setApproveLoading(true);
    try {
      await handleApprove(approvingRecord.id, 'approve');
    } finally {
      setApproveLoading(false);
      setApproveConfirmOpen(false);
      setApprovingRecord(null);
    }
  };

  // 同意/拒绝借用申请
  const handleApprove = async (borrowId: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch('/api/team/borrow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          borrow_id: borrowId, 
          action,
          rejection_reason: action === 'reject' ? rejectionReason : undefined 
        })
      });

      const result = await res.json();

      if (result.success) {
        toast.success(action === 'approve' ? '已同意借用申请' : '已拒绝借用申请');
        setRejectDialogOpen(false);
        setRejectingRecord(null);
        setRejectionReason('');
        loadData();
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败，请重试');
    }
  };

  // 归还积分 - 打开确认弹窗
  const handleRepay = (record: BorrowRecord) => {
    setRepayingRecord(record);
    setRepayConfirmOpen(true);
  };

  // 确认归还积分
  const confirmRepay = async () => {
    if (!team || !repayingRecord) return;

    setRepayLoading(repayingRecord.id);

    try {
      const res = await fetch('/api/team/borrow/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrow_id: repayingRecord.id,
          team_id: team.id
        })
      });

      const result = await res.json();

      if (result.success) {
        const isPartial = result.data.is_partial;
        const actualDeducted = result.data.total_repaid;
        if (isPartial) {
          toast.success(`积分不足，已扣除全部 ${actualDeducted} 积分，剩余欠款 ${result.data.remaining_debt} 积分`);
        } else {
          toast.success(`已归还 ${actualDeducted} 积分`);
        }
        // 立即更新本地记录状态
        setRecords(prev => prev.map(r =>
          r.id === repayingRecord.id
            ? { ...r, status: isPartial ? 'partial_repaid' : 'repaid', repaid_at: new Date().toISOString(), actual_points: actualDeducted }
            : r
        ));
        // 更新本地积分（部分还款时扣到0，全额还款时扣实际数）
        const newPoints = isPartial ? 0 : team.points - actualDeducted;
        setTeam(prev => prev ? { ...prev, points: newPoints } : null);
        // 同步更新 localStorage
        try {
          const stored = localStorage.getItem('team');
          if (stored) {
            const parsed = safeJSONParse(stored, {} as Record<string, any>);
            parsed.points = newPoints;
            localStorage.setItem('team', JSON.stringify(parsed));
          }
        } catch {}
        setRepayConfirmOpen(false);
        setRepayingRecord(null);
        // 刷新完整数据
        loadData();
      } else {
        toast.error(result.error || '归还失败');
      }
    } catch (error) {
      toast.error('归还失败，请重试');
    } finally {
      setRepayLoading(null);
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-blue-100">
        <div className="max-w-4xl mx-auto px-3 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/team/dashboard')}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-gray-900 truncate">借积分</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-4 space-y-4">
        {/* 当前积分 */}
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-400 flex items-center justify-center">
                  <Coins className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">我的积分</p>
                  <p className="text-2xl font-bold text-blue-600">{formatPoints(team?.points)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 标签页切换 */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="borrow" className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              发起借用
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2 relative">
              <Clock className="w-4 h-4" />
              待确认
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium px-0.5">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 relative">
              <CalendarDays className="w-4 h-4" />
              借/还记录
              {(() => {
                // 逾期未还 + 未读记录 合并显示气泡
                const totalCount = overdueCount + unreadHistoryCount;
                if (totalCount <= 0) return null;
                return (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium px-0.5">
                    {totalCount > 9 ? '9+' : totalCount}
                  </span>
                );
              })()}
              {overdueCount > 0 && (
                <span className="text-[10px] text-red-500 font-medium">({overdueCount}笔逾期)</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* 发起借用 */}
          <TabsContent value="borrow" className="mt-4 space-y-4">
            {/* 选择借入小队 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">1</span>
                  选择借入对象
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-3">以下显示与你在同一志愿者指导下的其他小队：</p>
                {teams.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">暂无可借入的小队</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {teams.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTeam(t)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedTeam?.id === t.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/50'
                        }`}
                      >
                        <p className="font-medium text-gray-900 truncate">{t.name}</p>
                        <p className="text-xs text-gray-500">编码: {t.code}</p>
                        <p className="text-xs text-green-600 mt-1">可借积分: {t.points}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 输入借用信息 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">2</span>
                  填写借用信息
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 借积分 */}
                <div>
                  <Label htmlFor="points">借积分</Label>
                  <Input
                    id="points"
                    type="number"
                    min="0.1"
                    step="0.1"
                    max={selectedTeam?.points || 9999}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    placeholder="请输入要借用的积分数量"
                    className="mt-1"
                  />
                  {selectedTeam && parseFloat(points) > selectedTeam.points && (
                    <p className="text-red-500 text-sm mt-1">对方积分不足，最多可借 {selectedTeam.points}</p>
                  )}
                </div>

                {/* 归还日期 */}
                <div>
                  <Label htmlFor="repayDate">约定归还日期</Label>
                  <Input
                    id="repayDate"
                    type="date"
                    min={getMinDate()}
                    value={repayDate}
                    onChange={(e) => setRepayDate(e.target.value)}
                    className="mt-1"
                  />
                </div>

                {/* 利息设置 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="interestRate">借用利息 (%)</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="如: 5"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-400 mt-1">按时归还额外支付的积分比例</p>
                  </div>
                  <div>
                    <Label htmlFor="overdueRate">逾期日利率 (%)</Label>
                    <Input
                      id="overdueRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={overdueRate}
                      onChange={(e) => setOverdueRate(e.target.value)}
                      placeholder="如: 1"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-400 mt-1">超过日期每天额外支付的比例</p>
                  </div>
                </div>

                {/* 留言 */}
                <div>
                  <Label htmlFor="message">留言（选填）</Label>
                  <Input
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="说明借积分的原因..."
                    maxLength={100}
                    className="mt-1"
                  />
                </div>

                {/* 预览 */}
                {parseFloat(points) > 0 && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-3">
                      <p className="text-sm text-blue-800 font-medium mb-2">归还预览</p>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-gray-500">本金</p>
                          <p className="font-bold text-blue-600">{preview.principal}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-500">利息</p>
                          <p className="font-bold text-orange-600">+{preview.interest}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-500">到期应还</p>
                          <p className="font-bold text-red-600">{preview.total}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            {/* 确认按钮 */}
            <Button
              onClick={handleBorrow}
              disabled={!selectedTeam || !points || parseFloat(points) <= 0 || parseFloat(points) > (selectedTeam?.points || 0) || !repayDate || submitting}
              className="w-full h-12 text-lg bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  提交中...
                </>
              ) : (
                <>
                  <ArrowRight className="w-5 h-5 mr-2" />
                  向「{selectedTeam?.name || '请选择小队'}」发起借用申请
                </>
              )}
            </Button>

            <p className="text-sm text-gray-500 text-center">
              借用申请需要对方确认后生效
            </p>
          </TabsContent>

          {/* 待确认 */}
          <TabsContent value="pending" className="mt-4">
            <div className="space-y-4">
              {records.filter(r => r.status === 'pending').length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">暂无待确认的记录</p>
                  </CardContent>
                </Card>
              ) : (
                records.filter(r => r.status === 'pending').map(record => (
                  <Card key={record.id} className={record.type === 'borrowed' ? 'border-blue-200' : 'border-green-200'}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          record.type === 'borrowed' ? 'bg-blue-100' : 'bg-green-100'
                        }`}>
                          {record.type === 'borrowed' ? (
                            <ArrowRight className="w-5 h-5 text-blue-600" />
                          ) : (
                            <ArrowRight className="w-5 h-5 text-green-600 rotate-180" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900">
                              {record.type === 'borrowed' 
                                ? `向「${record.lender.name}」申请借用`
                                : `「${record.borrower.name}」申请借用`
                              }
                            </p>
                            <Badge className={statusConfig.pending.bgColor}>
                              <span className={`${statusConfig.pending.color} flex items-center gap-1`}>
                                <Clock className="w-3 h-3" />
                                待确认
                              </span>
                            </Badge>
                          </div>
                          
                          <p className="text-lg font-bold text-blue-600 mt-1">
                            {formatPoints(record.points)} 积分
                          </p>
                          
                          <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                            <p>利息: {record.interest_rate}%</p>
                            <p>逾期利率: {record.overdue_interest_rate}%/天</p>
                            <p>归还日期: {formatTime(record.repay_date)}</p>
                            <p>到期应还: {record.total_repay} 积分</p>
                          </div>
                          
                          {record.message && (
                            <p className="text-sm text-gray-500 mt-2 italic">"{record.message}"</p>
                          )}
                          
                          {/* 借出方操作按钮 */}
                          {record.type === 'lent' && record.status === 'pending' && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                className="flex-1 bg-green-500 hover:bg-green-600"
                                onClick={() => openApproveConfirm(record)}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                同意
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  setRejectingRecord(record);
                                  setRejectDialogOpen(true);
                                }}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                拒绝
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* 全部记录 */}
          <TabsContent value="history" className="mt-4">
            <div className="space-y-3">
              {records.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">暂无借用记录</p>
                  </CardContent>
                </Card>
              ) : (
                records.map(record => {
                  const config = statusConfig[record.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  
                  return (
                    <Card key={record.id} className={record.is_overdue ? 'border-red-300' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            record.type === 'borrowed' ? 'bg-blue-100' : 'bg-green-100'
                          }`}>
                            {record.type === 'borrowed' ? (
                              <ArrowRight className="w-5 h-5 text-blue-600" />
                            ) : (
                              <ArrowRight className="w-5 h-5 text-green-600 rotate-180" />
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-gray-900">
                                {record.type === 'borrowed' 
                                  ? `向「${record.lender.name}」借入`
                                  : `借给「${record.borrower.name}」`
                                }
                              </p>
                              <Badge className={config.bgColor}>
                                <span className={`${config.color} flex items-center gap-1`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {config.label}
                                  {record.is_overdue && ` (逾期${record.overdue_days}天)`}
                                </span>
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                              <div>
                                <p className="text-gray-500">本金</p>
                                <p className="font-medium">{formatPoints(record.points)}</p>
                              </div>
                              {record.interest > 0 && (
                                <div>
                                  <p className="text-gray-500">利息</p>
                                  <p className="font-medium text-orange-600">+{record.interest}</p>
                                </div>
                              )}
                              {record.overdue_interest > 0 && (
                                <div>
                                  <p className="text-gray-500">逾期利息</p>
                                  <p className="font-medium text-red-600">+{record.overdue_interest}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-gray-500">{record.status === 'repaid' ? '实还' : '应还'}</p>
                                <p className="font-bold text-red-600">{record.actual_repay}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                              <span>归还日期: {formatTime(record.repay_date)}</span>
                              {record.status === 'repaid' && (
                                <span>实还日期: {formatTime(record.repaid_at!)}</span>
                              )}
                            </div>
                            
                            {/* 拒绝原因 */}
                            {record.status === 'rejected' && record.rejection_reason && (
                              <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-xs text-red-600">
                                  <span className="font-medium">拒绝原因：</span>
                                  {record.rejection_reason}
                                </p>
                              </div>
                            )}
                            
                            {/* 借入方归还按钮 */}
                            {record.type === 'borrowed' && (record.status === 'approved' || record.status === 'overdue' || record.status === 'partial_repaid') && (
                              <Button
                                size="sm"
                                className="w-full mt-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                                disabled={repayLoading === record.id}
                                onClick={() => handleRepay(record)}
                              >
                                {repayLoading === record.id ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                    处理中...
                                  </>
                                ) : (
                                  <>
                                    <Coins className="w-4 h-4 mr-2" />
                                    归还 {formatPoints(record.actual_repay)} 积分
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* 拒绝原因对话框 */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>拒绝借积分请求</DialogTitle>
              <DialogDescription>
                请选择或输入拒绝原因，告知对方拒绝的理由
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {rejectingRecord && (
                <Card className="bg-gray-50 border-gray-200">
                  <CardContent className="p-3">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{rejectingRecord.borrower?.name}</span> 申请借 
                      <span className="font-bold text-blue-600"> {rejectingRecord.points} </span> 积分
                    </p>
                  </CardContent>
                </Card>
              )}
              
              <div className="space-y-2">
                <Label>选择拒绝原因（可选）</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    '积分不足',
                    '利息太低',
                    '归还日期不合适',
                    '其他原因'
                  ].map((reason) => (
                    <Badge
                      key={reason}
                      variant={rejectionReason === reason ? 'default' : 'outline'}
                      className={`cursor-pointer px-3 py-1 ${
                        rejectionReason === reason ? 'bg-red-500' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => setRejectionReason(reason)}
                    >
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejectReason">自定义原因（选填）</Label>
                <Input
                  id="rejectReason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="输入拒绝原因..."
                  maxLength={100}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason('');
              }}>
                取消
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => rejectingRecord && handleApprove(rejectingRecord.id, 'reject')}
              >
                确认拒绝
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 发起借用二次确认 */}
        <AlertDialog open={borrowConfirmOpen} onOpenChange={setBorrowConfirmOpen}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>确认发起借用申请</AlertDialogTitle>
              <AlertDialogDescription>
                请确认以下借用信息，提交后需等待对方确认
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">借入对象</span>
                    <span className="font-medium text-gray-900">{selectedTeam?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">借用积分</span>
                    <span className="font-bold text-blue-600">{points} 积分</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">利息</span>
                    <span className="text-orange-600">{interestRate || 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">逾期日利率</span>
                    <span className="text-red-600">{overdueRate || 0}%/天</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">约定归还日期</span>
                    <span className="font-medium text-gray-900">{repayDate}</span>
                  </div>
                  {parseFloat(points) > 0 && (
                    <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                      <span className="text-gray-600">到期应还</span>
                      <span className="font-bold text-red-600">{preview.total} 积分</span>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">借用申请提交后将无法撤回，请确认信息无误后再提交</p>
              </div>
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmBorrow}
                disabled={submitting}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    提交中...
                  </span>
                ) : '确认提交'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 同意借用二次确认 */}
        <AlertDialog open={approveConfirmOpen} onOpenChange={(open) => { setApproveConfirmOpen(open); if (!open) setApprovingRecord(null); }}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>确认同意借用申请</AlertDialogTitle>
              <AlertDialogDescription>
                请确认以下借用详情，同意后积分将立即转给对方
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              {approvingRecord && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">借入小队</span>
                      <span className="font-medium text-gray-900">{approvingRecord.borrower?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">借用积分</span>
                      <span className="font-bold text-blue-600">{formatPoints(approvingRecord.points)} 积分</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">利息</span>
                      <span className="text-orange-600">{approvingRecord.interest_rate}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">逾期日利率</span>
                      <span className="text-red-600">{approvingRecord.overdue_interest_rate}%/天</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">约定归还日期</span>
                      <span className="font-medium text-gray-900">{formatTime(approvingRecord.repay_date)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-green-200">
                      <span className="text-gray-600">到期应还</span>
                      <span className="font-bold text-red-600">{formatPoints(approvingRecord.total_repay)} 积分</span>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">同意后积分将立即从你的小队扣除并转给对方，请谨慎操作</p>
              </div>
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={approveLoading}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmApprove}
                disabled={approveLoading}
                className="bg-green-500 hover:bg-green-600"
              >
                {approveLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    处理中...
                  </span>
                ) : '确认同意'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 归还积分二次确认 */}
        <AlertDialog open={repayConfirmOpen} onOpenChange={(open) => { setRepayConfirmOpen(open); if (!open) setRepayingRecord(null); }}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>确认归还积分</AlertDialogTitle>
              <AlertDialogDescription>
                请确认以下归还信息，操作后无法撤回
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              {repayingRecord && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">出借小队</span>
                      <span className="font-medium text-gray-900">{repayingRecord.lender?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">借用积分</span>
                      <span className="font-bold text-blue-600">{formatPoints(repayingRecord.points)} 积分</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">利息</span>
                      <span className="text-orange-600">{formatPoints(repayingRecord.interest)} 积分</span>
                    </div>
                    {repayingRecord.is_overdue && repayingRecord.overdue_interest > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">逾期利息</span>
                        <span className="text-red-600">{formatPoints(repayingRecord.overdue_interest)} 积分（逾期{repayingRecord.overdue_days}天）</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                      <span className="text-gray-600">应还总计</span>
                      <span className="font-bold text-red-600">{formatPoints(repayingRecord.actual_repay)} 积分</span>
                    </div>
                    {team && (() => {
                      const actualRepay = Number(repayingRecord.actual_repay) || 0;
                      const teamPoints = Number(team.points) || 0;
                      const isPartialRepay = teamPoints < actualRepay;
                      if (isPartialRepay) {
                        return (
                          <>
                            <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                              <span className="text-gray-600">小队当前积分</span>
                              <span className="font-bold text-orange-600">{formatPoints(teamPoints)} 积分</span>
                            </div>
                            <div className="flex justify-between text-sm pt-1 border-t border-orange-200">
                              <span className="text-orange-600 font-medium">积分不足，将扣除全部积分</span>
                              <span className="font-bold text-orange-600">{formatPoints(teamPoints)} 积分</span>
                            </div>
                          </>
                        );
                      }
                      return (
                        <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                          <span className="text-gray-600">归还后剩余积分</span>
                          <span className="font-bold text-green-600">
                            {formatPoints(teamPoints - actualRepay)} 积分
                          </span>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">
                  {team && Number(team.points) < (Number(repayingRecord?.actual_repay) || 0)
                    ? `积分不足，将自动扣除小队全部 ${formatPoints(team.points)} 积分归还给出借方，剩余欠款将记录在案`
                    : '归还后积分将立即从你的小队扣除并归还给出借方，请确认无误后再操作'}
                </p>
              </div>
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={repayLoading !== null}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmRepay}
                disabled={repayLoading !== null}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {repayLoading !== null ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    处理中...
                  </span>
                ) : (team && Number(team.points) < (Number(repayingRecord?.actual_repay) || 0)
                  ? `确认扣除全部 ${formatPoints(team.points)} 积分`
                  : `确认归还 ${formatPoints(repayingRecord?.actual_repay || 0)} 积分`)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
