/* TRENDY service worker. Bump CACHE_VERSION on every deploy. */
var CACHE_VERSION = 'v1.0.4';
var CACHE_NAME = 'trendy-' + CACHE_VERSION;
var PRECACHE = ['/', '/manifest.json', '/icon-192.png'];

var OFFLINE_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>TRENDY — Offline</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
  'font-family:Inter,system-ui,sans-serif;background:#fff;color:#1A1A1A;text-align:center;padding:24px}' +
  'h1{font-weight:600;letter-spacing:.32em;padding-left:.32em;font-size:36px;margin:0 0 16px}' +
  'h1 b{font-weight:300}p{color:#6B6B6B;font-size:15px;margin:0}</style></head>' +
  '<body><h1>TREN<b>DY</b></h1><p>You are offline. Please check your connection.</p></body></html>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/* INSTALL: pre-cache the shell, take over immediately */
self.addEventListener('install', function (event) {
  console.log('[SW] Installing', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        /* each item separately, so one failure does not abort the install */
        return Promise.all(PRECACHE.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Precache skipped:', url, err);
          });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/* ACTIVATE: delete every cache that is not the current version, then claim open tabs */
self.addEventListener('activate', function (event) {
  console.log('[SW] Activating', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* HTML: network-first, fall back to cache, then to the offline page */
function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.status === 200) {
      var copy = res.clone();
      /* every page route is the same SPA shell, so store it under '/' */
      caches.open(CACHE_NAME).then(function (c) { c.put('/', copy); })
        .catch(function (e) { console.warn('[SW] Cache put failed:', e); });
    }
    return res;
  }).catch(function (err) {
    console.warn('[SW] Network failed, trying cache:', req.url, err);
    return caches.match(req).then(function (hit) {
      return hit || caches.match('/') || offlineResponse();
    }).then(function (r) { return r || offlineResponse(); });
  });
}

/* Static assets: cache-first, fall back to network */
function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); })
          .catch(function (e) { console.warn('[SW] Cache put failed:', e); });
      }
      return res;
    });
  }).catch(function (err) {
    console.warn('[SW] Asset fetch failed:', req.url, err);
    return new Response('', { status: 504, statusText: 'Offline' });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* NEVER CACHE: anything cross-origin (Firebase, Google APIs, gstatic, TikTok,
     Facebook, wa.me) is left to the browser's network, untouched */
  if (url.origin !== self.location.origin) return;

  /* NEVER CACHE: the service worker itself */
  if (url.pathname === '/sw.js') return;

  var isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') > -1 ||
    url.pathname === '/' || /\.html$/i.test(url.pathname);

  event.respondWith(isHTML ? networkFirst(req) : cacheFirst(req));
});