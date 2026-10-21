import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { handleApi, UPLOAD_DIR } from './lib/api.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function securityHeaders() {
  return {
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...securityHeaders(), ...headers });
  res.end(body);
}

async function notFound(res) {
  return serveFile(res, path.join(PUBLIC_DIR, '404.html'), {
    cache: 'no-cache',
    status: 404
  }).catch(() => {
    send(res, 404, '404 Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  });
}

async function serveFile(res, filePath, { cache = 'no-cache', status = 200 } = {}) {
  const info = await stat(filePath);
  if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });

  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': cache,
    ETag: etag,
    'Last-Modified': new Date(info.mtimeMs).toUTCString()
  };
  res.writeHead(status, { ...securityHeaders(), ...headers });
  if (res.req?.method === 'HEAD') return res.end();
  res.end(await readFile(filePath));
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (pathname === '/admin' || pathname === '/admin/') {
    return serveFile(res, path.join(PUBLIC_DIR, 'admin.html'));
  }

  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    if (!/^[a-z0-9-]+\.(png|jpe?g|webp|gif)$/i.test(name)) {
      return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    return serveFile(res, path.join(UPLOAD_DIR, name), {
      cache: 'public, max-age=31536000, immutable'
    });
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!isInside(PUBLIC_DIR, filePath)) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const cache = /\.(css|js|mjs|svg|png|jpe?g|webp|gif|woff2)$/i.test(pathname)
    ? 'public, max-age=3600'
    : 'no-cache';

  try {
    return await serveFile(res, filePath, { cache });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return notFound(res);
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (await handleApi(req, res, url)) return;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed', {
        'Content-Type': 'text/plain; charset=utf-8',
        Allow: 'GET, HEAD'
      });
    }

    await serveStatic(req, res, url);
  } catch (error) {
    if (error.code === 'ENOENT') return notFound(res);
    console.error('[server]', error);
    if (!res.headersSent) {
      send(res, 500, 'Internal Server Error', {
        'Content-Type': 'text/plain; charset=utf-8'
      });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log('\n  ✦ 于典的个人网站已启动');
  console.log(`    前台  http://localhost:${PORT}`);
  console.log(`    后台  http://localhost:${PORT}/admin\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
