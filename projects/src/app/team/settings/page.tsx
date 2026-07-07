'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Key, Users, Save, Eye, EyeOff, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useScrollPosition } from '@/hooks/use-scroll-position';

interface TeamInfo {
  id: string;
  code: string;
  name: string;
  slogan?: string;
  points: number;
  schoolId?: string;
}

export default function TeamSettingsPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 滚动位置记忆
  useScrollPosition('team-settings');
  
  // 密码修改表单
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const teamData = localStorage.getItem('team');
    if (!teamData) {
      router.push('/');
      return;
    }
    
    const teamObj = JSON.parse(teamData);
    setTeam(teamObj);
  }, [router]);

  const handlePasswordChange = async () => {
    if (!team) return;

    // 表单验证
    if (!passwordForm.oldPassword) {
      toast.error('请输入原密码');
      return;
    }
    if (!passwordForm.newPassword) {
      toast.error('请输入新密码');
      return;
    }
    if (passwordForm.newPassword.length < 4) {
      toast.error('新密码长度至少4位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    if (passwordForm.oldPassword === passwordForm.newPassword) {
      toast.error('新密码不能与原密码相同');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/team-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.id,
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('密码修改成功，请使用新密码登录');
        // 清空表单
        setPasswordForm({
          oldPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
      } else {
        toast.error(data.error || '密码修改失败');
      }
    } catch (error) {
      toast.error('密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // 清空银蛇博士会话ID，保证退出再进入是新对话
    if (team?.id) {
      sessionStorage.removeItem(`yinshe_session_${team.id}`);
    }
    localStorage.removeItem('team');
    router.push('/');
  };

  if (!team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/team/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              小队设置
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            退出登录
          </Button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 md:py-6 space-y-6">
        {/* 小队信息 */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5" />
              小队信息
            </CardTitle>
            <CardDescription>查看小队基本信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-gray-500">小队编码</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium font-mono">{team.code}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-500">小队名称</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{team.name || '未设置'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-500">小队口号</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-purple-600">"{team.slogan || '暂无口号'}"</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-500">累计积分</Label>
                <div className="flex items-center gap-2">
                  <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                    <Star className="w-3 h-3 mr-1" />
                    {team.points} 积分
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 修改密码 */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-5 h-5" />
              修改密码
            </CardTitle>
            <CardDescription>定期修改密码可以提高小队账号安全性</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 原密码 */}
            <div className="space-y-2">
              <Label htmlFor="oldPassword">原密码 *</Label>
              <div className="relative">
                <Input
                  id="oldPassword"
                  type={showOldPassword ? 'text' : 'password'}
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                  placeholder="请输入原密码"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 新密码 */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码 *</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="请输入新密码（至少4位）"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">密码长度至少4位</p>
            </div>

            {/* 确认新密码 */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码 *</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="请再次输入新密码"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="text-xs text-red-500">两次输入的密码不一致</p>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <Button 
                onClick={handlePasswordChange} 
                disabled={loading}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    修改中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    确认修改
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 安全提示 */}
        <Card className="border-0 shadow-lg bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">安全提示</p>
                <ul className="mt-2 space-y-1 text-amber-700">
                  <li>• 请妥善保管小队密码，所有队员共用此密码登录</li>
                  <li>• 密码长度至少4位，建议使用字母、数字组合</li>
                  <li>• 请勿使用简单密码如 123456、password 等</li>
                  <li>• 如忘记密码，请联系志愿者老师重置</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
