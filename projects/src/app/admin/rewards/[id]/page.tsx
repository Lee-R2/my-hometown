'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Save, X, Plus, Trash2, Upload, Loader2,
  Star, Gift, Image
} from 'lucide-react';
import { toast } from 'sonner';

interface RewardCondition {
  id: string;
  type: 'task_complete' | 'skill_learn' | 'points_earn' | 'streak' | 'submission_quality';
  value: string | number;
  description: string;
}

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  conditions: RewardCondition[];
  conditionLogic: 'and' | 'or';
  image_url: string;
  distribution_method: 'auto' | 'manual';
}

const rewardTypeConfig: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  badge: { label: '徽章', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: '🎖️' },
  gem: { label: '宝石', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: '💎' },
  skill_card: { label: '隐藏技能卡', color: 'text-green-600', bgColor: 'bg-green-100', icon: '🔮' },
  tool_card: { label: '隐藏工具卡', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: '🗝️' },
  achievement: { label: '成就', color: 'text-amber-600', bgColor: 'bg-amber-100', icon: '🏆' },
};

const conditionTypeConfig: Record<string, { label: string; placeholder: string }> = {
  task_complete: { label: '完成任务', placeholder: '任务ID或数量' },
  skill_learn: { label: '学习技能', placeholder: '技能ID或数量' },
  points_earn: { label: '获得积分', placeholder: '积分数量' },
  streak: { label: '连续打卡', placeholder: '天数' },
  submission_quality: { label: '产出质量', placeholder: '优秀/良好' },
};

const iconOptions = ['🏆', '💎', '🎖️', '⭐', '🌟', '👑', '🔮', '🎁', '🏅', '📜', '🎯', '💫', '🔥', '🗝️', '🎪', '✨'];

export default function RewardDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rewardId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: '🏆',
    type: 'badge',
    points: 0,
    imageUrl: '',
    conditionLogic: 'and' as 'and' | 'or',
    distributionMethod: 'auto' as 'auto' | 'manual',
  });
  
  const [conditions, setConditions] = useState<RewardCondition[]>([]);

  useEffect(() => {
    fetchReward();
  }, [rewardId]);

  const fetchReward = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rewards/${rewardId}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        router.push('/admin/rewards');
        return;
      }

      const reward = data.reward;
      setForm({
        name: reward.name,
        description: reward.description || '',
        icon: reward.icon || '🏆',
        type: reward.type || 'badge',
        points: reward.points || 0,
        imageUrl: reward.image_url || '',
        conditionLogic: reward.condition_logic || 'and',
        distributionMethod: reward.distribution_method || 'auto',
      });
      setConditions(reward.conditions || []);
    } catch (error) {
      console.error('获取激励详情失败:', error);
      toast.error('获取激励详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCondition = () => {
    const newCondition: RewardCondition = {
      id: `temp-${Date.now()}`,
      type: 'task_complete',
      value: '',
      description: '',
    };
    setConditions([...conditions, newCondition]);
  };

  const handleUpdateCondition = (id: string, field: keyof RewardCondition, value: string | number) => {
    setConditions(conditions.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('仅支持 JPG、PNG、GIF、WebP 格式的图片');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片大小不能超过 5MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setForm({ ...form, imageUrl: data.url });
        toast.success('图片上传成功');
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch (error) {
      toast.error('图片上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请输入激励名称');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/rewards/${rewardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          icon: form.icon,
          type: form.type,
          points: form.points,
          imageUrl: form.imageUrl,
          conditions: conditions,
          conditionLogic: form.conditionLogic,
          distributionMethod: form.distributionMethod,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('激励已更新');
        fetchReward();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch (error) {
      toast.error('更新失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-500" />
              编辑激励
            </h1>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                <span className="hidden sm:inline">保存中...</span>
                <span className="sm:hidden">保存中</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" />
                保存
              </>
            )}
          </Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-4 md:py-6 space-y-6">
        {/* 基本信息 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>激励名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：科学探索者徽章"
                />
              </div>
              <div className="space-y-2">
                <Label>激励类型</Label>
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(rewardTypeConfig).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <span>{config.icon}</span>
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>激励图标</Label>
              <div className="flex flex-wrap gap-2">
                {iconOptions.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm({ ...form, icon })}
                    className={`w-12 h-12 rounded-lg text-2xl flex items-center justify-center transition-all ${
                      form.icon === icon 
                        ? 'bg-amber-500 ring-2 ring-amber-300' 
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>激励描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="描述这个激励的意义..."
                rows={2}
              />
            </div>

            {/* 分发方式选择 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-purple-500" />
                分发方式
              </Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, distributionMethod: 'auto' })}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    form.distributionMethod === 'auto'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-2xl">⚡</span>
                    <span className="font-medium">自动获得</span>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    学生满足条件后自动获得激励
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, distributionMethod: 'manual' })}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    form.distributionMethod === 'manual'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-2xl">👨‍🏫</span>
                    <span className="font-medium">志愿者分配</span>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    由志愿者老师手动分配给学生
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  积分奖励
                </Label>
                <Input
                  type="number"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: parseInt(e.target.value) || 0 })}
                  min={-1000}
                  max={1000}
                />
                <p className="text-xs text-gray-500">获得此激励时额外获得的积分（可为负数表示扣分）</p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-blue-500" />
                  激励图片
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://..."
                    className="flex-1"
                  />
                  <label className={`cursor-pointer ${uploading ? 'pointer-events-none' : ''}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </Button>
                  </label>
                </div>
                {form.imageUrl && (
                  <img src={form.imageUrl} alt="预览" className="w-20 h-20 object-cover rounded-lg mt-2" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 获得条件 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">获得条件</CardTitle>
                <p className="text-sm text-gray-500 mt-1">设置获得此激励需要满足的条件</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleAddCondition}>
                <Plus className="w-4 h-4 mr-1" />
                添加条件
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 条件逻辑选择 */}
            {conditions.length > 1 && (
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">条件关系：</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={form.conditionLogic === 'and' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm({ ...form, conditionLogic: 'and' })}
                    className={form.conditionLogic === 'and' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                  >
                    且（全部满足）
                  </Button>
                  <Button
                    type="button"
                    variant={form.conditionLogic === 'or' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm({ ...form, conditionLogic: 'or' })}
                    className={form.conditionLogic === 'or' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                  >
                    或（满足其一）
                  </Button>
                </div>
              </div>
            )}

            {/* 条件列表 */}
            {conditions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>暂无获得条件</p>
                <p className="text-sm mt-1">点击右上角按钮添加条件</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div 
                    key={condition.id}
                    className="p-4 border rounded-lg bg-gray-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">条件类型</Label>
                            <Select
                              value={condition.type}
                              onValueChange={(value) => handleUpdateCondition(condition.id, 'type', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(conditionTypeConfig).map(([type, config]) => (
                                  <SelectItem key={type} value={type}>
                                    {config.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">条件值</Label>
                            <Input
                              value={String(condition.value)}
                              onChange={(e) => handleUpdateCondition(condition.id, 'value', e.target.value)}
                              placeholder={conditionTypeConfig[condition.type]?.placeholder}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">条件描述</Label>
                          <Input
                            value={condition.description}
                            onChange={(e) => handleUpdateCondition(condition.id, 'description', e.target.value)}
                            placeholder="例如：完成3个探索任务"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500 shrink-0"
                        onClick={() => handleRemoveCondition(condition.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
