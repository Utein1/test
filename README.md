# 于典 · 个人网站

一个深色星空主题的个人展示网站，包含个人信息、技能、项目与博客，并自带一个完整的内容管理后台。

整站运行在 **Cloudflare Workers** 上：前端是原生 HTML / CSS / JavaScript，后端是一个 Worker 脚本，内容存在 **D1**（Cloudflare 的 SQLite），图片走静态资源目录。没有构建步骤、没有前端框架、没有第三方运行时依赖，全部能力都在 Cloudflare 免费额度内。

---

## 快速开始（本地）

需要 Node.js 20+。

```bash
npm install          # 只安装 wrangler 这一个开发依赖
npx wrangler dev     # 默认 http://127.0.0.1:8787
```

打开：

- 前台：<http://127.0.0.1:8787>
- 后台：<http://127.0.0.1:8787/admin>

本地数据保存在 `.wrangler/state/` 里，删掉这个目录即可恢复成初始示例内容。

### 默认管理员

首次访问时 Worker 会自动建表、写入示例内容并创建管理员：

- 用户名：`admin`
- 密码：`admin123`

**登录后请立刻在「设置 → 修改密码」中更换密码。**

想在首次初始化前就指定账号，可以在项目根目录建 `.dev.vars`（已被 git 忽略）：

```ini
ADMIN_USERNAME=yourname
ADMIN_PASSWORD=your-strong-password
```

也可以用 `wrangler secret` / 环境变量设置，见下文。

---

## 功能

### 前台

- Canvas 实时星空：星点闪烁、鼠标视差、随机流星，支持 `prefers-reduced-motion`
- 深色玻璃质感设计，桌面端与移动端自适应
- 首页个人介绍、头像卡片、技能进度、项目展示、博客列表、联系表单
- 博客文章阅读页（Hash 路由），支持 Markdown、阅读进度条、相关文章
- 联系表单留言直接进入后台收件箱
- 自定义 404 页面、SEO 基础标签、无障碍焦点样式

### 后台（`/admin`）

- 账号密码登录，可修改密码
- **个人信息**：姓名、身份、一句话介绍、Markdown 简介、所在地、邮箱、状态、头像地址、简历链接、社交链接
- **技能**：新增、编辑、删除、上下排序
- **项目**：新增、编辑、删除、上下排序、精选项目、封面图、技术栈、演示 / 源码链接
- **博客**：Markdown 编辑与实时预览、草稿 / 发布、标签、封面、日期、自定义链接标识
- **留言收件箱**：未读标记、删除
- **数据备份**：一键导出全部内容为 JSON

示例文字、项目与文章均为占位内容，请登录后台替换成你自己的信息（尤其是邮箱与社交链接）。

### 关于图片

为了保持零成本，站点**不使用对象存储，也没有文件上传接口**。头像、项目封面、文章封面都填写**图片地址**：

- 放进仓库：把图片放到 `public/assets/`（例如 `public/assets/covers/`），填写 `/assets/covers/your.svg`
- 使用外链：直接粘贴 `https://…` 地址（需允许外站图片，CSP 已放行 `https:`）

`public/` 下的静态资源由 Cloudflare 直接分发，请求免费且不限量。

---

## 目录结构

```text
.
├── wrangler.toml         # Worker 名称、D1 绑定、静态资源目录
├── worker/               # Cloudflare Workers 后端
│   ├── index.js          # 入口：API 路由、静态资源、安全响应头
│   ├── api.js            # REST API、鉴权、内容校验
│   ├── auth.js           # PBKDF2 密码哈希、会话 token、限流
│   ├── db.js             # 建表、首次访问写入示例数据、创建管理员
│   ├── schema.js         # D1 建表语句
│   └── seed.js           # 初始示例内容
├── public/               # 静态资源（直接由边缘分发）
│   ├── index.html        # 前台页面
│   ├── admin.html        # 后台页面
│   ├── 404.html
│   ├── _headers          # 静态资源响应头
│   ├── css/ js/ assets/
├── server.js / lib/      # 旧版 Node.js 实现，已被 Worker 取代，不再使用
└── data/ uploads/        # 旧版 Node 实现的数据目录，已无用
```

### 数据与备份

- 线上数据：Cloudflare D1（数据库名 `yudian-portfolio`）
- 备份：登录后台，在「设置」里点「下载数据备份」导出 JSON
- 本地数据：`.wrangler/state/`（可直接删除重建）

---

## 部署到 Cloudflare

全程免费额度即可。步骤：

```bash
# 1. 登录（会打开浏览器）
npx wrangler login

# 2. 创建 D1 数据库，把输出的 database_id 填进 wrangler.toml
npx wrangler d1 create yudian-portfolio

# 3. 设置管理员密码（务必在站点第一次被访问之前设置）
npx wrangler secret put ADMIN_PASSWORD

# 4. 部署
npx wrangler deploy
```

部署后会得到一个 `https://<worker名>.<子域>.workers.dev` 地址，也可以绑定自己的域名。

也可以在 Cloudflare Dashboard 里用 **Workers Builds** 连接这个 GitHub 仓库，构建命令填 `npx wrangler deploy`，之后每次 `git push` 自动部署。

注意：`wrangler.toml` 里的 `name` 需要和 Workers Builds 里的项目名一致；不一致时 wrangler 会用 CI 提供的名字覆盖并给出警告，不影响部署。

### 免费额度

- 静态资源请求：免费、不限量
- Worker（只有 `/api/*` 会执行）：10 万请求/天，单请求 10 ms CPU
- D1：500 万行读/天、10 万行写/天、总存储 5 GB（单库 500 MB）
- Workers Builds：3000 构建分钟/月

---

## 环境变量

Worker 通过 `wrangler.toml` 的 `[vars]` 和 secret 读取：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | `admin` | 首次初始化创建的管理员用户名 |
| `ADMIN_PASSWORD` | `admin123` | 首次初始化创建的管理员密码，生产环境请用 secret 设置 |

只有在 `admin` 表还是空的时候这两个变量才会生效。后续改密码请用后台的「修改密码」。

---

## 安全说明

已实现：

- 密码使用 PBKDF2-SHA256 加盐哈希（格式 `pbkdf2$轮数$盐$哈希`），永不存储明文
- 会话 token 只以 SHA-256 哈希形式入库，Cookie 为 `HttpOnly` + `SameSite=Lax`，有效期 7 天
- 登录限流（10 分钟 8 次）、联系表单限流（10 分钟 5 次），计数存在 D1，跨实例生效
- 所有写操作校验同源 `Origin`
- 全局 CSP、HSTS、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`
- Markdown 渲染先转义 HTML，仅允许 `http(s)` / `mailto` / 站内相对链接

上线前请务必：

1. 用 `wrangler secret put ADMIN_PASSWORD` 设置强密码
2. 确认 D1 里没有残留的 `admin` 行使用默认密码
3. 定期在后台导出 JSON 备份

---

## 技术说明

- **D1**：内容保存在 Cloudflare D1，首次请求时自动建表并写入示例数据
- **API**：`/api/site`、`/api/posts/:slug`、`/api/contact`，后台接口位于 `/api/admin/*`
- **Markdown**：自行实现的轻量渲染器，支持标题、列表、引用、代码块、链接、图片、粗体 / 斜体 / 删除线
- **无框架**：所有页面由原生 JavaScript 渲染，首屏数据来自单个 JSON 接口

---

## 常见问题

**端口被占用？**
`npx wrangler dev --port 8788`

**忘记后台密码？**
先设置新的 secret，再删掉 D1 里的管理员记录，让 Worker 用新密码重建：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler d1 execute yudian-portfolio --remote --command "DELETE FROM admin"
```

之后访问站点任意 `/api/*` 接口即可重建管理员。内容不会丢失。

**想改主题色？**
修改 `public/css/style.css` 顶部 `:root` 中的 `--accent`、`--accent-2`、`--gradient` 等变量。
