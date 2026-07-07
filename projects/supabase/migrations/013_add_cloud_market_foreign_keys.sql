-- 013: 为云朵市集 3 张表添加外键约束
-- 修复问题：PostgREST 报错 "Could not find a relationship between 'cloud_market_listings' and 'team_id' in the schema cache"
-- 原因：cloud_market_listings.team_id 等字段未定义外键，PostgREST 无法推断关联查询（team:team_id(...)）
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行

-- ============================================================
-- 1. cloud_market_listings 的外键
-- ============================================================
-- team_id → teams.id
ALTER TABLE cloud_market_listings
  DROP CONSTRAINT IF EXISTS fk_listings_team;
ALTER TABLE cloud_market_listings
  ADD CONSTRAINT fk_listings_team
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- theme_id → task_themes.id
ALTER TABLE cloud_market_listings
  DROP CONSTRAINT IF EXISTS fk_listings_theme;
ALTER TABLE cloud_market_listings
  ADD CONSTRAINT fk_listings_theme
  FOREIGN KEY (theme_id) REFERENCES task_themes(id) ON DELETE SET NULL;

-- school_id → schools.id
ALTER TABLE cloud_market_listings
  DROP CONSTRAINT IF EXISTS fk_listings_school;
ALTER TABLE cloud_market_listings
  ADD CONSTRAINT fk_listings_school
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;

-- ============================================================
-- 2. cloud_market_offers 的外键
-- ============================================================
-- listing_id → cloud_market_listings.id
ALTER TABLE cloud_market_offers
  DROP CONSTRAINT IF EXISTS fk_offers_listing;
ALTER TABLE cloud_market_offers
  ADD CONSTRAINT fk_offers_listing
  FOREIGN KEY (listing_id) REFERENCES cloud_market_listings(id) ON DELETE CASCADE;

-- from_team_id → teams.id
ALTER TABLE cloud_market_offers
  DROP CONSTRAINT IF EXISTS fk_offers_from_team;
ALTER TABLE cloud_market_offers
  ADD CONSTRAINT fk_offers_from_team
  FOREIGN KEY (from_team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- ============================================================
-- 3. cloud_market_trades 的外键
-- ============================================================
-- listing_id → cloud_market_listings.id
ALTER TABLE cloud_market_trades
  DROP CONSTRAINT IF EXISTS fk_trades_listing;
ALTER TABLE cloud_market_trades
  ADD CONSTRAINT fk_trades_listing
  FOREIGN KEY (listing_id) REFERENCES cloud_market_listings(id) ON DELETE SET NULL;

-- buyer_team_id → teams.id
ALTER TABLE cloud_market_trades
  DROP CONSTRAINT IF EXISTS fk_trades_buyer;
ALTER TABLE cloud_market_trades
  ADD CONSTRAINT fk_trades_buyer
  FOREIGN KEY (buyer_team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- seller_team_id → teams.id
ALTER TABLE cloud_market_trades
  DROP CONSTRAINT IF EXISTS fk_trades_seller;
ALTER TABLE cloud_market_trades
  ADD CONSTRAINT fk_trades_seller
  FOREIGN KEY (seller_team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- ============================================================
-- 4. 验证：刷新 schema cache 并检查外键
-- ============================================================
-- 通知 PostgREST 刷新 schema cache（必须执行，否则关联查询仍会报错）
NOTIFY pgrst, 'reload schema';

-- 验证外键已创建
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'cloud_market_%'
ORDER BY tc.table_name, kcu.column_name;
