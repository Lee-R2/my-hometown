# 密码迁移指南

## 问题说明

由于引入了新的密码哈希安全机制，现有数据库中的明文密码（如初始密码 "123456"）无法被新代码验证。为了保持向后兼容性，我们已经：

1. ✅ 更新了 `verifyPassword` 函数，支持同时验证明文密码和哈希密码
2. ✅ 创建了密码迁移 API，将明文密码转换为哈希密码

## 当前状态

**✅ 立即可用**

由于 `verifyPassword` 函数已支持向后兼容，现有用户可以**立即**使用初始密码（如 "123456"）登录，无需等待迁移。

## 账号状态问题

如果所有用户和小队登录都提示"账号被禁用"，这是因为数据库中的 `is_active` 字段为 `NULL`。

### 快速修复

```bash
# 1. 查询账号状态
curl http://localhost:5000/api/migrate/account-status

# 2. 修复所有账号状态
curl -X POST http://localhost:5000/api/migrate/account-status

# 3. 验证修复
curl http://localhost:5000/api/migrate/account-status
```

修复后，所有现有账号的 `is_active` 字段将被设置为 `true`。

## 执行密码迁移（推荐）

为了提高安全性，建议执行密码迁移，将所有明文密码转换为哈希密码。

### 方法 1：通过 API 迁移（推荐）

#### 1. 查询迁移状态

```bash
# 查询密码迁移状态
curl http://localhost:5000/api/migrate/all-passwords
```

响应示例：
```json
{
  "status": {
    "users": { "total": 10, "plaintext": 10, "hashed": 0 },
    "teams": { "total": 5, "plaintext": 5, "hashed": 0 }
  },
  "total": {
    "plaintext": 15,
    "hashed": 0,
    "needsMigration": true
  }
}
```

#### 2. 执行迁移

```bash
# 迁移所有密码
curl -X POST http://localhost:5000/api/migrate/all-passwords
```

响应示例：
```json
{
  "success": true,
  "message": "成功迁移 15 个密码",
  "results": {
    "users": { "total": 10, "migrated": 10, "errors": [] },
    "teams": { "total": 5, "migrated": 5, "errors": [] }
  }
}
```

### 方法 2：仅迁移用户密码

如果只需要迁移用户表（users）：

```bash
# 查询状态
curl http://localhost:5000/api/migrate/password

# 执行迁移
curl -X POST http://localhost:5000/api/migrate/password
```

### 方法 3：通过 SQL 迁移（仅限开发环境）

⚠️ **警告**：此方法仅用于开发环境，生产环境请使用 API。

```sql
-- 查询需要迁移的用户
SELECT id, username, password
FROM users
WHERE password NOT LIKE '%:%';

-- 手动迁移（需要 Node.js 环境）
-- 或者使用 API 进行迁移
```

## 迁移后验证

迁移完成后：

1. **测试用户登录**：使用初始密码（如 "123456"）登录
2. **测试小队登录**：使用初始密码登录小队
3. **查询状态**：确认所有密码已转换为哈希格式

```bash
# 验证迁移状态
curl http://localhost:5000/api/migrate/all-passwords

# 应该显示：
# {
#   "total": {
#     "plaintext": 0,
#     "hashed": 15,
#     "needsMigration": false
#   }
# }
```

## 常见问题

### Q1: 迁移前可以登录吗？

**A:** 可以！`verifyPassword` 函数已经支持向后兼容，用户可以立即使用初始密码登录。

### Q2: 迁移会影响现有用户吗？

**A:** 不会。迁移过程只是将密码格式从明文转换为哈希，用户无需更改密码。

### Q3: 迁移后用户密码会变吗？

**A:** 不会。用户的初始密码（如 "123456"）保持不变，只是存储格式改变了。

### Q4: 迁移失败怎么办？

**A:** 迁移失败不会影响现有用户，因为系统同时支持明文和哈希密码。您可以：
1. 查看迁移结果中的错误信息
2. 修复问题后重新执行迁移
3. 或者单独迁移失败的记录

### Q5: 如何回滚迁移？

**A:** 密码迁移不可逆，但无需回滚。因为迁移只是将密码格式从明文改为哈希，安全性提高了，不影响功能。

### Q6: 为什么所有账号都提示"账号被禁用"？

**A:** 这是因为数据库中的 `is_active` 字段为 `NULL`。使用以下命令修复：

```bash
curl -X POST http://localhost:5000/api/migrate/account-status
```

## 生产环境部署建议

1. **部署前测试**
   - 在开发环境测试迁移流程
   - 验证登录功能正常

2. **低峰期执行**
   - 选择用户较少的时间执行迁移
   - 预计迁移时间取决于用户数量

3. **监控执行**
   - 查看迁移日志
   - 确认所有密码成功迁移

4. **验证功能**
   - 测试用户登录
   - 测试小队登录
   - 测试密码修改功能

## 技术细节

### 密码格式

**明文密码（旧格式）**
```
123456
password
```

**哈希密码（新格式）**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0:5f4d3e2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5
```

格式：`salt:hash`

### 向后兼容逻辑

```typescript
export function verifyPassword(password: string, storedPassword: string): boolean {
  // 检查是否是哈希格式（包含冒号）
  if (storedPassword.includes(':')) {
    // 使用哈希验证
    return verifyHashedPassword(password, storedPassword);
  } else {
    // 向后兼容：直接比较明文密码
    return password === storedPassword;
  }
}
```

### 账号状态逻辑

```typescript
// 检查账号状态（NULL 或 true 视为活跃，false 视为禁用）
if (user.is_active === false) {
  // 账号被禁用
}
// 否则（NULL 或 true），账号正常
```

## 联系支持

如有问题，请联系：
- 开发团队邮箱: dev@example.com
- 文档: SECURITY.md
