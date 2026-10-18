/* FIX: SW Update Critical v1.0.10 */
var CACHE_VERSION = 'v1.0.10';
var CACHE_NAME = 'trendy-' + CACHE_VERSION;
var PRECACHE = ['/', '/manifest.json', '/icon-192.png'];
var STATIC_RE = /\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i;

var OFFLINE_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1"><title>TRENDY — Offline</title>' +
'<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
'font-family:Arial,Helvetica,sans-serif;background:#fff;color:#1A1A1A;text-align:center;padding:24px}' +
'.l{font-size:38px;letter-spacing:.32em;font-weight:600;padding-left:.32em}.l b{font-weight:300}' +
'p{color:#6B6B6B;max-width:340px;line-height:1.6}button{margin-top:18px;background:#C2185B;color:#fff;border:0;' +
'padding:14px 30px;font-size:13px;letter-spacing:.14em;font-weight:600;cursor:pointer}</style></head>' +
'<body><div class="l">TREN<b>DY</b></div><h2 style="font-weight:600;margin:22px 0 8px">You are offline</h2>' +
'<p>Please check your internet connection and try again.</p>' +
'<button onclick="location.reload()">TRY AGAIN</button></body></html>';

self.addEventListener('install', function (event) {
  console.log('[SW] Installing', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(PRECACHE.map(function (u) {
          return cache.add(new Request(u, { cache: 'reload' })).then(function () {
            console.log('[SW] Precached', u);
          }).catch(function (e) { console.warn('[SW] Precache failed', u, e); });
        }));
      })
      .catch(function (e) { console.warn('[SW] Install error', e); })
      .then(function () { console.log('[SW] skipWaiting()'); return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  console.log('[SW] Activating', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        }));
      })
      .catch(function (e) { console.warn('[SW] Cleanup error', e); })
      .then(function () { console.log('[SW] clients.claim()'); return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') { console.log('[SW] SKIP_WAITING message'); self.skipWaiting(); }
});

function networkFirst(req) {
  return fetch(req, { cache: 'no-store' }).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () {});
    }
    console.log('[SW] Network (fresh):', req.url);
    return res;
  }).catch(function () {
    console.log('[SW] Offline, trying cache:', req.url);
    return caches.match(req).then(function (hit) {
      return hit || caches.match('/') || null;
    }).then(function (hit) {
      return hit || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) { return hit; }
    return fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () {});
        console.log('[SW] Cached asset:', req.url);
      }
      return res;
    }).catch(function () { return new Response('', { status: 504, statusText: 'Offline' }); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) { return; }   // ignore non-GET
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) { return; }                // never touch Firebase, Google, pixels, wa.me
  if (url.pathname === '/sw.js') { return; }                          // never cache the worker itself
  var isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') > -1 ||
    url.pathname.slice(-5) === '.html';
  if (isHTML) { event.respondWith(networkFirst(req)); }
  else if (STATIC_RE.test(url.pathname)) { event.respondWith(cacheFirst(req)); }
});