'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Edit, Trash2, Plus,
  School, Globe, FileText, X, Save, 
  ChevronUp, ChevronDown, Eye, Target, Lightbulb, Settings, Lock,
  Wrench, BookOpen, Star, Gift, ChevronRight, Check, Loader2, Trophy, Wand2, Layers, ListChecks, ChevronLeft, ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;  // 使用下划线命名，与数据库字段一致
}

interface Theme {
  id: string;
  name: string;
  description: string;
  icon: string;
  order_index: number;
  is_active: boolean;
  school_id: string | null;
  is_exclusive: boolean;
  created_at: string;
  created_by?: string;  // 创建者ID
  final_task_form_id?: string | null;  // 最后任务表单ID（兼容旧逻辑）
  // 三个角色的表单ID
  guider_form_id?: string | null;
  light_mage_form_id?: string | null;
  secret_scholar_form_id?: string | null;
  school?: {
    id: string;
    name: string;
    address: string;
  } | null;
  exclusiveSchools?: Array<{
    id: string;
    name: string;
    address: string;
  }>;
  taskCount: number;
  teamCount: number;
}

interface Task {
  id: string;
  theme_id: string;
  stage: number;
  title: string;
  description: string;
  requirements: string[];
  learning_goals: string[];
  points: number;
  order_index: number;
  is_active: boolean;
  task_type?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  task_group_id?: string;
  group_name?: string;
  group_description?: string;
}

// 任务详情相关接口
interface TaskTool {
  id: string;
  is_required: boolean;
  tools: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    stock: number | null;
    nature: string;
    team_limit: number | null;
    needs_return: boolean;
  };
}

interface TaskSkill {
  id: string;
  points: number;
  is_required: boolean;
  skills: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
  };
}

interface TaskReward {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  requirement: string;
  linkId?: string;
}

interface TaskDetail extends Task {
  tools: TaskTool[];
  skills: TaskSkill[];
  rewards: TaskReward[];
}

// 工具接口（包含关联技能）
interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image_url?: string;
  stock: number | null;
  nature: string; // physical: 实物, virtual: 虚拟
  team_limit: number | null; // 每个小队可领用的最大数量
  needs_return: boolean; // 是否需要还回
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

// 技能接口
interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  content: string;
  video_url: string;
}

// 奖励接口
interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  type: string;
  requirement: string;
  image_url?: string;
  distribution_method?: string;
  linkId?: string;
}

interface School {
  id: string;
  name: string;
}

export default function ThemeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const themeId = params.id as string;

  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  
  const [isEditingTheme, setIsEditingTheme] = useState(false);
  const [isConfiguringFinal, setIsConfiguringFinal] = useState(false);
  const [editThemeForm, setEditThemeForm] = useState({
    name: '',
    description: '',
    icon: '🎯',
    isExclusive: false,
    schoolIds: [] as string[],
    finalTaskFormId: '' as string,
    // 三个角色的表单ID
    guiderFormId: '' as string,
    lightMageFormId: '' as string,
    secretScholarFormId: '' as string,
  });
  
  // 最后任务表单列表
  const [finalTaskForms, setFinalTaskForms] = useState<Array<{
    id: string;
    name: string;
    icon: string;
    is_global: boolean;
    team_role?: string | null;
  }>>([]);
  
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // 补充难度任务对话框状态
  const [showAddDiffDialog, setShowAddDiffDialog] = useState(false);
  const [addDiffForm, setAddDiffForm] = useState({
    taskGroupId: '',
    groupName: '',
    groupDescription: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    title: '',
    description: '',
    points: 10,
    requirements: [] as string[],
    learningGoals: [] as string[],
    stage: 1,
    themeId: '',
  });
  const [newDiffReq, setNewDiffReq] = useState('');
  const [newDiffGoal, setNewDiffGoal] = useState('');
  const [isSavingDiffTask, setIsSavingDiffTask] = useState(false);

  const [taskForm, setTaskForm] = useState({
    groupName: '',
    groupDescription: '',
    title: '',
    description: '',
    stage: 1,
    points: 10,
    taskType: 'main',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    // 三个难度版本的独立标题、描述、积分、要求和学习目标（标题为空则不创建该难度）
    easyTitle: '',
    easyDescription: '',
    easyPoints: 6,
    easyRequirements: [] as string[],
    easyLearningGoals: [] as string[],
    mediumTitle: '',
    mediumDescription: '',
    mediumPoints: 10,
    mediumRequirements: [] as string[],
    mediumLearningGoals: [] as string[],
    hardTitle: '',
    hardDescription: '',
    hardPoints: 18,
    hardRequirements: [] as string[],
    hardLearningGoals: [] as string[],
  });

  // 使用 ref 始终跟踪表单的最新值，避免闭包陈旧问题
  const taskFormRef = useRef(taskForm);
  taskFormRef.current = taskForm; // 每次渲染都同步
  const addDiffFormRef = useRef(addDiffForm);
  addDiffFormRef.current = addDiffForm; // 每次渲染都同步

  // 每个难度独立的输入状态
  const [newEasyReq, setNewEasyReq] = useState('');
  const [newEasyGoal, setNewEasyGoal] = useState('');
  const [newMediumReq, setNewMediumReq] = useState('');
  const [newMediumGoal, setNewMediumGoal] = useState('');
  const [newHardReq, setNewHardReq] = useState('');
  const [newHardGoal, setNewHardGoal] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);

  // 任务详情面板状态
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [selectedTaskGroup, setSelectedTaskGroup] = useState<{ groupId: string; groupName: string; groupDescription: string; variants: TaskDetail[]; stage: number } | null>(null);
  const [loadingTaskDetail, setLoadingTaskDetail] = useState(false);

  // 任务组级别：任务要求和学习目标编辑


  // 工具、技能、激励选择器状态
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [allRewards, setAllRewards] = useState<Reward[]>([]);
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [taskGroupRewards, setTaskGroupRewards] = useState<Record<string, Reward[]>>({});
  const [showRewardSelector, setShowRewardSelector] = useState(false);
  const [selectedSkillPoints, setSelectedSkillPoints] = useState<Record<string, number>>({});
  const [newToolRequired, setNewToolRequired] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  // 工具详情弹窗状态
  const [showToolDetail, setShowToolDetail] = useState(false);
  const [detailTool, setDetailTool] = useState<Tool | null>(null);

  const iconOptions = ['🎯', '🔬', '🌍', '🌿', '🔭', '🚀', '💡', '🎨', '📚', '🎵', '🏆', '⚡'];

  useEffect(() => {
    // 获取用户信息
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          setAdmin(data.user);
        }
      } catch {
        // ignore
      }
    };
    fetchUser();
    
    fetchThemeDetail();
    fetchTasks();
    fetchSchools();
    fetchFinalTaskForms();
    fetchAllTools();
    fetchAllSkills();
    fetchAllRewards();
  }, [themeId]);

  // 实时同步：当任务详情面板打开时，定期刷新数据
  useEffect(() => {
    if (selectedTask) {
      const taskId = selectedTask.id;
      // 每5秒静默刷新一次任务详情
      const intervalId = setInterval(() => {
        fetchTaskDetail(taskId, true);
      }, 5000);
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [selectedTask?.id]);

  // 获取所有工具
  const fetchAllTools = async () => {
    try {
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

  // 获取所有技能
  const fetchAllSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setAllSkills(data.skills || []);
    } catch (error) {
      console.error('获取技能列表失败:', error);
    }
  };

  // 获取所有奖励
  const fetchAllRewards = async () => {
    try {
      const res = await fetch('/api/rewards');
      const data = await res.json();
      setAllRewards(data.rewards || []);
    } catch (error) {
      console.error('获取奖励列表失败:', error);
    }
  };

  // 计算权限
  const getPermissions = () => {
    if (!admin || !theme) {
      return { canEdit: false, canDelete: false, canAddTask: false, canEditTask: false, canDeleteTask: false, canSetTask: false };
    }

    // 判断主题性质
    // 全局主题：is_exclusive=false 且 school_id=null
    // 专属主题：is_exclusive=true，归属特定学校
    const isGlobalTheme = !theme.is_exclusive && !theme.school_id;
    
    // 判断是否为本校专属主题
    // 专属主题：is_exclusive=true 且 school_id 匹配当前用户学校
    // 或者在 exclusiveSchools 列表中包含当前用户学校
    const isOwnSchoolExclusiveTheme = theme.is_exclusive && (
      theme.school_id === admin.school_id ||
      (theme.exclusiveSchools && theme.exclusiveSchools.some(s => s.id === admin.school_id))
    );

    if (admin.role === 'admin' || admin.role === 'super_admin') {
      // 超级管理员拥有所有权限
      return {
        canEdit: true,
        canDelete: true,
        canAddTask: true,
        canEditTask: true,
        canDeleteTask: true,
        canSetTask: true,
      };
    }

    // 志愿者权限：
    // - 对专属主题（归属本校）：完全操作权限
    // - 对全局主题：只读权限
    if (admin.role === 'volunteer') {
      const canOperateTheme = isOwnSchoolExclusiveTheme;
      
      return {
        canEdit: canOperateTheme,
        canDelete: canOperateTheme && theme.taskCount === 0, // 空主题才能删除
        canAddTask: canOperateTheme,
        canEditTask: canOperateTheme,
        canDeleteTask: canOperateTheme,
        canSetTask: canOperateTheme,
      };
    }

    // 助学老师：对所有主题都只有只读权限
    if (admin.role === 'teacher') {
      return {
        canEdit: false,
        canDelete: false,
        canAddTask: false,
        canEditTask: false,
        canDeleteTask: false,
        canSetTask: false,
      };
    }

    return {
      canEdit: false,
      canDelete: false,
      canAddTask: false,
      canEditTask: false,
      canDeleteTask: false,
      canSetTask: false,
    };
  };

  const permissions = getPermissions();
  const isGlobalTheme = !theme?.school_id;

  const fetchThemeDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/themes/${themeId}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        router.push('/admin/tasks');
        return;
      }

      setTheme(data.theme);
      setEditThemeForm({
        name: data.theme.name,
        description: data.theme.description || '',
        icon: data.theme.icon || '🎯',
        isExclusive: data.theme.is_exclusive || false,
        schoolIds: data.theme.exclusiveSchools?.map((s: { id: string }) => s.id) || [],
        finalTaskFormId: data.theme.final_task_form_id || '',
        guiderFormId: data.theme.guider_form_id || '',
        lightMageFormId: data.theme.light_mage_form_id || '',
        secretScholarFormId: data.theme.secret_scholar_form_id || '',
      });
    } catch (error) {
      console.error('获取主题详情失败:', error);
      toast.error('获取主题详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/tasks?themeId=${themeId}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('获取任务列表失败:', error);
    }
  };

  const fetchSchools = async () => {
    try {
      const res = await fetch('/api/schools');
      const data = await res.json();
      setSchools(data.schools || []);
    } catch (error) {
      console.error('获取学校列表失败:', error);
    }
  };

  const fetchFinalTaskForms = async () => {
    try {
      // 从 admin state 获取用户信息
      const user = admin;
      
      const params = new URLSearchParams();
      params.append('createdBy', user?.id || '');
      params.append('role', user?.role || '');
      if (user?.school_id) {
        params.append('schoolId', user.school_id);
      }
      
      const res = await fetch(`/api/admin/final-tasks?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setFinalTaskForms(data.forms || []);
      }
    } catch (error) {
      console.error('获取最后任务表单列表失败:', error);
    }
  };

  // 一键自动配置最后任务表单
  const handleAutoConfigureFinalTask = async () => {
    if (!theme?.id) return;
    setIsConfiguringFinal(true);
    try {
      const res = await fetch(`/api/themes/${theme.id}/auto-configure-final`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        // 刷新主题信息
        await fetchThemeDetail();
      } else {
        toast.error(data.error || '配置失败');
      }
    } catch (error) {
      console.error('自动配置最后任务失败:', error);
      toast.error('配置失败，请重试');
    } finally {
      setIsConfiguringFinal(false);
    }
  };

  // 获取任务详情（包括工具、技能、激励）
  const fetchTaskDetail = async (taskId: string, silent: boolean = false) => {
    if (!silent) {
      setLoadingTaskDetail(true);
    }
    try {
      // 获取任务基本信息（包括工具和技能）
      const taskRes = await fetch(`/api/tasks/${taskId}`);
      const taskData = await taskRes.json();
      
      if (taskData.error) {
        if (!silent) {
          toast.error(taskData.error);
        }
        return;
      }

      // 获取任务奖励
      const rewardsRes = await fetch(`/api/tasks/${taskId}/rewards`);
      const rewardsData = await rewardsRes.json();

      setSelectedTask({
        ...taskData.task,
        rewards: rewardsData.rewards || [],
      });

      // 加载任务组内所有难度的激励
      if (taskData.task.task_group_id) {
        const siblings = tasks.filter(t => t.task_group_id === taskData.task.task_group_id);
        const rewardMap: Record<string, Reward[]> = {};
        await Promise.all(siblings.map(async (sib) => {
          try {
            const res = await fetch(`/api/tasks/${sib.id}/rewards`);
            const data = await res.json();
            rewardMap[sib.id] = data.rewards || [];
          } catch { rewardMap[sib.id] = []; }
        }));
        setTaskGroupRewards(rewardMap);
      } else {
        setTaskGroupRewards({ [taskData.task.id]: rewardsData.rewards || [] });
      }
    } catch (error) {
      console.error('获取任务详情失败:', error);
      if (!silent) {
        toast.error('获取任务详情失败');
      }
    } finally {
      if (!silent) {
        setLoadingTaskDetail(false);
      }
    }
  };

  // 获取任务组内所有任务的激励
  const fetchSiblingRewards = async (taskGroupId: string) => {
    try {
      const siblings = tasks.filter(t => t.task_group_id === taskGroupId);
      const rewardsMap: Record<string, Reward[]> = {};
      await Promise.all(siblings.map(async (sibling) => {
        try {
          const res = await fetch(`/api/tasks/${sibling.id}`);
          const data = await res.json();
          if (data.task?.rewards) {
            rewardsMap[sibling.id] = data.task.rewards.map((r: { id: string; name: string; description?: string; points?: number; icon?: string; type?: string; linkId?: string }) => ({
              id: r.id,
              name: r.name || '未知',
              description: r.description || '',
              points: r.points || 0,
              icon: r.icon || '',
              type: r.type || '',
              linkId: r.linkId,
            }));
          }
        } catch { /* ignore */ }
      }));
      setTaskGroupRewards(rewardsMap);
    } catch { /* ignore */ }
  };

  // 点击任务查看详情
  const handleTaskClick = async (task: Task) => {
    setSelectedTaskGroup(null); // 清除任务组选中
    fetchTaskDetail(task.id);
    // 加载组内任务的激励
    if (task.task_group_id) {
      fetchSiblingRewards(task.task_group_id);
    }
  };

  // 点击任务组标题查看任务组信息
  const handleTaskGroupClick = async (groupId: string, groupName: string, variants: Task[], stage: number) => {
    setSelectedTask(null); // 清除单个任务选中
    // 始终从API获取最新数据，确保 requirements/learning_goals/tools/skills/rewards 与数据库一致
    const updatedVariants = await Promise.all(variants.map(async (v) => {
      try {
        const res = await fetch(`/api/tasks/${v.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.task) {
            return { 
              ...v, 
              requirements: data.task.requirements || [], 
              learning_goals: data.task.learning_goals || [],
              tools: data.task.tools || [],
              skills: data.task.skills || [],
              rewards: data.task.rewards || [],
            };
          }
        }
      } catch (e) {
        // 忽略错误，使用本地数据
      }
      return v;
    }));
    // 加载组内所有任务的激励
    fetchSiblingRewards(groupId);
    setSelectedTaskGroup({ groupId, groupName, groupDescription: updatedVariants[0]?.group_description || '', variants: updatedVariants as TaskDetail[], stage });
  };

  // 关闭任务详情面板
  const handleCloseTaskDetail = () => {
    setSelectedTask(null);
    setSelectedTaskGroup(null);
    setShowToolSelector(false);
    setShowSkillSelector(false);
    setShowRewardSelector(false);
  };

  // 打开补充难度任务对话框
  const openAddDiffDialog = (taskGroupId: string, groupName: string, difficulty: 'easy' | 'medium' | 'hard', stage: number, themeId: string, groupDescription?: string) => {
    const diffLabel = difficulty === 'easy' ? '简单' : difficulty === 'hard' ? '困难' : '中等';
    const defaultPoints = difficulty === 'easy' ? 6 : difficulty === 'hard' ? 18 : 10;
    setAddDiffForm({
      taskGroupId,
      groupName,
      difficulty,
      title: `${groupName}（${diffLabel}）`,
      description: '',
      points: defaultPoints,
      requirements: [],
      learningGoals: [],
      stage,
      themeId,
      groupDescription: groupDescription || '',
    });
    setNewDiffReq('');
    setNewDiffGoal('');
    setShowAddDiffDialog(true);
  };

  // 保存补充难度任务
  const handleSaveDiffTask = async () => {
    if (!addDiffForm.title.trim()) {
      toast.error('请输入任务标题');
      return;
    }
    if (!admin?.id) {
      toast.error('请先登录后再操作');
      return;
    }
    setIsSavingDiffTask(true);
    try {
      // ★★★ 从 ref 读取最新表单数据 ★★★
      const form = addDiffFormRef.current;
      const formSnapshot = {
        themeId: form.themeId,
        title: form.title.trim(),
        description: form.description.trim(),
        groupName: form.groupName,
        stage: form.stage,
        points: form.points,
        difficulty: form.difficulty,
        taskGroupId: form.taskGroupId,
        requirements: [...form.requirements],
        learningGoals: [...form.learningGoals],
      };
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeId: formSnapshot.themeId,
          title: formSnapshot.title,
          description: formSnapshot.description,
          groupName: formSnapshot.groupName,
          groupDescription: form.groupDescription,
          stage: formSnapshot.stage,
          points: formSnapshot.points,
          taskType: 'main',
          difficulty: formSnapshot.difficulty,
          taskGroupId: formSnapshot.taskGroupId,
          requirements: formSnapshot.requirements,
          learningGoals: formSnapshot.learningGoals,
          userId: admin?.id,
          userRole: admin?.role,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const diffLabel = addDiffForm.difficulty === 'easy' ? '简单' : addDiffForm.difficulty === 'hard' ? '困难' : '中等';
        toast.success(`${diffLabel}难度任务创建成功`);
        setShowAddDiffDialog(false);
        await fetchTasks();
        // 刷新任务组数据并自动打开侧边栏（使用 handleTaskGroupClick 确保获取最新 requirements/learning_goals）
        try {
          const freshRes = await fetch(`/api/tasks?themeId=${addDiffForm.themeId}`);
          if (freshRes.ok) {
            const freshData = await freshRes.json();
            const freshVariants = (freshData.tasks || []).filter((t: Task) => t.task_group_id === addDiffForm.taskGroupId && t.is_active);
            if (freshVariants.length > 0) {
              await handleTaskGroupClick(addDiffForm.taskGroupId, addDiffForm.groupName, freshVariants, addDiffForm.stage);
            }
          }
        } catch (e) {
          // 忽略刷新错误
        }
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch (error) {
      console.error('创建难度任务失败:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsSavingDiffTask(false);
    }
  };

  // 刷新当前选中任务的详情
  const refreshSelectedTask = async () => {
    if (selectedTask) {
      await fetchTaskDetail(selectedTask.id);
    }
  };

  // 打开工具详情弹窗
  const openToolDetail = (tool: Tool, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // 阻止事件冒泡
    }
    setDetailTool(tool);
    setShowToolDetail(true);
  };

  // ============ 工具操作 ============
  const handleAddTool = async (toolId: string) => {
    if (!selectedTask) return;
    
    setIsAddingItem(true);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, isRequired: newToolRequired }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(newToolRequired ? '必选工具已添加' : '可选工具已添加');
        if (data.autoAddedSkills && data.autoAddedSkills.length > 0) {
          toast.success(`已自动添加 ${data.autoAddedSkills.length} 个关联技能`);
        }
        await refreshSelectedTask();
      } else {
        toast.error(data.error || '添加失败');
      }
    } catch (error) {
      toast.error('添加失败');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveTool = async (toolId: string) => {
    if (!selectedTask) return;
    
    setRemovingItemId(toolId);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/tools?toolId=${toolId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('工具已移除');
        await refreshSelectedTask();
      } else {
        toast.error(data.error || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
    } finally {
      setRemovingItemId(null);
    }
  };

  const handleToggleToolRequired = async (toolId: string, isRequired: boolean) => {
    if (!selectedTask) return;
    
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/tools/${toolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRequired }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(isRequired ? '已设为必选' : '已设为可选');
        await refreshSelectedTask();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  // ============ 技能操作 ============
  const handleAddSkill = async (skillId: string) => {
    if (!selectedTask) return;
    
    const points = selectedSkillPoints[skillId] || 5;
    setIsAddingItem(true);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, points, isRequired: true }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('技能已添加');
        await refreshSelectedTask();
      } else {
        toast.error(data.error || '添加失败');
      }
    } catch (error) {
      toast.error('添加失败');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    if (!selectedTask) return;
    
    setRemovingItemId(skillId);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/skills?skillId=${skillId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('技能已移除');
        await refreshSelectedTask();
      } else {
        toast.error(data.error || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
    } finally {
      setRemovingItemId(null);
    }
  };

  // ============ 激励操作 ============
  const handleAddReward = async (rewardId: string, targetTaskId?: string) => {
    const taskId = targetTaskId || selectedTask?.id;
    if (!taskId) return;
    
    setIsAddingItem(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/rewards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('激励已添加');
        await refreshSelectedTask();
        if (selectedTask?.task_group_id) {
          await fetchSiblingRewards(selectedTask.task_group_id);
        }
      } else {
        toast.error(data.error || '添加失败');
      }
    } catch (error) {
      toast.error('添加失败');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveReward = async (linkId: string, targetTaskId?: string) => {
    const taskId = targetTaskId || selectedTask?.id;
    if (!taskId) return;
    
    setRemovingItemId(linkId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/rewards/${linkId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('激励已移除');
        await refreshSelectedTask();
        if (selectedTask?.task_group_id) {
          await fetchSiblingRewards(selectedTask.task_group_id);
        }
      } else {
        toast.error(data.error || '移除失败');
      }
    } catch (error) {
      toast.error('移除失败');
    } finally {
      setRemovingItemId(null);
    }
  };

  // 计算可选的工具/技能/激励
  const availableTools = allTools.filter(
    tool => !selectedTask?.tools?.some(t => t.tools.id === tool.id)
  );
  const availableSkills = allSkills.filter(
    skill => !selectedTask?.skills?.some(s => s.skills.id === skill.id)
  );
  const availableRewards = allRewards.filter(
    reward => !selectedTask?.rewards?.some(r => r.id === reward.id)
  );

  const handleSaveTheme = async () => {
    if (!editThemeForm.name.trim()) {
      toast.error('请输入主题名称');
      return;
    }

    if (editThemeForm.isExclusive && editThemeForm.schoolIds.length === 0) {
      toast.error('专属主题至少需要选择一个学校');
      return;
    }

    if (!admin) {
      toast.error('用户信息不存在');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/themes/${themeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editThemeForm.name,
          description: editThemeForm.description,
          icon: editThemeForm.icon,
          is_exclusive: editThemeForm.isExclusive,
          schoolIds: editThemeForm.isExclusive ? editThemeForm.schoolIds : [],
          finalTaskFormId: editThemeForm.finalTaskFormId || null,
          // 三个角色的表单ID
          guiderFormId: editThemeForm.guiderFormId || null,
          lightMageFormId: editThemeForm.lightMageFormId || null,
          secretScholarFormId: editThemeForm.secretScholarFormId || null,
          userId: admin?.id,
          userRole: admin?.role,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('主题信息已更新');
        setTheme(data.theme);
        setIsEditingTheme(false);
        fetchThemeDetail();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch (error) {
      toast.error('更新失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTheme = async () => {
    if (!confirm('确定要删除这个主题吗？删除后无法恢复。')) return;

    if (!admin) {
      toast.error('用户信息不存在');
      return;
    }

    try {
      const res = await fetch(`/api/themes/${themeId}?userId=${admin?.id}&userRole=${admin?.role}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('主题已删除');
        router.push('/admin/tasks');
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const openCreateTaskDialog = () => {
    setEditingTask(null);
    // 计算下一个阶段号
    const existingStages = tasks.map(t => t.stage);
    const nextStage = existingStages.length > 0 ? Math.max(...existingStages) + 1 : 1;
    setTaskForm({
      groupName: '',
      groupDescription: '',
      title: '',
      description: '',
      stage: nextStage,
      points: 10,
      taskType: 'main',
      difficulty: 'medium',
      easyTitle: '',
      easyDescription: '',
      easyPoints: 6,
      easyRequirements: [] as string[],
      easyLearningGoals: [] as string[],
      mediumTitle: '',
      mediumDescription: '',
      mediumPoints: 10,
      mediumRequirements: [] as string[],
      mediumLearningGoals: [] as string[],
      hardTitle: '',
      hardDescription: '',
      hardPoints: 18,
      hardRequirements: [] as string[],
      hardLearningGoals: [] as string[],
    });
    setNewEasyReq(''); setNewEasyGoal('');
    setNewMediumReq(''); setNewMediumGoal('');
    setNewHardReq(''); setNewHardGoal('');
    setShowTaskDialog(true);
  };

  const openEditTaskDialog = (task: Task) => {
    setEditingTask(task);
    const diffKey = (task.difficulty || 'medium') as 'easy' | 'medium' | 'hard';
    setTaskForm({
      groupName: task.group_name || '',
      groupDescription: task.group_description || '',
      title: task.title,
      description: task.description || '',
      stage: task.stage || 1,
      points: task.points || 10,
      taskType: task.task_type || 'main',
      difficulty: task.difficulty || 'medium',
      easyTitle: diffKey === 'easy' ? task.title : '',
      easyDescription: diffKey === 'easy' ? (task.description || '') : '',
      easyPoints: diffKey === 'easy' ? (task.points || 6) : 6,
      easyRequirements: diffKey === 'easy' ? (task.requirements || []) : [],
      easyLearningGoals: diffKey === 'easy' ? (task.learning_goals || []) : [],
      mediumTitle: diffKey === 'medium' ? task.title : '',
      mediumDescription: diffKey === 'medium' ? (task.description || '') : '',
      mediumPoints: diffKey === 'medium' ? (task.points || 10) : 10,
      mediumRequirements: diffKey === 'medium' ? (task.requirements || []) : [],
      mediumLearningGoals: diffKey === 'medium' ? (task.learning_goals || []) : [],
      hardTitle: diffKey === 'hard' ? task.title : '',
      hardDescription: diffKey === 'hard' ? (task.description || '') : '',
      hardPoints: diffKey === 'hard' ? (task.points || 18) : 18,
      hardRequirements: diffKey === 'hard' ? (task.requirements || []) : [],
      hardLearningGoals: diffKey === 'hard' ? (task.learning_goals || []) : [],
    });
    setShowTaskDialog(true);
  };

  const handleSaveTask = async () => {
    if (!editingTask) {
      // 创建模式：任务组名称必填，至少一个难度版本标题必填
      if (!taskForm.groupName.trim()) {
        toast.error('请输入任务组名称');
        return;
      }
      if (!taskForm.easyTitle.trim() && !taskForm.mediumTitle.trim() && !taskForm.hardTitle.trim()) {
        toast.error('请至少填写一个难度版本的标题');
        return;
      }
    } else {
      if (!taskForm.title.trim()) {
        toast.error('请输入任务标题');
        return;
      }
    }

    if (!admin) {
      toast.error('用户信息不存在');
      return;
    }

    setIsSavingTask(true);
    try {
      if (editingTask) {
        // 编辑任务：根据当前任务的难度获取对应的 requirements 和 learningGoals
        const form = taskFormRef.current;
        const diffKey = (editingTask.difficulty || 'medium') as 'easy' | 'medium' | 'hard';
        const editSnapshot = {
          title: form.title,
          description: form.description,
          groupName: form.groupName,
          stage: form.stage,
          points: form.points,
          taskType: form.taskType,
          difficulty: form.difficulty,
          requirements: [...(diffKey === 'easy' ? form.easyRequirements : diffKey === 'hard' ? form.hardRequirements : form.mediumRequirements)],
          learningGoals: [...(diffKey === 'easy' ? form.easyLearningGoals : diffKey === 'hard' ? form.hardLearningGoals : form.mediumLearningGoals)],
        };
        // 检查用户登录状态
        if (!admin?.id) {
          toast.error('请先登录后再操作');
          setIsSavingTask(false);
          return;
        }

        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editSnapshot.title,
            description: editSnapshot.description,
            groupName: editSnapshot.groupName,
            groupDescription: form.groupDescription,
            stage: editSnapshot.stage,
            points: editSnapshot.points,
            taskType: editSnapshot.taskType,
            difficulty: editSnapshot.difficulty,
            requirements: editSnapshot.requirements,
            learning_goals: editSnapshot.learningGoals,
            userId: admin.id,
            userRole: admin.role,
          }),
        });

        let data: { success?: boolean; error?: string; [key: string]: unknown } = {};
        try {
          const text = await res.text();
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          console.error('解析响应失败:', e);
        }
        if (res.ok && data.success) {
          toast.success('任务已更新');
          setShowTaskDialog(false);
          setEditingTask(null);
          await fetchTasks();
        } else {
          // 显示后端返回的具体错误信息
          const errorMsg = data.error || `更新失败(状态码:${res.status})`;
          toast.error(errorMsg);
          console.error('任务更新失败:', { status: res.status, data });
        }
      } else {
        // 创建任务：使用任务组模式，一次性创建所有难度版本
        // 检查用户登录状态
        if (!admin?.id) {
          toast.error('请先登录后再操作');
          setIsSavingTask(false);
          return;
        }

        // 从 ref 读取最新的表单数据，避免闭包陈旧问题
        const form = taskFormRef.current;
        const groupName = form.groupName.trim();
        const stage = form.stage;
        const taskType = form.taskType;

        const easyData = form.easyTitle.trim() ? {
          difficulty: 'easy' as const,
          title: form.easyTitle.trim(),
          description: form.easyDescription.trim(),
          points: Number(form.easyPoints) || 6,
          requirements: [...form.easyRequirements],
          learningGoals: [...form.easyLearningGoals],
          groupName,
          groupDescription: form.groupDescription.trim(),
        } : null;
        const mediumData = form.mediumTitle.trim() ? {
          difficulty: 'medium' as const,
          title: form.mediumTitle.trim(),
          description: form.mediumDescription.trim(),
          points: Number(form.mediumPoints) || 10,
          requirements: [...form.mediumRequirements],
          learningGoals: [...form.mediumLearningGoals],
          groupName,
          groupDescription: form.groupDescription.trim(),
        } : null;
        const hardData = form.hardTitle.trim() ? {
          difficulty: 'hard' as const,
          title: form.hardTitle.trim(),
          description: form.hardDescription.trim(),
          points: Number(form.hardPoints) || 18,
          requirements: [...form.hardRequirements],
          learningGoals: [...form.hardLearningGoals],
          groupName,
          groupDescription: form.groupDescription.trim(),
        } : null;

        const taskGroup = [easyData, mediumData, hardData].filter((d): d is NonNullable<typeof d> => d !== null);

        if (taskGroup.length === 0) {
          toast.error('请至少填写一个难度版本的任务标题');
          setIsSavingTask(false);
          return;
        }

        // 使用任务组模式：一次性创建所有难度版本，确保 requirements/learningGoals 正确保存
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            themeId,
            groupName,
            stage,
            taskType,
            taskGroup,
            userId: admin.id,
            userRole: admin.role,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          const createdTasks = data.tasks || [];
          const diffNames = taskGroup.map(v => v.difficulty === 'easy' ? '简单' : v.difficulty === 'hard' ? '困难' : '中等');
          toast.success(`任务创建成功（包含${diffNames.join('、')}难度版本）`);
          setShowTaskDialog(false);
          setEditingTask(null);
          await fetchTasks();
          // 创建成功后自动打开任务组侧边栏
          if (createdTasks.length > 0) {
            const groupId = createdTasks[0].task_group_id;
            if (groupId) {
              try {
                const checkRes = await fetch(`/api/tasks?themeId=${themeId}`);
                const checkData = await checkRes.json();
                const allTasks = checkData.tasks || [];
                const groupTasks = allTasks.filter((t: Task) => t.task_group_id === groupId);
                if (groupTasks.length > 0) {
                  handleTaskGroupClick(groupId, groupName, groupTasks, stage);
                }
              } catch (e) {
                // 忽略，用户可手动点击查看
              }
            }
          }
        } else {
          toast.error(data.error || '创建失败，请稍后重试');
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsSavingTask(false);
    }
  };

  // 按阶段分组的任务
  const groupedTasks = tasks.reduce((acc, task) => {
    const stage = task.stage;
    if (!acc[stage]) {
      acc[stage] = [];
    }
    acc[stage].push(task);
    // 每个阶段内按 order_index 排序
    acc[stage].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    return acc;
  }, {} as Record<number, Task[]>);

  // 在阶段内按 task_group_id 聚合，形成"概念任务组"
  const groupedByTaskGroup = (stageTasks: Task[]): { groupKey: string; tasks: Task[] }[] => {
    const groupMap = new Map<string, Task[]>();
    for (const task of stageTasks) {
      const key = task.task_group_id || task.id;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(task);
    }
    // 按 order_index 排序组
    const groups = Array.from(groupMap.entries()).map(([groupKey, groupTasks]) => ({
      groupKey,
      tasks: groupTasks.sort((a, b) => {
        const diffOrder = { easy: 0, medium: 1, hard: 2 };
        return (diffOrder[a.difficulty as keyof typeof diffOrder] ?? 1) - (diffOrder[b.difficulty as keyof typeof diffOrder] ?? 1);
      }),
    }));
    groups.sort((a, b) => (a.tasks[0]?.order_index || 0) - (b.tasks[0]?.order_index || 0));
    return groups;
  };

  // 获取阶段列表（按阶段号排序）
  const sortedStages = Object.keys(groupedTasks).map(Number).sort((a, b) => a - b);

  // 在同一阶段内移动任务（互换 order_index）
  const handleMoveTask = async (taskId: string, direction: 'up' | 'down') => {
    if (!admin) return;
    
    // 找到任务所在的阶段和位置
    let taskStage: number | null = null;
    let taskIndex = -1;
    
    for (const stage of sortedStages) {
      const idx = groupedTasks[stage].findIndex(t => t.id === taskId);
      if (idx !== -1) {
        taskStage = stage;
        taskIndex = idx;
        break;
      }
    }
    
    if (taskStage === null) return;
    
    const stageTasks = groupedTasks[taskStage];
    
    // 检查是否可以移动（不能跨阶段）
    if (
      (direction === 'up' && taskIndex === 0) ||
      (direction === 'down' && taskIndex === stageTasks.length - 1)
    ) {
      toast.error('只能在同阶段内互换相邻任务的顺序');
      return;
    }

    const swapIndex = direction === 'up' ? taskIndex - 1 : taskIndex + 1;
    const currentTask = stageTasks[taskIndex];
    const swapTask = stageTasks[swapIndex];

    // 交换 order_index
    const currentOrderIndex = currentTask.order_index || taskIndex;
    const swapOrderIndex = swapTask.order_index || swapIndex;

    // 乐观更新
    const newTasks = tasks.map(t => {
      if (t.id === currentTask.id) {
        return { ...t, order_index: swapOrderIndex };
      }
      if (t.id === swapTask.id) {
        return { ...t, order_index: currentOrderIndex };
      }
      return t;
    });
    setTasks(newTasks);

    try {
      await Promise.all([
        fetch(`/api/tasks/${currentTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            order_index: swapOrderIndex,
            userId: admin?.id,
            userRole: admin?.role,
          }),
        }),
        fetch(`/api/tasks/${swapTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            order_index: currentOrderIndex,
            userId: admin?.id,
            userRole: admin?.role,
          }),
        }),
      ]);
      toast.success('任务顺序已更新');
    } catch (error) {
      console.error('更新任务顺序失败:', error);
      fetchTasks();
      toast.error('更新任务顺序失败');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;

    if (!admin) {
      toast.error('用户信息不存在');
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}?userId=${admin?.id}&userRole=${admin?.role}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('任务已删除');
        fetchTasks();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 按难度添加/删除任务要求和学习目标的通用函数
  const addDiffRequirement = (diff: 'easy' | 'medium' | 'hard', value: string, setter: (v: string) => void) => {
    if (value.trim()) {
      const field = `${diff}Requirements` as keyof typeof taskForm;
      setTaskForm(prev => ({ ...prev, [field]: [...(prev[field] as string[]), value.trim()] }));
      setter('');
    }
  };

  const removeDiffRequirement = (diff: 'easy' | 'medium' | 'hard', index: number) => {
    const field = `${diff}Requirements` as keyof typeof taskForm;
    setTaskForm(prev => ({ ...prev, [field]: (prev[field] as string[]).filter((_, i) => i !== index) }));
  };

  const addDiffGoal = (diff: 'easy' | 'medium' | 'hard', value: string, setter: (v: string) => void) => {
    if (value.trim()) {
      const field = `${diff}LearningGoals` as keyof typeof taskForm;
      setTaskForm(prev => ({ ...prev, [field]: [...(prev[field] as string[]), value.trim()] }));
      setter('');
    }
  };

  const removeDiffGoal = (diff: 'easy' | 'medium' | 'hard', index: number) => {
    const field = `${diff}LearningGoals` as keyof typeof taskForm;
    setTaskForm(prev => ({ ...prev, [field]: (prev[field] as string[]).filter((_, i) => i !== index) }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">主题不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <Button variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => router.push('/admin/tasks')}>
              <ArrowLeft className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline">返回</span>
            </Button>
            <h1 className="text-base md:text-lg font-bold flex items-center gap-2 truncate">
              <span className="text-xl md:text-2xl shrink-0">{theme.icon}</span>
              <span className="truncate">{theme.name}</span>
            </h1>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {!isEditingTheme && (
              <>
                {!permissions.canEdit && admin?.role === 'teacher' ? (
                  <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                    <Lock className="w-3 h-3 mr-1" />
                    只读
                  </Badge>
                ) : isGlobalTheme && !permissions.canEdit ? (
                  <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                    <Lock className="w-3 h-3 mr-1" />
                    只读
                  </Badge>
                ) : null}
                {permissions.canEdit && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditingTheme(true)}>
                    <Edit className="w-4 h-4 md:mr-1" />
                    <span className="hidden md:inline">编辑主题</span>
                  </Button>
                )}
                {permissions.canDelete && (
                  <Button variant="outline" size="sm" className="text-red-600" onClick={handleDeleteTheme}>
                    <Trash2 className="w-4 h-4 md:mr-1" />
                    <span className="hidden md:inline">删除</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* 权限提示 */}
        {!permissions.canEdit && admin?.role === 'teacher' ? (
          <Card className="border-0 shadow-sm bg-orange-50 border-orange-200">
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-500" />
                <p className="text-sm text-orange-700">
                  助学老师角色对全局主题和专属主题都仅有只读权限，无法新建和编辑。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : isGlobalTheme && !permissions.canEdit ? (
          <Card className="border-0 shadow-sm bg-orange-50 border-orange-200">
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-500" />
                <p className="text-sm text-orange-700">
                  这是全局主题，您只能查看，无法编辑或删除。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* 主题信息卡片 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">主题信息</CardTitle>
              {isEditingTheme && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditingTheme(false)}>
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                  <Button size="sm" onClick={handleSaveTheme} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditingTheme ? (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>主题名称</Label>
                    <Input
                      value={editThemeForm.name}
                      onChange={(e) => setEditThemeForm({ ...editThemeForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>主题图标</Label>
                    <div className="flex flex-wrap gap-2">
                      {iconOptions.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setEditThemeForm({ ...editThemeForm, icon })}
                          className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                            editThemeForm.icon === icon 
                              ? 'bg-blue-500 ring-2 ring-blue-300' 
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>主题描述</Label>
                  <Textarea
                    value={editThemeForm.description}
                    onChange={(e) => setEditThemeForm({ ...editThemeForm, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>主题性质</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!editThemeForm.isExclusive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditThemeForm({ ...editThemeForm, isExclusive: false, schoolIds: [] })}
                      className={!editThemeForm.isExclusive ? "bg-blue-500 hover:bg-blue-600" : ""}
                    >
                      <Globe className="w-4 h-4 mr-1" />
                      全局主题
                    </Button>
                    <Button
                      type="button"
                      variant={editThemeForm.isExclusive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditThemeForm({ ...editThemeForm, isExclusive: true })}
                      className={editThemeForm.isExclusive ? "bg-purple-500 hover:bg-purple-600" : ""}
                    >
                      <School className="w-4 h-4 mr-1" />
                      专属主题
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {!editThemeForm.isExclusive 
                      ? "全局主题：所有学校的小队都可以选择" 
                      : "专属主题：仅指定学校的小队可以选择"}
                  </p>
                </div>

                {editThemeForm.isExclusive && (
                  <div className="space-y-2">
                    <Label>专属学校（可多选）</Label>
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                      {schools.map((school) => (
                        <div key={school.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`school-${school.id}`}
                            checked={editThemeForm.schoolIds.includes(school.id)}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setEditThemeForm({ 
                                  ...editThemeForm, 
                                  schoolIds: [...editThemeForm.schoolIds, school.id] 
                                });
                              } else {
                                setEditThemeForm({ 
                                  ...editThemeForm, 
                                  schoolIds: editThemeForm.schoolIds.filter(id => id !== school.id) 
                                });
                              }
                            }}
                          />
                          <label htmlFor={`school-${school.id}`} className="text-sm cursor-pointer">
                            {school.name}
                          </label>
                        </div>
                      ))}
                    </div>
                    {editThemeForm.schoolIds.length > 0 && (
                      <p className="text-xs text-purple-600">
                        已选择 {editThemeForm.schoolIds.length} 所学校
                      </p>
                    )}
                  </div>
                )}

                {/* 最后任务表单 - 一键配置 */}
                <div className="space-y-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <Label className="text-base font-medium">最后任务反馈表单</Label>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAutoConfigureFinalTask}
                      disabled={isConfiguringFinal}
                      className="bg-white"
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      {isConfiguringFinal ? '配置中...' : '一键配置'}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-700">
                    点击&ldquo;一键配置&rdquo;自动按角色匹配反馈表单。所有队员完成对应表单后，该主题才算完成。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editThemeForm.guiderFormId && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">🧭 指引者已配置</Badge>
                    )}
                    {editThemeForm.lightMageFormId && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">✨ 光影法师已配置</Badge>
                    )}
                    {editThemeForm.secretScholarFormId && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">📚 秘语学者已配置</Badge>
                    )}
                    {!editThemeForm.guiderFormId && !editThemeForm.lightMageFormId && !editThemeForm.secretScholarFormId && (
                      <Badge variant="outline" className="text-amber-500 border-amber-300">未配置</Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">主题名称</p>
                  <p className="text-lg font-semibold">{theme.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">主题性质</p>
                  <div className="mt-1">
                    {theme.is_exclusive ? (
                      <div className="flex flex-wrap gap-1">
                        {theme.exclusiveSchools && theme.exclusiveSchools.length > 0 ? (
                          theme.exclusiveSchools.map((s) => (
                            <Badge key={s.id} variant="secondary">
                              <School className="w-3 h-3 mr-1" />
                              {s.name}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary">
                            <School className="w-3 h-3 mr-1" />
                            专属主题
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline">
                        <Globe className="w-3 h-3 mr-1" />
                        全局主题
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">任务组数量</p>
                  <p className="text-lg font-semibold text-blue-600">{theme.taskCount}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">已选小队</p>
                  <p className="text-lg font-semibold text-purple-600">{theme.teamCount}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">最后任务</p>
                  <div className="flex flex-wrap gap-2">
                    {theme.guider_form_id ? (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        🧭 指引者
                      </Badge>
                    ) : null}
                    {theme.light_mage_form_id ? (
                      <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                        ✨ 光影法师
                      </Badge>
                    ) : null}
                    {theme.secret_scholar_form_id ? (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                        📚 秘语学者
                      </Badge>
                    ) : null}
                    {!theme.guider_form_id && !theme.light_mage_form_id && !theme.secret_scholar_form_id && (
                      <Badge variant="outline" className="text-amber-500 border-amber-300 cursor-pointer" onClick={() => setIsEditingTheme(true)}>
                        未配置 - 点击编辑
                      </Badge>
                    )}
                  </div>
                </div>
                {theme.description && (
                  <div className="md:col-span-2 lg:col-span-4">
                    <p className="text-sm text-gray-500">主题描述</p>
                    <p className="text-base">{theme.description}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 任务列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">阶段任务 ({new Set(tasks.filter(t => t.task_type !== 'final').map(t => t.task_group_id)).size} 个任务组)</CardTitle>
                {!theme.guider_form_id && !theme.light_mage_form_id && !theme.secret_scholar_form_id && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 cursor-pointer" onClick={() => setIsEditingTheme(true)}>
                    最后任务未配置
                  </Badge>
                )}
                {theme.guider_form_id && theme.light_mage_form_id && theme.secret_scholar_form_id && (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50">
                    最后任务已配置
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleAutoConfigureFinalTask} disabled={isConfiguringFinal} title="自动按角色匹配最后任务表单并保存">
                  <Trophy className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{isConfiguringFinal ? '配置中...' : '配置最后任务'}</span>
                </Button>
                {permissions.canAddTask && (
                  <Button size="sm" onClick={openCreateTaskDialog}>
                    <Plus className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">添加任务组</span>
                    <span className="sm:hidden">添加</span>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂无任务</p>
                {permissions.canAddTask && (
                  <p className="text-sm mt-1">点击右上角按钮添加任务组</p>
                )}
                {!permissions.canAddTask && (
                  <p className="text-sm mt-1">您没有权限添加任务组</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* 按阶段分组展示 */}
                {sortedStages.map((stage) => {
                  const stageTasks = groupedTasks[stage];
                  // 按 task_group_id 分组
                  const groupMap = new Map<string, Task[]>();
                  stageTasks.forEach(task => {
                    const gid = task.task_group_id || task.id;
                    if (!groupMap.has(gid)) groupMap.set(gid, []);
                    groupMap.get(gid)!.push(task);
                  });
                  const taskGroups = Array.from(groupMap.entries());
                  // 按 order_index 排序（取组内最小 order_index）
                  taskGroups.sort((a, b) => {
                    const minA = Math.min(...a[1].map(t => t.order_index));
                    const minB = Math.min(...b[1].map(t => t.order_index));
                    return minA - minB;
                  });

                  return (
                    <div key={stage} className="space-y-3">
                      {/* 阶段标题 */}
                      <div className="flex items-center gap-2 px-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {stage}
                        </div>
                        <h3 className="font-semibold text-gray-700 text-sm sm:text-base">阶段 {stage}</h3>
                        <Badge variant="outline" className="text-xs">
                          {taskGroups.length} 个任务组
                        </Badge>
                      </div>
                      
                      {/* 阶段内的任务组列表 */}
                      <div className="space-y-3 ml-1 sm:ml-2 border-l-2 border-blue-100 pl-2 sm:pl-4">
                        {taskGroups.map(([groupId, variants], groupIndex) => {
                          const easyVariant = variants.find(t => t.difficulty === 'easy');
                          const mediumVariant = variants.find(t => t.difficulty === 'medium');
                          const hardVariant = variants.find(t => t.difficulty === 'hard');
                          const groupName = variants[0]?.group_name;
                          const displayTitle = groupName || mediumVariant?.title || easyVariant?.title || hardVariant?.title || '未命名任务组';
                          // 任务组描述：优先使用任务组描述，其次简单难度描述
                          const displayDesc = variants[0]?.group_description || easyVariant?.description || mediumVariant?.description || hardVariant?.description || '暂无描述';
                          
                          const isFinalTask = variants[0]?.task_type === 'final';
                          
                          return (
                            <div key={groupId} className="border rounded-lg overflow-hidden">
                              {/* 任务组标题行 */}
                              <div className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 ${isFinalTask ? 'bg-amber-50' : 'bg-gray-50'} hover:bg-blue-50 cursor-pointer transition-colors`}
                                onClick={() => {
                                  if (isFinalTask) {
                                    const primaryTask = variants[0];
                                    if (primaryTask) handleTaskClick(primaryTask);
                                  } else {
                                    handleTaskGroupClick(groupId, displayTitle, variants, variants[0]?.stage || 1);
                                  }
                                }}>
                                {permissions.canEditTask && (
                                  <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => { const t = isFinalTask ? variants[0] : (mediumVariant || easyVariant || hardVariant); if(t) handleMoveTask(t.id, 'up'); }} disabled={groupIndex === 0} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed" title="上移">
                                      <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                                    </button>
                                    <button onClick={() => { const t = isFinalTask ? variants[0] : (mediumVariant || easyVariant || hardVariant); if(t) handleMoveTask(t.id, 'down'); }} disabled={groupIndex === taskGroups.length - 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed" title="下移">
                                      <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                                    </button>
                                  </div>
                                )}
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-600 font-medium text-xs sm:text-sm shrink-0">
                                  {groupIndex + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 sm:gap-2">
                                    <h3 className="font-semibold text-sm sm:text-base truncate">{isFinalTask ? variants[0]?.title : (groupName || displayTitle)}</h3>
                                    {variants[0]?.task_type === 'side' && (
                                      <Badge variant="secondary" className="shrink-0 text-xs">支线</Badge>
                                    )}
                                    {isFinalTask && (
                                      <Badge className="shrink-0 text-xs bg-amber-100 text-amber-700 border-amber-200">🏁 最后任务</Badge>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                  </div>
                                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5 line-clamp-1">{isFinalTask ? variants[0]?.description : displayDesc}</p>
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {permissions.canDeleteTask && (
                                    <Button variant="outline" size="sm" className="text-red-600" onClick={async () => {
                                      const msg = isFinalTask ? '确定要删除此最后任务吗？' : '确定要删除此任务组（所有难度版本）吗？';
                                      if (!confirm(msg)) return;
                                      for (const v of variants) {
                                        try {
                                          await fetch(`/api/tasks/${v.id}?userId=${admin?.id}&userRole=${admin?.role}`, { method: 'DELETE' });
                                        } catch {}
                                      }
                                      fetchTasks();
                                      toast.success(isFinalTask ? '任务已删除' : '任务组已删除');
                                    }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              
                              {/* 最后任务不区分难度，只显示单一任务信息 */}
                              {isFinalTask ? (
                                <div className="p-4 border-t bg-amber-50/30">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">🏁 最后任务（不区分难度）</Badge>
                                    <Badge variant="outline" className="text-xs">{variants[0]?.points}分</Badge>
                                    {permissions.canEditTask && (
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={() => openEditTaskDialog(variants[0])}>
                                        <Edit className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600">{variants[0]?.description || '暂无描述'}</p>
                                </div>
                              ) : (
                              /* 三个难度变体 */
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t">
                                {[
                                  { variant: easyVariant, label: '简单', color: 'bg-green-50 border-green-200 text-green-700', icon: '🌟' },
                                  { variant: mediumVariant, label: '中等', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: '⚡' },
                                  { variant: hardVariant, label: '困难', color: 'bg-red-50 border-red-200 text-red-700', icon: '🔥' },
                                ].map(({ variant, label, color, icon }) => {
                                  const diffKey = label === '简单' ? 'easy' : label === '困难' ? 'hard' : 'medium';
                                  return (
                                  <div 
                                    key={label}
                                    className={`p-3 md:border-r last:border-r-0 border-b md:border-b-0 ${variant ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer border-dashed'}`}
                                    onClick={() => { 
                                      if (variant) {
                                        handleTaskClick(variant); 
                                      } else if (permissions.canEditTask) {
                                        openAddDiffDialog(groupId, displayTitle, diffKey, variants[0]?.stage || 1, themeId, variants[0]?.group_description);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="text-xs">{icon}</span>
                                      <Badge className={`text-xs ${color}`}>{label}</Badge>
                                      {variant && (
                                        <Badge variant="outline" className="text-xs ml-auto">{variant.points}分</Badge>
                                      )}
                                      {!variant && (
                                        <span className="text-xs text-gray-400 ml-auto">未设置</span>
                                      )}
                                    </div>
                                    {variant ? (
                                      <>
                                        <p className="text-sm font-medium truncate">{variant.title}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{variant.description || '暂无描述'}</p>
                                        <div className="flex items-center gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                                          {permissions.canSetTask && (
                                            <Button variant="ghost" size="sm" className="h-6 px-1.5 gap-0.5 text-xs text-gray-500 hover:text-blue-600" onClick={() => router.push(`/admin/task/${variant.id}`)}>
                                              <Settings className="w-3 h-3" />
                                              设置
                                            </Button>
                                          )}
                                          {permissions.canEditTask && (
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditTaskDialog(variant)}>
                                              <Edit className="w-3 h-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center py-3 gap-1">
                                        <Plus className="w-5 h-5 text-gray-400" />
                                        <p className="text-xs text-gray-500">点击配置{label}任务</p>
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 任务编辑对话框 */}
      {showTaskDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-0 md:p-4">
          <Card className="w-full md:max-w-2xl max-h-screen md:max-h-[90vh] overflow-y-auto rounded-none md:rounded-lg">
            <CardHeader className="sticky top-0 bg-card z-10 border-b md:border-b-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-lg">{editingTask ? '编辑任务' : '添加任务组'}</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowTaskDialog(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 创建模式：分层结构 - 任务组 → 各难度版本 */}
              {!editingTask && (
                <>
                  {/* 第一层：任务组信息 */}
                  <div className="p-4 bg-muted/50 rounded-lg border space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">任务组信息</span>
                    </div>
                    <div className="space-y-2">
                      <Label>任务组名称 *</Label>
                      <Input
                        placeholder="例如：设计实验方案"
                        value={taskForm.groupName}
                        onChange={(e) => setTaskForm(prev => ({ ...prev, groupName: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">同一任务组的所有难度版本共用此名称</p>
                    </div>
                    <div className="space-y-2">
                      <Label>任务组描述</Label>
                      <Textarea
                        placeholder="描述该任务组的整体目标和内容"
                        value={taskForm.groupDescription}
                        onChange={(e) => setTaskForm(prev => ({ ...prev, groupDescription: e.target.value }))}
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground">同一任务组的所有难度版本共用此描述</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>归属阶段 *</Label>
                        <Select
                          value={taskForm.stage.toString()}
                          onValueChange={(value) => setTaskForm(prev => ({ ...prev, stage: parseInt(value) }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择阶段" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(new Set(tasks.map(t => t.stage))).sort((a, b) => a - b).map((stage) => (
                              <SelectItem key={stage} value={stage.toString()}>
                                阶段 {stage}
                              </SelectItem>
                            ))}
                          <SelectItem value={(Math.max(0, ...tasks.map(t => t.stage)) + 1).toString()}>
                            新阶段（阶段 {Math.max(0, ...tasks.map(t => t.stage)) + 1}）
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>任务性质 *</Label>
                      <Select
                        value={taskForm.taskType}
                        onValueChange={(value) => {
                          setTaskForm(prev => ({ ...prev, taskType: value }))
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择性质" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main">
                            <div className="flex items-center gap-2">
                              <span>主线任务</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="side">
                            <div className="flex items-center gap-2">
                              <span>支线任务</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                </div>
                {/* 第二层：各难度版本 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">难度版本</span>
                    <span className="text-xs text-muted-foreground">填写标题即创建该难度版本，留空则不创建</span>
                  </div>
                  <div className="space-y-4">
                    {/* 简单版本 */}
                    <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        <Label className="text-green-700 font-medium">简单版本</Label>
                      </div>
                      <div className="space-y-3">
                        <Input
                          value={taskForm.easyTitle}
                          onChange={(e) => setTaskForm(prev => ({ ...prev, easyTitle: e.target.value }))}
                          placeholder="简单版本标题，如：了解家乡的基本信息"
                        />
                        <Textarea
                          value={taskForm.easyDescription}
                          onChange={(e) => setTaskForm(prev => ({ ...prev, easyDescription: e.target.value }))}
                          placeholder="简单版本的任务描述..."
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-green-600 whitespace-nowrap">积分奖励</Label>
                          <Input
                            type="number"
                            value={taskForm.easyPoints}
                            onChange={(e) => setTaskForm(prev => ({ ...prev, easyPoints: parseInt(e.target.value) || 6 }))}
                            min={1}
                            max={100}
                            className="w-24 h-8 text-sm"
                          />
                        </div>
                        {/* 简单版本 - 任务要求 */}
                        <div className="space-y-1.5 pt-1 border-t border-green-200/50">
                          <div className="flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-green-500" />
                            <Label className="text-xs text-green-600">任务要求</Label>
                          </div>
                          {taskForm.easyRequirements.map((req, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="flex-1 py-1 justify-start text-xs">
                                {index + 1}. {req}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDiffRequirement('easy', index)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <Input
                              value={newEasyReq}
                              onChange={(e) => setNewEasyReq(e.target.value)}
                              placeholder="输入任务要求，回车添加"
                              className="h-7 text-xs"
                              onKeyDown={(e) => e.key === 'Enter' && addDiffRequirement('easy', newEasyReq, setNewEasyReq)}
                            />
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => addDiffRequirement('easy', newEasyReq, setNewEasyReq)} disabled={!newEasyReq.trim()}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        {/* 简单版本 - 学习目标 */}
                        <div className="space-y-1.5 pt-1 border-t border-green-200/50">
                          <div className="flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
                            <Label className="text-xs text-green-600">学习目标</Label>
                          </div>
                          {taskForm.easyLearningGoals.map((goal, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <Badge variant="outline" className="flex-1 py-1 justify-start text-xs border-yellow-300 text-yellow-700">
                                {index + 1}. {goal}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDiffGoal('easy', index)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <Input
                              value={newEasyGoal}
                              onChange={(e) => setNewEasyGoal(e.target.value)}
                              placeholder="输入学习目标，回车添加"
                              className="h-7 text-xs"
                              onKeyDown={(e) => e.key === 'Enter' && addDiffGoal('easy', newEasyGoal, setNewEasyGoal)}
                            />
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => addDiffGoal('easy', newEasyGoal, setNewEasyGoal)} disabled={!newEasyGoal.trim()}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 中等版本 */}
                    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <Label className="text-blue-700 font-medium">中等版本</Label>
                      </div>
                      <div className="space-y-3">
                        <Input
                          value={taskForm.mediumTitle}
                          onChange={(e) => setTaskForm(prev => ({ ...prev, mediumTitle: e.target.value }))}
                          placeholder="中等版本标题，如：调查家乡的地理位置和历史"
                        />
                        <Textarea
                          value={taskForm.mediumDescription}
                          onChange={(e) => setTaskForm(prev => ({ ...prev, mediumDescription: e.target.value }))}
                          placeholder="中等版本的任务描述..."
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-blue-600 whitespace-nowrap">积分奖励</Label>
                          <Input
                            type="number"
                            value={taskForm.mediumPoints}
                            onChange={(e) => setTaskForm(prev => ({ ...prev, mediumPoints: parseInt(e.target.value) || 10 }))}
                            min={1}
                            max={100}
                            className="w-24 h-8 text-sm"
                          />
                        </div>
                        {/* 中等版本 - 任务要求 */}
                        <div className="space-y-1.5 pt-1 border-t border-blue-200/50">
                          <div className="flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-blue-500" />
                            <Label className="text-xs text-blue-600">任务要求</Label>
                          </div>
                          {taskForm.mediumRequirements.map((req, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="flex-1 py-1 justify-start text-xs">
                                {index + 1}. {req}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDiffRequirement('medium', index)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <Input
                              value={newMediumReq}
                              onChange={(e) => setNewMediumReq(e.target.value)}
                              placeholder="输入任务要求，回车添加"
                              className="h-7 text-xs"
                              onKeyDown={(e) => e.key === 'Enter' && addDiffRequirement('medium', newMediumReq, setNewMediumReq)}
                            />
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => addDiffRequirement('medium', newMediumReq, setNewMediumReq)} disabled={!newMediumReq.trim()}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        {/* 中等版本 - 学习目标 */}
                        <div className="space-y-1.5 pt-1 border-t border-blue-200/50">
                          <div className="flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
                            <Label className="text-xs text-blue-600">学习目标</Label>
                          </div>
                          {taskForm.mediumLearningGoals.map((goal, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <Badge variant="outline" className="flex-1 py-1 justify-start text-xs border-yellow-300 text-yellow-700">
                                {index + 1}. {goal}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDiffGoal('medium', index)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <Input
                              value={newMediumGoal}
                              onChange={(e) => setNewMediumGoal(e.target.value)}
                              placeholder="输入学习目标，回车添加"
                              className="h-7 text-xs"
                              onKeyDown={(e) => e.key === 'Enter' && addDiffGoal('medium', newMediumGoal, setNewMediumGoal)}
                            />
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => addDiffGoal('medium', newMediumGoal, setNewMediumGoal)} disabled={!newMediumGoal.trim()}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 困难版本 */}
                    <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span>
                        <Label className="text-red-700 font-medium">困难版本</Label>
                      </div>
                      <div className="space-y-3">
                        <Input
                          value={taskForm.hardTitle}
                          onChange={(e) => setTaskForm(prev => ({ ...prev, hardTitle: e.target.value }))}
                          placeholder="困难版本标题，如：深入研究家乡变迁并撰写报告"
                        />
                        <Textarea
                          value={taskForm.hardDescription}
                          onChange={(e) => setTaskForm(prev => ({ ...prev, hardDescription: e.target.value }))}
                          placeholder="困难版本的任务描述..."
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-red-600 whitespace-nowrap">积分奖励</Label>
                          <Input
                            type="number"
                            value={taskForm.hardPoints}
                            onChange={(e) => setTaskForm(prev => ({ ...prev, hardPoints: parseInt(e.target.value) || 18 }))}
                            min={1}
                            max={100}
                            className="w-24 h-8 text-sm"
                          />
                        </div>
                        {/* 困难版本 - 任务要求 */}
                        <div className="space-y-1.5 pt-1 border-t border-red-200/50">
                          <div className="flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-red-500" />
                            <Label className="text-xs text-red-600">任务要求</Label>
                          </div>
                          {taskForm.hardRequirements.map((req, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="flex-1 py-1 justify-start text-xs">
                                {index + 1}. {req}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDiffRequirement('hard', index)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <Input
                              value={newHardReq}
                              onChange={(e) => setNewHardReq(e.target.value)}
                              placeholder="输入任务要求，回车添加"
                              className="h-7 text-xs"
                              onKeyDown={(e) => e.key === 'Enter' && addDiffRequirement('hard', newHardReq, setNewHardReq)}
                            />
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => addDiffRequirement('hard', newHardReq, setNewHardReq)} disabled={!newHardReq.trim()}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        {/* 困难版本 - 学习目标 */}
                        <div className="space-y-1.5 pt-1 border-t border-red-200/50">
                          <div className="flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
                            <Label className="text-xs text-red-600">学习目标</Label>
                          </div>
                          {taskForm.hardLearningGoals.map((goal, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <Badge variant="outline" className="flex-1 py-1 justify-start text-xs border-yellow-300 text-yellow-700">
                                {index + 1}. {goal}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDiffGoal('hard', index)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <Input
                              value={newHardGoal}
                              onChange={(e) => setNewHardGoal(e.target.value)}
                              placeholder="输入学习目标，回车添加"
                              className="h-7 text-xs"
                              onKeyDown={(e) => e.key === 'Enter' && addDiffGoal('hard', newHardGoal, setNewHardGoal)}
                            />
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => addDiffGoal('hard', newHardGoal, setNewHardGoal)} disabled={!newHardGoal.trim()}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
              )}

              {/* 编辑模式：单个任务变体 */}
              {editingTask && (
                <>
                  <div className="space-y-2">
                    <Label>任务标题 *</Label>
                    <Input
                      value={taskForm.title}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="例如：家乡地理位置调查"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label>积分奖励</Label>
                      <Input
                        type="number"
                        value={taskForm.points}
                        onChange={(e) => setTaskForm(prev => ({ ...prev, points: parseInt(e.target.value) || 10 }))}
                        min={1}
                        max={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>归属阶段</Label>
                      <Select
                        value={taskForm.stage.toString()}
                        onValueChange={(value) => setTaskForm(prev => ({ ...prev, stage: parseInt(value) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(new Set(tasks.map(t => t.stage))).sort((a, b) => a - b).map((stage) => (
                            <SelectItem key={stage} value={stage.toString()}>
                              阶段 {stage}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>任务性质</Label>
                      <Select
                        value={taskForm.taskType}
                        onValueChange={(value) => setTaskForm(prev => ({ ...prev, taskType: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main">主线任务</SelectItem>
                          <SelectItem value="side">支线任务</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>难度</Label>
                      <Select
                        value={taskForm.difficulty}
                        onValueChange={(value) => setTaskForm(prev => ({ ...prev, difficulty: value as 'easy' | 'medium' | 'hard' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy"><span className="text-green-500">●</span> 简单</SelectItem>
                          <SelectItem value="medium"><span className="text-blue-500">●</span> 中等</SelectItem>
                          <SelectItem value="hard"><span className="text-red-500">●</span> 困难</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>任务描述</Label>
                    <Textarea
                      value={taskForm.description}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="详细描述任务内容..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-green-500" />
                      <Label>任务要求</Label>
                    </div>
                    <div className="space-y-2">
                      {(editingTask?.difficulty === 'easy' ? taskForm.easyRequirements : editingTask?.difficulty === 'hard' ? taskForm.hardRequirements : taskForm.mediumRequirements).map((req, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Badge variant="secondary" className="flex-1 py-1.5 justify-start">
                            {index + 1}. {req}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeDiffRequirement(editingTask?.difficulty === 'easy' ? 'easy' : editingTask?.difficulty === 'hard' ? 'hard' : 'medium', index)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={editingTask?.difficulty === 'easy' ? newEasyReq : editingTask?.difficulty === 'hard' ? newHardReq : newMediumReq} onChange={(e) => { const diff = editingTask?.difficulty === 'easy' ? setNewEasyReq : editingTask?.difficulty === 'hard' ? setNewHardReq : setNewMediumReq; diff(e.target.value); }} placeholder="输入新的任务要求" onKeyDown={(e) => { if (e.key === 'Enter') { const diff = editingTask?.difficulty as 'easy' | 'medium' | 'hard' || 'medium'; const val = diff === 'easy' ? newEasyReq : diff === 'hard' ? newHardReq : newMediumReq; const setter = diff === 'easy' ? setNewEasyReq : diff === 'hard' ? setNewHardReq : setNewMediumReq; addDiffRequirement(diff, val, setter); } }} />
                      <Button variant="outline" onClick={() => { const diff = editingTask?.difficulty as 'easy' | 'medium' | 'hard' || 'medium'; const val = diff === 'easy' ? newEasyReq : diff === 'hard' ? newHardReq : newMediumReq; const setter = diff === 'easy' ? setNewEasyReq : diff === 'hard' ? setNewHardReq : setNewMediumReq; addDiffRequirement(diff, val, setter); }} disabled={!(editingTask?.difficulty === 'easy' ? newEasyReq : editingTask?.difficulty === 'hard' ? newHardReq : newMediumReq).trim()}><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      <Label>学习目标</Label>
                    </div>
                    <div className="space-y-2">
                      {(editingTask?.difficulty === 'easy' ? taskForm.easyLearningGoals : editingTask?.difficulty === 'hard' ? taskForm.hardLearningGoals : taskForm.mediumLearningGoals).map((goal, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Badge variant="outline" className="flex-1 py-1.5 justify-start border-yellow-300 text-yellow-700">
                            {index + 1}. {goal}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeDiffGoal(editingTask?.difficulty === 'easy' ? 'easy' : editingTask?.difficulty === 'hard' ? 'hard' : 'medium', index)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={editingTask?.difficulty === 'easy' ? newEasyGoal : editingTask?.difficulty === 'hard' ? newHardGoal : newMediumGoal} onChange={(e) => { const diff = editingTask?.difficulty === 'easy' ? setNewEasyGoal : editingTask?.difficulty === 'hard' ? setNewHardGoal : setNewMediumGoal; diff(e.target.value); }} placeholder="输入新的学习目标" onKeyDown={(e) => { if (e.key === 'Enter') { const diff = editingTask?.difficulty as 'easy' | 'medium' | 'hard' || 'medium'; const val = diff === 'easy' ? newEasyGoal : diff === 'hard' ? newHardGoal : newMediumGoal; const setter = diff === 'easy' ? setNewEasyGoal : diff === 'hard' ? setNewHardGoal : setNewMediumGoal; addDiffGoal(diff, val, setter); } }} />
                      <Button variant="outline" onClick={() => { const diff = editingTask?.difficulty as 'easy' | 'medium' | 'hard' || 'medium'; const val = diff === 'easy' ? newEasyGoal : diff === 'hard' ? newHardGoal : newMediumGoal; const setter = diff === 'easy' ? setNewEasyGoal : diff === 'hard' ? setNewHardGoal : setNewMediumGoal; addDiffGoal(diff, val, setter); }} disabled={!(editingTask?.difficulty === 'easy' ? newEasyGoal : editingTask?.difficulty === 'hard' ? newHardGoal : newMediumGoal).trim()}><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowTaskDialog(false)}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSaveTask}
                  disabled={isSavingTask}
                >
                  {isSavingTask ? '保存中...' : (editingTask ? '保存' : '创建3个难度版本')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 补充难度任务对话框 */}
      {showAddDiffDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>配置{addDiffForm.difficulty === 'easy' ? '简单' : addDiffForm.difficulty === 'hard' ? '困难' : '中等'}难度任务</CardTitle>
                  <Badge className={addDiffForm.difficulty === 'easy' ? 'bg-green-100 text-green-700' : addDiffForm.difficulty === 'hard' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                    {addDiffForm.difficulty === 'easy' ? '简单' : addDiffForm.difficulty === 'hard' ? '困难' : '中等'}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowAddDiffDialog(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                为「{addDiffForm.groupName}」任务组添加{addDiffForm.difficulty === 'easy' ? '简单' : addDiffForm.difficulty === 'hard' ? '困难' : '中等'}难度任务
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>任务标题 <span className="text-red-500">*</span></Label>
                <Input
                  value={addDiffForm.title}
                  onChange={(e) => setAddDiffForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="输入任务标题"
                />
              </div>
              <div className="space-y-2">
                <Label>任务描述</Label>
                <Textarea
                  value={addDiffForm.description}
                  onChange={(e) => setAddDiffForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="输入任务描述..."
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="space-y-2">
                  <Label>积分奖励</Label>
                  <Input
                    type="number"
                    value={addDiffForm.points}
                    onChange={(e) => setAddDiffForm(prev => ({ ...prev, points: parseInt(e.target.value) || 10 }))}
                    min={1}
                    max={100}
                    className="w-24"
                  />
                </div>
              </div>

              {/* 任务要求 */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <Label className="text-sm">任务要求</Label>
                </div>
                {addDiffForm.requirements.map((req, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <Badge variant="outline" className="flex-1 py-1 justify-start text-xs">
                      {index + 1}. {req}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => {
                      setAddDiffForm(prev => ({
                        ...prev,
                        requirements: prev.requirements.filter((_, i) => i !== index)
                      }));
                    }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    value={newDiffReq}
                    onChange={(e) => setNewDiffReq(e.target.value)}
                    placeholder="输入任务要求，回车添加"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDiffReq.trim()) {
                        setAddDiffForm(prev => ({ ...prev, requirements: [...prev.requirements, newDiffReq.trim()] }));
                        setNewDiffReq('');
                      }
                    }}
                  />
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => {
                    if (newDiffReq.trim()) {
                      setAddDiffForm(prev => ({ ...prev, requirements: [...prev.requirements, newDiffReq.trim()] }));
                      setNewDiffReq('');
                    }
                  }} disabled={!newDiffReq.trim()}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* 学习目标 */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-primary" />
                  <Label className="text-sm">学习目标</Label>
                </div>
                {addDiffForm.learningGoals.map((goal, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <Badge variant="outline" className="flex-1 py-1 justify-start text-xs border-yellow-300 text-yellow-700">
                      {index + 1}. {goal}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => {
                      setAddDiffForm(prev => ({
                        ...prev,
                        learningGoals: prev.learningGoals.filter((_, i) => i !== index)
                      }));
                    }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    value={newDiffGoal}
                    onChange={(e) => setNewDiffGoal(e.target.value)}
                    placeholder="输入学习目标，回车添加"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDiffGoal.trim()) {
                        setAddDiffForm(prev => ({ ...prev, learningGoals: [...prev.learningGoals, newDiffGoal.trim()] }));
                        setNewDiffGoal('');
                      }
                    }}
                  />
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => {
                    if (newDiffGoal.trim()) {
                      setAddDiffForm(prev => ({ ...prev, learningGoals: [...prev.learningGoals, newDiffGoal.trim()] }));
                      setNewDiffGoal('');
                    }
                  }} disabled={!newDiffGoal.trim()}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowAddDiffDialog(false)}>取消</Button>
                <Button onClick={handleSaveDiffTask} disabled={isSavingDiffTask || !addDiffForm.title.trim()}>
                  {isSavingDiffTask ? '创建中...' : '创建任务'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 任务组详情面板 */}
      {selectedTaskGroup && !selectedTask && (
        <div className="fixed inset-0 bg-black/50 md:flex md:items-center md:justify-center z-50 p-0 md:p-4">
          <Card className="w-full h-full md:h-auto md:max-w-3xl md:max-h-[90vh] md:rounded-xl rounded-none overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold">
                    {selectedTaskGroup.stage}
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-blue-500" />
                      {selectedTaskGroup.groupName}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">阶段 {selectedTaskGroup.stage}</Badge>
                      <span className="text-xs text-gray-400">任务组</span>
                    </CardDescription>
                    {selectedTaskGroup.groupDescription && (
                      <p className="text-sm text-muted-foreground mt-2">{selectedTaskGroup.groupDescription}</p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={handleCloseTaskDetail}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 组内不同难度的任务 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-500" />
                  组内任务
                </h4>
                <div className="space-y-2">
                  {['easy', 'medium', 'hard'].map((diff) => {
                    const diffLabels: Record<string,string> = { easy: '简单', medium: '中等', hard: '困难' };
                    const diffColors: Record<string,string> = { easy: 'bg-green-50 text-green-700 border-green-200', medium: 'bg-yellow-50 text-yellow-700 border-yellow-200', hard: 'bg-red-50 text-red-700 border-red-200' };
                    const diffBorderColors: Record<string,string> = { easy: 'border-green-200', medium: 'border-yellow-200', hard: 'border-red-200' };
                    const diffIcons: Record<string,string> = { easy: '🌟', medium: '⚡', hard: '🔥' };
                    const variant = selectedTaskGroup.variants.find(v => v.difficulty === diff);
                    if (variant) {
                      return (
                        <div 
                          key={variant.id}
                          className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedTaskGroup(null);
                            fetchTaskDetail(variant.id);
                            fetchSiblingRewards(variant.task_group_id || '');
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm flex-shrink-0">{diffIcons[diff]}</span>
                              <Badge className={`${diffColors[diff]} flex-shrink-0`}>{diffLabels[diff]}</Badge>
                              <span className="font-medium text-sm truncate">{variant.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs text-amber-600 font-medium">{variant.points}分</span>
                              {permissions.canSetTask && (
                                <button
                                  className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
                                  title="设置工具、技能、激励"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/admin/task/${variant.id}`);
                                  }}
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div
                          key={diff}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed ${diffBorderColors[diff]} bg-gray-50/50 hover:bg-gray-100 cursor-pointer transition-colors`}
                          onClick={() => {
                            openAddDiffDialog(
                              selectedTaskGroup.groupId,
                              selectedTaskGroup.groupName,
                              diff as 'easy' | 'medium' | 'hard',
                              selectedTaskGroup.stage,
                              themeId,
                              selectedTaskGroup.groupDescription
                            );
                            handleCloseTaskDetail();
                          }}
                        >
                              <span className="text-sm">{diffIcons[diff]}</span>
                              <Badge variant="outline" className={diffColors[diff]}>{diffLabels[diff]}</Badge>
                              <Plus className="w-4 h-4 text-gray-400" />
                              <span className="text-xs text-gray-500">点击添加{diffLabels[diff]}难度任务</span>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>

              {/* 各难度任务要求和学习目标 */}
              <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    任务要求与学习目标
                  </h4>
                {selectedTaskGroup.variants.map((variant) => {
                  const rDiffColors: Record<string,string> = { easy: 'bg-green-50 text-green-700 border-green-200', medium: 'bg-yellow-50 text-yellow-700 border-yellow-200', hard: 'bg-red-50 text-red-700 border-red-200' };
                  const rDiffBorders: Record<string,string> = { easy: 'border-green-200 bg-green-50/50', medium: 'border-yellow-200 bg-yellow-50/50', hard: 'border-red-200 bg-red-50/50' };
                  const rDiffLabels: Record<string,string> = { easy: '简单', medium: '中等', hard: '困难' };
                  return (
                    <div key={variant.id} className={`border rounded-lg p-3 space-y-3 ${rDiffBorders[variant.difficulty || 'easy'] || 'border-gray-200 bg-gray-50/50'}`}>
                      <div className="flex items-center gap-2">
                        <Badge className={rDiffColors[variant.difficulty || 'easy'] || ''}>{rDiffLabels[variant.difficulty || 'easy'] || variant.difficulty}</Badge>
                        <span className="text-sm font-medium">{variant.title}</span>
                      </div>
                      {/* 任务要求 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs font-medium text-gray-600">任务要求</span>
                        </div>
                        <div className="bg-white rounded-md p-2 space-y-1">
                          {(variant.requirements || []).length > 0 ? (
                            (variant.requirements || []).map((req, index) => (
                              <div key={index} className="flex items-start gap-1.5">
                                <span className="text-green-600 text-xs mt-0.5 shrink-0">•</span>
                                {permissions.canSetTask ? (
                                  <div className="flex-1 flex items-center gap-1.5">
                                    <Input
                                      value={req}
                                      onChange={async (e) => {
                                        const newReqs = [...(variant.requirements || [])];
                                        newReqs[index] = e.target.value;
                                        // 更新本地状态
                                        const updatedVariants = selectedTaskGroup.variants.map(v =>
                                          v.id === variant.id ? { ...v, requirements: newReqs } : v
                                        );
                                        setSelectedTaskGroup({ ...selectedTaskGroup, variants: updatedVariants });
                                        setTasks(prev => prev.map(t => t.id === variant.id ? { ...t, requirements: newReqs } : t));
                                      }}
                                      onBlur={async () => {
                                        // 失焦时同步到当前任务 - 从最新的 selectedTaskGroup 中读取数据
                                        setSelectedTaskGroup(prev => {
                                          if (prev) {
                                            const currentVariant = prev.variants.find(v => v.id === variant.id);
                                            const reqsToSave = currentVariant?.requirements || [];
                                            fetch(`/api/tasks/${variant.id}`, {
                                              method: 'PUT',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ requirements: reqsToSave, userId: admin?.id, userRole: admin?.role }),
                                            }).catch(e => console.error('保存要求失败:', e));
                                          }
                                          return prev;
                                        });
                                      }}
                                      className="h-7 text-xs"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600 shrink-0"
                                      onClick={async () => {
                                        const newReqs = (variant.requirements || []).filter((_, i) => i !== index);
                                        const updatedVariants = selectedTaskGroup.variants.map(v =>
                                          v.id === variant.id ? { ...v, requirements: newReqs } : v
                                        );
                                        setSelectedTaskGroup({ ...selectedTaskGroup, variants: updatedVariants });
                                        setTasks(prev => prev.map(t => t.id === variant.id ? { ...t, requirements: newReqs } : t));
                                        await fetch(`/api/tasks/${variant.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ requirements: newReqs, userId: admin?.id, userRole: admin?.role }),
                                        });
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-gray-700 text-xs">{req}</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-gray-400 text-xs">暂无任务要求</p>
                          )}
                          {permissions.canSetTask && (
                            <div className="flex gap-1.5 pt-1 border-t border-gray-100">
                              <Input
                                placeholder="添加要求..."
                                className="h-7 text-xs"
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                    const val = (e.target as HTMLInputElement).value.trim();
                                    const newReqs = [...(variant.requirements || []), val];
                                    const updatedVariants = selectedTaskGroup.variants.map(v =>
                                      v.id === variant.id ? { ...v, requirements: newReqs } : v
                                    );
                                    setSelectedTaskGroup({ ...selectedTaskGroup, variants: updatedVariants });
                                    setTasks(prev => prev.map(t => t.id === variant.id ? { ...t, requirements: newReqs } : t));
                                    (e.target as HTMLInputElement).value = '';
                                    await fetch(`/api/tasks/${variant.id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ requirements: newReqs, userId: admin?.id, userRole: admin?.role }),
                                    });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 学习目标 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-medium text-gray-600">学习目标</span>
                        </div>
                        <div className="bg-white rounded-md p-2 space-y-1">
                          {(variant.learning_goals || []).length > 0 ? (
                            (variant.learning_goals || []).map((goal, index) => (
                              <div key={index} className="flex items-start gap-1.5">
                                <span className="text-amber-600 text-xs mt-0.5 shrink-0">•</span>
                                {permissions.canSetTask ? (
                                  <div className="flex-1 flex items-center gap-1.5">
                                    <Input
                                      value={goal}
                                      onChange={async (e) => {
                                        const newGoals = [...(variant.learning_goals || [])];
                                        newGoals[index] = e.target.value;
                                        const updatedVariants = selectedTaskGroup.variants.map(v =>
                                          v.id === variant.id ? { ...v, learning_goals: newGoals } : v
                                        );
                                        setSelectedTaskGroup({ ...selectedTaskGroup, variants: updatedVariants });
                                        setTasks(prev => prev.map(t => t.id === variant.id ? { ...t, learning_goals: newGoals } : t));
                                      }}
                                      onBlur={async () => {
                                        // 失焦时同步 - 从最新的 selectedTaskGroup 中读取数据
                                        setSelectedTaskGroup(prev => {
                                          if (prev) {
                                            const currentVariant = prev.variants.find(v => v.id === variant.id);
                                            const goalsToSave = currentVariant?.learning_goals || [];
                                            fetch(`/api/tasks/${variant.id}`, {
                                              method: 'PUT',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ learning_goals: goalsToSave, userId: admin?.id, userRole: admin?.role }),
                                            }).catch(e => console.error('保存目标失败:', e));
                                          }
                                          return prev;
                                        });
                                      }}
                                      className="h-7 text-xs"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600 shrink-0"
                                      onClick={async () => {
                                        const newGoals = (variant.learning_goals || []).filter((_, i) => i !== index);
                                        const updatedVariants = selectedTaskGroup.variants.map(v =>
                                          v.id === variant.id ? { ...v, learning_goals: newGoals } : v
                                        );
                                        setSelectedTaskGroup({ ...selectedTaskGroup, variants: updatedVariants });
                                        setTasks(prev => prev.map(t => t.id === variant.id ? { ...t, learning_goals: newGoals } : t));
                                        await fetch(`/api/tasks/${variant.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ learning_goals: newGoals, userId: admin?.id, userRole: admin?.role }),
                                        });
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-gray-700 text-xs">{goal}</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-gray-400 text-xs">暂无学习目标</p>
                          )}
                          {permissions.canSetTask && (
                            <div className="flex gap-1.5 pt-1 border-t border-gray-100">
                              <Input
                                placeholder="添加目标..."
                                className="h-7 text-xs"
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                    const val = (e.target as HTMLInputElement).value.trim();
                                    const newGoals = [...(variant.learning_goals || []), val];
                                    const updatedVariants = selectedTaskGroup.variants.map(v =>
                                      v.id === variant.id ? { ...v, learning_goals: newGoals } : v
                                    );
                                    setSelectedTaskGroup({ ...selectedTaskGroup, variants: updatedVariants });
                                    setTasks(prev => prev.map(t => t.id === variant.id ? { ...t, learning_goals: newGoals } : t));
                                    (e.target as HTMLInputElement).value = '';
                                    await fetch(`/api/tasks/${variant.id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ learning_goals: newGoals, userId: admin?.id, userRole: admin?.role }),
                                    });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 各难度任务工具、技能、激励 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-orange-500" />
                  任务工具/技能/激励
                </h4>
                {selectedTaskGroup.variants.map((variant) => {
                  const rDiffColors: Record<string,string> = { easy: 'bg-green-50 text-green-700 border-green-200', medium: 'bg-yellow-50 text-yellow-700 border-yellow-200', hard: 'bg-red-50 text-red-700 border-red-200' };
                  const rDiffBorders: Record<string,string> = { easy: 'border-green-200 bg-green-50/50', medium: 'border-yellow-200 bg-yellow-50/50', hard: 'border-red-200 bg-red-50/50' };
                  const rDiffLabels: Record<string,string> = { easy: '简单', medium: '中等', hard: '困难' };
                  const vTools = (variant as TaskDetail).tools || [];
                  const vSkills = (variant as TaskDetail).skills || [];
                  const vRewards = (variant as TaskDetail).rewards || [];
                  return (
                    <div key={variant.id} className={`border rounded-lg p-3 space-y-2 ${rDiffBorders[variant.difficulty || 'easy'] || 'border-gray-200 bg-gray-50/50'}`}>
                      <div className="flex items-center gap-2">
                        <Badge className={rDiffColors[variant.difficulty || 'easy'] || ''}>{rDiffLabels[variant.difficulty || 'easy'] || variant.difficulty}</Badge>
                        <span className="text-sm font-medium">{variant.title}</span>
                      </div>
                      {/* 工具 */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">工具</span>
                        <div className="flex flex-wrap gap-1">
                          {vTools.length > 0 ? vTools.map((t: TaskTool) => (
                            <Badge key={t.id} variant="outline" className="text-xs border-orange-300 text-orange-700">
                              {t.tools?.icon || '🔧'} {t.tools?.name || '未知'}
                              {t.is_required && <span className="ml-1 text-red-500">*</span>}
                            </Badge>
                          )) : (
                            <span className="text-xs text-gray-400">暂无工具</span>
                          )}
                        </div>
                      </div>
                      {/* 技能 */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">技能</span>
                        <div className="flex flex-wrap gap-1">
                          {vSkills.length > 0 ? vSkills.map((s: TaskSkill) => (
                            <Badge key={s.id} variant="outline" className="text-xs border-blue-300 text-blue-700">
                              {s.skills?.icon || '📘'} {s.skills?.name || '未知'}
                            </Badge>
                          )) : (
                            <span className="text-xs text-gray-400">暂无技能</span>
                          )}
                        </div>
                      </div>
                      {/* 激励 */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-gray-500">激励</span>
                        <div className="flex flex-wrap gap-1">
                          {vRewards.length > 0 ? vRewards.map((r: TaskReward) => (
                            <Badge key={r.id} variant="outline" className="text-xs border-pink-300 text-pink-700">
                              {r.icon || '🎁'} {r.name || '未知'}
                            </Badge>
                          )) : (
                            <span className="text-xs text-gray-400">暂无激励</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleCloseTaskDetail}
                >
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 单个任务详情面板 */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-0 md:p-4">
          <Card className="w-full md:max-w-3xl max-h-screen md:max-h-[90vh] overflow-y-auto rounded-none md:rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedTask.group_name && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 mr-1"
                      onClick={async () => {
                        // Find the group this task belongs to
                        const stageTasks = groupedTasks[selectedTask.stage];
                        if (stageTasks) {
                          const groups = groupedByTaskGroup(stageTasks);
                          const group = groups.find(g => g.groupKey === selectedTask.task_group_id);
                          if (group) {
                            await handleTaskGroupClick(
                              group.groupKey,
                              group.tasks[0]?.group_name || group.tasks[0]?.title || '',
                              group.tasks,
                              selectedTask.stage,
                            );
                          }
                        }
                      }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  )}
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold">
                    {selectedTask.stage}
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-500" />
                      {selectedTask.title}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">阶段 {selectedTask.stage}</Badge>
                      {selectedTask.difficulty && (() => {
                        const d = selectedTask.difficulty;
                        const colors: Record<string,string> = { easy: 'bg-green-50 text-green-700 border-green-200', medium: 'bg-yellow-50 text-yellow-700 border-yellow-200', hard: 'bg-red-50 text-red-700 border-red-200' };
                        const labels: Record<string,string> = { easy: '简单', medium: '中等', hard: '困难' };
                        return <Badge className={colors[d] || ''}>{labels[d] || d}</Badge>;
                      })()}
                      {selectedTask.group_name && (
                        <span className="text-xs text-gray-400">任务组：{selectedTask.group_name}</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={handleCloseTaskDetail}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 任务积分 */}
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                <span className="text-lg font-bold text-amber-600">{selectedTask.points} 积分</span>
              </div>

              {/* 任务详情描述 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  任务详情
                </h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {selectedTask.description || '暂无任务描述'}
                  </p>
                </div>
              </div>

              {/* 任务要求 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Target className="w-4 h-4 text-green-500" />
                  任务要求
                </h4>
                <div className="bg-green-50 rounded-lg p-3 space-y-2">
                  {(selectedTask.requirements || []).length > 0 ? (
                    (selectedTask.requirements || []).map((req, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5 shrink-0">•</span>
                        <span className="text-gray-700 text-sm">{req}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">暂无任务要求</p>
                  )}
                </div>
              </div>

              {/* 学习目标 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  学习目标
                </h4>
                <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                  {(selectedTask.learning_goals || []).length > 0 ? (
                    (selectedTask.learning_goals || []).map((goal, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="text-amber-600 mt-0.5 shrink-0">•</span>
                        <span className="text-gray-700 text-sm">{goal}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">暂无学习目标</p>
                  )}
                </div>
              </div>

              {/* 所需工具 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-orange-500" />
                    所需工具 ({selectedTask.tools?.length || 0})
                  </h4>
                  {permissions.canSetTask && !showToolSelector && availableTools.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowToolSelector(true)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加
                    </Button>
                  )}
                </div>
                {loadingTaskDetail ? (
                  <div className="text-center py-4 text-gray-500">
                    <p>加载中...</p>
                  </div>
                ) : showToolSelector ? (
                  <div className="border rounded-lg p-4 bg-orange-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">选择要添加的工具</p>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="tool-required"
                          checked={newToolRequired}
                          onCheckedChange={(checked: boolean) => setNewToolRequired(checked)}
                        />
                        <label htmlFor="tool-required" className="text-sm text-gray-600">
                          设为必选
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                      {availableTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="p-3 bg-white rounded-lg border hover:border-orange-300 hover:bg-orange-50 text-left transition-colors relative group"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xl mt-0.5">{tool.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{tool.name}</p>
                              <p className="text-xs text-gray-500 truncate">{tool.category}</p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                <Badge variant="outline" className={`text-xs ${tool.nature === 'physical' ? 'border-blue-300 text-blue-600' : 'border-green-300 text-green-600'}`}>
                                  {tool.nature === 'physical' ? '实物' : '虚拟'}
                                </Badge>
                                {tool.nature === 'physical' && tool.stock !== null && (
                                  <Badge variant="outline" className="text-xs border-gray-300 text-gray-600">
                                    库存: {tool.stock}
                                  </Badge>
                                )}
                                {tool.nature === 'physical' && tool.team_limit !== null && (
                                  <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                                    领用: {tool.team_limit}/队
                                  </Badge>
                                )}
                                {tool.nature === 'physical' && tool.needs_return && (
                                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                                    需归还
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                              onClick={(e) => openToolDetail(tool, e)}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              详情
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs ml-auto"
                              onClick={() => handleAddTool(tool.id)}
                              disabled={isAddingItem}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              添加
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowToolSelector(false)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : !selectedTask.tools || selectedTask.tools.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    <Wrench className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂未设置工具</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {selectedTask.tools.map((taskTool) => (
                      <div 
                        key={taskTool.id}
                        className={`flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 group relative ${
                          removingItemId === taskTool.tools.id ? 'opacity-50' : ''
                        }`}
                      >
                        <span className="text-2xl">{taskTool.tools.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{taskTool.tools.name}</p>
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                              {taskTool.tools.category}
                            </Badge>
                            <Badge 
                              variant={taskTool.is_required ? "destructive" : "secondary"} 
                              className="text-xs"
                            >
                              {taskTool.is_required ? '必选' : '可选'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{taskTool.tools.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Badge variant="outline" className={`text-xs ${taskTool.tools.nature === 'physical' ? 'border-blue-300 text-blue-600' : 'border-green-300 text-green-600'}`}>
                              {taskTool.tools.nature === 'physical' ? '实物' : '虚拟'}
                            </Badge>
                            {taskTool.tools.nature === 'physical' && taskTool.tools.stock !== null && (
                              <Badge variant="outline" className="text-xs border-gray-300 text-gray-600">
                                库存: {taskTool.tools.stock}
                              </Badge>
                            )}
                            {taskTool.tools.nature === 'physical' && taskTool.tools.team_limit !== null && (
                              <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                                领用: {taskTool.tools.team_limit}/队
                              </Badge>
                            )}
                            {taskTool.tools.nature === 'physical' && taskTool.tools.needs_return && (
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                                需归还
                              </Badge>
                            )}
                          </div>
                        </div>
                        {permissions.canSetTask && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleToggleToolRequired(taskTool.tools.id, !taskTool.is_required)}
                            >
                              {taskTool.is_required ? '设为可选' : '设为必选'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                              onClick={() => handleRemoveTool(taskTool.tools.id)}
                              disabled={removingItemId === taskTool.tools.id}
                            >
                              {removingItemId === taskTool.tools.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 技能学习 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-500" />
                    技能学习 ({selectedTask.skills?.length || 0})
                  </h4>
                  {permissions.canSetTask && !showSkillSelector && availableSkills.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowSkillSelector(true)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加
                    </Button>
                  )}
                </div>
                {loadingTaskDetail ? (
                  <div className="text-center py-4 text-gray-500">
                    <p>加载中...</p>
                  </div>
                ) : showSkillSelector ? (
                  <div className="border rounded-lg p-4 bg-purple-50/50 space-y-3">
                    <p className="text-sm font-medium text-gray-700">选择要添加的技能</p>
                    <div className="grid gap-2 max-h-60 overflow-y-auto">
                      {availableSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="p-3 bg-white rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xl">{skill.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{skill.name}</p>
                                <p className="text-xs text-gray-500 truncate">{skill.category}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <Label className="text-xs text-gray-600">积分:</Label>
                                <Input
                                  type="number"
                                  className="w-16 h-7 text-xs"
                                  min={1}
                                  max={50}
                                  value={selectedSkillPoints[skill.id] || 5}
                                  onChange={(e) => setSelectedSkillPoints({
                                    ...selectedSkillPoints,
                                    [skill.id]: parseInt(e.target.value) || 5
                                  })}
                                />
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleAddSkill(skill.id)}
                                disabled={isAddingItem}
                              >
                                添加
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowSkillSelector(false)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : !selectedTask.skills || selectedTask.skills.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂未设置技能</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {selectedTask.skills.map((taskSkill) => (
                      <div 
                        key={taskSkill.id}
                        className={`p-3 bg-gray-50 rounded-lg border border-gray-200 group relative ${
                          removingItemId === taskSkill.skills.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{taskSkill.skills.icon}</span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium">{taskSkill.skills.name}</p>
                                <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                                  {taskSkill.skills.category}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-500 mt-1">{taskSkill.skills.description}</p>
                            </div>
                          </div>
                          {permissions.canSetTask && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleRemoveSkill(taskSkill.skills.id)}
                              disabled={removingItemId === taskSkill.skills.id}
                            >
                              {removingItemId === taskSkill.skills.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <Label className="text-sm">学习积分：</Label>
                            <span className="font-bold text-amber-500">{taskSkill.points}</span>
                            <Star className="w-4 h-4 text-amber-500" />
                          </div>
                          {taskSkill.is_required && (
                            <Badge variant="destructive" className="text-xs">必学</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 任务激励 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                    <Gift className="w-4 h-4 text-pink-500" />
                    任务激励
                  </h4>
                  {permissions.canSetTask && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => router.push(`/admin/task/${selectedTask.id}`)}
                    >
                      配置激励
                    </Button>
                  )}
                </div>
                {(() => {
                  const currentRewards = taskGroupRewards[selectedTask.id] || selectedTask.rewards || [];
                  return currentRewards.length > 0 ? (
                    <div className="space-y-2">
                      {currentRewards.map((reward: Reward) => (
                        <div key={reward.id} className="flex items-center gap-2 p-2 bg-pink-50 rounded-lg border border-pink-100">
                          <span className="text-lg">{reward.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{reward.name}</p>
                          </div>
                          {reward.points && reward.points > 0 && (
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                              {reward.points} 积分
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3 text-gray-500 bg-gray-50 rounded-lg">
                      <Gift className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                      <p className="text-xs">暂无激励，前往设置页配置</p>
                    </div>
                  );
                })()}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleCloseTaskDetail}
                >
                  关闭
                </Button>
                {permissions.canSetTask && (
                  <Button 
                    className="flex-1"
                    onClick={() => router.push(`/admin/task/${selectedTask.id}`)}
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    编辑设置
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 工具详情弹窗 */}
      {showToolDetail && detailTool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">{detailTool.icon || '🔧'}</span>
                  工具详情
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowToolDetail(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* 基本信息 */}
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center text-3xl shrink-0">
                  {detailTool.icon || '🔧'}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold">{detailTool.name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">{detailTool.category}</Badge>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${detailTool.nature === 'virtual' ? 'border-purple-300 text-purple-600' : 'border-blue-300 text-blue-600'}`}
                    >
                      {detailTool.nature === 'virtual' ? '虚拟工具' : '实物工具'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 工具描述 */}
              <div>
                <Label className="text-sm text-gray-500 mb-1 block">工具描述</Label>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700">
                    {detailTool.description || '暂无描述'}
                  </p>
                </div>
              </div>

              {/* 详细信息 */}
              {detailTool.nature === 'physical' && (
                <>
                  {/* 库存数量 */}
                  <div>
                    <Label className="text-sm text-gray-500 mb-1 block">库存数量</Label>
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-blue-500" />
                      {detailTool.stock !== null && detailTool.stock !== undefined ? (
                        <>
                          <span className="text-lg font-bold text-blue-600">{detailTool.stock}</span>
                          <span className="text-sm text-gray-500">个</span>
                        </>
                      ) : (
                        <span className="text-lg font-bold text-purple-600">无上限</span>
                      )}
                    </div>
                  </div>

                  {/* 小队领用量 */}
                  <div>
                    <Label className="text-sm text-gray-500 mb-1 block">小队领用量</Label>
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-green-500" />
                      {detailTool.team_limit !== null && detailTool.team_limit !== undefined ? (
                        <>
                          <span className="text-lg font-bold text-green-600">{detailTool.team_limit}</span>
                          <span className="text-sm text-gray-500">个/小队</span>
                        </>
                      ) : (
                        <span className="text-lg font-bold text-gray-500">无限制</span>
                      )}
                    </div>
                  </div>

                  {/* 是否需要还回 */}
                  <div>
                    <Label className="text-sm text-gray-500 mb-1 block">是否需要还回</Label>
                    <div className="bg-gray-50 rounded-lg p-3">
                      {detailTool.needs_return !== false ? (
                        <Badge variant="secondary" className="text-amber-600 bg-amber-50 border border-amber-200">
                          需要还回
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-green-600 bg-green-50 border border-green-200">
                          无需还回
                        </Badge>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 关联技能 */}
              {detailTool.linkedSkills && detailTool.linkedSkills.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-500 mb-1 block">关联技能</Label>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {detailTool.linkedSkills.map((ls) => (
                      <div key={ls.skill_id} className="flex items-center gap-2">
                        <span className="text-lg">{ls.skills.icon}</span>
                        <span className="text-sm font-medium">{ls.skills.name}</span>
                        {ls.is_auto_add && (
                          <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">
                            自动添加
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
