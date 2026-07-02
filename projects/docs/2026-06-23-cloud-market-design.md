# 云朵市集 设计文档

- **日期**：2026-06-23
- **状态**：待实施
- **作者**：项目维护者 + AI 协作
- **关联**：基于 `src/storage/database/shared/schema.ts` 现有结构扩展

---

## 1. 背景与目标

### 1.1 背景

项目是一个面向乡村小学的探究式学习系统。小队（teams）在任务主题（task_themes）下完成自主探究任务，过程中通过奖励机制获得积分（points）、工具（tool_card / hidden_tool）、技能（skill_card / hidden_skill）、作品（task_submissions）等资产。

当前小队间资产流通仅有"借积分 / 赠送积分"和"黑板报互动"两个渠道，缺乏让小队主动交易技能、工具、作品的机制。

### 1.2 目标

新增"云朵市集"功能，让小队能在指定范围内（同任务主题或同小学）相互出售、购买、兑换技能/工具/作品，激活小队间的协作与流通。

### 1.3 非目标

- 不涉及现金交易，仅以积分为货币
- 不做拍卖竞价模式
- 不做交易审核环节（成交即生效）
- 管理员仅查询和导出，不干预交易

---

## 2. 需求规格

### 2.1 用户故事

| 角色 | 故事 |
|---|---|
| 小队 | 我能在市集浏览同主题/同学校小队上架的物品，按类型筛选 |
| 小队 | 我能上架出售自己拥有的工具、技能、作品，按数量上架 |
| 小队 | 我能发布求购单，系统自动推荐匹配的出售商品 |
| 小队 | 我能对出售商品发起议价（多报价并存），卖家接受后成交 |
| 小队 | 我能发布兑换单，寻找愿意物物交换的小队 |
| 小队 | 我能查看自己的挂单和交易历史 |
| 超级管理员 | 我能查看所有小队的交易数据并导出 CSV |
| 志愿者 | 我能查看自己指导的小队的交易数据并导出 CSV |
| 小学老师 | 我能查看本校所有小队的交易数据并导出 CSV |

### 2.2 关键决策汇总

| 维度 | 决策 |
|---|---|
| 范围模式 | 默认显示"同任务主题"，可筛选"同学校"/"全部" |
| 物品来源 | 工具/技能从 `user_rewards` 选；作品关联 `task_submissions`，允许上架时改写描述和呈现方式 |
| 购买模式 | 一口价 + 多报价议价并存（多个买家同时报价，卖家择一接受） |
| 兑换含义 | 物物交换（不涉及积分补差） |
| 交付机制 | 线上仅电子物品转移；实物限制同校，线下交付后在系统完成积分支付/兑换流程 |
| 归属转移 | 工具独占转移、技能复制共享、作品电子档复制 |
| 数量规则 | 按 `user_rewards` 数量上架，可售 ≤ N 件 |
| 求购匹配 | 系统自动推荐同范围内匹配的出售商品 |
| 审核 | 无审核，直接成交 |
| 管理员 | 仅查询+导出 CSV |
| 交易范围 | 出售/购买/兑换/求购全部统一同范围 |
| 上架范围锁定 | 上架时锁定 scope，不随后续主题切换变化 |

### 2.3 物品类型映射

| 物品类型 | 来源表 | 来源 reward.type | 归属转移 |
|---|---|---|---|
| tool（工具） | `user_rewards` → `rewards` | `badge`、`gem`、`tool_card`、`hidden_tool` | 独占转移 |
| skill（技能） | `user_rewards` → `rewards` | `skill_card`、`hidden_skill` | 复制共享 |
| work（作品） | `task_submissions` | — | 复制（电子档） |

---

## 3. 数据模型

### 3.1 新增表

#### 3.1.1 `cloud_market_listings`（挂单表）

出售、求购、兑换共用此表，用 `listing_type` 区分。

| 字段 | 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|---|
| id | id | varchar(36) PK | default uuid | 主键 |
| teamId | team_id | varchar(36) | notNull | 挂单小队 |
| listingType | listing_type | varchar(20) | notNull | `sell` / `buy` / `barter` |
| itemType | item_type | varchar(20) | notNull | `tool` / `skill` / `work` |
| itemRef | item_ref | varchar(36) | | user_reward_id 或 submission_id |
| itemName | item_name | varchar(200) | notNull | 展示名（作品可覆盖原作标题） |
| itemDescription | item_description | text | | 展示描述（作品可改写） |
| itemImageUrl | item_image_url | varchar(500) | | 展示图（作品可重新呈现） |
| quantity | quantity | integer | notNull default 1 | 上架数量 |
| availableQuantity | available_quantity | integer | notNull | 剩余可成交数量（部分成交后递减） |
| price | price | integer | | 一口价积分（sell/buy 必填，barter 为空） |
| barterFor | barter_for | jsonb | | 兑换期望 `{itemType, itemName?}` |
| scope | scope | varchar(20) | notNull | `theme` / `school`（上架时锁定） |
| themeId | theme_id | varchar(36) | | scope=theme 时必填 |
| schoolId | school_id | varchar(36) | | scope=school 时必填 |
| status | status | varchar(20) | notNull default 'active' | `active` / `sold_out` / `cancelled` / `traded` |
| createdAt | created_at | timestamp | defaultNow | |
| updatedAt | updated_at | timestamp | | |
| expiresAt | expires_at | timestamp | | 可选过期时间 |

**索引**：
- `idx_cloud_market_listings_team_id` (team_id)
- `idx_cloud_market_listings_scope_theme` (scope, theme_id)
- `idx_cloud_market_listings_scope_school` (scope, school_id)
- `idx_cloud_market_listings_status` (status)
- `idx_cloud_market_listings_item_type` (item_type)

#### 3.1.2 `cloud_market_offers`（报价表）

议价报价和兑换响应共用此表。

| 字段 | 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|---|
| id | id | varchar(36) PK | default uuid | |
| listingId | listing_id | varchar(36) | notNull | 关联挂单 |
| fromTeamId | from_team_id | varchar(36) | notNull | 报价小队 |
| offerType | offer_type | varchar(20) | notNull | `price`（议价）/ `barter`（兑换响应） |
| offerPrice | offer_price | integer | | 议价积分（offerType=price 时） |
| offerItemType | offer_item_type | varchar(20) | | 兑换响应物品类型 |
| offerItemRef | offer_item_ref | varchar(36) | | 兑换响应物品 user_reward_id |
| offerItemName | offer_item_name | varchar(200) | | 兑换响应物品名 |
| offerQuantity | offer_quantity | integer | default 1 | 兑换响应物品数量 |
| status | status | varchar(20) | notNull default 'pending' | `pending` / `accepted` / `rejected` / `auto_expired` |
| createdAt | created_at | timestamp | defaultNow | |
| respondedAt | responded_at | timestamp | | |

**索引**：
- `idx_cloud_market_offers_listing_id` (listing_id)
- `idx_cloud_market_offers_from_team` (from_team_id)
- `idx_cloud_market_offers_status` (status)

#### 3.1.3 `cloud_market_trades`（成交记录表）

| 字段 | 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|---|
| id | id | varchar(36) PK | default uuid | |
| listingId | listing_id | varchar(36) | notNull | 关联挂单 |
| buyerTeamId | buyer_team_id | varchar(36) | notNull | 买方/兑换发起方 |
| sellerTeamId | seller_team_id | varchar(36) | notNull | 卖方/兑换响应方 |
| tradeType | trade_type | varchar(20) | notNull | `buy` / `barter` |
| itemType | item_type | varchar(20) | notNull | 物品类型 |
| itemName | item_name | varchar(200) | notNull | 物品名 |
| quantity | quantity | integer | notNull | 成交数量 |
| pointsPaid | points_paid | integer | default 0 | 买方支付积分 |
| barterItemType | barter_item_type | varchar(20) | | 兑换物品类型 |
| barterItemName | barter_item_name | varchar(200) | | 兑换物品名 |
| barterQuantity | barter_quantity | integer | | 兑换物品数量 |
| scope | scope | varchar(20) | notNull | 成交时范围 |
| themeId | theme_id | varchar(36) | | |
| schoolId | school_id | varchar(36) | | |
| offerId | offer_id | varchar(36) | | 关联报价（若通过议价/兑换响应成交） |
| status | status | varchar(20) | notNull default 'completed' | `completed` / `disputed` / `refunded` |
| createdAt | created_at | timestamp | defaultNow | |
| completedAt | completed_at | timestamp | defaultNow | |

**索引**：
- `idx_cloud_market_trades_listing_id` (listing_id)
- `idx_cloud_market_trades_buyer` (buyer_team_id)
- `idx_cloud_market_trades_seller` (seller_team_id)
- `idx_cloud_market_trades_scope` (scope, theme_id, school_id)
- `idx_cloud_market_trades_created_at` (created_at)

### 3.2 复用现有表

- `teams` — 小队积分余额，交易时用乐观锁更新
- `user_rewards` — 工具/技能归属，转移时增删记录
- `task_submissions` — 作品来源，复制时新建记录
- `point_transactions` — 记录积分变动（新增 changeType: `market_buy` / `market_sell`）
- `team_notifications` — 交易完成通知双方

### 3.3 schema 同步

新表需添加到 `src/storage/database/shared/schema.ts`，遵循现有 drizzle-orm 约定（见研究结论：主键 uuid、timestamp with timezone、索引命名 `idx_{table}_{col}`）。

---

## 4. API 设计

所有小队端 API 走 `requireTeam` 鉴权，强制使用 token 中的 teamId 防越权。
所有管理端 API 走 `requireAdmin` + `requiredRoles` 校验，数据范围由 `agent-scope.ts` 限定。

### 4.1 小队端 API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/team/market/listings` | 查询挂单列表（带筛选：scope/item_type/listing_type/keyword） |
| POST | `/api/team/market/listings` | 创建挂单（出售/求购/兑换） |
| GET | `/api/team/market/listings/[id]` | 挂单详情（含推荐匹配，仅求购单） |
| PATCH | `/api/team/market/listings/[id]` | 修改自己的挂单（仅 active 状态，仅价格/描述/状态） |
| DELETE | `/api/team/market/listings/[id]` | 下架自己的挂单（status→cancelled） |
| POST | `/api/team/market/listings/[id]/offers` | 对挂单报价（议价或兑换响应） |
| POST | `/api/team/market/trades/[id]/complete` | 完成交易（一口价直接购买走此接口） |
| GET | `/api/team/market/my` | 我的挂单 + 交易历史 |

#### 4.1.1 关键请求/响应

**POST /api/team/market/listings**（创建挂单）
```json
// 请求
{
  "listing_type": "sell",       // sell / buy / barter
  "item_type": "tool",          // tool / skill / work
  "item_ref": "user_reward_id",
  "item_name": "隐藏工具卡·星辰罗盘",
  "item_description": "在夜空下可辨别方向",
  "item_image_url": null,
  "quantity": 2,
  "price": 50,                  // sell/buy 必填
  "barter_for": null,           // barter 必填 {itemType, itemName?}
  "scope": "theme",             // theme / school
  "expires_at": null
}

// 响应
{ "success": true, "data": { "id": "listing_uuid", "status": "active" } }
```

**POST /api/team/market/listings/[id]/offers**（报价）
```json
// 议价
{ "offer_type": "price", "offer_price": 40 }

// 兑换响应
{ "offer_type": "barter", "offer_item_type": "skill", "offer_item_ref": "user_reward_id", "offer_item_name": "隐语术", "offer_quantity": 1 }
```

**POST /api/team/market/trades/[id]/complete**（一口价直接购买）
```json
// 请求
{ "quantity": 1 }
// 后端原子操作：校验积分→扣积分→转移归属→写交易记录→通知
```

### 4.2 管理端 API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/admin/market/trades` | 查询交易记录（按 scope/角色过滤数据范围） |
| GET | `/api/admin/market/export` | 导出 CSV |

#### 4.2.1 数据范围过滤

- `super_admin` / `admin`：全部交易
- `volunteer`：仅 `seller_team_id` 或 `buyer_team_id` 属于自己指导的小队（`teams.assigned_volunteer_id = current_user.id`）
- `teacher`：仅 `seller_team_id` 或 `buyer_team_id` 属于本校小队（`teams.school_id = current_user.schoolId`）

### 4.3 鉴权与安全

- 所有写操作强制使用 token 中的 teamId，忽略客户端传入的 team_id
- 创建挂单时校验：item_ref 确实属于当前小队
- 上架数量校验：同物品 active 挂单累计 + 已成交未交付 ≤ 持有数量
- 议价/兑换响应校验：from_team_id 不能等于 listing.team_id
- 成交时乐观锁：与现有 borrow 系统一致，`.eq('points', expectedValue)` 防并发双花

---

## 5. 前端设计

### 5.1 小队端页面

| 路径 | 文件 | 用途 |
|---|---|---|
| `/team/market` | `src/app/team/market/page.tsx` | 市集首页：筛选器 + 挂单列表 |
| `/team/market/list` | `src/app/team/market/list/page.tsx` | 创建挂单表单 |
| `/team/market/my` | `src/app/team/market/my/page.tsx` | 我的挂单 + 交易历史 |

#### 5.1.1 市集首页布局

```
┌─────────────────────────────────┐
│  ← 返回    云朵市集    退出      │  顶部 nav（复用现有模式）
├─────────────────────────────────┤
│  小队积分：120.0  心碎：3       │  积分展示
├─────────────────────────────────┤
│  [同主题▼] [全部类型▼] [搜索]   │  筛选器
│  [出售] [求购] [兑换]           │  类型 Tab
├─────────────────────────────────┤
│  ┌────────┐ ┌────────┐          │
│  │ 物品卡 │ │ 物品卡 │  挂单列表 │
│  │ 价格   │ │ 求购   │  按类型分 │
│  │ [购买] │ │ [响应] │  组展示   │
│  └────────┘ └────────┘          │
├─────────────────────────────────┤
│  [+ 上架物品]  [我的市集]       │  底部操作入口
└─────────────────────────────────┘
```

#### 5.1.2 创建挂单页

三步表单：
1. **选类型**：出售 / 求购 / 兑换
2. **选物品**：
   - 出售：从 `user_rewards` 列表选（显示持有数量），或从 `task_submissions` 选作品
   - 求购：选物品类型（tool/skill/work），输入期望名称
   - 兑换：选自己的物品 + 填写期望交换的物品类型/名称
3. **定细节**：价格、数量、描述（作品可改写）、范围（theme/school）

#### 5.1.3 我的市集页

Tab 切换：
- **我的挂单**：active + 历史，可下架
- **收到报价**：别人对我挂单的报价，可接受/拒绝
- **我的报价**：我对别人挂单的报价状态
- **交易历史**：买入/卖出/兑换记录

### 5.2 管理端页面

| 路径 | 文件 | 用途 |
|---|---|---|
| `/admin/market` | `src/app/admin/market/page.tsx` | 交易数据查询 + 导出 |

#### 5.2.1 布局

```
┌────────────────────────────────────┐
│  云朵市集交易数据   [导出CSV]       │
├────────────────────────────────────┤
│  [时间范围] [交易类型] [物品类型]   │  筛选器
│  [小队名] [范围]                   │
├────────────────────────────────────┤
│  统计卡片：总交易数 / 总积分流转   │  概览
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ 交易时间  类型  买方  卖方    │  │  Card 列表
│  │ 物品  数量  积分  状态       │  │  （复用 admin
│  └──────────────────────────────┘  │   现有模式）
└────────────────────────────────────┘
```

### 5.3 导航入口

- **小队端**：在 `src/app/team/dashboard/page.tsx` 的卡片入口区新增"云朵市集"卡片，跳转 `/team/market`
- **管理端**：在 `src/lib/permissions.ts` 的 `MODULES` 数组新增 `{ name: '云朵市集', href: '/admin/market' }`，按角色配置权限

### 5.4 通用组件

复用现有 shadcn/ui 组件：
- `Card` / `CardContent` — 列表项容器
- `Badge` — 状态标签
- `Dialog` — 详情/确认弹窗
- `Tabs` — 类型切换
- `Select` / `Input` / `Button` — 表单与筛选

---

## 6. 业务流程

### 6.1 上架校验流程

```
小队提交挂单
  ↓
校验 item_ref 归属当前小队
  ↓
校验持有数量 ≥ 上架数量 + 已有 active 挂单数量
  ↓
校验 scope 与 themeId/schoolId 一致性
  ↓
写入 cloud_market_listings (status=active)
```

### 6.2 一口价购买流程

```
买方点击"购买"
  ↓
校验买方积分 ≥ price * quantity
  ↓
校验卖方挂单仍 active 且 available_quantity ≥ quantity
  ↓
原子事务：
  1. 乐观锁扣买方积分
  2. 乐观锁加卖方积分
  3. 转移归属（工具删除卖方 user_rewards + 插入买方 / 技能仅插入买方 / 作品复制 submission）
  4. 递减 listing.available_quantity，为 0 则 status=sold_out
  5. 写 cloud_market_trades (status=completed)
  6. 写 point_transactions（双方各一条）
  7. 通知双方
  ↓
失败任一步则全部回滚
```

### 6.3 议价流程

```
买方发报价 → 写 cloud_market_offers (status=pending)
  ↓
卖方查看报价列表
  ↓
卖方接受某报价 → 原子事务（同 6.2 但用 offer_price）
  ↓
其他报价自动 status=auto_expired
  ↓
通知所有报价方
```

### 6.4 兑换流程

```
小队 A 发兑换挂单（listing_type=barter, barter_for={itemType, itemName?}）
  ↓
小队 B 浏览到该挂单，点击"响应"
  ↓
B 选择自己的物品 → 写 cloud_market_offers (offer_type=barter)
  ↓
A 查看响应列表，接受某响应
  ↓
原子事务：
  1. 校验双方物品归属仍有效
  2. 转移双方物品归属（按物品类型规则）
  3. 递减双方 listing.available_quantity（B 的物品视为隐式挂单）
  4. 写 cloud_market_trades (trade_type=barter, points_paid=0)
  5. 通知双方
```

### 6.5 求购自动推荐

```
求购单创建/查看详情时
  ↓
查询同 scope + 同 item_type + active 的出售单
  ↓
若 barter_for.itemName 存在，按 item_name 模糊匹配
  ↓
返回推荐列表（按价格升序）
  ↓
求购方可直接点击推荐商品发起购买
```

---

## 7. 安全与并发

### 7.1 并发安全

- 所有积分变动使用乐观锁（`.eq('points', expectedValue)`），与现有 borrow 系统一致
- 归属转移使用 `.eq('id', itemRef).select('id')` 确认行存在再操作
- 成交流程封装在单个 API 路由内，按顺序执行，任一步失败回滚已执行操作

### 7.2 防越权

- 写操作强制使用 `auth.payload.userId` 作为 teamId
- 管理端查询用 `agent-scope.ts` 限定数据范围
- 议价/兑换响应校验 `from_team_id ≠ listing.team_id`

### 7.3 数据完整性

- 工具独占转移：从卖方 `user_rewards` DELETE + 买方 INSERT，数量一致
- 技能复制：仅买方 INSERT，卖方保留
- 作品复制：新建 `task_submissions` 记录，新 id，标记 `source_trade_id`（需新增字段或在 description 中标注）

---

## 8. 错误处理

| 场景 | HTTP 状态 | 响应 |
|---|---|---|
| 未登录 | 401 | `{ error: '未登录' }` |
| 无权操作他人挂单 | 403 | `{ error: '无权操作' }` |
| 持有数量不足 | 400 | `{ error: '持有数量不足' }` |
| 积分不足 | 400 | `{ error: '积分不足' }` |
| 并发冲突（乐观锁失败） | 409 | `{ error: '操作冲突，请重试' }` |
| 挂单已售罄/下架 | 400 | `{ error: '挂单不可用' }` |

所有错误使用 `safeError` 包装，不泄露内部细节。

---

## 9. 测试策略

### 9.1 单元测试

- 上架数量校验逻辑
- 乐观锁积分转移逻辑
- 物品归属转移逻辑（工具/技能/作品三种）

### 9.2 集成测试

- 一口价购买完整流程
- 议价流程（报价→接受→成交→其他报价过期）
- 兑换流程
- 求购推荐匹配

### 9.3 回归测试

- 运行现有 46 个测试确保无破坏
- 手动测试小队端 3 个页面 + 管理端 1 个页面

---

## 10. 实施拆分

按"先拆分功能模块再按顺序搭建"的原则：

### 模块拆分

| 模块 | 内容 | 依赖 |
|---|---|---|
| M1 数据层 | schema 新增 3 表 + 同步数据库 | 无 |
| M2 API 层 | 10 个 API 路由 | M1 |
| M3 小队端 | 3 个页面 + dashboard 入口 | M2 |
| M4 管理端 | 1 个页面 + 权限配置 + 导出 | M2 |
| M5 测试 | 单元 + 集成 + 回归 | M3, M4 |

### 实施顺序

1. M1 → M2（后端先行，可独立用 curl 测试）
2. M3 + M4（前端并行开发）
3. M5（测试收尾）

---

## 11. 已确认的开放问题

### 11.1 作品复制时的来源标记（已确认：方案 A）

`task_submissions` 表新增 `source_trade_id varchar(36)` 可空字段，标记交易复制来源。便于溯源查询、管理员报表关联、链式追溯。Drizzle schema 同步更新。

### 11.2 求购方可浏览全部出售商品（已确认）

求购单和出售单在同一市集首页列表，求购方可自由浏览所有同范围出售商品，不止看系统推荐。推荐仅作为求购详情页的辅助展示。

### 11.3 兑换挂单限制为单件交换（已确认）

兑换挂单的 `available_quantity` 表示"可被响应几次"。每次响应成交后递减 1。响应方 `offer_quantity` 固定为 1（单件交换），复杂多件交换不在本期范围。
