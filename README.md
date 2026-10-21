# 于典 · 个人网站

一个深色星空主题的个人展示网站，包含个人信息、技能、项目与博客，并自带一个完整的内容管理后台。

整站**零第三方依赖**：前端使用原生 HTML / CSS / JavaScript，后端仅用 Node.js 内建模块与内置 SQLite。没有构建步骤，克隆下来即可运行。

---

## 快速开始

需要 **Node.js 22.13+**（推荐 Node.js 24，内置 `node:sqlite` 已稳定可用）。

```bash
npm start
```

打开：

- 前台：<http://localhost:3000>
- 后台：<http://localhost:3000/admin>

开发时可使用自动重启：

```bash
npm run dev
```

> 项目不需要 `npm install`，因为没有任何运行时依赖。

### 默认管理员

首次启动会自动创建管理员并写入数据库：

- 用户名：`admin`
- 密码：`admin123`

**登录后请立刻在「设置 → 修改密码」中更换密码。**

也可以在**首次启动前**通过环境变量自定义账号：

```powershell
# PowerShell
$env:ADMIN_USERNAME="yourname"; $env:ADMIN_PASSWORD="your-strong-password"; npm start
```

```bash
# bash
ADMIN_USERNAME=yourname ADMIN_PASSWORD='your-strong-password' npm start
```

只有在数据库尚未创建时，这两个变量才会生效。

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
- **个人信息**：姓名、身份、一句话介绍、Markdown 简介、所在地、邮箱、状态、头像、简历链接、社交链接
- **技能**：新增、编辑、删除、上下排序
- **项目**：新增、编辑、删除、上下排序、精选项目、封面图、技术栈、演示 / 源码链接
- **博客**：Markdown 编辑与实时预览、草稿 / 发布、标签、封面、日期、自定义链接标识
- **留言收件箱**：未读标记、回复邮件、删除
- **数据备份**：一键导出全部内容为 JSON
- 图片上传（头像 / 封面），服务端校验真实文件类型与大小

示例文字、项目与文章均为占位内容，请登录后台替换成你自己的信息（尤其是邮箱与社交链接）。

---

## 目录结构

```text
.
├── server.js            # HTTP 服务、静态文件、安全响应头
├── lib/
│   ├── api.js           # REST API、鉴权、上传、内容校验
│   ├── auth.js          # scrypt 密码哈希、会话 token、限流
│   └── db.js            # SQLite 建表与首次启动示例数据
├── public/
│   ├── index.html       # 前台页面
│   ├── admin.html       # 后台页面
│   ├── 404.html
│   ├── css/
│   │   ├── style.css
│   │   └── admin.css
│   ├── js/
│   │   ├── main.js      # 前台交互
│   │   ├── admin.js     # 后台交互
│   │   ├── starfield.js # 星空 Canvas
│   │   ├── markdown.js  # 安全的 Markdown 渲染
│   │   └── not-found.js
│   └── assets/          # 头像、图标、项目封面
├── data/                # SQLite 数据库（自动创建）
└── uploads/             # 后台上传的图片（自动创建）
```

### 数据与备份

- 数据库：`data/portfolio.db`（另有 WAL 文件）
- 上传图片：`uploads/`
- 完整备份：停止服务后复制 `data/` 与 `uploads/`；或登录后台在「设置 → 数据备份」导出 JSON

---

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址，反向代理场景建议 `127.0.0.1` |
| `ADMIN_USERNAME` | `admin` | 首次启动创建的管理员用户名 |
| `ADMIN_PASSWORD` | `admin123` | 首次启动创建的管理员密码 |
| `COOKIE_SECURE` | 未设置 | 设为 `1` 时 Cookie 强制 `Secure`（HTTPS 下使用） |

项目不会自动读取 `.env` 文件；请通过 shell、systemd 或容器环境变量设置。

---

## 安全说明

已实现：

- 密码使用 `scrypt` 加盐哈希，永不存储明文
- 会话 token 只以 SHA-256 哈希形式入库，Cookie 为 `HttpOnly` + `SameSite=Lax`，有效期 7 天
- 登录限流（10 分钟 8 次）、联系表单限流（10 分钟 5 次）
- 所有写操作校验同源 `Origin`
- 静态文件路径穿越防护；上传文件校验 magic bytes，限制 8MB，拒绝 SVG
- 全局 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`
- Markdown 渲染先转义 HTML，仅允许 `http(s)` / `mailto` / 站内相对链接

上线前请务必：

1. 修改默认密码
2. 配置 HTTPS，并设置 `COOKIE_SECURE=1`
3. 不要把 `data/` 与 `uploads/` 提交到公开仓库
4. 定期备份数据库和图片

---

## 部署示例

### systemd（Linux）

```ini
[Unit]
Description=Yudian Portfolio
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/yudian
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=COOKIE_SECURE=1
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

### Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

静态资源由 Node 直接提供，个人站点规模下无需额外配置缓存层。

---

## 技术说明

- **SQLite**：使用 Node.js 内置 `node:sqlite` 的 `DatabaseSync`，开启 WAL
- **API**：`/api/site`、`/api/posts/:slug`、`/api/contact`，后台接口位于 `/api/admin/*`
- **图片**：上传后写入 `uploads/`，通过 `/uploads/<filename>` 提供，长缓存
- **Markdown**：自行实现的轻量渲染器，支持标题、列表、引用、代码块、链接、图片、粗体 / 斜体 / 删除线
- **无框架**：所有页面由原生 JavaScript 渲染，首屏数据来自单个 JSON 接口

---

## 常见问题

**端口被占用？**
`PORT=3001 npm start`（PowerShell 使用 `$env:PORT="3001"; npm start`）。

**忘记后台密码？**
停止服务，删除 `data/portfolio.db` 会丢失内容，不推荐。更稳妥的方式是先用后台导出的 JSON 备份，再重建数据库并通过 SQLite 工具重置密码哈希。也可以直接用 Node 计算新哈希后更新 `admin` 表。

**上传图片失败？**
确认图片是 PNG / JPG / WebP / GIF 且小于 8MB。SVG 出于安全原因不支持上传，可手动放入 `public/assets/` 后填写路径。

**想改主题色？**
修改 `public/css/style.css` 顶部 `:root` 中的 `--accent`、`--accent-2`、`--gradient` 等变量。
