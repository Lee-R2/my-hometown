# 登录问题快速诊断指南

## 问题描述
登录时仍然提示"用户名不存在"或"小队编码不存在"。

## 快速诊断步骤

### 步骤 1：检查数据库状态

```bash
# 诊断数据库表状态
curl http://localhost:5000/api/diagnostics/db
```

检查返回结果中的：
- `tables.users.status` 应该是 "ok"
- `tables.users.count` 应该大于 0
- `users.sample` 应该显示用户数据

### 步骤 2：检查用户数据

```bash
# 查看所有用户
curl http://localhost:5000/api/init-users
```

如果 `count: 0`，说明数据库中没有用户，需要初始化：

```bash
# 初始化用户数据
curl -X POST http://localhost:5000/api/init-users
```

### 步骤 3：测试用户查询

```bash
# 测试查询用户 "admin"
curl -X POST http://localhost:5000/api/test/user-query \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'
```

检查返回结果中的：
- `exactMatch.found` 应该是 true
- `ilikeMatch.found` 应该是 true

### 步骤 4：测试登录

```bash
# 测试管理员登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'
```

## 常见问题和解决方案

### 问题 1：数据库中没有数据

**症状**：`/api/init-users` 返回 `count: 0`

**解决方案**：
```bash
curl -X POST http://localhost:5000/api/init-users
curl -X POST http://localhost:5000/api/init-teams
```

### 问题 2：表不存在

**症状**：诊断返回 `tables.users.status: "error"`

**解决方案**：
```bash
# 检查 Supabase 数据库配置
# 确认 users 表和 teams 表已创建
```

### 问题 3：查询大小写问题

**症状**：精确匹配失败，但不区分大小写匹配成功

**解决方案**：登录 API 已自动支持不区分大小写匹配，无需额外操作

### 问题 4：用户名格式验证失败

**症状**：输入正确的用户名仍然提示"用户名格式不正确"

**解决方案**：
- 确保用户名只包含：字母、数字、下划线、@、点、破折号
- 不要包含空格或其他特殊字符

### 问题 5：数据库连接问题

**症状**：所有查询都返回错误

**解决方案**：
```bash
# 检查环境变量
# 确认 Supabase URL 和 Key 配置正确
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
```

## 完整初始化流程

如果是全新的数据库，请按以下顺序初始化：

```bash
# 1. 诊断数据库状态
curl http://localhost:5000/api/diagnostics/db

# 2. 初始化用户数据
curl -X POST http://localhost:5000/api/init-users

# 3. 初始化小队数据
curl -X POST http://localhost:5000/api/init-teams

# 4. 修复账号状态
curl -X POST http://localhost:5000/api/migrate/account-status

# 5. 迁移密码（可选）
curl -X POST http://localhost:5000/api/migrate/all-passwords

# 6. 验证数据
curl http://localhost:5000/api/init-users
curl http://localhost:5000/api/init-teams

# 7. 测试查询
curl -X POST http://localhost:5000/api/test/user-query \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'

# 8. 测试登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}'
```

## 调试日志

如果问题仍然存在，查看日志：

```bash
# 查看应用日志
tail -f /app/work/logs/bypass/app.log

# 查看控制台日志
tail -f /app/work/logs/bypass/console.log
```

## 联系支持

如果以上步骤都无法解决问题，请提供以下信息：

1. 数据库诊断结果：`curl http://localhost:5000/api/diagnostics/db`
2. 用户查询结果：`curl http://localhost:5000/api/test/user-query -d '{"username": "admin"}'`
3. 登录尝试的完整响应
4. 应用日志错误信息

联系方式：
- 开发团队邮箱: dev@example.com
- 文档: AGENTS.md, DATA-INIT.md
