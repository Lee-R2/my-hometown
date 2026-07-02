'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const STATUS_LABEL: Record<string, string> = {
  active: '上架中', sold_out: '已售罄', cancelled: '已下架', traded: '已成交',
  pending: '待处理', accepted: '已接受', rejected: '已拒绝', auto_expired: '已过期',
  completed: '已完成',
};

const TRADE_TYPE_LABEL: Record<string, string> = {
  buy: '购买', barter: '兑换',
};

export default function MyMarketPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/market/my');
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCancel = async (listingId: string) => {
    if (!confirm('确定下架此挂单？')) return;
    await fetch(`/api/team/market/listings/${listingId}`, { method: 'DELETE' });
    loadData();
  };

  const handleAcceptOffer = async (listingId: string, offerId: string) => {
    if (!confirm('确定接受此报价？')) return;
    const res = await fetch(`/api/team/market/listings/${listingId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer_id: offerId }),
    });
    const json = await res.json();
    if (json.success) { alert('已接受报价，交易完成'); loadData(); }
    else alert(json.error || '操作失败');
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/team/market')}>← 返回</Button>
        <h1 className="font-bold text-lg">我的市集</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-4xl mx-auto p-4">
        <Tabs defaultValue="listings">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="listings">我的挂单</TabsTrigger>
            <TabsTrigger value="received">收到报价</TabsTrigger>
            <TabsTrigger value="sent">我的报价</TabsTrigger>
            <TabsTrigger value="trades">交易历史</TabsTrigger>
          </TabsList>

          <TabsContent value="listings" className="space-y-2 mt-4">
            {(data?.myListings || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无挂单</p>
            ) : (
              data.myListings.map((l: any) => (
                <Card key={l.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{l.item_name}</span>
                      <Badge variant="outline" className="ml-2">{STATUS_LABEL[l.status]}</Badge>
                      <p className="text-xs text-gray-500">
                        {l.listing_type === 'sell' ? '出售' : l.listing_type === 'buy' ? '求购' : '兑换'} ·
                        剩余 {l.available_quantity}/{l.quantity} ·
                        {l.price !== null ? ` ${l.price}积分` : ' 面议'}
                      </p>
                    </div>
                    {l.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => handleCancel(l.id)}>下架</Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="received" className="space-y-2 mt-4">
            {(data?.receivedOffers || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无收到报价</p>
            ) : (
              data.receivedOffers.map((o: any) => (
                <Card key={o.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{o.listing?.item_name}</span>
                      <p className="text-xs text-gray-500">
                        来自：{o.from_team?.name} ·
                        {o.offer_type === 'price' ? ` 议价 ${o.offer_price}积分` : ` 兑换：${o.offer_item_name || ''}`}
                        · {STATUS_LABEL[o.status]}
                      </p>
                    </div>
                    {o.status === 'pending' && (
                      <Button size="sm" onClick={() => handleAcceptOffer(o.listing_id, o.id)}>接受</Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="sent" className="space-y-2 mt-4">
            {(data?.myOffers || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无发出报价</p>
            ) : (
              data.myOffers.map((o: any) => (
                <Card key={o.id}>
                  <CardContent className="p-3">
                    <span className="font-medium">{o.listing?.item_name}</span>
                    <Badge variant="outline" className="ml-2">{STATUS_LABEL[o.status]}</Badge>
                    <p className="text-xs text-gray-500">
                      {o.offer_type === 'price' ? `议价 ${o.offer_price}积分` : `兑换 ${o.offer_item_name || ''}`}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="trades" className="space-y-2 mt-4">
            {(data?.trades || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无交易记录</p>
            ) : (
              data.trades.map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between">
                      <span className="font-medium">{t.item_name}</span>
                      <Badge>{TRADE_TYPE_LABEL[t.trade_type]}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      买方：{t.buyer?.name} → 卖方：{t.seller?.name} ·
                      数量 {t.quantity} · 支付 {t.points_paid}积分 ·
                      {new Date(t.created_at).toLocaleString('zh-CN')}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
