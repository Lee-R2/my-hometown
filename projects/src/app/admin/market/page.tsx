'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Trade {
  id: string;
  created_at: string;
  trade_type: string;
  item_type: string;
  item_name: string;
  quantity: number;
  points_paid: number;
  scope: string;
  status: string;
  buyer?: { name: string };
  seller?: { name: string };
}

const TRADE_TYPE_LABEL: Record<string, string> = {
  buy: '购买', barter: '兑换',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  tool: '工具', skill: '技能', work: '作品',
};

export default function AdminMarketPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState({ totalTrades: 0, totalPointsFlow: 0 });
  const [loading, setLoading] = useState(true);
  const [tradeType, setTradeType] = useState('all');
  const [itemType, setItemType] = useState('all');
  const [scope, setScope] = useState('all');
  const [teamName, setTeamName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tradeType !== 'all') params.set('trade_type', tradeType);
      if (itemType !== 'all') params.set('item_type', itemType);
      if (scope !== 'all') params.set('scope', scope);
      if (teamName) params.set('team_name', teamName);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      const res = await fetch(`/api/admin/market/trades?${params}`);
      const json = await res.json();
      if (json.success) {
        setTrades(json.data || []);
        setStats(json.stats || { totalTrades: 0, totalPointsFlow: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [tradeType, itemType, scope, teamName, startDate, endDate]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    window.location.href = `/api/admin/market/export?${params}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">云朵市集交易数据</h1>
          <Button onClick={handleExport}>导出 CSV</Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">总交易数</p>
              <p className="text-2xl font-bold">{stats.totalTrades}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">总积分流转</p>
              <p className="text-2xl font-bold text-orange-600">{stats.totalPointsFlow}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={tradeType} onValueChange={setTradeType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="buy">购买</SelectItem>
                  <SelectItem value="barter">兑换</SelectItem>
                </SelectContent>
              </Select>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部物品</SelectItem>
                  <SelectItem value="tool">工具</SelectItem>
                  <SelectItem value="skill">技能</SelectItem>
                  <SelectItem value="work">作品</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部范围</SelectItem>
                  <SelectItem value="theme">同主题</SelectItem>
                  <SelectItem value="school">同学校</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="小队名称"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="flex-1 min-w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              <span>至</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : trades.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无交易记录</div>
        ) : (
          <div className="space-y-2">
            {trades.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-3 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge>{TRADE_TYPE_LABEL[t.trade_type]}</Badge>
                      <Badge variant="outline">{ITEM_TYPE_LABEL[t.item_type]}</Badge>
                      <span className="font-medium">{t.item_name}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      买方：{t.buyer?.name} → 卖方：{t.seller?.name} ·
                      数量 {t.quantity} · 支付 {t.points_paid}积分 ·
                      {t.scope === 'theme' ? ' 同主题' : ' 同学校'} ·
                      {new Date(t.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
