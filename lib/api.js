import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { hashPassword, randomToken, rateLimit, sha256, verifyPassword } from './auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const UPLOAD_DIR = path.join(ROOT, 'uploads');
await mkdir(UPLOAD_DIR, { recursive: true });

const SESSION_COOKIE = 'yd_sid';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(payload));
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

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new HttpError(413, '请求内容过大');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求内容不是合法的 JSON');
  }
}

async function readBuffer(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, '图片不能超过 8MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function checkSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, '非法请求来源');
  }
  if (host !== req.headers.host) throw new HttpError(403, '非法请求来源');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
function sessionCookie(token, req) {
  const secure =
    req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${
    secure ? '; Secure' : ''
  }`;
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = db
    .prepare(
      'SELECT s.expires_at, a.id, a.username FROM sessions s JOIN admin a ON a.id = 1 WHERE s.token_hash = ?'
    )
    .get(tokenHash);
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  return { id: row.id, username: row.username, tokenHash };
}

function requireSession(req) {
  const session = getSession(req);
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
// Content writers
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

function makeSlug(input, title, excludeId = 0) {
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
    db
      .prepare('SELECT id FROM posts WHERE slug = ? AND id != ?')
      .get(candidate, excludeId)
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
// API routing
// ---------------------------------------------------------------------------
export async function handleApi(req, res, url) {
  const { pathname } = url;
  if (!pathname.startsWith('/api/')) return false;

  try {
    await route(req, res, url);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
    } else {
      console.error('[api]', error);
      sendJson(res, 500, { error: '服务器开小差了，请稍后再试' });
    }
  }
  return true;
}

async function route(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;
  const seg = pathname.split('/').filter(Boolean);
  const isWrite = method !== 'GET' && method !== 'HEAD';

  if (isWrite) checkSameOrigin(req);

  // ---- health -------------------------------------------------------------
  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }

  // ---- public site --------------------------------------------------------
  if (pathname === '/api/site' && method === 'GET') {
    const profileRow = db.prepare('SELECT * FROM profile WHERE id = 1').get();
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort ASC, id ASC').all();
    const projects = db
      .prepare('SELECT * FROM projects ORDER BY featured DESC, sort ASC, id ASC')
      .all();
    const posts = db
      .prepare(
        'SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC, id DESC'
      )
      .all();
    return sendJson(res, 200, {
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
    const row = db.prepare('SELECT * FROM posts WHERE slug = ? AND published = 1').get(slug);
    if (!row) throw new HttpError(404, '文章不存在或尚未发布');
    return sendJson(res, 200, { post: mapPost(row) });
  }

  // ---- contact ------------------------------------------------------------
  if (pathname === '/api/contact' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (!rateLimit(`contact:${ip}`, 5, 10 * 60 * 1000)) {
      throw new HttpError(429, '留言太频繁了，请稍后再试');
    }
    const body = await readJson(req);
    if (body.website) return sendJson(res, 200, { ok: true }); // honeypot

    const name = text(body.name, { name: '称呼', max: 40, required: true });
    const email = text(body.email, { name: '邮箱', max: 120 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, '邮箱格式不正确');
    }
    const content = text(body.content, { name: '留言内容', max: 2000, required: true });
    if (content.length < 5) throw new HttpError(400, '留言内容至少 5 个字符');
    db.prepare(
      'INSERT INTO messages (name, email, content, is_read, created_at) VALUES (?, ?, ?, 0, ?)'
    ).run(name, email, content, new Date().toISOString());
    return sendJson(res, 201, { ok: true });
  }

  // ---- auth ---------------------------------------------------------------
  if (pathname === '/api/auth/me' && method === 'GET') {
    const session = getSession(req);
    return sendJson(res, 200, session ? { authed: true, username: session.username } : { authed: false });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (!rateLimit(`login:${ip}`, 8, 10 * 60 * 1000)) {
      throw new HttpError(429, '尝试次数过多，请 10 分钟后再试');
    }
    const body = await readJson(req);
    const username = text(body.username, { name: '用户名', max: 60 });
    const password = String(body.password || '');
    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin || username !== admin.username || !verifyPassword(password, admin.password_hash)) {
      throw new HttpError(401, '用户名或密码不正确');
    }

    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomToken();
    db.prepare(
      'INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)'
    ).run(sha256(token), Date.now() + SESSION_TTL, new Date().toISOString());

    return sendJson(
      res,
      200,
      { ok: true, username: admin.username },
      { 'Set-Cookie': sessionCookie(token, req) }
    );
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }

  // ---- upload -------------------------------------------------------------
  if (pathname === '/api/upload' && method === 'POST') {
    requireSession(req);
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const buffer = await readBuffer(req, MAX_UPLOAD_BYTES);
    const detected = detectImage(buffer);
    if (!detected) throw new HttpError(415, '只支持 PNG、JPG、WebP 或 GIF 图片');
    if (
      contentType &&
      contentType !== detected.mime &&
      !(contentType === 'image/jpg' && detected.mime === 'image/jpeg')
    ) {
      throw new HttpError(415, '图片格式与文件内容不一致');
    }
    const filename = `${Date.now().toString(36)}-${randomToken(4).replace(/[^a-zA-Z0-9]/g, '')}.${detected.ext}`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return sendJson(res, 201, { ok: true, url: `/uploads/${filename}` });
  }

  // ---- admin --------------------------------------------------------------
  if (!seg[1] || seg[0] !== 'api' || seg[1] !== 'admin') {
    throw new HttpError(404, '接口不存在');
  }

  const session = requireSession(req);

  if (pathname === '/api/admin/state' && method === 'GET') {
    const profileRow = db.prepare('SELECT * FROM profile WHERE id = 1').get();
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort ASC, id ASC').all();
    const projects = db.prepare('SELECT * FROM projects ORDER BY sort ASC, id ASC').all();
    const posts = db
      .prepare('SELECT * FROM posts ORDER BY created_at DESC, id DESC')
      .all();
    const messages = db
      .prepare('SELECT * FROM messages ORDER BY created_at DESC, id DESC LIMIT 200')
      .all();
    return sendJson(res, 200, {
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
    const data = normalizeProfile(await readJson(req));
    db.prepare(`
      UPDATE profile SET
        name = ?, role = ?, tagline = ?, bio = ?, location = ?, email = ?,
        avatar_url = ?, resume_url = ?, status = ?, socials = ?, updated_at = ?
      WHERE id = 1
    `).run(
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
    );
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/password' && method === 'PUT') {
    const body = await readJson(req);
    const current = String(body.current || '');
    const next = String(body.next || '');
    if (next.length < 8) throw new HttpError(400, '新密码至少需要 8 个字符');
    if (next.length > 128) throw new HttpError(400, '新密码过长');
    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!verifyPassword(current, admin.password_hash)) {
      throw new HttpError(400, '当前密码不正确');
    }
    db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(hashPassword(next));
    db.prepare('DELETE FROM sessions WHERE token_hash != ?').run(session.tokenHash);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/export' && method === 'GET') {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      profile: db.prepare('SELECT * FROM profile WHERE id = 1').get(),
      skills: db.prepare('SELECT * FROM skills ORDER BY sort ASC, id ASC').all(),
      projects: db.prepare('SELECT * FROM projects ORDER BY sort ASC, id ASC').all(),
      posts: db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all(),
      messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all()
    };
    const filename = `yudian-site-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return sendJson(res, 200, payload, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    });
  }

  // ---- skills -------------------------------------------------------------
  if (seg[2] === 'skills') {
    if (seg.length === 3 && method === 'POST') {
      const data = normalizeSkill(await readJson(req));
      const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM skills').get().m;
      db.prepare('INSERT INTO skills (category, name, level, sort) VALUES (?, ?, ?, ?)').run(
        data.category,
        data.name,
        data.level,
        maxSort + 10
      );
      return sendJson(res, 201, { ok: true });
    }

    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const data = normalizeSkill(await readJson(req));
      const result = db
        .prepare('UPDATE skills SET category = ?, name = ?, level = ? WHERE id = ?')
        .run(data.category, data.name, data.level, id);
      if (!result.changes) throw new HttpError(404, '技能不存在');
      return sendJson(res, 200, { ok: true });
    }

    if (id && seg.length === 4 && method === 'DELETE') {
      db.prepare('DELETE FROM skills WHERE id = ?').run(id);
      return sendJson(res, 200, { ok: true });
    }

    if (id && seg[4] === 'move' && method === 'POST') {
      const body = await readJson(req);
      moveItem('skills', id, body.direction === 'up' ? -1 : 1);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ---- projects -----------------------------------------------------------
  if (seg[2] === 'projects') {
    if (seg.length === 3 && method === 'POST') {
      const data = normalizeProject(await readJson(req));
      const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM projects').get().m;
      db.prepare(`
        INSERT INTO projects
          (title, summary, description, tech, cover_url, demo_url, repo_url, year, featured, sort, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
      return sendJson(res, 201, { ok: true });
    }

    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const data = normalizeProject(await readJson(req));
      const result = db.prepare(`
        UPDATE projects SET
          title = ?, summary = ?, description = ?, tech = ?, cover_url = ?,
          demo_url = ?, repo_url = ?, year = ?, featured = ?
        WHERE id = ?
      `).run(
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
      );
      if (!result.changes) throw new HttpError(404, '项目不存在');
      return sendJson(res, 200, { ok: true });
    }

    if (id && seg.length === 4 && method === 'DELETE') {
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      return sendJson(res, 200, { ok: true });
    }

    if (id && seg[4] === 'move' && method === 'POST') {
      const body = await readJson(req);
      moveItem('projects', id, body.direction === 'up' ? -1 : 1);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ---- posts --------------------------------------------------------------
  if (seg[2] === 'posts') {
    if (seg.length === 3 && method === 'POST') {
      const body = await readJson(req);
      const data = postFields(body, null);
      data.slug = makeSlug(body.slug, data.title);
      const nowIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO posts
          (title, slug, excerpt, content, tags, cover_url, published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.title,
        data.slug,
        data.excerpt,
        data.content,
        JSON.stringify(data.tags),
        data.cover_url,
        data.published,
        normalizePostDate(body.created_at, nowIso),
        nowIso
      );
      return sendJson(res, 201, { ok: true, slug: data.slug });
    }

    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, '文章不存在');
      const body = await readJson(req);
      const data = postFields(body, existing);
      data.slug = makeSlug(body.slug || existing.slug, data.title, id);
      db.prepare(`
        UPDATE posts SET
          title = ?, slug = ?, excerpt = ?, content = ?, tags = ?, cover_url = ?,
          published = ?, created_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.title,
        data.slug,
        data.excerpt,
        data.content,
        JSON.stringify(data.tags),
        data.cover_url,
        data.published,
        normalizePostDate(body.created_at, existing.created_at),
        new Date().toISOString(),
        id
      );
      return sendJson(res, 200, { ok: true, slug: data.slug });
    }

    if (id && seg.length === 4 && method === 'DELETE') {
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ---- messages -----------------------------------------------------------
  if (seg[2] === 'messages') {
    const id = toInt(seg[3]);
    if (id && seg.length === 4 && method === 'PUT') {
      const body = await readJson(req);
      const result = db
        .prepare('UPDATE messages SET is_read = ? WHERE id = ?')
        .run(boolInt(body.is_read), id);
      if (!result.changes) throw new HttpError(404, '留言不存在');
      return sendJson(res, 200, { ok: true });
    }
    if (id && seg.length === 4 && method === 'DELETE') {
      db.prepare('DELETE FROM messages WHERE id = ?').run(id);
      return sendJson(res, 200, { ok: true });
    }
  }

  throw new HttpError(404, '接口不存在');
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

const SORTABLE = new Set(['skills', 'projects']);

function moveItem(table, id, direction) {
  if (!SORTABLE.has(table)) throw new HttpError(400, '不支持排序');
  const rows = db.prepare(`SELECT id FROM ${table} ORDER BY sort ASC, id ASC`).all();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new HttpError(404, '记录不存在');
  const target = index + direction;
  if (target < 0 || target >= rows.length) return;
  [rows[index], rows[target]] = [rows[target], rows[index]];
  const update = db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
  rows.forEach((row, i) => update.run((i + 1) * 10, row.id));
}

function detectImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
