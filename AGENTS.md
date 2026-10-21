# AGENTS.md

面向在本仓库中工作的 AI 代理与协作者。目标：在不破坏免费额度、安全基线与零依赖约束的前提下安全地修改站点。

---

## 1. 项目速览

- 深色星空主题的个人站点：个人介绍、技能、项目、博客，带内容管理后台。
- 运行时：**Cloudflare Workers + D1 + Static Assets**，无前端框架、无运行时依赖。
- 唯一开发依赖：`wrangler`。
- 生产入口：`worker/index.js`；静态文件在 `public/`。
- 文档：`PRD.md`（需求）、`TECH_DESIGN.md`（实现）。

---

## 2. 常用命令

```bash
npm install                 # 只装 wrangler
npx wrangler dev            # http://127.0.0.1:8787，本地 D1 在 .wrangler/state
npx wrangler deploy --dry-run   # 只构建，校验打包与绑定
npx wrangler versions upload    # 远端校验绑定，不上生产流量
npx wrangler deploy         # 本地直发生产
npx wrangler tail           # 线上日志
npx wrangler d1 execute yudian-portfolio --remote --command "SELECT 1"
```

- 同一目录**只能运行一个** `wrangler dev`。第二个实例会抢端口并删除对方 `.wrangler/tmp` 打包产物，表现为 `workerd` 崩溃或 `Could not resolve "...middleware-loader.entry.ts"`。启动前先检查 8787 端口。
- 改了 `wrangler.toml`（绑定、名称、vars）必须重启 dev 进程。

---

## 3. 架构地图

```text
worker/index.js   入口：/api/* → api.js；/admin、/ → 静态页；其余 → ASSETS；统一安全头
worker/api.js     全部 REST 路由、参数校验、鉴权、限流、JSON 导出
worker/auth.js    PBKDF2、会话 token、SHA-256、D1 固定窗口限流
worker/db.js      ensureDatabase：DDL + 种子 + 管理员（每 isolate 一次）
worker/schema.js  幂等 DDL
worker/seed.js    示例内容
public/           index.html / admin.html / 404.html / css / js / assets / _headers
wrangler.toml     name、assets、D1 绑定、vars
```

前端：`public/js/main.js`（首页与 Hash 路由）、`public/js/admin.js`（后台）、`public/js/markdown.js`（安全 Markdown）、`public/js/starfield.js`（Canvas）。

`server.js`、`lib/`、`data/`、`uploads/` 是旧 Node 实现，仅作历史保留，不要在新功能里引用。

---

## 4. 硬性约束（不要违反）

1. **不新增运行时依赖或前端框架**。需要工具就写原生 JS；`wrangler` 之外不加 devDependencies。
2. **不恢复 R2 或任何图片上传**。头像 / 封面一律是图片地址（`/assets/...` 或 `https://...`）。恢复上传会让站点产生订阅费用，违背产品目标。
3. **不降低安全基线**：全站安全头、同源校验、后台会话校验、登录与留言限流、Markdown 转义，都不能为了省事删掉。
4. **免费计划 CPU 预算 10 ms**：不要把 PBKDF2 轮数调高（当前 25,000），也不要在请求路径里做重计算。新增初始化逻辑要保持轻量。
5. **表结构必须幂等**：`worker/schema.js` 只能写可重复执行的语句（`CREATE ... IF NOT EXISTS`），因为每个 isolate 首次请求都会执行。
6. **种子只在空库写入**：`seed.js` 的写入条件由 `skills` 是否为空决定，不要改成每次请求都写。
7. **不提交本地状态**：`.wrangler/`、`data/`、`uploads/`、`.dev.vars`、`tmp-*` 已被 `.gitignore` 忽略，不要强行加入版本库。
8. **中文界面与中文文案**，代码里已有的中文错误提示保持风格一致。

---

## 5. 修改指南

**新增/修改一个内容字段**（例如给项目加一个 `status`）需要同步五处：

1. `worker/schema.js`：加列（必须是幂等写法；D1 无 `ADD COLUMN IF NOT EXISTS`，需要用 `PRAGMA table_info` 判断或新建表方案）。
2. `worker/seed.js`：示例数据。
3. `worker/api.js`：`mapProject` 等映射、写入校验、INSERT/UPDATE 语句。
4. `public/admin.html` + `public/js/admin.js`：表单与提交字段。
5. `public/js/main.js` 或 `public/index.html`：前台渲染。
6. `README.md` / `PRD.md` / `TECH_DESIGN.md`：如果影响用户可见行为。

**新增 API**：

- 放在 `worker/api.js` 的 `route()` 中，沿用 `HttpError` + `json()`。
- 写操作（非 GET/HEAD）已由入口统一做同源校验；后台接口必须显式 `await requireSession(request, env)`。
- 入参用现有 `text()` / `safeUrl()` / `toInt()` / `toTagList()`，不要手写裸校验。
- 任何新表或新查询都要考虑每天 10 万行写 / 500 万行读的免费额度。

**新增静态资源**：直接放 `public/`，命中后不执行 Worker；需要特殊响应头时改 `public/_headers`。

**改路由**：注意静态资源优先。真实存在的文件不会被 Worker 看到；`/uploads/*` 已被移除，不要重新引入。

---

## 6. 验证清单

改完后按顺序做：

1. `npx wrangler deploy --dry-run`：确认打包、绑定、体积正常。
2. 本地重启 dev，跑接口冒烟（站点数据、留言与蜜罐、登录/登出/改密、技能/项目/文章 CRUD 与排序、草稿可见性、slug 去重、导出、404、CSP/HSTS、越权 401）。
3. 浏览器检查：`/` 渲染正常，`#/post/<slug>` 可直达，`/admin` 登录后各面板可保存；封面只接受地址。
4. 若改动涉及远端绑定，用 `npx wrangler versions upload` 校验，不要直接 `deploy`。

---

## 7. 部署注意事项

- `wrangler.toml` 的 `name` 必须与 Cloudflare 上的 Worker / Workers Builds 项目名一致（当前为 `test`）。不一致时 CI 会用项目名覆盖并给出警告。
- D1 的 `database_id` 必须是真实值；占位 UUID 会触发 `code: 10181`。
- 线上管理员密码来自 `ADMIN_PASSWORD` secret。**站点第一次被访问前**必须设置，否则默认密码会写进 D1；之后改密码只能走后台。
- 部署由 `git push` 触发 Workers Builds（构建命令 `npx wrangler deploy`）。
- 生产变更前先确认没有本地未提交的改动被一起带上去。

---

## 8. 危险操作

以下操作需要人类明确同意后再执行：

- 删除或重建 D1 数据库、执行 `DELETE` / `DROP`。
- 修改线上 secret、修改 Worker 名称、切换域名。
- 重新引入 R2 / KV / Images 等付费或计量产品。
- 大面积重写前端或更换技术栈。
