# 安全功能快速入门指南

## 概述

本文档提供了快速使用安全功能的指南，帮助开发者快速集成安全机制到项目中。

## 快速开始

### 1. 执行数据库迁移

首先，需要创建支持安全功能的数据库表：

```bash
# 使用 SQL 迁移脚本
psql -d your_database -f migrations/security.sql

# 或者通过 API
curl -X POST http://localhost:5000/api/migrate/security
```

### 2. 配置环境变量

在 `.env.local` 文件中添加以下配置：

```bash
# 令牌密钥（生产环境必须更改）
TOKEN_SECRET=your-super-secret-key-change-in-production

# 环境
NODE_ENV=development
```

### 3. 使用安全中间件

#### 示例 1：保护公开 API

```typescript
import { publicAPIHandler } from '@/middleware/api-security';

export const GET = publicAPIHandler(async (request) => {
  // 处理逻辑
  return NextResponse.json({ message: 'Hello World' });
});
```

#### 示例 2：保护需要认证的 API

```typescript
import { authenticatedAPIHandler } from '@/middleware/api-security';

export const POST = authenticatedAPIHandler(
  async (request) => {
    // 处理逻辑
    return NextResponse.json({ message: 'Protected endpoint' });
  },
  ['super_admin', 'teacher'] // 允许的角色
);
```

#### 示例 3：保护管理员 API

```typescript
import { adminAPIHandler } from '@/middleware/api-security';

export const PUT = adminAPIHandler(async (request) => {
  // 处理逻辑
  return NextResponse.json({ message: 'Admin endpoint' });
});
```

#### 示例 4：保护敏感操作

```typescript
import { sensitiveAPIHandler } from '@/middleware/api-security';

export const DELETE = sensitiveAPIHandler(async (request) => {
  // 处理逻辑
  return NextResponse.json({ message: 'Sensitive endpoint' });
});
```

### 4. 使用密码哈希

```typescript
import { hashPassword, verifyPassword, checkPasswordStrength } from '@/lib/security';

// 创建用户时哈希密码
const hashedPassword = hashPassword('user_password_123');

// 验证密码
const isValid = verifyPassword('user_password_123', hashedPassword);

// 检查密码强度
const strength = checkPasswordStrength('weak_password');
console.log(strength); // { score: 1, strength: 'weak', suggestions: [...] }
```

### 5. 使用会话管理

```typescript
import { createSession, verifySession, invalidateSession } from '@/lib/session';

// 创建会话
const session = await createSession(
  userId,
  role,
  schoolId,
  ipAddress,
  userAgent
);

// 验证会话
const sessionData = await verifySession(token);
if (!sessionData) {
  // 令牌无效或已过期
}

// 使会话失效
await invalidateSession(token);
```

### 6. 使用频率限制

```typescript
import { checkRateLimit } from '@/lib/rate-limit';

// 检查频率限制
const result = await checkRateLimit(ipAddress, 'login');
if (!result.allowed) {
  // 超出频率限制
  console.log(result.message);
  console.log(`剩余: ${result.remaining}`);
  console.log(`重置时间: ${result.resetTime}`);
}
```

### 7. IP 白名单/黑名单

```typescript
import { addIPToWhitelist, addIPToBlacklist } from '@/lib/rate-limit';

// 添加 IP 到白名单
await addIPToWhitelist(
  '192.168.1.100',
  '管理员办公室',
  'admin_id'
);

// 添加 IP 到黑名单
await addIPToBlacklist(
  '192.168.1.200',
  '恶意访问',
  'admin_id',
  new Date('2024-12-31')
);
```

## 常见使用场景

### 场景 1：用户登录

```typescript
import { verifyPassword } from '@/lib/security';
import { createSession } from '@/lib/session';
import { checkRateLimit, logRequest, getClientIP } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { username, password } = await request.json();

  // 1. 频率限制检查
  const rateLimitResult = await checkRateLimit(ip, 'login');
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.message },
      { status: 429 }
    );
  }

  // 2. 查询用户
  const user = await getUserByUsername(username);
  if (!user) {
    await logRequest(ip, 'POST', '/api/login', undefined, undefined, 401);
    return NextResponse.json(
      { error: '用户名不存在' },
      { status: 401 }
    );
  }

  // 3. 验证密码
  const isValid = verifyPassword(password, user.password);
  if (!isValid) {
    await logRequest(ip, 'POST', '/api/login', undefined, user.id, 401);
    return NextResponse.json(
      { error: '密码错误' },
      { status: 401 }
    );
  }

  // 4. 创建会话
  const session = await createSession(user.id, user.role, user.school_id, ip);

  // 5. 返回结果
  return NextResponse.json({
    success: true,
    user,
    token: session.token,
    csrfToken: session.csrfToken,
  });
}
```

### 场景 2：数据修改

```typescript
import { authenticatedAPIHandler } from '@/middleware/api-security';

export const PUT = authenticatedAPIHandler(
  async (request) => {
    const { userId } = await request.json();

    // 更新数据
    await updateUser(userId, { name: 'New Name' });

    return NextResponse.json({ success: true });
  },
  ['super_admin', 'teacher']
);
```

### 场景 3：文件上传

```typescript
import { authenticatedAPIHandler } from '@/middleware/api-security';
import { isSafeFileType, isSafeFileSize } from '@/lib/security';

export const POST = authenticatedAPIHandler(
  async (request) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // 检查文件类型
    const allowedTypes = ['.jpg', '.png', '.pdf'];
    if (!isSafeFileType(file.name, allowedTypes)) {
      return NextResponse.json(
        { error: '不支持的文件类型' },
        { status: 400 }
      );
    }

    // 检查文件大小
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (!isSafeFileSize(file.size, maxSize)) {
      return NextResponse.json(
        { error: '文件大小超过限制' },
        { status: 400 }
      );
    }

    // 处理文件上传
    const url = await uploadFile(file);

    return NextResponse.json({ success: true, url });
  }
);
```

## 安全最佳实践

### ✅ 推荐做法

1. **始终使用 HTTPS**
   ```bash
   # 在生产环境中启用 HTTPS
   NODE_ENV=production
   ```

2. **使用强密码策略**
   ```typescript
   // 强制密码强度检查
   const strength = checkPasswordStrength(password);
   if (strength.score < 2) {
     return NextResponse.json(
       { error: '密码强度不足', suggestions: strength.suggestions },
       { status: 400 }
     );
   }
   ```

3. **定期清理过期数据**
   ```typescript
   import {
     cleanupExpiredSessions,
     cleanupExpiredRateLimitRecords,
   } from '@/lib/session';

   // 每天清理一次
   setInterval(async () => {
     await cleanupExpiredSessions();
     await cleanupExpiredRateLimitRecords();
   }, 24 * 60 * 60 * 1000);
   ```

4. **记录安全事件**
   ```typescript
   import { logRequest } from '@/lib/rate-limit';

   // 记录失败的登录尝试
   await logRequest(ip, 'POST', '/api/login', userAgent, undefined, 401);
   ```

### ❌ 不推荐做法

1. **不要使用明文密码**
   ```typescript
   // ❌ 错误
   const user = await createUser({ password: 'plain_text_password' });

   // ✅ 正确
   const hashedPassword = hashPassword('plain_text_password');
   const user = await createUser({ password: hashedPassword });
   ```

2. **不要在 URL 中传递敏感信息**
   ```typescript
   // ❌ 错误
   window.location.href = `/api/users/${userId}?token=${token}`;

   // ✅ 正确
   fetch('/api/users/123', {
     headers: {
       'Authorization': `Bearer ${token}`,
     },
   });
   ```

3. **不要直接拼接 SQL**
   ```typescript
   // ❌ 错误
   const query = `SELECT * FROM users WHERE name = '${userName}'`;

   // ✅ 正确（使用参数化查询）
   const query = 'SELECT * FROM users WHERE name = $1';
   await client.query(query, [userName]);
   ```

## 故障排查

### 问题 1：令牌验证失败

**症状：** 所有 API 请求返回 401 错误

**解决方案：**
1. 检查 `TOKEN_SECRET` 是否正确配置
2. 确保令牌未过期
3. 验证令牌格式是否正确

```bash
# 检查环境变量
echo $TOKEN_SECRET
```

### 问题 2：频率限制触发

**症状：** 请求返回 429 错误

**解决方案：**
1. 等待频率限制重置
2. 调整频率限制配置
3. 检查是否有恶意请求

```typescript
// 重置频率限制（仅用于调试）
import { resetRateLimit } from '@/lib/rate-limit';
await resetRateLimit(ipAddress, 'login');
```

### 问题 3：密码验证失败

**症状：** 正确密码也无法登录

**解决方案：**
1. 检查密码是否正确哈希
2. 验证哈希算法是否一致
3. 确保密码未在传输过程中被修改

```typescript
// 测试密码哈希
const testPassword = 'test123';
const hashed = hashPassword(testPassword);
const isValid = verifyPassword(testPassword, hashed);
console.log('Password valid:', isValid); // 应该是 true
```

## 下一步

- 阅读完整的安全架构文档：`SECURITY.md`
- 查看配置文件：`src/lib/security-config.ts`
- 了解数据库结构：`migrations/security.sql`

## 获取帮助

如有问题，请联系安全团队：
- 邮箱：security@example.com
- 文档：`SECURITY.md`
