
/* Projekt Bau v2.9.2 PRO - OneDrive Multi-Device Sync
   Static SPA integration using MSAL Browser + Microsoft Graph.
   No client secret is used or stored.
*/
(()=>{
  'use strict';

  const CONFIG_KEY='projekt-bau-onedrive-config-v1';
  const META_KEY='projekt-bau-onedrive-meta-v1';
  const SYNC_KEY='projekt-bau-onedrive-sync-v2';
  const DEVICE_KEY='projekt-bau-device-id-v1';
  const BACKUP_FILE='ProjektBau_Backup.json';
  const GRAPH='https://graph.microsoft.com/v1.0';
  const DEFAULT_REDIRECT='https://ceramicanaturo.github.io/projekt-bau/';
  const SCOPES=['Files.ReadWrite'];

  let client=null;
  let clientSignature='';
  let uploadRunning=false;
  let uploadAgain=false;
  let autoTimer=null;
  let syncRunning=false;
  let syncAgain=false;
  let pollTimer=null;

  const el=id=>document.getElementById(id);
  const nowCH=()=>new Intl.DateTimeFormat('de-CH',{
    dateStyle:'short',timeStyle:'medium'
  }).format(new Date());

  function readConfig(){
    try{
      return {
        clientId:'',
        tenant:'common',
        redirectUri:DEFAULT_REDIRECT,
        autoSync:false,
        ...JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')
      };
    }catch(_){
      return {clientId:'',tenant:'common',redirectUri:DEFAULT_REDIRECT,autoSync:false};
    }
  }

  function writeConfig(cfg){
    localStorage.setItem(CONFIG_KEY,JSON.stringify(cfg));
  }

  function readMeta(){
    try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')}catch(_){return {}}
  }

  function writeMeta(patch){
    const next={...readMeta(),...patch};
    localStorage.setItem(META_KEY,JSON.stringify(next));
    return next;
  }


  function deviceId(){
    let id=localStorage.getItem(DEVICE_KEY);
    if(!id){id=(crypto.randomUUID?crypto.randomUUID():`dev-${Date.now()}-${Math.random()}`);localStorage.setItem(DEVICE_KEY,id)}
    return id;
  }
  function readSync(){try{return {tombstones:{},...JSON.parse(localStorage.getItem(SYNC_KEY)||'{}')}}catch(_){return {tombstones:{}}}}
  function writeSync(v){localStorage.setItem(SYNC_KEY,JSON.stringify(v||{tombstones:{}}))}
  function recordProjectDeletion(id){
    if(!id)return;
    const x=readSync(); x.tombstones=x.tombstones||{}; x.tombstones[String(id)]=new Date().toISOString(); writeSync(x);
    scheduleAutoSync('project-delete');
  }
  function isoMs(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0}
  function clone(v){return JSON.parse(JSON.stringify(v))}
  function projectId(p){return String(p?.id||p?.projectId||p?.uuid||'')}

  function setStatus(text,type='neutral'){
    const n=el('odStatus');
    if(!n)return;
    n.textContent=text;
    n.dataset.type=type;
  }

  function bytes(n){
    const x=Number(n)||0;
    if(x<1024)return `${x} B`;
    if(x<1024**2)return `${(x/1024).toFixed(1)} KB`;
    if(x<1024**3)return `${(x/1024**2).toFixed(1)} MB`;
    return `${(x/1024**3).toFixed(1)} GB`;
  }

  function syncUi(){
    const cfg=readConfig(),meta=readMeta();
    if(el('odClientId'))el('odClientId').value=cfg.clientId||'';
    if(el('odTenant'))el('odTenant').value=cfg.tenant||'common';
    if(el('odRedirect'))el('odRedirect').value=cfg.redirectUri||DEFAULT_REDIRECT;
    if(el('odAutoSync'))el('odAutoSync').checked=!!cfg.autoSync;
    if(el('odLastBackup'))el('odLastBackup').textContent=meta.lastBackupAt||'—';
    if(el('odCloudFile'))el('odCloudFile').textContent=meta.remoteInfo||'—';
    if(el('odAccount'))el('odAccount').textContent=meta.account||'Nicht verbunden';
  }

  function configSignature(cfg){
    return `${cfg.clientId}|${cfg.tenant}|${cfg.redirectUri}`;
  }

  async function getClient(){
    const cfg=readConfig();
    if(!cfg.clientId)throw new Error('Bitte zuerst die Application (Client) ID eintragen.');
    if(typeof msal==='undefined')throw new Error('Microsoft Login-Bibliothek konnte nicht geladen werden.');

    const sig=configSignature(cfg);
    if(client && sig===clientSignature)return client;

    client=new msal.PublicClientApplication({
      auth:{
        clientId:cfg.clientId.trim(),
        authority:`https://login.microsoftonline.com/${(cfg.tenant||'common').trim()}`,
        redirectUri:(cfg.redirectUri||DEFAULT_REDIRECT).trim(),
        navigateToLoginRequestUrl:false
      },
      cache:{
        cacheLocation:'localStorage',
        storeAuthStateInCookie:false
      },
      system:{
        allowRedirectInIframe:false
      }
    });
    clientSignature=sig;
    return client;
  }

  function currentAccount(c){
    const accounts=c.getAllAccounts();
    const meta=readMeta();
    return accounts.find(a=>a.homeAccountId===meta.homeAccountId) || accounts[0] || null;
  }

  async function connect(){
    const c=await getClient();
    setStatus('Microsoft-Anmeldung wird geöffnet…','working');
    const result=await c.loginPopup({
      scopes:SCOPES,
      prompt:'select_account'
    });
    if(!result?.account)throw new Error('Microsoft-Konto konnte nicht verbunden werden.');

    writeMeta({
      homeAccountId:result.account.homeAccountId,
      account:result.account.username||result.account.name||'Microsoft-Konto'
    });
    syncUi();
    setStatus(`Verbunden: ${result.account.username||result.account.name||'Microsoft-Konto'}`,'ok');
    await refreshRemoteInfo(false);
    if(readConfig().autoSync)await syncNow({silent:true,reason:'connect'});
  }

  async function disconnect(){
    try{
      const c=await getClient();
      const account=currentAccount(c);
      if(account){
        try{await c.logoutPopup({account,postLogoutRedirectUri:readConfig().redirectUri||DEFAULT_REDIRECT})}
        catch(_){}
      }
    }finally{
      writeMeta({homeAccountId:null,account:null});
      syncUi();
      setStatus('OneDrive-Verbindung getrennt.','neutral');
    }
  }

  async function token(){
    const c=await getClient();
    let account=currentAccount(c);
    if(!account){
      const result=await c.loginPopup({scopes:SCOPES,prompt:'select_account'});
      account=result.account;
      writeMeta({homeAccountId:account.homeAccountId,account:account.username||account.name});
      syncUi();
    }
    try{
      return (await c.acquireTokenSilent({scopes:SCOPES,account})).accessToken;
    }catch(_){
      return (await c.acquireTokenPopup({scopes:SCOPES,account})).accessToken;
    }
  }

  async function graph(path,options={}){
    const accessToken=await token();
    const headers=new Headers(options.headers||{});
    headers.set('Authorization',`Bearer ${accessToken}`);
    const res=await fetch(`${GRAPH}${path}`,{...options,headers});
    if(!res.ok){
      let detail='';
      try{
        const j=await res.json();
        detail=j?.error?.message||j?.message||JSON.stringify(j);
      }catch(_){
        try{detail=await res.text()}catch(__){}
      }
      const err=new Error(detail||`Microsoft Graph HTTP ${res.status}`);
      err.status=res.status;
      throw err;
    }
    return res;
  }

  async function ensureAppRoot(){
    // First call creates Apps/<application-name> if necessary.
    const res=await graph('/me/drive/special/approot');
    return await res.json();
  }

  function cloudPayload(){
    return {
      schema:'projekt-bau-cloud-backup',
      schemaVersion:1,
      appVersion:'2.9.2 PRO',
      syncVersion:2,
      deviceId:deviceId(),
      tombstones:clone(readSync().tombstones||{}),
      savedAt:new Date().toISOString(),
      projectsCount:Array.isArray(S?.projects)?S.projects.length:0,
      state:JSON.parse(JSON.stringify(S||{projects:[]}))
    };
  }

  async function uploadBackup({silent=false,reason='manual',expectedETag=null}={}){
    if(uploadRunning){
      uploadAgain=true;
      return false;
    }
    uploadRunning=true;
    try{
      await ensureAppRoot();
      const payload=cloudPayload();
      const body=JSON.stringify(payload);
      const size=new Blob([body]).size;
      if(size>250*1024*1024){
        throw new Error(`Yedek ${bytes(size)}. Tek dosya OneDrive yükleme sınırı 250 MB.`);
      }

      if(!silent)setStatus(`OneDrive'a yedekleniyor… (${bytes(size)})`,'working');

      const res=await graph(`/me/drive/special/approot:/${encodeURIComponent(BACKUP_FILE)}:/content`,{
        method:'PUT',
        headers:{'Content-Type':'application/json; charset=utf-8',...(expectedETag?{'If-Match':expectedETag}:{})},
        body
      });
      const info=await res.json();
      const stamp=nowCH();
      writeMeta({
        lastBackupAt:stamp,
        lastBackupIso:new Date().toISOString(),
        remoteInfo:`${info.name||BACKUP_FILE} · ${bytes(info.size||size)}`,
        remoteModified:info.lastModifiedDateTime||null,
        remoteETag:info.eTag||null,
        lastReason:reason
      });
      syncUi();
      setStatus(`OneDrive-Sicherung erfolgreich · ${stamp}`,'ok');
      return true;
    }catch(e){
      console.error('OneDrive upload',e);
      if(e.status===412){
        if(!silent)setStatus('Cloud-Datei wurde zwischenzeitlich geändert. Daten werden neu zusammengeführt …','working');
      }else if(!silent){
        setStatus(`OneDrive-Fehler: ${e.message}`,'error');
        alert(`OneDrive-Sicherung fehlgeschlagen:\n${e.message}`);
      }
      return false;
    }finally{
      uploadRunning=false;
      if(uploadAgain){
        uploadAgain=false;
        setTimeout(()=>syncNow({silent:true,reason:'queued-upload'}),500);
      }
    }
  }

  async function fetchBackup(){
    await ensureAppRoot();
    const res=await graph(`/me/drive/special/approot:/${encodeURIComponent(BACKUP_FILE)}:/content`);
    return await res.json();
  }

  async function fetchBackupWithETag(){
    await ensureAppRoot();
    let info=null;
    try{
      const metaRes=await graph(`/me/drive/special/approot:/${encodeURIComponent(BACKUP_FILE)}`);
      info=await metaRes.json();
    }catch(e){
      if(e.status===404)return {payload:null,eTag:null,info:null};
      throw e;
    }
    const res=await graph(`/me/drive/special/approot:/${encodeURIComponent(BACKUP_FILE)}:/content`);
    const payload=await res.json();
    return {payload,eTag:info?.eTag||null,info};
  }

  function normalizeRemoteState(payload){
    if(payload?.schema==='projekt-bau-cloud-backup' && payload?.state?.projects)return payload.state;
    if(payload?.projects)return payload;
    throw new Error('OneDrive yedek dosyasında geçerli Projekt Bau verisi bulunamadı.');
  }

  function mergeState(localState,remoteState,remotePayload={}){
    const localSync=readSync(), tomb={...(remotePayload?.tombstones||{}),...(localSync.tombstones||{})};
    // Keep the newest deletion timestamp when both devices know about a deletion.
    for(const [id,ts] of Object.entries(remotePayload?.tombstones||{})){
      if(isoMs(ts)>isoMs(tomb[id]))tomb[id]=ts;
    }
    const map=new Map();
    const add=(p,source)=>{
      const id=projectId(p) || (typeof pbFingerprintProject==='function'?pbFingerprintProject(p):JSON.stringify(p));
      const deletedAt=tomb[id];
      const changedAt=p?._syncUpdatedAt;
      if(deletedAt && isoMs(deletedAt)>=isoMs(changedAt))return;
      if(!map.has(id)){map.set(id,clone(p));return}
      const old=map.get(id), a=isoMs(old?._syncUpdatedAt), b=isoMs(p?._syncUpdatedAt);
      if(b>a)map.set(id,clone(p));
      else if(a===0&&b===0&&typeof pbMergeProjectData==='function')map.set(id,pbMergeProjectData(old,p));
    };
    for(const p of (localState?.projects||[]))add(p,'local');
    for(const p of (remoteState?.projects||[]))add(p,'remote');
    const customerMap=new Map();
    const addCustomer=customer=>{
      if(!customer||typeof customer!=='object')return;
      const id=String(customer.id||customer.number||`${customer.company||''}|${customer.email||''}|${customer.phone||''}`);if(!id)return;
      const old=customerMap.get(id);if(!old){customerMap.set(id,clone(customer));return}
      const a=isoMs(old.updatedAt||old.createdAt),b=isoMs(customer.updatedAt||customer.createdAt);
      customerMap.set(id,clone(b>=a?{...old,...customer}:{...customer,...old}));
    };
    (localState?.customers||[]).forEach(addCustomer);(remoteState?.customers||[]).forEach(addCustomer);
    const merged={...clone(remoteState||{}),...clone(localState||{}),projects:[...map.values()],customers:[...customerMap.values()]};
    merged.meta={...(remoteState?.meta||{}),...(localState?.meta||{})};
    writeSync({...localSync,tombstones:tomb,lastMergeAt:new Date().toISOString()});
    return merged;
  }

  async function syncNow({silent=true,reason='auto'}={}){
    if(syncRunning){syncAgain=true;return false}
    syncRunning=true;
    try{
      // Optimistic concurrency: never overwrite a cloud version that changed
      // after we downloaded it. On conflict, download + merge again and retry.
      for(let attempt=1;attempt<=4;attempt++){
        const remoteRead=await fetchBackupWithETag();
        const payload=remoteRead.payload;
        if(payload){
          const remote=normalizeRemoteState(payload);
          const before=JSON.stringify(S||{projects:[]});
          const merged=mergeState(S,remote,payload);
          if(JSON.stringify(merged)!==before){
            S=merged; A=null;
            if(window.PBStorage?.saveState) await window.PBStorage.saveState(S,{reason:'onedrive-sync'});
            else localStorage.setItem(K3,JSON.stringify(S));
            try{render()}catch(_){}
          }
        }
        const ok=await uploadBackup({silent,reason:`sync:${reason}`,expectedETag:remoteRead.eTag});
        if(ok){writeMeta({lastSyncAt:nowCH(),syncSafety:'etag'});return true}
        // uploadBackup returns false for all errors. Check whether cloud changed and
        // retry after a short delay; harmless network errors also get a bounded retry.
        if(attempt<4)await new Promise(r=>setTimeout(r,350*attempt));
      }
      if(!silent)setStatus('Synchronisierung fehlgeschlagen. Cloud-Datei wurde nicht überschrieben.','error');
      return false;
    }catch(e){
      console.error('OneDrive sync',e);
      if(!silent)setStatus(`Synchronisierung fehlgeschlagen: ${e.message}`,'error');
      return false;
    }finally{
      syncRunning=false;
      if(syncAgain){syncAgain=false;setTimeout(()=>syncNow({silent:true,reason:'queued'}),700)}
    }
  }

  async function restoreBackup(){
    try{
      setStatus('OneDrive-Yedek wird geladen…','working');
      const payload=await fetchBackup();
      const remote=normalizeRemoteState(payload);

      const remoteCount=remote.projects?.length||0;
      const localCount=S?.projects?.length||0;
      const ok=confirm(
        `OneDrive yedeği bulundu.\n\n`+
        `Lokal: ${localCount} Projekt(e)\n`+
        `OneDrive: ${remoteCount} Projekt(e)\n\n`+
        `Projeler silinmeden birleştirilecek. Devam edilsin mi?`
      );
      if(!ok){
        setStatus('Wiederherstellung abgebrochen.','neutral');
        return false;
      }

      // Safety snapshot before any cloud restore — stored in IndexedDB.
      try{
        if(window.PBStorage?.createSafetySnapshot){
          await window.PBStorage.createSafetySnapshot('before-onedrive-restore');
        }else{
          localStorage.setItem(
            `projekt-bau-before-onedrive-restore-${Date.now()}`,
            JSON.stringify(S)
          );
        }
      }catch(_){}

      const merged=mergeState(S,remote,payload);
      S=merged;
      A=null;
      if(window.PBStorage?.saveState) await window.PBStorage.saveState(S,{reason:'onedrive-restore'});
      else localStorage.setItem(K3,JSON.stringify(S));
      try{render()}catch(_){}
      try{window.ProjectBauPro?.save?.()}catch(_){}

      writeMeta({
        lastRestoreAt:nowCH(),
        remoteBackupAt:payload?.savedAt||null
      });
      let storageNote='';
      try{
        const st=await window.PBStorage?.stats?.();
        if(st)storageNote=` · IndexedDB`;
      }catch(_){}
      setStatus(`${S.projects.length} Projekt(e) lokal + OneDrive zusammengeführt${storageNote}.`,'ok');
      alert(`OneDrive geri yükleme tamamlandı.\nToplam ${S.projects.length} proje mevcut.`);
      return true;
    }catch(e){
      console.error('OneDrive restore',e);
      setStatus(`Wiederherstellung fehlgeschlagen: ${e.message}`,'error');
      alert(`OneDrive geri yükleme başarısız:\n${e.message}`);
      return false;
    }
  }

  async function refreshRemoteInfo(showError=true){
    try{
      const c=await getClient();
      const account=currentAccount(c);
      if(!account){
        setStatus('Noch nicht mit Microsoft verbunden.','neutral');
        return null;
      }
      await ensureAppRoot();
      const res=await graph(`/me/drive/special/approot:/${encodeURIComponent(BACKUP_FILE)}`);
      const info=await res.json();
      const modified=info.lastModifiedDateTime
        ? new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'short'}).format(new Date(info.lastModifiedDateTime))
        : '—';
      writeMeta({
        remoteInfo:`${info.name} · ${bytes(info.size)} · ${modified}`,
        remoteModified:info.lastModifiedDateTime||null
      });
      syncUi();
      setStatus(`Cloud-Datei gefunden · ${modified}`,'ok');
      return info;
    }catch(e){
      if(e.status===404){
        writeMeta({remoteInfo:'Noch keine Cloud-Sicherung'});
        syncUi();
        setStatus('Verbunden. Noch keine OneDrive-Sicherung vorhanden.','ok');
        return null;
      }
      if(showError)setStatus(`OneDrive-Status konnte nicht gelesen werden: ${e.message}`,'error');
      return null;
    }
  }

  function saveSettings(){
    const current=readConfig();
    const clientId=(el('odClientId')?.value||'').trim();
    const tenant=(el('odTenant')?.value||'common').trim()||'common';
    const redirectUri=(el('odRedirect')?.value||DEFAULT_REDIRECT).trim()||DEFAULT_REDIRECT;
    const autoSync=!!el('odAutoSync')?.checked;

    if(clientId && !/^[0-9a-fA-F-]{20,}$/.test(clientId)){
      alert('Application (Client) ID geçerli bir GUID gibi görünmüyor.');
      return false;
    }
    writeConfig({...current,clientId,tenant,redirectUri,autoSync});
    client=null;
    clientSignature='';
    setStatus('OneDrive-Einstellungen gespeichert.','ok');
    syncUi();
    return true;
  }

  function scheduleAutoSync(reason='auto'){
    const cfg=readConfig();
    if(!cfg.autoSync || !cfg.clientId)return;
    clearTimeout(autoTimer);
    autoTimer=setTimeout(()=>{
      syncNow({silent:true,reason});
    },5000);
  }

  function bind(){
    syncUi();

    el('odSaveSettings')?.addEventListener('click',saveSettings);
    el('odConnect')?.addEventListener('click',async()=>{
      if(!saveSettings())return;
      try{await connect()}catch(e){
        console.error(e);
        setStatus(`Microsoft-Anmeldung fehlgeschlagen: ${e.message}`,'error');
        alert(`Microsoft-Anmeldung fehlgeschlagen:\n${e.message}`);
      }
    });
    el('odDisconnect')?.addEventListener('click',disconnect);
    el('odBackupNow')?.addEventListener('click',()=>syncNow({silent:false,reason:'manual'}));
    el('odRestore')?.addEventListener('click',restoreBackup);
    el('odRefresh')?.addEventListener('click',()=>refreshRemoteInfo(true));
    el('odAutoSync')?.addEventListener('change',saveSettings);

    // Detect already cached MSAL account without prompting.
    setTimeout(async()=>{
      try{
        const cfg=readConfig();
        if(!cfg.clientId)return;
        const c=await getClient();
        const account=currentAccount(c);
        if(account){
          writeMeta({homeAccountId:account.homeAccountId,account:account.username||account.name});
          syncUi();
          setStatus(`Microsoft-Konto erkannt: ${account.username||account.name}`,'ok');
          await refreshRemoteInfo(false);
          if(cfg.autoSync)await syncNow({silent:true,reason:'startup'});
        }
      }catch(_){}
    },700);
  }

  function startPolling(){
    clearInterval(pollTimer);
    pollTimer=setInterval(()=>{if(readConfig().autoSync&&document.visibilityState==='visible')syncNow({silent:true,reason:'poll'})},60000);
  }
  window.addEventListener('focus',()=>{if(readConfig().autoSync)syncNow({silent:true,reason:'focus'})});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&readConfig().autoSync)syncNow({silent:true,reason:'visible'})});
  startPolling();

  window.ProjectBauOneDrive={
    connect,disconnect,uploadBackup,restoreBackup,refreshRemoteInfo,syncNow,
    scheduleAutoSync,saveSettings,readConfig,recordProjectDeletion,deviceId
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
