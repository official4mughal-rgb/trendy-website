/* FIX #6: Smart Service Worker — strict versioning, old-cache purge, instant activation */
const CACHE_VERSION = 'v1.0.2';
const CACHE_NAME = 'trendy-' + CACHE_VERSION;
const PRECACHE = ['/', '/manifest.json', '/icon-192.png'];
const STATIC_RE = /\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .catch(() => {})
      .then(() => self.clients.claim()) /* clientsClaim() */
  );
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = (await caches.match(req)) || (await caches.match('/'));
    if (cached) return cached;
    return new Response('<h1>You are offline</h1><p>Please check your connection and try again.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* Firebase / Google / pixels pass straight through */
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html') || url.pathname.endsWith('.html');
  if (isHTML) event.respondWith(networkFirst(req));
  else if (STATIC_RE.test(url.pathname)) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});
