'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { safeGetJSON } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, FileText, Image, Video, Music, 
  CheckCircle, XCircle, Star, Download, 
  X, Loader2, Send, Gift, Sparkles, Wrench,
  Clock, Users, Filter, CheckSquare, Archive, ExternalLink,
  AlertTriangle, Calendar, SkipForward
} from 'lucide-react';
import { toast } from 'sonner';
import { useDataRefresh } from '@/hooks/use-data-refresh';
import { setAssistantContext } from '@/lib/assistant-context';

// 文本文件预览组件
function TextFilePreview({ url }: { url: string; name?: string }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const text = await response.text();
        setContent(text);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileText className="w-8 h-8 mb-2" />
        <p className="text-sm">无法加载文件内容</p>
      </div>
    );
  }

  return (
    <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words font-mono">
      {content}
    </pre>
  );
}

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
}

interface Submission {
  id: string;
  team_id: string;
  team_name: string;
  team_code: string;
  task_id: string;
  task_title: string;
  task_stage: number;
  theme_id: string;
  theme_name: string;
  theme_icon: string;
  school_id: string;
  school_name: string;
  content: string;
  file_urls: Array<{ type: string; url: string; name?: string }>;
  status: 'pending' | 'approved' | 'rejected';
  rating?: 'approved' | 'excellent' | 'rejected';
  review_comment?: string;
  reviewer_id?: string;
  reviewed_at?: string;
  created_at: string;
}

interface Theme {
  id: string;
  name: string;
  icon: string;
}

interface Reward {
  id: string;
  name: string;
  description?: string;
  icon: string;
  type: string;
  points?: number;
  conditions?: { type: string; value: string | number; description: string }[];
}

interface SideTask {
  id: string;
  title: string;
  description?: string;
  points: number;
  stage: number;
  learningGoals?: string[];
  requirements?: string[];
}

interface OverdueTask {
  id: string;
  team_id: string;
  team_name: string;
  team_code: string;
  team_points: number;
  task_id: string;
  task_title: string;
  task_stage: number;
  task_points: number;
  task_type?: string;
  theme_id: string;
  theme_name: string;
  theme_icon: string;
  school_id: string;
  school_name: string;
  deadline: string;
  is_overdue: boolean;
}

// 状态映射
const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700 border-green-200' },
  excellent: { label: '优秀', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  rejected: { label: '已退回', color: 'bg-red-100 text-red-700 border-red-200' },
  overdue: { label: '超时未提交', color: 'bg-orange-100 text-orange-700 border-orange-200' },
};

// 评价映射
const ratingConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  excellent: { label: '优秀', color: 'text-purple-600 bg-purple-50', icon: <Star className="w-4 h-4" /> },
  approved: { label: '合格', color: 'text-green-600 bg-green-50', icon: <CheckCircle className="w-4 h-4" /> },
  rejected: { label: '不合格', color: 'text-red-600 bg-red-50', icon: <XCircle className="w-4 h-4" /> },
};

// 文件类型图标
const fileTypeIcon: Record<string, React.ReactNode> = {
  image: <Image className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  audio: <Music className="w-4 h-4" />,
  document: <FileText className="w-4 h-4" />,
  archive: <Archive className="w-4 h-4" />,
  other: <FileText className="w-4 h-4" />,
};

export default function AdminSubmissionsPage() {
  const router = useRouter();
  const { isMobile, isTablet } = useResponsive();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 滚动位置记忆
  useScrollPosition('admin-submissions');
  
  // 筛选状态
  const [statusFilter, setStatusFilter] = useState('all');
  const [themeFilter, setThemeFilter] = useState('all');
  
  // 统计
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, excellent: 0 });
  
  // 超时任务
  const [overdueTasks, setOverdueTasks] = useState<OverdueTask[]>([]);
  const [showOverduePanel, setShowOverduePanel] = useState(false);
  const [selectedOverdueTask, setSelectedOverdueTask] = useState<OverdueTask | null>(null);
  const [overdueAction, setOverdueAction] = useState<'extend' | 'skip'>('extend');
  const [newDeadline, setNewDeadline] = useState<string>('');
  const [pointDeduction, setPointDeduction] = useState<number>(0);
  const [handlingOverdue, setHandlingOverdue] = useState(false);
  
  // 合并显示列表（包含提交记录和超时任务）
  const displayItems = useMemo(() => {
    const items: Array<Submission | (OverdueTask & { itemType: 'overdue' })> = [...submissions];
    
    // 如果筛选条件包含"超时未提交"或"全部"，则添加超时任务
    if (statusFilter === 'all' || statusFilter === 'overdue') {
      const overdueItems = overdueTasks.map(task => ({
        ...task,
        itemType: 'overdue' as const,
      }));
      items.push(...overdueItems);
    }
    
    // 根据筛选条件过滤
    let filtered = items;
    
    // 状态筛选
    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        filtered = items.filter(item => 'itemType' in item && item.itemType === 'overdue');
      } else if (statusFilter === 'excellent') {
        // 优秀：status=approved 且 rating=excellent
        filtered = items.filter(item => 'status' in item && item.status === 'approved' && (item as Submission).rating === 'excellent');
      } else if (statusFilter === 'approved') {
        // 已通过：status=approved 且 rating 不是 excellent
        filtered = items.filter(item => 'status' in item && item.status === 'approved' && (item as Submission).rating !== 'excellent');
      } else {
        filtered = items.filter(item => 'status' in item && item.status === statusFilter);
      }
    }
    
    // 主题筛选
    if (themeFilter !== 'all') {
      filtered = filtered.filter(item => item.theme_id === themeFilter);
    }
    
    // 按时间降序排序（提交记录用 created_at，超时任务用 deadline）
    return filtered.sort((a, b) => {
      // 提交记录使用 created_at，超时任务使用 deadline
      const getTime = (item: typeof a): number => {
        if ('itemType' in item && item.itemType === 'overdue') {
          return new Date((item as OverdueTask).deadline).getTime();
        }
        return new Date((item as Submission).created_at).getTime();
      };
      return getTime(b) - getTime(a);
    });
  }, [submissions, overdueTasks, statusFilter, themeFilter]);
  
  // 详情面板
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // 当选中产出变化时，将产出数据推送给蜡象助手
  useEffect(() => {
    if (selectedSubmission && showDetailPanel) {
      setAssistantContext({
        type: 'submission_detail',
        title: `${selectedSubmission.team_name} - ${selectedSubmission.theme_name} 第${selectedSubmission.task_stage}阶段`,
        data: {
          submissionId: selectedSubmission.id,
          teamName: selectedSubmission.team_name,
          themeName: selectedSubmission.theme_name,
          taskTitle: selectedSubmission.task_title,
          taskStage: selectedSubmission.task_stage,
          status: selectedSubmission.status,
          content: selectedSubmission.content,
          rating: selectedSubmission.rating,
          reviewComment: selectedSubmission.review_comment,
          fileCount: selectedSubmission.file_urls?.length || 0,
          files: selectedSubmission.file_urls?.map((f: unknown, i: number) => {
            const file = f as { url?: string; name?: string; type?: string };
            return {
              index: i + 1,
              name: file?.name || `附件${i + 1}`,
              type: file?.type || '未知',
              url: file?.url || '',
            };
          }),
          createdAt: selectedSubmission.created_at,
        },
      });
    } else {
      setAssistantContext(null);
    }
    return () => {
      // 页面卸载时清空上下文
      setAssistantContext(null);
    };
  }, [selectedSubmission, showDetailPanel]);
  
  // 审核表单
  const [reviewForm, setReviewForm] = useState({
    rating: '',
    comment: '',
    bonusPoints: 0, // 额外加分
  });
  const [submitting, setSubmitting] = useState(false);
  
  // 激励选择
  const [showRewards, setShowRewards] = useState(false);
  const [selectedRewards, setSelectedRewards] = useState<string[]>([]);
  
  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  
  // 可用奖励
  const [tools, setTools] = useState<Reward[]>([]);
  const [skills, setSkills] = useState<Reward[]>([]);
  
  // 支线任务
  const [sideTasks, setSideTasks] = useState<SideTask[]>([]);
  const [selectedSideTaskId, setSelectedSideTaskId] = useState<string | null>(null);
  
  // 截止日期（只存储日期 YYYY-MM-DD）
  const [nextTaskDeadline, setNextTaskDeadline] = useState<string>('');
  
  // 审核日期（当前日期，用于计算最小可选日期）
  const [reviewDate, setReviewDate] = useState<string>('');
  // 最小可选日期（审核日期次日 YYYY-MM-DD）
  const [minDate, setMinDate] = useState<string>('');
  
  // 跳过任务时的截止日期（只存储日期 YYYY-MM-DD）
  const [skipNextTaskDeadline, setSkipNextTaskDeadline] = useState<string>('');
  // 跳过任务的最小可选日期（审核日期次日 YYYY-MM-DD）
  const [skipMinDate, setSkipMinDate] = useState<string>('');
  
  // 延期任务的截止日期（只存储日期 YYYY-MM-DD）
  const [extendDeadline, setExtendDeadline] = useState<string>('');
  // 延期任务的最小可选日期（审核日期次日 YYYY-MM-DD）
  const [extendMinDate, setExtendMinDate] = useState<string>('');

  // 是否是主题中最后一个任务
  const [isLastTask, setIsLastTask] = useState(false);
  
  // 详情弹窗
  const [detailItem, setDetailItem] = useState<{
    type: 'sideTask' | 'tool' | 'skill';
    item: SideTask | Reward;
  } | null>(null);
  
  // 文件预览模态框（移动端）
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);

  const fetchData = async (user: AdminUser, filters?: { status?: string; themeId?: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('createdBy', user.id);
      params.append('role', user.role);
      
      if (filters?.status && filters.status !== 'all') {
        // "优秀"筛选：API需返回所有approved记录，前端再按rating过滤
        if (filters.status === 'excellent') {
          params.append('status', 'approved');
        } else {
          params.append('status', filters.status);
        }
      }
      if (filters?.themeId && filters.themeId !== 'all') {
        params.append('themeId', filters.themeId);
      }

      const res = await fetch(`/api/submissions?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      
      setSubmissions(data.submissions || []);
      setStats(data.stats || { pending: 0, approved: 0, rejected: 0, excellent: 0 });
    } catch (error) {
      console.error('获取产出列表失败:', error);
      toast.error('获取产出列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取超时任务列表
  const fetchOverdueTasks = async (user: AdminUser) => {
    try {
      const params = new URLSearchParams();
      params.append('createdBy', user.id);
      params.append('role', user.role);
      
      const res = await fetch(`/api/admin/overdue-tasks?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      
      setOverdueTasks(data.overdueTasks || []);
    } catch (error) {
      console.error('获取超时任务列表失败:', error);
    }
  };

  const fetchThemes = async (user?: AdminUser) => {
    try {
      const params = new URLSearchParams();
      
      // 如果是志愿者角色，只获取其指导的小队已选择的主题
      if (user?.role === 'volunteer' && user.id) {
        params.append('volunteerId', user.id);
      }
      
      const res = await fetch(`/api/themes?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      setThemes(data.themes || []);
    } catch (error) {
      console.error('获取主题列表失败:', error);
    }
  };

  const fetchAvailableRewards = async () => {
    try {
      const res = await fetch('/api/rewards');
      const data = await res.json();
      const rewards = data.rewards || [];
      setTools(rewards.filter((r: Reward) => r.type === 'tool_card'));
      setSkills(rewards.filter((r: Reward) => r.type === 'skill_card'));
    } catch (error) {
      console.error('获取奖励列表失败:', error);
    }
  };

  // 刷新数据的函数（同时刷新提交列表和超时任务）
  const refreshData = useCallback(async () => {
    if (!admin) return;
    await Promise.all([
      fetchData(admin, { status: statusFilter, themeId: themeFilter }),
      fetchOverdueTasks(admin),
    ]);
  }, [admin, statusFilter, themeFilter]);

  // 数据同步：监听提交、奖励和小队变化（超时任务与小队状态相关）
  useDataRefresh({
    keys: ['submissions', 'user_rewards', 'teams'],
    onRefresh: refreshData,
  });

  useEffect(() => {
    const user = safeGetJSON<AdminUser | null>('user', null);
    if (user) {
      setAdmin(user);
    }
  }, []);

  useEffect(() => {
    if (admin) {
      fetchData(admin);
      fetchThemes(admin);
      fetchAvailableRewards();
      fetchOverdueTasks(admin);
    }
  }, [admin]);

  // 筛选条件变化时自动筛选
  useEffect(() => {
    if (admin) {
      fetchData(admin, { status: statusFilter, themeId: themeFilter });
    }
  }, [statusFilter, themeFilter, admin]);

  // 页面重新可见时刷新数据
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && admin) {
        refreshData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [admin, refreshData]);

  // 重置筛选
  const handleResetFilter = () => {
    setStatusFilter('all');
    setThemeFilter('all');
  };

  // 打开审核弹窗时计算最小可选日期（审核日期次日）
  const updateMinDate = useCallback(() => {
    const today = new Date();
    // 审核日期格式：YYYY-MM-DD
    const reviewDateStr = today.toISOString().slice(0, 10);
    setReviewDate(reviewDateStr);
    
    // 次日日期
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDateStr = tomorrow.toISOString().slice(0, 10);
    setMinDate(minDateStr);
    // 同步设置跳过任务的最小日期
    setSkipMinDate(minDateStr);
  }, []);

  // 查看详情
  const handleViewDetail = async (submission: Submission) => {
    // 打开弹窗前先计算最小可选日期
    updateMinDate();
    
    setSelectedSubmission(submission);
    setReviewForm({
      rating: submission.rating || '',
      comment: submission.review_comment || '',
      bonusPoints: 0,
    });
    setSelectedRewards([]);
    setShowRewards(false);
    setSelectedSideTaskId(null);
    setNextTaskDeadline('');
    setIsLastTask(false);
    setShowDetailPanel(true);
    
    // 判断是否是主题中最后一个任务
    if (submission.theme_id && submission.task_id) {
      try {
        // 获取当前主题下的所有主线任务（排除支线任务）
        const tasksRes = await fetch(`/api/tasks?themeId=${submission.theme_id}`);
        const tasksData = await tasksRes.json();
        const mainTasks = (tasksData.tasks || []).filter((t: any) => t.task_type !== 'side');
        
        // 获取该小队已审核通过的提交
        const submissionsRes = await fetch(`/api/submissions?teamId=${submission.team_id}&status=approved`, { cache: 'no-store' });
        const submissionsData = await submissionsRes.json();
        const completedTaskIds = new Set(
          (submissionsData.submissions || [])
            .map((s: any) => s.task_id)
        );
        
        // 当前任务审核通过后，检查是否还有其他未完成的主线任务
        const remainingTasks = mainTasks.filter((t: any) => 
          t.id !== submission.task_id && !completedTaskIds.has(t.id)
        );
        
        // 如果没有剩余的主线任务，则认为是最后一个任务
        setIsLastTask(remainingTasks.length === 0);
      } catch (error) {
        console.error('判断最后一个任务失败:', error);
        setIsLastTask(false);
      }
    }
    
    // 查询当前任务所属主题和阶段的支线任务
    if (submission.theme_id && submission.task_stage) {
      try {
        const res = await fetch(`/api/tasks?themeId=${submission.theme_id}&stage=${submission.task_stage}&taskType=side`);
        const data = await res.json();
        
        // 查询已下发给该小队的支线任务
        const sideTasksRes = await fetch(`/api/team/side-tasks?teamId=${submission.team_id}`);
        const sideTasksData = await sideTasksRes.json();
        const assignedTaskIds = new Set((sideTasksData.sideTasks || []).map((t: any) => t.task_id));
        
        // 映射字段名从 snake_case 到 camelCase，并过滤已下发的
        const mappedTasks = (data.tasks || [])
          .filter((task: any) => !assignedTaskIds.has(task.id))
          .map((task: any) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            points: task.points,
            stage: task.stage,
            learningGoals: task.learning_goals || [],
            requirements: task.requirements || [],
          }));
        setSideTasks(mappedTasks);
      } catch (error) {
        console.error('获取支线任务失败:', error);
        setSideTasks([]);
      }
    } else {
      setSideTasks([]);
    }
    
    // 查询已发给该小队的额外激励，用于过滤
    try {
      // 先获取所有激励
      const rewardsRes = await fetch('/api/rewards');
      const rewardsData = await rewardsRes.json();
      const allRewards = rewardsData.rewards || [];
      
      // 获取已下发的激励
      const assignedRes = await fetch(`/api/team/rewards?teamId=${submission.team_id}`);
      const assignedData = await assignedRes.json();
      const assignedRewardIds = new Set((assignedData.rewards || []).map((r: any) => r.reward_id));
      
      // 过滤已下发的激励
      const availableTools = allRewards.filter((r: Reward) => r.type === 'tool_card' && !assignedRewardIds.has(r.id));
      const availableSkills = allRewards.filter((r: Reward) => r.type === 'skill_card' && !assignedRewardIds.has(r.id));
      setTools(availableTools);
      setSkills(availableSkills);
    } catch (error) {
      console.error('获取已下发激励失败:', error);
    }
  };

  // 查看超时任务详情
  const handleViewOverdueDetail = async (task: OverdueTask & { itemType: 'overdue' }) => {
    setSelectedOverdueTask(task);
    setOverdueAction('extend');
    setNewDeadline('');
    setPointDeduction(0);
    setShowOverduePanel(true);
  };

  // 提交审核
  const handleSubmitReview = async () => {
    if (!selectedSubmission || !admin) return;
    
    if (!reviewForm.rating) {
      toast.error('请选择评价等级');
      return;
    }
    
    if (reviewForm.rating === 'rejected' && !reviewForm.comment) {
      toast.error('退回时必须填写修改建议');
      return;
    }

    setSubmitting(true);
    try {
      const status = reviewForm.rating === 'rejected' ? 'rejected' : 'approved';
      
      // 将日期转换为截止时间（当日24:00，即当日23:59:59）
      let deadlineForApi: string | undefined;
      if (nextTaskDeadline) {
        const selectedDate = new Date(nextTaskDeadline + 'T00:00:00');
        const deadline = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
        deadlineForApi = deadline.toISOString();
      }
      
      const res = await fetch(`/api/submissions/${selectedSubmission.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          rating: reviewForm.rating,
          reviewComment: reviewForm.comment,
          reviewerId: admin.id,
          reviewerRole: admin.role,
          bonusPoints: reviewForm.bonusPoints || 0, // 额外加分
          sideTaskId: selectedSideTaskId, // 支线任务ID
                          nextTaskDeadline: deadlineForApi, // 下一个任务截止日期
          rewards: reviewForm.rating === 'excellent' ? {
            tools: selectedRewards.filter(id => tools.some(t => t.id === id)),
            skills: selectedRewards.filter(id => skills.some(s => s.id === id)),
          } : undefined,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        toast.success(data.message);
        setShowDetailPanel(false);
        // 刷新所有数据（提交列表 + 超时任务）
        await Promise.all([
          fetchData(admin, { status: statusFilter, themeId: themeFilter }),
          fetchOverdueTasks(admin),
        ]);
      } else {
        toast.error(data.error || '审核失败');
      }
    } catch (error) {
      toast.error('审核失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 处理超时任务
  const handleOverdueTask = (task: OverdueTask) => {
    // 打开面板前先计算最小可选日期（审核日期次日）
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    setSkipMinDate(tomorrowStr);
    setExtendMinDate(tomorrowStr);
    
    setSelectedOverdueTask(task);
    setOverdueAction('extend');
    setNewDeadline('');
    setPointDeduction(Math.ceil(task.task_points * 0.2)); // 默认扣除20%积分
    setSkipNextTaskDeadline('');
    setExtendDeadline('');
    setShowOverduePanel(true);
  };

  // 提交超时任务处理
  const handleSubmitOverdue = async () => {
    if (!selectedOverdueTask || !admin) return;
    
    if (overdueAction === 'extend' && !extendDeadline) {
      toast.error('请设置新的截止时间');
      return;
    }
    
    setHandlingOverdue(true);
    try {
      // 将日期转换为截止时间（当日23:59:59）
      let skipDeadlineForApi: string | undefined;
      if (skipNextTaskDeadline) {
        const selectedDate = new Date(skipNextTaskDeadline + 'T00:00:00');
        const deadline = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
        skipDeadlineForApi = deadline.toISOString();
      }
      
      // 延期日期转换
      let extendDeadlineForApi: string | undefined;
      if (extendDeadline) {
        const selectedDate = new Date(extendDeadline + 'T00:00:00');
        const deadline = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
        extendDeadlineForApi = deadline.toISOString();
      }
      
      const res = await fetch('/api/admin/overdue-tasks/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedOverdueTask.team_id,
          taskId: selectedOverdueTask.task_id,
          action: overdueAction,
          newDeadline: overdueAction === 'extend' ? extendDeadlineForApi : undefined,
          pointDeduction: overdueAction === 'extend' ? pointDeduction : undefined,
          nextTaskDeadline: overdueAction === 'skip' ? skipDeadlineForApi : undefined,
          reviewerId: admin.id,
          reviewerName: admin.name,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(data.message);
        setShowOverduePanel(false);
        // 刷新所有数据
        await Promise.all([
          fetchData(admin, { status: statusFilter, themeId: themeFilter }),
          fetchOverdueTasks(admin),
        ]);
      } else {
        toast.error(data.error || '处理失败');
      }
    } catch (error) {
      toast.error('处理失败');
    } finally {
      setHandlingOverdue(false);
    }
  };

  // 批量选择
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // 全选
  const toggleSelectAll = () => {
    if (selectedIds.size === submissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submissions.map(s => s.id)));
    }
  };

  // 下载单个文件
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('下载失败');
    }
  };

  // 生成下载文件名：小队名+任务主题+任务阶段+序列数字
  const generateDownloadFilename = (submission: Submission, fileIndex: number, file?: { type: string; url: string; name?: string }) => {
    const ext = file && typeof file === 'object' && file.name
      ? file.name.split('.').pop() || 'file'
      : (file && typeof file === 'object' && file.url ? file.url.split('.').pop() || 'file' : 'file');
    const teamName = submission.team_name || '未知小队';
    const themeName = submission.theme_name || '未知主题';
    const stage = submission.task_stage || 1;
    return `${teamName}_${themeName}_第${stage}阶段_${fileIndex + 1}.${ext}`;
  };

  // 下载单个产出的所有文件
  const downloadSubmission = async (submission: Submission) => {
    if (!submission.file_urls || submission.file_urls.length === 0) {
      toast.info('该产出无附件可下载');
      return;
    }

    for (let i = 0; i < submission.file_urls.length; i++) {
      const file = submission.file_urls[i];
      const url = getFileUrl(file);
      const filename = generateDownloadFilename(submission, i, file);
      await downloadFile(url, filename);
      // 添加延迟避免浏览器阻止
      if (i < submission.file_urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    toast.success('下载完成');
  };

  // 批量下载
  const handleBatchDownload = async () => {
    const selected = submissions.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) {
      toast.error('请先选择要下载的产出');
      return;
    }

    // 计算总文件数
    const totalFiles = selected.reduce((sum, s) => sum + (s.file_urls?.length || 0), 0);
    if (totalFiles === 0) {
      toast.error('选中的产出没有附件');
      return;
    }

    let downloadedFiles = 0;
    let downloadCount = 0;
    
    for (const submission of selected) {
      if (submission.file_urls && submission.file_urls.length > 0) {
        for (let i = 0; i < submission.file_urls.length; i++) {
          const file = submission.file_urls[i];
          const url = getFileUrl(file);
          const filename = generateDownloadFilename(submission, i, file);
          await downloadFile(url, filename);
          downloadedFiles++;
          // 每个文件下载间隔，避免浏览器阻止
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        downloadCount++;
      }
    }
    
    toast.success(`已下载 ${downloadCount} 个产出的 ${downloadedFiles} 个文件`);
    
    // 下载完成后自动退出批量模式
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  // 获取文件类型
  const getFileType = (file: { type?: string; url?: string; name?: string } | string): string => {
    const url = typeof file === 'string' ? file : file?.url || '';
    if (!url) return 'other';
    const ext = url.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'm4v', '3gp', 'wmv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'ape'].includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office';
    if (['txt', 'md', 'json', 'xml', 'csv', 'log', 'rtf'].includes(ext)) return 'text';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
    return 'other';
  };

  // 获取文件扩展名
  const getFileExt = (file: { type?: string; url?: string; name?: string } | string): string => {
    const url = typeof file === 'string' ? file : file?.url || '';
    if (!url) return '';
    return url.split('.').pop()?.toLowerCase() || '';
  };

  // 判断文件是否可在线预览
  const canPreview = (type: string): boolean => {
    return ['image', 'video', 'audio', 'pdf', 'office', 'text'].includes(type);
  };

  // 打开文件预览
  const openFilePreview = (file: { type?: string; url?: string; name?: string } | string) => {
    const url = getFileUrl(file);
    const name = getFileName(file, 0);
    const type = getFileType(file);
    
    if (!url) return;
    
    // 所有支持的类型都使用模态框预览
    if (canPreview(type)) {
      setPreviewFile({ url, name, type });
    } else {
      // 不支持的类型在新标签页打开
      window.open(url, '_blank');
    }
  };

  // 关闭文件预览
  const closeFilePreview = useCallback(() => {
    setPreviewFile(null);
  }, []);

  // 获取文件URL
  const getFileUrl = (file: { type?: string; url?: string; name?: string } | string): string => {
    return typeof file === 'string' ? file : file?.url || '';
  };

  // 获取文件名
  const getFileName = (file: { type?: string; url?: string; name?: string } | string, idx: number): string => {
    if (typeof file === 'string') {
      const parts = file.split('/');
      return parts[parts.length - 1] || `文件${idx + 1}`;
    }
    return file?.name || `文件${idx + 1}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">产出审核</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={batchMode ? "default" : "outline"} 
              size="sm"
              onClick={() => {
                setBatchMode(!batchMode);
                setSelectedIds(new Set());
              }}
            >
              <CheckSquare className="w-4 h-4 mr-1" />
              {batchMode ? '退出批量' : '批量下载'}
            </Button>
            {batchMode && selectedIds.size > 0 && (
              <Button size="sm" onClick={handleBatchDownload}>
                <Download className="w-4 h-4 mr-1" />
                下载选中 ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 统计卡片 */}
        <div className={`grid gap-4 mb-6 ${
          isMobile ? 'grid-cols-2' : isTablet ? 'grid-cols-3' : 'grid-cols-5'
        }`}>
          <Card className="border-0 shadow-sm relative">
            {/* 待审核气泡 */}
            {stats.pending > 0 && (
              <span className="absolute -top-2 -right-2 min-w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-1.5 font-bold shadow-lg z-10">
                {stats.pending > 99 ? '99+' : stats.pending}
              </span>
            )}
            <CardContent className={`${isMobile ? 'pt-3 pb-3' : 'pt-4'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">待审核</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-yellow-600`}>{stats.pending}</p>
                </div>
                <Clock className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-yellow-400`} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className={`${isMobile ? 'pt-3 pb-3' : 'pt-4'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">已通过</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-green-600`}>{stats.approved}</p>
                </div>
                <CheckCircle className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-green-400`} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className={`${isMobile ? 'pt-3 pb-3' : 'pt-4'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">优秀</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-purple-600`}>{stats.excellent}</p>
                </div>
                <Star className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-purple-400`} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className={`${isMobile ? 'pt-3 pb-3' : 'pt-4'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">已退回</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-red-600`}>{stats.rejected}</p>
                </div>
                <XCircle className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-red-400`} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm relative">
            {/* 超时未提交气泡 */}
            {overdueTasks.length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-6 h-6 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center px-1.5 font-bold shadow-lg z-10">
                {overdueTasks.length > 99 ? '99+' : overdueTasks.length}
              </span>
            )}
            <CardContent className={`${isMobile ? 'pt-3 pb-3' : 'pt-4'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">超时未提交</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-orange-600`}>{overdueTasks.length}</p>
                </div>
                <AlertTriangle className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-orange-400`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 筛选栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">筛选：</span>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="审核状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="excellent">优秀</SelectItem>
                  <SelectItem value="rejected">已退回</SelectItem>
                  <SelectItem value="overdue">超时未提交</SelectItem>
                </SelectContent>
              </Select>
              <Select value={themeFilter} onValueChange={setThemeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="归属主题" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部主题</SelectItem>
                  {themes.map(theme => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.icon} {theme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleResetFilter}>重置</Button>
            </div>
          </CardContent>
        </Card>

        {/* 产出列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                产出列表 ({displayItems.length})
              </CardTitle>
              {batchMode && (
                <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                  {selectedIds.size === submissions.length ? '取消全选' : '全选'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : displayItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂无产出提交</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayItems.map(item => {
                  const isOverdue = 'itemType' in item && item.itemType === 'overdue';
                  const submission = isOverdue ? null : (item as Submission);
                  const itemStatus = isOverdue ? 'overdue' : (submission!.rating === 'excellent' ? 'excellent' : submission!.status);

                  return (
                    <div 
                      key={item.id}
                      className={`flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedIds.has(item.id) ? 'border-blue-500 bg-blue-50' : ''
                      } ${isOverdue ? 'border-orange-200 bg-orange-50/30' : ''}`}
                      onClick={() => {
                        if (batchMode) {
                          toggleSelect(item.id);
                        } else if (isOverdue) {
                          handleViewOverdueDetail(item as OverdueTask & { itemType: 'overdue' });
                        } else {
                          handleViewDetail(item as Submission);
                        }
                      }}
                    >
                      {batchMode && !isOverdue && (
                        <Checkbox 
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            第{item.task_stage}阶段
                          </Badge>
                          <span className="font-medium truncate flex-1">{item.task_title}</span>
                          <Badge className={statusConfig[itemStatus]?.color || ''}>
                            {statusConfig[itemStatus]?.label}
                          </Badge>
                          {!isOverdue && submission!.rating && submission!.rating !== 'approved' && submission!.rating !== 'excellent' && (
                            <Badge className={`text-xs ${ratingConfig[submission!.rating!]?.color}`}>
                              {ratingConfig[submission!.rating!]?.label}
                            </Badge>
                          )}
                        </div>
                        
                        <div className={`flex items-center gap-4 text-sm text-gray-500 mb-2 ${isMobile ? 'flex-wrap' : ''}`}>
                          <span className="flex items-center gap-1 truncate">
                            <Users className="w-4 h-4 flex-shrink-0" />
                            {item.team_name}
                          </span>
                          <span className="flex items-center gap-1 truncate">
                            {item.theme_icon && <span>{item.theme_icon}</span>}
                            {item.theme_name}
                          </span>
                          {isOverdue && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <AlertTriangle className="w-4 h-4" />
                              需处理
                            </span>
                          )}
                        </div>
                        
                        {/* 产出预览或超时信息 */}
                        {isOverdue ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-orange-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              已超时，等待志愿者处理
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {(item as Submission).content && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                文字
                              </span>
                            )}
                            {(item as Submission).file_urls?.map((file, idx) => (
                              <span key={idx} className="text-xs text-gray-400 flex items-center gap-1">
                                {fileTypeIcon[getFileType(file)]}
                                {getFileType(file)}
                              </span>
                            ))}
                            <span className="text-xs text-gray-400 ml-auto">
                              {new Date((item as Submission).created_at).toLocaleString('zh-CN')}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {!isOverdue && !isMobile && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => downloadSubmission(item as Submission)}
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 详情面板 */}
      {showDetailPanel && selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>产出详情</CardTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={statusConfig[selectedSubmission.rating === 'excellent' ? 'excellent' : selectedSubmission.status]?.color}>
                      {statusConfig[selectedSubmission.rating === 'excellent' ? 'excellent' : selectedSubmission.status]?.label}
                    </Badge>
                    {selectedSubmission.rating && selectedSubmission.rating !== 'approved' && selectedSubmission.rating !== 'excellent' && (
                      <Badge className={ratingConfig[selectedSubmission.rating]?.color}>
                        {ratingConfig[selectedSubmission.rating]?.icon}
                        {ratingConfig[selectedSubmission.rating]?.label}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowDetailPanel(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">小队</p>
                  <p className="font-medium">{selectedSubmission.team_name}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">主题</p>
                  <p className="font-medium flex items-center gap-1">
                    {selectedSubmission.theme_icon && <span>{selectedSubmission.theme_icon}</span>}
                    {selectedSubmission.theme_name}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">任务阶段</p>
                  <p className="font-medium">第{selectedSubmission.task_stage}阶段 - {selectedSubmission.task_title}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">提交时间</p>
                  <p className="font-medium">{new Date(selectedSubmission.created_at).toLocaleString('zh-CN')}</p>
                </div>
              </div>

              {/* 文字内容 */}
              {selectedSubmission.content && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-gray-700">文字内容</h4>
                  <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap text-sm">
                    {selectedSubmission.content}
                  </div>
                </div>
              )}

              {/* 附件 */}
              {selectedSubmission.file_urls && selectedSubmission.file_urls.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-gray-700">附件内容</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedSubmission.file_urls.map((file, idx) => {
                      const type = getFileType(file);
                      const url = getFileUrl(file);
                      const name = generateDownloadFilename(selectedSubmission, idx, file);
                      const ext = getFileExt(file);
                      const isArchive = type === 'archive';
                      
                      return (
                        <div key={idx} className="border rounded-lg overflow-hidden">
                          {/* 文件预览区域 */}
                          {type === 'image' ? (
                            <div 
                              className="relative cursor-pointer group"
                              onClick={() => openFilePreview(file)}
                            >
                              <img 
                                src={url} 
                                alt={name}
                                className="w-full h-40 object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ) : type === 'video' ? (
                            <div 
                              className="relative cursor-pointer group"
                              onClick={() => openFilePreview(file)}
                            >
                              <video 
                                src={url} 
                                className="w-full h-40 object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ) : type === 'audio' ? (
                            <div 
                              className="h-20 flex items-center justify-center bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                              onClick={() => openFilePreview(file)}
                            >
                              <audio src={url} controls className="w-full px-4" />
                            </div>
                          ) : isArchive ? (
                            <div className="h-20 flex flex-col items-center justify-center bg-gray-100">
                              <Archive className="w-8 h-8 text-gray-400 mb-1" />
                              <span className="text-xs text-gray-500 uppercase">{ext}</span>
                            </div>
                          ) : (
                            <div 
                              className="h-20 flex flex-col items-center justify-center bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors group"
                              onClick={() => openFilePreview(file)}
                            >
                              <FileText className="w-8 h-8 text-gray-400 mb-1" />
                              <span className="text-xs text-gray-500 uppercase">{ext}</span>
                              <ExternalLink className="w-4 h-4 text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          
                          {/* 文件名和操作 */}
                          <div className="p-2 flex items-center justify-between bg-gray-50">
                            <span className="text-xs text-gray-500 truncate flex-1" title={name}>{name}</span>
                            {isArchive ? (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => downloadFile(url, name)}
                                title="下载压缩包"
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => openFilePreview(file)}
                                  title="在线查看"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => downloadFile(url, name)}
                                  title="下载"
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 已有审核意见 */}
              {selectedSubmission.review_comment && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-gray-700">审核意见</h4>
                  <div className="p-4 bg-blue-50 rounded-lg text-sm">
                    {selectedSubmission.review_comment}
                  </div>
                </div>
              )}

              {/* 审核表单（仅待审核状态且非助学老师时显示） */}
              {selectedSubmission.status === 'pending' && admin?.role !== 'teacher' && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-sm text-gray-700">审核评价</h4>
                  
                  {/* 评价选择 */}
                  <div className="flex items-center gap-3">
                    <Label className="text-sm">评价等级：</Label>
                    <div className="flex gap-2">
                      {(['excellent', 'approved', 'rejected'] as const).map(r => (
                        <Button
                          key={r}
                          variant={reviewForm.rating === r ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            // 切换评价等级时重置额外加分
                            const defaultBonus = r === 'excellent' ? 3 : r === 'approved' ? 1 : 0;
                            setReviewForm({ ...reviewForm, rating: r, bonusPoints: defaultBonus });
                            setShowRewards(r === 'excellent');
                          }}
                          className={reviewForm.rating === r ? ratingConfig[r].color : ''}
                        >
                          {ratingConfig[r].icon}
                          {ratingConfig[r].label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* 额外加分选择（优秀/合格时显示） */}
                  {(reviewForm.rating === 'excellent' || reviewForm.rating === 'approved') && (
                    <div className="space-y-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <div className="flex items-center gap-2 text-amber-700">
                        <Star className="w-4 h-4" />
                        <span className="font-medium text-sm">
                          额外加分：{reviewForm.rating === 'excellent' ? '3-5分' : '1-2分'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {reviewForm.rating === 'excellent' ? (
                          // 优秀：3-5分
                          [3, 4, 5].map(points => (
                            <Button
                              key={points}
                              variant={reviewForm.bonusPoints === points ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setReviewForm({ ...reviewForm, bonusPoints: points })}
                              className={reviewForm.bonusPoints === points ? 'bg-amber-500 hover:bg-amber-600' : ''}
                            >
                              +{points}分
                            </Button>
                          ))
                        ) : (
                          // 合格：1-2分
                          [1, 2].map(points => (
                            <Button
                              key={points}
                              variant={reviewForm.bonusPoints === points ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setReviewForm({ ...reviewForm, bonusPoints: points })}
                              className={reviewForm.bonusPoints === points ? 'bg-green-500 hover:bg-green-600' : ''}
                            >
                              +{points}分
                            </Button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* 支线任务下发（审核通过时显示） */}
                  {(reviewForm.rating === 'excellent' || reviewForm.rating === 'approved') && sideTasks.length > 0 && (
                    <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-700">
                          <Send className="w-4 h-4" />
                          <span className="font-medium text-sm">下发支线任务（可选，最多选1个）</span>
                        </div>
                        {selectedSideTaskId && (
                          <Badge className="bg-blue-500">已选1个</Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-2">
                          {sideTasks.map(task => (
                            <div
                              key={task.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                selectedSideTaskId === task.id 
                                  ? 'border-blue-500 bg-blue-100' 
                                  : 'border-gray-200 bg-white hover:border-blue-300'
                              }`}
                              onClick={() => setDetailItem({ type: 'sideTask', item: task })}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{task.title}</span>
                                  <Badge variant="outline" className="text-xs">+{task.points}分</Badge>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                              </div>
                              {task.description && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{task.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">
                          点击任务卡片查看详情并选择
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 激励选择（优秀时显示） */}
                  {showRewards && (
                    <div className="space-y-3 p-4 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-purple-700">
                          <Gift className="w-4 h-4" />
                          <span className="font-medium text-sm">额外激励（可选，最多选1个）</span>
                        </div>
                        {selectedRewards.length > 0 && (
                          <Badge className="bg-purple-500">已选1个</Badge>
                        )}
                      </div>
                      
                      {tools.length === 0 && skills.length === 0 ? (
                        <div className="text-sm text-gray-500 py-2">
                          暂无可用的激励选项，请先在激励配置中添加隐藏工具卡或隐藏技能卡
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          {[...tools, ...skills].map(reward => (
                            <div
                              key={reward.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                selectedRewards.includes(reward.id) 
                                  ? 'border-purple-500 bg-purple-100' 
                                  : 'border-gray-200 bg-white hover:border-purple-300'
                              }`}
                              onClick={() => setDetailItem({ 
                                type: reward.type === 'tool_card' ? 'tool' : 'skill', 
                                item: reward 
                              })}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{reward.icon || (reward.type === 'tool_card' ? '🗝️' : '🔮')}</span>
                                  <span className="font-medium text-sm">{reward.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {reward.type === 'tool_card' ? '工具卡' : '技能卡'}
                                  </Badge>
                                  {reward.points && reward.points !== 0 && (
                                    <Badge variant="outline" className="text-xs text-amber-600">
                                      {reward.points > 0 ? '+' : ''}{reward.points}分
                                    </Badge>
                                  )}
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                              </div>
                              {reward.description && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{reward.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        点击激励卡片查看详情并选择
                      </p>
                    </div>
                  )}

                  {/* 下一个任务截止日期或主题完成提示（审核通过时显示） */}
                  {(reviewForm.rating === 'excellent' || reviewForm.rating === 'approved') && (
                    <>
                      {isLastTask ? (
                        /* 主题最后一个任务提示 */
                        <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <div className="flex items-center gap-2 text-blue-700">
                            <CheckCircle className="w-4 h-4" />
                            <span className="font-medium text-sm">主题任务即将完成</span>
                          </div>
                          <p className="text-xs text-blue-600">
                            这是该主题中的最后一个任务，审核通过后将完成整个主题的探索。
                          </p>
                        </div>
                      ) : (
                        /* 非最后一个任务，显示截止日期设置 */
                        <div className="space-y-2 p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex items-center gap-2 text-green-700">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium text-sm">下一个任务截止日期（可选）</span>
                          </div>
                          <Input
                            type="date"
                            value={nextTaskDeadline}
                            onChange={(e) => setNextTaskDeadline(e.target.value)}
                            className="bg-white"
                            min={minDate}
                          />
                          <p className="text-xs text-gray-500">
                            只能选择审核日期次日及以后的日期，截止时间为当日24点
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* 反馈评语 */}
                  <div className="space-y-2">
                    <Label className="text-sm">反馈评语 {reviewForm.rating === 'rejected' && <span className="text-red-500">*</span>}</Label>
                    <Textarea
                      placeholder={reviewForm.rating === 'rejected' ? '请填写修改建议...' : '可选填写反馈评语...'}
                      value={reviewForm.comment}
                      onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* 提交按钮 */}
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setShowDetailPanel(false)}
                    >
                      取消
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={handleSubmitReview}
                      disabled={submitting || !reviewForm.rating}
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Send className="w-4 h-4 mr-1" />
                      )}
                      提交审核
                    </Button>
                  </div>
                </div>
              )}

              {/* 助学老师只读提示（待审核状态且是助学老师时显示） */}
              {selectedSubmission.status === 'pending' && admin?.role === 'teacher' && (
                <div className="space-y-4 border-t pt-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-amber-800 mb-1">只读权限提示</h4>
                        <p className="text-sm text-amber-700">
                          您的账号角色是助学老师，拥有只读权限。可以查看产出的状态和内容详情，但不能执行审核评价、反馈评语、提交审核等操作。如需审核该产出，请联系对应的志愿者老师。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 已审核状态显示下载按钮 */}
              {selectedSubmission.status !== 'pending' && (
                <div className="border-t pt-4">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSubmission(selectedSubmission)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    下载所有附件
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 支线任务/激励详情弹窗 */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {detailItem.type === 'sideTask' ? (
                    <>
                      <Send className="w-5 h-5 text-blue-500" />
                      支线任务详情
                    </>
                  ) : detailItem.type === 'tool' ? (
                    <>
                      <Wrench className="w-5 h-5 text-orange-500" />
                      工具卡详情
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-green-500" />
                      技能卡详情
                    </>
                  )}
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setDetailItem(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* 标题和图标 */}
              <div className="flex items-start gap-3">
                {detailItem.type === 'sideTask' ? (
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Send className="w-6 h-6 text-blue-500" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">
                    {(detailItem.item as Reward).icon || (detailItem.type === 'tool' ? '🗝️' : '🔮')}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-bold text-lg">
                    {detailItem.type === 'sideTask' 
                      ? (detailItem.item as SideTask).title 
                      : (detailItem.item as Reward).name}
                  </h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {detailItem.type === 'sideTask' ? (
                      <Badge className="bg-blue-100 text-blue-700">支线任务</Badge>
                    ) : (
                      <Badge className="bg-purple-100 text-purple-700">
                        {detailItem.type === 'tool' ? '工具卡' : '技能卡'}
                      </Badge>
                    )}
                    {detailItem.type === 'sideTask' && (detailItem.item as SideTask).stage && (
                      <Badge variant="outline">第{(detailItem.item as SideTask).stage}阶段</Badge>
                    )}
                  </div>
                </div>
                {/* 积分值 */}
                <div className="text-right">
                  <div className={`text-xl font-bold ${
                    detailItem.type === 'sideTask' 
                      ? 'text-amber-600' 
                      : ((detailItem.item as Reward).points || 0) >= 0 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {detailItem.type === 'sideTask' 
                      ? `+${(detailItem.item as SideTask).points}` 
                      : `${((detailItem.item as Reward).points || 0) >= 0 ? '+' : ''}${(detailItem.item as Reward).points || 0}`}
                  </div>
                  <div className="text-xs text-gray-500">积分</div>
                </div>
              </div>

              {/* 任务阶段（支线任务）- 已移除，合并到标题区域 */}

              {/* 描述 */}
              <div>
                <Label className="text-sm text-gray-500">
                  {detailItem.type === 'sideTask' ? '任务描述' : '描述'}
                </Label>
                <p className="text-sm mt-1 text-gray-700">
                  {detailItem.item.description || '暂无描述'}
                </p>
              </div>

              {/* 任务要求（支线任务） */}
              {detailItem.type === 'sideTask' && (detailItem.item as SideTask).requirements && (detailItem.item as SideTask).requirements!.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-500">任务要求</Label>
                  <ul className="mt-1 space-y-1">
                    {(detailItem.item as SideTask).requirements!.map((req, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                        <div className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center text-xs text-amber-600 shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 学习目标（支线任务） */}
              {detailItem.type === 'sideTask' && (detailItem.item as SideTask).learningGoals && (detailItem.item as SideTask).learningGoals!.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-500">学习目标</Label>
                  <ul className="mt-1 space-y-1">
                    {(detailItem.item as SideTask).learningGoals!.map((goal, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 获得条件（激励） */}
              {detailItem.type !== 'sideTask' && (detailItem.item as Reward).conditions && (detailItem.item as Reward).conditions!.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-500">获得条件</Label>
                  <div className="mt-1 space-y-2">
                    {(detailItem.item as Reward).conditions!.map((condition, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center text-xs text-purple-600">
                          {index + 1}
                        </div>
                        {condition.description || condition.type}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 选择按钮 */}
              <div className="pt-4 border-t space-y-2">
                {detailItem.type === 'sideTask' ? (
                  selectedSideTaskId === detailItem.item.id ? (
                    <Button 
                      variant="outline" 
                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setSelectedSideTaskId(null);
                        setDetailItem(null);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      取消选择此任务
                    </Button>
                  ) : (
                    <Button 
                      className="w-full bg-blue-500 hover:bg-blue-600"
                      onClick={() => {
                        setSelectedSideTaskId(detailItem.item.id);
                        setDetailItem(null);
                      }}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      选择此任务
                    </Button>
                  )
                ) : (
                  selectedRewards.includes(detailItem.item.id) ? (
                    <Button 
                      variant="outline" 
                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setSelectedRewards(prev => prev.filter(id => id !== detailItem.item.id));
                        setDetailItem(null);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      取消选择此激励
                    </Button>
                  ) : (
                    <Button 
                      className={`w-full ${selectedRewards.length > 0 ? 'bg-gray-400' : 'bg-purple-500 hover:bg-purple-600'}`}
                      disabled={selectedRewards.length > 0}
                      onClick={() => {
                        // 最多选择一个激励
                        setSelectedRewards([detailItem.item.id]);
                        setDetailItem(null);
                      }}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {selectedRewards.length > 0 ? '已选择其他激励' : '选择此激励'}
                    </Button>
                  )
                )}
                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => setDetailItem(null)}
                >
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 超时任务面板 */}
      {showOverduePanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  超时未提交任务 ({overdueTasks.length})
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setShowOverduePanel(false);
                    setSelectedOverdueTask(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {!selectedOverdueTask ? (
                // 超时任务列表
                <div className="space-y-3">
                  {overdueTasks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
                      <p>暂无超时未提交的任务</p>
                    </div>
                  ) : (
                    overdueTasks.map(task => (
                      <div 
                        key={task.id}
                        className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleOverdueTask(task)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className="bg-orange-100 text-orange-700">超时</Badge>
                              <span className="font-medium">{task.team_name}</span>
                              <span className="text-gray-400 text-sm">·</span>
                              <span className="text-sm text-gray-500">{task.task_title}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <span className="text-lg">{task.theme_icon}</span>
                                {task.theme_name}
                              </span>
                              <span>阶段 {task.task_stage}</span>
                              <span className="text-amber-600 font-medium">+{task.task_points}积分</span>
                            </div>
                            <div className="flex items-center gap-1 mt-2 text-sm text-red-500">
                              <Clock className="w-4 h-4" />
                              <span>截止: {new Date(task.deadline).toLocaleDateString('zh-CN')} 24:00</span>
                            </div>
                          </div>
                          <Button size="sm" variant="outline">
                            处理
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                // 处理面板
                <div className="space-y-4">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedOverdueTask(null)}
                    className="mb-2"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                  </Button>
                  
                  {/* 任务信息 */}
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-orange-100 text-orange-700">超时</Badge>
                      <span className="font-bold">{selectedOverdueTask.task_title}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">小队：</span>{selectedOverdueTask.team_name}</div>
                      <div><span className="text-gray-500">积分：</span><span className="text-amber-600 font-medium">+{selectedOverdueTask.task_points}</span></div>
                      <div><span className="text-gray-500">截止：</span><span className="text-red-500">{new Date(selectedOverdueTask.deadline).toLocaleDateString('zh-CN')} 24:00</span></div>
                      <div><span className="text-gray-500">当前积分：</span>{selectedOverdueTask.team_points}</div>
                    </div>
                  </div>

                  {/* 处理方式选择 */}
                  <div className="space-y-2">
                    <Label className="font-semibold">处理方式</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div 
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          overdueAction === 'extend' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setOverdueAction('extend')}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className={`w-5 h-5 ${overdueAction === 'extend' ? 'text-blue-500' : 'text-gray-400'}`} />
                          <span className="font-medium">延期扣分</span>
                        </div>
                        <p className="text-sm text-gray-500">设置新截止时间，扣除部分积分</p>
                      </div>
                      <div 
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          overdueAction === 'skip' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setOverdueAction('skip')}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <SkipForward className={`w-5 h-5 ${overdueAction === 'skip' ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className="font-medium">跳过任务</span>
                        </div>
                        <p className="text-sm text-gray-500">直接进入下一任务，无法获得积分和激励</p>
                      </div>
                    </div>
                  </div>

                  {/* 延期设置 */}
                  {overdueAction === 'extend' && (
                    <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="space-y-2">
                        <Label>新截止时间</Label>
                        <Input 
                          type="date" 
                          value={extendDeadline}
                          onChange={(e) => setExtendDeadline(e.target.value)}
                          min={extendMinDate}
                          className="bg-white"
                        />
                        <p className="text-xs text-gray-500">只能选择审核日期次日及以后的日期，截止时间为当日24点</p>
                      </div>
                      <div className="space-y-2">
                        <Label>扣除积分</Label>
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            min={0}
                            max={selectedOverdueTask.task_points}
                            value={pointDeduction}
                            onChange={(e) => setPointDeduction(parseInt(e.target.value) || 0)}
                            className="w-24"
                          />
                          <span className="text-sm text-gray-500">/ {selectedOverdueTask.task_points} 分</span>
                        </div>
                        <p className="text-xs text-gray-500">建议扣除任务积分的 10%~30%</p>
                      </div>
                    </div>
                  )}

                  {/* 跳过设置 */}
                  {overdueAction === 'skip' && (
                    <div className="space-y-4">
                      {/* 下一个任务截止时间 */}
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
                        <div className="space-y-2">
                          <Label className="text-red-700 font-medium">下一个任务提交截止时间</Label>
                          <Input 
                            type="date" 
                            value={skipNextTaskDeadline}
                            onChange={(e) => setSkipNextTaskDeadline(e.target.value)}
                            className="bg-white"
                            min={skipMinDate}
                          />
                          <p className="text-xs text-red-600">只能选择审核日期次日及以后的日期，截止时间为当日24点</p>
                        </div>
                      </div>
                      
                      {/* 跳过提示 */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                          <div className="text-sm text-gray-600">
                            <p className="font-medium mb-1">确认跳过此任务？</p>
                            <ul className="list-disc list-inside space-y-1 text-gray-500">
                              <li>小队将无法获得该任务的 {selectedOverdueTask.task_points} 积分</li>
                              <li>小队将无法获得该任务关联的任何激励</li>
                              <li>任务将被标记为"未完成"</li>
                              <li>小队将直接进入下一个任务</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex gap-3 pt-4">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setSelectedOverdueTask(null)}
                    >
                      取消
                    </Button>
                    <Button 
                      className={`flex-1 ${overdueAction === 'skip' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                      onClick={handleSubmitOverdue}
                      disabled={handlingOverdue}
                    >
                      {handlingOverdue ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        overdueAction === 'extend' ? <Calendar className="w-4 h-4 mr-1" /> : <SkipForward className="w-4 h-4 mr-1" />
                      )}
                      {overdueAction === 'extend' ? '确认延期' : '确认跳过'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 文件预览模态框 - 移动端全屏覆盖产出详情 */}
      {previewFile && (
        <div 
          className={`fixed bg-black/95 z-[100] flex flex-col ${
            isMobile 
              ? 'inset-0' 
              : 'inset-0 items-center justify-center'
          }`}
          onClick={closeFilePreview}
        >
          <div 
            className={`${isMobile ? 'w-full h-full flex flex-col' : 'w-[90vw] h-[85vh] max-w-5xl flex flex-col rounded-lg overflow-hidden shadow-2xl'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部工具栏 - 移动端更明显的关闭按钮 */}
            <div className={`flex items-center justify-between shrink-0 ${isMobile ? 'p-4 bg-black' : 'p-3 bg-black/50'}`}>
              {isMobile && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-white hover:bg-white/20 h-9 px-3"
                  onClick={closeFilePreview}
                >
                  <ArrowLeft className="w-5 h-5 mr-1" />
                  返回详情
                </Button>
              )}
              <span className={`text-white truncate flex-1 ${isMobile ? 'text-center text-sm' : 'text-sm mr-2'}`}>{previewFile.name}</span>
              {!isMobile && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  onClick={closeFilePreview}
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>
            
            {/* 预览内容 - 移动端点击可关闭 */}
            <div 
              className={`flex-1 flex items-center justify-center overflow-auto ${isMobile ? 'cursor-pointer' : ''} ${isMobile ? '' : 'p-4'}`}
              onClick={isMobile ? closeFilePreview : undefined}
            >
              {previewFile.type === 'image' ? (
                <img 
                  src={previewFile.url} 
                  alt={previewFile.name}
                  className="max-w-full max-h-full object-contain"
                />
              ) : previewFile.type === 'video' ? (
                <video 
                  src={previewFile.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-full"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : previewFile.type === 'audio' ? (
                <div className="w-full max-w-md bg-white/10 rounded-lg p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                  <Music className="w-16 h-16 text-white/60 mx-auto mb-4" />
                  <audio 
                    src={previewFile.url}
                    controls
                    autoPlay
                    className="w-full"
                  />
                  <p className="text-white/80 text-center mt-4 text-sm">{previewFile.name}</p>
                </div>
              ) : previewFile.type === 'pdf' ? (
                <div className="w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <iframe 
                    src={previewFile.url}
                    className="flex-1 w-full bg-white"
                    title={previewFile.name}
                  />
                  {!isMobile && <p className="text-white/50 text-xs text-center mt-2">PDF 预览</p>}
                </div>
              ) : previewFile.type === 'office' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="bg-white/10 rounded-lg p-6 max-w-md text-center">
                    <FileText className="w-16 h-16 text-white/60 mx-auto mb-4" />
                    <p className="text-white text-sm mb-2">{previewFile.name}</p>
                    <p className="text-white/60 text-xs mb-4">Office 文档</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button 
                        variant="outline"
                        className="text-white border-white/30 hover:bg-white/10"
                        onClick={() => {
                          const viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewFile.url)}`;
                          window.open(viewerUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        在线预览
                      </Button>
                      <Button 
                        variant="outline"
                        className="text-white border-white/30 hover:bg-white/10"
                        onClick={() => window.open(previewFile.url, '_blank')}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        下载
                      </Button>
                    </div>
                  </div>
                </div>
              ) : previewFile.type === 'text' ? (
                <div className="w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="flex-1 bg-white/95 rounded-lg overflow-auto">
                    <TextFilePreview url={previewFile.url} name={previewFile.name} />
                  </div>
                  {!isMobile && <p className="text-white/50 text-xs text-center mt-2">文本预览</p>}
                </div>
              ) : (
                <div className="text-center text-white/60 p-4">
                  <FileText className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm mb-2">{previewFile.name}</p>
                  <p className="text-xs mb-4">此文件类型暂不支持预览</p>
                  <Button 
                    variant="outline"
                    className="text-white border-white/30 hover:bg-white/10"
                    onClick={() => window.open(previewFile.url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    在新标签页打开
                  </Button>
                </div>
              )}
            </div>
            
            {/* 底部提示 */}
            {isMobile && (
              <div className="p-2 bg-black text-center shrink-0">
                <p className="text-white/50 text-xs">点击图片返回详情页</p>
              </div>
            )}
            {!isMobile && (
              <div className="p-3 bg-black/50 text-center">
                <p className="text-white/50 text-xs">点击任意区域关闭预览</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
