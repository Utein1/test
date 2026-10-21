import { hashPassword, randomToken, rateLimit, sha256, verifyPassword } from './auth.js';

const SESSION_COOKIE = 'yd_sid';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function text(value, { name = '内容', max = 200, required = false } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new HttpError(400, `${name}不能为空`);
  if (v.length > max) throw new HttpError(400, `${name}最多 ${max} 个字符`);
  return v;
}

function safeUrl(value, name = '链接') {
  const v = text(value, { name, max: 600 });
  if (!v) return '';
  if (/^(https?:\/\/|mailto:|\/)/i.test(v)) return v;
  throw new HttpError(400, `${name}格式不正确，请以 http(s)://、mailto: 或 / 开头`);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function boolInt(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function parseArray(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function toTagList(value, { max = 12, maxLength = 24 } = {}) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const tag = String(item).trim().slice(0, maxLength);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

function readMinutes(content) {
  const length = String(content || '').replace(/\s/g, '').length;
  return Math.max(1, Math.ceil(length / 350));
}

async function readJson(request) {
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_JSON_BYTES) throw new HttpError(413, '请求内容过大');
  if (!buffer.byteLength) return {};
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new HttpError(400, '请求内容不是合法的 JSON');
  }
}

function db(env) {
  if (!env.DB) throw new HttpError(503, '数据库未绑定，请检查 D1 配置');
  return env.DB;
}

function checkSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, '非法请求来源');
  }
  if (host !== new URL(request.url).host) throw new HttpError(403, '非法请求来源');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
function sessionCookie(token, url) {
  const secure = url.protocol === 'https:';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    SESSION_TTL / 1000
  }${secure ? '; Secure' : ''}`;
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function getSession(request, env) {
  const token = parseCookies(request.headers.get('cookie') || '')[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await db(env)
    .prepare(
      'SELECT s.expires_at, a.id, a.username FROM sessions s JOIN admin a ON a.id = 1 WHERE s.token_hash = ?'
    )
    .bind(tokenHash)
    .first();

  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await db(env).prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { id: row.id, username: row.username, tokenHash };
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, '登录状态已失效，请重新登录');
  return session;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------
function mapProfile(row) {
  return {
    name: row.name,
    role: row.role,
    tagline: row.tagline,
    bio: row.bio,
    location: row.location,
    email: row.email,
    avatar_url: row.avatar_url,
    resume_url: row.resume_url,
    status: row.status,
    socials: parseArray(row.socials).filter((s) => s && s.label && s.url),
    updated_at: row.updated_at
  };
}

function mapSkill(row) {
  return { id: row.id, category: row.category, name: row.name, level: row.level, sort: row.sort };
}

function mapProject(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    tech: parseArray(row.tech),
    cover_url: row.cover_url,
    demo_url: row.demo_url,
    repo_url: row.repo_url,
    year: row.year,
    featured: !!row.featured,
    sort: row.sort
  };
}

function mapPostMeta(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    tags: parseArray(row.tags),
    cover_url: row.cover_url,
    published: !!row.published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    read_minutes: readMinutes(row.content)
  };
}

function mapPost(row) {
  return { ...mapPostMeta(row), content: row.content };
}

// ---------------------------------------------------------------------------
// Content normalizers
// ---------------------------------------------------------------------------
function normalizeProfile(body) {
  const email = text(body.email, { name: '邮箱', max: 120 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, '邮箱格式不正确');
  }
  const socials = [];
  if (Array.isArray(body.socials)) {
    for (const item of body.socials.slice(0, 8)) {
      if (!item) continue;
      const label = text(item.label, { name: '社交平台名称', max: 20 });
      const url = safeUrl(item.url, '社交链接');
      if (label && url) socials.push({ label, url });
    }
  }
  return {
    name: text(body.name, { name: '姓名', max: 40, required: true }),
    role: text(body.role, { name: '身份 / 职位', max: 80 }),
    tagline: text(body.tagline, { name: '一句话介绍', max: 200 }),
    bio: text(body.bio, { name: '个人介绍', max: 4000 }),
    location: text(body.location, { name: '所在地', max: 60 }),
    email,
    avatar_url: safeUrl(body.avatar_url, '头像地址'),
    resume_url: safeUrl(body.resume_url, '简历地址'),
    status: text(body.status, { name: '状态', max: 40 }),
    socials
  };
}

function normalizeSkill(body) {
  return {
    category: text(body.category, { name: '分类', max: 24, required: true }),
    name: text(body.name, { name: '技能名称', max: 40, required: true }),
    level: Math.max(0, Math.min(100, toInt(body.level, 70)))
  };
}

function normalizeProject(body) {
  return {
    title: text(body.title, { name: '项目名称', max: 80, required: true }),
    summary: text(body.summary, { name: '项目简介', max: 300 }),
    description: text(body.description, { name: '项目详情', max: 10000 }),
    tech: toTagList(body.tech),
    cover_url: safeUrl(body.cover_url, '封面地址'),
    demo_url: safeUrl(body.demo_url, '演示地址'),
    repo_url: safeUrl(body.repo_url, '仓库地址'),
    year: text(body.year, { name: '年份', max: 12 }),
    featured: boolInt(body.featured)
  };
}

function postFields(body, existing) {
  return {
    title: text(body.title, { name: '文章标题', max: 160, required: true }),
    excerpt: text(body.excerpt, { name: '文章摘要', max: 300 }),
    content: text(body.content, { name: '文章内容', max: 200000 }),
    tags: toTagList(body.tags),
    cover_url: safeUrl(body.cover_url, '封面地址'),
    published: boolInt(body.published ?? existing?.published ?? 0)
  };
}

async function makeSlug(env, input, title, excludeId = 0) {
  let base = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[\s/\\#?%]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!base) {
    const ascii = String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    base = ascii || `post-${Date.now().toString(36)}`;
  }
  base = base.slice(0, 80);

  let candidate = base;
  let i = 2;
  while (
    await db(env)
      .prepare('SELECT id FROM posts WHERE slug = ? AND id != ?')
      .bind(candidate, excludeId)
      .first()
  ) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

function normalizePostDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// API entry
// ---------------------------------------------------------------------------
export async function handleApi(request, env, url) {
  try {
    return await route(request, env, url);
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message });
    console.error('[api]', error);
    return json(500, { error: '服务器开小差了，请稍后再试' });
  }
}

async function route(request, env, url) {
  const method = request.method;
  const pathname = url.pathname;
  const seg = pathname.split('/').filter(Boolean);
  const isWrite = method !== 'GET' && method !== 'HEAD';

  if (isWrite) checkSameOrigin(request);

  // ---- health -------------------------------------------------------------
  if (pathname === '/api/health' && method === 'GET') {
    return json(200, { ok: true, time: new Date().toISOString() });
  }

  // ---- public site --------------------------------------------------------
  if (pathname === '/api/site' && method === 'GET') {
    const profileRow = await db(env).prepare('SELECT * FROM profile WHERE id = 1').first();
    if (!profileRow) throw new HttpError(503, '站点内容尚未初始化');

    const skills = (await db(env).prepare('SELECT * FROM skills ORDER BY sort ASC, id ASC').all())
      .results;
    const projects = (
      await db(env)
        .prepare('SELECT * FROM projects ORDER BY featured DESC, sort ASC, id ASC')
        .all()
    ).results;
    const posts = (
      await db(env)
        .prepare('SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC, id DESC')
        .all()
    ).results;

    return json(200, {
      profile: mapProfile(profileRow),
      skills: skills.map(mapSkill),
      projects: projects.map(mapProject),
      posts: posts.map(mapPostMeta),
      counts: {
        skills: skills.length,
        projects: projects.length,
        posts: posts.length
      }
    });
  }

  if (seg[1] === 'posts' && seg[2] && method === 'GET') {
    const slug = decodeURIComponent(seg.slice(2).join('/'));
    const row = await db(env)
      .prepare('SELECT * FROM posts WHERE slug = ? AND published = 1')
      .bind(slug)
      .first();
    if (!row) throw new HttpError(404, '文章不存在或尚未发布');
    return json(200, { post: mapPost(row) });
  }

  // ---- contact ------------------------------------------------------------
  if (pathname === '/api/contact' && method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!(await rateLimit(db(env), `contact:${ip}`, 5, 10 * 60 * 1000))) {
      throw new HttpError(429, '留言太频繁了，请稍后再试');
    }
    const body = await readJson(request);
    if (body.website) return json(200, { ok: true }); // honeypot

    const name = text(body.name, { name: '称呼', max: 40, required: true });
    const email = text(body.email, { name: '邮箱', max: 120 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, '邮箱格式不正确');
    }
    const content = text(body.content, { name: '留言内容', max: 2000, required: true });
    if (content.length < 5) throw new HttpError(400, '留言内容至少 5 个字符');

    await db(env)
      .prepare('INSERT INTO messages (name, email, content, is_read, created_at) VALUES (?, ?, ?, 0, ?)')
      .bind(name, email, content, new Date().toISOString())
      .run();

    return json(201, { ok: true });
  }

  // ---- auth ---------------------------------------------------------------
  if (pathname === '/api/auth/me' && method === 'GET') {
    const session = await getSession(request, env);
    return json(200, session ? { authed: true, username: session.username } : { authed: false });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!(await rateLimit(db(env), `login:${ip}`, 8, 10 * 60 * 1000))) {
      throw new HttpError(429, '尝试次数过多，请 10 分钟后再试');
    }
    const body = await readJson(request);
    const username = text(body.username, { name: '用户名', max: 60 });
    const password = String(body.password || '');

    const admin = await db(env).prepare('SELECT * FROM admin WHERE id = 1').first();
    const valid =
      admin && username === admin.username && (await verifyPassword(password, admin.password_hash));
    if (!valid) throw new HttpError(401, '用户名或密码不正确');

    await db(env).prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()).run();

    const token = randomToken();
    const tokenHash = await sha256(token);
    await db(env)
      .prepare('INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)')
      .bind(tokenHash, Date.now() + SESSION_TTL, new Date().toISOString())
      .run();

    return json(
      200,
      { ok: true, username: admin.username },
      { 'Set-Cookie': sessionCookie(token, url) }
    );
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(request.headers.get('cookie') || '')[SESSION_COOKIE];
    if (token) {
      await db(env)
        .prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(await sha256(token))
        .run();
    }
    return json(200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }

  // ---- admin --------------------------------------------------------------
  if (!seg[1] || seg[0] !== 'api' || seg[1] !== 'admin') {
    throw new HttpError(404, '接口不存在');
  }

  const session = await requireSession(request, env);

  if (pathname === '/api/admin/state' && method === 'GET') {
    const profileRow = await db(env).prepare('SELECT * FROM profile WHERE id = 1').first();
    if (!profileRow) throw new HttpError(503, '站点内容尚未初始化');

    const skills = (await db(env).prepare('SELECT * FROM skills ORDER BY sort ASC, id ASC').all())
      .results;
    const projects = (
      await db(env).prepare('SELECT * FROM projects ORDER BY sort ASC, id ASC').all()
    ).results;
    const posts = (
      await db(env).prepare('SELECT * FROM posts ORDER BY created_at DESC, id DESC').all()
    ).results;
    const messages = (
      await db(env)
        .prepare('SELECT * FROM messages ORDER BY created_at DESC, id DESC LIMIT 200')
        .all()
    ).results;

    return json(200, {
      admin: { username: session.username },
      profile: mapProfile(profileRow),
      skills: skills.map(mapSkill),
      projects: projects.map(mapProject),
      posts: posts.map(mapPost),
      messages,
      counts: {
        skills: skills.length,
        projects: projects.length,
        posts: posts.length,
        published: posts.filter((p) => p.published).length,
        messages: messages.length,
        unread: messages.filter((m) => !m.is_read).length
      }
    });
  }

  if (pathname === '/api/admin/profile' && method === 'PUT') {
    const data = normalizeProfile(await readJson(request));
    await db(env)
      .prepare(
        `UPDATE profile SET
           name = ?, role = ?, tagline = ?, bio = ?, location = ?, email = ?,
           avatar_url = ?, resume_url = ?, status = ?, socials = ?, updated_at = ?
         WHERE id = 1`
      )
      .bind(
        data.name,
        data.role,
        data.tagline,
        data.bio,
        data.location,
        data.email,
        data.avatar_url,
        data.resume_url,
        data.status,
        JSON.stringify(data.socials),
        new Date().toISOString()
      )
      .run();
    return json(200, { ok: true });
  }

  if (pathname === '/api/admin/password' && method === 'PUT') {
    const body = await readJson(request);
    const current = String(body.current || '');
    const next = String(body.next || '');
    if (next.length < 8) throw new HttpError(400, '新密码至少需要 8 个字符');
    if (next.length > 128) throw new HttpError(400, '新密码过长');

    const admin = await db(env).prepare('SELECT * FROM admin WHERE id = 1').first();
    if (!admin || !(await verifyPassword(current, admin.password_hash))) {
      throw new HttpError(400, '当前密码不正确');
    }

    await db(env)
      .prepare('UPDATE admin SET password_hash = ? WHERE id = 1')
      .bind(await hashPassword(next))
      .run();
    await db(env)
      .prepare('DELETE FROM sessions WHERE token_hash != ?')
      .bind(session.tokenHash)
      .run();

    return json(200, { ok: true });
  }

  if (pathname === '/api/admin/export' && method === 'GET') {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      profile: await db(env).prepare('SELECT * FROM profile WHERE id = 1').first(),
      skills: (await db(env).prepare('SELECT * FROM skills ORDER BY sort ASC, id ASC').all())
        .results,
      projects: (await db(env).prepare('SELECT * FROM projects ORDER BY sort ASC, id ASC').all())
        .results,
      posts: (
        await db(env).prepare('SELECT * FROM posts ORDER BY created_at DESC').all()
      ).results,
      messages: (
        await db(env).prepare('SELECT * FROM messages ORDER BY created_at DESC').all()
      ).results
    };
    const filename = `yudian-site-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return json(200, payload, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    });
  }

  // ---- skills -------------------------------------------------------------
  if (seg[2] === 'skills') {
    if (seg.length === 3 && method === 'POST') {
      const data = normalizeSkill(await readJson(request));
      const maxSort =
        (await db(env).prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM skills').first())?.m || 0;
      await db(env)
        .prepare('INSERT INTO skills (category, name, level, sort) VALUES (?, ?, ?, ?)')
        .bind(data.category, data.name, data.level, maxSort + 10)
        .run();
      return json(201, { ok: true });
    }

    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const data = normalizeSkill(await readJson(request));
      const result = await db(env)
        .prepare('UPDATE skills SET category = ?, name = ?, level = ? WHERE id = ?')
        .bind(data.category, data.name, data.level, id)
        .run();
      if (!result.meta.changes) throw new HttpError(404, '技能不存在');
      return json(200, { ok: true });
    }

    if (id && seg.length === 4 && method === 'DELETE') {
      await db(env).prepare('DELETE FROM skills WHERE id = ?').bind(id).run();
      return json(200, { ok: true });
    }

    if (id && seg[4] === 'move' && method === 'POST') {
      const body = await readJson(request);
      await moveItem(env, 'skills', id, body.direction === 'up' ? -1 : 1);
      return json(200, { ok: true });
    }
  }

  // ---- projects -----------------------------------------------------------
  if (seg[2] === 'projects') {
    if (seg.length === 3 && method === 'POST') {
      const data = normalizeProject(await readJson(request));
      const maxSort =
        (await db(env).prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM projects').first())?.m || 0;
      await db(env)
        .prepare(
          `INSERT INTO projects
             (title, summary, description, tech, cover_url, demo_url, repo_url, year, featured, sort, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          data.title,
          data.summary,
          data.description,
          JSON.stringify(data.tech),
          data.cover_url,
          data.demo_url,
          data.repo_url,
          data.year,
          data.featured,
          maxSort + 10,
          new Date().toISOString()
        )
        .run();
      return json(201, { ok: true });
    }

    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const data = normalizeProject(await readJson(request));
      const result = await db(env)
        .prepare(
          `UPDATE projects SET
             title = ?, summary = ?, description = ?, tech = ?, cover_url = ?,
             demo_url = ?, repo_url = ?, year = ?, featured = ?
           WHERE id = ?`
        )
        .bind(
          data.title,
          data.summary,
          data.description,
          JSON.stringify(data.tech),
          data.cover_url,
          data.demo_url,
          data.repo_url,
          data.year,
          data.featured,
          id
        )
        .run();
      if (!result.meta.changes) throw new HttpError(404, '项目不存在');
      return json(200, { ok: true });
    }

    if (id && seg.length === 4 && method === 'DELETE') {
      await db(env).prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
      return json(200, { ok: true });
    }

    if (id && seg[4] === 'move' && method === 'POST') {
      const body = await readJson(request);
      await moveItem(env, 'projects', id, body.direction === 'up' ? -1 : 1);
      return json(200, { ok: true });
    }
  }

  // ---- posts --------------------------------------------------------------
  if (seg[2] === 'posts') {
    if (seg.length === 3 && method === 'POST') {
      const body = await readJson(request);
      const data = postFields(body, null);
      const slug = await makeSlug(env, body.slug, data.title);
      const nowIso = new Date().toISOString();
      await db(env)
        .prepare(
          `INSERT INTO posts
             (title, slug, excerpt, content, tags, cover_url, published, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          data.title,
          slug,
          data.excerpt,
          data.content,
          JSON.stringify(data.tags),
          data.cover_url,
          data.published,
          normalizePostDate(body.created_at, nowIso),
          nowIso
        )
        .run();
      return json(201, { ok: true, slug });
    }

    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const existing = await db(env).prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
      if (!existing) throw new HttpError(404, '文章不存在');
      const body = await readJson(request);
      const data = postFields(body, existing);
      const slug = await makeSlug(env, body.slug || existing.slug, data.title, id);
      await db(env)
        .prepare(
          `UPDATE posts SET
             title = ?, slug = ?, excerpt = ?, content = ?, tags = ?, cover_url = ?,
             published = ?, created_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          data.title,
          slug,
          data.excerpt,
          data.content,
          JSON.stringify(data.tags),
          data.cover_url,
          data.published,
          normalizePostDate(body.created_at, existing.created_at),
          new Date().toISOString(),
          id
        )
        .run();
      return json(200, { ok: true, slug });
    }

    if (id && seg.length === 4 && method === 'DELETE') {
      await db(env).prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
      return json(200, { ok: true });
    }
  }

  // ---- messages -----------------------------------------------------------
  if (seg[2] === 'messages') {
    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const body = await readJson(request);
      const result = await db(env)
        .prepare('UPDATE messages SET is_read = ? WHERE id = ?')
        .bind(boolInt(body.is_read), id)
        .run();
      if (!result.meta.changes) throw new HttpError(404, '留言不存在');
      return json(200, { ok: true });
    }
    if (id && seg.length === 4 && method === 'DELETE') {
      await db(env).prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
      return json(200, { ok: true });
    }
  }

  throw new HttpError(404, '接口不存在');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const SORTABLE = new Set(['skills', 'projects']);

async function moveItem(env, table, id, direction) {
  if (!SORTABLE.has(table)) throw new HttpError(400, '不支持排序');

  const rows = (
    await db(env).prepare(`SELECT id FROM ${table} ORDER BY sort ASC, id ASC`).all()
  ).results;
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new HttpError(404, '记录不存在');

  const target = index + direction;
  if (target < 0 || target >= rows.length) return;

  [rows[index], rows[target]] = [rows[target], rows[index]];

  const update = db(env).prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
  await db(env).batch(rows.map((row, i) => update.bind((i + 1) * 10, row.id)));
}
