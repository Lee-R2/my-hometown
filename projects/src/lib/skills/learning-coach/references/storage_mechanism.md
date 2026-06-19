# 学习记录存储机制

## 存储路径

### 默认路径
```
./学习记录/{YYYYMMDD}_{主题}.md
```

示例：
- `./学习记录/20260410_递归.md`
- `./学习记录/20260410_费曼学习法.md`

### 自定义路径

首次使用时询问用户：
> "学习记录保存在哪里？默认为 ./学习记录/，你也可以指定其他路径"

用户指定后，记录到 `./学习记录/.config.json`：
```json
{
  "storage_path": "./我的学习笔记/",
  "created_at": "2026-04-10T10:00:00",
  "owner": "用户昵称"
}
```

---

## 进度文件

### 位置
```
{存储路径}/.progress/{主题}_progress.json
```

### 内容结构
```json
{
  "topic": "递归",
  "created_at": "2026-04-10T10:00:00",
  "last_study_at": "2026-04-10T11:30:00",
  "total_minutes": 90,
  "review_count": 2,
  "mastery_level": "understanding",
  "next_review": "2026-04-13T10:00:00",
  "weak_points": ["边界条件判断"],
  "knowledge_connections": ["循环", "树遍历"],
  "template_used": "standard"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| topic | string | 学习主题 |
| created_at | datetime | 首次学习时间 |
| last_study_at | datetime | 最后学习时间 |
| total_minutes | integer | 累计学习时长（分钟） |
| review_count | integer | 复习次数 |
| mastery_level | string | 掌握程度：初学/understanding/掌握/精通 |
| next_review | datetime | 下次复习时间 |
| weak_points | array | 薄弱环节 |
| knowledge_connections | array | 关联的知识点 |
| template_used | string | 使用的模板类型 |

---

## 文件命名规范

### 概念卡文件
- 格式：`{YYYYMMDD}_{主题}.md`
- 示例：`20260410_递归.md`
- 规则：同一主题同一天多次学习，追加内容，不新建文件

### 进度文件
- 格式：`{主题}_progress.json`
- 示例：`递归_progress.json`
- 规则：每个主题一个进度文件，持续更新

---

## 存储操作流程

### 新学习
1. 检查 `{存储路径}/.config.json` 是否存在
2. 不存在则询问用户存储路径
3. 检查 `{存储路径}/{日期}_{主题}.md` 是否存在
4. 不存在则创建新文件
5. 创建进度文件 `{存储路径}/.progress/{主题}_progress.json`

### 断点续学
1. 读取进度文件
2. 检查概念卡文件
3. 告知用户上次学习进度
4. 继续学习流程

### 复习更新
1. 读取概念卡文件
2. 更新进度文件的 `review_count`、`last_study_at`
3. 更新概念卡的 `学习进度` 部分
4. 创建新的复习日程

---

## 错误处理

### 路径不存在
```
用户指定路径不存在：
1. 询问是否创建目录
2. 用户确认后创建
3. 用户拒绝则使用默认路径
```

### 文件损坏
```
进度文件损坏：
1. 尝试读取概念卡文件恢复
2. 无法恢复则提示用户重新学习
3. 备份损坏文件到 .backup/ 目录
```

### 权限问题
```
无写入权限：
1. 提示用户权限问题
2. 建议更换存储路径
3. 或使用只读模式（不保存进度）
```

---

## 备份策略

### 自动备份
- 每次复习后，将概念卡备份到 `{存储路径}/.backup/`
- 备份命名：`{YYYYMMDD}_{主题}_v{n}.md`
- 保留最近3个版本

### 手动备份
用户可随时要求备份当前学习记录：
> "帮我把学习记录备份一下"
