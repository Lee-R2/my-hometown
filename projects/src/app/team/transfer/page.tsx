'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Gift, Users, ArrowRight, Clock, MessageCircle, Coins, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useResponsive } from '@/hooks/use-responsive';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { safeJSONParse } from '@/lib/utils';

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
  heart_shards?: number;
  heart_gems?: number;
  createdBy?: string;
}

interface TransferRecord {
  id: string;
  points: number;
  message: string | null;
  status: string;
  created_at: string;
  from_team: { id: string; name: string; code: string };
  to_team: { id: string; name: string; code: string };
  type: 'sent' | 'received';
}

// 格式化积分显示（四舍五入保留1位小数）
const formatPoints = (p: number | undefined | null): string => {
  if (p === undefined || p === null) return '0.0';
  return Number(p).toFixed(1);
};

export default function TransferPage() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  
  const [team, setTeam] = useState<{ id: string; name: string; points: number; heart_shards?: number; heart_gems?: number } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [points, setPoints] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [activeTab, setActiveTab] = useState('transfer');
  const [showConfirm, setShowConfirm] = useState(false);

  // 收到的赠送积分数量（用于tab气泡显示）
  const receivedCount = records.filter(r => r.type === 'received').length;

  // 已读转账ID管理
  const getReadTransferIds = useCallback((): Set<string> => {
    if (typeof window === 'undefined' || !team) return new Set();
    try {
      const stored = localStorage.getItem(`readTransferIds_${team.id}`);
      return stored ? new Set(safeJSONParse(stored, [])) : new Set();
    } catch { return new Set(); }
  }, [team]);

  const [readTransferIds, setReadTransferIds] = useState<Set<string>>(new Set());

  // 未读收到的赠送数量
  const unreadReceivedCount = records.filter(r => r.type === 'received' && !readTransferIds.has(r.id)).length;

  // 标记转账为已读
  const markTransferAsRead = useCallback((transferId: string) => {
    if (!team) return;
    setReadTransferIds(prev => {
      const next = new Set(prev);
      next.add(transferId);
      try {
        localStorage.setItem(`readTransferIds_${team.id}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, [team]);

  // 标记所有收到的转账为已读
  const markAllTransfersAsRead = useCallback(() => {
    if (!team) return;
    const allReceivedIds = records.filter(r => r.type === 'received').map(r => r.id);
    setReadTransferIds(prev => {
      const next = new Set(prev);
      allReceivedIds.forEach(id => next.add(id));
      try {
        localStorage.setItem(`readTransferIds_${team.id}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, [team, records]);

  // 切换tab时处理
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    if (value === 'history') {
      // 切换到转账记录tab时，标记所有收到的转账为已读
      markAllTransfersAsRead();
    }
  }, [markAllTransfersAsRead]);

  // 加载当前小队信息和可转账小队列表
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

      // 获取当前小队的最新信息（包括heart_shards和heart_gems）
      const teamRes = await fetch(`/api/team/info?team_id=${parsed.id}`);
      const teamResult = await teamRes.json();
      if (teamResult.success) {
        const fullTeamData = { ...parsed, ...teamResult.data };
        setTeam(fullTeamData);
        // 更新localStorage
        localStorage.setItem('team', JSON.stringify(fullTeamData));
      } else {
        setTeam(parsed);
      }

      // 获取同一志愿者下的其他小队列表
      let url = `/api/team/transfer?exclude_team_id=${parsed.id}`;
      if (parsed.created_by) {
        url += `&volunteer_id=${parsed.created_by}`;
      }
      const res = await fetch(url);
      const result = await res.json();
      if (result.success) {
        setTeams(result.data || []);
      }

      // 获取转账记录
      const recordsRes = await fetch(`/api/team/transfer/history?team_id=${parsed.id}`);
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

  // 初始化已读ID集合
  useEffect(() => {
    setReadTransferIds(getReadTransferIds());
  }, [getReadTransferIds]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 点击确认赠送按钮 -> 弹出二次确认
  const handleConfirmClick = () => {
    if (!team || !selectedTeam) {
      toast.error('请选择要赠送的小队');
      return;
    }

    const pointsNum = parseInt(points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      toast.error('请输入有效的积分数量');
      return;
    }

    if (pointsNum > team.points) {
      toast.error(`积分不足，当前可用积分: ${team.points}`);
      return;
    }

    setShowConfirm(true);
  };

  // 执行积分转账（二次确认后）
  const handleTransfer = async () => {
    setShowConfirm(false);

    if (!team || !selectedTeam) return;

    const pointsNum = parseInt(points);
    if (isNaN(pointsNum) || pointsNum <= 0) return;

    setSubmitting(true);

    try {
      const res = await fetch('/api/team/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_team_id: team.id,
          to_team_id: selectedTeam.id,
          points: pointsNum,
          message: message.trim() || null
        })
      });

      const result = await res.json();

      if (result.success) {
        // 构建成功提示
        let successMsg = `成功向「${selectedTeam.name}」赠送 ${pointsNum} 积分！`;
        
        // 如果获得了碎片或宝石，显示奖励信息
        if (result.data.earned_shards > 0) {
          successMsg += `\n获得 ${result.data.earned_shards} 个爱心碎片`;
          if (result.data.new_gems_earned > 0) {
            successMsg += `，并合成了 ${result.data.new_gems_earned} 个爱心宝石！`;
          }
        }
        
        toast.success(successMsg);
        
        // 更新本地积分和碎片/宝石
        setTeam(prev => prev ? { 
          ...prev, 
          points: result.data.from_team.points,
          heart_shards: result.data.from_team.heart_shards,
          heart_gems: result.data.from_team.heart_gems
        } : null);
        
        // 清空表单
        setSelectedTeam(null);
        setPoints('');
        setMessage('');
        // 刷新记录
        loadData();
      } else {
        toast.error(result.error || '转账失败');
      }
    } catch (error) {
      console.error('转账失败:', error);
      toast.error('转账失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-300 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-orange-100">
        <div className="max-w-4xl mx-auto px-3 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/team/dashboard')}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold text-gray-900 truncate">赠送积分</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-4 space-y-4">
        {/* 当前积分 */}
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-500">当前积分</p>
                <p className="text-2xl font-bold text-orange-600">{formatPoints(team?.points)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 标签页切换 */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transfer" className="flex items-center gap-2">
              <Gift className="w-4 h-4" />
              赠送积分
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 relative">
              <Clock className="w-4 h-4" />
              转账记录
              {unreadReceivedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {unreadReceivedCount > 9 ? '9+' : unreadReceivedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* 赠送积分 */}
          <TabsContent value="transfer" className="mt-4 space-y-4">
            {/* 步骤1：选择小队 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-sm flex items-center justify-center">1</span>
                  选择赠送对象
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-3">以下显示与你在同一志愿者指导下的其他小队：</p>
                {teams.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">暂无可赠送的小队</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {teams.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTeam(t)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedTeam?.id === t.id
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-orange-200 hover:bg-orange-50/50'
                        }`}
                      >
                        <p className="font-medium text-gray-900 truncate">{t.name}</p>
                        <p className="text-xs text-gray-500">编码: {t.code}</p>
                        <p className="text-xs text-orange-600 mt-1">积分: {t.points}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 步骤2：输入积分数量 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-sm flex items-center justify-center">2</span>
                  输入赠送积分
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    max={team?.points}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    placeholder="请输入积分数量"
                    className="pr-16 text-lg h-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                    / {team?.points}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[10, 50, 100, 200].map(p => (
                    <Badge
                      key={p}
                      variant={points === String(p) ? 'default' : 'outline'}
                      className={`cursor-pointer px-3 py-1 ${
                        points === String(p) ? 'bg-orange-500' : 'hover:bg-orange-50'
                      }`}
                      onClick={() => setPoints(String(p))}
                    >
                      {p}
                    </Badge>
                  ))}
                  <Badge
                    variant={points === String(team?.points) ? 'default' : 'outline'}
                    className={`cursor-pointer px-3 py-1 ${
                      points === String(team?.points) ? 'bg-orange-500' : 'hover:bg-orange-50'
                    }`}
                    onClick={() => setPoints(String(team?.points))}
                  >
                    全部
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* 步骤3：填写留言 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-sm flex items-center justify-center">3</span>
                  留言（选填）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="给小伙伴说点什么..."
                  maxLength={100}
                  className="h-12"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{message.length}/100</p>
              </CardContent>
            </Card>

            {/* 确认赠送按钮 */}
            <Button
              onClick={handleConfirmClick}
              disabled={!selectedTeam || !points || parseInt(points) <= 0 || parseInt(points) > (team?.points || 0) || submitting}
              className="w-full h-12 text-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  赠送中...
                </>
              ) : (
                <>
                  <Gift className="w-5 h-5 mr-2" />
                  确认赠送 {points || 0} 积分
                </>
              )}
            </Button>

            {/* 提示信息 */}
            <p className="text-sm text-gray-500 text-center">
              积分赠送后将无法撤回，请确认后再操作
            </p>
          </TabsContent>

          {/* 转账记录 */}
          <TabsContent value="history" className="mt-4">
            {records.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">暂无转账记录</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {records.map(record => {
                  const isUnreadReceived = record.type === 'received' && !readTransferIds.has(record.id);
                  return (
                  <Card key={record.id} className={`${record.type === 'sent' ? 'border-orange-200' : 'border-green-200'} ${isUnreadReceived ? 'ring-2 ring-red-200 bg-green-50/50' : ''}`}
                    onClick={() => {
                      if (isUnreadReceived) markTransferAsRead(record.id);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* 未读红点 */}
                        {isUnreadReceived && (
                          <span className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 mt-3 animate-pulse" />
                        )}
                        {/* 图标 */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          record.type === 'sent' 
                            ? 'bg-orange-100' 
                            : 'bg-green-100'
                        }`}>
                          {record.type === 'sent' ? (
                            <ArrowRight className="w-5 h-5 text-orange-600" />
                          ) : (
                            <ArrowRight className="w-5 h-5 text-green-600 rotate-180" />
                          )}
                        </div>
                        
                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 truncate">
                              {record.type === 'sent' 
                                ? `→ 赠送给「${record.to_team.name}」`
                                : `← 收到来自「${record.from_team.name}」`
                              }
                            </p>
                            <span className={`font-bold shrink-0 ${
                              record.type === 'sent' ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {record.type === 'sent' ? '-' : '+'}{formatPoints(record.points)}
                            </span>
                          </div>
                          
                          {record.message && (
                            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" />
                              {record.message}
                            </p>
                          )}
                          
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(record.created_at)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 二次确认对话框 */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                确认赠送积分
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-2">
                  <p>你确定要将 <span className="font-bold text-orange-600">{points || 0} 积分</span> 赠送给 <span className="font-bold">「{selectedTeam?.name}」</span> 吗？</p>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                    <p>积分赠送后将无法撤回，请谨慎操作。</p>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleTransfer}
                disabled={submitting}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    赠送中...
                  </>
                ) : (
                  '确认赠送'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
