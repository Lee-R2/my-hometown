'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Users, Star, Trophy,
  User, Award, Target, Heart, ThumbsUp, Gem,
  Sparkles, Wrench, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { getRewardTypeConfig, REWARD_TYPE_CONFIG } from '@/lib/constants';
import type { LikesStats, HeartGemsStats, RewardStats, UserReward, GroupedRewards } from '@/lib/types';

// 本地类型别名，使用共享类型
type Reward = UserReward;
type Stats = RewardStats;

interface TeamMember {
  id: string;
  team_id: string;
  name: string;
  role: string;
  student_id?: string;
  created_at: string;
}

interface Team {
  id: string;
  code: string;
  name: string;
  slogan?: string;
  password: string;
  points: number;
  status: string;
  school_id?: string;
  current_theme_id?: string;
  current_task_id?: string;
  created_at: string;
  updated_at?: string;
  members: TeamMember[];
  // 激励数据
  rewards: Reward[];
  groupedRewards: GroupedRewards;
  stats: Stats;
  likesStats: LikesStats;
  heartGems: HeartGemsStats;
}

export default function TeamDetailPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);

  useEffect(() => {
    fetchTeamDetail();
  }, [teamId]);

  const fetchTeamDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        router.push('/admin/teams');
        return;
      }

      setTeam(data.team);
    } catch (error) {
      console.error('获取小队详情失败:', error);
      toast.error('获取小队详情失败');
    } finally {
      setLoading(false);
    }
  };

  const getRoleName = (role: string) => {
    const roleMap: Record<string, string> = {
      'leader': '队长',
      'member': '队员',
      'guide': '指引者',
      'photographer': '光影法师',
      'recorder': '秘语学者',
    };
    return roleMap[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colorMap: Record<string, string> = {
      'leader': 'bg-yellow-100 text-yellow-700',
      'guide': 'bg-blue-100 text-blue-700',
      'photographer': 'bg-purple-100 text-purple-700',
      'recorder': 'bg-green-100 text-green-700',
      'member': 'bg-gray-100 text-gray-700',
    };
    return colorMap[role] || 'bg-gray-100 text-gray-700';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">小队不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/teams')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">小队详情</h1>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6 space-y-6">
        {/* 基本信息 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              基本信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500">小队编码</p>
                <p className="text-lg font-semibold">{team.code}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">小队名称</p>
                <p className="text-lg font-semibold">{team.name || '未命名小队'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">小队口号</p>
                <p className="text-base text-purple-600 font-medium">{team.slogan || '未设置口号'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">登录密码</p>
                <p className="text-lg font-mono">{team.password}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">状态</p>
                <Badge variant={team.status === 'active' ? 'default' : 'secondary'}>
                  {team.status === 'active' ? '进行中' : '已完成'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">创建时间</p>
                <p className="text-base">{new Date(team.created_at).toLocaleString('zh-CN')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">积分</p>
                <div className="flex items-center gap-1 text-yellow-600">
                  <Star className="w-4 h-4" />
                  <span className="text-lg font-semibold">{team.points || 0}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 激励数据统计 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-500" />
              激励数据
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {/* 点赞统计 */}
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <ThumbsUp className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-blue-700">点赞互动</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">获得点赞</span>
                    <span className="font-semibold text-blue-600">{team.likesStats?.received || 0} 次</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">送出点赞</span>
                    <span className="font-semibold text-blue-600">{team.likesStats?.given || 0} 次</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-blue-100">
                    <span className="text-sm text-gray-600">点赞转化积分</span>
                    <span className="font-semibold text-yellow-600">+{team.likesStats?.pointsFromLikes || 0} 积分</span>
                  </div>
                </div>
              </div>

              {/* 爱心宝石 */}
              <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-100">
                <div className="flex items-center gap-2 mb-3">
                  <Gem className="w-5 h-5 text-pink-500" />
                  <span className="font-medium text-pink-700">爱心宝石</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">宝石碎片</span>
                    <span className="font-semibold text-pink-600">{team.heartGems?.fragments || 0} 个</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">爱心宝石</span>
                    <span className="font-semibold text-pink-600">{team.heartGems?.gems || 0} 颗</span>
                  </div>
                  <div className="pt-2 border-t border-pink-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Heart className="w-3 h-3" />
                      <span>集齐 10 个碎片可合成 1 颗宝石</span>
                    </div>
                    {/* 进度条 */}
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((team.heartGems?.fragments || 0) % 10 * 10, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 积分来源 */}
              <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border border-yellow-100">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-5 h-5 text-yellow-500" />
                  <span className="font-medium text-yellow-700">积分明细</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">当前总积分</span>
                    <span className="font-bold text-xl text-yellow-600">{team.points || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">送出点赞积分</span>
                    <span className="font-semibold text-yellow-600">+{team.likesStats?.given || 0} 积分</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">获得点赞积分</span>
                    <span className="font-semibold text-yellow-600">+{team.likesStats?.pointsFromLikes || 0} 积分</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 小队成员 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-5 h-5 text-purple-500" />
              小队成员 ({team.members?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!team.members || team.members.length === 0) ? (
              <div className="text-center py-8 text-gray-500">
                <User className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>暂无成员</p>
                <p className="text-sm mt-1">小队登录后可添加成员</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {team.members.map((member) => (
                  <div 
                    key={member.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                      {member.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.name || '未设置姓名'}</p>
                        <Badge className={`text-xs ${getRoleColor(member.role)}`}>
                          {getRoleName(member.role)}
                        </Badge>
                      </div>
                      {member.student_id && (
                        <p className="text-xs text-gray-500">学号: {member.student_id}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 激励奖励（与激励中心同步） */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              获得奖励
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 爱心和宝石统计 */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {/* 点赞互动 */}
              <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-pink-500" />
                    <span className="font-medium text-pink-700">爱心点赞</span>
                  </div>
                  <span className="text-2xl">💝</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-2 bg-white/50 rounded-lg">
                    <p className="text-2xl font-bold text-pink-600">{team.likesStats?.given || 0}</p>
                    <p className="text-xs text-gray-500">送出爱心</p>
                  </div>
                  <div className="text-center p-2 bg-white/50 rounded-lg">
                    <p className="text-2xl font-bold text-rose-600">{team.likesStats?.received || 0}</p>
                    <p className="text-xs text-gray-500">获得爱心</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center">
                  每送出1个爱心获得1积分，每获得1个爱心获得5积分
                </p>
              </div>

              {/* 爱心宝石 */}
              <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Gem className="w-5 h-5 text-purple-500" />
                    <span className="font-medium text-purple-700">爱心宝石</span>
                  </div>
                  <span className="text-2xl">💎</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-2 bg-white/50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{team.heartGems?.fragments || 0}</p>
                    <p className="text-xs text-gray-500">宝石碎片</p>
                  </div>
                  <div className="text-center p-2 bg-white/50 rounded-lg">
                    <p className="text-2xl font-bold text-pink-600">{team.heartGems?.gems || 0}</p>
                    <p className="text-xs text-gray-500">爱心宝石</p>
                  </div>
                </div>
                {/* 进度条 */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">碎片合成进度</span>
                    <span className="text-xs text-purple-600">{(team.heartGems?.fragments || 0) % 10}/10</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-400 to-pink-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((team.heartGems?.fragments || 0) % 10 * 10, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 奖励列表 */}
            {team.stats?.total === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Trophy className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>暂无激励奖励</p>
                <p className="text-sm mt-1">完成任务后可获得激励奖励</p>
              </div>
            ) : (
              <>
                {/* 按类别显示激励卡片 */}
                <div className="space-y-4">
                  {Object.entries(team.groupedRewards || {}).map(([type, typeRewards]) => {
                    const config = getRewardTypeConfig(type);
                    
                    return (
                      <div key={type} className={`rounded-xl ${config.bgColor} border-l-4 ${config.borderColor} p-4`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {type === 'badge' && <Award className={`w-5 h-5 ${config.color}`} />}
                            {type === 'gem' && <Sparkles className={`w-5 h-5 ${config.color}`} />}
                            {type === 'skill_card' && <Target className={`w-5 h-5 ${config.color}`} />}
                            {type === 'tool_card' && <Wrench className={`w-5 h-5 ${config.color}`} />}
                            {type === 'achievement' && <Trophy className={`w-5 h-5 ${config.color}`} />}
                            {type === 'certificate' && <FileText className={`w-5 h-5 ${config.color}`} />}
                            <span className={`font-medium ${config.color}`}>{config.label}</span>
                          </div>
                          <Badge variant="outline" className={config.color}>
                            {typeRewards.length} 个
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {typeRewards.map((reward) => (
                            <div
                              key={reward.id}
                              className="aspect-square rounded-xl bg-white shadow-sm border border-gray-100 flex flex-col items-center justify-center p-3"
                            >
                              {/* 图标 */}
                              <span className="text-3xl mb-1">
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

                              {/* 获得时间 */}
                              <p className="text-xs text-gray-400 mt-1">
                                {formatDate(reward.earned_at)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 获得激励统计 */}
                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    <span className="font-medium text-gray-700">激励统计</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {Object.entries(team.stats?.byType || {}).map(([type, count]) => {
                      const config = getRewardTypeConfig(type);
                      return (
                        <div 
                          key={type}
                          className={`text-center p-3 rounded-lg bg-white border ${config.borderColor}`}
                        >
                          <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
                          <p className="text-xs text-gray-500 mt-1">{config.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  
                  {(team.stats?.totalPoints || 0) > 0 && (
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <span className="text-sm text-gray-600">激励带来的积分</span>
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="w-4 h-4" />
                        <span className="font-bold">+{team.stats?.totalPoints || 0}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
