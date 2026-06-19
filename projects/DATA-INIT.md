# 数据初始化指南

## 问题描述

如果登录时提示"用户名不存在"或"小队编码不存在"，说明数据库中没有用户或小队数据。

## 快速解决方案

### 1. 查看当前数据状态

**查看用户列表**
```bash
curl http://localhost:5000/api/init-users
```

**查看小队列表**
```bash
curl http://localhost:5000/api/init-teams
```

如果返回 `count: 0`，说明数据库中没有数据，需要初始化。

### 2. 初始化测试数据

**初始化用户数据**
```bash
curl -X POST http://localhost:5000/api/init-users
```

这将创建以下测试用户：

| 用户名 | 密码 | 姓名 | 角色 |
|--------|------|------|------|
| admin | 123456 | 超级管理员 | super_admin |
| teacher1 | 123456 | 张老师 | teacher |
| teacher2 | 123456 | 李老师 | teacher |
| volunteer1 | 123456 | 王志愿者 | volunteer |
| volunteer2 | 123456 | 赵志愿者 | volunteer |

**初始化小队数据**
```bash
curl -X POST http://localhost:5000/api/init-teams
```

这将创建以下测试小队：

| 小队编码 | 密码 | 小队名称 |
|----------|------|----------|
| TEAM001 | 123456 | 探索者小队 |
| TEAM002 | 123456 | 创新者小队 |
| TEAM003 | 123456 | 未来星小队 |

### 3. 验证数据初始化

```bash
# 查看用户列表
curl http://localhost:5000/api/init-users

# 查看小队列表
curl http://localhost:5000/api/init-teams
```

### 4. 测试登录

**管理员登录**
- 访问：`http://localhost:5000/admin/login`
- 用户名：`admin`
- 密码：`123456`

**小队登录**
- 访问：`http://localhost:5000/team/login`
- 小队编码：`TEAM001`
- 密码：`123456`

## 强制重新初始化

如果需要重新初始化数据（会删除现有数据）：

```bash
# 强制初始化用户数据
curl -X POST http://localhost:5000/api/init-users \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# 强制初始化小队数据
curl -X POST http://localhost:5000/api/init-teams \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

⚠️ **警告**：`force=true` 会删除所有现有数据，请谨慎使用！

## 完整初始化流程

对于全新的数据库，建议按以下顺序初始化：

```bash
# 1. 初始化用户数据
curl -X POST http://localhost:5000/api/init-users

# 2. 初始化小队数据
curl -X POST http://localhost:5000/api/init-teams

# 3. 修复账号状态（如果需要）
curl -X POST http://localhost:5000/api/migrate/account-status

# 4. 迁移密码（可选，提高安全性）
curl -X POST http://localhost:5000/api/migrate/all-passwords

# 5. 验证所有数据
curl http://localhost:5000/api/init-users
curl http://localhost:5000/api/init-teams
curl http://localhost:5000/api/migrate/account-status
curl http://localhost:5000/api/migrate/all-passwords
```

## 常见问题

### Q1: 初始化失败怎么办？

**A:** 检查以下几点：
1. 确认数据库连接正常
2. 检查 users 和 teams 表是否存在
3. 查看返回的错误信息

### Q2: 可以添加自定义用户吗？

**A:** 可以。使用以下方式：
1. 通过管理后台添加用户
2. 直接在数据库中插入记录
3. 修改 `defaultUsers` 数组重新初始化

### Q3: 密码可以修改吗？

**A:** 可以。修改方式：
1. 用户登录后在个人中心修改密码
2. 管理员在用户管理页面重置密码
3. 直接在数据库中更新 password 字段（需要哈希）

### Q4: 如何删除测试数据？

**A:** 使用以下命令：
```bash
# 通过数据库直接删除
# DELETE FROM users WHERE username IN ('admin', 'teacher1', 'teacher2', 'volunteer1', 'volunteer2');
# DELETE FROM teams WHERE code IN ('TEAM001', 'TEAM002', 'TEAM003');
```

### Q5: 初始密码是什么？

**A:** 所有测试用户的初始密码都是 `123456`。

## 数据安全建议

1. **生产环境**：不要使用默认密码，立即修改所有初始密码
2. **定期备份**：定期备份数据库
3. **密码策略**：实施强密码策略
4. **权限控制**：限制数据库访问权限

## 联系支持

如有问题，请联系：
- 开发团队邮箱: dev@example.com
- 文档: AGENTS.md
