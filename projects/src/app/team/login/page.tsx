'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function TeamLoginPage() {
  const [teamCode, setTeamCode] = useState('');
  const [teamPassword, setTeamPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!teamCode || !teamPassword) {
      setError('请输入小队编码和密码');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/team-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: teamCode, password: teamPassword }),
      });

      const data = await res.json();

      if (data.success) {
        // 只存最小化非敏感信息到 localStorage（认证依赖 HttpOnly Cookie）
        localStorage.setItem('team', JSON.stringify({
          id: data.team.id,
          code: data.team.code,
          name: data.team.name,
        }));
        window.location.href = '/team/dashboard';
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      <div className="mx-auto px-4 md:px-6 py-4 md:py-6">
        {/* 返回按钮 */}
        <a href="/" className="inline-block mb-4">
          <Button variant="ghost" type="button" className="text-sm md:text-base">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回首页
          </Button>
        </a>

        {/* Logo */}
        <div className="text-center mb-6 md:mb-8">
          <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-3 md:mb-4 flex items-center justify-center overflow-hidden">
            <img src="/squad-login-icon.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">小队登录</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">我的家乡 - 科学探索之旅</p>
        </div>

        {/* 登录卡片 */}
        <Card className="shadow-lg border-0 max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">欢迎使用</CardTitle>
            <CardDescription className="text-sm md:text-base">请输入小队编码和密码登录系统</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="teamCode" className="text-sm md:text-base">小队编码</Label>
                <Input
                  id="teamCode"
                  type="text"
                  placeholder="请输入小队编码"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value)}
                  disabled={isLoading}
                  className="h-11 md:h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamPassword" className="text-sm md:text-base">密码</Label>
                <Input
                  id="teamPassword"
                  type="password"
                  placeholder="请输入密码"
                  value={teamPassword}
                  onChange={(e) => setTeamPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-11 md:h-10"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 md:h-10 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-base"
                disabled={isLoading}
              >
                {isLoading ? '登录中...' : '登录'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
