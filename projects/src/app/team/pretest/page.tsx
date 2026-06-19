'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  ArrowLeft, Loader2, CheckCircle, Clock, Users, Send, ChevronRight, Lightbulb, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

interface Team {
  id: string;
  code: string;
  name: string;
  points: number;
}

interface Question {
  id: string;
  title: string;
  description?: string;
  question_type: 'single_choice' | 'multiple_choice' | 'text' | 'rating';
  options?: { label: string; value: string }[];
  is_required: boolean;
  dimension?: string;
  part?: string;
}

interface MemberStatus {
  id: string;
  name: string;
  answeredCount: number;
  totalQuestions: number;
  isComplete: boolean;
}

interface AssessmentResult {
  memberId: string;
  memberName: string;
  isComplete: boolean;
  dimensionScores: { A: number; B: number; C: number; D: number };
  literacyTotalScore: number;
  literacyLevel: string;
  literacyLevelLabel: string;
  literacyLevelDescription: string;
  weakDimensions: string[];
  weakDimensionSuggestions: Record<string, string>;
}

interface PretestData {
  success: boolean;
  questions: Question[];
  status: { status: string; completed_at?: string } | null;
  membersStatus: MemberStatus[];
  totalQuestions: number;
  responsesByMember: Record<string, Record<string, any>>;
  teamMembers: { id: string; name: string }[];
  allMembersCompleted: boolean;
}

export default function TeamPretestPage() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [data, setData] = useState<PretestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // 评估结果
  const [assessmentResults, setAssessmentResults] = useState<AssessmentResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  
  // 成员选择
  const [currentMember, setCurrentMember] = useState<{ id: string; name: string } | null>(null);
  const [searchName, setSearchName] = useState('');
  
  // 答题状态
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // 加载数据
  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/team/login');
      return;
    }
    
    try {
      const parsed = JSON.parse(teamData);
      setTeam(parsed);
      fetchPretest(parsed.id);
    } catch {
      router.push('/team/login');
    }
  }, []);

  const fetchPretest = async (teamId: string) => {
    try {
      const res = await fetch(`/api/team/pretest?teamId=${teamId}`);
      const result = await res.json();
      
      if (result.success) {
        setData(result);
        
        // 如果所有成员都完成了，获取评估结果
        if (result.allMembersCompleted) {
          setCurrentMember(null);
          fetchAssessmentResults(teamId);
        }
        // 如果当前有选中的成员，检查是否已完成
        else if (currentMember) {
          const memberStatus = result.membersStatus.find(
            (m: any) => m.id === currentMember.id
          );
          if (memberStatus?.isComplete) {
            // 当前成员已完成，切换到成员选择
            setCurrentMember(null);
          }
        }
      } else {
        toast.error(result.error || '获取问卷失败');
      }
    } catch (error) {
      console.error('获取问卷失败:', error);
      toast.error('获取问卷失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取AI素养评估结果
  const fetchAssessmentResults = async (teamId: string) => {
    setLoadingResults(true);
    try {
      const res = await fetch(`/api/team/pretest/results?teamId=${teamId}`);
      const result = await res.json();
      if (result.success && result.results) {
        setAssessmentResults(result.results);
      }
    } catch (error) {
      console.error('获取评估结果失败:', error);
    } finally {
      setLoadingResults(false);
    }
  };

  // 选择成员
  const handleSelectMember = (member: { id: string; name: string }) => {
    setCurrentMember(member);
    setSearchName('');
    
    // 加载该成员已保存的答案
    if (data?.responsesByMember && data.responsesByMember[member.name]) {
      setAnswers(data.responsesByMember[member.name]);
    } else {
      setAnswers({});
    }
    setCurrentQuestionIndex(0);
  };

  // 选择答案
  const handleSelectAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  // 提交所有答案
  const handleSubmitAll = async () => {
    if (!team || !currentMember) return;

    // 检查是否所有题目都已回答
    const unansweredRequired = data?.questions.filter(q => 
      q.is_required && (!answers[q.id] || answers[q.id] === '')
    ) || [];

    if (unansweredRequired.length > 0) {
      toast.error(`请完成所有必填题目，还剩 ${unansweredRequired.length} 题未答`);
      // 跳转到第一道未答的题目
      const firstUnanswered = data?.questions.findIndex(q => 
        q.is_required && (!answers[q.id] || answers[q.id] === '')
      );
      if (firstUnanswered !== undefined && firstUnanswered >= 0) {
        setCurrentQuestionIndex(firstUnanswered);
      }
      return;
    }

    setSubmitting(true);
    
    try {
      // 逐题提交
      for (const question of data!.questions) {
        const answer = answers[question.id];
        if (answer === undefined || answer === null || answer === '') continue;

        const res = await fetch('/api/team/pretest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: team.id,
            memberName: currentMember.name,
            questionId: question.id,
            answer,
          }),
        });

        const result = await res.json();
        if (!result.success) {
          toast.error(`提交第 ${data!.questions.indexOf(question) + 1} 题失败`);
          setSubmitting(false);
          return;
        }
      }

      // 重新获取数据检查所有成员状态
      await fetchPretest(team.id);
      
      toast.success('提交成功！');
      
      // 检查是否所有成员都完成了
      const updatedData = await fetch(`/api/team/pretest?teamId=${team.id}`).then(r => r.json());
      
      if (updatedData.allMembersCompleted) {
        // 所有成员都完成了，显示完成页面
        toast.success('恭喜！所有成员已完成前测问卷！');
      } else {
        // 还有其他成员未完成，返回成员选择页面
        toast.success('你已完成前测问卷！');
        setCurrentMember(null);
      }
    } catch (error) {
      console.error('提交失败:', error);
      toast.error('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 计算当前成员的答题进度
  const getCurrentMemberProgress = () => {
    if (!currentMember || !data) return { answered: 0, total: 0, percent: 0 };
    
    const answered = Object.keys(answers).filter(k => 
      answers[k] !== undefined && answers[k] !== null && answers[k] !== ''
    ).length;
    const total = data.questions.length;
    return { answered, total, percent: total > 0 ? (answered / total) * 100 : 0 };
  };

  // 获取已完成的成员数
  const getCompletedCount = () => {
    return data?.membersStatus.filter(m => m.isComplete).length || 0;
  };

  // 获取待填写的成员数
  const getPendingCount = () => {
    return data?.membersStatus.filter(m => !m.isComplete).length || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-500" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  // 没有题目
  if (!data?.questions || data.questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-8">
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/team/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">学生前测问卷</h1>
          </div>
        </nav>
        
        <main className="max-w-7xl mx-auto py-6">
          <Card className="border-0 shadow-lg max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <p className="text-gray-600 mb-4">暂无前测问卷</p>
              <Button onClick={() => router.push('/team/dashboard')}>
                返回首页
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // 所有成员已完成 - 显示评估结果
  if (data?.allMembersCompleted) {
    const literacyLevelColors: Record<string, string> = {
      advanced: 'text-green-600 bg-green-50 border-green-200',
      intermediate: 'text-blue-600 bg-blue-50 border-blue-200',
      beginner: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      developing: 'text-red-600 bg-red-50 border-red-200',
    };

    const dimensionLabels: Record<string, string> = {
      A: '情感与态度',
      B: '使用与协作',
      C: '认知与理解',
      D: '伦理与责任',
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-8">
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/team/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">AI素养评估结果</h1>
          </div>
        </nav>
        
        <main className="max-w-4xl mx-auto py-6 px-4">
          {/* 完成提示 */}
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardContent className="pt-6 pb-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-green-700 mb-2">前测已完成</h2>
              <p className="text-gray-600 mb-2">所有小队成员已完成AI素养评估</p>
              <div className="bg-green-100 rounded-lg px-6 py-3 inline-block mb-4">
                <p className="text-green-700 font-medium">小队已获得 +10 积分奖励</p>
              </div>
            </CardContent>
          </Card>

          {/* 评估结果加载中 */}
          {loadingResults && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-500" />
              <p className="text-gray-500">正在计算评估结果...</p>
            </div>
          )}

          {/* 评估结果展示 */}
          {!loadingResults && assessmentResults.length > 0 && (
            <>
              {/* 每个成员的详细结果 */}
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-500" />
                成员详细结果
              </h3>
              <div className="space-y-4">
                {assessmentResults.filter(r => r.isComplete).map((result) => {
                  return (
                    <Card key={result.memberId} className="border-0 shadow-lg overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-purple-400 to-indigo-400" />
                      <CardContent className="pt-5">
                        {/* 成员名和素养水平 */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-lg">
                              📋
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-900">{result.memberName}</h4>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-sm font-medium ${literacyLevelColors[result.literacyLevel] || 'bg-gray-100 text-gray-600'}`}>
                            素养: {result.literacyLevelLabel}
                          </div>
                        </div>

                        {/* 素养维度得分 */}
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-600 mb-2">素养维度 ({result.literacyTotalScore}/48)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(result.dimensionScores).map(([dim, score]) => (
                              <div key={dim} className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                                result.weakDimensions.includes(dim) ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                              }`}>
                                <span>{dimensionLabels[dim]}</span>
                                <span className={`font-medium ${result.weakDimensions.includes(dim) ? 'text-red-600' : 'text-gray-700'}`}>
                                  {score}/12
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 发展建议 */}
                        {result.weakDimensions.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
                              <Lightbulb className="w-4 h-4" />
                              发展建议
                            </p>
                            <div>
                              <p className="text-xs text-amber-600 mb-1">短板维度提升：</p>
                              {result.weakDimensions.map(dim => (
                                <p key={dim} className="text-xs text-gray-600 ml-2">
                                  · {dimensionLabels[dim]}：{result.weakDimensionSuggestions[dim]}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* 无结果数据时显示简单完成页 */}
          {!loadingResults && assessmentResults.length === 0 && (
            <Card className="border-0 shadow-lg max-w-lg mx-auto bg-gradient-to-r from-green-50 to-emerald-50">
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-green-700 mb-2">前测已完成</h2>
                <p className="text-gray-600 mb-2">
                  所有小队成员已完成前测问卷
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  完成时间：{data.status?.completed_at ? new Date(data.status.completed_at).toLocaleString('zh-CN') : '-'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* 底部操作 */}
          <div className="text-center mt-6">
            <Button 
              size="lg" 
              onClick={() => router.push('/team/dashboard')}
              className="bg-gradient-to-r from-purple-500 to-indigo-500"
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              开始探索主题
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 成员选择页面
  if (!currentMember) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-8">
        {/* 顶部导航 */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/team/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">学生前测问卷</h1>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-4 md:py-6">
          {/* 进度概览 */}
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  <span className="font-medium">填写进度</span>
                </div>
                <span className="text-sm text-gray-500">
                  {getCompletedCount()} / {data?.membersStatus.length || 0} 人已完成
                </span>
              </div>
              <Progress
                value={getCompletedCount() / (data?.membersStatus.length || 1) * 100}
                className="h-2"
              />
              <p className="text-sm text-gray-500 mt-2">
                请每位小队成员都填写前测问卷，全部完成后才能选择探索主题
              </p>
            </CardContent>
          </Card>

          {/* 成员选择卡片 */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="text-lg">填写前测问卷</CardTitle>
              <CardDescription>请选择你的姓名</CardDescription>
            </CardHeader>
            <CardContent>
              {/* 姓名搜索 */}
              <div className="mb-4">
                <Label htmlFor="memberName">你的姓名</Label>
                <Input
                  id="memberName"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="输入姓名搜索..."
                  className="mt-1"
                />
              </div>

              {/* 已完成成员 */}
              {getCompletedCount() > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">已完成 ({getCompletedCount()})</p>
                  <div className="grid gap-2">
                    {data?.membersStatus.filter(m => m.isComplete).map(member => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-green-600">已完成</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 待填写成员 */}
              {getPendingCount() > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">
                    {getCompletedCount() > 0 ? '其他成员' : '待填写'} ({getPendingCount()})
                  </p>
                  <div className="space-y-2">
                    {(() => {
                      // 过滤待填写的成员
                      let pending = (data?.membersStatus || []).filter((m: any) => !m.isComplete);
                      
                      // 如果有搜索，优先显示匹配的
                      if (searchName.trim()) {
                        const matched = pending.filter((m: any) => 
                          m.name.toLowerCase().includes(searchName.toLowerCase())
                        );
                        if (matched.length > 0) {
                          pending = matched;
                        }
                      }
                      
                      return (
                        <>
                          {pending.map((member: any) => (
                            <div
                              key={member.id}
                              onClick={() => handleSelectMember({ id: member.id, name: member.name })}
                              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                                searchName.trim() && member.name.toLowerCase().includes(searchName.toLowerCase())
                                  ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                                  : 'bg-white hover:bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                  <Clock className="w-5 h-5 text-purple-500" />
                                </div>
                                <div className="text-left">
                                  <p className="font-medium">{member.name}</p>
                                  <p className="text-sm text-gray-500">
                                    已答 {member.answeredCount} / {member.totalQuestions} 题
                                  </p>
                                </div>
                              </div>
                              <div
                                className="px-4 py-2 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectMember({ id: member.id, name: member.name });
                                }}
                              >
                                {member.answeredCount > 0 ? '继续填写' : '开始填写'}
                              </div>
                            </div>
                          ))}
                          {/* 搜索无结果提示 */}
                          {searchName.trim() && pending.length === 0 && (
                            <div className="text-center py-4 text-gray-500">
                              未找到匹配的成员 "{searchName}"
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // 答题页面
  const currentQuestion = data?.questions[currentQuestionIndex];
  const progress = getCurrentMemberProgress();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-8">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setCurrentMember(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold">学生前测问卷</h1>
          </div>
          <Badge variant="outline" className="text-sm">
            {currentMember.name}
          </Badge>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 进度卡片 */}
        <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-purple-50 to-indigo-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">
                {currentMember.name} 的答题进度
              </span>
              <span className="text-sm text-purple-600">
                {progress.answered} / {progress.total}
              </span>
            </div>
            <Progress value={progress.percent} className="h-2" />
          </CardContent>
        </Card>

        {/* 题目卡片 */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-semibold">
                  {currentQuestionIndex + 1}
                </div>
                <CardTitle className="text-lg">
                  第 {currentQuestionIndex + 1} 题 / 共 {data?.questions.length} 题
                </CardTitle>
              </div>
              {currentQuestion?.is_required && (
                <Badge variant="destructive">必填</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 题目内容 */}
            <div>
              <h3 className="text-xl font-medium mb-2">{currentQuestion?.title}</h3>
              {currentQuestion?.description && (
                <p className="text-gray-500 text-sm mb-4">{currentQuestion.description}</p>
              )}
              <Badge className="mb-4">
                {currentQuestion?.question_type === 'single_choice' && '单选'}
                {currentQuestion?.question_type === 'multiple_choice' && '多选'}
                {currentQuestion?.question_type === 'text' && '文本'}
                {currentQuestion?.question_type === 'rating' && '评分'}
              </Badge>
            </div>

            {/* 答案选项 */}
            <div className="space-y-3">
              {/* 单选题 */}
              {currentQuestion?.question_type === 'single_choice' && currentQuestion.options && (
                <RadioGroup
                  value={answers[currentQuestion.id] || ''}
                  onValueChange={(value) => handleSelectAnswer(currentQuestion.id, value)}
                >
                  {currentQuestion.options.map((option, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        answers[currentQuestion.id] === option.value
                          ? 'bg-purple-50 border-purple-300'
                          : 'hover:bg-gray-50 border-gray-200'
                      }`}
                      onClick={() => handleSelectAnswer(currentQuestion.id, option.value)}
                    >
                      <RadioGroupItem value={option.value} id={`option-${idx}`} />
                      <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer font-normal">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {/* 多选题 */}
              {currentQuestion?.question_type === 'multiple_choice' && currentQuestion.options && (
                <div className="space-y-2">
                  {currentQuestion.options.map((option, idx) => {
                    const selectedValues = Array.isArray(answers[currentQuestion.id]) 
                      ? answers[currentQuestion.id] 
                      : [];
                    const isSelected = selectedValues.includes(option.value);
                    
                    return (
                      <div 
                        key={idx}
                        onClick={() => {
                          const newValues = isSelected 
                            ? selectedValues.filter((v: any) => v !== option.value)
                            : [...selectedValues, option.value];
                          handleSelectAnswer(currentQuestion.id, newValues);
                        }}
                        className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-purple-50 border-purple-300'
                            : 'hover:bg-gray-50 border-gray-200'
                        }`}
                      >
                        <Checkbox checked={isSelected} />
                        <span className="flex-1">{option.label}</span>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-500 mt-2">可选择多个答案</p>
                </div>
              )}

              {/* 文本题 */}
              {currentQuestion?.question_type === 'text' && (
                <Textarea
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleSelectAnswer(currentQuestion.id, e.target.value)}
                  placeholder="请输入你的回答..."
                  rows={4}
                />
              )}

              {/* 评分题 */}
              {currentQuestion?.question_type === 'rating' && (
                <div className="flex items-center gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                    <button
                      key={score}
                      onClick={() => handleSelectAnswer(currentQuestion.id, score)}
                      className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
                        answers[currentQuestion.id] === score
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-purple-100'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <span className="text-sm text-gray-500">
                    {answers[currentQuestion.id] ? `${answers[currentQuestion.id]} 分` : '请评分'}
                  </span>
                </div>
              )}
            </div>

            {/* 导航按钮 */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
              >
                上一题
              </Button>
              
              {currentQuestionIndex < (data?.questions.length || 0) - 1 ? (
                <Button
                  onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                >
                  下一题
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmitAll}
                  disabled={submitting}
                  className="bg-gradient-to-r from-purple-500 to-indigo-500"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  提交全部
                </Button>
              )}
            </div>

            {/* 题目快速跳转 */}
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 mb-2">快速跳转</p>
              <div className="flex flex-wrap gap-2">
                {data?.questions.map((q, idx) => {
                  const hasAnswer = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== '';
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                        idx === currentQuestionIndex
                          ? 'bg-purple-500 text-white'
                          : hasAnswer
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
