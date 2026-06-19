'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Building, Plus, Pencil, Trash2, Users, 
  Search, ArrowLeft, Phone, User, Eye,
  Upload, Download, FileText, BookOpen, Target,
  UserPlus, MapPin, XCircle, GraduationCap, UsersRound
} from 'lucide-react';
import { toast } from 'sonner';

interface School {
  id: string;
  name: string;
  address: string | null;
  province: string | null;
  city: string | null;
  county: string | null;
  teacher_name: string | null;
  teacher_phone: string | null;
  created_at: string;
  teamCount: number;
  adminCount: number;
}

// 志愿者只读学校卡片组件
function SchoolReadOnlyCard({ 
  school, 
  userId,
  onViewDetail 
}: { 
  school: School; 
  userId: string;
  onViewDetail: () => void;
}) {
  const [assignedTeacher, setAssignedTeacher] = useState<{
    name: string;
    phone: string;
    grade: string | null;
    class_name: string | null;
    student_count: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssignedTeacher();
  }, [school.id, userId]);

  const fetchAssignedTeacher = async () => {
    try {
      const res = await fetch(`/api/schools/${school.id}`);
      const data = await res.json();
      
      if (data.admins) {
        // 找到对接的老师（志愿者被分配给的老师）
        const volunteer = data.volunteers?.find((v: { id: string }) => v.id === userId);
        if (volunteer?.assigned_teacher_id) {
          const teacher = data.admins.find((a: { id: string }) => a.id === volunteer.assigned_teacher_id);
          if (teacher) {
            setAssignedTeacher({
              name: teacher.name || teacher.username,
              phone: teacher.username,
              grade: teacher.grade,
              class_name: teacher.class_name,
              student_count: teacher.student_count,
            });
          }
        }
      }
    } catch (error) {
      console.error('获取对接老师信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{school.name}</CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {[school.province, school.city, school.county].filter(Boolean).join(' ') || '暂无地区信息'}
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">只读</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">学校地址</p>
            <p className="text-sm font-medium">{school.address || '暂无'}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">小队数量</p>
            <p className="text-sm font-medium">{school.teamCount || 0} 个小队</p>
          </div>
        </div>

        {/* 对接老师信息 */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <UsersRound className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-blue-700">对接老师</span>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : assignedTeacher ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">姓名</p>
                <p className="text-sm font-medium">{assignedTeacher.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">手机号</p>
                <p className="text-sm font-medium">{assignedTeacher.phone}</p>
              </div>
              {assignedTeacher.grade && (
                <div>
                  <p className="text-xs text-gray-500">年级</p>
                  <p className="text-sm font-medium">{assignedTeacher.grade}</p>
                </div>
              )}
              {assignedTeacher.class_name && (
                <div>
                  <p className="text-xs text-gray-500">班级</p>
                  <p className="text-sm font-medium">{assignedTeacher.class_name}</p>
                </div>
              )}
              {assignedTeacher.student_count !== null && (
                <div>
                  <p className="text-xs text-gray-500">学生数量</p>
                  <p className="text-sm font-medium">{assignedTeacher.student_count} 人</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">暂未分配对接老师</p>
          )}
        </div>

        {/* 学校联系人 */}
        {(school.teacher_name || school.teacher_phone) && (
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {school.teacher_name && (
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                学校联系人: {school.teacher_name}
              </span>
            )}
            {school.teacher_phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {school.teacher_phone}
              </span>
            )}
          </div>
        )}

        <Button 
          variant="outline" 
          className="w-full"
          onClick={onViewDetail}
        >
          <Eye className="w-4 h-4 mr-2" />
          查看详情
        </Button>
      </CardContent>
    </Card>
  );
}

// 志愿者/老师只读详情视图组件 - 直接在页面显示
function SchoolReadOnlyDetailView({ 
  schoolDetail, 
  userId 
}: { 
  schoolDetail: SchoolDetail;
  userId: string;
}) {
  const [activeTab, setActiveTab] = useState('info');
  const { school, admins, volunteers, teams, themes, stats } = schoolDetail;

  // 找到当前志愿者对接的老师
  const volunteer = volunteers?.find(v => v.id === userId);
  const assignedTeacher = volunteer?.assigned_teacher_id 
    ? admins?.find(a => a.id === volunteer.assigned_teacher_id)
    : null;

  return (
    <div className="space-y-6">
      {/* 学校头部信息 */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Building className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">{school.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4" />
                {[school.province, school.city, school.county].filter(Boolean).join(' ') || '暂无地区信息'}
              </CardDescription>
            </div>
            <Badge variant="secondary">只读</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* 对接老师信息卡片 */}
      {assignedTeacher && (
        <Card className="border-0 shadow-sm bg-blue-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <UsersRound className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-700">我的对接老师</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">姓名</p>
                <p className="font-medium">{assignedTeacher.name || assignedTeacher.username}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">手机号</p>
                <p className="font-medium">{assignedTeacher.username}</p>
              </div>
              {assignedTeacher.grade && (
                <div>
                  <p className="text-xs text-gray-500">年级</p>
                  <p className="font-medium">{assignedTeacher.grade}</p>
                </div>
              )}
              {assignedTeacher.class_name && (
                <div>
                  <p className="text-xs text-gray-500">班级</p>
                  <p className="font-medium">{assignedTeacher.class_name}</p>
                </div>
              )}
              {assignedTeacher.student_count !== null && (
                <div>
                  <p className="text-xs text-gray-500">学生数量</p>
                  <p className="font-medium">{assignedTeacher.student_count} 人</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">老师</p>
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
                <Target className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">执行主题</p>
                <p className="text-2xl font-bold text-green-600">{stats.themeCount}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 标签页切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info">基本信息</TabsTrigger>
          <TabsTrigger value="admins">老师列表</TabsTrigger>
          <TabsTrigger value="teams">小队列表</TabsTrigger>
          <TabsTrigger value="themes">执行主题</TabsTrigger>
        </TabsList>
        
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">学校名称：</span>
                  <span className="font-medium">{school.name || '未设置'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">所在地区：</span>
                  <span>
                    {[school.province, school.city, school.county].filter(Boolean).join(' ') || '未设置'}
                  </span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <Building className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">详细地址：</span>
                  <span>{school.address || '未设置'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">负责老师：</span>
                  <span>{school.teacher_name || '未设置'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">联系电话：</span>
                  <span>{school.teacher_phone || '未设置'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="admins" className="mt-4">
          {admins.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">暂无老师</div>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => {
                const isAdminsTeacher = admin.id === volunteer?.assigned_teacher_id;
                return (
                  <Card key={admin.id} className={`p-4 ${isAdminsTeacher ? 'border-blue-300 bg-blue-50/30' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{admin.name || admin.username}</span>
                            {isAdminsTeacher && (
                              <Badge className="text-xs bg-blue-500">我的对接老师</Badge>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">账号: {admin.username}</div>
                          {(admin.grade || admin.class_name || admin.student_count) && (
                            <div className="text-xs text-blue-600 mt-1">
                              {admin.grade && <span>{admin.grade}</span>}
                              {admin.grade && admin.class_name && <span> · </span>}
                              {admin.class_name && <span>{admin.class_name}</span>}
                              {(admin.grade || admin.class_name) && admin.student_count && <span> · </span>}
                              {admin.student_count && <span>{admin.student_count}名学生</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">对接志愿者</div>
                        {admin.volunteers && admin.volunteers.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1 justify-end">
                            {admin.volunteers.map((v: { id: string; name: string; username: string }) => (
                              <Badge key={v.id} variant="outline" className="text-xs text-teal-600 border-teal-300">
                                {v.name || v.username}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-gray-400">暂无</div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="teams" className="mt-4">
          {teams.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">暂无小队</div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <Card key={team.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
                        {team.name?.charAt(0) || 'T'}
                      </div>
                      <div>
                        <div className="font-medium">{team.name || '未命名小队'}</div>
                        <div className="text-xs text-gray-500">{team.code}</div>
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
                        <div className="text-sm font-medium text-yellow-600">{team.points} 积分</div>
                        <Badge variant={team.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {team.status === 'active' ? '进行中' : '已完成'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="themes" className="mt-4">
          {themes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">暂无执行主题</div>
          ) : (
            <div className="space-y-3">
              {themes.map((theme) => (
                <Card key={theme.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{theme.icon || '📚'}</span>
                      <div>
                        <div className="font-medium">{theme.name}</div>
                        <div className="text-xs text-gray-500">{theme.description || '暂无描述'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                        {theme.selection_count} 个小队选择
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface SchoolDetail {
  school: School;
  admins: Array<{
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
  }>;
  volunteers: Array<{
    id: string;
    username: string;
    name: string;
    role: string;
    assigned_teacher_id: string | null;
    created_at: string;
  }>;
  teams: Array<{
    id: string;
    code: string;
    name: string;
    points: number;
    status: string;
    grade: string | null;
    teacher_id: string | null;
    created_by: string | null;
    teacher: {
      id: string;
      name: string | null;
      username: string;
      grade: string | null;
      class_name: string | null;
    } | null;
    creator: {
      id: string;
      name: string | null;
      username: string;
    } | null;
    theme: {
      id: string;
      name: string;
      icon: string | null;
    } | null;
    created_at: string;
  }>;
  themes: Array<{
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    is_active: boolean;
    school_id: string | null;
    selection_count: number;
  }>;
  stats: {
    adminCount: number;
    volunteerCount: number;
    teamCount: number;
    themeCount: number;
  };
}

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

export default function SchoolsManagement() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 滚动位置记忆
  useScrollPosition('admin-schools');
  
  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSchool, setDeletingSchool] = useState<School | null>(null);
  
  // 详情对话框状态
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 批量上传状态
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPreview, setUploadPreview] = useState<Array<{
    name: string;
    address: string;
    teacherName: string;
    teacherPhone: string;
  }>>([]);
  
  // 分配志愿者状态
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningSchool, setAssigningSchool] = useState<School | null>(null);
  const [teachersList, setTeachersList] = useState<Array<{
    id: string;
    username: string;
    name: string;
    role: string;
    volunteers: Array<{
      id: string;
      username: string;
      name: string;
    }>;
    volunteerCount: number;
  }>>([]);
  const [allVolunteersList, setAllVolunteersList] = useState<Array<{
    id: string;
    username: string;
    name: string;
    school_id: string | null;
    assigned_teacher_id: string | null;
  }>>([]);
  // 每个老师选择的志愿者 { [teacherId]: volunteerId[] }
  const [teacherVolunteerAssignments, setTeacherVolunteerAssignments] = useState<{[key: string]: string[]}>({});
  const [assignLoading, setAssignLoading] = useState(false);
  // 当前选中要取消分配的志愿者
  const [selectedVolunteerToUnassign, setSelectedVolunteerToUnassign] = useState<string | null>(null);
  
  // 添加老师状态
  const [addTeacherDialogOpen, setAddTeacherDialogOpen] = useState(false);
  const [addTeacherLoading, setAddTeacherLoading] = useState(false);
  const [addTeacherSchool, setAddTeacherSchool] = useState<School | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<SchoolDetail['admins'][0] | null>(null);
  const [newTeacherData, setNewTeacherData] = useState({
    name: '',
    phone: '',
    grade: '',
    className: '',
    studentCount: '',
  });
  
  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    teacherName: '',
    teacherPhone: '',
    province: '',
    city: '',
    county: '',
  });
  
  // 表单验证错误
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    teacherPhone?: string;
    teacherName?: string;
    province?: string;
    city?: string;
    county?: string;
    address?: string;
  }>({});
  
  // 手机号验证状态
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<{
    valid: boolean;
    exists: boolean;
    message?: string;
    user?: { name: string; role: string; roleName: string };
  } | null>(null);
  
  // 添加老师表单验证错误
  const [teacherFormErrors, setTeacherFormErrors] = useState<{
    name?: string;
    phone?: string;
    grade?: string;
    studentCount?: string;
  }>({});
  
  // 省市区筛选状态
  const [filterProvince, setFilterProvince] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterCounty, setFilterCounty] = useState<string>('all');
  const [provinces, setProvinces] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [counties, setCounties] = useState<string[]>([]);
  
  // 详情页编辑学校信息状态
  const [editingSchoolInfo, setEditingSchoolInfo] = useState(false);
  const [schoolInfoForm, setSchoolInfoForm] = useState({
    name: '',
    address: '',
    teacherName: '',
    teacherPhone: '',
    province: '',
    city: '',
    county: '',
  });
  const [savingSchoolInfo, setSavingSchoolInfo] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/');
      return;
    }
    
    const userObj = JSON.parse(userData);
    setUser(userObj);
    
    fetchProvinces();
    
    // 志愿者/老师直接获取学校详情
    if (userObj.role === 'volunteer' || userObj.role === 'teacher') {
      fetchMySchoolDetail(userObj);
    } else {
      fetchSchoolsWithUser(userObj);
    }
  }, [router]);
  
  // 志愿者/老师：直接获取归属学校详情
  const fetchMySchoolDetail = async (currentUser: User) => {
    setLoading(true);
    try {
      // 先获取学校列表
      const params = new URLSearchParams();
      params.append('volunteerId', currentUser.id);
      
      const listRes = await fetch(`/api/schools?${params.toString()}`);
      const listData = await listRes.json();
      
      if (listData.success && listData.schools.length > 0) {
        const schoolId = listData.schools[0].id;
        setSchools(listData.schools);
        
        // 获取详情
        const detailRes = await fetch(`/api/schools/${schoolId}`);
        const detailData = await detailRes.json();
        
        if (detailData.school) {
          setSelectedSchool(detailData);
          setSchoolInfoForm({
            name: detailData.school.name || '',
            address: detailData.school.address || '',
            teacherName: detailData.school.teacher_name || '',
            teacherPhone: detailData.school.teacher_phone || '',
            province: detailData.school.province || '',
            city: detailData.school.city || '',
            county: detailData.school.county || '',
          });
        }
      }
    } catch (error) {
      console.error('获取学校详情失败:', error);
      toast.error('获取学校详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取省份列表
  const fetchProvinces = async () => {
    try {
      const res = await fetch('/api/schools/regions');
      const data = await res.json();
      setProvinces(data.provinces || []);
    } catch (error) {
      console.error('获取省份列表失败:', error);
    }
  };

  // 带用户参数的获取学校函数
  const fetchSchoolsWithUser = async (currentUser: User) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // 志愿者只能查看自己归属的学校
      if (currentUser?.role === 'volunteer' || currentUser?.role === 'teacher') {
        params.append('volunteerId', currentUser.id);
      } else {
        // 管理员可以按省市区筛选
        if (filterProvince && filterProvince !== 'all') {
          params.append('province', filterProvince);
        }
        if (filterCity && filterCity !== 'all') {
          params.append('city', filterCity);
        }
        if (filterCounty && filterCounty !== 'all') {
          params.append('county', filterCounty);
        }
        if (searchTerm.trim()) {
          params.append('keyword', searchTerm.trim());
        }
      }

      const res = await fetch(`/api/schools?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setSchools(data.schools);
      }
    } catch (error) {
      console.error('获取学校列表失败:', error);
      toast.error('获取学校列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取城市列表
  const fetchCities = async (province: string) => {
    if (!province || province === 'all') {
      setCities([]);
      setCounties([]);
      return;
    }
    try {
      const res = await fetch(`/api/schools/regions?province=${encodeURIComponent(province)}`);
      const data = await res.json();
      setCities(data.cities || []);
      setCounties([]);
    } catch (error) {
      console.error('获取城市列表失败:', error);
    }
  };

  // 获取区县列表
  const fetchCounties = async (province: string, city: string) => {
    if (!city || city === 'all') {
      setCounties([]);
      return;
    }
    try {
      const res = await fetch(`/api/schools/regions?province=${encodeURIComponent(province)}&city=${encodeURIComponent(city)}`);
      const data = await res.json();
      setCounties(data.counties || []);
    } catch (error) {
      console.error('获取区县列表失败:', error);
    }
  };

  const fetchSchools = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // 志愿者只能查看自己归属的学校
      if (user?.role === 'volunteer' || user?.role === 'teacher') {
        params.append('volunteerId', user.id);
      } else {
        // 管理员可以按省市区筛选
        if (filterProvince && filterProvince !== 'all') {
          params.append('province', filterProvince);
        }
        if (filterCity && filterCity !== 'all') {
          params.append('city', filterCity);
        }
        if (filterCounty && filterCounty !== 'all') {
          params.append('county', filterCounty);
        }
        if (searchTerm.trim()) {
          params.append('keyword', searchTerm.trim());
        }
      }

      const res = await fetch(`/api/schools?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setSchools(data.schools);
      }
    } catch (error) {
      console.error('获取学校列表失败:', error);
      toast.error('获取学校列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (school?: School) => {
    if (school) {
      setEditingSchool(school);
      setFormData({
        name: school.name,
        address: school.address || '',
        teacherName: school.teacher_name || '',
        teacherPhone: school.teacher_phone || '',
        province: school.province || '',
        city: school.city || '',
        county: school.county || '',
      });
      // 编辑时，手机号已存在是正常的，设置状态
      setPhoneStatus({ valid: true, exists: true, message: '当前手机号' });
    } else {
      setEditingSchool(null);
      setFormData({
        name: '',
        address: '',
        teacherName: '',
        teacherPhone: '',
        province: '',
        city: '',
        county: '',
      });
      setPhoneStatus(null);
    }
    setFormErrors({});
    setDialogOpen(true);
  };

  // 验证手机号是否已被使用（防抖）
  const checkPhoneAvailability = async (phone: string) => {
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setPhoneStatus(null);
      return;
    }

    setPhoneChecking(true);
    try {
      const params = new URLSearchParams({ phone });
      // 如果是编辑模式，排除当前学校的手机号
      if (editingSchool) {
        // 获取当前用户的ID（如果有）
        const res = await fetch(`/api/auth/check-phone?${params.toString()}`);
        const data = await res.json();
        
        // 编辑模式下，如果手机号没变，不需要提示
        if (data.exists && editingSchool.teacher_phone === phone) {
          setPhoneStatus({ valid: true, exists: true, message: '当前手机号' });
        } else {
          setPhoneStatus(data);
        }
      } else {
        const res = await fetch(`/api/auth/check-phone?${params.toString()}`);
        const data = await res.json();
        setPhoneStatus(data);
      }
    } catch (error) {
      console.error('验证手机号失败:', error);
    } finally {
      setPhoneChecking(false);
    }
  };

  const handleSubmit = async () => {
    // 验证表单
    const errors: typeof formErrors = {};
    
    if (!formData.name.trim()) {
      errors.name = '请输入学校名称';
    }
    
    if (!formData.province.trim()) {
      errors.province = '请输入省份';
    }
    
    if (!formData.city.trim()) {
      errors.city = '请输入城市';
    }
    
    if (!formData.county.trim()) {
      errors.county = '请输入区县';
    }
    
    if (!formData.address.trim()) {
      errors.address = '请输入详细地址';
    }
    
    if (!formData.teacherPhone.trim()) {
      errors.teacherPhone = '请输入老师手机号';
    } else {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(formData.teacherPhone)) {
        errors.teacherPhone = '请输入正确的手机号格式';
      }
    }
    
    setFormErrors(errors);
    
    // 如果有错误，停止提交
    if (Object.keys(errors).length > 0) {
      toast.error('请检查表单中的错误项');
      return;
    }

    // 检查手机号是否已被占用（新创建时）
    if (!editingSchool && phoneStatus?.exists) {
      toast.error('该手机号已被使用，请更换手机号', { duration: 5000 });
      setFormErrors(prev => ({ ...prev, teacherPhone: phoneStatus.message || '该手机号已被使用' }));
      return;
    }

    // 如果是编辑模式且手机号被其他用户占用
    if (editingSchool && phoneStatus?.exists && phoneStatus.message !== '当前手机号') {
      toast.error('该手机号已被其他用户使用，请更换手机号', { duration: 5000 });
      setFormErrors(prev => ({ ...prev, teacherPhone: phoneStatus.message || '该手机号已被使用' }));
      return;
    }

    try {
      if (editingSchool) {
        // 更新
        const res = await fetch(`/api/schools/${editingSchool.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        
        const data = await res.json();
        
        if (data.success) {
          toast.success('学校信息更新成功');
          fetchSchools();
          setDialogOpen(false);
        } else {
          toast.error(data.error || '更新失败');
        }
      } else {
        // 创建
        const res = await fetch('/api/schools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        
        const data = await res.json();
        
        if (data.success) {
          toast.success('学校创建成功，管理员账号已自动生成');
          fetchSchools();
          setDialogOpen(false);
        } else {
          // 显示具体错误信息
          toast.error(data.error || '创建失败', { duration: 5000 });
          // 如果是手机号被占用，显示在表单错误中
          if (data.error && data.error.includes('手机号')) {
            setFormErrors(prev => ({ ...prev, teacherPhone: data.error }));
          }
        }
      }
    } catch (error) {
      console.error('保存学校失败:', error);
      toast.error('保存失败');
    }
  };

  const handleDelete = async () => {
    if (!deletingSchool) return;

    try {
      const res = await fetch(`/api/schools/${deletingSchool.id}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('学校已删除');
        fetchSchools();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除学校失败:', error);
      toast.error('删除失败');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingSchool(null);
    }
  };

  // 查看学校详情
  const handleViewDetail = async (schoolId: string) => {
    setDetailLoading(true);
    setDetailDialogOpen(true);
    setEditingSchoolInfo(false);
    
    try {
      const res = await fetch(`/api/schools/${schoolId}`);
      const data = await res.json();
      
      if (data.school) {
        setSelectedSchool(data);
        setSchoolInfoForm({
          name: data.school.name || '',
          address: data.school.address || '',
          teacherName: data.school.teacher_name || '',
          teacherPhone: data.school.teacher_phone || '',
          province: data.school.province || '',
          city: data.school.city || '',
          county: data.school.county || '',
        });
      } else {
        toast.error('获取学校详情失败');
        setDetailDialogOpen(false);
      }
    } catch (error) {
      console.error('获取学校详情失败:', error);
      toast.error('获取学校详情失败');
      setDetailDialogOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // 开始编辑学校信息
  const handleStartEditSchoolInfo = () => {
    if (!selectedSchool) return;
    setSchoolInfoForm({
      name: selectedSchool.school.name || '',
      address: selectedSchool.school.address || '',
      teacherName: selectedSchool.school.teacher_name || '',
      teacherPhone: selectedSchool.school.teacher_phone || '',
      province: selectedSchool.school.province || '',
      city: selectedSchool.school.city || '',
      county: selectedSchool.school.county || '',
    });
    setEditingSchoolInfo(true);
  };

  // 取消编辑学校信息
  const handleCancelEditSchoolInfo = () => {
    setEditingSchoolInfo(false);
  };

  // 保存学校信息
  const handleSaveSchoolInfo = async () => {
    if (!selectedSchool) return;
    
    // 验证必填字段
    if (!schoolInfoForm.name.trim()) {
      toast.error('学校名称不能为空');
      return;
    }
    
    if (!schoolInfoForm.province.trim()) {
      toast.error('省份不能为空');
      return;
    }
    
    if (!schoolInfoForm.city.trim()) {
      toast.error('城市不能为空');
      return;
    }
    
    if (!schoolInfoForm.county.trim()) {
      toast.error('区县不能为空');
      return;
    }
    
    if (!schoolInfoForm.address.trim()) {
      toast.error('详细地址不能为空');
      return;
    }

    setSavingSchoolInfo(true);
    
    try {
      const res = await fetch(`/api/schools/${selectedSchool.school.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schoolInfoForm.name,
          address: schoolInfoForm.address,
          teacherName: schoolInfoForm.teacherName,
          teacherPhone: schoolInfoForm.teacherPhone,
          province: schoolInfoForm.province,
          city: schoolInfoForm.city,
          county: schoolInfoForm.county,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('学校信息更新成功');
        setEditingSchoolInfo(false);
        fetchSchools();
        refreshSchoolDetail();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch (error) {
      console.error('更新学校信息失败:', error);
      toast.error('更新失败');
    } finally {
      setSavingSchoolInfo(false);
    }
  };

  // 刷新学校详情
  const refreshSchoolDetail = async () => {
    if (!selectedSchool) return;
    
    try {
      const res = await fetch(`/api/schools/${selectedSchool.school.id}`);
      const data = await res.json();
      
      if (data.school) {
        setSelectedSchool(data);
      }
    } catch (error) {
      console.error('刷新学校详情失败:', error);
    }
  };

  // 打开添加老师对话框
  const handleOpenAddTeacherDialog = (school: School) => {
    setAddTeacherSchool(school);
    setEditingTeacher(null);
    setNewTeacherData({ name: '', phone: '', grade: '', className: '', studentCount: '' });
    setAddTeacherDialogOpen(true);
  };

  // 打开编辑老师对话框
  const handleOpenEditTeacherDialog = (teacher: SchoolDetail['admins'][0]) => {
    setEditingTeacher(teacher);
    setAddTeacherSchool(null);
    setNewTeacherData({
      name: teacher.name || '',
      phone: teacher.username || '',
      grade: teacher.grade || '',
      className: teacher.class_name || '',
      studentCount: teacher.student_count?.toString() || '',
    });
    setAddTeacherDialogOpen(true);
  };

  // 添加或编辑老师
  const handleAddTeacher = async () => {
    const targetSchool = addTeacherSchool || selectedSchool?.school;
    
    // 添加模式需要学校信息
    if (!editingTeacher && !targetSchool?.id) {
      toast.error('学校信息错误，请关闭对话框后重试');
      console.error('添加老师失败: targetSchool 为空', { addTeacherSchool, selectedSchool: selectedSchool?.school });
      return;
    }
    
    // 编辑模式需要学校信息
    if (editingTeacher && !selectedSchool?.school?.id) {
      toast.error('学校信息错误');
      return;
    }
    
    // 验证表单
    const errors: typeof teacherFormErrors = {};
    
    if (!newTeacherData.phone) {
      errors.phone = '请输入手机号';
    } else {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(newTeacherData.phone)) {
        errors.phone = '请输入正确的手机号格式';
      }
    }
    
    if (newTeacherData.studentCount) {
      const num = parseInt(newTeacherData.studentCount);
      if (isNaN(num) || num < 0) {
        errors.studentCount = '请输入有效的学生数量';
      }
    }
    
    setTeacherFormErrors(errors);
    
    // 如果有错误，停止提交
    if (Object.keys(errors).length > 0) {
      toast.error('请检查表单中的错误项');
      return;
    }

    setAddTeacherLoading(true);
    
    try {
      if (editingTeacher) {
        // 编辑老师
        const res = await fetch(`/api/schools/${selectedSchool?.school.id}/teachers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacherId: editingTeacher.id,
            name: newTeacherData.name,
            phone: newTeacherData.phone,
            grade: newTeacherData.grade,
            className: newTeacherData.className,
            studentCount: newTeacherData.studentCount ? parseInt(newTeacherData.studentCount) : null,
          }),
        });
        
        const data = await res.json();
        
        if (data.success) {
          toast.success('老师信息已更新');
          setAddTeacherDialogOpen(false);
          setNewTeacherData({ name: '', phone: '', grade: '', className: '', studentCount: '' });
          setEditingTeacher(null);
          fetchSchools();
          if (selectedSchool) {
            refreshSchoolDetail();
          }
        } else {
          toast.error(data.error || '更新失败');
        }
      } else {
        // 添加老师
        const res = await fetch(`/api/schools/${targetSchool!.id}/teachers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newTeacherData.name,
            phone: newTeacherData.phone,
            grade: newTeacherData.grade,
            className: newTeacherData.className,
            studentCount: newTeacherData.studentCount ? parseInt(newTeacherData.studentCount) : null,
          }),
        });
        
        const data = await res.json();
        
        if (data.success) {
          toast.success('老师添加成功，账号: ' + newTeacherData.phone + '，初始密码: 123456');
          setAddTeacherDialogOpen(false);
          setNewTeacherData({ name: '', phone: '', grade: '', className: '', studentCount: '' });
          setAddTeacherSchool(null);
          fetchSchools();
          if (selectedSchool) {
            refreshSchoolDetail();
          }
        } else {
          toast.error(data.error || '添加失败');
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      toast.error('操作失败，请稍后重试');
    } finally {
      setAddTeacherLoading(false);
    }
  };

  // 删除老师
  const handleDeleteTeacher = async (teacher: SchoolDetail['admins'][0]) => {
    if (!selectedSchool) return;
    
    if (!confirm(`确定要删除老师「${teacher.name || teacher.username}」吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/schools/${selectedSchool.school.id}/teachers?teacherId=${teacher.id}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('老师已删除');
        fetchSchools();
        refreshSchoolDetail();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除老师失败:', error);
      toast.error('删除失败');
    }
  };

  // 打开分配志愿者对话框
  const handleOpenAssignDialog = async (school: School) => {
    setAssigningSchool(school);
    setTeacherVolunteerAssignments({});
    setAssignLoading(true);
    setAssignDialogOpen(true);
    
    try {
      // 获取学校老师-志愿者分配情况
      const res = await fetch(`/api/volunteers/assign?schoolId=${school.id}`);
      const data = await res.json();
      
      if (data.success) {
        setTeachersList(data.teachers || []);
        setAllVolunteersList(data.availableVolunteers || []);
        
        // 根据当前分配情况初始化选择状态
        const assignments: {[key: string]: string[]} = {};
        (data.teachers || []).forEach((teacher: {id: string; volunteers: Array<{id: string}>}) => {
          assignments[teacher.id] = teacher.volunteers.map((v: {id: string}) => v.id);
        });
        setTeacherVolunteerAssignments(assignments);
      } else {
        toast.error('获取分配情况失败');
      }
    } catch (error) {
      console.error('获取分配情况失败:', error);
      toast.error('获取分配情况失败');
    } finally {
      setAssignLoading(false);
    }
  };

  // 切换老师的志愿者选择
  const toggleVolunteerForTeacher = (teacherId: string, volunteerId: string) => {
    setTeacherVolunteerAssignments(prev => {
      const currentList = prev[teacherId] || [];
      const newList = currentList.includes(volunteerId)
        ? currentList.filter(id => id !== volunteerId)
        : [...currentList, volunteerId];
      
      return { ...prev, [teacherId]: newList };
    });
  };

  // 从其他老师那里移除志愿者（因为一个志愿者只能分配给一个老师）
  const removeVolunteerFromOthers = (volunteerId: string, currentTeacherId: string) => {
    setTeacherVolunteerAssignments(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(teacherId => {
        if (teacherId !== currentTeacherId) {
          updated[teacherId] = updated[teacherId].filter(id => id !== volunteerId);
        }
      });
      return updated;
    });
  };

  // 确认分配志愿者
  const handleConfirmAssign = async () => {
    if (!assigningSchool) return;
    
    // 构建分配数据
    const assignments = Object.entries(teacherVolunteerAssignments).map(([teacherId, volunteerIds]) => ({
      teacherId,
      volunteerIds,
    }));

    const totalAssigned = assignments.reduce((sum, a) => sum + a.volunteerIds.length, 0);
    
    setAssignLoading(true);
    
    try {
      const res = await fetch('/api/volunteers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: assigningSchool.id,
          assignments,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(`已更新 ${assigningSchool.name} 的志愿者分配，共 ${totalAssigned} 名志愿者`);
        setAssignDialogOpen(false);
        fetchSchools();
      } else {
        toast.error(data.error || '分配失败');
      }
    } catch (error) {
      console.error('分配志愿者失败:', error);
      toast.error('分配失败');
    } finally {
      setAssignLoading(false);
    }
  };

  // 下载批量上传模板
  const handleDownloadTemplate = () => {
    const template = '学校名称,学校地址,老师姓名,老师手机号\n示例小学,北京市海淀区,张老师,13800138000';
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '学校批量导入模板.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // 处理文件上传
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        // 跳过表头
        const dataLines = lines.slice(1);
        const preview: typeof uploadPreview = [];
        
        for (const line of dataLines) {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 4 && parts[0] && parts[3]) {
            preview.push({
              name: parts[0],
              address: parts[1] || '',
              teacherName: parts[2] || '',
              teacherPhone: parts[3],
            });
          }
        }
        
        if (preview.length === 0) {
          toast.error('未解析到有效数据，请检查文件格式');
          return;
        }
        
        setUploadPreview(preview);
      } catch (error) {
        console.error('解析文件失败:', error);
        toast.error('解析文件失败');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // 执行批量上传
  const handleBatchUpload = async () => {
    if (uploadPreview.length === 0) return;
    
    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const item of uploadPreview) {
      try {
        const res = await fetch('/api/schools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        
        const data = await res.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`创建 ${item.name} 失败:`, data.error);
        }
      } catch (error) {
        failCount++;
        console.error(`创建 ${item.name} 异常:`, error);
      }
    }
    
    setUploading(false);
    setUploadDialogOpen(false);
    setUploadPreview([]);
    
    if (successCount > 0) {
      toast.success(`成功创建 ${successCount} 所学校`);
      fetchSchools();
    }
    if (failCount > 0) {
      toast.error(`${failCount} 所学校创建失败`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/');
  };

  // 处理省份变更
  const handleProvinceChange = (value: string) => {
    setFilterProvince(value);
    setFilterCity('all');
    setFilterCounty('all');
    if (value && value !== 'all') {
      fetchCities(value);
    } else {
      setCities([]);
      setCounties([]);
    }
  };

  // 处理城市变更
  const handleCityChange = (value: string) => {
    setFilterCity(value);
    setFilterCounty('all');
    if (value && value !== 'all' && filterProvince) {
      fetchCounties(filterProvince, value);
    } else {
      setCounties([]);
    }
  };

  // 执行筛选
  const handleFilter = () => {
    fetchSchools();
  };

  // 重置筛选
  const handleResetFilter = () => {
    setFilterProvince('all');
    setFilterCity('all');
    setFilterCounty('all');
    setSearchTerm('');
    setCities([]);
    setCounties([]);
    fetchSchools();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push('/admin/dashboard')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">项目小学</h1>
              <p className="text-xs text-gray-500">{user?.name || user?.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {(user?.role === 'admin' || user?.role === 'super_admin') ? '超级管理员' : 
               user?.role === 'volunteer' ? '志愿者老师' : '助学老师'}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 志愿者/老师只读视图 - 直接显示详情 */}
        {(user?.role === 'volunteer' || user?.role === 'teacher') && (
          <>
            {loading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : !selectedSchool ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center">
                  <Building className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">暂未分配项目小学</p>
                  <p className="text-sm text-gray-400 mt-1">请联系管理员进行分配</p>
                </CardContent>
              </Card>
            ) : (
              <SchoolReadOnlyDetailView 
                schoolDetail={selectedSchool}
                userId={user?.id || ''}
              />
            )}
          </>
        )}
        
        {/* 管理员视图 */}
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
          <>
        {/* 筛选栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* 左侧筛选条件 */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-500">省份</label>
                  <Select value={filterProvince} onValueChange={handleProvinceChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="全部省份" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部省份</SelectItem>
                      {provinces.map((province) => (
                        <SelectItem key={province} value={province}>
                          {province}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-500">城市</label>
                  <Select 
                    value={filterCity} 
                    onValueChange={handleCityChange}
                    disabled={filterProvince === 'all' || cities.length === 0}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="全部城市" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部城市</SelectItem>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-500">区县</label>
                  <Select 
                    value={filterCounty}
                    onValueChange={setFilterCounty}
                    disabled={filterCity === 'all' || counties.length === 0}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="全部区县" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部区县</SelectItem>
                      {counties.map((county) => (
                        <SelectItem key={county} value={county}>
                          {county}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-64">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="搜索学校名称、老师..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleResetFilter}>
                    重置
                  </Button>
                  <Button size="sm" onClick={handleFilter}>
                    筛选
                  </Button>
                </div>
              </div>
              
              {/* 右侧操作按钮 */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-1" />
                  批量上传
                </Button>
                <Button size="sm" onClick={() => handleOpenDialog()}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加学校
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 学校列表 */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : schools.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center">
              <Building className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无学校数据</p>
              <p className="text-sm text-gray-400 mt-1">点击上方「添加学校」创建第一所学校</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {schools.map((school) => (
              <Card key={school.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <Building className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div>
                          <h3 
                            className="font-semibold text-lg text-indigo-600 hover:text-indigo-700 cursor-pointer hover:underline"
                            onClick={() => handleViewDetail(school.id)}
                          >
                            {school.name}
                          </h3>
                          {(school.province || school.city || school.county) && (
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {[school.province, school.city, school.county].filter(Boolean).join(' ')}
                            </p>
                          )}
                          {school.address && (
                            <p className="text-sm text-gray-400">{school.address}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="w-4 h-4" />
                          <span>{school.teacher_name || '未设置'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone className="w-4 h-4" />
                          <span>{school.teacher_phone || '未设置'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Users className="w-4 h-4" />
                          <span>{school.teamCount} 个小队</span>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <Badge variant="outline" className="text-xs">
                          管理员账号: {school.teacher_phone || '未创建'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          初始密码: 123456
                        </Badge>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-500 hover:text-teal-600 hover:bg-teal-50"
                        onClick={() => handleOpenAssignDialog(school)}
                        title="分配志愿者"
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-500 hover:text-green-600 hover:bg-green-50"
                        onClick={() => handleOpenAddTeacherDialog(school)}
                        title="添加老师"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setDeletingSchool(school);
                          setDeleteDialogOpen(true);
                        }}
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 统计信息 */}
        {!loading && schools.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            共 {schools.length} 所项目小学
          </div>
        )}
          </>
        )}
      </main>

      {/* 添加/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchool ? '编辑学校' : '添加学校'}</DialogTitle>
            <DialogDescription>
              {editingSchool 
                ? '修改学校信息和管理员账号' 
                : '创建学校将自动生成管理员账号，手机号为用户名，初始密码为123456'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">学校名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (formErrors.name) {
                    setFormErrors(prev => ({ ...prev, name: undefined }));
                  }
                }}
                onBlur={() => {
                  if (!formData.name.trim()) {
                    setFormErrors(prev => ({ ...prev, name: '请输入学校名称' }));
                  }
                }}
                placeholder="请输入学校名称"
                className={formErrors.name ? 'border-destructive focus-visible:ring-destructive/20' : ''}
              />
              {formErrors.name && (
                <p className="text-sm text-destructive">{formErrors.name}</p>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>省份 *</Label>
                <Input
                  value={formData.province}
                  onChange={(e) => {
                    setFormData({ ...formData, province: e.target.value, city: '', county: '' });
                    if (formErrors.province) {
                      setFormErrors(prev => ({ ...prev, province: undefined }));
                    }
                  }}
                  onBlur={() => {
                    if (!formData.province.trim()) {
                      setFormErrors(prev => ({ ...prev, province: '请输入省份' }));
                    }
                  }}
                  placeholder="如: 浙江省"
                  className={formErrors.province ? 'border-destructive focus-visible:ring-destructive/20' : ''}
                />
                {formErrors.province && (
                  <p className="text-sm text-destructive">{formErrors.province}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>城市 *</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => {
                    setFormData({ ...formData, city: e.target.value, county: '' });
                    if (formErrors.city) {
                      setFormErrors(prev => ({ ...prev, city: undefined }));
                    }
                  }}
                  onBlur={() => {
                    if (!formData.city.trim()) {
                      setFormErrors(prev => ({ ...prev, city: '请输入城市' }));
                    }
                  }}
                  placeholder="如: 杭州市"
                  className={formErrors.city ? 'border-destructive focus-visible:ring-destructive/20' : ''}
                />
                {formErrors.city && (
                  <p className="text-sm text-destructive">{formErrors.city}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>区县 *</Label>
                <Input
                  value={formData.county}
                  onChange={(e) => {
                    setFormData({ ...formData, county: e.target.value });
                    if (formErrors.county) {
                      setFormErrors(prev => ({ ...prev, county: undefined }));
                    }
                  }}
                  onBlur={() => {
                    if (!formData.county.trim()) {
                      setFormErrors(prev => ({ ...prev, county: '请输入区县' }));
                    }
                  }}
                  placeholder="如: 西湖区"
                  className={formErrors.county ? 'border-destructive focus-visible:ring-destructive/20' : ''}
                />
                {formErrors.county && (
                  <p className="text-sm text-destructive">{formErrors.county}</p>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">详细地址 *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => {
                  setFormData({ ...formData, address: e.target.value });
                  if (formErrors.address) {
                    setFormErrors(prev => ({ ...prev, address: undefined }));
                  }
                }}
                onBlur={() => {
                  if (!formData.address.trim()) {
                    setFormErrors(prev => ({ ...prev, address: '请输入详细地址' }));
                  }
                }}
                placeholder="请输入学校详细地址"
                className={formErrors.address ? 'border-destructive focus-visible:ring-destructive/20' : ''}
              />
              {formErrors.address && (
                <p className="text-sm text-destructive">{formErrors.address}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="teacherName">老师姓名</Label>
              <Input
                id="teacherName"
                value={formData.teacherName}
                onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
                placeholder="请输入负责老师姓名"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="teacherPhone">老师手机号 *</Label>
              <div className="relative">
                <Input
                  id="teacherPhone"
                  value={formData.teacherPhone}
                  onChange={(e) => {
                    const phone = e.target.value;
                    setFormData({ ...formData, teacherPhone: phone });
                    if (formErrors.teacherPhone) {
                      setFormErrors(prev => ({ ...prev, teacherPhone: undefined }));
                    }
                    // 重置验证状态
                    setPhoneStatus(null);
                  }}
                  onBlur={() => {
                    if (!formData.teacherPhone.trim()) {
                      setFormErrors(prev => ({ ...prev, teacherPhone: '请输入老师手机号' }));
                    } else {
                      const phoneRegex = /^1[3-9]\d{9}$/;
                      if (!phoneRegex.test(formData.teacherPhone)) {
                        setFormErrors(prev => ({ ...prev, teacherPhone: '请输入正确的手机号格式' }));
                      } else {
                        // 验证手机号是否已被使用
                        checkPhoneAvailability(formData.teacherPhone);
                      }
                    }
                  }}
                  placeholder="作为管理员登录用户名"
                  className={`${formErrors.teacherPhone ? 'border-destructive focus-visible:ring-destructive/20' : ''} ${phoneStatus?.exists && phoneStatus.message !== '当前手机号' ? 'border-orange-500' : ''} ${phoneStatus?.exists === false ? 'border-green-500' : ''}`}
                />
                {/* 验证状态指示器 */}
                {phoneChecking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              {/* 验证状态提示 */}
              {formErrors.teacherPhone ? (
                <p className="text-sm text-destructive">{formErrors.teacherPhone}</p>
              ) : phoneStatus ? (
                phoneStatus.exists ? (
                  phoneStatus.message === '当前手机号' ? (
                    <p className="text-sm text-gray-500">
                      当前手机号（编辑模式）
                    </p>
                  ) : (
                    <p className="text-sm text-orange-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {phoneStatus.message}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    手机号可用
                  </p>
                )
              ) : (
                <p className="text-xs text-gray-500">
                  手机号将作为管理员登录用户名，初始密码为 123456
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>
              {editingSchool ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletingSchool?.name}」吗？
              <br />
              {deletingSchool && (deletingSchool.teamCount > 0 || deletingSchool.adminCount > 0) && (
                <span className="text-red-500">
                  该学校关联了 {deletingSchool.adminCount} 个管理员和 {deletingSchool.teamCount} 个小队，无法删除。
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={deletingSchool !== null && (deletingSchool.teamCount > 0 || deletingSchool.adminCount > 0)}
              className="bg-red-600 hover:bg-red-700"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 学校详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-indigo-500" />
              {selectedSchool?.school.name || '学校详情'}
            </DialogTitle>
            <DialogDescription>
              {selectedSchool?.school.address || '暂无地址信息'}
            </DialogDescription>
          </DialogHeader>
          
          {detailLoading ? (
            <div className="py-12 text-center text-gray-500">加载中...</div>
          ) : selectedSchool ? (
            <div className="space-y-6">
              {/* 基本信息 */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">基本信息</CardTitle>
                    {(user?.role === 'admin' || user?.role === 'super_admin') && !editingSchoolInfo ? (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-gray-500 hover:text-blue-600"
                        onClick={handleStartEditSchoolInfo}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        编辑
                      </Button>
                    ) : editingSchoolInfo ? (
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-gray-500"
                          onClick={handleCancelEditSchoolInfo}
                        >
                          取消
                        </Button>
                        <Button 
                          size="sm" 
                          className="h-7"
                          onClick={handleSaveSchoolInfo}
                          disabled={savingSchoolInfo}
                        >
                          {savingSchoolInfo ? '保存中...' : '保存'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  {editingSchoolInfo && (user?.role === 'admin' || user?.role === 'super_admin') ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>学校名称 *</Label>
                          <Input
                            value={schoolInfoForm.name}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="请输入学校名称"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>详细地址 *</Label>
                          <Input
                            value={schoolInfoForm.address}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, address: e.target.value }))}
                            placeholder="请输入学校详细地址"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>省份 *</Label>
                          <Input
                            value={schoolInfoForm.province || ''}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, province: e.target.value }))}
                            placeholder="如: 浙江省"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>城市 *</Label>
                          <Input
                            value={schoolInfoForm.city || ''}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, city: e.target.value }))}
                            placeholder="如: 杭州市"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>区县 *</Label>
                          <Input
                            value={schoolInfoForm.county || ''}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, county: e.target.value }))}
                            placeholder="如: 西湖区"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>负责老师</Label>
                          <Input
                            value={schoolInfoForm.teacherName}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, teacherName: e.target.value }))}
                            placeholder="请输入负责老师姓名"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>联系电话</Label>
                          <Input
                            value={schoolInfoForm.teacherPhone}
                            onChange={(e) => setSchoolInfoForm(prev => ({ ...prev, teacherPhone: e.target.value }))}
                            placeholder="请输入联系电话"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">学校名称：</span>
                          <span className="font-medium">{selectedSchool.school.name || '未设置'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">所在地区：</span>
                          <span>
                            {[selectedSchool.school.province, selectedSchool.school.city, selectedSchool.school.county]
                              .filter(Boolean).join(' ') || '未设置'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 col-span-2">
                          <Building className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">详细地址：</span>
                          <span>{selectedSchool.school.address || '未设置'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">负责老师：</span>
                          <span>{selectedSchool.school.teacher_name || '未设置'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">联系电话：</span>
                          <span>{selectedSchool.school.teacher_phone || '未设置'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="outline" className="text-xs">
                          管理员账号: {selectedSchool.school.teacher_phone || '未创建'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          初始密码: 123456
                        </Badge>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* 统计数据 */}
              <div className="grid grid-cols-4 gap-3">
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{selectedSchool.stats.adminCount}</div>
                  <div className="text-xs text-gray-500">管理员</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold text-teal-600">{selectedSchool.stats.volunteerCount}</div>
                  <div className="text-xs text-gray-500">志愿者</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{selectedSchool.stats.teamCount}</div>
                  <div className="text-xs text-gray-500">小队</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold text-purple-600">{selectedSchool.stats.themeCount}</div>
                  <div className="text-xs text-gray-500">执行中主题</div>
                </Card>
              </div>

              {/* 详情标签页 */}
              <Tabs defaultValue="teams">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="teams">小队</TabsTrigger>
                  <TabsTrigger value="admins">管理员</TabsTrigger>
                  <TabsTrigger value="themes">执行中主题</TabsTrigger>
                </TabsList>
                
                <TabsContent value="teams" className="mt-4">
                  {selectedSchool.teams.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">暂无小队</div>
                  ) : (
                    (() => {
                      // 按老师分组小队
                      const teacherGroups = new Map<string, {
                        teacher: typeof selectedSchool.teams[0]['teacher'];
                        teams: typeof selectedSchool.teams;
                      }>();
                      
                      // 未分配老师的小队
                      const unassignedTeams: typeof selectedSchool.teams = [];
                      
                      selectedSchool.teams.forEach(team => {
                        if (team.teacher) {
                          const key = team.teacher.id;
                          if (!teacherGroups.has(key)) {
                            teacherGroups.set(key, {
                              teacher: team.teacher,
                              teams: [],
                            });
                          }
                          teacherGroups.get(key)!.teams.push(team);
                        } else {
                          unassignedTeams.push(team);
                        }
                      });
                      
                      // 按年级排序老师分组
                      const sortedGroups = Array.from(teacherGroups.values()).sort((a, b) => {
                        const gradeOrder = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
                        const aIndex = a.teacher?.grade ? gradeOrder.indexOf(a.teacher.grade) : -1;
                        const bIndex = b.teacher?.grade ? gradeOrder.indexOf(b.teacher.grade) : -1;
                        return aIndex - bIndex;
                      });
                      
                      return (
                        <Accordion type="multiple" className="w-full">
                          {sortedGroups.map(group => (
                            <AccordionItem key={group.teacher!.id} value={group.teacher!.id}>
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-blue-500" />
                                  </div>
                                  <div className="text-left">
                                    <div className="font-medium">{group.teacher!.name || group.teacher!.username}</div>
                                    <div className="text-xs text-gray-500">
                                      {group.teacher!.grade && <span>{group.teacher!.grade}</span>}
                                      {group.teacher!.grade && group.teacher!.class_name && <span> · {group.teacher!.class_name}</span>}
                                      <span className="ml-1">({group.teams.length}个小队)</span>
                                    </div>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-2 pt-2">
                                  {group.teams.map(team => (
                                    <Card key={team.id} className="p-3">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium">{team.name || team.code}</div>
                                          <div className="text-xs text-gray-500">
                                            编码: {team.code}
                                            {team.creator && (
                                              <span className="ml-2">
                                                · 创建者: {team.creator.name || team.creator.username}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <Badge variant="outline">{team.points} 积分</Badge>
                                          <Badge variant={team.status === 'active' ? 'default' : 'secondary'}>
                                            {team.status === 'active' ? '活跃' : '暂停'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                          
                          {unassignedTeams.length > 0 && (
                            <AccordionItem value="unassigned">
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                    <Users className="w-4 h-4 text-gray-500" />
                                  </div>
                                  <div className="text-left">
                                    <div className="font-medium text-gray-600">未分配老师</div>
                                    <div className="text-xs text-gray-500">({unassignedTeams.length}个小队)</div>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-2 pt-2">
                                  {unassignedTeams.map(team => (
                                    <Card key={team.id} className="p-3">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium">{team.name || team.code}</div>
                                          <div className="text-xs text-gray-500">
                                            编码: {team.code}
                                            {team.creator && (
                                              <span className="ml-2">
                                                · 创建者: {team.creator.name || team.creator.username}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <Badge variant="outline">{team.points} 积分</Badge>
                                          <Badge variant={team.status === 'active' ? 'default' : 'secondary'}>
                                            {team.status === 'active' ? '活跃' : '暂停'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          )}
                        </Accordion>
                      );
                    })()
                  )}
                </TabsContent>
                
                <TabsContent value="admins" className="mt-4">
                  {(user?.role === 'admin' || user?.role === 'super_admin') && (
                  <div className="flex justify-end mb-3">
                    <Button
                      size="sm"
                      onClick={() => handleOpenAddTeacherDialog(selectedSchool.school)}
                      className="flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      添加老师
                    </Button>
                  </div>
                  )}
                  
                  {selectedSchool.admins.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">暂无管理员</div>
                  ) : (
                    <div className="space-y-3">
                      {selectedSchool.admins.map((admin) => (
                        <Card key={admin.id} className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-blue-500" />
                              </div>
                              <div>
                                <div className="font-medium">{admin.name || admin.username}</div>
                                <div className="text-xs text-gray-500">账号: {admin.username}</div>
                                {(admin.grade || admin.class_name || admin.student_count) && (
                                  <div className="text-xs text-blue-600 mt-0.5">
                                    {admin.grade && <span>{admin.grade}</span>}
                                    {admin.grade && admin.class_name && <span> · </span>}
                                    {admin.class_name && <span>{admin.class_name}</span>}
                                    {(admin.grade || admin.class_name) && admin.student_count && <span> · </span>}
                                    {admin.student_count && <span>{admin.student_count}名学生</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {(admin.role === 'admin' || admin.role === 'super_admin') ? '超级管理员' : '助学老师'}
                              </Badge>
                              {admin.volunteerCount > 0 && (
                                <Badge className="bg-teal-500">
                                  {admin.volunteerCount} 名志愿者
                                </Badge>
                              )}
                              {/* 编辑和删除按钮 */}
                              {admin.role !== 'admin' && (
                                <div className="flex items-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-6 w-6 p-0 text-gray-500 hover:text-blue-600"
                                    onClick={() => handleOpenEditTeacherDialog(admin)}
                                    title="编辑"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-6 w-6 p-0 text-gray-500 hover:text-red-600"
                                    onClick={() => handleDeleteTeacher(admin)}
                                    title="删除"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* 显示关联的志愿者 */}
                          {admin.volunteers && admin.volunteers.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                                <UserPlus className="w-3 h-3" />
                                对接志愿者
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {admin.volunteers.map((volunteer) => (
                                  <Badge key={volunteer.id} variant="secondary" className="text-xs">
                                    {volunteer.name || volunteer.username}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="themes" className="mt-4">
                  {selectedSchool.themes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Target className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p>暂无执行中的主题</p>
                      <p className="text-xs mt-1">小队选择主题后将在此显示</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedSchool.themes.map((theme) => (
                        <Card key={theme.id} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-green-500" />
                              <div>
                                <div className="font-medium">{theme.name}</div>
                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                  <span className="text-indigo-600">
                                    {theme.selection_count} 个小队选择
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Badge className="bg-green-500">
                              执行中
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 批量上传对话框 */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量上传学校</DialogTitle>
            <DialogDescription>
              上传CSV文件批量创建学校，格式：学校名称,学校地址,老师姓名,老师手机号
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                下载模板
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileText className="w-4 h-4 mr-2" />
                选择文件
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
            
            {uploadPreview.length > 0 && (
              <div className="border rounded-lg p-3 max-h-60 overflow-y-auto">
                <div className="text-sm font-medium mb-2">预览 ({uploadPreview.length} 所学校)</div>
                <div className="space-y-1 text-sm">
                  {uploadPreview.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-gray-600">
                      <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                      <span>{item.name}</span>
                      <span className="text-gray-400">-</span>
                      <span>{item.teacherPhone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setUploadDialogOpen(false);
              setUploadPreview([]);
            }}>
              取消
            </Button>
            <Button 
              onClick={handleBatchUpload}
              disabled={uploadPreview.length === 0 || uploading}
            >
              {uploading ? '上传中...' : `确认上传 (${uploadPreview.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分配志愿者对话框 */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-500" />
              为「{assigningSchool?.name}」分配志愿者
            </DialogTitle>
            <DialogDescription>
              将志愿者分配给学校内的助学老师，一个志愿者只能分配给一个老师
            </DialogDescription>
          </DialogHeader>
          
          {assignLoading ? (
            <div className="py-8 text-center text-gray-500">加载中...</div>
          ) : teachersList.length === 0 ? (
            <div className="py-8 text-center">
              <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">该学校暂无助学老师</p>
              <p className="text-xs text-gray-400 mt-1">请先为学校添加管理员账号</p>
            </div>
          ) : (
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {teachersList.map((teacher) => {
                const selectedVolunteers = teacherVolunteerAssignments[teacher.id] || [];
                
                return (
                  <Card key={teacher.id} className="border">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <div className="font-medium">{teacher.name || teacher.username}</div>
                            <div className="text-xs text-gray-500">{(teacher.role === 'admin' || teacher.role === 'super_admin') ? '超级管理员' : '助学老师'}</div>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {selectedVolunteers.length} 名志愿者
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2 px-4 pb-3">
                      <div className="text-xs text-gray-500 mb-2">
                        点击选择志愿者，绿色为已分配（再次点击可取消选择）：
                      </div>
                      {(() => {
                        // 获取当前老师可选的志愿者
                        const allAssignedVolunteers = new Set(
                          Object.values(teacherVolunteerAssignments).flat()
                        );
                        
                        // 已分配给当前老师的志愿者
                        const currentTeacherVolunteers = selectedVolunteers;
                        
                        // 可选的志愿者：未分配的 + 已分配给当前老师的
                        const availableVolunteers = allVolunteersList.filter(volunteer => {
                          if (currentTeacherVolunteers.includes(volunteer.id)) {
                            return true;
                          }
                          if (allAssignedVolunteers.has(volunteer.id)) {
                            return false;
                          }
                          return true;
                        });
                        
                        return availableVolunteers.length === 0 ? (
                          <div className="text-xs text-gray-400 py-2">暂无可分配的志愿者</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {availableVolunteers.map((volunteer) => {
                              const isAssigned = selectedVolunteers.includes(volunteer.id);
                              const isSelectedForUnassign = selectedVolunteerToUnassign === volunteer.id;
                              
                              return (
                                <div
                                  key={volunteer.id}
                                  className={`px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors border relative ${
                                    isAssigned
                                      ? isSelectedForUnassign 
                                        ? 'bg-red-100 border-red-500 text-red-700 ring-2 ring-red-300'
                                        : 'bg-teal-100 border-teal-500 text-teal-700'
                                      : 'bg-white border-gray-200 hover:border-teal-300'
                                  }`}
                                  onClick={() => {
                                    if (isAssigned) {
                                      // 已分配的志愿者：点击选中/取消选中用于取消分配
                                      setSelectedVolunteerToUnassign(
                                        isSelectedForUnassign ? null : volunteer.id
                                      );
                                    } else {
                                      // 未分配的志愿者：分配给当前老师
                                      toggleVolunteerForTeacher(teacher.id, volunteer.id);
                                      removeVolunteerFromOthers(volunteer.id, teacher.id);
                                    }
                                  }}
                                >
                                  {volunteer.name || volunteer.username}
                                  {isAssigned && (
                                    <span className="ml-1 text-xs opacity-60">✓</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                );
              })}
              
              {/* 底部操作区 */}
              <div className="flex items-center justify-between pt-2 border-t">
                {/* 未分配的志愿者提示 */}
                {(() => {
                  const allAssigned = Object.values(teacherVolunteerAssignments).flat();
                  const unassignedCount = allVolunteersList.filter(v => !allAssigned.includes(v.id)).length;
                  return (
                    <div className="text-sm text-gray-500">
                      {unassignedCount > 0 ? (
                        <>还有 <span className="font-medium text-orange-600">{unassignedCount}</span> 名志愿者未分配</>
                      ) : (
                        <span className="text-green-600">所有志愿者已分配</span>
                      )}
                    </div>
                  );
                })()}
                
                {/* 取消分配按钮 */}
                {selectedVolunteerToUnassign && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      // 从所有老师的分配列表中移除该志愿者
                      const volunteer = allVolunteersList.find(v => v.id === selectedVolunteerToUnassign);
                      if (volunteer) {
                        const newAssignments = { ...teacherVolunteerAssignments };
                        Object.keys(newAssignments).forEach(teacherId => {
                          newAssignments[teacherId] = newAssignments[teacherId].filter(
                            id => id !== selectedVolunteerToUnassign
                          );
                        });
                        setTeacherVolunteerAssignments(newAssignments);
                        setSelectedVolunteerToUnassign(null);
                        toast.success(`已取消「${volunteer.name || volunteer.username}」的分配，保存后生效`);
                      }
                    }}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    取消分配
                  </Button>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleConfirmAssign}
              disabled={assignLoading}
            >
              {assignLoading ? '保存中...' : '保存分配'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加/编辑老师对话框 */}
      <Dialog open={addTeacherDialogOpen} onOpenChange={(open) => {
        setAddTeacherDialogOpen(open);
        if (!open) {
          // 对话框关闭时清理状态
          setNewTeacherData({ name: '', phone: '', grade: '', className: '', studentCount: '' });
          setAddTeacherSchool(null);
          setEditingTeacher(null);
          setTeacherFormErrors({});
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-500" />
              {editingTeacher ? '编辑老师信息' : `为「${addTeacherSchool?.name || selectedSchool?.school?.name}」添加老师`}
            </DialogTitle>
            <DialogDescription>
              {editingTeacher ? '修改老师的基本信息' : '添加助学老师，账号为手机号，初始密码为 123456'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="teacherName">姓名</Label>
              <Input
                id="teacherName"
                placeholder="请输入老师姓名"
                value={newTeacherData.name}
                onChange={(e) => {
                  setNewTeacherData(prev => ({ ...prev, name: e.target.value }));
                  if (teacherFormErrors.name) {
                    setTeacherFormErrors(prev => ({ ...prev, name: undefined }));
                  }
                }}
                className={teacherFormErrors.name ? 'border-destructive focus-visible:ring-destructive/20' : ''}
              />
              {teacherFormErrors.name && (
                <p className="text-sm text-destructive">{teacherFormErrors.name}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="teacherPhone">手机号（账号）*</Label>
              <Input
                id="teacherPhone"
                placeholder="请输入手机号"
                value={newTeacherData.phone}
                onChange={(e) => {
                  setNewTeacherData(prev => ({ ...prev, phone: e.target.value }));
                  if (teacherFormErrors.phone) {
                    setTeacherFormErrors(prev => ({ ...prev, phone: undefined }));
                  }
                }}
                onBlur={() => {
                  if (newTeacherData.phone && !/^1[3-9]\d{9}$/.test(newTeacherData.phone)) {
                    setTeacherFormErrors(prev => ({ ...prev, phone: '请输入正确的手机号格式' }));
                  }
                }}
                className={teacherFormErrors.phone ? 'border-destructive focus-visible:ring-destructive/20' : ''}
              />
              {teacherFormErrors.phone ? (
                <p className="text-sm text-destructive">{teacherFormErrors.phone}</p>
              ) : (
                !editingTeacher && (
                  <p className="text-xs text-gray-500">手机号将作为登录账号，初始密码为 123456</p>
                )
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="teacherGrade">对接年级</Label>
                <Input
                  id="teacherGrade"
                  placeholder="如：三年级"
                  value={newTeacherData.grade}
                  onChange={(e) => setNewTeacherData(prev => ({ ...prev, grade: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="teacherClass">对接班级</Label>
                <Input
                  id="teacherClass"
                  placeholder="如：一班"
                  value={newTeacherData.className}
                  onChange={(e) => setNewTeacherData(prev => ({ ...prev, className: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="studentCount">学生数量</Label>
              <Input
                id="studentCount"
                type="number"
                placeholder="请输入对接班级的学生人数"
                value={newTeacherData.studentCount}
                onChange={(e) => {
                  setNewTeacherData(prev => ({ ...prev, studentCount: e.target.value }));
                  if (teacherFormErrors.studentCount) {
                    setTeacherFormErrors(prev => ({ ...prev, studentCount: undefined }));
                  }
                }}
                onBlur={() => {
                  if (newTeacherData.studentCount) {
                    const num = parseInt(newTeacherData.studentCount);
                    if (isNaN(num) || num < 0) {
                      setTeacherFormErrors(prev => ({ ...prev, studentCount: '请输入有效的学生数量' }));
                    }
                  }
                }}
                className={teacherFormErrors.studentCount ? 'border-destructive focus-visible:ring-destructive/20' : ''}
              />
              {teacherFormErrors.studentCount ? (
                <p className="text-sm text-destructive">{teacherFormErrors.studentCount}</p>
              ) : (
                <p className="text-xs text-gray-500">该老师对接年级/班级的学生总人数</p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddTeacherDialogOpen(false);
              setNewTeacherData({ name: '', phone: '', grade: '', className: '', studentCount: '' });
              setAddTeacherSchool(null);
              setEditingTeacher(null);
            }}>
              取消
            </Button>
            <Button 
              onClick={handleAddTeacher}
              disabled={addTeacherLoading}
            >
              {addTeacherLoading 
                ? (editingTeacher ? '保存中...' : '添加中...') 
                : (editingTeacher ? '保存修改' : '确认添加')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
