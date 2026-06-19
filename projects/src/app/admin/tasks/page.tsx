'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';
import { 
  ArrowLeft, Plus, ChevronRight, X, 
  Search, Filter, Send, Users, Clock, CheckCircle,
  Loader2, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
}

interface Team {
  id: string;
  code: string;
  name: string;
  currentTaskId: string | null;
  currentStage: number;
  currentTask: { id: string; title: string; stage: number } | null;
  points: number;
  cycle?: number;
  schoolName?: string | null;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  icon: string;
  school_id?: string | null;
  is_exclusive?: boolean;
  created_by?: string;
  totalStages: number;
  teams: Team[];
  status: 'unselected' | 'selected' | 'pending_assign' | 'in_progress' | 'completed';
  activeStage: number;
  canEdit: boolean;
  canDelete: boolean;
  selectionCount?: number; // 被选择的次数
  cycles?: number[]; // 该主题下小队的周期列表
}

export default function AdminTasksPage() {
  const router = useRouter();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTheme, setNewTheme] = useState({
    name: '',
    description: '',
    icon: '🎯',
  });
  const [newThemeErrors, setNewThemeErrors] = useState<{
    name?: string;
  }>({});
  const [isCreating, setIsCreating] = useState(false);
  
  // 滚动位置记忆
  useScrollPosition('admin-tasks');
  
  // 响应式布局
  const responsive = useResponsive();

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, selected, unselected
  const [stageFilter, setStageFilter] = useState('all'); // all, 0, 1, 2, 3...
  const [themeTypeFilter, setThemeTypeFilter] = useState('all'); // all, exclusive, global
  const [cycleFilter, setCycleFilter] = useState('all'); // all, 1, 2, 3...
  const [availableCycles, setAvailableCycles] = useState<number[]>([]); // 可选的周期列表

  // 下发任务相关
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assigningTheme, setAssigningTheme] = useState<Theme | null>(null);
  const [assignDeadline, setAssignDeadline] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (admin) {
      fetchData();
    }
  }, [admin]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 志愿者角色使用专门的API
      if (admin?.role === 'volunteer') {
        const params = new URLSearchParams();
        params.append('volunteerId', admin.id);
        
        const res = await fetch(`/api/admin/task-management?${params.toString()}`);
        const data = await res.json();
        
        // 设置可用周期列表
        if (data.cycles) {
          setAvailableCycles(data.cycles);
        }
        
        if (data.themes) {
          // 权限判断：
          // - 对专属主题（归属本校）：完全操作权限
          // - 对全局主题：只读权限
          const themesWithPermissions = data.themes.map((theme: any) => {
            // 判断是否为本校专属主题
            const isOwnSchoolExclusiveTheme = theme.is_exclusive === true && (
              theme.school_id === admin.school_id ||
              (theme.exclusiveSchools && theme.exclusiveSchools.some((s: any) => s.id === admin.school_id))
            );
            
            return {
              ...theme,
              canEdit: isOwnSchoolExclusiveTheme,
              canDelete: isOwnSchoolExclusiveTheme && (!theme.totalStages || theme.totalStages === 0),
            };
          });
          setThemes(themesWithPermissions);
        }
      } else {
        // 其他角色使用管理员专用API
        const res = await fetch('/api/admin/themes');
        const data = await res.json();
        
        // 设置可用周期列表
        if (data.cycles) {
          setAvailableCycles(data.cycles);
        }
        
        const themesWithPermissions = (data.themes || []).map((theme: any) => {
          let canEdit = false;
          let canDelete = false;
          
          if (admin?.role === 'admin' || admin?.role === 'super_admin') {
            canEdit = true;
            canDelete = true;
          }
          
          return {
            ...theme,
            canEdit,
            canDelete,
          };
        });
        
        // 按选择次数降序排列
        themesWithPermissions.sort((a: Theme, b: Theme) => (b.selectionCount || 0) - (a.selectionCount || 0));
        
        setThemes(themesWithPermissions);
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      toast.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 按主题+周期组合展开主题列表
  const getExpandedThemes = () => {
    const expanded: Array<Theme & { cycleTeams: Team[]; displayCycle: number; groupKey: string }> = [];

    themes.forEach(theme => {
      if (theme.teams && theme.teams.length > 0) {
        // 按周期分组
        const teamsByCycle: Record<number, Team[]> = {};
        theme.teams.forEach(team => {
          const cycle = team.cycle || 1;
          if (!teamsByCycle[cycle]) {
            teamsByCycle[cycle] = [];
          }
          teamsByCycle[cycle].push(team);
        });

        // 每个周期创建一个展开项
        Object.entries(teamsByCycle).forEach(([cycle, cycleTeams]) => {
          const cycleNum = parseInt(cycle);
          
          // 根据该周期的小队情况计算状态
          const hasTask = cycleTeams.some(t => t.currentTaskId);
          const allWithoutTask = cycleTeams.every(t => !t.currentTaskId);
          // 判断是否所有小队都完成了所有任务（通过检查是否有已完成任务的记录）
          // 注意：这里简化判断，只要没有任务ID就认为是"待下发"
          
          let cycleStatus: 'selected' | 'pending_assign' | 'in_progress' | 'completed' = 'selected';
          if (allWithoutTask) {
            cycleStatus = 'pending_assign';
          } else if (hasTask) {
            cycleStatus = 'in_progress';
          }
          
          // 筛选条件：检查该周期的小队是否匹配
          if (searchKeyword) {
            const keyword = searchKeyword.toLowerCase();
            const matchName = theme.name.toLowerCase().includes(keyword);
            const matchTeamName = cycleTeams.some(t => t.name?.toLowerCase().includes(keyword));
            if (!matchName && !matchTeamName) return;
          }

          if (statusFilter !== 'all') {
            // 状态筛选：检查该周期小队的状态
            if (statusFilter !== cycleStatus) return;
          }

          if (stageFilter !== 'all') {
            const targetStage = parseInt(stageFilter);
            const maxStage = Math.max(...cycleTeams.map(t => t.currentStage || 0));
            if (maxStage !== targetStage) return;
          }

          if (cycleFilter !== 'all') {
            if (cycleNum !== parseInt(cycleFilter)) return;
          }

          expanded.push({
            ...theme,
            teams: cycleTeams, // 使用该周期的小队
            status: cycleStatus, // 使用该周期对应的状态
            cycleTeams,
            displayCycle: cycleNum,
            groupKey: `${theme.id}-${cycle}`,
          });
        });
      } else {
        // 没有小队的主题，只在"全部周期"且没有其他筛选时显示
        if (cycleFilter === 'all' && statusFilter === 'all' && stageFilter === 'all') {
          if (searchKeyword) {
            const keyword = searchKeyword.toLowerCase();
            if (!theme.name.toLowerCase().includes(keyword)) return;
          }
          expanded.push({
            ...theme,
            cycleTeams: [],
            displayCycle: 0,
            groupKey: `${theme.id}-0`,
          });
        }
      }
    });

    // 按选择次数降序排列
    return expanded.sort((a, b) => (b.selectionCount || 0) - (a.selectionCount || 0));
  };

  // 筛选主题
  const getFilteredThemes = () => {
    return getExpandedThemes();
  };

  // 获取所有可能的阶段
  const getAvailableStages = () => {
    const stages = new Set<number>();
    themes.forEach(theme => {
      if (theme.activeStage > 0) {
        stages.add(theme.activeStage);
      }
    });
    return Array.from(stages).sort((a, b) => a - b);
  };

  const handleCreateTheme = async () => {
    const errors: typeof newThemeErrors = {};
    
    if (!newTheme.name.trim()) {
      errors.name = '请输入主题名称';
    }
    
    setNewThemeErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      toast.error('请检查表单中的错误项');
      return;
    }

    setIsCreating(true);
    try {
      // 志愿者创建主题时，自动设置为专属主题，归属其服务的学校
      const themeData: any = {
        name: newTheme.name,
        description: newTheme.description,
        icon: newTheme.icon,
        createdBy: admin?.id,
      };
      
      // 志愿者只能创建专属主题
      if (admin?.role === 'volunteer' && admin.school_id) {
        themeData.schoolId = admin.school_id;
        themeData.isExclusive = true;
      } else if (admin?.role === 'admin' || admin?.role === 'super_admin') {
        // 超级管理员默认创建全局主题
        themeData.isExclusive = false;
      }

      const res = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(themeData),
      });

      const data = await res.json();
      if (data.success) {
        // 显示自动配置表单的提示
        if (data.autoConfiguredForms) {
          const { guider, light_mage, secret_scholar } = data.autoConfiguredForms;
          const configuredCount = [guider, light_mage, secret_scholar].filter(Boolean).length;
          if (configuredCount > 0) {
            toast.success(`主题创建成功，已自动配置 ${configuredCount} 个角色的反馈表单`);
          } else {
            toast.success('主题创建成功，请在主题详情中配置反馈表单');
          }
        } else {
          toast.success('主题创建成功');
        }
        setShowCreateDialog(false);
        setNewTheme({ name: '', description: '', icon: '🎯' });
        fetchData();
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch (error) {
      toast.error('创建失败，请稍后重试');
    } finally {
      setIsCreating(false);
    }
  };

  // 下发任务
  const handleAssignTask = async () => {
    if (!assigningTheme) return;
    
    if (selectedTeamIds.size === 0) {
      toast.error('请选择要下发任务的小队');
      return;
    }

    setIsAssigning(true);
    try {
      const res = await fetch('/api/admin/assign-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamIds: Array.from(selectedTeamIds),
          themeId: assigningTheme.id,
          deadline: assignDeadline || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setShowAssignDialog(false);
        setAssigningTheme(null);
        setSelectedTeamIds(new Set());
        setAssignDeadline('');
        fetchData();
      } else {
        toast.error(data.error || '下发失败');
      }
    } catch (error) {
      toast.error('下发失败，请稍后重试');
    } finally {
      setIsAssigning(false);
    }
  };

  // 打开发布任务对话框
  const openAssignDialog = (theme: Theme) => {
    // 只选择还没有任务的小队
    const teamsWithoutTask = theme.teams.filter(t => !t.currentTaskId);
    if (teamsWithoutTask.length === 0) {
      toast.error('该主题下所有小队都已有任务');
      return;
    }
    
    setAssigningTheme(theme);
    setSelectedTeamIds(new Set(teamsWithoutTask.map(t => t.id)));
    setShowAssignDialog(true);
  };

  // 切换小队选择
  const toggleTeamSelection = (teamId: string) => {
    const newSet = new Set(selectedTeamIds);
    if (newSet.has(teamId)) {
      newSet.delete(teamId);
    } else {
      newSet.add(teamId);
    }
    setSelectedTeamIds(newSet);
  };

  const canCreateTheme = () => {
    if (!admin) return false;
    if (admin.role === 'admin' || admin.role === 'super_admin') return true;
    if (admin.role === 'volunteer') return !!admin.school_id;
    return false;
  };

  const iconOptions = ['🎯', '🔬', '🌍', '🌿', '🔭', '🚀', '💡', '🎨', '📚', '🎵', '🏆', '⚡'];

  const filteredThemes = getFilteredThemes();
  const isVolunteer = admin?.role === 'volunteer';

  // 志愿者视图
  if (isVolunteer) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
                <ArrowLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">返回</span>
              </Button>
              <h1 className="text-base sm:text-lg font-bold">任务管理</h1>
            </div>
            {canCreateTheme() && (
              <Button size="sm" onClick={() => {
                setShowCreateDialog(true);
              }}>
                <Plus className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">新建主题</span>
              </Button>
            )}
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-4 md:py-6">
          {/* 筛选栏 - 桌面端 */}
          <Card className="border-0 shadow-sm mb-4 md:mb-6 hidden md:block">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">筛选：</span>
                </div>
                
                {/* 搜索框 */}
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="搜索主题或小队名称..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* 状态筛选 */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="主题状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="unselected">未选择</SelectItem>
                    <SelectItem value="pending_assign">待下发</SelectItem>
                    <SelectItem value="in_progress">执行中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                  </SelectContent>
                </Select>

                {/* 主题性质筛选 */}
                <Select value={themeTypeFilter} onValueChange={setThemeTypeFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="主题性质" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部性质</SelectItem>
                    <SelectItem value="global">全局主题</SelectItem>
                    <SelectItem value="exclusive">专属主题</SelectItem>
                  </SelectContent>
                </Select>

                {/* 阶段筛选 */}
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="任务阶段" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部阶段</SelectItem>
                    <SelectItem value="0">未开始</SelectItem>
                    {getAvailableStages().map(stage => (
                      <SelectItem key={stage} value={stage.toString()}>第{stage}阶段</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 周期筛选 */}
                <Select value={cycleFilter} onValueChange={setCycleFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="任务周期" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部周期</SelectItem>
                    {availableCycles.map(cycle => (
                      <SelectItem key={cycle} value={cycle.toString()}>第{cycle}周期</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={() => {
                  setSearchKeyword('');
                  setStatusFilter('all');
                  setStageFilter('all');
                  setThemeTypeFilter('all');
                  setCycleFilter('all');
                }}>
                  重置
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* 移动端筛选面板 - 直接显示 */}
          <div className="md:hidden mb-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="搜索主题或小队名称..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="unselected">未选择</SelectItem>
                      <SelectItem value="pending_assign">待下发</SelectItem>
                      <SelectItem value="in_progress">执行中</SelectItem>
                      <SelectItem value="completed">已完成</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={themeTypeFilter} onValueChange={setThemeTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="性质" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部性质</SelectItem>
                      <SelectItem value="global">全局主题</SelectItem>
                      <SelectItem value="exclusive">专属主题</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={stageFilter} onValueChange={setStageFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="任务阶段" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部阶段</SelectItem>
                        <SelectItem value="0">未开始</SelectItem>
                        {getAvailableStages().map(stage => (
                          <SelectItem key={stage} value={stage.toString()}>第{stage}阶段</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Select value={cycleFilter} onValueChange={setCycleFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="任务周期" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部周期</SelectItem>
                        {availableCycles.map(cycle => (
                          <SelectItem key={cycle} value={cycle.toString()}>第{cycle}周期</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button variant="outline" onClick={() => {
                  setSearchKeyword('');
                  setStatusFilter('all');
                  setStageFilter('all');
                  setThemeTypeFilter('all');
                  setCycleFilter('all');
                }}>
                  重置
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 主题卡片列表 */}
          {loading ? (
            <div className="text-center py-8 sm:py-12">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mx-auto text-blue-500" />
              <p className="text-gray-500 mt-2 text-sm sm:text-base">加载中...</p>
            </div>
          ) : getFilteredThemes().length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-8 sm:py-12 text-center text-gray-500">
                <p>暂无主题数据</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {getFilteredThemes().map((theme) => {
                // 从展开的主题获取数据
                const expandedTheme = theme as Theme & { cycleTeams: Team[]; displayCycle: number; groupKey: string };
                const teams = expandedTheme.cycleTeams || theme.teams || [];
                const displayCycle = expandedTheme.displayCycle || 0;
                const status = theme.status;
                const totalStages = theme.totalStages;
                const activeStage = Math.max(...teams.map(t => t.currentStage || 0), 0);
                
                // 获取已选择主题但没有任务的小队
                const teamsWithoutTask = teams.filter(t => !t.currentTaskId);
                const hasTeamWithoutTask = teamsWithoutTask.length > 0;
                
                // 状态样式配置
                const statusConfig: Record<string, { 
                  ring: string; 
                  opacity: string;
                  bgGradient: string;
                  badge: React.ReactNode;
                }> = {
                  unselected: {
                    ring: '',
                    opacity: 'opacity-60',
                    bgGradient: 'bg-gray-100',
                    badge: null,
                  },
                  selected: {
                    ring: 'ring-2 ring-blue-200',
                    opacity: '',
                    bgGradient: 'bg-gradient-to-br from-blue-100 to-purple-100',
                    badge: (
                      <Badge className="text-xs bg-blue-100 text-blue-700">
                        已选择
                      </Badge>
                    ),
                  },
                  pending_assign: {
                    ring: 'ring-2 ring-orange-200',
                    opacity: '',
                    bgGradient: 'bg-gradient-to-br from-orange-100 to-yellow-100',
                    badge: (
                      <Badge className="text-xs bg-orange-100 text-orange-700">
                        待下发
                      </Badge>
                    ),
                  },
                  in_progress: {
                    ring: 'ring-2 ring-blue-300',
                    opacity: '',
                    bgGradient: 'bg-gradient-to-br from-blue-100 to-purple-100',
                    badge: (
                      <Badge className="text-xs bg-blue-100 text-blue-700">
                        执行中
                      </Badge>
                    ),
                  },
                  completed: {
                    ring: 'ring-2 ring-green-200',
                    opacity: '',
                    bgGradient: 'bg-gradient-to-br from-green-100 to-emerald-100',
                    badge: (
                      <Badge className="text-xs bg-green-100 text-green-700">
                        已完成
                      </Badge>
                    ),
                  },
                };

                const config = statusConfig[status] || statusConfig.unselected;
                const hasTeams = teams.length > 0;
                
                return (
                  <Card 
                    key={(theme as any).groupKey || theme.id}
                    className={`border-0 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.98] touch-manipulation ${config.ring} ${config.opacity}`}
                    onClick={() => router.push(`/admin/tasks/${theme.id}`)}
                  >
                    <CardContent className="p-3 sm:p-4">
                      {/* 主题头部 */}
                      <div className="flex items-start justify-between mb-2 sm:mb-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-xl sm:text-2xl shrink-0 ${config.bgGradient}`}>
                            {theme.icon || '🎯'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm sm:text-base truncate">{theme.name}</h3>
                              {displayCycle > 0 && (
                                <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                                  第{displayCycle}周期
                                </Badge>
                              )}
                              {theme.is_exclusive ? (
                                <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                                  专属
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                                  全局
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                              {config.badge}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 shrink-0" />
                      </div>

                      {/* 主题描述 */}
                      <p className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3 line-clamp-2">
                        {theme.description || '暂无描述'}
                      </p>

                      {/* 已选择的小队（已选择、待下发、执行中状态显示） */}
                      {hasTeams && status !== 'unselected' && status !== 'completed' && (
                        <div className="mb-2 sm:mb-3 p-1.5 sm:p-2 bg-blue-50 rounded-md sm:rounded-lg">
                          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-blue-700">
                            <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span>已选择的小队：</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {teams.map(team => (
                              <Badge 
                                key={team.id} 
                                variant="outline" 
                                className="text-xs bg-white"
                              >
                                {team.name}
                                {team.currentStage > 0 ? (
                                  <span className="ml-1 text-blue-500">
                                    (第{team.currentStage}阶段)
                                  </span>
                                ) : (
                                  <span className="ml-1 text-orange-500">
                                    (待下发)
                                  </span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 已完成状态显示 */}
                      {status === 'completed' && hasTeams && (
                        <div className="mb-3 p-2 bg-green-50 rounded-lg">
                          <div className="flex items-center gap-2 text-sm text-green-700">
                            <CheckCircle className="w-4 h-4" />
                            <span>已完成所有任务的小队：</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {teams.map(team => (
                              <Badge 
                                key={team.id} 
                                variant="outline" 
                                className="text-xs bg-white text-green-600"
                              >
                                {team.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 进度条（执行中状态显示） */}
                      {status === 'in_progress' && totalStages > 0 && activeStage > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>任务进度</span>
                            <span>{activeStage} / {totalStages} 阶段</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                              style={{ width: `${(activeStage / totalStages) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 待下发任务提示和按钮 */}
                      {status === 'pending_assign' && hasTeamWithoutTask && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-orange-600 p-2 bg-orange-50 rounded-lg">
                            <Clock className="w-4 h-4" />
                            <span>待下发任务：{teamsWithoutTask.map(t => t.name).join('、')}</span>
                          </div>
                          <Button 
                            size="sm" 
                            className="w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAssignDialog(theme);
                            }}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            下发任务
                          </Button>
                        </div>
                      )}

                      {/* 已完成提示 */}
                      {status === 'completed' && (
                        <div className="flex items-center justify-center gap-2 text-sm text-green-600 p-2 bg-green-50 rounded-lg">
                          <CheckCircle className="w-4 h-4" />
                          <span>所有任务已完成</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>

        {/* 下发任务对话框 */}
        {showAssignDialog && assigningTheme && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowAssignDialog(false);
              setAssigningTheme(null);
              setSelectedTeamIds(new Set());
            }}
          >
            <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Send className="w-5 h-5 text-blue-500" />
                    下发任务
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setShowAssignDialog(false);
                      setAssigningTheme(null);
                      setSelectedTeamIds(new Set());
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    主题：<strong>{assigningTheme.icon} {assigningTheme.name}</strong>
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    任务：<strong>第一阶段 · 第一个任务</strong>
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    将为选中的小队下发该主题的第一阶段第一个任务
                  </p>
                </div>

                {/* 选择小队 */}
                <div className="space-y-2">
                  <Label>选择小队</Label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-2">
                    {assigningTheme.teams
                      .filter(t => !t.currentTaskId)
                      .map(team => (
                        <label 
                          key={team.id}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedTeamIds.has(team.id)}
                            onCheckedChange={() => toggleTeamSelection(team.id)}
                          />
                          <span className="text-sm">{team.name}</span>
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    已选择 {selectedTeamIds.size} 个小队
                  </p>
                </div>

                {/* 截止时间 */}
                <div className="space-y-2">
                  <Label htmlFor="deadline">任务截止日期 *</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={assignDeadline}
                    onChange={(e) => setAssignDeadline(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <p className="text-xs text-gray-500">
                    截止时间为当日24:00，设置小队提交任务产出的最后日期
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setShowAssignDialog(false);
                      setAssigningTheme(null);
                      setSelectedTeamIds(new Set());
                    }}
                  >
                    取消
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={handleAssignTask}
                    disabled={isAssigning || selectedTeamIds.size === 0}
                  >
                    {isAssigning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        下发中...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-1" />
                        确认下发
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 创建主题对话框 */}
        {showCreateDialog && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowCreateDialog(false);
              setNewThemeErrors({});
            }}
          >
            <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>新建主题</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setShowCreateDialog(false);
                      setNewThemeErrors({});
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 志愿者创建专属主题提示 */}
                {admin?.role === 'volunteer' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
                    <p className="font-medium">专属主题</p>
                    <p className="text-xs mt-1">创建的主题将归属您服务的学校，仅本校小队可见可选。</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="themeName">主题名称 *</Label>
                  <Input
                    id="themeName"
                    value={newTheme.name}
                    onChange={(e) => {
                      setNewTheme({ ...newTheme, name: e.target.value });
                      if (newThemeErrors.name) {
                        setNewThemeErrors(prev => ({ ...prev, name: undefined }));
                      }
                    }}
                    placeholder="例如：我的家乡"
                    maxLength={50}
                    className={newThemeErrors.name ? 'border-destructive' : ''}
                  />
                  {newThemeErrors.name && (
                    <p className="text-sm text-destructive">{newThemeErrors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="themeDesc">主题描述</Label>
                  <Textarea
                    id="themeDesc"
                    value={newTheme.description}
                    onChange={(e) => setNewTheme({ ...newTheme, description: e.target.value })}
                    placeholder="简要描述主题内容..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>主题图标</Label>
                  <div className="flex flex-wrap gap-2">
                    {iconOptions.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setNewTheme({ ...newTheme, icon })}
                        className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                          newTheme.icon === icon 
                            ? 'bg-blue-500 ring-2 ring-blue-300' 
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setShowCreateDialog(false);
                      setNewThemeErrors({});
                    }}
                  >
                    取消
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={handleCreateTheme}
                    disabled={isCreating}
                  >
                    {isCreating ? '创建中...' : '创建'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // 非志愿者视图（管理员、助学老师）
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">任务管理</h1>
          </div>
          {canCreateTheme() && (
            <Button onClick={() => {
              setShowCreateDialog(true);
            }}>
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">新建主题</span>
              <span className="sm:hidden">新建</span>
            </Button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 筛选栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">筛选：</span>
              </div>
              
              {/* 搜索框 */}
              <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="搜索主题名称..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* 主题性质筛选 */}
              <Select value={themeTypeFilter} onValueChange={setThemeTypeFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="主题性质" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部性质</SelectItem>
                  <SelectItem value="global">全局主题</SelectItem>
                  <SelectItem value="exclusive">专属主题</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={() => {
                setSearchKeyword('');
                setThemeTypeFilter('all');
              }}>
                重置
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 主题列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">全部主题 ({filteredThemes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredThemes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>暂无主题</p>
                {canCreateTheme() && (
                  <p className="text-sm mt-2">点击右上角按钮创建主题</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredThemes.map((theme) => (
                  <div 
                    key={theme.groupKey || theme.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/tasks/${theme.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center text-2xl">
                        {theme.icon || '🎯'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{theme.name}</h3>
                          {theme.is_exclusive ? (
                            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                              专属
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                              全局
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs border-green-300 text-green-600">
                            已选 {theme.selectionCount || 0} 次
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{theme.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 创建主题对话框 */}
      {showCreateDialog && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowCreateDialog(false);
            setNewThemeErrors({});
          }}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>新建主题</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setNewThemeErrors({});
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="themeName">主题名称 *</Label>
                <Input
                  id="themeName"
                  value={newTheme.name}
                  onChange={(e) => {
                    setNewTheme({ ...newTheme, name: e.target.value });
                    if (newThemeErrors.name) {
                      setNewThemeErrors(prev => ({ ...prev, name: undefined }));
                    }
                  }}
                  placeholder="例如：我的家乡"
                  maxLength={50}
                  className={newThemeErrors.name ? 'border-destructive' : ''}
                />
                {newThemeErrors.name && (
                  <p className="text-sm text-destructive">{newThemeErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="themeDesc">主题描述</Label>
                <Textarea
                  id="themeDesc"
                  value={newTheme.description}
                  onChange={(e) => setNewTheme({ ...newTheme, description: e.target.value })}
                  placeholder="简要描述主题内容..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>主题图标</Label>
                <div className="flex flex-wrap gap-2">
                  {iconOptions.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setNewTheme({ ...newTheme, icon })}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                        newTheme.icon === icon 
                          ? 'bg-blue-500 ring-2 ring-blue-300' 
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setNewThemeErrors({});
                  }}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleCreateTheme}
                  disabled={isCreating}
                >
                  {isCreating ? '创建中...' : '创建'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
