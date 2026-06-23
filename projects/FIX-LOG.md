# 项目修复日志

**开始时间**: 2026-06-21
**扫描范围**: 安全漏洞 + 数据互通 + 逻辑错误 + 架构合理性
**问题总数**: 57+

---

## P0 安全类修复（立即修复）

### P0-1: 硬编码 API Key
- **状态**: 待修复
- **文件**: src/lib/skills/inkwell-reader/engine.ts:11
- **问题**: 银蛇博士 API Key 明文硬编码
- **修复**: 改用环境变量
- **完成时间**: -

### P0-2: init-users 接口无鉴权
- **状态**: 待修复
- **文件**: src/app/api/init-users/route.ts
- **问题**: GET/POST 无鉴权或可绕过，可自动创建默认账号
- **修复**: 添加鉴权，移除自动创建逻辑
- **完成时间**: -

### P0-3: restore-data 接口泄露数据
- **状态**: 待修复
- **文件**: src/app/api/restore-data/route.ts:154-192
- **问题**: GET 无鉴权返回所有用户和小队数据
- **修复**: 添加 requireAdmin 鉴权
- **完成时间**: -

### P0-4: 家长密码明文存储
- **状态**: 待修复
- **文件**: src/app/api/auth/parent-login/route.ts:162,224,76-77
- **问题**: 注册/重新提交未 hashPassword，登录支持明文比对
- **修复**: 统一使用 hashPassword，移除明文比对
- **完成时间**: -

### P0-5: SSRF 漏洞
- **状态**: 待修复
- **文件**: src/app/api/fetch-url/route.ts:12-26
- **问题**: 未校验 URL，可探测内网
- **修复**: 添加协议白名单和内网 IP 过滤
- **完成时间**: -

### P0-6: AI 助手横向越权
- **状态**: 待修复
- **文件**: src/app/api/ai/assistant/route.ts:34-53
- **问题**: 未校验 teamId 归属
- **修复**: 添加 teamId 归属校验
- **完成时间**: -

### P0-7: 点赞积分盗刷
- **状态**: 待修复
- **文件**: src/app/api/submissions/[id]/like/route.ts:134,140
- **问题**: 未校验 fromTeamId 归属
- **修复**: 强制 fromTeamId === auth.payload.userId
- **完成时间**: -

### P0-8: 审核回滚缺失
- **状态**: 待修复
- **文件**: src/app/api/submissions/[id]/review/route.ts:142-193
- **问题**: 积分更新失败时提交状态已改，无回滚
- **修复**: 调整顺序或添加回滚逻辑
- **完成时间**: -

### P0-9: 语音消息未传 sessionId
- **状态**: 待修复
- **文件**: src/components/ai-assistant/ai-assistant.tsx:142-148
- **问题**: 语音路径未传 sessionId，上下文隔离
- **修复**: 补充 sessionId 字段
- **完成时间**: -

### P0-10: 会话 ID 永久固定
- **状态**: 待修复
- **文件**: src/components/ai-assistant/lib/use-session.ts:21
- **问题**: sessionId 不带时间戳，无新对话入口
- **修复**: 首次生成带时间戳，UI 添加新对话按钮
- **完成时间**: -

---

## P1 高优先级修复（待进行）

### 安全类
- AI 接口速率限制（8个接口）
- 文件上传路径遍历
- 诊断接口返回 password 字段
- 默认弱密码 123456

### 逻辑类
- 积分转账爱心碎片无乐观锁
- 借款回滚未带乐观锁
- 流式响应硬编码 localhost
- 部分归还无剩余债务持久化
- 逾期还款多笔只还首笔
- 黑板点赞无积分奖励
- 管理端任务状态判断缺失"已完成"

### 数据类
- Drizzle schema 与数据库不同步
- localStorage 'team' key 管理混乱
- dashboard Promise.all 容错

---

## P2 架构清理（待进行）

- 删除 5 个死代码文件（~8000行）
- 提取助手共享层消除 2000 行重复
- 消除 API 路由内部 fetch 反模式
- 统三套助手 API 职责
- 统一记忆系统
- team-data.ts 查询并行化

---

## 修复记录

### 2026-06-21 P0 安全类修复（全部完成，46/46 测试通过）

#### P0-1: 硬编码 API Key ✅
- **文件**: src/lib/skills/inkwell-reader/engine.ts:11
- **修复**: `apiKey: 'agent-world-dbb6ab75...'` → `apiKey: process.env.AGENT_DR_SILVER_SNAKE_API_KEY || ''`
- **注意**: 需要在 Coze 平台轮换旧密钥，并在 .env.local 中配置新密钥

#### P0-2: init-users 接口无鉴权 ✅
- **文件**: src/app/api/init-users/route.ts
- **修复**: GET/POST 均强制 requireAdmin 鉴权，移除"用户表为空时自动创建默认账号"逻辑

#### P0-3: restore-data 接口泄露数据 ✅
- **文件**: src/app/api/restore-data/route.ts:154
- **修复**: GET 添加 requireAdmin 鉴权

#### P0-4: 家长密码明文存储 ✅
- **文件**: src/app/api/auth/parent-login/route.ts
- **修复**:
  - 移除登录时的明文比对分支 `password === parent.password`
  - 注册时 `password` → `hashPassword(password)`
  - 重新提交时 `password` → `hashPassword(password)`

#### P0-5: SSRF 漏洞 ✅
- **文件**: src/app/api/fetch-url/route.ts
- **修复**: 添加 URL 格式校验、协议白名单（仅 http/https）、内网 IP 过滤（127.x/10.x/172.16-31.x/192.168.x/169.254.x/::1/fc00::/fe80::/0.x/localhost）

#### P0-6: AI 助手横向越权 ✅
- **文件**: src/app/api/ai/assistant/route.ts
- **修复**: 添加 teamId 归属校验
  - team 身份：强制 teamId === auth.payload.userId
  - volunteer 身份：查询 teams.assigned_volunteer_id 校验
  - parent 身份：查询 parent_team_follows 校验关注关系

#### P0-7: 点赞积分盗刷 ✅
- **文件**: src/app/api/submissions/[id]/like/route.ts
- **修复**: 校验 fromTeamId 归属
  - team 身份：强制 fromTeamId === auth.payload.userId
  - 其他角色允许代为操作但记录日志

#### P0-8: 审核回滚缺失 ✅
- **文件**: src/app/api/submissions/[id]/review/route.ts
- **修复**: 积分更新失败时回滚提交状态为 pending，清除 rating/review_comment/reviewer_id/reviewed_at

#### P0-9: 语音消息未传 sessionId ✅
- **文件**: src/components/ai-assistant/ai-assistant.tsx:142-148
- **修复**: 语音路径请求体补充 `sessionId` 字段

#### P0-10: 会话 ID 永久固定 ✅
- **文件**: src/components/ai-assistant/lib/use-session.ts:21
- **修复**: 首次生成从 `yinhe_team_${teamId}` 改为 `yinhe_team_${teamId}_${Date.now()}`

#### 测试调整
- **文件**: src/app/api/ai/assistant/route.test.ts
- **调整**: 5 个测试用例的 token userId 从 'team-001' 改为 't1'，与 teamId 一致（真实环境中 team 登录后 token userId 就是 team 的 id）

---

### 2026-06-21 P1 高优先级修复（完成，46/46 测试通过）

#### 安全类

##### 文件上传路径遍历 ✅
- **文件**: src/app/api/upload/submission/route.ts, src/app/api/upload/route.ts
- **修复**: file.name 清理特殊字符 `[\\/:*?"<>|]` 和 `..`，防止路径遍历

##### 诊断接口返回 password 字段 ✅
- **文件**: src/app/api/diagnostics/db/route.ts
- **修复**: users 和 teams 查询的 select 中移除 password 字段

#### 逻辑类

##### 流式响应硬编码 localhost ✅
- **文件**: src/app/api/ai/assistant/lib/stream-handler.ts
- **修复**: baseUrl 优先使用 NEXT_PUBLIC_BASE_URL / VERCEL_URL 环境变量，兼容生产环境部署

##### 积分转账爱心碎片无乐观锁 ✅
- **文件**: src/app/api/team/transfer/route.ts
- **修复**: 乐观锁条件增加 `.eq('heart_shards', fromTeam.heart_shards || 0)`

#### 数据类

##### dashboard Promise.all 容错 ✅
- **文件**: src/app/team/dashboard/page.tsx
- **修复**: 封装 fetchSafe 函数，catch 网络错误返回 503 Response，避免整体中断

---

### 2026-06-21 P2 架构清理（用户选择保留文件）

原计划删除 5 个死代码文件（~8000行），用户选择保留，跳过删除。

---

## 待办事项（未修复）

### P1 剩余逻辑问题
- 借款回滚未带乐观锁（borrow/route.ts, repay/route.ts, overdue/route.ts）
- 部分归还无剩余债务持久化（repay/route.ts）
- 逾期还款多笔只还首笔（overdue/route.ts）
- 黑板点赞无积分奖励（blackboard/[id]/like/route.ts）
- 管理端任务状态判断缺失"已完成"（admin/tasks/page.tsx）

### P1 剩余数据问题
- Drizzle schema 与数据库不同步（teams 缺 7 字段、team_theme_selections 未定义）
- localStorage 'team' key 管理混乱（20+ 处直接修改）
- 前后端字段命名风格混乱（蛇形/驼峰混用）

### P2 架构问题
- admin-assistant.tsx 和 parent-assistant.tsx 重复 ~2000 行逻辑
- API 路由内部 fetch('localhost:5000') 反模式
- 三套并行助手 API 职责重叠
- 两套记忆系统实现
- team-data.ts 12+ 次顺序 DB 查询可并行化

### 安全类剩余问题
- AI 接口速率限制（8个接口）
- 默认弱密码 123456
- CSP 允许 unsafe-inline/unsafe-eval
- 速率限制 fail-open
- TOKEN_SECRET 默认值不安全
- localStorage 存储敏感数据
- CSRF 防护不完整
