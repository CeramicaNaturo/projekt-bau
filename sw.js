const CACHE='projekt-bau-v2820';
const ASSETS=['./','./index.html?v=2820','./styles.css?v=2820','./app.js?v=2820','./pro_core.js?v=2820','./abdichtung_core.js?v=2820','./photo_editor.js?v=2820','./manifest.webmanifest','./three_viewer.js?v=2820'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('projekt-bau-v')&&k!=='projekt-bau-v2820').map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
