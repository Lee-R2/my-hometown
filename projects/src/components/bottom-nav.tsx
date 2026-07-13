'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Target, BookOpen, Trophy, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 移动端底部导航栏
 *
 * 仅在移动端（< 768px）显示，桌面端隐藏。
 * 固定在屏幕底部，正确处理 iOS safe-area。
 *
 * 使用：
 *   <BottomNav />  // 放在 team/layout.tsx 中
 *
 * 页面内容需要添加底部留白以避免被遮挡：
 *   <main className="pb-16 md:pb-0">...</main>
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/team/dashboard', label: '首页', icon: Home },
  { href: '/team/tasks', label: '任务', icon: Target },
  { href: '/team/learning', label: '学习', icon: BookOpen },
  { href: '/team/rewards', label: '激励', icon: Trophy },
  { href: '/team/messages', label: '消息', icon: MessageCircle },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="主导航"
    >
      <div className="flex items-stretch justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/team/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 transition-colors',
                isActive
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-xs leading-none truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
