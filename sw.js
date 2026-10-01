/* =====================================================================
   shoptrendy.com.pk — Service Worker
   ---------------------------------------------------------------------
   HOW TO RELEASE AN UPDATE:
   1. Change CACHE_VERSION below (e.g. 'v1.0.1' -> 'v1.0.2').
   2. Upload index.html + sw.js together.
   That's it. Browsers detect the changed sw.js, install the new worker,
   delete every old cache and take control immediately.
   ===================================================================== */

/* ---------- 1. VERSION CONTROL ---------- */
const CACHE_VERSION = 'v1.0.1';
const CACHE_PREFIX  = 'trendy-';
const CACHE_NAME    = CACHE_PREFIX + CACHE_VERSION;

/* Network-first HTML waits this long before falling back to cache
   (so a slow connection never leaves the shopper on a blank page). */
const HTML_NETWORK_TIMEOUT_MS = 5000;

/* Files stored at install time so the shell works offline.
   NOTE: sw.js is intentionally NOT listed — the browser manages the
   worker script itself, and caching it would delay updates. */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

/* Never intercept these (APIs, auth, analytics, WhatsApp, etc. are
   cross-origin anyway, but this keeps same-origin special cases safe). */
const NEVER_CACHE_PATHS = ['/sw.js', '/_headers', '/__/'];

const log = (...args) => console.log('[SW ' + CACHE_VERSION + ']', ...args);

/* ---------- 2. INSTALL: precache + 3. FORCE UPDATE ---------- */
self.addEventListener('install', (event) => {
  log('install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Add files one by one so a single missing file (e.g. an icon)
      // can never make the whole install fail.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res && res.ok) return cache.put(url, res);
              log('precache skipped (status ' + (res && res.status) + '):', url);
            })
            .catch((err) => log('precache failed:', url, err && err.message))
        )
      )
    ).then(() => self.skipWaiting()) // activate immediately, don't wait for old tabs to close
  );
});

/* ---------- 2. ACTIVATE: delete old caches + take control ---------- */
self.addEventListener('activate', (event) => {
  log('activate');
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME) // delete EVERY cache that isn't the current version
            .map((k) => {
              log('deleting old cache:', k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim()) // control already-open pages right away
      .then(() => notifyClients({ type: 'SW_UPDATED', version: CACHE_VERSION }))
  );
});

/* Optional: pages can listen for this message to show "updated" UI or reload.
   (Not required — the worker works fine without any page-side code.) */
function notifyClients(message) {
  return self.clients.matchAll({ type: 'window' }).then((clients) =>
    clients.forEach((c) => c.postMessage(message))
  );
}

/* Page can also ask a waiting worker to activate: navigator.serviceWorker...postMessage('SKIP_WAITING') */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

/* ---------- 4. FETCH: smart strategies ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle simple GET requests.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin (Firebase, Google, Facebook, TikTok, product photos on other
  // hosts, wa.me ...) is left entirely to the browser — never cached here.
  if (url.origin !== self.location.origin) return;

  if (NEVER_CACHE_PATHS.some((p) => url.pathname.startsWith(p))) return;

  // Range requests (video/audio) can't be cached safely.
  if (req.headers.has('range')) return;

  if (isHtmlRequest(req, url)) {
    event.respondWith(networkFirstHtml(req, url)); // HTML: always fresh
  } else {
    event.respondWith(cacheFirstAsset(req));        // assets: fast
  }
});

/* A page navigation (including pretty product URLs like /my-product and
   /checkout, which are all served by index.html) counts as HTML. */
function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  return url.pathname === '/' || url.pathname.endsWith('.html');
}

/* ---------- 4 + 5 + 6. HTML: NETWORK-FIRST with cache-busting ---------- */
async function networkFirstHtml(req, url) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // 5. CACHE BUSTING: add a timestamp query and bypass the browser's HTTP
    //    cache so a stale copy can never be served. The response is stored
    //    under the ORIGINAL url (without the query) so the offline lookup
    //    below still finds it.
    const bustUrl = new URL(url.href);
    bustUrl.searchParams.set('__v', CACHE_VERSION + '-' + Date.now());

    const fresh = await fetchWithTimeout(
      new Request(bustUrl.href, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: req.headers
      }),
      HTML_NETWORK_TIMEOUT_MS
    );

    if (fresh && fresh.ok) {
      // Keep the latest HTML for offline use. All pages are the same app
      // shell, so store it under the request URL AND '/index.html'.
      cache.put(req.url, fresh.clone()).catch(() => {});
      if (req.mode === 'navigate') cache.put('/index.html', fresh.clone()).catch(() => {});
      log('HTML from network:', url.pathname);
      return fresh;
    }
    // Server answered with an error (404/500): prefer a cached copy if we have one.
    const cachedOnError = await matchHtml(cache, req);
    if (cachedOnError) {
      log('HTML server error ' + fresh.status + ', serving cache:', url.pathname);
      return cachedOnError;
    }
    return fresh;
  } catch (err) {
    // 6. ERROR HANDLING: offline / timeout -> serve from cache.
    log('HTML network failed, trying cache:', url.pathname, err && err.message);
    const cached = await matchHtml(cache, req);
    if (cached) return cached;
    return offlineResponse();
  }
}

async function matchHtml(cache, req) {
  return (
    (await cache.match(req.url)) ||
    (await cache.match('/index.html')) || // SPA shell works for any pretty URL
    (await cache.match('/'))
  );
}

function offlineResponse() {
  return new Response(
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title></head>' +
    '<body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px">' +
    '<h2>You are offline</h2><p>Please check your internet connection and try again.</p>' +
    '<button onclick="location.reload()" style="padding:12px 24px">Retry</button></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout after ' + ms + 'ms')), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/* ---------- 4 + 6. STATIC ASSETS: CACHE-FIRST ---------- */
async function cacheFirstAsset(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached; // instant

  try {
    const res = await fetch(req);
    // Only store good, same-origin responses.
    if (res && res.ok && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => {});
      log('asset cached:', new URL(req.url).pathname);
    }
    return res;
  } catch (err) {
    log('asset fetch failed (offline?):', req.url, err && err.message);
    // Nothing cached and no network: return a clean error, never throw.
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}
