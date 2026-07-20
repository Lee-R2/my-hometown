# 安全审查报告 — 我们的家园

**审查日期**: 2026-07-15(安全漏洞) / 2026-07-17(逻辑错误扩展扫描)
**审查范围**: `projects/src/**`（Next.js 16 + TypeScript + Supabase）
**审查方法**: 基于 OWASP / Next.js / React 安全规范 + 业务逻辑审计进行静态扫描

---

## 执行摘要

项目已有一套较完善的安全基础设施（bcrypt 密码哈希、CSRF 校验、CORS 白名单、SSRF 防护、安全响应头、速率限制、输入校验、扩展名黑名单等），但存在若干**高危**问题，主要集中在：

1. **默认使用 service_role 客户端绕过 RLS**（最严重）
2. **用户记忆 API GET 接口存在 IDOR**（越权读取他人记忆）
3. **家长登录接口存在账号枚举**
4. **测试接口暴露在生产环境**

第一轮扫描共发现 **12** 个安全问题：Critical 1 / High 4 / Medium 5 / Low 2。

第二轮扩展扫描(2026-07-17)新增发现 **55** 个业务逻辑/代码缺陷:
- 认证授权逻辑错误 22 处(Critical 4 / High 9 / Medium 7 / Low 2)
- 积分交易逻辑错误 20 处(P0 4 / P1 4 / P2 12)
- AI 记忆/对话逻辑错误 16 处(严重 5 / 中等 7 / 低 4)
- 前端状态/数据流错误 15 处(P0 4 / P1 5 / P2 6)

**合计 67 个问题**。

---

## Critical

### SEC-001 · 默认使用 service_role 客户端，RLS 实际失效 ✅ 已修复

- **Severity**: Critical
- **Rule**: NEXT-AUTH-001 / NEXT-SECRETS-002
- **Status**: ✅ 已修复（2026-07-17）—— 三阶段重构完成，默认客户端切换为 anon
- **Location**: [src/storage/database/supabase-client.ts#L119-L134](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/storage/database/supabase-client.ts#L119-L134)
- **Evidence**:
  ```typescript
  function getSupabaseClient(token?: string): SupabaseClient {
    return getSupabaseAdminClient(token);  // ← 默认走 service_role
  }
  ```
  而 `getSupabaseAdminClient` 使用 `COZE_SUPABASE_SERVICE_ROLE_KEY` 创建客户端，service_role **绕过所有 RLS 策略**。
- **Impact**: 所有 API 路由（`/api/auth/*`、`/api/teams/*`、`/api/parent/*`、`/api/ai/memory/*` 等）都调用 `getSupabaseClient()`，意味着数据库上精心设计的 RLS 策略（`is_admin()`、`is_parent()`、`app_user_id()` 等）**全部失效**。一旦某个 API 路由的鉴权检查有疏漏，攻击者即可读写任意数据。
- **Fix**: 区分调用场景：
  - 需要绕过 RLS 的特权操作（如初始化、迁移）才用 `getSupabaseAdminClient()`
  - 普通业务查询应使用 `getSupabaseAnonClient(userToken)`，让 RLS 生效
  - 最低限度：在 `getSupabaseClient()` 内部根据请求上下文自动选择 anon/admin
- **Mitigation**: 确保所有 admin-only 接口都先经过 `requireAdmin()` 严格校验；为普通用户接口增加资源所有权校验。
- **Resolution**: 已按三阶段方案完成修复：
  - **阶段 1**：在 [api-auth.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/api-auth.ts) 新增 `getAuthenticatedClient(request, auth)` 辅助函数，从请求提取 token 返回绑定用户身份的 anon 客户端
  - **阶段 2**：迁移 100+ API 路由文件，分三类处理：
    - **A 类**（管理端/跨用户操作/初始化迁移，~70 文件）：显式改用 `getSupabaseAdminClient()`
    - **B 类**（用户业务接口 team/parent/memory，~25 文件）：改用 `getAuthenticatedClient(request, auth)`，RLS 生效
    - **C 类**（内部库 `agent-memory.ts`）：14 个函数改造为接受可选 `client?` 参数，fallback 改为 admin
  - **阶段 3**：将 `getSupabaseClient()` 默认从 `getSupabaseAdminClient` 改为 `getSupabaseAnonClient`，实现防御性默认——任何新代码不小心调用都会得到受 RLS 保护的安全客户端
  - 验证：全项目 grep 确认无遗漏的 `getSupabaseClient()` 调用（仅剩函数定义本身和测试文件）；tsc --noEmit 通过（除预存 blackboard 错误外无新增错误）

---

## High

### SEC-002 · 用户记忆 API GET 接口存在 IDOR

- **Severity**: High
- **Rule**: NEXT-AUTH-001
- **Location**: [src/app/api/ai/memory/user/route.ts#L10-L45](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/memory/user/route.ts#L10-L45)
- **Evidence**:
  ```typescript
  const userId = searchParams.get('userId');  // 从查询参数取
  // ...直接用 userId 查询，未校验是否为当前登录用户
  const { data, error } = await query.eq('user_id', userId);
  ```
  同文件的 POST/PUT/DELETE 在 [L199](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/memory/user/route.ts#L199) 有校验 `if (userId !== auth.payload!.userId)`，但 GET 没有。
- **Impact**: 任意已登录用户传入他人的 `userId` 即可读取他人的全部 AI 对话记忆（偏好、上下文、反馈、摘要），泄露隐私。
- **Fix**: 在 GET handler 中补充：
  ```typescript
  if (userId !== auth.payload!.userId) {
    return ApiErrors.forbidden('无权查询其他用户的记忆');
  }
  ```

### SEC-003 · 家长登录接口账号枚举

- **Severity**: High（针对家长手机号这种 PII）
- **Rule**: NEXT-INPUT-001 / OWASP Authentication Cheat Sheet
- **Location**: [src/app/api/auth/parent-login/route.ts#L38-L86](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/parent-login/route.ts#L38-L86)
- **Evidence**:
  ```typescript
  if (error || !parent) {
    if (error) return ApiErrors.validation('查询家长账号失败');
    return ApiErrors.unauthorized('账号不存在');          // ← 401 账号不存在
  }
  // ...
  if (!isValidPassword) {
    return NextResponse.json(
      { success: false, error: '密码错误' },            // ← 401 密码错误
      { status: 401 }
    );
  }
  ```
  两条错误消息不同，攻击者可据此枚举哪些手机号已注册。
- **Impact**: 手机号属于 PII，枚举可被用于短信轰炸、钓鱼、撞库。
- **Fix**: 统一返回相同消息，例如：
  ```typescript
  return ApiErrors.unauthorized('手机号或密码错误');
  ```
  在 `parent-login`、`login`、`team-login` 三个接口统一处理。

### SEC-004 · 测试接口暴露在生产环境

- **Severity**: High
- **Rule**: NEXT-DEPLOY-001
- **Location**: [src/app/api/test/user-query/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/test/user-query/route.ts)
- **Evidence**:
  ```typescript
  // 测试1：直接查询所有用户
  const { data: allUsers } = await client
    .from('users')
    .select('id, username, name, role, is_active');
  ```
  虽然有 `requireAdmin` 保护，但：
  1. 接口返回所有用户列表（含用户名、角色），信息泄露面大
  2. `test/` 目录通常不应出现在生产部署中
- **Impact**: 一旦管理员账号被攻破，攻击者可直接拉取全量用户名清单用于后续攻击。
- **Fix**:
  - 方案 A：删除该文件，或移到 `tests/` 目录下
  - 方案 B：通过 `process.env.NODE_ENV !== 'production'` 守卫：
    ```typescript
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    ```

### SEC-005 · 家长注册无速率限制，可批量注册

- **Severity**: High
- **Rule**: NEXT-DOS-001
- **Location**: [src/app/api/auth/parent-login/route.ts#L137-L260](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/parent-login/route.ts#L137-L260)（PUT 注册分支）
- **Evidence**:
  ```typescript
  export async function PUT(request: NextRequest) {
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    // ❌ 缺少 checkRateLimit(ip, 'register') 调用
    try {
      const body = await request.json();
      // ...直接创建账号
  ```
  对比 POST 登录分支 [L18](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/parent-login/route.ts#L18) 有 `checkRateLimit(ip, 'login')`，但 PUT 注册分支没有。
- **Impact**: 攻击者可脚本化批量注册垃圾家长账号，污染数据库；结合 SEC-003 可枚举手机号。
- **Fix**: 在 PUT handler 开头加：
  ```typescript
  const rateLimitResult = await checkRateLimit(ip, 'register');
  if (!rateLimitResult.allowed) {
    return ApiErrors.rateLimited(rateLimitResult.message);
  }
  ```

---

## Medium

### SEC-006 · SQL 执行 RPC 绕过 RLS 且过滤可被绕过

- **Severity**: Medium
- **Rule**: NEXT-INJECT-001
- **Location**:
  - [src/app/api/ai/safe-query/route.ts#L54](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/safe-query/route.ts#L54)
  - [src/lib/skills/smart-data-analyzer/sql-executor.ts#L76](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/skills/smart-data-analyzer/sql-executor.ts#L76)
  - [src/app/api/migrate/security/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/migrate/security/route.ts)（多处 `rpc('execute_sql', { sql: ... })`）
- **Evidence**: `safe-query` 接口接收用户 SQL，经 `validateSqlSafety` 正则过滤后通过 `exec_safe_sql` RPC 执行；迁移接口直接拼接 DDL 字符串调用 `execute_sql`。
- **Impact**:
  1. 正则过滤易被编码/注释绕过（如 `0x43REATE`、嵌套注释）
  2. RPC 使用 service_role 执行，绕过 RLS
  3. `migrate/*` 接口虽 admin-only，但管理员 token 一旦泄露即可执行任意 DDL
- **Fix**:
  - `safe-query` 改用白名单方式：只允许预定义的查询模板 + 参数化
  - `migrate/*` 接口加 `NODE_ENV !== 'production'` 守卫，生产禁用
  - 数据库侧删除 `execute_sql` / `exec_sql` RPC，只保留受控的 `exec_safe_sql`

### SEC-007 · 手机号格式未校验

- **Severity**: Medium
- **Rule**: NEXT-INPUT-001
- **Location**: [src/app/api/auth/parent-login/route.ts#L146-L156](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/parent-login/route.ts#L146-L156)
- **Evidence**:
  ```typescript
  if (!phone) {
    return ApiErrors.validation('请填写手机号');
  }
  // 直接用 phone 查询/写入，无格式校验
  ```
- **Impact**: 可用任意字符串（如 `"; DROP TABLE--`、超长字符串）作为手机号写入数据库；虽然 Supabase 参数化查询防 SQLi，但会污染数据。
- **Fix**:
  ```typescript
  const PHONE_REGEX = /^1[3-9]\d{9}$/;
  if (!phone || !PHONE_REGEX.test(phone)) {
    return ApiErrors.validation('请填写有效的手机号');
  }
  ```

### SEC-008 · 密码修改后未失效已有会话

- **Severity**: Medium
- **Rule**: NEXT-SESS-002
- **Location**:
  - [src/app/api/password/route.ts#L24-L88](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/password/route.ts#L24-L88)
  - [src/app/api/auth/team-change-password/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/team-change-password/route.ts)
- **Evidence**: 密码修改/重置成功后只返回成功消息，未调用 `invalidateAllUserSessions(userId)`。
- **Impact**: 密码泄露后被攻击者登录的会话不会因用户改密而失效，攻击者可继续访问。
- **Fix**: 在密码修改成功后调用：
  ```typescript
  import { invalidateAllUserSessions } from '@/lib/session';
  await invalidateAllUserSessions(userId);
  ```

### SEC-009 · localStorage 存储用户身份信息

- **Severity**: Medium
- **Rule**: REACT-AUTH-001 / JS-STORAGE-001
- **Location**:
  - [src/app/admin/login/page.tsx#L39](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/admin/login/page.tsx#L39): `localStorage.setItem('user', JSON.stringify({...}))`
  - [src/app/team/login/page.tsx#L38](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/login/page.tsx#L38): `localStorage.setItem('team', ...)`
  - [src/app/parent/login/page.tsx#L47](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/parent/login/page.tsx#L47): `localStorage.setItem('parent', ...)`
  - [src/app/team/dashboard/page.tsx](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/dashboard/page.tsx) 等多处读 `localStorage.getItem('team')` 用于鉴权判断
- **Evidence**: 虽然没存 token（认证依赖 HttpOnly Cookie，这点是好的），但存了 `id`/`role` 等字段，后续代码用这些字段做权限判断（如 `user?.role === 'admin'`）。
- **Impact**: XSS 攻击者可篡改 localStorage 中的 role 字段绕过前端权限检查；虽然后端有独立鉴权，但前端 UI 可能据此展示敏感入口。
- **Fix**:
  - 身份信息改为通过 `/api/auth/me` 接口实时获取（已有该接口）
  - 或将 role 等字段放入 JWT payload（HttpOnly Cookie），前端通过 SSR 读取

### SEC-010 · innerHTML 用作 DOM 写入

- **Severity**: Medium（当前为误报，但模式应消除）
- **Rule**: REACT-DOM-001 / JS-XSS-001
- **Location**:
  - [src/components/admin-assistant.tsx#L961](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/admin-assistant.tsx#L961)
  - [src/components/admin-assistant.tsx#L1001](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/admin-assistant.tsx#L1001)
  - [src/components/admin-assistant.tsx#L1063](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/admin-assistant.tsx#L1063)
  - [src/components/parent-assistant.tsx#L562](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/parent-assistant.tsx#L562) 等同文件多处
- **Evidence**:
  ```typescript
  e.currentTarget.parentElement.innerHTML = '<span class="text-3xl">🐘</span>';
  ```
- **Impact**: 当前字符串是硬编码常量，无 XSS 风险。但使用 `innerHTML` 是不良模式，未来若被改为拼接用户输入则会产生存储型 XSS。
- **Fix**: 改用 React 状态控制：
  ```typescript
  const [imageError, setImageError] = useState(false);
  // ...
  {imageError ? <span className="text-3xl">🐘</span> : <img onError={() => setImageError(true)} />}
  ```

---

## Low

### SEC-011 · `dangerouslySetInnerHTML` 用于注入主题 CSS

- **Severity**: Low（当前为误报）
- **Rule**: REACT-XSS-001
- **Location**: [src/components/ui/chart.tsx#L83](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/ui/chart.tsx#L83)
- **Evidence**: `<style dangerouslySetInnerHTML={{ __html: ... }} />` 注入基于 `THEMES` 常量生成的 CSS。
- **Impact**: 内容来源于代码常量，非用户输入，无实际 XSS 风险。
- **Fix**: 无需修改；保持代码注释说明数据来源可信即可。

### SEC-012 · Cookie 缺少 `__Host-` 前缀

- **Severity**: Low
- **Rule**: NEXT-SESS-001
- **Location**: [src/lib/session.ts#L265](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/session.ts#L265)
- **Evidence**:
  ```typescript
  const cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=...`;
  ```
  Cookie 名为 `session`，未使用 `__Host-session` 前缀。
- **Impact**: `__Host-` 前缀可防止子域覆盖 Cookie 的攻击。当前部署在 Vercel 单一域名下风险较低。
- **Fix**: 可选改进：将 cookie 名改为 `__Host-session`，并移除 `Domain` 属性（`__Host-` 要求 Path=/ 且无 Domain）。

---

## 已具备的良好实践 ✓

为完整性记录项目中已正确实施的安全措施：

| 类别 | 措施 | 位置 |
|---|---|---|
| 密码哈希 | bcrypt（cost 10）+ 旧 SHA-256 自动迁移 | `src/lib/security.ts` |
| 令牌签名 | HMAC-SHA256 + `timingSafeEqual` 防时序攻击 | `src/lib/security.ts` |
| TOKEN_SECRET | 缺失时无条件抛错，不降级 | `src/lib/security.ts#L216` |
| CSRF 防护 | Origin/Referer 校验 + 白名单 | `src/proxy.ts` |
| CORS | 生产环境白名单（`ALLOWED_ORIGINS`） | `src/proxy.ts` |
| 安全响应头 | nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy | `next.config.ts` + `src/proxy.ts` |
| CSP | 已配置，`script-src` 不含 `unsafe-eval` | `next.config.ts#L28-L42` |
| SSRF 防护 | `isInternalHost` / `isPrivateIp` 校验内网 IP | `src/lib/security.ts`、`fetch-url/route.ts`、`asr/route.ts` |
| 文件上传 | 扩展名黑名单（exe/bat/php/js/html/svg）+ MIME 校验 + 大小限制 + 文件名清洗 | `src/lib/security.ts`、`upload/route.ts` |
| 速率限制 | 登录、AI 接口、上传均有 | `src/lib/rate-limit.ts` |
| 错误处理 | `safeError` 在生产环境隐藏详情 | `src/lib/api-auth.ts` |
| 手机号脱敏 | `maskPhone` 工具函数 | `src/lib/security.ts` |
| 内部 fetch 鉴权 | `buildInternalAuthHeaders` 透传 Authorization + Cookie | `src/lib/api-auth.ts` |
| Supabase 客户端复用 | 单例 + token 缓存（避免连接开销） | `supabase-client.ts` |

---

## 修复优先级建议

| 优先级 | 编号 | 标题 | 预估工作量 |
|---|---|---|---|
| P0 | SEC-001 | 默认使用 service_role 客户端，RLS 失效 | 大（需重构所有 API 调用） |
| P0 | SEC-002 | 用户记忆 API IDOR | 极小（1 行代码） |
| P1 | SEC-003 | 家长登录账号枚举 | 小（统一错误消息） |
| P1 | SEC-004 | 测试接口暴露 | 小（删除或环境守卫） |
| P1 | SEC-005 | 家长注册无速率限制 | 极小（加 1 行） |
| P2 | SEC-006 | SQL 执行 RPC 风险 | 中（需重构 safe-query） |
| P2 | SEC-007 | 手机号格式未校验 | 极小（加正则） |
| P2 | SEC-008 | 密码修改后未失效会话 | 极小（加 1 行） |
| P2 | SEC-009 | localStorage 存储身份 | 中（需前端改造） |
| P3 | SEC-010 | innerHTML 使用模式 | 小（改 React 状态） |
| P3 | SEC-011 | dangerouslySetInnerHTML（误报） | 无需修改 |
| P3 | SEC-012 | Cookie 缺 `__Host-` 前缀 | 小（可选） |

---

## 建议的下一步

1. **立即修复** SEC-002（1 行代码即可），消除正在发生的越权风险
2. **本周内** 修复 SEC-003 / SEC-004 / SEC-005（都是小改动）
3. **规划** SEC-001 的重构——这是系统性问题，建议分阶段迁移：
   - 阶段 1：在 `api-auth.ts` 中新增 `getAuthenticatedClient(request)` 辅助函数，返回绑定用户 token 的 anon 客户端
   - 阶段 2：逐个迁移 API 路由，先迁移涉及敏感数据的（memory、teams、parent）
   - 阶段 3：迁移完成后，将 `getSupabaseClient()` 默认改为 anon，仅显式调用 `getSupabaseAdminClient()` 才用 service_role
4. 所有修复完成后，建议再次运行安全扫描验证

---

# 第二部分:业务逻辑与代码缺陷(2026-07-17 扩展扫描)

## 一、认证授权逻辑错误(22 处)

### LE-A01 · 【严重】小队改密码接口严重越权 ✅ 已修复
- **位置**: [src/app/api/auth/team-change-password/route.ts:12-29](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/team-change-password/route.ts#L12-L29)
- **问题**: POST handler 中 `teamId` 直接从请求体 `body.teamId` 获取,用于查询 `teams` 表并修改密码,**未校验 `teamId === auth.payload!.userId`**。仅调用 `requireTeam` 确认是任意小队登录,但不校验目标小队是否就是当前登录的小队。
- **影响**: 任意已登录小队可修改任意其他小队的密码,完全接管该小队账号,可窃取积分、爱心碎片、市场挂单等所有资产。
- **修复**: 从 `auth.payload!.userId` 取认证身份作为操作目标;请求体中的 `teamId` 仅作兼容校验,与登录身份不一致时返回 403。

### LE-A02 · 【严重】家长关注小队接口完全无鉴权 ✅ 已修复
- **位置**: [src/app/api/parent/teams/route.ts:95-229](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/parent/teams/route.ts#L95-L229) (POST)、同文件 PUT、DELETE
- **问题**: POST(关注小队)、PUT(修改申请)、DELETE(取消关注)三个 handler **均未调用 `requireParent`**,`parentId` 直接从请求体或查询参数获取。仅 GET 和 PATCH 调用了 `requireParent`。
- **影响**: 未认证攻击者可冒充任意家长批量提交关注申请(污染老师审核队列)、篡改他人申请状态、批量取消他人关注关系。
- **修复**: 三个 handler 开头均加 `const auth = requireParent(request); if (!auth.authenticated) return authError(auth);`,并用 `auth.payload!.userId` 替换请求体中的 `parentId`;DELETE 的 `.eq('id', followId)` 补 `.eq('parent_id', parentId)` 校验归属。

### LE-A03 · 【严重】同步接口完全无鉴权 ✅ 已修复
- **位置**: [src/app/api/sync/route.ts:9-46](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/sync/route.ts#L9-L46)
- **问题**: GET handler **完全未调用任何 `requireXxx`**,直接根据查询参数 `teamId`/`userId` 查询数据库返回是否存在。
- **影响**: 未认证攻击者可枚举任意 `teamId`/`userId` 是否存在,构成用户枚举漏洞。
- **修复**: 开头加 `const auth = requireAnyAuth(request); if (!auth.authenticated) return authError(auth);`,且查询前校验查询参数与认证身份的归属关系。

### LE-A04 · 【严重】登出后 Token 仍可用(核心鉴权缺陷) ✅ 已修复
- **位置**: [src/lib/api-auth.ts:32-77](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/api-auth.ts#L32-L77) `authenticateRequest` 函数
- **问题**: 仅调用 `verifyToken` 验证签名和过期时间,**未调用 `verifySession` 查询 `user_sessions` 表确认会话仍处于 `is_active=true` 状态**。
- **影响**: 用户登出后,`invalidateSession` 仅将数据库 `is_active` 置 false,但 token 本身在过期前仍然有效,攻击者窃取的 token 在登出后仍可继续使用直至自然过期。
- **修复**: 在 `authenticateRequest` 中 `verifyToken` 成功后追加 `const session = await verifySession(token); if (!session) return authError(...)`;性能考虑可加 60 秒内存缓存。

### LE-A05 · 【高】登出 Cookie 名错误导致 Cookie 残留
- **位置**: [src/app/api/auth/logout/route.ts:15](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/logout/route.ts#L15)
- **问题**: `response.cookies.delete('session_token')` 删除的 cookie 名为 `session_token`,但实际 cookie 名应为 `session`(由 `SESSION_COOKIE_NAME` 常量定义)。
- **影响**: 浏览器中真正的 `session` cookie 不会被清除,前端登出后下次请求仍会携带旧 cookie。同时该接口仅从 Authorization header 取 token,未从 cookie 兜底。
- **修复**: 改为 `response.cookies.delete(SESSION_COOKIE_NAME)`;增加从 cookie 兜底取 token 的逻辑。

### LE-A06 · 【高】/api/auth/me 查询不存在的表
- **位置**: [src/app/api/auth/me/route.ts:78-81](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/auth/me/route.ts#L78-L81)
- **问题**: 查询 `parent_follows` 表,但项目实际表名为 `parent_team_follows`(其他路由均使用此名),且**未使用 `requireAnyAuth`**,直接读取 cookie + `verifyToken`,**未调用 `verifySession`**。
- **影响**: 家长登录后 `/api/auth/me` 必然查询失败,前端无法获取家长已关注小队列表,功能不可用。
- **修复**: 表名改为 `parent_team_follows`;改用 `const auth = requireAnyAuth(request); if (!auth.authenticated) return authError(auth);`。

### LE-A07 · 【高】消息标记已读未校验归属 ✅ 已修复
- **位置**: [src/app/api/messages/[id]/read/route.ts:18-22](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/messages/%5Bid%5D/read/route.ts#L18-L22)
- **问题**: PATCH 标记消息已读时,**未验证消息的 `receiver_id` 或 `sender_id` 是否等于当前认证用户 ID**。
- **影响**: 任意已认证用户可标记任意其他用户的消息为已读,干扰消息未读计数。
- **修复**: 标记前先查询消息,校验 `data.receiver_id === auth.payload!.userId || data.sender_id === auth.payload!.userId`。

### LE-A08 · 【高】点赞状态查询完全无鉴权
- **位置**: [src/app/api/submissions/[id]/like/route.ts:391-432](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/submissions/%5Bid%5D/like/route.ts#L391-L432)
- **问题**: GET handler **完全未调用 `requireAnyAuth`**,任意未认证用户可查询任意 `submissionId` 的点赞状态。
- **影响**: 未认证用户可批量爬取所有提交的点赞数据,构建小队社交关系图谱。
- **修复**: 开头加 `const auth = requireAnyAuth(request); if (!auth.authenticated) return authError(auth);`。

### LE-A09 · 【高】智能体会话/对话创建未校验用户归属
- **位置**: 
  - [src/app/api/agents/sessions/route.ts:14-23](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/agents/sessions/route.ts#L14-L23) (POST)
  - [src/app/api/agents/conversations/route.ts:14-15](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/agents/conversations/route.ts#L14-L15) (POST)
- **问题**: POST 接受 `userId`/`teamId`/`userRole` 参数未与认证身份比对,可伪造他人对话。
- **影响**: 任意已认证用户可冒充其他用户与智能体对话,被冒充用户的对话历史被污染,AI 长期记忆中混入他人输入。
- **修复**: 强制 `body.userId === auth.payload!.userId`(super_admin 例外);`userRole` 从 `auth.payload!.role` 取。

### LE-A10 · 【高】上传提交时 teamId 未与认证身份比对
- **位置**: [src/app/api/upload/submission/route.ts:40-44](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/upload/submission/route.ts#L40-L44)
- **问题**: `teamId`/`teamName` 从 `formData` 取,**未与 `auth.payload!.userId` 比对**。
- **影响**: 任意已认证用户可上传文件到任意小队的目录,可能造成存储目录污染、跨小队文件覆盖。
- **修复**: 取 `const authTeamId = auth.payload!.userId;`,若 `formDataTeamId !== authTeamId` 则返回 403。

### LE-A11 · 【高】密码重置无学校范围限制 + 默认弱密码
- **位置**: [src/app/api/password/route.ts:103-126](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/password/route.ts#L103-L126)
- **问题**: `admin`/`super_admin` 角色**无学校范围限制**,可重置任意学校用户密码;第 126 行默认密码硬编码 `'123456'`(弱密码),重置后**未强制要求下次登录修改**。
- **影响**: 普通管理员可跨校重置任意用户密码,使用弱默认密码 `123456` 登录后即可接管该账号。
- **修复**: `admin` 角色增加 `school_id === auth.payload!.schoolId` 校验;默认密码改为随机 8 位字符串;数据库增加 `must_change_password` 字段。

### LE-A12 · 【高】管理员通知标记已读未校验归属 ✅ 已修复
- **位置**: [src/app/api/admin/notifications/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/admin/notifications/route.ts) POST 标记已读分支
- **问题**: POST 标记通知已读时**未验证通知归属**。
- **影响**: 任意已认证用户可标记任意其他用户的通知为已读,干扰受害者通知提醒。
- **修复**: 标记前查询通知,校验 `data.target_id === auth.payload!.userId`。

### LE-A13~A19 · 【中】多处横向越权查询(7 处)
以下接口的 GET handler 均从查询参数取 `userId`/`teamId`/`parentId` 但未与认证身份比对:
- [src/app/api/messages/route.ts:14-15](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/messages/route.ts#L14-L15) GET 消息列表
- [src/app/api/submissions/route.ts:196-237](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/submissions/route.ts#L196-L237) GET 提交记录列表
- [src/app/api/themes/route.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/themes/route.ts) GET 主题列表
- [src/app/api/agents/sessions/route.ts:90-116](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/agents/sessions/route.ts#L90-L116) GET 智能体会话列表
- [src/app/api/parent/search/route.ts:16-17](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/parent/search/route.ts#L16-L17) 家长搜索
- [src/lib/session.ts:84-95](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/session.ts#L84-L95) verifySession 查询缺少 user_id 过滤
- [src/lib/security.ts:256-280](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/security.ts#L256-L280) verifyToken 未检查 token 类型

**影响**: 任意已认证用户可读取他人消息、提交记录、主题进度、会话历史等敏感数据。
**修复**: 强制 `queryTeamId === auth.payload!.userId`(admin/teacher 按学校范围限制)。

### LE-A20~A22 · 【低】3 处
- **LE-A20**: 小队通知 `senderName` 未验证,可伪造发送方名称
- **LE-A21**: [src/lib/permissions.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/permissions.ts) 权限配置仅用于前端 UI 隐藏,后端不基于此配置做模块级校验,存在"前端隐藏但后端开放"风险
- **LE-A22**: 智能体会话 PUT/DELETE 未校验会话归属,管理员可操作任意用户会话

---

## 二、积分交易逻辑错误(20 处)

### LE-P01 · 【P0】部分还款后无法手动归还剩余债务 ✅ 已修复
- **位置**: [src/app/api/team/borrow/repay/route.ts:42-44](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/team/borrow/repay/route.ts#L42-L44) 与 [:159](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/team/borrow/repay/route.ts#L159)
- **问题**: 状态准入校验与最终状态更新都把 `partial_repaid` 排除在外,而 `borrow/overdue/route.ts:165` 自动还款允许该状态。
- **影响**: 当借入方积分不足触发自动部分还款后,状态变为 `partial_repaid`,剩余债务再也无法通过手动归还,只能等下一次逾期自动扣款。用户陷入"债务陷阱"。
- **修复**: 将 `.in('status', ...)` 列表统一为 `['approved', 'overdue', 'partial_repaid']`。

### LE-P02 · 【P0】爱心碎片(heart_shards)并发丢失更新
- **位置**: [src/app/api/submissions/[id]/like/route.ts:100-110](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/submissions/%5Bid%5D/like/route.ts#L100-L110)
- **问题**: `updateHeartGems` 的乐观锁只校验 `heart_gems`,刻意不校验 `heart_shards`(注释说"浮点数不作为锁条件")。两个并发点赞都会读到相同值,各自计算后写入,后写覆盖前写。
- **影响**: 并发点赞/取消点赞时爱心碎片数量错乱,长期累积导致用户应得的爱心宝石合成数与实际不一致,直接损害用户权益。
- **修复**: 用整数计数器替代浮点(例如 `heart_shards_x10`),或增加 `version` 整型列,或改为 PostgreSQL RPC 原子自增。

### LE-P03 · 【P0】取消点赞/创建点赞不校验积分更新结果(可刷积分) ✅ 已修复
- **位置**: [src/app/api/submissions/[id]/like/route.ts:230-277](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/submissions/%5Bid%5D/like/route.ts#L230-L277) 和 [:310-358](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/submissions/%5Bid%5D/like/route.ts#L310-L358)
- **问题**: 先 insert/delete like,再 update 双方积分,但 update 都没有 `.select()` 验证。乐观锁失败时 like 已写入但积分未扣回,等于"白嫖"取消点赞或"白送"点赞。
- **影响**: 用户可通过并发触发点赞/取消,既删除点赞记录又保留点赞获得的积分,形成积分刷取漏洞。
- **修复**: 调整顺序为"先更新积分验证成功→再写 like",任一步乐观锁失败都应回滚已执行的步骤并返回 409;补写 `point_transactions` 审计记录。

### LE-P04 · 【P0】作品出售后 status=sold 更新未校验,可被重复出售 ✅ 已修复
- **位置**: [src/lib/market-trade.ts:213-220](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/market-trade.ts#L213-L220)
- **问题**: 虽然 193-196 行检查了 `submission.status === 'sold'` 并阻止,但 213-220 的 update 本身没有 `.eq('status', 'approved')` 守卫。两个并发请求都读到 `status='approved'`,都通过检查,都执行 insert + update,导致同一作品被卖给两个买方。
- **影响**: 同一作品被多次出售,卖方多次获得积分,买方获得重复副本。
- **修复**: 把"检查 status≠sold"和"标记 sold"合并为单条带乐观锁的 update:
  ```typescript
  .update({ status: 'sold', ... })
  .eq('id', sellerItemRef)
  .eq('status', 'approved')  // 乐观锁
  .select('id');
  ```

### LE-P05 · 【P1】rollbackPoints 无乐观锁,存在 TOCTOU
- **位置**: [src/lib/market-trade.ts:340-349](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/market-trade.ts#L340-L349)
- **问题**: 读后写,中间无锁。若回滚期间另一请求给买方加 50 分,回滚会用旧快照覆盖,丢失 50 分。
- **修复**: 回滚也用乐观锁 `.eq('points', buyer.points).select('id')`,失败则重试或告警。

### LE-P06 · 【P1】交易记录写入失败不回滚物品与积分
- **位置**: [src/lib/market-trade.ts:271-297](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/market-trade.ts#L271-L297)
- **问题**: `tradeErr` 时只返回错误,未回滚积分和物品转移。
- **影响**: 积分和物品已流转但无交易凭证,数据不一致且难以追溯。
- **修复**: `tradeErr` 时调用 `rollbackPoints` + 反向 `transferItem` + 恢复 listing 库存。

### LE-P07 · 【P1】borrow/overdue 路由使用陈旧快照更新借出方积分 ✅ 已修复
- **位置**: [src/app/api/team/borrow/overdue/route.ts:70-71, 125-132](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/team/borrow/overdue/route.ts#L125-L132)
- **问题**: 借入方在 92-97 行被重新查询(`freshBorrower`),但借出方没有。若借出方在循环开始后积分被其他请求修改,乐观锁必然失败,导致本可成功的自动还款被跳过。
- **影响**: 同一借出方有多笔借贷时,只有第一笔能自动还款,后续全部因乐观锁失败被跳过,债务长期挂账。
- **修复**: 在 124 行前重新查询借出方当前积分。

### LE-P08 · 【P1】overdue-tasks/handle 归档失败不终止
- **位置**: [src/app/api/admin/overdue-tasks/handle/route.ts:279-317](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/admin/overdue-tasks/handle/route.ts#L279-L317)
- **问题**: 注释说"终止清零以防数据不一致"但代码没有 `return`,实际仍会继续执行后续逻辑并返回 success:true。
- **影响**: 归档失败时 API 仍返回 success,管理员无感知,数据不一致。
- **修复**: `if (completionError)` 块末尾补 `return`,返回错误响应。

### LE-P09~P20 · 【P2】回滚/审计/校验缺失(12 处)
以下 update 操作都未使用 `.select()` 返回验证,乐观锁失败时无感知:
- `transfer/route.ts:165-172`(回滚)
- `borrow/route.ts:216-222`(拒绝分支)、`:324-333`(回滚)
- `borrow/repay/route.ts:164-173`(回滚)
- `borrow/overdue/route.ts:170-179`(回滚)、`:239-249`(零积分分支)
- `market-trade.ts:116-120`(回滚)
- `overdue-tasks/handle/route.ts:109-116`(扣分)、`:218-225`(更新任务)、`:285-293`(selection 更新)
- `final-task-feedback/route.ts:571-579`、`:595-602`(selection 更新)
- `like/route.ts` 4 处积分更新
- `transfer/route.ts:145` 浮点 heart_shards 做乐观锁,与 like 路由策略冲突
- `point_transactions` 写入无错误处理(transfer、market-trade)
- `like/route.ts` 整个文件无 point_transactions 审计记录
- `overdue-tasks/handle/route.ts:107-116` 延期扣分无乐观锁

---

## 三、AI 记忆与对话逻辑错误(16 处)

### LE-M01 · 【严重】字段命名跨模块不一致,导致跨模块查询失效 ✅ 已修复
- **位置**:
  - [src/lib/agent-memory.ts:17-25](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/agent-memory.ts#L17-L25) — `agent_username` / `memory_type` / `context_key` / `context_value` / `is_active`
  - [src/app/api/admin/assistant/lib/memory-manager.ts:93-94](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/admin/assistant/lib/memory-manager.ts#L93-L94) — `agent_id` / `team_id`
  - [src/app/api/ai/chat/lib/stream-handler.ts:170-179](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/chat/lib/stream-handler.ts#L170-L179) — `agent_username` + `layer` + `status`
  - [src/app/api/ai/agent-communication/route.ts:26](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/agent-communication/route.ts#L26) — `yinhe_boshi`(无 s)
  - [src/lib/agent-memory.ts:9](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/agent-memory.ts#L9) — `yinshe_boshi`(有 s)
- **问题**: 项目中存在 4 套不同的字段命名系统,同时智能体名称存在两种拼法(`yinshe_boshi` vs `yinhe_boshi`)。
- **影响**: memory-manager.ts 用 `agent_id` 查询但实际列名是 `agent_username`,查询返回空;stream-handler.ts 写入 `status: 'active'` 但读取时过滤 `is_active: true`,写入的记忆永远查不到;agent-communication 和 daily-sync 用 `yinhe_boshi` 但表中存的是 `yinshe_boshi`,跨智能体反馈数据无法关联。
- **修复**: 统一为单一命名规范(建议以 agent-memory.ts 为基准),修正 `yinhe_boshi` → `yinshe_boshi`。

### LE-M02 · 【严重】agent-memory.ts 缺失 touchMemories 函数,时间衰减系统失效
- **位置**: [src/lib/agent-memory.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/agent-memory.ts) 全文无 touchMemories
- **问题**: 银蛇博士通过 memory-integration.ts 调用 agent-memory.ts 的 `getMemories`,但该函数读取记忆后不调用 `touchMemories` 更新 `last_accessed_at`。
- **影响**: 银蛇博士访问的记忆永远不会更新 `last_accessed_at`,记忆蒸馏器无法基于"最后访问时间"判断哪些记忆是低频访问的,时间衰减系统对银蛇博士的记忆完全失效。
- **修复**: 在 agent-memory.ts 的 `getMemories` 返回数据前调用 touchMemories,并在文件中添加 touchMemories 函数。

### LE-M03 · 【严重】stream-handler.ts [记忆] 保存命令插入字段不完整 ✅ 已修复
- **位置**: [src/app/api/ai/chat/lib/stream-handler.ts:170-179](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/chat/lib/stream-handler.ts#L170-L179)
- **问题**: insert 缺失 `context_key`/`context_value`/`is_active`/`expires_at`/`last_accessed_at`/`access_count` 字段,且用 `status: 'active'` 而非 `is_active: true`。
- **影响**: AI 通过 [记忆] 保存命令写入的记忆,由于字段不匹配,后续 getMemories 查询永远查不到这些记忆;L1 短期记忆永不过期。
- **修复**: 补全字段,`status: 'active'` 改为 `is_active: true`,设置 `expires_at`(L1 24h)。

### LE-M04 · 【严重】schema.ts 与实际代码字段完全不匹配 ✅ 已修复
- **位置**: [src/storage/database/shared/schema.ts:570-606](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/storage/database/shared/schema.ts#L570-L606)
- **问题**: schema.ts 定义使用 `teamId`/`agentType`/`memoryType`,而实际代码使用 `agent_username`/`context_key`/`context_value`/`is_active`/`expires_at`/`last_accessed_at`/`access_count`/`layer`。
- **影响**: Drizzle ORM 类型推断完全失效,TypeScript 类型检查无法保护字段拼写错误;数据库迁移脚本可能与实际数据库结构不一致。
- **修复**: 更新 schema.ts 使其与实际数据库列名完全一致。

### LE-M05 · 【严重】distill/route.ts 使用 requireAdmin 鉴权,scheduler 无法调用 ✅ 已修复
- **位置**: [src/app/api/ai/memory/distill/route.ts:7-8](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/memory/distill/route.ts#L7-L8)
- **问题**: distill 端点使用 requireAdmin 鉴权,但 scheduler.js 的 callAPI 函数只设置 `Content-Type: application/json`,不带认证头。
- **影响**: 每日记忆蒸馏任务完全失败,agent_memories 表中的记忆永远不会被蒸馏/合并/归档,记忆数据库无限膨胀。
- **修复**: 在 distill/route.ts 中将 scheduler 调用的 action 放在鉴权前处理(类似 user/route.ts 的 cleanup 处理),或为 scheduler 添加内部服务认证 token。

### LE-M06 · 【中】agent-memory.ts addMemory 未设置 expires_at,L1 记忆永不过期
- **位置**: [src/lib/agent-memory.ts:104-114](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/lib/agent-memory.ts#L104-L114)
- **问题**: addMemory 函数插入记忆时未设置 `expires_at` 字段,所有记忆 expires_at 都是 NULL(永不过期)。
- **影响**: L1 短期记忆永远保留在数据库中,与系统提示词声明(L1 24h 过期)不一致,记忆污染。
- **修复**: 在 addMemory 中根据 memoryType 或 layer 参数设置 expires_at。

### LE-M07 · 【中】memory.ts 团队对话查询使用 ilike 可能误匹配
- **位置**: [src/app/api/ai/chat/lib/memory.ts:646](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/chat/lib/memory.ts#L646)
- **问题**: 查询团队对话历史使用 `.ilike('session_id', '%${teamId}%')`,这是模糊匹配。
- **影响**: 可能加载到其他团队的对话历史,造成记忆污染和隐私泄露。
- **修复**: 使用精确匹配 `.eq('session_id', \`yinhe_team_${teamId}\`)` 或用 team_id 字段直接过滤。

### LE-M08 · 【中】parent-assistant.tsx 使用 localStorage 而非 sessionStorage
- **位置**: [src/components/parent-assistant.tsx:99, 105](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/parent-assistant.tsx#L99)
- **问题**: 家长端蜡象助手使用 localStorage 存储 sessionId,而项目约定和 admin-assistant.tsx 都使用 sessionStorage。
- **影响**: 退出登录后 sessionId 仍保留在 localStorage 中,重新登录会复用旧 sessionId,违反"退出重进算新对话"的需求。
- **修复**: 将 localStorage 替换为 sessionStorage。

### LE-M09 · 【中】后端 getOrCreateSession fallback 生成的 sessionId 无时间戳
- **位置**: [src/app/api/ai/chat/lib/memory.ts:838-840](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/chat/lib/memory.ts#L838-L840)
- **问题**: 后端 fallback 生成 `yinhe_team_${teamId}` 或 `laxiang_user_${userId}`,无时间戳,而前端格式是带时间戳的。
- **影响**: 同一用户/团队的每次请求都会复用同一个 sessionId,对话历史会无限累积,上下文无限膨胀。
- **修复**: 后端 fallback 也应加时间戳:`yinhe_team_${teamId}_${Date.now()}`。

### LE-M10 · 【中】admin-assistant.tsx 前端历史切片无字符数限制
- **位置**: [src/components/admin-assistant.tsx:528](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/admin-assistant.tsx#L528)
- **问题**: 前端发送历史时使用 `messages.slice(-16)`,取最近 16 条消息,但没有字符总数限制。
- **影响**: 前端发送 16 条但后端只保留 10 条,用户可能感觉部分上下文"丢失"。
- **修复**: 前端也实施字符数限制,或与后端保持一致使用 10 条。

### LE-M11~M12 · 【中】关闭按钮未改为最小化(2 处)
- [src/components/parent-assistant.tsx:639](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/parent-assistant.tsx#L639) 使用 `<X>` 图标
- [src/components/ai-assistant/ai-assistant.tsx:555](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/ai-assistant/ai-assistant.tsx#L555) 使用 `<X>` 图标
- **问题**: 项目约定要求蜡象助手关闭按钮改为最小化按钮以确保对话连续性。admin-assistant.tsx 已改为 Minimize2,但 parent-assistant.tsx 和 ai-assistant.tsx 未跟进。
- **修复**: 将 X 图标改为 Minimize2,title 属性改为"最小化"。

### LE-M13 · 【中】系统提示词仅用单标签,未分 `<agent_memory>`/`<conversation_history>`
- **位置**: [src/app/api/ai/chat/lib/system-prompts.ts:1001-1003](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/api/ai/chat/lib/system-prompts.ts#L1001-L1003)
- **问题**: 项目约定要求"记忆内容和对话历史在 system prompts 中必须分别用 `<system_context>`/`<agent_memory>` 和 `<conversation_history>` 标签包裹",但当前只用单一的 `<system_context>` 标签。
- **修复**: 将记忆和对话历史分别包裹。

### LE-M14~M16 · 【低】3 处 ✅ 已修复
- **LE-M14**: formatTimeLabel 函数在两个文件重复实现
- **LE-M15**: admin/dashboard 退出时清理不存在的 sessionStorage key
- **LE-M16**: 蜡象助手使用多个记忆模块,行为不一致

---

## 四、前端状态与数据流错误(15 处)

### LE-F01 · 【P0】data-sync-context syncNow 依赖 lastSync 导致潜在循环 ✅ 已修复
- **位置**: [src/contexts/data-sync-context.tsx:125-135](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/contexts/data-sync-context.tsx#L125-L135)
- **问题**: `syncNow` 依赖 `lastSync`,任何调用 `markSynced()`(会 `setLastSync(Date.now())`)都会导致 `syncNow` 重建,触发 effect 重新执行 → 立即 `syncNow()` 一次 + 重建 interval。
- **影响**: 每次用户调用 `markSynced` 都会立即触发一次新的同步请求,形成"标记已读 → 触发同步 → 又有更新 → 再次标记"的潜在乒乓效应。
- **修复**: 把 `lastSync` 放进 ref(`lastSyncRef`),`syncNow` 只依赖 `[enabled, teamId, userId, userRole]`。

### LE-F02 · 【P0】录音 cleanup 依赖 isRecording 导致录音被错误停止 ✅ 已修复
- **位置**: 
  - [src/components/admin-assistant.tsx:163-174](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/admin-assistant.tsx#L163-L174)
  - [src/components/parent-assistant.tsx:127-137](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/parent-assistant.tsx#L127-L137)
- **问题**: cleanup 依赖 `isRecording`,每次 isRecording 变化都会执行 cleanup(停止录音!),而不是仅在卸载时执行。
- **影响**: 用户开始录音时,React 会先执行上次 effect 的 cleanup,可能立即停止刚启动的录音。
- **修复**: 改为空依赖 `[]`,cleanup 只在卸载时执行一次。

### LE-F03 · 【P0】多处 JSON.parse(localStorage) 无 try/catch(白屏风险) ✅ 已修复
- **位置**: 
  - [src/app/team/members/page.tsx:79](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/members/page.tsx#L79)
  - [src/app/team/messages/page.tsx:100, 105](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/messages/page.tsx#L100)
  - [src/app/team/submit/page.tsx:201](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/submit/page.tsx#L201)
  - [src/app/parent/dashboard/page.tsx:192](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/parent/dashboard/page.tsx#L192) 等多处
- **问题**: `JSON.parse(localStorage.getItem('team'))` 无 try/catch 保护。
- **影响**: localStorage 数据损坏(浏览器扩展、隐私模式、quota 异常)时直接抛错,导致整页白屏。
- **修复**: 统一封装 `safeJSONParse` 工具函数,所有 JSON.parse 包 try/catch。

### LE-F04 · 【P0】login 页面 fetch 未检查 res.ok ✅ 已修复
- **位置**: 
  - [src/app/team/login/page.tsx:28-44](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/login/page.tsx#L28-L44)
  - [src/app/admin/login/page.tsx:28-48](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/admin/login/page.tsx#L28-L48)
  - [src/components/ai-assistant/ai-assistant.tsx:119-128](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/ai-assistant/ai-assistant.tsx#L119-L128) (ASR)
  - [src/components/ai-assistant/lib/use-speech.ts:46-52](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/ai-assistant/lib/use-speech.ts#L46-L52) (TTS)
  - [src/components/parent-assistant.tsx:146-156](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/parent-assistant.tsx#L146-L156) (TTS)
  - [src/components/blackboard-section.tsx:178-184, 199-214](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/blackboard-section.tsx#L178-L184)
- **问题**: 若服务端返回 500 + HTML 错误页(如 Next.js 默认错误页),`res.json()` 会抛 SyntaxError,被 catch 捕获显示"网络错误",掩盖真实错误。
- **影响**: 登录失败时用户看到"网络错误"而非真实原因;debug 困难。
- **修复**: 先 `if (!res.ok) { setError('服务器错误'); return; }`,或用 `res.text()` 后 try JSON.parse。参考 [src/app/team/dashboard/page.tsx:545-588](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/dashboard/page.tsx#L545-L588) 的 `fetchSafe` + `safeJsonParse` 模式。

### LE-F05~F09 · 【P1】5 处 ✅ 已修复
- **Status**: ✅ 已修复（2026-07-18）—— 全部 5 处前端问题已修复,tsc --noEmit 通过（仅预存 blackboard 错误）
- **LE-F05**: ✅ admin/team/parent layout 的认证 fetch 已添加 AbortController,卸载/路由切换时 abort,catch 中识别 AbortError 不跳转登录页
- **LE-F06**: ✅ [src/app/team/dashboard/page.tsx](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/team/dashboard/page.tsx) `loadTeamData` 8 个并发 fetch 共享同一个 AbortController,新增卸载清理 useEffect;fetchSafe 内识别 AbortError 返回 499 而非 503
- **LE-F07**: ✅ [src/components/ai-assistant/ai-assistant.tsx](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/ai-assistant/ai-assistant.tsx) `handleRecordingComplete` 改用 `messagesRef.current` 读取最新 messages,依赖数组移除 `messages`,避免 callback 频繁重建
- **LE-F08**: ✅ [src/hooks/useFormValidation.ts](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/hooks/useFormValidation.ts) 新增 `errorsRef/touchedRef/valuesRef`,setValue/validateSingleField/validateForm 改用 ref 读取最新值,依赖数组移除 errors/touched/values
- **LE-F09**: ✅ [src/app/parent/dashboard/page.tsx](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/app/parent/dashboard/page.tsx) 学校搜索新增 `schoolSearchAbortRef`,每次搜索前 abort 上一次请求;finally 中校验 `schoolSearchAbortRef.current === controller` 才重置 loading,避免被 abort 的请求提前置回 false

### LE-F10~F15 · 【P2】6 处
- **LE-F10**: 推广 AbortController 模式(参考 [src/components/submission-review-dialog.tsx:54-58, 115-120](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/submission-review-dialog.tsx#L54-L58))
- **LE-F11**: 推广 `fetchSafe + safeJsonParse` 模式(参考 team/dashboard)
- **LE-F12**: 页面级守卫改为消费 layout 传入的认证状态,避免重复守卫
- **LE-F13**: AI 助手消息列表虚拟化([src/components/ai-assistant/ai-assistant.tsx:646-841](file:///c:/Users/李文渊/Desktop/our%20home/projects/src/components/ai-assistant/ai-assistant.tsx#L646-L841))
- **LE-F14**: 自定义 404 页面(项目未发现 not-found.tsx)
- **LE-F15**: 统一 storage 工具函数,所有 JSON.parse 包 try/catch

---

## 综合修复优先级矩阵

| 优先级 | 编号 | 标题 | 类别 | 预估工作量 |
|---|---|---|---|---|
| **P0** | SEC-001 ✅ | 默认使用 service_role 客户端,RLS 失效(已修复) | 安全 | 大 |
| **P0** | SEC-002 | 用户记忆 API IDOR | 安全 | 极小(1 行) |
| **P0** | LE-A01 | 小队改密码接口严重越权 | 认证 | 极小 |
| **P0** | LE-A02 | 家长关注小队接口完全无鉴权 | 认证 | 小 |
| **P0** | LE-A03 | 同步接口完全无鉴权 | 认证 | 极小 |
| **P0** | LE-A04 | 登出后 Token 仍可用 | 认证 | 中 |
| **P0** | LE-P01 | 部分还款后无法手动归还 | 积分 | 极小 |
| **P0** | LE-P02 | 爱心碎片并发丢失更新 | 积分 | 中 |
| **P0** | LE-P03 | 点赞积分不校验更新结果(可刷积分) | 积分 | 中 |
| **P0** | LE-P04 | 作品可被重复出售 | 积分 | 小 |
| **P0** | LE-M01 | 字段命名跨模块不一致 | 记忆 | 大 |
| **P0** | LE-M02 | touchMemories 缺失 | 记忆 | 小 |
| **P0** | LE-M03 | stream-handler 字段不完整 | 记忆 | 小 |
| **P0** | LE-M04 | schema.ts 与代码不匹配 | 记忆 | 中 |
| **P0** | LE-M05 | distill 鉴权阻断 scheduler | 记忆 | 小 |
| **P0** | LE-F01 | data-sync 潜在循环 | 前端 | 小 |
| **P0** | LE-F02 | 录音 cleanup 依赖错误 | 前端 | 极小 |
| **P0** | LE-F03 | JSON.parse 无 try/catch(白屏) | 前端 | 小 |
| **P0** | LE-F04 | login fetch 未检查 res.ok | 前端 | 小 |
| **P1** | SEC-003 ✅ | 家长登录账号枚举(已修复) | 安全 | 小 |
| **P1** | SEC-004 ✅ | 测试接口暴露(已修复) | 安全 | 小 |
| **P1** | SEC-005 ✅ | 家长注册无速率限制(已修复) | 安全 | 极小 |
| **P1** | LE-A05~A12 ✅ | 8 处资源归属校验缺失(已修复) | 认证 | 小~中 |
| **P1** | LE-P05~P08 ✅ | 4 处回滚/快照/终止问题(已修复) | 积分 | 小~中 |
| **P1** | LE-F05~F09 ✅ | 5 处前端 AbortController/竞态(已修复) | 前端 | 小~中 |
| **P2** | SEC-006~SEC-010 | 5 处中等安全问题 | 安全 | 中 |
| **P2** | LE-A13~A19 | 7 处横向越权查询 | 认证 | 小 |
| **P2** | LE-P09~P20 ✅ | 12 处回滚/审计/校验缺失(已修复) | 积分 | 小 |
| **P2** | LE-M06~M13 | 8 处记忆/对话中等问题 | 记忆 | 小~中 |
| **P2** | LE-F10~F15 ✅ | 6 处前端改进项(LE-F14 已修复,其余为推广任务) | 前端 | 中 |
| **P3** | SEC-011, SEC-012 | 2 处低优先级安全问题 | 安全 | 小 |
| **P3** | LE-A20~A22 ✅ | 3 处低优先级认证问题(已修复) | 认证 | 小 |
| **P3** | LE-M14~M16 ✅ | 3 处低优先级记忆问题(已修复) | 记忆 | 小 |

---

## 修复策略建议

### 阶段 1: 立即修复(P0,1-2 天)
1. **LE-A01** 小队改密越权 — 1 行代码,删除 body.teamId
2. **LE-A02** 家长接口无鉴权 — 3 个 handler 加 requireParent
3. **LE-A03** sync 接口无鉴权 — 1 行加 requireAnyAuth
4. **LE-P01** 部分还款状态校验 — 修改 .in() 列表
5. **LE-P04** 作品重复出售 — 加 .eq('status', 'approved') 乐观锁
6. **LE-F02** 录音 cleanup 依赖 — 改为空依赖
7. **LE-F04** login fetch res.ok 检查 — 推广 fetchSafe 模式
8. **LE-M05** distill 鉴权 — 把 scheduler action 移到鉴权前
9. **SEC-002** 记忆 API IDOR — 1 行加 userId 校验

### 阶段 2: 系统性修复(P0~P1,1 周)
1. **LE-A04** authenticateRequest 引入 verifySession — 统一解决登出失效
2. **LE-P02/LE-P03** 爱心碎片/点赞积分 — 引入 version 列或整型存储
3. **LE-M01~M04** 记忆模块统一 — 字段命名、touchMemories、expires_at、schema
4. **LE-F01** data-sync 循环 — lastSync 改 ref
5. **LE-F03** JSON.parse 安全化 — 封装 safeJSONParse 工具

### 阶段 3: 规划重构(P2,2-4 周)
1. ~~**SEC-001** service_role 重构 — 分阶段迁移到 anon 客户端~~ ✅ 已完成（2026-07-17，三阶段重构，100+ 文件迁移）
2. **LE-A13~A19** 横向越权 — 统一资源归属校验中间件
3. **LE-P09~P20** 全面补 .select() 验证和审计记录
4. **LE-F10~F15** 前端最佳实践推广

报告生成完毕。如需我开始修复某个具体问题,告诉我编号即可(如 "修复 LE-A01" 或 "修复所有 P0")。
