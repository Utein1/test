// Initial content for D1. Rows use fixed ids so re-seeding is idempotent.
export const seedProfile = {
  "id": 1,
  "name": "于典",
  "role": "全栈开发者 · 独立创造者",
  "tagline": "把想法写成能用的产品，也把夜空写进屏幕里。",
  "bio": "你好，我是**于典**，一名喜欢产品、设计与工程的全栈开发者。\n\n我喜欢把复杂的想法拆解成简单、好用、好看的网页与应用。对我来说，写代码不只是实现功能，更是在打磨一种体验——让每一次点击都自然，让每一个页面都能呼吸。\n\n- 关注细节，追求简洁克制的设计\n- 习惯用自动化解决重复劳动\n- 保持好奇，持续学习并把过程记录下来",
  "location": "中国 · 远程",
  "email": "hello@yudian.dev",
  "avatar_url": "/assets/avatar.svg",
  "resume_url": "",
  "status": "开放合作中",
  "socials": "[{\"label\":\"GitHub\",\"url\":\"https://github.com/\"},{\"label\":\"邮箱\",\"url\":\"mailto:hello@yudian.dev\"}]",
  "updated_at": "2026-10-21T03:10:35.705Z"
};

export const seedSkills = [
  {
    "id": 1,
    "category": "前端",
    "name": "HTML / CSS",
    "level": 92,
    "sort": 10
  },
  {
    "id": 2,
    "category": "前端",
    "name": "JavaScript",
    "level": 90,
    "sort": 20
  },
  {
    "id": 3,
    "category": "前端",
    "name": "Vue 3",
    "level": 86,
    "sort": 30
  },
  {
    "id": 4,
    "category": "前端",
    "name": "TypeScript",
    "level": 80,
    "sort": 40
  },
  {
    "id": 5,
    "category": "前端",
    "name": "React",
    "level": 76,
    "sort": 50
  },
  {
    "id": 6,
    "category": "后端",
    "name": "Node.js",
    "level": 88,
    "sort": 60
  },
  {
    "id": 7,
    "category": "后端",
    "name": "Python",
    "level": 76,
    "sort": 70
  },
  {
    "id": 8,
    "category": "后端",
    "name": "PostgreSQL",
    "level": 74,
    "sort": 80
  },
  {
    "id": 9,
    "category": "后端",
    "name": "Redis",
    "level": 68,
    "sort": 90
  },
  {
    "id": 10,
    "category": "工程化",
    "name": "Git",
    "level": 90,
    "sort": 100
  },
  {
    "id": 11,
    "category": "工程化",
    "name": "Vite",
    "level": 84,
    "sort": 110
  },
  {
    "id": 12,
    "category": "工程化",
    "name": "Linux",
    "level": 78,
    "sort": 120
  },
  {
    "id": 13,
    "category": "工程化",
    "name": "Docker",
    "level": 72,
    "sort": 130
  },
  {
    "id": 14,
    "category": "工程化",
    "name": "Figma",
    "level": 70,
    "sort": 150
  }
];

export const seedProjects = [
  {
    "id": 1,
    "title": "星轨 · 个人站点系统",
    "summary": "你正在浏览的这个网站：深色星空、零依赖后端、自带内容管理后台。",
    "description": "一个刻意保持轻量的个人站点。前端只用原生 HTML / CSS / JavaScript，后端基于 Node.js 内建模块与 SQLite，没有任何第三方运行时依赖。\n\n- 星空由 Canvas 实时绘制，支持视差、闪烁与流星\n- 页面所有文案、技能、项目、博客都可以在后台修改\n- 管理后台包含内容 CRUD、图片上传、留言收件箱与密码修改",
    "tech": "[\"Node.js\",\"SQLite\",\"Canvas\",\"原生 JS\"]",
    "cover_url": "/assets/covers/orbit.svg",
    "demo_url": "",
    "repo_url": "",
    "year": "2026",
    "featured": 1,
    "sort": 10,
    "created_at": "2026-10-21T03:01:54.052Z"
  },
  {
    "id": 2,
    "title": "TaskLite · 极简任务看板",
    "summary": "本地优先的轻量看板，支持拖拽、离线使用与键盘操作。",
    "description": "一个专注于「打开就能用」的任务看板。数据保存在浏览器本地，断网也能继续工作。",
    "tech": "[\"Vue 3\",\"IndexedDB\",\"PWA\"]",
    "cover_url": "/assets/covers/kanban.svg",
    "demo_url": "",
    "repo_url": "",
    "year": "2025",
    "featured": 0,
    "sort": 20,
    "created_at": "2026-10-21T03:01:54.052Z"
  },
  {
    "id": 3,
    "title": "Pulse · 可用性监控",
    "summary": "定时探活、异常告警与对外状态页，部署在一台小服务器上。",
    "description": "为个人项目做的最小可用性监控：定时请求目标站点，记录响应时间，异常时推送通知，并生成一个公开状态页。",
    "tech": "[\"Node.js\",\"PostgreSQL\",\"Docker\"]",
    "cover_url": "/assets/covers/pulse.svg",
    "demo_url": "",
    "repo_url": "",
    "year": "2025",
    "featured": 0,
    "sort": 30,
    "created_at": "2026-10-21T03:01:54.052Z"
  }
];

export const seedPosts = [
  {
    "id": 1,
    "title": "你好，世界：为什么我又搭了一个个人网站",
    "slug": "hello-world",
    "excerpt": "在信息流之外，留一块完全属于自己的地方。聊聊这个站点的由来，以及它为什么被做得这么轻。",
    "content": "# 你好，世界\n\n每隔一段时间，我都会重新做一个个人网站。不是因为上一个不能用了，而是因为每隔一段时间，我对「自己想留下什么」这件事的理解都会变化。\n\n## 为什么还要一个网站\n\n社交平台适合传播，不适合沉淀。一条动态很快会被新的内容覆盖，而一篇认真写下的文章，可以安静地待在某个 URL 里，等需要它的人找到。\n\n所以这里更像是一间自己的房间：\n\n- 放得下完整的项目说明，而不是被截断的九宫格\n- 放得下长一点的思考，而不是被压缩的短句\n- 也可以什么都不放，只留一片星空\n\n## 关于「轻」\n\n这次最重要的一个决定是：**不引入任何前端框架和第三方依赖**。\n\n整站由三部分组成：\n\n1. 原生 HTML / CSS / JavaScript 写的页面\n2. Node.js 内建 http 模块写的小后端\n3. Node.js 内建 SQLite 持久化数据\n\n没有构建步骤，没有 `node_modules`，克隆下来 `node server.js` 就能跑。性能不是唯一目的，更重要的是：几年后回来，它大概率还能直接运行。\n\n## 接下来\n\n我会在这里记录一些开发中的取舍、踩过的坑，以及一些与代码无关的生活片段。\n\n如果你也在考虑做一个自己的网站，别等设计稿完美。先把第一行字写下来，剩下的会慢慢长出来。",
    "tags": "[\"随笔\",\"独立开发\"]",
    "cover_url": "",
    "published": 1,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T10:00:00.000Z"
  },
  {
    "id": 2,
    "title": "用一百行代码，写一片会呼吸的星空",
    "slug": "canvas-starfield",
    "excerpt": "拆解本站背景的实现：星点分布、闪烁节奏、鼠标视差和偶尔划过的流星。",
    "content": "# 用一百行代码，写一片会呼吸的星空\n\n本站背景不是一张图片，而是一块铺满视口的 `<canvas>`。它足够轻，也足够有生命力。\n\n## 先决定星星怎么分布\n\n最简单的方式是随机撒点，但纯随机会出现明显的疏密不均。这里用两层叠加：\n\n- 一层是亮度低、数量多的小星点，负责铺满画面\n- 一层是亮度高、半径大的星点，负责制造层次\n\n每颗星保存自己的位置、半径、基础透明度、闪烁速度和相位。相位让所有星星不会同时亮起来。\n\n```js\nconst star = {\n  x: Math.random() * width,\n  y: Math.random() * height,\n  r: Math.random() * 1.4 + 0.3,\n  alpha: Math.random() * 0.5 + 0.2,\n  speed: Math.random() * 0.6 + 0.2,\n  phase: Math.random() * Math.PI * 2\n};\n```\n\n## 让光有呼吸\n\n在 `requestAnimationFrame` 循环里，用正弦函数改变透明度：\n\n```js\nconst twinkle = 0.65 + Math.sin(time * star.speed + star.phase) * 0.35;\nctx.globalAlpha = star.alpha * twinkle;\nctx.beginPath();\nctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);\nctx.fill();\n```\n\n为了让亮星更有「光晕」，再画一个半径更大、透明度更低的圆。代价很小，观感提升明显。\n\n## 视差与流星\n\n记录鼠标相对屏幕中心的位置，给整片星空加上几个像素的偏移。移动端没有鼠标，就用设备方向或干脆不启用。\n\n流星则是一个带生命周期的对象：随机间隔生成，从左上向右下划过，用线性渐变画出尾巴，透明度随进度衰减。它不应该太频繁——**偶然出现的东西才显得珍贵**。\n\n## 别忘了照顾所有人\n\n如果用户开启了「减少动态效果」，就停止动画，只画一帧静态星空。这是媒体查询之外，Canvas 必须手动处理的部分。\n\n```js\nconst reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n```\n\n最后，把 DPR 限制在 2 以内。手机上的高分屏很诱人，但为了几颗星星榨干 GPU 并不划算。",
    "tags": "[\"Canvas\",\"动画\",\"前端\"]",
    "cover_url": "",
    "published": 1,
    "created_at": "2026-09-28T09:30:00.000Z",
    "updated_at": "2026-09-28T09:30:00.000Z"
  },
  {
    "id": 3,
    "title": "零依赖后端：用 Node.js 内建 SQLite 做一个内容后台",
    "slug": "node-sqlite-backend",
    "excerpt": "不装 Express、不装 ORM，用 node:http、node:sqlite 和 scrypt 完成一个够用的后台。",
    "content": "# 零依赖后端：用 Node.js 内建 SQLite 做一个内容后台\n\n个人站点不需要 Kubernetes，也不需要一套完整的微服务。它需要的是：能启动、能保存、能备份。\n\n## 为什么是内建 SQLite\n\nNode.js 22 之后提供了 `node:sqlite`，不需要编译原生模块。对比 JSON 文件，它带来真正的事务、索引和并发安全；对比外部数据库，它不需要额外进程。\n\n```js\nimport { DatabaseSync } from 'node:sqlite';\n\nconst db = new DatabaseSync('./data/portfolio.db');\ndb.exec('PRAGMA journal_mode = WAL;');\n```\n\n整个数据库就是一个文件，备份只需要复制 `data/` 目录。\n\n## 路由不必复杂\n\n后台接口只有十几个，直接用一个 `handleApi(req, res, url)` 分发就够了。请求体限制大小，输出统一 JSON，错误统一捕获。\n\n真正需要认真对待的是身份验证：\n\n- 密码用 `scrypt` 加盐哈希，绝不明文保存\n- 会话 token 只把哈希写进数据库\n- Cookie 使用 `HttpOnly` + `SameSite=Lax`\n- 所有写操作校验同源，登录接口限流\n\n## 一个够用的数据模型\n\n```sql\nCREATE TABLE posts (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  slug TEXT NOT NULL UNIQUE,\n  content TEXT NOT NULL DEFAULT '',\n  published INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL\n);\n```\n\n时间统一存 ISO 字符串，读写都简单。布尔值用 0 / 1，是 SQLite 的惯例。\n\n## 什么时候不该这么做\n\n如果站点要做多用户协作、复杂查询或高并发，请直接上成熟的框架和数据库。轻量的前提是**需求真的轻**。\n\n但对一个个人网站来说，这套组合已经跑了很久，安静、稳定，而且随时能看懂每一行代码。",
    "tags": "[\"Node.js\",\"SQLite\",\"后端\"]",
    "cover_url": "",
    "published": 1,
    "created_at": "2026-09-05T08:00:00.000Z",
    "updated_at": "2026-09-05T08:00:00.000Z"
  }
];
