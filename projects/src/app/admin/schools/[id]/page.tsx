'use client';

import React, { useEffect, useState } from 'react';
import { safeGetJSON } from '@/lib/utils';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, School, Users, Building, Edit, Trash2,
  User, Award, FileText, X, Save, Phone, Link2, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface School {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
  grade: string | null;
  class_name: string | null;
  student_count: number | null;
  created_at: string;
  volunteers: Array<{
    id: string;
    username: string;
    name: string;
  }>;
  volunteerCount: number;
}

interface Volunteer {
  id: string;
  username: string;
  name: string;
  role: string;
  assigned_teacher_id: string | null;
  created_at: string;
}

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
  status: string;
  created_at: string;
  theme?: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
}

interface Theme {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  school_id: string | null;
  selection_count: number;
}

interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
}

export default function SchoolDetailPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [stats, setStats] = useState({ adminCount: 0, volunteerCount: 0, teamCount: 0, themeCount: 0 });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', address: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // 筛选状态
  const [roleFilter, setRoleFilter] = useState('all'); // all, admin, teacher, volunteer

  useEffect(() => {
    // 获取当前登录用户
    const userData = safeGetJSON<CurrentUser | null>('user', null);
    if (userData) {
      setCurrentUser(userData);
    }
    fetchSchoolDetail();
  }, [schoolId]);

  // 判断是否为助学老师角色
  const isTeacher = currentUser?.role === 'teacher';

  const fetchSchoolDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        router.push('/admin/schools');
        return;
      }

      setSchool(data.school);
      setAdmins(data.admins);
      setVolunteers(data.volunteers || []);
      setTeams(data.teams);
      setThemes(data.themes);
      setStats(data.stats);
      setEditForm({
        name: data.school.name,
        address: data.school.address || '',
      });
    } catch (error) {
      console.error('获取学校详情失败:', error);
      toast.error('获取学校详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error('请输入学校名称');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('学校信息已更新');
        setSchool(data.school);
        setIsEditing(false);
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch (error) {
      toast.error('更新失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这所学校吗？此操作不可恢复。')) return;

    try {
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('学校已删除');
        router.push('/admin/schools');
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">学校不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/schools')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">学校详情</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="hidden sm:inline-flex">
                  <Edit className="w-4 h-4 mr-1" />
                  编辑
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 hidden sm:inline-flex" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  删除
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6 space-y-6">
        {/* 学校信息卡片 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-500" />
                基本信息
              </CardTitle>
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                    <Save className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>学校名称</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>学校地址</Label>
                    <Input
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">学校名称</p>
                  <p className="text-lg font-semibold">{school.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">学校地址</p>
                  <p className="text-lg font-semibold">{school.address || '暂无'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">创建时间</p>
                  <p className="text-base">{new Date(school.created_at).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">管理员</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.adminCount}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">志愿者</p>
                  <p className="text-2xl font-bold text-teal-600">{stats.volunteerCount}</p>
                </div>
                <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6 text-teal-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">小队</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.teamCount}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Award className="w-6 h-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{isTeacher ? '执行主题' : '专属主题'}</p>
                  <p className="text-2xl font-bold text-green-600">{stats.themeCount}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 人员列表（管理员+志愿者） */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                人员列表 ({admins.length + volunteers.length})
              </CardTitle>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="身份筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="teacher">老师</SelectItem>
                  <SelectItem value="volunteer">志愿者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              // 构建老师ID到老师信息的映射
              const teacherMap = new Map<string, Admin>();
              admins.forEach(a => teacherMap.set(a.id, a));

              // 构建老师ID到对接志愿者列表的映射
              const teacherVolunteersMap = new Map<string, Volunteer[]>();
              volunteers.forEach(v => {
                if (v.assigned_teacher_id) {
                  const list = teacherVolunteersMap.get(v.assigned_teacher_id) || [];
                  list.push(v);
                  teacherVolunteersMap.set(v.assigned_teacher_id, list);
                }
              });

              // 获取未分配对接老师的志愿者
              const unassignedVolunteers = volunteers.filter(v => !v.assigned_teacher_id);

              // 根据筛选条件生成显示列表
              const renderItems: React.ReactElement[] = [];

              if (roleFilter === 'all' || roleFilter === 'admin' || roleFilter === 'teacher') {
                // 显示老师及其对接的志愿者
                admins.forEach((admin, index) => {
                  const assignedVolunteers = teacherVolunteersMap.get(admin.id) || [];
                  
                  // 老师卡片
                  renderItems.push(
                    <div key={admin.id} className="flex items-center justify-between p-3 border rounded-lg bg-blue-50/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-blue-400 to-indigo-400">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{admin.name || '未设置姓名'}</p>
                            <Badge variant={(admin.role === 'admin' || admin.role === 'super_admin') ? 'default' : 'secondary'} className="text-xs">
                              {(admin.role === 'admin' || admin.role === 'super_admin') ? '管理员' : '老师'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {admin.username}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* 对接志愿者展示 */}
                      <div className="text-right">
                        {assignedVolunteers.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-teal-500" />
                            <div className="flex flex-wrap gap-1 justify-end">
                              {assignedVolunteers.map(v => (
                                <Badge key={v.id} variant="outline" className="text-teal-600 border-teal-300">
                                  {v.name || v.username}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">暂无对接志愿者</span>
                        )}
                      </div>
                    </div>
                  );

                  // 如果显示全部，在老师下方显示对接的志愿者
                  if (roleFilter === 'all') {
                    assignedVolunteers.forEach(volunteer => {
                      renderItems.push(
                        <div key={volunteer.id} className="flex items-center justify-between p-3 border rounded-lg ml-8 border-l-4 border-l-teal-400 bg-teal-50/30">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-teal-400 to-green-400">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{volunteer.name || '未设置姓名'}</p>
                                <Badge variant="outline" className="text-xs">志愿者</Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Phone className="w-3 h-3" />
                                {volunteer.username}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <Link2 className="w-3 h-3 text-blue-500" />
                            <span className="text-blue-600">{admin.name}</span>
                          </div>
                        </div>
                      );
                    });
                  }
                });
              }

              // 显示未分配对接老师的志愿者
              if (roleFilter === 'all' || roleFilter === 'volunteer') {
                unassignedVolunteers.forEach(volunteer => {
                  renderItems.push(
                    <div key={volunteer.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-teal-400 to-green-400">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{volunteer.name || '未设置姓名'}</p>
                            <Badge variant="outline" className="text-xs">志愿者</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {volunteer.username}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">未分配对接老师</span>
                    </div>
                  );
                });
              }

              if (renderItems.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>暂无人员</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {renderItems}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* 小队列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">小队列表 ({teams.length})</CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={fetchSchoolDetail}
                className="text-gray-600"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Award className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>暂无小队</p>
              </div>
            ) : (
              <div className="space-y-3">
                {teams.map((team) => (
                  <div 
                    key={team.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/teams/${team.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl flex items-center justify-center text-white font-bold">
                        {team.name?.charAt(0) || 'T'}
                      </div>
                      <div>
                        <p className="font-medium">{team.name || '未命名小队'}</p>
                        <p className="text-sm text-gray-500">{team.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* 显示选择的主题 */}
                      {team.theme && (
                        <div className="flex items-center gap-1 text-sm">
                          <FileText className="w-4 h-4 text-green-500" />
                          <span className="text-green-600">{team.theme.name}</span>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-sm font-semibold text-yellow-600">{team.points} 积分</p>
                        <Badge variant={team.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {team.status === 'active' ? '进行中' : '已完成'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 执行主题/专属主题 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {isTeacher ? '执行主题' : '专属主题'} ({themes.length})
            </CardTitle>
            {isTeacher && (
              <p className="text-sm text-gray-500">显示本校小队当前正在执行的主题及被选择次数</p>
            )}
          </CardHeader>
          <CardContent>
            {themes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>{isTeacher ? '暂无执行主题' : '暂无专属主题'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {themes.map((theme) => (
                  <div key={theme.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{theme.icon || '📚'}</span>
                      <div>
                        <p className="font-medium">{theme.name}</p>
                        <p className="text-sm text-gray-500">{theme.description || '暂无描述'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isTeacher && (
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-purple-500" />
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                            {theme.selection_count} 个小队选择
                          </Badge>
                        </div>
                      )}
                      <Badge variant={theme.is_active ? 'default' : 'secondary'}>
                        {theme.is_active ? '启用' : '禁用'}
                      </Badge>
                    </div>
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
