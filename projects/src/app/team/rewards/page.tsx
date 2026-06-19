'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Trophy, Star, Award, Sparkles, X, Clock, Target, Wrench, FileText } from 'lucide-react';
import { useDataRefresh } from '@/hooks/use-data-refresh';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';

interface Reward {
  id: string;
  earned_at: string;
  task_id: string;
  reward_id: string;
  rewards: {
    id: string;
    name: string;
    description: string;
    icon: string;
    points: number;
    type: string;
    image_url?: string;
    conditions?: { type: string; value: string | number; description: string }[];
    condition_logic?: 'and' | 'or';
  };
}

interface GroupedRewards {
  [key: string]: Reward[];
}

interface TypeLabels {
  [key: string]: string;
}

interface Stats {
  total: number;
  byType: Record<string, number>;
  totalPoints: number;
}

interface LikesStats {
  total: number;
  points: number;
}

interface HeartGemsStats {
  fragments: number;
  gems: number;
  totalSentLikes: number;
  totalTransferredPoints: number;
  fragmentsPerGem: number;
}

const typeConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  badge: { label: '徽章', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  gem: { label: '宝石', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  skill_card: { label: '隐藏技能卡', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  tool_card: { label: '隐藏工具卡', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  achievement: { label: '成就', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  certificate: { label: '证书', color: 'text-pink-600', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
  heart_fragment: { label: '爱心宝石碎片', color: 'text-red-500', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  heart_gem: { label: '爱心宝石', color: 'text-pink-500', bgColor: 'bg-pink-50', borderColor: 'border-pink-200' },
};

// 格式化积分显示（四舍五入保留1位小数）
const formatPoints = (p: number | undefined | null): string => {
  if (p === undefined || p === null) return '0.0';
  return Number(p).toFixed(1);
};

export default function RewardsPage() {
  const router = useRouter();
  const { isMobile, isTablet } = useResponsive();
  const [teamPoints, setTeamPoints] = useState(0);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [groupedRewards, setGroupedRewards] = useState<GroupedRewards>({});
  const [typeLabels, setTypeLabels] = useState<TypeLabels>({});
  const [stats, setStats] = useState<Stats>({ total: 0, byType: {}, totalPoints: 0 });
  const [likes, setLikes] = useState<LikesStats>({ total: 0, points: 0 });
  const [heartGems, setHeartGems] = useState<HeartGemsStats>({ fragments: 0, gems: 0, totalSentLikes: 0, totalTransferredPoints: 0, fragmentsPerGem: 10 });
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  
  // 滚动位置记忆
  useScrollPosition('team-rewards');

  // 刷新数据
  const refreshData = useCallback(async () => {
    if (!teamId) return;
    await fetchRewards(teamId);
  }, [teamId]);

  // 数据同步：监听激励变化
  useDataRefresh({
    keys: ['user_rewards', 'task_submissions'],
    onRefresh: refreshData,
  });

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/');
      return;
    }
    
    const team = JSON.parse(teamData);
    setTeamPoints(team.points || 0);
    setTeamId(team.id);
  }, [router]);

  useEffect(() => {
    if (teamId) {
      fetchRewards(teamId);
    }
  }, [teamId]);

  const fetchRewards = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/team/rewards?teamId=${id}`);
      const data = await res.json();
      
      if (data.rewards) {
        setRewards(data.rewards);
        setGroupedRewards(data.groupedRewards || {});
        setTypeLabels(data.typeLabels || {});
        setStats(data.stats || { total: 0, byType: {}, totalPoints: 0 });
        setLikes(data.likes || { total: 0, points: 0 });
        setHeartGems(data.heartGems || { fragments: 0, gems: 0, totalSentLikes: 0, fragmentsPerGem: 10 });
      }
    } catch (error) {
      console.error('获取激励数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTypeConfig = (type: string) => {
    return typeConfig[type] || { label: type, color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' };
  };

  // 计算积分中来自激励的部分
  const rewardPoints = stats.totalPoints;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 pb-8">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-bold">激励中心</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 积分卡片 */}
        <Card className="border border-violet-200 shadow-sm mb-6 bg-violet-50/50">
          <CardContent className={`${isMobile ? 'pt-4 pb-4' : 'pt-6'}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-violet-600/70 mb-1">我的积分</p>
                <div className="flex items-center gap-2">
                  <div className="w-11 h-11 bg-violet-200 rounded-lg flex items-center justify-center">
                    <Star className="w-5 h-5 text-violet-500" />
                  </div>
                  <span className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold text-violet-500`}>{formatPoints(teamPoints)}</span>
                </div>
              </div>
              <div className="text-right flex-1">
                <p className="text-sm text-violet-600/70 mb-1">已获得激励</p>
                <div className="flex items-center gap-2 justify-end">
                  <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-amber-600`}>{stats.total}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 点赞统计卡片 */}
        {likes.total > 0 && (
          <Card className="border border-orange-200 shadow-sm mb-6 bg-orange-50/50">
            <CardContent className={`${isMobile ? 'pt-4 pb-4' : 'pt-6'}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-orange-600/70 mb-1">获得点赞</p>
                  <div className="flex items-center gap-2">
                    <div className="w-11 h-11 bg-orange-200 rounded-lg flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#f472b6" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </div>
                    <span className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold text-orange-500`}>{likes.total}</span>
                    <span className="text-sm text-orange-600/70">次</span>
                  </div>
                </div>
                <div className="text-right flex-1">
                  <p className="text-sm text-orange-600/70 mb-1">转化积分</p>
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-9 h-9 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Star className="w-5 h-5 text-yellow-600" />
                    </div>
                    <span className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-yellow-500`}>+{likes.points}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-orange-600/70 mt-3 text-center">
                每获得1个点赞可为小队+5积分
              </p>
            </CardContent>
          </Card>
        )}

        {/* 爱心宝石卡片 */}
        <Card className="border border-yellow-200 shadow-sm mb-6 bg-yellow-50/50">
          <CardContent className={`${isMobile ? 'pt-4 pb-4' : 'pt-6'}`}>
            <div className={`flex items-center justify-between mb-4 ${isMobile ? 'gap-2' : 'gap-4'}`}>
              <div className="flex-1">
                <p className="text-sm text-yellow-600/70 mb-1">送出点赞</p>
                <div className="flex items-center gap-2">
                  <div className="w-11 h-11 bg-yellow-200 rounded-lg flex items-center justify-center">
                    <span className="text-xl">💝</span>
                  </div>
                  <span className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold text-yellow-500`}>{heartGems.totalSentLikes}</span>
                  <span className="text-sm text-yellow-600/70">次</span>
                </div>
              </div>
              <div className="text-right flex-1">
                <p className="text-sm text-yellow-600/70 mb-1">爱心宝石</p>
                <div className="flex items-center gap-2 justify-end">
                  <div className="w-11 h-11 bg-amber-200 rounded-lg flex items-center justify-center">
                    <span className="text-xl">💎</span>
                  </div>
                  <span className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold text-amber-500`}>{heartGems.gems}</span>
                  <span className="text-sm text-yellow-600/70">颗</span>
                </div>
              </div>
            </div>
            
            {/* 碎片来源明细 */}
            <div className="bg-white/60 rounded-lg p-3 border border-yellow-200/50 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-yellow-600">👍 点赞兑换碎片</span>
                </div>
                <span className="text-sm text-yellow-700">
                  {heartGems.totalSentLikes}次点赞 → <span className="font-bold text-yellow-500">{(Math.floor(heartGems.totalSentLikes / 3) * 0.1).toFixed(1)}</span> 个碎片
                  {heartGems.totalSentLikes % 3 !== 0 && <span className="text-yellow-400 text-xs ml-1">（余{heartGems.totalSentLikes % 3}次）</span>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-yellow-600">💰 赠送积分兑换碎片</span>
                </div>
                <span className="text-sm text-yellow-700">
                  {heartGems.totalTransferredPoints}积分 → <span className="font-bold text-yellow-500">{(Math.floor(heartGems.totalTransferredPoints / 10) * 0.1).toFixed(1)}</span> 个碎片
                  {heartGems.totalTransferredPoints % 10 !== 0 && <span className="text-yellow-400 text-xs ml-1">（余{heartGems.totalTransferredPoints % 10}积分）</span>}
                </span>
              </div>
            </div>

            {/* 碎片进度条 */}
            <div className="bg-white/60 rounded-lg p-3 border border-yellow-200/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-yellow-600">爱心宝石碎片</span>
                <span className="text-sm font-bold text-yellow-500">{heartGems.fragments}/{heartGems.fragmentsPerGem}</span>
              </div>
              <div className="w-full bg-yellow-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full h-3 transition-all duration-300"
                  style={{ width: `${Math.min((heartGems.fragments / heartGems.fragmentsPerGem) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-yellow-600/70 mt-2 text-center">
                每送出3个点赞兑换0.1个碎片（不足3次不兑换），每赠送10积分兑换0.1个碎片（不足10积分不兑换），集齐{heartGems.fragmentsPerGem}个碎片合成1颗爱心宝石💎
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 激励为空状态 */}
        {stats.total === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-16 text-center">
              <Trophy className="w-20 h-20 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-medium mb-2">暂未获得激励</p>
              <p className="text-sm text-gray-400 mb-6">完成任务后可获得激励奖励</p>
              <Button 
                className="bg-gradient-to-r from-green-500 to-blue-500"
                onClick={() => router.push('/team/dashboard')}
              >
                去完成任务
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* 按类别显示激励卡片 */
          <div className="space-y-4">
            {Object.entries(groupedRewards).map(([type, typeRewards]) => {
              const config = getTypeConfig(type);
              
              return (
                <Card key={type} className={`border-0 shadow-lg ${config.bgColor} border-l-4 ${config.borderColor}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className={`flex items-center gap-2 text-lg ${config.color}`}>
                        {type === 'badge' && <Award className="w-5 h-5" />}
                        {type === 'gem' && <Sparkles className="w-5 h-5" />}
                        {type === 'skill_card' && <Target className="w-5 h-5" />}
                        {type === 'tool_card' && <Wrench className="w-5 h-5" />}
                        {type === 'achievement' && <Trophy className="w-5 h-5" />}
                        {type === 'certificate' && <FileText className="w-5 h-5" />}
                        {config.label}
                      </CardTitle>
                      <Badge variant="outline" className={config.color}>
                        {typeRewards.length} 个
                      </Badge>
                    </div>
                    <CardDescription>
                      已获得的{config.label}奖励
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`grid gap-3 ${
                      isMobile ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                    }`}>
                      {typeRewards.map((reward) => (
                        <div
                          key={reward.id}
                          onClick={() => setSelectedReward(reward)}
                          className="relative group cursor-pointer transition-all hover:scale-105"
                        >
                          <div className={`aspect-square rounded-xl bg-white shadow-sm border border-gray-100 flex flex-col items-center justify-center ${isMobile ? 'p-2' : 'p-3'} hover:shadow-md transition-shadow`}>
                            {/* 图标 */}
                            <span className={`${isMobile ? 'text-3xl' : 'text-4xl'} mb-2`}>
                              {reward.rewards?.icon || '🎁'}
                            </span>
                            
                            {/* 名称 */}
                            <p className="text-sm font-medium text-center line-clamp-1 text-gray-700">
                              {reward.rewards?.name || '未命名激励'}
                            </p>
                            
                            {/* 积分 */}
                            {reward.rewards?.points && reward.rewards.points > 0 && (
                              <div className="flex items-center gap-0.5 mt-1 text-amber-500">
                                <Star className="w-3 h-3" />
                                <span className="text-xs">+{reward.rewards.points}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* 悬浮提示 */}
                          <div className="absolute inset-0 bg-black/70 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                            <p className="text-white text-xs">点击查看详情</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* 获得激励统计 */}
        {stats.total > 0 && (
          <Card className="border-0 shadow-lg mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="w-5 h-5 text-yellow-500" />
                激励统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-4 ${
                isMobile ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
              }`}>
                {Object.entries(stats.byType).map(([type, count]) => {
                  const config = getTypeConfig(type);
                  return (
                    <div 
                      key={type}
                      className={`text-center p-3 rounded-lg ${config.bgColor}`}
                    >
                      <p className={`font-bold ${config.color} ${isMobile ? 'text-xl' : 'text-2xl'}`}>{count}</p>
                      <p className="text-xs text-gray-500 mt-1">{config.label}</p>
                    </div>
                  );
                })}
              </div>
              
              {rewardPoints > 0 && (
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <span className="text-sm text-gray-600">激励带来的积分</span>
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="w-4 h-4" />
                    <span className="font-bold">+{rewardPoints}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* 激励详情弹窗 */}
      {selectedReward && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <span className="text-4xl">{selectedReward.rewards?.icon || '🎁'}</span>
                  <div>
                    <p className="text-lg">{selectedReward.rewards?.name || '未命名激励'}</p>
                    <Badge className={getTypeConfig(selectedReward.rewards?.type || '').bgColor + ' ' + getTypeConfig(selectedReward.rewards?.type || '').color}>
                      {getTypeConfig(selectedReward.rewards?.type || '').label}
                    </Badge>
                  </div>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSelectedReward(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* 激励图片 */}
              {selectedReward.rewards?.image_url && (
                <div className="flex justify-center">
                  <img 
                    src={selectedReward.rewards.image_url} 
                    alt={selectedReward.rewards.name}
                    className="w-32 h-32 object-cover rounded-lg"
                  />
                </div>
              )}
              
              {/* 描述 */}
              <div>
                <p className="text-sm text-gray-500 mb-1">描述</p>
                <p className="text-gray-700">{selectedReward.rewards?.description || '暂无描述'}</p>
              </div>
              
              {/* 获得条件 */}
              {selectedReward.rewards?.conditions && Array.isArray(selectedReward.rewards.conditions) && selectedReward.rewards.conditions.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">获得条件</p>
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-100">
                    <div className="space-y-2">
                      {selectedReward.rewards.conditions.map((condition: { type: string; value: string | number; description: string }, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs text-purple-600 font-medium">{idx + 1}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-700">{condition.description || condition.value}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {condition.type === 'task_complete' && '完成任务'}
                              {condition.type === 'task_excellent' && '获得优秀评价'}
                              {condition.type === 'points_total' && '累计积分'}
                              {condition.type === 'streak_days' && '连续打卡'}
                              {condition.type === 'side_task_complete' && '完成支线任务'}
                              {condition.type === 'skill_learn' && '学习技能'}
                              {!['task_complete', 'task_excellent', 'points_total', 'streak_days', 'side_task_complete', 'skill_learn'].includes(condition.type) && condition.type}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedReward.rewards?.condition_logic === 'or' && (
                      <p className="text-xs text-purple-500 mt-2 pt-2 border-t border-purple-100">
                        💡 满足以上任意一个条件即可获得
                      </p>
                    )}
                    {(!selectedReward.rewards?.condition_logic || selectedReward.rewards?.condition_logic === 'and') && (
                      <p className="text-xs text-purple-500 mt-2 pt-2 border-t border-purple-100">
                        💡 需满足以上所有条件才能获得
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* 获得时间 */}
              <div className="flex items-center gap-2 text-gray-500">
                <Clock className="w-4 h-4" />
                <span className="text-sm">获得于 {formatDate(selectedReward.earned_at)}</span>
              </div>
              
              {/* 积分 */}
              {selectedReward.rewards?.points && selectedReward.rewards.points > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <span className="text-sm text-gray-600">获得积分</span>
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="w-5 h-5" />
                    <span className="font-bold text-lg">+{selectedReward.rewards.points}</span>
                  </div>
                </div>
              )}
              
              <Button 
                className="w-full" 
                onClick={() => setSelectedReward(null)}
              >
                关闭
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
