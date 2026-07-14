'use client';

// 该页面使用 useSearchParams()，禁用静态生成避免构建报错。
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UserReward {
  id: string;
  reward_id: string;
  reward?: { id: string; name: string; type: string; icon: string | null; image_url: string | null };
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  tool: '工具', skill: '技能', work: '作品',
};

export default function ListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const respondTo = searchParams.get('respond_to');

  const [listingType, setListingType] = useState<'sell' | 'buy' | 'barter'>('sell');
  const [itemType, setItemType] = useState<'tool' | 'skill' | 'work'>('tool');
  const [userRewards, setUserRewards] = useState<UserReward[]>([]);
  const [selectedReward, setSelectedReward] = useState<string>('');
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<number>(0);
  const [barterItemType, setBarterItemType] = useState<'tool' | 'skill' | 'work'>('tool');
  const [barterItemName, setBarterItemName] = useState('');
  const [scope, setScope] = useState<'theme' | 'school'>('theme');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/team/rewards').then(r => r.json()).then(json => {
      if (json.success) setUserRewards(json.data || []);
    }).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: any = {
        listing_type: listingType,
        item_type: itemType,
        item_name: itemName,
        item_description: itemDescription || undefined,
        item_image_url: itemImageUrl || undefined,
        quantity,
        scope,
      };

      if (listingType === 'sell' || listingType === 'barter') {
        body.item_ref = selectedReward || undefined;
      }
      if (listingType === 'sell' || listingType === 'buy') {
        body.price = price;
      }
      if (listingType === 'barter') {
        body.barter_for = { itemType: barterItemType, itemName: barterItemName || undefined };
      }

      const res = await fetch('/api/team/market/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        alert('上架成功！');
        router.push('/team/market');
      } else {
        alert(json.error || '上架失败');
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRewards = userRewards.filter(r => {
    const t = r.reward?.type;
    if (itemType === 'tool') return ['badge', 'gem', 'tool_card', 'hidden_tool'].includes(t || '');
    return ['skill_card', 'hidden_skill'].includes(t || '');
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/team/market')}>← 返回</Button>
        <h1 className="font-bold text-lg">{respondTo ? '响应挂单' : '上架物品'}</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>1. 选择挂单类型</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['sell', 'buy', 'barter'] as const).map(t => (
                <Button
                  key={t}
                  variant={listingType === t ? 'default' : 'outline'}
                  onClick={() => setListingType(t)}
                >
                  {t === 'sell' ? '出售' : t === 'buy' ? '求购' : '兑换'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>2. 选择物品类型</Label>
            <Select value={itemType} onValueChange={(v) => setItemType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tool">工具（徽章/宝石/工具卡）</SelectItem>
                <SelectItem value="skill">技能（技能卡）</SelectItem>
                <SelectItem value="work">作品</SelectItem>
              </SelectContent>
            </Select>

            {(listingType === 'sell' || listingType === 'barter') && itemType !== 'work' && (
              <div className="space-y-2">
                <Label>从已获得中选择</Label>
                {filteredRewards.length === 0 ? (
                  <p className="text-sm text-gray-500">暂无可上架的{ITEM_TYPE_LABEL[itemType]}</p>
                ) : (
                  filteredRewards.map(r => (
                    <div
                      key={r.id}
                      className={`p-2 border rounded cursor-pointer ${selectedReward === r.id ? 'border-blue-500 bg-blue-50' : ''}`}
                      onClick={() => { setSelectedReward(r.id); setItemName(r.reward?.name || ''); }}
                    >
                      <span className="font-medium">{r.reward?.name}</span>
                      <Badge variant="outline" className="ml-2">{r.reward?.type}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}

            {itemType === 'work' && (
              <div className="space-y-2">
                <Label>物品名称</Label>
                <Input
                  placeholder="输入物品名称"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
            )}

            {listingType === 'buy' && (
              <div className="space-y-2">
                <Label>期望购买的物品名称</Label>
                <Input
                  placeholder="如：隐藏工具卡·星辰罗盘"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>3. 填写详情</Label>

            {(listingType === 'sell' || listingType === 'buy') && (
              <div className="space-y-1">
                <Label>积分价格</Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  min={0}
                />
              </div>
            )}

            {(listingType === 'sell' || listingType === 'barter') && (
              <div className="space-y-1">
                <Label>上架数量</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  min={1}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>物品描述（作品可改写呈现方式）</Label>
              <Textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                rows={3}
                placeholder="描述物品特点、使用场景等"
              />
            </div>

            <div className="space-y-1">
              <Label>展示图片 URL（可选）</Label>
              <Input
                value={itemImageUrl}
                onChange={(e) => setItemImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {listingType === 'barter' && (
              <div className="space-y-2 border-t pt-3">
                <Label>期望交换的物品</Label>
                <Select value={barterItemType} onValueChange={(v) => setBarterItemType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tool">工具</SelectItem>
                    <SelectItem value="skill">技能</SelectItem>
                    <SelectItem value="work">作品</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="期望物品名称（可选，留空表示不限）"
                  value={barterItemName}
                  onChange={(e) => setBarterItemName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>交易范围</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">同任务主题</SelectItem>
                  <SelectItem value="school">同学校</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleSubmit} disabled={submitting || !itemName}>
          {submitting ? '提交中...' : '确认上架'}
        </Button>
      </div>
    </div>
  );
}
