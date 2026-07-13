'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Phone, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export default function ParentLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');

  const handleLogin = async () => {
    if (!phone || !password) {
      setError('请填写手机号和密码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/parent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || '登录失败');
        return;
      }

      // 保存登录信息（只存最小化非敏感信息，认证依赖 HttpOnly Cookie）
      localStorage.setItem('parent', JSON.stringify({
        id: data.parent.id,
        name: data.parent.name,
      }));
      localStorage.setItem('parent_follows', JSON.stringify(data.follows || []));

      router.push('/parent/dashboard');
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    // 表单验证
    if (!phone) {
      setError('请填写手机号');
      return;
    }
    if (!name) {
      setError('请填写真实姓名');
      return;
    }
    if (!password) {
      setError('请填写密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要6位');
      return;
    }
    if (!confirmPassword) {
      setError('请填写确认密码');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次填写的密码不一致');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/parent-login', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone, 
          password, 
          name
        })
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || '注册失败');
        return;
      }

      // 注册成功，清空表单并切换到登录
      setPhone('');
      setPassword('');
      setConfirmPassword('');
      setName('');
      setIsRegister(false);
      toast.success('注册成功！请使用手机号和密码登录。');
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const switchToLogin = () => {
    setIsRegister(false);
    setError('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-orange-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="p-4 md:p-6">
        <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 text-sm md:text-base">
          <ArrowLeft className="w-5 h-5 mr-1" />
          <span>返回</span>
        </Link>
      </div>

      {/* Logo 和标题 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-6 md:py-8">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center mb-4 md:mb-6 shadow-lg">
          <span className="text-3xl md:text-4xl">👨‍👩‍👧</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
          {isRegister ? '注册账号' : '家长登录'}
        </h1>
        <p className="text-sm md:text-base text-gray-500 mb-6 md:mb-8 text-center">
          {isRegister ? '创建家长账号，关注孩子成长' : '关注孩子小队，了解学习进度'}
        </p>

        <Card className="w-full max-w-md shadow-lg border-0">
          <CardContent className="p-4 md:p-6">
            <div className="space-y-4 md:space-y-5">
              {/* 手机号 */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm md:text-base text-gray-700">手机号<span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 h-11 md:h-10"
                  />
                </div>
              </div>

              {/* 真实姓名（仅注册时显示） */}
              {isRegister && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm md:text-base text-gray-700">真实姓名<span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="请输入真实姓名"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 h-11 md:h-10"
                    />
                  </div>
                </div>
              )}

              {/* 密码 */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm md:text-base text-gray-700">
                  密码<span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={isRegister ? '设置密码（6位以上）' : '请输入密码'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isRegister && !isLoading) {
                        handleLogin();
                      }
                    }}
                    className="pl-10 h-11 md:h-10"
                  />
                </div>
              </div>

              {/* 确认密码（仅注册时显示） */}
              {isRegister && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm md:text-base text-gray-700">
                    确认密码<span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="请再次输入密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 h-11 md:h-10"
                    />
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}

              {/* 登录/注册按钮 */}
              <Button
                onClick={isRegister ? handleRegister : handleLogin}
                disabled={isLoading}
                className="w-full h-11 md:h-10 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white text-base"
              >
                {isLoading ? '请稍候...' : (isRegister ? '注册' : '登录')}
              </Button>

              {/* 切换注册/登录 */}
              <p className="text-center text-sm md:text-base text-gray-500">
                {isRegister ? '已有账号？' : '还没有账号？'}
                <button
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError('');
                    setConfirmPassword('');
                  }}
                  className="text-pink-500 hover:underline ml-1"
                >
                  {isRegister ? '立即登录' : '立即注册'}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 帮助说明 */}
        <div className="mt-4 md:mt-6 text-center text-xs md:text-sm text-gray-500">
          <p>登录后可绑定孩子所在的小队</p>
          <p className="mt-1">实时关注小队动态和学习进度</p>
        </div>
      </div>
    </div>
  );
}
