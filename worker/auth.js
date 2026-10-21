// Authentication primitives for the Cloudflare Workers build.
// Everything here relies on WebCrypto only (crypto.getRandomValues / subtle),
// so no nodejs_compat flag is required.

const encoder = new TextEncoder();

/** PBKDF2 rounds. Lower this if you hit the free plan CPU limit on login. */
const PBKDF2_ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function pbkdf2(password, salt, iterations, length) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hash format: pbkdf2$<iterations>$<salt-b64>$<hash-b64> */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_BYTES);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterations, salt, expected] = String(stored || '').split('$');
    if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false;
    const expectedBytes = fromBase64(expected);
    const rounds = Number(iterations);
    if (!Number.isFinite(rounds) || rounds <= 0) return false;
    const actual = await pbkdf2(password, fromBase64(salt), rounds, expectedBytes.length);
    return timingSafeEqual(actual, expectedBytes);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const RATE_LIMIT_CLEANUP_EVERY = 25;
let writesSinceCleanup = 0;

/**
 * Fixed-window rate limit persisted in D1 so it survives across isolates.
 * Returns false when the caller has exceeded `max` hits inside `windowMs`.
 */
export async function rateLimit(db, key, max, windowMs) {
  const now = Date.now();
  const row = await db
    .prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
    .bind(key)
    .first();

  if (!row || row.reset_at <= now) {
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
      )
      .bind(key, now + windowMs)
      .run();
    return true;
  }

  if (row.count >= max) return false;

  await db
    .prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?')
    .bind(key)
    .run();

  if (++writesSinceCleanup >= RATE_LIMIT_CLEANUP_EVERY) {
    writesSinceCleanup = 0;
    await db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(now).run();
  }
  return true;
}
