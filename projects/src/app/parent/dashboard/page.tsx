'use client';

// 该页面使用 useSearchParams()，静态生成时需要 Suspense 边界。
// 仪表盘是动态客户端页面，直接禁用静态生成避免构建报错。
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { safeGetJSON } from '@/lib/utils';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  ArrowLeft, Users, Target, Search, Plus, ChevronRight, Star, History, TrendingUp, XCircle,
  BookOpen, MessageSquare, Award, Heart, CheckCircle, Eye,
  Building, Check, Clock, FileText, ThumbsUp, Video, ExternalLink, RefreshCw
} from 'lucide-react';

interface Follow {
  followId: string;
  childName: string;
  childGrade: string;
  relation: string;
  guardianReason: string | null;
  schoolId: string;
  schoolName: string;
  isActive: boolean;
  status: string;
  followedAt: string;
  unfollowedAt: string | null;
  reviewedAt: string | null;
  reviewRemark: string | null;
  team: {
    id: string;
    name: string;
    slogan: string;
    points: number;
    cycle: number;
    currentThemeId: string;
  };
}

interface TransferRecord {
  id: string;
  points: number;
  message: string;
  status: string;
  created_at: string;
  type: 'sent' | 'received';
  from_team?: { id: string; name: string; code: string };
  to_team?: { id: string; name: string; code: string };
}

interface BorrowRecord {
  id: string;
  points: number;
  interest_rate: number;
  repay_date: string;
  status: string;
  message: string;
  created_at: string;
  type: 'borrowed' | 'lent';
  is_overdue: boolean;
  overdue_days: number;
  total_repay: number;
  actual_repay: number;
  interest: number;
  overdue_interest: number;
  borrower?: { id: string; name: string; code: string };
  lender?: { id: string; name: string; code: string };
}

interface TeamDetail {
  team: {
    id: string;
    name: string;
    slogan: string;
    points: number;
    cycle: number;
    theme: any;
  };
  stats?: {
    totalPoints: number;
    totalEarned?: number;
    completedTasksCount: number;
    totalLikes: number;
    skillsLearned: number;
    rewardsEarned: number;
    heartFragments: number;
    heartGems: number;
    badgeCount: number;
    skillCardCount: number;
  };
  members: any[];
  currentTheme?: {
    id: string;
    name: string;
    description: string;
    icon: string;
    progress: {
      totalTasks: number;
      completedTasks: number;
      pendingTasks: number;
      status: 'pending_assign' | 'in_progress' | 'completed';
      currentTask: {
        id: string;
        title: string;
        description: string;
        stage: number;
        points: number;
        submission: any;
      } | null;
      tasks: any[];
    };
  };
  completedThemes?: any[];
  skills?: any[];
  rewards?: any[];
  pointHistory?: any[];
  pretestResponses?: any[];
  finalFeedbacks?: any[];
  transferRecords?: TransferRecord[];
  borrowRecords?: BorrowRecord[];
}

function ParentDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [parent, setParent] = useState<any>(null);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddFollow, setShowAddFollow] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [selectedChildName, setSelectedChildName] = useState('');
  const [selectedChildGrade, setSelectedChildGrade] = useState('');

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [switchingTeam, setSwitchingTeam] = useState<string | null>(null);
  const [showFollowApplications, setShowFollowApplications] = useState(false);
  const [selectedFollowDetail, setSelectedFollowDetail] = useState<Follow | null>(null);
  const [editingFollow, setEditingFollow] = useState(false);
  const [editChildName, setEditChildName] = useState('');
  const [editChildGrade, setEditChildGrade] = useState('');
  const [editRelation, setEditRelation] = useState('');
  const [editOtherRelation, setEditOtherRelation] = useState('');
  const [editGuardianReason, setEditGuardianReason] = useState('');
  const [editTeamId, setEditTeamId] = useState('');
  const [viewingArchive, setViewingArchive] = useState<any | null>(null);
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const [pointsTab, setPointsTab] = useState<'transfer' | 'borrow'>('transfer');
  const [editTeamName, setEditTeamName] = useState('');
  
  // 进度详情弹窗状态
  const [progressDetailOpen, setProgressDetailOpen] = useState(false);
  const [progressDetailTheme, setProgressDetailTheme] = useState<any>(null);
  const [progressDetailTasks, setProgressDetailTasks] = useState<any[]>([]);
  
  // 打开进度详情弹窗
  const openProgressDetail = (theme: any, tasks: any[]) => {
    setProgressDetailTheme(theme);
    setProgressDetailTasks(tasks);
    setProgressDetailOpen(true);
  };
  
  // 学校搜索相关状态
  const [schoolKeyword, setSchoolKeyword] = useState('');
  const [schoolResults, setSchoolResults] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [searchingSchool, setSearchingSchool] = useState(false);
  // LE-F09: 学校搜索 AbortController,防止快速输入时旧请求覆盖新结果(竞态)
  const schoolSearchAbortRef = useRef<AbortController | null>(null);
  const [childNameInForm, setChildNameInForm] = useState('');
  const [childGradeInForm, setChildGradeInForm] = useState('');
  const [relationInForm, setRelationInForm] = useState('');
  const [otherRelation, setOtherRelation] = useState('');
  const [guardianReason, setGuardianReason] = useState('');
  useEffect(() => {
    const parentData = safeGetJSON<any>('parent', null);
    if (!parentData) {
      router.push('/parent/login');
      return;
    }
    setParent(parentData);
    loadFollows(true);
  }, []);

  // 学校搜索
  useEffect(() => {
    const searchSchool = async () => {
      if (schoolKeyword.length < 1) {
        setSchoolResults([]);
        return;
      }

      // LE-F09: 取消上一个未完成请求,防止快速输入时旧响应覆盖新结果(竞态)
      if (schoolSearchAbortRef.current) {
        schoolSearchAbortRef.current.abort();
      }
      const controller = new AbortController();
      schoolSearchAbortRef.current = controller;

      setSearchingSchool(true);
      try {
        const res = await fetch(`/api/parent/schools?keyword=${encodeURIComponent(schoolKeyword)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          setSchoolResults(data.schools || []);
        }
      } catch (err: any) {
        // LE-F09: 主动 abort 不算错误
        if (err?.name === 'AbortError') return;
        console.error('搜索学校失败', err);
      } finally {
        // LE-F09: 仅当本次请求是最新请求时才重置 loading,避免被 abort 的请求把 loading 提前置回 false
        if (schoolSearchAbortRef.current === controller) {
          setSearchingSchool(false);
        }
      }
    };

    const debounce = setTimeout(searchSchool, 300);
    return () => clearTimeout(debounce);
  }, [schoolKeyword]);

  const loadFollows = async (includeHistory = false) => {
    const parentData = safeGetJSON<any>('parent', null);
    if (!parentData) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/parent/teams?parentId=${parentData.id}&includeHistory=${includeHistory}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setFollows(data.teams || []);
      }
    } catch (err) {
      console.error('加载关注失败', err);
    } finally {
      setLoading(false);
    }
  };

  // 当选择学校或填写孩子姓名+年级时，自动搜索小队
  useEffect(() => {
    const autoSearch = async () => {
      // 需要同时有姓名和学校才自动搜索
      if (!childNameInForm || !selectedSchool?.id) {
        // 如果没有搜索条件，清空结果
        setSearchResults([]);
        return;
      }

      const parentId = safeGetJSON<any>('parent', null)?.id || '';

      setSearching(true);
      try {
        let url = `/api/parent/search?keyword=${encodeURIComponent(childNameInForm)}&parentId=${parentId}&schoolId=${selectedSchool.id}`;
        if (childGradeInForm) {
          url += `&grade=${encodeURIComponent(childGradeInForm)}`;
        }
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.teams || []);
        }
      } catch (err) {
        console.error('自动搜索失败', err);
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(autoSearch, 500);
    return () => clearTimeout(debounce);
  }, [selectedSchool, childNameInForm, childGradeInForm]);

  const handleSearch = async () => {
    if (!searchKeyword.trim()) return;

    const parentId = safeGetJSON<any>('parent', null)?.id || '';

    setSearching(true);
    try {
      let url = `/api/parent/search?keyword=${encodeURIComponent(searchKeyword)}&parentId=${parentId}`;
      if (selectedSchool?.id) {
        url += `&schoolId=${selectedSchool.id}`;
      }
      if (childGradeInForm) {
        url += `&grade=${encodeURIComponent(childGradeInForm)}`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.teams || []);
      }
    } catch (err) {
      console.error('搜索失败', err);
    } finally {
      setSearching(false);
    }
  };

  // 修改并重新提交关注申请
  const handleUpdateFollow = async () => {
    if (!editChildName.trim()) {
      alert('请填写孩子姓名');
      return;
    }
    if (!editRelation) {
      alert('请选择与孩子的关系');
      return;
    }
    if (editRelation === '其他') {
      if (!editOtherRelation.trim()) {
        alert('请填写明确的关系');
        return;
      }
      if (!editGuardianReason.trim()) {
        alert('请说明为何由你作为此学生监护人');
        return;
      }
    }
    if (!selectedFollowDetail) return;

    const parentData = safeGetJSON<any>('parent', null);
    if (!parentData) return;

    const actualRelation = editRelation === '其他' ? editOtherRelation : editRelation;

    try {
      // 调用更新接口
      const res = await fetch('/api/parent/teams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: parentData.id,
          followId: selectedFollowDetail.followId,
          childName: editChildName,
          childGrade: editChildGrade,
          relation: actualRelation,
          guardianReason: editRelation === '其他' ? editGuardianReason : null,
        })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setEditingFollow(false);
        setSelectedFollowDetail(null);
        loadFollows(true);
        alert(data.message || '已重新提交申请，请等待老师审核');
      } else {
        alert(data.error || '修改失败');
      }
    } catch (err) {
      console.error('修改失败', err);
      alert('修改失败，请重试');
    }
  };

  const handleFollow = async (teamId: string, childName: string, childGrade: string) => {
    if (!childName) {
      alert('请填写孩子姓名');
      return;
    }
    if (!relationInForm) {
      alert('请选择与孩子的关系');
      return;
    }
    // 如果选择其他，必须填写完整信息
    if (relationInForm === '其他') {
      if (!otherRelation.trim()) {
        alert('请填写明确的关系');
        return;
      }
      if (!guardianReason.trim()) {
        alert('请说明为何由你作为此学生监护人');
        return;
      }
    }

    const parentData = safeGetJSON<any>('parent', null);
    if (!parentData) return;

    // 实际关系：如果是"其他"，存储填写的关系；否则存储选项值
    const actualRelation = relationInForm === '其他' ? otherRelation : relationInForm;
    
    try {
      const res = await fetch('/api/parent/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          parentId: parentData.id, 
          teamId, 
          childName, 
          childGrade,
          relation: actualRelation,
          relationType: relationInForm === '其他' ? '其他' : relationInForm,
          guardianReason: relationInForm === '其他' ? guardianReason : null,
          schoolId: selectedSchool?.id,
          schoolName: selectedSchool?.name
        })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        await loadFollows(true);
        setShowAddFollow(false);
        setSearchResults([]);
        setSearchKeyword('');
        setChildNameInForm('');
        setChildGradeInForm('');
        setRelationInForm('');
        setOtherRelation('');
        setGuardianReason('');
        setSelectedSchool(null);
        setSchoolKeyword('');
        // 显示审核提示
        alert(data.message || '已提交关注申请，请等待老师审核');
      } else {
        alert(data.error || '关注失败');
      }
    } catch (err) {
      console.error('关注失败', err);
    }
  };

  const handleUnfollow = async (followId: string) => {
    if (!confirm('确定要取消关注吗？')) return;

    try {
      const res = await fetch(`/api/parent/teams?followId=${followId}`, {
        method: 'DELETE'
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        await loadFollows(true);
      }
    } catch (err) {
      console.error('取消关注失败', err);
    }
  };

  const handleSwitchTeam = async (followId: string, newTeamId: string, childGrade: string) => {
    if (!confirm('确定要切换到新小队吗？原小队的数据将保留为历史记录。')) return;

    setSwitchingTeam(followId);
    try {
      const res = await fetch('/api/parent/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followId, newTeamId, childGrade })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        alert('已切换到新小队，原小队数据已存档');
        await loadFollows(true);
        setShowAddFollow(false);
        setSearchResults([]);
        setSearchKeyword('');
      } else {
        alert(data.error || '切换失败');
      }
    } catch (err) {
      console.error('切换小队失败', err);
    } finally {
      setSwitchingTeam(null);
    }
  };

  // 刷新小队详情数据（不显示loading状态，静默刷新）
  const refreshTeamDetail = async () => {
    if (!selectedTeam) return;
    try {
      const teamId = selectedTeam.team?.id;
      const res = await fetch(`/api/parent/team-detail?teamId=${teamId}&childName=${encodeURIComponent(selectedChildName)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setSelectedTeam(data.data);
      }
    } catch (err) {
      // 静默刷新，不处理错误
    }
  };

  const viewTeamDetail = async (follow: Follow) => {
    // 关闭进度详情弹窗
    setProgressDetailOpen(false);
    setLoadingDetail(true);
    setSelectedChildName(follow.childName);
    setSelectedChildGrade(follow.childGrade);
    try {
      const res = await fetch(`/api/parent/team-detail?teamId=${follow.team.id}&childName=${encodeURIComponent(follow.childName)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setSelectedTeam(data.data);
      }
    } catch (err) {
      console.error('加载详情失败', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // 当查看小队详情时，每30秒自动刷新数据
  useEffect(() => {
    if (!selectedTeam) return;
    const interval = setInterval(refreshTeamDetail, 30000);
    return () => clearInterval(interval);
  }, [selectedTeam?.team?.id]);

  const handleLogout = () => {
    localStorage.removeItem('parent');
    localStorage.removeItem('parent_follows');
    router.push('/parent/login');
  };

  const formatPoints = (p: number) => {
    return Math.round((p || 0) * 10) / 10;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">已通过</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">已拒绝</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700">待审核</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  // 如果有选中查看详情
  if (selectedTeam) {
    const team = selectedTeam.team;
    const stats = selectedTeam.stats || {
      totalPoints: 0,
      completedTasksCount: 0,
      totalLikes: 0,
      skillsLearned: 0,
      rewardsEarned: 0
    };
    const currentTheme = selectedTeam.currentTheme;
    const completedThemes = selectedTeam.completedThemes || [];
    const skills = selectedTeam.skills || [];
    const rewards = selectedTeam.rewards || [];
    const pointHistory = selectedTeam.pointHistory || [];

    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* 顶部导航 */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-4">
            <div className="flex items-center gap-3">
              <button onClick={() => {
                setSelectedTeam(null);
                setProgressDetailOpen(false);
              }} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="flex-1">
                <h1 className="font-bold text-lg">{team.name}</h1>
                <p className="text-sm text-white/80">
                  {selectedChildGrade && `${selectedChildGrade} `}{selectedChildName} - 小队详情
                </p>
              </div>
              <button onClick={refreshTeamDetail} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="刷新数据">
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">

          {/* 小队基本信息 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                小队信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-3xl">
                  🏆
                </div>
                <div>
                  <p className="font-bold text-lg">{team.name}</p>
                  {team.slogan && <p className="text-gray-500 text-sm">"{team.slogan}"</p>}
                  <p className="text-xs text-gray-400">第{team.cycle}周期</p>
                </div>
              </div>
              {/* 成就数据 */}
              <div className="grid grid-cols-5 gap-2 mt-3">
                <div className="flex flex-col items-center bg-amber-50 rounded-xl py-3 px-1">
                  <span className="text-xl mb-1">⭐</span>
                  <span className="text-lg font-bold text-amber-600">{selectedTeam.stats?.totalPoints || 0}</span>
                  <span className="text-xs text-amber-500">总积分</span>
                </div>
                <div className="flex flex-col items-center bg-rose-50 rounded-xl py-3 px-1">
                  <span className="text-xl mb-1">❤️</span>
                  <span className="text-lg font-bold text-rose-600">{selectedTeam.stats?.totalLikes || 0}</span>
                  <span className="text-xs text-rose-500">获得点赞数</span>
                </div>
                <div className="flex flex-col items-center bg-pink-50 rounded-xl py-3 px-1">
                  <span className="text-xl mb-1">💎</span>
                  <span className="text-lg font-bold text-pink-600">{selectedTeam.stats?.heartFragments || 0}</span>
                  <span className="text-xs text-pink-500">宝石碎片</span>
                </div>
                <div className="flex flex-col items-center bg-blue-50 rounded-xl py-3 px-1">
                  <span className="text-xl mb-1">🎖️</span>
                  <span className="text-lg font-bold text-blue-600">{selectedTeam.stats?.badgeCount || 0}</span>
                  <span className="text-xs text-blue-500">徽章</span>
                </div>
                <div className="flex flex-col items-center bg-green-50 rounded-xl py-3 px-1">
                  <span className="text-xl mb-1">🃏</span>
                  <span className="text-lg font-bold text-green-600">{selectedTeam.stats?.skillCardCount || 0}</span>
                  <span className="text-xs text-green-500">技能卡</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 孩子在小队中的角色 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-pink-500" />
                {selectedChildName}在小队中
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedTeam.members?.filter(m => m.name === selectedChildName).map(member => (
                  <div key={member.id} className="flex items-center gap-3 bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-4">
                    <div className="w-14 h-14 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
                      🎯
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg">{member.name}</p>
                      <p className="text-sm text-purple-600">
                        {member.role === 'guider' ? '指引者' : 
                         member.role === 'light_mage' ? '光影法师' : 
                         member.role === 'secret_scholar' ? '秘语学者' : member.role}
                      </p>
                      {member.intro && <p className="text-xs text-gray-500 mt-1">{member.intro}</p>}
                    </div>
                    {selectedChildGrade && (
                      <Badge className="bg-pink-100 text-pink-700">{selectedChildGrade}</Badge>
                    )}
                  </div>
                ))}
                
                {/* 其他成员 */}
                {selectedTeam.members?.filter(m => m.name !== selectedChildName).length > 0 && (
                  <>
                    <p className="text-sm text-gray-500 mt-4 font-medium">小队其他成员</p>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedTeam.members?.filter(m => m.name !== selectedChildName).map(member => (
                        <div key={member.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg">
                            👤
                          </div>
                          <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-xs text-gray-400">
                              {member.role === 'guider' ? '指引者' : 
                               member.role === 'light_mage' ? '光影法师' : 
                               member.role === 'secret_scholar' ? '秘语学者' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 小队任务进度 */}
          {currentTheme && currentTheme.progress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-orange-500" />
                  小队任务进度
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 主题名称和介绍 */}
                <div className="bg-orange-50 rounded-xl p-4">
                  <h3 className="font-medium text-orange-800 mb-2">{currentTheme.name}</h3>
                  {currentTheme.description && (
                    <p className="text-sm text-orange-700 line-clamp-2">{currentTheme.description}</p>
                  )}
                </div>
                
                {/* 主题任务状态 - 可点击查看详情 */}
                <button
                  type="button"
                  className="w-full bg-orange-50 rounded-xl p-4 cursor-pointer hover:bg-orange-100 transition-colors text-left"
                  onClick={() => {
                    setProgressDetailTheme(currentTheme);
                    setProgressDetailTasks(currentTheme.progress.tasks || []);
                    setProgressDetailOpen(true);
                  }}
                >
                  {currentTheme.progress.status === 'pending_assign' ? (
                    /* 待下发状态 */
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-medium text-yellow-700">待下发任务</p>
                        <p className="text-xs text-yellow-600 mt-0.5">等待志愿者老师下发第一阶段任务</p>
                      </div>
                    </div>
                  ) : currentTheme.progress.status === 'completed' ? (
                    /* 已完成状态 */
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-green-700">主题任务已全部完成</p>
                        <p className="text-xs text-green-600 mt-0.5">
                          共完成 {currentTheme.progress.completedTasks} 个任务
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* 执行中状态 - 显示进度条 */
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-orange-700">
                          {currentTheme.progress.currentTask 
                            ? `正在执行：${currentTheme.progress.currentTask.title}` 
                            : '主题进度'}
                        </span>
                        <span className="text-sm text-orange-600">
                          {currentTheme.progress.completedTasks}/{currentTheme.progress.totalTasks} 任务
                        </span>
                      </div>
                      <div className="h-3 bg-orange-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all"
                          style={{ 
                            width: `${currentTheme.progress.totalTasks > 0 
                              ? (currentTheme.progress.completedTasks / currentTheme.progress.totalTasks) * 100 
                              : 0}%` 
                          }}
                        />
                      </div>
                    </>
                  )}
                  <p className="text-xs text-orange-500 mt-2 text-center">点击查看详情</p>
                </button>
              </CardContent>
            </Card>
          )}

          {/* 已完成主题存档 */}
          {completedThemes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5 text-green-500" />
                  已完成主题存档
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {completedThemes.map((theme: any, index: number) => {
                  const approvedTasks = theme.tasks?.filter((t: any) => 
                    t.submissions?.some((s: any) => s.status === 'approved')
                  ) || [];
                  const totalTasks = theme.tasks?.length || 0;
                  
                  return (
                    <div 
                      key={index} 
                      className="border border-green-200 bg-green-50 rounded-xl p-4 hover:bg-green-100 transition-colors active:scale-[0.99]"
                    >
                      <div 
                        className="cursor-pointer"
                        onClick={() => setViewingArchive(theme)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{theme.theme?.icon || '🏆'}</span>
                              <p className="font-medium text-green-700">
                                第{theme.cycle}周期：{theme.theme?.name}
                              </p>
                            </div>
                            {theme.theme?.description && (
                              <p className="text-xs text-gray-500 mt-1 ml-7">{theme.theme.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-700">已完成</Badge>
                            <ChevronRight className="w-4 h-4 text-green-400" />
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-7 text-xs text-gray-500">
                          <span>{approvedTasks.length}/{totalTasks} 任务完成</span>
                          {theme.totalPoints > 0 && (
                            <span className="text-amber-600 font-medium">{formatPoints(theme.totalPoints)} 积分</span>
                          )}
                          {theme.completedAt && (
                            <span>完成于 {new Date(theme.completedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-green-200/50">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const reportId = theme.completionId || theme.id;
                            window.open(`/report/${reportId}`, '_blank');
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-full hover:from-amber-600 hover:to-orange-600 transition-all active:scale-95 shadow-sm"
                        >
                          <FileText className="w-4 h-4" />
                          任务报告
                        </button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* 新知学习记录 */}
          {skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  新知学习记录
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {skills.filter((s: any) => s.status === 'completed').map((skill: any) => (
                    <div key={skill.id} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">
                          ✨
                        </div>
                        <p className="font-medium text-blue-700 text-sm">{skill.skill?.name}</p>
                      </div>
                      {skill.skill?.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">{skill.skill.description}</p>
                      )}
                      {skill.task?.title && (
                        <p className="text-xs text-blue-500 mt-1">来源：{skill.task.title}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}


          {/* 积分获得记录 */}
          {pointHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                  积分获得记录
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pointHistory.slice(0, 10).map((record: any) => (
                    <div key={record.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{record.reason || record.task?.title || '积分奖励'}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(record.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="font-bold text-orange-500">+{record.points}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 积分数据 */}
          {(selectedTeam.transferRecords && selectedTeam.transferRecords.length > 0) || 
           (selectedTeam.borrowRecords && selectedTeam.borrowRecords.length > 0) ? (
            <Card>
              <CardHeader 
                className="cursor-pointer select-none" 
                onClick={() => setPointsExpanded(!pointsExpanded)}
              >
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    积分数据
                    <span className="text-sm font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      {selectedTeam.stats?.totalPoints || 0} 积分
                    </span>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${pointsExpanded ? 'rotate-90' : ''}`} />
                </CardTitle>
              </CardHeader>
              {pointsExpanded && (
                <CardContent>
                {/* 标签切换 */}
                <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setPointsTab('transfer')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      pointsTab !== 'borrow'
                        ? 'bg-white text-amber-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    积分转账记录
                    {selectedTeam.transferRecords && selectedTeam.transferRecords.length > 0 && (
                      <span className="ml-1 text-xs text-gray-400">({selectedTeam.transferRecords.length})</span>
                    )}
                  </button>
                  <button
                    onClick={() => setPointsTab('borrow')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      pointsTab === 'borrow'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    借/还积分
                    {selectedTeam.borrowRecords && selectedTeam.borrowRecords.length > 0 && (
                      <span className="ml-1 text-xs text-gray-400">({selectedTeam.borrowRecords.length})</span>
                    )}
                  </button>
                </div>

                {/* 积分转账记录内容 */}
                {pointsTab !== 'borrow' && (
                  <div className="space-y-2">
                    {selectedTeam.transferRecords && selectedTeam.transferRecords.length > 0 ? (
                      selectedTeam.transferRecords.slice(0, 10).map((record: TransferRecord) => (
                        <div key={record.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={record.type === 'sent' ? 'outline' : 'secondary'} className={
                                record.type === 'sent' ? 'text-amber-600 border-amber-300' : 'text-green-600 bg-green-50'
                              }>
                                {record.type === 'sent' ? '转出' : '转入'}
                              </Badge>
                              <p className="text-sm font-medium">
                                {record.type === 'sent' 
                                  ? `给 ${record.to_team?.name || '小队'}` 
                                  : `来自 ${record.from_team?.name || '小队'}`}
                              </p>
                            </div>
                            {record.message && (
                              <p className="text-xs text-gray-400 mt-1">{record.message}</p>
                            )}
                            <p className="text-xs text-gray-400">
                              {new Date(record.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className={`font-bold ${record.type === 'sent' ? 'text-red-500' : 'text-green-500'}`}>
                            {record.type === 'sent' ? '-' : '+'}{record.points}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">暂无积分转账记录</p>
                    )}
                  </div>
                )}

                {/* 借还积分记录内容 */}
                {pointsTab === 'borrow' && (
                  <div className="space-y-3">
                    {selectedTeam.borrowRecords && selectedTeam.borrowRecords.length > 0 ? (
                      selectedTeam.borrowRecords.slice(0, 10).map((record: BorrowRecord) => (
                        <div key={record.id} className="border rounded-lg p-3 bg-gray-50/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={record.type === 'borrowed' ? 'outline' : 'secondary'} className={
                                record.type === 'borrowed' ? 'text-red-600 border-red-300' : 'text-blue-600 bg-blue-50'
                              }>
                                {record.type === 'borrowed' ? '借入' : '借出'}
                              </Badge>
                              <p className="text-sm font-medium">
                                {record.type === 'borrowed' 
                                  ? `向 ${record.lender?.name || '小队'} 借入` 
                                  : `借给 ${record.borrower?.name || '小队'}`}
                              </p>
                            </div>
                            <span className={`font-bold ${record.type === 'borrowed' ? 'text-red-500' : 'text-blue-500'}`}>
                              {record.points} 积分
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>利率: {record.interest_rate}%</span>
                            <span>应还: {record.total_repay} 积分</span>
                            <Badge className={
                              record.status === 'approved' ? 'bg-green-100 text-green-700' :
                              record.status === 'repaid' ? 'bg-blue-100 text-blue-700' :
                              record.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              record.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                            }>
                              {record.status === 'approved' ? '已批准' :
                               record.status === 'repaid' ? '已归还' :
                               record.status === 'pending' ? '待审核' :
                               record.status === 'overdue' ? '已逾期' : record.status}
                            </Badge>
                          </div>
                          {record.is_overdue && (
                            <p className="text-xs text-red-500 mt-1">
                              已逾期 {record.overdue_days} 天，需还 {record.actual_repay} 积分（含逾期利息 {record.overdue_interest}）
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">暂无借还记录</p>
                    )}
                  </div>
                )}
                </CardContent>
              )}
            </Card>
          ) : null}

          {/* 前测结果 */}
          {selectedTeam.pretestResponses && selectedTeam.pretestResponses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-500" />
                  前测问卷结果
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedTeam.pretestResponses?.map((response: any) => (
                  <div key={response.id} className="bg-purple-50 rounded-lg p-3">
                    <p className="text-sm text-purple-600 mb-1">{response.question?.title}</p>
                    <p className="font-medium">
                      {Array.isArray(response.answer) ? response.answer.join('、') : response.answer}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 最后任务反馈 */}
          {selectedTeam.finalFeedbacks && selectedTeam.finalFeedbacks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-500" />
                  最后任务反馈
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedTeam.finalFeedbacks?.map((feedback: any) => (
                  <div key={feedback.id} className="bg-indigo-50 rounded-xl p-4">
                    <p className="text-sm text-indigo-600 mb-2">
                      {feedback.final_task?.title || '最后任务'}
                    </p>
                    <div className="space-y-2">
                      {Object.entries(feedback.form_data || {}).map(([key, value]) => (
                        <div key={key}>
                          <p className="text-sm text-gray-500">{key}</p>
                          <p className="font-medium">
                            {Array.isArray(value) ? value.join('、') : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 进度详情弹窗 */}
        <Dialog open={progressDetailOpen} onOpenChange={(open) => !open && setProgressDetailOpen(false)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Target className="w-5 h-5 text-orange-500" />
                {progressDetailTheme?.name || '任务进度详情'}
              </DialogTitle>
            </DialogHeader>
            
            {progressDetailTheme && (() => {
              const themeStatus = progressDetailTheme.progress?.status || 'pending_assign';
              const currentTask = progressDetailTheme.progress?.currentTask;
              const completedCount = progressDetailTasks.filter((t: any) => t.submission?.status === 'approved').length;
              const totalCount = progressDetailTasks.length;
              
              return (
                <div className="space-y-6">
                  {/* 主题介绍 */}
                  {progressDetailTheme.description && (
                    <div className="bg-orange-50 rounded-xl p-4">
                      <h3 className="font-medium text-orange-800 mb-2">主题介绍</h3>
                      <p className="text-sm text-orange-700">{progressDetailTheme.description}</p>
                    </div>
                  )}
                  
                  {/* 待下发状态 */}
                  {themeStatus === 'pending_assign' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
                      <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-yellow-600" />
                      </div>
                      <h3 className="text-lg font-medium text-yellow-800 mb-2">等待任务下发</h3>
                      <p className="text-sm text-yellow-600">志愿者老师尚未下发第一阶段的任务，请耐心等待</p>
                    </div>
                  )}
                  
                  {/* 执行中状态 */}
                  {themeStatus === 'in_progress' && (
                    <>
                      {/* 总体进度 */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">总体进度</span>
                          <span className="text-orange-600 font-medium">
                            {completedCount}/{totalCount} 任务完成
                          </span>
                        </div>
                        <div className="h-4 bg-orange-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all"
                            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      
                      {/* 当前正在执行的任务 */}
                      {currentTask && (
                        <div className="border-2 border-orange-300 rounded-xl p-4 bg-orange-50">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-orange-500 text-white text-sm flex items-center justify-center font-medium">
                              {currentTask.stage}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-orange-800">当前任务</h4>
                              <p className="text-sm text-orange-600">{currentTask.title}</p>
                            </div>
                            {/* 任务状态标签 */}
                            {currentTask.taskPhase && (
                              <Badge className={
                                currentTask.taskPhase === 'learning' ? 'bg-blue-500 text-white' :
                                currentTask.taskPhase === 'ready_submit' ? 'bg-orange-500 text-white' :
                                currentTask.taskPhase === 'pending_review' ? 'bg-yellow-500 text-white' :
                                currentTask.taskPhase === 'completed' ? 'bg-green-500 text-white' :
                                'bg-red-500 text-white'
                              }>
                                {currentTask.taskPhase === 'learning' ? '学习新知' :
                                 currentTask.taskPhase === 'ready_submit' ? '待提产出' :
                                 currentTask.taskPhase === 'pending_review' ? '产出待审核' :
                                 currentTask.taskPhase === 'completed' ? '已完成' : '已退回'}
                              </Badge>
                            )}
                          </div>
                          {currentTask.description && (
                            <p className="text-sm text-orange-700 bg-white rounded-lg p-3">{currentTask.description}</p>
                          )}
                          
                          {/* 任务进度详情 */}
                          <div className="mt-3 space-y-3">
                            {/* 新知学习内容 - 显示已完成的技能 */}
                            {currentTask.skills && currentTask.skills.length > 0 && (
                              <div className="bg-white rounded-lg p-3 border border-gray-200">
                                <div className="flex items-center gap-2 mb-3">
                                  <BookOpen className="w-4 h-4 text-purple-500" />
                                  <span className="text-sm font-medium text-gray-700">新知学习内容</span>
                                </div>
                                <div className="space-y-2">
                                  {currentTask.skills.map((skill: any) => (
                                    <div key={skill.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                                      <span className="text-lg">{skill.icon || '📚'}</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-sm text-gray-800">{skill.name}</span>
                                          {skill.isRequired && (
                                            <Badge variant={skill.learningStatus === 'completed' ? 'default' : 'destructive'} className="text-xs">
                                              {skill.learningStatus === 'completed' ? '已完成' : '必学'}
                                            </Badge>
                                          )}
                                        </div>
                                        {skill.description && (
                                          <p className="text-xs text-gray-500 mt-1">{skill.description}</p>
                                        )}
                                        {skill.learningStatus === 'completed' && skill.content && (
                                          <div className="mt-2 p-2 bg-purple-50 rounded text-xs text-gray-600">
                                            <p className="font-medium text-purple-700 mb-1">学习要点：</p>
                                            <p className="whitespace-pre-wrap">{skill.content}</p>
                                          </div>
                                        )}
                                        {skill.learningMaterials && skill.learningMaterials.length > 0 && skill.learningStatus === 'completed' && (
                                          <div className="mt-2 flex flex-wrap gap-1">
                                            {skill.learningMaterials.map((material: any, idx: number) => (
                                              <a
                                                key={idx}
                                                href={material.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
                                              >
                                                <ExternalLink className="w-3 h-3" />
                                                {material.title || '学习材料'}
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* 学习新知阶段 */}
                            {currentTask.taskPhase === 'learning' && (
                              <div className="bg-blue-50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <BookOpen className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-medium text-blue-700">正在学习新知</span>
                                </div>
                                <p className="text-xs text-blue-600">
                                  必学技能：{currentTask.requiredSkillsCompleted || 0}/{currentTask.requiredSkillsTotal || 0} 已完成
                                </p>
                                {currentTask.requiredSkillsTotal > 0 && (
                                  <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-blue-500 rounded-full"
                                      style={{ width: `${((currentTask.requiredSkillsCompleted || 0) / currentTask.requiredSkillsTotal) * 100}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* 待提产出阶段 */}
                            {currentTask.taskPhase === 'ready_submit' && (
                              <div className="bg-orange-50 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-orange-500" />
                                  <span className="text-sm font-medium text-orange-700">新知已学完，等待提交产出</span>
                                </div>
                              </div>
                            )}
                            
                            {/* 产出待审核阶段 */}
                            {currentTask.taskPhase === 'pending_review' && currentTask.submission && (
                              <div className="bg-yellow-50 rounded-lg p-3 space-y-3">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-yellow-600" />
                                  <span className="text-sm font-medium text-yellow-700">产出已提交，等待审核</span>
                                </div>
                                <p className="text-xs text-yellow-600">
                                  提交时间：{currentTask.submission.created_at ? new Date(currentTask.submission.created_at).toLocaleDateString() : '-'}
                                </p>
                                {currentTask.submission.content && (
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">任务产出描述</p>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{currentTask.submission.content}</p>
                                  </div>
                                )}
                                {currentTask.submission.file_urls && currentTask.submission.file_urls.length > 0 && (
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-2">产出附件</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {currentTask.submission.file_urls.map((file: any, idx: number) => {
                                        const url = typeof file === 'string' ? file : (file.url || '');
                                        const fileName = file.name || `附件${idx + 1}`;
                                        const fileType = file.type || '';
                                        const isImage = fileType === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                                        const isVideo = fileType === 'video' || /\.(mp4|mov|avi|wmv)$/i.test(url);
                                        
                                        return (
                                          <div key={idx} className="relative">
                                            {isImage ? (
                                              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                <img 
                                                  src={url} 
                                                  alt={fileName}
                                                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                                />
                                              </a>
                                            ) : isVideo ? (
                                              <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200"
                                              >
                                                <Video className="w-4 h-4" />
                                                <span className="truncate">{fileName}</span>
                                              </a>
                                            ) : (
                                              <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200"
                                              >
                                                <FileText className="w-4 h-4" />
                                                <span className="truncate">{fileName}</span>
                                              </a>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* 已完成 - 显示反馈结果 */}
                            {currentTask.taskPhase === 'completed' && currentTask.submission && (
                              <div className="bg-green-50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <span className="text-sm font-medium text-green-700">审核通过</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">审核评价</p>
                                    <p className="text-lg font-bold text-green-600">
                                      {currentTask.submission.rating === 'excellent' ? '优秀' : '通过'}
                                    </p>
                                  </div>
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">获得点赞</p>
                                    <div className="flex items-center gap-1">
                                      <ThumbsUp className="w-5 h-5 text-red-500" />
                                      <span className="text-2xl font-bold text-red-500">{currentTask.submission.likes || 0}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* 产出内容 */}
                                {currentTask.submission.content && (
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">任务产出描述</p>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{currentTask.submission.content}</p>
                                  </div>
                                )}
                                
                                {/* 产出附件 */}
                                {currentTask.submission.file_urls && currentTask.submission.file_urls.length > 0 && (
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-2">产出附件</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {currentTask.submission.file_urls.map((file: any, idx: number) => {
                                        const url = typeof file === 'string' ? file : (file.url || '');
                                        const fileName = file.name || `附件${idx + 1}`;
                                        const fileType = file.type || '';
                                        const isImage = fileType === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                                        const isVideo = fileType === 'video' || /\.(mp4|mov|avi|wmv)$/i.test(url);
                                        
                                        return (
                                          <div key={idx} className="relative">
                                            {isImage ? (
                                              <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                <img 
                                                  src={url} 
                                                  alt={fileName}
                                                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                                />
                                              </a>
                                            ) : isVideo ? (
                                              <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200"
                                              >
                                                <Video className="w-4 h-4" />
                                                <span className="truncate">{fileName}</span>
                                              </a>
                                            ) : (
                                              <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200"
                                              >
                                                <FileText className="w-4 h-4" />
                                                <span className="truncate">{fileName}</span>
                                              </a>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                
                                {/* 老师点评 */}
                                {currentTask.submission.review_comment && (
                                  <div className="bg-white rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">老师点评</p>
                                    <p className="text-sm text-gray-700">{currentTask.submission.review_comment}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* 已退回 */}
                            {currentTask.taskPhase === 'rejected' && currentTask.submission && (
                              <div className="bg-red-50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <XCircle className="w-4 h-4 text-red-500" />
                                  <span className="text-sm font-medium text-red-700">产出已被退回</span>
                                </div>
                                {currentTask.submission.review_comment && (
                                  <p className="text-xs text-red-600 mt-1">
                                    退回原因：{currentTask.submission.review_comment}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 已完成的任务列表 */}
                      {progressDetailTasks.filter((t: any) => t.submission?.status === 'approved').length > 0 && (
                        <div className="space-y-3">
                          <h3 className="font-medium text-lg flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            已完成的任务
                          </h3>
                          {progressDetailTasks
                            .filter((t: any) => t.submission?.status === 'approved')
                            .map((task: any) => {
                              const score = task.submission?.score;
                              const feedback = task.submission?.feedback;
                              const content = task.submission?.content;
                              const likes = task.submission?.likes || 0;
                              
                              return (
                                <div key={task.id} className="border border-green-200 rounded-xl p-4 bg-green-50">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-medium">
                                        {task.stage}
                                      </div>
                                      <h4 className="font-medium">{task.title}</h4>
                                    </div>
                                    <Badge className="bg-green-500 text-white">已完成</Badge>
                                  </div>
                                  
                                  <div className="space-y-3 mt-3 pt-3 border-t border-green-200">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="bg-white rounded-lg p-3">
                                        <p className="text-xs text-gray-500 mb-1">审核评价</p>
                                        <p className="text-lg font-bold text-green-600">
                                          {task.submissions?.[0]?.rating === 'excellent' ? '优秀' : '通过'}
                                        </p>
                                      </div>
                                      <div className="bg-white rounded-lg p-3">
                                        <p className="text-xs text-gray-500 mb-1">获得点赞</p>
                                        <div className="flex items-center gap-1">
                                          <ThumbsUp className="w-5 h-5 text-red-500" />
                                          <span className="text-2xl font-bold text-red-500">{likes}</span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {feedback && (
                                      <div className="bg-white rounded-lg p-3">
                                        <p className="text-xs text-gray-500 mb-1">老师点评</p>
                                        <p className="text-sm text-gray-700">{feedback}</p>
                                      </div>
                                    )}
                                    
                                    {content && (
                                      <div className="bg-white rounded-lg p-3">
                                        <p className="text-xs text-gray-500 mb-1">任务产出</p>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">{content}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* 已完成状态 */}
                  {themeStatus === 'completed' && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-medium text-green-800 mb-2">主题任务已全部完成</h3>
                      <p className="text-sm text-green-600">共完成 {completedCount} 个任务</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* 已完成主题存档详情弹窗 */}
        <Dialog open={!!viewingArchive} onOpenChange={(open) => !open && setViewingArchive(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-xl">{viewingArchive?.theme?.icon || '🏆'}</span>
                第{viewingArchive?.cycle}周期：{viewingArchive?.theme?.name}
              </DialogTitle>
            </DialogHeader>
            
            {viewingArchive && (
              <div className="space-y-4">
                {/* 主题介绍 */}
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">{viewingArchive.theme?.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>开始：{viewingArchive.selectedAt ? new Date(viewingArchive.selectedAt).toLocaleDateString() : '-'}</span>
                    <span>完成：{viewingArchive.completedAt ? new Date(viewingArchive.completedAt).toLocaleDateString() : '-'}</span>
                  </div>
                </div>

                {/* 新知学习内容 */}
                {viewingArchive.skills && viewingArchive.skills.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                      <BookOpen className="w-4 h-4 text-purple-500" />
                      新知学习内容
                    </h4>
                    <div className="space-y-2">
                      {viewingArchive.skills.map((skill: any, idx: number) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-base">{skill.icon || '📚'}</span>
                            <span className="font-medium text-sm">{skill.name}</span>
                            <Badge variant={skill.learningStatus === 'completed' ? 'default' : 'outline'} className="text-xs">
                              {skill.learningStatus === 'completed' ? '已掌握' : '学习中'}
                            </Badge>
                          </div>
                          {skill.description && (
                            <p className="text-xs text-gray-500 ml-7">{skill.description}</p>
                          )}
                          {skill.content && skill.learningStatus === 'completed' && (
                            <div className="mt-2 ml-7 p-2 bg-purple-50 rounded text-xs text-gray-600">
                              <p className="font-medium text-purple-700 mb-1">学习要点：</p>
                              <p className="whitespace-pre-wrap">{skill.content}</p>
                            </div>
                          )}
                          {skill.learningMaterials && skill.learningMaterials.length > 0 && skill.learningStatus === 'completed' && (
                            <div className="mt-2 ml-7 flex flex-wrap gap-1">
                              {skill.learningMaterials.map((material: any, midx: number) => (
                                <a
                                  key={midx}
                                  href={material.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {material.title || '学习材料'}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 任务完成记录 */}
                <div>
                  <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-orange-500" />
                    任务完成记录
                  </h4>
                  <div className="space-y-3">
                    {viewingArchive.tasks?.map((task: any, tidx: number) => {
                      const submission = task.submissions?.[0];
                      const isApproved = submission?.status === 'approved';
                      const isRejected = submission?.status === 'rejected';
                      
                      return (
                        <div key={tidx} className={`border rounded-lg p-3 ${
                          isApproved ? 'border-green-200 bg-green-50' :
                          isRejected ? 'border-red-200 bg-red-50' :
                          submission ? 'border-yellow-200 bg-yellow-50' :
                          'border-gray-200 bg-gray-50'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center ${
                                isApproved ? 'bg-green-500' :
                                isRejected ? 'bg-red-500' :
                                submission ? 'bg-yellow-500' : 'bg-gray-400'
                              }`}>
                                {task.stage}
                              </div>
                              <span className="font-medium text-sm">{task.title}</span>
                            </div>
                            <Badge className={
                              isApproved ? 'bg-green-100 text-green-700' :
                              isRejected ? 'bg-red-100 text-red-700' :
                              submission ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }>
                              {isApproved ? '已通过' : isRejected ? '已退回' : submission ? '待审核' : '未提交'}
                            </Badge>
                          </div>
                          
                          {task.description && (
                            <p className="text-xs text-gray-500 ml-8 mb-2">{task.description}</p>
                          )}

                          {/* 产出内容 */}
                          {submission && (
                            <div className="ml-8 space-y-2">
                              {submission.content && (
                                <div className="bg-white rounded p-2">
                                  <p className="text-xs text-gray-500 mb-1">产出描述</p>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.content}</p>
                                </div>
                              )}
                              
                              {/* 产出附件 */}
                              {submission.file_urls && submission.file_urls.length > 0 && (
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">产出附件</p>
                                  <div className="grid grid-cols-3 gap-2">
                                    {submission.file_urls.map((file: any, fidx: number) => {
                                      const url = typeof file === 'string' ? file : (file.url || '');
                                      const fileName = file.name || `附件${fidx + 1}`;
                                      const fileType = file.type || '';
                                      const isImage = fileType === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                                      const isVideo = fileType === 'video' || /\.(mp4|mov|avi|wmv)$/i.test(url);
                                      
                                      return (
                                        <div key={fidx}>
                                          {isImage ? (
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                              <img 
                                                src={url} 
                                                alt={fileName}
                                                className="w-full h-20 object-cover rounded-lg border border-gray-200"
                                              />
                                            </a>
                                          ) : isVideo ? (
                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                              className="flex items-center gap-1 p-2 bg-white rounded-lg text-xs text-gray-600 border border-gray-200 hover:bg-gray-50">
                                              <Video className="w-3 h-3" />
                                              <span className="truncate">{fileName}</span>
                                            </a>
                                          ) : (
                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                              className="flex items-center gap-1 p-2 bg-white rounded-lg text-xs text-gray-600 border border-gray-200 hover:bg-gray-50">
                                              <FileText className="w-3 h-3" />
                                              <span className="truncate">{fileName}</span>
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* 评价反馈 */}
                              {isApproved && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white rounded p-2 text-center">
                                    <p className="text-xs text-gray-500">审核评价</p>
                                    <p className="text-lg font-bold text-green-600">
                                      {submission.rating === 'excellent' ? '优秀' : '通过'}
                                    </p>
                                  </div>
                                  <div className="bg-white rounded p-2 text-center">
                                    <p className="text-xs text-gray-500">点赞</p>
                                    <div className="flex items-center justify-center gap-1">
                                      <ThumbsUp className="w-4 h-4 text-red-500" />
                                      <span className="text-lg font-bold text-red-500">{submission.likes || 0}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {submission.review_comment && (
                                <div className="bg-white rounded p-2">
                                  <p className="text-xs text-gray-500 mb-1">老师点评</p>
                                  <p className="text-sm text-gray-700">{submission.review_comment}</p>
                                </div>
                              )}

                              {isRejected && submission.review_comment && (
                                <div className="bg-white rounded p-2">
                                  <p className="text-xs text-gray-500 mb-1">退回原因</p>
                                  <p className="text-sm text-red-600">{submission.review_comment}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const activeFollows = follows.filter(f => f.isActive);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center">
              <span className="text-lg">👨‍👩‍👧</span>
            </div>
            <div>
              <h1 className="font-semibold">家长中心</h1>
              <p className="text-sm text-gray-500">{parent?.name || parent?.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* 关注记录 - 统一展示待审核、已拒绝、已取消的记录 */}
        {(() => {
          // 非活跃的关注记录（待审核、已拒绝、已取消）
          const inactiveFollows = follows.filter(f => !f.isActive);
          if (inactiveFollows.length === 0) return null;
          
          // 按状态分组
          const pendingFollows = inactiveFollows.filter(f => f.status === 'pending');
          const rejectedFollows = inactiveFollows.filter(f => f.status === 'rejected');
          const cancelledFollows = inactiveFollows.filter(f => f.status === 'cancelled');
          
          return (
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-500" />
                    关注记录
                    <Badge className="bg-gray-100 text-gray-600">{inactiveFollows.length}</Badge>
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    {showHistory ? '收起' : '展开'}
                  </Button>
                </div>
              </CardHeader>
              
              {showHistory && (
                <CardContent className="space-y-4">
                  {/* 待审核 */}
                  {pendingFollows.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        待审核 ({pendingFollows.length})
                      </h4>
                      <div className="space-y-2">
                        {pendingFollows.map(follow => (
                          <div 
                            key={follow.followId} 
                            className="border border-yellow-200 rounded-xl p-4 bg-yellow-50"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{follow.childName}</span>
                                  {follow.childGrade && (
                                    <Badge variant="outline">{follow.childGrade}</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 space-y-0.5">
                                  <p>关系：{follow.relation}</p>
                                  {follow.team && <p>申请关注：{follow.team.name}</p>}
                                  <p>申请时间：{new Date(follow.followedAt).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setSelectedFollowDetail(follow)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                详情
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 已拒绝 */}
                  {rejectedFollows.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        已拒绝 ({rejectedFollows.length})
                      </h4>
                      <div className="space-y-2">
                        {rejectedFollows.map(follow => (
                          <div 
                            key={follow.followId} 
                            className="border border-red-200 rounded-xl p-4 bg-red-50"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{follow.childName}</span>
                                  {follow.childGrade && (
                                    <Badge variant="outline">{follow.childGrade}</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 space-y-0.5">
                                  <p>关系：{follow.relation}</p>
                                  {follow.team && <p>申请关注：{follow.team.name}</p>}
                                  {follow.reviewRemark && (
                                    <p className="text-red-600">拒绝原因：{follow.reviewRemark}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setSelectedFollowDetail(follow)}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  详情
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 已取消关注 */}
                  {cancelledFollows.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        已取消关注 ({cancelledFollows.length})
                      </h4>
                      <div className="space-y-2">
                        {cancelledFollows.map(follow => (
                          <div 
                            key={follow.followId} 
                            className="border border-gray-200 rounded-xl p-4 bg-gray-50 opacity-75"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{follow.childName}</span>
                                  {follow.childGrade && (
                                    <Badge variant="outline">{follow.childGrade}</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 space-y-0.5">
                                  <p>关系：{follow.relation}</p>
                                  {follow.team && <p>曾关注：{follow.team.name}</p>}
                                  {follow.unfollowedAt && (
                                    <p>取消于：{new Date(follow.unfollowedAt).toLocaleDateString()}</p>
                                  )}
                                </div>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  // 填充表单并打开添加关注
                                  setChildNameInForm(follow.childName);
                                  setChildGradeInForm(follow.childGrade);
                                  setRelationInForm(follow.relation.includes('其他') ? '其他' : follow.relation);
                                  if (follow.relation.includes('其他') && follow.guardianReason) {
                                    setOtherRelation(follow.relation);
                                    setGuardianReason(follow.guardianReason);
                                  }
                                  setShowAddFollow(true);
                                }}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                重新关注
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })()}

        {/* 关注的小队列表 */}
        {activeFollows.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">关注的小队</h2>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowAddFollow(!showAddFollow)}
              >
                <Plus className="w-4 h-4 mr-1" />
                {follows.some(f => f.isActive && f.childName === childNameInForm && f.team?.id) 
                  ? '添加关注' : '添加关注'}
              </Button>
            </div>

            <div className="grid gap-4">
              {activeFollows.map(follow => (
                <Card 
                  key={follow.followId} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => viewTeamDetail(follow)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                        <span className="text-2xl">🚀</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{follow.team.name}</h3>
                          <Badge variant="outline">第{follow.team.cycle}周期</Badge>
                          {follow.childGrade && (
                            <Badge className="bg-blue-50 text-blue-600">{follow.childGrade}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          孩子：{follow.childName}
                        </p>
                        {follow.team.slogan && (
                          <p className="text-sm text-gray-600 mt-1">
                            {follow.team.slogan}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-500">
                          {formatPoints(follow.team.points)}
                        </p>
                        <p className="text-xs text-gray-400">积分</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                    
                    {follow.team.currentThemeId && (
                      <div className="mt-3 flex items-center gap-2">
                        <Badge className="bg-purple-100 text-purple-700">
                          正在进行中
                        </Badge>
                      </div>
                    )}
                    
                    {/* 切换小队按钮 */}
                    <div className="mt-3 pt-3 border-t">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-orange-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddFollow(true);
                          setSearchKeyword(follow.childName);
                          setChildNameInForm(follow.childName);
                          setChildGradeInForm(follow.childGrade);
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        切换小队（原数据存档）
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-500 ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnfollow(follow.followId);
                        }}
                      >
                        取消关注
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-pink-400" />
              </div>
              <h3 className="font-semibold mb-2">还没有关注的小队</h3>
              <p className="text-gray-500 mb-4">添加孩子所在的小队，关注学习进度</p>
              <Button 
                onClick={() => setShowAddFollow(true)}
                className="bg-gradient-to-r from-pink-500 to-orange-500"
              >
                <Plus className="w-4 h-4 mr-1" />
                添加关注
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 搜索添加/切换关注 */}
        {showAddFollow && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {childNameInForm ? `为 ${childNameInForm} 关注小队` : '搜索并关注小队'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 孩子信息 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">与孩子关系</label>
                  <select
                    value={relationInForm}
                    onChange={(e) => {
                      setRelationInForm(e.target.value);
                      if (e.target.value !== '其他') {
                        setOtherRelation('');
                        setGuardianReason('');
                      }
                    }}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">请选择</option>
                    <option value="父亲">父亲</option>
                    <option value="母亲">母亲</option>
                    <option value="爷爷">爷爷</option>
                    <option value="奶奶">奶奶</option>
                    <option value="姥姥">姥姥</option>
                    <option value="姥爷">姥爷</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">孩子姓名</label>
                  <Input
                    placeholder="输入孩子姓名"
                    value={childNameInForm}
                    onChange={(e) => setChildNameInForm(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">孩子年级</label>
                  <select
                    value={childGradeInForm}
                    onChange={(e) => setChildGradeInForm(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">请选择</option>
                    <option value="一年级">一年级</option>
                    <option value="二年级">二年级</option>
                    <option value="三年级">三年级</option>
                    <option value="四年级">四年级</option>
                    <option value="五年级">五年级</option>
                    <option value="六年级">六年级</option>
                  </select>
                </div>
              </div>

              {/* 其他关系时的补充信息 */}
              {relationInForm === '其他' && (
                <div className="space-y-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm text-orange-700 font-medium">请填写以下信息：</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-600">明确的关系 <span className="text-red-500">*</span></label>
                      <Input
                        placeholder="如：姑姑、叔叔、小姨等"
                        value={otherRelation}
                        onChange={(e) => setOtherRelation(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-600">为何由你作为此学生监护人 <span className="text-red-500">*</span></label>
                      <textarea
                        placeholder="请说明情况，如：父母在外务工，孩子由我照顾"
                        value={guardianReason}
                        onChange={(e) => setGuardianReason(e.target.value)}
                        className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* 学校搜索 */}
              <div className="space-y-2">
                <label className="text-sm text-gray-600">孩子所在小学</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="输入小学名称自动搜索"
                    value={schoolKeyword}
                    onChange={(e) => {
                      setSchoolKeyword(e.target.value);
                      if (selectedSchool && e.target.value !== selectedSchool.name) {
                        setSelectedSchool(null);
                      }
                    }}
                    onFocus={() => {
                      // 聚焦时不自动展开，让用户点击触发
                    }}
                    className="pl-10"
                  />
                  {searchingSchool && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                
                {/* 学校下拉列表 */}
                {schoolResults.length > 0 && schoolKeyword && (
                  <div className="absolute z-20 w-[calc(100%-2rem)] mt-1 border rounded-lg shadow-lg bg-white max-h-60 overflow-y-auto">
                    {schoolResults.map(school => (
                      <button
                        key={school.id}
                        type="button"
                        onClick={() => {
                          setSelectedSchool(school);
                          setSchoolKeyword(school.name);
                          setSchoolResults([]);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-pink-50 border-b last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-gray-800">{school.name}</p>
                        {school.district && (
                          <p className="text-xs text-gray-500">{school.district}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                
                {selectedSchool && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-700 flex-1">已选择：{selectedSchool.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSchool(null);
                        setSchoolKeyword('');
                      }}
                      className="text-xs text-gray-500 hover:text-red-500"
                    >
                      重新选择
                    </button>
                  </div>
                )}
              </div>

              {/* 提示文字 */}
              <div className="text-sm text-gray-500 bg-blue-50 p-3 rounded-lg">
                <p className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">1</span>
                  填写孩子姓名、选择学校后自动搜索小队
                </p>
              </div>

              {/* 搜索状态 */}
              {(searching || searchingSchool) && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <div className="w-5 h-5 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
                  <span className="text-sm text-gray-500">正在搜索小队...</span>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  {searchResults.map(team => {
                    const existingFollow = follows.find(
                      f => f.team.id === team.id && f.childName === childNameInForm
                    );
                    const isCurrentTeam = existingFollow?.isActive;
                    
                    return (
                      <div key={team.id} className="border rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{team.name}</h4>
                            <p className="text-sm text-gray-500">
                              孩子：{team.childName}
                              {team.schoolName && ` - ${team.schoolName}`}
                              {team.slogan && ` - ${team.slogan}`}
                            </p>
                          </div>
                          {isCurrentTeam ? (
                            <Badge className="bg-green-100 text-green-700">当前关注</Badge>
                          ) : existingFollow?.status === 'pending' ? (
                            <Badge className="bg-yellow-100 text-yellow-700">等待审核</Badge>
                          ) : existingFollow ? (
                            <Button 
                              size="sm" 
                              onClick={() => handleSwitchTeam(
                                existingFollow.followId, 
                                team.id, 
                                childGradeInForm
                              )}
                              disabled={switchingTeam === existingFollow.followId}
                            >
                              {switchingTeam === existingFollow.followId ? '切换中...' : '切换到该小队'}
                            </Button>
                          ) : (
                            <Button 
                              size="sm" 
                              onClick={() => handleFollow(
                                team.id, 
                                childNameInForm || team.childName,
                                childGradeInForm
                              )}
                            >
                              提交关注
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 未搜索时提示 */}
              {!searching && !searchingSchool && !searchResults.length && childNameInForm && selectedSchool && (
                <div className="text-center py-6 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>未找到相关小队</p>
                  <p className="text-sm mt-1">请确认孩子姓名、学校信息是否正确</p>
                </div>
              )}

              <Button 
                variant="ghost" 
                className="w-full" 
                onClick={() => {
                  setShowAddFollow(false);
                  setSearchResults([]);
                  setSearchKeyword('');
                  setChildNameInForm('');
                  setChildGradeInForm('');
                  setSelectedSchool(null);
                  setSchoolKeyword('');
                }}
              >
                取消
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 关注申请详情弹窗 */}
      {selectedFollowDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold">{editingFollow ? '修改申请信息' : '关注申请详情'}</h3>
              <button 
                onClick={() => {
                  setSelectedFollowDetail(null);
                  setEditingFollow(false);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {!editingFollow ? (
                <>
                  {/* 查看模式：显示审核状态 */}
                  <div className={`rounded-lg p-4 ${selectedFollowDetail.status === 'pending' ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {selectedFollowDetail.status === 'pending' ? (
                        <Clock className="w-5 h-5 text-yellow-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className="font-medium">
                        {selectedFollowDetail.status === 'pending' ? '等待老师审核' : '审核未通过'}
                      </span>
                    </div>
                    {selectedFollowDetail.status === 'pending' && (
                      <p className="text-sm text-gray-600">
                        您的关注申请正在等待老师审核，请耐心等待。
                      </p>
                    )}
                    {selectedFollowDetail.reviewRemark && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        <p className="text-sm text-red-600">
                          <strong>拒绝原因：</strong>{selectedFollowDetail.reviewRemark}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 查看模式：显示申请信息 */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-gray-700">申请信息</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">孩子姓名</p>
                        <p className="font-medium">{selectedFollowDetail.childName}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">与孩子关系</p>
                        <p className="font-medium">{selectedFollowDetail.relation}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">所在年级</p>
                        <p className="font-medium">{selectedFollowDetail.childGrade || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">申请时间</p>
                        <p className="font-medium">{new Date(selectedFollowDetail.followedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {selectedFollowDetail.schoolName && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-gray-500">归属学校</p>
                        <p className="font-medium">{selectedFollowDetail.schoolName}</p>
                      </div>
                    )}
                    {selectedFollowDetail.guardianReason && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-orange-600 font-medium">监护人说明</p>
                        <p className="text-sm text-gray-700 mt-1">{selectedFollowDetail.guardianReason}</p>
                      </div>
                    )}
                    {selectedFollowDetail.team && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-gray-500">申请关注的小队</p>
                        <p className="font-medium text-green-600">{selectedFollowDetail.team.name}</p>
                      </div>
                    )}
                  </div>

                  {/* 查看模式：操作按钮 */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setSelectedFollowDetail(null)}
                    >
                      关闭
                    </Button>
                    {selectedFollowDetail.status === 'rejected' && (
                      <Button 
                        className="flex-1 bg-orange-500 hover:bg-orange-600"
                        onClick={() => {
                          // 初始化编辑表单
                          setEditChildName(selectedFollowDetail.childName);
                          setEditChildGrade(selectedFollowDetail.childGrade || '');
                          // 判断是否是"其他"关系
                          const isOtherRelation = ['父亲', '母亲', '爷爷', '奶奶', '姥姥', '姥爷'].indexOf(selectedFollowDetail.relation) === -1;
                          if (isOtherRelation) {
                            setEditRelation('其他');
                            setEditOtherRelation(selectedFollowDetail.relation);
                          } else {
                            setEditRelation(selectedFollowDetail.relation);
                            setEditOtherRelation('');
                          }
                          setEditGuardianReason(selectedFollowDetail.guardianReason || '');
                          setEditTeamId(selectedFollowDetail.team?.id || '');
                          setEditTeamName(selectedFollowDetail.team?.name || '');
                          setEditingFollow(true);
                        }}
                      >
                        修改
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* 编辑模式：表单 */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm text-orange-700">
                      请修改信息后保存重新提交。修改后的申请将重新发送给老师审核。
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600">与孩子关系</label>
                      <select
                        value={editRelation}
                        onChange={(e) => {
                          setEditRelation(e.target.value);
                          if (e.target.value !== '其他') {
                            setEditOtherRelation('');
                            setEditGuardianReason('');
                          }
                        }}
                        className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mt-1"
                      >
                        <option value="">请选择</option>
                        <option value="父亲">父亲</option>
                        <option value="母亲">母亲</option>
                        <option value="爷爷">爷爷</option>
                        <option value="奶奶">奶奶</option>
                        <option value="姥姥">姥姥</option>
                        <option value="姥爷">姥爷</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>

                    {editRelation === '其他' && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-3">
                        <div>
                          <label className="text-sm text-gray-600">明确的关系 <span className="text-red-500">*</span></label>
                          <Input
                            placeholder="如：姑姑、叔叔、小姨等"
                            value={editOtherRelation}
                            onChange={(e) => setEditOtherRelation(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-gray-600">为何由你作为此学生监护人 <span className="text-red-500">*</span></label>
                          <textarea
                            placeholder="请说明情况，如：父母在外务工，孩子由我照顾"
                            value={editGuardianReason}
                            onChange={(e) => setEditGuardianReason(e.target.value)}
                            className="w-full h-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mt-1 resize-none"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-sm text-gray-600">孩子姓名</label>
                      <Input
                        placeholder="输入孩子姓名"
                        value={editChildName}
                        onChange={(e) => setEditChildName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-gray-600">孩子年级</label>
                      <select
                        value={editChildGrade}
                        onChange={(e) => setEditChildGrade(e.target.value)}
                        className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mt-1"
                      >
                        <option value="">请选择</option>
                        <option value="一年级">一年级</option>
                        <option value="二年级">二年级</option>
                        <option value="三年级">三年级</option>
                        <option value="四年级">四年级</option>
                        <option value="五年级">五年级</option>
                        <option value="六年级">六年级</option>
                      </select>
                    </div>

                    {editTeamName && (
                      <div>
                        <label className="text-sm text-gray-600">关注的小队</label>
                        <div className="h-10 px-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center mt-1">
                          <span className="text-green-600 font-medium">{editTeamName}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 编辑模式：操作按钮 */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setEditingFollow(false)}
                    >
                      取消
                    </Button>
                    <Button 
                      className="flex-1 bg-orange-500 hover:bg-orange-600"
                      onClick={handleUpdateFollow}
                    >
                      保存并重新提交
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function ParentDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>}>
      <ParentDashboardContent />
    </Suspense>
  );
}
