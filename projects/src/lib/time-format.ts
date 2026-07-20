/**
 * LE-M14 修复: 统一时间标签格式化函数。
 *
 * 之前 formatTimeLabel / formatConversationTimeLabel 在多个文件重复实现:
 * - src/app/api/ai/chat/lib/memory.ts (formatTimeLabel,空值返回 '')
 * - src/app/api/admin/assistant/route.ts (formatConversationTimeLabel,空值返回 '未知时间')
 * - src/app/api/admin/blackboard/[id]/like/route.ts (同上)
 * - src/app/api/admin/blackboard/[id]/comments/route.ts (同上)
 * - src/app/api/admin/blackboard/comments/[id]/like/route.ts (同上)
 *
 * 这些实现逻辑相同,仅空值 fallback 不同。统一抽取到此处供所有路由复用。
 */

/**
 * 格式化时间标签(如"3天前"、"刚刚"、"2小时前")
 * 让 LLM 感知记忆/对话的时间远近,避免把旧内容当近期内容主动提及
 *
 * @param dateStr ISO 时间字符串
 * @param emptyFallback 空值/无效值时的返回值(默认 '',memory 模块用;对话模块可传 '未知时间')
 */
export function formatTimeLabel(
  dateStr?: string | null,
  emptyFallback: string = ''
): string {
  if (!dateStr) return emptyFallback;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return emptyFallback;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '刚刚';
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}周前`;
  return `${Math.floor(diffDay / 30)}个月前`;
}

/**
 * 对话时间标签专用便捷函数(空值返回 '未知时间')
 * 等价于 formatTimeLabel(dateStr, '未知时间')
 */
export function formatConversationTimeLabel(dateStr?: string | null): string {
  return formatTimeLabel(dateStr, '未知时间');
}
