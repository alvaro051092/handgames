/* ═══════════════════════════════════════════════════════════
   sw.js — Service Worker for Hand Games
   Strategy: Cache-first for static assets, network-first for HTML.
   Version bump CACHE_VERSION to force update on deploy.

   PRECACHE lists canonical paths without ?v= query strings.
   caches.match uses ignoreSearch:true so versioned URLs are served
   from the precache. On deploy, bump CACHE_VERSION to clear old cache.
═══════════════════════════════════════════════════════════ */
const CACHE_VERSION = 'hg-v2';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;

/* Assets that never change between games */
const PRECACHE = [
  '/',
  '/css/tokens.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/animations.css',
  '/js/analytics.js',
  '/js/audio.js',
  '/js/streak.js',
  '/js/lang-nav.js',
  '/js/share.js',
  '/js/keyboard.js',
  '/js/game-cpu.js',
  '/js/game-local.js',
  '/js/game-battle.js',
  '/js/ui.js',
  '/js/ui-cpu.js',
  '/js/ui-local.js',
  '/js/ui-battle.js',
  '/assets/favicon.ico',
  '/assets/favicon-32.png',
  '/assets/apple-touch-icon.png',
  '/manifest.json',
];

/* ── Install: precache static shell (individual fetches so one 404 doesn't abort all) ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => {
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
        keys.filter(k => k !== CACHE_STATIC).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: cache-first for CSS/JS/images, network-first for HTML ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Only handle same-origin requests */
  if (url.origin !== self.location.origin) return;

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

  /* CSS, JS, images, fonts: cache-first.
     ignoreSearch:true lets versioned (?v=N) requests hit the precache. */
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
