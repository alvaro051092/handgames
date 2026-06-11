/* ═══════════════════════════════════════════════════════════
   worker.js — Cloudflare Worker for Hand Games
   - HTTP → HTTPS redirect
   - Cache-Control: immutable for versioned static assets (CSS/JS/fonts)
   - Cache-Control: no-cache for HTML (always fresh)
   - Security headers on every response
═══════════════════════════════════════════════════════════ */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-XSS-Protection': '1; mode=block',
};

function getCacheHeader(pathname) {
  // Versioned static assets — safe to cache for 1 year
  if (/\.(css|js|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp)(\?|$)/.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  // HTML — always revalidate so SW/manifest updates reach users fast
  return 'no-cache, must-revalidate';
}

// Dotfiles/dirs (.git, .claude, .wrangler, ...) and dev-only files must
// never be served, even if they slip into the deployed assets bundle.
function isBlockedPath(pathname) {
  if (/(^|\/)\.[^/]+/.test(pathname)) return true;
  if (/\.command$/.test(pathname)) return true;
  if (/^\/(docker-compose\.yml|wrangler\.jsonc|nginx(\/|$))/.test(pathname)) return true;
  return false;
}

async function notFoundResponse(env, url) {
  const notFound = await env.ASSETS.fetch(new Request(`${url.origin}/404.html`));
  const headers = new Headers(notFound.headers);
  headers.set('Cache-Control', getCacheHeader(url.pathname));
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(notFound.body, {
    status: 404,
    statusText: 'Not Found',
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Redirect HTTP → HTTPS
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (isBlockedPath(url.pathname)) {
      return notFoundResponse(env, url);
    }

    const response = await env.ASSETS.fetch(request);

    // Serve custom 404 page instead of Cloudflare's generic error
    if (response.status === 404) {
      return notFoundResponse(env, url);
    }

    // Clone with added headers (Response is immutable)
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', getCacheHeader(url.pathname));
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
};
