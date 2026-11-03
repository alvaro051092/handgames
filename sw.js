/* ═══════════════════════════════════════════════════════════
   sw.js — Service Worker for Hand Games
   Strategy: Cache-first for static assets, network-first for HTML.
   Version bump CACHE_VERSION to force update on deploy.

   PRECACHE lists canonical paths without ?v= query strings. Static assets
   are matched on their exact URL (?v= included); the unversioned precache
   entries (ignoreSearch) are only the OFFLINE fallback, so a new ?v= is
   never answered with older cached bytes while the network is up.
   On deploy, bump CACHE_VERSION to clear old caches.
═══════════════════════════════════════════════════════════ */
const CACHE_VERSION = 'hg-v20';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_ML      = `${CACHE_VERSION}-ml-models`;

/* Third-party hosts serving the (versioned, immutable) hand-tracking
   model + wasm runtime — cached forever once downloaded so repeat
   visits skip the ~5-10MB download. */
const ML_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];
function isMlAsset(url) {
  return ML_HOSTS.includes(url.hostname) &&
    (url.pathname.includes('/@mediapipe/') || url.pathname.includes('/mediapipe-models/'));
}

/* Assets that never change between games */
const PRECACHE = [
  '/',
  '/css/tokens.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/animations.css',
  '/css/camera.css',
  '/js/analytics.js',
  '/js/hg-ux.js',
  '/js/audio.js',
  '/js/streak.js',
  '/js/lang-nav.js',
  '/js/share.js',
  '/js/keyboard.js',
  '/js/game-cpu.js',
  '/js/game-local.js',
  '/js/game-battle.js',
  '/js/ui-cpu.js',
  '/js/ui-local.js',
  '/js/ui-battle.js',
  '/js/camera-gesture.js',
  '/assets/favicon.ico',
  '/assets/favicon-32.png',
  '/assets/apple-touch-icon.png',
  '/assets/icon-192.png',
  '/manifest.json',
];

/* ── Install: precache static shell (individual fetches so one 404 doesn't abort all) ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(
        PRECACHE.map(url =>
          /* cache:'reload' bypasses the browser HTTP cache. worker.js serves
             css/js as immutable (1 year), so without this a new CACHE_VERSION
             could re-precache the *old* bytes from the HTTP cache. */
          cache.add(new Request(url, { cache: 'reload' })).catch(err => {
            console.warn('[SW] precache miss:', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

/* ── Activate: remove old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_ML).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: cache-first for CSS/JS/images, network-first for HTML ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Hand-tracking model + wasm runtime (cross-origin, versioned, immutable):
     cache forever once downloaded, regardless of the CDN's own headers. */
  if (isMlAsset(url)) {
    event.respondWith(
      caches.open(CACHE_ML).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  /* Only handle same-origin requests */
  if (url.origin !== self.location.origin) return;

  /* Live API data (room polling, etc.) — never cache, always hit the network */
  if (url.pathname.startsWith('/api/')) return;

  /* HTML pages: network-first (keeps content fresh) */
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* CSS, JS, images, fonts: cache-first on the EXACT url (query included).
     Versioned urls (?v=N) therefore only hit an entry stored for that same
     version; a new ?v= goes to the network instead of being answered with the
     bytes cached for an older ?v= (what ignoreSearch used to do).
     ignoreSearch is kept only as an offline fallback: with the network down,
     an older copy of the file (or the unversioned precache entry) beats a
     broken page. */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(request, { ignoreSearch: true }).then(fallback => fallback || Response.error())
      );
    })
  );
});
