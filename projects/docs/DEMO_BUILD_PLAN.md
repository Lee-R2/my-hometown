# DEMO 制作方案 — 执行清单

> 配套文档：[DEMO_POST.md](./DEMO_POST.md)
> 目标：完成初赛发帖所需的全部素材（体验链接 + 5 张截图 + 5 个 Session ID + 部署）

---

## 一、时间表与优先级

| # | 任务 | 优先级 | 预估时间 | 依赖 |
|---|---|---|---|---|
| 1 | 部署到 Vercel，获取公开体验链接 | P0 | 30 分钟 | Supabase 数据库已就绪 ✓ |
| 2 | 收集 5 个关键任务 Session ID | P0 | 20 分钟 | 回溯 TRAE 对话历史 |
| 3 | 截图 5 张开发关键步骤 | P0 | 30 分钟 | 开发服务器运行中 ✓ |
| 4 | 录制体验视频（可选，用于抖音通道） | P1 | 30 分钟 | 体验链接可用 |
| 5 | 按模板填写并发布 Demo 帖 | P0 | 30 分钟 | 1+2+3 完成 |
| 6 | 抖音发布 + 填飞书问卷（可选） | P2 | 20 分钟 | 4 完成 |

---

## 二、任务 1：部署到 Vercel

### 2.1 前置检查

- [x] Supabase 数据库已就绪（15 个迁移文件已执行）
- [x] 环境变量已配置（`.env.local`）
- [ ] Vercel 账号已注册

### 2.2 部署步骤

```bash
# 1. 确保代码可构建
cd "c:\Users\李文渊\Desktop\our home\projects"
npx next build

# 2. 推送到 GitHub（如未推送）
git add .
git commit -m "feat: ready for demo deployment"
git push origin main

# 3. 在 Vercel 控制台操作
# - 访问 https://vercel.com/new
# - Import GitHub 仓库
# - Framework Preset: Next.js
# - Root Directory: projects
# - Environment Variables: 复制 .env.local 中所有变量
# - Deploy
```

### 2.3 部署后验证清单

部署完成后，访问 Vercel 分配的域名，验证以下功能：

- [ ] `https://<domain>.vercel.app/` 首页可访问
- [ ] `https://<domain>.vercel.app/api/health` 返回 `{"status":"ok"}`
- [ ] `https://<domain>.vercel.app/admin/login` 管理员登录页可访问
- [ ] 使用 `admin / 123456` 登录成功
- [ ] 使用 `20261001 / 123456` 小队登录成功
- [ ] 蜡象助手右下角悬浮按钮可见
- [ ] 银蛇博士右下角悬浮按钮可见

### 2.4 填入发帖文档

将 `<your-domain>` 替换为实际 Vercel 域名，填入 [DEMO_POST.md](./DEMO_POST.md) 第 3 节。

---

## 三、任务 2：收集 5 个关键 Session ID

### 3.1 如何获取 Session ID

1. 打开 TRAE IDE
2. 在左侧对话历史中找到对应任务
3. **双击对话头像** → 复制 Session ID

### 3.2 推荐 5 个关键任务（任选 5 个）

按"开发难度 + 展示价值"排序，建议选以下 5 个：

| # | 任务主题 | 建议搜索关键词 | 对应发帖章节 |
|---|---|---|---|
| 1 | 项目架构搭建 + 数据库设计 | "Supabase" / "建表" / "迁移" | Session 1 |
| 2 | 角色权限系统（6 角色 + 16 模块） | "权限" / "role_permissions" / "DEFAULT_ROLE_CONFIGS" | Session 2 |
| 3 | 双智能体记忆系统重构 | "记忆" / "L1 L2 L3" / "石头主题" / "时间标签" | Session 3 |
| 4 | 角色端到端测试 + Bug 修复 | "role_e2e_test" / "市集 500" / "外键" | Session 4 |
| 5 | 项目架构文档生成 | "项目架构文档" / "5 个并行" | Session 5 |

### 3.3 替代方案

如果某个 Session 找不到，可用以下任务替代：

- 蜡象助手命令执行器（14 个内部 API）
- 银蛇博士跨智能体协作（agent_communications 表）
- 云朵市集设计（cloud_market_listings 表）
- 4 阶段任务链 + 任务组难度系统
- 周期机制（cycle+1，积分清零）

### 3.4 填入发帖文档

将 5 个 Session ID 填入 [DEMO_POST.md](./DEMO_POST.md) 第 4.3 节的 `[Session X]` 占位符。

---

## 四、任务 3：截图 5 张开发关键步骤

### 4.1 截图清单

| # | 截图主题 | 截图内容 | 用途 | 拍摄方式 |
|---|---|---|---|---|
| 1 | 项目架构 — 数据库设计 | `supabase/migrations/` 文件夹 + 000_init_all_tables.sql 内容（显示 48 张表） | 展示数据库规模 | VS Code 文件树 + 代码 |
| 2 | 双智能体记忆架构 | `src/app/api/ai/chat/lib/memory.ts` 的 4 层记忆代码 + 时间标签 `formatTimeLabel` 函数 | 展示 AI 记忆系统 | VS Code 代码截图 |
| 3 | 蜡象助手对话 — 数据洞察 | 浏览器中打开管理员端，与蜡象助手对话"现在有几支小队还没提交产出" | 展示 AI 实际效果 | 浏览器截图 |
| 4 | Bug 诊断与修复 | TRAE IDE 中展示 `role_e2e_test.js` 运行结果（32 通过 / 3 失败 → 修复后 32 通过） | 展示 TRAE 开发过程 | 终端截图 |
| 5 | 单元测试通过 | 终端运行 `npx vitest run` 显示 65/65 通过 | 展示工程质量 | 终端截图 |

### 4.2 拍摄要点

**截图 3（蜡象助手对话）**：
1. 启动开发服务器：`npx next dev --port 5000`
2. 浏览器打开 `http://localhost:5000/admin/login`
3. 登录 `admin / 123456`
4. 点击右下角蜡象助手悬浮按钮
5. 输入"现在有几支小队还没提交本周产出？"
6. 等待流式回复完成
7. 截图（包含对话 + 仪表盘背景）

**截图 4（Bug 诊断）**：
1. 终端运行 `node scripts/role_e2e_test.js`
2. 截图（显示 32 通过 / 0 失败的最终结果）
3. 如需展示"发现 Bug"过程，可截取修复前的失败状态

**截图 5（单元测试）**：
1. 终端运行 `npx vitest run`
2. 等待所有测试通过
3. 截图最后几行（显示 `Test Files 5 passed (5)` / `Tests 65 passed (65)`）

### 4.3 截图规范

- 分辨率：1920×1080 或更高
- 格式：PNG
- 大小：< 1MB（Vercel 社区限制）
- 命名：`screenshot-1-architecture.png` / `screenshot-2-memory.png` / `screenshot-3-laxiang.png` / `screenshot-4-bugfix.png` / `screenshot-5-tests.png`

### 4.4 上传与填入

1. 将 5 张截图保存到 `docs/screenshots/` 目录
2. 上传到图床（推荐 [imgur](https://imgur.com) 或 [sm.ms](https://sm.ms)）
3. 获取公开访问 URL
4. 将 URL 填入 [DEMO_POST.md](./DEMO_POST.md) 第 4.2 节的 `【截图位置 X】` 占位符

---

## 五、任务 4：录制体验视频（可选）

### 5.1 视频内容脚本（3 分钟）

| 时段 | 内容 | 操作 |
|---|---|---|
| 0:00-0:30 | 项目介绍 | 标题页 + 一句话简介 |
| 0:30-1:30 | 管理员端演示 | 登录 → 仪表盘 → 蜡象助手对话 |
| 1:30-2:30 | 小队端演示 | 登录 → 任务流 → 银蛇博士对话 |
| 2:30-3:00 | 家长端演示 | 登录 → 关注小队 → 查看进度 |

### 5.2 录制工具

- Windows：OBS Studio（免费）或 Bandicam
- macOS：QuickTime Player 或 OBS Studio

### 5.3 发布渠道

- Bilibili：上传后获取分享链接
- 抖音：带话题 `#vibecoding大赏 #traeai创造力大赛` @TRAE @抖音科技

---

## 六、任务 5：发布 Demo 帖

### 6.1 发布前检查清单

- [ ] 报名帖已通过审核（**前提条件**）
- [ ] 体验链接可公开访问（任务 1 完成）
- [ ] 5 个 Session ID 已填入（任务 2 完成）
- [ ] 5 张截图已上传并填入 URL（任务 3 完成）
- [ ] [DEMO_POST.md](./DEMO_POST.md) 所有占位符已替换
- [ ] 报名帖链接已附上

### 6.2 发布步骤

1. 访问 [TRAE 社区初赛专区](https://forum.trae.cn/c/38-category/40-category/40)
2. 点击"新建话题"
3. **标签**：选择 `社会服务`
4. **标题**：`【社会服务】我们的家园 — 面向乡村小学的 AI 协作 STEM 学习平台`
5. **正文**：粘贴 [DEMO_POST.md](./DEMO_POST.md) 全文（去掉 Markdown 代码块标记，保留格式）
6. **上传截图**：将 5 张截图拖入编辑器
7. **预览**：检查格式、链接、图片显示
8. **发布**

### 6.3 发布后动作

- [ ] 在帖子下方自顶一条评论，附上体验账号密码（方便评审快速体验）
- [ ] 分享到大赛交流群（如有）
- [ ] 监控帖子回复，及时回应评审疑问

---

## 七、任务 6：抖音人气通道（可选）

### 7.1 参与条件

- [x] 已通过大赛报名
- [x] 已在初赛专区提交 Demo 帖
- [ ] 抖音账号已注册

### 7.2 操作步骤

1. 在抖音发布图文或视频，内容为 Demo 介绍
2. 带话题：`#vibecoding大赏` `#traeai创造力大赛`
3. @TRAE @抖音科技
4. 填写 [飞书问卷](https://bytedance.larkoffice.com/share/base/form/shrcnzp18Sdf6XQxm8wGPPXDt4b) 申请流量扶持

### 7.3 人气分计算

```
人气分 = 点赞数 + 评论数 × 2 + 收藏数 + 转发数
```

- 最低门槛：单条点赞 ≥ 500
- 截止：2026-07-15 23:59:59

---

## 八、最终交付物清单

| # | 交付物 | 路径 / 链接 | 状态 |
|---|---|---|---|
| 1 | Demo 发帖文档 | [docs/DEMO_POST.md](./DEMO_POST.md) | ✅ 已完成 |
| 2 | Demo 制作方案 | [docs/DEMO_BUILD_PLAN.md](./DEMO_BUILD_PLAN.md) | ✅ 已完成 |
| 3 | 项目架构文档 | [docs/PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) | ✅ 已完成 |
| 4 | 角色端到端测试脚本 | [scripts/role_e2e_test.js](../scripts/role_e2e_test.js) | ✅ 已完成 |
| 5 | 体验链接 | `https://<your-domain>.vercel.app/` | ⬜ 待部署 |
| 6 | 5 张截图 | `docs/screenshots/` | ⬜ 待拍摄 |
| 7 | 5 个 Session ID | 填入 DEMO_POST.md | ⬜ 待收集 |
| 8 | 社区发帖 | TRAE 社区初赛专区 | ⬜ 待发布 |
| 9 | 抖音视频（可选） | 抖音平台 | ⬜ 待录制 |

---

## 九、风险与应对

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| Vercel 部署失败（环境变量缺失） | 中 | 高 | 本地 `npx next build` 验证后再部署 |
| 体验链接被墙 | 低 | 高 | 备用方案：打包 HTML 文件上传社区 |
| Session ID 找不到（对话已覆盖） | 中 | 中 | 选其他关键任务替代（见 3.3） |
| 截图体积过大 | 低 | 低 | 使用 [TinyPNG](https://tinypng.com) 压缩 |
| 社区发帖格式错乱 | 低 | 低 | 先在 Markdown 预览器检查再粘贴 |

---

## 十、时间建议

**建议在 2026-07-10 前完成所有准备工作**，留出 5 天缓冲时间应对意外。

```
Day 1-2：部署 + 截图 + Session ID 收集
Day 3：填写发帖文档 + 内部审核
Day 4：社区发帖 + 抖音视频（可选）
Day 5-15：监控 + 迭代 + 等待评审
```
