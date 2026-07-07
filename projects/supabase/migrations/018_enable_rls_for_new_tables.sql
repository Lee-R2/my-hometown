-- 018: 为后续迁移新增的表启用 RLS
-- 修复问题：012 迁移新建的 cloud_market_listings/offers/trades 表
--          以及 agent_communications 表未启用 RLS，anon key 可直接读写
-- 防护策略：启用 RLS 但不创建 anon 策略 = 禁止 anon 直接访问
--          所有访问必须通过服务端 API（service_role key 自动绕过 RLS）
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行

-- ============================================================
-- 1. cloud_market_listings（012 迁移新建）
-- ============================================================
ALTER TABLE cloud_market_listings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. cloud_market_offers（012 迁移新建）
-- ============================================================
ALTER TABLE cloud_market_offers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. cloud_market_trades（012 迁移新建）
-- ============================================================
ALTER TABLE cloud_market_trades ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. agent_communications（跨智能体通信表）
--    该表未在迁移文件中显式 CREATE，使用 DO 块安全启用 RLS
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_communications'
  ) THEN
    ALTER TABLE agent_communications ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================================
-- 5. task_feedback_knowledge（001 迁移已启用，幂等重申）
--    001 迁移第 151 行已 ENABLE RLS，此处幂等执行无副作用
-- ============================================================
ALTER TABLE task_feedback_knowledge ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 验证：列出上述表的 RLS 启用状态
-- ============================================================
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'cloud_market_listings',
    'cloud_market_offers',
    'cloud_market_trades',
    'agent_communications',
    'task_feedback_knowledge'
  )
ORDER BY tablename;

-- ============================================================
-- 说明
-- ============================================================
-- 1. 启用 RLS 但不创建 policy = 默认拒绝 anon 角色的所有操作
-- 2. service_role key 自动绕过 RLS，服务端 API 不受影响
-- 3. 客户端若用 anon key 直接查询这些表，将得到空结果或 42501 错误
-- 4. 所有数据访问必须通过服务端 API 路由（已使用 service_role）
