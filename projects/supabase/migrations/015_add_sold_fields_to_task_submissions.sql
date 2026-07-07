-- 015: 为 task_submissions 表添加作品交易已售字段
-- 修复问题：
--   云朵市集 work 类型交易无限复制漏洞（src/lib/market-trade.ts）
--   交易后需标记卖方原 submission 为已售，防止同一作品被反复挂单出售
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行（无需 RLS）

-- ============================================================
-- 需要添加的字段说明：
--   sold_at        : 作品售出时间戳，标记该 submission 已在市集售出
--   sold_to_team_id: 买方小队 ID，记录作品被哪个小队购得
-- 代码引用：src/lib/market-trade.ts (itemType === 'work' 分支)
-- ============================================================
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS sold_to_team_id VARCHAR(36);

-- 为 sold_to_team_id 添加索引，便于按买方查询已购作品
CREATE INDEX IF NOT EXISTS idx_task_submissions_sold_to_team_id
  ON task_submissions(sold_to_team_id);

-- 验证字段已添加
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task_submissions' AND column_name IN ('sold_at', 'sold_to_team_id');
