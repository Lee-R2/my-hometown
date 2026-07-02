'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Listing {
  id: string;
  listing_type: string;
  item_type: string;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  price: number | null;
  quantity: number;
  available_quantity: number;
  scope: string;
  status: string;
  team?: { id: string; name: string; icon: string | null };
}

const LISTING_TYPE_LABEL: Record<string, string> = {
  sell: '出售',
  buy: '求购',
  barter: '兑换',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  tool: '工具',
  skill: '技能',
  work: '作品',
};

export default function MarketPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('theme');
  const [itemType, setItemType] = useState('all');
  const [listingType, setListingType] = useState('all');
  const [keyword, setKeyword] = useState('');

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scope !== 'all') params.set('scope', scope);
      if (itemType !== 'all') params.set('item_type', itemType);
      if (listingType !== 'all') params.set('listing_type', listingType);
      if (keyword) params.set('keyword', keyword);
      const res = await fetch(`/api/team/market/listings?${params}`);
      const json = await res.json();
      if (json.success) setListings(json.data || []);
    } catch (e) {
      console.error('加载失败', e);
    } finally {
      setLoading(false);
    }
  }, [scope, itemType, listingType, keyword]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handlePurchase = async (listing: Listing) => {
    if (!confirm(`确定花费 ${listing.price} 积分购买「${listing.item_name}」？`)) return;
    try {
      const res = await fetch('/api/team/market/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, quantity: 1 }),
      });
      const json = await res.json();
      if (json.success) {
        alert('购买成功！');
        loadListings();
      } else {
        alert(json.error || '购买失败');
      }
    } catch (e) {
      alert('网络错误');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => window.location.href = '/team/dashboard'}>
          ← 返回
        </Button>
        <h1 className="font-bold text-lg">云朵市集</h1>
        <Button variant="ghost" onClick={() => window.location.href = '/team/login'}>
          退出
        </Button>
      </nav>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">同主题</SelectItem>
                  <SelectItem value="school">同学校</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="tool">工具</SelectItem>
                  <SelectItem value="skill">技能</SelectItem>
                  <SelectItem value="work">作品</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="搜索物品名称"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="flex-1 min-w-40"
              />
            </div>
            <Tabs value={listingType} onValueChange={setListingType}>
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="sell">出售</TabsTrigger>
                <TabsTrigger value="buy">求购</TabsTrigger>
                <TabsTrigger value="barter">兑换</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无挂单</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {listings.map((l) => (
              <Card key={l.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={l.listing_type === 'sell' ? 'default' : l.listing_type === 'buy' ? 'secondary' : 'outline'}>
                          {LISTING_TYPE_LABEL[l.listing_type]}
                        </Badge>
                        <Badge variant="outline">{ITEM_TYPE_LABEL[l.item_type]}</Badge>
                      </div>
                      <h3 className="font-semibold">{l.item_name}</h3>
                      {l.item_description && <p className="text-sm text-gray-600 line-clamp-2">{l.item_description}</p>}
                      <p className="text-xs text-gray-500 mt-1">来自：{l.team?.name}</p>
                      <p className="text-xs text-gray-500">剩余：{l.available_quantity}/{l.quantity}</p>
                    </div>
                    {l.item_image_url && (
                      <img src={l.item_image_url} alt="" className="w-16 h-16 object-cover rounded" />
                    )}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="font-bold text-orange-600">
                      {l.price !== null ? `${l.price} 积分` : '面议'}
                    </span>
                    {l.listing_type === 'sell' && (
                      <Button size="sm" onClick={() => handlePurchase(l)}>购买</Button>
                    )}
                    {l.listing_type === 'buy' && (
                      <Button size="sm" variant="outline" onClick={() => router.push(`/team/market/list?respond_to=${l.id}`)}>响应</Button>
                    )}
                    {l.listing_type === 'barter' && (
                      <Button size="sm" variant="outline" onClick={() => router.push(`/team/market/list?respond_to=${l.id}`)}>兑换</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-2 sticky bottom-4">
          <Button className="flex-1" onClick={() => router.push('/team/market/list')}>+ 上架物品</Button>
          <Button className="flex-1" variant="outline" onClick={() => router.push('/team/market/my')}>我的市集</Button>
        </div>
      </div>
    </div>
  );
}
