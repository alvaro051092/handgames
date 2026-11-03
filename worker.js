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
  // The service worker script must always revalidate: with a 1-year immutable
  // header a browser could keep an old sw.js (and therefore an old CACHE_VERSION
  // and precache list) long after a deploy.
  if (pathname === '/sw.js') return 'no-cache, must-revalidate';
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

function jsonResponse(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

async function safeJson(request) {
  try {
    const j = await request.json();
    return (j && typeof j === 'object') ? j : {};   // `null`, numbers, strings, arrays-as-primitives -> {}
  } catch { return {}; }
}

function clampName(name) {
  return typeof name === 'string' ? name.trim().slice(0, 20) : '';
}

function clampId(id) {
  return typeof id === 'string' ? id.slice(0, 64) : '';
}

async function getRoom(env, code) {
  const raw = await env.ROOMS.get(code);
  return raw ? JSON.parse(raw) : null;
}

async function saveRoom(env, code, doc) {
  await env.ROOMS.put(code, JSON.stringify(doc), { expirationTtl: ROOM_TTL_SECONDS });
}

/* Picks live in their own KV key per player per round, so two players
   submitting at nearly the same instant never race on a shared
   read-modify-write and clobber each other's pick (the room doc itself
   only ever needs a read-modify-write for infrequent events: create,
   join, next-round, and the once-per-round score commit below). */
function pickKey(code, round, playerId) { return `${code}:pick:${round}:${playerId}`; }

async function getPick(env, code, round, playerId) {
  return env.ROOMS.get(pickKey(code, round, playerId));
}

async function savePick(env, code, round, playerId, pick) {
  await env.ROOMS.put(pickKey(code, round, playerId), pick, { expirationTtl: ROOM_TTL_SECONDS });
}

/* Which seat does this request belong to? The client sends the random
   `clientId` it generated (header on GET, body on POST); the room doc stores
   the ids of the two seats. Nothing else identifies a player, so it is never
   echoed back in a state response. */
function seatOf(doc, clientId) {
  if (!clientId) return null;
  if (doc.p1 && doc.p1.clientId === clientId) return 'p1';
  if (doc.p2 && doc.p2.clientId === clientId) return 'p2';
  return null;
}

/* KV reads are the scarce resource (free tier: 100k/day) and both clients poll,
   so this keeps the number per poll as low as the data allows:
     - no p2 yet (lobby)            -> 0 pick reads
     - round already resolved       -> 0 pick reads (the picks were stored in
                                       the room doc by the score commit)
     - otherwise                    -> 2 pick reads (p1, p2)
   Returns [p1Pick, p2Pick]. */
async function readPicks(env, code, doc) {
  const lp = doc.lastPicks;
  if (doc.resolvedRound === doc.round && lp && lp.round === doc.round) {
    return [lp.p1 || null, lp.p2 || null];
  }
  if (!doc.p2) return [null, null];
  return Promise.all([
    getPick(env, code, doc.round, 'p1'),
    getPick(env, code, doc.round, 'p2'),
  ]);
}

/* A pick is secret until BOTH are in. Before that every seat exposes only
   `picked: true|false`; `pick` is null, except for the requester's own seat
   (`viewer`, identified by clientId) so their own screen can still show it.
   Clients that predate `picked` read `pick` and just see null for the rival
   (no exception); they simply do not show the "waiting for rival" state
   across a poll until they reload. */
function buildStateResponse(doc, p1Pick, p2Pick, viewer) {
  const bothIn = !!(p1Pick && p2Pick);
  const roundWinner = bothIn
    ? (p1Pick === p2Pick ? 'draw' : (BEATS[p1Pick] === p2Pick ? 'p1' : 'p2'))
    : null;
  const seat = (key, pick) => doc[key]
    ? { name: doc[key].name, picked: !!pick, pick: (bothIn || viewer === key) ? (pick || null) : null }
    : null;
  return {
    createdAt: doc.createdAt,
    round: doc.round,
    scores: doc.scores,
    roundWinner,
    p1: seat('p1', p1Pick),
    p2: seat('p2', p2Pick),
  };
}

/* The whole API is wrapped: a KV hiccup or quota error (the free tier throws
   once the daily limit is gone) must come back as a clean, retryable 503 the
   client can show, not as an opaque Worker exception. */
async function handleRoomsApi(request, env, url) {
  try {
    return await handleRoomsApiInner(request, env, url);
  } catch (err) {
    console.error('rps-room unavailable:', err && err.message);
    return jsonResponse({ error: 'unavailable' }, 503, { 'Retry-After': '3' });
  }
}

async function handleRoomsApiInner(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rps-room', code?, action?]

  // POST /api/rps-room — create a room, caller becomes p1
  if (parts.length === 2) {
    if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
    const body = await safeJson(request);
    const code = genRoomCode();
    const doc = {
      createdAt: Date.now(), round: 1, scores: { p1: 0, p2: 0 }, resolvedRound: 0,
      p1: { name: clampName(body.name) || 'Jugador 1', clientId: clampId(body.clientId) },
      p2: null,
    };
    await saveRoom(env, code, doc);
    return jsonResponse({ code, playerId: 'p1', state: buildStateResponse(doc, null, null, 'p1') });
  }

  const code = (parts[2] || '').toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return jsonResponse({ error: 'invalid room code' }, 400);

  // GET /api/rps-room/:code — poll current state (1 read in the lobby and once
  // a round is resolved, 3 while picks are being made — see readPicks)
  if (parts.length === 3) {
    if (request.method !== 'GET') return jsonResponse({ error: 'method not allowed' }, 405);
    const doc = await getRoom(env, code);
    if (!doc) return jsonResponse({ error: 'room not found' }, 404);
    const [p1Pick, p2Pick] = await readPicks(env, code, doc);
    const viewer = seatOf(doc, clampId(request.headers.get('X-HG-Client')));
    return jsonResponse({ state: buildStateResponse(doc, p1Pick, p2Pick, viewer) });
  }

  const action = parts[3];
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // POST /api/rps-room/:code/join — caller becomes p2 (idempotent per clientId)
  if (action === 'join') {
    const doc = await getRoom(env, code);
    if (!doc) return jsonResponse({ error: 'room not found' }, 404);
    const body = await safeJson(request);
    const joinerId = clampId(body.clientId);
    /* Seat 2 is first-come. `clientId` is a random id the client generates per
       browser tab (kept in sessionStorage, so a reload keeps the seat): the
       same client coming back gets its own seat back, anybody else gets 409.
       The creator re-entering with the room code gets seat p1 back. A room
       created before this field existed has no ids, so nobody can "return"
       to it (it only matters for rooms already full at deploy time). */
    const mine = seatOf(doc, joinerId);
    if (!mine) {
      if (doc.p2) return jsonResponse({ error: 'room full' }, 409);
      doc.p2 = { name: clampName(body.name) || 'Jugador 2', clientId: joinerId };
      await saveRoom(env, code, doc);
      /* KV has no compare-and-swap: two joiners can both read "no p2" and both
         write. Re-read after writing; whoever's clientId did not survive loses.
         Narrows the race (cannot close it without Durable Objects). */
      const check = await getRoom(env, code);
      if (check && check.p2 && check.p2.clientId !== joinerId) {
        return jsonResponse({ error: 'room full' }, 409);
      }
    }
    const seatId = mine || 'p2';
    const [p1Pick, p2Pick] = await readPicks(env, code, doc);
    return jsonResponse({ playerId: seatId, state: buildStateResponse(doc, p1Pick, p2Pick, seatId) });
  }

  // POST /api/rps-room/:code/pick — submit a pick; resolves the round once both are in
  if (action === 'pick') {
    const doc = await getRoom(env, code);
    if (!doc) return jsonResponse({ error: 'room not found' }, 404);
    const body = await safeJson(request);
    const playerId = body.playerId === 'p2' ? 'p2' : 'p1';
    const otherId  = playerId === 'p1' ? 'p2' : 'p1';
    if (!VALID_PICKS.has(body.pick)) return jsonResponse({ error: 'invalid pick' }, 400);
    if (!doc[playerId]) return jsonResponse({ error: 'player not in room' }, 400);

    /* Round already resolved (score committed): a late or repeated pick must not
       overwrite the picks that decided it. Answer with the current state. */
    if (doc.resolvedRound === doc.round) {
      const [r1, r2] = await readPicks(env, code, doc);
      return jsonResponse({ state: buildStateResponse(doc, r1, r2, playerId) });
    }

    await savePick(env, code, doc.round, playerId, body.pick);
    const otherPick = await getPick(env, code, doc.round, otherId);
    const picks = { [playerId]: body.pick, [otherId]: otherPick };

    // Both picks are in — commit this round's score exactly once. Re-reads
    // the doc right before writing to narrow (not eliminate) the race with
    // the other player's request doing the same check at the same instant;
    // worst case a score is off by one, it never drops anyone's pick.
    if (otherPick && doc.resolvedRound !== doc.round) {
      const fresh = await getRoom(env, code);
      if (fresh.resolvedRound !== doc.round) {
        const winner = picks.p1 === picks.p2 ? 'draw' : (BEATS[picks.p1] === picks.p2 ? 'p1' : 'p2');
        if (winner === 'p1') fresh.scores.p1++;
        if (winner === 'p2') fresh.scores.p2++;
        fresh.resolvedRound = doc.round;
        /* The picks ride along in the same write so later polls of a resolved
           round need no pick reads (see readPicks). */
        fresh.lastPicks = { round: doc.round, p1: picks.p1, p2: picks.p2 };
        await saveRoom(env, code, fresh);
      }
      doc.scores = fresh.scores;
    }

    return jsonResponse({ state: buildStateResponse(doc, picks.p1, picks.p2, playerId) });
  }

  // POST /api/rps-room/:code/next — advance to the next round (keeps scores).
  // Both players see their own "Siguiente ronda" button and may both click
  // it for the same round transition — only advance once per round (the
  // caller's `round` must still match the room's current round), otherwise
  // a double-click from both players skips a round number. `round` is
  // optional so a stale cached client (sends no body) still works exactly
  // as before rather than getting permanently stuck.
  if (action === 'next') {
    const doc = await getRoom(env, code);
    if (!doc) return jsonResponse({ error: 'room not found' }, 404);
    const body = await safeJson(request);
    if (body.round === undefined || doc.round === body.round) {
      doc.round++;
      await saveRoom(env, code, doc);
    }
    return jsonResponse({ state: buildStateResponse(doc, null, null, null) });
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

    if (url.pathname === '/api/rps-room' || url.pathname.startsWith('/api/rps-room/')) {
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
