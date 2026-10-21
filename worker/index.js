import { handleApi } from './api.js';
import { ensureDatabase } from './db.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const UPLOAD_PATTERN = /^[a-z0-9-]+\.(png|jpe?g|webp|gif)$/i;

function flat(text, status, headers = {}) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers }
  });
}

function secure(response, { cache, hsts = true } = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  if (hsts) headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (cache) headers.set('Cache-Control', cache);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function serveAsset(request, env, pathname) {
  const url = new URL(request.url);
  const target = new URL(pathname, url);
  const assetRequest = new Request(target.toString(), request);
  const response = await env.ASSETS.fetch(assetRequest);
  const isHtml = pathname.endsWith('.html') || pathname === '/';
  return secure(response, { cache: isHtml ? 'no-cache' : undefined });
}

/** Renders public/404.html but keeps the 404 status code. */
async function notFound(request, env) {
  const target = new URL('/404.html', request.url);
  const response = await env.ASSETS.fetch(new Request(target.toString(), request));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  return secure(new Response(response.body, { status: 404, headers }));
}

async function serveUpload(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return secure(flat('Method Not Allowed', 405, { Allow: 'GET, HEAD' }));
  }
  if (!env.UPLOADS || typeof env.UPLOADS.get !== 'function') {
    return secure(flat('图片存储未配置（R2 绑定 UPLOADS）', 503));
  }

  const name = url.pathname.slice('/uploads/'.length);
  if (!UPLOAD_PATTERN.test(name)) {
    return notFound(request, env);
  }

  const object = await env.UPLOADS.get(name);
  if (!object) return notFound(request, env);

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return secure(new Response(object.body, { headers }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      try {
        await ensureDatabase(env);
      } catch (error) {
        console.error('[bootstrap]', error);
        return secure(
          new Response(
            JSON.stringify({
              error: '数据库未就绪，请检查 D1 绑定与 wrangler.toml 配置',
              detail: String(error?.message || error)
            }),
            { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
          )
        );
      }
      return secure(await handleApi(request, env, url));
    }

    if (pathname.startsWith('/uploads/')) {
      return serveUpload(request, env, url);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return secure(flat('Method Not Allowed', 405, { Allow: 'GET, HEAD' }));
    }

    if (pathname === '/admin' || pathname === '/admin/') {
      return serveAsset(request, env, '/admin.html');
    }

    if (pathname === '/' || pathname === '/index.html') {
      return serveAsset(request, env, '/index.html');
    }

    if (!env.ASSETS) return secure(flat('静态资源未绑定', 503));
    return serveAsset(request, env, pathname);
  }
};
