# 开发复盘与规范文档

> 最后更新：2026-05-16

## 一、今日开发复盘

### 1. 完成的开发任务

| # | 任务 | 涉及文件 |
|---|------|---------|
| 1 | 最后任务从 tasks 表迁移到 final_task_forms 自动获取 | `api/tasks/route.ts`, `api/team/current-task/route.ts`, `api/team/final-task-feedback/route.ts` |
| 2 | 小队端非最后任务保留难度选择，最后任务不显示难度 | `team/dashboard/page.tsx` |
| 3 | 一键配置最后任务（按角色自动匹配反馈表单） | `api/themes/[id]/auto-configure-final/route.ts` |
| 4 | 任务组模型：group_name、difficulty、task_group_id | `api/tasks/route.ts`, `tasks/[id]/page.tsx` |
| 5 | 任务组分难度创建（简单6分/中等10分/困难18分，可任意组合） | `tasks/[id]/page.tsx` 创建对话框 |
| 6 | 任务列表按组分组展示，组内显示难度卡片 | `tasks/[id]/page.tsx` 任务列表 |
| 7 | 任务组与组内任务分层：组级显示组名/要求/目标，任务级显示标题/描述/工具/技能/激励 | `tasks/[id]/page.tsx` 侧边栏 |
| 8 | 任务要求和学习目标在任务组中编辑，保存后同步到组内所有任务 | `tasks/[id]/page.tsx` syncGroupFields |
| 9 | 工具/技能在任务设置页添加时同步到同组所有任务 | `task/[id]/page.tsx` syncToolToSiblings/syncSkillToSiblings |
| 10 | 激励从创建对话框移到任务设置页，按难度分配 | `task/[id]/page.tsx` 激励选择器 |
| 11 | 激励选择器重构：点击激励弹出任务分配对话框，不可默认选中 | `task/[id]/page.tsx` pendingReward |
| 12 | 修复现有数据一致性（requirements/learning_goals/tools/skills） | SQL 直接修复 |

### 2. 遇到的问题与错误

| # | 问题 | 根因 | 当时如何解决 |
|---|------|------|------------|
| 1 | 任务更新失败返回 `{}` | PUT handler 未从 body 解构 userId/userRole，传入 Supabase update 静默失败 | 修正解构和字段映射 |
| 2 | 小队端难度UI全部被移除 | 误将"最后任务不需要难度"理解为"所有任务都不需要难度" | 用户纠正后恢复非最后任务的难度选择器 |
| 3 | 工具/技能不同步到同组任务 | 任务设置页 (`task/[id]`) 的 addTool/addSkill 只操作当前任务，无同步机制 | 添加 syncToolToSiblings/syncSkillToSiblings |
| 4 | requirements/learning_goals 在任务组详情中为空 | 数据库中这些字段确实为空（创建时未保存或保存失败） | SQL 直接修复 + 加强 API 自动同步 |
| 5 | 同组任务的工具/技能数量不一致 | easy 变体没有同步 medium 的工具/技能 | SQL 修复 + 代码添加同步逻辑 |
| 6 | 激励选择器默认选中当前任务 | 设计未区分"选中激励"和"分配到任务"两步操作 | 重构为点击激励→弹出任务分配对话框 |
| 7 | 侧边栏显示任务组信息而非单个任务 | 点击任务卡片时 selectedTask 指向单个任务，但 UI 显示的是组级信息 | 拆分为 selectedTaskGroup 和 selectedTask 两个视图 |

### 3. 核心根因分析

**问题本质：任务组（Group）与任务（Task）的分层模型在代码中没有一贯地执行。**

具体表现：

1. **模型层缺失**：任务组（task_group_id 相同的一组任务）没有独立的数据结构和状态管理，始终通过"取组内第一个任务的数据"来模拟组级信息
2. **同步逻辑分散**：工具/技能/需求/目标的同步逻辑分散在前端各个 handler 中，没有统一的同步保障机制
3. **API 无一致性校验**：后端 API 在创建/更新任务时不校验同组数据一致性，前端同步失败也不报错
4. **数据修复依赖人工**：数据不一致时只能通过 SQL 手动修复，没有自动检测和修复工具

---

## 二、改进方案

### 原则：后端保障一致性，前端展示数据

> 过去的做法：前端负责同步 → 容易遗漏 → 数据不一致
> 改进的做法：后端 API 自动同步 → 数据一致性由后端保障

### 已实施的改进

#### 1. 后端 API 自动同步（核心改进）

**任务创建时** (`api/tasks/route.ts`)：
- 新任务加入已有任务组时，自动从组内现有任务同步 requirements、learning_goals
- 确保新成员不会"空手入组"

**任务更新时** (`api/tasks/[id]/route.ts`)：
- 更新 requirements 或 learning_goals 时，自动同步到同组所有任务
- 不再依赖前端的"保存并同步"按钮

**工具/技能 API** (`api/tasks/[id]/tools/route.ts`, `api/tasks/[id]/skills/route.ts`)：
- 重复添加返回成功（幂等性），不再报错
- 确保同步调用不会因重复而失败

#### 2. 数据一致性校验 API

**端点**：`/api/admin/data-consistency`

- `GET`：校验所有任务组的数据一致性，返回不一致项
- `POST`：自动修复所有不一致项

校验维度：
- 同组任务 requirements 是否一致
- 同组任务 learning_goals 是否一致
- 同组任务工具是否一致
- 同组任务技能是否一致

#### 3. 前端同步辅助函数

`syncToolToSiblings` / `syncSkillToSiblings`：
- 所有工具/技能操作后并行同步到同组任务
- 工具同步携带 `autoAddSkills: true`

---

## 三、开发规范

### 3.1 任务组操作规范

**规则**：任务组是一个逻辑实体，由 `task_group_id` 相同的任务组成。

| 操作 | 规范 | 保障机制 |
|------|------|---------|
| 创建任务组 | 先创建第一个任务，后续任务复用 task_group_id | API 自动生成 task_group_id |
| 添加组内任务 | 新任务继承组内已有的 requirements、learning_goals | API 自动同步 |
| 修改任务要求/目标 | 只需修改一个，后端自动同步到组内所有任务 | API PUT 自动同步 |
| 添加工具/技能 | 对任一任务操作，前端同步到组内其他任务 | 前端 syncXxxToSiblings |
| 移除工具/技能 | 对任一任务操作，前端同步到组内其他任务 | 前端 syncXxxToSiblings |
| 添加激励 | 在任务设置页选择激励→选择分配到哪些任务 | 无需同步（激励按任务独立） |

### 3.2 数据一致性自检清单

每次修改任务相关代码后，执行以下检查：

```


## 五、记忆蒸馏与永久用户记忆系统开发复盘

### [2026-05-25] 新功能实现 - 记忆蒸馏 + 永久用户记忆

- **现象**: 银蛇博士和蜡象助手的记忆无限增长（53+条），无清理机制；跨会话用户偏好丢失
- **根因**: 缺少类似 Claude Auto Dream 的记忆蒸馏机制和 per-user 永久记忆
- **改进**: 实现了完整的记忆蒸馏引擎 + 用户永久记忆系统
- **标签**: #feature #memory-system

### 关键文件

| 文件 | 说明 |
|------|------|
| `src/lib/memory-distiller.ts` | 记忆蒸馏引擎（去重、合并、归档、清理） |
| `src/app/api/ai/memory/distill/route.ts` | 蒸馏 API 端点（POST 执行 / GET 状态） |
| `src/app/api/ai/memory/user/route.ts` | 用户永久记忆 API（GET/POST/PUT/DELETE） |
| `src/lib/skills/memory-distiller/scheduler.js` | 蒸馏定时器（每天凌晨3:00自动执行） |
| `src/app/api/admin/assistant/route.ts` | 蜡象助手集成（用户记忆注入 + [记住]命令 + 自动保存） |

### 教训

1. **import 路径必须与项目实际一致**：新建文件时容易用直觉写 `@/lib/supabase/server` 或 `./supabase-client`，实际项目用的是 `@/storage/database/supabase-client`。写代码前必须先检查现有文件的 import 路径。
2. **agent_username 值必须与数据库一致**：不要用中文名或英文代号，必须先查数据库 `SELECT DISTINCT agent_username` 确认实际值（`yinshe_boshi`/`laxiang_zhushou`）。
3. **导出函数 vs 类**：新建模块时如果用函数导出，API 路由调用时不能用 `new ClassName()`，必须检查导出签名。
4. **supabase client 是同步的**：`getSupabaseClient()` 直接返回 client，不需要 `await`。如果参考了其他项目的 `createClient()` 模式，需注意差异。bash
# 1. 运行一致性校验
curl -s http://localhost:5000/api/admin/data-consistency | python3 -m json.tool

# 2. 如有不一致项，自动修复
curl -X POST http://localhost:5000/api/admin/data-consistency

# 3. 验证修复结果
curl -s http://localhost:5000/api/admin/data-consistency | python3 -m json.tool
```

### 3.3 前端开发注意事项

1. **新增同步操作时**：必须同时在前端（即时反馈）和后端（最终一致性）两个层面实现
2. **修改任务字段时**：检查该字段是否属于"组内共享"字段（requirements、learning_goals、tools、skills），如果是，必须同步
3. **创建新页面/组件时**：先确认数据模型是"任务组级"还是"任务级"，选择对应的状态和UI
4. **幂等性**：所有写操作 API 必须支持重复调用不报错（工具/技能的重复添加返回成功）

---

## 四、编码助手自省记录

> 遵循自省引擎规范 (`src/lib/skills/coder-reflection/engine.ts`)，每次出错后自动记录

### R-2026-05-22: safeEnqueue 无限递归导致 SSE 流完全瘫痪（问题5）

- **错误类型**: logic_bug
- **严重程度**: fatal
- **描述**: `safeEnqueue` 函数内部调用了自身（`safeEnqueue(data)`）而非被封装的 `controller.enqueue(encoder.encode(data))`，导致无限递归 → 栈溢出 → `controllerClosed=true` → 所有后续 SSE 数据写入被跳过 → 前端完全收不到助手回复
- **根因**: 写安全封装函数时，内部应调用底层方法，却递归调用了自身。这是最低级的编码错误，但因为没有对封装函数做最小验证，bug 从创建之初就存在而未被发现
- **改进策略**: 写封装函数后，立即在旁边写注释标注底层调用目标；对安全封装函数做一次最小冒烟验证（如 `console.log` 确认底层方法被正确调用）
- **标签**: #logic-bug #recursion #wrapper-function

### R-2026-05-22: LLM 嵌套 JSON 解析持续失败（问题6/8/13）

- **错误类型**: architecture_mismatch
- **严重程度**: critical
- **描述**: LLM 生成的任务组 JSON（3个难度变体嵌套+requirements/learningGoals数组）格式频繁出错，4次测试全部解析失败
- **根因**: (1) 命令架构要求 LLM 一次生成复杂嵌套 JSON，超出 LLM 可靠输出能力 (2) 试图通过提示词约束 LLM 输出格式，但 LLM 倾向选择更短输出 (3) 单任务模式又破坏了任务组数据模型的一致性
- **改进策略**: 
  1. 命令粒度必须与数据一致性需求匹配——任务组是不可分割的最小单元，命令粒度也应该是任务组
  2. 对 LLM 生成的结构化数据，后端必须校验关键约束（如 `tasks.length >= 3`），校验不过则拒绝执行
  3. 添加 `repairJson` 弹性解析作为兜底，但不依赖它修复所有错误
- **标签**: #architecture #llm-output #data-consistency

### R-2026-05-22: 正则表达式边界条件处理不当（问题11/12）

- **错误类型**: regex_boundary
- **严重程度**: critical
- **描述**: 三轮正则修复：(1) 懒惰量词 `*?` 截断嵌套JSON (2) 贪婪量词 `*` 合并多命令 (3) 最终方案：结束标签+懒惰量词
- **根因**: 写正则时没有先列出所有边界场景（嵌套JSON、多命令实例、不完整标签）就选择策略
- **改进策略**: 写正则前必须列出边界场景清单：(1) 目标内容中是否包含与定界符相同的字符？(2) 是否存在多个匹配实例？(3) 是否存在不完整的匹配？然后选择策略：有明确结束标签时，使用 `懒惰量词 + 结束标签` 作为精确边界
- **标签**: #regex #boundary-condition

### R-2026-05-22: difficultyMap 类型不匹配（问题14）

- **错误类型**: type_mismatch
- **严重程度**: critical
- **描述**: `difficultyMap = { easy: 1, medium: 2, hard: 3 }` 将字符串映射为数字，但数据库 `difficulty` 字段存储字符串 `"easy"/"medium"/"hard"`，导致匹配永远失败
- **根因**: 凭"记忆"假设数据库字段类型，没有先执行 `SELECT difficulty FROM tasks LIMIT 1` 验证实际存储格式
- **改进策略**: 涉及数据库读写的功能，写代码前必须先查一次实际数据和表结构，用事实替代假设
- **标签**: #type-mismatch #database #assumption

### R-2026-05-22: super_admin 权限检查遗漏（问题7）

- **错误类型**: permission_gap
- **严重程度**: critical
- **描述**: 任务创建 API 的权限检查只认 `userRole === 'admin'`，不包含 `super_admin`，导致超级管理员完全无法创建任务
- **根因**: 写权限检查时只考虑了常见的 admin 角色，没有检查系统中所有可能的用户角色
- **改进策略**: 写权限检查时，先查询 `SELECT DISTINCT role FROM users` 获取所有实际角色，确保每个角色都有明确的权限定义
- **标签**: #permission #role-check

### R-2026-05-22: SSE 流式输出命令标签泄漏到前端（问题19）

- **错误类型**: stream_leak
- **严重程度**: medium
- **描述**: LLM 输出的 `[配置任务资源]{...}[/配置任务资源]` 命令标签通过 SSE 流实时传输到前端，用户看到原始标签和 JSON。经历3轮修复：(1) 只清理完整标签 (2) 增加不完整标签（无 `]`）清理 (3) 增加 JSON 片段清理
- **根因**: SSE 流式输出的特殊性——内容逐字到达，前端可能在任何中间态渲染。清理逻辑假设标签总是完整的，但实际流式中间态是 `[配置任务资源`（没有 `]`）
- **改进策略**: 处理流式输出的清理逻辑时，必须测试每种中间态：只有开标签、开标签+部分JSON、开标签+完整JSON但无闭标签、完整命令。每种情况都要有对应的清理规则
- **标签**: #streaming #sse #frontend-cleanup

### R-2026-05-22: 实体工具库存超卖（问题16）

- **错误类型**: logic_bug
- **严重程度**: critical
- **描述**: `if (!taskTool.is_required && isPhysical)` 条件导致必选工具（`is_required=true`）跳过库存检查，7个小队选了 stock=6 的相机，remaining=-1
- **根因**: 库存检查的条件中混入了业务无关的 `is_required` 判断——库存是否充足与工具是否必选无关
- **改进策略**: 库存/资源限制检查应独立于业务属性。检查"是否有库存"和"是否是必选工具"是两个独立的关注点，不应耦合
- **标签**: #inventory #business-logic #separation-of-concerns

### R-2026-05-22: 变量遮蔽导致 used 字段始终为0（问题17）

- **错误类型**: variable_shadowing
- **严重程度**: medium
- **描述**: 外层 `let used = 0`，内层又声明 `let used = 0`（变量遮蔽），内层赋值修改的是内层变量，外层 `used` 始终为0
- **根因**: 内层作用域重复声明了同名变量，IDE 和 linter 未提示
- **改进策略**: 避免在嵌套作用域中使用同名变量；配置 ESLint `no-shadow` 规则；code review 时重点检查变量声明
- **标签**: #variable-shadowing #eslint

---

## 五、蜡象助手开发经验总结（问题5-19）

> 从7轮19个问题中提炼的持久化开发规范，供后续会话参考

### 5.1 数据库优先验证原则

**规则**：涉及数据库读写的功能，写代码前必须先查一次实际数据

```bash
# 必做检查项
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'xxx';
SELECT DISTINCT difficulty FROM tasks LIMIT 5;
SELECT DISTINCT role FROM users;
```

**反面教训**：difficultyMap 类型不匹配（14）、super_admin 权限遗漏（7）、rewards 表缺少 is_active 列（15）

### 5.2 正则表达式设计规范

**规则**：写正则前列出边界场景，选择策略后再编码

| 场景 | 策略 |
|------|------|
| 目标含嵌套结构 | 懒惰量词 + 明确结束标签 |
| 可能多实例 | 结束标签做精确边界，避免贪婪跨实例 |
| 流式中间态 | 前端清理需覆盖：只有开标签、部分JSON、无闭标签 |

**反面教训**：懒惰截断（11）、贪婪合并（12）、标签泄漏（19）

### 5.3 LLM 结构化输出设计规范

**规则**：
1. 命令粒度与数据一致性需求匹配（任务组是原子单位）
2. 后端必须校验关键约束（不信任提示词约束）
3. JSON 结构尽量扁平，减少嵌套层级
4. `repairJson` 作为弹性兜底，不作为主要解析手段

**反面教训**：单任务破坏任务组（8）、LLM 只输出1变体（13）

### 5.4 流式输出清理规范

**规则**：前端清理函数需覆盖5种状态

1. 完整命令块 `[命令]{...}[/命令]`
2. 不完整命令块 `[命令]{ "key": "value",`（JSON 未闭合）
3. 只有开标签 `[命令` 或 `[命令]`（无 JSON）
4. 只有闭标签 `[/命令]`
5. 残留 JSON 片段（以 `{` 开头的行）

### 5.5 安全封装函数规范

**规则**：
1. 封装函数内部调用底层方法，不是递归调用自身
2. 写完后在旁边注释底层调用目标
3. 做一次最小验证（至少 `console.log` 确认底层被调用）

### 5.6 库存/资源检查独立性原则

**规则**：资源限制检查应独立于业务属性。库存是否充足 ≠ 工具是否必选，两个关注点不应耦合。

### R-2026-05-19: 银蛇博士人设被意外修改

- **错误类型**: scope_creep
- **严重程度**: high
- **描述**: 优化银蛇博士输出维度时，将核心人设从"乡村守护神"改为"大山里最酷的科学探险家"，改变了角色本质
- **根因**: 只关注提升ABTI维度分数，忽视了用户"人设不变"的隐性约束；没有区分"技能优化"和"人设变更"的边界
- **改进策略**: 任何优化前先明确标注"不可变更区"；技能提升只添加新模块，不修改已有核心描述
- **已验证**: 用户纠正后已恢复，后续蜡象助手优化未再犯

### R-2026-05-19: requirements/learning_goals 创建时为空（跨多轮未解决）

- **错误类型**: persistent_bug
- **严重程度**: critical
- **描述**: 通过浏览器创建任务组时，requirements和learning_goals始终为空数组，后端日志确认前端发送空数组
- **根因**: useRef模式未解决；前端表单数据在提交时丢失，可能原因：(1)React状态更新异步导致读取旧值 (2)表单重渲染导致ref被重置 (3)数组类型字段序列化问题
- **改进策略**: 使用受控组件+useState替代useRef；提交时直接从表单DOM读取值而非从state；添加前端调试日志
- **状态**: 已解决（2026-06-18）— 当前代码采用 `taskFormRef.current = taskForm` 每次渲染同步模式，配合 `setTaskForm(prev => ({ ...prev, [field]: [...] }))` 函数式更新，确保提交时读取最新值。前端 `handleSaveTask` 通过 `taskFormRef.current` 读取表单快照，后端 `POST /api/tasks` 正确映射 `requirements`/`learningGoals` 字段。类型检查与 lint 均通过。

### R-2026-05-19: react-remove-scroll-bar pnpm依赖隔离

- **错误类型**: dependency_issue
- **严重程度**: medium
- **描述**: pnpm安装react-remove-scroll-bar后仍然报Module not found
- **根因**: pnpm的依赖隔离机制——每个包只能看到自己声明的依赖，react-remove-scroll在.pnpm隔离目录中找不到react-remove-scroll-bar
- **改进策略**: 在.npmrc中添加public-hoist-pattern提升共享依赖；遇到pnpm模块找不到时优先检查依赖隔离
- **已验证**: 添加hoist pattern后问题解决

### R-2026-05-19: Dialog显示不全

- **错误类型**: ui_bug
- **严重程度**: medium
- **描述**: 添加任务组对话框只显示到"简单版本"输入区域，后续内容不可见
- **根因**: Dialog卡片使用min-h-screen（最小高度=屏幕高度），导致内容拉伸而非滚动
- **改进策略**: 对话框/模态框内容区用max-h-screen+overflow-y-auto，不用min-h-screen
- **已验证**: 改为max-h-screen后可正常滚动

### R-2026-05-19: 自省技能Hook仅限OpenClaw

- **错误类型**: design_limitation
- **严重程度**: low
- **描述**: 原始self-improving技能的Hook机制仅限OpenClaw框架，其他Agent无法享受自动回顾
- **改进策略**: 替换为对话内自省引擎，基于对话历史触发，不依赖外部框架
- **已验证**: 已实现reflection-engine.ts，所有Agent通用

### 3.4 后端开发注意事项

1. **任务组共享字段变更必须同步**：requirements、learning_goals 的变更在 PUT API 中自动同步到同组任务
2. **新建任务加入已有组时继承共享字段**：POST API 自动从组内现有任务复制 requirements、learning_goals
3. **工具/技能 API 幂等**：重复添加返回 `{ success: true, alreadyExists: true }`
4. **一致性校验 API**：新增字段时同步更新校验逻辑

### 3.5 模型分层定义

```
任务组 (Task Group) - 由 task_group_id 标识
├── 组名 (group_name)          ← 所有成员共享
├── 任务要求 (requirements)     ← 所有成员共享
├── 学习目标 (learning_goals)   ← 所有成员共享
├── 工具 (tools)               ← 所有成员共享
├── 技能 (skills)              ← 所有成员共享
└── 任务变体 (variants)        ← 按难度区分
    ├── 简单任务
    │   ├── 标题               ← 独立
    │   ├── 描述               ← 独立
    │   ├── 积分 (points)       ← 独立（默认6）
    │   └── 激励 (rewards)      ← 独立
    ├── 中等任务
    │   └── ...（默认10积分）
    └── 困难任务
        └── ...（默认18积分）
```

---

## 四、数据一致性校验 API 文档

### GET /api/admin/data-consistency

校验所有任务组的数据一致性。

**返回示例**：
```json
{
  "checks": {
    "requirementsConsistency": { "issues": 0, "details": [] },
    "learningGoalsConsistency": { "issues": 0, "details": [] },
    "toolsConsistency": { "issues": 1, "details": [...] },
    "skillsConsistency": { "issues": 0, "details": [] }
  },
  "totalIssues": 1,
  "status": "warning"
}
```

### POST /api/admin/data-consistency

自动修复所有不一致项。

**修复逻辑**：
- requirements/learning_goals：取组内非空且最长的值，同步到所有成员
- tools/skills：取组内拥有最多工具/技能的任务作为基准，将缺失的工具/技能添加到其他任务

**返回示例**：
```json
{
  "fixes": {
    "requirementsSynced": 2,
    "learningGoalsSynced": 1,
    "toolsSynced": 3,
    "skillsSynced": 2
  },
  "message": "修复完成"
}
```

---

## 蜡象助手上下文意图理解修复（2026-05-26）

### [2026-05-26] 逻辑错误 - 焦点提取优先级架构缺陷

- **现象**: 用户说"为村庄闲置空地主题设计任务组"后，再说"设计第一阶段的任务组"→助手却设计了一棵树主题的任务组。用户说"添加到这个主题"→助手反问"请明确需要添加的具体主题"
- **根因**: `extractConversationFocus`函数的焦点提取优先级存在三层架构缺陷：
  1. **助手层优先级过高**：第一遍从助手消息提取焦点时，助手之前错误回复中提及的主题（如"一棵树"）会被当作可靠来源
  2. **用户层覆盖逻辑bug**：`allUserTexts.push(currentMessage)`后，`lastUserMessage = allUserTexts[length-1]`实际是当前消息而非上一条用户消息，导致2a和2c做的是同样的事
  3. **P32正则过窄**：`detectPendingConfirmation`的正则`.{0,4}`无法匹配"请明确需要添加学习成果的具体主题"这类长间距文本，关键词只匹配"系统中有|可选|如下"但不匹配"可用|平台|列表"
- **改进**:
  1. 重构焦点提取优先级：当前用户消息 > 上一条历史用户消息 > 最近助手消息 > 扩展历史扫描
  2. 修复`lastUserMessage`取值：应从sessionHistory（不含currentMessage）中取最后一条用户消息
  3. 助手消息迭代改为reverse()+break on first match（最新优先）
  4. P32正则间距从`.{0,4}`改为`.{0,20}`，关键词增加"可用|平台|列表"
  5. 用户消息层能覆盖助手层的错误焦点——这是防止错误传播的关键防线
- **标签**: #logic-bug #focus-extraction #error-propagation #regex

### [2026-05-26] 语法错误 - 函数括号不匹配导致提前闭合

- **现象**: `extractConversationFocus`函数在第2548行提前闭合（应在2658行），后续代码变成函数外代码
- **根因**: 编辑时多了一个`} // end for`行，导致for循环闭合括号重复，depth提前降到0
- **改进**: 编辑后必须检查括号匹配，可以用`npx tsc --noEmit`验证
- **标签**: #build-error #bracket-mismatch

---

## 六、代码质量维护（2026-06-18）

### [2026-06-18] 代码质量修复 - lint 错误与文档语法

- **现象**: `src/app/admin/tasks/[id]/page.tsx` 存在 4 个 lint 错误；`DEVELOPMENT-REVIEW.md` 末尾有残留的 `}` 和 ``` 导致 Markdown 语法破损
- **根因**:
  1. `(updatedVariants[0] as any)?.group_description` 使用了 `any` 断言，但 `Task` 接口已定义 `group_description` 字段，断言多余
  2. `let data: any = {}` 在解析响应时使用了 `any` 类型
  3. JSX 文本中 `"一键配置"` 双引号未转义
  4. 文档编辑时残留了代码块结束符
- **改进**:
  1. 移除多余的 `as any` 断言，直接使用 `updatedVariants[0]?.group_description`
  2. 将 `any` 替换为 `{ success?: boolean; error?: string; [key: string]: unknown }`
  3. 将 `"` 替换为 `&ldquo;`/`&rdquo;` HTML 实体
  4. 清理文档末尾残留字符
- **验证**: `npx tsc --noEmit` 通过；`npx eslint` 错误数从 4 降为 0（剩余 23 个均为 unused variable 警告）
- **标签**: #lint #type-safety #documentation

### [2026-06-18] 标记历史问题为已解决 - requirements/learning_goals 表单数据丢失

- **现象**: R-2026-05-19 记录的"requirements/learning_goals 创建时为空"问题在后续会话中已通过 `taskFormRef` 模式修复，但文档中仍标记为"未解决"
- **根因**: 修复后未同步更新 `DEVELOPMENT-REVIEW.md` 中的状态字段
- **改进**: 将 R-2026-05-19 的状态从"未解决"更新为"已解决（2026-06-18）"，并补充修复说明
- **标签**: #documentation #status-sync
