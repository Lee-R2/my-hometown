'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Rocket, ChevronRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">我的家乡</h1>
          <p className="text-gray-500 mt-2">科学探索之旅</p>
        </div>

        {/* 入口选择 */}
        <div className="space-y-4">
          {/* 小队入口 */}
          <Link href="/team/login" className="block">
            <Card className="shadow-lg border-0 cursor-pointer hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden">
                    <img 
                      src="/squad-login-icon.png" 
                      alt="服务小队" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-gray-900">小队入口</h2>
                    <p className="text-sm text-gray-500">科考小队登录，开始探索任务</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* 管理员入口 */}
          <Link href="/admin/login" className="block">
            <Card className="shadow-lg border-0 cursor-pointer hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden bg-white">
                    <img 
                      src="/admin-entry-icon.png" 
                      alt="管理员入口" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-gray-900">管理员入口</h2>
                    <p className="text-sm text-gray-500">管理员、志愿者老师、助学老师登录</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* 家长入口 */}
          <Link href="/parent/login" className="block">
            <Card className="shadow-lg border-0 cursor-pointer hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-pink-100 to-orange-100">
                    <span className="text-2xl">👨‍👩‍👧</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-gray-900">家长入口</h2>
                    <p className="text-sm text-gray-500">关注孩子小队，查看学习进度</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs text-gray-400 mt-8">
          © 2024 我的家乡 - 科学探索之旅
        </p>
      </div>
    </div>
  );
}
