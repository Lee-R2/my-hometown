# STEM 教育管理平台 - 功能文档

## 项目概览

基于 Next.js 的 STEM 教育管理平台，支持小队任务管理、技能学习、工具配置、激励系统、积分借贷、积分转账、最后任务反馈表单及反馈信息管理。

---

## 技术架构

| 类别 | 技术栈 |
|------|--------|
| **框架** | Next.js 16 (App Router) |
| **UI库** | React 19 + TypeScript 5 |
| **组件库** | shadcn/ui (Radix UI) |
| **样式** | Tailwind CSS 4 |
| **数据库** | Supabase (PostgreSQL) |
| **AI集成** | coze-coding-dev-sdk |
| **导出** | docx (Word文档生成) |

---

## 一、管理员端功能

### 1. 登录与权限

**路由**: `/admin/login`

| 功能 | 详细说明 |
|------|----------|
| 登录方式 | 账号 + 密码 |
| 角色类型 | `super_admin`(超级管理员)、`teacher`(助学老师)、`volunteer`(志愿者) |
| 密码安全 | SHA-256 + 盐值哈希 |
| 权限控制 | 基于 `role_permissions` 表的模块级权限控制 |

### 2. 仪表盘

**路由**: `/admin/dashboard`

| 功能 | 详细说明 |
|------|----------|
| 数据概览 | 学校数量、志愿者数量、小队数量、学生总数 |
| 任务统计 | 总任务数、进行中、已完成 |
| 积分排名 | 小队积分排行榜（可按周期筛选） |
| 最新动态 | 最近活动时间线 |
| 快捷入口 | 快速跳转到各管理模块 |

### 3. 小队管理

**路由**: `/admin/teams`、`/admin/teams/[id]`

#### 列表页功能
| 功能 | 详细说明 |
|------|----------|
| 筛选条件 | 按学校、按志愿者、按周期、按状态 |
| 排序 | 按积分、按周期、按创建时间 |
| 批量操作 | 启用/禁用小队 |
| 导出功能 | 导出小队列表 |

#### 详情页功能
| 功能 | 详细说明 |
|------|----------|
| 基础信息 | 小队名称、口号、规则、创建时间 |
| 成员管理 | 查看/添加/编辑/删除成员 |
| 角色分配 | 指引者(guider)、光影法师(light_mage)、秘语学者(secret_scholar) |
| 周期进度 | 当前周期、已完成主题数 |
| 当前任务 | 任务标题、阶段、截止日期 |
| 积分记录 | 积分余额、积分变动历史 |

### 4. 任务管理

**路由**: `/admin/tasks`、`/admin/tasks/[id]`

#### 任务配置
| 配置项 | 说明 |
|--------|------|
| 任务标题 | 任务名称 |
| 任务描述 | 详细的任务说明 |
| 关联主题 | 属于哪个探索主题 |
| 任务阶段 | 多阶段任务的第几阶段 |
| 总阶段数 | 该主题的总任务阶段数 |
| 积分奖励 | 完成任务获得的积分 |
| 截止日期 | 任务截止时间 |
| 必学技能 | 任务要求的技能 |
| 工具配置 | 任务需要的工具 |
| 激励物品 | 任务奖励的物品 |
| 提示词 | 任务提示信息 |

#### 任务流程
```
创建任务 → 关联主题/技能/工具/激励 → 设置阶段 → 配置截止日期
```

### 5. 主题管理

**路由**: `/admin/task`

| 功能 | 详细说明 |
|------|----------|
| 主题列表 | 显示所有主题及图标 |
| 选择统计 | 各主题被选择的小队数量 |
| 专属配置 | 全局主题/专属主题(is_exclusive) |
| 任务关联 | 主题下关联的任务列表 |

### 6. 产出审核

**路由**: `/admin/submissions`

| 功能 | 详细说明 |
|------|----------|
| 状态筛选 | 全部、待审核、已通过、已拒绝 |
| 审核操作 | 通过、拒绝、要求修改 |
| 产出评价 | 60分制评分（任务一致性20分、作品质量30分、按时提交10分） |
| 点赞管理 | 给产出点赞（每点赞+5积分） |
| 查看详情 | 查看提交的文本、图片、文件 |

### 7. 项目学校

**路由**: `/admin/schools`、`/admin/schools/[id]`

| 功能 | 详细说明 |
|------|----------|
| 学校列表 | 显示所有学校及地区 |
| 地区统计 | 各地区学校分布 |
| 小队数量 | 每个学校下的小队数量 |
| 志愿者关联 | 学校关联的志愿者 |

### 8. 志愿者管理

**路由**: `/admin/volunteers`、`/admin/volunteers/[id]`

| 功能 | 详细说明 |
|------|----------|
| 志愿者信息 | 姓名、联系方式、账号状态 |
| 指导小队 | 志愿者创建/指导的小队列表 |
| 关联学校 | 志愿者负责的学校 |

### 9. 工具管理

**路由**: `/admin/tools`

| 功能 | 详细说明 |
|------|----------|
| 工具分类 | 工具所属分类 |
| 使用统计 | 各工具被使用的次数 |
| 工具详情 | 工具名称、描述、图标 |

### 10. 技能学习

**路由**: `/admin/skills`

| 功能 | 详细说明 |
|------|----------|
| 技能分类 | 按类别组织技能 |
| 学习进度 | 小队对各技能的学习进度 |
| 完成记录 | 已完成/进行中的学习记录 |

### 11. 激励配置

**路由**: `/admin/rewards`、`/admin/rewards/[id]`、`/admin/rewards/create`

| 功能 | 详细说明 |
|------|----------|
| 物品管理 | 物品名称、图标、描述、所需积分 |
| 主题专属 | 可配置专属主题的激励 |
| 全局激励 | 所有小队可用 |
| 发放统计 | 各物品的发放数量 |
| 库存管理 | 物品库存数量 |
| 热门排行 | 按兑换次数排序 |

### 12. 消息管理

**路由**: `/admin/messages`

| 功能 | 详细说明 |
|------|----------|
| 消息统计 | 总消息数、各小队消息数 |
| 未读提醒 | 未读消息数量 |
| 发送消息 | 向指定小队/所有小队发送 |
| 消息模板 | 预设消息模板 |
| 定时发送 | 设置发送时间 |

### 13. 反馈查看

**路由**: `/admin/feedback`

| 功能 | 详细说明 |
|------|----------|
| 反馈列表 | 小队提交的所有反馈 |
| 分类统计 | 按主题、按类型统计 |
| 关键词提取 | 反馈中的高频关键词 |
| Word导出 | 导出反馈报告为Word文档 |

### 14. 最后任务管理

**路由**: `/admin/final-tasks`

| 功能 | 详细说明 |
|------|----------|
| 任务配置 | 最后任务的设置 |
| 表单管理 | 反馈表单配置 |
| 角色表单 | 按成员角色配置不同表单 |
| 通用表单 | 所有角色通用的表单 |
| 表单字段 | 文本、文本域、单选、多选、评分、文件上传 |

### 15. 学生前测

**路由**: `/admin/pretest`

| 功能 | 详细说明 |
|------|----------|
| 题目管理 | 添加、编辑、删除、排序题目 |
| 题目类型 | 单选题、多选题、文本题、评分题 |
| 激活控制 | 启用/禁用题目 |
| 统计面板 | 总题目数、已激活数、回答总数、已完成小队、待完成小队 |

#### 题目类型详细说明

| 类型 | 说明 | 配置项 |
|------|------|--------|
| 单选题 | 只能选择一个选项 | 选项列表(label/value) |
| 多选题 | 可以选择多个选项 | 选项列表(label/value) |
| 文本题 | 自由文本输入 | 占位提示 |
| 评分题 | 1-5分评分 | 最大分值 |

### 16. 权限管理

**路由**: `/admin/settings`

| 功能 | 详细说明 |
|------|----------|
| 角色列表 | 显示所有角色及权限 |
| 模块配置 | 各角色可访问的模块 |
| 权限矩阵 | 角色×模块的权限表格 |
| 模块列表 | 模块名称、路由、图标 |

### 17. 个人中心

**路由**: `/admin/profile`

| 功能 | 详细说明 |
|------|----------|
| 个人信息 | 姓名、账号、角色 |
| 修改密码 | 密码修改功能 |

### 18. 蜡象助手 (智能体)

**路由**: 内置于管理后台（侧边栏入口）

#### 能力矩阵

| 能力 | 说明 | 使用场景 |
|------|------|----------|
| 数据洞察 | 实时查询各模块数据 | "查看当前积分最高的小队" |
| 关系分析 | 理解数据归属关系 | "阳光小队属于哪个志愿者" |
| 趋势预测 | 预测数据变动 | "哪些小队可能逾期" |
| 消息代理 | 直接发送消息 | "通知阳光小队尽快提交" |
| 产出评价 | 评价小队产出 | "评价阳光小队的主题一产出" |
| 报告生成 | 生成Word分析报告 | "生成一份小队分析报告" |

#### 支持的报告类型

| 类型 | 说明 |
|------|------|
| `overview` | 平台数据概览报告 |
| `teams` | 小队管理分析报告 |
| `tasks` | 任务管理分析报告 |
| `submissions` | 产出审核分析报告 |
| `schools` | 项目学校分析报告 |
| `volunteers` | 志愿者管理分析报告 |
| `rewards` | 激励配置分析报告 |
| `comprehensive` | STEM教育平台综合分析报告 |

#### 产出评价维度（60分制）

| 维度 | 分值 | 说明 |
|------|------|------|
| 任务一致性 | 20分 | 产出是否体现了任务要求的内容 |
| 作品质量 | 30分 | 完整度、创意、用心程度 |
| 按时提交 | 10分 | 是否在截止日期前提交 |

#### 长期记忆系统

- 跨会话对话记忆
- 基于 user_id 加载历史对话
- 每次对话自动保存和提取重要信息
- 支持查询历史对话内容

---

## 二、小队端功能

### 1. 登录

**路由**: `/team/login`

| 功能 | 详细说明 |
|------|----------|
| 登录方式 | 小队编码 + 密码 |
| 记住登录 | localStorage 存储登录状态 |
| 修改密码 | 首次登录后修改密码 |

### 2. Dashboard (仪表盘)

**路由**: `/team/dashboard`

#### 显示区域

| 区域 | 显示条件 | 说明 |
|------|----------|------|
| 小队信息卡片 | 始终显示 | 队名、口号、积分 |
| 消息提醒 | 有未读消息时 | 未读消息数量徽章 |
| 当前任务 | 有进行中任务 | 任务标题、阶段进度、截止日期 |
| 前测问卷 | 组队完成且未填写 | 组队后首个任务，完成+10积分 |
| 探索主题 | 未选择主题且已完成前测 | 选择探索主题 |
| 同志愿者小队 | 有其他小队 | 查看其他小队进度 |
| 已完成主题 | 有已完成的主题 | 归档数据展示 |

#### 前测问卷显示规则

```
显示条件：
├── 小队已设置口号 (slogan 不为空)
├── 小队已添加成员 (members.length > 0)
├── 未完成前测 (has_completed_pretest = false)
└── 未选择主题 (current_theme_id = null)

隐藏条件（满足任一）：
├── 已提交前测问卷
├── 已选择探索主题
└── 进入新周期后（has_completed_pretest 始终为 true）
```

#### 主题选择规则

```
前置条件：
├── 前测已完成（如有题目）
├── 小队队名已修改（非"我的小队"/"未命名小队"）
├── 小队信息已完善（口号+成员）
└── 当前无进行中的主题

选择限制：
├── 同一志愿者下的小队不能选择相同主题
├── 已选择的主题不可重复选择
└── 新周期可重新选择任意主题
```

### 3. 小队信息

**路由**: `/team/dashboard` (内嵌编辑区)

| 功能 | 详细说明 |
|------|----------|
| 编辑队名 | 修改小队名称 |
| 设置口号 | 小队口号/标语 |
| 编写规则 | 小队内部规则 |
| 成员管理 | 添加、编辑、删除成员 |

### 4. 成员管理

**路由**: `/team/members`

| 功能 | 详细说明 |
|------|----------|
| 成员列表 | 显示所有成员及状态 |
| 添加成员 | 姓名、角色、简介 |
| 编辑成员 | 修改成员信息 |
| 删除成员 | 移除成员 |
| 角色分配 | guider(指引者)、light_mage(光影法师)、secret_scholar(秘语学者) |

#### 角色配置

| 角色 | 标识 | 说明 |
|------|------|------|
| guider | 指引者 | 小队活动的引导者 |
| light_mage | 光影法师 | 负责创意和设计 |
| secret_scholar | 秘语学者 | 负责文档和记录 |

### 5. 技能学习

**路由**: `/team/learning`

| 功能 | 详细说明 |
|------|----------|
| 技能分类 | 按类别浏览技能 |
| 技能详情 | 学习内容说明 |
| 学习进度 | 必学技能/已完成技能 |
| 关联任务 | 该技能关联的任务 |

### 6. 任务列表

**路由**: `/team/tasks`

| 功能 | 详细说明 |
|------|----------|
| 当前主题 | 显示当前主题及进度 |
| 阶段展示 | 当前阶段/总阶段数 |
| 任务列表 | 阶段内的任务列表 |
| 截止日期 | 显示剩余时间 |
| 侧边任务 | 非主线任务入口 |

### 7. 任务详情

**路由**: `/team/task/[id]`

| 功能 | 详细说明 |
|------|----------|
| 任务要求 | 详细的任务描述 |
| 必学技能 | 完成任务需要的技能 |
| 工具配置 | 需要的工具清单 |
| 激励预览 | 完成任务可获得的奖励 |
| 产出提交 | 提交文本/图片/文件 |
| 反馈表单 | 最后任务的反馈表单入口 |

### 8. 产出上传

**路由**: `/team/submit`

| 功能 | 详细说明 |
|------|----------|
| 提交类型 | 文本、图片、文件 |
| 提交状态 | 草稿、已提交、已通过、已拒绝 |
| 修改提交 | 被拒绝后可重新提交 |
| 查看历史 | 历史提交记录 |

### 9. 激励中心

**路由**: `/team/rewards`

| 功能 | 详细说明 |
|------|----------|
| 积分余额 | 当前可用积分 |
| 物品列表 | 可兑换的激励物品 |
| 兑换记录 | 历史兑换记录 |
| 积分明细 | 积分增减历史 |

### 10. 积分借贷

**路由**: `/team/borrow`

#### 借贷流程

```
发起借贷 → 选择出借方 → 设置条件 → 等待确认 → 积分到账 → 按期归还
```

#### 功能详情

| 功能 | 详细说明 |
|------|----------|
| 发起借贷 | 选择小队、填写积分、设置利率 |
| 利率设置 | 日利率/周利率/月利率 |
| 逾期利率 | 逾期后的日利率 |
| 归还日期 | 设置最晚归还日期 |
| 利息计算 | 系统自动计算利息 |
| 状态管理 | 待确认→已借出→已归还/已逾期 |
| 归还功能 | 一键归还本金+利息 |

#### 利息计算公式

```
应还积分 = 本金 + 本金 × (利率/100) × 借款天数
逾期利息 = 本金 × (逾期利率/100) × 逾期天数
总应还 = 应还积分 + 逾期利息
```

#### 借贷规则

| 规则 | 说明 |
|------|------|
| 借贷范围 | 只能向同志愿者下的其他小队借贷 |
| 积分限制 | 借贷积分 ≤ 出借方当前积分 |
| 日期限制 | 归还日期必须晚于今天 |
| 利率限制 | 利率 0-100% |
| 状态管理 | 待确认可取消、已借出需归还 |

### 11. 积分转账

**路由**: `/team/transfer`

#### 转账流程

```
选择小队 → 填写积分 → 添加留言 → 确认转账 → 积分到账 → 获得碎片
```

#### 功能详情

| 功能 | 详细说明 |
|------|----------|
| 发起转账 | 选择接收小队、填写积分 |
| 留言功能 | 可添加转账说明 |
| 转账记录 | 发送记录/接收记录 |
| 爱心碎片 | 每转账1次获得1个碎片 |
| 宝石合成 | 10个碎片自动合成1颗宝石 |

#### 碎片合成规则

```
碎片数量达到10 → 自动合成 → 碎片清零 → 宝石+1
```

#### 转账规则

| 规则 | 说明 |
|------|------|
| 转账范围 | 只能向同志役者下的其他小队转账 |
| 积分限制 | 转账积分 ≤ 当前可用积分 |
| 无利息 | 转账不产生利息 |
| 不可逆 | 转账不可撤回 |

### 12. 消息中心

**路由**: `/team/messages`

| 功能 | 详细说明 |
|------|----------|
| 消息列表 | 按时间倒序显示 |
| 未读标记 | 未读消息高亮显示 |
| 消息详情 | 查看完整消息内容 |
| 来源显示 | 显示发送方（管理员/志愿者） |

### 13. 学生前测问卷

**路由**: `/team/pretest`

#### 填写流程

```
进入问卷 → 选择成员 → 逐题答题 → 统一提交 → 返回选择其他成员
```

#### 功能详情

| 功能 | 详细说明 |
|------|----------|
| 成员点选 | 成员选择自己名字答题 |
| 进度追踪 | 显示各成员答题进度 |
| 答题模式 | 逐题展示，实时保存 |
| 统一提交 | 当前成员完成所有题目后统一提交 |
| 积分奖励 | 完成前测+10积分 |

#### 答题规则

| 规则 | 说明 |
|------|------|
| 成员隔离 | 每个成员独立答题 |
| 进度保存 | 答题进度自动保存 |
| 完成后切换 | 成员完成后可切换其他人 |
| 必填校验 | 提交前检查所有必填项 |

#### 显示规则

```
显示条件：组队完成(口号+成员) + 未填写前测 + 未选择主题
隐藏条件：完成前测 OR 选择主题后不再显示
```

### 14. 最后任务反馈

**路由**: `/team/final-task-feedback/[id]`

#### 表单类型

| 类型 | 说明 |
|------|------|
| 角色专属表单 | 按指引者/光影法师/秘语学者配置不同表单 |
| 通用表单 | 所有成员填写相同表单 |

#### 功能详情

| 功能 | 详细说明 |
|------|----------|
| 成员选择 | 选择成员填写表单 |
| 表单渲染 | 支持文本、文本域、单选、多选、评分、文件上传 |
| 必填校验 | 提交前验证必填字段 |
| 多成员填写 | 成员分别填写 |
| 提交追踪 | 显示各成员提交状态 |

### 15. 爱心宝石

**路由**: `/team/rewards` (内嵌展示)

| 功能 | 详细说明 |
|------|----------|
| 碎片数量 | 当前持有的爱心碎片 |
| 宝石数量 | 当前持有的爱心宝石 |
| 合成动画 | 碎片达到10时的合成效果 |
| 宝石用途 | 宝石可兑换特殊奖励 |

### 16. 小队设置

**路由**: `/team/settings`

| 功能 | 详细说明 |
|------|----------|
| 修改密码 | 修改登录密码 |
| 账号信息 | 账号、小队编码 |

---

## 三、核心业务逻辑

### 1. 角色权限

| 角色 | 说明 | 权限范围 |
|------|------|----------|
| `super_admin` | 超级管理员 | 所有模块全部权限 |
| `teacher` | 助学老师 | 管理本校小队 |
| `volunteer` | 志愿者 | 管理指导的小队 |

### 2. 主题类型

| 类型 | 标识 | 说明 |
|------|------|------|
| 全局主题 | `is_exclusive=false`, `school_id=null` | 所有学校可用 |
| 专属主题 | `is_exclusive=true`, `school_id=xxx` | 归属特定学校 |

### 3. 任务流程

```
┌─────────────────┐
│  小队选择主题    │
└────────┬────────┘
         ↓
┌─────────────────┐
│  系统下发任务    │ ← 第一阶段任务
└────────┬────────┘
         ↓
┌─────────────────┐
│  完成学习任务    │
└────────┬────────┘
         ↓
┌─────────────────┐
│  提交产出       │
└────────┬────────┘
         ↓
┌─────────────────┐
│  志愿者审核     │
└────────┬────────┘
         ↓
    ┌────┴────┐
    ↓         ↓
 通过      拒绝
    ↓         ↓
┌────────┐  ┌────────┐
│下一阶段│  │重新提交│
└────────┘  └────────┘
         ↓
┌─────────────────┐
│ 完成主题(可选新) │
└─────────────────┘
```

### 4. 任务周期机制

#### 核心设计

| 字段 | 表 | 说明 |
|------|-----|------|
| `teams.cycle` | teams | 小队当前所处周期 |
| `team_theme_selections` | team_theme_selections | 每个周期的选择历史 |

#### 周期选择规则

```
1. 完成当前主题 → teams.cycle + 1
2. 新周期可选任意主题（无论是否被其他小队选择）
3. 选择新主题后系统下发新周期第一阶段任务
4. 积分和产出记录按周期独立统计
```

#### 主题重复选择规则

```
同一志愿者下的小队：
├── 同时期内不能选择相同主题
└── 不同周期可以选择相同主题

记录表 team_theme_selections：
├── cycle = 1 → 选择主题A
├── cycle = 2 → 选择主题B（可重新选A）
└── cycle = 3 → 选择主题A（可重复）
```

### 5. 激励系统

#### 积分来源

| 来源 | 积分 | 说明 |
|------|------|------|
| 点赞 | +5/次 | 被点赞获得 |
| 完成任务 | +任务积分 | 任务奖励 |
| 前测完成 | +10 | 完成前测问卷 |
| 借贷归还 | 自定义 | 可设置归还积分 |

#### 积分消耗

| 用途 | 积分 | 说明 |
|------|------|------|
| 兑换激励 | -物品积分 | 兑换激励物品 |
| 积分转账 | -转账积分 | 转给其他小队 |
| 积分借贷 | -归还积分 | 归还借贷本金+利息 |

### 6. 积分借贷机制

#### 借贷流程

```
┌──────────┐    发起申请    ┌──────────┐
│ 借入方   │ ────────────→ │ 借出方   │
└──────────┘               └──────────┘
     ↑                           │
     │ ←─── 同意/拒绝 ───────────┘
     │
     ↓
┌──────────┐    到账         ┌──────────┐
│ 积分增加  │ ←────────────── │ 积分减少  │
└──────────┘               └──────────┘
     │
     ↓
┌──────────┐    按期归还     ┌──────────┐
│ 积分减少  │ ────────────→ │ 积分增加  │
└──────────┘  本金+利息     └──────────┘
```

#### 借贷状态

| 状态 | 说明 |
|------|------|
| `pending` | 待确认，借出方尚未处理 |
| `approved` | 已同意，等待归还 |
| `rejected` | 已拒绝 |
| `repaid` | 已归还 |
| `overdue` | 已逾期 |

#### 利息计算

```javascript
// 计算利息
function calculateInterest(principal, rate, days) {
  return Math.round(principal * (rate / 100) * days * 10) / 10;
}

// 计算总应还
function calculateTotal(principal, rate, days, overdueRate, overdueDays) {
  const interest = calculateInterest(principal, rate, days);
  const overdueInterest = calculateInterest(principal, overdueRate, overdueDays);
  return principal + interest + overdueInterest;
}
```

### 7. 积分转账机制

#### 转账流程

```
┌──────────┐    转账       ┌──────────┐
│ 转出方   │ ────────────→ │ 接收方   │
└──────────┘  积分转移     └──────────┘
     │
     ├──→ 获得碎片 (heart_shards + 1)
     │
     └──→ 碎片达到10 → 合成宝石 (heart_gems + 1, heart_shards - 10)
```

#### 碎片与宝石

```
heart_shards: 爱心碎片数量
heart_gems: 爱心宝石数量

合成规则：
heart_shards >= 10 → heart_gems += 1, heart_shards -= 10
```

### 8. 产出评价机制

#### 评价维度（总分60分）

| 维度 | 分值 | 评分标准 |
|------|------|----------|
| 任务一致性 | 20分 | 产出是否体现任务要求的内容 |
| 作品质量 | 30分 | 完整度、创意、用心程度 |
| 按时提交 | 10分 | 是否在截止日期前提交 |

#### 评价结果

| 结果 | 分值范围 |
|------|----------|
| 优秀 | 50-60分 |
| 良好 | 40-49分 |
| 合格 | 30-39分 |
| 待改进 | <30分 |

---

## 四、数据表结构

### 核心业务表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `users` | 管理员/志愿者/助学老师 | id, username, password, role, school_id, is_active |
| `teams` | 小队信息 | id, code, name, password, points, cycle, has_completed_pretest, current_theme_id, created_by |
| `team_members` | 小队成员 | id, team_id, name, role, intro, is_approved |
| `task_themes` | 探索主题 | id, name, description, icon, is_exclusive, school_id |
| `tasks` | 任务 | id, theme_id, title, stage, total_stages, points, deadline |
| `submissions` | 产出提交 | id, team_id, task_id, content, status, likes, score |
| `skills` | 技能 | id, name, category, description |
| `tools` | 工具 | id, name, category, description |
| `rewards` | 激励物品 | id, name, points, stock, is_exclusive, theme_id |
| `schools` | 学校 | id, name, region, volunteer_id |
| `messages` | 消息 | id, team_id, content, sender_id, is_read |
| `feedback_forms` | 反馈表单 | id, task_id, team_role, form_config(JSON) |
| `team_theme_selections` | 主题选择记录 | id, team_id, theme_id, cycle, selected_at |
| `theme_completions` | 主题完成记录 | id, team_id, theme_id, cycle, completed_at, total_points |
| `borrow_records` | 借贷记录 | id, borrower_id, lender_id, points, interest_rate, status |
| `transfer_records` | 转账记录 | id, from_team_id, to_team_id, points |
| `pretest_questions` | 前测问卷题目 | id, title, question_type, options(JSON), is_required, is_active |
| `pretest_responses` | 前测回答记录 | id, team_id, member_name, question_id, answer |
| `role_permissions` | 角色权限 | id, role, module, permission |

### 辅助表

| 表名 | 说明 |
|------|------|
| `task_skills` | 任务-技能关联 |
| `task_tools` | 任务-工具关联 |
| `task_rewards` | 任务-激励关联 |
| `final_task_feedbacks` | 最后任务反馈 |
| `team_pretest_status` | 小队前测状态 |

---

## 五、API 接口

### 管理端 API

#### 统计数据

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/stats` | GET | 获取统计数据 |

#### 任务管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/tasks` | GET | 获取任务列表 |
| `/api/admin/tasks/hints` | GET/POST | 任务提示词管理 |
| `/api/admin/task-management` | POST | 批量管理任务 |

#### 产出审核

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/submissions` | GET | 获取产出列表 |
| `/api/submissions/[id]/review` | POST | 审核产出 |
| `/api/submissions/[id]/like` | POST | 点赞产出 |
| `/api/admin/submissions` | GET | 管理员视角产出列表 |

#### 前测管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/pretest/questions` | GET/POST | 题目管理 |
| `/api/admin/pretest/questions/[id]` | GET/PUT/DELETE/PATCH | 题目CRUD |
| `/api/admin/pretest/stats` | GET | 前测统计 |

#### 反馈管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/feedback` | GET | 反馈列表 |
| `/api/admin/feedback/export` | GET | 导出反馈报告 |

#### 智能助手

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/assistant` | POST | 蜡象助手对话 |
| `/api/admin/assistant/upload` | POST | 上传文件 |
| `/api/admin/assistant/voice` | POST | 语音输入 |

#### 最后任务

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/final-tasks` | GET | 最后任务列表 |
| `/api/admin/final-tasks/[id]` | GET/PUT/DELETE | 最后任务CRUD |

### 小队端 API

#### 前测问卷

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/team/pretest` | GET | 获取前测题目和状态 |
| `/api/team/pretest` | POST | 提交回答 |

#### 积分借贷

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/team/borrow` | GET | 获取可借贷小队列表 |
| `/api/team/borrow` | POST | 发起借贷申请 |
| `/api/team/borrow` | PUT | 同意/拒绝借贷 |
| `/api/team/borrow/history` | GET | 借贷记录 |
| `/api/team/borrow/repay` | POST | 归还借贷 |
| `/api/team/borrow/reminder` | POST | 逾期提醒 |

#### 积分转账

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/team/transfer` | GET | 获取可转账小队列表 |
| `/api/team/transfer` | POST | 执行转账 |
| `/api/team/transfer/history` | GET | 转账记录 |

#### 最后任务反馈

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/team/final-task-feedback` | GET | 获取反馈表单状态 |
| `/api/team/final-task-feedback` | POST | 提交反馈 |

#### 其他

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/team/info` | GET | 获取小队信息 |
| `/api/team/current-task` | GET | 获取当前任务 |
| `/api/team/notifications` | GET | 获取消息 |
| `/api/team/rewards` | GET | 获取激励列表 |
| `/api/team/sibling-teams` | GET | 同志愿者其他小队 |
| `/api/team/theme-completions` | GET | 已完成主题 |

### 认证 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 管理员登录 |
| `/api/auth/team-login` | POST | 小队登录 |
| `/api/auth/team-change-password` | POST | 小队修改密码 |
| `/api/password` | PUT | 修改密码 |

### 迁移与诊断 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/init-users` | GET/POST | 初始化用户数据 |
| `/api/init-teams` | GET/POST | 初始化小队数据 |
| `/api/diagnostics/db` | GET | 数据库诊断 |
| `/api/migrate/all-passwords` | GET/POST | 密码迁移 |
| `/api/migrate/account-status` | GET/POST | 账号状态修复 |
| `/api/restore-data` | GET/POST | 数据恢复 |

---

## 六、目录结构

```
src/
├── app/
│   ├── admin/                    # 管理端页面
│   │   ├── dashboard/
│   │   │   └── page.tsx         # 仪表盘
│   │   ├── teams/
│   │   │   ├── page.tsx         # 小队列表
│   │   │   └── [id]/page.tsx    # 小队详情
│   │   ├── tasks/
│   │   │   ├── page.tsx         # 任务列表
│   │   │   └── [id]/page.tsx    # 任务详情
│   │   ├── task/
│   │   │   └── [id]/page.tsx    # 主题详情
│   │   ├── submissions/
│   │   │   └── page.tsx         # 产出审核
│   │   ├── rewards/
│   │   │   ├── page.tsx         # 激励列表
│   │   │   ├── [id]/page.tsx    # 激励详情
│   │   │   └── create/page.tsx  # 创建激励
│   │   ├── skills/
│   │   │   └── page.tsx         # 技能管理
│   │   ├── tools/
│   │   │   └── page.tsx         # 工具管理
│   │   ├── volunteers/
│   │   │   ├── page.tsx         # 志愿者列表
│   │   │   └── [id]/page.tsx    # 志愿者详情
│   │   ├── schools/
│   │   │   ├── page.tsx         # 学校列表
│   │   │   └── [id]/page.tsx   # 学校详情
│   │   ├── feedback/
│   │   │   └── page.tsx        # 反馈查看
│   │   ├── final-tasks/
│   │   │   └── page.tsx         # 最后任务
│   │   ├── messages/
│   │   │   └── page.tsx         # 消息管理
│   │   ├── settings/
│   │   │   └── page.tsx         # 权限设置
│   │   ├── pretest/
│   │   │   └── page.tsx         # 学生前测
│   │   ├── profile/
│   │   │   └── page.tsx         # 个人中心
│   │   ├── login/
│   │   │   └── page.tsx         # 登录页
│   │   └── layout.tsx           # 布局
│   │
│   ├── team/                     # 小队端页面
│   │   ├── dashboard/
│   │   │   └── page.tsx         # 仪表盘
│   │   ├── tasks/
│   │   │   └── page.tsx         # 任务列表
│   │   ├── task/
│   │   │   └── [id]/page.tsx    # 任务详情
│   │   ├── submit/
│   │   │   └── page.tsx         # 产出上传
│   │   ├── learning/
│   │   │   └── page.tsx         # 技能学习
│   │   ├── rewards/
│   │   │   └── page.tsx         # 激励中心
│   │   ├── members/
│   │   │   └── page.tsx         # 成员管理
│   │   ├── messages/
│   │   │   └── page.tsx         # 消息中心
│   │   ├── borrow/
│   │   │   └── page.tsx         # 积分借贷
│   │   ├── transfer/
│   │   │   └── page.tsx         # 积分转账
│   │   ├── pretest/
│   │   │   └── page.tsx         # 前测问卷
│   │   ├── final-task-feedback/
│   │   │   └── [id]/page.tsx    # 最后任务反馈
│   │   ├── settings/
│   │   │   └── page.tsx         # 小队设置
│   │   ├── login/
│   │   │   └── page.tsx         # 登录页
│   │   └── layout.tsx           # 布局
│   │
│   └── api/                      # API 路由
│       ├── admin/
│       │   ├── stats/
│       │   ├── assistant/
│       │   ├── pretest/
│       │   ├── feedback/
│       │   ├── final-tasks/
│       │   ├── submissions/
│       │   └── ...
│       ├── team/
│       │   ├── pretest/
│       │   ├── borrow/
│       │   ├── transfer/
│       │   ├── final-task-feedback/
│       │   └── ...
│       ├── auth/
│       ├── ai/
│       └── ...
│
├── components/
│   └── ui/                       # shadcn/ui 组件
│
├── hooks/                        # 自定义 Hooks
│   ├── use-responsive.ts         # 响应式布局
│   ├── use-scroll-position.ts     # 滚动位置记忆
│   └── use-data-refresh.ts        # 数据同步
│
├── lib/                          # 工具函数
│   ├── constants.ts              # 常量定义
│   ├── types.ts                  # 类型定义
│   └── agent-memory.ts           # 智能体记忆
│
└── storage/                       # 存储相关
    └── database/
        └── supabase-client.ts     # Supabase 客户端
```

---

## 七、常用命令

```bash
# 安装依赖
pnpm install

# 开发模式（带热更新）
pnpm dev

# 类型检查
pnpm ts-check

# Lint 检查
pnpm lint

# 构建生产版本
pnpm build

# 生产模式运行
pnpm start
```

---

## 八、快速诊断

### 登录问题诊断

```bash
# 1. 诊断数据库状态
curl http://localhost:5000/api/diagnostics/db

# 2. 初始化测试数据
curl -X POST http://localhost:5000/api/init-users
curl -X POST http://localhost:5000/api/init-teams

# 3. 测试登录
# 管理员: admin / 123456
# 小队: TEAM001 / 123456
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'
```

### 密码迁移

```bash
# 1. 查询迁移状态
curl http://localhost:5000/api/migrate/all-passwords

# 2. 执行迁移
curl -X POST http://localhost:5000/api/migrate/all-passwords

# 3. 验证迁移
curl http://localhost:5000/api/migrate/all-passwords
```

### 账号状态修复

```bash
# 1. 查询账号状态
curl http://localhost:5000/api/migrate/account-status

# 2. 修复所有账号状态
curl -X POST http://localhost:5000/api/migrate/account-status

# 3. 验证修复
curl http://localhost:5000/api/migrate/account-status
```

### 数据恢复

```bash
# 1. 查看数据状态
curl http://localhost:5000/api/restore-data

# 2. 修复账号状态
curl -X POST http://localhost:5000/api/restore-data \
  -H "Content-Type: application/json" \
  -d '{"repairAccounts": true}'

# 3. 测试所有账号
curl http://localhost:5000/api/test/accounts
```

---

## 九、Word 文档导出

### 功能文档导出

**接口**: `GET /api/docs/features-export`

**说明**: 导出完整的功能文档为 Word 格式

### 报告导出

**接口**: `GET /api/ai/laxiang-report`

**参数**:
| 参数 | 说明 |
|------|------|
| `type` | 报告类型 (overview/teams/tasks/submissions/schools/volunteers/rewards/comprehensive) |
| `role` | 用户角色 |
| `userId` | 用户ID |
| `schoolId` | 学校ID |

---

*文档版本: 2025.04*
*最后更新: 完善详细功能和逻辑说明*
