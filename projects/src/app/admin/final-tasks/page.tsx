'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import {
  ArrowLeft, Plus, Trophy, Edit, Trash2, X, GripVertical,
  Type, AlignLeft, List, CheckSquare, Star, Upload,
  Loader2, Save, Globe, Building, Copy, ToggleLeft, Users, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
}

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'rating' | 'file' | 'boolean';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // 用于 radio 和 checkbox
  maxRating?: number; // 用于 rating
}

// 小队角色类型定义（与小队成员角色一致）
type TeamRoleType = 'guider' | 'light_mage' | 'secret_scholar';

// 小队角色配置
const TEAM_ROLES: Record<TeamRoleType, { name: string; icon: string; description: string }> = {
  guider: { name: '指引者', icon: '🧭', description: '小队的方向引领者' },
  light_mage: { name: '光影法师', icon: '✨', description: '掌控光影之力的法师' },
  secret_scholar: { name: '秘语学者', icon: '📚', description: '探索知识的学者' },
};

interface FinalTaskForm {
  id: string;
  name: string;
  description: string;
  icon: string;
  is_global: boolean;
  school_id: string | null;
  team_role: TeamRoleType | null; // 适用的小队角色，null 表示通用表单
  form_config: FormField[];
  created_at: string;
  updated_at: string;
  usageCount?: number;
}

// 表单字段类型配置
const FIELD_TYPES: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  text: { label: '单行文本', icon: <Type className="w-4 h-4" />, description: '适合简短回答' },
  textarea: { label: '多行文本', icon: <AlignLeft className="w-4 h-4" />, description: '适合详细描述' },
  radio: { label: '单选题', icon: <List className="w-4 h-4" />, description: '从选项中选择一个' },
  checkbox: { label: '多选题', icon: <CheckSquare className="w-4 h-4" />, description: '从选项中选择多个' },
  boolean: { label: '判断题', icon: <ToggleLeft className="w-4 h-4" />, description: '是/否二选一' },
  rating: { label: '评分', icon: <Star className="w-4 h-4" />, description: '1-5星评分' },
  file: { label: '文件上传', icon: <Upload className="w-4 h-4" />, description: '上传图片或文档' },
};

// 默认表单字段
const DEFAULT_FIELD: Omit<FormField, 'id'> = {
  type: 'text',
  label: '',
  placeholder: '',
  required: false,
};

// 生成唯一ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export default function FinalTasksPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [forms, setForms] = useState<FinalTaskForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 编辑状态
  const [showEditor, setShowEditor] = useState(false);
  const [showViewer, setShowViewer] = useState(false); // 查看详情弹窗
  const [editingForm, setEditingForm] = useState<FinalTaskForm | null>(null);
  const [viewingForm, setViewingForm] = useState<FinalTaskForm | null>(null); // 查看的表单
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    icon: string;
    isGlobal: boolean;
    teamRole: TeamRoleType | null;
    fields: FormField[];
  }>({
    name: '',
    description: '',
    icon: '🏆',
    isGlobal: true,
    teamRole: null,
    fields: [],
  });

  // 滚动位置记忆
  useScrollPosition('admin-final-tasks');

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
      fetchForms();
    }
  }, [admin]);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('createdBy', admin?.id || '');
      params.append('role', admin?.role || '');
      if (admin?.school_id) {
        params.append('schoolId', admin.school_id);
      }

      const res = await fetch(`/api/admin/final-tasks?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setForms(data.forms || []);
      }
    } catch (error) {
      console.error('获取表单列表失败:', error);
      toast.error('获取表单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开查看详情
  const handleViewDetail = (form: FinalTaskForm) => {
    setViewingForm(form);
    setShowViewer(true);
  };

  // 打开新建表单
  const handleCreate = () => {
    setEditingForm(null);
    setFormData({
      name: '',
      description: '',
      icon: '🏆',
      isGlobal: (admin?.role === 'admin' || admin?.role === 'super_admin'),
      teamRole: null,
      fields: [
        { id: generateId(), type: 'textarea', label: '请总结本次主题学习的收获', placeholder: '请详细描述你在本次主题学习中的收获和感悟...', required: true },
        { id: generateId(), type: 'rating', label: '你对本主题的满意程度', required: true, maxRating: 5 },
      ],
    });
    setShowEditor(true);
  };

  // 打开编辑表单
  const handleEdit = (form: FinalTaskForm) => {
    if (admin?.role !== 'admin') {
      toast.error('您没有编辑权限');
      return;
    }
    setEditingForm(form);
    setFormData({
      name: form.name,
      description: form.description || '',
      icon: form.icon || '🏆',
      isGlobal: form.is_global,
      teamRole: form.team_role,
      fields: form.form_config || [],
    });
    setShowEditor(true);
  };

  // 复制表单
  const handleCopy = (form: FinalTaskForm) => {
    if (admin?.role !== 'admin') {
      toast.error('您没有复制权限');
      return;
    }
    setEditingForm(null);
    setFormData({
      name: `${form.name} (副本)`,
      description: form.description || '',
      icon: form.icon || '🏆',
      isGlobal: form.is_global,
      teamRole: form.team_role,
      fields: form.form_config.map(f => ({ ...f, id: generateId() })),
    });
    setShowEditor(true);
  };

  // 删除表单
  const handleDelete = async (form: FinalTaskForm) => {
    if (admin?.role !== 'admin') {
      toast.error('您没有删除权限');
      return;
    }
    if (form.usageCount && form.usageCount > 0) {
      toast.error(`该表单已被 ${form.usageCount} 个主题引用，无法删除`);
      return;
    }

    if (!confirm(`确定要删除表单「${form.name}」吗？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/final-tasks/${form.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': admin?.role || '',
        },
      });

      const data = await res.json();

      if (data.success) {
        toast.success('删除成功');
        fetchForms();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 添加字段
  const addField = (type: FormField['type']) => {
    const newField: FormField = {
      id: generateId(),
      type,
      label: '',
      placeholder: '',
      required: false,
      ...(type === 'radio' || type === 'checkbox' ? { options: ['选项1', '选项2'] } : {}),
      ...(type === 'rating' ? { maxRating: 5 } : {}),
      ...(type === 'boolean' ? { options: ['是', '否'] } : {}),
    };
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
  };

  // 更新字段
  const updateField = (index: number, updates: Partial<FormField>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === index ? { ...f, ...updates } : f),
    }));
  };

  // 删除字段
  const removeField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  // 添加选项
  const addOption = (fieldIndex: number) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => {
        if (i === fieldIndex && f.options) {
          return { ...f, options: [...f.options, `选项${f.options.length + 1}`] };
        }
        return f;
      }),
    }));
  };

  // 更新选项
  const updateOption = (fieldIndex: number, optionIndex: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => {
        if (i === fieldIndex && f.options) {
          return { ...f, options: f.options.map((o, j) => j === optionIndex ? value : o) };
        }
        return f;
      }),
    }));
  };

  // 删除选项
  const removeOption = (fieldIndex: number, optionIndex: number) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => {
        if (i === fieldIndex && f.options && f.options.length > 2) {
          return { ...f, options: f.options.filter((_, j) => j !== optionIndex) };
        }
        return f;
      }),
    }));
  };

  // 保存表单
  const handleSave = async () => {
    if (admin?.role !== 'admin') {
      toast.error('您没有保存权限');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('请输入表单名称');
      return;
    }

    if (formData.fields.length === 0) {
      toast.error('请至少添加一个表单字段');
      return;
    }

    // 检查所有字段是否有标签
    const emptyLabels = formData.fields.filter(f => !f.label.trim());
    if (emptyLabels.length > 0) {
      toast.error('请为所有字段填写标签');
      return;
    }

    setSaving(true);
    try {
      const url = editingForm
        ? `/api/admin/final-tasks/${editingForm.id}`
        : '/api/admin/final-tasks';
      const method = editingForm ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          icon: formData.icon,
          isGlobal: formData.isGlobal,
          teamRole: formData.teamRole,
          schoolId: admin?.school_id,
          createdBy: admin?.id,
          role: admin?.role, // 添加角色信息
          formConfig: formData.fields,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(data.message);
        setShowEditor(false);
        fetchForms();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 判断是否可编辑
  const canEdit = (form: FinalTaskForm) => {
    // 只有管理员可以编辑
    if (admin?.role !== 'admin') return false;
    return true;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">最后任务设计</h1>
          </div>
          {(admin?.role === 'admin' || admin?.role === 'super_admin') && (
            <Button size="sm" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">新建表单</span>
              <span className="sm:hidden">新建</span>
            </Button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 说明卡片 */}
        <Card className="border-0 shadow-sm mb-6 bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Trophy className="w-5 h-5 text-amber-500 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">最后任务反馈表单</p>
                <p>设计主题结束后的反馈表单，小队在完成最后任务时需要填写。可以为不同主题配置不同的反馈表单。</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 只读权限提示（非管理员时显示） */}
        {admin?.role !== 'admin' && (
          <Card className="border-0 shadow-sm mb-6 bg-blue-50 border-blue-200">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-500 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">只读权限提示</p>
                  <p>您当前的角色是 {admin?.role === 'teacher' ? '助学老师' : '志愿者'}，拥有只读权限。可以查看最后任务表单的内容和配置，但不能执行新建、编辑、复制、删除等操作。如需修改表单，请联系超级管理员。</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 表单列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : forms.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center">
              <Trophy className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-gray-500 mb-4">暂无最后任务表单</p>
              {(admin?.role === 'admin' || admin?.role === 'super_admin') && (
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4 mr-1" />
                  创建第一个表单
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.map(form => (
              <Card
                key={form.id}
                className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewDetail(form)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{form.icon}</span>
                      <div>
                        <CardTitle className="text-base">{form.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {form.is_global ? (
                            <Badge variant="secondary" className="text-xs">
                              <Globe className="w-3 h-3 mr-1" />
                              全局
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Building className="w-3 h-3 mr-1" />
                              专属
                            </Badge>
                          )}
                          {form.team_role && TEAM_ROLES[form.team_role] && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              {TEAM_ROLES[form.team_role].icon} {TEAM_ROLES[form.team_role].name}
                            </Badge>
                          )}
                          {form.usageCount && form.usageCount > 0 && (
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              已使用 {form.usageCount} 次
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {form.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{form.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {form.form_config?.length || 0} 个字段
                    </p>
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()} // 防止点击按钮时触发卡片点击
                    >
                      {(admin?.role === 'admin' || admin?.role === 'super_admin') && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(form)}
                            title="复制"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {canEdit(form) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(form)}
                                title="编辑"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(form)}
                                className="text-red-500 hover:text-red-600"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* 表单编辑器弹窗 */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingForm ? '编辑表单' : '新建表单'}
            </DialogTitle>
            <DialogDescription>
              设计最后任务的反馈表单，小队在完成最后任务时需要填写
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* 基本信息 */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>表单名称 *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：主题学习总结反馈"
                  />
                </div>
                <div className="space-y-2">
                  <Label>图标</Label>
                  <Input
                    value={formData.icon}
                    onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="🏆"
                    className="w-20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>表单描述</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="简要描述表单用途..."
                  rows={2}
                />
              </div>

              {(admin?.role === 'admin' || admin?.role === 'super_admin') && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isGlobal"
                    checked={formData.isGlobal}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isGlobal: !!checked }))}
                  />
                  <Label htmlFor="isGlobal" className="text-sm">
                    全局表单（所有学校可用）
                  </Label>
                </div>
              )}

              {/* 小队角色选择 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  适用角色
                </Label>
                <Select
                  value={formData.teamRole || 'all'}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    teamRole: value === 'all' ? null : (value as TeamRoleType) 
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择适用角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <span>🌐</span>
                        <span>通用表单（所有角色）</span>
                      </div>
                    </SelectItem>
                    {Object.entries(TEAM_ROLES).map(([key, role]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span>{role.icon}</span>
                          <span>{role.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  {formData.teamRole 
                    ? `仅 ${TEAM_ROLES[formData.teamRole]?.name} 角色的成员填写此表单` 
                    : '所有角色的小队成员都会填写此表单'}
                </p>
              </div>
            </div>

            {/* 字段列表 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>表单字段</Label>
                <div className="flex items-center gap-1">
                  {Object.entries(FIELD_TYPES).map(([type, config]) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => addField(type as FormField['type'])}
                      title={config.description}
                    >
                      {config.icon}
                    </Button>
                  ))}
                </div>
              </div>

              {formData.fields.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg text-gray-400">
                  <p>点击上方按钮添加字段</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.fields.map((field, index) => (
                    <Card key={field.id} className="border">
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          {/* 字段头部 */}
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                            <Badge variant="outline" className="flex items-center gap-1">
                              {FIELD_TYPES[field.type]?.icon}
                              {FIELD_TYPES[field.type]?.label}
                            </Badge>
                            <div className="flex-1" />
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`required-${field.id}`}
                                checked={field.required}
                                onCheckedChange={(checked) => updateField(index, { required: !!checked })}
                              />
                              <Label htmlFor={`required-${field.id}`} className="text-xs">
                                必填
                              </Label>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeField(index)}
                              className="text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>

                          {/* 字段标签 */}
                          <div className="space-y-1">
                            <Label className="text-xs">字段标签</Label>
                            <Input
                              value={field.label}
                              onChange={(e) => updateField(index, { label: e.target.value })}
                              placeholder="请输入字段标签..."
                            />
                          </div>

                          {/* 占位符（文本类字段） */}
                          {(field.type === 'text' || field.type === 'textarea') && (
                            <div className="space-y-1">
                              <Label className="text-xs">占位符</Label>
                              <Input
                                value={field.placeholder || ''}
                                onChange={(e) => updateField(index, { placeholder: e.target.value })}
                                placeholder="输入提示文字..."
                              />
                            </div>
                          )}

                          {/* 选项（单选/多选） */}
                          {(field.type === 'radio' || field.type === 'checkbox') && (
                            <div className="space-y-2">
                              <Label className="text-xs">选项</Label>
                              <div className="space-y-1">
                                {field.options?.map((option, optIndex) => (
                                  <div key={optIndex} className="flex items-center gap-2">
                                    <Input
                                      value={option}
                                      onChange={(e) => updateOption(index, optIndex, e.target.value)}
                                      className="flex-1"
                                    />
                                    {field.options && field.options.length > 2 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeOption(index, optIndex)}
                                        className="text-red-500"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addOption(index)}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                添加选项
                              </Button>
                            </div>
                          )}

                          {/* 判断题选项 */}
                          {field.type === 'boolean' && (
                            <div className="space-y-2">
                              <Label className="text-xs">选项标签（二选一）</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={field.options?.[0] || '是'}
                                  onChange={(e) => {
                                    const newOptions = [...(field.options || ['是', '否'])];
                                    newOptions[0] = e.target.value;
                                    updateField(index, { options: newOptions });
                                  }}
                                  className="flex-1"
                                  placeholder="肯定选项"
                                />
                                <span className="text-gray-400">/</span>
                                <Input
                                  value={field.options?.[1] || '否'}
                                  onChange={(e) => {
                                    const newOptions = [...(field.options || ['是', '否'])];
                                    newOptions[1] = e.target.value;
                                    updateField(index, { options: newOptions });
                                  }}
                                  className="flex-1"
                                  placeholder="否定选项"
                                />
                              </div>
                              <p className="text-xs text-gray-400">例如：是/否、对/错、同意/不同意</p>
                            </div>
                          )}

                          {/* 最大评分（评分字段） */}
                          {field.type === 'rating' && (
                            <div className="space-y-1">
                              <Label className="text-xs">最大评分</Label>
                              <Select
                                value={String(field.maxRating || 5)}
                                onValueChange={(value) => updateField(index, { maxRating: parseInt(value) })}
                              >
                                <SelectTrigger className="w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="3">3 星</SelectItem>
                                  <SelectItem value="5">5 星</SelectItem>
                                  <SelectItem value="10">10 分</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 查看详情弹窗 */}
      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewingForm?.icon} {viewingForm?.name}
            </DialogTitle>
            <DialogDescription>
              最后任务反馈表单详情
            </DialogDescription>
          </DialogHeader>

          {viewingForm && (
            <div className="space-y-6 py-4">
              {/* 基本信息 */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">表单名称</Label>
                  <p className="mt-1 text-sm text-gray-700">{viewingForm.name}</p>
                </div>

                {viewingForm.description && (
                  <div>
                    <Label className="text-sm font-medium">表单描述</Label>
                    <p className="mt-1 text-sm text-gray-700">{viewingForm.description}</p>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {viewingForm.is_global ? (
                      <>
                        <Globe className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700">全局表单</span>
                      </>
                    ) : (
                      <>
                        <Building className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700">专属表单</span>
                      </>
                    )}
                  </div>

                  {viewingForm.team_role && TEAM_ROLES[viewingForm.team_role] && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        {TEAM_ROLES[viewingForm.team_role].icon} {TEAM_ROLES[viewingForm.team_role].name}
                      </Badge>
                    </div>
                  )}

                  {viewingForm.usageCount && viewingForm.usageCount > 0 && (
                    <Badge className="bg-blue-100 text-blue-700">
                      已使用 {viewingForm.usageCount} 次
                    </Badge>
                  )}
                </div>

                <div className="text-xs text-gray-400">
                  创建时间：{new Date(viewingForm.created_at).toLocaleString('zh-CN')}
                  {viewingForm.updated_at && viewingForm.updated_at !== viewingForm.created_at && (
                    <> · 更新时间：{new Date(viewingForm.updated_at).toLocaleString('zh-CN')}</>
                  )}
                </div>
              </div>

              {/* 字段列表 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>表单字段 ({viewingForm.form_config?.length || 0} 个)</Label>
                </div>

                {viewingForm.form_config && viewingForm.form_config.length > 0 ? (
                  <div className="space-y-3">
                    {viewingForm.form_config.map((field, index) => (
                      <Card key={field.id} className="border border-gray-200">
                        <CardContent className="pt-4">
                          <div className="space-y-3">
                            {/* 字段头部 */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">#{index + 1}</span>
                                <Badge variant="outline" className="flex items-center gap-1">
                                  {FIELD_TYPES[field.type]?.icon}
                                  {FIELD_TYPES[field.type]?.label}
                                </Badge>
                                {field.required && (
                                  <Badge variant="secondary" className="text-xs">
                                    必填
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* 字段标签 */}
                            <div>
                              <Label className="text-xs">字段标签</Label>
                              <p className="mt-1 text-sm text-gray-700">{field.label}</p>
                            </div>

                            {/* 占位符（文本类字段） */}
                            {(field.type === 'text' || field.type === 'textarea') && field.placeholder && (
                              <div>
                                <Label className="text-xs">占位符</Label>
                                <p className="mt-1 text-sm text-gray-500">{field.placeholder}</p>
                              </div>
                            )}

                            {/* 选项（单选/多选/判断题） */}
                            {(field.type === 'radio' || field.type === 'checkbox' || field.type === 'boolean') && field.options && (
                              <div>
                                <Label className="text-xs">选项</Label>
                                <div className="mt-1 space-y-1">
                                  {field.options.map((option, optIndex) => (
                                    <div key={optIndex} className="text-sm text-gray-700 flex items-center gap-2">
                                      <span className="text-gray-400">{String.fromCharCode(65 + optIndex)}.</span>
                                      <span>{option}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 最大评分（评分字段） */}
                            {field.type === 'rating' && field.maxRating && (
                              <div>
                                <Label className="text-xs">最大评分</Label>
                                <p className="mt-1 text-sm text-gray-700">{field.maxRating} 星</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg text-gray-400">
                    <p>此表单没有配置字段</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            {(admin?.role === 'admin' || admin?.role === 'super_admin') && viewingForm && (
              <Button
                variant="default"
                onClick={() => {
                  setShowViewer(false);
                  handleEdit(viewingForm);
                }}
              >
                <Edit className="w-4 h-4 mr-1" />
                编辑
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowViewer(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
