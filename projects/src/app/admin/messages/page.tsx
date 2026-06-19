'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { 
  ArrowLeft, Send, Users, Image, Video, Link2, FileText,
  Upload, X, Loader2, CheckCircle2, User, GraduationCap, Search, Filter,
  Bell, CheckCircle, ChevronRight, Shield, ExternalLink, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface User {
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
  school_id: string;
  schoolName: string;
}

interface Recipient {
  id: string;
  name: string;
  schoolName?: string;
  school_id?: string;
}

interface School {
  id: string;
  name: string;
}

interface ReceivedMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  is_read: boolean;
  created_at: string;
  content_type: string;
  media_url: string | null;
}

type ContentType = 'text' | 'image' | 'video' | 'link';
type TargetType = 'team' | 'volunteer' | 'teacher';

const contentTypeConfig: Record<ContentType, { label: string; icon: React.ReactNode; placeholder: string }> = {
  text: { label: '文字消息', icon: <FileText className="w-4 h-4" />, placeholder: '输入要发送的消息内容...' },
  image: { label: '图片消息', icon: <Image className="w-4 h-4" />, placeholder: '图片描述（可选）' },
  video: { label: '视频消息', icon: <Video className="w-4 h-4" />, placeholder: '视频描述（可选）' },
  link: { label: '链接消息', icon: <Link2 className="w-4 h-4" />, placeholder: '链接描述（可选）' },
};

const targetTypeConfig: Record<TargetType, { label: string; icon: React.ReactNode; description: string }> = {
  team: { 
    label: '小队', 
    icon: <Users className="w-4 h-4" />, 
    description: '发送给小队全体成员' 
  },
  volunteer: { 
    label: '志愿者', 
    icon: <User className="w-4 h-4" />, 
    description: '发送给授课志愿者' 
  },
  teacher: { 
    label: '助学老师', 
    icon: <GraduationCap className="w-4 h-4" />, 
    description: '发送给助学老师' 
  },
};

export default function AdminMessagesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [volunteers, setVolunteers] = useState<Recipient[]>([]);
  const [teachers, setTeachers] = useState<Recipient[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // 收到的消息相关状态
  const [receivedMessages, setReceivedMessages] = useState<ReceivedMessage[]>([]);
  const [receivedUnreadCount, setReceivedUnreadCount] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ReceivedMessage | null>(null);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  
  // 标签页状态
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('receive');
  
  // 滚动位置记忆
  useScrollPosition('admin-messages');
  
  // 发送对象类型
  const [targetType, setTargetType] = useState<TargetType>('team');
  
  // 搜索和筛选
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('all');
  
  // 选择相关
  const [selectAll, setSelectAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // 消息内容
  const [contentType, setContentType] = useState<ContentType>('text');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  // 发送身份（志愿者可选是否以"雾影博士"身份发送）
  const [sendAsWuyingDoctor, setSendAsWuyingDoctor] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          const userData = data.user;
          setUser(userData);
          fetchRecipients(userData);
          // 如果是志愿者或助学老师，获取收到的消息
          if (userData.role === 'volunteer' || userData.role === 'teacher') {
            fetchReceivedMessages(userData.id);
            setActiveTab('receive'); // 默认显示收到的消息
          } else {
            setActiveTab('send'); // 超级管理员默认显示发送消息
          }
        } else {
          router.push('/admin/login');
        }
      } catch {
        router.push('/admin/login');
      }
    };
    fetchUser();
  }, [router]);

  // 获取收到的消息
  const fetchReceivedMessages = async (userId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?receiverId=${userId}`);
      const data = await res.json();
      
      if (data.messages) {
        setReceivedMessages(data.messages);
        setReceivedUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('获取消息失败:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  // 标记消息已读
  const markMessageAsRead = async (messageId: string) => {
    setMarkingReadId(messageId);
    try {
      const res = await fetch(`/api/messages/${messageId}/read`, {
        method: 'PUT',
      });
      const data = await res.json();
      
      if (data.success) {
        setReceivedMessages(prev => 
          prev.map(m => m.id === messageId ? { ...m, is_read: true } : m)
        );
        setReceivedUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('标记已读失败:', error);
    } finally {
      setMarkingReadId(null);
    }
  };

  // 查看消息详情
  const handleViewMessage = (message: ReceivedMessage) => {
    setSelectedMessage(message);
    setShowMessageDialog(true);
    if (!message.is_read) {
      markMessageAsRead(message.id);
    }
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

  const fetchRecipients = async (userData: User) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'sendable-recipients',
        userId: userData.id,
        userRole: userData.role,
      });
      if (userData.school_id) {
        params.append('schoolId', userData.school_id);
      }

      const res = await fetch(`/api/messages?${params.toString()}`);
      const data = await res.json();
      
      if (data.teams) {
        setTeams(data.teams);
      }
      if (data.volunteers) {
        setVolunteers(data.volunteers);
      }
      if (data.teachers) {
        setTeachers(data.teachers);
      }
      if (data.schools) {
        setSchools(data.schools);
      }
    } catch (error) {
      console.error('获取接收对象列表失败:', error);
      toast.error('获取接收对象列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取当前类型的原始接收对象列表
  const getCurrentRecipients = () => {
    switch (targetType) {
      case 'team':
        return teams;
      case 'volunteer':
        return volunteers;
      case 'teacher':
        return teachers;
      default:
        return [];
    }
  };

  // 根据搜索和筛选条件过滤接收对象
  const getFilteredRecipients = () => {
    const recipients = getCurrentRecipients();
    return recipients.filter(r => {
      // 按学校筛选
      if (selectedSchoolId !== 'all' && r.school_id !== selectedSchoolId) {
        return false;
      }
      // 按关键词搜索（名称或学校名）
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase();
        const nameMatch = r.name.toLowerCase().includes(keyword);
        const schoolMatch = r.schoolName?.toLowerCase().includes(keyword);
        return nameMatch || schoolMatch;
      }
      return true;
    });
  };

  // 切换发送对象类型时重置选择和筛选
  const handleTargetTypeChange = (type: TargetType) => {
    setTargetType(type);
    setSelectedIds([]);
    setSelectAll(false);
    setSearchKeyword('');
    setSelectedSchoolId('all');
  };

  // 全选/取消全选（仅对当前筛选结果生效）
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    const filteredRecipients = getFilteredRecipients();
    if (checked) {
      setSelectedIds(filteredRecipients.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  // 切换单个选择
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        setSelectAll(false);
        return prev.filter(i => i !== id);
      } else {
        const newSelected = [...prev, id];
        const filteredRecipients = getFilteredRecipients();
        if (newSelected.length === filteredRecipients.length) {
          setSelectAll(true);
        }
        return newSelected;
      }
    });
  };

  // 快速选择筛选结果
  const handleSelectFiltered = () => {
    const filteredRecipients = getFilteredRecipients();
    const filteredIds = filteredRecipients.map(r => r.id);
    setSelectedIds(prev => {
      const newSet = new Set([...prev, ...filteredIds]);
      return Array.from(newSet);
    });
    toast.success(`已添加 ${filteredIds.length} 个${targetTypeConfig[targetType].label}到选择列表`);
  };

  // 清空选择
  const handleClearSelection = () => {
    setSelectedIds([]);
    setSelectAll(false);
  };

  // 图片上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('仅支持 JPG、PNG、GIF、WebP 格式的图片');
      return;
    }

    // 验证文件大小
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setMediaUrl(data.url);
        toast.success('图片上传成功');
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch (error) {
      console.error('上传错误:', error);
      toast.error('图片上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 视频上传
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('仅支持 MP4、WebM、MOV、AVI 格式的视频');
      return;
    }

    // 验证文件大小
    if (file.size > 100 * 1024 * 1024) {
      toast.error('视频大小不能超过 100MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload?type=video', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setMediaUrl(data.url);
        toast.success('视频上传成功');
      } else {
        toast.error(data.error || '上传失败');
      }
    } catch (error) {
      console.error('上传错误:', error);
      toast.error('视频上传失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (selectedIds.length === 0) {
      toast.error('请选择至少一个接收对象');
      return;
    }

    if (!content.trim() && contentType === 'text') {
      toast.error('请输入消息内容');
      return;
    }

    if ((contentType === 'image' || contentType === 'video') && !mediaUrl.trim()) {
      toast.error(`请上传${contentType === 'image' ? '图片' : '视频'}或输入URL`);
      return;
    }

    if (contentType === 'link' && !mediaUrl.trim()) {
      toast.error('请输入链接地址');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIds: selectedIds,
          targetType: targetType,
          content: content,
          type: 'notification',
          contentType: contentType,
          mediaUrl: mediaUrl || undefined,
          senderId: user?.id,
          senderRole: user?.role,
          sendAsWuyingDoctor: sendAsWuyingDoctor,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const typeName = targetTypeConfig[targetType].label;
        toast.success(`消息已成功发送给 ${data.count} 个${typeName}`);
        setContent('');
        setMediaUrl('');
        setSelectedIds([]);
        setSelectAll(false);
        setSendAsWuyingDoctor(false);
      } else {
        toast.error(data.error || '发送失败');
      }
    } catch (error) {
      toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  // 渲染接收对象列表项
  const renderRecipientItem = (recipient: Recipient | Team) => {
    const isSelected = selectedIds.includes(recipient.id);
    return (
      <div
        key={recipient.id}
        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
          isSelected 
            ? 'bg-primary/10 border-2 border-primary/30 shadow-sm' 
            : 'bg-muted/50 hover:bg-muted border-2 border-transparent'
        }`}
        onClick={() => handleToggleSelect(recipient.id)}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'border-2 border-muted-foreground/30'
        }`}>
          {isSelected && <CheckCircle2 className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{recipient.name}</p>
          <p className="text-xs text-muted-foreground truncate">{recipient.schoolName || '未关联学校'}</p>
        </div>
      </div>
    );
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

  const currentRecipients = getCurrentRecipients();
  const filteredRecipients = getFilteredRecipients();

  // 是否显示接收消息标签（志愿者和助学老师可以接收消息）
  const canReceiveMessages = user?.role === 'volunteer' || user?.role === 'teacher';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-bold">消息管理</h1>
          {user && (
            <Badge variant="outline" className="ml-auto">
              {(user.role === 'admin' || user.role === 'super_admin') ? '超级管理员' : user.role === 'volunteer' ? '授课志愿者' : '管理员'}
            </Badge>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-4 md:py-6 space-y-4">
        {/* 标签页切换 */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'send' | 'receive')}>
          <TabsList className="grid w-full grid-cols-2">
            {canReceiveMessages && (
              <TabsTrigger value="receive" className="relative">
                <Bell className="w-4 h-4 mr-1" />
                收到的消息
                {receivedUnreadCount > 0 && (
                  <Badge className="ml-1 h-5 px-1.5 text-xs bg-red-500">
                    {receivedUnreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="send" className={canReceiveMessages ? '' : 'col-span-2'}>
              <Send className="w-4 h-4 mr-1" />
              发送消息
            </TabsTrigger>
          </TabsList>

          {/* 收到的消息 */}
          {canReceiveMessages && (
            <TabsContent value="receive" className="space-y-4 mt-4">
              {loadingMessages ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
              ) : receivedMessages.length === 0 ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-12">
                    <div className="text-center text-gray-500">
                      <Bell className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <p>暂无消息</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {receivedMessages.map((message) => (
                    <Card 
                      key={message.id}
                      className={`border-0 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                        message.is_read ? 'bg-gray-50' : 'bg-white ring-2 ring-blue-200'
                      }`}
                      onClick={() => handleViewMessage(message)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100">
                            <Shield className="w-5 h-5 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {!message.is_read && (
                                <span className="w-2 h-2 bg-red-500 rounded-full" />
                              )}
                              <span className="text-xs text-gray-400">
                                {formatTime(message.created_at)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {(message.sender_role === 'admin' || message.sender_role === 'super_admin') ? '超级管理员' : message.sender_role}
                              </Badge>
                            </div>
                            <h3 className="font-medium text-gray-900 mb-1">
                              来自管理员的消息
                            </h3>
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {message.content}
                            </p>
                            {message.sender_name && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                                <User className="w-3 h-3" />
                                <span>{message.sender_name}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {!message.is_read && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markMessageAsRead(message.id);
                                }}
                                disabled={markingReadId === message.id}
                              >
                                {markingReadId === message.id ? (
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
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* 发送消息 */}
          <TabsContent value="send" className="space-y-4 mt-4">
            {/* 发送对象类型选择 - 仅超级管理员可见 */}
            {(user?.role === 'admin' || user?.role === 'super_admin') && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">选择发送对象类型</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(targetTypeConfig) as TargetType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleTargetTypeChange(type)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                          targetType === type
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        {targetTypeConfig[type].icon}
                        <span className="font-medium">{targetTypeConfig[type].label}</span>
                        <span className="text-xs text-gray-500 text-center">{targetTypeConfig[type].description}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

        {/* 接收对象选择 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {targetTypeConfig[targetType].icon}
                选择{targetTypeConfig[targetType].label}
              </CardTitle>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                已选择 {selectedIds.length} / {currentRecipients.length} 个{targetTypeConfig[targetType].label}
                {selectedIds.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={handleClearSelection}
                  >
                    清空选择
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 权限提示 */}
            {user?.role === 'volunteer' && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                作为授课志愿者，您只能向自己指导的小队发送消息
              </div>
            )}
            {user?.role === 'teacher' && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                作为助学老师，您只能向本校小队发送消息
              </div>
            )}
            {(user?.role === 'admin' || user?.role === 'super_admin') && (
              <div className="mb-3 p-3 bg-green-50 rounded-lg text-sm text-green-700">
                作为超级管理员，您可以向当前学期所有{targetTypeConfig[targetType].label}发送消息
              </div>
            )}
            
            {/* 搜索和筛选 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {/* 搜索框 */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value);
                    setSelectAll(false);
                  }}
                  placeholder={`搜索${targetTypeConfig[targetType].label}名称或学校...`}
                  className="pl-9"
                />
              </div>
              
              {/* 学校筛选 - 仅超级管理员可见 */}
              {(user?.role === 'admin' || user?.role === 'super_admin') && schools.length > 0 && (
                <select
                  value={selectedSchoolId}
                  onChange={(e) => {
                    setSelectedSchoolId(e.target.value);
                    setSelectAll(false);
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">全部学校</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* 提示文字 */}
            <div className="mb-3 text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              点击选择接收消息的{targetTypeConfig[targetType].label}
            </div>

            {/* 快速操作按钮 */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleSelectAll(!selectAll)}
                >
                  {selectAll ? '取消全选' : '全选当前筛选结果'}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  筛选结果: {filteredRecipients.length} 个
                </span>
                {filteredRecipients.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={handleSelectFiltered}
                  >
                    选择筛选结果
                  </Button>
                )}
              </div>
            </div>

            {/* 接收对象列表 */}
            <div className="max-h-60 overflow-y-auto space-y-2">
              {filteredRecipients.length === 0 ? (
                <div className="text-center py-8">
                  <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    {currentRecipients.length === 0 
                      ? `暂无可发送消息的${targetTypeConfig[targetType].label}` 
                      : '没有匹配的搜索结果'}
                  </p>
                  {searchKeyword && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="text-blue-500"
                      onClick={() => setSearchKeyword('')}
                    >
                      清除搜索条件
                    </Button>
                  )}
                </div>
              ) : (
                filteredRecipients.map(recipient => renderRecipientItem(recipient as any))
              )}
            </div>
          </CardContent>
        </Card>

        {/* 消息内容 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">消息内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 内容类型选择 */}
            <div className="space-y-2">
              <Label>消息类型</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(contentTypeConfig) as ContentType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setContentType(type);
                      setMediaUrl('');
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                      contentType === type
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {contentTypeConfig[type].icon}
                    {contentTypeConfig[type].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 发送身份选择（仅志愿者发送给小队时显示） */}
            {user?.role === 'volunteer' && targetType === 'team' && (
              <div className="space-y-2">
                <Label>发送身份</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSendAsWuyingDoctor(false)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all border-2 ${
                      !sendAsWuyingDoctor
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>以本人身份发送</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendAsWuyingDoctor(true)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all border-2 ${
                      sendAsWuyingDoctor
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-transparent bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>以雾影博士身份发送</span>
                  </button>
                </div>
                {sendAsWuyingDoctor && (
                  <p className="text-xs text-indigo-600">小队成员将看到此消息来自"雾影博士"</p>
                )}
              </div>
            )}

            {/* 文字内容 */}
            <div className="space-y-2">
              <Label>{contentType === 'text' ? '消息内容' : '描述（可选）'}</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={contentTypeConfig[contentType].placeholder}
                rows={contentType === 'text' ? 5 : 2}
              />
            </div>

            {/* 图片上传 */}
            {contentType === 'image' && (
              <div className="space-y-2">
                <Label>图片</Label>
                <div className="flex gap-2">
                  <Input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1"
                  />
                  <label className={`cursor-pointer ${uploading ? 'pointer-events-none' : ''}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      className="whitespace-nowrap"
                    >
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">上传</span>
                    </Button>
                  </label>
                </div>
                {mediaUrl && (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={mediaUrl}
                      alt="预览"
                      className="w-40 h-40 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => setMediaUrl('')}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 视频链接 */}
            {contentType === 'video' && (
              <div className="space-y-2">
                <Label>视频</Label>
                <div className="flex gap-2">
                  <Input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://www.bilibili.com/video/..."
                    className="flex-1"
                  />
                  <label className={`cursor-pointer ${uploading ? 'pointer-events-none' : ''}`}>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                      onChange={handleVideoUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      className="whitespace-nowrap"
                    >
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">上传</span>
                    </Button>
                  </label>
                </div>
                {mediaUrl && (
                  <div className="mt-2 relative inline-block">
                    <video
                      src={mediaUrl}
                      controls
                      className="w-full max-w-sm rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => setMediaUrl('')}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">支持B站、优酷等视频平台链接，或上传本地视频（MP4、WebM、MOV、AVI，最大100MB）</p>
              </div>
            )}

            {/* 外部链接 */}
            {contentType === 'link' && (
              <div className="space-y-2">
                <Label>链接地址</Label>
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-gray-500">输入要分享的网页链接</p>
              </div>
            )}

            <Button 
              onClick={handleSend} 
              className="w-full" 
              disabled={sending || selectedIds.length === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  发送中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" />
                  发送消息 ({selectedIds.length} 个{targetTypeConfig[targetType].label})
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>
      </main>

      {/* 消息详情弹窗 */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent className="max-w-lg">
          {selectedMessage && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-red-100">
                    <Shield className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">
                      来自管理员的消息
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {(selectedMessage.sender_role === 'admin' || selectedMessage.sender_role === 'super_admin') ? '超级管理员' : selectedMessage.sender_role}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {formatTime(selectedMessage.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {selectedMessage.sender_name && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="w-4 h-4" />
                    <span>发送人：{selectedMessage.sender_name}</span>
                  </div>
                )}
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {selectedMessage.content}
                  </p>
                </div>
                
                {selectedMessage.media_url && selectedMessage.content_type === 'image' && (
                  <div className="mt-3">
                    <img 
                      src={selectedMessage.media_url} 
                      alt="消息图片" 
                      className="max-w-full rounded-lg"
                    />
                  </div>
                )}
                
                {selectedMessage.media_url && selectedMessage.content_type === 'video' && (
                  <div className="mt-3">
                    <video 
                      src={selectedMessage.media_url} 
                      controls 
                      className="max-w-full rounded-lg"
                    />
                  </div>
                )}
                
                {selectedMessage.media_url && selectedMessage.content_type === 'link' && (
                  <div className="mt-3">
                    <a 
                      href={selectedMessage.media_url}
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
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowMessageDialog(false)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
