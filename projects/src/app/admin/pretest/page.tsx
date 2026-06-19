'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { useResponsive } from '@/hooks/use-responsive';
import { 
  ArrowLeft, Plus, Search, Edit, Trash2, 
  GripVertical, Loader2, CheckCircle, X, Save, Eye, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id: string;
  title: string;
  description?: string;
  question_type: 'single_choice' | 'multiple_choice' | 'text' | 'rating';
  options?: { label: string; value: string }[];
  is_required: boolean;
  order_index: number;
  is_active: boolean;
}

interface PretestStats {
  totalQuestions: number;
  activeQuestions: number;
  totalResponses: number;
  completedTeams: number;
  pendingTeams: number;
}

export default function AdminPretestPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<PretestStats>({
    totalQuestions: 0,
    activeQuestions: 0,
    totalResponses: 0,
    completedTeams: 0,
    pendingTeams: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 新增/编辑题目
  const [showEditor, setShowEditor] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionForm, setQuestionForm] = useState({
    title: '',
    description: '',
    question_type: 'single_choice' as Question['question_type'],
    options: [{ label: '', value: '' }],
    is_required: true,
  });
  
  // 搜索筛选
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  
  // 滚动位置记忆
  useScrollPosition('admin-pretest');
  
  // 响应式布局
  const responsive = useResponsive();

  // 加载数据
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [questionsRes, statsRes] = await Promise.all([
        fetch('/api/admin/pretest/questions'),
        fetch('/api/admin/pretest/stats'),
      ]);
      
      const questionsData = await questionsRes.json();
      const statsData = await statsRes.json();
      
      if (questionsData.success) {
        setQuestions(questionsData.questions || []);
      }
      
      if (statsData.success) {
        setStats(statsData.stats || {
          totalQuestions: 0,
          activeQuestions: 0,
          totalResponses: 0,
          completedTeams: 0,
          pendingTeams: 0,
        });
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      toast.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 新增题目
  const handleAddQuestion = () => {
    setEditingQuestion(null);
    setQuestionForm({
      title: '',
      description: '',
      question_type: 'single_choice',
      options: [{ label: '', value: '' }],
      is_required: true,
    });
    setShowEditor(true);
  };

  // 编辑题目
  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setQuestionForm({
      title: question.title,
      description: question.description || '',
      question_type: question.question_type,
      options: question.options || [{ label: '', value: '' }],
      is_required: question.is_required,
    });
    setShowEditor(true);
  };

  // 保存题目
  const handleSaveQuestion = async () => {
    if (!questionForm.title.trim()) {
      toast.error('请输入题目内容');
      return;
    }
    
    if ((questionForm.question_type === 'single_choice' || questionForm.question_type === 'multiple_choice') 
        && questionForm.options.length < 2) {
      toast.error('选择题至少需要2个选项');
      return;
    }

    setSaving(true);
    try {
      const url = editingQuestion 
        ? `/api/admin/pretest/questions/${editingQuestion.id}`
        : '/api/admin/pretest/questions';
      
      const method = editingQuestion ? 'PUT' : 'POST';
      
      // 处理选项（过滤空选项）
      const options = questionForm.options
        .filter(opt => opt.label.trim())
        .map((opt, idx) => ({
          label: opt.label.trim(),
          value: opt.value.trim() || `opt_${idx}`,
        }));

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...questionForm,
          options: ['single_choice', 'multiple_choice'].includes(questionForm.question_type) ? options : null,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        toast.success(editingQuestion ? '题目已更新' : '题目已添加');
        setShowEditor(false);
        fetchData();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      console.error('保存失败:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 删除题目
  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('确定要删除这道题目吗？')) return;
    
    try {
      const res = await fetch(`/api/admin/pretest/questions/${questionId}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('题目已删除');
        fetchData();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    }
  };

  // 切换题目激活状态
  const handleToggleActive = async (questionId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/pretest/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(!currentActive ? '题目已激活' : '题目已禁用');
        fetchData();
      }
    } catch (error) {
      console.error('更新失败:', error);
      toast.error('更新失败');
    }
  };

  // 添加选项
  const handleAddOption = () => {
    setQuestionForm({
      ...questionForm,
      options: [...questionForm.options, { label: '', value: '' }],
    });
  };

  // 移除选项
  const handleRemoveOption = (index: number) => {
    setQuestionForm({
      ...questionForm,
      options: questionForm.options.filter((_, i) => i !== index),
    });
  };

  // 更新选项
  const handleUpdateOption = (index: number, field: 'label' | 'value', value: string) => {
    const newOptions = [...questionForm.options];
    newOptions[index][field] = value;
    setQuestionForm({ ...questionForm, options: newOptions });
  };

  // 筛选题目
  const filteredQuestions = questions.filter(q => {
    const matchKeyword = q.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                        (q.description || '').toLowerCase().includes(searchKeyword.toLowerCase());
    const matchType = typeFilter === 'all' || q.question_type === typeFilter;
    return matchKeyword && matchType;
  });

  // 题目类型标签
  const typeLabels: Record<string, { label: string; color: string }> = {
    single_choice: { label: '单选', color: 'bg-blue-100 text-blue-700' },
    multiple_choice: { label: '多选', color: 'bg-purple-100 text-purple-700' },
    text: { label: '文本', color: 'bg-green-100 text-green-700' },
    rating: { label: '评分', color: 'bg-orange-100 text-orange-700' },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/admin/dashboard')}
            className="shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900">学生前测</h1>
          </div>
          <Button onClick={handleAddQuestion} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            添加题目
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/pretest/results')}>
            <BarChart3 className="w-4 h-4 mr-1" />
            评估结果
          </Button>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 md:px-4 py-4 md:py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.totalQuestions}</p>
              <p className="text-sm text-gray-500">题目总数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.activeQuestions}</p>
              <p className="text-sm text-gray-500">已激活</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.totalResponses}</p>
              <p className="text-sm text-gray-500">回答总数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.completedTeams}</p>
              <p className="text-sm text-gray-500">已完成小队</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.pendingTeams}</p>
              <p className="text-sm text-gray-500">待填写小队</p>
            </CardContent>
          </Card>
        </div>

        {/* 说明 */}
        <Card className="mb-6 border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-2">前测问卷说明</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• 激活的题目将作为小队的前测问卷内容</li>
              <li>• 每个小队成员都需要填写问卷（不区分角色）</li>
              <li>• 完成前测是小队选择任务主题的前置条件</li>
              <li>• 题目顺序可通过拖拽调整</li>
            </ul>
          </CardContent>
        </Card>

        {/* 筛选栏 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <Input
              placeholder="搜索题目..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="题目类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="single_choice">单选</SelectItem>
              <SelectItem value="multiple_choice">多选</SelectItem>
              <SelectItem value="text">文本</SelectItem>
              <SelectItem value="rating">评分</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 题目列表 */}
        {filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">暂无题目</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={handleAddQuestion}
              >
                <Plus className="w-4 h-4 mr-1" />
                添加第一道题目
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredQuestions.map((question, index) => (
              <Card 
                key={question.id} 
                className={`${!question.is_active ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* 拖拽手柄 */}
                    <div className="shrink-0 text-gray-400 cursor-move pt-1">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    
                    {/* 题号 */}
                    <div className="shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </div>
                    
                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge className={typeLabels[question.question_type]?.color}>
                          {typeLabels[question.question_type]?.label}
                        </Badge>
                        {question.is_required && (
                          <Badge variant="destructive">必填</Badge>
                        )}
                        {!question.is_active && (
                          <Badge variant="secondary">已禁用</Badge>
                        )}
                      </div>
                      
                      <h4 className="font-medium text-gray-900 mb-1">{question.title}</h4>
                      
                      {question.description && (
                        <p className="text-sm text-gray-500 mb-2">{question.description}</p>
                      )}
                      
                      {/* 选项预览 */}
                      {question.options && question.options.length > 0 && (
                        <div className="text-sm text-gray-600 space-y-1">
                          {question.options.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-gray-400">
                                {question.question_type === 'multiple_choice' ? '☐' : '○'}
                              </span>
                              <span>{opt.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="shrink-0 flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleToggleActive(question.id, question.is_active)}
                      >
                        {question.is_active ? (
                          <span className="text-green-600">已启用</span>
                        ) : (
                          <span className="text-gray-400">已禁用</span>
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditQuestion(question)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteQuestion(question.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
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
      </main>

      {/* 编辑器对话框 */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <CardHeader>
              <CardTitle>{editingQuestion ? '编辑题目' : '添加题目'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 题目内容 */}
              <div>
                <Label htmlFor="title">题目内容 *</Label>
                <Textarea
                  id="title"
                  value={questionForm.title}
                  onChange={(e) => setQuestionForm({ ...questionForm, title: e.target.value })}
                  placeholder="请输入题目内容..."
                  rows={2}
                  className="mt-1"
                />
              </div>
              
              {/* 题目描述 */}
              <div>
                <Label htmlFor="description">题目描述（可选）</Label>
                <Textarea
                  id="description"
                  value={questionForm.description}
                  onChange={(e) => setQuestionForm({ ...questionForm, description: e.target.value })}
                  placeholder="补充说明或示例..."
                  rows={2}
                  className="mt-1"
                />
              </div>
              
              {/* 题目类型 */}
              <div>
                <Label>题目类型 *</Label>
                <Select 
                  value={questionForm.question_type} 
                  onValueChange={(value: Question['question_type']) => 
                    setQuestionForm({ ...questionForm, question_type: value })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_choice">单选题</SelectItem>
                    <SelectItem value="multiple_choice">多选题</SelectItem>
                    <SelectItem value="text">文本回答</SelectItem>
                    <SelectItem value="rating">评分题</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* 选项（单选题/多选题） */}
              {['single_choice', 'multiple_choice'].includes(questionForm.question_type) && (
                <div>
                  <Label>选项 *</Label>
                  <div className="space-y-2 mt-1">
                    {questionForm.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          placeholder="选项文字"
                          value={option.label}
                          onChange={(e) => handleUpdateOption(index, 'label', e.target.value)}
                          className="flex-1"
                        />
                        {questionForm.options.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOption(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={handleAddOption}>
                      <Plus className="w-4 h-4 mr-1" />
                      添加选项
                    </Button>
                  </div>
                </div>
              )}
              
              {/* 是否必填 */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_required"
                  checked={questionForm.is_required}
                  onCheckedChange={(checked) => 
                    setQuestionForm({ ...questionForm, is_required: !!checked })
                  }
                />
                <Label htmlFor="is_required" className="cursor-pointer">
                  必填题目
                </Label>
              </div>
              
              {/* 按钮 */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowEditor(false)}>
                  取消
                </Button>
                <Button onClick={handleSaveQuestion} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  <Save className="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
