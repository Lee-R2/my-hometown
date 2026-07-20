'use client';

import { useEffect, useState, useRef } from 'react';
import { safeGetJSON } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Plus, Search, User, Users, Upload, 
  Download, X, FileSpreadsheet, Building, UserPlus,
  Edit, Trash2, KeyRound, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface Volunteer {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id: string;
  created_at: string;
  school?: { id: string; name: string };
  assignedTeacher?: { id: string; username: string; name: string };
  teamCount: number;
}

interface School {
  id: string;
  name: string;
}

export default function AdminVolunteersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; school_id?: string } | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchool, setFilterSchool] = useState('all');
  
  // 滚动位置记忆
  useScrollPosition('admin-volunteers');
  
  // 判断是否为助学老师（只读权限）
  const isTeacher = currentUser?.role === 'teacher';
  
  // 重置密码状态
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  const [newVolunteer, setNewVolunteer] = useState({
    username: '',
    password: '123456',
    name: '',
    schoolId: 'none',
  });
  const [newVolunteerErrors, setNewVolunteerErrors] = useState<{
    username?: string;
    name?: string;
  }>({});
  const [isCreating, setIsCreating] = useState(false);
  
  // 手机号验证状态
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<{
    valid: boolean;
    exists: boolean;
    message?: string;
    user?: { name: string; role: string; roleName: string };
  } | null>(null);
  
  const [importData, setImportData] = useState('');
  const [importDataError, setImportDataError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 删除确认状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingVolunteer, setDeletingVolunteer] = useState<Volunteer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // 加载当前用户信息
    const userObj = safeGetJSON<{ id: string; role: string; school_id?: string } | null>('user', null);
    if (userObj) {
      setCurrentUser(userObj);
      // 助学老师只看自己链接的志愿者
      if (userObj.role === 'teacher' && userObj.id) {
        fetchVolunteersForTeacher(userObj.id);
      } else {
        fetchVolunteers();
        fetchSchools();
      }
    } else {
      fetchVolunteers();
      fetchSchools();
    }
  }, []);

  const fetchVolunteersForTeacher = async (teacherId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('teacherId', teacherId);
      
      const res = await fetch(`/api/volunteers?${params.toString()}`);
      const data = await res.json();
      setVolunteers(data.volunteers || []);
    } catch (error) {
      console.error('获取志愿者列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVolunteers = async (search?: string, schoolId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (schoolId) params.append('schoolId', schoolId);
      
      // 助学老师只看自己链接的志愿者
      if (currentUser?.role === 'teacher' && currentUser.id) {
        params.append('teacherId', currentUser.id);
      }
      
      const res = await fetch(`/api/volunteers?${params.toString()}`);
      const data = await res.json();
      setVolunteers(data.volunteers || []);
    } catch (error) {
      console.error('获取志愿者列表失败:', error);
    } finally {
      setLoading(false);
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

  const handleSearch = () => {
    const schoolIdParam = filterSchool === 'all' ? undefined : filterSchool;
    fetchVolunteers(searchQuery, schoolIdParam);
  };

  // 重置密码为初始密码
  const handleResetPassword = async (volunteer: Volunteer) => {
    if (!currentUser) return;
    
    if (!confirm(`确定要将志愿者"${volunteer.name}"的密码重置为初始密码(123456)吗？`)) {
      return;
    }
    
    setResetPasswordId(volunteer.id);
    setIsResettingPassword(true);
    
    try {
      const res = await fetch('/api/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: volunteer.id,
          targetType: 'user',
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success(`密码已重置为初始密码: ${data.defaultPassword}`);
      } else {
        toast.error(data.error || '重置密码失败');
      }
    } catch (error) {
      toast.error('重置密码失败');
    } finally {
      setIsResettingPassword(false);
      setResetPasswordId(null);
    }
  };

  // 验证手机号是否已被使用
  const checkPhoneAvailability = async (phone: string) => {
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setPhoneStatus(null);
      return;
    }

    setPhoneChecking(true);
    try {
      const res = await fetch(`/api/auth/check-phone?phone=${phone}`);
      const data = await res.json();
      setPhoneStatus(data);
    } catch (error) {
      console.error('验证手机号失败:', error);
    } finally {
      setPhoneChecking(false);
    }
  };

  const handleCreateVolunteer = async () => {
    // 验证表单
    const errors: typeof newVolunteerErrors = {};
    
    if (!newVolunteer.username.trim()) {
      errors.username = '请输入手机号';
    } else {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(newVolunteer.username)) {
        errors.username = '请输入正确的手机号格式';
      } else if (phoneStatus?.exists) {
        // 手机号已被占用
        errors.username = '该手机号已被使用';
      }
    }
    
    if (!newVolunteer.name.trim()) {
      errors.name = '请输入姓名';
    }
    
    setNewVolunteerErrors(errors);
    
    // 如果有错误，停止提交
    if (Object.keys(errors).length > 0) {
      toast.error('请检查表单中的错误项');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newVolunteer.username,
          password: newVolunteer.password || '123456',
          name: newVolunteer.name,
          schoolId: newVolunteer.schoolId === 'none' ? null : newVolunteer.schoolId || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('志愿者账号创建成功');
        setShowCreateDialog(false);
        setNewVolunteer({ username: '', password: '123456', name: '', schoolId: 'none' });
        setPhoneStatus(null); // 重置验证状态
        fetchVolunteers();
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch (error) {
      toast.error('创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      setImportDataError('请输入导入数据');
      return;
    }

    // 验证数据格式
    const lines = importData.trim().split('\n');
    const volunteers = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      return {
        username: parts[0] || '',
        password: parts[1] || '123456',
        name: parts[2] || '',
        schoolName: parts[3] || '',
      };
    }).filter(v => v.username && v.name);

    if (volunteers.length === 0) {
      setImportDataError('没有有效的导入数据，请检查格式是否正确');
      return;
    }
    
    // 验证手机号格式
    const invalidPhones = volunteers.filter(v => !/^1[3-9]\d{9}$/.test(v.username));
    if (invalidPhones.length > 0) {
      setImportDataError(`发现 ${invalidPhones.length} 个无效手机号格式，请检查数据`);
      return;
    }
    
    setImportDataError('');

    setIsImporting(true);
    
    try {
      const res = await fetch('/api/volunteers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volunteers }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        if (data.results?.errors?.length > 0) {
          console.warn('导入警告:', data.results.errors);
        }
        setShowImportDialog(false);
        setImportData('');
        fetchVolunteers();
      } else {
        toast.error(data.error || '导入失败');
      }
    } catch (error) {
      toast.error('导入失败');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportData(text);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = `手机号,密码,姓名,所属学校
13800138001,123456,王志愿,阳光小学
13800138002,123456,李志愿,希望小学`;
    
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '志愿者导入模板.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // 打开删除确认对话框
  const handleOpenDeleteDialog = (volunteer: Volunteer) => {
    setDeletingVolunteer(volunteer);
    setDeleteDialogOpen(true);
  };

  // 删除志愿者
  const handleDeleteVolunteer = async () => {
    if (!deletingVolunteer) return;
    
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/volunteers/${deletingVolunteer.id}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success('志愿者已删除');
        setDeleteDialogOpen(false);
        setDeletingVolunteer(null);
        fetchVolunteers(searchQuery, filterSchool === 'all' ? undefined : filterSchool);
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除志愿者失败:', error);
      toast.error('删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">授课志愿者管理</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isTeacher && (
              <>
                <Button variant="outline" onClick={() => setShowImportDialog(true)} className="hidden sm:flex">
                  <Upload className="w-4 h-4 mr-1" />
                  批量导入
                </Button>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">新建志愿者</span>
                  <span className="sm:hidden">新建</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 搜索栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input 
                  placeholder="搜索用户名或姓名..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              {!isTeacher && (
                <Select value={filterSchool} onValueChange={setFilterSchool}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="按学校筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部学校</SelectItem>
                    {schools.map(school => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" onClick={handleSearch}>搜索</Button>
            </div>
          </CardContent>
        </Card>

        {/* 志愿者列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">志愿者列表 ({volunteers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                加载中...
              </div>
            ) : volunteers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂无志愿者</p>
                <p className="text-sm mt-1">点击右上角按钮添加志愿者</p>
              </div>
            ) : (
              <div className="space-y-3">
                {volunteers.map((volunteer) => (
                  <div 
                    key={volunteer.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/volunteers/${volunteer.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-teal-400 rounded-xl flex items-center justify-center text-white">
                        <User className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{volunteer.name}</h3>
                          <span className="text-xs text-gray-400">@{volunteer.username}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          {volunteer.school && (
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3" />
                              {volunteer.school.name}
                            </span>
                          )}
                          {volunteer.assignedTeacher && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <UserPlus className="w-3 h-3" />
                              {volunteer.assignedTeacher.name || volunteer.assignedTeacher.username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-lg font-semibold text-green-600">{volunteer.teamCount}</p>
                        <p className="text-xs text-gray-500">指导小队</p>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {!isTeacher && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => router.push(`/admin/volunteers/${volunteer.id}`)}
                          >
                            详情
                          </Button>
                        )}
                        {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-amber-600 hover:bg-amber-50"
                              onClick={() => handleResetPassword(volunteer)}
                              disabled={isResettingPassword && resetPasswordId === volunteer.id}
                            >
                              {isResettingPassword && resetPasswordId === volunteer.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <KeyRound className="w-4 h-4" />
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-destructive hover:bg-destructive hover:text-white"
                              onClick={() => handleOpenDeleteDialog(volunteer)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 创建志愿者对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>新建授课志愿者</CardTitle>
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
              <div className="space-y-2">
                <Label>手机号 *</Label>
                <div className="relative">
                  <Input 
                    value={newVolunteer.username}
                    onChange={(e) => {
                      const phone = e.target.value;
                      setNewVolunteer({ ...newVolunteer, username: phone });
                      if (newVolunteerErrors.username) {
                        setNewVolunteerErrors(prev => ({ ...prev, username: undefined }));
                      }
                      // 重置验证状态
                      setPhoneStatus(null);
                    }}
                    onBlur={() => {
                      if (newVolunteer.username && !/^1[3-9]\d{9}$/.test(newVolunteer.username)) {
                        setNewVolunteerErrors(prev => ({ ...prev, username: '请输入正确的手机号格式' }));
                      } else if (newVolunteer.username) {
                        // 验证手机号是否已被使用
                        checkPhoneAvailability(newVolunteer.username);
                      }
                    }}
                    placeholder="请输入手机号作为登录账号"
                    type="tel"
                    className={`${newVolunteerErrors.username ? 'border-destructive focus-visible:ring-destructive/20' : ''} ${phoneStatus?.exists ? 'border-orange-500' : ''} ${phoneStatus?.exists === false ? 'border-green-500' : ''}`}
                  />
                  {/* 验证状态指示器 */}
                  {phoneChecking && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                {/* 验证状态提示 */}
                {newVolunteerErrors.username ? (
                  <p className="text-sm text-destructive">{newVolunteerErrors.username}</p>
                ) : phoneStatus ? (
                  phoneStatus.exists ? (
                    <p className="text-sm text-orange-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {phoneStatus.message}
                    </p>
                  ) : (
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      手机号可用
                    </p>
                  )
                ) : (
                  <p className="text-xs text-gray-500">手机号将作为登录账号，初始密码为 123456</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>密码</Label>
                <Input 
                  value={newVolunteer.password}
                  onChange={(e) => setNewVolunteer({ ...newVolunteer, password: e.target.value })}
                  placeholder="登录密码"
                />
                <p className="text-xs text-gray-500">默认密码为 123456</p>
              </div>

              <div className="space-y-2">
                <Label>姓名 *</Label>
                <Input 
                  value={newVolunteer.name}
                  onChange={(e) => {
                    setNewVolunteer({ ...newVolunteer, name: e.target.value });
                    if (newVolunteerErrors.name) {
                      setNewVolunteerErrors(prev => ({ ...prev, name: undefined }));
                    }
                  }}
                  onBlur={() => {
                    if (!newVolunteer.name.trim()) {
                      setNewVolunteerErrors(prev => ({ ...prev, name: '请输入姓名' }));
                    }
                  }}
                  placeholder="志愿者姓名"
                  className={newVolunteerErrors.name ? 'border-destructive focus-visible:ring-destructive/20' : ''}
                />
                {newVolunteerErrors.name && (
                  <p className="text-sm text-destructive">{newVolunteerErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>所属学校</Label>
                <Select 
                  value={newVolunteer.schoolId} 
                  onValueChange={(value) => setNewVolunteer({ ...newVolunteer, schoolId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择学校（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定学校</SelectItem>
                    {schools.map(school => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setNewVolunteerErrors({});
                    setPhoneStatus(null); // 重置验证状态
                  }}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleCreateVolunteer}
                  disabled={isCreating}
                >
                  {isCreating ? '创建中...' : '创建'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 批量导入对话框 */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>批量导入志愿者</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowImportDialog(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 格式说明 */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">CSV格式说明</h4>
                <p className="text-xs text-blue-700">
                  每行一个志愿者，字段用逗号分隔：手机号,密码,姓名,所属学校
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  示例：13800138001,123456,王志愿,阳光小学
                </p>
              </div>

              {/* 上传文件 */}
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm text-gray-600 mb-2">点击上传CSV文件，或直接粘贴数据</p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" />
                  选择文件
                </Button>
              </div>

              {/* 数据输入 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>导入数据</Label>
                  <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                    <Download className="w-4 h-4 mr-1" />
                    下载模板
                  </Button>
                </div>
                <Textarea
                  value={importData}
                  onChange={(e) => {
                    setImportData(e.target.value);
                    if (importDataError) {
                      setImportDataError('');
                    }
                  }}
                  placeholder="粘贴CSV格式数据或上传文件..."
                  rows={8}
                  className={`font-mono text-sm ${importDataError ? 'border-destructive focus-visible:ring-destructive/20' : ''}`}
                />
                {importDataError && (
                  <p className="text-sm text-destructive">{importDataError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportDataError('');
                  }}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleImport}
                  disabled={isImporting}
                >
                  {isImporting ? '导入中...' : '开始导入'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-red-600">确认删除</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                确定要删除志愿者「{deletingVolunteer?.name}」吗？
              </p>
              <p className="text-sm text-gray-500 mt-2">
                此操作不可恢复，该志愿者的相关数据将被永久删除。
              </p>
              <div className="flex gap-3 mt-6">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeletingVolunteer(null);
                  }}
                  disabled={isDeleting}
                >
                  取消
                </Button>
                <Button 
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeleteVolunteer}
                  disabled={isDeleting}
                >
                  {isDeleting ? '删除中...' : '确认删除'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
