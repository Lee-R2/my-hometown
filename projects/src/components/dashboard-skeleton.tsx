import { Skeleton } from '@/components/ui/skeleton';

/**
 * 仪表盘骨架屏
 *
 * 在页面数据加载期间显示，提供与实际 dashboard 布局一致的结构占位。
 * 比 spinner 提供更好的感知性能（用户能看到页面结构正在加载）。
 *
 * 用法：
 *   import { DashboardSkeleton } from '@/components/dashboard-skeleton';
 *   <DashboardSkeleton />
 */

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏骨架 */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-3 flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6">
        {/* 统计卡片网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 space-y-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
