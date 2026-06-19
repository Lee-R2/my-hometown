-- ============================================
-- 更新 final_task_submissions 表结构
-- 添加 API 代码使用的缺失列
-- ============================================

-- 添加 task_id 列
ALTER TABLE final_task_submissions
ADD COLUMN IF NOT EXISTS task_id VARCHAR(36);

-- 添加 member_id 列
ALTER TABLE final_task_submissions
ADD COLUMN IF NOT EXISTS member_id VARCHAR(36);

-- 添加 member_role 列
ALTER TABLE final_task_submissions
ADD COLUMN IF NOT EXISTS member_role VARCHAR(20);

-- 添加 form_data 列（存储表单填写数据）
ALTER TABLE final_task_submissions
ADD COLUMN IF NOT EXISTS form_data JSONB;

-- 添加 cycle 列（周期，用于区分不同轮次）
ALTER TABLE final_task_submissions
ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1;

-- 添加 updated_at 列
ALTER TABLE final_task_submissions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 添加唯一约束（用于 upsert 冲突检测）
-- team_id + task_id + member_id + cycle 组合唯一
CREATE UNIQUE INDEX IF NOT EXISTS idx_final_task_submissions_unique
ON final_task_submissions(team_id, task_id, member_id, cycle);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_final_task_submissions_team_task
ON final_task_submissions(team_id, task_id);

CREATE INDEX IF NOT EXISTS idx_final_task_submissions_team_task_cycle
ON final_task_submissions(team_id, task_id, cycle);

-- 确保 RLS 策略允许 team 角色执行 upsert
-- upsert 需要 INSERT + UPDATE 权限，已有：
-- team_create_final_submissions (INSERT)
-- team_update_own_final_submissions (UPDATE)
-- 这些策略应该足够了
