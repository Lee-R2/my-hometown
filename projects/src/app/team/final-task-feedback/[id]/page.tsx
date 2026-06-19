'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
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
  ArrowLeft, Loader2, CheckCircle, Clock, Users, Upload, Star, Send
} from 'lucide-react';
import { toast } from 'sonner';

interface Team {
  id: string;
  code: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'rating' | 'file' | 'boolean';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  maxRating?: number;
}

interface FormConfig {
  id: string;
  name: string;
  description?: string;
  icon: string;
  team_role: string | null;
  form_config: FormField[];
}

interface MemberStatus {
  memberId: string;
  memberName: string;
  memberRole: string;
  needsToSubmit: boolean;
  hasSubmitted: boolean;
  submittedAt: string | null;
  formData: Record<string, any> | null;
  formId: string | null;
  formName: string;
  formIcon: string;
}

interface FeedbackStatus {
  hasForm: boolean;
  forms: FormConfig[];
  formByRole: Record<string, FormConfig>;
  genericForm: FormConfig | null;
  memberStatus: MemberStatus[];
  summary: {
    totalRequired: number;
    submittedCount: number;
    allSubmitted: boolean;
  };
  contextInfo?: {
    teamName: string;
    schoolName: string;
    volunteerName: string;
    teacherName: string;
  };
}

// 角色配置
const ROLE_CONFIG: Record<string, { label: string; icon: string }> = {
  guider: { label: '指引者', icon: '🧭' },
  light_mage: { label: '光影法师', icon: '✨' },
  secret_scholar: { label: '秘语学者', icon: '📚' },
};

export default function FinalTaskFeedbackPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const taskId = params.id as string;
  const memberId = searchParams.get('memberId');

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus | null>(null);
  const [currentMember, setCurrentMember] = useState<MemberStatus | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [searchName, setSearchName] = useState(''); // 姓名搜索

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/team/login');
      return;
    }

    const teamObj = JSON.parse(teamData);
    setTeam(teamObj);

    // 如果有指定成员ID，使用它；否则让用户选择
    if (memberId) {
      fetchFeedbackStatus(teamObj.id, memberId);
    } else {
      fetchFeedbackStatus(teamObj.id, null);
    }
  }, [taskId, memberId]);

  const fetchFeedbackStatus = async (teamId: string, selectedMemberId: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/team/final-task-feedback?teamId=${teamId}&taskId=${taskId}`);
      const data = await res.json();

      if (!data.hasForm) {
        toast.error(data.message || '未配置反馈表单');
        router.push(`/team/task/${taskId}`);
        return;
      }

      setFeedbackStatus(data);

      // 确定当前成员
      if (selectedMemberId) {
        const member = data.memberStatus.find((m: MemberStatus) => m.memberId === selectedMemberId);
        if (member) {
          setCurrentMember(member);
          if (member.formData) {
            setFormData(member.formData);
          }
        }
      }
    } catch (error) {
      console.error('获取反馈状态失败:', error);
      toast.error('获取反馈状态失败');
    } finally {
      setLoading(false);
    }
  };

  const selectMember = (member: MemberStatus) => {
    setCurrentMember(member);
    if (member.formData) {
      setFormData(member.formData);
    } else {
      setFormData({});
    }
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!team || !currentMember || !currentMember.formId) return;

    // 获取该成员对应的表单配置
    const memberForm = feedbackStatus?.forms.find(f => f.id === currentMember.formId);
    if (!memberForm) {
      toast.error('未找到对应的表单配置');
      return;
    }

    // 验证必填字段
    const requiredFields = memberForm.form_config.filter(f => f.required);
    for (const field of requiredFields) {
      const value = formData[field.id];
      if (value === undefined || value === null || value === '') {
        toast.error(`请填写：${field.label}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/team/final-task-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          taskId,
          memberId: currentMember.memberId,
          memberRole: currentMember.memberRole,
          formId: currentMember.formId,
          formData,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(data.message);
        
        // 更新状态
        setFeedbackStatus(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            memberStatus: prev.memberStatus.map(m => 
              m.memberId === currentMember.memberId
                ? { ...m, hasSubmitted: true, formData }
                : m
            ),
            summary: {
              ...prev.summary,
              submittedCount: data.allSubmitted 
                ? prev.summary.totalRequired 
                : prev.summary.submittedCount + 1,
              allSubmitted: data.allSubmitted,
            },
          };
        });

        // 如果所有成员都已提交，跳转到任务页面
        if (data.allSubmitted) {
          setTimeout(() => {
            router.push(`/team/task/${taskId}`);
          }, 2000);
        } else {
          // 返回成员选择页面，让其他成员可以填写
          setCurrentMember(null);
          setFormData({});
          setSearchName('');
        }
      } else {
        toast.error(data.error || '提交失败');
      }
    } catch (error) {
      console.error('提交反馈失败:', error);
      toast.error('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    const value = formData[field.id];

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
          />
        );

      case 'radio':
        return (
          <RadioGroup
            value={value || ''}
            onValueChange={(v) => handleFieldChange(field.id, v)}
          >
            {field.options?.map((option, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${field.id}-${idx}`} />
                <Label htmlFor={`${field.id}-${idx}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {field.options?.map((option, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <Checkbox
                  id={`${field.id}-${idx}`}
                  checked={(value || []).includes(option)}
                  onCheckedChange={(checked) => {
                    const currentValues = value || [];
                    const newValues = checked
                      ? [...currentValues, option]
                      : currentValues.filter((v: string) => v !== option);
                    handleFieldChange(field.id, newValues);
                  }}
                />
                <Label htmlFor={`${field.id}-${idx}`}>{option}</Label>
              </div>
            ))}
          </div>
        );

      case 'boolean':
        return (
          <RadioGroup
            value={value || ''}
            onValueChange={(v) => handleFieldChange(field.id, v)}
          >
            {field.options?.map((option, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${field.id}-${idx}`} />
                <Label htmlFor={`${field.id}-${idx}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'rating':
        const maxRating = field.maxRating || 5;
        return (
          <div className="flex items-center gap-1">
            {Array.from({ length: maxRating }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleFieldChange(field.id, i + 1)}
                className="p-1"
              >
                <Star
                  className={`w-8 h-8 ${
                    i < (value || 0)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
            {value && (
              <span className="ml-2 text-sm text-gray-500">{value} 分</span>
            )}
          </div>
        );

      case 'file':
        return (
          <div className="text-sm text-gray-500">
            <Upload className="w-4 h-4 inline mr-2" />
            文件上传功能（请在任务提交页面上传文件）
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!feedbackStatus?.hasForm || feedbackStatus.forms.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 mb-4">未配置反馈表单</p>
            <Button onClick={() => router.push(`/team/task/${taskId}`)}>返回任务</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-8">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-bold">最后任务反馈</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6">
        {/* 进度概览 */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                <span className="font-medium">提交进度</span>
              </div>
              <span className="text-sm text-gray-500">
                {feedbackStatus.summary.submittedCount} / {feedbackStatus.summary.totalRequired} 人已提交
              </span>
            </div>
            <Progress
              value={(feedbackStatus.summary.submittedCount / feedbackStatus.summary.totalRequired) * 100}
              className="h-2"
            />
            {feedbackStatus.summary.allSubmitted && (
              <div className="flex items-center gap-2 mt-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">所有成员已提交，任务完成！</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 小队信息 */}
        {feedbackStatus.contextInfo && (
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-indigo-50 to-purple-50">
            <CardContent className="py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">小队名称</p>
                  <p className="font-medium text-sm">{feedbackStatus.contextInfo.teamName || '未设置'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">所属学校</p>
                  <p className="font-medium text-sm">{feedbackStatus.contextInfo.schoolName || '未设置'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">对接志愿者</p>
                  <p className="font-medium text-sm">{feedbackStatus.contextInfo.volunteerName || '未设置'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">助学老师</p>
                  <p className="font-medium text-sm">{feedbackStatus.contextInfo.teacherName || '未设置'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 成员列表 */}
        {!currentMember && (
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="text-lg">填写反馈表单</CardTitle>
              <CardDescription>请输入你的姓名，系统将自动识别你的身份</CardDescription>
            </CardHeader>
            <CardContent>
              {/* 姓名输入框 */}
              <div className="mb-4">
                <Label htmlFor="memberName">你的姓名</Label>
                <Input
                  id="memberName"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="请输入姓名..."
                  className="mt-1"
                />
              </div>

              {/* 匹配结果 */}
              {searchName.trim() && (
                <div className="space-y-2">
                  {(() => {
                    const matchedMembers = feedbackStatus.memberStatus
                      .filter(m => m.needsToSubmit && m.memberName.includes(searchName.trim()));
                    
                    if (matchedMembers.length === 0) {
                      return (
                        <div className="text-center py-4 text-gray-500">
                          未找到匹配的成员，请检查姓名是否正确
                        </div>
                      );
                    }

                    if (matchedMembers.length === 1) {
                      // 只匹配到一个成员，直接显示身份信息
                      const member = matchedMembers[0];
                      return (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-4xl">
                                {ROLE_CONFIG[member.memberRole]?.icon || '👤'}
                              </span>
                              <div>
                                <p className="font-bold text-lg">{member.memberName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className="bg-blue-500 text-white">
                                    {ROLE_CONFIG[member.memberRole]?.label || member.memberRole}
                                  </Badge>
                                  {member.hasSubmitted ? (
                                    <Badge className="bg-green-500">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      已提交
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-orange-500 border-orange-300">
                                      <Clock className="w-3 h-3 mr-1" />
                                      待提交
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            {!member.hasSubmitted && (
                              <Button onClick={() => selectMember(member)}>
                                开始填写
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // 匹配到多个成员，显示列表让用户选择
                    return (
                      <>
                        <p className="text-sm text-gray-500 mb-2">找到多个匹配的成员，请选择：</p>
                        <div className="grid gap-2">
                          {matchedMembers.map((member) => (
                            <button
                              key={member.memberId}
                              onClick={() => selectMember(member)}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                member.hasSubmitted
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-white hover:bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">
                                  {ROLE_CONFIG[member.memberRole]?.icon || '👤'}
                                </span>
                                <div className="text-left">
                                  <p className="font-medium">{member.memberName}</p>
                                  <p className="text-sm text-gray-500">
                                    {ROLE_CONFIG[member.memberRole]?.label || member.memberRole}
                                  </p>
                                </div>
                              </div>
                              {member.hasSubmitted ? (
                                <Badge className="bg-green-500">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  已提交
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <Clock className="w-3 h-3 mr-1" />
                                  待提交
                                </Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* 未输入时显示全部成员 */}
              {!searchName.trim() && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 mb-2">或直接从列表中选择：</p>
                  <div className="grid gap-2">
                    {feedbackStatus.memberStatus
                      .filter(m => m.needsToSubmit)
                      .map((member) => (
                        <button
                          key={member.memberId}
                          onClick={() => selectMember(member)}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            member.hasSubmitted
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white hover:bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {ROLE_CONFIG[member.memberRole]?.icon || '👤'}
                            </span>
                            <div className="text-left">
                              <p className="font-medium">{member.memberName}</p>
                              <p className="text-sm text-gray-500">
                                {ROLE_CONFIG[member.memberRole]?.label || member.memberRole}
                              </p>
                            </div>
                          </div>
                          {member.hasSubmitted ? (
                            <Badge className="bg-green-500">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              已提交
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              待提交
                            </Badge>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 反馈表单 */}
        {currentMember && currentMember.formId && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{currentMember.formIcon || '📝'}</span>
                  <div>
                    <CardTitle>{currentMember.formName || '反馈表单'}</CardTitle>
                    <CardDescription>
                      {currentMember.memberName} · {ROLE_CONFIG[currentMember.memberRole]?.label}
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCurrentMember(null)}>
                  切换成员
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                const memberForm = feedbackStatus?.forms.find(f => f.id === currentMember.formId);
                if (!memberForm) return <p className="text-gray-500">未找到表单配置</p>;
                return memberForm.form_config.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label className="flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    {renderField(field)}
                  </div>
                ));
              })()}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setCurrentMember(null)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  提交反馈
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
