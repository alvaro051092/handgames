/* ═══════════════════════════════════════════════════════════
   worker.js — Cloudflare Worker for Hand Games
   - HTTP → HTTPS redirect
   - Cache-Control: immutable for versioned static assets (CSS/JS/fonts)
   - Cache-Control: no-cache for HTML (always fresh)
   - Security headers on every response this Worker generates (404 page, API).
     Static files are served by the assets layer without running this code, so
     their headers live in _headers: keep SECURITY_HEADERS and _headers in sync.
═══════════════════════════════════════════════════════════ */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()',
  'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  'Strict-Transport-Security': 'max-age=31536000',
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

// Dotfiles/dirs (.git, .claude, .wrangler, ...) and dev-only files get a 404
// from this Worker instead of being looked up in the assets layer.
// This is NOT what keeps them private: the assets layer answers for any file
// that exists in the deployed bundle WITHOUT running this Worker, so a file that
// reached the bundle would be served regardless of this function. What actually
// keeps them out is `.assetsignore` (which wrangler applies when it uploads) and
// `node scripts/audit-public.mjs`, which fails if the bundle would contain them.
// This function only answers the paths that are NOT in the bundle (e.g. a request
// for /.git/config gets the custom 404 here, never a lookup that could surprise).
function isBlockedPath(pathname) {
  if (/(^|\/)\.[^/]+/.test(pathname)) return true;
  if (/\.command$/.test(pathname)) return true;
  if (/^\/(docker-compose\.yml|wrangler\.jsonc|worker\.js|nginx(\/|$)|scripts(\/|$))/.test(pathname)) return true;
  return false;
}

/* ═══════════════════════════════════════════════════════════
   RPS "vs a friend" rooms — Cloudflare KV, polled by both clients.
   Free-tier only: no Durable Objects, no WebSockets. A room is a small
   JSON blob keyed by a short code, TTL'd so abandoned rooms expire.

   WHAT KV DOES AND DOES NOT GIVE US (read before changing this code):
     - No compare-and-swap, no transactions. Every "read, change, write" below is
       a best-effort narrowing of a race, never an atomic operation.
     - Eventually consistent across Cloudflare locations: a write is visible at
       once in the colo that made it, but another colo may keep serving the old
       value for up to ~60 s (or more). Two players in different colos can
       therefore read stale data.
     - What we do about it: (1) every write re-reads the document right before
       writing and changes ONLY the fields that belong to the caller or to the
       event (own pick key, `p2` seat, round counter), so concurrent writers rarely
       overwrite one another's fields; (2) the events are idempotent (two
       simultaneous "round 3 resolved" or "next after round 3" writes produce the
       same document), so the usual race is harmless; (3) a round whose commit was
       missed because of stale reads is committed later by whoever polls or asks
       for the next round (see commitRound); (4) `rev` counts writes to the room
       document to make lost updates detectable.
     - What it does NOT do: guarantee exactly-once scoring or that the p2 seat
       goes to exactly one joiner under a simultaneous race. In the worst case a
       score is off by one or two players both believe they own seat 2 (the
       re-check after the write narrows that, it does not close it). Closing it
       needs Durable Objects.

   ABUSE LIMITS WE CAN APPLY IN CODE (no KV is spent on counting requests):
     only same-origin JSON POSTs with a small body are accepted; invalid input is
     refused before any KV access; picks/next/join that change nothing do not write.
     Volume limiting (creating rooms in a loop eats the free 1,000 writes/day) must
     be done with a Cloudflare WAF Rate Limiting rule on `POST /api/rps-room`
     (outside this code).

   AUTHENTICATION: there are no accounts. A player is the random `clientId` its
   browser generated, stored in the room when the seat is taken and required (and
   compared) on every pick/next. The room code alone only lets someone JOIN a
   free seat or poll the public state; it never lets them act for a seated player.

   PROTOCOL VERSION / LEGACY CLIENTS: clients that send `v: 2` on create/join are
   "strict" (clientId required and enforced on pick/next). The client that shipped
   before this change does not send `v` and never sends a clientId with pick/next.
   Its seat is stored with `legacy: true`; for THAT seat only, pick/next without a
   clientId are still accepted (the old behaviour) until LEGACY_UNTIL, after which
   they get 426 `client_outdated`. A strict seat can never be acted on without its
   clientId, so a room between two updated clients has no forgeable path, and an
   attacker cannot turn a strict seat into a legacy one (the flag is set only when
   a seat is taken, by whoever takes it). Remove all `legacy` code after LEGACY_UNTIL.
   Rooms created by the PREVIOUS server (still alive when this code is deployed, TTL
   1 h) carry no `rev` and no `legacy` flag. Every document this code writes has
   `rev` >= 1 (all room writes go through saveRoom; create starts at 0 and saves),
   so a document WITHOUT `rev` can only come from the previous server: getRoom marks
   its existing seats `legacy` in memory, and the first save persists it. Otherwise
   old tabs already in such a room would get 403 on every pick/next.
═══════════════════════════════════════════════════════════ */
const ROOM_TTL_SECONDS = 3600; // 1h of inactivity
const ROOM_CODE_CHARS  = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const ROOM_CODE_RE     = new RegExp(`^[${ROOM_CODE_CHARS}]{5}$`);
const CLIENT_ID_RE     = /^[A-Za-z0-9_-]{8,64}$/;   // randomUUID(), or the 'c'+base36 fallback of the client
const VALID_PICKS      = new Set(['rock', 'paper', 'scissors']);
const BEATS            = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const PROTOCOL_VERSION = 2;
const MAX_BODY_BYTES   = 512;                       // real bodies are < 150 bytes
const MAX_NAME_INPUT   = 100;                       // longer than this is garbage, not a name to clamp
const CODE_ATTEMPTS    = 5;                         // existence-check retries when creating a room
/* End of the old-client compatibility window: 2026-11-15T00:00Z. REVIEW THIS VALUE
   BEFORE DEPLOYING: if the deploy happens close to or after this date, old clients
   get 426 `client_outdated` ("new version, reload") straight away, which is
   acceptable, but then there is no transition at all; move the date forward
   (a couple of weeks after the deploy) if a real transition is wanted. */
const LEGACY_UNTIL     = Date.UTC(2026, 10, 15);

const nowMs = () => Date.now();

/* Unbiased: bytes >= 248 (the last, partial group of 31) are discarded so every
   character has the same probability (256 is not a multiple of 31). */
function genRoomCode() {
  const n = ROOM_CODE_CHARS.length;
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(32);
  let code = '';
  for (let guard = 0; code.length < 5 && guard < 32; guard++) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && code.length < 5; i++) {
      if (buf[i] < limit) code += ROOM_CODE_CHARS[buf[i] % n];
    }
  }
  if (code.length !== 5) throw new Error('rng');
  return code;
}

function jsonResponse(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extraHeaders },
  });
}

const fail = (error, status, extra) => jsonResponse({ error }, status, extra);

/* Names are only ever rendered with textContent, so this is about tidy data, not
   XSS: control characters and newlines out, trimmed, at most 20 characters
   (code points, so an emoji is not cut in half). Returns null when the value is
   not a usable string at all (caller answers 400); '' means "use the default". */
function cleanName(v) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > MAX_NAME_INPUT) return null;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 20).join('');
}

const validId = (id) => (typeof id === 'string' && CLIENT_ID_RE.test(id)) ? id : '';

/* Reads a JSON object body with a hard size cap WITHOUT trusting Content-Length
   (chunked bodies have none). `optional`: an empty/absent body is {} (join and next
   have always been callable without a body by older clients). Returns
   { body } or { err: Response }. */
async function readJsonBody(request, optional) {
  if (!request.body) return optional ? { body: {} } : { err: fail('body required', 400) };
  const ct = request.headers.get('Content-Type') || '';
  if (!/^application\/json\s*(;|$)/i.test(ct)) return { err: fail('content-type must be application/json', 415) };
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { err: fail('body too large', 413) };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { try { await reader.cancel(); } catch (_) {} return { err: fail('body too large', 413) }; }
    chunks.push(value);
  }
  if (size === 0) return optional ? { body: {} } : { err: fail('body required', 400) };
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return { err: fail('invalid json', 400) }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { err: fail('json object expected', 400) };
  return { body: parsed };
}

/* Browsers always send `Origin` on a POST (Fetch spec: for every method other than
   GET/HEAD), including same-origin ones, and the game client is same-origin, so a
   missing or foreign Origin is not our client: refuse it. This stops OTHER
   WEBSITES from using a visitor's browser to create/flood rooms; it does not stop
   a script that forges headers, which only a WAF rate-limit can do. */
function originAllowed(request, url) {
  if (request.headers.get('Origin') !== url.origin) return false;
  const site = request.headers.get('Sec-Fetch-Site');
  return !site || site === 'same-origin';
}

async function getRoom(env, code) {
  const raw = await env.ROOMS.get(code);
  if (!raw) return null;
  const doc = JSON.parse(raw);
  /* No `rev` = written by the previous server (see "LEGACY CLIENTS" above): its
     seats belong to old clients, which cannot send a clientId with pick/next. */
  if (doc.rev === undefined) {
    for (const s of ['p1', 'p2']) if (doc[s] && doc[s].legacy === undefined) doc[s].legacy = true;
  }
  return doc;
}

/* The only writer of the room document: bumps `rev` (see header comment). */
async function saveRoom(env, code, doc) {
  doc.rev = (doc.rev | 0) + 1;
  await env.ROOMS.put(code, JSON.stringify(doc), { expirationTtl: ROOM_TTL_SECONDS });
}

/* Picks live in their own KV key per player per round, so two players
   submitting at nearly the same instant never race on a shared
   read-modify-write and clobber each other's pick (the room doc itself
   only ever needs a read-modify-write for infrequent events: create,
   join, next-round, and the once-per-round score commit below). */
function pickKey(code, round, playerId) { return `${code}:pick:${round}:${playerId}`; }

async function getPick(env, code, round, playerId) {
  const v = await env.ROOMS.get(pickKey(code, round, playerId));
  return VALID_PICKS.has(v) ? v : null;      // anything else in the key is treated as "no pick"
}

async function savePick(env, code, round, playerId, pick) {
  await env.ROOMS.put(pickKey(code, round, playerId), pick, { expirationTtl: ROOM_TTL_SECONDS });
}

/* Which seat does this clientId hold? The room doc stores the ids of the two
   seats; nothing else identifies a player and ids are never echoed back. */
function seatOf(doc, clientId) {
  if (!clientId) return null;
  if (doc.p1 && doc.p1.clientId === clientId) return 'p1';
  if (doc.p2 && doc.p2.clientId === clientId) return 'p2';
  return null;
}

/* Who is making this pick/next request? Returns { seat } or { err: Response }.
   - clientId present  -> must be the id of a seat of THIS room (else 403), and a
                          `playerId` in the body, if any, must be that same seat.
   - clientId absent   -> only the old client's behaviour, and only for a seat that
                          was taken by an old client (`legacy`) and before
                          LEGACY_UNTIL; everything else is 403. */
function authenticate(doc, body, needSeat) {
  if (body.clientId !== undefined) {
    const id = validId(body.clientId);
    if (!id) return { err: fail('invalid client id', 400) };
    const seat = seatOf(doc, id);
    if (!seat) return { err: fail('forbidden', 403) };
    if (body.playerId !== undefined && body.playerId !== seat) return { err: fail('forbidden', 403) };
    return { seat };
  }
  const legacySeats = ['p1', 'p2'].filter((s) => doc[s] && doc[s].legacy === true);
  if (needSeat) {
    // pick: the old client names its seat; it must be a legacy seat
    if (body.playerId !== 'p1' && body.playerId !== 'p2') return { err: fail('forbidden', 403) };
    if (!legacySeats.includes(body.playerId)) return { err: fail('forbidden', 403) };
    if (nowMs() >= LEGACY_UNTIL) return { err: fail('client_outdated', 426) };
    return { seat: body.playerId };
  }
  // next: the old client sends no identity at all; allowed only if a legacy seat exists
  if (!legacySeats.length) return { err: fail('forbidden', 403) };
  if (nowMs() >= LEGACY_UNTIL) return { err: fail('client_outdated', 426) };
  return { seat: null };
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

/* Commits the score of `round` exactly once (as far as KV allows): re-reads the
   document right before writing and only writes if that round is still the
   current one and still unresolved. Both players' requests may reach this at the
   same instant (or one of them with stale reads): they compute the same result
   from the same two picks, so the second write is the same document, not a double
   score; in the worst case a score is off by one. Returns the fresh doc (null if
   the room expired). Never trusts a pick it did not validate. */
async function commitRound(env, code, round, p1Pick, p2Pick) {
  const fresh = await getRoom(env, code);
  if (!fresh) return null;
  if (fresh.round !== round || fresh.resolvedRound === round) return fresh;   // already done / already moved on
  if (!VALID_PICKS.has(p1Pick) || !VALID_PICKS.has(p2Pick)) return fresh;
  const winner = p1Pick === p2Pick ? 'draw' : (BEATS[p1Pick] === p2Pick ? 'p1' : 'p2');
  const scores = { p1: fresh.scores.p1 | 0, p2: fresh.scores.p2 | 0 };
  if (winner === 'p1') scores.p1++;
  if (winner === 'p2') scores.p2++;
  fresh.scores = scores;
  fresh.resolvedRound = round;
  /* The picks ride along in the same write so later polls of a resolved
     round need no pick reads (see readPicks). */
  fresh.lastPicks = { round, p1: p1Pick, p2: p2Pick };
  await saveRoom(env, code, fresh);
  return fresh;
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
  const method = request.method;
  const notAllowed = (allow) => fail('method not allowed', 405, { Allow: allow });

  if (parts.length > 4) return fail('not found', 404);

  // Every state-changing request: same-origin only (checked before any KV access)
  if (method === 'POST' && !originAllowed(request, url)) return fail('forbidden', 403);
  // A page of another site has no business polling either (cheap check, saves KV reads)
  if (method === 'GET' && request.headers.get('Sec-Fetch-Site') === 'cross-site') return fail('forbidden', 403);

  // POST /api/rps-room — create a room, caller becomes p1
  if (parts.length === 2) {
    if (method !== 'POST') return notAllowed('POST');
    const { body, err } = await readJsonBody(request, false);
    if (err) return err;
    const strict = body.v === PROTOCOL_VERSION;
    if (!strict && nowMs() >= LEGACY_UNTIL) return fail('client_outdated', 426);
    const name = cleanName(body.name);
    if (name === null) return fail('invalid name', 400);
    if (strict && !validId(body.clientId)) return fail('invalid client id', 400);
    const clientId = validId(body.clientId);   // '' for an old client that sent none
    const doc = {
      createdAt: nowMs(), round: 1, scores: { p1: 0, p2: 0 }, resolvedRound: 0, rev: 0,
      p1: { name: name || 'Jugador 1', clientId, ...(strict ? {} : { legacy: true }) },
      p2: null,
    };
    // 31^5 codes: a collision is very unlikely, but never overwrite a live room
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      const code = genRoomCode();
      if (await env.ROOMS.get(code) !== null) continue;
      await saveRoom(env, code, doc);
      return jsonResponse({ code, playerId: 'p1', state: buildStateResponse(doc, null, null, 'p1') });
    }
    return fail('unavailable', 503, { 'Retry-After': '3' });
  }

  const code = (parts[2] || '').toUpperCase();
  if (!ROOM_CODE_RE.test(code)) return fail('invalid room code', 400);

  // GET /api/rps-room/:code — poll current state (1 read in the lobby and once
  // a round is resolved, 3 while picks are being made — see readPicks)
  if (parts.length === 3) {
    if (method !== 'GET') return notAllowed('GET');
    let doc = await getRoom(env, code);
    if (!doc) return fail('room not found', 404);
    const [p1Pick, p2Pick] = await readPicks(env, code, doc);
    /* Both picks are in but the score was never committed (the commit of both
       requests saw stale reads, see header): commit it now, once, so the round
       can be closed with "next". Costs one write per round, only in that case. */
    if (p1Pick && p2Pick && doc.resolvedRound !== doc.round) {
      const fresh = await commitRound(env, code, doc.round, p1Pick, p2Pick);
      if (!fresh) return fail('room not found', 404);
      doc = fresh;
    }
    const viewer = seatOf(doc, validId(request.headers.get('X-HG-Client')));
    return jsonResponse({ state: buildStateResponse(doc, p1Pick, p2Pick, viewer) });
  }

  const action = parts[3];
  if (action !== 'join' && action !== 'pick' && action !== 'next') return fail('not found', 404);
  if (method !== 'POST') return notAllowed('POST');

  // POST /api/rps-room/:code/join — caller becomes p2 (idempotent per clientId)
  if (action === 'join') {
    const { body, err } = await readJsonBody(request, true);
    if (err) return err;
    const strict = body.v === PROTOCOL_VERSION;
    if (!strict && nowMs() >= LEGACY_UNTIL) return fail('client_outdated', 426);
    const name = cleanName(body.name);
    if (name === null) return fail('invalid name', 400);
    if (strict && !validId(body.clientId)) return fail('invalid client id', 400);
    const joinerId = validId(body.clientId);
    const doc = await getRoom(env, code);
    if (!doc) return fail('room not found', 404);
    /* Seat 2 is first-come. `clientId` is a random id the client generates per
       browser tab (kept in sessionStorage, so a reload keeps the seat): the
       same client coming back gets its own seat back with NO write, anybody else
       gets 409. The creator re-entering with the room code gets seat p1 back. */
    let seatId = seatOf(doc, joinerId);
    let current = doc;
    if (!seatId) {
      if (doc.p2) return fail('room full', 409);
      const fresh = await getRoom(env, code);     // narrow the race: merge onto the newest doc
      if (!fresh) return fail('room not found', 404);
      if (fresh.p2) return fail('room full', 409);
      fresh.p2 = { name: name || 'Jugador 2', clientId: joinerId, ...(strict ? {} : { legacy: true }) };
      await saveRoom(env, code, fresh);
      /* KV has no compare-and-swap: two joiners can both read "no p2" and both
         write. Re-read after writing; whoever's clientId did not survive loses.
         Narrows the race (cannot close it without Durable Objects). */
      const check = await getRoom(env, code);
      if (!check || !check.p2 || (joinerId && check.p2.clientId !== joinerId)) return fail('room full', 409);
      seatId = 'p2';
      current = check;
    }
    const [p1Pick, p2Pick] = await readPicks(env, code, current);
    return jsonResponse({ playerId: seatId, state: buildStateResponse(current, p1Pick, p2Pick, seatId) });
  }

  // POST /api/rps-room/:code/pick — submit a pick; resolves the round once both are in
  if (action === 'pick') {
    const { body, err } = await readJsonBody(request, false);
    if (err) return err;
    if (!VALID_PICKS.has(body.pick)) return fail('invalid pick', 400);
    if (body.round !== undefined && !(Number.isInteger(body.round) && body.round >= 1 && body.round <= 1e6)) return fail('invalid round', 400);
    const doc = await getRoom(env, code);
    if (!doc) return fail('room not found', 404);
    const auth = authenticate(doc, body, true);
    if (auth.err) return auth.err;
    const me = auth.seat;
    const other = me === 'p1' ? 'p2' : 'p1';
    if (!doc.p2) return fail('waiting for rival', 409);
    // A pick for a round that is no longer the current one (delayed request)
    if (body.round !== undefined && body.round !== doc.round) return fail('stale round', 409);

    /* Round already resolved: both picks are final. The same pick again is an
       idempotent retry (answer with the state); a different one is refused. */
    if (doc.resolvedRound === doc.round) {
      const [r1, r2] = await readPicks(env, code, doc);
      const mine = me === 'p1' ? r1 : r2;
      if (mine !== body.pick) return fail('already picked', 409);
      return jsonResponse({ state: buildStateResponse(doc, r1, r2, me) });
    }

    /* One pick per player per round. Same pick again = a retry whose answer was
       lost: succeed without writing. A different pick = refused (no changing
       your mind after seeing nothing, and no overwriting by a forged request).
       (KV cannot make read+write atomic: two truly simultaneous requests of the
       SAME player could both pass this check; the last write wins.) */
    const existing = await getPick(env, code, doc.round, me);
    if (existing && existing !== body.pick) return fail('already picked', 409);
    if (!existing) await savePick(env, code, doc.round, me, body.pick);
    const otherPick = await getPick(env, code, doc.round, other);
    const picks = { [me]: body.pick, [other]: otherPick };

    let cur = doc;
    if (otherPick) {
      cur = await commitRound(env, code, doc.round, picks.p1, picks.p2);
      if (!cur) return fail('room not found', 404);
    }
    return jsonResponse({ state: buildStateResponse(cur, picks.p1, picks.p2, me) });
  }

  // POST /api/rps-room/:code/next — advance to the next round (keeps scores).
  // Both players see their own "Siguiente ronda" button and may both click
  // it for the same round transition: only the first advances; the second one
  // (its `round` no longer matches) is a no-op that returns the current state.
  // Only a RESOLVED round can be left behind: nobody can skip a round that
  // still lacks a pick. `round` is optional (older clients may omit it): it
  // then means "the current round".
  if (action === 'next') {
    const { body, err } = await readJsonBody(request, true);
    if (err) return err;
    if (body.round !== undefined && !(Number.isInteger(body.round) && body.round >= 1 && body.round <= 1e6)) return fail('invalid round', 400);
    let doc = await getRoom(env, code);
    if (!doc) return fail('room not found', 404);
    const auth = authenticate(doc, body, false);
    if (auth.err) return auth.err;
    const round = body.round === undefined ? doc.round : body.round;
    if (round !== doc.round) {
      const [p1Pick, p2Pick] = await readPicks(env, code, doc);
      return jsonResponse({ state: buildStateResponse(doc, p1Pick, p2Pick, auth.seat) });   // already advanced: nothing to write
    }
    if (doc.resolvedRound !== doc.round) {
      // The commit may have been missed because of stale reads: try once more from the picks.
      const [a, b] = doc.p2 ? await Promise.all([getPick(env, code, round, 'p1'), getPick(env, code, round, 'p2')]) : [null, null];
      if (!(a && b)) return fail('round not resolved', 409);
      doc = await commitRound(env, code, round, a, b);
      if (!doc) return fail('room not found', 404);
      if (doc.round !== round) return jsonResponse({ state: buildStateResponse(doc, null, null, auth.seat) });
    }
    const fresh = await getRoom(env, code);
    if (!fresh) return fail('room not found', 404);
    if (fresh.round !== round) return jsonResponse({ state: buildStateResponse(fresh, null, null, auth.seat) });
    if (fresh.resolvedRound !== round) return fail('round not resolved', 409);
    fresh.round = round + 1;
    await saveRoom(env, code, fresh);
    return jsonResponse({ state: buildStateResponse(fresh, null, null, auth.seat) });
  }

  return fail('not found', 404);
}

function get404Path(pathname) {
  if (/(^|\/)en(\/|$)/.test(pathname)) return '/en/404.html';
  if (/(^|\/)pt(\/|$)/.test(pathname)) return '/pt/404.html';
  return '/404.html';
}

async function notFoundResponse(env, url) {
  const notFound = await env.ASSETS.fetch(new Request(`${url.origin}${get404Path(url.pathname)}`));
  const headers = new Headers(notFound.headers);
  // A 404 must never be cached as if it were the asset: a /x.js that does not exist
  // yet must not stick (as `immutable`, for a year) once the file is published.
  headers.set('Cache-Control', 'no-store');
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
