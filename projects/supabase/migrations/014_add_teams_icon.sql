-- 014: 补添加 teams.icon 字段（之前 011 可能未执行成功）
-- 修复问题：column teams_1.icon does not exist
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行

-- 添加 teams.icon 字段
ALTER TABLE teams ADD COLUMN IF NOT EXISTS icon VARCHAR(255);

-- 通知 PostgREST 刷新 schema cache
NOTIFY pgrst, 'reload schema';

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'teams' AND column_name = 'icon';
