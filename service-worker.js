/* StudyCircus Service Worker v2.0 */
const CACHE_NAME = 'studycircus-v2.0';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700&display=swap'
];

// Install: cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can, ignore failures
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] Failed to cache:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches, claim clients
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for HTML/JS, cache-first for fonts/static
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET and cross-origin except fonts
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');
  const isGist = url.hostname.includes('githubusercontent.com');
  const isLocal = url.origin === self.location.origin || request.url.startsWith('./');

  // Gist data: always network, no cache (we add timestamp ourselves)
  if (isGist) {
    event.respondWith(fetch(request).catch(() => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Fonts: cache-first (long TTL fine for fonts)
  if (isFont) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return resp;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // HTML/JS/CSS: network-first, fallback to cache
  if (isLocal) {
    event.respondWith(
      fetch(request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return resp;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Default: try cache then network
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// Message handling
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});