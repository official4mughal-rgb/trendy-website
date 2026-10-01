var CACHE_NAME='trendy-cache-v3';
var PRECACHE_URLS=['./'];
self.addEventListener('install',function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){return cache.addAll(PRECACHE_URLS).catch(function(){})})
      .then(function(){return self.skipWaiting()})
  );
});
self.addEventListener('activate',function(event){
  event.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(
          keys.filter(function(k){return k!==CACHE_NAME}).map(function(k){return caches.delete(k)})
        );
      })
      .then(function(){return self.clients.claim()})
  );
});
self.addEventListener('fetch',function(event){
  var req=event.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(caches.match(req).then(function(cached){
    var nf=fetch(req).then(function(res){
      if(res&&res.status===200){var copy=res.clone();caches.open(CACHE_NAME).then(function(cache){cache.put(req,copy)})}
      return res;
    }).catch(function(){return cached});
    return cached||nf;
  }));
});
