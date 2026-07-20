import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Compass } from 'lucide-react';

/**
 * LE-F14 修复: 自定义 404 页面。
 *
 * 此前项目缺失 not-found.tsx,用户访问不存在的路由时会看到 Next.js 默认 404 页面,
 * 与应用整体风格不一致,也无法引导用户回到有效入口。本页面与 error.tsx 保持同一
 * 视觉语言(居中卡片 + 图标 + 主操作按钮),提供"返回首页"和"返回上一页"两个出口。
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 pb-6 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Compass className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">页面走丢了</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            你访问的页面不存在或已被移除。
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.history.back()}>
              返回上一页
            </Button>
            <Button asChild>
              <Link href="/">返回首页</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
