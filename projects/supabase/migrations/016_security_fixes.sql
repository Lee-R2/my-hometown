-- 016: 安全修复迁移 — 唯一约束 + 索引 + 字段补充
-- 修复问题：市集超卖、点赞双花、sibling 互斥竞态、work 交易标记
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行

-- ============================================================
-- 1. likes 表唯一约束（防点赞竞态双花）
-- ============================================================
-- 注意：likes 表实际字段为 team_id（代码中混用 from_team_id/to_team_id/stage 是 bug）
-- 删除已存在的同名约束（如果有）
ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_submission_team_unique;
-- 添加唯一约束：同一小队对同一提交只能点赞一次
ALTER TABLE likes ADD CONSTRAINT likes_submission_team_unique
  UNIQUE (submission_id, team_id);

-- ============================================================
-- 2. task_submissions 表添加 sold 字段（防 work 交易无限复制）
-- ============================================================
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS sold_at timestamptz;
ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS sold_to_team_id varchar(36);

-- 添加索引方便查询已售作品
CREATE INDEX IF NOT EXISTS idx_task_submissions_sold_at ON task_submissions(sold_at) WHERE sold_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_submissions_sold_to_team ON task_submissions(sold_to_team_id) WHERE sold_to_team_id IS NOT NULL;

-- 添加外键约束（sold_to_team_id 指向 teams 表）
ALTER TABLE task_submissions DROP CONSTRAINT IF EXISTS fk_task_submissions_sold_to_team;
ALTER TABLE task_submissions ADD CONSTRAINT fk_task_submissions_sold_to_team
  FOREIGN KEY (sold_to_team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- ============================================================
-- 3. team_theme_selections 部分唯一索引（防 sibling 互斥竞态）
-- ============================================================
-- 同一周期同一主题，只能有一支小队选择（status='in_progress' 时）
-- 注意：这是按 team_id 维度的约束，不是按 volunteer 维度
-- sibling-teams 互斥需要在应用层校验（同志愿者下的小队）
-- 这里添加的是防止同一小队重复选择同一主题的约束
DROP INDEX IF EXISTS idx_team_theme_selections_team_cycle_theme_unique;
CREATE UNIQUE INDEX idx_team_theme_selections_team_cycle_theme_unique
  ON team_theme_selections(team_id, theme_id, cycle)
  WHERE status = 'in_progress';

-- ============================================================
-- 4. cloud_market_listings 乐观锁索引（辅助防超卖）
-- ============================================================
-- 已有 idx_cloud_market_listings_status，这里补充 available_quantity 索引
CREATE INDEX IF NOT EXISTS idx_cloud_market_listings_available_qty 
  ON cloud_market_listings(available_quantity) 
  WHERE available_quantity > 0;

-- ============================================================
-- 5. parent_team_relations 关注关系索引（加速 IDOR 校验查询）
-- ============================================================
-- 注意：实际表名为 parent_team_relations，无 is_active/status 字段
CREATE INDEX IF NOT EXISTS idx_parent_team_relations_parent_team
  ON parent_team_relations(parent_id, team_id);

-- ============================================================
-- 6. 通知 PostgREST 刷新 schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. 验证
-- ============================================================
SELECT 
  'likes_unique_constraint' AS check_name,
  COUNT(*) AS exists_count
FROM information_schema.table_constraints 
WHERE constraint_name = 'likes_submission_team_unique'

UNION ALL

SELECT 
  'task_submissions_sold_at' AS check_name,
  COUNT(*) AS exists_count
FROM information_schema.columns 
WHERE table_name = 'task_submissions' AND column_name = 'sold_at'

UNION ALL

SELECT 
  'team_theme_selections_unique_idx' AS check_name,
  COUNT(*) AS exists_count
FROM pg_indexes 
WHERE indexname = 'idx_team_theme_selections_team_cycle_theme_unique';
