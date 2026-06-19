-- ============================================
-- 完整迁移脚本：添加所有缺失的数据库列
-- 请在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. final_task_submissions 表：添加缺失列
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS task_id VARCHAR(36);
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_id VARCHAR(36);
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_role VARCHAR(20);
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS form_data JSONB;
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1;
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. final_task_submissions 表：添加唯一约束（用于 upsert）
CREATE UNIQUE INDEX IF NOT EXISTS idx_final_task_submissions_unique
ON final_task_submissions(team_id, task_id, member_id, cycle);

-- 3. final_task_submissions 表：添加索引
CREATE INDEX IF NOT EXISTS idx_final_task_submissions_team_task
ON final_task_submissions(team_id, task_id);

-- 4. final_task_forms 表：添加缺失列
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT true;
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '🏆';
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. final_task_forms 表：回填 is_global（school_id 为 NULL 的设为全局）
UPDATE final_task_forms SET is_global = true WHERE school_id IS NULL;
UPDATE final_task_forms SET is_global = false WHERE school_id IS NOT NULL;

-- 6. final_task_forms 表：回填 is_active
UPDATE final_task_forms SET is_active = true WHERE is_active IS NULL;

-- 7. task_themes 表：添加表单关联列
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS final_task_form_id UUID REFERENCES final_task_forms(id);
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS guider_form_id UUID REFERENCES final_task_forms(id);
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS light_mage_form_id UUID REFERENCES final_task_forms(id);
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS secret_scholar_form_id UUID REFERENCES final_task_forms(id);

-- 8. task_themes 表：为所有现有主题关联三个角色表单
-- 先获取三个表单的 ID
DO $$
DECLARE
    guider_form_id UUID;
    mage_form_id UUID;
    scholar_form_id UUID;
BEGIN
    -- 获取指引者表单ID
    SELECT id INTO guider_form_id FROM final_task_forms WHERE role = 'guider' LIMIT 1;
    -- 获取光影法师表单ID
    SELECT id INTO mage_form_id FROM final_task_forms WHERE role = 'light_mage' LIMIT 1;
    -- 获取秘语学者表单ID
    SELECT id INTO scholar_form_id FROM final_task_forms WHERE role = 'secret_scholar' LIMIT 1;

    -- 更新所有主题
    IF guider_form_id IS NOT NULL THEN
        UPDATE task_themes SET guider_form_id = guider_form_id WHERE guider_form_id IS NULL;
    END IF;

    IF mage_form_id IS NOT NULL THEN
        UPDATE task_themes SET light_mage_form_id = mage_form_id WHERE light_mage_form_id IS NULL;
    END IF;

    IF scholar_form_id IS NOT NULL THEN
        UPDATE task_themes SET secret_scholar_form_id = scholar_form_id WHERE secret_scholar_form_id IS NULL;
    END IF;

    RAISE NOTICE '已关联表单: guider=%, mage=%, scholar=%', guider_form_id, mage_form_id, scholar_form_id;
END $$;
