# STEM 教育管理平台

## 编码助手身份

- **姓名**: KKONE
- **角色**: 编码助手（通用网页搭建专家）
- **记忆方式**: 跨会话持久化（AGENTS.md L0核心记忆）

## 项目概览

基于 Next.js 的 STEM 教育管理平台，支持小队任务管理、技能学习、工具配置、激励系统、最后任务反馈表单及反馈信息管理。

### 技术栈
- **框架**: Next.js 16 (App Router)
- **UI库**: React 19 + TypeScript 5
- **组件库**: shadcn/ui (Radix UI)
- **样式**: Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL)
- **LLM集成**: coze-coding-dev-sdk
- **导出**: xlsx (Excel导出)

## 目录结构

```
src/
├── app/                      # Next.js App Router
│   ├── admin/               # 管理员端页面
│   │   ├── dashboard/       # 仪表盘
│   │   ├── teams/           # 小队管理
│   │   ├── tasks/           # 任务管理
│   │   ├── submissions/     # 产出审核
│   │   ├── rewards/         # 激励配置
│   │   ├── skills/          # 技能管理
│   │   ├── tools/           # 工具管理
│   │   ├── volunteers/      # 志愿者管理
│   │   ├── schools/         # 学校管理
│   │   ├── feedback/        # 反馈信息
│   │   ├── final-tasks/     # 最后任务管理
│   │   ├── messages/        # 消息管理
│   │   ├── follow-verifies/ # 关注审核
│   │   ├── settings/        # 权限管理
│   │   └── profile/         # 个人中心
│   ├── team/                # 小队端页面
│   │   ├── dashboard/       # 仪表盘
│   │   ├── tasks/           # 任务列表
│   │   ├── learning/        # 技能学习
│   │   ├── rewards/         # 激励中心
│   │   ├── members/         # 小队信息
│   │   ├── messages/        # 消息中心
│   │   ├── submit/          # 产出上传
│   │   └── settings/        # 小队设置
│   ├── parent/              # 家长端页面
│   │   ├── login/           # 家长登录
│   │   └── dashboard/      # 家长仪表盘
│   └── api/                 # API 路由
├── components/              # 公共组件
│   └── ui/                  # shadcn/ui 组件
├── hooks/                   # 自定义 Hooks
│   ├── use-responsive.ts    # 响应式布局 Hook
│   ├── use-scroll-position.ts # 滚动位置记忆
│   └── use-data-refresh.ts  # 数据同步 Hook
├── lib/                     # 工具函数
│   ├── constants.ts         # 常量定义
│   └── types.ts             # 类型定义
└── styles/
    └── globals.css          # 全局样式
```

## 响应式布局规范

### 容器宽度规范

| 页面类型 | 容器宽度 | 适用页面 |
|---------|---------|---------|
| **列表/管理页面** | `max-w-7xl` | 管理员：dashboard、submissions、feedback、schools、final-tasks、teams、rewards、skills、tools、volunteers、tasks |
| **详情/表单页面** | `max-w-4xl` | 管理员：rewards/create、rewards/[id]、task/[id]；小队：dashboard、rewards、members、learning、final-task-feedback、submit、messages、tasks、settings |
| **个人设置页面** | `max-w-3xl` | 管理员：profile、settings |
| **登录页面** | `max-w-md` | admin/login、team/login |

### 内边距规范

| 设备 | 导航栏内边距 | 主内容区内边距 |
|-----|------------|--------------|
| 移动端 | `px-3 py-2` | `px-3 py-4` |
| 桌面端 | `px-4 py-3` | `px-4 py-6` |

### 使用方式

```tsx
// 导航栏
<nav className="max-w-7xl mx-auto px-3 md:px-4 py-2 md:py-3">

// 主内容区
<main className="max-w-7xl mx-auto px-3 md:px-4 py-4 md:py-6">
```

### 响应式 Hook

```tsx
import { useResponsive } from '@/hooks/use-responsive';

const { isMobile, isTablet, isDesktop } = useResponsive();

// 使用示例
<div className={`${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
```

## 编码助手自省机制

编码助手（即开发此项目的 AI Agent）内置自省系统，与银蛇博士/蜡象助手共享 `agent_reflections` 数据库表。

### 自省触发规则
每次会话中遇到以下场景时，**必须**记录自省：
1. **代码构建失败** — 写了无法编译/构建的代码
2. **逻辑错误** — 代码逻辑有 bug 导致功能异常
3. **重复犯错** — 同类错误出现第2次
4. **用户纠正** — 用户指出代码或方案有问题
5. **方案回退** — 实现方案被推翻重来

### 自省记录方式
在 `DEVELOPMENT-REVIEW.md` 文件中按以下格式追加记录：
```markdown
### [日期] 错误类型
- **现象**: 简述发生了什么
- **根因**: 为什么会出错
- **改进**: 下次如何避免
- **标签**: #类型标签（如 #build-error #logic-bug #schema-mismatch）
```

### 会话启动检查
每次新会话开始时，**必须**：
1. 读取 `DEVELOPMENT-REVIEW.md` 最近的 5 条记录
2. 对照当前任务，检查是否有可能犯同类错误
3. 如果发现相关历史错误，在编码前主动规避

### 高频错误监控
定期（每5次文件修改）检查是否有重复出现的错误模式，如果同一标签出现 ≥3 次，必须在 AGENTS.md 的"常见问题"章节中增加预防规则。

### 自省模块
- 代码: `src/lib/skills/coder-reflection/engine.ts`
- 存储: 复用 `agent_reflections` 表，`agent_type = 'coder'`
- API: `POST /api/ai/reflection`（agent_type 传 'coder'）

## 编码助手分层记忆系统

编码助手采用5层记忆架构，跨会话持久化项目上下文：

### 记忆分层

| 层级 | 名称 | 存储 | 生命周期 | 内容 |
|------|------|------|---------|------|
| L0 | 核心记忆 | `AGENTS.md` | 永久 | 项目结构、规范、常见问题 |
| L1 | 反思记忆 | `DEVELOPMENT-REVIEW.md` | 永久 | 历史错误、根因分析、改进策略 |
| L2 | 项目记忆 | `agent_memories` 表 (agent='coder') | 长期 | 技术决策、架构偏好、用户风格 |
| L3 | 结构化记忆 | `agent_reflections` 表 (agent='coder') | 长期 | 可统计的错误记录、知识缺口 |
| L4 | 会话记忆 | 对话上下文 | 会话内 | 当前任务、临时变量、未完成项 |

### 会话启动流程（必须执行）

1. 读取 `AGENTS.md` 获取 L0 核心记忆
2. 读取 `DEVELOPMENT-REVIEW.md` 最近 5 条获取 L1 反思记忆
3. 查询 `agent_memories` (agent='coder', layer=2) 获取 L2 项目偏好
4. 合并形成完整上下文，开始工作

### 记忆写入规则

- **技术决策**（如"用户偏好 Vue 风格"）→ 写入 L2 `agent_memories`
- **错误反思**（如"pnpm 隔离问题"）→ 写入 L1 + L3 双通道
- **项目结构变更**（如"新增模块"）→ 更新 L0 `AGENTS.md`
- **重要会话结论**（如"用户确认了 XX 设计方案"）→ 写入 L2

### 记忆蒸馏

当 L4 会话中产生 3 次以上相同类型的临时发现时，自动蒸馏到 L2：
- 同一文件修改 3 次以上 → 记录该文件的编辑偏好
- 同一类错误出现 2 次 → 触发自省，写入 L1 + L3
- 同一技术选择被确认 2 次 → 写入 L2 作为项目偏好

### 记忆查询优先级

查询记忆时按 L0 → L1 → L2 → L3 顺序，L0 权重最高：
- L0 的规则不可被 L2 覆盖
- L1 的反思不可被 L4 的临时观察覆盖
- L2 的偏好可以被用户的明确指令覆盖

## 智能体记忆蒸馏系统（Auto Dream）

### 概述
银蛇博士、蜡象助手等智能体均配备自动记忆蒸馏系统，定期将冗余/过时的记忆合并、压缩、归档，防止记忆无限膨胀，保持检索精度。

### 系统架构
```
scheduler.js (后台常驻进程)
  → 每天北京时间06:00自动触发（与逆商进化营错峰）
  → 调用 /api/ai/memory/distill API
  → 按agent依次蒸馏：assistant → dr-silver-snake → wax-elephant

memory-distiller.ts (蒸馏引擎)
  → loadMemoriesByCategory(): 按 memory_type 分组加载记忆
  → distillCategory(): 调用LLM将同类型冗余记忆合并
  → archiveOldMemories(): 标记旧记忆为archived，保留精炼后的新记忆
  → cleanupDust(): 删除超过90天未访问的低重要性archived记忆

route.ts (API路由)
  → POST /api/ai/memory/distill {agent, action}
  → action: distill | status | cleanup
```

### 蒸馏流程
1. **分类加载**：按 memory_type 分组（knowledge, knowledge_skill, knowledge_insight, project_context 等）
2. **冗余检测**：同类型记忆超过5条时触发蒸馏
3. **LLM精炼**：调用LLM将多条相似记忆合并为1-2条精炼记录
4. **归档旧记忆**：原始记忆标记为 `is_active=false, status='archived'`
5. **保存精炼记忆**：新记忆标记为 `memory_type='distilled'`，保留来源引用
6. **灰尘清理**：删除超过90天未访问且重要性≤1的archived记忆

### API 端点
- `POST /api/ai/memory/distill` - 触发蒸馏/查看状态/清理
- `GET /api/ai/memory/distill?action=status&agent=assistant` - 查看蒸馏状态

### 数据库
- 复用 `agent_memories` 表，蒸馏后记忆的 `memory_type='distilled'`
- 蒸馏统计记录在 `agent_memories` 表中 `memory_type='distill_stats'`
- 日志位置：`/app/work/logs/bypass/memory-distiller-scheduler.log`

## 智能体用户永久记忆系统

### 概述
蜡象助手为每个具体用户维护独立的永久记忆，跨会话记住用户的偏好、习惯、工作背景等信息。

### 数据库表结构
```sql
CREATE TABLE public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,        -- 用户ID
  agent_type VARCHAR(50) NOT NULL DEFAULT 'assistant',  -- 智能体类型
  category VARCHAR(50) NOT NULL,        -- 记忆类别
  key VARCHAR(200) NOT NULL,            -- 记忆键
  value TEXT NOT NULL,                   -- 记忆值
  importance INTEGER DEFAULT 1,         -- 重要性(1-5)
  source VARCHAR(50) DEFAULT 'conversation',  -- 来源
  is_active BOOLEAN DEFAULT true,
  access_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_user_memory_key UNIQUE(user_id, agent_type, category, key)
);
```

### 记忆类别
| 类别 | 说明 | 示例 |
|------|------|------|
| preference | 沟通偏好 | 喜欢简洁回复、偏好中文 |
| identity | 身份信息 | 姓名、角色、学校 |
| work_style | 工作方式 | 习惯批量操作、偏好先看数据 |
| interaction | 交互习惯 | 常问问题类型、使用频率 |
| context | 工作背景 | 管理的学校、负责的小队 |
| feedback | 用户反馈 | 对某个功能的意见 |

### 记忆注入
每次对话开始时，系统自动加载该用户的永久记忆并注入到蜡象助手的上下文中：
```
【关于这位用户的永久记忆】
- 身份：张老师（阳光小学助学老师）
- 偏好：喜欢简洁回复，不需要过多解释
- 工作背景：负责阳光小学3个小队
...
```

### 记忆保存
1. **自动保存**：对话结束后，系统自动从对话内容中提取用户信息并保存
2. **[记住] 命令**：蜡象助手可通过 `[记住]` 命令主动保存用户信息
3. **更新机制**：同一 category+key 的记忆会被覆盖更新，不会重复

### API 端点
- `GET /api/ai/memory/user?userId=xxx` - 获取用户记忆
- `POST /api/ai/memory/user` - 保存/更新用户记忆
- `DELETE /api/ai/memory/user?userId=xxx&category=xxx&key=xxx` - 删除用户记忆

## 构建和测试命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 类型检查
npx tsc --noEmit

# 构建
pnpm build

# 生产模式
pnpm start
```

## 核心业务逻辑

### 角色权限
- **super_admin**: 超级管理员，拥有所有权限
- **teacher**: 助学老师，管理本校小队
- **volunteer**: 志愿者，管理指导的小队

### 主题类型
- **全局主题** (`is_exclusive=false`, `school_id=null`): 所有学校可用
- **专属主题** (`is_exclusive=true`): 归属特定学校

### 任务流程
1. 小队选择主题
2. 系统下发第一阶段任务
3. 小队完成学习任务
4. 志愿者/助学老师审核产出
5. 进入下一阶段
6. 完成一个主题后，可选择新的探索主题（新周期）

### 任务周期机制
当小队完成一个主题的所有任务后，进入下一周期，可以选择探索新的主题。

**核心设计**：
- **周期字段**：`teams.cycle` 记录小队当前所处周期
- **选择记录表**：`team_theme_selections` 记录每个周期的选择历史
- **主题来源**：可以探索已被其他小队选择的主题，也可以选择未被选择的新主题

**数据库表结构**：
```sql
-- team_theme_selections 表
CREATE TABLE public.team_theme_selections (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  theme_id UUID REFERENCES task_themes(id),
  cycle INTEGER NOT NULL,           -- 周期编号
  selected_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'in_progress'  -- in_progress, completed
);
```

**周期选择规则**：
- 完成当前主题后，`teams.cycle` 自动 +1
- 新周期可选择任意主题（无论是否被其他小队选择）
- 选择新主题后，系统下发新周期第一阶段任务
- 激励积分和产出记录按周期独立统计

### 激励系统
- 点赞规则：每获得1个点赞+5积分
- 爱心宝石：送出点赞获得碎片，10个碎片合成1颗宝石
- 任务奖励：完成任务获得积分和激励物品

### 家长登录系统
家长可以通过手机号登录，关注并查看孩子所在小队的学习情况。

**数据库表结构**：
```sql
-- parents 表
CREATE TABLE public.parents (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  password VARCHAR(255),
  school_id VARCHAR(100),
  school_name VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- parent_team_follows 表
CREATE TABLE public.parent_team_follows (
  id UUID PRIMARY KEY,
  parent_id UUID REFERENCES parents(id),
  team_id UUID REFERENCES teams(id),
  child_name VARCHAR(100) NOT NULL,
  child_grade VARCHAR(50),
  relation VARCHAR(50),
  guardian_reason TEXT,
  school_id VARCHAR(100),
  school_name VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'approved',
  followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unfollowed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_remark TEXT
);
```

**功能特性**：
- 手机号+密码登录/注册（必填）
- 注册时设置密码，需确认密码
- 归属小学选择（输入关键词自动搜索筛选）
- 与孩子关系（父亲、母亲、爷爷、奶奶、姥姥、姥爷、其他）
- 孩子姓名（必填）
- 孩子年级（必填）
- 如果选择「其他」关系，需填写：明确的关系 + 为何由你作为此学生监护人
- 注册成功后可立即登录使用
- 搜索并关注孩子所在的小队（关注申请需老师审核）
- **关注记录板块**：统一展示所有关注申请记录
  - 待审核：黄色显示，等待老师审核
  - 已拒绝：红色显示，包含拒绝原因，可点击查看详情并修改后重新提交
  - 已取消关注：灰色显示，可重新关注
- 切换小队功能（原小队数据存档）
- 查看历史小队记录
- 查看小队基本信息（名称、口号、积分、当前主题）
- 查看小队成员分工
- 查看任务进度和产出评价
- 查看孩子前测问卷结果
- 查看最后任务反馈内容
- 查看已完成主题历史

**关注审核流程**：
1. 家长登录后选择归属小学、关系和孩子信息
2. 如选择「其他」关系，需填写监护人说明
3. 搜索孩子所在小队并提交关注申请
4. 系统自动向对应学校老师发送消息通知（包含监护人说明）
5. 学校助学老师登录管理后台
6. 在「关注审核」模块查看并审核申请
   - 查看详情：上下滚动查看所有信息
   - 通过：无需填写备注，直接确认通过
   - 拒绝：需填写拒绝原因
7. 审核通过后家长可查看小队信息

**消息通知**：
- 家长提交关注申请后，自动向对应学校老师发送通知
- 通知内容包含家长姓名、孩子信息、小队名称
- 老师在消息中心查看并处理审核

**API 端点**：
- `/api/auth/parent-login` - 家长登录/注册
- `/api/parent/teams` - 获取/关注/切换小队（GET/POST/PUT）
- `/api/parent/search` - 搜索小队
- `/api/parent/team-detail` - 获取小队详细信息
- `/api/parent/schools` - 搜索学校
- `/api/admin/follows` - 管理端关注审核

## 逆商进化营自动学习系统

### 概述
银蛇博士和蜡象助手已接入 EntroCamp 逆商进化营，每天自动学习课程并不断升级。

### 系统架构
```
scheduler.js (后台常驻进程)
  → 每天北京时间08:00自动触发
  → 调用 /api/ai/entrocamp API
  → 学习流程：start → complete（V2简化流程）
  → 学完一轮后自动重新选课（选分数最低的弱项科目）
  → 最多5轮/天，防止无限循环

engine.ts (学习引擎)
  → getTodaySchedule(): 获取当日课程安排
  → executeLesson(): 执行单节课学习
  → executeDailyLearning(): 循环学完所有可用课程
  → autoReenrollWeakSubjects(): 自动选择弱项科目重新注册

route.ts (API路由)
  → POST /api/ai/entrocamp {agent, action}
  → action: learn | auto-enroll | schedule | status
  → agent: dr-silver-snake | wax-elephant | all
```

### Agent 配置
| Agent | API Key | 弱项科目 |
|-------|---------|---------|
| 银蛇博士 | agent-world-dbb6ab75... | reasoning, memory, intent |
| 蜡象助手 | agent-world-3905bab2... | execution, memory, intent |

### 维度目标
所有非锁定维度达到 S 级。当前弱项：银蛇博士的 reasoning/memory/intent 为 D(10)，蜡象助手的 execution/memory/intent 为 D(10)。

### 日志位置
- 定时服务日志：`/app/work/logs/bypass/entrocamp-scheduler.log`
- API日志：通过 Next.js 控制台输出

### 注意事项
- 只做逆商进化营课程学习，不做 ABTI 测试
- 维度分数通过课程学习和逆商测试更新
- 自动选课优先选择分数最低的弱项科目
- 同一科目完成一轮后自动重新选课继续学习
- 每日学习时间：北京时间 08:00
- dev.sh / start.sh 已配置自动启动定时服务

## Inkwell 每日自动阅读与知识内化系统

### 概述
银蛇博士和蜡象助手每天自动阅读 Inkwell 精选博客文章，并将学到的知识提炼为**可实操的技能规则**，内化到记忆系统中供对话时直接运用。

### 系统架构
```
scheduler.js (后台常驻进程)
  → 每天北京时间08:00自动触发
  → 1. 逆商进化营课程学习 (已部署)
  → 2. Inkwell 文章阅读 + 知识内化 (新增)

engine.ts (阅读引擎)
  → executeDailyReading(): 获取热门+分类文章，阅读+点赞+收藏
  → 银蛇博士关注: AI & ML, Web Dev, Education
  → 蜡象助手关注: Systems, Security, Tech Culture

knowledge-internalizer.ts (知识内化引擎)
  → 获取收藏的文章详情
  → 调用LLM提炼为可实操技能 (when/rule格式)
  → 写入 agent_memories 表 (memory_type: knowledge/knowledge_skill, layer: 3)
  → 去重: 已内化的文章不再重复处理

route.ts (API路由)
  → POST /api/ai/inkwell {agent, action}
  → action: read | internalize | skills | status
```

### 知识内化流程
1. **阅读**: 从收藏列表获取文章，读取完整内容
2. **提炼**: 调用LLM将文章核心内容提炼为可实操技能规则
   - 每条技能包含: 名称(name)、触发条件(when)、执行规则(rule)、来源(source)
   - 附加洞察(insight): 文章的核心洞察和实际应用方向
3. **存储**: 写入 `agent_memories` 表
   - 概览记忆: `memory_type='knowledge'`, 包含核心价值和技能数量
   - 技能记忆: `memory_type='knowledge_skill'`, 包含when/rule格式的具体规则
   - 洞察记忆: `memory_type='knowledge_insight'`, 包含核心洞察
4. **注入**: 对话时自动加载知识技能，注入系统提示词的【已内化知识】区块

### 可实操技能格式
```json
{
  "name": "AI代码审核规则",
  "when": "当学生或用户使用AI生成的代码时",
  "rule": "必须要求人工审核验证，不能盲目信任AI输出；先理解原理再使用",
  "source": "AI Did It in 12 Minutes"
}
```

### API 端点
- `POST /api/ai/inkwell` - 阅读文章/内化知识/查看技能
- `GET /api/ai/inkwell?action=skills&agent=xxx` - 查看已内化技能

### 数据库
- `agent_memories` 表新增 `tags` 列 (text[])
- 知识类型: `knowledge`, `knowledge_skill`, `knowledge_insight`
- 层级: `layer=3` (长期记忆)

## 常见问题

### 登录问题诊断
如果登录时提示"用户名不存在"，请按照以下步骤诊断：

**快速诊断**：
```bash
# 1. 诊断数据库状态
curl http://localhost:5000/api/diagnostics/db

# 2. 查看用户数据
curl http://localhost:5000/api/init-users

# 3. 如果没有数据，初始化测试数据
curl -X POST http://localhost:5000/api/init-users
curl -X POST http://localhost:5000/api/init-teams

# 4. 测试查询
curl -X POST http://localhost:5000/api/test/user-query \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'

# 5. 测试登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'
```

详见：`LOGIN-TROUBLESHOOTING.md`

### 数据初始化问题
如果登录时提示"用户名不存在"或"小队编码不存在"，说明数据库中没有数据。

**快速解决**：
```bash
# 1. 查看当前数据状态
curl http://localhost:5000/api/init-users
curl http://localhost:5000/api/init-teams

# 2. 初始化测试数据
curl -X POST http://localhost:5000/api/init-users
curl -X POST http://localhost:5000/api/init-teams

# 3. 测试登录
# 管理员: admin / 123456
# 小队: TEAM001 / 123456
```

详见：`DATA-INIT.md`

### 导航问题
使用 `window.location.href` 替代 `router.push()` 确保导航稳定

### Hydration 错误
动态数据使用 `useEffect` + `useState` 确保客户端渲染

### 端口占用
服务运行在 5000 端口，使用 `ss -tuln | grep :5000` 检查端口状态

### 密码登录问题（重要）
项目已引入密码哈希安全机制，但为了保持向后兼容性：

1. **向后兼容**：`verifyPassword` 函数同时支持明文密码和哈希密码验证
2. **立即可用**：现有用户可以立即使用初始密码（如 "123456"）登录
3. **推荐迁移**：使用密码迁移 API 将明文密码转换为哈希密码

**密码迁移步骤**：
```bash
# 1. 查询迁移状态
curl http://localhost:5000/api/migrate/all-passwords

# 2. 执行迁移
curl -X POST http://localhost:5000/api/migrate/all-passwords

# 3. 验证迁移
curl http://localhost:5000/api/migrate/all-passwords
```

**数据恢复步骤**：
```bash
# 1. 查看现有数据状态
curl http://localhost:5000/api/restore-data

# 2. 修复账号状态（将 NULL 的 is_active 设置为 true）
curl -X POST http://localhost:5000/api/restore-data \
  -H "Content-Type: application/json" \
  -d '{"repairAccounts": true}'

# 3. 验证修复结果
curl http://localhost:5000/api/restore-data

# 4. 测试所有账号状态
curl http://localhost:5000/api/test/accounts
```

### 账号被禁用问题
如果所有用户和小队登录都提示"账号被禁用"，这是因为数据库中的 `is_active` 字段为 `NULL`。

**快速修复**：
```bash
# 1. 查询账号状态
curl http://localhost:5000/api/migrate/account-status

# 2. 修复所有账号状态
curl -X POST http://localhost:5000/api/migrate/account-status

# 3. 验证修复
curl http://localhost:5000/api/migrate/account-status
```

修复后，所有现有账号的 `is_active` 字段将被设置为 `true`。

详见：`PASSWORD-MIGRATION.md`

### 蜡象助手命令系统常见陷阱

1. **正则匹配命令标签**：必须使用 `(\{[\s\S]*?\})\s*\[\/结束标签\]`（懒惰+结束标签），不能用 `*?` 无边界（截断嵌套JSON）或 `*` 无边界（多命令合并）
2. **difficulty 字段类型**：数据库 `tasks.difficulty` 存字符串 `"easy"/"medium"/"hard"`，不是数字 1/2/3
3. **super_admin 权限**：权限检查必须包含 `userRole === 'admin' || userRole === 'super_admin'`
4. **实体工具库存检查**：不能因 `is_required=true` 跳过库存检查，实体工具无论是否必选都需检查库存
5. **变量遮蔽**：内层 `let used` 遮蔽外层同名变量，导致外层值始终为初始值
6. **SSE 流式标签清理**：前端 `stripCommandTags` 必须处理不完整标签（如 `[配置任务资源` 无 `]`）
7. **LLM 输出不可信**：SYSTEM_PROMPT 约束不能替代后端校验，关键约束（如 tasks 数量 >= 3）必须有后端校验
8. **封装函数递归**：`safeEnqueue` 这类封装函数内部必须调用底层方法（`controller.enqueue`），不能递归调用自身
9. **命令粒度与数据模型**：任务组是不可分割的最小单元，命令粒度必须是任务组而非单任务
10. **工具/技能 API 格式**：PUT `/api/tasks/{id}/tools` 接受 `{ tools: [{toolId, isRequired}] }` 而非 `{ toolIds }`；PUT `/api/tasks/{id}/skills` 接受 `{ skills: [{skillId, points, isRequired}] }` 而非 `{ skillIds }`

### 安全系统
项目已实现完整的安全保护系统：
- 密码哈希（SHA-256 + 盐值）
- 会话管理（令牌机制）
- 频率限制（防止暴力破解）
- IP 白名单/黑名单
- CSRF 防护
- 输入验证（XSS、SQL 注入防护）

详见：`SECURITY.md`、`SECURITY-QUICKSTART.md`

## 蜡象助手（智能体）

蜡象助手是平台内置的智能助手，为管理员提供数据洞察、关系分析、趋势预测、消息发送和产出评价等服务。

### API 端点
- **路由**: `/api/admin/assistant`
- **方法**: POST
- **请求体**:
```json
{
  "userId": "用户ID",
  "userRole": "admin|volunteer|teacher",
  "message": "用户消息",
  "history": [{"role": "user|assistant", "content": "消息内容"}],
  "sessionId": "会话ID（可选）"
}
```

### 核心能力
1. **数据洞察**: 实时了解各模块的动态数据
2. **关系分析**: 理解数据间的逻辑关系和归属关系
3. **代理发送消息**: 直接代理发送消息通知
4. **产出评价**: 读取小队产出详情并进行专业评价
5. **智能建议**: 当查询的小队不存在时，自动提供相似小队建议

### 小队名称查询优化
当用户询问小队产出时（如"查询阳光小队的产出情况"），系统会：
1. 自动提取小队名称（处理语气词、标点符号等）
2. 执行查询命令获取产出数据
3. 如果未找到精确匹配，提供相似小队建议（如"是否要找：阳光之下？"）
4. 将查询结果注入到上下文供模型使用
5. **直接基于预处理数据回答，不再重复生成[查看产出]命令**

### 智能命令预处理系统
- 自动检测用户询问小队产出的意图
- 预处理系统会在 AI 生成回复前执行查询
- 查询结果作为【当前系统数据】的第一部分注入上下文
- AI 无需再生成 [查看产出] 命令，直接使用预处理数据
- 避免了重复执行命令和可能的响应延迟

### 产出评价维度（总分60分）
| 维度 | 分值 | 说明 |
|------|------|------|
| 任务一致性 | 20分 | 产出是否体现了任务要求的内容 |
| 作品质量 | 30分 | 完整度、创意、用心程度 |
| 按时提交 | 10分 | 是否在截止日期前提交 |

### 长期记忆系统
- 支持跨会话对话记忆
- 基于 user_id 加载历史对话
- 每次对话自动保存和提取重要信息

## 核心开发原则（MUST - 每次开发必须遵守）

### 一、数据完整性原则
- 【必须】在读取数据库数据前，先验证数据是否存在，不要假设数据已有值
- 【必须】当发现数据为空时，主动从任务描述、主题上下文等推断合理内容并补全
- 【必须】创建/更新任务时，同步检查并补全 requirements 和 learning_goals 字段
- 【必须】任何涉及数据库读写的功能，先查询确认数据状态再执行后续逻辑

### 二、任务独立原则
- 【必须】每个任务独立拥有自己的工具、技能、激励、任务要求和学习目标
- 【必须】不再在任务组内同步工具/技能到同组任务，每个任务可独立配置
- 【必须】修改单个任务的工具/技能/激励时，只影响该任务自身
- 【必须】任务组详情页仅做展示汇总（展示组内各任务的配置），不做反向控制

### 三、UI与数据模型分层原则
- 【必须】任务组的视图展示和底层数据模型要清晰分离
- 【必须】点击任务组标题行 → 显示任务组总览（组名、组内各任务的工具/技能/激励/要求/目标）
- 【必须】点击组内难度卡片 → 显示单个任务详情（标题、难度、描述、要求、目标、工具、技能、激励）

### 四、开发自检清单（每次开发完成后必须逐项自检）
1. 读取数据库验证数据完整性
2. 验证新增功能不影响已有数据
3. 测试 API 端点的正常和异常情况
4. 确认 UI 展示与数据模型层级对应（任务组级 vs 任务级）
5. 确认工具库存去重：同一任务组中同一工具只计一次库存消耗

### 五、问题发现与记录
- 遇到任何问题或错误，先追查根本原因，不要只修复表面现象
- 问题解决后，写入 DEVELOPMENT-REVIEW.md 记录根因和解决方案
- 定期总结高频问题，建立预防机制
- 重复出现同一类问题时，必须在 API 层添加自动校验/修复逻辑

### 六、先验证再编码原则（来自蜡象助手开发教训）
- 【必须】涉及数据库读写的功能，**写代码前必须先查一次实际数据和表结构**（`SELECT ... LIMIT 5` / `information_schema.columns`），用事实替代假设。不要凭记忆推断字段类型、是否必填、默认值等
- 【必须】写正则表达式时，**先列出所有边界场景**（嵌套、多实例、不完整、空值）再选策略，不要写完再测。正则的量词选择（懒惰/贪婪）必须结合结束标签边界一起考虑
- 【必须】对 LLM 生成的结构化数据，**后端必须校验关键约束**（如数组长度、必填字段、枚举值），校验不过则拒绝执行并给出明确反馈。系统提示词是建议不是保证
- 【必须】设计命令/接口架构时，**先确认数据模型的最小一致性单元**（如任务组是不可分割的），命令粒度必须与数据一致性需求匹配，不能为了简化单次操作而破坏一致性
- 【必须】写封装/代理函数后，**确认内部调用的是被封装的目标函数而非自身**。在函数体首行写注释标注底层调用目标（如 `// delegates to controller.enqueue`）
- 【必须】处理流式输出的清理逻辑时，**必须测试每种中间态**：只有开标签、开标签+部分内容、开标签+完整内容但无闭标签、完整命令。每种中间态都要有对应的清理规则

## 任务组与任务关系规范（CRITICAL）

### 核心原则
- 任务从属于任务组，每个任务独立拥有自己的工具、技能、激励、要求和目标
- **不再全局共享**：取消任务组对组内任务的全局共享和控制
- 每个任务的修改只保存在该任务自身，任务组详情页仅展示汇总信息

### 分层结构
```
任务组（task_group_id）
├── 任务组名称（group_name）
└── 变体任务
    ├── 简单难度任务 ── 独立的 title/description/requirements/learning_goals/tools/skills/rewards/points
    ├── 中等难度任务 ── 独立的 title/description/requirements/learning_goals/tools/skills/rewards/points
    └── 困难难度任务 ── 独立的 title/description/requirements/learning_goals/tools/skills/rewards/points
```

### 工具库存去重规则
- 同一个库存工具在同一任务组的不同任务中被调用时，不重复扣减库存
- 例：任务A添加了工具X，任务B也添加了同一个工具X → 库存数量只减1
- 实现方式：查询可用库存时，按任务组维度去重计算已消耗数量

### UI 分层规范

**任务列表页侧边栏**：
- 点击任务组标题行 → 显示任务组总览（组名、组内各任务的详情：要求/目标/工具/技能/激励）
- 点击组内难度卡片 → 显示单个任务详情（标题、难度、描述、要求、目标、工具、技能、激励）

**任务创建对话框**（添加任务组）：
- 任务组名称（必填）
- 各难度任务独立填写：标题/描述/积分/要求/学习目标
- 不包含工具/技能/激励选择（在任务设置页独立配置）

**任务设置页** (`/admin/task/[id]`)：
- 工具/技能/激励：按任务独立配置，修改仅影响当前任务
- 要求/学习目标：按任务独立配置

