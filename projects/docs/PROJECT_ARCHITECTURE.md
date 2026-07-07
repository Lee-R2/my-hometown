# 乡村 STEM 教育平台 — 项目架构文档

> 版本：2026-07-03  
> 技术栈：Next.js 16.1.1 (Turbopack) + React 19 + TypeScript + Supabase + shadcn/ui + Vitest 2.1.9

---

## 目录

1. [项目概述](#1-项目概述)
2. [角色体系](#2-角色体系)
3. [权限系统](#3-权限系统)
4. [管理员端完整流程](#4-管理员端完整流程)
5. [小队端完整流程](#5-小队端完整流程)
6. [家长端完整流程](#6-家长端完整流程)
7. [智能体系统](#7-智能体系统)
8. [主题任务全生命周期](#8-主题任务全生命周期)
9. [核心子系统](#9-核心子系统)
10. [数据库结构](#10-数据库结构)
11. [API 路由总览](#11-api-路由总览)
12. [页面路由总览](#12-页面路由总览)

---

## 1. 项目概述

### 1.1 平台定位

面向乡村小学 4-6 年级学生的**探究式 STEM 学习平台**，核心是"小队协作 + 主题任务 + 周期循环"：

- 小队以三角色（指引者/光影法师/秘语学者）协作完成任务
- 每个主题包含 4 阶段任务（走进与发现→动手与实验→深入与创新→展示与分享）
- 每个任务组有 3 个难度变体（easy/medium/hard）
- 完成主题后归档进入新周期（cycle），积分清零但历史保留

### 1.2 三大端

| 端 | 角色 | 入口 | 主要功能 |
|---|---|---|---|
| 管理员端 | super_admin/admin/volunteer/teacher | `/admin/login` | 配置主题任务、审核产出、管理学校/志愿者、查看数据 |
| 小队端 | team（4-6 年级小学生） | `/team/login` | 选主题、学技能、用工具、交产出、看 sibling、逛市集 |
| 家长端 | parent | `/parent/login` | 关注小队、查看学习进度、对话蜡象助手 |

### 1.3 两个智能体

| 智能体 | 服务对象 | 入口 | 核心能力 |
|---|---|---|---|
| 银蛇博士 | 小队学生 | `/api/ai/chat?agent=yinhe` | 学习教练、心理纾解、益智游戏、数据分析、图片视频生成 |
| 蜡象助手 | 管理员/家长 | `/api/ai/chat?agent=laxiang` 或 `/api/admin/assistant` | 数据洞察、主题创建、消息发送、产出评价、跨智能体协作 |

---

## 2. 角色体系

### 2.1 六种角色

```
管理端                              业务端
─────────────────                   ─────────────
super_admin (超级管理员)             team (科考小队)
   └─ admin (管理员)                 parent (家长)
        └─ volunteer (授课志愿者)
        └─ teacher (助学老师)
```

### 2.2 角色对比

| 角色 | 数据表 | 数据范围 | 登录接口 | 主要场景 |
|---|---|---|---|---|
| super_admin | users | all | `/api/auth/login` | 全平台管理 + 用户账号管理 |
| admin | users | all | `/api/auth/login` | 全平台管理 |
| volunteer | users | assigned | `/api/auth/login` | 指导小队、审核产出、发消息 |
| teacher | users | school | `/api/auth/login` | 本校管理、志愿者分配、关注审核 |
| team | teams | — | `/api/auth/team-login` | 协作完成任务 |
| parent | parents | — | `/api/auth/parent-login` | 关注小队、查看进度 |

### 2.3 小队三角色

| 角色 | 标识 | 图标 | 颜色 | 定位 |
|---|---|---|---|---|
| 指引者 | guider | 🧭 | 蓝色 | 引导方向、组织协调 |
| 光影法师 | light_mage | ✨ | 琥珀色 | 视觉创作、媒体产出 |
| 秘语学者 | secret_scholar | 📚 | 紫色 | 文献研究、内容沉淀 |

**约束**：必须三角色齐全才能选择主题；最终任务反馈时每角色填写专属表单。

---

## 3. 权限系统

### 3.1 双层权限模型

**第一层：API 鉴权（粗粒度）**

基于 JWT token 中的 `role` 字段：

| 函数 | 允许角色 |
|---|---|
| `requireAdmin` | super_admin, admin |
| `requireAdminOrVolunteer` | super_admin, admin, volunteer |
| `requireAdminOrTeacher` | super_admin, admin, teacher |
| `requireTeam` | team |
| `requireParent` | parent |
| `requireAnyAuth` | 任意已认证用户 |

**第二层：模块权限（细粒度，仅管理端）**

权限级别：`none`（无）/ `read`（只读）/ `write`（可编辑）/ `full`（完全控制）

配置来源：数据库 `role_permissions` 表（优先）→ `DEFAULT_ROLE_CONFIGS`（降级）

### 3.2 16 个功能模块

| 模块 ID | 中文名 | 路由 |
|---|---|---|
| pretest | 学生前测 | `/admin/pretest` |
| tasks | 任务管理 | `/admin/tasks` |
| final-tasks | 最后任务 | `/admin/final-tasks` |
| teams | 小队管理 | `/admin/teams` |
| submissions | 产出审核 | `/admin/submissions` |
| schools | 项目小学 | `/admin/schools` |
| volunteers | 授课志愿者 | `/admin/volunteers` |
| follow-verifies | 关注审核 | `/admin/follow-verifies` |
| tools | 工具管理 | `/admin/tools` |
| skills | 技能学习 | `/admin/skills` |
| messages | 消息管理 | `/admin/messages` |
| rewards | 激励配置 | `/admin/rewards` |
| feedback | 反馈查看 | `/admin/feedback` |
| blackboard | 家乡黑板报 | `/admin/blackboard` |
| market | 云朵市集 | `/admin/market` |
| settings | 系统设置 | `/admin/settings` |

### 3.3 各角色权限矩阵

| 模块 | super_admin | admin | volunteer | teacher |
|---|---|---|---|---|
| pretest | full | full | read | read |
| tasks | full | full | read | read |
| final-tasks | full | full | read | **none** |
| teams | full | full | write | read |
| submissions | full | full | write | read |
| schools | full | full | read | write |
| volunteers | full | full | **none** | read |
| follow-verifies | full | full | — | — |
| tools | full | full | read | read |
| skills | full | full | read | read |
| messages | full | full | write | read |
| rewards | full | full | read | **none** |
| feedback | full | full | full | **none** |
| blackboard | full | full | write | read |
| market | full | full | read | read |
| settings | full | full | **none** | **none** |

### 3.4 认证流程

1. **登录**：前端 POST 登录接口（用户名/小队编码/手机号 + 密码）
2. **频率限制**：`checkRateLimit(ip, 'login')` 防暴力破解
3. **密码验证**：SHA-256 迭代 10000 次加盐哈希 + `timingSafeEqual` 防时序攻击
4. **创建会话**：`createSession` 生成 JWT（HMAC-SHA256 签名，7 天有效）+ CSRF token，写入 `user_sessions` 表
5. **设置 Cookie**：`session` Cookie，属性 `HttpOnly; SameSite=Strict; Max-Age=7天`（生产加 `Secure`）
6. **页面鉴权**：Layout 调用 `GET /api/auth/me` 校验，失败降级到 localStorage 缓存

### 3.5 权限动态配置

- 超级管理员可通过 `/admin/settings` 调整 volunteer/teacher 的模块权限
- 配置存入 `role_permissions` 表（JSONB）
- 前端 Dashboard 每 30 秒轮询 `/api/sync` 检查权限更新时间戳，有变更则清缓存重新拉取

---

## 4. 管理员端完整流程

### 4.1 仪表盘（`/admin/dashboard`）

**数据面板**：
- 小队总数、待审核产出、已通过产出、志愿者总数、学生总数、学校总数
- 按角色显示不同维度（volunteer 看指导小队、teacher 看本校）
- 每 30 秒检查权限更新

**动态菜单**：基于 `MODULES` + 角色权限过滤，显示权限等级徽章（read/write/full）

**特色功能**：
- 家乡黑板报（`AdminBlackboardSection`）
- 云朵市集入口卡片
- 任务提示气泡（仅 volunteer）
- 待审核关注申请数量徽章（admin/teacher）
- 蜡象助手浮窗（除登录页外全局）

### 4.2 学校管理（`/admin/schools`）

| 操作 | 说明 |
|---|---|
| 创建学校 | 自动创建管理员账号（phone=username, password=123456） |
| 批量上传 | CSV：学校名称,学校地址,老师姓名,老师手机号 |
| 教师 CRUD | 增删改查本校教师 |
| 志愿者分配 | 一个志愿者只能分配给一个老师 |
| 地区级联 | 省→市→县 |
| 权限 | volunteer/teacher 只读 |

### 4.3 志愿者管理（`/admin/volunteers`）

| 操作 | 说明 |
|---|---|
| 创建志愿者 | 手机号验证（`/api/auth/check-phone`） |
| 批量导入 | CSV：手机号,密码,姓名,所属学校 |
| 重置密码 | 默认 123456 |
| 删除 | 软删除 |
| 权限 | teacher 只看自己链接的志愿者 |

### 4.4 主题任务管理（`/admin/tasks`）

#### 主题创建

**两种类型**：
- **全局主题**（isExclusive=false）：仅 admin/super_admin 可创建，所有学校可用
- **专属主题**（isExclusive=true）：volunteer 可创建，仅限本校使用

**创建流程**：
1. 调用 `POST /api/themes`
2. 自动创建 3 个角色（指引者/光影法师/秘语学者）的最终任务表单
3. 主题可关联 `guider_form_id`、`light_mage_form_id`、`secret_scholar_form_id`

#### 任务组配置（`/admin/tasks/[id]`）

**四阶段**：

| stage | 名称 | 设计意图 |
|---|---|---|
| 1 | 走进与发现 | 观察、调研、收集信息 |
| 2 | 动手与实验 | 实践操作、验证假设 |
| 3 | 深入与创新 | 深度探索、创新思考 |
| 4 | 展示与分享 | 成果展示、经验分享 |

**任务组机制**：
- 每个阶段下可创建多个任务组（共享 `task_group_id`）
- 每个任务组包含 3 个难度变体（easy/medium/hard）
- 字段独立配置：title/description/points/requirements/learning_goals
- 完成任一难度变体即视为该任务组完成

**任务类型**：
- `main` 主线任务（必做）
- `side` 支线任务（审核时可选下发）
- `final` 最终任务（主题收尾）

**资源关联**（每个难度独立配置）：
- 工具（tools）：必选/可选、实物/虚拟、库存、每队限额、是否需归还
- 技能（skills）：必学/选学、学习资料（视频/文档/PPT/测试/链接）
- 激励（rewards）：徽章/宝石/技能卡/工具卡/成就、自动/手动发放

#### 任务下发

**API**：`POST /api/admin/assign-task`

1. 取该主题第一个任务组（按 stage + order_index 排序）
2. 校验所有小队 `current_theme_id === themeId` 且 `current_task_id` 为空
3. 按每个小队的 `preferred_difficulty` 匹配变体；无匹配回退 medium，再回退第一个
4. 更新 `teams.current_task_id` 与 `next_task_deadline`

### 4.5 产出审核（`/admin/submissions`）

**完整流程**：

1. **加载列表**：按状态/阶段/主题/学校/小队/日期筛选
2. **打开审核面板**：自动推送上下文给蜡象助手（`setAssistantContext`）
3. **审核表单**：
   - rating：excellent / approved / rejected
   - comment：退回时必填
   - bonusPoints：excellent 3-5 分，approved 1-2 分
   - sideTaskId：支线任务下发（max 1）
   - rewards.tools[]/skills[]：优秀评价额外激励（max 1）
   - nextTaskDeadline：下一任务截止日期
4. **提交审核**：`PUT /api/submissions/[id]/review`

**审核结果**：
- **通过**：加分（乐观锁）+ 发放激励 + 自动下发下一任务组
- **优秀**：额外分配隐藏工具卡/技能卡
- **退回**：学生重新提交

**权限**：
- admin/super_admin：完整审核
- volunteer：审核自己指导的小队
- teacher：**只读**

**超时处理**：`POST /api/admin/overdue-tasks/handle`
- 延期：设置新截止日期 + 扣分（10-30%）
- 跳过：不加分，标记为 incomplete

### 4.6 其他管理模块

| 模块 | 核心操作 |
|---|---|
| **技能管理** | CRUD、关联工具、学习资料管理、11 种分类 |
| **工具管理** | CRUD、关联技能、实物/虚拟、库存、每队限额、图片上传 |
| **激励配置** | CRUD、5 种类型、条件逻辑（and/or）、自动/手动发放 |
| **消息中心** | 发送给小队/志愿者/老师、文字/图片/视频/链接、志愿者可"雾影博士"身份 |
| **反馈管理** | 按表单/小队/学校筛选、批量导出 CSV |
| **关注审核** | 家长关注申请审核（pending/approved/rejected） |
| **家乡黑板报** | 帖子列表、统计、删除（需填原因） |
| **前测管理** | 题目 CRUD、4 种题型、统计 |
| **云朵市集** | 交易数据查询、CSV 导出 |
| **权限设置** | 角色权限矩阵配置（仅 super_admin/admin） |
| **个人中心** | 修改密码（原密码+新密码+确认，最小 6 位） |

---

## 5. 小队端完整流程

### 5.1 完整参与流程（8 阶段）

```
1. 登录初始化
   ↓
2. 完善小队信息（队名/口号/队规）
   ↓
3. 前测问卷（AI 素养四维度评估，+10 积分）
   ↓
4. 添加成员（三角色齐全才能选主题）
   ↓
5. 选择主题（sibling-teams 互斥校验）
   ↓
6. 执行任务（学技能 → 选工具 → 提交产出）
   ↓
7. 审核反馈（通过加分获激励 → 自动下一任务）
   ↓
8. 最终任务（每角色填表单 → 归档 → 新周期）
```

### 5.2 阶段详解

#### 阶段 1：登录
- 访问 `/team/login`，输入小队编码 + 密码
- 调用 `/api/auth/team-login`，设置 HttpOnly Cookie
- localStorage 仅存 `{id, code, name}` 最小化信息

#### 阶段 2：完善小队信息（`/team/members`）
- 首次访问显示「完善小队信息」橙色卡片
- 编辑小队名称、口号（≤50字）、队规
- 调用 `PUT /api/teams/${team.id}` 保存

#### 阶段 3：前测问卷（`/team/pretest`）
- **前置条件**：已设置口号
- AI 素养四维度评估：
  - A 情感与态度（12分）
  - B 使用与协作（12分）
  - C 认知与理解（12分）
  - D 伦理与责任（12分）
- 总分 48 分，等级：advanced/intermediate/beginner/developing
- **完成奖励**：+10 积分
- 所有成员完成后，系统根据结果推荐角色

#### 阶段 4：添加成员（`/team/members`）
- **前置条件**：完成前测
- 必须三个角色齐全：指引者、光影法师、秘语学者
- 调用 `POST /api/teams/${team.id}/members`

#### 阶段 5：选择主题
- **前置条件**：完成前测 + 队名已设置 + 三角色齐全
- 调用 `POST /api/team/select-theme`
- **sibling-teams 互斥**：同志愿者/老师下的小队在同一周期内不能选相同主题
- 主题状态：
  - 当前进行中：高亮显示
  - 已完成（可再次选择，进入新一轮 cycle）
  - 其他小队正在进行：不可选（除非已完成当前主题）

#### 阶段 6：执行任务（`/team/task/[id]`）

**任务获取逻辑**（`/api/team/current-task`）：
1. 优先检查未完成的支线任务
2. 没有支线任务则返回下一个未完成的主线任务组中对应难度变体
3. 所有主线任务完成后，检查是否有最终任务

**执行步骤**：
1. **学技能**：必学技能必须全部完成才能提交产出（首次完成获得积分）
2. **选工具**：必选工具自动分配，可选工具根据库存选择，实物工具需向老师领取
3. **提交产出**：文件上传（图片/视频/文档，100MB），草稿自动保存

**校验**：
- 必学技能未完成 → 阻止提交
- 截止日期已过 → 阻止提交
- 已有 pending 提交 → 阻止重复提交

#### 阶段 7：提交产出（`/team/submit`）
- 文件上传限制：单文件 100MB，总容量 100MB
- 调用 `/api/upload/submission` 上传文件
- 调用 `/api/submissions` 创建提交记录
- 提交后显示工具归还提示 + 银蛇博士评价入口

#### 阶段 8：审核与激励
- 审核通过：加分 + 发激励 + 自动下发下一任务
- 审核退回：重新提交
- 银蛇博士评价：调用 `/api/ai/review-submission`（SSE 流式响应）

#### 最终任务（特殊流程）
- 所有主线任务完成后触发
- 跳转 `/team/final-task-feedback/[id]`
- **按角色填写专属表单**：
  - 指引者表单（guider_form_id）
  - 光影法师表单（light_mage_form_id）
  - 秘语学者表单（secret_scholar_form_id）
  - 通用表单兜底（final_task_form_id）
- 字段类型：text/textarea/radio/checkbox/rating/file/boolean
- 所有成员提交后任务自动完成 → 主题归档 → 进入新周期

### 5.3 小队端 17 个页面

| 路由 | 功能 |
|---|---|
| `/team/login` | 登录 |
| `/team/dashboard` | 主页（主题选择+当前任务+数据看板+市集入口+黑板报+sibling 查看） |
| `/team/members` | 完善信息+成员管理 |
| `/team/settings` | 设置+修改密码+退出 |
| `/team/pretest` | 前测问卷 |
| `/team/tasks` | 任务记录列表 |
| `/team/task/[id]` | 任务详情 |
| `/team/submit` | 提交产出 |
| `/team/learning` | 新知学习（复习模式） |
| `/team/rewards` | 激励中心 |
| `/team/transfer` | 赠送积分 |
| `/team/borrow` | 借积分 |
| `/team/market` | 云朵市集主页 |
| `/team/market/list` | 上架物品 |
| `/team/market/my` | 我的市集 |
| `/team/blackboard` | 家乡黑板报 |
| `/team/messages` | 消息中心 |
| `/team/final-task-feedback/[id]` | 最终任务反馈 |

### 5.4 小队间协作（sibling-teams）

**sibling 定义**：同一志愿者或同一助学老师指导的活跃小队

**协作机制**：
1. **主题互斥**：同一周期内不能选相同主题
2. **进度互看**：可查看 sibling 小队的当前主题、任务进度、已完成主题
3. **产出互看**：可查看 sibling 小队的任务提交记录、文件、评语
4. **点赞激励**：点赞其他小队产出获得 **1 积分**

**周期对比**：
- `isInSameCycle`：两队是否在同一周期
- `cycleGap`：周期差距（正数领先、负数落后）

---

## 6. 家长端完整流程

### 6.1 完整流程

```
1. 注册/登录（手机号 + 密码）
   ↓
2. 搜索学校 → 搜索小队 → 关注申请
   ↓
3. 等待老师审核（pending → approved/rejected）
   ↓
4. 查看孩子学习进度（每 30 秒自动刷新）
   ↓
5. 对话蜡象助手（家长端浮窗）
```

### 6.2 关注小队流程

1. 家长在 dashboard 点击"添加关注"
2. 搜索学校 → 选择学校 → 搜索小队（按小队名/成员名模糊匹配）
3. 提交关注请求 → 后端写入 `parent_team_relations`（status='pending'）
4. **自动通知**：向对应学校老师推送 notifications（type='parent_follow_verify'）
5. 老师在管理端审核（通过/拒绝，拒绝需填原因）
6. 家长查看关注记录状态（待审核/已拒绝/已取消）
7. 已拒绝的申请可修改后重新提交
8. 已通过的可"切换"为当前关注小队（同时存档原小队）
9. 可取消关注（软删除）

### 6.3 查看学习进度

**接口**：`GET /api/parent/team-detail`（家长端最复杂数据聚合接口）

**返回数据**：
- 小队基础信息（名称、code、学校、成员列表）
- 统计数据（总积分、点赞数、宝石碎片数、徽章数、技能卡数）
- 当前主题进度（pending_assign → in_progress → completed）
- 当前任务阶段（learning → ready_submit → pending_review → completed/rejected）
- 已完成主题存档
- 技能学习记录
- 积分历史明细
- 积分转账/借还记录
- 前测结果
- 最后任务反馈

**特性**：每 30 秒静默刷新，保持进度最新

### 6.4 家长端页面

| 路由 | 功能 |
|---|---|
| `/parent/login` | 登录/注册 |
| `/parent/dashboard` | 家长仪表盘 |
| `/parent/assistant` | 独立对话蜡象助手 |

---

## 7. 智能体系统

### 7.1 银蛇博士（yinhe_boshi）

**身份**：乡村守护神银蛇博士，4-6 年级小学生的学习伙伴  
**模型**：doubao-seed-1-8-251228，temperature=0.7  
**入口**：`POST /api/ai/chat?agent=yinhe`  
**组件**：`src/components/ai-assistant/ai-assistant.tsx`

#### 五大能力

| 能力 | 触发方式 | 说明 |
|---|---|---|
| 学习教练 | 自然语言对话 | 费曼学习法 + 知识连接法 + 记忆强化 |
| 心理纾解 | 自动识别负面情绪 | 纾解四步心法（共情→正常化→引导→赋能） |
| 益智游戏 | "玩个游戏"等 | 5 类游戏（文字/逻辑/创意/知识/团队） |
| 数据分析 | `[数据分析] 问题:xxx \| 图表类型:bar/line/pie/table` | NL2SQL + 图表生成 |
| 图片/视频生成 | `[生成图片] prompt:xxx \| teamId:xxx` | 调用 `/api/ai/yinhe-image`、`/api/ai/yinhe-video` |

#### 其他能力

- **自省**：`[自省]`、`[自省统计]`、`[自省历史]`、`[自省解决]`
- **记忆命令**：`[记忆] 保存 L3:核心知识|类型:knowledge|内容:xxx`、`[记忆] 查询 关键词:xxx`
- **反馈标记**：`[反馈] 类型：{创意/困难/建议/优秀} | 内容：{xxx}`（自动转发给蜡象助手）

#### 专属小队数据加载

从 `teams` 表加载完整小队数据：基础信息、成员、当前主题、积分排名、积分历史、激励、未读消息、同期小队、技能学习

### 7.2 蜡象助手（laxiang_zhushou）

**身份**：智慧蜡象，项目管理助手  
**模型**：doubao-seed-1-8-251228，temperature=0.6  
**入口**：`POST /api/ai/chat?agent=laxiang` 或 `POST /api/admin/assistant`  
**组件**：`src/components/admin-assistant.tsx`（管理端）、`src/components/parent-assistant.tsx`（家长端）

#### 七大命令能力

| 命令 | 功能 |
|---|---|
| `[创建主题]{...}[/创建主题]` | 创建主题 |
| `[修改主题]{...}[/修改主题]` | 修改主题 |
| `[配置最后任务]{"theme_id":""}[/配置最后任务]` | 自动配置最后任务表单 |
| `[创建任务组]{...easy/medium/hard...}[/创建任务组]` | 创建任务组（必须 3 难度齐全） |
| `[配置任务资源]{...tools/skills/rewards...}[/配置任务资源]` | 配置任务资源 |
| `[发送消息] 目标类型:xxx \| 目标名称:xxx \| 消息内容:xxx` | 代理发送消息（11 种目标类型） |
| `[记住]{"category":"","key":"","value":""}[/记住]` | 记忆存储 |

#### 其他能力

- **查看产出**：`[查看产出] 小队名称:xxx | 任务名称:xxx`
- **评价产出**：`[评价产出] 小队名称:xxx | 任务名称:xxx | 评价结果:xxx`
- **数据分析**：NL2SQL
- **Word 报告生成**：`/api/ai/laxiang-report?type=xxx`
- **跨智能体协作**：读取银蛇博士的小队观察记录

#### 意图引擎

**六种意图类型**：

| 类型 | 触发词 | temperature |
|---|---|---|
| execution | 创建/添加/配置/删除/修改/发送 | 0.15 |
| query | 查看/查询/分析/统计 | 0.3 |
| creative | 设计/建议/优化/推荐 | 0.5 |
| confirmation | 是/好的/对/确认 | 0.1 |
| navigation | 跳转/去/打开 | 0.3 |
| multi_step | 包含多个操作 | 0.4 |

**对话焦点追踪**：回顾最近 5 轮（10 条消息），提取 focusTheme/focusStage/focusTaskGroup/focusTeam

### 7.3 记忆系统

#### 4 层记忆架构

| 层级 | 过期 | memory_type | 用途 |
|---|---|---|---|
| L1 短期 | 24 小时 | task_progress, user_intent | 临时上下文 |
| L2 中期 | 30 天 | data_insight, work_concern, user_focus | 数据洞察、关注点 |
| L3 长期 | 永久 | team_info, admin_profile, school_context, communication_style, user_info | 核心事实 |
| L4 永恒 | 永不 | （元认知） | 策略、弱点、优势 |

#### 时间感知

每条记忆加载时带 `[X天前]`、`[X小时前]` 时间标签，系统提示词明确要求"旧对话不要主动提及，除非用户明确问起"

#### 记忆蒸馏

- **调度**：每日 03:00 由 scheduler.js 调用 cleanup 端点
- **逻辑**：归档 90 天未活跃且 importance < 3 的记忆（软删除）
- **合并**：相似记忆合并
- **降权**：长期未访问的记忆降低重要性

#### 会话持久化

- **蜡象助手**：sessionStorage（key: `laxiang_session_${userId}` 和 `laxiang_messages_${userId}`）
- **银蛇博士**：sessionStorage（key: `yinshe_session_${teamId}`）
- **特性**：关闭标签即清空，登出主动清空，退出再进入算新对话

### 7.4 跨智能体协作

#### 银蛇博士 → 蜡象助手（反馈链路）

```
银蛇博士生成 [反馈] 标记
    ↓
stream-handler 自动提取
    ↓
POST /api/ai/agent-communication
    ↓
写入 agent_communications 表
    ↓
extractAndStoreFeedback 分类存储
    ↓
写入 task_feedback_knowledge 表
```

**反馈分类**：
| 关键词 | category | feedback_type |
|---|---|---|
| 困难、不会、难 | difficulty | negative |
| 创意、创新、好想法 | creativity | positive |
| 喜欢、有趣、好玩 | engagement | positive |
| 建议、改进 | suggestion | improvement |

#### 蜡象助手读取银蛇博士观察

1. `resolveTeamScope(userRole, userId)`：按角色解析可访问小队范围
2. `getCrossAgentMemories(teamIds)`：查询银蛇博士的 6 种共享记忆类型
   - team_observation
   - learning_progress
   - skill_development
   - team_interaction
   - emotional_state
   - task_completion
3. `formatCrossAgentMemories`：格式化为"【跨智能体协作数据 — 来自银蛇博士的小队观察记录】"
4. 注入蜡象助手系统提示

#### 命令能力对比

| 命令 | 银蛇博士 | 蜡象助手 |
|---|---|---|
| `[数据分析]` | ✅ | ✅ |
| `[自省]` 系列 | ✅ | ✅ |
| `[记忆]` 保存/查询 | ✅ | ✅ |
| `[创建主题]` | ❌ | ✅ |
| `[生成图片]` | ✅ | ❌ |
| `[生成视频]` | ✅ | ❌ |
| `[反馈]` | ✅（发送） | ❌（接收） |
| `[发送消息]` | ❌ | ✅ |
| `[查看产出]` | ❌ | ✅ |
| `[评价产出]` | ❌ | ✅ |

---

## 8. 主题任务全生命周期

### 8.1 完整流程图

```
管理员创建主题（POST /api/themes）
    ├─ 自动创建 3 个角色反馈表单
    └─ 写入 task_themes
    ↓
管理员配置任务组（/admin/tasks/[id]）
    ├─ 4 阶段 × N 任务组 × 3 难度变体
    ├─ 关联 tools/skills/rewards
    └─ 配置最终任务表单
    ↓
管理员下发任务（POST /api/admin/assign-task）
    └─ 更新 teams.current_task_id
    ↓
小队执行任务
    ├─ 学习必学技能（team_skill_learnings）
    ├─ 选择工具（team_tools，实物查库存）
    ├─ 提交产出（task_submissions，含 cycle）
    └─ 银蛇博士评价（可选）
    ↓
管理员审核（PUT /api/submissions/[id]/review）
    ├─ 通过：加分（乐观锁）+ 发激励 + 自动下发下一任务
    ├─ 优秀：额外隐藏工具/技能卡
    ├─ 退回：学生重新提交
    └─ 支线任务：可选下发
    ↓
重复执行 → 走完 4 阶段所有任务组
    ↓
最终任务（/team/final-task-feedback/[id]）
    ├─ 每角色填专属表单
    ├─ 所有成员提交后自动完成
    └─ finalizeFinalTask 归档
    ↓
主题归档
    ├─ 写入 theme_completions（含 cycle）
    ├─ 更新 team_theme_selections.status = 'completed'
    └─ 更新 teams：current_theme_id=null, current_task_id=null, points=0, cycle+1
    ↓
进入新周期 → 选择新主题（sibling-teams 互斥校验）
```

### 8.2 任务组与难度系统

**任务组（task_group_id）**：
- 同一概念任务有 3 个难度变体（easy/medium/hard）
- 共享 task_group_id，完成任一变体即视为完成该任务组
- 小队根据 `teams.preferred_difficulty` 自动匹配

**难度切换**：
- 存储在 `teams.preferred_difficulty`
- Dashboard 上可切换
- `availableDifficulties` 返回该任务组实际存在的难度等级

### 8.3 周期（cycle）机制

**cycle 字段使用位置**：

| 表 | 用途 |
|---|---|
| teams.cycle | 小队当前周期（核心） |
| team_theme_selections.cycle | 主题选择记录 |
| task_submissions.cycle | 任务产出 |
| final_task_submissions.cycle | 最终任务提交 |
| team_skill_learnings.cycle | 技能学习 |
| theme_completions.cycle | 主题完成归档 |

**周期推进**：
1. 完成最终任务 → `teams.cycle + 1`，`points = 0`
2. 进入新周期 → 选择新主题
3. 所有数据按 cycle 过滤，避免跨轮次混淆

**周期清零策略**：
- `teams.points` 清零，但所有历史记录永久保留
- 保证当前周期排名公平（新老小队同周期都从 0 开始）
- 历史成就可追溯（通过 `theme_completions` 查看归档）

---

## 9. 核心子系统

### 9.1 积分系统

**获取**：
- 前测完成：+10
- 任务审核通过：task.points + bonusPoints
- 技能学习完成：task_skills.points（默认 5）
- 点赞其他小队产出：+1
- 赠送积分时获得爱心碎片

**消耗**：
- 云朵市集购买
- 借积分归还（含利息）

**安全**：
- 乐观锁防止并发双花：`.eq('points', currentPoints)`
- 所有 API 强制使用 token 中的 userId

**流转**：
- 赠送（transfer）：`POST /api/team/transfer`
- 借贷（borrow）：`POST /api/team/borrow`，含 interest_rate、overdue_interest_rate、repay_date
- 借贷状态：pending/approved/rejected/repaid/overdue/partial_repaid

### 9.2 爱心碎片与爱心宝石

**碎片来源**：
- 每送出 3 个点赞兑换 0.1 个碎片
- 每赠送 10 积分兑换 0.1 个碎片

**宝石合成**：
- 集齐 10 个碎片合成 1 颗爱心宝石
- 存储在 teams.heart_shards 和 teams.heart_gems

### 9.3 激励系统

**类型**：
- badge（徽章）、gem（宝石）
- skill_card（技能卡）、hidden_skill（隐藏技能）
- tool_card（工具卡）、hidden_tool（隐藏工具）
- achievement（成就）、certificate（证书）
- heart_fragment（爱心碎片）、heart_gem（爱心宝石）

**发放**：
- 任务审核通过后自动发放（distribution_method=auto）
- 志愿者手动分配（distribution_method=manual）
- 记录在 user_rewards 表，按 cycle 过滤

**用途**：云朵市集上架出售/兑换

### 9.4 技能学习系统

**数据模型**：
- `task_skills`：关联任务与技能，is_required（必学/选学）、points
- `team_skill_learnings`：学习状态（not_started/in_progress/completed）

**流程**：
1. 开始学习：`POST /api/team/skills`（status: in_progress）
2. 完成学习：`PUT /api/team/skills`（status: completed，发放积分）
3. 首次完成获得积分，复习不重复得分

**必学技能校验**：
- 按 cycle 过滤学习记录
- allRequiredSkillsCompleted 为 false 时阻止任务提交

**自动绑定**：选择实物工具时，通过 tool_skills 自动创建技能学习记录

### 9.5 工具系统

**类型**：
- physical（实物）：需向老师领取，有库存限制
- virtual（虚拟）：自动分配

**三层库存**：
- `tools.stock`：全局参考库存
- `school_tools.stock/used`：学校级库存
- `team_tools`：小队按任务领取记录

**库存计算**：实物工具剩余 = school_tools.stock - 已选不同小队数 × team_limit（按 task_group_id 去重）

**归还**：提交产出时返回需要归还的工具列表（实物 + needs_return=true）

### 9.6 云朵市集

**三种挂单类型**：
- sell（出售）：用积分标价
- buy（求购）：用积分标价
- barter（兑换）：用物品兑换

**三种物品类型**：
- tool（工具）：独占转移（卖方删 + 买方插）
- skill（技能）：复制共享（仅买方插）
- work（作品）：复制（新建记录，标 source_trade_id）

**范围 scope**：
- theme（同主题）
- school（同学校）
- all（全部）

**交易流程**：
1. 上架：`POST /api/team/market/listings`
2. 报价：`POST /api/team/market/listings/[id]/offers`
3. 接受报价：`POST /api/team/market/listings/[id]/accept`
4. 下架：`DELETE /api/team/market/listings/[id]`

**交易原子性**（`executeTrade`）：
1. 乐观锁扣买方积分
2. 乐观锁加卖方积分
3. 转移物品归属
4. 递减 available_quantity
5. 写 cloud_market_trades
6. 写 point_transactions（双方各一条）
7. 通知双方

任一步失败回滚。**无审核环节，成交即生效。**

### 9.7 家乡黑板报

**功能**：
- 帖子 + 评论 + 点赞 + 媒体网格（1/2/3/4+ 布局）
- 排序：created_at / comment_count / like_count
- 未读跟踪：localStorage `bb_viewed_${teamId}`

**管理员评论**：支持匿名身份（银蛇博士、雾影博士等）

### 9.8 通知系统

**类型**：
- submission_feedback（审核反馈）
- volunteer_message（志愿者消息）
- admin_message（管理员消息）
- reward_earned（获得激励）
- side_task（支线任务）
- transfer_sent/transfer_received（积分转账）
- borrow_request/borrow_submitted/borrow_approved/borrow_rejected/borrow_lent/borrow_repaid/borrow_received_repay（借贷全流程）
- overdue_reminder（逾期提醒）

---

## 10. 数据库结构

### 10.1 核心表（48 张）

#### 主体实体
- `schools` — 学校
- `users` — 用户（admin/volunteer/teacher）
- `teams` — 小队（核心）
- `team_members` — 小队成员（3 角色）
- `parent_accounts` / `parent_team_relations` — 家长账号与关联

#### 主题与任务
- `task_themes` — 主题
- `theme_schools` — 主题-学校多对多
- `tasks` — 任务（stage 1-4, task_type, task_group_id, difficulty）
- `task_tools` / `task_skills` / `task_rewards` — 任务资源关联
- `learning_materials` — 学习资料

#### 工具与技能
- `tools` — 工具（nature, team_limit, needs_return）
- `skills` — 技能
- `tool_skills` — 工具自动附带技能
- `school_tools` — 学校工具库存
- `team_tools` — 小队工具选择

#### 积分与激励
- `rewards` — 激励卡
- `user_rewards` — 小队获得的激励
- `point_transactions` — 积分变动流水
- `point_borrows` — 积分借贷
- `heart_gems` — 爱心宝石

#### 任务产出
- `task_submissions` — 任务产出提交
- `team_side_tasks` — 支线任务
- `team_skill_learnings` — 技能学习记录
- `team_material_progress` — 学习资料进度
- `team_difficulty_preferences` — 难度偏好

#### 周期与归档
- `team_theme_selections` — 主题选择记录
- `theme_completions` — 主题完成归档
- `final_task_forms` — 最终任务表单
- `final_task_submissions` — 最终任务提交

#### 智能体
- `agent_sessions` — 智能体会话
- `agent_conversations` — 智能体对话
- `agent_memories` — 智能体记忆（分层 L1-L4）
- `user_memories` — 用户永久记忆（蜡象助手专属）
- `agent_communications` — 跨智能体通信
- `agent_reminders` — 智能体提醒
- `agent_daily_syncs` — 每日同步摘要
- `task_feedback_knowledge` — 反馈知识库

#### 社交与通知
- `team_notifications` — 小队通知
- `messages` — 消息
- `blackboard_posts` / `blackboard_comments` / `blackboard_likes` — 黑板报

#### 云朵市集
- `cloud_market_listings` — 挂单
- `cloud_market_offers` — 报价
- `cloud_market_trades` — 成交记录

#### 安全审计
- `user_sessions` — 用户会话
- `request_logs` — 请求日志
- `rate_limit_records` — 频率限制记录
- `security_events` — 安全事件

### 10.2 关键关系

```
schools ──< users(teacher/volunteer) ──< teams >── assigned_volunteer_id
                                          │
                                          ├──< team_members
                                          ├──< team_theme_selections >── task_themes
                                          ├──< task_submissions >── tasks
                                          ├──< team_skill_learnings >── skills
                                          ├──< team_tools >── tools
                                          ├──< user_rewards >── rewards
                                          ├──< theme_completions
                                          ├──< final_task_submissions >── final_task_forms
                                          ├──< cloud_market_listings
                                          └──< point_transactions

tasks ──< task_tools >── tools ──< tool_skills >── skills
tasks ──< task_skills >── skills
tasks ──< task_rewards >── rewards
task_themes ──── guider_form_id/light_mage_form_id/secret_scholar_form_id ──> final_task_forms
```

---

## 11. API 路由总览

### 11.1 认证 API

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/auth/login` | POST | 管理员登录 |
| `/api/auth/team-login` | POST | 小队登录 |
| `/api/auth/parent-login` | POST/PUT | 家长登录/注册 |
| `/api/auth/me` | GET | 获取当前用户 |
| `/api/auth/check-phone` | GET | 手机号验证 |
| `/api/password` | POST | 修改密码 |

### 11.2 管理员 API（`/api/admin/`）

| 路由 | 功能 |
|---|---|
| `/api/admin/stats` | 控制台统计 |
| `/api/admin/assign-task` | 下发任务 |
| `/api/admin/overdue-tasks` | 超时任务 |
| `/api/admin/overdue-tasks/handle` | 处理超时 |
| `/api/admin/team-conversations` | 小队对话下载 |
| `/api/admin/data-consistency` | 数据一致性检查 |
| `/api/admin/migrate` | 数据迁移 |
| `/api/admin/parents` | 家长管理 |
| `/api/admin/follows` | 关注审核 |
| `/api/admin/notifications` | 通知 |
| `/api/admin/notifications/unread-count` | 未读数 |

### 11.3 蜡象助手 API（`/api/admin/assistant/`）

| 路由 | 功能 |
|---|---|
| `/api/admin/assistant` | 主聊天 API（SSE 流式） |
| `/api/admin/assistant/upload` | 文件上传 |
| `/api/admin/assistant/voice` | 语音 TTS/ASR |

### 11.4 主题与任务 API

| 路由 | 功能 |
|---|---|
| `/api/themes` | 主题 CRUD |
| `/api/themes/select` | 选择主题 |
| `/api/tasks` | 任务 CRUD |
| `/api/tasks/[id]/tools/select` | 选择工具 |
| `/api/submissions` | 提交产出 |
| `/api/submissions/[id]/review` | 审核产出 |

### 11.5 小队 API（`/api/team/`）

| 路由 | 功能 |
|---|---|
| `/api/team/info` | 小队信息 |
| `/api/team/current-task` | 当前任务 |
| `/api/team/sibling-teams` | sibling 小队 |
| `/api/team/sibling-teams/[id]/tasks` | sibling 任务详情 |
| `/api/team/skills` | 技能学习 |
| `/api/team/rewards` | 激励 |
| `/api/team/heart-gems` | 爱心宝石 |
| `/api/team/difficulty-preference` | 难度偏好 |
| `/api/team/transfer` | 赠送积分 |
| `/api/team/borrow` | 借积分 |
| `/api/team/notifications` | 通知 |
| `/api/team/theme-completions` | 主题完成归档 |
| `/api/team/final-task-feedback` | 最终任务反馈 |
| `/api/team/pretest` | 前测 |
| `/api/team/blackboard` | 黑板报 |
| `/api/team/market/listings` | 市集挂单 |
| `/api/team/market/trades` | 交易记录 |

### 11.6 智能体 API（`/api/ai/`）

| 路由 | 功能 |
|---|---|
| `/api/ai/chat` | 智能体聊天（yinhe/laxiang） |
| `/api/ai/assistant` | 银蛇博士入口 |
| `/api/ai/review-submission` | 产出评价（SSE） |
| `/api/ai/yinhe-image` | 图片生成 |
| `/api/ai/yinhe-video` | 视频生成 |
| `/api/ai/create-theme` | 创建主题 |
| `/api/ai/laxiang-report` | Word 报告 |
| `/api/ai/agent-communication` | 跨智能体通信 |
| `/api/ai/memory/user` | 用户记忆 |

### 11.7 权限 API

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/permissions` | GET | 获取权限配置 |
| `/api/permissions` | POST | 保存权限配置 |
| `/api/permissions` | DELETE | 恢复默认 |
| `/api/sync` | GET | 检查权限更新时间戳 |

---

## 12. 页面路由总览

### 12.1 管理员端（`/admin/`）

| 路由 | 功能 |
|---|---|
| `/admin/login` | 登录 |
| `/admin/dashboard` | 仪表盘 |
| `/admin/pretest` `/admin/pretest/results` | 前测管理 |
| `/admin/tasks` `/admin/tasks/[id]` `/admin/task/[id]` | 任务管理 |
| `/admin/final-tasks` | 最后任务表单 |
| `/admin/teams` `/admin/teams/[id]` | 小队管理 |
| `/admin/submissions` | 产出审核 |
| `/admin/schools` `/admin/schools/[id]` | 学校管理 |
| `/admin/volunteers` `/admin/volunteers/[id]` | 志愿者管理 |
| `/admin/follow-verifies` | 关注审核 |
| `/admin/tools` | 工具管理 |
| `/admin/skills` | 技能管理 |
| `/admin/messages` | 消息中心 |
| `/admin/rewards` `/admin/rewards/create` `/admin/rewards/[id]` | 激励配置 |
| `/admin/feedback` | 反馈管理 |
| `/admin/blackboard` | 黑板报 |
| `/admin/market` | 云朵市集 |
| `/admin/settings` | 权限设置 |
| `/admin/profile` | 个人中心 |

### 12.2 小队端（`/team/`）

| 路由 | 功能 |
|---|---|
| `/team/login` | 登录 |
| `/team/dashboard` | 主页 |
| `/team/members` | 成员管理 |
| `/team/settings` | 设置 |
| `/team/pretest` | 前测 |
| `/team/tasks` | 任务记录 |
| `/team/task/[id]` | 任务详情 |
| `/team/submit` | 提交产出 |
| `/team/learning` | 学习中心 |
| `/team/rewards` | 激励中心 |
| `/team/transfer` | 赠送积分 |
| `/team/borrow` | 借积分 |
| `/team/market` `/team/market/list` `/team/market/my` | 云朵市集 |
| `/team/blackboard` | 黑板报 |
| `/team/messages` | 消息中心 |
| `/team/final-task-feedback/[id]` | 最终任务反馈 |

### 12.3 家长端（`/parent/`）

| 路由 | 功能 |
|---|---|
| `/parent/login` | 登录/注册 |
| `/parent/dashboard` | 仪表盘 |
| `/parent/assistant` | 助手页 |

### 12.4 其他

| 路由 | 功能 |
|---|---|
| `/` | 首页（三入口） |
| `/report/[id]` | 报告查看 |

---

## 附录：技术栈与约定

### 技术栈
- **框架**：Next.js 16.1.1 (Turbopack) + React 19
- **语言**：TypeScript
- **数据库**：Supabase (PostgreSQL)
- **UI**：shadcn/ui + Tailwind CSS
- **测试**：Vitest 2.1.9
- **AI 模型**：doubao-seed-1-8-251228

### 工程约定
- 对话历史持久化使用 sessionStorage（关闭标签即清空，登出主动清空）
- 内部 fetch 调用必须透传 Authorization header 和 cookie
- DB 找不到模块权限时回退到 DEFAULT_ROLE_CONFIGS
- 积分更新使用乐观锁防止并发双花
- 所有 API 强制使用 token 中的 userId，防止横向越权
- 记忆系统带时间标签，避免旧记忆当近期内容主动提及
