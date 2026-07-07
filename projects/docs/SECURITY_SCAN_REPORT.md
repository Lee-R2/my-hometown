# 项目安全漏洞扫描报告

**扫描日期**：2026-07-07
**扫描范围**：`c:\Users\李文渊\Desktop\our home\projects` 全项目
**扫描方法**：4 个并行子任务覆盖 API 鉴权、业务逻辑、智能体系统、前端与数据库

---

## 执行摘要

本次扫描共发现 **85 个安全漏洞**（去重后），按严重程度分布：

| 严重程度 | 数量 | 占比 |
|---------|------|------|
| 🔴 Critical | 24 | 28% |
| 🟠 High | 30 | 35% |
| 🟡 Medium | 25 | 29% |
| 🟢 Low | 6 | 7% |
| **总计** | **85** | 100% |

**核心风险**：项目存在 24 个 Critical 漏洞，其中最严重的 5 类风险可导致：
1. **积分盗取**（借款 IDOR、市集超卖、审核重复加分）
2. **数据泄露**（家长 IDOR、service_role key 硬编码、无 RLS）
3. **权限提升**（普通 admin 可降级 super_admin、命令执行器无角色分层）
4. **明文密码存储**（小队改密、家长重新注册）
5. **AI 系统污染**（跨智能体通信伪造、记忆注入、Prompt 注入）

---

## P0 — 立即修复（24 小时内，9 项）

### 1. service_role key 硬编码在 20+ 脚本文件中 [VULN-DB-002]

- **严重程度**：🔴 Critical
- **文件**：`check-borrow.js`、`scripts/migrate-sql.mjs` 等 20 个文件
- **风险**：真实有效的 Supabase service_role JWT（2036 年过期）硬编码且未加入 .gitignore，泄露后可绕过所有应用层鉴权直接读写任意表
- **修复**：
  1. **立即在 Supabase Dashboard 轮换 service_role key**
  2. 删除所有硬编码，改用 `process.env.COZE_SUPABASE_SERVICE_ROLE_KEY`
  3. 用 `git filter-repo` 清理 Git 历史中的 key

### 2. 小队改密接口存储明文密码 [VULN-DB-003 / VULN-API-005]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/auth/team-change-password/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/team-change-password/route.ts#L36) L36, L47
- **风险**：旧密码用 `!==` 明文比对（永远 false，功能不可用），新密码直接明文入库
- **修复**：L36 改 `verifyPassword(oldPassword, team.password)`，L47 改 `password: hashPassword(newPassword)`

### 3. 家长重新注册接口存储明文密码 [VULN-DB-004 / VULN-BIZ-008]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/auth/parent-login/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/parent-login/route.ts#L162) L162
- **风险**：被拒绝家长重新提交时密码明文存储，而新注册正确使用 hashPassword
- **修复**：L162 改 `password: hashPassword(password)`

### 4. parent/teams 写接口完全无鉴权 [VULN-API-002]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/parent/teams/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/parent/teams/route.ts) POST/PUT/DELETE/PATCH
- **风险**：匿名攻击者可为任意家长创建关注、删除关注、切换小队
- **修复**：四个方法开头加 `requireParent(request)` 鉴权

### 5. parent/team-detail IDOR — 家长可查看任意小队全部数据 [VULN-API-003 / VULN-BIZ-005]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/parent/team-detail/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/parent/team-detail/route.ts#L15) L15
- **风险**：家长登录后枚举 teamId 即可查看全校所有小队的成员、产出、积分流水、借款记录
- **修复**：查询 `parent_team_follows` 表验证关注关系

### 6. teams/[id] PUT — 家长可改任意小队密码和积分 [VULN-API-004]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/teams/[id]/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/teams/[id]/route.ts#L201) L201-250
- **风险**：所有权检查只限制 team 角色，parent/volunteer 等角色可修改任意小队的 password/points/cycle
- **修复**：非 team 角色改用 `requireAdminOrVolunteer`，并按学校范围校验

### 7. 借款审批 IDOR — 任意小队可批准借款并盗取积分 [VULN-BIZ-001]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/team/borrow/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/team/borrow/route.ts#L183) PUT L183-389
- **风险**：未校验 `lender_id === auth.payload.userId`，攻击者可伪造借款并自动批准，转移受害者积分
- **修复**：PUT 方法 L205 后增加 `if (borrowRecord.lender_id !== auth.payload!.userId) return ApiErrors.forbidden()`

### 8. 跨智能体通信 GET 无认证 + POST 可伪造发送者 [VULN-AI-001 / VULN-AI-004]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/ai/agent-communication/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/agent-communication/route.ts) L67-118, L12-64
- **风险**：GET 完全无认证可拉取全部小队反馈；POST 任何 admin 可伪造 sender 为 yinhe_boshi 污染知识库
- **修复**：GET 加 `requireAdmin`；POST 服务端根据 auth.payload 推断真实 sender

### 9. data-analysis 信任客户端伪造的 dataScope [VULN-AI-002]

- **严重程度**：🔴 Critical
- **文件**：[src/app/api/ai/data-analysis/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/data-analysis/route.ts#L61) L61-75
- **风险**：teacher 可传 `dataScope: { userRole: 'super_admin' }` 生成无 WHERE 限制的全局 SQL
- **修复**：服务端以 `auth.payload` 为准重新计算 dataScope

---

## P1 — 本周修复（7 天内，18 项）

### 鉴权与权限类（8 项）

| ID | 漏洞 | 文件 | 修复要点 |
|---|---|---|---|
| VULN-API-001 | Token 登出后永不失效 | `lib/api-auth.ts` L32-77 | 新增 `/api/auth/logout` 路由，`authenticateRequest` 追加 DB is_active 检查 |
| VULN-API-006 | password POST 接受 body 中的 userId | `api/password/route.ts` L23 | 强制用 `auth.payload.userId` |
| VULN-API-007 | teams/[id]/members 对非 team 角色无校验 | `api/teams/[id]/members/route.ts` | 改用 `requireAdminOrVolunteer` |
| VULN-API-008 | teams/[id] GET 任意用户可读任意小队 | `api/teams/[id]/route.ts` L7-199 | team 限自身、parent 限已关注、admin 按学校 |
| VULN-API-009 | migrate 路由 GET 无鉴权 | `api/migrate/*/route.ts` 4 个文件 | 所有 GET 加 `requireAdmin` |
| VULN-API-011 | 无 super_admin / admin 区分 | `lib/api-auth.ts` L79-95 | 新增 `requireSuperAdmin` |
| VULN-API-012 | volunteers/[id] PUT/DELETE 无学校范围校验 | `api/volunteers/[id]/route.ts` | teacher 追加 school_id 校验 |
| VULN-API-013 | ai/chat 从 body 接受 userId 可冒充 | `api/ai/chat/route.ts` L52 | 强制用 `auth.payload` |

### 业务逻辑类（6 项）

| ID | 漏洞 | 文件 | 修复要点 |
|---|---|---|---|
| VULN-BIZ-002 | final-task-feedback IDOR | `api/team/final-task-feedback/route.ts` L325 | 校验 `teamId === auth.payload.userId` |
| VULN-BIZ-003 | themes/select IDOR | `api/themes/select/route.ts` L15 | 校验 `teamId === auth.payload.userId` |
| VULN-BIZ-004 | 审核无状态守卫，重复审核重复加分 | `api/submissions/[id]/review/route.ts` L142 | 校验 `submission.status === 'pending'` |
| VULN-BIZ-007 | 普通 admin 可修改 super_admin 权限 | `api/permissions/route.ts` L116 | 修改 super_admin 配置需 `requireSuperAdmin` |
| VULN-BIZ-009 | 市集挂单超卖（无乐观锁） | `lib/market-trade.ts` L199-217 | update 加 `.eq('available_quantity', listing.available_quantity)` |
| VULN-BIZ-010 | work 交易无限复制 | `lib/market-trade.ts` L166-189 | 交易后标记卖方原 submission 为 sold |

### 智能体类（4 项）

| ID | 漏洞 | 文件 | 修复要点 |
|---|---|---|---|
| VULN-AI-003 | stream-handler 不透传 authHeaders | `api/ai/chat/lib/stream-handler.ts` L62 | 构造 `internalAuthHeaders` 并透传 |
| VULN-AI-007 | 上传路由接受 SVG + isDocument 误放行 | `api/admin/assistant/upload/route.ts` L32 | 移除 SVG，isDocument 改严格数组 |
| VULN-AI-008 | 上传无 magic byte 校验 | `api/admin/assistant/upload/route.ts` L29 | 用 `file-type` 库校验真实类型 |
| VULN-AI-011 | 命令执行器无角色分层 | `api/admin/assistant/lib/command-executor.ts` L189 | 各 case 校验 `context.userRole` |

---

## P2 — 两周修复（16 项）

### 鉴权与权限类（5 项）

| ID | 漏洞 | 修复要点 |
|---|---|---|
| VULN-API-010 | parent/teams GET 接受 body 中的 parentId | 强制 `parentId = auth.payload.userId` |
| VULN-API-014 | 全项目无 CORS 配置 | 新增 `src/middleware.ts` 校验 Origin |
| VULN-API-015 | 内部 fetch 未透传 Authorization | 抽出 `buildInternalAuthHeaders` 工具函数 |
| VULN-API-016 | diagnostics/db 泄露密码哈希 | select 去掉 `password` |
| VULN-API-019 | TOKEN_SECRET 缺失时降级为公开密钥 | 缺失时无条件 throw |

### 业务逻辑类（7 项）

| ID | 漏洞 | 修复要点 |
|---|---|---|
| VULN-BIZ-011 | 积分转账无范围限制 | 校验同志愿者 |
| VULN-BIZ-012 | 点赞竞态条件双花 | likes 表加唯一约束 |
| VULN-BIZ-013 | 爱心碎片更新无乐观锁 | update 加 `.eq('heart_shards', ...)` |
| VULN-BIZ-014 | sibling-teams 互斥竞态 | team_theme_selections 加部分唯一索引 |
| VULN-BIZ-016 | 周期清零非原子化 | 用数据库事务包裹 |
| VULN-BIZ-017 | 市集挂单 TOCTOU | 引入挂单锁定表 |
| VULN-BIZ-018 | 兑换反向转移失败不回滚 | 失败时回滚正向转移 |

### 智能体类（3 项）

| ID | 漏洞 | 修复要点 |
|---|---|---|
| VULN-AI-009 | 记忆内容直接拼入 system prompt | 用 XML 标签包裹后注入 |
| VULN-AI-010 | 对话历史注入 system prompt | 放入 messages 数组而非 system prompt |
| VULN-AI-015 | sessionId 不与用户身份绑定 | getConversations 附加 user_id 过滤 |

### 前端与数据库类（1 项）

| ID | 漏洞 | 修复要点 |
|---|---|---|
| VULN-FE-001 | 客户端鉴权降级到 localStorage | 删除降级逻辑，API 失败一律重定向 |

---

## P3 — 一月修复（剩余 42 项）

包括：CSRF token 未校验、CSP 允许 unsafe-eval、数据库无 RLS、手机号明文、密码哈希用 SHA-256 而非 bcrypt、通知伪造、extractImportantInfo 正则易污染、TTS 无长度限制、ASR SSRF 风险、L1 记忆未清理等。

完整清单详见 [SECURITY_SCAN_REPORT_full.md](./SECURITY_SCAN_REPORT_full.md)（如需展开某项细节告诉我）。

---

## 已做好的安全实践（正面发现）

扫描中确认了 14 项良好实践，可作为后续修复的代码模板参考：

1. ✅ HttpOnly + SameSite=Strict cookie
2. ✅ 登录频率限制（每 IP 15 分钟 5 次）
3. ✅ AI 接口分级限流
4. ✅ 全局仅 1 处 dangerouslySetInnerHTML（且只注入 CSS 主题色）
5. ✅ AI 返回 Markdown 用 stripMarkdownSymbols 转纯文本
6. ✅ React JSX 自动转义所有用户内容
7. ✅ X-Frame-Options: DENY + frame-ancestors 'none'
8. ✅ /api/team/transfer 等接口强制 from_team_id 校验
9. ✅ 所有表使用 UUID 主键（防枚举）
10. ✅ 外键完整性配置完整（15+ 处 CASCADE）
11. ✅ team_id/task_id/status/created_at 等高频字段有索引
12. ✅ service_role key 未通过 NEXT_PUBLIC_ 暴露
13. ✅ 生产环境强制 TOKEN_SECRET
14. ✅ verifyPassword 使用 timingSafeEqual 防时序攻击

---

## 漏洞分布统计

### 按模块分布

| 模块 | Critical | High | Medium | Low | 小计 |
|---|---|---|---|---|---|
| API 鉴权与权限 | 6 | 7 | 8 | 2 | 23 |
| 业务逻辑 | 10 | 10 | 7 | 0 | 27 |
| 智能体系统 | 4 | 8 | 7 | 3 | 22 |
| 前端与数据库 | 4 | 5 | 3 | 1 | 13 |
| **合计** | **24** | **30** | **25** | **6** | **85** |

### 按漏洞类型分布

| 类型 | 数量 | 典型漏洞 |
|---|---|---|
| IDOR（越权访问） | 18 | parent/team-detail、borrow、final-task-feedback、themes/select |
| 鉴权缺失 | 12 | parent/teams 写接口、agent-communication GET、migrate GET |
| 明文密码 | 3 | team-change-password、parent-login PUT、password POST |
| 并发竞态 | 8 | 市集超卖、点赞双花、sibling 互斥绕过、周期清零 |
| Prompt 注入 | 5 | 记忆内容注入、对话历史注入、[记忆]命令伪造 |
| 文件上传 | 3 | SVG XSS、无 magic byte、isDocument 误放行 |
| 内部 fetch 未透传 | 6 | stream-handler、sql-executor |
| 信息泄露 | 8 | service_role key 硬编码、diagnostics 泄露哈希、手机号明文 |
| 权限提升 | 4 | admin 降级 super_admin、命令执行器无分层 |
| 其他 | 18 | CSRF 未校验、无 RLS、无 CORS、SHA-256 弱哈希等 |

---

## 建议的修复顺序

### 第一阶段（24 小时）：止血

1. 轮换 Supabase service_role key
2. 修复 3 处明文密码存储
3. 给 parent/teams 写接口加鉴权
4. 给 parent/team-detail 加关注关系校验
5. 给 teams/[id] PUT 加角色校验
6. 给 borrow PUT 加 lender_id 校验
7. 给 agent-communication GET 加鉴权、POST 服务端推断 sender

### 第二阶段（7 天）：堵漏

8. 修复所有 IDOR（themes/select、final-task-feedback、sibling-teams）
9. 审核接口加状态守卫
10. 市集交易加乐观锁
11. 命令执行器加角色分层
12. 上传路由移除 SVG + 加 magic byte

### 第三阶段（14 天）：加固

13. 新增 Next.js middleware 服务端鉴权
14. 删除 localStorage 降级逻辑
15. 新增 requireSuperAdmin
16. 内部 fetch 统一透传 authHeaders
17. 记忆内容用 XML 标签包裹后注入 system prompt
18. 启用数据库 RLS 策略

### 第四阶段（30 天）：常态化

19. CSRF token 校验
20. 密码哈希迁移到 bcrypt
21. 手机号加密存储
22. 补全 MEMORY_RETENTION 类型映射
23. TTS/ASR 加长度和 URL 白名单限制

---

**报告说明**：本次扫描未修改任何代码，所有漏洞均为诊断结论。如需针对某个漏洞提供具体修复 patch，请告知漏洞 ID。
