const CACHE='projekt-bau-v2890';
const ASSETS=[
  './',
  './index.html?v=2890',
  './styles_v289.css?v=2890',
  './storage_bridge_v289.js?v=2890',
  './app_v289.js?v=2890',
  './onedrive_sync_v289.js?v=2890',
  './pro_core.js?v=2890',
  './abdichtung_core.js?v=2890',
  './photo_editor.js?v=2890',
  './manifest.webmanifest',
  './three_viewer.js?v=2890'
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
  const url=new URL(event.request.url);
  if(url.hostname.includes('microsoftonline.com') ||
     url.hostname.includes('graph.microsoft.com') ||
     url.hostname.includes('msauth.net') ||
     url.hostname.includes('msftauth.net')) return;

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
