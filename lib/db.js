import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'portfolio.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT '',
    tagline     TEXT NOT NULL DEFAULT '',
    bio         TEXT NOT NULL DEFAULT '',
    location    TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    avatar_url  TEXT NOT NULL DEFAULT '',
    resume_url  TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT '',
    socials     TEXT NOT NULL DEFAULT '[]',
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skills (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name     TEXT NOT NULL,
    level    INTEGER NOT NULL DEFAULT 70,
    sort     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tech        TEXT NOT NULL DEFAULT '[]',
    cover_url   TEXT NOT NULL DEFAULT '',
    demo_url    TEXT NOT NULL DEFAULT '',
    repo_url    TEXT NOT NULL DEFAULT '',
    year        TEXT NOT NULL DEFAULT '',
    featured    INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    excerpt    TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL DEFAULT '',
    tags       TEXT NOT NULL DEFAULT '[]',
    cover_url  TEXT NOT NULL DEFAULT '',
    published  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Admin account
// ---------------------------------------------------------------------------
if (!db.prepare('SELECT id FROM admin WHERE id = 1').get()) {
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare(
    'INSERT INTO admin (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)'
  ).run(process.env.ADMIN_USERNAME || 'admin', hashPassword(password), now);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('\n  首次启动已创建管理员账号：admin / admin123');
    console.log('  请登录后台后立即在「设置」中修改密码。\n');
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
if (!db.prepare('SELECT id FROM profile WHERE id = 1').get()) {
  db.prepare(`
    INSERT INTO profile
      (id, name, role, tagline, bio, location, email, avatar_url, resume_url, status, socials, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '于典',
    '全栈开发者 · 独立创造者',
    '把想法写成能用的产品，也把夜空写进屏幕里。',
    `你好，我是**于典**，一名喜欢产品、设计与工程的全栈开发者。

我喜欢把复杂的想法拆解成简单、好用、好看的网页与应用。对我来说，写代码不只是实现功能，更是在打磨一种体验——让每一次点击都自然，让每一个页面都能呼吸。

- 关注细节，追求简洁克制的设计
- 习惯用自动化解决重复劳动
- 保持好奇，持续学习并把过程记录下来`,
    '中国 · 远程',
    'hello@yudian.dev',
    '/assets/avatar.svg',
    '',
    '开放合作中',
    JSON.stringify([
      { label: 'GitHub', url: 'https://github.com/' },
      { label: '邮箱', url: 'mailto:hello@yudian.dev' }
    ]),
    now
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
if (!db.prepare('SELECT id FROM skills LIMIT 1').get()) {
  const rows = [
    ['前端', 'HTML / CSS', 92],
    ['前端', 'JavaScript', 90],
    ['前端', 'Vue 3', 86],
    ['前端', 'TypeScript', 80],
    ['前端', 'React', 76],
    ['后端', 'Node.js', 88],
    ['后端', 'Python', 76],
    ['后端', 'PostgreSQL', 74],
    ['后端', 'Redis', 68],
    ['工程化', 'Git', 90],
    ['工程化', 'Vite', 84],
    ['工程化', 'Linux', 78],
    ['工程化', 'Docker', 72],
    ['工程化', 'Figma', 70]
  ];
  const insert = db.prepare('INSERT INTO skills (category, name, level, sort) VALUES (?, ?, ?, ?)');
  rows.forEach(([category, name, level], i) => insert.run(category, name, level, (i + 1) * 10));
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
if (!db.prepare('SELECT id FROM projects LIMIT 1').get()) {
  const insert = db.prepare(`
    INSERT INTO projects
      (title, summary, description, tech, cover_url, demo_url, repo_url, year, featured, sort, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    '星轨 · 个人站点系统',
    '你正在浏览的这个网站：深色星空、零依赖后端、自带内容管理后台。',
    `一个刻意保持轻量的个人站点。前端只用原生 HTML / CSS / JavaScript，后端基于 Node.js 内建模块与 SQLite，没有任何第三方运行时依赖。

- 星空由 Canvas 实时绘制，支持视差、闪烁与流星
- 页面所有文案、技能、项目、博客都可以在后台修改
- 管理后台包含内容 CRUD、图片上传、留言收件箱与密码修改`,
    JSON.stringify(['Node.js', 'SQLite', 'Canvas', '原生 JS']),
    '/assets/covers/orbit.svg',
    '',
    '',
    '2026',
    1,
    10,
    now
  );
  insert.run(
    'TaskLite · 极简任务看板',
    '本地优先的轻量看板，支持拖拽、离线使用与键盘操作。',
    '一个专注于「打开就能用」的任务看板。数据保存在浏览器本地，断网也能继续工作。',
    JSON.stringify(['Vue 3', 'IndexedDB', 'PWA']),
    '/assets/covers/kanban.svg',
    '',
    '',
    '2025',
    0,
    20,
    now
  );
  insert.run(
    'Pulse · 可用性监控',
    '定时探活、异常告警与对外状态页，部署在一台小服务器上。',
    '为个人项目做的最小可用性监控：定时请求目标站点，记录响应时间，异常时推送通知，并生成一个公开状态页。',
    JSON.stringify(['Node.js', 'PostgreSQL', 'Docker']),
    '/assets/covers/pulse.svg',
    '',
    '',
    '2025',
    0,
    30,
    now
  );
}

// ---------------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------------
if (!db.prepare('SELECT id FROM posts LIMIT 1').get()) {
  const insert = db.prepare(`
    INSERT INTO posts
      (title, slug, excerpt, content, tags, cover_url, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    '你好，世界：为什么我又搭了一个个人网站',
    'hello-world',
    '在信息流之外，留一块完全属于自己的地方。聊聊这个站点的由来，以及它为什么被做得这么轻。',
    `# 你好，世界

每隔一段时间，我都会重新做一个个人网站。不是因为上一个不能用了，而是因为每隔一段时间，我对「自己想留下什么」这件事的理解都会变化。

## 为什么还要一个网站

社交平台适合传播，不适合沉淀。一条动态很快会被新的内容覆盖，而一篇认真写下的文章，可以安静地待在某个 URL 里，等需要它的人找到。

所以这里更像是一间自己的房间：

- 放得下完整的项目说明，而不是被截断的九宫格
- 放得下长一点的思考，而不是被压缩的短句
- 也可以什么都不放，只留一片星空

## 关于「轻」

这次最重要的一个决定是：**不引入任何前端框架和第三方依赖**。

整站由三部分组成：

1. 原生 HTML / CSS / JavaScript 写的页面
2. Node.js 内建 http 模块写的小后端
3. Node.js 内建 SQLite 持久化数据

没有构建步骤，没有 \`node_modules\`，克隆下来 \`node server.js\` 就能跑。性能不是唯一目的，更重要的是：几年后回来，它大概率还能直接运行。

## 接下来

我会在这里记录一些开发中的取舍、踩过的坑，以及一些与代码无关的生活片段。

如果你也在考虑做一个自己的网站，别等设计稿完美。先把第一行字写下来，剩下的会慢慢长出来。`,
    JSON.stringify(['随笔', '独立开发']),
    '',
    1,
    '2026-10-12T10:00:00.000Z',
    '2026-10-12T10:00:00.000Z'
  );

  insert.run(
    '用一百行代码，写一片会呼吸的星空',
    'canvas-starfield',
    '拆解本站背景的实现：星点分布、闪烁节奏、鼠标视差和偶尔划过的流星。',
    `# 用一百行代码，写一片会呼吸的星空

本站背景不是一张图片，而是一块铺满视口的 \`<canvas>\`。它足够轻，也足够有生命力。

## 先决定星星怎么分布

最简单的方式是随机撒点，但纯随机会出现明显的疏密不均。这里用两层叠加：

- 一层是亮度低、数量多的小星点，负责铺满画面
- 一层是亮度高、半径大的星点，负责制造层次

每颗星保存自己的位置、半径、基础透明度、闪烁速度和相位。相位让所有星星不会同时亮起来。

\`\`\`js
const star = {
  x: Math.random() * width,
  y: Math.random() * height,
  r: Math.random() * 1.4 + 0.3,
  alpha: Math.random() * 0.5 + 0.2,
  speed: Math.random() * 0.6 + 0.2,
  phase: Math.random() * Math.PI * 2
};
\`\`\`

## 让光有呼吸

在 \`requestAnimationFrame\` 循环里，用正弦函数改变透明度：

\`\`\`js
const twinkle = 0.65 + Math.sin(time * star.speed + star.phase) * 0.35;
ctx.globalAlpha = star.alpha * twinkle;
ctx.beginPath();
ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
ctx.fill();
\`\`\`

为了让亮星更有「光晕」，再画一个半径更大、透明度更低的圆。代价很小，观感提升明显。

## 视差与流星

记录鼠标相对屏幕中心的位置，给整片星空加上几个像素的偏移。移动端没有鼠标，就用设备方向或干脆不启用。

流星则是一个带生命周期的对象：随机间隔生成，从左上向右下划过，用线性渐变画出尾巴，透明度随进度衰减。它不应该太频繁——**偶然出现的东西才显得珍贵**。

## 别忘了照顾所有人

如果用户开启了「减少动态效果」，就停止动画，只画一帧静态星空。这是媒体查询之外，Canvas 必须手动处理的部分。

\`\`\`js
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
\`\`\`

最后，把 DPR 限制在 2 以内。手机上的高分屏很诱人，但为了几颗星星榨干 GPU 并不划算。`,
    JSON.stringify(['Canvas', '动画', '前端']),
    '',
    1,
    '2026-09-28T09:30:00.000Z',
    '2026-09-28T09:30:00.000Z'
  );

  insert.run(
    '零依赖后端：用 Node.js 内建 SQLite 做一个内容后台',
    'node-sqlite-backend',
    '不装 Express、不装 ORM，用 node:http、node:sqlite 和 scrypt 完成一个够用的后台。',
    `# 零依赖后端：用 Node.js 内建 SQLite 做一个内容后台

个人站点不需要 Kubernetes，也不需要一套完整的微服务。它需要的是：能启动、能保存、能备份。

## 为什么是内建 SQLite

Node.js 22 之后提供了 \`node:sqlite\`，不需要编译原生模块。对比 JSON 文件，它带来真正的事务、索引和并发安全；对比外部数据库，它不需要额外进程。

\`\`\`js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./data/portfolio.db');
db.exec('PRAGMA journal_mode = WAL;');
\`\`\`

整个数据库就是一个文件，备份只需要复制 \`data/\` 目录。

## 路由不必复杂

后台接口只有十几个，直接用一个 \`handleApi(req, res, url)\` 分发就够了。请求体限制大小，输出统一 JSON，错误统一捕获。

真正需要认真对待的是身份验证：

- 密码用 \`scrypt\` 加盐哈希，绝不明文保存
- 会话 token 只把哈希写进数据库
- Cookie 使用 \`HttpOnly\` + \`SameSite=Lax\`
- 所有写操作校验同源，登录接口限流

## 一个够用的数据模型

\`\`\`sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
\`\`\`

时间统一存 ISO 字符串，读写都简单。布尔值用 0 / 1，是 SQLite 的惯例。

## 什么时候不该这么做

如果站点要做多用户协作、复杂查询或高并发，请直接上成熟的框架和数据库。轻量的前提是**需求真的轻**。

但对一个个人网站来说，这套组合已经跑了很久，安静、稳定，而且随时能看懂每一行代码。`,
    JSON.stringify(['Node.js', 'SQLite', '后端']),
    '',
    1,
    '2026-09-05T08:00:00.000Z',
    '2026-09-05T08:00:00.000Z'
  );
}
