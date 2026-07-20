# Vercel 公网部署操作手册

## 一、前置条件

- GitHub 仓库：`Lee-R2/my-hometown`（代码已推送）
- Vercel 账号：访问 [vercel.com](https://vercel.com) 用 GitHub 账号登录
- 本地 `.env.local` 中的环境变量已准备好

---

## 二、部署步骤

### 步骤 1：打开 Vercel 导入页面

1. 访问 **https://vercel.com/new**
2. 用 GitHub 账号登录（首次会要求授权）

### 步骤 2：导入仓库

1. 在 "Import Git Repository" 列表中找到 `Lee-R2/my-hometown`
2. 如果看不到，点击 **Adjust GitHub App Permissions**，授权 Vercel 访问该仓库
3. 点击 **Import**

### 步骤 3：配置项目

| 配置项 | 值 |
|--------|-----|
| Framework Preset | Next.js（自动识别，不用改） |
| Root Directory | 点击 Edit，输入 `projects` |
| Build Command | 保持默认 |
| Output Directory | 保持默认 |
| Install Command | 保持默认 |

> **重要**：Root Directory 必须设置为 `projects`，因为代码在子目录中。

### 步骤 4：添加环境变量

在 "Environment Variables" 区域，逐个添加以下 6 个必填变量。

点击 "Add" 添加每一项，Name 填变量名，Value 填变量值。

#### 必填变量（6 个）

**变量 1**
- Name: `TOKEN_SECRET`
- Value: `<your-token-secret>`（运行 `openssl rand -hex 32` 生成 64 位十六进制字符串）

**变量 2**
- Name: `COZE_SUPABASE_URL`
- Value: `https://<your-project-ref>.supabase.co`（替换为你的 Supabase 项目 URL）

**变量 3**
- Name: `COZE_SUPABASE_ANON_KEY`
- Value: `<your-supabase-anon-key>`（从 Supabase Dashboard → Settings → API 获取）

**变量 4**
- Name: `COZE_SUPABASE_SERVICE_ROLE_KEY`
- Value: `<your-supabase-service-role-key>`（从 Supabase Dashboard → Settings → API 获取，**切勿泄露**）

**变量 5**
- Name: `AGENT_LAXIANG_ZHUSHOU_API_KEY`
- Value: `<your-agent-laxiang-zhushou-api-key>`

**变量 6**
- Name: `AGENT_YINSHE_BOSHI_API_KEY`
- Value: `<your-agent-yinshe-boshi-api-key>`

#### 可选变量（AI 扩展功能，按需添加）

**变量 7**
- Name: `COZE_WORKLOAD_IDENTITY_API_KEY`
- Value: `<your-ark-api-key>`

**变量 8**
- Name: `COZE_INTEGRATION_MODEL_BASE_URL`
- Value: `https://ark.cn-beijing.volces.com/api/v3`

### 步骤 5：部署

1. 点击 **Deploy** 按钮
2. 等待 2-3 分钟构建完成
3. 看到绿色 "Congratulations" 页面即部署成功
4. 记录分配的域名，格式类似：`https://my-hometown-xxx.vercel.app`

---

## 三、部署后配置（重要！）

### 步骤 6：配置 CORS 允许域名

1. 进入 Vercel 项目页面
2. 点击 **Settings** → **Environment Variables**
3. 添加新变量：
   - Name: `ALLOWED_ORIGINS`
   - Value: `https://你的实际域名.vercel.app`（替换为步骤 5 获得的域名）
4. 点击 **Save**

### 步骤 7：重新部署使配置生效

1. 进入 **Deployments** 页面
2. 点击最新部署右侧的 `...` 菜单
3. 选择 **Redeploy**
4. 等待构建完成

---

## 四、验证部署

### 步骤 8：功能验证

访问 `https://你的域名.vercel.app`，依次测试：

| 测试项 | 操作 | 预期结果 |
|--------|------|----------|
| 首页加载 | 直接访问域名 | 显示登录入口页面 |
| 管理员登录 | 用 `admin` / `123456` 登录 | 成功进入管理后台 |
| 小队登录 | 用小队编码和密码登录 | 成功进入小队面板 |
| 家长登录 | 用家长账号登录 | 成功进入家长面板 |
| AI 对话 | 在小队/管理后台与智能体对话 | 正常回复 |
| 黑板报 | 查看黑板报页面 | 正常加载帖子列表 |

---

## 五、常见问题

### Q1：构建失败，提示找不到模块

**原因**：Root Directory 未设置
**解决**：回到项目 Settings → General → Root Directory，设置为 `projects`，然后 Redeploy

### Q2：登录后提示 "CORS 禁止" 或 "CSRF 校验失败"

**原因**：`ALLOWED_ORIGINS` 未配置或域名不匹配
**解决**：按步骤 6 添加 `ALLOWED_ORIGINS`，值为你的 Vercel 域名（含 `https://`），然后 Redeploy

### Q3：页面能打开但 AI 对话无响应

**原因**：AI 智能体 API Key 未配置或失效
**解决**：检查环境变量 `AGENT_LAXIANG_ZHUSHOU_API_KEY` 和 `AGENT_YINSHE_BOSHI_API_KEY` 是否正确

### Q4：数据库操作失败

**原因**：Supabase 环境变量未配置
**解决**：检查 `COZE_SUPABASE_URL`、`COZE_SUPABASE_ANON_KEY`、`COZE_SUPABASE_SERVICE_ROLE_KEY` 是否正确

### Q5：部署后页面白屏

**原因**：可能是 `TOKEN_SECRET` 未配置
**解决**：检查 `TOKEN_SECRET` 环境变量是否存在且非空

---

## 六、更新部署

以后每次向 GitHub `main` 分支推送代码，Vercel 会**自动触发重新部署**。

手动部署：在 Vercel 项目页面 → Deployments → 点击 `...` → Redeploy

---

## 七、自定义域名（可选）

1. 进入项目 Settings → Domains
2. 输入你的域名（如 `www.example.com`）
3. 按提示在域名服务商添加 DNS 记录：
   - 类型：`CNAME`
   - 名称：`www`
   - 值：`cname.vercel-dns.com`
4. 等待 DNS 生效（通常几分钟到几小时）
5. Vercel 自动配置 HTTPS 证书
6. 更新环境变量 `ALLOWED_ORIGINS` 加入自定义域名

---

## 八、快速参考

| 项目 | 值 |
|------|-----|
| GitHub 仓库 | `Lee-R2/my-hometown` |
| 代码目录 | `projects/` |
| 框架 | Next.js 16.1.1 |
| 数据库 | Supabase（云） |
| 管理员账号 | `admin` / `123456` |
| Vercel 控制台 | https://vercel.com/dashboard |
| 项目文档 | [DEMO_POST.md](./DEMO_POST.md) |
