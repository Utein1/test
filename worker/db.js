import { hashPassword } from './auth.js';
import { SCHEMA } from './schema.js';
import { seedProfile, seedPosts, seedProjects, seedSkills } from './seed.js';

let ready = false;
let booting = null;

export function getDb(env) {
  if (!env.DB) {
    throw new Error(
      '缺少 D1 绑定 DB：请先在 wrangler.toml 的 [[d1_databases]] 中填入 database_id'
    );
  }
  return env.DB;
}

/**
 * Creates the tables, seeds the sample content on an empty database and makes
 * sure an admin account exists. Runs once per isolate; every statement is
 * idempotent so concurrent isolates cannot duplicate rows.
 */
export async function ensureDatabase(env) {
  if (ready) return;
  if (!booting) {
    booting = init(env)
      .then(() => {
        ready = true;
      })
      .catch((error) => {
        booting = null;
        throw error;
      });
  }
  await booting;
}

async function init(env) {
  const db = getDb(env);

  // D1's exec() splits on newlines, so send the DDL as individual statements.
  const statements = SCHEMA.split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => db.prepare(statement));
  await db.batch(statements);

  const row = await db.prepare('SELECT COUNT(*) AS n FROM skills').first();
  if (!row || !row.n) await seedContent(db);

  await ensureAdmin(db, env);
}

async function seedContent(db) {
  const profile = seedProfile;
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO profile
           (id, name, role, tagline, bio, location, email, avatar_url, resume_url, status, socials, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        profile.id,
        profile.name,
        profile.role,
        profile.tagline,
        profile.bio,
        profile.location,
        profile.email,
        profile.avatar_url,
        profile.resume_url,
        profile.status,
        profile.socials,
        profile.updated_at
      )
  ];

  for (const skill of seedSkills) {
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO skills (id, category, name, level, sort) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(skill.id, skill.category, skill.name, skill.level, skill.sort)
    );
  }

  for (const project of seedProjects) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO projects
             (id, title, summary, description, tech, cover_url, demo_url, repo_url, year, featured, sort, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          project.id,
          project.title,
          project.summary,
          project.description,
          project.tech,
          project.cover_url,
          project.demo_url,
          project.repo_url,
          project.year,
          project.featured,
          project.sort,
          project.created_at
        )
    );
  }

  for (const post of seedPosts) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO posts
             (id, title, slug, excerpt, content, tags, cover_url, published, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          post.id,
          post.title,
          post.slug,
          post.excerpt,
          post.content,
          post.tags,
          post.cover_url,
          post.published,
          post.created_at,
          post.updated_at
        )
    );
  }

  await db.batch(statements);
}

async function ensureAdmin(db, env) {
  const existing = await db.prepare('SELECT id FROM admin WHERE id = 1').first();
  if (existing) return;

  const username = env.ADMIN_USERNAME || 'admin';
  const password = env.ADMIN_PASSWORD || 'admin123';
  const hash = await hashPassword(password);

  await db
    .prepare(
      'INSERT OR IGNORE INTO admin (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)'
    )
    .bind(username, hash, new Date().toISOString())
    .run();

  if (!env.ADMIN_PASSWORD) {
    console.log('[db] 已创建默认管理员 admin / admin123，请登录后台后立即修改密码');
  }
}
