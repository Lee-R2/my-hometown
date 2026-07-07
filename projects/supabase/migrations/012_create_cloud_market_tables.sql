-- 012: 创建云朵市集 3 张表
-- 修复问题：cloud_market_listings/cloud_market_offers/cloud_market_trades
--          表从未作为迁移文件执行过，导致 /api/team/market/listings 500 错误
-- 来源：docs/2026-06-23-cloud-market-plan.md（仅写在文档中，未建迁移文件）
-- 执行方式：在 Supabase Dashboard SQL Editor 中执行

-- ============================================================
-- 1. 挂单表 cloud_market_listings
-- ============================================================
CREATE TABLE IF NOT EXISTS cloud_market_listings (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id varchar(36) NOT NULL,
  listing_type varchar(20) NOT NULL,
  item_type varchar(20) NOT NULL,
  item_ref varchar(36),
  item_name varchar(200) NOT NULL,
  item_description text,
  item_image_url varchar(500),
  quantity integer NOT NULL DEFAULT 1,
  available_quantity integer NOT NULL,
  price integer,
  barter_for jsonb,
  scope varchar(20) NOT NULL,
  theme_id varchar(36),
  school_id varchar(36),
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cloud_market_listings_team_id ON cloud_market_listings(team_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_listings_scope_theme ON cloud_market_listings(scope, theme_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_listings_scope_school ON cloud_market_listings(scope, school_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_listings_status ON cloud_market_listings(status);
CREATE INDEX IF NOT EXISTS idx_cloud_market_listings_item_type ON cloud_market_listings(item_type);

-- ============================================================
-- 2. 报价表 cloud_market_offers
-- ============================================================
CREATE TABLE IF NOT EXISTS cloud_market_offers (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id varchar(36) NOT NULL,
  from_team_id varchar(36) NOT NULL,
  offer_type varchar(20) NOT NULL,
  offer_price integer,
  offer_item_type varchar(20),
  offer_item_ref varchar(36),
  offer_item_name varchar(200),
  offer_quantity integer DEFAULT 1,
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cloud_market_offers_listing_id ON cloud_market_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_offers_from_team ON cloud_market_offers(from_team_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_offers_status ON cloud_market_offers(status);

-- ============================================================
-- 3. 交易记录表 cloud_market_trades
-- ============================================================
CREATE TABLE IF NOT EXISTS cloud_market_trades (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id varchar(36) NOT NULL,
  buyer_team_id varchar(36) NOT NULL,
  seller_team_id varchar(36) NOT NULL,
  trade_type varchar(20) NOT NULL,
  item_type varchar(20) NOT NULL,
  item_name varchar(200) NOT NULL,
  quantity integer NOT NULL,
  points_paid integer DEFAULT 0,
  barter_item_type varchar(20),
  barter_item_name varchar(200),
  barter_quantity integer,
  scope varchar(20) NOT NULL,
  theme_id varchar(36),
  school_id varchar(36),
  offer_id varchar(36),
  status varchar(20) NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_market_trades_listing_id ON cloud_market_trades(listing_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_trades_buyer ON cloud_market_trades(buyer_team_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_trades_seller ON cloud_market_trades(seller_team_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_trades_scope ON cloud_market_trades(scope, theme_id, school_id);
CREATE INDEX IF NOT EXISTS idx_cloud_market_trades_created_at ON cloud_market_trades(created_at);

-- ============================================================
-- 4. 验证
-- ============================================================
-- 验证 3 张表已创建
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('cloud_market_listings', 'cloud_market_offers', 'cloud_market_trades')
ORDER BY table_name;
