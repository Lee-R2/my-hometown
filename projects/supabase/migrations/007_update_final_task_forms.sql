-- ============================================
-- 更新 final_task_forms 表结构
-- 添加代码中使用的列：name, form_config, is_global, team_role, is_active, icon, created_by, updated_at
-- ============================================

-- 添加 name 列（如果不存在）
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS name VARCHAR(200);

-- 用 title 的值回填 name（如果 name 为空）
UPDATE final_task_forms SET name = title WHERE name IS NULL AND title IS NOT NULL;

-- 添加 form_config 列（如果不存在）
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS form_config JSONB;

-- 用 fields 的值回填 form_config（如果 form_config 为空）
UPDATE final_task_forms SET form_config = fields WHERE form_config IS NULL AND fields IS NOT NULL;

-- 添加 is_global 列
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT true;

-- 添加 team_role 列
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS team_role VARCHAR(20);

-- 添加 is_active 列
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 添加 icon 列
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '🏆';

-- 添加 created_by 列
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS created_by VARCHAR(36);

-- 添加 updated_at 列
ALTER TABLE final_task_forms
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 确保 name 有默认值（NOT NULL 约束可选，视需要）
-- ALTER TABLE final_task_forms ALTER COLUMN name SET NOT NULL;
