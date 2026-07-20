'use client';

import { useEffect, useState } from 'react';
import { safeGetJSON } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useScrollPosition } from '@/hooks/use-scroll-position';
import { ArrowLeft, Key, User, Save, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface UserInfo {
  id: string;
  username: string;
  name: string;
  role: string;
  schoolId?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 滚动位置记忆
  useScrollPosition('admin-profile');
  
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
    const userObj = safeGetJSON<UserInfo | null>('user', null);
    if (!userObj) {
      router.push('/');
      return;
    }
    setUser(userObj);
  }, [router]);

  const roleLabels: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '超级管理员',
    volunteer: '授课志愿者',
    teacher: '助学老师',
    team: '小队',
  };

  const handlePasswordChange = async () => {
    if (!user) return;

    // 表单验证
    if (!passwordForm.oldPassword) {
      toast.error('请输入原密码');
      return;
    }
    if (!passwordForm.newPassword) {
      toast.error('请输入新密码');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码长度至少6位');
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
      const res = await fetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
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
        // 可选：自动退出登录
        // localStorage.removeItem('user');
        // router.push('/');
      } else {
        toast.error(data.error || '密码修改失败');
      }
    } catch (error) {
      toast.error('密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              个人中心
            </h1>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-4 md:py-6 space-y-6">
        {/* 账号信息 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-5 h-5" />
              账号信息
            </CardTitle>
            <CardDescription>查看您的账号基本信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-gray-500">用户名</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{user.username}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-500">姓名</Label>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{user.name || '未设置'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-500">角色</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{roleLabels[user.role] || user.role}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 修改密码 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-5 h-5" />
              修改密码
            </CardTitle>
            <CardDescription>定期修改密码可以提高账号安全性</CardDescription>
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
                  placeholder="请输入新密码（至少6位）"
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
              <p className="text-xs text-gray-500">密码长度至少6位</p>
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
              <Button onClick={handlePasswordChange} disabled={loading}>
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
        <Card className="border-0 shadow-sm bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">安全提示</p>
                <ul className="mt-2 space-y-1 text-amber-700">
                  <li>• 请定期修改密码，建议每3个月更换一次</li>
                  <li>• 密码长度至少6位，建议使用字母、数字组合</li>
                  <li>• 请勿使用简单密码如 123456、password 等</li>
                  <li>• 请勿将密码告知他人，以免账号被盗用</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
