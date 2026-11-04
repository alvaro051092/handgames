// Tests for the RPS rooms API in worker.js, run against the real handler with an
// in-memory KV (no network, no wrangler, no randomness that is not controlled).
//
//   node --test tests/rooms-api.test.mjs
//   WORKER_SRC=/path/to/other-worker.js node --test tests/rooms-api.test.mjs   (used to test mutated copies)
//
// `tests/` is listed in .assetsignore, so none of this is published.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.WORKER_SRC || path.join(ROOT, 'worker.js');
const src = readFileSync(SRC, 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;

const ORIGIN = 'https://handgames.app';
const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';   // client ids (same shape as crypto.randomUUID())
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const C = 'cccccccc-3333-4333-8333-cccccccccccc';

/* Expected security headers: the "/*" rule of _headers is the source of truth. */
const EXPECTED_HEADERS = (() => {
  const out = {}; let inStar = false;
  for (const line of readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) { inStar = line.trim() === '/*'; continue; }
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (inStar && m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
})();

function mkEnv(opts = {}) {
  const store = new Map();
  const log = { gets: 0, puts: [], ttl: new Set() };
  const env = {
    ROOMS: {
      async get(k) {
        log.gets++;
        if (opts.failGet) throw new Error('kv down');
        if (opts.getHook) { const o = opts.getHook(k, log.gets, store); if (o !== undefined) return o; }   // simulate stale / expired reads
        return store.has(k) ? store.get(k) : null;
      },
      async put(k, v, o) { if (opts.failPut) throw new Error('quota'); log.puts.push(k); if (o && o.expirationTtl) log.ttl.add(o.expirationTtl); store.set(k, v); },
    },
    ASSETS: {
      async fetch(req) {
        const p = new URL(req.url).pathname;
        if (p === '/js/app.js') return new Response('x', { status: 200, headers: { 'content-type': 'text/javascript' } });
        if (p === '/sw.js') return new Response('x', { status: 200 });
        if (p === '/404.html' || p === '/en/404.html' || p === '/pt/404.html') return new Response('<h1>404</h1>', { status: 200, headers: { 'content-type': 'text/html' } });
        return new Response('nf', { status: 404 });
      },
    },
  };
  const doc = (code) => JSON.parse(store.get(code));
  const resetCounters = () => { log.gets = 0; log.puts.length = 0; };
  return { env, store, log, doc, resetCounters };
}

/* One HTTP call to the worker. Defaults are what the real client does: same-origin
   POST with Origin and application/json. */
async function call(ctx, method, p, { body, headers = {}, origin = ORIGIN, ct = 'application/json', raw, url = ORIGIN } = {}) {
  const h = { ...headers };
  if (method === 'POST' && origin !== null) h.Origin = origin;
  const hasBody = raw !== undefined || body !== undefined;
  if (hasBody && ct !== null) h['Content-Type'] = ct;
  const init = { method, headers: h };
  if (raw !== undefined) { init.body = raw; if (typeof raw === 'object' && !(raw instanceof Uint8Array) && !(raw instanceof ArrayBuffer)) init.duplex = 'half'; }
  else if (body !== undefined) init.body = JSON.stringify(body);
  const res = await worker.fetch(new Request(url + p, init), ctx.env);
  let json = null; const text = await res.text(); try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

const create = (c, id = A, name = 'Ana', extra = {}) => call(c, 'POST', '/api/rps-room', { body: { name, clientId: id, v: 2, ...extra } });
const join   = (c, code, id = B, name = 'Beto', extra = {}) => call(c, 'POST', `/api/rps-room/${code}/join`, { body: { name, clientId: id, v: 2, ...extra } });
const pick   = (c, code, id, seat, p, extra = {}) => call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { clientId: id, playerId: seat, pick: p, ...extra } });
const next   = (c, code, id, round, extra = {}) => call(c, 'POST', `/api/rps-room/${code}/next`, { body: { clientId: id, round, ...extra } });
const state  = (c, code, id) => call(c, 'GET', `/api/rps-room/${code}`, { headers: id ? { 'X-HG-Client': id } : {} });

async function match(opts) {          // a room with both seats taken (strict clients)
  const c = mkEnv(opts);
  const r = await create(c); assert.equal(r.status, 200, r.text);
  const j = await join(c, r.json.code); assert.equal(j.status, 200, j.text);
  c.resetCounters();
  return { c, code: r.json.code };
}

async function withNow(ts, fn) {
  const real = Date.now; Date.now = () => ts;
  try { return await fn(); } finally { Date.now = real; }
}
async function withRng(bytesFn, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis.crypto, 'getRandomValues');
  globalThis.crypto.getRandomValues = (buf) => { bytesFn(buf); return buf; };
  try { return await fn(); } finally { if (desc) Object.defineProperty(globalThis.crypto, 'getRandomValues', desc); else delete globalThis.crypto.getRandomValues; }
}

/* ───────────────────────── headers on every JSON answer ───────────────────────── */
test('every API answer carries the security headers of _headers, no-store and JSON', async () => {
  const { c, code } = await match();
  const answers = [
    await create(c),                                                                  // 200
    await call(c, 'POST', '/api/rps-room', { body: { clientId: A, v: 2 }, origin: 'https://evil.example' }),   // 403
    await call(c, 'POST', '/api/rps-room', { raw: 'x', ct: 'text/plain' }),           // 415
    await call(c, 'GET', '/api/rps-room'),                                            // 405
    await call(c, 'GET', '/api/rps-room/ZZZZ'),                                       // 400
    await call(c, 'GET', '/api/rps-room/ABCDE'),                                      // 404
    await call(c, 'POST', '/api/rps-room', { raw: 'x'.repeat(2000) }),                // 413
    await pick(c, code, C, 'p1', 'rock'),                                             // 403
    await state(c, code, A),                                                          // 200
  ];
  assert.deepEqual(answers.map((a) => a.status), [200, 403, 415, 405, 400, 404, 413, 403, 200]);
  assert.ok(Object.keys(EXPECTED_HEADERS).length >= 6, '_headers /* rule was parsed');
  for (const a of answers) {
    for (const [k, v] of Object.entries(EXPECTED_HEADERS)) assert.equal(a.headers.get(k), v, `${a.status} ${k}`);
    assert.equal(a.headers.get('cache-control'), 'no-store', `${a.status} cache-control`);
    assert.match(a.headers.get('content-type'), /^application\/json/);
  }
});

test('KV failures (quota/outage) answer a clean 503 with the security headers', async () => {
  for (const opts of [{ failPut: true }, { failGet: true }]) {
    const c = mkEnv(opts);
    const r = await create(c);
    if (opts.failGet) { assert.equal(r.status, 503); }
    else assert.equal(r.status, 503);
    assert.equal(r.json.error, 'unavailable');
    assert.equal(r.headers.get('retry-after'), '3');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
});

/* ───────────────────────── origin / content-type / body / method ───────────────────────── */
test('POST needs the site\'s own Origin (missing, foreign, other scheme/port/subdomain -> 403, no KV access)', async () => {
  const c = mkEnv();
  for (const origin of [null, 'https://evil.example', 'http://handgames.app', 'https://handgames.app:8443', 'https://www.handgames.app', 'null', 'https://handgames.app.evil.example']) {
    const r = await call(c, 'POST', '/api/rps-room', { body: { clientId: A, v: 2 }, origin });
    assert.equal(r.status, 403, `origin=${origin}`);
  }
  const same = await call(c, 'POST', '/api/rps-room', { body: { clientId: A, v: 2 }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(same.status, 403, 'Sec-Fetch-Site: cross-site');
  assert.equal((await call(c, 'POST', '/api/rps-room', { body: { clientId: A, v: 2 }, headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403);
  assert.equal((await call(c, 'POST', '/api/rps-room', { body: { clientId: A, v: 2 }, headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  assert.equal(c.log.puts.length, 1, 'only the legitimate request wrote');
  // the other POST routes too
  const { c: c2, code } = await match();
  for (const route of ['join', 'pick', 'next']) {
    const r = await call(c2, 'POST', `/api/rps-room/${code}/${route}`, { body: { clientId: A, v: 2, pick: 'rock', playerId: 'p1' }, origin: 'https://evil.example' });
    assert.equal(r.status, 403, route);
  }
  assert.equal(c2.log.puts.length, 0);
});

test('cross-site GET polling is refused; same-origin GET needs no Origin', async () => {
  const { c, code } = await match();
  assert.equal((await call(c, 'GET', `/api/rps-room/${code}`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await call(c, 'GET', `/api/rps-room/${code}`, { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  assert.equal((await state(c, code)).status, 200);
});

test('Content-Type must be application/json (parameters allowed), refused before any KV access', async () => {
  const c = mkEnv();
  const bad = [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonx', 'text/json', 'application/json-patch+json'];
  for (const ct of bad) {
    const r = await call(c, 'POST', '/api/rps-room', { raw: JSON.stringify({ clientId: A, v: 2 }), ct });
    assert.equal(r.status, 415, `ct=${ct}`);
  }
  assert.equal(c.log.gets + c.log.puts.length, 0, 'no KV access for refused requests');
  for (const ct of ['application/json', 'application/json; charset=utf-8', 'Application/JSON']) {
    assert.equal((await call(c, 'POST', '/api/rps-room', { raw: JSON.stringify({ clientId: A, v: 2 }), ct })).status, 200, ct);
  }
});

test('body size cap: declared and undeclared (streamed) oversize -> 413; garbage -> 400; none of them touches KV', async () => {
  const c = mkEnv();
  const big = JSON.stringify({ clientId: A, v: 2, name: 'x', pad: 'y'.repeat(2000) });
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: big })).status, 413);
  // chunked: no Content-Length at all, the cap must still hold
  const stream = new ReadableStream({ start(ctl) { const e = new TextEncoder(); ctl.enqueue(e.encode(big.slice(0, 700))); ctl.enqueue(e.encode(big.slice(700))); ctl.close(); } });
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: stream })).status, 413);
  // a body that lies about its size cannot be built with fetch(); the streamed case above covers "no usable length"
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: '{not json' })).status, 400);
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: '[1,2]' })).status, 400);
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: 'null' })).status, 400);
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: '"str"' })).status, 400);
  const badUtf8 = Buffer.concat([Buffer.from('{"v":2,"clientId":"' + A + '","name":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: new Uint8Array(badUtf8) })).status, 400, 'invalid utf-8 inside an otherwise valid JSON document');
  assert.equal((await call(c, 'POST', '/api/rps-room', { raw: '' })).status, 400, 'create needs a body');
  assert.equal((await call(c, 'POST', '/api/rps-room', {})).status, 400, 'create needs a body (none sent)');
  assert.equal(c.log.gets + c.log.puts.length, 0);
});

test('methods and paths: wrong method -> 405 with Allow, unknown action / extra segments -> 404', async () => {
  const { c, code } = await match();
  for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const r = await call(c, m, '/api/rps-room', {});
    assert.equal(r.status, 405, `${m} /api/rps-room`);
    assert.equal(r.headers.get('allow'), 'POST');
  }
  assert.equal((await call(c, 'POST', `/api/rps-room/${code}`, { body: {} })).status, 405);
  assert.equal((await call(c, 'DELETE', `/api/rps-room/${code}`)).status, 405);
  for (const a of ['join', 'pick', 'next']) assert.equal((await call(c, 'GET', `/api/rps-room/${code}/${a}`)).status, 405, `GET ${a}`);
  assert.equal((await call(c, 'POST', `/api/rps-room/${code}/delete`, { body: {} })).status, 404);
  assert.equal((await call(c, 'POST', `/api/rps-room/${code}/pick/x`, { body: { clientId: A, pick: 'rock' } })).status, 404);
  assert.equal((await call(c, 'GET', `/api/rps-room/${code}/extra/more/x`)).status, 404);
  assert.equal(c.log.puts.length, 0);
});

/* ───────────────────────── input formats ───────────────────────── */
test('room code: strict format on every route (400 before any KV read), unknown valid code -> 404', async () => {
  const c = mkEnv();
  for (const bad of ['ABCD', 'ABCDEF', 'ABCD0', 'ABCDO', 'ABCD1', 'ABCDI', 'ABCDL', 'AB-DE', 'ABC%20E', '%00%00%00%00%00', '<b>AB>']) {
    assert.equal((await call(c, 'GET', `/api/rps-room/${bad}`)).status, 400, `GET ${bad}`);
    for (const a of ['join', 'pick', 'next']) {
      assert.equal((await call(c, 'POST', `/api/rps-room/${bad}/${a}`, { body: { clientId: A, v: 2, pick: 'rock' } })).status, 400, `${a} ${bad}`);
    }
  }
  assert.equal(c.log.gets + c.log.puts.length, 0, 'no KV access for malformed codes');
  assert.equal((await call(c, 'GET', '/api/rps-room/ABCDE')).status, 404);
  assert.equal((await join(c, 'ABCDE')).status, 404);
  assert.equal((await pick(c, 'ABCDE', A, 'p1', 'rock')).status, 404);
  assert.equal((await next(c, 'ABCDE', A, 1)).status, 404);
  // lower case is accepted and normalised (the client types it that way on phones)
  const r = await create(c); const low = r.json.code.toLowerCase();
  assert.equal((await call(c, 'GET', `/api/rps-room/${low}`)).status, 200);
});

test('name: non-string / absurdly long -> 400; control chars stripped; max 20 code points; empty -> default', async () => {
  const c = mkEnv();
  for (const name of [123, {}, [], true, 'x'.repeat(101)]) assert.equal((await create(c, A, name)).status, 400, JSON.stringify(name).slice(0, 20));
  assert.equal(c.log.puts.length, 0);
  const r1 = await create(c, A, '  Al\nvaro\t\u0000X  ');
  assert.equal(r1.json.state.p1.name, 'Al varo X');
  const r2 = await create(c, A, 'abcdefghijklmnopqrstuvwxyz');
  assert.equal(r2.json.state.p1.name, 'abcdefghijklmnopqrst');
  const r3 = await create(c, A, '😀'.repeat(25));
  assert.equal(Array.from(r3.json.state.p1.name).length, 20);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(r3.json.state.p1.name), 'no lone surrogate');
  const r4 = await create(c, A, '   ');
  assert.equal(r4.json.state.p1.name, 'Jugador 1');
  const r5 = await call(c, 'POST', '/api/rps-room', { body: { clientId: A, v: 2 } });
  assert.equal(r5.json.state.p1.name, 'Jugador 1');
});

test('clientId format (v2 requires one): missing/short/long/odd chars -> 400; UUID and the client\'s fallback id are fine', async () => {
  const c = mkEnv();
  for (const id of [undefined, '', 'short', 'a'.repeat(65), 'has space in it', 'semi;colon-id1', '../../etc/passwd', 12345678, null, {}]) {
    const r = await call(c, 'POST', '/api/rps-room', { body: { name: 'x', clientId: id, v: 2 } });
    assert.equal(r.status, 400, `id=${JSON.stringify(id)}`);
  }
  assert.equal(c.log.puts.length, 0);
  assert.equal((await create(c, 'c' + 'k3j4h5g6f7d8' + 'lq2w3e4r')).status, 200, "Math.random fallback id of the client");
  assert.equal((await create(c, A)).status, 200);
  assert.equal((await create(c, 'a'.repeat(64))).status, 200);
});

/* ───────────────────────── room creation / codes ───────────────────────── */
test('create: well-formed code, TTL set, no identity in the response, doc starts at rev 1', async () => {
  const c = mkEnv();
  const r = await create(c, A, 'Ana');
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  assert.equal(r.json.playerId, 'p1');
  assert.ok(!r.text.includes(A), 'clientId is never echoed');
  assert.equal(c.doc(r.json.code).rev, 1);
  assert.deepEqual([...c.log.ttl], [3600]);
});

test('room codes come from crypto.getRandomValues, never Math.random', async () => {
  const real = Math.random; let calls = 0;
  Math.random = () => { calls++; throw new Error('Math.random must not be used'); };
  try {
    const c = mkEnv();
    for (let i = 0; i < 20; i++) assert.equal((await create(c)).status, 200);
    assert.equal(calls, 0);
  } finally { Math.random = real; }
  let used = 0;
  await withRng((buf) => { used++; for (let i = 0; i < buf.length; i++) buf[i] = i; }, async () => {
    const c = mkEnv();
    assert.equal((await create(c)).json.code, 'ABCDE');
  });
  assert.ok(used >= 1, 'getRandomValues was called');
});

test('room codes are unbiased: bytes that would favour some letters (>= 248) are discarded', async () => {
  await withRng((buf) => { buf[0] = 255; buf[1] = 254; buf[2] = 248; for (let i = 3; i < buf.length; i++) buf[i] = i - 3; }, async () => {
    const c = mkEnv();
    assert.equal((await create(c)).json.code, 'ABCDE');   // 255/254/248 skipped; 0..4 -> A..E
  });
  // every byte value, one by one: 0..247 map to chars[v % 31] (each character exactly 8 times); 248..255 are skipped
  const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const first = {};
  for (let v = 0; v < 256; v++) {
    await withRng((buf) => { buf[0] = v; for (let i = 1; i < buf.length; i++) buf[i] = i - 1; }, async () => {
      const code = (await create(mkEnv())).json.code;
      if (v >= 248) assert.equal(code, 'ABCDE', `byte ${v} must be discarded`);
      else { assert.equal(code[0], CH[v % 31], `byte ${v}`); first[code[0]] = (first[code[0]] || 0) + 1; }
    });
  }
  assert.equal(Object.keys(first).length, 31);
  assert.ok(Object.values(first).every((n) => n === 8), 'each character has the same probability');
});

test('code collision: never overwrites a live room; retries with a new code; gives up with 503 after a few attempts', async () => {
  const c = mkEnv();
  let n = 0;
  await withRng((buf) => { const base = n++ < 2 ? 0 : 5; for (let i = 0; i < buf.length; i++) buf[i] = base + (i % 5); }, async () => {
    const first = await create(c, A, 'Ana');       // call 0 -> 'ABCDE'
    assert.equal(first.json.code, 'ABCDE');
    const second = await create(c, B, 'Beto');     // call 1 -> 'ABCDE' again (collision), call 2 -> 'FGHJK'
    assert.equal(second.status, 200);
    assert.equal(second.json.code, 'FGHJK');
    assert.equal(c.doc('ABCDE').p1.name, 'Ana', 'the live room was not overwritten');
    assert.equal(c.doc('FGHJK').p1.name, 'Beto');
  });
  const c2 = mkEnv();
  await withRng((buf) => { for (let i = 0; i < buf.length; i++) buf[i] = i % 5; }, async () => {
    assert.equal((await create(c2, A, 'Ana')).status, 200);
    const gets0 = c2.log.gets;
    const again = await create(c2, B, 'Beto');
    assert.equal(again.status, 503);
    assert.equal(again.json.error, 'unavailable');
    assert.ok(c2.log.gets - gets0 <= 6, 'bounded number of existence checks');
    assert.equal(c2.doc('ABCDE').p1.name, 'Ana');
  });
});

test('writes only when something changes: invalid requests and idempotent retries do not write', async () => {
  const { c, code } = await match();
  await call(c, 'POST', '/api/rps-room', { body: { v: 2 } });
  await join(c, code, B);                                           // same client again
  await join(c, code, A);                                           // creator coming back
  assert.equal(c.log.puts.length, 0, 'rejoin writes nothing');
  assert.equal((await pick(c, code, A, 'p1', 'rock')).status, 200);
  const w = c.log.puts.length;
  assert.equal((await pick(c, code, A, 'p1', 'rock')).status, 200);
  assert.equal(c.log.puts.length, w, 'repeating the same pick writes nothing');
  assert.equal((await next(c, code, A, 1)).status, 409);
  assert.equal(c.log.puts.length, w, 'refused next writes nothing');
});

/* ───────────────────────── join ───────────────────────── */
test('join: first come first served; same client gets its seat back with no write; third client -> 409', async () => {
  const c = mkEnv();
  const r = await create(c); const code = r.json.code;
  const j = await join(c, code, B);
  assert.equal(j.status, 200); assert.equal(j.json.playerId, 'p2');
  assert.equal(j.json.state.p2.name, 'Beto');
  c.resetCounters();
  assert.equal((await join(c, code, B)).json.playerId, 'p2');
  assert.equal((await join(c, code, A)).json.playerId, 'p1', 'the creator re-entering');
  assert.equal(c.log.puts.length, 0);
  const third = await join(c, code, C);
  assert.equal(third.status, 409); assert.equal(third.json.error, 'room full');
  assert.equal(c.doc(code).p2.clientId, B);
  assert.ok(!j.text.includes(B) && !third.text.includes(B));
});

test('join: two simultaneous joiners -> exactly one gets the seat', async () => {
  const c = mkEnv();
  const code = (await create(c)).json.code;
  const [x, y] = await Promise.all([join(c, code, B, 'B'), join(c, code, C, 'C')]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  const winner = x.status === 200 ? B : C;
  assert.equal(c.doc(code).p2.clientId, winner);
});

/* ───────────────────────── authentication of pick / next ───────────────────────── */
test('pick: a client that is not a seat of the room is refused (403) and nothing is written', async () => {
  const { c, code } = await match();
  const cases = [
    pick(c, code, C, 'p1', 'rock'),          // stranger, claims p1
    pick(c, code, C, 'p2', 'rock'),          // stranger, claims p2
    pick(c, code, C, undefined, 'rock'),     // stranger, no seat
    pick(c, code, A, 'p2', 'rock'),          // p1's id acting as p2
    pick(c, code, B, 'p1', 'rock'),          // p2's id acting as p1
    pick(c, code, undefined, 'p1', 'rock'),  // no clientId at all, strict seat
    pick(c, code, undefined, 'p2', 'rock'),
    pick(c, code, null, 'p1', 'rock'),       // null clientId must not match the empty id of a legacy seat
    pick(c, code, '', 'p1', 'rock'),
  ];
  const res = await Promise.all(cases);
  for (const i of [0, 1, 2, 3, 4, 5, 6]) assert.equal(res[i].status, 403, `case ${i}`);
  for (const i of [7, 8]) assert.equal(res[i].status, 400, `case ${i}: null / empty clientId is malformed, never a match`);
  assert.equal(c.log.puts.length, 0, 'no pick was stored');
  const s = await state(c, code, A);
  assert.equal(s.json.state.p1.picked, false); assert.equal(s.json.state.p2.picked, false);
});

test('pick: invalid clientId format -> 400', async () => {
  const { c, code } = await match();
  for (const id of ['x', 'a'.repeat(65), 'bad id with spaces', 123]) assert.equal((await pick(c, code, id, 'p1', 'rock')).status, 400, String(id));
  assert.equal(c.log.puts.length, 0);
});

test('pick: valid owner works; the rival cannot learn or alter it before the round resolves', async () => {
  const { c, code } = await match();
  const p = await pick(c, code, A, 'p1', 'rock');
  assert.equal(p.status, 200);
  assert.equal(p.json.state.p1.pick, 'rock');          // own pick echoed to its owner
  assert.equal(p.json.state.p2.pick, null);
  assert.equal(p.json.state.roundWinner, null);
  // nobody else sees it: anonymous, stranger, rival, forged header
  for (const who of [undefined, C, B, 'x']) {
    const s = (await state(c, code, who)).json.state;
    assert.equal(s.p1.pick, null, `viewer=${who}`);
    assert.equal(s.p1.picked, true);
    assert.equal(s.p2.pick, null);
    assert.equal(s.roundWinner, null);
  }
  // the owner sees it on a poll, the rival's join/rejoin response does not
  assert.equal((await state(c, code, A)).json.state.p1.pick, 'rock');
  const rj = await join(c, code, B);
  assert.equal(rj.json.state.p1.pick, null);
  assert.ok(!(await state(c, code, B)).text.includes('"pick":"rock"'));
  // rival cannot overwrite it by claiming its seat
  const forged = await pick(c, code, B, 'p1', 'paper');
  assert.equal(forged.status, 403);
  const kvPick = await c.env.ROOMS.get(`${code}:pick:1:p1`);
  assert.equal(kvPick, 'rock');
  // the rival's own pick resolves; its response shows both only now
  const r = await pick(c, code, B, 'p2', 'paper');
  assert.equal(r.json.state.roundWinner, 'p2');
  assert.equal(r.json.state.p1.pick, 'rock');
});

test('pick without playerId works for a v2 client (the seat comes from clientId); a wrong playerId is refused', async () => {
  const { c, code } = await match();
  assert.equal((await pick(c, code, A, undefined, 'rock')).status, 200);
  assert.equal((await pick(c, code, B, 'p1', 'rock')).status, 403);
  assert.equal((await pick(c, code, B, 'P2', 'rock')).status, 403);
  assert.equal((await pick(c, code, B, 'p3', 'rock')).status, 403);
});

test('pick: invalid values and states', async () => {
  const lobby = mkEnv();
  const code0 = (await create(lobby)).json.code;
  assert.equal((await pick(lobby, code0, A, 'p1', 'rock')).status, 409, 'no rival yet');
  const { c, code } = await match();
  for (const v of [null, undefined, 'lizard', 'ROCK', 'Rock', 1, {}, ['rock'], '']) assert.equal((await pick(c, code, A, 'p1', v)).status, 400, JSON.stringify(v));
  for (const r of [0, -1, 1.5, '1', 1e9, null]) assert.equal((await pick(c, code, A, 'p1', 'rock', { round: r })).status, 400, `round=${JSON.stringify(r)}`);
  assert.equal(c.log.puts.length, 0);
});

test('re-pick in the same round: a different pick -> 409 and the first stands; the same pick is an idempotent retry', async () => {
  const { c, code } = await match();
  assert.equal((await pick(c, code, A, 'p1', 'rock')).status, 200);
  const second = await pick(c, code, A, 'p1', 'paper');
  assert.equal(second.status, 409); assert.equal(second.json.error, 'already picked');
  assert.equal(await c.env.ROOMS.get(`${code}:pick:1:p1`), 'rock');
  const w = c.log.puts.length;
  assert.equal((await pick(c, code, A, 'p1', 'rock')).status, 200);
  assert.equal(c.log.puts.length, w, 'idempotent retry does not write');
  // once the round is resolved both picks are final, from either side
  assert.equal((await pick(c, code, B, 'p2', 'scissors')).json.state.roundWinner, 'p1');
  assert.equal((await pick(c, code, A, 'p1', 'scissors')).status, 409);
  assert.equal((await pick(c, code, B, 'p2', 'rock')).status, 409);
  const same = await pick(c, code, B, 'p2', 'scissors');
  assert.equal(same.status, 200); assert.deepEqual(same.json.state.scores, { p1: 1, p2: 0 });
  assert.equal(c.doc(code).scores.p1, 1, 'score committed once');
});

test('pick for a round that already passed (delayed request) -> 409, never applied to the next round', async () => {
  const { c, code } = await match();
  await pick(c, code, A, 'p1', 'rock'); await pick(c, code, B, 'p2', 'paper');
  assert.equal((await next(c, code, A, 1)).json.state.round, 2);
  const late = await pick(c, code, A, 'p1', 'scissors', { round: 1 });
  assert.equal(late.status, 409); assert.equal(late.json.error, 'stale round');
  assert.equal(await c.env.ROOMS.get(`${code}:pick:2:p1`), null);
  assert.equal((await pick(c, code, A, 'p1', 'scissors', { round: 2 })).status, 200);
  assert.equal((await pick(c, code, B, 'p2', 'rock', { round: 3 })).status, 409, 'a round in the future is refused too');
});

test('resolution: all nine combinations score correctly and exactly once', async () => {
  const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  for (const a of ['rock', 'paper', 'scissors']) for (const b of ['rock', 'paper', 'scissors']) {
    const { c, code } = await match();
    const first = await pick(c, code, A, 'p1', a);
    assert.equal(first.json.state.roundWinner, null);
    const r = await pick(c, code, B, 'p2', b);
    const want = a === b ? 'draw' : (BEATS[a] === b ? 'p1' : 'p2');
    assert.equal(r.json.state.roundWinner, want, `${a} vs ${b}`);
    assert.deepEqual(r.json.state.scores, { p1: want === 'p1' ? 1 : 0, p2: want === 'p2' ? 1 : 0 });
    for (let i = 0; i < 3; i++) await state(c, code, A);                 // polling never double counts
    const d = c.doc(code);
    assert.equal(d.resolvedRound, 1);
    assert.deepEqual(d.scores, { p1: want === 'p1' ? 1 : 0, p2: want === 'p2' ? 1 : 0 });
    assert.equal(d.lastPicks.p1, a); assert.equal(d.lastPicks.p2, b);
    const g = (await state(c, code, null)).json.state;                   // anonymous poll after resolution shows both picks
    assert.equal(g.p1.pick, a); assert.equal(g.p2.pick, b); assert.equal(g.roundWinner, want);
  }
});

test('simultaneous picks of both players resolve once', async () => {
  const { c, code } = await match();
  const [x, y] = await Promise.all([pick(c, code, A, 'p1', 'rock'), pick(c, code, B, 'p2', 'scissors')]);
  assert.equal(x.status, 200); assert.equal(y.status, 200);
  const g = (await state(c, code, A)).json.state;
  assert.equal(g.roundWinner, 'p1');
  assert.deepEqual(c.doc(code).scores, { p1: 1, p2: 0 });
});

test('a pick stored in KV is never trusted unvalidated (corrupt value is "no pick")', async () => {
  const { c, code } = await match();
  c.store.set(`${code}:pick:1:p2`, '__proto__');
  const r = await pick(c, code, A, 'p1', 'rock');
  assert.equal(r.status, 200); assert.equal(r.json.state.roundWinner, null);
  assert.equal(c.doc(code).resolvedRound, 0);
});

/* ───────────────────────── next ───────────────────────── */
test('next: only a seat of the room, only after the round is resolved, only once per round', async () => {
  const { c, code } = await match();
  assert.equal((await next(c, code, A, 1)).status, 409, 'round not resolved yet');
  assert.equal((await next(c, code, A, undefined)).status, 409, 'no round given -> current round, still unresolved');
  assert.equal(c.doc(code).round, 1);
  await pick(c, code, A, 'p1', 'rock');
  assert.equal((await next(c, code, B, 1)).status, 409, 'one pick is not a resolved round');
  await pick(c, code, B, 'p2', 'paper');
  for (const id of [C, undefined, null]) assert.equal((await next(c, code, id, 1)).status, id === null ? 400 : 403, `id=${id}`);
  assert.equal(c.doc(code).round, 1, 'strangers cannot advance the round');
  const ok = await next(c, code, A, 1);
  assert.equal(ok.status, 200); assert.equal(ok.json.state.round, 2);
  assert.deepEqual(ok.json.state.scores, { p1: 0, p2: 1 }, 'scores are kept');
  assert.equal(ok.json.state.roundWinner, null);
  const w = c.log.puts.length;
  const dbl = await next(c, code, B, 1);                   // the other player clicked "next" for the same transition
  assert.equal(dbl.status, 200); assert.equal(dbl.json.state.round, 2, 'no skipped round');
  assert.equal(c.log.puts.length, w, 'stale next writes nothing');
  assert.equal((await next(c, code, B, 99)).json.state.round, 2, 'a round from the future does not move the room');
  for (const r of [0, -1, 1.5, '2', null]) assert.equal((await next(c, code, B, r)).status, 400, `round=${JSON.stringify(r)}`);
  assert.equal((await next(c, code, A, 2)).status, 409, 'round 2 is unresolved: cannot be skipped');
});

test('next: both players clicking at the same instant advance exactly one round', async () => {
  const { c, code } = await match();
  await pick(c, code, A, 'p1', 'rock'); await pick(c, code, B, 'p2', 'paper');
  const [x, y] = await Promise.all([next(c, code, A, 1), next(c, code, B, 1)]);
  assert.equal(x.status, 200); assert.equal(y.status, 200);
  assert.equal(c.doc(code).round, 2);
});

test('next after a full multi-round game keeps scores and stays consistent', async () => {
  const { c, code } = await match();
  const plan = [['rock', 'scissors'], ['paper', 'paper'], ['scissors', 'rock'], ['rock', 'paper']];
  for (let i = 0; i < plan.length; i++) {
    await pick(c, code, A, 'p1', plan[i][0], { round: i + 1 });
    const r = await pick(c, code, B, 'p2', plan[i][1], { round: i + 1 });
    assert.ok(r.json.state.roundWinner, `round ${i + 1}`);
    const n = await next(c, code, i % 2 ? B : A, i + 1);
    assert.equal(n.json.state.round, i + 2);
  }
  assert.deepEqual(c.doc(code).scores, { p1: 1, p2: 2 });
});

test('a commit missed because of stale KV reads is repaired by the next poll / next request, scoring once', async () => {
  const { c, code } = await match();
  // both picks are in KV but nobody committed the round (each request saw the other pick as missing)
  c.store.set(`${code}:pick:1:p1`, 'rock'); c.store.set(`${code}:pick:1:p2`, 'scissors');
  assert.equal(c.doc(code).resolvedRound, 0);
  c.resetCounters();
  const g1 = await state(c, code, A);
  assert.equal(g1.json.state.roundWinner, 'p1'); assert.deepEqual(g1.json.state.scores, { p1: 1, p2: 0 });
  await state(c, code, B); await state(c, code, A);
  assert.equal(c.log.puts.length, 1, 'repair writes once, later polls do not');
  assert.deepEqual(c.doc(code).scores, { p1: 1, p2: 0 });
  // and `next` repairs it too when no poll got there first
  const m2 = await match();
  m2.c.store.set(`${m2.code}:pick:1:p1`, 'paper'); m2.c.store.set(`${m2.code}:pick:1:p2`, 'rock');
  const n = await next(m2.c, m2.code, A, 1);
  assert.equal(n.status, 200); assert.equal(n.json.state.round, 2);
  assert.deepEqual(m2.c.doc(m2.code).scores, { p1: 1, p2: 0 });
});

test('rev counts the writes to the room document', async () => {
  const c = mkEnv();
  const code = (await create(c)).json.code;
  assert.equal(c.doc(code).rev, 1);
  await join(c, code, B); assert.equal(c.doc(code).rev, 2);
  await pick(c, code, A, 'p1', 'rock'); assert.equal(c.doc(code).rev, 2, 'a pick writes its own key, not the room');
  await pick(c, code, B, 'p2', 'rock'); assert.equal(c.doc(code).rev, 3, 'the commit');
  await next(c, code, A, 1); assert.equal(c.doc(code).rev, 4);
});

test('no response ever contains a client id, the legacy flag or an internal key', async () => {
  const c = mkEnv();
  const texts = [];
  const r = await create(c); texts.push(r.text);
  const code = r.json.code;
  texts.push((await join(c, code, B)).text);
  texts.push((await state(c, code, A)).text, (await state(c, code, B)).text, (await state(c, code, null)).text);
  texts.push((await pick(c, code, A, 'p1', 'rock')).text, (await pick(c, code, B, 'p2', 'paper')).text, (await next(c, code, A, 1)).text);
  for (const t of texts) {
    assert.ok(!t.includes(A) && !t.includes(B) && !/clientId|legacy|lastPicks|resolvedRound|rev/.test(t), t);
  }
});

/* ───────────────────────── legacy (pre-v2) clients ───────────────────────── */
async function oldRoom(c = mkEnv()) {
  // exactly what the client shipped before v2 does: create/join with {name, clientId}, no `v`, then pick/next with no clientId
  const r = await call(c, 'POST', '/api/rps-room', { body: { name: 'Vieja', clientId: A } });
  const code = r.json.code;
  await call(c, 'POST', `/api/rps-room/${code}/join`, { body: { name: 'Viejo', clientId: B } });
  return { c, code };
}

test('legacy client vs new server: full game works without clientId on pick/next', async () => {
  const { c, code } = await oldRoom();
  const legacyPick = (seat, p) => call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: seat, pick: p } });
  assert.equal((await legacyPick('p1', 'rock')).status, 200);
  const r = await legacyPick('p2', 'scissors');
  assert.equal(r.status, 200); assert.equal(r.json.state.roundWinner, 'p1');
  const n = await call(c, 'POST', `/api/rps-room/${code}/next`, { body: { round: 1 } });
  assert.equal(n.status, 200); assert.equal(n.json.state.round, 2);
  assert.equal((await legacyPick('p1', 'paper')).status, 200);
  assert.equal((await legacyPick('p2', 'paper')).json.state.roundWinner, 'draw');
  // pre-clientId clients: next with no body and no content-type; create/join without any id
  const n2 = await call(c, 'POST', `/api/rps-room/${code}/next`, {});
  assert.equal(n2.status, 200); assert.equal(n2.json.state.round, 3);
  const oc = mkEnv();
  const o = await call(oc, 'POST', '/api/rps-room', { body: { name: 'x' } });
  assert.equal(o.status, 200);
  assert.equal((await call(oc, 'POST', `/api/rps-room/${o.json.code}/join`, { body: { name: 'y' } })).status, 200);
});

test('legacy seats still honour a clientId when one is sent (a wrong one is refused)', async () => {
  const { c, code } = await oldRoom();
  assert.equal((await pick(c, code, C, 'p1', 'rock')).status, 403);
  assert.equal((await pick(c, code, A, 'p1', 'rock')).status, 200);
  assert.equal((await pick(c, code, A, 'p2', 'rock')).status, 403);
});

test('mixed room: the strict seat stays protected, only the legacy seat accepts unauthenticated picks', async () => {
  const c = mkEnv();
  const code = (await create(c, A)).json.code;                                   // new client creates (strict p1)
  await call(c, 'POST', `/api/rps-room/${code}/join`, { body: { name: 'Viejo', clientId: B } });   // old client joins (legacy p2)
  const forgeP1 = await call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: 'p1', pick: 'rock' } });
  assert.equal(forgeP1.status, 403, 'strict seat cannot be forged without its clientId');
  const oldP2 = await call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: 'p2', pick: 'rock' } });
  assert.equal(oldP2.status, 200, 'the old client keeps playing');
  assert.equal((await pick(c, code, A, 'p1', 'paper')).json.state.roundWinner, 'p1');
  // an attacker taking a free seat as a legacy client does not gain the other seat
  const c2 = mkEnv();
  const code2 = (await create(c2, A)).json.code;
  await call(c2, 'POST', `/api/rps-room/${code2}/join`, { body: { name: 'evil' } });   // no v, no id: legacy p2
  assert.equal((await call(c2, 'POST', `/api/rps-room/${code2}/pick`, { body: { playerId: 'p1', pick: 'rock' } })).status, 403);
  assert.equal(c2.doc(code2).p1.legacy, undefined);
});

test('a strict room has no unauthenticated path at all (pick or next, any playerId)', async () => {
  const { c, code } = await match();
  for (const seat of ['p1', 'p2', undefined]) {
    assert.equal((await call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: seat, pick: 'rock' } })).status, 403, String(seat));
  }
  await pick(c, code, A, 'p1', 'rock'); await pick(c, code, B, 'p2', 'rock');
  assert.equal((await call(c, 'POST', `/api/rps-room/${code}/next`, { body: { round: 1 } })).status, 403);
  assert.equal((await call(c, 'POST', `/api/rps-room/${code}/next`, {})).status, 403);
  assert.equal(c.doc(code).round, 1);
});

test('after the compatibility window legacy clients get 426 client_outdated; updated clients are unaffected', async () => {
  const { c, code } = await oldRoom();
  const SUNSET = Date.UTC(2026, 10, 15);
  await withNow(SUNSET, async () => {
    const p = await call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: 'p1', pick: 'rock' } });
    assert.equal(p.status, 426); assert.equal(p.json.error, 'client_outdated');
    assert.equal((await call(c, 'POST', `/api/rps-room/${code}/next`, { body: { round: 1 } })).status, 426);
    const cr = await call(c, 'POST', '/api/rps-room', { body: { name: 'x', clientId: A } });
    assert.equal(cr.status, 426); assert.equal(cr.json.error, 'client_outdated');
    assert.equal((await call(c, 'POST', `/api/rps-room/${code}/join`, { body: { name: 'x', clientId: C } })).status, 426);
    const ok = await create(c, C);
    assert.equal(ok.status, 200);
    assert.equal((await join(c, ok.json.code, B)).status, 200);
    assert.equal((await pick(c, code, A, 'p1', 'rock')).status, 200, 'a legacy-seat client that DOES send its id keeps working');
  });
  await withNow(SUNSET - 1, async () => {
    assert.equal((await call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: 'p2', pick: 'rock' } })).status, 200);
  });
});

/* ───────────────────────── everything else the Worker serves ───────────────────────── */
test('Worker 404s are never cacheable (even for .js/.css/.png) and keep the security headers', async () => {
  const c = mkEnv();
  for (const p of ['/js/missing.js', '/css/x.css', '/assets/x.png', '/nope', '/en/nope', '/pt/nope.js', '/.git/config', '/worker.js', '/scripts/audit-public.mjs']) {
    const res = await worker.fetch(new Request(ORIGIN + p), c.env);
    assert.equal(res.status, 404, p);
    const cc = res.headers.get('cache-control');
    assert.equal(cc, 'no-store', `${p}: ${cc}`);
    assert.ok(!/immutable/.test(cc));
    for (const [k, v] of Object.entries(EXPECTED_HEADERS)) assert.equal(res.headers.get(k), v, `${p} ${k}`);
  }
});

test('existing caching rules are unchanged for real assets; http redirects to https', async () => {
  const c = mkEnv();
  assert.equal((await worker.fetch(new Request(ORIGIN + '/js/app.js'), c.env)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await worker.fetch(new Request(ORIGIN + '/sw.js'), c.env)).headers.get('cache-control'), 'no-cache, must-revalidate');
  const red = await worker.fetch(new Request('http://handgames.app/rps/'), c.env);
  assert.equal(red.status, 301); assert.equal(red.headers.get('location'), 'https://handgames.app/rps/');
});

test('the API is untouched by methods without a route (OPTIONS has no CORS and writes nothing)', async () => {
  const c = mkEnv();
  const r = await call(c, 'OPTIONS', '/api/rps-room', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(c.log.puts.length, 0);
});

/* ───────────────────────── stale / expired reads (what KV's eventual consistency can do) ───────────────────────── */
test('next: a stale re-read of an unresolved room cannot advance the round or lose the score', async () => {
  const live = await match();
  const { c, code } = live;
  await pick(c, code, A, 'p1', 'rock'); await pick(c, code, B, 'p2', 'scissors');
  const resolved = c.store.get(code);                                    // committed: scores 1-0
  const stale = JSON.stringify({ ...JSON.parse(resolved), resolvedRound: 0, scores: { p1: 0, p2: 0 }, lastPicks: undefined });
  // same store, but the 2nd read of the room key in the next request is a stale (pre-commit) copy
  let roomReads = 0;
  const hooked = mkEnv({ getHook: (k) => (k === code && ++roomReads === 2) ? stale : undefined });
  for (const [k, v] of c.store) hooked.store.set(k, v);
  const r = await next(hooked, code, A, 1);
  assert.equal(r.status, 409, r.text);
  assert.equal(hooked.doc(code).round, 1, 'round not advanced');
  assert.deepEqual(hooked.doc(code).scores, { p1: 1, p2: 0 }, 'score not lost');
});

test('GET with a stale room copy does not score a round twice', async () => {
  const { c, code } = await match();
  await pick(c, code, A, 'p1', 'rock'); await pick(c, code, B, 'p2', 'scissors');
  const committed = JSON.parse(c.store.get(code));
  const stale = JSON.stringify({ ...committed, resolvedRound: 0, scores: { p1: 0, p2: 0 }, lastPicks: undefined });
  let n = 0;
  const hooked = mkEnv({ getHook: (k) => (k === code && ++n === 1) ? stale : undefined });
  for (const [k, v] of c.store) hooked.store.set(k, v);
  const g = await state(hooked, code, A);                                // sees an unresolved doc but both picks, tries to commit
  assert.equal(g.status, 200);
  assert.deepEqual(hooked.doc(code).scores, { p1: 1, p2: 0 }, 'still 1-0, not 2-0');
  assert.deepEqual(g.json.state.scores, { p1: 1, p2: 0 });
});

test('room expiring between reads gives a clean 404, not a crash (pick, next, GET)', async () => {
  const mk = async () => { const m = await match(); await pick(m.c, m.code, A, 'p1', 'rock'); return m; };
  // pick: the commit's re-read finds nothing
  { const { c, code } = await mk(); let n = 0;
    const h = mkEnv({ getHook: (k) => (k === code && ++n === 2) ? null : undefined });
    for (const [k, v] of c.store) h.store.set(k, v);
    const r = await pick(h, code, B, 'p2', 'paper');
    assert.equal(r.status, 404, r.text); assert.equal(r.json.error, 'room not found'); }
  // next: unresolved branch -> commitRound re-read finds nothing
  { const { c, code } = await mk(); c.store.set(`${code}:pick:1:p2`, 'paper'); let n = 0;
    const h = mkEnv({ getHook: (k) => (k === code && ++n === 2) ? null : undefined });
    for (const [k, v] of c.store) h.store.set(k, v);
    const r = await next(h, code, A, 1);
    assert.equal(r.status, 404, r.text); }
  // next: resolved, the final re-read finds nothing
  { const { c, code } = await mk(); await pick(c, code, B, 'p2', 'paper'); let n = 0;
    const h = mkEnv({ getHook: (k) => (k === code && ++n === 2) ? null : undefined });
    for (const [k, v] of c.store) h.store.set(k, v);
    const r = await next(h, code, A, 1);
    assert.equal(r.status, 404, r.text); }
  // GET repair: re-read finds nothing
  { const { c, code } = await mk(); c.store.set(`${code}:pick:1:p2`, 'paper'); let n = 0;
    const h = mkEnv({ getHook: (k) => (k === code && ++n === 2) ? null : undefined });
    for (const [k, v] of c.store) h.store.set(k, v);
    const r = await state(h, code, A);
    assert.equal(r.status, 404, r.text); }
  // join: re-read finds nothing
  { const c = mkEnv(); const code = (await create(c)).json.code; let n = 0;
    const h = mkEnv({ getHook: (k) => (k === code && ++n === 2) ? null : undefined });
    for (const [k, v] of c.store) h.store.set(k, v);
    const r = await join(h, code, B);
    assert.equal(r.status, 404, r.text); }
});

/* ───────────────────────── rooms created by the PREVIOUS server, still alive at deploy time ───────────────────────── */
// Exactly the document the previous worker wrote: no `rev`, no `legacy` flags (its pick keys are the same as today's).
function seedOldServerRoom(c, code, { withP2 = true } = {}) {
  c.store.set(code, JSON.stringify({
    createdAt: 1700000000000, round: 1, scores: { p1: 0, p2: 0 }, resolvedRound: 0,
    p1: { name: 'Vieja', clientId: A }, p2: withP2 ? { name: 'Viejo', clientId: B } : null,
  }));
}
const legacyPick = (c, code, seat, p) => call(c, 'POST', `/api/rps-room/${code}/pick`, { body: { playerId: seat, pick: p } });
const legacyNext = (c, code, round) => call(c, 'POST', `/api/rps-room/${code}/next`, { body: { round } });

test('a room made by the previous server and open in old tabs keeps working (no 403) until LEGACY_UNTIL, then 426', async () => {
  const SUNSET = Date.UTC(2026, 10, 15);
  const c = mkEnv(); const code = 'KMPQR';
  seedOldServerRoom(c, code);
  await withNow(SUNSET - 1, async () => {
    assert.equal((await legacyPick(c, code, 'p1', 'rock')).status, 200);
    const r = await legacyPick(c, code, 'p2', 'scissors');
    assert.equal(r.status, 200); assert.equal(r.json.state.roundWinner, 'p1');
    const n = await legacyNext(c, code, 1);
    assert.equal(n.status, 200); assert.equal(n.json.state.round, 2);
    assert.equal(c.doc(code).p1.legacy, true, 'the flag is persisted by the first write');
    assert.ok(c.doc(code).rev >= 1);
    assert.equal((await legacyPick(c, code, 'p1', 'paper')).status, 200);
    assert.equal((await pick(c, code, A, 'p2', 'paper')).status, 403, 'a clientId, when sent, still has to match the seat');
  });
  await withNow(SUNSET, async () => {
    const p = await legacyPick(c, code, 'p2', 'paper');
    assert.equal(p.status, 426); assert.equal(p.json.error, 'client_outdated');
    assert.equal((await legacyNext(c, code, 2)).status, 426);
  });
});

test('an old-server room that only had its creator: a new strict joiner gets a strict seat, the old creator stays legacy', async () => {
  const c = mkEnv(); const code = 'KMPQR';
  seedOldServerRoom(c, code, { withP2: false });
  const j = await join(c, code, C, 'Nuevo');
  assert.equal(j.status, 200); assert.equal(j.json.playerId, 'p2');
  const d = c.doc(code);
  assert.equal(d.p1.legacy, true); assert.equal(d.p2.legacy, undefined);
  assert.equal((await legacyPick(c, code, 'p1', 'rock')).status, 200, 'old creator tab still plays');
  assert.equal((await legacyPick(c, code, 'p2', 'rock')).status, 403, 'the strict seat cannot be forged');
  assert.equal((await pick(c, code, C, 'p2', 'paper')).json.state.roundWinner, 'p2');
});

test('a room created by the current worker is strict: no pick/next without clientId (rev is always present)', async () => {
  const { c, code } = await match();
  assert.ok(c.doc(code).rev >= 1);
  assert.equal((await legacyPick(c, code, 'p1', 'rock')).status, 403);
  assert.equal((await legacyPick(c, code, 'p2', 'rock')).status, 403);
  await pick(c, code, A, 'p1', 'rock'); await pick(c, code, B, 'p2', 'rock');
  assert.equal((await legacyNext(c, code, 1)).status, 403);
  // every kind of write keeps `rev` >= 1 (the invariant the old-room detection relies on)
  assert.ok(c.doc(code).rev >= 3);
});
