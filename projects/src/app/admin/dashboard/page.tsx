'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, FileText, Settings, 
  MessageCircle, Award, Shield,
  Clock, CheckCircle, AlertCircle, Building, UserPlus, UserCheck,
  Wrench, BookOpen, School, Info, User, ClipboardList, MessageSquare,
  Bell, X, Plus, Newspaper, ShoppingBag
} from 'lucide-react';
import { toast } from 'sonner';
import AdminBlackboardSection from '@/components/admin-blackboard-section';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';
import { 
  RoleType, 
  PermissionLevel,
  RoleConfig,
  MODULES,
  PERMISSION_LEVELS,
  DEFAULT_ROLE_CONFIGS,
  fetchRoleConfigs,
  clearPermissionsCache,
} from '@/lib/permissions';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
  school_name?: string;
}

// 图标映射
const iconMap: Record<string, React.ElementType> = {
  FileText,
  Users,
  Clock,
  Building,
  UserPlus,
  UserCheck,
  'follow-verifies': UserCheck,
  Wrench,
  BookOpen,
  MessageCircle,
  Award,
  Settings,
  ClipboardList,
  MessageSquare,
  Newspaper,
  ShoppingBag,
};

// 颜色映射
const colorMap: Record<string, { color: string; bgColor: string }> = {
  tasks: { color: 'text-green-500', bgColor: 'bg-green-100' },
  'final-tasks': { color: 'text-amber-500', bgColor: 'bg-amber-100' },
  teams: { color: 'text-blue-500', bgColor: 'bg-blue-100' },
  submissions: { color: 'text-orange-500', bgColor: 'bg-orange-100' },
  schools: { color: 'text-indigo-500', bgColor: 'bg-indigo-100' },
  volunteers: { color: 'text-teal-500', bgColor: 'bg-teal-100' },
  tools: { color: 'text-cyan-500', bgColor: 'bg-cyan-100' },
  skills: { color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-100' },
  messages: { color: 'text-purple-500', bgColor: 'bg-purple-100' },
  rewards: { color: 'text-yellow-500', bgColor: 'bg-yellow-100' },
  feedback: { color: 'text-rose-500', bgColor: 'bg-rose-100' },
  blackboard: { color: 'text-pink-500', bgColor: 'bg-pink-100' },
  'follow-verifies': { color: 'text-violet-500', bgColor: 'bg-violet-100' },
  settings: { color: 'text-gray-500', bgColor: 'bg-gray-100' },
};

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [roleConfig, setRoleConfig] = useState<RoleConfig | null>(null);
  const [stats, setStats] = useState({
    totalTeams: 0,
    pendingSubmissions: 0,
    approvedSubmissions: 0,
    rejectedSubmissions: 0,
    totalStudents: 0,
    totalVolunteers: 0,
    totalSchools: 0,
  });
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [taskHints, setTaskHints] = useState<any[]>([]);
  const [pendingFollows, setPendingFollows] = useState(0);
  const [showTaskHintsPopover, setShowTaskHintsPopover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastPermissionUpdate, setLastPermissionUpdate] = useState<number>(0);
  
  // 滚动位置记忆
  useScrollPosition('admin-dashboard');
  
  // 响应式布局
  const responsive = useResponsive();

  // 导航函数
  const navigate = (path: string) => {
    window.location.href = path;
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          // 加载角色权限配置（强制刷新，获取最新配置）
          loadRoleConfig(data.user.role as RoleType, true);
          // 获取数据（传递用户ID和角色）
          fetchDashboardData(data.user.id, data.user.role);
        } else {
          window.location.href = '/admin/login';
        }
      } catch {
        window.location.href = '/admin/login';
      }
    };
    fetchUser();
    
    // 设置权限同步定时器（每30秒检查一次）
    const permissionSyncInterval = setInterval(async () => {
      try {
        // 检查权限更新时间戳
        const res = await fetch(`/api/sync?userId=${user?.id}&userRole=${user?.role}`);
        const data = await res.json();
        
        if (data.success && data.status?.permissions) {
          const serverPermissionTime = data.status.permissions;
          // 如果服务器权限更新时间比本地记录的新，则刷新权限配置
          if (serverPermissionTime > lastPermissionUpdate) {
            console.log('检测到权限更新，刷新配置...');
            clearPermissionsCache();
            const configs = await fetchRoleConfigs();
            const config = configs.find(c => c.role === user?.role);
            if (config) {
              setRoleConfig(config);
              setLastPermissionUpdate(serverPermissionTime);
            }
          }
        }
      } catch (error) {
        console.error('权限同步失败:', error);
      }
    }, 30000); // 30秒
    
    return () => {
      clearInterval(permissionSyncInterval);
    };
  }, [lastPermissionUpdate]);

  const loadRoleConfig = async (role: RoleType, forceRefresh: boolean = false) => {
    // 如果强制刷新，先清除缓存
    if (forceRefresh) {
      clearPermissionsCache();
    }
    // 从 API 获取权限配置
    const configs = await fetchRoleConfigs();
    const config = configs.find(c => c.role === role);
    setRoleConfig(config || DEFAULT_ROLE_CONFIGS.find(c => c.role === role) || null);
  };

  const fetchDashboardData = async (userId: string, userRole: string) => {
    setLoading(true);
    try {
      // 同时获取统计数据和权限更新时间戳
      const [statsRes, syncRes] = await Promise.all([
        fetch(`/api/admin/stats?userId=${userId}&userRole=${userRole}`),
        fetch(`/api/sync?userId=${userId}&userRole=${userRole}`)
      ]);
      
      const statsData = await statsRes.json();
      const syncData = await syncRes.json();
      
      if (statsData.success) {
        setStats(statsData.stats);
      }
      
      // 记录权限更新时间戳
      if (syncData.success && syncData.status?.permissions) {
        setLastPermissionUpdate(syncData.status.permissions);
      }

      // 如果是志愿者或助学老师，获取未读消息数量
      if (userRole === 'volunteer' || userRole === 'teacher') {
        const msgRes = await fetch(`/api/messages?receiverId=${userId}`);
        const msgData = await msgRes.json();
        if (msgData.unreadCount !== undefined) {
          setUnreadMessages(msgData.unreadCount);
        }
      }
      
      // 获取待审核关注申请数量（管理员和助学老师可见）
      if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'teacher') {
        try {
          const followsRes = await fetch(`/api/admin/follows?userRole=${userRole}&schoolId=${user?.school_id || ''}`);
          const followsData = await followsRes.json();
          if (followsData.success && followsData.follows) {
            const pendingItems = followsData.follows.filter((f: any) => f.status === 'pending');
            setPendingFollows(pendingItems.length);
          }
        } catch (error) {
          console.error('获取待审核关注失败:', error);
        }
      }
      
      // 如果是志愿者，获取任务提示气泡数据
      if (userRole === 'volunteer') {
        await fetchTaskHints(userId);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
      toast.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取任务提示气泡数据（仅志愿者）
  const fetchTaskHints = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/tasks/hints?userId=${userId}`);
      const data = await res.json();
      
      if (data.success) {
        setTaskHints(data.hints || []);
      }
    } catch (error) {
      console.error('获取任务提示失败:', error);
    }
  };

  // 标记任务提示为已读
  const markTaskHintsAsRead = async () => {
    if (taskHints.length === 0 || !user) return;
    
    try {
      await fetch('/api/admin/tasks/hints/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          hintIds: taskHints.map(h => h.id)
        })
      });
      
      setTaskHints([]);
      setShowTaskHintsPopover(false);
    } catch (error) {
      console.error('标记任务提示已读失败:', error);
    }
  };

  const handleLogout = () => {
    // 清空蜡象助手对话历史和会话ID，保证退出再进入是新对话
    if (user?.id) {
      sessionStorage.removeItem(`laxiang_messages_${user.id}`);
      sessionStorage.removeItem(`laxiang_session_${user.id}`);
    }
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  // 根据权限过滤菜单项
  const getFilteredMenuItems = () => {
    if (!roleConfig) return [];

    return MODULES.filter(module => {
      const permission = roleConfig.permissions.find(p => p.moduleId === module.id);
      return permission?.level !== 'none' && permission?.level !== undefined;
    }).map(module => {
      const permission = roleConfig.permissions.find(p => p.moduleId === module.id);
      const level = permission?.level || 'read';
      const colors = colorMap[module.id] || { color: 'text-gray-500', bgColor: 'bg-gray-100' };
      
      // 计算badge
      let badge: number | undefined;
      if (module.id === 'submissions' && stats.pendingSubmissions > 0) {
        badge = stats.pendingSubmissions;
      } else if (module.id === 'messages' && unreadMessages > 0) {
        badge = unreadMessages;
      } else if (module.id === 'tasks' && taskHints.length > 0) {
        badge = taskHints.length;
      } else if (module.id === 'follow-verifies' && pendingFollows > 0) {
        badge = pendingFollows;
      }
      
      // 根据角色动态设置消息管理模块的描述
      let description = module.description;
      if (module.id === 'messages') {
        if (user?.role === 'admin' || user?.role === 'super_admin') {
          description = '用于向志愿者、小队及助学老师发送消息';
        } else {
          description = '用于接收及发送消息';
        }
      }
      
      return {
        id: module.id,
        icon: iconMap[module.icon] || FileText,
        title: module.name,
        description: description,
        href: module.href,
        color: colors.color,
        bgColor: colors.bgColor,
        permissionLevel: level,
        badge: badge,
        hints: module.id === 'tasks' ? taskHints : [],
      };
    });
  };

  const menuItems = getFilteredMenuItems();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">管理后台</h1>
              <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                  {(user?.role === 'admin' || user?.role === 'super_admin') ? '超级管理员' : 
                   user?.role === 'volunteer' ? '志愿者' : '助学老师'}
                </Badge>
                <span className="truncate">{user?.name || user?.username}</span>
              </p>
            </div>
          </div>
          
          {/* 桌面端按钮 */}
          <div className="hidden sm:flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/profile')}>
              <User className="w-4 h-4 mr-1" />
              个人中心
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </div>
          
          {/* 移动端按钮 */}
          <div className="flex sm:hidden items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/profile')}>
              <User className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 权限提示 */}
        {user?.role !== 'admin' && user?.role !== 'super_admin' && roleConfig && (
          <Card className="border-0 shadow-sm mb-4 md:mb-6 bg-blue-50 border-blue-200">
            <CardContent className="py-3 md:py-4">
              <div className="flex items-start gap-2 md:gap-3">
                <Info className="w-4 h-4 md:w-5 md:h-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-blue-800 text-sm md:text-base">当前角色：{roleConfig.name}</p>
                  <p className="text-xs md:text-sm text-blue-600 mt-1">{roleConfig.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 数据面板 */}
        <Card className="border-0 shadow-sm mb-4 md:mb-6">
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="text-sm md:text-base">数据面板</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {(user?.role === 'admin' || user?.role === 'super_admin') ? '平台整体运营数据概览' : 
               user?.role === 'volunteer' ? '您指导的小队数据概览' : '您所带年级/班级的小队数据概览'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`grid ${responsive.spacing.cardGap} ${
              (user?.role === 'admin' || user?.role === 'super_admin')
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' 
                : 'grid-cols-2 sm:grid-cols-4'
            }`}>
              <div className="flex flex-col items-center text-center p-2 md:p-3 rounded-lg bg-blue-50">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-100 rounded-lg md:rounded-xl flex items-center justify-center mb-1 md:mb-2">
                  <Users className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                </div>
                <p className="text-xl md:text-2xl font-bold">{loading ? '-' : stats.totalTeams}</p>
                <p className="text-xs text-gray-500">小队总数</p>
              </div>

              <div className="flex flex-col items-center text-center p-2 md:p-3 rounded-lg bg-orange-50">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-100 rounded-lg md:rounded-xl flex items-center justify-center mb-1 md:mb-2">
                  <Clock className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
                </div>
                <p className="text-xl md:text-2xl font-bold text-orange-600">{loading ? '-' : stats.pendingSubmissions}</p>
                <p className="text-xs text-gray-500">待审核产出</p>
              </div>

              <div className="flex flex-col items-center text-center p-2 md:p-3 rounded-lg bg-green-50">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-green-100 rounded-lg md:rounded-xl flex items-center justify-center mb-1 md:mb-2">
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                </div>
                <p className="text-xl md:text-2xl font-bold text-green-600">{loading ? '-' : stats.approvedSubmissions}</p>
                <p className="text-xs text-gray-500">已通过产出</p>
              </div>

              {(user?.role === 'admin' || user?.role === 'super_admin') && (
                <>
                  <div className="flex flex-col items-center text-center p-2 md:p-3 rounded-lg bg-purple-50">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-100 rounded-lg md:rounded-xl flex items-center justify-center mb-1 md:mb-2">
                      <UserPlus className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
                    </div>
                    <p className="text-xl md:text-2xl font-bold">{loading ? '-' : stats.totalVolunteers}</p>
                    <p className="text-xs text-gray-500">志愿者总数</p>
                  </div>
                </>
              )}

              <div className="flex flex-col items-center text-center p-2 md:p-3 rounded-lg bg-cyan-50">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-cyan-100 rounded-lg md:rounded-xl flex items-center justify-center mb-1 md:mb-2">
                  <Users className="w-4 h-4 md:w-5 md:h-5 text-cyan-500" />
                </div>
                <p className="text-xl md:text-2xl font-bold">{loading ? '-' : stats.totalStudents}</p>
                <p className="text-xs text-gray-500">{user?.role === 'volunteer' ? '服务学生数' : user?.role === 'teacher' ? '学生总数' : '学生总数'}</p>
              </div>

              {(user?.role === 'admin' || user?.role === 'super_admin') && (
                <div className="flex flex-col items-center text-center p-2 md:p-3 rounded-lg bg-pink-50">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-pink-100 rounded-lg md:rounded-xl flex items-center justify-center mb-1 md:mb-2">
                    <School className="w-4 h-4 md:w-5 md:h-5 text-pink-500" />
                  </div>
                  <p className="text-xl md:text-2xl font-bold">{loading ? '-' : stats.totalSchools}</p>
                  <p className="text-xs text-gray-500">学校总数</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 家乡黑板报 */}
        <AdminBlackboardSection userRole={user?.role} userId={user?.id} userName={user?.name} schoolName={user?.school_name} />

        <div className="h-4" />

        {/* 功能菜单 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">功能菜单</CardTitle>
            <CardDescription>选择要管理的功能模块</CardDescription>
          </CardHeader>
          <CardContent>
            {menuItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>您当前没有可访问的功能模块</p>
                <p className="text-sm mt-1">请联系管理员分配权限</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {menuItems.map((item, idx) => (
                  <div key={idx} className="relative">
                    <Card 
                      className="cursor-pointer hover:shadow-md transition-shadow border active:scale-[0.98] touch-manipulation"
                      onClick={() => {
                        // 如果是任务管理卡片且有提示且气泡未展开，展开气泡
                        if (item.id === 'tasks' && item.hints && item.hints.length > 0 && !showTaskHintsPopover) {
                          setShowTaskHintsPopover(true);
                        } else {
                          // 否则直接进入任务管理页面
                          navigate(item.href);
                        }
                      }}
                    >
                      <CardContent className="pt-3 md:pt-4">
                        <div className="flex items-start gap-2 md:gap-3">
                          <div className={`w-8 h-8 md:w-10 md:h-10 ${item.bgColor} rounded-lg flex items-center justify-center shrink-0`}>
                            <item.icon className={`w-4 h-4 md:w-5 md:h-5 ${item.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm md:text-base">{item.title}</h3>
                              {item.badge && item.badge > 0 && (
                                <Badge className="bg-red-500 text-xs">{item.badge}</Badge>
                              )}
                            </div>
                            <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 line-clamp-2">{item.description}</p>
                            <div className="mt-1.5 md:mt-2">
                              <Badge className={`text-xs ${
                                item.permissionLevel === 'read' ? 'bg-blue-100 text-blue-600' :
                                item.permissionLevel === 'write' ? 'bg-green-100 text-green-600' : 
                                'bg-purple-100 text-purple-600'
                              }`}>
                                {PERMISSION_LEVELS[item.permissionLevel as PermissionLevel]?.label || '只读'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* 任务管理提示气泡弹出框 */}
                    {item.id === 'tasks' && item.hints && item.hints.length > 0 && showTaskHintsPopover && (
                      <div 
                        className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Bell className="w-4 h-4 text-green-600" />
                              <span className="font-medium text-sm text-gray-800">新小队选择主题提醒</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowTaskHintsPopover(false);
                                markTaskHintsAsRead();
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="max-h-60 overflow-y-auto">
                          {item.hints.map((hint: any, hintIdx: number) => (
                            <div 
                              key={hint.id}
                              className={`p-3 border-b border-gray-100 last:border-0 ${
                                hintIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <Users className="w-3 h-3 text-green-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700">{hint.content}</p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    {new Date(hint.createdAt).toLocaleString('zh-CN', {
                                      month: 'numeric',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
