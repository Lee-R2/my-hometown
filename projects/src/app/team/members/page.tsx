'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Users, Plus, Edit2, X, Check, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface Member {
  id: string;
  name: string;
  role: string;
  intro?: string;
  isApproved: boolean;
}

interface Team {
  id: string;
  code: string;
  name: string;
  slogan?: string;
  rules: string;
  schoolId: string;
  currentThemeId?: string;
  currentTaskId?: string;
  hasCompletedPretest?: boolean;
  members?: Member[];
}

const roleConfig: Record<string, { label: string; className: string; icon: string }> = {
  guider: { label: '指引者', className: 'bg-blue-500', icon: '🧭' },
  light_mage: { label: '光影法师', className: 'bg-amber-500', icon: '✨' },
  secret_scholar: { label: '秘语学者', className: 'bg-purple-500', icon: '📚' },
};

export default function TeamInfoPage() {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  
  // 整体编辑模式
  const [isEditing, setIsEditing] = useState(true);
  const [tempName, setTempName] = useState('');
  const [tempSlogan, setTempSlogan] = useState('');
  const [tempRules, setTempRules] = useState('');
  const [saving, setSaving] = useState(false);

  // 添加成员
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', role: 'guider', intro: '' });

  // 编辑成员
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editMemberData, setEditMemberData] = useState({ name: '', role: '', intro: '' });

  // 当前任务状态
  const [hasCurrentTask, setHasCurrentTask] = useState(false);

  // 导航函数
  const navigate = (path: string) => {
    window.location.href = path;
  };

  useScrollPosition('team-members');

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      window.location.href = '/team/login';
      return;
    }
    
    const teamObj = JSON.parse(teamData);
    setTeam(teamObj);
    setTempName(teamObj.name || '');
    setTempSlogan(teamObj.slogan || '');
    setTempRules(teamObj.rules || '');
    setMembers(teamObj.members || []);

    if (teamObj.id) {
      fetchCurrentTask(teamObj.id);
      fetchMembers(teamObj.id);
    }
  }, []);

  const fetchCurrentTask = async (teamId: string) => {
    try {
      const res = await fetch(`/api/team/current-task?teamId=${teamId}`);
      const data = await res.json();
      setHasCurrentTask(!!data.task);
    } catch (error) {
      console.error('获取任务失败:', error);
    }
  };

  // 从 API 获取最新成员列表
  const fetchMembers = async (teamId: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/members`);
      const data = await res.json();
      if (data.members) {
        setMembers(data.members);
        // 同步到 localStorage
        const storedTeam = JSON.parse(localStorage.getItem('team') || '{}');
        storedTeam.members = data.members;
        localStorage.setItem('team', JSON.stringify(storedTeam));
      }
    } catch (error) {
      console.error('获取成员失败:', error);
    }
  };

  const canEditName = !team?.currentThemeId && !team?.currentTaskId;

  // 判断三个角色是否都有成员
  const memberRoles = new Set(members.map(m => m.role));
  const hasAllRoles = memberRoles.has('guider') && memberRoles.has('light_mage') && memberRoles.has('secret_scholar');

  // 保存小队信息并跳转前测
  const handleSaveAndNext = async () => {
    if (!team) return;

    if (!tempName.trim()) {
      toast.error('小队名称不能为空');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: tempName.trim(),
          slogan: tempSlogan.trim() || null,
          rules: tempRules,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const storedTeam = JSON.parse(localStorage.getItem('team') || '{}');
        const updatedTeam = { 
          ...storedTeam,
          ...(data.team || {}),
          name: tempName.trim(),
          slogan: tempSlogan.trim() || undefined,
          rules: tempRules,
        };
        setTeam(updatedTeam);
        localStorage.setItem('team', JSON.stringify(updatedTeam));
        toast.success('小队信息已保存');
        router.push('/team/dashboard');
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 保存编辑（非首次编辑模式）
  const handleSave = async () => {
    if (!team) return;

    if (!tempName.trim()) {
      toast.error('小队名称不能为空');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: tempName.trim(),
          slogan: tempSlogan.trim() || null,
          rules: tempRules,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const storedTeam = JSON.parse(localStorage.getItem('team') || '{}');
        const updatedTeam = { 
          ...storedTeam,
          ...(data.team || {}),
          name: tempName.trim(),
          slogan: tempSlogan.trim() || undefined,
          rules: tempRules,
        };
        setTeam(updatedTeam);
        localStorage.setItem('team', JSON.stringify(updatedTeam));
        setIsEditing(false);
        toast.success('小队信息已更新');
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTempName(team?.name || '');
    setTempSlogan(team?.slogan || '');
    setTempRules(team?.rules || '');
    setIsEditing(false);
  };

  // 添加成员
  const handleAddMember = async () => {
    if (!newMember.name) {
      toast.error('请输入成员姓名');
      return;
    }

    try {
      const res = await fetch(`/api/teams/${team?.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      });

      const data = await res.json();
      if (data.success) {
        const newMemberData = data.member || data;
        const updatedMembers = [...members, newMemberData];
        setMembers(updatedMembers);
        // 更新 localStorage
        const storedTeam = JSON.parse(localStorage.getItem('team') || '{}');
        storedTeam.members = updatedMembers;
        localStorage.setItem('team', JSON.stringify(storedTeam));
        toast.success('成员添加成功');
        setShowAddDialog(false);
        setNewMember({ name: '', role: 'guider', intro: '' });
      } else {
        toast.error(data.error || '添加失败');
      }
    } catch (error) {
      toast.error('添加失败');
    }
  };

  // 开始编辑成员
  const startEditMember = (member: Member) => {
    setEditingMemberId(member.id);
    setEditMemberData({ name: member.name, role: member.role, intro: member.intro || '' });
  };

  // 保存成员编辑
  const handleSaveMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/teams/${team?.id}/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editMemberData),
      });

      const data = await res.json();
      if (data.success) {
        const updatedMembers = members.map(m => m.id === memberId ? { ...m, ...editMemberData } : m);
        setMembers(updatedMembers);
        const storedTeam = JSON.parse(localStorage.getItem('team') || '{}');
        storedTeam.members = updatedMembers;
        localStorage.setItem('team', JSON.stringify(storedTeam));
        setEditingMemberId(null);
        setEditMemberData({ name: '', role: '', intro: '' });
        toast.success('成员信息已更新');
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    }
  };

  // 删除成员
  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!confirm(`确定要删除成员"${memberName}"吗？`)) return;

    try {
      const res = await fetch(`/api/teams/${team?.id}/members/${memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const updatedMembers = members.filter(m => m.id !== memberId);
        setMembers(updatedMembers);
        const storedTeam = JSON.parse(localStorage.getItem('team') || '{}');
        storedTeam.members = updatedMembers;
        localStorage.setItem('team', JSON.stringify(storedTeam));
        toast.success('成员已删除');
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 判断是否为首次填写（没有口号和队规）
  const isFirstTime = !team?.slogan && !team?.rules;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/team/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">完善小队信息</h1>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6">
        {/* 首次填写提示 */}
        {isFirstTime && (
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-700">欢迎来到 EntroCamp！</h3>
                  <p className="text-sm text-blue-600 mt-1">
                    请先完善小队基本信息，保存后将进入前测问卷。根据前测结果，系统会为每位成员推荐适合的角色。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 小队信息卡片 */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              小队信息
            </CardTitle>
            {!isEditing && (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                <Edit2 className="w-4 h-4 mr-1" />
                编辑
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 小队名称 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-500 flex items-center gap-1">
                小队名称
                {!canEditName && isEditing && (
                  <span className="text-xs text-orange-500">(任务执行期间不可修改)</span>
                )}
              </Label>
              {isEditing ? (
                <Input
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="请输入小队名称"
                  disabled={!canEditName}
                  className={!canEditName ? 'bg-gray-100' : ''}
                />
              ) : (
                <p className="text-lg font-medium">{team?.name || '未设置'}</p>
              )}
            </div>

            {/* 小队口号 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-500">小队口号</Label>
              {isEditing ? (
                <div className="space-y-1">
                  <Input
                    value={tempSlogan}
                    onChange={(e) => setTempSlogan(e.target.value)}
                    placeholder="例如：团结协作，勇攀高峰"
                    maxLength={50}
                  />
                  <p className="text-xs text-gray-400 text-right">{tempSlogan.length}/50 字符</p>
                </div>
              ) : (
                <p className="text-base text-gray-700">
                  {team?.slogan ? `"${team.slogan}"` : <span className="text-gray-400 italic">暂无口号</span>}
                </p>
              )}
            </div>

            {/* 小队队规 */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-500">小队队规</Label>
              {isEditing ? (
                <Textarea
                  value={tempRules}
                  onChange={(e) => setTempRules(e.target.value)}
                  placeholder="请输入小队队规，例如：&#10;1. 按时完成任务&#10;2. 团队协作&#10;3. 积极探索"
                  rows={4}
                  className="resize-none"
                />
              ) : (
                <div className="whitespace-pre-wrap text-gray-700 bg-gray-50 rounded-lg p-3 min-h-[60px]">
                  {team?.rules || <span className="text-gray-400 italic">暂无队规</span>}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            {isEditing && (
              <div className="flex gap-3 pt-2">
                {!isFirstTime && (
                  <Button variant="outline" className="flex-1" onClick={handleCancelEdit} disabled={saving}>
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                )}
                <Button 
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500"
                  onClick={isFirstTime ? handleSaveAndNext : handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  保存
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 小队成员卡片 */}
        <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-500" />
                小队成员 ({members.length}人)
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-1" />
                添加成员
              </Button>
            </CardHeader>
            <CardContent>
              {/* 角色完成状态 */}
              <div className="flex gap-2 mb-4">
                <Badge className={memberRoles.has('guider') ? 'bg-blue-500' : 'bg-gray-300'}>
                  🧭 指引者 {memberRoles.has('guider') ? '✓' : '待添加'}
                </Badge>
                <Badge className={memberRoles.has('light_mage') ? 'bg-amber-500' : 'bg-gray-300'}>
                  ✨ 光影法师 {memberRoles.has('light_mage') ? '✓' : '待添加'}
                </Badge>
                <Badge className={memberRoles.has('secret_scholar') ? 'bg-purple-500' : 'bg-gray-300'}>
                  📚 秘语学者 {memberRoles.has('secret_scholar') ? '✓' : '待添加'}
                </Badge>
              </div>

              {!hasAllRoles && (
                <p className="text-sm text-orange-600 mb-4">
                  请根据前测角色建议添加成员，三个角色都有成员后即可选择主题！
                </p>
              )}

              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="p-3 border rounded-lg bg-white/50 hover:bg-white/80 transition-colors">
                    {editingMemberId === member.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-gray-500">姓名</Label>
                            <Input
                              value={editMemberData.name}
                              onChange={(e) => setEditMemberData({ ...editMemberData, name: e.target.value })}
                              placeholder="姓名"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">角色</Label>
                            <select
                              value={editMemberData.role}
                              onChange={(e) => setEditMemberData({ ...editMemberData, role: e.target.value })}
                              className="w-full h-10 border rounded-lg px-3 bg-white"
                            >
                              <option value="guider">🧭 指引者</option>
                              <option value="light_mage">✨ 光影法师</option>
                              <option value="secret_scholar">📚 秘语学者</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">一句话自我介绍</Label>
                          <Input
                            value={editMemberData.intro}
                            onChange={(e) => setEditMemberData({ ...editMemberData, intro: e.target.value })}
                            placeholder="一句话介绍自己"
                            maxLength={50}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditingMemberId(null)}>取消</Button>
                          <Button size="sm" onClick={() => handleSaveMember(member.id)}>
                            <Check className="w-4 h-4 mr-1" />
                            保存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0">
                            {member.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{member.name}</span>
                              {roleConfig[member.role] && (
                                <Badge className={`${roleConfig[member.role].className} text-xs`}>
                                  <span className="mr-0.5">{roleConfig[member.role].icon}</span>
                                  {roleConfig[member.role].label}
                                </Badge>
                              )}
                            </div>
                            {member.intro && (
                              <p className="text-sm text-gray-500 mt-0.5">"{member.intro}"</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => startEditMember(member)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteMember(member.id, member.name)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {members.length === 0 && (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">还没有添加成员</p>
                    <p className="text-xs mt-1">请根据前测角色建议添加成员</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
      </main>

      {/* 添加成员弹窗 */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>添加成员</CardTitle>
              <p className="text-sm text-gray-500">请根据前测角色建议选择成员角色</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>成员姓名 *</Label>
                <Input 
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  placeholder="请输入队员姓名"
                />
              </div>

              <div className="space-y-2">
                <Label>角色</Label>
                <select
                  value={newMember.role}
                  onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                  className="w-full h-10 border rounded-lg px-3 bg-white"
                >
                  <option value="guider">🧭 指引者</option>
                  <option value="light_mage">✨ 光影法师</option>
                  <option value="secret_scholar">📚 秘语学者</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>一句话自我介绍</Label>
                <Input 
                  value={newMember.intro}
                  onChange={(e) => setNewMember({ ...newMember, intro: e.target.value })}
                  placeholder="用一句话介绍自己"
                  maxLength={50}
                />
                <p className="text-xs text-gray-400">{newMember.intro.length}/50</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                  取消
                </Button>
                <Button className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500" onClick={handleAddMember}>
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
