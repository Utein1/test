/**
 * DDL executed once per isolate (all statements are idempotent).
 * D1 keeps the same SQLite dialect the project used locally, so the
 * table shapes are unchanged apart from the extra rate_limits table.
 */
export const SCHEMA = `
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

  CREATE TABLE IF NOT EXISTS rate_limits (
    key      TEXT PRIMARY KEY,
    count    INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
`;
