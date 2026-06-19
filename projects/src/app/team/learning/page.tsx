'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft, BookOpen, Video, FileText, 
  Play, CheckCircle, Clock, Star, ExternalLink, 
  Loader2, Target, ChevronRight, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
  currentTaskId?: string;
  currentThemeId?: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  content: string;
  videoUrl: string;
  learningMaterials?: LearningMaterial[];
  taskId: string;
  taskTitle: string;
  taskStage: number;
  points: number;
  isRequired: boolean;
  skillIsRequired: boolean;
  learningStatus: 'not_started' | 'in_progress' | 'completed';
  learningStartedAt?: string;
  learningCompletedAt?: string;
  pointsEarned: number;
}

interface LearningMaterial {
  id: string;
  type: 'video' | 'document' | 'ppt' | 'test' | 'link';
  title: string;
  url: string;
}

interface Stats {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

export default function LearningPage() {
  const router = useRouter();
  const { isMobile, isTablet } = useResponsive();
  const [team, setTeam] = useState<Team | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsByStage, setSkillsByStage] = useState<Record<number, Skill[]>>({});
  const [currentStage, setCurrentStage] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, inProgress: 0, notStarted: 0 });
  const [loading, setLoading] = useState(true);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // 滚动位置记忆
  useScrollPosition('team-learning');

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/');
      return;
    }
    
    const teamObj = JSON.parse(teamData);
    setTeam(teamObj);
  }, [router]);

  useEffect(() => {
    if (team?.id) {
      fetchSkills();
    }
  }, [team?.id]);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/team/materials?teamId=${team?.id}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
      } else {
        setSkills(data.skills || []);
        setSkillsByStage(data.skillsByStage || {});
        setCurrentStage(data.currentStage || 0);
        setStats(data.stats || { total: 0, completed: 0, inProgress: 0, notStarted: 0 });
      }
    } catch (error) {
      console.error('获取学习资料失败:', error);
      toast.error('获取学习资料失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-500" />;
      default:
        return <BookOpen className="w-5 h-5 text-gray-400" />;
    }
  };

  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">已学习</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500">学习中</Badge>;
      default:
        return <Badge variant="outline">未学习</Badge>;
    }
  };

  // 开始学习（复习模式）
  const handleStart = async (skill: Skill) => {
    if (!team) return;
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/team/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          skillId: skill.id,
          taskId: skill.taskId,
          action: 'review_start',
          isReview: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSkills();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 完成学习（复习模式）
  const handleComplete = async (skill: Skill) => {
    if (!team) return;
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/team/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          skillId: skill.id,
          taskId: skill.taskId,
          action: 'review_complete',
          isReview: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSkills();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 计算进度百分比
  const calculateProgress = () => {
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 pb-6">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-bold">新知学习</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : skills.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-16">
              <div className="text-center text-gray-500">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>暂无学习资料</p>
                <p className="text-sm mt-2">选择任务后将显示相关技能学习内容</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 复习模式提示 */}
            <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-l-blue-400">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-700">复习学习模式</h3>
                    <p className="text-sm text-blue-600 mt-1">
                      此页面供你反复学习已学过的技能内容，学习完成后<strong>不会增加积分</strong>，仅作为巩固复习之用。
                    </p>
                    <p className="text-xs text-blue-500 mt-2">
                      当前可学习：第 1 阶段 至 第 {currentStage} 阶段的所有技能内容
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 学习统计卡片 */}
            <Card className="border-0 shadow-lg mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-green-500" />
                      技能学习资料
                    </CardTitle>
                    <CardDescription>
                      当前阶段及之前阶段的所有技能，可反复学习
                    </CardDescription>
                  </div>
                  <Badge className="bg-blue-500">
                    当前第 {currentStage} 阶段
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* 学习进度 */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">学习进度</span>
                    <span className="font-medium">{calculateProgress()}%</span>
                  </div>
                  <Progress value={calculateProgress()} className="h-2" />
                </div>

                {/* 统计信息 */}
                <div className={`grid gap-3 mt-4 ${
                  isMobile ? 'grid-cols-2' : 'grid-cols-4'
                }`}>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className={`font-bold text-gray-700 ${isMobile ? 'text-xl' : 'text-2xl'}`}>{stats.total}</p>
                    <p className="text-xs text-gray-500">总计</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className={`font-bold text-green-600 ${isMobile ? 'text-xl' : 'text-2xl'}`}>{stats.completed}</p>
                    <p className="text-xs text-gray-500">已学习</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className={`font-bold text-blue-600 ${isMobile ? 'text-xl' : 'text-2xl'}`}>{stats.inProgress}</p>
                    <p className="text-xs text-gray-500">学习中</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <p className={`font-bold text-orange-600 ${isMobile ? 'text-xl' : 'text-2xl'}`}>{stats.notStarted}</p>
                    <p className="text-xs text-gray-500">未学习</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 按阶段展示技能 */}
            {Object.keys(skillsByStage)
              .map(Number)
              .sort((a, b) => a - b)
              .map((stage) => {
                const stageSkills = skillsByStage[stage];
                const isCurrentStage = stage === currentStage;
                const isPastStage = stage < currentStage;

                return (
                  <Card key={stage} className="border-0 shadow-lg mb-6">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                            isCurrentStage ? 'bg-blue-500' : isPastStage ? 'bg-green-500' : 'bg-gray-400'
                          }`}>
                            {stage}
                          </div>
                          <span>第 {stage} 阶段</span>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {stageSkills.filter(s => s.learningStatus === 'completed').length}/{stageSkills.length}
                          </Badge>
                          {isPastStage && (
                            <Badge className="bg-green-100 text-green-700">已完成</Badge>
                          )}
                          {isCurrentStage && (
                            <Badge className="bg-blue-100 text-blue-700">进行中</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stageSkills.map((skill) => {
                          const isCompleted = skill.learningStatus === 'completed';
                          const isInProgress = skill.learningStatus === 'in_progress';
                          const isExpanded = activeSkill === skill.id;

                          return (
                            <div 
                              key={skill.id}
                              className={`border rounded-lg overflow-hidden transition-all ${
                                isCompleted ? 'border-green-200 bg-green-50' :
                                isInProgress ? 'border-blue-200 bg-blue-50' :
                                'border-gray-200'
                              }`}
                            >
                              {/* 技能标题栏 - 始终显示 */}
                              <div 
                                className={`cursor-pointer ${isMobile ? 'p-2' : 'p-3'}`}
                                onClick={() => setActiveSkill(isExpanded ? null : skill.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  {/* 左侧：技能图标、名称、分类、介绍 */}
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <span className={`${isMobile ? 'text-xl' : 'text-2xl'} flex-shrink-0`}>{skill.icon || '📚'}</span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium truncate">{skill.name}</p>
                                        {skill.skillIsRequired ? (
                                          <Badge variant="destructive" className="text-xs flex-shrink-0">必学</Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-xs flex-shrink-0">选学</Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500 truncate">{skill.category}</p>
                                      {/* 技能介绍 - 直接显示在标题栏 */}
                                      {skill.description && (
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{skill.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* 右侧：积分、操作按钮、展开箭头 */}
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* 积分 */}
                                    {!isMobile && (
                                      <Badge variant="outline" className="hidden sm:flex items-center gap-1">
                                        <Star className="w-3 h-3 text-amber-500" />
                                        {skill.points}积分
                                      </Badge>
                                    )}
                                    
                                    {/* 操作按钮 */}
                                    {!isCompleted && !isInProgress && (
                                      <Button 
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStart(skill);
                                          setActiveSkill(skill.id);
                                        }}
                                        disabled={submitting}
                                      >
                                        <Play className="w-3 h-3 mr-1" />
                                        {isMobile ? '学习' : '开始学习'}
                                      </Button>
                                    )}
                                    {isInProgress && !isCompleted && (
                                      <Button 
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleComplete(skill);
                                        }}
                                        className="bg-green-500 hover:bg-green-600"
                                        disabled={submitting}
                                      >
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        {isMobile ? '完成' : '完成学习'}
                                      </Button>
                                    )}
                                    {isCompleted && (
                                      <div className="flex items-center gap-1">
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                        <span className="text-sm text-green-600">{isMobile ? '完成' : '已完成'}</span>
                                      </div>
                                    )}
                                    
                                    {/* 展开箭头 */}
                                    {!isCompleted && (
                                      <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    )}
                                  </div>
                                </div>
                                
                                {/* 移动端积分显示 */}
                                {isMobile && (
                                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 pl-8">
                                    <Star className="w-3 h-3 text-amber-500" />
                                    {skill.points}积分
                                  </div>
                                )}
                              </div>

                              {/* 展开的技能详情内容 */}
                              {isExpanded && !isCompleted && (
                                <div className={`border-t border-gray-200 ${isMobile ? 'px-2 pb-2' : 'px-3 pb-3'}`}>
                                  <div className={`${isMobile ? 'mt-2' : 'mt-3'}`}>
                                    {/* 所属任务 */}
                                    <div className="text-xs text-gray-500 mb-2">
                                      来源任务：{skill.taskTitle}
                                    </div>
                                    
                                    {/* 学习内容 */}
                                    {skill.content && (
                                      <div className={`bg-white rounded-lg mb-3 ${isMobile ? 'p-2' : 'p-3'}`}>
                                        <h5 className="font-medium mb-2 flex items-center gap-2">
                                          <FileText className="w-4 h-4 text-blue-500" />
                                          学习内容
                                        </h5>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{skill.content}</p>
                                      </div>
                                    )}

                                    {/* 视频链接 */}
                                    {skill.videoUrl && (
                                      <div className="mb-3">
                                        <a 
                                          href={skill.videoUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 text-blue-500 hover:text-blue-600"
                                        >
                                          <Video className="w-4 h-4" />
                                          <span className="text-sm underline">观看学习视频</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </div>
                                    )}

                                    {/* 学习资料链接 */}
                                    {skill.learningMaterials && skill.learningMaterials.length > 0 && (
                                      <div className={`bg-white rounded-lg mb-3 ${isMobile ? 'p-2' : 'p-3'}`}>
                                        <h5 className="font-medium mb-2 flex items-center gap-2">
                                          <FileText className="w-4 h-4 text-purple-500" />
                                          学习资料
                                        </h5>
                                        <div className="space-y-2">
                                          {skill.learningMaterials.map((material) => (
                                            <a
                                              key={material.id}
                                              href={material.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                            >
                                              {material.type === 'video' && <Video className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                              {material.type === 'document' && <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                                              {material.type === 'ppt' && <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />}
                                              {material.type === 'test' && <FileText className="w-4 h-4 text-green-500 flex-shrink-0" />}
                                              {material.type === 'link' && <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                                              <span className="text-sm text-gray-700 truncate flex-1">{material.title}</span>
                                              <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* 复习提示 */}
                                    {skill.pointsEarned > 0 && (
                                      <div className="p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                                        复习不会重复获得积分
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 已完成状态显示学习详情 */}
                              {isCompleted && (
                                <div className={`border-t border-gray-200 ${isMobile ? 'px-2 pb-2' : 'px-3 pb-3'}`}>
                                  <div className={`${isMobile ? 'mt-2' : 'mt-3'}`}>
                                    {skill.description && (
                                      <p className="text-sm text-gray-600 mb-2">{skill.description}</p>
                                    )}
                                    {skill.pointsEarned > 0 && (
                                      <div className="text-xs text-green-600 flex items-center gap-1">
                                        <Star className="w-3 h-3 text-amber-500" />
                                        已获得 {skill.pointsEarned} 积分
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </>
        )}
      </main>
    </div>
  );
}
