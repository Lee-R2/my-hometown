'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { 
  ArrowLeft, Plus, Edit, Trash2, Gift, 
  Search, Star, Crown, Sparkles, X, Check
} from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  role: string;
}

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  requirement: string;
  conditions: RewardCondition[];
  conditionLogic: 'and' | 'or';
  image_url: string;
  created_at: string;
  updated_at: string;
  distribution_method: 'auto' | 'manual';
}

interface RewardCondition {
  id: string;
  type: 'task_complete' | 'skill_learn' | 'points_earn' | 'streak' | 'submission_quality';
  value: string | number;
  description: string;
}

const rewardTypeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  badge: { label: '徽章', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  gem: { label: '宝石', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  skill_card: { label: '隐藏技能卡', color: 'text-green-600', bgColor: 'bg-green-100' },
  tool_card: { label: '隐藏工具卡', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  achievement: { label: '成就', color: 'text-amber-600', bgColor: 'bg-amber-100' },
};

// 条件类型配置
const conditionTypeConfig: Record<string, { label: string; description: string }> = {
  task_complete: { label: '任务完成', description: '完成指定数量的任务' },
  skill_learn: { label: '技能学习', description: '学习指定数量的技能' },
  points_earn: { label: '积分获得', description: '累计获得指定积分' },
  streak: { label: '连续打卡', description: '连续打卡指定天数' },
  submission_quality: { label: '产出质量', description: '获得指定数量的优秀评价' },
};

const iconOptions = ['🏆', '💎', '🎖️', '⭐', '🌟', '👑', '🔮', '🎁', '🏅', '📜', '🎯', '💫', '🔥', '💎', '🗝️', '🎪'];

export default function RewardsManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  
  // 滚动位置记忆
  useScrollPosition('admin-rewards');

  // 详情面板状态
  const [showDetail, setShowDetail] = useState(false);
  const [detailReward, setDetailReward] = useState<Reward | null>(null);

  // 判断是否为只读模式（志愿者或助学老师）
  const isReadOnly = user?.role === 'volunteer' || user?.role === 'teacher';

  useEffect(() => {
    // 获取用户信息
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/admin/login');
      return;
    }
    const userObj = JSON.parse(userStr);
    setUser(userObj);

    fetchRewards();
  }, [router]);

  const fetchRewards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rewards');
      const data = await res.json();
      setRewards(data.rewards || []);
    } catch (error) {
      console.error('获取激励列表失败:', error);
      toast.error('获取激励列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开详情面板
  const openDetailPanel = (reward: Reward) => {
    setDetailReward(reward);
    setShowDetail(true);
  };

  const handleDeleteReward = async (rewardId: string) => {
    if (isReadOnly) return;
    if (!confirm('确定要删除这个激励吗？')) return;

    try {
      const res = await fetch(`/api/rewards/${rewardId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('激励已删除');
        fetchRewards();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const filteredRewards = rewards.filter(reward => {
    const matchesSearch = reward.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (reward.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = selectedType === 'all' || reward.type === selectedType;
    return matchesSearch && matchesType;
  });

  // 按类型分组
  const groupedRewards = filteredRewards.reduce((acc, reward) => {
    const type = reward.type || 'badge';
    if (!acc[type]) acc[type] = [];
    acc[type].push(reward);
    return acc;
  }, {} as Record<string, Reward[]>);

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
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-500" />
              激励配置
            </h1>
            {isReadOnly && (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                只读模式
              </Badge>
            )}
          </div>
          {!isReadOnly && (
            <Button onClick={() => router.push('/admin/rewards/create')}>
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">创建激励</span>
              <span className="sm:hidden">创建</span>
            </Button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 筛选栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="py-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索激励名称或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedType === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedType('all')}
                  className={selectedType === 'all' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                >
                  全部
                </Button>
                {Object.entries(rewardTypeConfig).map(([type, config]) => (
                  <Button
                    key={type}
                    variant={selectedType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedType(type)}
                    className={selectedType === type ? 'bg-amber-500 hover:bg-amber-600' : ''}
                  >
                    {config.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 激励列表 */}
        {selectedType === 'all' ? (
          // 分组显示
          Object.entries(groupedRewards).map(([type, typeRewards]) => (
            <div key={type} className="mb-6">
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Badge className={`${rewardTypeConfig[type]?.bgColor || 'bg-gray-100'} ${rewardTypeConfig[type]?.color || 'text-gray-600'}`}>
                  {rewardTypeConfig[type]?.label || type}
                </Badge>
                <span className="text-gray-500 text-sm">({typeRewards.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {typeRewards.map(reward => (
                  <RewardCard 
                    key={reward.id} 
                    reward={reward} 
                    isReadOnly={isReadOnly}
                    onClick={() => openDetailPanel(reward)}
                    onEdit={() => router.push(`/admin/rewards/${reward.id}`)} 
                    onDelete={() => handleDeleteReward(reward.id)} 
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          // 单类型显示
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRewards.map(reward => (
              <RewardCard 
                key={reward.id} 
                reward={reward} 
                isReadOnly={isReadOnly}
                onClick={() => openDetailPanel(reward)}
                onEdit={() => router.push(`/admin/rewards/${reward.id}`)} 
                onDelete={() => handleDeleteReward(reward.id)} 
              />
            ))}
          </div>
        )}

        {filteredRewards.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-gray-500">
              <Gift className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>暂无激励</p>
              {!isReadOnly && (
                <p className="text-sm mt-1">点击右上角按钮创建激励</p>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* 激励详情面板 */}
      {showDetail && detailReward && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">{detailReward.icon || '🏆'}</span>
                  激励详情
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowDetail(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              {/* 基本信息 */}
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl flex items-center justify-center text-4xl shrink-0">
                  {detailReward.icon || '🏆'}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{detailReward.name}</h3>
                  <Badge className={`${rewardTypeConfig[detailReward.type]?.bgColor || 'bg-gray-100'} ${rewardTypeConfig[detailReward.type]?.color || 'text-gray-600'} mt-1`}>
                    {rewardTypeConfig[detailReward.type]?.label || detailReward.type}
                  </Badge>
                </div>
              </div>

              {/* 激励描述 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">激励描述</Label>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700">
                    {detailReward.description || '暂无描述'}
                  </p>
                </div>
              </div>

              {/* 激励积分 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">激励积分</Label>
                <div className={`rounded-lg p-3 border flex items-center gap-2 ${
                  (detailReward.points || 0) >= 0 
                    ? 'bg-amber-50 border-amber-100' 
                    : 'bg-red-50 border-red-100'
                }`}>
                  <Star className={`w-5 h-5 ${(detailReward.points || 0) >= 0 ? 'text-amber-500' : 'text-red-500'}`} />
                  <span className={`text-lg font-bold ${(detailReward.points || 0) >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                    {(detailReward.points || 0) >= 0 ? '+' : ''}{detailReward.points || 0}
                  </span>
                  <span className="text-sm text-gray-500">积分</span>
                </div>
              </div>

              {/* 分发方式 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block">分发方式</Label>
                <div className={`rounded-lg p-3 border flex items-center gap-3 ${
                  detailReward.distribution_method === 'auto' 
                    ? 'bg-purple-50 border-purple-100' 
                    : 'bg-blue-50 border-blue-100'
                }`}>
                  <span className="text-2xl">
                    {detailReward.distribution_method === 'auto' ? '⚡' : '👨‍🏫'}
                  </span>
                  <div>
                    <p className="font-medium">
                      {detailReward.distribution_method === 'auto' ? '自动获得' : '志愿者分配'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {detailReward.distribution_method === 'auto' 
                        ? '学生满足条件后自动获得激励' 
                        : '由志愿者老师手动分配给学生'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 获得激励的条件 */}
              <div>
                <Label className="text-sm text-gray-500 mb-2 block flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  获得条件
                </Label>
                {detailReward.conditions && detailReward.conditions.length > 0 ? (
                  <div className="space-y-3">
                    {/* 条件逻辑说明 */}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>需满足</span>
                      <Badge variant="outline" className="text-purple-600 border-purple-200">
                        {detailReward.conditionLogic === 'and' ? '全部条件（且）' : '任一条件（或）'}
                      </Badge>
                    </div>
                    
                    {/* 条件列表 */}
                    <div className="space-y-2">
                      {detailReward.conditions.map((condition, index) => (
                        <div 
                          key={condition.id || index}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-xs font-medium text-purple-600 shrink-0 mt-0.5">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">
                                {conditionTypeConfig[condition.type]?.label || condition.type}
                              </p>
                              {condition.value && (
                                <Badge variant="secondary" className="text-xs">
                                  {condition.value}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {condition.description || conditionTypeConfig[condition.type]?.description || '无描述'}
                            </p>
                          </div>
                          <Check className="w-4 h-4 text-green-500 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂无获得条件</p>
                  </div>
                )}
              </div>

              {/* 激励图片 */}
              {detailReward.image_url && (
                <div>
                  <Label className="text-sm text-gray-500 mb-2 block">激励图片</Label>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <img 
                      src={detailReward.image_url} 
                      alt={detailReward.name}
                      className="w-48 h-48 object-cover rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* 关闭按钮 */}
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowDetail(false)}
                >
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// 激励卡片组件
function RewardCard({ 
  reward, 
  isReadOnly,
  onClick, 
  onEdit, 
  onDelete 
}: { 
  reward: Reward; 
  isReadOnly: boolean;
  onClick: () => void; 
  onEdit: () => void; 
  onDelete: () => void 
}) {
  const config = rewardTypeConfig[reward.type] || rewardTypeConfig.badge;
  
  return (
    <Card 
      className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl flex items-center justify-center text-3xl shrink-0">
            {reward.icon || '🏆'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{reward.name}</h3>
            </div>
            <Badge className={`${config.bgColor} ${config.color} text-xs mt-1`}>
              {config.label}
            </Badge>
            {reward.description && (
              <p className="text-sm text-gray-500 mt-2 line-clamp-2">{reward.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {reward.points !== 0 && (
                <div className={`flex items-center gap-1 text-xs ${reward.points > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                  <Star className="w-3 h-3" />
                  {reward.points > 0 ? '+' : ''}{reward.points} 积分
                </div>
              )}
              {reward.conditions && reward.conditions.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Sparkles className="w-3 h-3" />
                  {reward.conditions.length} 个条件
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-400">
                {reward.distribution_method === 'auto' ? '⚡' : '👨‍🏫'}
                {reward.distribution_method === 'auto' ? '自动' : '手动'}
              </div>
            </div>
          </div>
        </div>
        {/* 编辑/删除按钮 - 仅管理员可见 */}
        {!isReadOnly && (
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="text-red-600" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
