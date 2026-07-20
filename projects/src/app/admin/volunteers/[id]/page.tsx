'use client';

import { useEffect, useState } from 'react';
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
  ArrowLeft, User, Building, Edit, Trash2,
  Users, Award, FileCheck, X, Save, RefreshCw,
  UserPlus
} from 'lucide-react';
import { toast } from 'sonner';

interface Volunteer {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id: string;
  assigned_teacher_id: string | null;
  created_at: string;
  school?: {
    id: string;
    name: string;
    address: string;
  };
  assignedTeacher?: {
    id: string;
    username: string;
    name: string;
  };
}

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
  status: string;
  current_theme_id: string | null;
  themeName?: string;
  created_at: string;
  createdByVolunteer?: boolean;
}

interface School {
  id: string;
  name: string;
}

interface Stats {
  teamCount: number;
  reviewedCount: number;
  pendingCount: number;
}

export default function VolunteerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const volunteerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<Stats>({ 
    teamCount: 0, 
    reviewedCount: 0, 
    pendingCount: 0 
  });
  const [schools, setSchools] = useState<School[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', schoolId: 'none', password: '' });
  const [isSaving, setIsSaving] = useState(false);

  // 判断是否为助学老师（只读权限）
  const isTeacher = currentUser?.role === 'teacher';

  useEffect(() => {
    // 获取当前用户
    const userData = safeGetJSON<{ id: string; role: string } | null>('user', null);
    if (userData) {
      setCurrentUser(userData);
    }
    
    fetchVolunteerDetail();
    fetchSchools();
  }, [volunteerId]);

  const fetchVolunteerDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/volunteers/${volunteerId}`);
      const data = await res.json();
      
      if (data.error) {
        toast.error(data.error);
        router.push('/admin/volunteers');
        return;
      }

      setVolunteer(data.volunteer);
      setTeams(data.teams);
      setStats(data.stats);
      setEditForm({
        name: data.volunteer.name || '',
        schoolId: data.volunteer.school_id || 'none',
        password: '',
      });
    } catch (error) {
      console.error('获取志愿者详情失败:', error);
      toast.error('获取志愿者详情失败');
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

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error('请输入姓名');
      return;
    }

    setIsSaving(true);
    try {
      const updateData: Record<string, any> = {
        name: editForm.name,
        schoolId: editForm.schoolId === 'none' ? null : editForm.schoolId,
      };
      
      if (editForm.password.trim()) {
        updateData.password = editForm.password;
      }

      const res = await fetch(`/api/volunteers/${volunteerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('志愿者信息已更新');
        setVolunteer(data.volunteer);
        setIsEditing(false);
        fetchVolunteerDetail(); // 刷新数据
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
    if (!confirm('确定要删除这个志愿者吗？此操作不可恢复。')) return;

    try {
      const res = await fetch(`/api/volunteers/${volunteerId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('志愿者已删除');
        router.push('/admin/volunteers');
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

  if (!volunteer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">志愿者不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/volunteers')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">志愿者详情</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && !isTeacher && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="w-4 h-4 mr-1" />
                  编辑
                </Button>
                <Button variant="outline" size="sm" className="text-red-600" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  删除
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-4 md:py-6 space-y-6">
        {/* 志愿者信息卡片 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-5 h-5 text-teal-500" />
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
                    <Label>姓名</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>所属学校</Label>
                    <Select 
                      value={editForm.schoolId} 
                      onValueChange={(value) => setEditForm({ ...editForm, schoolId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择学校" />
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
                </div>
                <div className="space-y-2">
                  <Label>新密码（留空则不修改）</Label>
                  <Input
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="输入新密码"
                  />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500">姓名</p>
                  <p className="text-lg font-semibold">{volunteer.name || '未设置'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">手机号</p>
                  <p className="text-lg font-semibold">{volunteer.username}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">归属小学</p>
                  <p className="text-lg font-semibold">
                    {volunteer.school ? (
                      <span 
                        className="text-teal-600 cursor-pointer hover:underline"
                        onClick={() => router.push(`/admin/schools/${volunteer.school?.id}`)}
                      >
                        {volunteer.school.name}
                      </span>
                    ) : <span className="text-gray-400">未指定</span>}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">对接助学老师</p>
                  <p className="text-lg font-semibold">
                    {volunteer.assignedTeacher ? (
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        <UserPlus className="w-3 h-3 mr-1" />
                        {volunteer.assignedTeacher.name || volunteer.assignedTeacher.username}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">未分配</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">创建时间</p>
                  <p className="text-base">{new Date(volunteer.created_at).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">指导小队数</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.teamCount}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">产出审核数</p>
                  <p className="text-2xl font-bold text-green-600">{stats.reviewedCount}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <FileCheck className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">待审核数</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.pendingCount}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Award className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 小队列表 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                指导小队
                <span className="text-gray-400 font-normal">({teams.length}个)</span>
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={fetchVolunteerDetail}
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
                <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>暂无小队</p>
                {!volunteer.school && (
                  <p className="text-sm mt-1">请先为志愿者分配学校</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {teams.map((team) => (
                  <div 
                    key={team.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/teams/${team.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                        {team.name?.charAt(0) || 'T'}
                      </div>
                      <div>
                        <p className="font-medium">{team.name || '未命名小队'}</p>
                        <p className="text-sm text-gray-500">{team.code}</p>
                        {team.themeName && (
                          <p className="text-xs text-gray-400 mt-1">当前主题: {team.themeName}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-semibold text-yellow-600">{team.points} 积分</p>
                      </div>
                      <Badge variant={team.status === 'active' ? 'default' : 'secondary'}>
                        {team.status === 'active' ? '进行中' : '已完成'}
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
