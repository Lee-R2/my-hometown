# STEM 教育管理平台 — 项目全景分析报告

> 报告日期：2026-05-27
> 项目名称：our home（我们的家乡）
> 项目类型：STEM 教育管理平台

---

## 一、项目概述

### 1.1 项目定位

本项目是一个面向乡村小学的 **STEM 教育管理平台**，核心理念是将学习任务设计为"探索主题"，学生以小队形式协作完成，通过积分、激励、借贷等游戏化机制增强参与感与学习动力。项目名"our home"（我们的家乡）呼应了乡村教育的主题背景。

### 1.2 技术栈

| 层级 | 技术选型 | 版本 |
|------|---------|------|
| 框架 | Next.js (App Router) | 16.1.1 |
| 前端 | React + TypeScript | 19.2.3 / 5.x |
| UI 组件库 | shadcn/ui (Radix UI) | — |
| 样式 | Tailwind CSS | 4.x |
| 数据库 | Supabase (PostgreSQL) | 2.95.3 |
| ORM | Drizzle ORM | 0.45.1 |
| AI 集成 | coze-coding-dev-sdk | 0.7.17 |
| 文件存储 | AWS S3 | 3.958.0 |
| 表单 | React Hook Form + Zod | 7.70.0 / 4.3.5 |
| 图表 | Recharts | 2.15.4 |
| 导出 | xlsx + docx | 0.18.5 / 9.6.1 |
| 包管理器 | pnpm | 9.0.0 |

### 1.3 项目规模

- **页面路由**：约 40+ 个页面（管理端 17 个模块、小队端 12 个模块、家长端 3 个模块）
- **API 路由**：约 60+ 个端点
- **数据库表**：约 25+ 张核心业务表
- **UI 组件**：约 50+ 个 shadcn/ui 基础组件 + 7 个业务组件
- **AI 智能体**：3 个（蜡象助手、银蛇博士、编码助手 KKONE）
- **AI 技能模块**：6 个（学习教练、逆商进化营、Inkwell 阅读、记忆蒸馏、自省引擎、数据分析）

---

## 二、角色体系与权限模型

### 2.1 角色总览

本项目包含 **4 类人类角色** 和 **3 个 AI 智能体**，形成完整的教育生态。

#### 人类角色

| 角色 | 标识 | 登录方式 | 入口路径 | AI 伙伴 |
|------|------|---------|---------|---------|
| 超级管理员 | `super_admin` / `admin` | 账号+密码 | `/admin/*` | 蜡象助手 🐘 |
| 助学老师 | `teacher` | 账号+密码 | `/admin/*` | 蜡象助手 🐘 |
| 授课志愿者 | `volunteer` | 账号+密码 | `/admin/*` | 蜡象助手 🐘 |
| 小队 | `team` | 小队编码+密码 | `/team/*` | 银蛇博士 🐍 |
| 家长 | `parent` | 手机号+密码 | `/parent/*` | 蜡象助手 🐘 |

#### AI 智能体

| 智能体 | 服务对象 | 图标 | 核心能力 | API 端点 |
|--------|---------|------|---------|---------|
| 蜡象助手 | 管理员 + 家长 | laxiang-assistant.png | 数据洞察、关系分析、趋势预测、消息代理、产出评价、报告生成 | `/api/admin/assistant` |
| 银蛇博士 | 小队 | yinhe-doctor.png | 任务指引、工具/技能解释、激励说明、图片/视频生成、语音对话 | `/api/ai/assistant` |
| 编码助手 KKONE | 开发者 | — | 编码辅助、自省系统、5层记忆架构 | — |

### 2.2 角色关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                    超级管理员 (super_admin)                       │
│  数据范围: all  |  权限: 所有模块完全控制                           │
│  职责: 管理所有数据、配置系统、审核产出                             │
└──────────────────┬──────────────────────────────────────────────┘
                   │ 管理
           ┌───────┴────────┐
           ▼                ▼
┌──────────────────┐  ┌──────────────────┐
│   助学老师         │  │   授课志愿者       │
│   (teacher)       │  │   (volunteer)     │
│   数据范围: school │  │   数据范围: assigned│
│                   │  │                   │
│   · 管理本校数据    │  │  · 创建/指导小队   │
│   · 审核家长关注    │  │  · 审核产出       │
│   · 查看本校信息    │  │  · 发送消息       │
└──────────────────┘  └────────┬─────────┘
                               │ 创建/指导
                               ▼
                    ┌──────────────────────┐
                    │      小队 (team)       │
                    │                       │
                    │  成员角色:              │
                    │  · 指引者 guider        │
                    │  · 光影法师 light_mage  │
                    │  · 秘语学者 secret_scholar │
                    │                       │
                    │  功能:                 │
                    │  · 选主题 → 做任务      │
                    │  · 提交产出 → 获积分    │
                    │  · 借贷/转账/兑换激励   │
                    └──────────┬─────────────┘
                               ▲
                               │ 关注（需审核）
                    ┌──────────┴──────────┐
                    │     家长 (parent)      │
                    │  · 手机号登录/注册      │
                    │  · 关注孩子所在小队     │
                    │  · 查看学习进度和产出   │
                    └───────────────────────┘
```

### 2.3 权限矩阵

| 功能模块 | super_admin | volunteer | teacher |
|---------|:-----------:|:---------:|:-------:|
| 学生前测 | full | read | read |
| 任务管理 | full | read | read |
| 最后任务 | full | read | none |
| 小队管理 | full | write | read |
| 产出审核 | full | write | read |
| 项目小学 | full | read | write |
| 授课志愿者 | full | none | read |
| 关注审核 | full | none | none |
| 工具管理 | full | read | read |
| 技能学习 | full | read | read |
| 消息管理 | full | write | read |
| 激励配置 | full | read | none |
| 反馈查看 | full | full | none |
| 家乡黑板报 | full | write | read |
| 系统设置 | full | none | none |

> 权限级别说明：`none` = 无权限、`read` = 只读、`write` = 可编辑、`full` = 完全控制（含删除）

---

## 三、核心业务流程

### 3.1 小队学习生命周期

```
阶段1: 组队          阶段2: 前测         阶段3: 选主题        阶段4: 做任务
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ 设置队名  │ ──→ │ 逐题答题  │ ──→ │ 选择探索  │ ──→ │ 多阶段   │
│ 设置口号  │      │ 成员独立  │      │ 主题类型  │      │ 工具/技能 │
│ 分配角色  │      │ +10积分   │      │          │      │ 积分/激励 │
└──────────┘      └──────────┘      └──────────┘      └─────┬────┘
                                                            │
                    ┌──────────┐      ┌──────────┐           │
                    │ 审核产出  │ ←── │ 提交产出  │ ←─────────┘
                    │ 通过/退回 │      │ 文本/图片  │      阶段5: 提交产出
                    │ 60分评价  │      │ 文件上传   │
                    └─────┬────┘      └──────────┘
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
         审核通过                  审核退回
              │                       │
              ▼                       ▼
     ┌──────────────┐         ┌──────────────┐
     │ 进入下一阶段   │         │ 重新提交产出  │
     │ 或完成主题    │         │ 修改后重交   │
     └───────┬──────┘         └──────────────┘
             │
             ▼ 完成所有阶段
     ┌──────────────┐
     │  新周期开始    │ ← cycle + 1
     │  可选新主题    │ ← 回到阶段3
     └──────────────┘
```

### 3.2 主题与任务关系

```
任务主题 (task_themes)
├── 全局主题 (is_exclusive=false, school_id=null) → 所有学校可用
├── 专属主题 (is_exclusive=true, school_id=xxx) → 归属特定学校
│
└── 任务组 (task_group_id)
    ├── 任务组名称 (group_name)
    ├── 简单难度任务 ── 独立的 title/description/requirements/learning_goals/tools/skills/rewards
    ├── 中等难度任务 ── 独立的 title/description/requirements/learning_goals/tools/skills/rewards
    └── 困难难度任务 ── 独立的 title/description/requirements/learning_goals/tools/skills/rewards
```

**关键规则**：
- 每个任务独立拥有自己的工具、技能、激励、要求和目标
- 同一任务组中同一工具只计一次库存消耗
- 同一志愿者下的小队不能同时选择相同主题
- 不同周期可以选择相同主题

### 3.3 家长关注审核流程

```
1. 家长注册（手机号+密码+孩子信息+关系）
2. 搜索孩子所在小队 → 提交关注申请
3. 系统自动通知对应学校老师
4. 老师在「关注审核」模块处理：
   ├── 通过 → 家长可查看小队信息
   └── 拒绝（需填原因） → 家长可修改后重新提交
```

---

## 四、激励经济系统

### 4.1 积分获取与消耗

| 获取方式 | 积分 | 消耗方式 | 积分 |
|---------|------|---------|------|
| 任务完成 | +任务积分 | 兑换激励物品 | -物品积分 |
| 被点赞 | +5/次 | 积分转账 | -转账积分 |
| 点赞他人 | +1/次 | 归还借贷 | -本金+利息 |
| 前测完成 | +10 | — | — |

### 4.2 爱心宝石系统

```
转账1次 → +1 碎片 (heart_shards)
10 碎片 → 自动合成 1 颗宝石 (heart_gems)
```

### 4.3 借贷系统

```
发起借贷 → 选择出借方（同志愿者下小队）→ 设置利率和归还日期
→ 等待确认 → 积分到账 → 按期归还

利息公式:
  应还积分 = 本金 + 本金 × (利率/100) × 借款天数
  逾期利息 = 本金 × (逾期利率/100) × 逾期天数
  总应还 = 应还积分 + 逾期利息

状态流转: pending → approved → repaid / overdue
```

### 4.4 激励物品类型

| 类型 | 标识 | 说明 |
|------|------|------|
| 徽章 | badge | — |
| 宝石 | gem | — |
| 隐藏技能卡 | skill_card | — |
| 隐藏工具卡 | tool_card | — |
| 成就 | achievement | — |
| 证书 | certificate | — |
| 爱心宝石碎片 | heart_fragment | — |
| 爱心宝石 | heart_gem | — |

### 4.5 产出评价体系（60分制）

| 维度 | 分值 | 评价标准 |
|------|------|---------|
| 任务一致性 | 20分 | 产出是否体现任务要求的内容 |
| 作品质量 | 30分 | 完整度、创意、用心程度 |
| 按时提交 | 10分 | 是否在截止日期前提交 |

**评价等级**：优秀(50-60) / 良好(40-49) / 合格(30-39) / 待改进(<30)

---

## 五、数据模型

### 5.1 核心业务表

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `users` | 管理员/志愿者/助学老师 | id, username, password, role, school_id |
| `teams` | 小队信息 | id, code, name, points, cycle, current_theme_id, created_by |
| `team_members` | 小队成员 | id, team_id, name, role(guider/light_mage/secret_scholar) |
| `schools` | 学校 | id, name, province, city, county |
| `task_themes` | 探索主题 | id, name, is_exclusive, school_id |
| `tasks` | 任务 | id, theme_id, stage, title, points, task_type |
| `task_submissions` | 产出提交 | id, team_id, task_id, content, status, rating |
| `skills` | 技能 | id, name, category, content |
| `tools` | 工具 | id, name, category, stock, nature(physical/virtual) |
| `rewards` | 激励物品 | id, name, type, points, distribution_method |
| `messages` | 消息 | id, sender_id, team_id, content, type |
| `parents` | 家长 | id, phone, name, school_id |
| `parent_team_follows` | 家长关注 | id, parent_id, team_id, child_name, status |

### 5.2 关联表

| 表名 | 说明 |
|------|------|
| `task_skills` | 任务-技能关联（含积分、是否必学） |
| `task_tools` | 任务-工具关联（含是否必选） |
| `task_rewards` | 任务-激励关联 |
| `tool_skills` | 工具-技能关联（含自动添加标记） |
| `team_theme_selections` | 小队主题选择记录（含周期） |
| `theme_completions` | 主题完成记录 |
| `team_skill_learnings` | 小队技能学习记录 |
| `team_tools` | 小队工具领用记录 |
| `school_tools` | 学校工具库存 |
| `borrow_records` | 借贷记录 |
| `transfer_records` | 转账记录 |
| `team_notifications` | 小队通知 |
| `pretest_questions` | 前测问卷题目 |
| `pretest_responses` | 前测回答记录 |
| `user_rewards` | 用户奖励记录 |
| `learning_materials` | 学习资料 |
| `team_material_progress` | 学习资料完成记录 |
| `team_side_tasks` | 小队支线任务 |

### 5.3 AI 系统表

| 表名 | 说明 |
|------|------|
| `agent_memories` | 智能体记忆（含知识、技能、洞察、蒸馏等类型） |
| `agent_reflections` | 智能体自省记录 |
| `user_memories` | 用户永久记忆（按 userId + agentType 存储） |

---

## 六、AI 智能体系统

### 6.1 蜡象助手（管理员端 + 家长端）

**定位**：数据洞察与决策辅助助手

**核心能力**：
- 数据洞察：实时查询各模块数据
- 关系分析：理解数据归属关系
- 趋势预测：预测数据变动
- 消息代理：直接发送消息通知
- 产出评价：60分制专业评价
- 报告生成：Word 格式分析报告
- 用户永久记忆：跨会话记住用户偏好

**支持报告类型**：overview / teams / tasks / submissions / schools / volunteers / rewards / comprehensive

**技术特性**：
- SSE 流式响应
- 命令预处理系统（自动检测意图并预查询数据）
- 文件上传分析（图片/视频/文档）
- 语音输入/输出（ASR + TTS）
- 页面上下文感知

### 6.2 银蛇博士（小队端）

**定位**：乡村守护神 · 任务指引助手

**核心能力**：
- 任务指引：解答任务要求、工具使用、激励说明
- 图片生成：AI 生成图片辅助学习
- 视频生成：AI 生成视频辅助学习
- 语音对话：自动语音回复
- 方案选择：提供多方案供小队选择

**对话限制机制**：
- 每日对话时长上限 2 小时
- 离题率超过 50% 时提醒回归任务
- 对话超过 50 轮时提示休息

### 6.3 自动学习系统

| 系统 | 触发时间 | 功能 |
|------|---------|------|
| 记忆蒸馏 (Auto Dream) | 每日 06:00 | 合并冗余记忆 → 归档旧记忆 → 清理灰尘 |
| 逆商进化营 (EntroCamp) | 每日 08:00 | 自动学习课程 → 升级维度 → 弱项重修 |
| Inkwell 阅读 | 每日 08:00 | 阅读精选文章 → 知识内化为技能规则 → 注入对话上下文 |

### 6.4 记忆系统架构

```
5层记忆架构:
┌─────────────────────────────────────────────────────────┐
│ L0 核心记忆   │ AGENTS.md              │ 永久 │ 项目结构、规范    │
│ L1 反思记忆   │ DEVELOPMENT-REVIEW.md  │ 永久 │ 历史错误、改进    │
│ L2 项目记忆   │ agent_memories (coder) │ 长期 │ 技术决策、偏好    │
│ L3 结构化记忆  │ agent_reflections      │ 长期 │ 可统计的错误记录  │
│ L4 会话记忆   │ 对话上下文              │ 会话内│ 当前任务、临时变量 │
└─────────────────────────────────────────────────────────┘

记忆查询优先级: L0 > L1 > L2 > L3 > L4
```

---

## 七、安全体系

| 安全措施 | 实现方式 |
|---------|---------|
| 密码安全 | SHA-256 + 盐值哈希，向后兼容明文 |
| 会话管理 | localStorage 存储登录状态 |
| 频率限制 | 防暴力破解 |
| IP 管理 | 白名单/黑名单 |
| CSRF 防护 | — |
| 输入验证 | XSS、SQL 注入防护 |
| 内容审核 | content-moderation.ts |
| 权限控制 | 基于角色的模块级权限 + 数据范围隔离 |

---

## 八、页面路由结构

### 8.1 管理员端 (`/admin/*`)

| 路由 | 功能 | 容器宽度 |
|------|------|---------|
| `/admin/login` | 登录 | max-w-md |
| `/admin/dashboard` | 仪表盘 | max-w-7xl |
| `/admin/teams` | 小队管理 | max-w-7xl |
| `/admin/teams/[id]` | 小队详情 | max-w-7xl |
| `/admin/tasks` | 任务管理 | max-w-7xl |
| `/admin/tasks/[id]` | 任务详情 | max-w-4xl |
| `/admin/task/[id]` | 主题详情 | max-w-4xl |
| `/admin/submissions` | 产出审核 | max-w-7xl |
| `/admin/rewards` | 激励配置 | max-w-7xl |
| `/admin/rewards/create` | 创建激励 | max-w-4xl |
| `/admin/rewards/[id]` | 激励详情 | max-w-4xl |
| `/admin/skills` | 技能管理 | max-w-7xl |
| `/admin/tools` | 工具管理 | max-w-7xl |
| `/admin/volunteers` | 志愿者管理 | max-w-7xl |
| `/admin/schools` | 学校管理 | max-w-7xl |
| `/admin/messages` | 消息管理 | max-w-7xl |
| `/admin/feedback` | 反馈查看 | max-w-7xl |
| `/admin/final-tasks` | 最后任务 | max-w-7xl |
| `/admin/pretest` | 学生前测 | max-w-7xl |
| `/admin/follow-verifies` | 关注审核 | max-w-7xl |
| `/admin/blackboard` | 家乡黑板报 | max-w-7xl |
| `/admin/settings` | 权限管理 | max-w-3xl |
| `/admin/profile` | 个人中心 | max-w-3xl |

### 8.2 小队端 (`/team/*`)

| 路由 | 功能 | 容器宽度 |
|------|------|---------|
| `/team/login` | 登录 | max-w-md |
| `/team/dashboard` | 仪表盘 | max-w-4xl |
| `/team/tasks` | 任务列表 | max-w-4xl |
| `/team/task/[id]` | 任务详情 | max-w-4xl |
| `/team/learning` | 技能学习 | max-w-4xl |
| `/team/submit` | 产出上传 | max-w-4xl |
| `/team/rewards` | 激励中心 | max-w-4xl |
| `/team/members` | 成员管理 | max-w-4xl |
| `/team/messages` | 消息中心 | max-w-4xl |
| `/team/borrow` | 积分借贷 | max-w-4xl |
| `/team/transfer` | 积分转账 | max-w-4xl |
| `/team/pretest` | 前测问卷 | max-w-4xl |
| `/team/final-task-feedback/[id]` | 最后任务反馈 | max-w-4xl |
| `/team/blackboard` | 家乡黑板报 | max-w-4xl |
| `/team/settings` | 小队设置 | max-w-4xl |

### 8.3 家长端 (`/parent/*`)

| 路由 | 功能 |
|------|------|
| `/parent/login` | 家长登录/注册 |
| `/parent/dashboard` | 家长仪表盘 |
| `/parent/assistant` | 蜡象助手 |

---

## 九、API 接口概览

### 9.1 认证 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 管理员登录 |
| `/api/auth/team-login` | POST | 小队登录 |
| `/api/auth/parent-login` | POST | 家长登录/注册 |
| `/api/auth/team-change-password` | POST | 小队修改密码 |
| `/api/auth/check-phone` | POST | 检查手机号 |

### 9.2 管理端核心 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/admin/stats` | GET | 统计数据 |
| `/api/admin/assistant` | POST | 蜡象助手对话 |
| `/api/admin/assistant/upload` | POST | 文件上传 |
| `/api/admin/assistant/voice` | POST | 语音输入/输出 |
| `/api/admin/pretest/questions` | GET/POST | 前测题目管理 |
| `/api/admin/pretest/stats` | GET | 前测统计 |
| `/api/admin/feedback` | GET | 反馈列表 |
| `/api/admin/feedback/export` | GET | 导出反馈 |
| `/api/admin/final-tasks` | GET | 最后任务列表 |
| `/api/admin/follows` | GET | 关注审核列表 |

### 9.3 小队端核心 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/team/info` | GET | 小队信息 |
| `/api/team/current-task` | GET | 当前任务 |
| `/api/team/pretest` | GET/POST | 前测问卷 |
| `/api/team/borrow` | GET/POST/PUT | 借贷管理 |
| `/api/team/transfer` | GET/POST | 转账管理 |
| `/api/team/rewards` | GET | 激励列表 |
| `/api/team/notifications` | GET | 通知列表 |
| `/api/team/sibling-teams` | GET | 同志愿者小队 |
| `/api/team/theme-completions` | GET | 已完成主题 |
| `/api/team/blackboard` | GET/POST | 黑板报 |
| `/api/team/heart-gems` | GET | 爱心宝石 |

### 9.4 AI 系统 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ai/assistant` | POST | 银蛇博士对话 |
| `/api/ai/chat` | POST | 通用聊天 |
| `/api/ai/asr` | POST | 语音识别 |
| `/api/ai/tts` | POST | 语音合成 |
| `/api/ai/upload-image` | POST | 图片上传 |
| `/api/ai/entrocamp` | POST | 逆商进化营 |
| `/api/ai/inkwell` | POST | Inkwell 阅读 |
| `/api/ai/memory/distill` | POST | 记忆蒸馏 |
| `/api/ai/memory/user` | GET/POST/DELETE | 用户记忆 |
| `/api/ai/reflection` | POST | 自省记录 |
| `/api/ai/laxiang-report` | GET | 报告生成 |
| `/api/ai/create-theme` | POST | AI 创建主题 |

---

## 十、项目特色与亮点

### 10.1 游戏化教育设计
- 将学习任务设计为"探索主题"，增强沉浸感
- 积分、激励、借贷、转账等经济系统模拟真实社会
- 小队成员角色分工（指引者/光影法师/秘语学者）

### 10.2 AI 深度集成
- 三个智能体各有专长，覆盖管理、学习、开发三个场景
- 自动学习系统（逆商进化营 + Inkwell 阅读）使 AI 持续进化
- 5层记忆架构确保 AI 跨会话保持上下文
- 用户永久记忆系统实现个性化服务

### 10.3 周期制学习
- 小队完成主题后进入新周期，可持续探索
- 积分和产出记录按周期独立统计
- 支持重复选择主题，鼓励深度学习

### 10.4 家长参与机制
- 家长可关注孩子小队，查看学习进度
- 关注审核流程确保隐私安全
- 家长端 AI 助手帮助理解教育意义

### 10.5 开发者自省系统
- 编码助手 KKONE 具备错误自省机制
- 5层记忆架构实现跨会话持久化
- 高频错误监控与预防规则自动生成

---

## 十一、关键文件索引

| 文件路径 | 作用 |
|---------|------|
| `AGENTS.md` | 项目核心记忆（L0），包含所有规范和常见问题 |
| `FEATURES.md` | 功能文档，所有端的功能详述 |
| `DEVELOPMENT-REVIEW.md` | 开发自省记录（L1 反思记忆） |
| `src/storage/database/shared/schema.ts` | 数据库 Schema（Drizzle ORM） |
| `src/storage/database/shared/relations.ts` | 数据库关联关系 |
| `src/lib/permissions.ts` | 角色权限定义与检查 |
| `src/lib/auth.ts` | 密码哈希与验证 |
| `src/lib/constants.ts` | 积分、奖励类型、状态配置 |
| `src/lib/types.ts` | 全局共享类型定义 |
| `src/lib/security.ts` | 安全相关工具 |
| `src/lib/agent-memory.ts` | 智能体记忆管理 |
| `src/lib/assistant-context.ts` | 助手页面上下文 |
| `src/components/admin-assistant.tsx` | 蜡象助手（管理员端） |
| `src/components/ai-assistant.tsx` | 银蛇博士（小队端） |
| `src/components/parent-assistant.tsx` | 蜡象助手（家长端） |
| `src/app/admin/layout.tsx` | 管理端布局 + 蜡象助手注入 |
| `src/app/team/layout.tsx` | 小队端布局 + 银蛇博士注入 |
| `src/app/parent/layout.tsx` | 家长端布局 + 蜡象助手注入 |
| `src/contexts/data-sync-context.tsx` | 数据同步上下文 |
| `src/hooks/usePermission.ts` | 权限检查 Hook |

---

*报告结束*
