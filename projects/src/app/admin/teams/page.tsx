'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useDataRefresh } from '@/hooks/use-data-refresh';
import { useResponsive } from '@/hooks/use-responsive';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Plus, Search, Users, Star,
  Trash2, X, Calendar, ChevronRight, Gift, Trophy, Gem,
  Sparkles, Wrench, BookOpen, Target, Loader2, Eye, Menu, Download
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
}

interface School {
  id: string;
  name: string;
}

interface Team {
  id: string;
  code: string;
  name: string;
  slogan?: string;
  points: number;
  status: string;
  school_id?: string;
  school?: {
    id: string;
    name: string;
  } | null;
  theme?: {
    id: string;
    name: string;
    icon: string;
  } | null;
  created_at: string;
  created_by?: string;
  grade?: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  is_approved: boolean;
}

interface CurrentTask {
  id: string;
  title: string;
  stage: number;
  description: string | null;
  points: number;
}

interface TeamReward {
  id: string;
  reward_id: string;
  earned_at: string;
  rewards: {
    id: string;
    name: string;
    description: string;
    icon: string;
    type: string;
    points: number;
  };
}

interface LikesStats {
  received: number;
  given: number;
  pointsFromLikes: number;
}

interface HeartGemsStats {
  fragments: number;
  gems: number;
  totalSentLikes: number;
  fragmentsPerGem: number;
}

interface Stats {
  total: number;
  byType: Record<string, number>;
  totalPoints: number;
}

interface TeamDetail extends Team {
  currentTask: CurrentTask | null;
  themeTasksCount: number;
  members: TeamMember[];
  rewards: TeamReward[];
  groupedRewards: Record<string, TeamReward[]>;
  stats: Stats;
  likesStats: LikesStats;
  heartGems: HeartGemsStats;
}

/**
 * 获取当前学期信息
 * 春季学期：1-6月，学期码为1
 * 秋季学期：7-12月，学期码为2
 */
function getCurrentSemester(): { year: number; semester: number; semesterName: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const semester = month >= 1 && month <= 6 ? 1 : 2;
  const semesterName = semester === 1 ? '春季学期' : '秋季学期';
  return { year, semester, semesterName };
}

// 奖励类型映射
const rewardTypeMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  badge: { label: '徽章', icon: <Trophy className="w-4 h-4" />, color: 'text-yellow-600' },
  gem: { label: '宝石', icon: <Gem className="w-4 h-4" />, color: 'text-purple-600' },
  hidden_skill: { label: '隐藏技能卡', icon: <Sparkles className="w-4 h-4" />, color: 'text-blue-600' },
  hidden_tool: { label: '隐藏工具卡', icon: <Wrench className="w-4 h-4" />, color: 'text-orange-600' },
  achievement: { label: '成就', icon: <Target className="w-4 h-4" />, color: 'text-green-600' },
};

// 状态映射
const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: 'bg-green-100 text-green-700' },
  completed: { label: '已完成', color: 'bg-blue-100 text-blue-700' },
  paused: { label: '已暂停', color: 'bg-yellow-100 text-yellow-700' },
};

export default function AdminTeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  
  // 滚动位置记忆
  useScrollPosition('admin-teams');
  
  // 响应式布局
  const responsive = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTeam, setNewTeam] = useState({ count: 1 });
  const [isCreating, setIsCreating] = useState(false);
  
  // 筛选相关状态
  const [keyword, setKeyword] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // 详情面板状态
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // 判断是否为只读模式（助学老师）
  const isReadOnly = admin?.role === 'teacher';

  // 刷新数据
  const refreshData = useCallback(async () => {
    if (admin) {
      fetchTeams(admin);
    }
  }, [admin]);

  // 数据同步：监听奖励和提交变化
  useDataRefresh({
    keys: ['user_rewards', 'submissions'],
    onRefresh: refreshData,
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          setAdmin(data.user);
          fetchTeams(data.user);
          fetchSchools();
        }
      } catch {
        // ignore
      }
    };
    fetchUser();
  }, []);

  const fetchSchools = async () => {
    try {
      const res = await fetch('/api/schools');
      const data = await res.json();
      setSchools(data.schools || []);
    } catch (error) {
      console.error('获取学校列表失败:', error);
    }
  };

  const fetchTeams = async (user: AdminUser, filters?: {
    keyword?: string;
    schoolId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    try {
      const params = new URLSearchParams();
      
      // 根据角色筛选小队
      if (user.role === 'volunteer') {
        // 志愿者只能看自己创建的小队
        params.append('createdBy', user.id);
        params.append('role', user.role);
      } else if (user.role === 'teacher') {
        // 助学老师只能看自己对接的小队
        params.append('teacherId', user.id);
        params.append('role', user.role);
      } else if (filters?.schoolId && filters.schoolId !== 'all') {
        // 超级管理员按学校筛选
        params.append('schoolId', filters.schoolId);
      }
      
      if (filters?.keyword) {
        params.append('keyword', filters.keyword);
      }
      if (filters?.startDate) {
        params.append('startDate', filters.startDate);
      }
      if (filters?.endDate) {
        params.append('endDate', filters.endDate);
      }
      
      const res = await fetch(`/api/teams?${params.toString()}`);
      const data = await res.json();
      setTeams(data.teams || []);
    } catch (error) {
      console.error('获取小队列表失败:', error);
    }
  };
  
  // 执行筛选
  const handleSearch = () => {
    if (admin) {
      fetchTeams(admin, { keyword, schoolId: selectedSchoolId, startDate, endDate });
    }
  };
  
  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setSelectedSchoolId('all');
    setStartDate('');
    setEndDate('');
    if (admin) {
      fetchTeams(admin);
    }
  };

  const handleCreateTeam = async () => {
    if (!admin) return;
    
    const count = Math.max(1, Math.min(99, newTeam.count || 1));
    
    setIsCreating(true);
    try {
      // 批量创建小队：一次API调用创建指定数量的小队
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: '123456',
          schoolId: admin.school_id,
          createdBy: admin.id,
          count: count, // 传入数量，后端批量创建
        }),
      });

      const data = await res.json();
      if (data.success) {
        const createdCount = data.count || data.teams?.length || 1;
        toast.success(data.message || `成功创建 ${createdCount} 个小队`);
        setShowCreateDialog(false);
        setNewTeam({ count: 1 });
        fetchTeams(admin);
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch (error) {
      toast.error('创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamCode: string) => {
    if (isReadOnly) return;
    
    if (!confirm(`确定要删除小队 ${teamCode} 吗？此操作将同时删除该小队的所有成员，且不可恢复。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`小队 ${teamCode} 已删除`);
        if (admin) {
          fetchTeams(admin);
        }
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 下载小队与银蛇博士的对话记录
  const handleDownloadConversation = async (teamId: string, teamName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    toast.info('正在生成 Word 文档...');
    
    try {
      // 直接请求 Word 格式，后端生成并返回
      const res = await fetch(`/api/admin/team-conversations?teamId=${teamId}&format=docx`);
      
      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || '生成文档失败');
        return;
      }

      // 获取文件名
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `yinhe_chat_${teamName}_${new Date().toISOString().split('T')[0]}.docx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;]*=(?:UTF-8'')?([^;]+)/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }

      // 下载文件
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('对话记录已导出为 Word 文档');
    } catch (error) {
      console.error('下载对话记录失败:', error);
      toast.error('下载失败，请重试');
    }
  };

  // 获取小队详情
  const fetchTeamDetail = async (teamId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setSelectedTeam({
        ...data.team,
        members: data.team.members || [],
        rewards: data.team.rewards || [],
        groupedRewards: data.team.groupedRewards || {},
        stats: data.team.stats || { total: 0, byType: {}, totalPoints: 0 },
        likesStats: data.team.likesStats || { received: 0, given: 0, pointsFromLikes: 0 },
        heartGems: data.team.heartGems || { fragments: 0, gems: 0, totalSentLikes: 0, fragmentsPerGem: 10 },
      });
      setShowDetailPanel(true);
    } catch (error) {
      console.error('获取小队详情失败:', error);
      toast.error('获取小队详情失败');
    } finally {
      setLoadingDetail(false);
    }
  };

  // 按类型分组奖励
  const groupRewardsByType = (rewards: TeamReward[]) => {
    const grouped: Record<string, TeamReward[]> = {};
    rewards.forEach(reward => {
      const type = reward.rewards.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(reward);
    });
    return grouped;
  };

  // 判断是否可以创建小队
  const canCreateTeam = () => {
    if (!admin) return false;
    // 只有超级管理员和志愿者可以创建小队
    return (admin.role === 'admin' || admin.role === 'super_admin') || admin.role === 'volunteer';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')} className="shrink-0">
              <ArrowLeft className="w-4 h-4 md:mr-1" />
              <span className="hidden sm:inline">返回</span>
            </Button>
            <h1 className="text-base md:text-lg font-bold truncate">小队管理</h1>
            {isReadOnly && (
              <Badge variant="outline" className="text-orange-600 border-orange-200 text-xs shrink-0">
                <Eye className="w-3 h-3 mr-1" />
                只读
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canCreateTeam() && (
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="shrink-0">
                <Plus className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">新建小队</span>
              </Button>
            )}
            {/* 移动端筛选按钮 */}
            <Button 
              variant="outline" 
              size="sm" 
              className="md:hidden shrink-0"
              onClick={() => setFilterExpanded(!filterExpanded)}
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* 移动端筛选面板 */}
        {filterExpanded && responsive.isMobile && (
          <div className="md:hidden border-t px-3 py-3 space-y-3 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input 
                placeholder="搜索小队编码或名称..." 
                className="pl-9" 
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            {(admin?.role === 'admin' || admin?.role === 'super_admin') && (
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择归属小学" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部小学</SelectItem>
                  {schools.map(school => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                className="flex-1 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="开始日期"
              />
              <span className="text-gray-400 text-sm">至</span>
              <Input 
                type="date" 
                className="flex-1 text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="结束日期"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSearch} className="flex-1" size="sm">搜索</Button>
              <Button variant="outline" onClick={handleReset} className="flex-1" size="sm">重置</Button>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 助学老师只读提示 */}
        {isReadOnly && (
          <Card className="border-0 shadow-sm mb-4 md:mb-6 bg-orange-50 border-orange-200">
            <CardContent className="py-2 md:py-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-xs md:text-sm text-orange-700">
                  助学老师角色对小队仅有只读权限，可查看所带年级小队的详细信息。
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 筛选栏 - 桌面端 */}
        <Card className="border-0 shadow-sm mb-4 md:mb-6 hidden md:block">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input 
                  placeholder="搜索小队编码或名称..." 
                  className="pl-9" 
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              {/* 归属小学筛选 - 超级管理员可见 */}
              {(admin?.role === 'admin' || admin?.role === 'super_admin') && (
                <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="归属小学" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部小学</SelectItem>
                    {schools.map(school => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-gray-500 shrink-0">创建时间</Label>
                <Input 
                  type="date" 
                  className="w-36"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-gray-400">至</span>
                <Input 
                  type="date" 
                  className="w-36"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button onClick={handleSearch}>搜索</Button>
              <Button variant="outline" onClick={handleReset}>重置</Button>
            </div>
          </CardContent>
        </Card>

        {/* 小队列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-sm md:text-base">
              {admin?.role === 'volunteer' 
                ? '我指导的小队' 
                : admin?.role === 'teacher'
                ? '我所带年级的小队'
                : '小队列表'} 
              ({teams.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <div className="text-center py-8 md:py-12 text-gray-500">
                <Users className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm md:text-base">暂无小队</p>
                {canCreateTeam() && (
                  <p className="text-xs md:text-sm mt-1">点击右上角按钮创建新小队</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3">
                {teams.map((team) => (
                  <div 
                    key={team.id}
                    className="flex items-center justify-between p-3 md:p-4 border rounded-lg hover:bg-gray-50 cursor-pointer active:bg-gray-100 touch-manipulation"
                    onClick={() => fetchTeamDetail(team.id)}
                  >
                    <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white shrink-0">
                        <Users className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm md:text-base truncate">{team.name || '未命名小队'}</h3>
                          <Badge variant="secondary" className="text-xs">{team.code}</Badge>
                          <Badge className={`text-xs ${statusMap[team.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                            {statusMap[team.status]?.label || team.status || '进行中'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            {team.theme?.icon && <span>{team.theme.icon}</span>}
                            <span className="truncate max-w-[80px] md:max-w-none">{team.theme?.name || '未选择主题'}</span>
                          </span>
                          <span className="flex items-center gap-1 text-yellow-600">
                            <Star className="w-3 h-3 md:w-4 md:h-4" />
                            {team.points || 0}
                          </span>
                          {team.grade && !responsive.isMobile && (
                            <span className="text-gray-400">
                              年级：{team.grade}
                            </span>
                          )}
                        </div>
                        {responsive.isMobile && team.slogan && (
                          <p className="text-xs text-purple-500 truncate mt-0.5">"{team.slogan}"</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 md:gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                      {/* 下载对话按钮 */}
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 w-8 md:h-9 md:w-auto p-0 md:px-3"
                        onClick={(e) => handleDownloadConversation(team.id, team.name, e)}
                        title="下载银蛇博士对话记录"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      {/* 删除按钮 - 仅非只读模式显示 */}
                      {!isReadOnly && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 md:h-9 md:w-auto p-0 md:px-3"
                          onClick={() => handleDeleteTeam(team.id, team.code)}
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 创建小队对话框 */}
      {canCreateTeam() && showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>创建新小队</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowCreateDialog(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 当前学期信息 */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 text-blue-700">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium">当前学期</span>
                </div>
                <div className="mt-1 text-sm text-blue-600">
                  {(() => {
                    const { year, semesterName } = getCurrentSemester();
                    return `${year}年 ${semesterName}`;
                  })()}
                </div>
                <div className="mt-2 text-xs text-blue-500">
                  编码规则：年份 + 学期 + 顺序码（自动生成）
                </div>
              </div>
              
              {/* 归属信息 */}
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <p className="text-sm text-purple-700">
                  小队将归属于您所在学校，并自动关联对接的助学老师
                </p>
              </div>
              
              {/* 初始密码显示 */}
              <div className="p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">初始密码</span>
                  <span className="font-mono font-semibold text-gray-800">123456</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>创建小队数量</Label>
                <Input 
                  type="number"
                  min={1}
                  max={99}
                  value={newTeam.count}
                  onChange={(e) => setNewTeam({ ...newTeam, count: parseInt(e.target.value) || 1 })}
                  placeholder="请输入数量（1-99）"
                />
                <p className="text-xs text-gray-500">将自动生成相应数量的小队编码</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowCreateDialog(false)}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleCreateTeam}
                  disabled={isCreating}
                >
                  {isCreating ? '创建中...' : '创建'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 小队详情面板 */}
      {showDetailPanel && selectedTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle>{selectedTeam.name || '未命名小队'}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">{selectedTeam.code}</Badge>
                      <Badge className={statusMap[selectedTeam.status]?.color || 'bg-gray-100 text-gray-600'}>
                        {statusMap[selectedTeam.status]?.label || selectedTeam.status || '进行中'}
                      </Badge>
                    </CardDescription>
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
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">执行任务主题</p>
                  <p className="font-medium flex items-center gap-1 mt-1">
                    {selectedTeam.theme?.icon && <span>{selectedTeam.theme.icon}</span>}
                    {selectedTeam.theme?.name || '未选择主题'}
                  </p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-gray-500">现有积分</p>
                  <p className="font-bold text-yellow-600 flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4" />
                    {selectedTeam.points || 0}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-gray-500">小队口号</p>
                  <p className="font-medium text-purple-600 mt-1 truncate" title={selectedTeam.slogan}>
                    {selectedTeam.slogan || '未设置'}
                  </p>
                </div>
              </div>

              {/* 当前任务阶段 */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">当前任务阶段</span>
                </div>
                {selectedTeam.currentTask ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600 text-white">
                        第 {selectedTeam.currentTask.stage} 阶段
                      </Badge>
                      <span className="font-medium text-gray-800">
                        {selectedTeam.currentTask.title}
                      </span>
                    </div>
                    {selectedTeam.currentTask.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {selectedTeam.currentTask.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {selectedTeam.currentTask.points || 0} 积分
                      </span>
                      {selectedTeam.themeTasksCount > 0 && (
                        <span>
                          主题进度：第 {selectedTeam.currentTask.stage} / {selectedTeam.themeTasksCount} 阶段
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    {selectedTeam.theme ? '小队尚未开始执行任务' : '请先选择任务主题'}
                  </div>
                )}
              </div>

              {/* 小队成员 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  小队成员 ({selectedTeam.members?.length || 0})
                </h4>
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : !selectedTeam.members || selectedTeam.members.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂无成员</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedTeam.members.map((member) => (
                      <div 
                        key={member.id}
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">
                          {member.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-gray-500">
                            {member.role === 'leader' ? '队长' : '队员'}
                            {member.is_approved ? ' · 已通过' : ' · 待审核'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 爱心点赞和宝石统计 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 爱心点赞 */}
                <div className="p-3 bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg border border-pink-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                      <Gift className="w-4 h-4 text-pink-500" />
                      <span className="text-sm font-medium text-pink-700">爱心点赞</span>
                    </div>
                    <span className="text-lg">💝</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-1 bg-white/50 rounded">
                      <p className="text-lg font-bold text-pink-600">{selectedTeam.likesStats?.given || 0}</p>
                      <p className="text-xs text-gray-500">送出</p>
                    </div>
                    <div className="text-center p-1 bg-white/50 rounded">
                      <p className="text-lg font-bold text-rose-600">{selectedTeam.likesStats?.received || 0}</p>
                      <p className="text-xs text-gray-500">获得</p>
                    </div>
                  </div>
                </div>

                {/* 爱心宝石 */}
                <div className="p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                      <Gem className="w-4 h-4 text-purple-500" />
                      <span className="text-sm font-medium text-purple-700">爱心宝石</span>
                    </div>
                    <span className="text-lg">💎</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-1 bg-white/50 rounded">
                      <p className="text-lg font-bold text-purple-600">{selectedTeam.heartGems?.fragments || 0}</p>
                      <p className="text-xs text-gray-500">碎片</p>
                    </div>
                    <div className="text-center p-1 bg-white/50 rounded">
                      <p className="text-lg font-bold text-pink-600">{selectedTeam.heartGems?.gems || 0}</p>
                      <p className="text-xs text-gray-500">宝石</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 获得奖励 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-pink-500" />
                  获得奖励 ({selectedTeam.stats?.total || selectedTeam.rewards?.length || 0})
                </h4>
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : !selectedTeam.rewards || selectedTeam.rewards.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    <Gift className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">暂无奖励</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(selectedTeam.groupedRewards || groupRewardsByType(selectedTeam.rewards)).map(([type, rewards]) => (
                      <div key={type} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={rewardTypeMap[type]?.color || 'text-gray-600'}>
                            {rewardTypeMap[type]?.icon || <Gift className="w-4 h-4" />}
                          </span>
                          <span className="text-sm font-medium text-gray-700">
                            {rewardTypeMap[type]?.label || type} ({rewards.length})
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {rewards.map((reward) => (
                            <div 
                              key={reward.id}
                              className="flex items-center gap-2 p-2 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border border-pink-100"
                            >
                              <span className="text-xl">{reward.rewards.icon}</span>
                              <div>
                                <p className="text-sm font-medium">{reward.rewards.name}</p>
                                <p className="text-xs text-gray-500">
                                  {new Date(reward.earned_at).toLocaleDateString('zh-CN')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowDetailPanel(false)}
                >
                  关闭
                </Button>
                {/* 删除按钮 - 仅非只读模式显示 */}
                {!isReadOnly && (
                  <Button 
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setShowDetailPanel(false);
                      handleDeleteTeam(selectedTeam.id, selectedTeam.code);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除小队
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
