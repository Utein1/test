import crypto from 'node:crypto';

const KEY_LEN = 64;

/** Create a salted scrypt hash: scrypt$<salt>$<hash> */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** Constant-time verification of a password against a stored hash. */
export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, expected] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, KEY_LEN);
    const expectedBuf = Buffer.from(expected, 'hex');
    if (expectedBuf.length !== actual.length) return false;
    return crypto.timingSafeEqual(actual, expectedBuf);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Fixed-window, in-memory rate limiter. Good enough for a single-process site. */
const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > max) return false;
  return true;
}

export function rateLimitLeft(key) {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  return Math.max(0, bucket.reset - Date.now());
}

// Keep the map from growing forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.reset <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();
