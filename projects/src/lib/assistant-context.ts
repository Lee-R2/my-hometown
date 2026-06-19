// 全局页面上下文存储
// 用于将当前页面数据（如任务产出详情）传递给蜡象助手
// 页面组件通过 setAssistantContext 写入，助手组件通过订阅读取

type PageContext = {
  type: 'submission_detail' | 'team_detail' | 'task_detail' | 'other';
  title: string;
  data: Record<string, unknown>;
};

type ContextListener = (context: PageContext | null) => void;

let currentContext: PageContext | null = null;
const listeners: Set<ContextListener> = new Set();

export function setAssistantContext(context: PageContext | null) {
  currentContext = context;
  listeners.forEach(listener => listener(context));
}

export function getAssistantContext(): PageContext | null {
  return currentContext;
}

export function subscribeAssistantContext(listener: ContextListener): () => void {
  listeners.add(listener);
  // 立即通知当前值
  listener(currentContext);
  return () => {
    listeners.delete(listener);
  };
}
