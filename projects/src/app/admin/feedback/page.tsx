'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  ArrowLeft, Download, FileText, Loader2, Search, CheckSquare,
  Calendar, Users, School, User, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  school_id?: string;
}

interface Feedback {
  id: string;
  teamId: string;
  teamName: string;
  schoolName: string;
  volunteerName: string;
  teacherName: string;
  taskId: string;
  memberId: string;
  memberName: string;
  memberRole: string;
  formId: string;
  formName: string;
  formIcon: string;
  formData: Record<string, any>;
  submittedAt: string;
}

// 角色配置
const ROLE_CONFIG: Record<string, { label: string; icon: string }> = {
  guider: { label: '指引者', icon: '🧭' },
  light_mage: { label: '光影法师', icon: '✨' },
  secret_scholar: { label: '秘语学者', icon: '📚' },
};

export default function FeedbackPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 筛选条件
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterFormId, setFilterFormId] = useState<string>('all');

  // 详情弹窗
  const [detailFeedback, setDetailFeedback] = useState<Feedback | null>(null);

  // 滚动位置记忆
  useScrollPosition('admin-feedback');

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
      fetchFeedbacks();
    }
  }, [admin]);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('userId', admin?.id || '');
      params.append('userRole', admin?.role || '');
      if (admin?.school_id) {
        params.append('schoolId', admin.school_id);
      }

      const res = await fetch(`/api/admin/feedback?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setFeedbacks(data.feedbacks || []);
      }
    } catch (error) {
      console.error('获取反馈列表失败:', error);
      toast.error('获取反馈列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 筛选后的反馈列表
  const filteredFeedbacks = feedbacks.filter(f => {
    // 关键词搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const match = 
        f.teamName.toLowerCase().includes(keyword) ||
        f.schoolName.toLowerCase().includes(keyword) ||
        f.memberName.toLowerCase().includes(keyword) ||
        f.volunteerName.toLowerCase().includes(keyword) ||
        f.teacherName.toLowerCase().includes(keyword);
      if (!match) return false;
    }

    // 表单筛选
    if (filterFormId !== 'all' && f.formId !== filterFormId) {
      return false;
    }

    return true;
  });

  // 获取所有表单（用于筛选下拉框）
  const uniqueForms = Array.from(new Map(feedbacks.map(f => [f.formId, { id: f.formId, name: f.formName, icon: f.formIcon }])).values());

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFeedbacks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFeedbacks.map(f => f.id)));
    }
  };

  // 切换单个选择
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 导出Excel
  const handleExport = async (ids?: string[]) => {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/feedback/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: admin?.id,
          userRole: admin?.role,
          schoolId: admin?.school_id,
          feedbackIds: ids,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || '导出失败');
        return;
      }

      // 下载文件
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `反馈数据_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 批量导出选中项
  const handleExportSelected = () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要导出的反馈');
      return;
    }
    handleExport(Array.from(selectedIds));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">反馈查看</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportSelected}
              disabled={exporting || selectedIds.size === 0}
              className="hidden sm:inline-flex"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <CheckSquare className="w-4 h-4 mr-1" />
              )}
              导出选中 ({selectedIds.size})
            </Button>
            <Button
              onClick={() => handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              <span className="hidden sm:inline">导出全部</span>
              <span className="sm:hidden">导出</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 筛选栏 */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="搜索小队、学校、成员..."
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <Select value={filterFormId} onValueChange={setFilterFormId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="筛选表单" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部表单</SelectItem>
                    {uniqueForms.map(form => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.icon} {form.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-gray-500">
                共 {filteredFeedbacks.length} 条记录
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 反馈列表 */}
        {filteredFeedbacks.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>暂无反馈数据</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {/* 表头 */}
              <div className="grid grid-cols-[auto,1fr,auto] gap-4 px-4 py-3 bg-gray-50 border-b font-medium text-sm text-gray-600">
                <Checkbox
                  checked={selectedIds.size === filteredFeedbacks.length && filteredFeedbacks.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <div className="grid grid-cols-6 gap-4">
                  <span>小队名称</span>
                  <span>学校</span>
                  <span>成员</span>
                  <span>表单</span>
                  <span>提交时间</span>
                  <span>操作</span>
                </div>
                <span></span>
              </div>

              {/* 数据行 */}
              <div className="divide-y">
                {filteredFeedbacks.map((feedback) => (
                  <div
                    key={feedback.id}
                    className="grid grid-cols-[auto,1fr,auto] gap-4 px-4 py-3 hover:bg-gray-50 items-center"
                  >
                    <Checkbox
                      checked={selectedIds.has(feedback.id)}
                      onCheckedChange={() => toggleSelect(feedback.id)}
                    />
                    <div className="grid grid-cols-6 gap-4 items-center text-sm">
                      <div>
                        <p className="font-medium">{feedback.teamName}</p>
                        <p className="text-xs text-gray-500">
                          志愿者: {feedback.volunteerName || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1">
                          <School className="w-3 h-3 text-gray-400" />
                          {feedback.schoolName || '-'}
                        </p>
                        <p className="text-xs text-gray-500">
                          老师: {feedback.teacherName || '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {ROLE_CONFIG[feedback.memberRole]?.icon || '👤'}
                        </span>
                        <div>
                          <p className="font-medium">{feedback.memberName}</p>
                          <p className="text-xs text-gray-500">
                            {ROLE_CONFIG[feedback.memberRole]?.label || feedback.memberRole}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>{feedback.formIcon}</span>
                        <span>{feedback.formName}</span>
                      </div>
                      <div className="text-gray-500">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {new Date(feedback.submittedAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailFeedback(feedback)}
                        >
                          查看
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExport([feedback.id])}
                          disabled={exporting}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <span></span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* 详情弹窗 */}
      <Dialog open={!!detailFeedback} onOpenChange={() => setDetailFeedback(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>反馈详情</DialogTitle>
            <DialogDescription>
              {detailFeedback?.teamName} - {detailFeedback?.memberName}
            </DialogDescription>
          </DialogHeader>
          {detailFeedback && (
            <div className="space-y-4">
              {/* 上下文信息 */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">小队名称</p>
                  <p className="font-medium">{detailFeedback.teamName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">所属学校</p>
                  <p className="font-medium">{detailFeedback.schoolName || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">对接志愿者</p>
                  <p className="font-medium">{detailFeedback.volunteerName || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">助学老师</p>
                  <p className="font-medium">{detailFeedback.teacherName || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">成员姓名</p>
                  <p className="font-medium">
                    {ROLE_CONFIG[detailFeedback.memberRole]?.icon} {detailFeedback.memberName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">提交时间</p>
                  <p className="font-medium">
                    {new Date(detailFeedback.submittedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>

              {/* 表单数据 */}
              <div>
                <h4 className="font-medium mb-3">表单内容</h4>
                <div className="space-y-3">
                  {Object.entries(detailFeedback.formData || {}).map(([key, value]) => (
                    <div key={key} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">{key}</p>
                      <p className="text-sm">
                        {Array.isArray(value) ? value.join('、') : String(value || '-')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
