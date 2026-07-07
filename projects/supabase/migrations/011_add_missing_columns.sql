-- 011: 补齐代码使用但数据库缺失的字段
-- 修复问题：
--   1. team_skill_learnings.cycle 缺失 → /api/team/skills 500 错误
--   2. teams.icon 缺失 → /api/team/market/listings 500 错误（关联查询 team:team_id(id, name, icon) 失败）
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行（无需 RLS）

-- ============================================================
-- 1. team_skill_learnings 表添加 cycle 字段
--    用于按周期过滤技能学习记录（与 teams.cycle 配合）
--    代码引用：src/app/api/team/skills/route.ts L71, L121, L212
--             src/app/api/team/materials/route.ts L125, L236
--             以及 submissions、current-task、parent/team-detail 等多处
-- ============================================================
ALTER TABLE team_skill_learnings ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1;

-- 为现有记录回填 cycle=1（历史数据归属第一周期）
UPDATE team_skill_learnings SET cycle = 1 WHERE cycle IS NULL;

-- 添加索引：按 team_id + cycle 查询最常用
CREATE INDEX IF NOT EXISTS idx_team_skill_learnings_team_cycle
  ON team_skill_learnings(team_id, cycle);

-- ============================================================
-- 2. teams 表添加 icon 字段
--    用于小队头像/图标展示
--    代码引用：src/app/api/team/market/listings/route.ts L34
--             src/app/api/team/market/listings/[id]/route.ts L21, L31
--             src/storage/database/shared/schema.ts L250
-- ============================================================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS icon VARCHAR(255);

-- ============================================================
-- 3. 验证
-- ============================================================
-- 验证 team_skill_learnings.cycle 已添加
SELECT
  'team_skill_learnings.cycle' AS field,
  COUNT(*) AS rows_with_cycle
FROM team_skill_learnings
WHERE cycle IS NOT NULL;

-- 验证 teams.icon 已添加（此查询不依赖字段数据，仅验证字段存在）
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'teams' AND column_name = 'icon';
