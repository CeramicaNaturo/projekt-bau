const CACHE='projekt-bau-v2850';
const ASSETS=[
  './',
  './index.html?v=2850',
  './styles_v285.css?v=2850',
  './app_v285.js?v=2850',
  './pro_core.js?v=2850',
  './abdichtung_core.js?v=2850',
  './photo_editor.js?v=2850',
  './manifest.webmanifest',
  './three_viewer.js?v=2850'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
