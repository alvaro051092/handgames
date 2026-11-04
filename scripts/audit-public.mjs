#!/usr/bin/env node
// Audit of what this site actually publishes. No dependencies (Node >= 18).
//
// How the site is deployed: a Cloudflare Worker with Static Assets
// (wrangler.jsonc: assets.directory = "."). Every file in the repo root is a
// public asset unless .assetsignore excludes it, and _headers is applied by
// the assets layer (it is never served itself). Existing files are served by
// the assets layer WITHOUT running worker.js; the Worker only answers
// non-asset routes (404 page, /api/rps-room*).
//
// Usage (run from anywhere; the repo root is the parent of this folder):
//   node scripts/audit-public.mjs                 local checks only (default)
//   node scripts/audit-public.mjs --live          local checks + checks against production
//   node scripts/audit-public.mjs --live-only     production checks only
//   --base=https://handgames.app                  origin for the live checks (default shown)
//   --workers-dev=https://<worker>.<subdomain>.workers.dev
//                                                 the workers.dev URL of the Worker. Not hardcoded
//                                                 (account-specific); also read from HG_WORKERS_DEV.
//                                                 Without it that single check is reported as SKIP.
//
// Local checks
//   - computes the asset set exactly like wrangler (repo files minus
//     .assetsignore minus the built-in _headers/_redirects/.assetsignore) and
//     fails if it contains anything that should not be public (server code,
//     internal docs, configs, scripts, tests, binaries, dotfiles, ...) or any
//     file type outside the expected allow-list;
//   - _headers: valid syntax, within Cloudflare limits (100 rules, 2000 chars
//     per line), not ignored by .assetsignore, carries the expected security
//     headers, does not set a script/default/connect/img/style/frame CSP
//     (third-party scripts must keep loading) and does not set Cache-Control;
//   - SECURITY_HEADERS in worker.js equals the /* rule of _headers;
//   - wrangler.jsonc: workers_dev === false, preview_urls === false, no
//     "routes"/"route" (they would replace the dashboard-managed ones);
//   - every internal link/script/icon referenced by HTML, JS, manifest.json,
//     sw.js and sitemap.xml resolves to a published asset.
//
// Live checks (raw request paths via https.request, so //, %2e, /./ and /x/../
// reach the server un-normalised; same-origin redirects are followed, max 6)
//   - none of a broad blacklist (git internals, configs, worker.js, scripts,
//     docs, ...) nor its path variants may end in 2xx with content;
//   - every URL of the live sitemap answers 200 text/html with the security
//     headers defined in _headers, and /sw.js, /manifest.json, /robots.txt,
//     /sitemap.xml answer 200;
//   - the workers.dev URL must NOT answer 2xx (404/403/1042/connection error ok);
//   - http:// redirects to https://.
//
// Output is a table. Exit code 1 if any check FAILS (WARN/INFO/SKIP do not).
import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(n + '=')); return a ? a.slice(n.length + 1) : d; };
const LIVE = flag('--live') || flag('--live-only');
const LOCAL = !flag('--live-only');
const BASE = opt('--base', 'https://handgames.app').replace(/\/$/, '');
const WORKERS_DEV = (opt('--workers-dev', process.env.HG_WORKERS_DEV || '')).replace(/\/$/, '');
const SITE_HOST = 'handgames.app';

let fails = 0;
const rows = [];
const row = (st, what, detail = '') => { rows.push([st, what, detail]); if (st === 'FAIL') fails++; };
const rd = (f) => readFileSync(path.join(REPO, f), 'utf8');

/* ───────────── gitignore-style matcher (the semantics .assetsignore uses) ───────────── */
function compilePatterns(lines) {
  const out = [];
  for (let raw of lines) {
    let p = raw.replace(/\r$/, '').replace(/(?<!\\)\s+$/, '');
    if (!p || p.startsWith('#')) continue;
    let neg = false;
    if (p.startsWith('!')) { neg = true; p = p.slice(1); }
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.slice(0, -1);
    const anchored = p.includes('/');
    p = p.replace(/^\//, '');
    let re = '';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '*' && p[i + 1] === '*') {
        if (p[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else if (c === '*') re += '[^/]*';
      else if (c === '?') re += '[^/]';
      else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    out.push({ neg, dirOnly, re: new RegExp('^' + (anchored ? '' : '(?:.*/)?') + re + '$') });
  }
  return out;
}
// Last matching pattern wins for a single path; a path is ignored if it or any ancestor directory is.
function isIgnored(rel, isDir, pats) {
  const segs = rel.split('/');
  for (let i = 1; i <= segs.length; i++) {
    const sub = segs.slice(0, i).join('/');
    const subIsDir = i < segs.length || isDir;
    let ig = false;
    for (const p of pats) if (p.re.test(sub) && (!p.dirOnly || subIsDir)) ig = !p.neg;
    if (ig) return true;
  }
  return false;
}

// Walk without following symlinks (wrangler skips them too); never descend into ignored directories.
function walk(pats, builtin) {
  const files = [], links = [];
  (function rec(dir, base) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = (base ? base + '/' : '') + e.name;
      if (lstatSync(abs).isSymbolicLink()) { if (!isIgnored(rel, false, pats) && !isIgnored(rel, false, builtin)) links.push(rel); continue; }
      const isDir = e.isDirectory();
      if (isIgnored(rel, isDir, builtin) || isIgnored(rel, isDir, pats)) continue;
      if (isDir) rec(abs, rel); else files.push(rel);
    }
  })(REPO, '');
  return { files: files.sort(), links };
}

// JSONC -> object (strips // and /* */ comments outside strings, and trailing commas).
function parseJsonc(src) {
  let o = '', i = 0, str = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (str) { o += c; if (c === '\\') { o += n; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; o += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    o += c; i++;
  }
  return JSON.parse(o.replace(/,(\s*[}\]])/g, '$1'));
}

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/* Parse _headers: returns { rules: [{ url, headers: [[name, value]], detach: [] }], errors: [] } */
function parseHeadersFile(text) {
  const errors = [], rules = [];
  let cur = null;
  text.split('\n').forEach((line, idx) => {
    const n = idx + 1;
    line = line.replace(/\r$/, '');
    if (line.length > 2000) errors.push(`line ${n}: longer than 2000 characters`);
    if (!line.trim() || line.trim().startsWith('#')) return;
    if (/^\s/.test(line)) {
      if (!cur) { errors.push(`line ${n}: header before any URL rule`); return; }
      const d = /^\s+!\s*([A-Za-z0-9-]+)\s*$/.exec(line);
      if (d) { cur.detach.push(d[1]); return; }
      const m = /^\s+([A-Za-z][A-Za-z0-9-]*):\s*(\S.*)$/.exec(line);
      if (!m) { errors.push(`line ${n}: not "Name: value": ${line.trim().slice(0, 60)}`); return; }
      cur.headers.push([m[1], m[2].trim()]);
    } else {
      const u = line.trim();
      if (!(u.startsWith('/') || /^https:\/\//.test(u))) errors.push(`line ${n}: URL rule must start with "/" or "https://": ${u.slice(0, 60)}`);
      if (/^http:\/\//.test(u)) errors.push(`line ${n}: absolute URLs must begin with https`);
      if ((u.match(/\*/g) || []).length > 1) errors.push(`line ${n}: only one splat (*) per URL`);
      cur = { url: u, headers: [], detach: [] };
      rules.push(cur);
    }
  });
  return { rules, errors };
}

/* ───────────────────────────── LOCAL MODE ───────────────────────────── */
// The single source of truth for the expected security headers is the "/*" rule of _headers.
let EXPECTED = null; // [[name, value]]
function loadExpected() {
  if (EXPECTED) return EXPECTED;
  try {
    const star = parseHeadersFile(rd('_headers')).rules.find((r) => r.url === '/*');
    EXPECTED = star ? star.headers : [];
  } catch { EXPECTED = []; }
  return EXPECTED;
}

if (LOCAL) {
  const ignoreLines = existsSync(path.join(REPO, '.assetsignore')) ? rd('.assetsignore').split('\n') : [];
  const userPats = compilePatterns(ignoreLines);
  const builtinPats = compilePatterns(['/.assetsignore', '/_redirects', '/_headers']);
  row(existsSync(path.join(REPO, '.assetsignore')) ? 'OK' : 'FAIL', '.assetsignore exists (Workers does not exclude .git, node_modules, ... by itself)');

  const { files, links } = walk(userPats, builtinPats);
  row('INFO', `assets that would be published: ${files.length} files`, summarize(files));
  row(links.length ? 'WARN' : 'OK', 'no symlinks among the assets (wrangler skips them)', links.join(', '));

  // _headers must not be ignored by the user's patterns (the built-in rule hides it from the public, which is what we want).
  const hdrIgnored = isIgnored('_headers', false, userPats);
  row(existsSync(path.join(REPO, '_headers')) ? 'OK' : 'FAIL', '_headers exists in the assets directory (repo root)');
  row(hdrIgnored ? 'FAIL' : 'OK', '_headers is not matched by any .assetsignore pattern (it would be dropped)');
  row(files.includes('_headers') ? 'FAIL' : 'OK', '_headers is not served as a public asset');

  // 1) Things that must never be public.
  const FORBIDDEN = [
    [/(^|\/)worker\.js$/, 'Worker source code'],
    [/(^|\/)_worker\.js$/, 'Pages-style worker'],
    [/\.(md|markdown|mdx)$/i, 'markdown / internal docs'],
    [/(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/, 'package manifest/lockfile'],
    [/(^|\/)wrangler\.(jsonc?|toml)$/, 'wrangler config'],
    [/(^|\/)(docker-compose[^/]*\.ya?ml|Dockerfile[^/]*|Makefile|nginx(\/|$))/, 'infra/dev config'],
    [/\.(command|sh|bash|zsh|ps1|bat|py|rb|php|pl)$/i, 'script'],
    [/\.(mjs|cjs|ts|tsx|jsx)$/i, 'source/script (not browser code)'],
    [/(^|\/)(scripts|tests?|__tests__|spec|node_modules|\.git|\.github|\.claude|\.wrangler|\.vscode|\.idea|coverage|docs?|drafts?|private)(\/|$)/i, 'dev/internal folder'],
    [/(^|\/)\.[^/]+/, 'dotfile / dot folder'],
    [/(^|\/)(_headers|_redirects|_routes\.json)$/, 'platform control file'],
    [/\.(map|log|bak|orig|swp|swo|tmp|old|sql|sqlite|db|env|pem|key|crt|p12)$|~$/i, 'sourcemap/log/backup/secret-like file'],
    [/\.(zip|tar|gz|tgz|7z|rar|exe|dmg|pkg|apk|iso|bin)$/i, 'archive / binary'],
    [/(^|\/)(\.DS_Store|Thumbs\.db)$/i, 'OS junk'],
  ];
  const bad = [];
  for (const f of files) for (const [re, why] of FORBIDDEN) if (re.test(f)) { bad.push(`${f} (${why})`); break; }
  row(bad.length ? 'FAIL' : 'OK', 'no file that should not be public is among the assets', bad.join(' ; '));

  // 2) Allow-list of what the site needs (extension-based; a new type shows up as a FAIL to review).
  const ALLOWED = [
    [/\.html$/, 'html'], [/^css\/[^/]+\.css$/, 'css'], [/^js\/[^/]+\.js$/, 'js'], [/^sw\.js$/, 'sw'],
    [/^manifest\.json$/, 'manifest'], [/^(robots\.txt|sitemap\.xml)$/, 'seo'],
    [/^assets\/[^/]+\.(png|ico|svg|jpg|jpeg|webp|gif)$/i, 'image'],
  ];
  const unexpected = files.filter((f) => !ALLOWED.some(([re]) => re.test(f)));
  row(unexpected.length ? 'FAIL' : 'OK', 'every asset matches the public allow-list (html, css/, js/, sw.js, manifest.json, robots/sitemap, assets/ images)', unexpected.join(', '));

  // 3) _headers
  if (existsSync(path.join(REPO, '_headers'))) {
    const text = rd('_headers');
    const { rules, errors } = parseHeadersFile(text);
    row(errors.length ? 'FAIL' : 'OK', '_headers syntax valid (URL rules + indented "Name: value" lines)', errors.join(' | '));
    row(rules.length > 100 ? 'FAIL' : 'OK', `_headers within the Cloudflare limits (${rules.length} rules <= 100; lines <= 2000 chars)`);
    const star = rules.find((r) => r.url === '/*');
    row(star ? 'OK' : 'FAIL', '_headers has a "/*" rule');
    const get = (n) => (star ? star.headers.filter(([k]) => k.toLowerCase() === n.toLowerCase()).map(([, v]) => v) : []);
    const one = (n) => { const v = get(n); return v.length === 1 ? v[0] : null; };
    const chk = (label, ok, detail = '') => row(ok ? 'OK' : 'FAIL', `_headers: ${label}`, ok ? '' : detail);
    chk('X-Content-Type-Options: nosniff', norm(one('X-Content-Type-Options') || '') === 'nosniff');
    chk('X-Frame-Options: DENY', norm(one('X-Frame-Options') || '') === 'deny');
    chk('Referrer-Policy: strict-origin-when-cross-origin', norm(one('Referrer-Policy') || '') === 'strict-origin-when-cross-origin');
    const csp = one('Content-Security-Policy') || '';
    chk("CSP has base-uri 'self', object-src 'none', frame-ancestors 'none', form-action 'self'",
      ["base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'"].every((d) => csp.includes(d)), csp);
    chk('CSP does not restrict script/default/connect/img/style/frame/font/media/worker sources (third-party scripts must keep loading)',
      !/(?:^|;)\s*(default-src|script-src|script-src-elem|connect-src|img-src|style-src|frame-src|child-src|font-src|media-src|worker-src|manifest-src)\b/.test(csp), csp);
    const hsts = one('Strict-Transport-Security') || '';
    chk('Strict-Transport-Security max-age >= 31536000, no includeSubDomains/preload', (+((/max-age=(\d+)/.exec(hsts) || [])[1]) >= 31536000) && !/includesubdomains|preload/i.test(hsts), hsts);
    const pp = norm(one('Permissions-Policy') || '');
    chk('Permissions-Policy keeps camera=(self) (gesture mode) and restricts microphone/geolocation',
      pp.includes('camera=(self)') && pp.includes('microphone=()') && pp.includes('geolocation=()'), pp);
    chk('Permissions-Policy does not restrict autoplay/fullscreen/web-share/clipboard/ads features',
      !/(autoplay|fullscreen|web-share|clipboard|browsing-topics|attribution-reporting|join-ad-interest-group|run-ad-auction|interest-cohort)=/.test(pp), pp);
    const cache = rules.filter((r) => r.headers.some(([k]) => k.toLowerCase() === 'cache-control'));
    chk('no Cache-Control rules (caching policy intentionally unchanged)', cache.length === 0, cache.map((r) => r.url).join(', '));
    // worker.js must carry the same set, minus nothing: every header of /* is in SECURITY_HEADERS with the same value.
    try {
      const w = rd('worker.js');
      const block = /const SECURITY_HEADERS = \{([\s\S]*?)\n\};/.exec(w);
      if (!block) row('FAIL', 'worker.js defines SECURITY_HEADERS');
      else {
        const wh = {};
        for (const m of block[1].matchAll(/^\s*'([^']+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,?\s*$/gm)) wh[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
        const exp = star ? star.headers : [];
        const diff = [];
        for (const [k, v] of exp) if (norm(wh[k.toLowerCase()] || '') !== norm(v)) diff.push(`${k}: worker.js=${JSON.stringify(wh[k.toLowerCase()] ?? null)}`);
        const extra = Object.keys(wh).filter((k) => !exp.some(([n]) => n.toLowerCase() === k));
        row(diff.length || extra.length ? 'FAIL' : 'OK', 'worker.js SECURITY_HEADERS equals the "/*" rule of _headers (same names and values)', [...diff, ...extra.map((k) => `extra in worker.js: ${k}`)].join(' | '));
        row(/X-XSS-Protection/i.test(block[1]) ? 'FAIL' : 'OK', 'worker.js SECURITY_HEADERS no longer sets the obsolete X-XSS-Protection');
      }
      row(/isBlockedPath[\s\S]{0,700}worker\\\.js/.test(w) ? 'OK' : 'FAIL', 'worker.js isBlockedPath covers /worker.js');
    } catch (e) { row('FAIL', 'worker.js readable', e.message); }
  }

  // 4) wrangler.jsonc
  try {
    const cfg = parseJsonc(rd('wrangler.jsonc'));
    row(cfg.workers_dev === false ? 'OK' : 'FAIL', 'wrangler.jsonc: workers_dev is exactly false (closes *.workers.dev)', `workers_dev=${JSON.stringify(cfg.workers_dev)}`);
    row(cfg.preview_urls === false ? 'OK' : 'FAIL', 'wrangler.jsonc: preview_urls is exactly false (closes version/preview URLs)', `preview_urls=${JSON.stringify(cfg.preview_urls)}`);
    for (const k of ['routes', 'route']) if (k in cfg) row('FAIL', `wrangler.jsonc: must not declare "${k}" (would replace the dashboard-managed routes/domains)`, JSON.stringify(cfg[k]));
    row(cfg.main === 'worker.js' && files.every((f) => f !== 'worker.js') ? 'OK' : 'FAIL', 'wrangler.jsonc: main = worker.js and it is not also an asset', `main=${JSON.stringify(cfg.main)}`);
    row(cfg.assets && cfg.assets.directory === '.' ? 'OK' : 'WARN', 'wrangler.jsonc: assets.directory is "." (repo root; .assetsignore is the only filter)', `directory=${JSON.stringify(cfg.assets && cfg.assets.directory)}`);
  } catch (e) { row('FAIL', 'wrangler.jsonc readable and valid', e.message); }

  // 5) Internal references resolve to published assets.
  const set = new Set(files);
  const resolves = (u) => {
    let p = decodeURIComponent(u).replace(/^\//, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    return set.has(p) || set.has(p + '.html') || set.has(p + '/index.html');
  };
  const normUrl = (u, fromFile) => {
    u = u.replace(/&amp;/g, '&').trim();
    if (!u || /^(#|mailto:|tel:|data:|javascript:|blob:|about:)/i.test(u) || u.startsWith('//')) return null;
    if (/^https?:/i.test(u)) {
      let h; try { h = new URL(u); } catch { return null; }
      if (h.hostname !== SITE_HOST) return null;
      u = h.pathname;
    }
    u = u.split('#')[0].split('?')[0];
    if (!u) return null;
    if (u.startsWith('/api/')) return null; // Worker route, not a file
    if (u.startsWith('/')) return u;
    // 404 pages are served at arbitrary depths: relative links there are not meaningful
    if (/(^|\/)404\.html$/.test(fromFile)) return null;
    return path.posix.normalize(path.posix.join('/' + path.posix.dirname(fromFile), u));
  };
  const broken = [];
  let checked = 0, unversioned = 0;
  const refRe = /(?<![\w-])(?:href|src|action|poster|content)\s*=\s*"([^"]+)"|url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const html = rd(f);
    let m;
    while ((m = refRe.exec(html))) {
      const raw = m[1] || m[2] || '';
      // "content" only matters for URLs (og:image etc.), not for "width=device-width" and friends
      if (m[0].startsWith('content') && !/^(https?:\/\/|\/)/.test(raw)) continue;
      const u = normUrl(raw, f);
      if (!u) continue;
      checked++;
      if (/^\/(js|css)\/[^?]+\.(js|css)$/.test(m[1] || '')) unversioned++;
      if (!resolves(u)) broken.push(`${f} -> ${u}`);
    }
  }
  // JS string literals pointing at site files
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const js = rd(f);
    for (const m of js.matchAll(/['"`](\/(?:assets|js|css)\/[A-Za-z0-9_./-]+\.[a-z0-9]+)(?:\?[^'"`]*)?['"`]/g)) {
      checked++;
      if (!resolves(m[1])) broken.push(`${f} -> ${m[1]}`);
    }
  }
  // sw.js precache list
  if (set.has('sw.js')) {
    const sw = rd('sw.js');
    const pre = /const PRECACHE = \[([\s\S]*?)\];/.exec(sw);
    if (pre) for (const m of pre[1].matchAll(/'([^']+)'/g)) { checked++; if (!resolves(m[1])) broken.push(`sw.js PRECACHE -> ${m[1]}`); }
  }
  // manifest.json
  if (set.has('manifest.json')) {
    try {
      const mf = JSON.parse(rd('manifest.json'));
      const urls = [mf.start_url, mf.id, ...(mf.icons || []).map((i) => i.src), ...(mf.shortcuts || []).flatMap((s) => [s.url, ...(s.icons || []).map((i) => i.src)])].filter(Boolean);
      for (const u of urls) { checked++; if (!resolves(u.split('?')[0])) broken.push(`manifest.json -> ${u}`); }
    } catch (e) { row('FAIL', 'manifest.json is valid JSON', e.message); }
  }
  // sitemap.xml + robots.txt
  let smLocs = [];
  if (set.has('sitemap.xml')) {
    const sm = rd('sitemap.xml');
    smLocs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const alt = [...sm.matchAll(/<xhtml:link[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    const foreign = [...smLocs, ...alt].filter((l) => { try { return new URL(l).hostname !== SITE_HOST; } catch { return true; } });
    row(foreign.length ? 'FAIL' : 'OK', `sitemap.xml: all ${smLocs.length} <loc> and ${alt.length} alternates are on ${SITE_HOST}`, foreign.join(', '));
    for (const l of [...smLocs, ...alt]) { const u = normUrl(l, 'sitemap.xml'); if (u) { checked++; if (!resolves(u)) broken.push(`sitemap.xml -> ${u}`); } }
  }
  row(broken.length ? 'FAIL' : 'OK', `internal references resolve to published assets (${checked} checked in HTML, JS, sw.js, manifest, sitemap)`, [...new Set(broken)].join(' ; '));
  row('INFO', 'CSS/JS references in HTML without ?v= (manual cache-busting only; files are not fingerprinted)', String(unversioned));
}

function summarize(files) {
  const top = {};
  for (const f of files) { const k = f.includes('/') ? f.split('/')[0] + '/' : '(root)'; top[k] = (top[k] || 0) + 1; }
  return Object.entries(top).sort().map(([k, n]) => `${k}:${n}`).join(' ');
}

/* ───────────────────────────── LIVE MODE ───────────────────────────── */
// Raw request: the path is sent exactly as given (no normalisation). Returns { status, headers, body (Buffer), chain, note }.
function rawRequest(urlBase, rawPath, { follow = 6, method = 'GET', timeout = 20000 } = {}) {
  const base = new URL(urlBase);
  const chain = [];
  const hop = (p, n) => new Promise((resolve, reject) => {
    const lib = base.protocol === 'http:' ? http : https;
    chain.push(p);
    const req = lib.request({
      host: base.hostname, port: base.port || (base.protocol === 'http:' ? 80 : 443), path: p, method,
      headers: { 'user-agent': 'hg-audit/1.0', 'cache-control': 'no-cache', accept: '*/*' },
    }, (res) => {
      const bufs = [];
      res.on('data', (d) => bufs.push(d));
      res.on('end', () => {
        const body = Buffer.concat(bufs);
        const loc = res.headers.location;
        if (follow > 0 && res.statusCode >= 300 && res.statusCode < 400 && loc) {
          let next;
          try {
            const u = new URL(loc, base);
            if (u.origin !== base.origin) return resolve({ status: res.statusCode, headers: res.headers, body, chain, note: `redirects off-origin: ${u.origin}` });
            next = u.pathname + u.search;
          } catch { return resolve({ status: res.statusCode, headers: res.headers, body, chain, note: 'invalid Location' }); }
          if (n >= follow) return resolve({ status: res.statusCode, headers: res.headers, body, chain, note: 'too many redirects' });
          return resolve(hop(next, n + 1));
        }
        resolve({ status: res.statusCode, headers: res.headers, body, chain });
      });
    });
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
  const q = rawPath.includes('?') ? '&' : '?';
  return hop(`${rawPath}${q}hgaudit=${Date.now()}`, 0);
}
const clean = (p) => p.replace(/[?&]hgaudit=\d+/, '');

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

if (LIVE) {
  const BLACKLIST = [
    // git internals and dotfiles
    '/.git/config', '/.git/HEAD', '/.git/index', '/.git/logs/HEAD', '/.git/packed-refs', '/.git/refs/heads/main', '/.git/objects/', '/.git/', '/.gitignore', '/.assetsignore', '/.github/', '/.claude/settings.json', '/.claude/settings.local.json', '/.claude/launch.json', '/.claude/seo-plan.md', '/.wrangler/', '/.env', '/.env.local', '/.dev.vars', '/.DS_Store',
    // server code and configuration
    '/wrangler.jsonc', '/wrangler.toml', '/worker.js', '/_worker.js', '/_headers', '/_redirects', '/package.json', '/package-lock.json', '/node_modules/', '/docker-compose.yml', '/nginx/', '/nginx/nginx.conf', '/Dockerfile', '/Makefile',
    // dev scripts and internal docs
    '/deploy.command', '/run-git.command', '/start-server.command', '/open-handgames.command', '/scripts/', '/scripts/audit-public.mjs', '/tests/', '/content-strategy.md', '/estrategia-contenido.md', '/README.md', '/CLAUDE.md',
  ];
  // Variants some stacks normalise or decode differently; sent RAW (no normalisation).
  const CORE = ['/.git/config', '/.git/HEAD', '/.git/index', '/.git/logs/HEAD', '/.gitignore', '/.assetsignore', '/wrangler.jsonc', '/worker.js', '/docker-compose.yml', '/deploy.command', '/content-strategy.md', '/.claude/settings.json', '/package.json', '/.env'];
  const variants = (p) => {
    const segs = p.slice(1).split('/'); const last = segs.length - 1;
    const parent = segs.slice(0, last).join('/');
    return [...new Set([
      '/' + p,                                   // //worker.js
      p.replace(/^(\/[^/]+)\//, '$1//'),         // /.git//config
      p.replace(/\./g, '%2e'), p.replace(/\./g, '%2E'),
      '/' + p.slice(1).replace(/\//g, '%2f'),
      '/.' + p,                                  // /./worker.js
      '/x/..' + p,                               // /x/../worker.js
      '/' + (parent ? parent + '/./' : './') + segs[last],
      '/' + (parent ? parent + '/x/../' : 'x/../') + segs[last],
    ])].filter((v) => v !== p);
  };
  const targets = [...BLACKLIST, ...CORE.flatMap(variants)];
  const res = await pool(targets, 10, async (p) => { try { return [p, await rawRequest(BASE, p)]; } catch (e) { return [p, { error: e.message }]; } });
  for (const [p, r] of res) {
    const via = r.chain && r.chain.length > 1 ? ` (via ${r.chain.map(clean).join(' -> ')})` : '';
    if (r.error) row('WARN', `GET ${p}`, `network error: ${r.error}`);
    else if (r.status >= 200 && r.status < 300 && r.body.length > 0) row('FAIL', `GET ${p}`, `${r.status} exposed, ${r.body.length} bytes${via}`);
    else if (r.status >= 200 && r.status < 300) row('WARN', `GET ${p}`, `${r.status} with empty body${via}`);
    else if (r.status >= 300 && r.status < 400) row('WARN', `GET ${p}`, `${r.status} unresolved (${r.note || 'redirect'})${via}`);
    else row(r.status === 404 || r.status === 403 || r.status === 400 ? 'OK' : 'WARN', `GET ${p}`, `${r.status}${via}`);
  }

  // Expected security headers: taken from the "/*" rule of the local _headers (single source of truth).
  const exp = loadExpected();
  if (!exp.length) row('FAIL', 'live: expected headers loaded from local _headers "/*" rule', '_headers missing or has no "/*" rule');
  const headerProblems = (r) => exp.filter(([k, v]) => norm(String(r.headers[k.toLowerCase()] || '')) !== norm(v)).map(([k]) => k);

  // Pages from the live sitemap.
  let pages = [];
  try {
    const sm = await rawRequest(BASE, '/sitemap.xml');
    if (sm.status === 200) pages = [...sm.body.toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => { try { const u = new URL(m[1]); return u.hostname === SITE_HOST ? u.pathname : null; } catch { return null; } }).filter(Boolean);
    else row('FAIL', 'live: sitemap.xml fetched to enumerate pages', `status ${sm.status}`);
  } catch (e) { row('FAIL', 'live: sitemap.xml fetched to enumerate pages', e.message); }
  if (!pages.length) pages = ['/', '/en/', '/pt/', '/rps/'];
  pages = [...new Set(['/', '/en/', '/pt/', '/rps/', '/404-does-not-exist-hg', ...pages])];
  const pr = await pool(pages, 8, async (p) => { try { return [p, await rawRequest(BASE, p, { follow: 0 })]; } catch (e) { return [p, { error: e.message }]; } });
  let okPages = 0; const pageFails = [];
  for (const [p, r] of pr) {
    if (p === '/404-does-not-exist-hg') {
      if (r.error) { row('FAIL', `GET ${p}`, r.error); continue; }
      row(r.status === 404 ? 'OK' : 'FAIL', 'GET non-existent path -> 404 (Worker-generated)', String(r.status));
      const miss = headerProblems(r);
      row(miss.length ? 'FAIL' : 'OK', 'non-existent path (Worker 404) carries the security headers', miss.length ? 'missing/different: ' + miss.join(', ') : '');
      continue;
    }
    if (r.error) { pageFails.push(`GET ${p}: ${r.error}`); continue; }
    const ct = String(r.headers['content-type'] || '');
    const miss = headerProblems(r);
    if (r.status === 200 && /html/.test(ct) && !miss.length) okPages++;
    else pageFails.push(`GET ${p}: ${r.status} ${ct}${miss.length ? ' | headers missing/different: ' + miss.join(', ') : ''}`);
  }
  const nPages = pr.filter(([p]) => p !== '/404-does-not-exist-hg').length;
  row(okPages === nPages ? 'OK' : 'FAIL', `${okPages}/${nPages} public pages answer 200 text/html with the expected security headers (${exp.map(([k]) => k).join(', ')})`);
  pageFails.slice(0, 5).forEach((f) => row('FAIL', f));
  if (pageFails.length > 5) row('FAIL', `... and ${pageFails.length - 5} more pages failing the same check`);

  for (const p of ['/sw.js', '/manifest.json', '/robots.txt', '/sitemap.xml']) {
    try {
      const r = await rawRequest(BASE, p, { follow: 0 });
      row(r.status === 200 && r.body.length > 0 ? 'OK' : 'FAIL', `GET ${p} -> 200 with content`, `${r.status} ${r.headers['content-type'] || ''}`);
      const miss = headerProblems(r);
      row(miss.length ? 'FAIL' : 'OK', `GET ${p} security headers`, miss.length ? 'missing/different: ' + miss.join(', ') : '');
    } catch (e) { row('FAIL', `GET ${p}`, e.message); }
  }

  // workers.dev must be closed (workers_dev:false). 404 / 403 / 1042 / connection error = OK, 2xx = FAIL.
  if (!WORKERS_DEV) row('SKIP', 'workers.dev URL not checked (pass --workers-dev=<url> or set HG_WORKERS_DEV)');
  else {
    for (const p of ['/', '/.git/config']) {
      try {
        const r = await rawRequest(WORKERS_DEV, p, { follow: 0 });
        const b = r.body.toString('utf8').slice(0, 300);
        const c1042 = /\b1042\b/.test(b);
        const st = r.status >= 200 && r.status < 300 ? 'FAIL' : (r.status === 404 || r.status === 403 || c1042 ? 'OK' : 'WARN');
        row(st, `GET workers.dev${p} does not answer 2xx (closed)`, `${r.status}${c1042 ? ' (error 1042)' : ''}`);
      } catch (e) {
        row('OK', `GET workers.dev${p} does not answer 2xx (closed)`, `connection error: ${(e.cause && e.cause.code) || e.code || e.message}`);
      }
    }
  }

  // http -> https
  if (!/^https:/.test(BASE)) row('SKIP', 'http:// -> https:// redirect not checked (--base is not https)');
  else try {
    const r = await rawRequest(BASE.replace(/^https:/, 'http:'), '/', { follow: 0 });
    const loc = String(r.headers.location || '').replace(/[?&]hgaudit=\d+/, '');
    row(r.status >= 300 && r.status < 400 && loc.startsWith('https://') ? 'OK' : 'FAIL', 'http:// redirects to https://', `${r.status} ${loc}`);
  } catch (e) { row('WARN', 'http:// redirect check', e.message); }
}

/* ───────────────────────────── OUTPUT ───────────────────────────── */
const w = Math.min(100, Math.max(...rows.map((r) => r[1].length)));
for (const [st, what, detail] of rows) console.log(`${st.padEnd(5)} ${what.padEnd(w)}${detail ? '  ' + detail : ''}`);
const count = (s) => rows.filter((r) => r[0] === s).length;
console.log(`\n${count('OK')} OK, ${count('WARN')} warnings, ${count('INFO') + count('SKIP')} info/skipped, ${fails} FAILURES (${[LOCAL && 'local', LIVE && 'live ' + BASE].filter(Boolean).join(' + ')})`);
process.exit(fails ? 1 : 0);
