-- 017: 修复 likes 表字段缺失
-- 问题：代码用 from_team_id/to_team_id/stage，但数据库只有 team_id
-- 方案：复用 team_id 作为"点赞者"（语义不变），新增 to_team_id 和 stage 字段
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行

-- ============================================================
-- 1. 添加缺失字段
-- ============================================================
-- to_team_id：被点赞的小队 ID（便于直接查询"收到的点赞"，无需 join task_submissions）
ALTER TABLE likes ADD COLUMN IF NOT EXISTS to_team_id varchar(36);

-- stage：任务阶段标识（用于"每阶段点赞上限"校验）
ALTER TABLE likes ADD COLUMN IF NOT EXISTS stage varchar(20);

-- ============================================================
-- 2. 添加索引
-- ============================================================
-- 加速"我收到的点赞"查询
CREATE INDEX IF NOT EXISTS idx_likes_to_team ON likes(to_team_id) WHERE to_team_id IS NOT NULL;

-- 加速"本阶段点赞数"查询（from_team_id 复用 team_id 字段）
CREATE INDEX IF NOT EXISTS idx_likes_team_stage ON likes(team_id, stage) WHERE stage IS NOT NULL;

-- 加速"我是否点赞过"查询
CREATE INDEX IF NOT EXISTS idx_likes_submission_team ON likes(submission_id, team_id);

-- ============================================================
-- 3. 添加 to_team_id 外键约束
-- ============================================================
ALTER TABLE likes DROP CONSTRAINT IF EXISTS fk_likes_to_team;
ALTER TABLE likes ADD CONSTRAINT fk_likes_to_team
  FOREIGN KEY (to_team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- ============================================================
-- 4. 通知 PostgREST 刷新 schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 5. 验证
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'likes'
ORDER BY ordinal_position;
