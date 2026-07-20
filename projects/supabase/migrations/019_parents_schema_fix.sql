-- ============================================================
-- 019_parents_schema_fix.sql
-- 修复家长相关表名与代码不匹配的问题
--
-- 问题：
--   1. 代码使用 .from('parents')，但数据库表名为 parent_accounts
--   2. 代码使用 .from('parent_team_follows')，但数据库表名为 parent_team_relations
--   3. 缺少代码所需的字段：status, is_active, school_name, relation,
--      child_name, child_grade, reviewed_by, reviewed_at, review_remark,
--      guardian_reason, followed_at, unfollowed_at
--
-- 解决方案：重命名表并补齐字段
-- ============================================================

-- ============================================================
-- 第1部分：重命名 parent_accounts → parents，并补齐字段
-- ============================================================

-- 1.1 重命名表（仅当 parent_accounts 存在且 parents 不存在时）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'parent_accounts'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'parents'
    ) THEN
        ALTER TABLE parent_accounts RENAME TO parents;
        RAISE NOTICE '已将 parent_accounts 重命名为 parents';
    ELSE
        RAISE NOTICE 'parents 表已存在或 parent_accounts 不存在，跳过重命名';
    END IF;
END $$;

-- 1.2 为 parents 表补齐代码所需的字段（已存在则跳过）
ALTER TABLE parents ADD COLUMN IF NOT EXISTS school_name VARCHAR(100);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS relation VARCHAR(20);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS child_name VARCHAR(100);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS child_grade VARCHAR(50);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';
ALTER TABLE parents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(36);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS review_remark TEXT;

-- 1.3 为已有数据补充默认值（status/is_active）
UPDATE parents SET status = 'approved' WHERE status IS NULL;
UPDATE parents SET is_active = TRUE WHERE is_active IS NULL;

-- 1.4 创建索引
CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents(phone);
CREATE INDEX IF NOT EXISTS idx_parents_school_id ON parents(school_id);
CREATE INDEX IF NOT EXISTS idx_parents_status ON parents(status);

-- ============================================================
-- 第2部分：重命名 parent_team_relations → parent_team_follows，并补齐字段
-- ============================================================

-- 2.1 重命名表（仅当 parent_team_relations 存在且 parent_team_follows 不存在时）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'parent_team_relations'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'parent_team_follows'
    ) THEN
        ALTER TABLE parent_team_relations RENAME TO parent_team_follows;
        RAISE NOTICE '已将 parent_team_relations 重命名为 parent_team_follows';
    ELSE
        RAISE NOTICE 'parent_team_follows 表已存在或 parent_team_relations 不存在，跳过重命名';
    END IF;
END $$;

-- 2.2 为 parent_team_follows 表补齐代码所需的字段
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS child_name VARCHAR(100);
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS child_grade VARCHAR(50);
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS guardian_reason TEXT;
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS school_id VARCHAR(36);
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS school_name VARCHAR(100);
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS unfollowed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(36);
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE parent_team_follows ADD COLUMN IF NOT EXISTS review_remark TEXT;

-- 2.3 为已有数据补充默认值
UPDATE parent_team_follows SET status = 'approved' WHERE status IS NULL;
UPDATE parent_team_follows SET is_active = TRUE WHERE is_active IS NULL;
UPDATE parent_team_follows SET followed_at = created_at WHERE followed_at IS NULL;

-- 2.4 创建索引
CREATE INDEX IF NOT EXISTS idx_parent_team_follows_parent_id ON parent_team_follows(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_team_follows_team_id ON parent_team_follows(team_id);
CREATE INDEX IF NOT EXISTS idx_parent_team_follows_status ON parent_team_follows(status);
CREATE INDEX IF NOT EXISTS idx_parent_team_follows_is_active ON parent_team_follows(is_active);

-- ============================================================
-- 第3部分：更新 RLS 策略
-- （旧的策略基于 parent_accounts / parent_team_relations 表名，需重建）
-- ============================================================

-- 3.1 删除基于旧表名的 RLS 策略（忽略错误，可能已不存在）
DROP POLICY IF EXISTS "admin_read_parents" ON parent_accounts;
DROP POLICY IF EXISTS "parent_read_own_account" ON parent_accounts;
DROP POLICY IF EXISTS "admin_write_parents" ON parent_accounts;
DROP POLICY IF EXISTS "parent_register" ON parent_accounts;
DROP POLICY IF EXISTS "parent_update_own_account" ON parent_accounts;

DROP POLICY IF EXISTS "admin_read_parent_relations" ON parent_team_relations;
DROP POLICY IF EXISTS "parent_read_own_relations" ON parent_team_relations;
DROP POLICY IF EXISTS "team_read_parent_relations" ON parent_team_relations;
DROP POLICY IF EXISTS "teacher_read_parent_relations" ON parent_team_relations;
DROP POLICY IF EXISTS "admin_write_parent_relations" ON parent_team_relations;

-- 3.2 启用 RLS（如果尚未启用）
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_team_follows ENABLE ROW LEVEL SECURITY;

-- 3.3 为 parents 表创建新策略
CREATE POLICY "admin_read_parents_v2"
    ON parents FOR SELECT TO anon
    USING (is_admin());

CREATE POLICY "parent_read_own_account_v2"
    ON parents FOR SELECT TO anon
    USING (is_parent() AND id = app_user_id());

CREATE POLICY "admin_write_parents_v2"
    ON parents FOR ALL TO anon
    USING (is_admin()) WITH CHECK (is_admin());

-- 家长可自行注册（INSERT）和更新自己的账号（UPDATE）
CREATE POLICY "parent_register_v2"
    ON parents FOR INSERT TO anon
    WITH CHECK (true);

CREATE POLICY "parent_update_own_account_v2"
    ON parents FOR UPDATE TO anon
    USING (is_parent() AND id = app_user_id())
    WITH CHECK (is_parent() AND id = app_user_id());

-- 3.4 为 parent_team_follows 表创建新策略
CREATE POLICY "admin_read_parent_follows"
    ON parent_team_follows FOR SELECT TO anon
    USING (is_admin());

CREATE POLICY "parent_read_own_follows"
    ON parent_team_follows FOR SELECT TO anon
    USING (is_parent() AND parent_id = app_user_id());

CREATE POLICY "team_read_parent_follows"
    ON parent_team_follows FOR SELECT TO anon
    USING (is_team() AND team_id = app_team_id());

CREATE POLICY "teacher_read_parent_follows"
    ON parent_team_follows FOR SELECT TO anon
    USING (is_teacher());

CREATE POLICY "admin_write_parent_follows"
    ON parent_team_follows FOR ALL TO anon
    USING (is_admin()) WITH CHECK (is_admin());

-- 家长可创建/更新自己的关注记录
CREATE POLICY "parent_insert_own_follows"
    ON parent_team_follows FOR INSERT TO anon
    WITH CHECK (is_parent() AND parent_id = app_user_id());

CREATE POLICY "parent_update_own_follows"
    ON parent_team_follows FOR UPDATE TO anon
    USING (is_parent() AND parent_id = app_user_id())
    WITH CHECK (is_parent() AND parent_id = app_user_id());

-- ============================================================
-- 第4部分：验证
-- ============================================================

-- 显示最终表结构（执行后在 Supabase 控制台可见）
COMMENT ON TABLE parents IS '家长账号表（由 parent_accounts 重命名而来）';
COMMENT ON TABLE parent_team_follows IS '家长-小队关注记录表（由 parent_team_relations 重命名而来）';

RAISE NOTICE '迁移完成：parents 和 parent_team_follows 表已就绪';
