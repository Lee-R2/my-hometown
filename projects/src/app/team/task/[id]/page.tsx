'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  ArrowLeft, Wrench, BookOpen, CheckCircle, Clock, 
  Play, Target, Star, ChevronRight, FileText, Video,
  Gift, Upload, Eye, AlertCircle, Package, Link as LinkIcon, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useDataRefresh } from '@/hooks/use-data-refresh';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface Tool {
  id: string;
  is_required: boolean;
  tools: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    image_url?: string;
  };
  stock: number;
  used: number;
  remaining: number;
  isSelected: boolean;
  nature: 'physical' | 'virtual'; // 工具性质：实物/虚拟
  teamLimit?: number; // 小队领用量
  linkedSkills?: Array<{ // 链接技能
    id: string;
    name: string;
    icon: string;
    category: string;
  }>;
}

interface Skill {
  id: string;
  points: number;
  is_required: boolean;
  is_first_time?: boolean;
  status: string;
  pointsEarned: number;
  skills: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    content: string;
    video_url: string;
    learning_materials?: LearningMaterial[];
  };
}

interface LearningMaterial {
  id: string;
  type: 'video' | 'document' | 'ppt' | 'test' | 'link';
  title: string;
  url: string;
}

interface Reward {
  id: string;
  reward_id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  image_url?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  stage: number;
  points: number;
  requirements: string[];
  learning_goals: string[];
  tools: Tool[];
  skills: Skill[];
  rewards: Reward[];
  materials: any[];
  themeTasksCount: number;
  currentTaskIndex: number;
  task_type?: 'main' | 'side' | 'final';
  // 阶段进度
  totalStages?: number;
  completedStages?: number;
  currentStageIndex?: number;
  // 必学技能完成状态
  requiredSkillsTotal?: number;
  requiredSkillsCompleted?: number;
  allRequiredSkillsCompleted?: boolean;
  // 截止日期
  nextTaskDeadline?: string | null;
  isDeadlineExpired?: boolean;
}

interface Team {
  id: string;
  name: string;
  points: number;
  school_id: string;
}

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [selectingTool, setSelectingTool] = useState<string | null>(null);
  const [toolDetailOpen, setToolDetailOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [rewardDetailOpen, setRewardDetailOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [previewImageName, setPreviewImageName] = useState<string>('');

  // 刷新任务数据
  const refreshTaskData = useCallback(async () => {
    if (!team?.id) return;
    await fetchTaskDetail();
  }, [team?.id, taskId]);

  // 数据同步
  useDataRefresh({
    keys: ['tasks', 'team_tools', 'team_skill_learnings', 'user_rewards'],
    onRefresh: refreshTaskData,
  });

  // 滚动位置记忆
  useScrollPosition();

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          setTeam({
            ...data.user,
            school_id: data.user.school_id || data.user.schoolId,
          });
        }
      } catch {
        // ignore
      }
    };
    fetchTeam();
  }, []);

  useEffect(() => {
    if (team?.id) {
      fetchTaskDetail();
    }
  }, [team?.id, taskId]);

  const fetchTaskDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}?teamId=${team?.id}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        router.push('/team/dashboard');
        return;
      }

      setTask(data.task);
    } catch (error) {
      console.error('获取任务详情失败:', error);
      toast.error('获取任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 技能学习相关
  const handleStartLearning = async (skillId: string) => {
    if (!team) return;

    try {
      const res = await fetch('/api/team/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          skillId: skillId,
          taskId: taskId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('开始学习技能');
        fetchTaskDetail();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const handleCompleteLearning = async (skillId: string, points: number) => {
    if (!team) return;

    try {
      const res = await fetch('/api/team/skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          skillId: skillId,
          taskId: taskId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`完成学习！获得 ${data.pointsEarned || points} 积分`);
        fetchTaskDetail();
        
        // 更新本地存储的积分
        const teamData = JSON.parse(localStorage.getItem('team') || '{}');
        const updatedTeam = { 
          ...teamData, 
          points: (teamData.points || 0) + (data.pointsEarned || points) 
        };
        localStorage.setItem('team', JSON.stringify(updatedTeam));
        setTeam(prev => prev ? { ...prev, points: updatedTeam.points } : null);
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  // 工具选择相关
  const handleToolSelect = async (toolId: string, action: 'select' | 'deselect') => {
    if (!team) return;

    setSelectingTool(toolId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/tools/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          toolId: toolId,
          action: action,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // 如果选择了实物工具，显示领取提示和链接技能
        if (action === 'select' && data.linkedSkills && data.linkedSkills.length > 0) {
          const tool = task?.tools.find(t => t.tools.id === toolId);
          const skillNames = data.linkedSkills.map((s: any) => s.name).join('、');
          toast.success(
            `已选择「${tool?.tools.name}」，已添加关联技能：${skillNames}。请向助学老师领取 ${data.teamLimit} 个「${tool?.tools.name}」`,
            { duration: 5000 }
          );
        } else if (action === 'select' && data.teamLimit) {
          const tool = task?.tools.find(t => t.tools.id === toolId);
          toast.success(`已选择「${tool?.tools.name}」，请向助学老师领取 ${data.teamLimit} 个「${tool?.tools.name}」`);
        } else if (action === 'deselect') {
          toast.success(data.message || '已取消选择');
        } else {
          toast.success(data.message || '操作成功');
        }
        fetchTaskDetail();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setSelectingTool(null);
    }
  };

  const calculateSkillProgress = () => {
    if (!task?.skills?.length) return 0;
    const completed = task.skills.filter(s => s.status === 'completed').length;
    return Math.round((completed / task.skills.length) * 100);
  };

  // 跳转到提交页面
  const handleGoToSubmit = () => {
    if (!task) return;
    // 直接传递当前任务ID，确保提交页面知道是哪个任务
    router.push(`/team/submit?taskId=${task.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <p className="text-gray-500">任务不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 pb-24">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-bold">任务详情</h1>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 最后任务提示 */}
        {task.task_type === 'final' && (
          <Card className="border-0 shadow-lg mb-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🏆</span>
                  <div>
                    <h3 className="font-bold text-lg">最后任务</h3>
                    <p className="text-sm opacity-90">
                      所有成员完成反馈表单后，任务自动完成
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/team/final-task-feedback/${task.id}`)}
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  填写反馈
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 阶段进度 */}
        {task.totalStages && task.totalStages > 1 && (
          <Card className="border-0 shadow-lg mb-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm opacity-90">阶段进度</span>
                <span className="text-sm font-semibold">
                  已完成 {task.completedStages || 0} / {task.totalStages} 阶段
                </span>
              </div>
              <Progress 
                value={((task.completedStages || 0) / task.totalStages) * 100} 
                className="h-2 bg-white/30"
              />
              <p className="text-xs opacity-75 mt-2">
                当前：第 {task.currentStageIndex || 1} 阶段 · 完成本阶段任务后进度 +1
              </p>
            </CardContent>
          </Card>
        )}

        {/* 任务标题卡片 */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">当前任务</p>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">阶段 {task.stage}</Badge>
                  {task.task_type === 'final' ? (
                    <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                      🏆 最后任务
                    </Badge>
                  ) : task.task_type === 'side' ? (
                    <Badge className="bg-purple-500">支线任务</Badge>
                  ) : (
                    <Badge className="bg-blue-500">主线任务</Badge>
                  )}
                </div>
                <CardTitle className="text-xl">{task.title}</CardTitle>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="w-5 h-5" />
                  <span className="font-bold">{task.points}</span>
                </div>
                <p className="text-xs text-gray-500">任务积分</p>
              </div>
            </div>
            {task.description && (
              <CardDescription className="mt-2">{task.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {/* 技能学习进度 */}
            {task.skills?.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">技能学习进度</span>
                  <span className="font-medium">{calculateSkillProgress()}%</span>
                </div>
                <Progress value={calculateSkillProgress()} className="h-2" />
              </div>
            )}

            {/* 任务要求 */}
            {task.requirements?.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-500" />
                  任务要求
                </h4>
                <ul className="space-y-1">
                  {(typeof task.requirements === 'string' 
                    ? JSON.parse(task.requirements) 
                    : task.requirements).map((req: string, idx: number) => (
                    <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 工具准备 */}
        {task.tools?.length > 0 && (
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wrench className="w-5 h-5 text-blue-500" />
                所需工具
              </CardTitle>
              <CardDescription>
                点击工具卡片查看详情，必选工具自动分配，可选工具根据库存自由选择
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {task.tools.map((tool) => {
                  const isRequired = tool.is_required;
                  const isSelected = tool.isSelected;
                  const isPhysical = tool.nature === 'physical';
                  const hasStock = tool.remaining > 0 || tool.stock === 999;
                  // 实物工具库存为0时不可选择
                  const isDisabled = !isRequired && isPhysical && !hasStock && !isSelected;

                  return (
                    <div 
                      key={tool.id}
                      onClick={() => {
                        setSelectedTool(tool);
                        setToolDetailOpen(true);
                      }}
                      className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-green-500 bg-green-50' 
                          : isDisabled
                          ? 'border-gray-200 bg-gray-100 opacity-60'
                          : isRequired
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{tool.tools.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{tool.tools.name}</p>
                            {isRequired && (
                              <Badge variant="destructive" className="text-xs">必选</Badge>
                            )}
                            {isSelected && !isRequired && (
                              <Badge className="bg-green-500 text-xs">已选择</Badge>
                            )}
                            {isPhysical && (
                              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">实物</Badge>
                            )}
                            {!isPhysical && (
                              <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">虚拟</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{tool.tools.category}</p>
                          {tool.tools.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {tool.tools.description}
                            </p>
                          )}
                          
                          {/* 库存信息（仅实物可选工具显示） */}
                          {!isRequired && isPhysical && tool.stock !== 999 && (
                            <div className="flex items-center gap-1 mt-2 text-xs">
                              <Package className="w-3 h-3" />
                              <span className={tool.remaining > 0 ? 'text-gray-500' : 'text-red-500'}>
                                剩余 {tool.remaining} / {tool.stock}
                              </span>
                            </div>
                          )}

                          {/* 实物工具领取提示 */}
                          {isPhysical && tool.teamLimit && tool.teamLimit > 0 && (isRequired || isSelected) && (
                            <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              📦 请向助学老师领取 <span className="font-bold">{tool.teamLimit}</span> 个「{tool.tools.name}」
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 库存不足提示 */}
                      {isDisabled && (
                        <div className="mt-2 text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          库存不足，无法选择
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 工具详情弹窗 */}
        <Dialog open={toolDetailOpen} onOpenChange={setToolDetailOpen}>
          <DialogContent className="max-w-md">
            {selectedTool && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-2xl">{selectedTool.tools.icon}</span>
                    {selectedTool.tools.name}
                  </DialogTitle>
                  <DialogDescription>{selectedTool.tools.category}</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  {/* 工具性质 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">性质：</span>
                    {selectedTool.nature === 'physical' ? (
                      <Badge className="bg-blue-100 text-blue-700">实物工具</Badge>
                    ) : (
                      <Badge className="bg-purple-100 text-purple-700">虚拟工具</Badge>
                    )}
                    {selectedTool.is_required ? (
                      <Badge variant="destructive">必选</Badge>
                    ) : (
                      <Badge variant="secondary">可选</Badge>
                    )}
                  </div>

                  {/* 实物相片 */}
                  {selectedTool.tools.image_url && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">实物相片</h4>
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => {
                          setPreviewImageUrl(selectedTool.tools.image_url!);
                          setPreviewImageName(selectedTool.tools.name);
                          setImagePreviewOpen(true);
                        }}
                      >
                        <img 
                          src={selectedTool.tools.image_url} 
                          alt={selectedTool.tools.name}
                          className="w-full max-w-xs h-40 object-cover rounded-lg border border-gray-200 transition-all group-hover:border-blue-400"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all rounded-lg flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-all bg-white/90 px-3 py-1.5 rounded-full text-sm text-gray-600 flex items-center gap-1">
                            <Eye className="w-4 h-4" />
                            点击查看大图
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 工具介绍 */}
                  {selectedTool.tools.description && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">工具介绍</h4>
                      <p className="text-sm text-gray-600">{selectedTool.tools.description}</p>
                    </div>
                  )}

                  {/* 库存信息 */}
                  {selectedTool.nature === 'physical' && selectedTool.stock !== 999 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">可用数量</h4>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span className={`text-sm ${selectedTool.remaining > 0 ? 'text-gray-600' : 'text-red-500'}`}>
                          剩余 {selectedTool.remaining} / 总量 {selectedTool.stock}
                        </span>
                      </div>
                      {selectedTool.teamLimit && (
                        <p className="text-xs text-gray-500 mt-1">
                          每个小队需要 {selectedTool.teamLimit} 件
                        </p>
                      )}
                    </div>
                  )}

                  {/* 虚拟工具提示 */}
                  {selectedTool.nature === 'virtual' && (
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-sm text-purple-700">
                        💡 这是虚拟工具，可直接在线使用
                      </p>
                    </div>
                  )}

                  {/* 选择状态 */}
                  {selectedTool.isSelected && !selectedTool.is_required && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">已选择此工具</span>
                    </div>
                  )}

                  {/* 实物工具领取提示 - 仅在选择后显示 */}
                  {selectedTool.nature === 'physical' && selectedTool.isSelected && selectedTool.teamLimit && selectedTool.teamLimit > 0 && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-blue-700">
                        📦 请向助学老师领取 <span className="font-bold">{selectedTool.teamLimit}</span> 个「{selectedTool.tools.name}」
                      </p>
                    </div>
                  )}

                  {/* 链接技能 - 实物工具选择后显示 */}
                  {selectedTool.nature === 'physical' && selectedTool.isSelected && selectedTool.linkedSkills && selectedTool.linkedSkills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <LinkIcon className="w-4 h-4" />
                        链接技能
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTool.linkedSkills.map(skill => (
                          <Badge key={skill.id} variant="outline" className="flex items-center gap-1">
                            <span>{skill.icon}</span>
                            <span>{skill.name}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setToolDetailOpen(false)}>
                    关闭
                  </Button>
                  {!selectedTool.is_required && (() => {
                    const isPhysical = selectedTool.nature === 'physical';
                    const hasStock = selectedTool.remaining > 0 || selectedTool.stock === 999;
                    const canSelect = hasStock && !selectedTool.isSelected;
                    const canDeselect = selectedTool.isSelected;
                    const isDisabled = isPhysical && !hasStock && !selectedTool.isSelected;

                    return canSelect ? (
                      <Button
                        onClick={() => {
                          handleToolSelect(selectedTool.tools.id, 'select');
                          setToolDetailOpen(false);
                        }}
                        disabled={selectingTool === selectedTool.tools.id}
                      >
                        {selectingTool === selectedTool.tools.id ? '选择中...' : '选择此工具'}
                      </Button>
                    ) : canDeselect ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          handleToolSelect(selectedTool.tools.id, 'deselect');
                          setToolDetailOpen(false);
                        }}
                        disabled={selectingTool === selectedTool.tools.id}
                      >
                        取消选择
                      </Button>
                    ) : isDisabled ? (
                      <Button disabled>
                        库存不足
                      </Button>
                    ) : null;
                  })()}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* 激励详情弹窗 */}
        <Dialog open={rewardDetailOpen} onOpenChange={setRewardDetailOpen}>
          <DialogContent className="max-w-md">
            {selectedReward && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-2xl">{selectedReward.icon}</span>
                    {selectedReward.name}
                  </DialogTitle>
                  <DialogDescription>
                    <Badge variant="outline" className="mt-1">
                      {selectedReward.type === 'badge' ? '徽章' : 
                       selectedReward.type === 'gem' ? '宝石' : 
                       selectedReward.type === 'hidden_skill' ? '隐藏技能卡' :
                       selectedReward.type === 'hidden_tool' ? '隐藏工具卡' : '成就'}
                    </Badge>
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  {/* 激励图片 */}
                  {selectedReward.image_url && (
                    <div className="flex justify-center">
                      <img 
                        src={selectedReward.image_url} 
                        alt={selectedReward.name}
                        className="w-32 h-32 object-contain rounded-lg border"
                      />
                    </div>
                  )}

                  {/* 激励介绍 */}
                  {selectedReward.description && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">激励介绍</h4>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedReward.description}</p>
                    </div>
                  )}

                  {/* 积分价值 */}
                  {selectedReward.points > 0 && (
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-gray-600">
                        价值 <span className="font-bold text-amber-600">{selectedReward.points}</span> 积分
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setRewardDetailOpen(false)}>
                    关闭
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* 图片大图预览弹窗 */}
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-0 shadow-none" showCloseButton={false}>
            {/* 隐藏的标题，用于屏幕阅读器可访问性 */}
            <DialogTitle className="sr-only">{previewImageName} - 大图预览</DialogTitle>
            <div className="relative">
              {/* 关闭按钮 */}
              <button
                onClick={() => setImagePreviewOpen(false)}
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              {/* 图片标题 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                <p className="text-white text-sm font-medium">{previewImageName}</p>
              </div>
              
              {/* 大图 */}
              <img 
                src={previewImageUrl} 
                alt={previewImageName}
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
                onClick={() => setImagePreviewOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* 技能学习 */}
        {task.skills?.length > 0 && (
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="w-5 h-5 text-purple-500" />
                    技能学习
                  </CardTitle>
                  <CardDescription>
                    首次学习的技能为必学技能，完成后才能上传任务产出
                  </CardDescription>
                </div>
                {/* 必学技能进度 */}
                {task.requiredSkillsTotal !== undefined && task.requiredSkillsTotal > 0 && (
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">必学技能</span>
                      <Badge variant={task.allRequiredSkillsCompleted ? "default" : "secondary"} className="bg-green-500">
                        {task.requiredSkillsCompleted}/{task.requiredSkillsTotal}
                      </Badge>
                    </div>
                    {task.allRequiredSkillsCompleted && (
                      <p className="text-xs text-green-600 mt-1">✓ 已全部完成</p>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {task.skills.map((skill) => {
                  const isCompleted = skill.status === 'completed';
                  const isInProgress = skill.status === 'in_progress';
                  const isExpanded = activeSkill === skill.skills.id;
                  const isRequiredSkill = skill.is_required; // 必学技能（任务设置）
                  // 根据本周期学习状态判断实际是否必学：本周期内未完成的必学技能才显示"必学"
                  const showRequiredBadge = isRequiredSkill && !isCompleted;

                  return (
                    <div 
                      key={skill.id}
                      className={`border rounded-lg overflow-hidden transition-all ${
                        isCompleted ? 'border-green-200 bg-green-50' :
                        isInProgress ? 'border-blue-200 bg-blue-50' :
                        showRequiredBadge ? 'border-orange-200 bg-orange-50' : // 未完成的必学技能高亮
                        'border-gray-200'
                      }`}
                    >
                      {/* 技能标题栏 */}
                      <div 
                        className="p-4 cursor-pointer"
                        onClick={() => setActiveSkill(isExpanded ? null : skill.skills.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{skill.skills.icon}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{skill.skills.name}</p>
                                {showRequiredBadge ? (
                                  <Badge variant="destructive" className="text-xs">必学</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-gray-500 border-gray-300">可选</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{skill.skills.category}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-500" />
                              {skill.points}积分
                            </Badge>
                            {isCompleted && (
                              <Badge className="bg-green-500">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                已完成
                              </Badge>
                            )}
                            {isInProgress && !isCompleted && (
                              <Badge className="bg-blue-500">
                                <Clock className="w-3 h-3 mr-1" />
                                学习中
                              </Badge>
                            )}
                            <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                      </div>

                      {/* 展开的技能内容 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-200">
                          <div className="mt-3">
                            {/* 技能描述 - 简化显示 */}
                            {skill.skills.description && (
                              <p className="text-xs text-gray-500 mb-3 line-clamp-2">{skill.skills.description}</p>
                            )}
                            
                            {/* 学习内容 - 简化显示 */}
                            {(isInProgress || isCompleted) && skill.skills.content && (
                              <div className="bg-gray-50 p-2 rounded mb-3">
                                <p className="text-xs text-gray-600 line-clamp-3">{skill.skills.content}</p>
                              </div>
                            )}

                            {/* 学习资料 - 突出显示，包含视频 */}
                            {(isInProgress || isCompleted) && (() => {
                              // 合并视频和学习资料
                              const materials = skill.skills.learning_materials || [];
                              const videoUrl = skill.skills.video_url;
                              const hasVideo = !!videoUrl;
                              const hasMaterials = materials.length > 0;
                              
                              if (!hasVideo && !hasMaterials) return null;
                              
                              // 构建完整的资料列表
                              const allMaterials = [];
                              if (hasVideo) {
                                allMaterials.push({
                                  id: 'video-main',
                                  type: 'video',
                                  title: '学习视频',
                                  url: videoUrl,
                                });
                              }
                              allMaterials.push(...materials);
                              
                              return (
                                <div className="mb-3">
                                  <h5 className="font-semibold mb-2 text-sm flex items-center gap-2 text-purple-700">
                                    <FileText className="w-4 h-4" />
                                    学习资料
                                  </h5>
                                  <div className="space-y-1.5">
                                    {allMaterials.map((material) => (
                                      <a
                                        key={material.id}
                                        href={material.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-100 hover:border-purple-300 hover:bg-purple-50 transition-all"
                                      >
                                        {material.type === 'video' && (
                                          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                                            <Video className="w-4 h-4 text-red-500" />
                                          </div>
                                        )}
                                        {material.type === 'document' && (
                                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4 text-blue-500" />
                                          </div>
                                        )}
                                        {material.type === 'ppt' && (
                                          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4 text-orange-500" />
                                          </div>
                                        )}
                                        {material.type === 'test' && (
                                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4 text-green-500" />
                                          </div>
                                        )}
                                        {material.type === 'link' && (
                                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                            <LinkIcon className="w-4 h-4 text-gray-500" />
                                          </div>
                                        )}
                                        <span className="text-sm text-gray-700 font-medium">{material.title}</span>
                                        <ChevronRight className="w-4 h-4 text-gray-400 ml-auto shrink-0" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 操作按钮 */}
                            <div className="flex gap-2 mt-4">
                              {!isCompleted && !isInProgress && (
                                <>
                                  {/* 提示：点击开始学习后可查看学习内容 */}
                                  <p className="text-xs text-gray-400 flex-1 flex items-center">
                                    点击"开始学习"后可查看学习内容
                                  </p>
                                  <Button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartLearning(skill.skills.id);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <Play className="w-4 h-4" />
                                    开始学习
                                  </Button>
                                </>
                              )}
                              {isInProgress && !isCompleted && (
                                <Button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteLearning(skill.skills.id, skill.points);
                                  }}
                                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  完成学习
                                </Button>
                              )}
                              {isCompleted && (
                                <div className="text-sm text-green-600 flex items-center gap-1">
                                  <CheckCircle className="w-4 h-4" />
                                  已获得 {skill.pointsEarned || skill.points} 积分
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 完成任务可获得激励 - 只读展示 */}
        <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-amber-50 to-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-amber-700">
              <Gift className="w-5 h-5" />
              完成任务可获得
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 积分奖励 */}
            <div className="flex items-center gap-4 mb-4 p-3 bg-white/60 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">任务积分</p>
                  <p className="font-bold text-amber-600">{task.points} 分</p>
                </div>
              </div>
              
              {/* 技能积分 */}
              {task.skills?.length > 0 && (
                <>
                  <span className="text-gray-300">+</span>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">技能学习</p>
                      <p className="font-bold text-purple-600">
                        {task.skills.reduce((sum, s) => sum + (s.points || 0), 0)} 分
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 激励卡片列表 */}
            {task.rewards?.length > 0 ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">激励奖励（点击查看详情）</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {task.rewards.map((reward) => (
                    <div 
                      key={reward.id}
                      onClick={() => {
                        setSelectedReward(reward);
                        setRewardDetailOpen(true);
                      }}
                      className="p-3 bg-white/80 rounded-lg border border-amber-100 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/50 transition-all"
                    >
                      <span className="text-2xl">{reward.icon}</span>
                      <p className="font-medium mt-1 text-sm text-gray-700">{reward.name}</p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {reward.type === 'badge' ? '徽章' : 
                         reward.type === 'gem' ? '宝石' : 
                         reward.type === 'hidden_skill' ? '隐藏技能卡' :
                         reward.type === 'hidden_tool' ? '隐藏工具卡' : '成就'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
                该任务暂无额外激励奖励
              </div>
            )}

            {/* 总计 */}
            <div className="mt-4 pt-3 border-t border-amber-200 flex items-center justify-between">
              <span className="text-sm text-gray-600">完成本任务最多可获得</span>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-amber-600">
                  {task.points + task.skills?.reduce((sum, s) => sum + (s.points || 0), 0)} 积分
                </span>
                {task.rewards?.length > 0 && (
                  <span className="text-gray-400 text-sm ml-1">
                    + {task.rewards.length} 个激励
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50">
        <div className="max-w-7xl mx-auto">
          {/* 最后任务 - 显示填写反馈按钮 */}
          {task.task_type === 'final' ? (
            <Button 
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
              onClick={() => router.push(`/team/final-task-feedback/${task.id}`)}
            >
              <FileText className="w-4 h-4 mr-2" />
              填写反馈表单
            </Button>
          ) : (
            <>
              {/* 截止日期超时提示 */}
              {task.isDeadlineExpired && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      已超过提交截止时间，无法上传任务产出
                    </span>
                  </div>
                  <p className="text-xs text-red-600 mt-1">
                    截止日期：{task.nextTaskDeadline ? new Date(task.nextTaskDeadline).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }) + ' 24:00' : '未知'}
                  </p>
                </div>
              )}
              {/* 必学技能未完成提示 */}
              {task.skills?.length > 0 && !task.allRequiredSkillsCompleted && !task.isDeadlineExpired && (
                <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-700">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      请先完成所有必学技能 ({task.requiredSkillsCompleted}/{task.requiredSkillsTotal})
                    </span>
                  </div>
                </div>
              )}
              {/* 超时时点击提示 */}
              <div 
                onClick={() => {
                  if (task.isDeadlineExpired) {
                    toast.error('任务提交已超时');
                  }
                }}
                className={task.isDeadlineExpired ? 'cursor-pointer' : ''}
              >
                <Button 
                  className={`w-full ${
                    task.isDeadlineExpired 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-500 to-purple-500'
                  }`}
                  onClick={(e) => {
                    if (task.isDeadlineExpired) {
                      e.stopPropagation();
                      return;
                    }
                    handleGoToSubmit();
                  }}
                  disabled={task.isDeadlineExpired || (task.skills?.length > 0 && !task.allRequiredSkillsCompleted)}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {task.isDeadlineExpired 
                    ? '已超时，无法提交' 
                    : task.skills?.length > 0 && !task.allRequiredSkillsCompleted 
                    ? '请先完成必学技能' 
                    : '提交产出'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
