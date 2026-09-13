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
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
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

/* ═══════════════════════════════════════════════════════════
   RPS "vs a friend" rooms — Cloudflare KV, polled by both clients.
   Free-tier only: no Durable Objects, no WebSockets. A room is a small
   JSON blob keyed by a short code, TTL'd so abandoned rooms expire.
═══════════════════════════════════════════════════════════ */
const ROOM_TTL_SECONDS = 3600; // 1h of inactivity
const ROOM_CODE_CHARS  = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const VALID_PICKS      = new Set(['rock', 'paper', 'scissors']);
const BEATS            = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function genRoomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return code;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function clampName(name) {
  return typeof name === 'string' ? name.trim().slice(0, 20) : '';
}

async function getRoom(env, code) {
  const raw = await env.ROOMS.get(code);
  return raw ? JSON.parse(raw) : null;
}

async function saveRoom(env, code, state) {
  await env.ROOMS.put(code, JSON.stringify(state), { expirationTtl: ROOM_TTL_SECONDS });
}

async function handleRoomsApi(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rps-room', code?, action?]

  // POST /api/rps-room — create a room, caller becomes p1
  if (parts.length === 2) {
    if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
    const body = await safeJson(request);
    const code = genRoomCode();
    const state = {
      createdAt: Date.now(), round: 1, scores: { p1: 0, p2: 0 }, roundWinner: null,
      p1: { name: clampName(body.name) || 'Jugador 1', pick: null },
      p2: null,
    };
    await saveRoom(env, code, state);
    return jsonResponse({ code, playerId: 'p1', state });
  }

  const code = (parts[2] || '').toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return jsonResponse({ error: 'invalid room code' }, 400);

  // GET /api/rps-room/:code — poll current state
  if (parts.length === 3) {
    if (request.method !== 'GET') return jsonResponse({ error: 'method not allowed' }, 405);
    const state = await getRoom(env, code);
    if (!state) return jsonResponse({ error: 'room not found' }, 404);
    return jsonResponse({ state });
  }

  const action = parts[3];
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // POST /api/rps-room/:code/join — caller becomes p2 (idempotent)
  if (action === 'join') {
    const state = await getRoom(env, code);
    if (!state) return jsonResponse({ error: 'room not found' }, 404);
    const body = await safeJson(request);
    if (!state.p2) state.p2 = { name: clampName(body.name) || 'Jugador 2', pick: null };
    await saveRoom(env, code, state);
    return jsonResponse({ playerId: 'p2', state });
  }

  // POST /api/rps-room/:code/pick — submit a pick; resolves the round once both are in
  if (action === 'pick') {
    const state = await getRoom(env, code);
    if (!state) return jsonResponse({ error: 'room not found' }, 404);
    const body = await safeJson(request);
    const playerId = body.playerId === 'p2' ? 'p2' : 'p1';
    if (!VALID_PICKS.has(body.pick)) return jsonResponse({ error: 'invalid pick' }, 400);
    if (!state[playerId]) return jsonResponse({ error: 'player not in room' }, 400);

    state[playerId].pick = body.pick;
    if (state.p1?.pick && state.p2?.pick) {
      const a = state.p1.pick, b = state.p2.pick;
      state.roundWinner = a === b ? 'draw' : (BEATS[a] === b ? 'p1' : 'p2');
      if (state.roundWinner === 'p1') state.scores.p1++;
      if (state.roundWinner === 'p2') state.scores.p2++;
    }
    await saveRoom(env, code, state);
    return jsonResponse({ state });
  }

  // POST /api/rps-room/:code/next — advance to the next round (keeps scores)
  if (action === 'next') {
    const state = await getRoom(env, code);
    if (!state) return jsonResponse({ error: 'room not found' }, 404);
    state.round++;
    state.roundWinner = null;
    if (state.p1) state.p1.pick = null;
    if (state.p2) state.p2.pick = null;
    await saveRoom(env, code, state);
    return jsonResponse({ state });
  }

  return jsonResponse({ error: 'not found' }, 404);
}

function get404Path(pathname) {
  if (/(^|\/)en(\/|$)/.test(pathname)) return '/en/404.html';
  if (/(^|\/)pt(\/|$)/.test(pathname)) return '/pt/404.html';
  return '/404.html';
}

async function notFoundResponse(env, url) {
  const notFound = await env.ASSETS.fetch(new Request(`${url.origin}${get404Path(url.pathname)}`));
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

    // Redirect HTTP → HTTPS (skip localhost — wrangler dev has no local TLS)
    if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (isBlockedPath(url.pathname)) {
      return notFoundResponse(env, url);
    }

    if (url.pathname.startsWith('/api/rps-room')) {
      return handleRoomsApi(request, env, url);
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
