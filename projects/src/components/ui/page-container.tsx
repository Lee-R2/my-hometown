import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 统一响应式布局容器
 *
 * 解决各页面 max-w-* 和 px-* 硬编码不一致的问题。
 * 提供三档预设宽度，统一 padding 和居中行为。
 *
 * 用法：
 *   <PageContainer>...</PageContainer>           // 默认 wide
 *   <PageContainer variant="narrow">...</PageContainer>  // 窄屏阅读型
 *   <PageContainer variant="full">...</PageContainer>    // 全宽
 */

type PageContainerVariant = "wide" | "narrow" | "full";

const variantClasses: Record<PageContainerVariant, string> = {
  // 宽屏：管理后台、小队端主要页面（数据表格、卡片网格）
  wide: "max-w-7xl mx-auto px-4 md:px-6",
  // 窄屏：家长端、详情阅读型页面（单列内容）
  narrow: "max-w-4xl mx-auto px-4 md:px-6",
  // 全宽：不需要最大宽度限制的页面（如看板、黑板）
  full: "w-full mx-auto px-4 md:px-6",
};

interface PageContainerProps extends React.ComponentProps<"div"> {
  variant?: PageContainerVariant;
  /** 是否包含垂直 padding（默认包含 py-4 md:py-6） */
  withVerticalPadding?: boolean;
}

export function PageContainer({
  variant = "wide",
  withVerticalPadding = true,
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        variantClasses[variant],
        withVerticalPadding && "py-4 md:py-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * 页面头部容器 — 统一 header 的宽度和 padding
 * 与 PageContainer 使用相同的宽度变体，但垂直间距更紧凑
 */
export function PageHeader({
  variant = "wide",
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(variantClasses[variant], "py-2 md:py-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}
