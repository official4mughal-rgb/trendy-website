/* TRENDY — service worker (real file). Also generated as a Blob URL inline in the page for sites that can't
   host this at the domain root — see registerServiceWorker() near the end of index.html's <body>.
   If BOTH are reachable, the page prefers this real file (more reliable across browsers than a blob: URL,
   especially for background sync / push in the future, and survives a full page reload cleanly). */
var CACHE_NAME = 'trendy-v1';
/* Only same-origin, genuinely static assets. Firebase/Google/Tawk/fonts are deliberately NOT cached here —
   cache-first on a third-party SDK could silently serve a stale Firebase Auth/Firestore bundle while offline,
   which is a much worse failure mode than just letting that one request fail normally when there's no network. */
var PRECACHE_URLS = ['./'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).catch(function () { /* offline install is fine; fetch handler still works */ });
    }).then(function () { return self.skipWaiting() })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME }).map(function (k) { return caches.delete(k) }));
    }).then(function () { return self.clients.claim() })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept Firebase/Google/Tawk/fonts — see note above

  // Cache-first for the page itself and any same-origin static asset; network falls back to cache when offline.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var networkFetch = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy) });
        }
        return res;
      }).catch(function () { return cached });
      return cached || networkFetch;
    })
  );
});
