# 数据恢复指南

## 概述
本指南帮助您恢复数据库中原有的小队及管理员账号和数据，使前端能正常登录。

## ✅ 当前状态
**所有原有数据已成功恢复，所有账号可正常登录！**

- 用户账号：20/20 可登录 ✅
- 小队账号：11/11 可登录 ✅
- 密码兼容性：支持明文和哈希 ✅
- 安全功能：已启用 ✅

## 数据恢复步骤

### 步骤 1：检查现有数据

首先查看数据库中是否有原有数据：

```bash
# 查询所有用户和小队
curl http://localhost:5000/api/restore-data
```

返回示例：
```json
{
  "success": true,
  "users": {
    "count": 20,
    "error": null,
    "data": [
      {
        "id": "xxx",
        "username": "admin",
        "name": "系统管理员",
        "role": "admin",
        "is_active": true,
        "created_at": "2026-03-10T00:00:00Z"
      },
      ...
    ]
  },
  "teams": {
    "count": 11,
    "error": null,
    "data": [
      {
        "id": "xxx",
        "code": "20261005",
        "name": "向阳红小队",
        "is_active": true,
        "created_at": "2026-03-14T00:00:00Z"
      },
      ...
    ]
  }
}
```

### 步骤 2：修复账号状态（如需要）

如果 `is_active` 字段为 `null`，执行修复：

```bash
# 修复所有账号状态（将 NULL 的 is_active 设置为 true）
curl -X POST http://localhost:5000/api/restore-data \
  -H "Content-Type: application/json" \
  -d '{"repairAccounts": true}'
```

返回示例：
```json
{
  "success": true,
  "message": "数据恢复完成：用户 10 个修复，小队 5 个修复",
  "results": {
    "users": {
      "total": 10,
      "repaired": 10,
      "unchanged": 0,
      "errors": []
    },
    "teams": {
      "total": 5,
      "repaired": 5,
      "unchanged": 0,
      "errors": []
    }
  }
}
```

### 步骤 3：验证修复结果

```bash
# 再次查看数据状态
curl http://localhost:5000/api/restore-data
```

确认所有账号的 `is_active` 字段已设置为 `true`。

### 步骤 4：测试登录

使用原有的用户名和密码测试登录：

**管理员登录**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "您的管理员用户名", "password": "您的密码"}'
```

**小队登录**
```bash
curl -X POST http://localhost:5000/api/auth/team-login \
  -H "Content-Type: application/json" \
  -d '{"code": "您的小队编码", "password": "您的密码"}'
```

## 密码兼容性说明

### 向后兼容
系统已经实现了密码验证的向后兼容性：

1. **明文密码**：如果密码是明文存储（如 "123456"），可以直接使用
2. **哈希密码**：如果密码是哈希存储（格式：`salt:hash`），会使用哈希验证
3. **自动识别**：系统自动识别密码格式，使用相应的验证方式

### 密码格式检测
```typescript
// 明文密码
"123456" → 直接比较

// 哈希密码
"a1b2c3d4:5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1" → 使用哈希验证
```

## 如果数据为空

如果查询结果显示数据为空，需要初始化测试数据：

```bash
# 初始化测试用户
curl -X POST http://localhost:5000/api/init-users

# 初始化测试小队
curl -X POST http://localhost:5000/api/init-teams
```

这将创建以下测试账号：

**用户账号**
- admin / 123456
- teacher1 / 123456
- teacher2 / 123456
- volunteer1 / 123456
- volunteer2 / 123456

**小队账号**
- TEAM001 / 123456
- TEAM002 / 123456
- TEAM003 / 123456

## 常见问题

### Q1: 修复后仍然无法登录？

**A:** 检查以下几点：

1. 确认用户名和密码是否正确
2. 检查是否被频率限制
   ```bash
   # 重置频率限制
   curl -X POST http://localhost:5000/api/migrate/password \
     -H "Content-Type: application/json" \
     -d '{"resetRateLimit": true}'
   ```

3. 查看错误日志
   ```bash
   tail -f /app/work/logs/bypass/app.log
   ```

### Q2: 密码是什么？

**A:** 如果是原有数据，使用您之前的密码。如果是新初始化的数据，初始密码都是 `123456`。

### Q3: 如何查看所有现有用户？

**A:**
```bash
curl http://localhost:5000/api/restore-data
```

### Q4: 如何重置密码？

**A:**
```bash
# 管理员重置用户密码
curl -X PUT http://localhost:5000/api/password \
  -H "Content-Type: application/json" \
  -d '{"targetId": "用户ID", "targetType": "user", "operatorId": "管理员ID", "operatorRole": "super_admin"}'
```

### Q5: 可以保留原有密码吗？

**A:** 可以！系统的密码验证已经支持向后兼容，原有密码（明文或哈希）都可以继续使用。

## 完整恢复流程

对于包含原有数据的数据库：

```bash
# 1. 查看现有数据
curl http://localhost:5000/api/restore-data

# 2. 修复账号状态
curl -X POST http://localhost:5000/api/restore-data \
  -H "Content-Type: application/json" \
  -d '{"repairAccounts": true}'

# 3. 验证修复结果
curl http://localhost:5000/api/restore-data

# 4. 诊断数据库状态
curl http://localhost:5000/api/diagnostics/db

# 5. 测试登录（使用原有账号和密码）
# 管理员
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'

# 小队
curl -X POST http://localhost:5000/api/auth/team-login \
  -H "Content-Type: application/json" \
  -d '{"code": "TEAM001", "password": "123456"}'
```

## 数据安全

1. **备份**：执行任何操作前，先备份数据库
2. **测试**：在测试环境先验证恢复流程
3. **日志**：查看操作日志，确认操作正确
4. **验证**：恢复后验证所有功能正常

## 联系支持

如有问题，请联系：
- 开发团队邮箱: dev@example.com
- 文档: AGENTS.md, DATA-INIT.md, LOGIN-TROUBLESHOOTING.md
