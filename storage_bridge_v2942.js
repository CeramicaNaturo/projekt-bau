
/* Projekt Bau v2.9.2 PRO — IndexedDB primary storage
   Purpose:
   - Prevent localStorage quota errors with photos / large OneDrive backups.
   - Keep the existing synchronous app API working through an in-memory mirror.
   - Migrate legacy Projekt Bau states once, without deleting legacy storage.
*/
(()=>{
  'use strict';

  const DB_NAME='projekt-bau-db';
  const DB_VERSION=1;
  const STORE='kv';
  const STATE_KEY='state-v03';
  const META_KEY='meta';
  const LEGACY_KEYS=['projekt-bau-v03','projekt-bau-v02'];
  const BACKUP_PREFIX='projekt-bau-before-onedrive-restore-';

  const Native={
    getItem:Storage.prototype.getItem,
    setItem:Storage.prototype.setItem,
    removeItem:Storage.prototype.removeItem
  };

  let db=null;
  let state={projects:[]};
  let readyResolve;
  const ready=new Promise(r=>readyResolve=r);
  let writeChain=Promise.resolve();

  function validState(v){
    return !!v && typeof v==='object' && Array.isArray(v.projects);
  }

  function looksLikeProject(p){
    if(!p || typeof p!=='object' || Array.isArray(p)) return false;
    const meta=['name','address','customer','startDate','owner','description']
      .some(k=>typeof p[k]==='string' && p[k].trim());
    const arrays=['areas','floorplans','photos','tileMaterials','rooms','bereiche']
      .some(k=>Array.isArray(p[k]));
    return meta && arrays;
  }

  function normalise(v){
    if(validState(v)) return v;
    if(Array.isArray(v)){
      const projects=v.filter(looksLikeProject);
      if(projects.length) return {projects};
    }
    if(looksLikeProject(v)) return {projects:[v]};
    return null;
  }

  function clone(v){
    return v==null?v:JSON.parse(JSON.stringify(v));
  }

  function fingerprint(p){
    const id=String(p?.id||p?.projectId||p?.uuid||'').trim();
    if(id) return `id:${id}`;
    const name=String(p?.name||p?.projectName||p?.title||'').trim().toLowerCase();
    const address=String(p?.address||p?.adresse||'').trim().toLowerCase();
    const customer=String(p?.customer||p?.kunde||'').trim().toLowerCase();
    return `meta:${name}|${address}|${customer}`;
  }

  function projectScore(p){
    let score=0;
    for(const k of ['areas','floorplans','photos','tileMaterials','rooms','bereiche','objects','walls']){
      score+=(Array.isArray(p?.[k])?p[k].length:0)*100000;
    }
    try{score+=JSON.stringify(p||{}).length}catch(_){}
    const ts=Date.parse(p?._syncUpdatedAt||p?.updatedAt||'')||0;
    score+=Math.floor(ts/100000000);
    return score;
  }

  function mergeProject(a,b){
    if(!a) return clone(b);
    if(!b) return clone(a);
    const aTime=Date.parse(a?._syncUpdatedAt||a?.updatedAt||'')||0;
    const bTime=Date.parse(b?._syncUpdatedAt||b?.updatedAt||'')||0;
    let primary;
    if(aTime && bTime && aTime!==bTime) primary=bTime>aTime?b:a;
    else primary=projectScore(b)>projectScore(a)?b:a;
    const secondary=primary===a?b:a;
    const out=clone(primary);

    for(const [target,aliases] of Object.entries({
      name:['name','projectName','title'],
      address:['address','adresse'],
      customer:['customer','kunde'],
      phone:['phone','telefon'],
      startDate:['startDate','datum'],
      owner:['owner','verantwortlich'],
      description:['description','beschreibung']
    })){
      if(out[target]===undefined || out[target]===null || out[target]===''){
        for(const k of aliases){
          if(secondary?.[k]!==undefined && secondary?.[k]!==null && secondary[k]!==''){
            out[target]=secondary[k]; break;
          }
        }
      }
    }

    // Only merge child arrays by stable item identity. This prevents duplicate photos/floorplans.
    for(const key of ['areas','floorplans','photos','tileMaterials','rooms','bereiche']){
      const arr=[], seen=new Set();
      for(const item of [...(Array.isArray(a?.[key])?a[key]:[]),...(Array.isArray(b?.[key])?b[key]:[])]){
        let sig='';
        if(item && typeof item==='object'){
          sig=String(item.id||item.uuid||item.name||item.title||'');
        }
        if(!sig){
          try{sig=JSON.stringify(item)}catch(_){sig=String(Math.random())}
        }
        if(seen.has(sig)) continue;
        seen.add(sig);
        arr.push(clone(item));
      }
      if(arr.length) out[key]=arr;
    }
    if(!Array.isArray(out.areas) && Array.isArray(out.bereiche)) out.areas=clone(out.bereiche);
    if(!Array.isArray(out.areas) && Array.isArray(out.rooms)) out.areas=clone(out.rooms);
    if(!Array.isArray(out.areas)) out.areas=[];
    return out;
  }

  function mergeStates(states){
    const map=new Map();
    const customerMap=new Map();
    const collections=new Map();
    let shell={};
    for(const st of states){
      if(!validState(st)) continue;
      if(!Object.keys(shell).length){
        shell=clone(st);
        delete shell.projects;
        delete shell.customers;
        delete shell.storage;
      }
      for(const p of st.projects){
        if(!p || typeof p!=='object') continue;
        const sig=fingerprint(p);
        map.set(sig,map.has(sig)?mergeProject(map.get(sig),p):clone(p));
      }
      for(const customer of (Array.isArray(st.customers)?st.customers:[])){
        if(!customer || typeof customer!=='object') continue;
        const sig=String(customer.id||customer.number||`${customer.company||''}|${customer.email||''}|${customer.phone||''}`);
        if(!sig) continue;
        const previous=customerMap.get(sig)||{};
        const previousTime=Date.parse(previous.updatedAt||previous.createdAt||'')||0;
        const nextTime=Date.parse(customer.updatedAt||customer.createdAt||'')||0;
        customerMap.set(sig,clone(nextTime>=previousTime?{...previous,...customer}:{...customer,...previous}));
      }
      for(const [key,value] of Object.entries(st)){
        if(key==='projects'||key==='customers'||!Array.isArray(value))continue;
        if(!collections.has(key))collections.set(key,new Map());const bucket=collections.get(key);
        for(const item of value){
          let sig='';
          if(item&&typeof item==='object')sig=String(item.id||item.uuid||item.number||item.no||item.key||item.name||'');
          if(!sig){try{sig=JSON.stringify(item)}catch(_){sig=String(item)}}
          if(!bucket.has(sig)){bucket.set(sig,clone(item));continue}
          if(item&&typeof item==='object'){
            const old=bucket.get(sig),a=Date.parse(old?.updatedAt||old?.createdAt||'')||0,b=Date.parse(item.updatedAt||item.createdAt||'')||0;
            bucket.set(sig,clone(b>=a?{...old,...item}:{...item,...old}));
          }
        }
      }
    }
    const result={
      ...shell,
      projects:[...map.values()],
      customers:[...customerMap.values()],
      storage:{
        engine:'IndexedDB',
        schema:1,
        migratedAt:new Date().toISOString()
      }
    };
    for(const [key,bucket] of collections)result[key]=[...bucket.values()];
    return result;
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB konnte nicht geöffnet werden.'));
    });
  }

  function idbGet(key){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  function idbPut(key,value){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||new Error('IndexedDB write aborted'));
    });
  }

  function schedulePut(key,value){
    const snapshot=clone(value);
    writeChain=writeChain
      .catch(()=>{})
      .then(()=>idbPut(key,snapshot));
    return writeChain;
  }

  function readLegacyStates(){
    const out=[];
    const seenRaw=new Set();
    for(const storage of [localStorage,sessionStorage]){
      let len=0;
      try{len=storage.length}catch(_){}
      for(let i=0;i<len;i++){
        let key=null,raw=null;
        try{
          key=storage.key(i);
          if(!key) continue;
          // Limit migration to Projekt Bau keys and obvious recovery snapshots.
          if(!/projekt[-_ ]?bau/i.test(key)) continue;
          raw=Native.getItem.call(storage,key);
        }catch(_){continue}
        if(!raw || seenRaw.has(raw)) continue;
        seenRaw.add(raw);
        let parsed;
        try{parsed=JSON.parse(raw)}catch(_){continue}
        const st=normalise(parsed);
        if(st?.projects?.length) out.push(st);
        // Handle wrappers that contain a state.
        for(const k of ['state','data','backup','payload']){
          const nested=normalise(parsed?.[k]);
          if(nested?.projects?.length) out.push(nested);
        }
      }
    }
    return out;
  }

  async function init(){
    try{
      db=await openDb();
      const existing=await idbGet(STATE_KEY);
      const candidates=[];
      if(validState(existing)) candidates.push(existing);
      candidates.push(...readLegacyStates());

      if(candidates.length){
        state=mergeStates(candidates);
        await idbPut(STATE_KEY,state);
      }else{
        state={projects:[],storage:{engine:'IndexedDB',schema:1,createdAt:new Date().toISOString()}};
        await idbPut(STATE_KEY,state);
      }

      await idbPut(META_KEY,{
        engine:'IndexedDB',
        version:'2.9.2',
        lastOpenAt:new Date().toISOString()
      });

      // Tiny marker only; never store project/photo payload in localStorage again.
      try{
        Native.setItem.call(localStorage,'projekt-bau-storage-engine','IndexedDB-v1');
        Native.setItem.call(localStorage,'projekt-bau-project-count',String(state.projects.length));
      }catch(_){}

      readyResolve(state);
    }catch(e){
      console.error('PBStorage init',e);
      // Fallback: keep app usable even if IndexedDB is blocked.
      const legacy=readLegacyStates();
      state=legacy.length?mergeStates(legacy):{projects:[]};
      readyResolve(state);
    }
  }

  function getStateSync(){
    return clone(state);
  }

  async function getState(){
    await ready;
    return clone(state);
  }

  async function saveState(next,{reason='app-save'}={}){
    await ready;
    const normalized=normalise(next);
    if(!normalized) throw new Error('Ungültiger Projektstatus.');
    state=clone(normalized);
    state.storage={
      ...(state.storage||{}),
      engine:'IndexedDB',
      schema:1,
      lastSavedAt:new Date().toISOString(),
      reason
    };
    try{
      Native.setItem.call(localStorage,'projekt-bau-project-count',String(state.projects.length));
    }catch(_){}
    await schedulePut(STATE_KEY,state);
    return true;
  }

  async function createSafetySnapshot(label='snapshot'){
    await ready;
    const key=`snapshot:${Date.now()}:${label}`;
    await idbPut(key,{
      createdAt:new Date().toISOString(),
      label,
      state:clone(state)
    });
    return key;
  }

  async function stats(){
    await ready;
    let estimate=null;
    try{estimate=await navigator.storage?.estimate?.()}catch(_){}
    let bytes=0;
    try{bytes=new Blob([JSON.stringify(state)]).size}catch(_){}
    return {
      engine:'IndexedDB',
      projects:state.projects.length,
      stateBytes:bytes,
      quota:estimate?.quota||null,
      usage:estimate?.usage||null
    };
  }

  // Compatibility layer for legacy app code.
  const originalSet=Storage.prototype.setItem;
  const originalGet=Storage.prototype.getItem;
  const originalRemove=Storage.prototype.removeItem;

  Storage.prototype.getItem=function(key){
    if(this===localStorage && key==='projekt-bau-v03'){
      try{return JSON.stringify(state)}catch(_){return '{"projects":[]}'}
    }
    return originalGet.call(this,key);
  };

  Storage.prototype.setItem=function(key,value){
    if(this===localStorage && key==='projekt-bau-v03'){
      try{
        const parsed=normalise(JSON.parse(String(value)));
        if(parsed){
          state=clone(parsed);
          schedulePut(STATE_KEY,state).catch(e=>console.error('PBStorage async save',e));
          try{Native.setItem.call(localStorage,'projekt-bau-project-count',String(state.projects.length))}catch(_){}
          return;
        }
      }catch(e){
        console.error('PBStorage parse',e);
      }
      return;
    }

    if(this===localStorage && String(key).startsWith(BACKUP_PREFIX)){
      try{
        const parsed=JSON.parse(String(value));
        if(validState(parsed)){
          createSafetySnapshot(String(key)).catch(()=>{});
          return;
        }
      }catch(_){}
    }

    return originalSet.call(this,key,value);
  };

  Storage.prototype.removeItem=function(key){
    if(this===localStorage && key==='projekt-bau-v03'){
      state={projects:[]};
      schedulePut(STATE_KEY,state).catch(()=>{});
      return;
    }
    return originalRemove.call(this,key);
  };

  window.PBStorage={
    ready,
    getStateSync,
    getState,
    saveState,
    createSafetySnapshot,
    stats,
    mergeStates,
    fingerprint,
    DB_NAME
  };

  init();
})();
