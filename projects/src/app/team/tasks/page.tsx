'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, Clock, CheckCircle, AlertCircle, Star, 
  Download, Filter, Calendar, MapPin, FileText, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
  currentThemeId?: string;
  currentTaskId?: string;
}

interface Theme {
  id: string;
  name: string;
  icon: string;
}

interface Submission {
  id: string;
  task_id: string;
  task_title: string;
  task_stage: number;
  theme_id: string;
  theme_name: string;
  theme_icon: string;
  content: string;
  status: string;
  rating?: string;
  review_comment: string;
  created_at: string;
  reviewed_at?: string;
  file_urls: Array<{ type: string; url: string; name?: string }>;
}

export default function TasksPage() {
  // 页面滚动位置记忆
  useScrollPosition();
  
  // 响应式布局
  const responsive = useResponsive();

  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 筛选状态
  const [themeFilter, setThemeFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/');
      return;
    }
    
    const teamObj = JSON.parse(teamData);
    setTeam(teamObj);
    fetchSubmissions(teamObj.id);
    fetchThemes();
  }, [router]);

  const fetchSubmissions = async (teamId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions?teamId=${teamId}`);
      const data = await res.json();
      if (data.submissions) {
        setSubmissions(data.submissions);
      }
    } catch (error) {
      console.error('获取提交记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchThemes = async () => {
    try {
      const res = await fetch('/api/themes');
      const data = await res.json();
      setThemes(data.themes || []);
    } catch (error) {
      console.error('获取主题列表失败:', error);
    }
  };

  // 获取状态徽章
  const getStatusBadge = (status: string, rating?: string) => {
    if (status === 'approved') {
      if (rating === 'excellent') {
        return <Badge className="bg-purple-500">优秀</Badge>;
      }
      return <Badge className="bg-green-500">合格</Badge>;
    }
    if (status === 'rejected') {
      return <Badge className="bg-red-500">需修改</Badge>;
    }
    return <Badge className="bg-yellow-500">待审核</Badge>;
  };

  // 获取状态图标
  const getStatusIcon = (status: string, rating?: string) => {
    if (status === 'approved') {
      if (rating === 'excellent') {
        return <Star className="w-5 h-5 text-purple-500" />;
      }
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (status === 'rejected') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    return <Clock className="w-5 h-5 text-yellow-500" />;
  };

  // 时间筛选
  const filterByTime = (dateStr: string) => {
    if (timeFilter === 'all') return true;
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    switch (timeFilter) {
      case 'today':
        return diffDays === 0;
      case 'week':
        return diffDays <= 7;
      case 'month':
        return diffDays <= 30;
      default:
        return true;
    }
  };

  // 筛选后的提交记录
  const filteredSubmissions = submissions.filter(s => {
    const matchesTheme = themeFilter === 'all' || s.theme_id === themeFilter;
    const matchesTime = filterByTime(s.reviewed_at || s.created_at);
    return matchesTheme && matchesTime;
  });

  // 导出任务记录
  const handleExport = async () => {
    if (filteredSubmissions.length === 0) {
      toast.error('暂无数据可导出');
      return;
    }

    // 构建 CSV 内容
    const headers = ['任务名称', '任务阶段', '任务主题', '提交时间', '审核状态', '审核时间', '老师评语'];
    const rows = filteredSubmissions.map(s => [
      s.task_title,
      `第${s.task_stage}阶段`,
      s.theme_name,
      new Date(s.created_at).toLocaleString('zh-CN'),
      s.status === 'approved' ? (s.rating === 'excellent' ? '优秀' : '合格') : 
        s.status === 'rejected' ? '需修改' : '待审核',
      s.reviewed_at ? new Date(s.reviewed_at).toLocaleString('zh-CN') : '-',
      s.review_comment || '-',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 添加 BOM 以支持中文
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `任务记录_${team?.name || '小队'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  };

  // 获取已出现的主题列表（用于筛选）
  const submissionThemes = [...new Set(submissions.map(s => s.theme_id))];
  const filterThemes = themes.filter(t => submissionThemes.includes(t.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden md:inline">返回</span>
            </Button>
            <h1 className="text-lg font-bold">我的任务</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredSubmissions.length === 0}
          >
            <Download className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">导出记录</span>
          </Button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 任务阶段概览 */}
        {team && (
          <Card className="border-0 shadow-lg mb-4 sm:mb-6">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-base sm:text-lg truncate">{team.name}</h2>
                    <p className="text-xs sm:text-sm text-gray-500">小队编码: {team.code}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 sm:gap-2 justify-end">
                    <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
                    <span className="font-bold text-lg sm:text-xl">{team.points || 0}</span>
                    <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">积分</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 筛选区域 */}
        <Card className="border-0 shadow-md mb-4 sm:mb-6">
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-1 sm:gap-2">
                <Filter className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                <span className="text-xs sm:text-sm text-gray-600">筛选：</span>
              </div>
              
              {/* 任务主题筛选 */}
              <Select value={themeFilter} onValueChange={setThemeFilter}>
                <SelectTrigger className="w-28 sm:w-40 text-xs sm:text-sm">
                  <SelectValue placeholder="任务主题" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部主题</SelectItem>
                  {filterThemes.map(theme => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.icon} {theme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 时间筛选 */}
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="w-28 sm:w-40 text-xs sm:text-sm">
                  <SelectValue placeholder="反馈时间" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部时间</SelectItem>
                  <SelectItem value="today">今天</SelectItem>
                  <SelectItem value="week">最近一周</SelectItem>
                  <SelectItem value="month">最近一月</SelectItem>
                </SelectContent>
              </Select>

              {/* 统计信息 */}
              <div className="ml-auto text-xs sm:text-sm text-gray-500">
                共 {filteredSubmissions.length} 条
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 任务记录列表 */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              任务记录
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">查看你的任务提交记录和审核状态</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 sm:py-12">
                <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-blue-500" />
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-gray-500">
                <Star className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-300" />
                <p className="text-sm sm:text-base">{submissions.length === 0 ? '还没有提交任何任务' : '没有符合条件的记录'}</p>
                <p className="text-xs sm:text-sm mt-1 sm:mt-2">
                  {submissions.length === 0 ? '完成当前任务后上传你的成果吧！' : '请调整筛选条件'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredSubmissions.map((submission) => (
                  <Card key={submission.id} className="border hover:shadow-md transition-shadow">
                    <CardContent className="pt-3 sm:pt-4">
                      {/* 任务标题和状态 */}
                      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          {getStatusIcon(submission.status, submission.rating)}
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm sm:text-lg truncate">{submission.task_title}</h3>
                            <div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                第{submission.task_stage}阶段
                              </Badge>
                              {submission.theme_name && (
                                <Badge variant="outline" className="text-xs bg-gray-50">
                                  {submission.theme_icon} {submission.theme_name}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(submission.status, submission.rating)}
                      </div>
                      
                      {/* 时间信息 */}
                      <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>提交: {new Date(submission.created_at).toLocaleString('zh-CN')}</span>
                        </div>
                        {submission.reviewed_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>审核: {new Date(submission.reviewed_at).toLocaleString('zh-CN')}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* 提交内容 */}
                      {submission.content && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {submission.content}
                        </p>
                      )}

                      {/* 附件数量 */}
                      {submission.file_urls && submission.file_urls.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                          <FileText className="w-3 h-3" />
                          <span>{submission.file_urls.length} 个附件</span>
                        </div>
                      )}
                      
                      {/* 老师评语 */}
                      {submission.review_comment && (
                        <div className={`p-3 rounded-lg ${
                          submission.status === 'approved' 
                            ? 'bg-green-50 border border-green-100' 
                            : 'bg-orange-50 border border-orange-100'
                        }`}>
                          <p className="text-sm">
                            <span className="font-semibold">老师评语：</span>
                            {submission.review_comment}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
