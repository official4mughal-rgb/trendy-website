/* TRENDY service worker
   >>> BUMP CACHE_VERSION ON EVERY DEPLOY <<< — old caches are deleted automatically on activate. */
const CACHE_VERSION = 'v1.0.3';
const CACHE_NAME = 'trendy-' + CACHE_VERSION;
const PRECACHE = ['/', '/manifest.json', '/icon-192.png'];

/* Only same-origin files and Google Fonts are ever handled by this worker.
   Everything else (Firebase Auth/Firestore/Storage/Functions, googleapis, analytics,
   Facebook/TikTok pixels, wa.me, product images on Firebase Storage) goes straight to
   the network and is NEVER cached. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const OFFLINE_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>TRENDY — Offline</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
  'font-family:Arial,sans-serif;background:#fff;color:#1A1A1A;text-align:center;padding:24px}' +
  'h1{letter-spacing:.3em;font-weight:600;margin:0 0 16px}p{color:#6B6B6B;line-height:1.6;max-width:320px}' +
  'button{margin-top:20px;background:#C2185B;color:#fff;border:0;padding:14px 32px;letter-spacing:.14em;font-weight:600;cursor:pointer}</style>' +
  '</head><body><h1>TRENDY</h1><p>You are offline. Please check your internet connection and try again.</p>' +
  '<button onclick="location.reload()">RETRY</button></body></html>';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlRequest(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') > -1;
}

function putInCache(req, res) {
  if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.indexOf(url.hostname) > -1;
  if (!sameOrigin && !isFont) return;               // Firebase / APIs / pixels: network only, never cached
  if (sameOrigin && url.pathname === '/sw.js') return; // never cache the worker itself

  /* HTML: network-first, fall back to cache, then offline page */
  if (sameOrigin && isHtmlRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache(req, res))
        .catch(() =>
          caches.match(req)
            .then((hit) => hit || caches.match('/'))
            .then((hit) => hit || new Response(OFFLINE_HTML, {
              status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }))
        )
    );
    return;
  }

  /* Static assets (js/css/images/fonts/manifest): cache-first */
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => putInCache(req, res)).catch(() => {
        if (req.destination === 'image') return new Response('', { status: 404 });
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
