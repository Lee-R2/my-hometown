'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  ArrowLeft, Bell, CheckCircle, Clock, MessageSquare, 
  Trophy, Target, AlertCircle, CheckCheck, Loader2,
  ChevronRight, User, FileText, Gift, ExternalLink, Sparkles, Award, Wrench, Shield,
  ArrowUpCircle, ArrowDownCircle, HandCoins, XCircle, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface Notification {
  id: string;
  team_id: string;
  type: string;
  title: string;
  content: string;
  is_read: boolean;
  submission_id?: string;
  task_id?: string;
  reward_id?: string;
  sender_id?: string;
  sender_name?: string;
  extra_data?: any;
  created_at: string;
  // 管理员消息特有字段
  content_type?: string;
  media_url?: string;
  sender_role?: string;
}

interface Team {
  id: string;
  code: string;
  name: string;
  createdBy?: string;
}

interface Volunteer {
  id: string;
  name: string;
  role: string;
}

const NOTIFICATION_TYPES = {
  // 原有类型
  submission_feedback: { label: '审核反馈', icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-100' },
  volunteer_message: { label: '志愿者老师消息', icon: MessageSquare, color: 'text-purple-500', bgColor: 'bg-purple-100' },
  admin_message: { label: '管理员消息', icon: Shield, color: 'text-red-500', bgColor: 'bg-red-100' },
  reward_earned: { label: '获得激励', icon: Gift, color: 'text-amber-500', bgColor: 'bg-amber-100' },
  side_task: { label: '支线任务', icon: Target, color: 'text-green-500', bgColor: 'bg-green-100' },
  system: { label: '系统通知', icon: Bell, color: 'text-gray-500', bgColor: 'bg-gray-100' },
  // 积分转账类型
  transfer_sent: { label: '积分转出', icon: ArrowUpCircle, color: 'text-orange-500', bgColor: 'bg-orange-100' },
  transfer_received: { label: '收到积分', icon: ArrowDownCircle, color: 'text-green-500', bgColor: 'bg-green-100' },
  // 积分借贷类型
  borrow_request: { label: '借积分申请', icon: HandCoins, color: 'text-yellow-500', bgColor: 'bg-yellow-100' },
  borrow_submitted: { label: '借积分申请', icon: HandCoins, color: 'text-yellow-500', bgColor: 'bg-yellow-100' },
  borrow_approved: { label: '借积分通过', icon: CheckCircle, color: 'text-emerald-500', bgColor: 'bg-emerald-100' },
  borrow_rejected: { label: '借积分被拒', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-100' },
  borrow_lent: { label: '借出积分', icon: ArrowUpCircle, color: 'text-orange-500', bgColor: 'bg-orange-100' },
  borrow_repaid: { label: '积分已归还', icon: ArrowUpCircle, color: 'text-orange-500', bgColor: 'bg-orange-100' },
  borrow_received_repay: { label: '收到积分归还', icon: ArrowDownCircle, color: 'text-green-500', bgColor: 'bg-green-100' },
  overdue_reminder: { label: '逾期提醒', icon: AlertTriangle, color: 'text-red-500', bgColor: 'bg-red-100' },
};

export default function MessagesPage() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [adminMessages, setAdminMessages] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [markingRead, setMarkingRead] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  
  // 滚动位置记忆
  useScrollPosition('team-messages');

  useEffect(() => {
    const teamDataStr = localStorage.getItem('team');
    const userDataStr = localStorage.getItem('user'); // 志愿者后台登录存储的是 'user'
    
    if (!teamDataStr) {
      router.push('/');
      return;
    }
    
    const teamData = JSON.parse(teamDataStr);
    setTeam(teamData);
    
    // 获取志愿者信息（从 'user' 键获取，这是志愿者后台登录存储的位置）
    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      // 只有志愿者角色才获取管理员消息
      if (userData.role === 'volunteer') {
        setVolunteer({
          id: userData.id,
          name: userData.name,
          role: userData.role,
        });
      }
    }
  }, [router]);

  useEffect(() => {
    if (team?.id) {
      fetchNotifications();
    }
  }, [team?.id]);

  useEffect(() => {
    if (volunteer?.id) {
      fetchAdminMessages();
    }
  }, [volunteer?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!team?.id) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/team/notifications?teamId=${team.id}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
      } else {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('获取通知失败:', error);
      toast.error('获取通知失败');
    } finally {
      setLoading(false);
    }
  }, [team?.id]);

  const fetchAdminMessages = useCallback(async () => {
    if (!volunteer?.id) return;
    
    try {
      const res = await fetch(`/api/messages?receiverId=${volunteer.id}`);
      const data = await res.json();
      
      if (data.error) {
        console.error('获取管理员消息失败:', data.error);
      } else {
        // 将messages转换为notifications格式
        const convertedMessages: Notification[] = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          team_id: msg.team_id || '',
          type: 'admin_message',
          title: '来自管理员的消息',
          content: msg.content,
          is_read: msg.is_read,
          sender_id: msg.sender_id,
          sender_name: msg.sender_name,
          sender_role: msg.sender_role,
          content_type: msg.content_type,
          media_url: msg.media_url,
          created_at: msg.created_at,
        }));
        setAdminMessages(convertedMessages);
        setAdminUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('获取管理员消息失败:', error);
    }
  }, [volunteer?.id]);

  // 标记单条已读
  const markAsRead = async (notification: Notification) => {
    if (!team && notification.type === 'admin_message' && !volunteer) return;
    if (!team && notification.type !== 'admin_message') return;
    
    setMarkingRead(notification.id);
    try {
      let res;
      if (notification.type === 'admin_message') {
        // 标记管理员消息已读
        res = await fetch(`/api/messages/${notification.id}/read`, {
          method: 'PUT',
        });
      } else {
        // 标记小队通知已读
        res = await fetch(`/api/team/notifications/${notification.id}/read`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team!.id }),
        });
      }

      const data = await res.json();
      if (data.success) {
        if (notification.type === 'admin_message') {
          setAdminMessages(prev => 
            prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
          );
          setAdminUnreadCount(prev => Math.max(0, prev - 1));
        } else {
          setNotifications(prev => 
            prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
          );
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
        toast.success('已标记为已读');
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    } finally {
      setMarkingRead(null);
    }
  };

  // 全部标记已读
  const markAllAsRead = async () => {
    if (!team) return;
    
    try {
      // 标记小队通知已读
      if (notifications.some(n => !n.is_read)) {
        const res = await fetch('/api/team/notifications/read-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id }),
        });

        const data = await res.json();
        if (data.success) {
          setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
          setUnreadCount(0);
        }
      }
      
      // 标记管理员消息已读
      if (volunteer && adminMessages.some(n => !n.is_read)) {
        const unreadAdminMsgs = adminMessages.filter(n => !n.is_read);
        for (const msg of unreadAdminMsgs) {
          await fetch(`/api/messages/${msg.id}/read`, {
            method: 'PUT',
          });
        }
        setAdminMessages(prev => prev.map(n => ({ ...n, is_read: true })));
        setAdminUnreadCount(0);
      }
      
      toast.success('已全部标记为已读');
    } catch (error) {
      toast.error('操作失败');
    }
  };

  // 合并所有消息
  const getAllMessages = () => {
    return [...notifications, ...adminMessages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  // 根据标签过滤通知
  const getFilteredNotifications = () => {
    const allMessages = getAllMessages();
    if (activeTab === 'all') return allMessages;
    if (activeTab === 'unread') return allMessages.filter(n => !n.is_read);
    return allMessages.filter(n => n.type === activeTab);
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // 获取通知类型配置
  const getTypeConfig = (type: string) => {
    return NOTIFICATION_TYPES[type as keyof typeof NOTIFICATION_TYPES] || NOTIFICATION_TYPES.system;
  };

  // 判断是否是雾影博士的消息
  const isWuyingDoctor = (notification: Notification) => {
    return notification.sender_name === '雾影博士' || 
           notification.extra_data?.is_wuying_doctor === true ||
           notification.extra_data?.sender_role === 'teacher';
  };

  // 获取显示用的类型标签
  const getDisplayTypeLabel = (notification: Notification) => {
    if (isWuyingDoctor(notification)) {
      return '雾影博士';
    }
    return getTypeConfig(notification.type).label;
  };

  // 点击通知显示详情
  const handleNotificationClick = (notification: Notification) => {
    // 先标记已读
    if (!notification.is_read) {
      markAsRead(notification);
    }
    
    // 显示详情弹窗
    setSelectedNotification(notification);
    setShowDetailDialog(true);
  };

  // 从详情弹窗跳转到相关页面
  const handleViewDetail = () => {
    if (!selectedNotification) return;
    
    setShowDetailDialog(false);
    
    // 根据类型跳转
    switch (selectedNotification.type) {
      case 'submission_feedback':
        if (selectedNotification.task_id) {
          router.push(`/team/task/${selectedNotification.task_id}`);
        }
        break;
      case 'side_task':
        if (selectedNotification.task_id) {
          router.push(`/team/task/${selectedNotification.task_id}`);
        }
        break;
      case 'reward_earned':
        router.push('/team/rewards');
        break;
      default:
        break;
    }
  };

  // 计算总未读数
  const totalUnreadCount = unreadCount + adminUnreadCount;
  
  const filteredNotifications = getFilteredNotifications();

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 pb-6">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">消息中心</h1>
              {totalUnreadCount > 0 && (
                <Badge className="bg-red-500 text-xs px-2">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </Badge>
              )}
            </div>
          </div>
          {totalUnreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead} className="hidden sm:inline-flex">
              <CheckCheck className="w-4 h-4 mr-1" />
              全部已读
            </Button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <>
            {/* 标签筛选 */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="bg-white/80">
                <TabsTrigger value="all" className="relative">
                  全部
                  {totalUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="unread" className="relative">
                  未读
                  {totalUnreadCount > 0 && (
                    <Badge className="ml-1 h-4 px-1 text-xs bg-red-500">
                      {totalUnreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="admin_message" className="relative">
                  管理员消息
                  {adminUnreadCount > 0 && (
                    <Badge className="ml-1 h-4 px-1 text-xs bg-red-500">
                      {adminUnreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="submission_feedback">审核反馈</TabsTrigger>
                <TabsTrigger value="volunteer_message">志愿者老师消息</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* 消息列表 */}
            {filteredNotifications.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-16">
                  <div className="text-center text-gray-500">
                    <Bell className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>
                      {activeTab === 'all' ? '暂无消息' : 
                       activeTab === 'unread' ? '没有未读消息' :
                       '暂无此类消息'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => {
                  const typeConfig = getTypeConfig(notification.type);
                  const Icon = typeConfig.icon;
                  
                  return (
                    <Card 
                      key={notification.id}
                      className={`border-0 shadow-md cursor-pointer transition-all hover:shadow-lg ${
                        notification.is_read ? 'bg-gray-50' : 'bg-white ring-2 ring-orange-200'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* 类型图标 */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isWuyingDoctor(notification) ? 'bg-indigo-100' : typeConfig.bgColor}`}>
                            {isWuyingDoctor(notification) ? (
                              <Sparkles className="w-5 h-5 text-indigo-500" />
                            ) : (
                              <Icon className={`w-5 h-5 ${typeConfig.color}`} />
                            )}
                          </div>
                          
                          {/* 内容 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {!notification.is_read && (
                                <span className="w-2 h-2 bg-red-500 rounded-full" />
                              )}
                              <span className="text-xs text-gray-400">
                                {formatTime(notification.created_at)}
                              </span>
                              <Badge variant="outline" className={`text-xs ${isWuyingDoctor(notification) ? 'border-indigo-300 text-indigo-600' : ''}`}>
                                {getDisplayTypeLabel(notification)}
                              </Badge>
                            </div>
                            
                            <h3 className="font-medium text-gray-900 mb-1">
                              {notification.title}
                            </h3>
                            
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {notification.content}
                            </p>
                            
                            {/* 发送人 */}
                            {notification.sender_name && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                                <User className="w-3 h-3" />
                                <span>{notification.sender_name}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* 操作按钮 */}
                          <div className="flex flex-col items-end gap-2">
                            {!notification.is_read && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification);
                                }}
                                disabled={markingRead === notification.id}
                              >
                                {markingRead === notification.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* 消息详情弹窗 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          {selectedNotification && (() => {
            const typeConfig = getTypeConfig(selectedNotification.type);
            const Icon = typeConfig.icon;
            const isDoctor = isWuyingDoctor(selectedNotification);
            
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDoctor ? 'bg-indigo-100' : typeConfig.bgColor}`}>
                      {isDoctor ? (
                        <Sparkles className="w-6 h-6 text-indigo-500" />
                      ) : (
                        <Icon className={`w-6 h-6 ${typeConfig.color}`} />
                      )}
                    </div>
                    <div>
                      <DialogTitle className="text-lg">
                        {selectedNotification.title}
                      </DialogTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${isDoctor ? 'border-indigo-300 text-indigo-600' : ''}`}>
                          {getDisplayTypeLabel(selectedNotification)}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {formatTime(selectedNotification.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  {/* 发送人 */}
                  {selectedNotification.sender_name && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User className="w-4 h-4" />
                      <span>发送人：{selectedNotification.sender_name}</span>
                    </div>
                  )}
                  
                  {/* 消息内容 */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {selectedNotification.content}
                    </p>
                  </div>
                  
                  {/* 支线任务详情 */}
                  {selectedNotification.type === 'side_task' && selectedNotification.extra_data && (
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <h4 className="font-medium text-green-800 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        支线任务详情
                      </h4>
                      {selectedNotification.extra_data.task_name && (
                        <div className="mb-2">
                          <span className="text-sm text-gray-500">任务名称：</span>
                          <span className="text-sm font-medium">{selectedNotification.extra_data.task_name}</span>
                        </div>
                      )}
                      {selectedNotification.extra_data.task_description && (
                        <div>
                          <span className="text-sm text-gray-500">任务说明：</span>
                          <p className="text-sm mt-1 text-gray-700">
                            {selectedNotification.extra_data.task_description}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 激励详情 */}
                  {selectedNotification.type === 'reward_earned' && selectedNotification.extra_data?.rewards && (
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
                        <Gift className="w-4 h-4" />
                        获得的激励
                      </h4>
                      <div className="space-y-2">
                        {selectedNotification.extra_data.rewards.map((reward: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 bg-white rounded-lg p-3">
                            {reward.type === 'badge' && (
                              <div className="flex items-center gap-2">
                                <Award className="w-5 h-5 text-yellow-500" />
                                <span className="text-sm">徽章：{reward.name}</span>
                              </div>
                            )}
                            {reward.type === 'gem' && (
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-500" />
                                <span className="text-sm">宝石：{reward.name} x{reward.quantity || 1}</span>
                              </div>
                            )}
                            {reward.type === 'skill_card' && (
                              <div className="flex items-center gap-2">
                                <Target className="w-5 h-5 text-blue-500" />
                                <span className="text-sm">隐藏技能卡：{reward.name}</span>
                              </div>
                            )}
                            {reward.type === 'tool_card' && (
                              <div className="flex items-center gap-2">
                                <Wrench className="w-5 h-5 text-green-500" />
                                <span className="text-sm">隐藏工具卡：{reward.name}</span>
                              </div>
                            )}
                            {reward.type === 'achievement' && (
                              <div className="flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-orange-500" />
                                <span className="text-sm">成就：{reward.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 审核反馈详情 */}
                  {selectedNotification.type === 'submission_feedback' && selectedNotification.extra_data && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        审核结果
                      </h4>
                      {selectedNotification.extra_data.status && (
                        <div className="mb-2">
                          <span className="text-sm text-gray-500">审核状态：</span>
                          <Badge className={
                            selectedNotification.extra_data.status === 'approved' ? 'bg-green-500 ml-2' :
                            selectedNotification.extra_data.status === 'excellent' ? 'bg-amber-500 ml-2' :
                            'bg-red-500 ml-2'
                          }>
                            {selectedNotification.extra_data.status === 'approved' ? '合格' :
                             selectedNotification.extra_data.status === 'excellent' ? '优秀' : '需修改'}
                          </Badge>
                        </div>
                      )}
                      {selectedNotification.extra_data.feedback && (
                        <div>
                          <span className="text-sm text-gray-500">审核意见：</span>
                          <p className="text-sm mt-1 text-gray-700">
                            {selectedNotification.extra_data.feedback}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 管理员消息详情 */}
                  {selectedNotification.type === 'admin_message' && (
                    <div className={`${isDoctor ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'} rounded-lg p-4 border`}>
                      <h4 className={`font-medium ${isDoctor ? 'text-indigo-800' : 'text-red-800'} mb-3 flex items-center gap-2`}>
                        {isDoctor ? <Sparkles className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        {isDoctor ? '来自雾影博士的消息' : '来自管理员的消息'}
                      </h4>
                      {selectedNotification.sender_role && !isDoctor && (
                        <div className="mb-2 text-sm text-gray-600">
                          发送者角色：
                          <Badge className="ml-2 bg-red-500">
                            {(selectedNotification.sender_role === 'admin' || selectedNotification.sender_role === 'super_admin') ? '超级管理员' : 
                             selectedNotification.sender_role === 'volunteer' ? '志愿者' : 
                             selectedNotification.sender_role}
                          </Badge>
                        </div>
                      )}
                      {isDoctor && selectedNotification.sender_name && (
                        <div className="mb-2 text-sm text-indigo-700">
                          发送人：
                          <Badge className="ml-2 bg-indigo-500">
                            {selectedNotification.sender_name}
                          </Badge>
                        </div>
                      )}
                      {selectedNotification.media_url && selectedNotification.content_type === 'image' && (
                        <div className="mt-3">
                          <img 
                            src={selectedNotification.media_url} 
                            alt="消息图片" 
                            className="max-w-full rounded-lg"
                          />
                        </div>
                      )}
                      {selectedNotification.media_url && selectedNotification.content_type === 'video' && (
                        <div className="mt-3">
                          <video 
                            src={selectedNotification.media_url} 
                            controls 
                            className="max-w-full rounded-lg"
                          />
                        </div>
                      )}
                      {selectedNotification.media_url && selectedNotification.content_type === 'link' && (
                        <div className="mt-3">
                          <a 
                            href={selectedNotification.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-4 h-4" />
                            查看链接
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 志愿者/雾影博士消息详情（含多媒体） */}
                  {selectedNotification.type === 'volunteer_message' && selectedNotification.extra_data?.media_url && (
                    <div className={`${isDoctor ? 'bg-indigo-50 border-indigo-200' : 'bg-purple-50 border-purple-200'} rounded-lg p-4 border`}>
                      <h4 className={`font-medium ${isDoctor ? 'text-indigo-800' : 'text-purple-800'} mb-3 flex items-center gap-2`}>
                        {isDoctor ? <Sparkles className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                        {isDoctor ? '来自雾影博士的消息' : '附件内容'}
                      </h4>
                      {selectedNotification.extra_data.media_url && selectedNotification.extra_data.content_type === 'image' && (
                        <div className="mt-2">
                          <img 
                            src={selectedNotification.extra_data.media_url} 
                            alt="消息图片" 
                            className="max-w-full rounded-lg"
                          />
                        </div>
                      )}
                      {selectedNotification.extra_data.media_url && selectedNotification.extra_data.content_type === 'video' && (
                        <div className="mt-2">
                          <video 
                            src={selectedNotification.extra_data.media_url} 
                            controls 
                            className="max-w-full rounded-lg"
                          />
                        </div>
                      )}
                      {selectedNotification.extra_data.media_url && selectedNotification.extra_data.content_type === 'link' && (
                        <div className="mt-2">
                          <a 
                            href={selectedNotification.extra_data.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-4 h-4" />
                            查看链接
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <DialogFooter>
                  {(selectedNotification.type === 'submission_feedback' || 
                    selectedNotification.type === 'side_task' ||
                    selectedNotification.type === 'reward_earned') && (
                    <Button onClick={handleViewDetail} className="gap-2">
                      <ExternalLink className="w-4 h-4" />
                      查看详情
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                    关闭
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
