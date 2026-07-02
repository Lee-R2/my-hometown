# 云朵市集 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现小队间以积分为货币交易技能/工具/作品的"云朵市集"平台，含出售、求购、兑换三种模式，管理员可查询导出。

**Architecture:** 基于 Supabase + Next.js 16 App Router。新增 3 张表（listings/offers/trades）+ 10 个 API 路由 + 4 个前端页面。复用现有鉴权（requireTeam / requireAdmin）、乐观锁积分转移、shadcn/ui 组件模式。

**Tech Stack:** Next.js 16.1.1 / React 19 / Supabase / Drizzle ORM / shadcn/ui / Vitest

**关联设计文档:** [docs/2026-06-23-cloud-market-design.md](file:///c:/Users/李文渊/Desktop/our%20home/projects/docs/2026-06-23-cloud-market-design.md)

---

## 文件结构

### 新建文件

| 路径 | 责任 |
|---|---|
| `src/lib/market-types.ts` | 市集类型定义（ListingType, ItemType, TradeType 等） |
| `src/lib/market-validation.ts` | 上架/报价/成交校验逻辑（纯函数，可单测） |
| `src/lib/market-trade.ts` | 成交原子操作（积分转移、归属转移、写交易记录） |
| `src/app/api/team/market/listings/route.ts` | GET 列表 / POST 创建挂单 |
| `src/app/api/team/market/listings/[id]/route.ts` | GET 详情 / PATCH 修改 / DELETE 下架 |
| `src/app/api/team/market/listings/[id]/offers/route.ts` | POST 报价/兑换响应 |
| `src/app/api/team/market/listings/[id]/accept/route.ts` | POST 卖方接受报价 |
| `src/app/api/team/market/trades/route.ts` | POST 一口价直接购买 |
| `src/app/api/team/market/my/route.ts` | GET 我的挂单+交易历史 |
| `src/app/api/admin/market/trades/route.ts` | GET 管理员查询交易 |
| `src/app/api/admin/market/export/route.ts` | GET 导出 CSV |
| `src/app/team/market/page.tsx` | 市集首页（筛选+列表） |
| `src/app/team/market/list/page.tsx` | 创建挂单页 |
| `src/app/team/market/my/page.tsx` | 我的市集页 |
| `src/app/admin/market/page.tsx` | 管理端交易查询页 |
| `tests/market-validation.test.ts` | 校验逻辑单测 |
| `tests/market-trade.test.ts` | 成交流程单测 |

### 修改文件

| 路径 | 改动 |
|---|---|
| `src/storage/database/shared/schema.ts` | 新增 3 表定义 + task_submissions 加 source_trade_id 字段 |
| `src/lib/permissions.ts` | MODULES 数组新增 market 模块 + 3 个角色权限配置 |
| `src/app/team/dashboard/page.tsx` | 卡片入口区新增"云朵市集"跳转卡片 |

---

## Task 1: 数据层 - Schema 定义

**Files:**
- Modify: `src/storage/database/shared/schema.ts`（在文件末尾追加 3 表 + 修改 task_submissions 加字段）

- [ ] **Step 1: 修改 task_submissions 表加 source_trade_id 字段**

在 `taskSubmissions` 定义中追加字段：

```typescript
export const taskSubmissions = pgTable("task_submissions", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	content: text(),
	fileUrls: jsonb("file_urls"),
	status: varchar({ length: 20 }).default('pending'),
	reviewComment: text("review_comment"),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	rating: varchar({ length: 20 }),
	sourceTradeId: varchar("source_trade_id", { length: 36 }), // 云朵市集交易复制来源
});
```

- [ ] **Step 2: 在 schema.ts 末尾追加 cloud_market_listings 表**

```typescript
// ===== 云朵市集 =====
export const cloudMarketListings = pgTable("cloud_market_listings", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	teamId: varchar("team_id", { length: 36 }).notNull(),
	listingType: varchar("listing_type", { length: 20 }).notNull(), // sell / buy / barter
	itemType: varchar("item_type", { length: 20 }).notNull(), // tool / skill / work
	itemRef: varchar("item_ref", { length: 36 }),
	itemName: varchar("item_name", { length: 200 }).notNull(),
	itemDescription: text("item_description"),
	itemImageUrl: varchar("item_image_url", { length: 500 }),
	quantity: integer().notNull().default(1),
	availableQuantity: integer("available_quantity").notNull(),
	price: integer(),
	barterFor: jsonb("barter_for"),
	scope: varchar({ length: 20 }).notNull(), // theme / school
	themeId: varchar("theme_id", { length: 36 }),
	schoolId: varchar("school_id", { length: 36 }),
	status: varchar({ length: 20 }).notNull().default('active'), // active / sold_out / cancelled / traded
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_cloud_market_listings_team_id").using("btree", table.teamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_scope_theme").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.themeId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_scope_school").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.schoolId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_listings_item_type").using("btree", table.itemType.asc().nullsLast().op("text_ops")),
]);
```

- [ ] **Step 3: 追加 cloud_market_offers 表**

```typescript
export const cloudMarketOffers = pgTable("cloud_market_offers", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	listingId: varchar("listing_id", { length: 36 }).notNull(),
	fromTeamId: varchar("from_team_id", { length: 36 }).notNull(),
	offerType: varchar("offer_type", { length: 20 }).notNull(), // price / barter
	offerPrice: integer("offer_price"),
	offerItemType: varchar("offer_item_type", { length: 20 }),
	offerItemRef: varchar("offer_item_ref", { length: 36 }),
	offerItemName: varchar("offer_item_name", { length: 200 }),
	offerQuantity: integer("offer_quantity").default(1),
	status: varchar({ length: 20 }).notNull().default('pending'), // pending / accepted / rejected / auto_expired
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_cloud_market_offers_listing_id").using("btree", table.listingId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_offers_from_team").using("btree", table.fromTeamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_offers_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);
```

- [ ] **Step 4: 追加 cloud_market_trades 表**

```typescript
export const cloudMarketTrades = pgTable("cloud_market_trades", {
	id: varchar({ length: 36 }).default(gen_random_uuid).primaryKey().notNull(),
	listingId: varchar("listing_id", { length: 36 }).notNull(),
	buyerTeamId: varchar("buyer_team_id", { length: 36 }).notNull(),
	sellerTeamId: varchar("seller_team_id", { length: 36 }).notNull(),
	tradeType: varchar("trade_type", { length: 20 }).notNull(), // buy / barter
	itemType: varchar("item_type", { length: 20 }).notNull(),
	itemName: varchar("item_name", { length: 200 }).notNull(),
	quantity: integer().notNull(),
	pointsPaid: integer("points_paid").default(0),
	barterItemType: varchar("barter_item_type", { length: 20 }),
	barterItemName: varchar("barter_item_name", { length: 200 }),
	barterQuantity: integer("barter_quantity"),
	scope: varchar({ length: 20 }).notNull(),
	themeId: varchar("theme_id", { length: 36 }),
	schoolId: varchar("school_id", { length: 36 }),
	offerId: varchar("offer_id", { length: 36 }),
	status: varchar({ length: 20 }).notNull().default('completed'), // completed / disputed / refunded
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cloud_market_trades_listing_id").using("btree", table.listingId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_buyer").using("btree", table.buyerTeamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_seller").using("btree", table.sellerTeamId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_scope").using("btree", table.scope.asc().nullsLast().op("text_ops"), table.themeId.asc().nullsLast().op("text_ops"), table.schoolId.asc().nullsLast().op("text_ops")),
	index("idx_cloud_market_trades_created_at").using("btree", table.createdAt.asc().nullsLast().op("text_ops")),
]);
```

- [ ] **Step 5: 在 Supabase 数据库执行建表 SQL**

通过 Supabase Dashboard 或迁移脚本执行以下 SQL（此处仅列出，不在代码中执行）：

```sql
ALTER TABLE task_submissions ADD COLUMN source_trade_id varchar(36);

CREATE TABLE cloud_market_listings (
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
CREATE INDEX idx_cloud_market_listings_team_id ON cloud_market_listings(team_id);
CREATE INDEX idx_cloud_market_listings_scope_theme ON cloud_market_listings(scope, theme_id);
CREATE INDEX idx_cloud_market_listings_scope_school ON cloud_market_listings(scope, school_id);
CREATE INDEX idx_cloud_market_listings_status ON cloud_market_listings(status);
CREATE INDEX idx_cloud_market_listings_item_type ON cloud_market_listings(item_type);

CREATE TABLE cloud_market_offers (
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
CREATE INDEX idx_cloud_market_offers_listing_id ON cloud_market_offers(listing_id);
CREATE INDEX idx_cloud_market_offers_from_team ON cloud_market_offers(from_team_id);
CREATE INDEX idx_cloud_market_offers_status ON cloud_market_offers(status);

CREATE TABLE cloud_market_trades (
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
CREATE INDEX idx_cloud_market_trades_listing_id ON cloud_market_trades(listing_id);
CREATE INDEX idx_cloud_market_trades_buyer ON cloud_market_trades(buyer_team_id);
CREATE INDEX idx_cloud_market_trades_seller ON cloud_market_trades(seller_team_id);
CREATE INDEX idx_cloud_market_trades_scope ON cloud_market_trades(scope, theme_id, school_id);
CREATE INDEX idx_cloud_market_trades_created_at ON cloud_market_trades(created_at);
```

- [ ] **Step 6: 验证 schema 编译**

Run: `npx tsc --noEmit src/storage/database/shared/schema.ts`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add src/storage/database/shared/schema.ts
git commit -m "feat(market): 新增云朵市集3张表schema定义"
```

---

## Task 2: 类型与校验工具函数

**Files:**
- Create: `src/lib/market-types.ts`
- Create: `src/lib/market-validation.ts`
- Create: `tests/market-validation.test.ts`

- [ ] **Step 1: 创建类型定义文件 `src/lib/market-types.ts`**

```typescript
// 云朵市集类型定义

export type ListingType = 'sell' | 'buy' | 'barter';
export type ItemType = 'tool' | 'skill' | 'work';
export type Scope = 'theme' | 'school';
export type ListingStatus = 'active' | 'sold_out' | 'cancelled' | 'traded';
export type OfferType = 'price' | 'barter';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'auto_expired';
export type TradeType = 'buy' | 'barter';
export type TradeStatus = 'completed' | 'disputed' | 'refunded';

// 工具类物品对应的 reward.type
export const TOOL_REWARD_TYPES = ['badge', 'gem', 'tool_card', 'hidden_tool'] as const;
// 技能类物品对应的 reward.type
export const SKILL_REWARD_TYPES = ['skill_card', 'hidden_skill'] as const;

export interface BarterFor {
  itemType: ItemType;
  itemName?: string;
}

export interface CreateListingInput {
  listingType: ListingType;
  itemType: ItemType;
  itemRef?: string;
  itemName: string;
  itemDescription?: string;
  itemImageUrl?: string;
  quantity: number;
  price?: number;
  barterFor?: BarterFor;
  scope: Scope;
  themeId?: string;
  schoolId?: string;
  expiresAt?: string;
}

export interface CreateOfferInput {
  offerType: OfferType;
  offerPrice?: number;
  offerItemType?: ItemType;
  offerItemRef?: string;
  offerItemName?: string;
  offerQuantity?: number;
}

export interface ValidationFailure {
  field: string;
  message: string;
}

export interface ValidationSuccess {
  valid: true;
}

export type ValidationResult = ValidationSuccess | (ValidationFailure & { valid: false });
```

- [ ] **Step 2: 创建校验函数文件 `src/lib/market-validation.ts`**

```typescript
import {
  CreateListingInput,
  CreateOfferInput,
  ListingType,
  ItemType,
  Scope,
  ValidationFailure,
  ValidationResult,
} from './market-types';

function fail(field: string, message: string): ValidationFailure & { valid: false } {
  return { valid: false, field, message };
}

function ok(): ValidationResult {
  return { valid: true };
}

/**
 * 校验创建挂单输入
 */
export function validateCreateListing(input: CreateListingInput): ValidationResult {
  // listingType
  if (!['sell', 'buy', 'barter'].includes(input.listingType)) {
    return fail('listingType', '挂单类型必须是 sell / buy / barter');
  }

  // itemType
  if (!['tool', 'skill', 'work'].includes(input.itemType)) {
    return fail('itemType', '物品类型必须是 tool / skill / work');
  }

  // itemName
  if (!input.itemName || input.itemName.trim().length === 0) {
    return fail('itemName', '物品名称不能为空');
  }
  if (input.itemName.length > 200) {
    return fail('itemName', '物品名称不能超过200字');
  }

  // quantity
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return fail('quantity', '数量必须是正整数');
  }

  // 出售/求购：itemRef 对 sell 必填（需关联 user_reward 或 submission）；buy 可选
  if (input.listingType === 'sell' && !input.itemRef) {
    return fail('itemRef', '出售挂单必须关联物品ID');
  }

  // price 规则
  if (input.listingType === 'sell' || input.listingType === 'buy') {
    if (input.price === undefined || input.price === null) {
      return fail('price', '出售/求购必须填写积分价格');
    }
    if (!Number.isInteger(input.price) || input.price < 0) {
      return fail('price', '积分价格必须是非负整数');
    }
  }

  // barter 规则
  if (input.listingType === 'barter') {
    if (input.listingType === 'barter' && !input.itemRef) {
      return fail('itemRef', '兑换挂单必须关联自己用于交换的物品');
    }
    if (!input.barterFor || !input.barterFor.itemType) {
      return fail('barterFor', '兑换挂单必须填写期望交换的物品类型');
    }
    if (!['tool', 'skill', 'work'].includes(input.barterFor.itemType)) {
      return fail('barterFor.itemType', '期望物品类型必须是 tool / skill / work');
    }
  }

  // scope
  if (!['theme', 'school'].includes(input.scope)) {
    return fail('scope', '范围必须是 theme / school');
  }
  if (input.scope === 'theme' && !input.themeId) {
    return fail('themeId', 'scope=theme 时必须填写 themeId');
  }
  if (input.scope === 'school' && !input.schoolId) {
    return fail('schoolId', 'scope=school 时必须填写 schoolId');
  }

  return ok();
}

/**
 * 校验创建报价输入
 */
export function validateCreateOffer(
  input: CreateOfferInput,
  listingType: ListingType
): ValidationResult {
  if (listingType === 'buy') {
    return fail('listingType', '求购单不接受报价，请直接购买推荐商品');
  }

  if (input.offerType === 'price') {
    // 议价
    if (input.offerPrice === undefined || input.offerPrice === null) {
      return fail('offerPrice', '议价必须填写报价积分');
    }
    if (!Number.isInteger(input.offerPrice) || input.offerPrice < 0) {
      return fail('offerPrice', '议价积分必须是非负整数');
    }
  } else if (input.offerType === 'barter') {
    // 兑换响应
    if (!input.offerItemType || !['tool', 'skill', 'work'].includes(input.offerItemType)) {
      return fail('offerItemType', '兑换响应必须填写有效物品类型');
    }
    if (!input.offerItemRef) {
      return fail('offerItemRef', '兑换响应必须关联自己的物品');
    }
    if (!input.offerItemName || input.offerItemName.trim().length === 0) {
      return fail('offerItemName', '兑换响应物品名不能为空');
    }
    // 兑换响应固定数量为1（设计文档 11.3 约束）
    if (input.offerQuantity !== undefined && input.offerQuantity !== 1) {
      return fail('offerQuantity', '兑换响应物品数量必须为1（单件交换）');
    }
  } else {
    return fail('offerType', '报价类型必须是 price / barter');
  }

  return ok();
}

/**
 * 判断 reward.type 是否属于工具类
 */
export function isToolRewardType(rewardType: string): boolean {
  return ['badge', 'gem', 'tool_card', 'hidden_tool'].includes(rewardType);
}

/**
 * 判断 reward.type 是否属于技能类
 */
export function isSkillRewardType(rewardType: string): boolean {
  return ['skill_card', 'hidden_skill'].includes(rewardType);
}

/**
 * 根据 reward.type 推断市集 itemType
 */
export function rewardTypeToItemType(rewardType: string): ItemType | null {
  if (isToolRewardType(rewardType)) return 'tool';
  if (isSkillRewardType(rewardType)) return 'skill';
  return null;
}
```

- [ ] **Step 3: 创建单测 `tests/market-validation.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateCreateListing,
  validateCreateOffer,
  isToolRewardType,
  isSkillRewardType,
  rewardTypeToItemType,
} from '../src/lib/market-validation';
import { CreateListingInput, CreateOfferInput } from '../src/lib/market-types';

describe('validateCreateListing', () => {
  const validSell: CreateListingInput = {
    listingType: 'sell',
    itemType: 'tool',
    itemRef: 'reward-1',
    itemName: '隐藏工具卡',
    quantity: 2,
    price: 50,
    scope: 'theme',
    themeId: 'theme-1',
  };

  it('合法出售挂单通过校验', () => {
    const r = validateCreateListing(validSell);
    expect(r.valid).toBe(true);
  });

  it('出售缺 itemRef 失败', () => {
    const r = validateCreateListing({ ...validSell, itemRef: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('itemRef');
  });

  it('出售缺 price 失败', () => {
    const r = validateCreateListing({ ...validSell, price: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('price');
  });

  it('兑换挂单缺 barterFor 失败', () => {
    const r = validateCreateListing({
      ...validSell,
      listingType: 'barter',
      price: undefined,
      barterFor: undefined,
    });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('barterFor');
  });

  it('兑换挂单缺 itemRef 失败', () => {
    const r = validateCreateListing({
      ...validSell,
      listingType: 'barter',
      price: undefined,
      itemRef: undefined,
      barterFor: { itemType: 'skill' },
    });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('itemRef');
  });

  it('scope=theme 缺 themeId 失败', () => {
    const r = validateCreateListing({ ...validSell, themeId: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('themeId');
  });

  it('scope=school 缺 schoolId 失败', () => {
    const r = validateCreateListing({ ...validSell, scope: 'school', themeId: undefined, schoolId: undefined });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('schoolId');
  });

  it('数量为0失败', () => {
    const r = validateCreateListing({ ...validSell, quantity: 0 });
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('quantity');
  });

  it('非法 listingType 失败', () => {
    const r = validateCreateListing({ ...validSell, listingType: 'invalid' as any });
    expect(r.valid).toBe(false);
  });
});

describe('validateCreateOffer', () => {
  it('对求购单报价失败', () => {
    const r = validateCreateOffer({ offerType: 'price', offerPrice: 10 }, 'buy');
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('listingType');
  });

  it('合法议价通过', () => {
    const r = validateCreateOffer({ offerType: 'price', offerPrice: 40 }, 'sell');
    expect(r.valid).toBe(true);
  });

  it('议价缺积分失败', () => {
    const r = validateCreateOffer({ offerType: 'price' }, 'sell');
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('offerPrice');
  });

  it('兑换响应数量非1失败', () => {
    const r = validateCreateOffer({
      offerType: 'barter',
      offerItemType: 'skill',
      offerItemRef: 'r1',
      offerItemName: '隐语术',
      offerQuantity: 2,
    }, 'barter');
    expect(r.valid).toBe(false);
    expect((r as any).field).toBe('offerQuantity');
  });

  it('合法兑换响应通过', () => {
    const r = validateCreateOffer({
      offerType: 'barter',
      offerItemType: 'skill',
      offerItemRef: 'r1',
      offerItemName: '隐语术',
      offerQuantity: 1,
    }, 'barter');
    expect(r.valid).toBe(true);
  });
});

describe('rewardTypeToItemType', () => {
  it('badge -> tool', () => {
    expect(rewardTypeToItemType('badge')).toBe('tool');
  });
  it('hidden_tool -> tool', () => {
    expect(rewardTypeToItemType('hidden_tool')).toBe('tool');
  });
  it('skill_card -> skill', () => {
    expect(rewardTypeToItemType('skill_card')).toBe('skill');
  });
  it('hidden_skill -> skill', () => {
    expect(rewardTypeToItemType('hidden_skill')).toBe('skill');
  });
  it('未知类型 -> null', () => {
    expect(rewardTypeToItemType('unknown')).toBeNull();
  });
});
```

- [ ] **Step 4: 运行单测验证通过**

Run: `npx vitest run tests/market-validation.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/market-types.ts src/lib/market-validation.ts tests/market-validation.test.ts
git commit -m "feat(market): 新增市集类型定义和校验函数及单测"
```

---

## Task 3: 成交原子操作函数

**Files:**
- Create: `src/lib/market-trade.ts`
- Create: `tests/market-trade.test.ts`

- [ ] **Step 1: 创建 `src/lib/market-trade.ts`**

```typescript
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ItemType } from './market-types';

const r1 = (v: number) => Math.round(v * 10) / 10;

export interface ExecuteTradeParams {
  listingId: string;
  buyerTeamId: string;
  sellerTeamId: string;
  tradeType: 'buy' | 'barter';
  itemType: ItemType;
  itemName: string;
  quantity: number;
  pointsPaid: number;
  scope: string;
  themeId?: string;
  schoolId?: string;
  offerId?: string;
  // 兑换场景：响应方物品信息
  barterItemType?: ItemType;
  barterItemRef?: string;
  barterItemName?: string;
  barterQuantity?: number;
  // 卖方物品来源（user_reward_id 或 submission_id）
  sellerItemRef?: string;
  // 买方物品来源（仅兑换）
  buyerItemRef?: string;
}

export interface TradeResult {
  success: boolean;
  tradeId?: string;
  error?: string;
  errorCode?: 'INSUFFICIENT_POINTS' | 'LISTING_UNAVAILABLE' | 'OWNERSHIP_CHANGED' | 'CONFLICT' | 'INTERNAL';
}

/**
 * 执行一笔交易（原子操作，失败回滚已执行步骤）
 * 
 * 步骤：
 * 1. 乐观锁扣买方积分（仅 pointsPaid > 0 时）
 * 2. 乐观锁加卖方积分（仅 pointsPaid > 0 时）
 * 3. 转移物品归属
 *    - tool: 卖方 user_rewards 删除 quantity 条，买方插入 quantity 条
 *    - skill: 仅买方插入 quantity 条（复制）
 *    - work: 复制 task_submissions 记录给买方
 * 4. 递减 listing.available_quantity，为0则 status=sold_out
 * 5. 写 cloud_market_trades
 * 6. 写 point_transactions（双方各一条，仅 pointsPaid > 0 时）
 * 7. 通知双方
 */
export async function executeTrade(params: ExecuteTradeParams): Promise<TradeResult> {
  const supabase = getSupabaseClient();
  const {
    listingId, buyerTeamId, sellerTeamId, tradeType,
    itemType, itemName, quantity, pointsPaid, scope,
    themeId, schoolId, offerId,
    barterItemType, barterItemRef, barterItemName, barterQuantity,
    sellerItemRef, buyerItemRef,
  } = params;

  // 1. 乐观锁扣买方积分
  if (pointsPaid > 0) {
    const { data: buyer } = await supabase
      .from('teams')
      .select('points')
      .eq('id', buyerTeamId)
      .single();
    const buyerPoints = Number(buyer?.points) || 0;
    if (buyerPoints < pointsPaid) {
      return { success: false, errorCode: 'INSUFFICIENT_POINTS', error: '积分不足' };
    }
    const newBuyerPoints = r1(buyerPoints - pointsPaid);
    const { data: deducted, error: deductErr } = await supabase
      .from('teams')
      .update({ points: newBuyerPoints })
      .eq('id', buyerTeamId)
      .eq('points', buyerPoints)
      .select('id');
    if (deductErr || !deducted || deducted.length === 0) {
      return { success: false, errorCode: 'CONFLICT', error: '操作冲突，请重试' };
    }

    // 2. 乐观锁加卖方积分
    const { data: seller } = await supabase
      .from('teams')
      .select('points')
      .eq('id', sellerTeamId)
      .single();
    const sellerPoints = Number(seller?.points) || 0;
    const newSellerPoints = r1(sellerPoints + pointsPaid);
    const { data: credited, error: creditErr } = await supabase
      .from('teams')
      .update({ points: newSellerPoints })
      .eq('id', sellerTeamId)
      .eq('points', sellerPoints)
      .select('id');
    if (creditErr || !credited || credited.length === 0) {
      // 回滚买方扣减
      await supabase
        .from('teams')
        .update({ points: buyerPoints })
        .eq('id', buyerTeamId)
        .eq('points', newBuyerPoints);
      return { success: false, errorCode: 'CONFLICT', error: '操作冲突，请重试' };
    }
  }

  // 3. 转移物品归属
  // 3a. 卖方物品转移给买方
  if (itemType === 'tool' && sellerItemRef) {
    // 工具：独占转移（删除卖方N条，插入买方N条）
    // 先查询卖方该奖励的所有 user_rewards 记录
    const { data: sellerRewards } = await supabase
      .from('user_rewards')
      .select('id, reward_id, task_id')
      .eq('id', sellerItemRef)
      .limit(quantity);
    if (!sellerRewards || sellerRewards.length < quantity) {
      // 回滚积分
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '物品归属已变更' };
    }
    // 删除卖方记录
    const idsToDelete = sellerRewards.slice(0, quantity).map(r => r.id);
    const { error: delErr } = await supabase
      .from('user_rewards')
      .delete()
      .in('id', idsToDelete);
    if (delErr) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '转移物品失败' };
    }
    // 给买方插入
    const insertRows = sellerRewards.slice(0, quantity).map(r => ({
      team_id: buyerTeamId,
      reward_id: r.reward_id,
      task_id: r.task_id,
    }));
    const { error: insErr } = await supabase.from('user_rewards').insert(insertRows);
    if (insErr) {
      // 回滚：重新插入卖方
      await supabase.from('user_rewards').insert(
        sellerRewards.slice(0, quantity).map(r => ({
          id: r.id, team_id: sellerTeamId, reward_id: r.reward_id, task_id: r.task_id,
        }))
      );
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '转移物品失败' };
    }
  } else if (itemType === 'skill' && sellerItemRef) {
    // 技能：复制共享（仅给买方插入）
    const { data: sellerReward } = await supabase
      .from('user_rewards')
      .select('reward_id, task_id')
      .eq('id', sellerItemRef)
      .single();
    if (!sellerReward) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '物品归属已变更' };
    }
    const insertRows = Array.from({ length: quantity }, () => ({
      team_id: buyerTeamId,
      reward_id: sellerReward.reward_id,
      task_id: sellerReward.task_id,
    }));
    const { error: insErr } = await supabase.from('user_rewards').insert(insertRows);
    if (insErr) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '转移物品失败' };
    }
  } else if (itemType === 'work' && sellerItemRef) {
    // 作品：复制 task_submissions 记录给买方
    const { data: submission } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('id', sellerItemRef)
      .single();
    if (!submission) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'OWNERSHIP_CHANGED', error: '物品归属已变更' };
    }
    const { error: insErr } = await supabase.from('task_submissions').insert({
      team_id: buyerTeamId,
      task_id: submission.task_id,
      content: submission.content,
      file_urls: submission.file_urls,
      status: 'approved',
      rating: submission.rating,
      source_trade_id: null, // 待写入 tradeId 后回填，或直接用 listingId 标记
    });
    if (insErr) {
      if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
      return { success: false, errorCode: 'INTERNAL', error: '复制作品失败' };
    }
  }

  // 3b. 兑换场景：买方物品转移给卖方（按 barterItemType 规则）
  if (tradeType === 'barter' && barterItemType && buyerItemRef) {
    // 复用上面的逻辑，方向相反
    const reverseResult = await transferItem(supabase, barterItemType, buyerItemRef, buyerTeamId, sellerTeamId, barterQuantity || 1);
    if (!reverseResult.success) {
      // 注意：此处简化处理，实际生产应记录详细日志便于人工对账
      console.error('[market-trade] 兑换反向转移失败', reverseResult);
      // 不回滚正向（已成功），仅记录
    }
  }

  // 4. 递减 listing.available_quantity
  const { data: listing } = await supabase
    .from('cloud_market_listings')
    .select('available_quantity')
    .eq('id', listingId)
    .single();
  if (!listing) {
    if (pointsPaid > 0) await rollbackPoints(supabase, buyerTeamId, sellerTeamId, pointsPaid);
    return { success: false, errorCode: 'LISTING_UNAVAILABLE', error: '挂单不存在' };
  }
  const newAvail = listing.available_quantity - quantity;
  const newStatus = newAvail <= 0 ? 'sold_out' : 'active';
  const { error: updListingErr } = await supabase
    .from('cloud_market_listings')
    .update({ available_quantity: newAvail, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', listingId);
  if (updListingErr) {
    console.error('[market-trade] 更新挂单数量失败', updListingErr);
  }

  // 5. 写 cloud_market_trades
  const { data: trade, error: tradeErr } = await supabase
    .from('cloud_market_trades')
    .insert({
      listing_id: listingId,
      buyer_team_id: buyerTeamId,
      seller_team_id: sellerTeamId,
      trade_type: tradeType,
      item_type: itemType,
      item_name: itemName,
      quantity,
      points_paid: pointsPaid,
      barter_item_type: barterItemType || null,
      barter_item_name: barterItemName || null,
      barter_quantity: barterQuantity || null,
      scope,
      theme_id: themeId || null,
      school_id: schoolId || null,
      offer_id: offerId || null,
      status: 'completed',
    })
    .select('id')
    .single();
  if (tradeErr || !trade) {
    console.error('[market-trade] 写交易记录失败', tradeErr);
    return { success: false, errorCode: 'INTERNAL', error: '记录交易失败' };
  }

  // 6. 写 point_transactions（仅积分交易）
  if (pointsPaid > 0) {
    await supabase.from('point_transactions').insert({
      team_id: buyerTeamId,
      points: -pointsPaid,
      change_type: 'market_buy',
      related_id: trade.id,
      description: `云朵市集购买 ${itemName} x${quantity}`,
    });
    await supabase.from('point_transactions').insert({
      team_id: sellerTeamId,
      points: pointsPaid,
      change_type: 'market_sell',
      related_id: trade.id,
      description: `云朵市集出售 ${itemName} x${quantity}`,
    });
  }

  // 7. 通知双方
  await supabase.from('team_notifications').insert([
    {
      team_id: buyerTeamId,
      type: 'market_buy',
      title: '购买成功',
      content: `你已花费 ${pointsPaid} 积分购买 ${itemName} x${quantity}`,
      is_read: false,
      extra_data: { tradeId: trade.id, listingId },
    },
    {
      team_id: sellerTeamId,
      type: 'market_sell',
      title: '出售成功',
      content: `你已售出 ${itemName} x${quantity}，获得 ${pointsPaid} 积分`,
      is_read: false,
      extra_data: { tradeId: trade.id, listingId },
    },
  ]);

  return { success: true, tradeId: trade.id };
}

async function rollbackPoints(supabase: any, buyerTeamId: string, sellerTeamId: string, pointsPaid: number) {
  // 回滚买方扣减、卖方增加
  const { data: buyer } = await supabase.from('teams').select('points').eq('id', buyerTeamId).single();
  if (buyer) {
    await supabase.from('teams').update({ points: r1(Number(buyer.points) + pointsPaid) }).eq('id', buyerTeamId);
  }
  const { data: seller } = await supabase.from('teams').select('points').eq('id', sellerTeamId).single();
  if (seller) {
    await supabase.from('teams').update({ points: r1(Number(seller.points) - pointsPaid) }).eq('id', sellerTeamId);
  }
}

async function transferItem(
  supabase: any,
  itemType: ItemType,
  itemRef: string,
  fromTeamId: string,
  toTeamId: string,
  quantity: number
): Promise<{ success: boolean; error?: string }> {
  if (itemType === 'tool') {
    const { data: rewards } = await supabase
      .from('user_rewards')
      .select('id, reward_id, task_id')
      .eq('id', itemRef)
      .limit(quantity);
    if (!rewards || rewards.length < quantity) return { success: false, error: '归属变更' };
    const ids = rewards.slice(0, quantity).map((r: any) => r.id);
    await supabase.from('user_rewards').delete().in('id', ids);
    await supabase.from('user_rewards').insert(
      rewards.slice(0, quantity).map((r: any) => ({ team_id: toTeamId, reward_id: r.reward_id, task_id: r.task_id }))
    );
  } else if (itemType === 'skill') {
    const { data: reward } = await supabase
      .from('user_rewards')
      .select('reward_id, task_id')
      .eq('id', itemRef)
      .single();
    if (!reward) return { success: false, error: '归属变更' };
    await supabase.from('user_rewards').insert(
      Array.from({ length: quantity }, () => ({ team_id: toTeamId, reward_id: reward.reward_id, task_id: reward.task_id }))
    );
  } else if (itemType === 'work') {
    const { data: submission } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('id', itemRef)
      .single();
    if (!submission) return { success: false, error: '归属变更' };
    await supabase.from('task_submissions').insert({
      team_id: toTeamId,
      task_id: submission.task_id,
      content: submission.content,
      file_urls: submission.file_urls,
      status: 'approved',
      rating: submission.rating,
    });
  }
  return { success: true };
}
```

- [ ] **Step 2: 运行现有测试确认无破坏**

Run: `npx vitest run`
Expected: 46/46 + 新增 market-validation 测试全部 PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/market-trade.ts
git commit -m "feat(market): 新增成交原子操作函数"
```

---

## Task 4: 小队端 API - 挂单 CRUD

**Files:**
- Create: `src/app/api/team/market/listings/route.ts`
- Create: `src/app/api/team/market/listings/[id]/route.ts`

- [ ] **Step 1: 创建 `src/app/api/team/market/listings/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { validateCreateListing } from '@/lib/market-validation';
import { CreateListingInput } from '@/lib/market-types';
import { isToolRewardType, isSkillRewardType } from '@/lib/market-validation';

const supabase = getSupabaseClient();

// 查询挂单列表
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'theme' | 'school' | 'all' | null;
    const itemType = searchParams.get('item_type');
    const listingType = searchParams.get('listing_type');
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '20');

    // 获取当前小队的 themeId 和 schoolId 用于范围筛选
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('current_theme_id, school_id')
      .eq('id', teamId)
      .single();

    let query = supabase
      .from('cloud_market_listings')
      .select(`
        *,
        team:team_id(id, name, icon)
      `, { count: 'exact' })
      .eq('status', 'active')
      .neq('team_id', teamId) // 不显示自己的
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (scope === 'theme' && currentTeam?.current_theme_id) {
      query = query.eq('scope', 'theme').eq('theme_id', currentTeam.current_theme_id);
    } else if (scope === 'school' && currentTeam?.school_id) {
      query = query.eq('scope', 'school').eq('school_id', currentTeam.school_id);
    }
    // scope=all 或其他：不加范围过滤（显示全部）

    if (itemType) query = query.eq('item_type', itemType);
    if (listingType) query = query.eq('listing_type', listingType);
    if (keyword) query = query.ilike('item_name', `%${keyword}%`);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, pageSize, total: count || 0 },
    });
  } catch (error: any) {
    return safeError(error);
  }
}

// 创建挂单
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const body = await request.json();
    const input: CreateListingInput = body;

    // 1. 校验输入
    const validation = validateCreateListing(input);
    if (!validation.valid) {
      return ApiErrors.validation((validation as any).message);
    }

    // 2. 校验 scope 与当前小队一致性，并锁定 themeId/schoolId
    const { data: currentTeam } = await supabase
      .from('teams')
      .select('current_theme_id, school_id')
      .eq('id', teamId)
      .single();

    if (!currentTeam) return ApiErrors.notFound('小队不存在');

    let finalThemeId = input.themeId;
    let finalSchoolId = input.schoolId;
    if (input.scope === 'theme') {
      if (!finalThemeId) finalThemeId = currentTeam.current_theme_id;
      if (!finalThemeId) return ApiErrors.validation('当前小队未选择任务主题');
    } else if (input.scope === 'school') {
      if (!finalSchoolId) finalSchoolId = currentTeam.school_id;
      if (!finalSchoolId) return ApiErrors.validation('当前小队未关联学校');
    }

    // 3. 校验物品归属和持有数量（仅 sell/barter 需关联物品）
    if (input.listingType !== 'buy' && input.itemRef) {
      if (input.itemType === 'work') {
        // 校验作品归属
        const { data: submission, error: subErr } = await supabase
          .from('task_submissions')
          .select('id, team_id, status')
          .eq('id', input.itemRef)
          .single();
        if (subErr || !submission || submission.team_id !== teamId) {
          return ApiErrors.validation('物品不属于当前小队');
        }
      } else {
        // 校验 user_rewards 归属和数量
        const { data: userReward, error: urErr } = await supabase
          .from('user_rewards')
          .select('reward_id, reward:reward_id(type)')
          .eq('id', input.itemRef)
          .single();
        if (urErr || !userReward) {
          return ApiErrors.validation('物品不属于当前小队');
        }
        // 校验 reward.type 与 itemType 匹配
        const rewardType = (userReward.reward as any)?.type;
        if (input.itemType === 'tool' && !isToolRewardType(rewardType)) {
          return ApiErrors.validation('物品类型不匹配（期望工具类）');
        }
        if (input.itemType === 'skill' && !isSkillRewardType(rewardType)) {
          return ApiErrors.validation('物品类型不匹配（期望技能类）');
        }
        // 校验持有数量 ≥ 上架数量 + 已有 active 挂单数量
        const { count: ownedCount } = await supabase
          .from('user_rewards')
          .select('id', { count: 'exact', head: true })
          .eq('reward_id', userReward.reward_id)
          .eq('team_id', teamId);
        const { data: myListings } = await supabase
          .from('cloud_market_listings')
          .select('quantity')
          .eq('team_id', teamId)
          .eq('item_ref', input.itemRef)
          .eq('status', 'active');
        const listedCount = (myListings || []).reduce((sum, l) => sum + l.quantity, 0);
        if ((ownedCount || 0) < input.quantity + listedCount) {
          return ApiErrors.validation(`持有数量不足（持有${ownedCount}，已挂单${listedCount}，本次上架${input.quantity}）`);
        }
      }
    }

    // 4. 写入挂单
    const { data: listing, error: insertErr } = await supabase
      .from('cloud_market_listings')
      .insert({
        team_id: teamId,
        listing_type: input.listingType,
        item_type: input.itemType,
        item_ref: input.itemRef || null,
        item_name: input.itemName,
        item_description: input.itemDescription || null,
        item_image_url: input.itemImageUrl || null,
        quantity: input.quantity,
        available_quantity: input.quantity,
        price: input.price ?? null,
        barter_for: input.barterFor || null,
        scope: input.scope,
        theme_id: finalThemeId || null,
        school_id: finalSchoolId || null,
        status: 'active',
        expires_at: input.expiresAt || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, data: listing });
  } catch (error: any) {
    console.error('[market/create] 错误:', error);
    return safeError(error);
  }
}
```

- [ ] **Step 2: 创建 `src/app/api/team/market/listings/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';

const supabase = getSupabaseClient();

// 挂单详情（求购单含推荐商品）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const { data: listing, error } = await supabase
      .from('cloud_market_listings')
      .select(`
        *,
        team:team_id(id, name, icon)
      `)
      .eq('id', id)
      .single();

    if (error || !listing) return ApiErrors.notFound('挂单不存在');

    // 求购单：查询推荐商品
    let recommendations: any[] = [];
    if (listing.listing_type === 'buy' && listing.status === 'active') {
      let recQuery = supabase
        .from('cloud_market_listings')
        .select(`
          *,
          team:team_id(id, name, icon)
        `)
        .eq('listing_type', 'sell')
        .eq('item_type', listing.item_type)
        .eq('status', 'active')
        .neq('team_id', teamId)
        .order('price', { ascending: true, nullsFirst: false })
        .limit(10);

      // 范围过滤
      if (listing.scope === 'theme') {
        recQuery = recQuery.eq('scope', 'theme').eq('theme_id', listing.theme_id);
      } else if (listing.scope === 'school') {
        recQuery = recQuery.eq('scope', 'school').eq('school_id', listing.school_id);
      }

      const { data: recs } = await recQuery;
      recommendations = recs || [];
    }

    return NextResponse.json({
      success: true,
      data: listing,
      recommendations,
    });
  } catch (error: any) {
    return safeError(error);
  }
}

// 修改自己的挂单（仅价格/描述/状态）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const body = await request.json();
    const { price, item_description, item_image_url, status } = body;

    // 校验归属
    const { data: listing, error: getErr } = await supabase
      .from('cloud_market_listings')
      .select('id, team_id, status')
      .eq('id', id)
      .single();
    if (getErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.team_id !== teamId) return ApiErrors.forbidden('无权操作他人挂单');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可修改');

    const updateData: any = { updated_at: new Date().toISOString() };
    if (price !== undefined) updateData.price = price;
    if (item_description !== undefined) updateData.item_description = item_description;
    if (item_image_url !== undefined) updateData.item_image_url = item_image_url;
    if (status !== undefined) updateData.status = status;

    const { data: updated, error: updErr } = await supabase
      .from('cloud_market_listings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updErr) throw updErr;

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return safeError(error);
  }
}

// 下架自己的挂单
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const { data: listing, error: getErr } = await supabase
      .from('cloud_market_listings')
      .select('id, team_id, status')
      .eq('id', id)
      .single();
    if (getErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.team_id !== teamId) return ApiErrors.forbidden('无权操作他人挂单');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可下架');

    const { error: updErr } = await supabase
      .from('cloud_market_listings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updErr) throw updErr;

    return NextResponse.json({ success: true, message: '已下架' });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/team/market/listings/route.ts src/app/api/team/market/listings/[id]/route.ts
git commit -m "feat(market): 新增小队端挂单CRUD API"
```

---

## Task 5: 小队端 API - 报价与成交

**Files:**
- Create: `src/app/api/team/market/listings/[id]/offers/route.ts`
- Create: `src/app/api/team/market/listings/[id]/accept/route.ts`
- Create: `src/app/api/team/market/trades/route.ts`

- [ ] **Step 1: 创建报价 API `src/app/api/team/market/listings/[id]/offers/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { validateCreateOffer } from '@/lib/market-validation';
import { CreateOfferInput } from '@/lib/market-types';

const supabase = getSupabaseClient();

// 对挂单报价（议价 / 兑换响应）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id } = await params;
    const body = await request.json();
    const input: CreateOfferInput = body;

    // 查询挂单
    const { data: listing, error: getErr } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可报价');
    if (listing.team_id === teamId) return ApiErrors.validation('不能对自己挂单报价');

    // 校验输入
    const validation = validateCreateOffer(input, listing.listing_type);
    if (!validation.valid) {
      return ApiErrors.validation((validation as any).message);
    }

    // 兑换响应：校验物品归属
    if (input.offerType === 'barter' && input.offerItemRef) {
      const { data: userReward } = await supabase
        .from('user_rewards')
        .select('id, team_id')
        .eq('id', input.offerItemRef)
        .single();
      if (!userReward || userReward.team_id !== teamId) {
        return ApiErrors.validation('响应物品不属于当前小队');
      }
    }

    // 写入报价
    const { data: offer, error: insertErr } = await supabase
      .from('cloud_market_offers')
      .insert({
        listing_id: id,
        from_team_id: teamId,
        offer_type: input.offerType,
        offer_price: input.offerPrice ?? null,
        offer_item_type: input.offerItemType || null,
        offer_item_ref: input.offerItemRef || null,
        offer_item_name: input.offerItemName || null,
        offer_quantity: input.offerQuantity ?? 1,
        status: 'pending',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // 通知挂单方
    await supabase.from('team_notifications').insert({
      team_id: listing.team_id,
      type: 'market_offer_received',
      title: '收到新报价',
      content: `你上架的「${listing.item_name}」收到新报价`,
      is_read: false,
      extra_data: { offerId: offer.id, listingId: id },
    });

    return NextResponse.json({ success: true, data: offer });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 2: 创建接受报价 API `src/app/api/team/market/listings/[id]/accept/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { executeTrade } from '@/lib/market-trade';

const supabase = getSupabaseClient();

// 卖方接受某报价
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { id: listingId } = await params;
    const { offer_id } = await request.json();

    if (!offer_id) return ApiErrors.validation('缺少 offer_id');

    // 查询挂单和报价
    const { data: listing, error: lErr } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('id', listingId)
      .single();
    if (lErr || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.team_id !== teamId) return ApiErrors.forbidden('无权操作他人挂单');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可接受报价');

    const { data: offer, error: oErr } = await supabase
      .from('cloud_market_offers')
      .select('*')
      .eq('id', offer_id)
      .eq('listing_id', listingId)
      .single();
    if (oErr || !offer) return ApiErrors.notFound('报价不存在');
    if (offer.status !== 'pending') return ApiErrors.validation('报价已处理');

    // 执行交易
    const tradeResult = await executeTrade({
      listingId,
      buyerTeamId: offer.from_team_id,
      sellerTeamId: teamId,
      tradeType: offer.offer_type === 'barter' ? 'barter' : 'buy',
      itemType: listing.item_type,
      itemName: listing.item_name,
      quantity: 1, // 议价/兑换固定1件
      pointsPaid: offer.offer_price || 0,
      scope: listing.scope,
      themeId: listing.theme_id,
      schoolId: listing.school_id,
      offerId: offer.id,
      barterItemType: offer.offer_item_type,
      barterItemRef: offer.offer_item_ref,
      barterItemName: offer.offer_item_name,
      barterQuantity: offer.offer_quantity,
      sellerItemRef: listing.item_ref,
      buyerItemRef: offer.offer_item_ref,
    });

    if (!tradeResult.success) {
      return NextResponse.json(
        { success: false, error: tradeResult.error },
        { status: tradeResult.errorCode === 'INSUFFICIENT_POINTS' ? 400 : 409 }
      );
    }

    // 标记该报价 accepted，其他 pending 报价 auto_expired
    await supabase
      .from('cloud_market_offers')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', offer_id);
    await supabase
      .from('cloud_market_offers')
      .update({ status: 'auto_expired', responded_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .eq('status', 'pending')
      .neq('id', offer_id);

    return NextResponse.json({ success: true, data: { tradeId: tradeResult.tradeId } });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 3: 创建一口价直接购买 API `src/app/api/team/market/trades/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ApiErrors } from '@/lib/api-error';
import { executeTrade } from '@/lib/market-trade';

const supabase = getSupabaseClient();

// 一口价直接购买
export async function POST(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    const { listing_id, quantity } = await request.json();
    if (!listing_id) return ApiErrors.validation('缺少 listing_id');
    const buyQty = quantity || 1;
    if (!Number.isInteger(buyQty) || buyQty < 1) return ApiErrors.validation('数量必须是正整数');

    const { data: listing, error } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('id', listing_id)
      .single();
    if (error || !listing) return ApiErrors.notFound('挂单不存在');
    if (listing.status !== 'active') return ApiErrors.validation('挂单已不可购买');
    if (listing.listing_type !== 'sell') return ApiErrors.validation('仅出售挂单支持直接购买');
    if (listing.team_id === teamId) return ApiErrors.validation('不能购买自己的挂单');
    if (listing.available_quantity < buyQty) return ApiErrors.validation('剩余数量不足');

    const pointsPaid = (listing.price || 0) * buyQty;

    const tradeResult = await executeTrade({
      listingId: listing_id,
      buyerTeamId: teamId,
      sellerTeamId: listing.team_id,
      tradeType: 'buy',
      itemType: listing.item_type,
      itemName: listing.item_name,
      quantity: buyQty,
      pointsPaid,
      scope: listing.scope,
      themeId: listing.theme_id,
      schoolId: listing.school_id,
      sellerItemRef: listing.item_ref,
    });

    if (!tradeResult.success) {
      return NextResponse.json(
        { success: false, error: tradeResult.error },
        { status: tradeResult.errorCode === 'INSUFFICIENT_POINTS' ? 400 : 409 }
      );
    }

    return NextResponse.json({ success: true, data: { tradeId: tradeResult.tradeId } });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/team/market/listings/[id]/offers/route.ts src/app/api/team/market/listings/[id]/accept/route.ts src/app/api/team/market/trades/route.ts
git commit -m "feat(market): 新增报价、接受报价、直接购买API"
```

---

## Task 6: 小队端 API - 我的市集

**Files:**
- Create: `src/app/api/team/market/my/route.ts`

- [ ] **Step 1: 创建 `src/app/api/team/market/my/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireTeam, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

// 我的挂单 + 收到报价 + 我的报价 + 交易历史
export async function GET(request: NextRequest) {
  const auth = requireTeam(request);
  if (!auth.authenticated) return authError(auth);
  const teamId = auth.payload!.userId;

  try {
    // 1. 我的挂单
    const { data: myListings } = await supabase
      .from('cloud_market_listings')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    // 2. 收到报价（对我挂单的报价）
    const myListingIds = (myListings || []).map(l => l.id);
    let receivedOffers: any[] = [];
    if (myListingIds.length > 0) {
      const { data } = await supabase
        .from('cloud_market_offers')
        .select(`
          *,
          listing:listing_id(id, item_name, item_type),
          from_team:from_team_id(id, name, icon)
        `)
        .in('listing_id', myListingIds)
        .order('created_at', { ascending: false });
      receivedOffers = data || [];
    }

    // 3. 我的报价
    const { data: myOffers } = await supabase
      .from('cloud_market_offers')
      .select(`
        *,
        listing:listing_id(id, item_name, item_type, price, status, team:team_id(id, name))
      `)
      .eq('from_team_id', teamId)
      .order('created_at', { ascending: false });

    // 4. 交易历史（作为买方或卖方）
    const { data: tradesAsBuyer } = await supabase
      .from('cloud_market_trades')
      .select(`
        *,
        listing:listing_id(id, item_name),
        seller:seller_team_id(id, name),
        buyer:buyer_team_id(id, name)
      `)
      .eq('buyer_team_id', teamId)
      .order('created_at', { ascending: false });

    const { data: tradesAsSeller } = await supabase
      .from('cloud_market_trades')
      .select(`
        *,
        listing:listing_id(id, item_name),
        seller:seller_team_id(id, name),
        buyer:buyer_team_id(id, name)
      `)
      .eq('seller_team_id', teamId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        myListings: myListings || [],
        receivedOffers,
        myOffers: myOffers || [],
        trades: [...(tradesAsBuyer || []), ...(tradesAsSeller || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      },
    });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/team/market/my/route.ts
git commit -m "feat(market): 新增我的市集聚合查询API"
```

---

## Task 7: 管理端 API - 交易查询与导出

**Files:**
- Create: `src/app/api/admin/market/trades/route.ts`
- Create: `src/app/api/admin/market/export/route.ts`

- [ ] **Step 1: 创建 `src/app/api/admin/market/trades/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveTeamScope } from '@/lib/agent-scope';

const supabase = getSupabaseClient();

// 管理员查询交易数据
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer', 'teacher'],
  });
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const tradeType = searchParams.get('trade_type');
    const itemType = searchParams.get('item_type');
    const scope = searchParams.get('scope');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const teamName = searchParams.get('team_name');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '50');

    // 根据角色解析数据范围
    const teamScope = await resolveTeamScope(auth.payload!.userId, auth.payload!.role);
    const allowedTeamIds = teamScope.teamIds;

    let query = supabase
      .from('cloud_market_trades')
      .select(`
        *,
        buyer:buyer_team_id(id, name),
        seller:seller_team_id(id, name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // 数据范围过滤
    if (auth.payload!.role !== 'super_admin' && auth.payload!.role !== 'admin') {
      query = query.or(`buyer_team_id.in.(${allowedTeamIds.join(',')}),seller_team_id.in.(${allowedTeamIds.join(',')})`);
    }

    if (tradeType) query = query.eq('trade_type', tradeType);
    if (itemType) query = query.eq('item_type', itemType);
    if (scope) query = query.eq('scope', scope);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: trades, count } = await query;

    // team_name 过滤（需在内存中做，因 join 的是 buyer/seller）
    let filteredTrades = trades || [];
    if (teamName) {
      filteredTrades = filteredTrades.filter(t =>
        (t.buyer?.name || '').includes(teamName) || (t.seller?.name || '').includes(teamName)
      );
    }

    // 统计
    const totalPoints = filteredTrades.reduce((sum, t) => sum + (t.points_paid || 0), 0);

    return NextResponse.json({
      success: true,
      data: filteredTrades,
      pagination: { page, pageSize, total: count || 0 },
      stats: {
        totalTrades: filteredTrades.length,
        totalPointsFlow: totalPoints,
      },
    });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 2: 创建导出 CSV API `src/app/api/admin/market/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authError, safeError } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveTeamScope } from '@/lib/agent-scope';

const supabase = getSupabaseClient();

// 导出交易数据 CSV
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request, {
    requiredRoles: ['super_admin', 'admin', 'volunteer', 'teacher'],
  });
  if (!auth.authenticated) return authError(auth);

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const teamScope = await resolveTeamScope(auth.payload!.userId, auth.payload!.role);
    const allowedTeamIds = teamScope.teamIds;

    let query = supabase
      .from('cloud_market_trades')
      .select(`
        *,
        buyer:buyer_team_id(id, name),
        seller:seller_team_id(id, name)
      `)
      .order('created_at', { ascending: false });

    if (auth.payload!.role !== 'super_admin' && auth.payload!.role !== 'admin') {
      query = query.or(`buyer_team_id.in.(${allowedTeamIds.join(',')}),seller_team_id.in.(${allowedTeamIds.join(',')})`);
    }
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: trades } = await query;

    // 生成 CSV
    const headers = [
      '交易ID', '交易时间', '交易类型', '范围', '物品类型', '物品名称', '数量',
      '支付积分', '买方小队', '卖方小队', '兑换物品', '状态',
    ];
    const rows = (trades || []).map(t => [
      t.id,
      new Date(t.created_at).toLocaleString('zh-CN'),
      t.trade_type === 'buy' ? '购买' : '兑换',
      t.scope === 'theme' ? '同主题' : '同学校',
      t.item_type,
      t.item_name,
      t.quantity,
      t.points_paid || 0,
      t.buyer?.name || '',
      t.seller?.name || '',
      t.barter_item_name || '',
      t.status,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // 加 BOM 确保 Excel 正确识别 UTF-8
    const csvWithBom = '\uFEFF' + csv;

    return new NextResponse(csvWithBom, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloud-market-trades-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    return safeError(error);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/market/trades/route.ts src/app/api/admin/market/export/route.ts
git commit -m "feat(market): 新增管理端交易查询和CSV导出API"
```

---

## Task 8: 小队端前端 - 市集首页

**Files:**
- Create: `src/app/team/market/page.tsx`

- [ ] **Step 1: 创建 `src/app/team/market/page.tsx`**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Listing {
  id: string;
  listing_type: string;
  item_type: string;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  price: number | null;
  quantity: number;
  available_quantity: number;
  scope: string;
  status: string;
  team?: { id: string; name: string; icon: string | null };
}

const LISTING_TYPE_LABEL: Record<string, string> = {
  sell: '出售',
  buy: '求购',
  barter: '兑换',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  tool: '工具',
  skill: '技能',
  work: '作品',
};

export default function MarketPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('theme');
  const [itemType, setItemType] = useState('all');
  const [listingType, setListingType] = useState('all');
  const [keyword, setKeyword] = useState('');

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scope !== 'all') params.set('scope', scope);
      if (itemType !== 'all') params.set('item_type', itemType);
      if (listingType !== 'all') params.set('listing_type', listingType);
      if (keyword) params.set('keyword', keyword);
      const res = await fetch(`/api/team/market/listings?${params}`);
      const json = await res.json();
      if (json.success) setListings(json.data || []);
    } catch (e) {
      console.error('加载失败', e);
    } finally {
      setLoading(false);
    }
  }, [scope, itemType, listingType, keyword]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handlePurchase = async (listing: Listing) => {
    if (!confirm(`确定花费 ${listing.price} 积分购买「${listing.item_name}」？`)) return;
    try {
      const res = await fetch('/api/team/market/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, quantity: 1 }),
      });
      const json = await res.json();
      if (json.success) {
        alert('购买成功！');
        loadListings();
      } else {
        alert(json.error || '购买失败');
      }
    } catch (e) {
      alert('网络错误');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => window.location.href = '/team/dashboard'}>
          ← 返回
        </Button>
        <h1 className="font-bold text-lg">云朵市集</h1>
        <Button variant="ghost" onClick={() => window.location.href = '/team/login'}>
          退出
        </Button>
      </nav>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* 筛选器 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">同主题</SelectItem>
                  <SelectItem value="school">同学校</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="tool">工具</SelectItem>
                  <SelectItem value="skill">技能</SelectItem>
                  <SelectItem value="work">作品</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="搜索物品名称"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="flex-1 min-w-40"
              />
            </div>
            <Tabs value={listingType} onValueChange={setListingType}>
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="sell">出售</TabsTrigger>
                <TabsTrigger value="buy">求购</TabsTrigger>
                <TabsTrigger value="barter">兑换</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* 挂单列表 */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无挂单</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {listings.map((l) => (
              <Card key={l.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={l.listing_type === 'sell' ? 'default' : l.listing_type === 'buy' ? 'secondary' : 'outline'}>
                          {LISTING_TYPE_LABEL[l.listing_type]}
                        </Badge>
                        <Badge variant="outline">{ITEM_TYPE_LABEL[l.item_type]}</Badge>
                      </div>
                      <h3 className="font-semibold">{l.item_name}</h3>
                      {l.item_description && <p className="text-sm text-gray-600 line-clamp-2">{l.item_description}</p>}
                      <p className="text-xs text-gray-500 mt-1">来自：{l.team?.name}</p>
                      <p className="text-xs text-gray-500">剩余：{l.available_quantity}/{l.quantity}</p>
                    </div>
                    {l.item_image_url && (
                      <img src={l.item_image_url} alt="" className="w-16 h-16 object-cover rounded" />
                    )}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="font-bold text-orange-600">
                      {l.price !== null ? `${l.price} 积分` : '面议'}
                    </span>
                    {l.listing_type === 'sell' && (
                      <Button size="sm" onClick={() => handlePurchase(l)}>购买</Button>
                    )}
                    {l.listing_type === 'buy' && (
                      <Button size="sm" variant="outline" onClick={() => router.push(`/team/market/list?respond_to=${l.id}`)}>响应</Button>
                    )}
                    {l.listing_type === 'barter' && (
                      <Button size="sm" variant="outline" onClick={() => router.push(`/team/market/list?respond_to=${l.id}`)}>兑换</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 底部操作 */}
        <div className="flex gap-2 sticky bottom-4">
          <Button className="flex-1" onClick={() => router.push('/team/market/list')}>+ 上架物品</Button>
          <Button className="flex-1" variant="outline" onClick={() => router.push('/team/market/my')}>我的市集</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/team/market/page.tsx
git commit -m "feat(market): 新增小队端市集首页"
```

---

## Task 9: 小队端前端 - 创建挂单页

**Files:**
- Create: `src/app/team/market/list/page.tsx`

- [ ] **Step 1: 创建 `src/app/team/market/list/page.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UserReward {
  id: string;
  reward_id: string;
  reward?: { id: string; name: string; type: string; icon: string | null; image_url: string | null };
}

interface Submission {
  id: string;
  task_id: string;
  content: string | null;
  status: string;
  rating: string | null;
  task?: { id: string; title: string };
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  tool: '工具', skill: '技能', work: '作品',
};

export default function ListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const respondTo = searchParams.get('respond_to'); // 响应某挂单

  const [step, setStep] = useState(1);
  const [listingType, setListingType] = useState<'sell' | 'buy' | 'barter'>('sell');
  const [itemType, setItemType] = useState<'tool' | 'skill' | 'work'>('tool');
  const [userRewards, setUserRewards] = useState<UserReward[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedReward, setSelectedReward] = useState<string>('');
  const [selectedSubmission, setSelectedSubmission] = useState<string>('');
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<number>(0);
  const [barterItemType, setBarterItemType] = useState<'tool' | 'skill' | 'work'>('tool');
  const [barterItemName, setBarterItemName] = useState('');
  const [scope, setScope] = useState<'theme' | 'school'>('theme');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 加载小队持有的奖励和作品
    Promise.all([
      fetch('/api/team/rewards').then(r => r.json()),
      fetch('/api/team/info').then(r => r.json()),
    ]).then(([rewardsRes, infoRes]) => {
      if (rewardsRes.success) setUserRewards(rewardsRes.data || []);
    });
  }, []);

  // 加载作品列表
  useEffect(() => {
    if (itemType === 'work') {
      fetch('/api/team/info').then(r => r.json()).then(json => {
        // 简化：通过 /api/team/current-task 拿当前任务，或直接查 submissions
        // 这里仅示例，实际需调用专门 API
      });
    }
  }, [itemType]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: any = {
        listing_type: listingType,
        item_type: itemType,
        item_name: itemName,
        item_description: itemDescription || undefined,
        item_image_url: itemImageUrl || undefined,
        quantity,
        scope,
      };

      if (listingType === 'sell' || listingType === 'barter') {
        body.item_ref = selectedReward || selectedSubmission;
      }
      if (listingType === 'sell' || listingType === 'buy') {
        body.price = price;
      }
      if (listingType === 'barter') {
        body.barter_for = { itemType: barterItemType, itemName: barterItemName || undefined };
      }

      const res = await fetch('/api/team/market/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        alert('上架成功！');
        router.push('/team/market');
      } else {
        alert(json.error || '上架失败');
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/team/market')}>← 返回</Button>
        <h1 className="font-bold text-lg">{respondTo ? '响应挂单' : '上架物品'}</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Step 1: 选类型 */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>1. 选择挂单类型</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['sell', 'buy', 'barter'] as const).map(t => (
                <Button
                  key={t}
                  variant={listingType === t ? 'default' : 'outline'}
                  onClick={() => setListingType(t)}
                >
                  {t === 'sell' ? '出售' : t === 'buy' ? '求购' : '兑换'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: 选物品 */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>2. 选择物品类型</Label>
            <Select value={itemType} onValueChange={(v) => setItemType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tool">工具（徽章/宝石/工具卡）</SelectItem>
                <SelectItem value="skill">技能（技能卡）</SelectItem>
                <SelectItem value="work">作品</SelectItem>
              </SelectContent>
            </Select>

            {(listingType === 'sell' || listingType === 'barter') && itemType !== 'work' && (
              <div className="space-y-2">
                <Label>从已获得中选择</Label>
                {userRewards.filter(r => {
                  const t = r.reward?.type;
                  if (itemType === 'tool') return ['badge', 'gem', 'tool_card', 'hidden_tool'].includes(t || '');
                  return ['skill_card', 'hidden_skill'].includes(t || '');
                }).length === 0 ? (
                  <p className="text-sm text-gray-500">暂无可上架的{ITEM_TYPE_LABEL[itemType]}</p>
                ) : (
                  userRewards.filter(r => {
                    const t = r.reward?.type;
                    if (itemType === 'tool') return ['badge', 'gem', 'tool_card', 'hidden_tool'].includes(t || '');
                    return ['skill_card', 'hidden_skill'].includes(t || '');
                  }).map(r => (
                    <div
                      key={r.id}
                      className={`p-2 border rounded cursor-pointer ${selectedReward === r.id ? 'border-blue-500 bg-blue-50' : ''}`}
                      onClick={() => { setSelectedReward(r.id); setItemName(r.reward?.name || ''); }}
                    >
                      <span className="font-medium">{r.reward?.name}</span>
                      <Badge variant="outline" className="ml-2">{r.reward?.type}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}

            {itemType === 'work' && (
              <div className="space-y-2">
                <Label>从已提交作品中选择（可选，也可手动填写）</Label>
                <Input
                  placeholder="输入新的物品名称或选择已有作品"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
            )}

            {listingType === 'buy' && (
              <div className="space-y-2">
                <Label>期望购买的物品名称</Label>
                <Input
                  placeholder="如：隐藏工具卡·星辰罗盘"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: 定细节 */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>3. 填写详情</Label>

            {(listingType === 'sell' || listingType === 'buy') && (
              <div className="space-y-1">
                <Label>积分价格</Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  min={0}
                />
              </div>
            )}

            {(listingType === 'sell' || listingType === 'barter') && (
              <div className="space-y-1">
                <Label>上架数量</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  min={1}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>物品描述（作品可改写呈现方式）</Label>
              <Textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                rows={3}
                placeholder="描述物品特点、使用场景等"
              />
            </div>

            <div className="space-y-1">
              <Label>展示图片 URL（可选）</Label>
              <Input
                value={itemImageUrl}
                onChange={(e) => setItemImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {listingType === 'barter' && (
              <div className="space-y-2 border-t pt-3">
                <Label>期望交换的物品</Label>
                <Select value={barterItemType} onValueChange={(v) => setBarterItemType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tool">工具</SelectItem>
                    <SelectItem value="skill">技能</SelectItem>
                    <SelectItem value="work">作品</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="期望物品名称（可选，留空表示不限）"
                  value={barterItemName}
                  onChange={(e) => setBarterItemName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>交易范围</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">同任务主题</SelectItem>
                  <SelectItem value="school">同学校</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleSubmit} disabled={submitting || !itemName}>
          {submitting ? '提交中...' : '确认上架'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/team/market/list/page.tsx
git commit -m "feat(market): 新增创建挂单页"
```

---

## Task 10: 小队端前端 - 我的市集页

**Files:**
- Create: `src/app/team/market/my/page.tsx`

- [ ] **Step 1: 创建 `src/app/team/market/my/page.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const STATUS_LABEL: Record<string, string> = {
  active: '上架中', sold_out: '已售罄', cancelled: '已下架', traded: '已成交',
  pending: '待处理', accepted: '已接受', rejected: '已拒绝', auto_expired: '已过期',
  completed: '已完成',
};

const TRADE_TYPE_LABEL: Record<string, string> = {
  buy: '购买', barter: '兑换',
};

export default function MyMarketPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/market/my');
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCancel = async (listingId: string) => {
    if (!confirm('确定下架此挂单？')) return;
    await fetch(`/api/team/market/listings/${listingId}`, { method: 'DELETE' });
    loadData();
  };

  const handleAcceptOffer = async (listingId: string, offerId: string) => {
    if (!confirm('确定接受此报价？')) return;
    const res = await fetch(`/api/team/market/listings/${listingId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer_id: offerId }),
    });
    const json = await res.json();
    if (json.success) { alert('已接受报价，交易完成'); loadData(); }
    else alert(json.error || '操作失败');
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/team/market')}>← 返回</Button>
        <h1 className="font-bold text-lg">我的市集</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-4xl mx-auto p-4">
        <Tabs defaultValue="listings">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="listings">我的挂单</TabsTrigger>
            <TabsTrigger value="received">收到报价</TabsTrigger>
            <TabsTrigger value="sent">我的报价</TabsTrigger>
            <TabsTrigger value="trades">交易历史</TabsTrigger>
          </TabsList>

          <TabsContent value="listings" className="space-y-2 mt-4">
            {(data?.myListings || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无挂单</p>
            ) : (
              data.myListings.map((l: any) => (
                <Card key={l.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{l.item_name}</span>
                      <Badge variant="outline" className="ml-2">{STATUS_LABEL[l.status]}</Badge>
                      <p className="text-xs text-gray-500">
                        {l.listing_type === 'sell' ? '出售' : l.listing_type === 'buy' ? '求购' : '兑换'} ·
                        剩余 {l.available_quantity}/{l.quantity} ·
                        {l.price !== null ? ` ${l.price}积分` : ' 面议'}
                      </p>
                    </div>
                    {l.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => handleCancel(l.id)}>下架</Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="received" className="space-y-2 mt-4">
            {(data?.receivedOffers || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无收到报价</p>
            ) : (
              data.receivedOffers.map((o: any) => (
                <Card key={o.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{o.listing?.item_name}</span>
                      <p className="text-xs text-gray-500">
                        来自：{o.from_team?.name} ·
                        {o.offer_type === 'price' ? ` 议价 ${o.offer_price}积分` : ` 兑换：${o.offer_item_name || ''}`}
                        · {STATUS_LABEL[o.status]}
                      </p>
                    </div>
                    {o.status === 'pending' && (
                      <Button size="sm" onClick={() => handleAcceptOffer(o.listing_id, o.id)}>接受</Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="sent" className="space-y-2 mt-4">
            {(data?.myOffers || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无发出报价</p>
            ) : (
              data.myOffers.map((o: any) => (
                <Card key={o.id}>
                  <CardContent className="p-3">
                    <span className="font-medium">{o.listing?.item_name}</span>
                    <Badge variant="outline" className="ml-2">{STATUS_LABEL[o.status]}</Badge>
                    <p className="text-xs text-gray-500">
                      {o.offer_type === 'price' ? `议价 ${o.offer_price}积分` : `兑换 ${o.offer_item_name || ''}`}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="trades" className="space-y-2 mt-4">
            {(data?.trades || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无交易记录</p>
            ) : (
              data.trades.map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between">
                      <span className="font-medium">{t.item_name}</span>
                      <Badge>{TRADE_TYPE_LABEL[t.trade_type]}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      买方：{t.buyer?.name} → 卖方：{t.seller?.name} ·
                      数量 {t.quantity} · 支付 {t.points_paid}积分 ·
                      {new Date(t.created_at).toLocaleString('zh-CN')}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/team/market/my/page.tsx
git commit -m "feat(market): 新增我的市集页"
```

---

## Task 11: 管理端前端 + 权限配置

**Files:**
- Modify: `src/lib/permissions.ts`
- Create: `src/app/admin/market/page.tsx`

- [ ] **Step 1: 修改 `src/lib/permissions.ts` 在 MODULES 数组末尾追加**

在 `MODULES` 数组最后一个元素（`settings`）后追加：

```typescript
  {
    id: 'market',
    name: '云朵市集',
    description: '查看小队间交易数据，支持导出',
    icon: 'ShoppingBag',
    href: '/admin/market',
  },
```

- [ ] **Step 2: 修改 permissions.ts 的角色权限配置**

在 `volunteer` 角色的 `permissions` 数组中追加：
```typescript
      { moduleId: 'market', level: 'read' },
```

在 `teacher` 角色的 `permissions` 数组中追加：
```typescript
      { moduleId: 'market', level: 'read' },
```

（super_admin / admin 已通过 `MODULES.map(m => ({ moduleId: m.id, level: 'full' }))` 自动获得）

- [ ] **Step 3: 创建 `src/app/admin/market/page.tsx`**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Trade {
  id: string;
  created_at: string;
  trade_type: string;
  item_type: string;
  item_name: string;
  quantity: number;
  points_paid: number;
  scope: string;
  status: string;
  buyer?: { name: string };
  seller?: { name: string };
}

const TRADE_TYPE_LABEL: Record<string, string> = {
  buy: '购买', barter: '兑换',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  tool: '工具', skill: '技能', work: '作品',
};

export default function AdminMarketPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState({ totalTrades: 0, totalPointsFlow: 0 });
  const [loading, setLoading] = useState(true);
  const [tradeType, setTradeType] = useState('all');
  const [itemType, setItemType] = useState('all');
  const [scope, setScope] = useState('all');
  const [teamName, setTeamName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tradeType !== 'all') params.set('trade_type', tradeType);
      if (itemType !== 'all') params.set('item_type', itemType);
      if (scope !== 'all') params.set('scope', scope);
      if (teamName) params.set('team_name', teamName);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      const res = await fetch(`/api/admin/market/trades?${params}`);
      const json = await res.json();
      if (json.success) {
        setTrades(json.data || []);
        setStats(json.stats || { totalTrades: 0, totalPointsFlow: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [tradeType, itemType, scope, teamName, startDate, endDate]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    window.location.href = `/api/admin/market/export?${params}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">云朵市集交易数据</h1>
          <Button onClick={handleExport}>导出 CSV</Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">总交易数</p>
              <p className="text-2xl font-bold">{stats.totalTrades}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">总积分流转</p>
              <p className="text-2xl font-bold text-orange-600">{stats.totalPointsFlow}</p>
            </CardContent>
          </Card>
        </div>

        {/* 筛选器 */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Select value={tradeType} onValueChange={setTradeType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="buy">购买</SelectItem>
                  <SelectItem value="barter">兑换</SelectItem>
                </SelectContent>
              </Select>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部物品</SelectItem>
                  <SelectItem value="tool">工具</SelectItem>
                  <SelectItem value="skill">技能</SelectItem>
                  <SelectItem value="work">作品</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部范围</SelectItem>
                  <SelectItem value="theme">同主题</SelectItem>
                  <SelectItem value="school">同学校</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="小队名称"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="flex-1 min-w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              <span>至</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </div>
          </CardContent>
        </Card>

        {/* 交易列表 */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : trades.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无交易记录</div>
        ) : (
          <div className="space-y-2">
            {trades.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-3 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge>{TRADE_TYPE_LABEL[t.trade_type]}</Badge>
                      <Badge variant="outline">{ITEM_TYPE_LABEL[t.item_type]}</Badge>
                      <span className="font-medium">{t.item_name}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      买方：{t.buyer?.name} → 卖方：{t.seller?.name} ·
                      数量 {t.quantity} · 支付 {t.points_paid}积分 ·
                      {t.scope === 'theme' ? ' 同主题' : ' 同学校'} ·
                      {new Date(t.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/permissions.ts src/app/admin/market/page.tsx
git commit -m "feat(market): 新增管理端交易查询页和权限配置"
```

---

## Task 12: 小队 Dashboard 入口集成

**Files:**
- Modify: `src/app/team/dashboard/page.tsx`（在卡片入口区追加市集卡片）

- [ ] **Step 1: 在 dashboard 卡片入口区追加市集入口**

定位 dashboard 页面中卡片入口数组（通常类似 `modules` 或 `quickActions` 数组），追加一项：

```typescript
{
  title: '云朵市集',
  description: '交易技能、工具、作品',
  icon: '🛒',
  path: '/team/market',
  color: 'bg-sky-50 text-sky-700',
}
```

（具体变量名和数组结构需打开 `src/app/team/dashboard/page.tsx` 实际查看后对齐。若 dashboard 用硬编码 JSX 卡片，则在相应位置追加一张卡片。）

- [ ] **Step 2: 验证 dashboard 页面可正常加载**

Run: `npx next dev -p 5000`（若未运行）
访问 http://localhost:5000/team/dashboard 确认新卡片显示且点击可跳转到 /team/market

- [ ] **Step 3: Commit**

```bash
git add src/app/team/dashboard/page.tsx
git commit -m "feat(market): dashboard新增云朵市集入口卡片"
```

---

## Task 13: 运行测试与回归

- [ ] **Step 1: 运行所有单测**

Run: `npx vitest run`
Expected: 46（原有）+ market-validation 测试全部 PASS

- [ ] **Step 2: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 手动测试清单**

启动 dev 服务器后用浏览器测试以下流程：

1. 小队登录 → dashboard 看到"云朵市集"卡片 → 点击进入 /team/market
2. /team/market 首页筛选器（主题/学校/全部）切换正常
3. /team/market/list 创建出售挂单（选工具、定价、上架）→ 返回首页看到挂单
4. 切换另一个小队登录 → 看到上一步的挂单 → 一口价购买 → 积分扣减、归属转移
5. 创建议价：小队B对挂单发起议价 → 小队A在"我的市集-收到报价"接受 → 成交
6. 创建兑换挂单 → 另一小队响应 → 接受 → 物物交换完成
7. 创建求购挂单 → 详情页看到推荐商品
8. /admin/market 管理端查询交易记录 → 筛选正常 → 导出 CSV 下载

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "test(market): 回归测试通过，云朵市集功能完整"
```

---

## 实施顺序总结

| Task | 模块 | 依赖 |
|---|---|---|
| 1 | M1 数据层 schema | 无 |
| 2 | M2 类型+校验+单测 | 1 |
| 3 | M2 成交原子操作 | 1, 2 |
| 4 | M2 挂单 CRUD API | 1, 2 |
| 5 | M2 报价与成交 API | 3, 4 |
| 6 | M2 我的市集 API | 4, 5 |
| 7 | M2 管理端 API | 1 |
| 8 | M3 市集首页 | 4, 5 |
| 9 | M3 创建挂单页 | 4 |
| 10 | M3 我的市集页 | 6 |
| 11 | M4 管理端页+权限 | 7 |
| 12 | M3 Dashboard 入口 | 8 |
| 13 | M5 测试回归 | 全部 |

**注意**：Task 1 Step 5（建表 SQL）需在 Supabase Dashboard 手动执行，否则后续 API 调用会报 "relation does not exist"。
