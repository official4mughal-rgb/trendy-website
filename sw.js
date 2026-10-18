/* sw.js — TRENDY v1.0.6 */
const CACHE_VERSION = 'v1.0.6';
const CACHE_NAME = 'trendy-' + CACHE_VERSION;
const PRECACHE = ['/', '/manifest.json', '/icon-192.png'];
const STATIC_RE = /\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i;

const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>TRENDY — Offline</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1A1A1A;text-align:center;padding:24px}
.l{font-size:38px;letter-spacing:.32em;font-weight:600;padding-left:.32em}.l b{font-weight:300}
p{color:#6B6B6B;max-width:340px;line-height:1.6}button{margin-top:18px;background:#C2185B;color:#fff;border:0;
padding:14px 30px;font-size:13px;letter-spacing:.14em;font-weight:600;cursor:pointer}</style></head>
<body><div class="l">TREN<b>DY</b></div><h2 style="font-weight:600;margin:22px 0 8px">You're offline</h2>
<p>Please check your internet connection and try again.</p>
<button onclick="location.reload()">TRY AGAIN</button></body></html>`;

/* Never cache / never intercept */
function isBypass(url) {
  if (url.origin !== self.location.origin) return true;        // Firebase, Google APIs, TikTok/Facebook pixels, wa.me, fonts…
  if (url.pathname === '/sw.js') return true;                  // the service worker itself
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .catch(() => {})
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

/* HTML: network-first, fall back to cached page, then branded offline page */
async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = (await caches.match(req)) || (await caches.match('/'));
    if (cached) return cached;
    return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/* Static assets: cache-first */
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === 'basic') {
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
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (isBypass(url)) return;                                   // browser handles it normally, nothing cached

  const isHTML = req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html')
    || url.pathname.endsWith('.html');

  if (isHTML) event.respondWith(networkFirst(req));
  else if (STATIC_RE.test(url.pathname)) event.respondWith(cacheFirst(req));
  /* anything else: not intercepted */
});