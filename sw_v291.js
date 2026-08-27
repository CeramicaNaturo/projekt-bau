const CACHE='projekt-bau-v29101';
const ASSETS=[
  './index.html?v=29101',
  './styles_v291.css?v=29101',
  './storage_bridge_v291.js?v=29101',
  './app_v291.js?v=29101',
  './onedrive_sync_v291.js?v=29101',
  './pro_core.js?v=29101',
  './abdichtung_core.js?v=29101',
  './photo_editor.js?v=29101',
  './manifest.webmanifest',
  './three_viewer.js?v=29101'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
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
     url.hostname.includes('msftauth.net')){
    return;
  }

  // HTML is network-first so a new deployment can never be pinned by an old cache.
  const isDocument=event.request.mode==='navigate' ||
                   event.request.destination==='document' ||
                   url.pathname.endsWith('/index.html');

  if(isDocument){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html?v=29101',copy)).catch(()=>{});
          return response;
        })
        .catch(()=>caches.match('./index.html?v=29101'))
    );
    return;
  }

  // Versioned static assets: cache-first, then network.
  event.respondWith(
    caches.match(event.request).then(hit=>{
      if(hit)return hit;
      return fetch(event.request,{cache:'no-store'}).then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        return response;
      });
    })
  );
});
