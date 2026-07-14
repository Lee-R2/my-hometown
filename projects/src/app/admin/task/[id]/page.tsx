'use client';

// 该页面使用 useSearchParams()，禁用静态生成避免构建报错。
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ArrowLeft, Wrench, BookOpen, Plus, X, Save, 
  Check, Trash2, Settings, Star, ChevronRight, Gift, Eye, Lock, Info
} from 'lucide-react';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  description: string;
  stage: number;
  points: number;
  theme_id: string;
  difficulty?: string;
  task_group_id?: string;
  group_name?: string;
  group_description?: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image_url?: string;
  nature?: 'physical' | 'virtual'; // 工具性质：实物/虚拟
  stock?: number; // 库存数量
  team_limit?: number; // 小队领用量
  needs_return?: boolean; // 是否需要还回
  linkedSkills?: Array<{
    skill_id: string;
    is_auto_add: boolean;
    skills: {
      id: string;
      name: string;
      icon: string;
    };
  }>;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  content: string;
  video_url: string;
}

interface TaskTool {
  id: string;
  is_required: boolean;
  tools: Tool;
}

interface TaskSkill {
  id: string;
  points: number;
  is_required: boolean;
  skills: Skill;
}

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  requirement: string;
  image_url?: string;
  linkId?: string; // 用于删除关联
  distributionMethod?: string; // auto: 自动获得, manual: 志愿者分配
  distribution_method?: string; // 数据库蛇形命名
}

export default function TaskSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const taskId = params.id as string;
  const isReadOnly = searchParams.get('readonly') === 'true';

  const [task, setTask] = useState<Task | null>(null);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [taskTools, setTaskTools] = useState<TaskTool[]>([]);
  const [taskSkills, setTaskSkills] = useState<TaskSkill[]>([]);
  const [allRewards, setAllRewards] = useState<Reward[]>([]);
  const [taskRewards, setTaskRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [showRewardSelector, setShowRewardSelector] = useState(false);
  const [selectedPoints, setSelectedPoints] = useState<Record<string, number>>({});
  const [newToolRequired, setNewToolRequired] = useState(true); // 新工具是否必选
  
  // 多选状态
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedRewards, setSelectedRewards] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  
  // 详情查看状态
  const [detailItem, setDetailItem] = useState<{type: 'tool' | 'skill' | 'reward'; data: Tool | Skill | Reward | null}>({type: 'tool', data: null});
  
  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<{url: string; name: string} | null>(null);

  useEffect(() => {
    fetchTaskDetail();
    fetchAllTools();
    fetchAllSkills();
    fetchAllRewards();
    fetchTaskRewards();
  }, [taskId]);

  const fetchTaskDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        router.push('/admin/tasks');
        return;
      }

      setTask(data.task);
      setTaskTools(data.task.tools || []);
      setTaskSkills(data.task.skills || []);
      
      // 初始化技能积分
      const pointsMap: Record<string, number> = {};
      (data.task.skills || []).forEach((ts: TaskSkill) => {
        pointsMap[ts.skills.id] = ts.points;
      });
      setSelectedPoints(pointsMap);

      // 加载当前任务的激励
      fetchTaskRewards();
    } catch (error) {
      console.error('获取任务详情失败:', error);
      toast.error('获取任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTools = async () => {
    try {
      // 获取工具列表，同时获取每个工具的关联技能
      const res = await fetch('/api/tools');
      const data = await res.json();
      
      // 为每个工具获取关联技能
      const toolsWithSkills = await Promise.all(
        (data.tools || []).map(async (tool: Tool) => {
          try {
            const detailRes = await fetch(`/api/tools/${tool.id}`);
            const detailData = await detailRes.json();
            return {
              ...tool,
              linkedSkills: detailData.tool?.linkedSkills || [],
            };
          } catch {
            return { ...tool, linkedSkills: [] };
          }
        })
      );
      
      setAllTools(toolsWithSkills);
    } catch (error) {
      console.error('获取工具列表失败:', error);
    }
  };

  const fetchAllSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setAllSkills(data.skills || []);
    } catch (error) {
      console.error('获取技能列表失败:', error);
    }
  };

  const fetchAllRewards = async () => {
    try {
      const res = await fetch('/api/rewards');
      const data = await res.json();
      setAllRewards(data.rewards || []);
    } catch (error) {
      console.error('获取奖励列表失败:', error);
    }
  };

  const fetchTaskRewards = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/rewards`);
      const data = await res.json();
      setTaskRewards(data.rewards || []);
    } catch (error) {
      console.error('获取任务奖励失败:', error);
    }
  };

  // 获取同组其他任务的ID（排除当前任务）
  // 工具/技能按任务独立配置，不再同步到同组其他任务

  const handleAddTool = async (toolId: string, isRequired: boolean = true) => {
    try {
      // 检查工具有哪些关联技能
      const tool = allTools.find(t => t.id === toolId);
      const linkedSkillIds = tool?.linkedSkills?.filter(ls => ls.is_auto_add).map(ls => ls.skills.id) || [];
      
      const res = await fetch(`/api/tasks/${taskId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, isRequired }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(isRequired ? '必选工具已添加' : '可选工具已添加');
        setTaskTools([...taskTools, data.taskTool]);
        
        // 如果自动添加了技能，提示用户
        if (data.autoAddedSkills && data.autoAddedSkills.length > 0) {
          toast.success(`已自动添加 ${data.autoAddedSkills.length} 个关联技能`);
          // 刷新技能列表
          fetchTaskDetail();
        }
      } else {
        toast.error(data.error || '添加失败');
      }
      return data.success;
    } catch (error) {
      toast.error('添加失败');
      return false;
    }
  };

  // 批量添加工具
  const handleBatchAddTools = async () => {
    if (selectedTools.size === 0) {
      toast.error('请选择要添加的工具');
      return;
    }

    setIsAdding(true);
    let successCount = 0;
    let failCount = 0;

    for (const toolId of selectedTools) {
      const success = await handleAddTool(toolId, newToolRequired);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsAdding(false);
    setSelectedTools(new Set());
    setShowToolSelector(false);

    if (successCount > 0) {
      toast.success(`成功添加 ${successCount} 个工具`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} 个工具添加失败`);
    }
  };

  const handleToggleToolRequired = async (toolId: string, isRequired: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/tools/${toolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRequired }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(isRequired ? '已设为必选' : '已设为可选');
        setTaskTools(taskTools.map(t => 
          t.tools.id === toolId ? { ...t, is_required: isRequired } : t
        ));
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const handleRemoveTool = async (toolId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/tools?toolId=${toolId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('工具已移除');
        setTaskTools(taskTools.filter(t => t.tools.id !== toolId));
      } else {
        toast.error(data.error || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
    }
  };

  const handleAddSkill = async (skillId: string) => {
    const points = selectedPoints[skillId] || 5;
    try {
      const res = await fetch(`/api/tasks/${taskId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, points, isRequired: true }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('技能已添加');
        setTaskSkills([...taskSkills, data.taskSkill]);
      } else {
        toast.error(data.error || '添加失败');
      }
      return data.success;
    } catch (error) {
      toast.error('添加失败');
      return false;
    }
  };

  // 批量添加技能
  const handleBatchAddSkills = async () => {
    if (selectedSkills.size === 0) {
      toast.error('请选择要添加的技能');
      return;
    }

    setIsAdding(true);
    let successCount = 0;
    let failCount = 0;

    for (const skillId of selectedSkills) {
      const success = await handleAddSkill(skillId);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsAdding(false);
    setSelectedSkills(new Set());
    setShowSkillSelector(false);

    if (successCount > 0) {
      toast.success(`成功添加 ${successCount} 个技能`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} 个技能添加失败`);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/skills?skillId=${skillId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('技能已移除');
        setTaskSkills(taskSkills.filter(t => t.skills.id !== skillId));
      } else {
        toast.error(data.error || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
    }
  };

  const handleUpdateSkillPoints = async (skillId: string, points: number) => {
    // 本地更新
    setSelectedPoints({ ...selectedPoints, [skillId]: points });
    
    // 同步到服务器 - 移除后重新添加
    try {
      await handleRemoveSkill(skillId);
      const res = await fetch(`/api/tasks/${taskId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, points, isRequired: true }),
      });
      const data = await res.json();
      if (data.success) {
        setTaskSkills(taskSkills.map(ts => 
          ts.skills.id === skillId ? data.taskSkill : ts
        ));
      }
    } catch (error) {
      console.error('更新积分失败:', error);
    }
  };

  const availableTools = allTools.filter(
    tool => !taskTools.some(tt => tt.tools.id === tool.id)
  );

  // 难度标签辅助函数
  const getDifficultyLabel = (difficulty?: string) => {
    switch (difficulty) {
      case 'easy': return { text: '简单', color: 'bg-green-100 text-green-700 border-green-200' };
      case 'medium': return { text: '中等', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
      case 'hard': return { text: '困难', color: 'bg-red-100 text-red-700 border-red-200' };
      default: return { text: '未指定', color: 'bg-gray-100 text-gray-500 border-gray-200' };
    }
  };

  const availableSkills = allSkills.filter(
    skill => !taskSkills.some(ts => ts.skills.id === skill.id)
  );

  // 获取当前任务已添加的激励ID
  const currentTaskRewardIds = new Set(taskRewards.map(r => r.id));

  const availableRewards = allRewards.filter(
    reward => {
      const alreadyHas = currentTaskRewardIds.has(reward.id);
      const distributionMethod = reward.distribution_method || reward.distributionMethod;
      const isAuto = distributionMethod !== 'manual';
      const isNotAchievement = reward.type !== 'achievement';
      return !alreadyHas && isAuto && isNotAchievement;
    }
  );

  // 批量添加激励到当前任务
  const handleBatchAddRewards = async () => {
    if (selectedRewards.size === 0) {
      toast.error('请选择要添加的激励');
      return;
    }

    setIsAdding(true);
    
    try {
      // 直接添加到当前任务
      const currentRewards = taskRewards || [];
      const res = await fetch(`/api/tasks/${taskId}/rewards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rewardIds: [...currentRewards.map((r: Reward) => r.id), ...selectedRewards] 
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`成功添加 ${selectedRewards.size} 个激励`);
      } else {
        toast.error(data.error || '添加失败');
      }

      // 刷新激励数据
      fetchTaskRewards();
    } catch (error) {
      toast.error('添加失败');
    }

    setIsAdding(false);
    setSelectedRewards(new Set());
    setShowRewardSelector(false);
  };

  // 从当前任务移除奖励
  const handleRemoveReward = async (rewardId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/rewards?rewardId=${rewardId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('激励已移除');
        fetchTaskRewards();
      } else {
        toast.error(data.error || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">任务不存在</p>
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
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                {isReadOnly ? (
                  <>
                    <Eye className="w-5 h-5 text-gray-500" />
                    任务详情
                  </>
                ) : (
                  <>
                    <Settings className="w-5 h-5 text-gray-500" />
                    任务设置
                  </>
                )}
              </h1>
              <p className="text-sm text-gray-500">
                阶段 {task.stage} - {task.group_name || task.title}
                {task.difficulty && (
                  <Badge variant="outline" className={`ml-2 text-[10px] ${getDifficultyLabel(task.difficulty).color}`}>
                    {getDifficultyLabel(task.difficulty).text}
                  </Badge>
                )}
              </p>
            </div>
          </div>
          {isReadOnly && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-700">
              <Lock className="w-3 h-3 mr-1" />
              只读模式
            </Badge>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-4 md:py-6 space-y-6">
        {/* 只读提示 */}
        {isReadOnly && (
          <Card className="border-0 shadow-sm bg-orange-50 border-orange-200">
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-500" />
                <p className="text-sm text-orange-700">
                  这是全局主题的任务，您只能查看配置详情，无法修改。
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* 工具设置 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-blue-500" />
                  所需工具
                </CardTitle>
                <CardDescription>{isReadOnly ? '任务所需的工具配置' : '设置完成此任务所需的工具'}</CardDescription>
              </div>
              {!isReadOnly && (
                <Button 
                  size="sm" 
                  onClick={() => setShowToolSelector(true)}
                  disabled={availableTools.length === 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加工具
                </Button>
              )}
            </div>
          </CardHeader>
	          <CardContent>
            {taskTools.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Wrench className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂未设置工具</p>
                <p className="text-sm mt-1">点击右上角按钮添加任务所需工具</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 必选工具 */}
                {taskTools.filter(t => t.is_required).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-medium">必选工具</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {taskTools.filter(t => t.is_required).map((tool) => {
                        const isPhysical = tool.tools.nature === 'physical';
                        const needsReturn = tool.tools.needs_return !== false;
                        return (
                        <div 
                          key={tool.id}
                          className={`p-3 bg-red-50 rounded-lg border border-red-200 ${isReadOnly ? '' : 'group relative'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{tool.tools.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{tool.tools.name}</p>
                              <p className="text-xs text-gray-500">{tool.tools.category}</p>
                            </div>
                            {!isReadOnly && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-500"
                                onClick={() => handleRemoveTool(tool.tools.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          {/* 工具性质、库存、归还标签 */}
                          <div className="flex items-center flex-wrap gap-1 mt-2">
                            <Badge variant="destructive" className="text-xs">必选</Badge>
                            <Badge variant={isPhysical ? 'default' : 'secondary'} className="text-[10px]">
                              {isPhysical ? '实物' : '虚拟'}
                            </Badge>
                            {isPhysical && tool.tools.stock !== undefined && tool.tools.stock !== null && (
                              <Badge variant="outline" className="text-[10px]">库存{tool.tools.stock}</Badge>
                            )}
                            {isPhysical && needsReturn && (
                              <Badge variant="destructive" className="text-[10px]">需归还</Badge>
                            )}
                          </div>
                          {!isReadOnly && (
                            <div className="mt-2 pt-2 border-t border-red-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-xs text-gray-500 w-full"
                                onClick={() => handleToggleToolRequired(tool.tools.id, false)}
                              >
                                设为可选
                              </Button>
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                  </div>
                )}
                
                {/* 可选工具 */}
                {taskTools.filter(t => !t.is_required).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-medium">可选工具</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {taskTools.filter(t => !t.is_required).map((tool) => {
                        const isPhysical = tool.tools.nature === 'physical';
                        const needsReturn = tool.tools.needs_return !== false;
                        return (
                        <div 
                          key={tool.id}
                          className={`p-3 bg-blue-50 rounded-lg border border-blue-200 ${isReadOnly ? '' : 'group relative'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{tool.tools.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{tool.tools.name}</p>
                              <p className="text-xs text-gray-500">{tool.tools.category}</p>
                            </div>
                            {!isReadOnly && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-500"
                                onClick={() => handleRemoveTool(tool.tools.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          {/* 工具性质、库存、归还标签 */}
                          <div className="flex items-center flex-wrap gap-1 mt-2">
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">可选</Badge>
                            <Badge variant={isPhysical ? 'default' : 'secondary'} className="text-[10px]">
                              {isPhysical ? '实物' : '虚拟'}
                            </Badge>
                            {isPhysical && tool.tools.stock !== undefined && tool.tools.stock !== null && (
                              <Badge variant="outline" className="text-[10px]">库存{tool.tools.stock}</Badge>
                            )}
                            {isPhysical && needsReturn && (
                              <Badge variant="destructive" className="text-[10px]">需归还</Badge>
                            )}
                          </div>
                          {!isReadOnly && (
                            <div className="mt-2 pt-2 border-t border-blue-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-xs text-gray-500 w-full"
                                onClick={() => handleToggleToolRequired(tool.tools.id, true)}
                              >
                                设为必选
                              </Button>
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 技能设置 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-500" />
                  技能学习
                </CardTitle>
                <CardDescription>{isReadOnly ? '完成任务需要学习的技能及积分奖励' : '设置完成任务需要学习的技能及积分奖励'}</CardDescription>
              </div>
              {!isReadOnly && (
                <Button 
                  size="sm" 
                  onClick={() => setShowSkillSelector(true)}
                  disabled={availableSkills.length === 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加技能
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {taskSkills.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂未设置技能</p>
                {!isReadOnly && (
                  <p className="text-sm mt-1">点击右上角按钮添加任务所需技能</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {taskSkills.map((skill) => (
                  <div 
                    key={skill.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{skill.skills.icon}</span>
                        <div>
                          <p className="font-medium">{skill.skills.name}</p>
                          <p className="text-sm text-gray-500">{skill.skills.description}</p>
                          <p className="text-xs text-gray-400 mt-1">{skill.skills.category}</p>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 shrink-0"
                          onClick={() => handleRemoveSkill(skill.skills.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">学习积分：</Label>
                        {isReadOnly ? (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-amber-500">{skill.points}</span>
                            <Star className="w-4 h-4 text-amber-500" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                const newPoints = Math.max(1, (selectedPoints[skill.skills.id] || skill.points) - 1);
                                handleUpdateSkillPoints(skill.skills.id, newPoints);
                              }}
                            >
                              -
                            </Button>
                            <span className="w-10 text-center font-bold text-amber-500">
                              {selectedPoints[skill.skills.id] || skill.points}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                const newPoints = Math.min(50, (selectedPoints[skill.skills.id] || skill.points) + 1);
                                handleUpdateSkillPoints(skill.skills.id, newPoints);
                              }}
                            >
                              +
                            </Button>
                            <Star className="w-4 h-4 text-amber-500 ml-1" />
                          </div>
                        )}
                      </div>
                      {skill.is_required && (
                        <Badge variant="destructive" className="text-xs">必学</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 激励设置 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-500" />
                  任务激励
                </CardTitle>
                <CardDescription>
                  {isReadOnly ? '完成任务可获得的额外激励奖励' : '设置当前任务可获得的额外激励奖励'}
                </CardDescription>
              </div>
              {!isReadOnly && (
                <Button 
                  size="sm" 
                  onClick={() => {
                    setSelectedRewards(new Set());
                    setShowRewardSelector(true);
                  }}
                  disabled={availableRewards.length === 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加激励
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {taskRewards.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Gift className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂未设置激励</p>
                {!isReadOnly && (
                  <p className="text-sm mt-1">点击右上角按钮添加完成任务可获得的激励</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {taskRewards.map((reward) => (
                  <div 
                    key={reward.id}
                    className={`p-4 bg-amber-50 rounded-lg border border-amber-200 ${isReadOnly ? '' : 'group relative'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-3xl">{reward.icon || '🏆'}</span>
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-500"
                          onClick={() => handleRemoveReward(reward.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="font-medium text-sm">{reward.name}</p>
                    {reward.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{reward.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                        {reward.type === 'badge' ? '徽章' : reward.type === 'certificate' ? '证书' : '奖励'}
                      </Badge>
                      {reward.points > 0 && (
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                          +{reward.points} 积分
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 工具选择器 */}
      {showToolSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col">
            <CardHeader className="border-b shrink-0 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">添加工具</CardTitle>
                  {selectedTools.size > 0 && (
                    <Badge className="bg-blue-500">已选 {selectedTools.size}</Badge>
                  )}
                </div>
                {/* 必选/可选切换 - 移到顶部 */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={newToolRequired ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewToolRequired(true)}
                    className={newToolRequired ? "bg-red-500 hover:bg-red-600 h-7" : "h-7"}
                  >
                    必选
                  </Button>
                  <Button
                    variant={!newToolRequired ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewToolRequired(false)}
                    className={!newToolRequired ? "bg-blue-500 hover:bg-blue-600 h-7" : "h-7"}
                  >
                    可选
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0 ml-2"
                    onClick={() => {
                      setShowToolSelector(false);
                      setSelectedTools(new Set());
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 flex-1 flex flex-col overflow-hidden">
              {/* 工具网格 */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {availableTools.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">所有工具已添加</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {availableTools.map((tool) => {
                      const linkedSkills = tool.linkedSkills?.filter(ls => ls.is_auto_add) || [];
                      const isSelected = selectedTools.has(tool.id);
                      const isPhysical = tool.nature === 'physical';
                      const needsReturn = tool.needs_return !== false;
                      return (
                        <div 
                          key={tool.id}
                          className={`relative border rounded-lg overflow-hidden transition-all ${
                            isSelected 
                              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300 shadow-sm' 
                              : 'hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {/* 选中标记 */}
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center z-10">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {/* 可点击选中区域 */}
                          <div 
                            className="p-2 text-center cursor-pointer"
                            onClick={() => {
                              const newSet = new Set(selectedTools);
                              if (isSelected) {
                                newSet.delete(tool.id);
                              } else {
                                newSet.add(tool.id);
                              }
                              setSelectedTools(newSet);
                            }}
                          >
                            {/* 图标 */}
                            <div className="flex items-center justify-center h-10">
                              <span className="text-3xl leading-none">{tool.icon}</span>
                            </div>
                            {/* 名称 */}
                            <p className="text-xs font-medium mt-1 truncate">{tool.name}</p>
                            {/* 工具性质标签 */}
                            <div className="flex items-center justify-center gap-1 mt-1 h-4">
                              <Badge variant={isPhysical ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-4">
                                {isPhysical ? '实物' : '虚拟'}
                              </Badge>
                              {/* 实物工具显示库存和归还标签 */}
                              {isPhysical && (
                                <>
                                  {tool.stock !== undefined && tool.stock !== null && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                      库存{tool.stock}
                                    </Badge>
                                  )}
                                  {needsReturn && (
                                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                      需归还
                                    </Badge>
                                  )}
                                </>
                              )}
                            </div>
                            {/* 关联技能提示 */}
                            <div className="flex items-center justify-center gap-0.5 h-4 mt-0.5">
                              {linkedSkills.length > 0 ? (
                                <>
                                  {linkedSkills.slice(0, 2).map((ls, idx) => (
                                    <span key={`${tool.id}-${ls.skill_id}-${idx}`} className="text-xs">{ls.skills.icon}</span>
                                  ))}
                                  {linkedSkills.length > 2 && (
                                    <span className="text-[10px] text-gray-400">+{linkedSkills.length - 2}</span>
                                  )}
                                </>
                              ) : null}
                            </div>
                          </div>
                          {/* 详情按钮 */}
                          <button
                            className="w-full py-1.5 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 border-t border-blue-100 transition-colors font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailItem({type: 'tool', data: tool});
                            }}
                          >
                            查看详情
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* 底部按钮 */}
              <div className="flex gap-3 mt-3 pt-3 border-t shrink-0">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowToolSelector(false);
                    setSelectedTools(new Set());
                  }}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleBatchAddTools}
                  disabled={selectedTools.size === 0 || isAdding}
                >
                  {isAdding ? '添加中...' : selectedTools.size > 0 ? `添加 (${selectedTools.size})` : '添加'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 技能选择器 */}
      {showSkillSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col">
            <CardHeader className="border-b shrink-0 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">选择技能</CardTitle>
                  {selectedSkills.size > 0 && (
                    <Badge className="bg-purple-500">已选 {selectedSkills.size}</Badge>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setShowSkillSelector(false);
                    setSelectedSkills(new Set());
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0">
                {availableSkills.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">所有技能已添加</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {availableSkills.map((skill) => {
                      const isSelected = selectedSkills.has(skill.id);
                      return (
                        <div 
                          key={skill.id}
                          className={`relative border rounded-lg overflow-hidden transition-all ${
                            isSelected 
                              ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-300 shadow-sm' 
                              : 'hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center z-10">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {/* 可点击选中区域 */}
                          <div 
                            className="p-2 text-center cursor-pointer"
                            onClick={() => {
                              const newSet = new Set(selectedSkills);
                              if (isSelected) {
                                newSet.delete(skill.id);
                              } else {
                                newSet.add(skill.id);
                              }
                              setSelectedSkills(newSet);
                            }}
                          >
                            {/* 图标 */}
                            <div className="flex items-center justify-center h-10">
                              <span className="text-3xl leading-none">{skill.icon}</span>
                            </div>
                            <p className="text-xs font-medium mt-1 truncate">{skill.name}</p>
                            {/* 分类 - 固定高度占位 */}
                            <p className="text-[10px] text-gray-400 h-4 mt-0.5 truncate">{skill.category}</p>
                          </div>
                          {/* 详情按钮 */}
                          <button
                            className="w-full py-1.5 text-[11px] text-purple-600 bg-purple-50 hover:bg-purple-100 border-t border-purple-100 transition-colors font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailItem({type: 'skill', data: skill});
                            }}
                          >
                            查看详情
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* 底部按钮 */}
              <div className="flex gap-3 mt-3 pt-3 border-t shrink-0">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowSkillSelector(false);
                    setSelectedSkills(new Set());
                  }}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleBatchAddSkills}
                  disabled={selectedSkills.size === 0 || isAdding}
                >
                  {isAdding ? '添加中...' : selectedSkills.size > 0 ? `添加 (${selectedSkills.size})` : '添加'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 激励选择器 */}
      {showRewardSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col">
            <CardHeader className="border-b shrink-0 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">选择激励</CardTitle>
                  {selectedRewards.size > 0 && (
                    <Badge className="bg-amber-500">已选 {selectedRewards.size}</Badge>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setShowRewardSelector(false);
                    setSelectedRewards(new Set());
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0">
                {availableRewards.length === 0 ? (
                  <div className="text-center py-8">
                    <Gift className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-gray-500">暂无可添加的激励</p>
                    <p className="text-sm text-gray-400 mt-1">仅显示"自动获得"属性的激励</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableRewards.map((reward) => {
                      const isSelected = selectedRewards.has(reward.id);
                      return (
                        <div 
                          key={reward.id}
                          className={`border rounded-lg overflow-hidden transition-all ${
                            isSelected 
                              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-sm cursor-pointer' 
                              : 'hover:bg-gray-50 hover:border-gray-300 cursor-pointer'
                          }`}
                        >
                          <div 
                            className="flex items-center gap-3 p-3"
                            onClick={() => {
                              const newSet = new Set(selectedRewards);
                              if (isSelected) {
                                newSet.delete(reward.id);
                              } else {
                                newSet.add(reward.id);
                              }
                              setSelectedRewards(newSet);
                            }}
                          >
                            <span className="text-3xl">{reward.icon || '🏆'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{reward.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 px-1">
                                  {reward.type === 'badge' ? '徽章' : reward.type === 'certificate' ? '证书' : '奖励'}
                                </Badge>
                                {reward.points > 0 && (
                                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 px-1">
                                    +{reward.points} 积分
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* 底部按钮 */}
              <div className="flex gap-3 mt-3 pt-3 border-t shrink-0">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowRewardSelector(false);
                    setSelectedRewards(new Set());
                  }}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleBatchAddRewards}
                  disabled={selectedRewards.size === 0 || isAdding}
                >
                  {isAdding ? '添加中...' : `添加 ${selectedRewards.size > 0 ? `(${selectedRewards.size})` : ''}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailItem.data && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setDetailItem({type: 'tool', data: null})}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">
                    {detailItem.type === 'tool' && (detailItem.data as Tool).icon}
                    {detailItem.type === 'skill' && (detailItem.data as Skill).icon}
                    {detailItem.type === 'reward' && ((detailItem.data as Reward).icon || '🏆')}
                  </span>
                  <div>
                    <CardTitle className="text-base">{detailItem.data.name}</CardTitle>
                    <p className="text-xs text-gray-500">
                      {detailItem.type === 'tool' && (detailItem.data as Tool).category}
                      {detailItem.type === 'skill' && (detailItem.data as Skill).category}
                      {detailItem.type === 'reward' && (
                        (detailItem.data as Reward).type === 'badge' ? '徽章' : 
                        (detailItem.data as Reward).type === 'certificate' ? '证书' : '奖励'
                      )}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 w-7 p-0"
                  onClick={() => setDetailItem({type: 'tool', data: null})}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="py-4">
              {/* 图片展示 */}
              {((detailItem.type === 'tool' && (detailItem.data as Tool).image_url) || 
                (detailItem.type === 'reward' && (detailItem.data as Reward).image_url)) && detailItem.data && (
                <div className="mb-3">
                  <div 
                    className="relative cursor-pointer group"
                    onClick={() => setPreviewImage({
                      url: (detailItem.data as Tool | Reward).image_url!,
                      name: detailItem.data!.name
                    })}
                  >
                    <img 
                      src={(detailItem.data as Tool | Reward).image_url!} 
                      alt={detailItem.data.name}
                      className="w-full rounded-lg border object-cover max-h-48 transition-all group-hover:brightness-90"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all rounded-lg">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2">
                        <Eye className="w-5 h-5 text-gray-700" />
                      </div>
                    </div>
                    <p className="absolute bottom-1 right-1 text-[10px] text-gray-500 bg-white/80 px-1 rounded">点击查看大图</p>
                  </div>
                </div>
              )}
              
              {/* 描述 */}
              {detailItem.data.description && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">{detailItem.data.description}</p>
                </div>
              )}
              
              {/* 工具特有信息 */}
              {detailItem.type === 'tool' && (
                <>
                  {/* 工具性质、库存、领用量信息 */}
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                    {/* 工具性质 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">工具性质</span>
                      <Badge variant={((detailItem.data as Tool).nature === 'physical') ? 'default' : 'secondary'} className="text-xs">
                        {((detailItem.data as Tool).nature === 'physical') ? '📦 实物工具' : '💻 虚拟工具'}
                      </Badge>
                    </div>
                    
                    {/* 库存数量 - 实物工具显示 */}
                    {((detailItem.data as Tool).nature === 'physical') && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">库存数量</span>
                        <span className="text-sm font-medium">
                          {((detailItem.data as Tool).stock !== undefined && (detailItem.data as Tool).stock !== null) 
                            ? `${(detailItem.data as Tool).stock} 件` 
                            : '未设置'}
                        </span>
                      </div>
                    )}
                    
                    {/* 小队领用量 - 实物工具显示 */}
                    {((detailItem.data as Tool).nature === 'physical') && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">小队领用量</span>
                        <span className="text-sm font-medium">
                          {((detailItem.data as Tool).team_limit !== undefined && (detailItem.data as Tool).team_limit !== null) 
                            ? `每队 ${(detailItem.data as Tool).team_limit} 件` 
                            : '未设置'}
                        </span>
                      </div>
                    )}
                    
                    {/* 归还要求 - 实物工具显示 */}
                    {((detailItem.data as Tool).nature === 'physical') && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">归还要求</span>
                        <Badge variant={((detailItem.data as Tool).needs_return !== false) ? 'destructive' : 'outline'} className="text-xs">
                          {((detailItem.data as Tool).needs_return !== false) ? '📥 需要归还' : '📤 无需归还'}
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  {/* 关联技能 */}
                  {(detailItem.data as Tool).linkedSkills && (detailItem.data as Tool).linkedSkills!.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">关联技能：</p>
                      <div className="flex flex-wrap gap-1">
                        {(detailItem.data as Tool).linkedSkills!.map((ls, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {ls.skills.icon} {ls.skills.name}
                            {ls.is_auto_add && ' (自动添加)'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* 技能特有信息 */}
              {detailItem.type === 'skill' && (
                <>
                  {(detailItem.data as Skill).content && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">学习内容：</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{(detailItem.data as Skill).content}</p>
                    </div>
                  )}
                  {(detailItem.data as Skill).video_url && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">视频链接：</p>
                      <a 
                        href={(detailItem.data as Skill).video_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline break-all"
                      >
                        {(detailItem.data as Skill).video_url}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500" />
                      默认 5 积分
                    </Badge>
                  </div>
                </>
              )}
              
              {/* 激励特有信息 */}
              {detailItem.type === 'reward' && (
                <>
                  {(detailItem.data as Reward).points > 0 && (
                    <div className="mb-3 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500" />
                        +{(detailItem.data as Reward).points} 积分
                      </Badge>
                    </div>
                  )}
                  {(detailItem.data as Reward).requirement && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">获得条件：</p>
                      <p className="text-sm text-gray-700">{(detailItem.data as Reward).requirement}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-[70] p-4"
          onClick={(e) => {
            // 点击背景关闭（非图片区域）
            if (e.target === e.currentTarget) {
              setPreviewImage(null);
            }
          }}
        >
          {/* 顶部关闭按钮 */}
          <div className="w-full max-w-4xl flex justify-end mb-2 shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:text-white hover:bg-white/20"
              onClick={() => setPreviewImage(null)}
            >
              <X className="w-5 h-5 mr-1" />
              关闭
            </Button>
          </div>
          {/* 可滚动的图片容器 */}
          <div 
            className="flex-1 w-full max-w-4xl overflow-auto flex items-start justify-center rounded-lg bg-black/50"
            style={{ touchAction: 'pan-y pan-x' }}
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={previewImage.url} 
              alt={previewImage.name}
              className="max-w-full h-auto"
              draggable={false}
            />
          </div>
          {/* 图片名称 */}
          <p className="text-white mt-2 text-sm shrink-0">{previewImage.name}</p>
        </div>
      )}
    </div>
  );
}
