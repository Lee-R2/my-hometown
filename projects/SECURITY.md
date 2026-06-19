# STEM 教育管理平台 - 安全架构文档

## 概述

本文档描述了 STEM 教育管理平台的安全保护功能，包括账户安全、数据保护和攻击防护机制。

## 安全架构

### 核心模块

1. **安全工具库** (`src/lib/security.ts`)
   - 密码哈希和验证
   - 令牌生成和验证
   - CSRF 防护
   - 请求签名
   - 数据脱敏
   - 输入清理和验证

2. **会话管理** (`src/lib/session.ts`)
   - 会话创建和验证
   - 令牌刷新
   - 会话失效
   - 会话查询
   - Cookie 管理

3. **访问限制** (`src/lib/rate-limit.ts`)
   - 频率限制
   - IP 白名单
   - IP 黑名单
   - 请求日志
   - 异常活动检测

4. **API 安全中间件** (`src/middleware/api-security.ts`)
   - 认证和授权
   - CSRF 防护
   - 输入清理
   - 安全响应头
   - 预定义的安全包装器

## 安全功能详解

### 1. 密码安全

#### 密码哈希

使用 SHA-256 算法配合盐值进行密码哈希存储：

```typescript
import { hashPassword, verifyPassword } from '@/lib/security';

// 创建用户时哈希密码
const hashedPassword = hashPassword(userPassword);

// 验证密码
const isValid = verifyPassword(inputPassword, storedHashedPassword);
```

**特性：**
- 使用随机盐值
- 多次迭代增加哈希复杂度（10,000 次）
- 使用 timing-safe equal 防止时序攻击

#### 密码强度检查

```typescript
import { checkPasswordStrength } from '@/lib/security';

const result = checkPasswordStrength(password);
// result: { score: 0-4, strength, suggestions }
```

**强度等级：**
- 0: 非常弱
- 1: 弱
- 2: 中等
- 3: 强
- 4: 非常强

**检查项：**
- 长度（至少 8 位）
- 大小写字母
- 数字
- 特殊字符
- 常见弱密码

### 2. 会话管理

#### 创建会话

```typescript
import { createSession } from '@/lib/session';

const session = await createSession(
  userId,
  role,
  schoolId,
  ipAddress,
  userAgent
);
```

#### 验证会话

```typescript
import { verifySession } from '@/lib/session';

const session = await verifySession(token);
if (!session) {
  // 令牌无效或已过期
}
```

#### 令牌刷新

```typescript
import { refreshSession } from '@/lib/session';

const newSession = await refreshSession(oldToken);
```

#### 会话失效

```typescript
import { invalidateSession, invalidateAllUserSessions } from '@/lib/session';

// 使单个会话失效
await invalidateSession(token);

// 使用户的所有会话失效
await invalidateAllUserSessions(userId);
```

### 3. 频率限制

#### 预定义限制

| 类型 | 时间窗口 | 最大请求数 | 说明 |
|------|---------|----------|------|
| login | 15 分钟 | 5 | 登录尝试 |
| api | 1 分钟 | 60 | API 请求 |
| upload | 1 小时 | 20 | 文件上传 |
| sensitive | 1 天 | 10 | 敏感操作 |
| general | 1 分钟 | 100 | 一般访问 |

#### 检查频率限制

```typescript
import { checkRateLimit } from '@/lib/rate-limit';

const result = await checkRateLimit(ipAddress, 'login');
if (!result.allowed) {
  // 超出频率限制
  console.log(result.message); // 限制消息
  console.log(result.remaining); // 剩余请求数
  console.log(result.resetTime); // 重置时间
}
```

### 4. IP 白名单和黑名单

#### 添加 IP 到白名单

```typescript
import { addIPToWhitelist } from '@/lib/rate-limit';

await addIPToWhitelist(
  '192.168.1.100',
  '管理员办公室',
  'admin_id'
);
```

#### 添加 IP 到黑名单

```typescript
import { addIPToBlacklist } from '@/lib/rate-limit';

await addIPToBlacklist(
  '192.168.1.200',
  '恶意访问',
  'admin_id',
  new Date('2024-12-31') // 过期时间
);
```

### 5. API 安全中间件

#### 使用预定义的安全包装器

```typescript
import {
  publicAPIHandler,
  authenticatedAPIHandler,
  adminAPIHandler,
  sensitiveAPIHandler,
} from '@/middleware/api-security';

// 公开 API（无需认证）
export const GET = publicAPIHandler(async (request) => {
  // 处理逻辑
});

// 认证 API（需要认证）
export const POST = authenticatedAPIHandler(
  async (request) => {
    // 处理逻辑
  },
  ['super_admin', 'teacher'] // 允许的角色
);

// 管理员 API（需要管理员权限）
export const PUT = adminAPIHandler(async (request) => {
  // 处理逻辑
});

// 敏感操作 API（需要认证和严格限制）
export const DELETE = sensitiveAPIHandler(async (request) => {
  // 处理逻辑
});
```

#### 自定义安全配置

```typescript
import { apiSecurityMiddleware } from '@/middleware/api-security';

export async function POST(request: NextRequest) {
  const securityError = await apiSecurityMiddleware(request, {
    requireAuth: true,
    requireRole: ['super_admin'],
    rateLimitType: 'sensitive',
    requireCSRF: true,
    enableIPBlacklist: true,
  });

  if (securityError) {
    return securityError;
  }

  // 安全检查通过，继续处理
}
```

## 数据库表结构

### 1. user_sessions

用户会话表，存储活跃的登录会话。

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);
```

### 2. rate_limit_records

频率限制记录表，跟踪请求频率。

```sql
CREATE TABLE rate_limit_records (
  id UUID PRIMARY KEY,
  identifier TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE
);
```

### 3. ip_whitelist

IP 白名单表，存储允许访问的 IP 地址。

```sql
CREATE TABLE ip_whitelist (
  id UUID PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  note TEXT,
  added_by TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE
);
```

### 4. ip_blacklist

IP 黑名单表，存储被禁止访问的 IP 地址。

```sql
CREATE TABLE ip_blacklist (
  id UUID PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  added_by TEXT,
  expiry_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE
);
```

### 5. request_logs

请求日志表，记录所有 API 请求。

```sql
CREATE TABLE request_logs (
  id UUID PRIMARY KEY,
  ip_address TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  user_agent TEXT,
  user_id TEXT,
  status_code INTEGER,
  duration INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE
);
```

### 6. security_events

安全事件日志表，记录安全相关事件。

```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT,
  ip_address TEXT,
  user_id TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE
);
```

### 7. login_attempts

登录尝试记录表，跟踪登录成功和失败。

```sql
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY,
  identifier TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  timestamp TIMESTAMP WITH TIME ZONE
);
```

## 安全最佳实践

### 1. 密码安全

- ✅ 使用强密码哈希（SHA-256 + 盐值）
- ✅ 检查密码强度
- ✅ 限制密码重试次数
- ✅ 鼓励定期更换密码
- ❌ 避免明文存储密码
- ❌ 避免使用弱密码算法（MD5、SHA1）

### 2. 会话管理

- ✅ 使用 HTTPS 传输令牌
- ✅ 设置合理的会话过期时间（7 天）
- ✅ 提供登出功能
- ✅ 支持令牌刷新
- ✅ 监控异常会话
- ❌ 避免在 URL 中传递令牌
- ❌ 避免永久令牌

### 3. 访问控制

- ✅ 实施最小权限原则
- ✅ 使用频率限制
- ✅ IP 白名单/黑名单
- ✅ 检测异常活动
- ❌ 避免过度信任客户端输入

### 4. 数据保护

- ✅ 加密敏感数据
- ✅ 使用数据脱敏
- ✅ 定期备份数据
- ✅ 实施数据访问审计
- ❌ 避免不必要的数据收集

### 5. 输入验证

- ✅ 清理所有用户输入
- ✅ 验证数据类型和格式
- ✅ 防止 SQL 注入
- ✅ 防止 XSS 攻击
- ❌ 避免直接拼接 SQL 语句

## 安全响应头

所有 API 响应都包含以下安全响应头：

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## 部署安全检查清单

- [ ] 更改默认 TOKEN_SECRET
- [ ] 配置 HTTPS
- [ ] 执行安全数据库迁移
- [ ] 配置防火墙规则
- [ ] 设置日志监控
- [ ] 定期更新依赖
- [ ] 实施备份策略
- [ ] 配置入侵检测
- [ ] 进行安全审计
- [ ] 建立应急响应计划

## 常见安全问题

### Q: 如何重置用户密码？

A: 使用 `/api/password` 接口：
- POST: 用户修改自己的密码
- PUT: 管理员重置用户密码

### Q: 如何封禁恶意 IP？

A: 使用 `addIPToBlacklist` 函数：
```typescript
await addIPToBlacklist(
  '192.168.1.100',
  '恶意扫描',
  'admin_id',
  new Date('2024-12-31')
);
```

### Q: 如何查看登录日志？

A: 查询 `login_attempts` 表：
```sql
SELECT * FROM login_attempts
WHERE success = false
ORDER BY timestamp DESC
LIMIT 100;
```

### Q: 如何清理过期数据？

A: 使用清理函数：
```typescript
import {
  cleanupExpiredSessions,
  cleanupExpiredRateLimitRecords
} from '@/lib/session';

await cleanupExpiredSessions();
await cleanupExpiredRateLimitRecords();
```

## 联系支持

如发现安全问题或需要安全支持，请联系：
- 安全团队邮箱: security@example.com
- 紧急响应热线: +86-XXX-XXXX-XXXX
