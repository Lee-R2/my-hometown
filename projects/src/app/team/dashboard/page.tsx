'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Users,
  Trophy,
  MessageCircle,
  BookOpen,
  Star,
  Target,
  Zap,
  Edit2,
  X,
  LogOut,
  Save,
  Plus,
  Check,
  Trash2,
  Loader2,
  Clock,
  AlertCircle,
  Upload,
  FileText,
  Sparkles,
  Coins,
  ChevronDown,
  ChevronUp,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { useScrollPosition } from "@/hooks/use-scroll-position";

// 代码分割：黑板报组件（49KB）懒加载，减小 dashboard 初始 bundle
const BlackboardSection = dynamic(() => import("@/components/blackboard-section"), {
  ssr: false,
  loading: () => null,
});
import { SubmissionReviewDialog } from "@/components/submission-review-dialog";

interface Team {
  id: string;
  code: string;
  name: string;
  slogan?: string;
  rules?: string;
  points: number;
  currentThemeId?: string;
  currentTaskId?: string;
  next_task_deadline?: string; // 下一个任务截止日期
  createdBy?: string; // 创建者（志愿者）ID
  hasCompletedPretest?: boolean;
  preferred_difficulty?: 'easy' | 'medium' | 'hard'; // 小队偏好难度
  cycle?: number; // 当前周期
  members: Array<{
    id: string;
    name: string;
    role: string;
    intro?: string;
    isApproved: boolean;
  }>;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  icon: string;
  isCurrentTeamTheme?: boolean; // 当前小队选择的主题
  currentTeamStage?: number | null;
  currentTeamTotalStages?: number | null;
  selectedByOtherTeam?: boolean;
  selectedByTeamName?: string | null;
  selectedByTeamStage?: number | null;
  selectedByTeamTotalStages?: number | null;
  selectedByTeamPoints?: number | null;
  // 新增：已完成主题标记
  isCompletedByTeam?: boolean; // 该主题是否已被当前小队完成过
  isTeamCompletedCurrentTheme?: boolean; // 小队是否已完成当前主题（进入新一轮）
  selectedByTeamCompleted?: boolean; // 其他小队是否已完成该主题
  otherTeamInfo?: { // 其他小队进度信息（用于查看进度）
    teamId: string;
    teamName: string;
    currentStage: number;
    totalStages: number;
    points: number;
    isCompleted: boolean;
  } | null;
}

interface Task {
  id: string;
  title: string;
  description: string;
  stage: number;
  points: number;
  requirements: any[];
  isSideTask?: boolean;
  task_type?: 'main' | 'side' | 'final';
  difficulty?: 'easy' | 'medium' | 'hard';
  requiredSkillsTotal?: number;
  requiredSkillsCompleted?: number;
  allRequiredSkillsCompleted?: boolean;
  nextTaskDeadline?: string | null;
  isDeadlineExpired?: boolean;
  hasSubmission?: boolean;
  submissionId?: string | null;
}

// 同志愿者其他小队信息
interface SiblingTeam {
  id: string;
  code: string;
  name: string;
  points: number;
  status: string;
  createdAt: string;
  currentTheme: {
    id: string;
    name: string;
    icon: string;
  } | null;
  currentTask: {
    id: string;
    title: string;
    stage: number;
  } | null;
  currentStage: number;
  totalStages: number;
  progress: string | null;
  isCompleted: boolean;
  completedThemes: Array<{
    id: string;
    theme_id: string;
    completed_at: string;
    total_points: number;
    total_rewards: number;
    total_tasks: number;
    theme: { id: string; name: string; icon: string };
  }>;
  completedThemesCount: number;
  // 新增：周期标记
  isInSameCycle: boolean; // 是否与当前小队在同一周期
  completedCurrentTheme: boolean; // 是否已完成当前主题
  cycleGap: number; // 周期差距：正数领先，负数落后，0同一周期
}

export default function TeamDashboard() {
  // 页面滚动位置记忆
  useScrollPosition();
  

  // 路由
  const router = useRouter();

  const [team, setTeam] = useState<Team | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [borrowAlert, setBorrowAlert] = useState({ pendingCount: 0, repayCount: 0, overdueCount: 0 });
  const [receivedTransferCount, setReceivedTransferCount] = useState(0);

  // 难度选择状态
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>(
    (team?.preferred_difficulty as 'easy' | 'medium' | 'hard') || 'medium'
  );
  const [isChangingDifficulty, setIsChangingDifficulty] = useState(false);
  const [showDifficultySelector, setShowDifficultySelector] = useState(false);
  const [availableDifficulties, setAvailableDifficulties] = useState<string[]>(['easy', 'medium', 'hard']);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // 切换难度
  const handleChangeDifficulty = async (newDifficulty: 'easy' | 'medium' | 'hard') => {
    if (!team || isChangingDifficulty) return;
    setIsChangingDifficulty(true);
    try {
      const res = await fetch('/api/team/difficulty-preference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: team.id, difficulty: newDifficulty }),
      });
      if (res.ok) {
        setSelectedDifficulty(newDifficulty);
        setTeam({ ...team, preferred_difficulty: newDifficulty });
        // 重新加载任务以获取对应难度的变体
        const taskRes = await fetch(`/api/team/current-task?teamId=${team.id}`);
        const taskData = await taskRes.json();
        if (taskData?.task) setCurrentTask(taskData.task);
        if (taskData?.availableDifficulties) setAvailableDifficulties(taskData.availableDifficulties);
        toast.success(`已切换为${newDifficulty === 'easy' ? '简单' : newDifficulty === 'medium' ? '中等' : '困难'}难度`);
      }
    } catch {
      toast.error('切换难度失败');
    } finally {
      setIsChangingDifficulty(false);
      setShowDifficultySelector(false);
    }
  };

  // 前测状态
  const [pretestRequired, setPretestRequired] = useState(false);

  // 组队状态（派生值）
  const hasSlogan = team?.slogan && team.slogan.trim().length > 0;
  const hasMembers = team?.members && team.members.length > 0;
  const hasTeamFormed = hasSlogan && hasMembers;
  // 三个角色是否都有成员（指引者、光影法师、秘语学者）
  const memberRoles = new Set((team?.members || []).map(m => m.role));
  const hasAllRoles = memberRoles.has('guider') && memberRoles.has('light_mage') && memberRoles.has('secret_scholar');

  // 小队信息编辑状态
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempSlogan, setTempSlogan] = useState("");
  const [tempRules, setTempRules] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // 成员编辑状态
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: '', role: 'guider', intro: '' });
  const [editMemberData, setEditMemberData] = useState({ name: '', role: '', intro: '' });

  // 已完成主题（归档数据）
  const [completedThemes, setCompletedThemes] = useState<Array<{
    id: string;
    theme_id: string;
    completed_at: string;
    total_points: number;
    total_rewards: number;
    total_tasks: number;
    theme: { id: string; name: string; icon: string };
  }>>([]);

  // 历史主题折叠状态
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // 同志愿者其他小队信息
  const [siblingTeams, setSiblingTeams] = useState<SiblingTeam[]>([]);

  // 存档数据弹窗
  const [selectedArchive, setSelectedArchive] = useState<{
    loading: boolean;
    data: {
      completion: {
        id: string;
        team_id: string;
        theme_id: string;
        completed_at: string;
        total_points: number;
        total_rewards: number;
        total_tasks: number;
        theme: { id: string; name: string; icon: string; description?: string };
      };
      completedTasks: Array<{
        id: string;
        task_id: string;
        status: string;
        rating?: string;
        reviewed_at?: string;
        review_comment?: string;
        content?: string;
        file_urls?: Array<{
          url?: string;
          name?: string;
          type?: string;
          size?: number;
        }>;
        task: { id: string; title: string; stage: number; points: number } | null;
      }>;
      skillLearnings: Array<{
        id: string;
        status: string;
        started_at: string;
        completed_at: string;
        points_earned: number;
        skill: { id: string; name: string; icon: string; category: string } | null;
        task: { id: string; title: string; stage: number } | null;
      }>;
      rewards: Array<{
        id: string;
        earned_at: string;
        reward: { id: string; name: string; icon: string; type: string } | null;
        task: { id: string; title: string; stage: number } | null;
      }>;
      stats: {
        totalTasks: number;
        completedTasks: number;
        totalPointsEarned: number;
        totalSkillsLearned: number;
        totalRewardsEarned: number;
      };
    } | null;
  }>({ loading: false, data: null });

  // 其他小队任务进度弹窗
  const [siblingTeamTasks, setSiblingTeamTasks] = useState<{
    loading: boolean;
    data: {
      team: { id: string; name: string };
      theme: { id: string; name: string; icon: string; description?: string } | null;
      tasks: Array<{
        id: string;
        title: string;
        stage: number;
        points: number;
        description?: string;
        task_type: string;
        submission: {
          id: string;
          status: string;
          rating?: string;
          review_comment?: string;
          reviewer_name?: string | null;
          reviewed_at?: string;
          created_at: string;
          content?: string;
          file_urls: Array<{ url?: string; name?: string; type?: string; size?: number }>;
          likeCount: number;
          liked: boolean;
        } | null;
      } | null>;
    } | null;
  }>({ loading: false, data: null });

  // 格式化积分显示（四舍五入保留1位小数）
  const formatPoints = (points: number | undefined | null): string => {
    if (points === undefined || points === null) return '0.0';
    return Number(points).toFixed(1);
  };

  // 查看存档数据
  const handleViewArchive = async (completionId: string) => {
    setSelectedArchive({ loading: true, data: null });
    try {
      const res = await fetch(`/api/team/theme-completions/${completionId}/archive`);
      const data = await res.json();
      if (res.ok) {
        setSelectedArchive({ loading: false, data });
      } else {
        toast.error(data.error || '获取存档数据失败');
        setSelectedArchive({ loading: false, data: null });
      }
    } catch (error) {
      toast.error('获取存档数据失败');
      setSelectedArchive({ loading: false, data: null });
    }
  };

  // 查看其他小队任务进度
  const handleViewSiblingTeamTasks = async (teamId: string) => {
    setSiblingTeamTasks({ loading: true, data: null });
    try {
      const res = await fetch(`/api/team/sibling-teams/${teamId}/tasks?fromTeamId=${team?.id || ''}`);
      const data = await res.json();
      if (res.ok) {
        setSiblingTeamTasks({ loading: false, data });
      } else {
        toast.error(data.error || '获取任务进度失败');
        setSiblingTeamTasks({ loading: false, data: null });
      }
    } catch (error) {
      toast.error('获取任务进度失败');
      setSiblingTeamTasks({ loading: false, data: null });
    }
  };

  // 检查小队信息是否完整（用于送爱心功能）
  const checkTeamInfoComplete = (): { isComplete: boolean; message: string } => {
    // 检查队名
    const teamName = team?.name?.trim();
    if (!teamName || teamName === '我的小队' || teamName === '未命名小队') {
      return { isComplete: false, message: '请先修改小队队名后才能送爱心哦～' };
    }

    // 检查口号
    const hasSlogan = team?.slogan && team.slogan.trim().length > 0;
    if (!hasSlogan) {
      return { isComplete: false, message: '请先添加小队口号后才能送爱心哦～' };
    }

    // 检查成员
    const hasMembers = team?.members && team.members.length > 0;
    if (!hasMembers) {
      return { isComplete: false, message: '请先添加小队成员后才能送爱心哦～' };
    }

    return { isComplete: true, message: '' };
  };

  // 点赞/取消点赞
  const handleToggleLike = async (submissionId: string, toTeamId: string, stage: number, currentlyLiked: boolean) => {
    if (!team?.id) {
      toast.error('请先登录');
      return;
    }

    // 如果是点赞（不是取消点赞），检查小队信息是否完整
    if (!currentlyLiked) {
      const { isComplete, message } = checkTeamInfoComplete();
      if (!isComplete) {
        toast.error(message);
        return;
      }
    }

    try {
      const res = await fetch(`/api/submissions/${submissionId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromTeamId: team.id,
          toTeamId,
          stage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // 更新本地状态
        setSiblingTeamTasks(prev => {
          if (!prev.data) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              tasks: prev.data.tasks.map(t => {
                if (!t || !t.submission || t.submission.id !== submissionId) return t;
                return {
                  ...t,
                  submission: {
                    ...t.submission,
                    liked: !currentlyLiked,
                    likeCount: currentlyLiked 
                      ? Math.max(0, t.submission.likeCount - 1)
                      : t.submission.likeCount + 1,
                  },
                };
              }),
            },
          };
        });
        
        // 更新本地积分（点赞者获得1积分，取消点赞扣除1积分）
        if (data.success && team) {
          const pointsDelta = currentlyLiked ? -1 : 1;
          const newPoints = Math.max(0, (team.points || 0) + pointsDelta);
          const updatedTeam = { ...team, points: newPoints };
          setTeam(updatedTeam);
          localStorage.setItem('team', JSON.stringify(updatedTeam));
        }
        
        toast.success(data.message);
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  };

  // 角色配置
  const roleConfig: Record<string, { label: string; className: string; icon: string }> = {
    guider: { label: '指引者', className: 'bg-blue-500', icon: '🧭' },
    light_mage: { label: '光影法师', className: 'bg-amber-500', icon: '✨' },
    secret_scholar: { label: '秘语学者', className: 'bg-purple-500', icon: '📚' },
  };

  // 判断队名是否可编辑
  const canEditName = !team?.currentThemeId || !currentTask;

  // 导航函数
  const navigate = (path: string) => {
    window.location.href = path;
  };

  // 初始化加载
  useEffect(() => {
    const teamData = localStorage.getItem("team");
    if (!teamData) {
      window.location.href = "/team/login";
      return;
    }

    try {
      const teamObj = JSON.parse(teamData);
      
      // 规范化字段名：处理旧缓存数据（蛇形命名）和新数据（驼峰命名）
      const normalizedTeam: Team = {
        ...teamObj,
        currentThemeId: teamObj.currentThemeId || teamObj.current_theme_id || null,
        currentTaskId: teamObj.currentTaskId || teamObj.current_task_id || null,
        hasCompletedPretest: teamObj.hasCompletedPretest ?? teamObj.has_completed_pretest ?? false,
        createdBy: teamObj.createdBy || teamObj.created_by || null,
        preferred_difficulty: teamObj.preferred_difficulty || 'medium',
      };
      
      // 更新 localStorage（一次性修复旧缓存）
      localStorage.setItem("team", JSON.stringify(normalizedTeam));
      
      setTeam(normalizedTeam);
      setNewName(normalizedTeam.name || "");
      setTempSlogan(normalizedTeam.slogan || "");
      setTempRules(normalizedTeam.rules || "");
      loadTeamData(normalizedTeam);
    } catch (e) {
      localStorage.removeItem("team");
      window.location.href = "/team/login";
    }
  }, []);

  // 点击外部关闭难度选择器
  useEffect(() => {
    const handleClickOutside = () => {
      if (showDifficultySelector) setShowDifficultySelector(false);
    };
    if (showDifficultySelector) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showDifficultySelector]);

  // 加载小队数据
  const loadTeamData = async (teamObj: Team) => {
    try {
      // 并行加载主题、任务、未读消息、已完成主题、同志愿者其他小队
      // 传入createdBy参数，用于检查同一志愿者的其他小队已选择的主题
      const themesUrl = teamObj.createdBy 
        ? `/api/themes?teamId=${teamObj.id}&createdByVolunteer=${teamObj.createdBy}`
        : `/api/themes?teamId=${teamObj.id}`;
      
      // 修复：使用 Promise.allSettled 替代 Promise.all，任一 fetch 失败不会导致整体中断
      const fetchSafe = async (url: string): Promise<Response> => {
        try {
          return await fetch(url);
        } catch (err) {
          console.error(`Fetch 失败 ${url}:`, err);
          return new Response(JSON.stringify({ error: 'network_error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      };

      const [themesRes, taskRes, unreadRes, completionsRes, siblingTeamsRes, pretestRes, borrowRes, transferRes] = await Promise.all([
        fetchSafe(themesUrl),
        fetchSafe(`/api/team/current-task?teamId=${teamObj.id}`),
        fetchSafe(`/api/team/notifications/unread-count?teamId=${teamObj.id}`),
        fetchSafe(`/api/team/theme-completions?teamId=${teamObj.id}`),
        // 获取同志愿者其他小队信息
        teamObj.createdBy
          ? fetchSafe(`/api/team/sibling-teams?teamId=${teamObj.id}&createdBy=${teamObj.createdBy}`)
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ teams: [] }) } as Response),
        // 获取前测状态
        fetchSafe(`/api/team/pretest?teamId=${teamObj.id}`),
        // 获取借积分待处理数量
        fetchSafe(`/api/team/borrow/history?team_id=${teamObj.id}`),
        // 获取收到的赠送积分数量
        fetchSafe(`/api/team/transfer/history?team_id=${teamObj.id}&type=received&limit=50`),
        // 成员列表和小队基本信息已由 team-login API 返回并存储于 localStorage，无需重复请求
      ]);

      // 检查响应是否有效并解析JSON
      const safeJsonParse = async (res: Response, name: string) => {
        if (!res.ok) {
          const text = await res.text();
          console.error(`${name} API响应错误:`, text.substring(0, 200));
          return null;
        }
        try {
          return await res.json();
        } catch (e) {
          console.error(`${name} JSON解析错误:`, e);
          return null;
        }
      };

      const themesData = await safeJsonParse(themesRes, '主题');
      const taskData = await safeJsonParse(taskRes, '任务');
      const unreadData = await safeJsonParse(unreadRes, '未读消息');
      const completionsData = await safeJsonParse(completionsRes, '已完成主题');
      const siblingTeamsData = await safeJsonParse(siblingTeamsRes, '同志愿者小队');
      const pretestData = await safeJsonParse(pretestRes, '前测');
      const borrowData = await safeJsonParse(borrowRes, '借积分');
      const transferData = await safeJsonParse(transferRes, '赠送积分');

      if (themesData?.themes) setThemes(themesData.themes);
      if (taskData?.task) setCurrentTask(taskData.task);
      if (taskData?.availableDifficulties) setAvailableDifficulties(taskData.availableDifficulties);
      // 初始化难度偏好
      if (teamObj.preferred_difficulty) {
        setSelectedDifficulty(teamObj.preferred_difficulty as 'easy' | 'medium' | 'hard');
      }
      if (unreadData?.total !== undefined) setUnreadCount(unreadData.total);
      if (completionsData?.completions) setCompletedThemes(completionsData.completions);
      if (siblingTeamsData?.teams) setSiblingTeams(siblingTeamsData.teams);
      
      // 处理借积分气泡
      if (borrowData?.data) {
        const allRecords = borrowData.data;
        // 出借方视角：收到的借积分请求（type=lent, status=pending），即需要自己确认的请求
        const lentPendingRecords = allRecords.filter((r: any) => r.type === 'lent' && r.status === 'pending');
        // 借入方视角：自己发起的借积分历史记录（type=borrowed, status非pending）
        const borrowedHistoryRecords = allRecords.filter((r: any) => r.type === 'borrowed' && r.status !== 'pending');
        // 借入方逾期未还记录
        const borrowedOverdueRecords = allRecords.filter((r: any) => r.type === 'borrowed' && r.is_overdue);
        try {
          const readHistoryIds: Set<string> = localStorage.getItem(`readBorrowHistoryIds_${teamObj.id}`)
            ? new Set(JSON.parse(localStorage.getItem(`readBorrowHistoryIds_${teamObj.id}`)!))
            : new Set();
          // 待确认气泡：出借方收到的待确认请求数量
          // 借/还记录气泡：借入方的未读历史记录数量
          // 逾期气泡：借入方逾期未还的记录数量
          const unreadBorrowedHistory = borrowedHistoryRecords.filter((r: any) => !readHistoryIds.has(r.id)).length;
          setBorrowAlert({ pendingCount: lentPendingRecords.length, repayCount: unreadBorrowedHistory, overdueCount: borrowedOverdueRecords.length });
        } catch {
          setBorrowAlert({ pendingCount: lentPendingRecords.length, repayCount: borrowedHistoryRecords.length, overdueCount: borrowedOverdueRecords.length });
        }
      }
      
      // 处理收到的赠送积分数量（排除已读）
      if (transferData?.data) {
        try {
          const stored = localStorage.getItem(`readTransferIds_${teamObj.id}`);
          const readIds: Set<string> = stored ? new Set(JSON.parse(stored)) : new Set();
          const unreadReceived = transferData.data.filter((r: any) => !readIds.has(r.id));
          setReceivedTransferCount(unreadReceived.length);
        } catch {
          setReceivedTransferCount(transferData.data.length);
        }
      }
      
      // 累积所有更新到 team 对象，最后一次性 setTeam 避免覆盖
      let teamUpdates: Partial<Team> = {};

      // 小队基本信息（name, slogan, rules, points, cycle 等）和成员列表
      // 已由 team-login API 返回并存储于 localStorage，无需再次请求
      // 成员数据确保保留（来自登录缓存）
      if (teamObj.members) {
        teamUpdates.members = teamObj.members;
      }
      
      // 前测状态：同步 hasCompletedPretest 到 team 对象
      if (pretestData) {
        const allMembersCompleted = pretestData.allMembersCompleted === true;
        const hasCompletedPretest = teamObj.hasCompletedPretest || allMembersCompleted;
        if (hasCompletedPretest) {
          teamUpdates.hasCompletedPretest = true;
        }
        setPretestRequired(!allMembersCompleted && !teamObj.hasCompletedPretest);
      }
      
      // 更新小队积分（从API获取最新值）
      if (taskData?.teamPoints !== undefined && teamObj.points !== taskData.teamPoints) {
        teamUpdates.points = taskData.teamPoints;
      }
      
      // 一次性应用所有更新
      if (Object.keys(teamUpdates).length > 0) {
        const updatedTeam = { ...teamObj, ...teamUpdates };
        setTeam(updatedTeam);
        localStorage.setItem('team', JSON.stringify(updatedTeam));
      }
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 修改队名
  const handleUpdateName = async () => {
    if (!team || !newName.trim()) {
      toast.error("请输入小队名称");
      return;
    }

    setIsSavingName(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
      });

      const data = await res.json();
      if (data.success) {
        const updatedTeam = { ...team, name: newName.trim() };
        setTeam(updatedTeam);
        localStorage.setItem("team", JSON.stringify(updatedTeam));
        setShowNameEdit(false);
        toast.success("小队名称修改成功");
      } else {
        toast.error(data.error || "修改失败");
      }
    } catch (error) {
      toast.error("修改失败，请稍后重试");
    } finally {
      setIsSavingName(false);
    }
  };

  // 选择主题
  const handleSelectTheme = async (themeId: string) => {
    if (!team) return;
    
    // 检查前测是否已完成
    if (!team?.hasCompletedPretest) {
      toast.error("请先完成前测问卷");
      router.push('/team/pretest');
      return;
    }

    if (team.currentThemeId) {
      toast.error("你已选择主题，完成当前主题后才能选择新主题");
      return;
    }

    const theme = themes.find(t => t.id === themeId);
    if (theme?.selectedByOtherTeam) {
      toast.error(`该主题已被「${theme.selectedByTeamName || '其他小队'}」选择，无法重复选择`);
      return;
    }

    // 检查队名
    const teamName = team.name?.trim();
    if (!teamName || teamName === '我的小队' || teamName === '未命名小队') {
      toast.error("请先编辑小队队名");
      return;
    }

    // 检查三个角色是否都有成员
    if (!hasAllRoles) {
      toast.error("请先添加小队成员，确保三个角色都有成员后再选择主题");
      return;
    }

    try {
      const res = await fetch("/api/themes/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, themeId })
      });

      const data = await res.json();
      if (data.success) {
        const updatedTeam = { ...team, currentThemeId: themeId };
        setTeam(updatedTeam);
        localStorage.setItem("team", JSON.stringify(updatedTeam));
        setThemes(prev => prev.map(t => 
          t.id === themeId ? { ...t, selectedByOtherTeam: false } : t
        ));
        setSelectedTheme(null);
        toast.success("主题选择成功！开始你的探索之旅吧！");
      } else {
        toast.error(data.error || "选择主题失败");
      }
    } catch (error) {
      toast.error("选择主题失败");
    }
  };

  // 退出登录
  const handleLogout = () => {
    // 清空银蛇博士会话ID，保证退出再进入是新对话
    if (team?.id) {
      sessionStorage.removeItem(`yinshe_session_${team.id}`);
    }
    localStorage.removeItem("team");
    window.location.href = "/";
  };

  // 保存小队信息
  const handleSaveInfo = async () => {
    if (!team) return;

    // 验证小队名称
    if (!tempName.trim()) {
      toast.error("小队名称不能为空");
      return;
    }

    setSavingInfo(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: tempName.trim(),
          slogan: tempSlogan.trim() || null,
          rules: tempRules,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // 使用 API 返回的完整数据同步到页面
        const updatedTeam = { 
          ...team, 
          ...(data.team || {}),
          name: tempName.trim(),
          slogan: tempSlogan.trim() || undefined,
          rules: tempRules,
        };
        setTeam(updatedTeam);
        localStorage.setItem("team", JSON.stringify(updatedTeam));
        setIsEditingInfo(false);
        toast.success("小队信息已更新");
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setSavingInfo(false);
    }
  };

  // 取消编辑小队信息
  const handleCancelEditInfo = () => {
    setTempName(team?.name || "");
    setTempSlogan(team?.slogan || "");
    setTempRules(team?.rules || "");
    setIsEditingInfo(false);
  };

  // 添加成员
  const handleAddMember = async () => {
    if (!newMember.name) {
      toast.error("请输入成员姓名");
      return;
    }

    try {
      const res = await fetch(`/api/teams/${team?.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMember),
      });

      const data = await res.json();
      if (data.success) {
        // 使用 API 返回的成员数据同步到页面
        const newMemberData = data.member || data;
        const updatedMembers = [...(team?.members || []), newMemberData];
        const updatedTeam = { ...team!, members: updatedMembers };
        setTeam(updatedTeam);
        localStorage.setItem("team", JSON.stringify(updatedTeam));
        setShowAddMember(false);
        setNewMember({ name: '', role: 'guider', intro: '' });
        toast.success("成员添加成功");
      } else {
        toast.error(data.error || "添加失败");
      }
    } catch (error) {
      toast.error("添加失败");
    }
  };

  // 开始编辑成员
  const startEditMember = (member: any) => {
    setEditingMemberId(member.id);
    setEditMemberData({
      name: member.name,
      role: member.role,
      intro: member.intro || '',
    });
  };

  // 保存成员编辑
  const handleSaveMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/teams/${team?.id}/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editMemberData),
      });

      const data = await res.json();
      if (data.success) {
        const updatedMembers = team?.members?.map(m => 
          m.id === memberId ? { ...m, ...editMemberData } : m
        ) || [];
        const updatedTeam = { ...team!, members: updatedMembers };
        setTeam(updatedTeam);
        localStorage.setItem("team", JSON.stringify(updatedTeam));
        setEditingMemberId(null);
        setEditMemberData({ name: '', role: '', intro: '' });
        toast.success("成员信息已更新");
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存失败");
    }
  };

  // 删除成员
  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!confirm(`确定要删除成员"${memberName}"吗？`)) return;

    try {
      const res = await fetch(`/api/teams/${team?.id}/members/${memberId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (data.success) {
        const updatedMembers = team?.members?.filter(m => m.id !== memberId) || [];
        const updatedTeam = { ...team!, members: updatedMembers };
        setTeam(updatedTeam);
        localStorage.setItem("team", JSON.stringify(updatedTeam));
        toast.success("成员已删除");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (error) {
      toast.error("删除失败");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-500 rounded-xl flex items-center justify-center shrink-0">
              <Rocket className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 truncate">{team?.name || "我的小队"}</h1>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={!canEditName}
                  onClick={() => setShowNameEdit(true)}
                >
                  <Edit2 className={`w-3.5 h-3.5 ${canEditName ? 'text-gray-400' : 'text-gray-300'}`} />
                </Button>
              </div>
              <p className="text-xs text-gray-500">小队编码: {team?.code}</p>
              {team?.slogan && (
                <p className="text-xs text-purple-600 font-medium truncate hidden sm:block">"{team.slogan}"</p>
              )}
            </div>
          </div>
          
          {/* 桌面端按钮 */}
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex items-center gap-2 bg-yellow-50 px-3 py-1.5 rounded-full">
              <Star className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-semibold text-yellow-700">{formatPoints(team?.points)}积分</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" />
              退出
            </Button>
          </div>
          
          {/* 移动端：积分和退出按钮 */}
          <div className="flex sm:hidden items-center gap-2">
            <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full">
              <Star className="w-3.5 h-3.5 text-yellow-600" />
              <span className="text-xs font-semibold text-yellow-700">{team?.points || 0}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>
      </nav>

      {/* 修改队名弹窗 */}
      {showNameEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>修改小队名称</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowNameEdit(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">小队名称</Label>
                <Input
                  id="teamName"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="请输入小队名称"
                  maxLength={20}
                />
                <p className="text-xs text-gray-400">{newName.length}/20 字符</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowNameEdit(false)}>取消</Button>
                <Button className="flex-1 bg-gradient-to-r from-green-500 to-blue-500" onClick={handleUpdateName} disabled={isSavingName}>
                  {isSavingName ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 主题详情弹窗 */}
      {selectedTheme && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    selectedTheme.isCurrentTeamTheme 
                      ? (selectedTheme.isTeamCompletedCurrentTheme
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                        : 'bg-gradient-to-br from-blue-400 to-purple-500')
                      : (selectedTheme.isCompletedByTeam 
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                        : 'bg-gradient-to-br from-blue-400 to-purple-500')
                  }`}>
                    {selectedTheme.icon || "🎯"}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{selectedTheme.name}</span>
                    {selectedTheme.isCurrentTeamTheme ? (
                      selectedTheme.isTeamCompletedCurrentTheme && (
                        <Badge className="bg-green-500 text-white text-xs">已探索</Badge>
                      )
                    ) : (
                      selectedTheme.isCompletedByTeam && (
                        <Badge className="bg-green-500 text-white text-xs">已探索</Badge>
                      )
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedTheme(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* 当前小队选择的主题 */}
              {selectedTheme.isCurrentTeamTheme ? (
                <div className="p-6">
                  {/* 当前主题的完成状态应基于当前周期，而非历史周期 */}
                  {(() => {
                    const isCurrentThemeCompleted = selectedTheme.isTeamCompletedCurrentTheme;
                    return (
                    <>
                    <div className={`rounded-lg p-4 mb-4 ${
                      isCurrentThemeCompleted 
                        ? 'bg-gradient-to-r from-green-50 to-emerald-50' 
                        : 'bg-gradient-to-r from-blue-50 to-purple-50'
                    }`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                          isCurrentThemeCompleted 
                            ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                            : 'bg-gradient-to-br from-blue-500 to-purple-500'
                        }`}>
                          {team?.name?.charAt(0) || '我'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {team?.name || '我的小队'}
                            {selectedTheme.isCompletedByTeam && !isCurrentThemeCompleted && (
                              <span className="ml-2 text-xs text-amber-600 font-normal">（再次探索）</span>
                            )}
                          </p>
                          <p className={`text-xs font-medium ${
                            isCurrentThemeCompleted ? 'text-green-600' : 'text-blue-600'
                          }`}>
                            {isCurrentThemeCompleted ? '已完成此主题探索' : '我们正在探索'}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/60 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">任务进度</p>
                          <p className="font-bold text-blue-600">
                            {currentTask ? `阶段 ${currentTask.stage}` : '等待任务下发'}
                            {selectedTheme.currentTeamTotalStages ? `/${selectedTheme.currentTeamTotalStages}` : ''}
                          </p>
                        </div>
                        <div className="bg-white/60 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">已获积分</p>
                          <p className="font-bold text-amber-600">{formatPoints(team?.points)} 分</p>
                        </div>
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg border ${
                      isCurrentThemeCompleted 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <p className={`text-sm ${isCurrentThemeCompleted ? 'text-green-700' : 'text-blue-700'}`}>
                        {isCurrentThemeCompleted 
                          ? '🎉 恭喜完成此主题探索！可以选择新主题开始新一轮探索之旅。' 
                          : selectedTheme.isCompletedByTeam 
                            ? '🔄 再次探索此主题，完成全新的任务获取更多积分！'
                            : '🎯 继续努力完成探索任务，获取更多积分和奖励！'}
                      </p>
                    </div>
                    </>
                    );
                  })()}
                </div>
              ) : selectedTheme.selectedByOtherTeam && !themes.some(t => t.isTeamCompletedCurrentTheme) ? (
                /* 其他小队选择的主题（仅在未完成当前主题时显示为不可选） */
                <div className="p-6">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                        {selectedTheme.selectedByTeamName?.charAt(0) || '小'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{selectedTheme.selectedByTeamName}</p>
                        <p className="text-xs text-gray-500">其他小队正在探索</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">任务进度</p>
                        <p className="font-bold text-blue-600">阶段 {selectedTheme.selectedByTeamStage}/{selectedTheme.selectedByTeamTotalStages}</p>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">已获积分</p>
                        <p className="font-bold text-amber-600">{selectedTheme.selectedByTeamPoints} 分</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-100 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600">
                      💡 该主题已被其他小队选择，您无法选择此主题。
                    </p>
                  </div>
                </div>
              ) : selectedTheme.otherTeamInfo ? (
                /* 其他小队选择的主题（已完成当前主题，显示进度） */
                <div className="p-6">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        selectedTheme.otherTeamInfo.isCompleted 
                          ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                          : 'bg-gradient-to-br from-blue-500 to-purple-500'
                      }`}>
                        {selectedTheme.otherTeamInfo.teamName?.charAt(0) || '小'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{selectedTheme.otherTeamInfo.teamName}</p>
                        <p className="text-xs text-gray-500">
                          {selectedTheme.otherTeamInfo.isCompleted ? '已完成探索' : '正在探索中'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">任务进度</p>
                        <p className="font-bold text-blue-600">
                          {selectedTheme.otherTeamInfo.isCompleted 
                            ? '已完成' 
                            : `阶段 ${selectedTheme.otherTeamInfo.currentStage}/${selectedTheme.otherTeamInfo.totalStages}`}
                        </p>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">已获积分</p>
                        <p className="font-bold text-amber-600">{formatPoints(selectedTheme.otherTeamInfo.points)} 分</p>
                      </div>
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold mb-3">主题介绍</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedTheme.description || "暂无介绍"}</p>
                </div>
              ) : (
                /* 未选择的主题 */
                <div className="p-6">
                  <h4 className="text-sm font-semibold mb-3">主题介绍</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedTheme.description || "暂无介绍"}</p>
                  {selectedTheme.isCompletedByTeam && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-700">
                        🔄 您已探索过此主题，可以再次选择体验不同的任务产出！
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-4">选择主题后，将解锁对应的阶段任务，按顺序完成探索之旅。</p>
                </div>
              )}
              <div className="p-4 border-t bg-gray-50">
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedTheme(null)}>关闭</Button>
                  {/* 可选择主题的条件：未选择主题 或 已完成当前主题（进入新一轮），且不是其他小队正在进行的主题（除非已完成当前主题） */}
                  {(!team?.currentThemeId || themes.some(t => t.isTeamCompletedCurrentTheme)) && 
                   !selectedTheme.isCurrentTeamTheme && 
                   (!selectedTheme.selectedByOtherTeam || themes.some(t => t.isTeamCompletedCurrentTheme)) && (
                    <Button className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500" onClick={() => handleSelectTheme(selectedTheme.id)}>
                      {selectedTheme.isCompletedByTeam ? '再次选择' : '选择此主题'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        <div className="space-y-6">
          
          {/* 步骤1：完善小队信息 - 未设置口号时显示（最优先） */}
          {!hasSlogan && (
            <Card className="border-2 border-dashed border-orange-300 bg-gradient-to-r from-orange-50 to-yellow-50">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-yellow-400 rounded-2xl flex items-center justify-center shadow-lg">
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-orange-700">完善小队信息</h3>
                      <p className="text-sm text-gray-600">
                        请先设置小队口号和队规，完善信息后需完成前测问卷！
                      </p>
                    </div>
                  </div>
                  <Button
                    className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600"
                    onClick={() => router.push('/team/members')}
                  >
                    前往设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 步骤2：前测问卷 - 信息完善后、未完成前测时显示 */}
          {hasSlogan && !team?.hasCompletedPretest && (
            <Card className="border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                      <span className="text-2xl">📋</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-purple-700">前测问卷</h3>
                      <p className="text-sm text-gray-600">请完成前测问卷，系统将根据结果为你推荐角色，完成后获得 <span className="font-bold text-purple-600">+10积分</span></p>
                    </div>
                  </div>
                  <Button 
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    onClick={() => router.push('/team/pretest')}
                  >
                    前往填写
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 步骤3：添加成员 - 前测完成后、三个角色未满时显示 */}
          {team?.hasCompletedPretest && !hasAllRoles && (
            <Card className="border-2 border-dashed border-cyan-300 bg-gradient-to-r from-cyan-50 to-blue-50">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-400 rounded-2xl flex items-center justify-center shadow-lg">
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-cyan-700">添加小队成员</h3>
                      <p className="text-sm text-gray-600">
                        根据前测角色建议添加成员，三个角色都有成员后即可选择主题！
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge className={memberRoles.has('guider') ? 'bg-blue-500' : 'bg-gray-300'}>
                          🧭 指引者 {memberRoles.has('guider') ? '✓' : '待添加'}
                        </Badge>
                        <Badge className={memberRoles.has('light_mage') ? 'bg-amber-500' : 'bg-gray-300'}>
                          ✨ 光影法师 {memberRoles.has('light_mage') ? '✓' : '待添加'}
                        </Badge>
                        <Badge className={memberRoles.has('secret_scholar') ? 'bg-purple-500' : 'bg-gray-300'}>
                          📚 秘语学者 {memberRoles.has('secret_scholar') ? '✓' : '待添加'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                    onClick={() => router.push('/team/members')}
                  >
                    前往添加
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 数据看板 - 三个角色都有成员后显示 */}
          {hasAllRoles && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="w-5 h-5 text-amber-500" />
                  数据看板
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <div 
                    className="flex flex-col items-center p-3 bg-blue-50 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() => navigate("/team/tasks")}
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
                      <Target className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-sm font-medium">我的任务</p>
                  </div>
                  <div 
                    className="flex flex-col items-center p-3 bg-green-50 rounded-xl cursor-pointer hover:bg-green-100 transition-colors"
                    onClick={() => navigate("/team/learning")}
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-2">
                      <BookOpen className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-sm font-medium">新知学习</p>
                  </div>
                  <div 
                    className="flex flex-col items-center p-3 bg-purple-50 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors"
                    onClick={() => navigate("/team/rewards")}
                  >
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
                      <Trophy className="w-5 h-5 text-purple-600" />
                    </div>
                    <p className="text-sm font-medium">激励中心</p>
                  </div>

                  <div 
                    className="flex flex-col items-center p-3 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors relative"
                    onClick={() => navigate("/team/transfer")}
                  >
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-2 relative">
                      <Coins className="w-5 h-5 text-amber-600" />
                      {receivedTransferCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-0.5 font-medium">
                          {receivedTransferCount > 9 ? '9+' : receivedTransferCount}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">赠送积分</p>
                  </div>
                  <div 
                    className="flex flex-col items-center p-3 bg-indigo-50 rounded-xl cursor-pointer hover:bg-indigo-100 transition-colors relative"
                    onClick={() => navigate("/team/borrow")}
                  >
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-2 relative">
                      <Clock className="w-5 h-5 text-indigo-600" />
                      {(() => {
                        // 出借方：lent pending 数量（待确认）
                        // 借入方：borrowed 非pending 未读数量（借/还积分）
                        // 借入方逾期未还数量
                        // 两者/三者都有：显示之和
                        const totalBubble = borrowAlert.pendingCount + borrowAlert.repayCount + borrowAlert.overdueCount;
                        return totalBubble > 0 ? (
                          <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-0.5 font-medium">
                            {totalBubble > 9 ? '9+' : totalBubble}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-sm font-medium">借积分</p>
                  </div>
                  <div 
                    className="flex flex-col items-center p-3 bg-orange-50 rounded-xl cursor-pointer hover:bg-orange-100 transition-colors relative md:col-span-1"
                    onClick={() => navigate("/team/messages")}
                  >
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mb-2 relative">
                      <MessageCircle className="w-5 h-5 text-orange-600" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-0.5 font-medium">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">消息中心</p>
                    {unreadCount > 0 && <p className="text-xs text-red-500">{unreadCount}条未读</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 云朵市集 - 独立卡片 */}
          {hasAllRoles && (
            <Card className="border-0 shadow-lg bg-gradient-to-br from-sky-50 to-cyan-50">
              <CardContent className="p-4">
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => navigate("/team/market")}
                >
                  <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-7 h-7 text-sky-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-base text-sky-900">云朵市集</p>
                    <p className="text-sm text-sky-700">出售、购买、兑换技能/工具/作品</p>
                  </div>
                  <ChevronDown className="w-5 h-5 text-sky-400 -rotate-90" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 家乡黑板报 */}
          {team?.currentThemeId && (
            <BlackboardSection teamId={team.id} teamCode={team.code} />
          )}

          <div className="h-4" />

            {/* 当前任务 - 已选择主题且有任务时显示 */}
            {currentTask && team?.currentThemeId && (
              <Card 
                className={`border-0 shadow-lg ${
                  currentTask.task_type === 'final' 
                    ? 'ring-2 ring-amber-400 bg-gradient-to-r from-amber-50 to-orange-50' 
                    : currentTask.isSideTask 
                    ? 'ring-2 ring-green-400 cursor-pointer hover:shadow-xl transition-shadow'
                    : 'cursor-pointer hover:shadow-xl transition-shadow'
                }`}
                onClick={() => {
                  // 最后任务不跳转，只能通过"填写反馈表单"按钮操作
                  if (currentTask.task_type !== 'final') {
                    navigate(`/team/task/${currentTask.id}`);
                  }
                }}
              >
                <CardHeader className="pt-0 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {currentTask.task_type === 'final' ? (
                          <>
                            <span className="text-xl">🏆</span>
                            最后任务
                          </>
                        ) : currentTask.isSideTask ? (
                          <>
                            <Target className="w-5 h-5 text-green-500" />
                            支线任务
                          </>
                        ) : (
                          <>
                            <Zap className="w-5 h-5 text-yellow-500" />
                            正在执行的任务
                          </>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {currentTask.task_type === 'final' 
                          ? '所有成员完成反馈表单后，任务自动完成' 
                          : currentTask.isSideTask 
                          ? '志愿者老师为你分配的额外任务，完成可获得额外奖励！' 
                          : '点击查看任务详情，完成任务获得积分和激励卡片'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {currentTask.task_type === 'final' && (
                        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">🏆 最后任务</Badge>
                      )}
                      {currentTask.isSideTask && <Badge className="bg-green-500">支线</Badge>}
                      {currentTask.task_type !== 'final' && !currentTask.isSideTask && (
                        <>
                          <Badge className="bg-gradient-to-r from-blue-500 to-purple-500">第{currentTask.stage}阶段</Badge>
                          {/* 难度选择器 */}
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                                currentTask.difficulty === 'easy' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                                currentTask.difficulty === 'hard' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                                'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              }`}
                              onClick={e => {
                                e.stopPropagation();
                                setShowDifficultySelector(!showDifficultySelector);
                              }}
                              disabled={isChangingDifficulty}
                            >
                              <Settings className="w-3 h-3" />
                              {currentTask.difficulty === 'easy' ? '简单' : currentTask.difficulty === 'hard' ? '困难' : '中等'}
                              {isChangingDifficulty && <Loader2 className="w-3 h-3 animate-spin" />}
                            </button>
                            {showDifficultySelector && (
                              <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 py-1 min-w-[100px]">
                                {(['easy', 'medium', 'hard'] as const)
                                  .filter(d => availableDifficulties.includes(d))
                                  .map(d => (
                                  <button
                                    key={d}
                                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                                      currentTask.difficulty === d ? 'font-bold bg-gray-50' : ''
                                    }`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleChangeDifficulty(d);
                                    }}
                                    disabled={isChangingDifficulty}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${
                                      d === 'easy' ? 'bg-green-500' : d === 'hard' ? 'bg-red-500' : 'bg-yellow-500'
                                    }`} />
                                    {d === 'easy' ? '简单' : d === 'hard' ? '困难' : '中等'}
                                    {currentTask.difficulty === d && <Check className="w-3 h-3 ml-auto" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-0">
                  <h3 className="text-xl font-bold mb-2">{currentTask.title}</h3>
                  <p className="text-gray-600 mb-4">{currentTask.description}</p>
                  
                  {/* 截止日期 */}
                  {team?.next_task_deadline && (
                    <div className="flex items-center gap-2 mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <Clock className="w-5 h-5 text-orange-500" />
                      <div>
                        <p className="text-sm font-medium text-orange-700">提交截止日期</p>
                        <p className="text-xs text-orange-600">
                          {new Date(team.next_task_deadline).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })} 24:00
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {currentTask.requirements && currentTask.requirements.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold mb-2">任务要求：</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {(typeof currentTask.requirements === "string" ? JSON.parse(currentTask.requirements) : currentTask.requirements).map((req: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-blue-500">•</span>
                            {req}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-500" />
                      <span className="font-semibold">{currentTask.points}积分</span>
                    </div>
                    {currentTask.requiredSkillsTotal !== undefined && currentTask.requiredSkillsTotal > 0 && (
                      currentTask.allRequiredSkillsCompleted ? (
                        <Badge className="bg-green-500 text-xs">✓ 必学技能已完成</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                          必学技能 {currentTask.requiredSkillsCompleted}/{currentTask.requiredSkillsTotal}
                        </Badge>
                      )
                    )}
                  </div>
                  
                  {/* 上传按钮 */}
                  <div className="mt-4 pt-4 border-t border-gray-200" onClick={e => e.stopPropagation()}>
                    {/* 最后任务 - 显示填写反馈按钮 */}
                    {currentTask.task_type === 'final' ? (
                      <Button 
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
                        onClick={e => { e.stopPropagation(); navigate(`/team/final-task-feedback/${currentTask.id}`); }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        填写反馈表单
                      </Button>
                    ) : (
                      <>
                        {/* 超时提示 */}
                        {currentTask.isDeadlineExpired && (
                          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2 text-red-700">
                              <AlertCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">
                                已超过提交截止时间，无法上传任务产出
                              </span>
                            </div>
                          </div>
                        )}
                        {currentTask.isDeadlineExpired ? (
                          <div 
                            onClick={() => toast.error('任务提交已超时')}
                            className="cursor-pointer"
                          >
                            <Button 
                              className="w-full bg-gray-400 cursor-not-allowed"
                              disabled
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              已超时，无法提交
                            </Button>
                          </div>
                        ) : currentTask.allRequiredSkillsCompleted !== false ? (
                          <div className="space-y-2">
                            <Button 
                              className="w-full bg-gradient-to-r from-green-500 to-blue-500"
                              onClick={e => { e.stopPropagation(); navigate(`/team/submit?taskId=${currentTask.id}`); }}
                            >
                              提交产出
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <p className="text-sm text-orange-700">请先完成所有必学技能后再提交产出</p>
                            <Button 
                              variant="outline"
                              className="w-full mt-2"
                              onClick={e => { e.stopPropagation(); navigate(`/team/task/${currentTask.id}`); }}
                            >
                              去完成必学技能
                            </Button>
                          </div>
                        )}
                        {/* 让银蛇博士帮我把关 - 已提交产出后显示 */}
                        {currentTask.hasSubmission && (
                          <Button
                            variant="outline"
                            className="w-full mt-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                            onClick={e => { e.stopPropagation(); setShowReviewDialog(true); }}
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            让银蛇博士帮我把关
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 探索主题 - 有任务时隐藏，只显示上方任务执行卡片 */}
            {!currentTask && team?.currentThemeId ? (
              /* 已选择主题 */
              <Card className="border-0 shadow-lg">
                <CardHeader className="pt-0">
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-blue-500" />
                    探索主题
                  </CardTitle>
                  <CardDescription>
                    {themes.some(t => t.isTeamCompletedCurrentTheme) 
                      ? '恭喜完成主题探索！选择新的主题开始新一轮探索之旅' 
                      : '请等待志愿者老师下发任务'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-0">
                  <div className="space-y-4">
                    {/* 本小队选择的主题 */}
                    {themes.filter(t => t.isCurrentTeamTheme).map(theme => {
                      // 当前小队主题的完成状态应基于当前周期，而非历史周期
                      // isTeamCompletedCurrentTheme 反映当前周期是否完成
                      // isCompletedByTeam 反映是否在任意历史周期完成过（仅作信息标记）
                      const isCurrentThemeCompleted = theme.isTeamCompletedCurrentTheme;
                      return (
                      <div key={theme.id}>
                        <div 
                          className={`flex items-start gap-4 p-4 rounded-lg cursor-pointer hover:shadow-md transition-shadow ${
                            isCurrentThemeCompleted 
                              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200' 
                              : 'bg-gradient-to-r from-blue-50 to-purple-50'
                          }`}
                          onClick={() => setSelectedTheme(theme)}
                        >
                          <div className="flex flex-col items-center">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl shadow-md ${
                              isCurrentThemeCompleted 
                                ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                                : 'bg-gradient-to-br from-blue-500 to-purple-500'
                            }`}>
                              {theme.icon || "🎯"}
                            </div>
                            <span className={`mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isCurrentThemeCompleted 
                                ? 'text-green-600 bg-green-100' 
                                : 'text-blue-600 bg-blue-100'
                            }`}>
                              {isCurrentThemeCompleted ? '已完成' : '我的探索主题'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-lg">{theme.name}</h4>
                              {isCurrentThemeCompleted ? (
                                <Badge className="bg-green-500">已完成</Badge>
                              ) : (
                                <Badge className="bg-blue-500">已选择</Badge>
                              )}
                              {theme.isCompletedByTeam && !isCurrentThemeCompleted && (
                                <Badge className="bg-amber-500 text-white text-xs">再探索</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{theme.description}</p>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    
                    {/* 如果已完成当前主题，显示其他可选主题 */}
                    {themes.some(t => t.isTeamCompletedCurrentTheme) && themes.filter(t => !t.isCurrentTeamTheme).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-3 font-medium">选择新的探索主题</p>
                        <div className="grid grid-cols-3 gap-2">
                          {themes.filter(t => !t.isCurrentTeamTheme).map(theme => (
                            <div
                              key={theme.id}
                              className="relative group cursor-pointer rounded-lg border-2 border-transparent hover:border-blue-400 bg-gradient-to-br from-white to-gray-50 hover:from-blue-50 hover:to-purple-50 transition-all hover:shadow-md overflow-hidden"
                              onClick={() => setSelectedTheme(theme)}
                            >
                              {/* 已完成标记 */}
                              {theme.isCompletedByTeam && (
                                <div className="absolute top-1 right-1 z-10">
                                  <Badge className="bg-green-500 text-white text-xs px-1.5 py-0">已探索</Badge>
                                </div>
                              )}
                              {/* 其他小队进度标记 */}
                              {theme.otherTeamInfo && (
                                <div className="absolute bottom-1 left-1 right-1 z-10">
                                  <div className="bg-blue-100/80 rounded px-1.5 py-0.5 text-xs text-blue-700 truncate">
                                    {theme.otherTeamInfo.teamName}: {theme.otherTeamInfo.isCompleted ? '已完成' : `阶段${theme.otherTeamInfo.currentStage}/${theme.otherTeamInfo.totalStages}`}
                                  </div>
                                </div>
                              )}
                              <div className="p-3 text-center">
                                <div className={`w-14 h-14 mx-auto mb-2 rounded-xl flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform ${
                                  theme.isCompletedByTeam 
                                    ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                                    : 'bg-gradient-to-br from-blue-400 to-purple-500'
                                }`}>
                                  {theme.icon || "🎯"}
                                </div>
                                <h4 className="font-semibold text-sm mb-1 truncate">{theme.name}</h4>
                                <p className="text-xs text-gray-500 line-clamp-2 h-8">{theme.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* 同一志愿者其他小队选择的主题（仅在未完成当前主题时显示为不可选） */}
                    {themes.filter(t => t.selectedByOtherTeam && !themes.some(tt => tt.isTeamCompletedCurrentTheme)).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-3 font-medium flex items-center gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                          其他小队已选择（不可选）
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {themes.filter(t => t.selectedByOtherTeam && !themes.some(tt => tt.isTeamCompletedCurrentTheme)).map(theme => (
                            <div
                              key={theme.id}
                              className="relative group cursor-pointer rounded-lg border-2 border-gray-200 bg-gray-100 transition-all overflow-hidden opacity-60"
                              onClick={() => setSelectedTheme(theme)}
                            >
                              <div className="p-3 text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-gray-300 rounded-xl flex items-center justify-center text-2xl shadow-sm">
                                  {theme.icon || "🎯"}
                                </div>
                                <h4 className="font-semibold text-sm mb-1 truncate text-gray-500">{theme.name}</h4>
                                <p className="text-xs text-gray-400 line-clamp-1">{theme.selectedByTeamName || '已选择'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {!currentTask && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-amber-600">⏳</span>
                        </div>
                        <div>
                          <p className="font-medium text-amber-800 mb-1">等待志愿者下发任务</p>
                          <p className="text-sm text-amber-700">志愿者老师将为你分配第一阶段任务，请耐心等待。</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* 未选择主题 */
              <Card className="border-0 shadow-lg">
                <CardHeader className="pt-0">
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-blue-500" />
                    探索主题
                  </CardTitle>
                  <CardDescription>选择一个感兴趣的主题，开始你的探索之旅</CardDescription>
                </CardHeader>
                <CardContent className="pb-0">
                  {themes.length > 0 ? (
                    <div className="space-y-4">
                      {/* 可选主题 */}
                      {themes.filter(t => !t.selectedByOtherTeam).length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-3 font-medium">点击查看主题介绍</p>
                          <div className="grid grid-cols-3 gap-2">
                            {themes.filter(t => !t.selectedByOtherTeam).map(theme => (
                              <div
                                key={theme.id}
                                className="relative group cursor-pointer rounded-lg border-2 border-transparent hover:border-blue-400 bg-gradient-to-br from-white to-gray-50 hover:from-blue-50 hover:to-purple-50 transition-all hover:shadow-md overflow-hidden"
                                onClick={() => setSelectedTheme(theme)}
                              >
                                <div className="p-3 text-center">
                                  <div className="w-14 h-14 mx-auto mb-2 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform">
                                    {theme.icon || "🎯"}
                                  </div>
                                  <h4 className="font-semibold text-sm mb-1 truncate">{theme.name}</h4>
                                  <p className="text-xs text-gray-500 line-clamp-2 h-8">{theme.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 已被其他小队选择的主题 */}
                      {themes.filter(t => t.selectedByOtherTeam).length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-3 font-medium flex items-center gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                            其他小队已选择（不可选）
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {themes.filter(t => t.selectedByOtherTeam).map(theme => (
                              <div
                                key={theme.id}
                                className="relative group cursor-pointer rounded-lg border-2 border-gray-200 bg-gray-100 transition-all overflow-hidden opacity-60"
                                onClick={() => setSelectedTheme(theme)}
                              >
                                <div className="p-3 text-center">
                                  <div className="w-14 h-14 mx-auto mb-2 bg-gray-300 rounded-xl flex items-center justify-center text-3xl shadow-sm">
                                    {theme.icon || "🎯"}
                                  </div>
                                  <h4 className="font-semibold text-sm mb-1 truncate text-gray-500">{theme.name}</h4>
                                  <p className="text-xs text-gray-400 line-clamp-2 h-8">{theme.description}</p>
                                </div>
                                <div className="absolute top-1 right-1">
                                  <Badge variant="outline" className="text-xs text-gray-500 border-gray-300 bg-gray-50">
                                    {theme.selectedByTeamName || '已选择'}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Rocket className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>暂无可选主题</p>
                      <p className="text-sm mt-1">请联系管理员添加任务主题</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 其他小队进度（同志愿者其他小队） */}
            {siblingTeams.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pt-0">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    其他小队进度
                  </CardTitle>
                  <CardDescription>
                    {themes.some(t => t.isTeamCompletedCurrentTheme) 
                      ? '新一轮探索周期中其他小队的进度' 
                      : '同一志愿者指导的其他小队任务完成情况'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-0">
                  <div className="space-y-3">
                    {/* 同周期小队 */}
                    {siblingTeams.filter(t => t.isInSameCycle).length > 0 && (
                      <>
                        {siblingTeams.filter(t => t.isInSameCycle).map((siblingTeam) => (
                          <div 
                            key={siblingTeam.id}
                            className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                              siblingTeam.completedCurrentTheme 
                                ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 
                                : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
                            }`}
                            onClick={() => handleViewSiblingTeamTasks(siblingTeam.id)}
                          >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-md ${
                              siblingTeam.completedCurrentTheme 
                                ? 'bg-gradient-to-br from-green-400 to-emerald-500' 
                                : 'bg-gradient-to-br from-blue-400 to-indigo-500'
                            }`}>
                              {siblingTeam.currentTheme?.icon || '🎯'}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold">{siblingTeam.name}</h4>
                                {/* 周期标签 */}
                                <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">
                                  同一周期
                                </Badge>
                                {siblingTeam.completedCurrentTheme ? (
                                  <Badge className="bg-green-500">已完成</Badge>
                                ) : (
                                  <Badge className="bg-blue-500">进行中</Badge>
                                )}
                                {siblingTeam.completedThemesCount > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    已完成 {siblingTeam.completedThemesCount} 个主题
                                  </Badge>
                                )}
                              </div>
                              
                              {siblingTeam.currentTheme && (
                                <div className="flex flex-col gap-1 mt-1">
                                  {/* 主题信息 */}
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <span className="flex items-center gap-1">
                                      <Rocket className="w-4 h-4 text-blue-500" />
                                      {siblingTeam.currentTheme.name}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Star className="w-4 h-4 text-amber-500" />
                                      {formatPoints(siblingTeam.points)} 积分
                                    </span>
                                  </div>
                                  {/* 当前任务信息 */}
                                  {siblingTeam.currentTask && !siblingTeam.completedCurrentTheme && (
                                    <div className="flex items-center gap-4 text-sm">
                                      <span className="flex items-center gap-1 text-indigo-600">
                                        <Target className="w-4 h-4" />
                                        <span className="font-medium">第{siblingTeam.currentTask.stage}阶段：</span>
                                        <span>{siblingTeam.currentTask.title}</span>
                                      </span>
                                      <span className="text-gray-400 text-xs">
                                        ({siblingTeam.progress || '0/0'})
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* 已完成主题列表 */}
                              {siblingTeam.completedThemes.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {siblingTeam.completedThemes.slice(0, 3).map((ct) => (
                                    <Badge key={ct.id} variant="outline" className="text-xs bg-white">
                                      {ct.theme?.icon} {ct.theme?.name}
                                    </Badge>
                                  ))}
                                  {siblingTeam.completedThemes.length > 3 && (
                                    <Badge variant="outline" className="text-xs bg-gray-100">
                                      +{siblingTeam.completedThemes.length - 3} 更多
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {/* 不同周期小队（显示折叠） */}
                    {siblingTeams.filter(t => !t.isInSameCycle).length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                          <span className="text-sm text-gray-600">
                            其他周期小队 ({siblingTeams.filter(t => !t.isInSameCycle).length} 个)
                          </span>
                        </summary>
                        <div className="mt-2 space-y-2">
                          {siblingTeams.filter(t => !t.isInSameCycle).map((siblingTeam) => (
                            <div 
                              key={siblingTeam.id}
                              className="flex items-center gap-4 p-3 rounded-lg border bg-gray-50 border-gray-200 opacity-60 cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => handleViewSiblingTeamTasks(siblingTeam.id)}
                            >
                              <div className="w-10 h-10 bg-gray-400 rounded-xl flex items-center justify-center text-xl">
                                {siblingTeam.currentTheme?.icon || '🎯'}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{siblingTeam.name}</h4>
                                  {/* 周期差距标签 */}
                                  {siblingTeam.cycleGap === 0 ? (
                                    <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">
                                      同一周期
                                    </Badge>
                                  ) : siblingTeam.cycleGap > 0 ? (
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                                      领先 {siblingTeam.cycleGap} 周期
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                                      落后 {Math.abs(siblingTeam.cycleGap)} 周期
                                    </Badge>
                                  )}
                                </div>
                                {/* 当前任务信息 */}
                                {siblingTeam.currentTheme && siblingTeam.currentTask && !siblingTeam.completedCurrentTheme && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {siblingTeam.currentTheme.name} · 第{siblingTeam.currentTask.stage}阶段：{siblingTeam.currentTask.title}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <Star className="w-3 h-3 text-amber-500" />
                                    {formatPoints(siblingTeam.points)} 积分
                                  </span>
                                  {siblingTeam.completedThemesCount > 0 && (
                                    <span>已完成 {siblingTeam.completedThemesCount} 个主题</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 已完成主题（归档数据） */}
            {completedThemes.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pt-0">
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    已完成主题
                  </CardTitle>
                  <CardDescription>点击卡片查看存档数据</CardDescription>
                </CardHeader>
                <CardContent className="pb-0">
                  <div className="space-y-3">
                    {/* 最新完成的主题：始终展开显示 */}
                    {completedThemes.slice(0, 1).map((completion) => (
                      <div 
                        key={completion.id}
                        className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 hover:shadow-md transition-shadow"
                      >
                        <div 
                          className="flex items-center gap-4 cursor-pointer"
                          onClick={() => handleViewArchive(completion.id)}
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-2xl shadow-md">
                            {completion.theme?.icon || '🏆'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold">{completion.theme?.name || '未知主题'}</h4>
                              <Badge className="bg-green-500">已完成</Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-amber-500" />
                                {formatPoints(completion.total_points)} 积分
                              </span>
                              <span className="flex items-center gap-1">
                                <Trophy className="w-4 h-4 text-purple-500" />
                                {completion.total_rewards} 激励
                              </span>
                              <span className="flex items-center gap-1">
                                <Target className="w-4 h-4 text-blue-500" />
                                {completion.total_tasks} 任务
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              完成于 {new Date(completion.completed_at).toLocaleDateString('zh-CN', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                          </div>
                          <div className="text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-amber-200/50">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/report/${completion.id}`, '_blank');
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-full hover:from-amber-600 hover:to-orange-600 transition-all active:scale-95 shadow-sm"
                          >
                            <FileText className="w-4 h-4" />
                            任务报告
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* 以往完成的主题：折叠显示 */}
                    {completedThemes.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setHistoryExpanded(!historyExpanded)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {historyExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              收起历史主题
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              查看更多 {completedThemes.length - 1} 个已完成主题
                            </>
                          )}
                        </button>

                        {historyExpanded && (
                          <div className="space-y-2">
                            {completedThemes.slice(1).map((completion) => (
                              <div 
                                key={completion.id}
                                className="p-3 bg-muted/50 rounded-lg border border-border hover:shadow-md hover:bg-muted/70 transition-all"
                              >
                                <div 
                                  className="flex items-center gap-3 cursor-pointer"
                                  onClick={() => handleViewArchive(completion.id)}
                                >
                                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-xl">
                                    {completion.theme?.icon || '🏆'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-medium text-sm truncate">{completion.theme?.name || '未知主题'}</h4>
                                      <Badge variant="outline" className="text-xs flex-shrink-0">已完成</Badge>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                      <span>{formatPoints(completion.total_points)} 积分</span>
                                      <span>{completion.total_tasks} 任务</span>
                                      <span>{new Date(completion.completed_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                  </div>
                                  <div className="text-muted-foreground/50 flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-border/50">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(`/report/${completion.id}`, '_blank');
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium rounded-full hover:from-amber-600 hover:to-orange-600 transition-all active:scale-95 shadow-sm"
                                  >
                                    <FileText className="w-3 h-3" />
                                    任务报告
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 小队信息卡片 */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 pt-0">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-500" />
                  小队信息
                </CardTitle>
                {!isEditingInfo ? (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setTempName(team?.name || "");
                      setTempSlogan(team?.slogan || "");
                      setTempRules(team?.rules || "");
                      setIsEditingInfo(true);
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    编辑
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleCancelEditInfo}
                      disabled={savingInfo}
                    >
                      <X className="w-4 h-4 mr-1" />
                      取消
                    </Button>
                    <Button 
                      size="sm"
                      onClick={handleSaveInfo}
                      disabled={savingInfo}
                    >
                      {savingInfo ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-1" />
                      )}
                      保存
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pb-0">
                {/* 小队名称 */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">小队名称</Label>
                  {isEditingInfo ? (
                    <Input
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="请输入小队名称"
                      maxLength={20}
                    />
                  ) : (
                    <p className="font-medium">{team?.name || '未设置'}</p>
                  )}
                </div>

                {/* 小队口号 */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">小队口号</Label>
                  {isEditingInfo ? (
                    <Input
                      value={tempSlogan}
                      onChange={(e) => setTempSlogan(e.target.value)}
                      placeholder="例如：团结协作，勇攀高峰"
                      maxLength={50}
                    />
                  ) : (
                    <p className="text-gray-700">{team?.slogan ? `"${team.slogan}"` : <span className="text-gray-400 italic">暂无口号</span>}</p>
                  )}
                </div>

                {/* 小队队规 */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">小队队规</Label>
                  {isEditingInfo ? (
                    <textarea
                      value={tempRules}
                      onChange={(e) => setTempRules(e.target.value)}
                      placeholder="请输入小队队规"
                      rows={3}
                      className="w-full border rounded-lg p-2 text-sm resize-none"
                    />
                  ) : (
                    <p className="text-gray-700 whitespace-pre-wrap">{team?.rules || <span className="text-gray-400 italic">暂无队规</span>}</p>
                  )}
                </div>

                {/* 小队成员 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-500">
                      小队成员 ({team?.members?.length || 0}人)
                    </Label>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => setShowAddMember(true)}
                      className="h-7 text-cyan-500 hover:text-cyan-600"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      添加
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {team?.members?.map((member) => (
                      <div 
                        key={member.id}
                        className="p-2 border rounded-lg bg-white/50 hover:bg-white/80 transition-colors"
                      >
                        {editingMemberId === member.id ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                value={editMemberData.name}
                                onChange={(e) => setEditMemberData({ ...editMemberData, name: e.target.value })}
                                placeholder="姓名"
                                className="h-8 text-sm"
                              />
                              <select
                                value={editMemberData.role}
                                onChange={(e) => setEditMemberData({ ...editMemberData, role: e.target.value })}
                                className="h-8 border rounded px-2 text-sm bg-white"
                              >
                                <option value="guider">🧭 指引者</option>
                                <option value="light_mage">✨ 光影法师</option>
                                <option value="secret_scholar">📚 秘语学者</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <Input
                                value={editMemberData.intro}
                                onChange={(e) => setEditMemberData({ ...editMemberData, intro: e.target.value })}
                                placeholder="一句话介绍"
                                className="h-8 text-sm flex-1"
                              />
                              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setEditingMemberId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                              <Button size="sm" className="h-8 px-2" onClick={() => handleSaveMember(member.id)}>
                                <Check className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-medium text-xs shrink-0">
                                {member.name?.charAt(0) || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="font-medium text-sm">{member.name}</span>
                                  {roleConfig[member.role] && (
                                    <Badge className={`${roleConfig[member.role].className} text-[10px] px-1 py-0 h-4`}>
                                      {roleConfig[member.role].icon} {roleConfig[member.role].label}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0"
                                onClick={() => startEditMember(member)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                                onClick={() => handleDeleteMember(member.id, member.name)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {(!team?.members || team.members.length === 0) && (
                      <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                        <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">还没有添加成员</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
        </div>

        {/* 添加成员弹窗 */}
        {showAddMember && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-sm mx-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>添加成员</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAddMember(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">成员姓名 *</Label>
                  <Input 
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    placeholder="请输入队员姓名"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">角色</Label>
                  <select
                    value={newMember.role}
                    onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                    className="w-full h-10 border rounded-lg px-3 bg-white"
                  >
                    <option value="guider">🧭 指引者</option>
                    <option value="light_mage">✨ 光影法师</option>
                    <option value="secret_scholar">📚 秘语学者</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">一句话自我介绍</Label>
                  <Input 
                    value={newMember.intro}
                    onChange={(e) => setNewMember({ ...newMember, intro: e.target.value })}
                    placeholder="用一句话介绍自己"
                    maxLength={50}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAddMember(false)}>
                    取消
                  </Button>
                  <Button className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500" onClick={handleAddMember}>
                    保存
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 存档数据弹窗 */}
        {(selectedArchive.loading || selectedArchive.data) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedArchive.data?.completion?.theme && (
                      <>
                        <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-xl">
                          {selectedArchive.data.completion.theme.icon || '🏆'}
                        </div>
                        <span>{selectedArchive.data.completion.theme.name} - 存档数据</span>
                      </>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedArchive({ loading: false, data: null })}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto max-h-[calc(90vh-80px)]">
                {selectedArchive.loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : selectedArchive.data ? (
                  <div className="p-4 space-y-6">
                    {/* 统计概览 */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{selectedArchive.data.stats.completedTasks}</p>
                        <p className="text-xs text-gray-500">完成任务</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-amber-600">{selectedArchive.data.stats.totalPointsEarned}</p>
                        <p className="text-xs text-gray-500">获得积分</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{selectedArchive.data.stats.totalSkillsLearned}</p>
                        <p className="text-xs text-gray-500">学习技能</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-purple-600">{selectedArchive.data.stats.totalRewardsEarned}</p>
                        <p className="text-xs text-gray-500">获得激励</p>
                      </div>
                    </div>

                    {/* 已完成任务 */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-500" />
                        我的任务
                      </h4>
                      {selectedArchive.data.completedTasks.length > 0 ? (
                        <div className="space-y-2">
                          {selectedArchive.data.completedTasks.map((task) => (
                            <div key={task.id} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-sm font-bold text-blue-600">
                                  {task.task?.stage || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{task.task?.title || '未知任务'}</p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {task.task?.points && (
                                      <span>任务积分 {task.task.points}</span>
                                    )}
                                    {task.reviewed_at && (
                                      <span>· 审核于 {new Date(task.reviewed_at).toLocaleDateString('zh-CN')}</span>
                                    )}
                                  </div>
                                </div>
                                {/* 审核结果标签 */}
                                {task.rating === 'excellent' ? (
                                  <Badge className="bg-amber-500 text-xs">优秀</Badge>
                                ) : task.rating === 'approved' ? (
                                  <Badge className="bg-green-500 text-xs">合格</Badge>
                                ) : task.rating === 'rejected' ? (
                                  <Badge className="bg-red-500 text-xs">不合格</Badge>
                                ) : (
                                  <Badge className="bg-green-500 text-xs">已完成</Badge>
                                )}
                              </div>
                              {/* 任务描述 */}
                              {task.content && (
                                <p className="mt-2 text-sm text-gray-600 line-clamp-2">{task.content}</p>
                              )}
                              {/* 审核评语 */}
                              {task.review_comment && (
                                <div className="mt-2 p-2 bg-blue-50 rounded border-l-2 border-blue-400">
                                  <p className="text-xs text-gray-500 mb-1">审核评语</p>
                                  <p className="text-sm text-gray-700">{task.review_comment}</p>
                                </div>
                              )}
                              {/* 提交文件链接 */}
                              {task.file_urls && task.file_urls.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                                  {task.file_urls.map((file, idx) => (
                                    <a 
                                      key={idx}
                                      href={file.url || '#'} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                      <FileText className="w-3 h-3" />
                                      {file.name || `文件${idx + 1}`}
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">暂无完成任务记录</p>
                      )}
                    </div>

                    {/* 技能学习 */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-green-500" />
                        新知学习
                      </h4>
                      {selectedArchive.data.skillLearnings.length > 0 ? (
                        <div className="space-y-2">
                          {selectedArchive.data.skillLearnings.filter(l => l.status === 'completed').map((learning) => (
                            <div key={learning.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-lg">
                                {learning.skill?.icon || '📖'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{learning.skill?.name || '未知技能'}</p>
                                <p className="text-xs text-gray-500">
                                  {learning.task?.title ? `关联任务：${learning.task.title}` : '自主学习'}
                                </p>
                              </div>
                              <span className="text-xs text-amber-600 font-medium">+{learning.points_earned}积分</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">暂无学习记录</p>
                      )}
                    </div>

                    {/* 激励奖励 */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-purple-500" />
                        激励中心
                      </h4>
                      {selectedArchive.data.rewards.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedArchive.data.rewards.map((reward) => (
                            <div key={reward.id} className="flex items-center gap-2 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm">
                                {reward.reward?.icon || '🎁'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm">{reward.reward?.name || '未知奖励'}</p>
                                <p className="text-xs text-gray-500">
                                  {reward.reward?.type === 'badge' ? '徽章' : 
                                   reward.reward?.type === 'gem' ? '宝石' : 
                                   reward.reward?.type === 'skill_card' ? '技能卡' :
                                   reward.reward?.type === 'tool_card' ? '工具卡' : '成就'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">暂无激励奖励</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 其他小队任务进度弹窗 */}
        {(siblingTeamTasks.loading || siblingTeamTasks.data) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-indigo-500" />
                    <span>
                      {siblingTeamTasks.data?.team?.name || '小队'} - 任务进度
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSiblingTeamTasks({ loading: false, data: null })}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto max-h-[calc(90vh-80px)]">
                {siblingTeamTasks.loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : siblingTeamTasks.data ? (
                  <div className="p-4 space-y-4">
                    {/* 主题信息 */}
                    {siblingTeamTasks.data.theme && (
                      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center text-xl">
                          {siblingTeamTasks.data.theme.icon || '🎯'}
                        </div>
                        <div>
                          <p className="font-bold">{siblingTeamTasks.data.theme.name}</p>
                          {siblingTeamTasks.data.theme.description && (
                            <p className="text-xs text-gray-500 line-clamp-1">{siblingTeamTasks.data.theme.description}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 任务列表 */}
                    {siblingTeamTasks.data.tasks.length > 0 ? (
                      <div className="space-y-3">
                        {siblingTeamTasks.data.tasks.filter((t): t is NonNullable<typeof t> => t != null).map((task) => (
                          <div key={task.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                            {/* 任务标题 */}
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-sm font-bold text-blue-600">
                                {task.stage || '?'}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium">{task.title}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  {task.points > 0 && <span>积分 {task.points}</span>}
                                  {task.task_type === 'final' && (
                                    <Badge className="bg-purple-500 text-xs">最后任务</Badge>
                                  )}
                                </div>
                              </div>
                              {/* 状态标签 */}
                              {task.submission ? (
                                task.submission.status === 'approved' ? (
                                  task.submission.rating === 'excellent' ? (
                                    <Badge className="bg-amber-500">优秀</Badge>
                                  ) : task.submission.rating === 'rejected' ? (
                                    <Badge className="bg-red-500">不合格</Badge>
                                  ) : (
                                    <Badge className="bg-green-500">合格</Badge>
                                  )
                                ) : task.submission.status === 'pending' ? (
                                  <Badge className="bg-yellow-500">待审核</Badge>
                                ) : (
                                  <Badge className="bg-gray-500">未通过</Badge>
                                )
                              ) : (
                                <Badge variant="outline" className="text-gray-400">未提交</Badge>
                              )}
                            </div>

                            {/* 任务描述 */}
                            {task.description && (
                              <p className="text-sm text-gray-600 mb-2 pl-11">{task.description}</p>
                            )}

                            {/* 产出内容 */}
                            {task.submission && (
                              <div className="mt-2 pt-2 border-t border-gray-200 pl-11 space-y-2">
                                {/* 提交内容 */}
                                {task.submission.content && (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">提交内容</p>
                                    <p className="text-sm text-gray-700 bg-white p-2 rounded border">{task.submission.content}</p>
                                  </div>
                                )}

                                {/* 提交文件 */}
                                {task.submission.file_urls && task.submission.file_urls.length > 0 && (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">提交文件</p>
                                    <div className="space-y-1">
                                      {task.submission.file_urls.map((file, idx) => (
                                        <a 
                                          key={idx}
                                          href={file.url || '#'} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                        >
                                          <FileText className="w-3 h-3" />
                                          {file.name || `文件${idx + 1}`}
                                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 审核评语 */}
                                {task.submission.review_comment && (
                                  <div className="p-2 bg-blue-50 rounded border-l-2 border-blue-400">
                                    <p className="text-xs text-gray-500 mb-1">
                                      老师评语
                                      {task.submission.reviewer_name && <span className="ml-1">({task.submission.reviewer_name})</span>}
                                    </p>
                                    <p className="text-sm text-gray-700">{task.submission.review_comment}</p>
                                  </div>
                                )}

                                {/* 审核时间 */}
                                {task.submission.reviewed_at && (
                                  <p className="text-xs text-gray-400">
                                    审核于 {new Date(task.submission.reviewed_at).toLocaleDateString('zh-CN')}
                                  </p>
                                )}

                                {/* 点赞按钮 - 匿名点赞 */}
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                                  <button
                                    onClick={() => handleToggleLike(
                                      task.submission!.id,
                                      siblingTeamTasks.data!.team.id,
                                      task.stage,
                                      task.submission!.liked
                                    )}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                                      task.submission.liked
                                        ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-pink-50 hover:text-pink-500'
                                    }`}
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill={task.submission.liked ? 'currentColor' : 'none'}
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                    </svg>
                                    <span>{task.submission.likeCount || 0}</span>
                                  </button>
                                  <span className="text-xs text-gray-400">匿名点赞</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-8">暂无任务数据</p>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* 银蛇博士产出评价对话框 */}
      {currentTask?.hasSubmission && (
        <SubmissionReviewDialog
          open={showReviewDialog}
          onOpenChange={setShowReviewDialog}
          teamId={team?.id || ''}
          taskId={currentTask.id}
          taskTitle={currentTask.title}
          submissionId={currentTask.submissionId || undefined}
          cycle={team?.cycle}
        />
      )}
    </div>
  );
}
