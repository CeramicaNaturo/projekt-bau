
const K3='projekt-bau-v03',K2='projekt-bau-v02';

function pbValidState(v){
  return !!v && typeof v==='object' && Array.isArray(v.projects);
}

function pbLooksLikeProject(p){
  if(!p || typeof p!=='object' || Array.isArray(p))return false;
  const hasMeta=['name','address','customer','startDate','owner','description'].some(k=>typeof p[k]==='string'&&p[k].trim());
  const hasProjectArrays=['areas','floorplans','photos','tileMaterials','rooms','bereiche'].some(k=>Array.isArray(p[k]));
  return !!(hasMeta && hasProjectArrays);
}

function pbNormaliseState(value){
  if(pbValidState(value))return value;
  if(Array.isArray(value)){
    const projects=value.filter(pbLooksLikeProject);
    if(projects.length)return {projects};
  }
  if(pbLooksLikeProject(value))return {projects:[value]};
  return null;
}

function pbReadStorageStateFrom(storage,key){
  try{
    const raw=storage.getItem(key);
    if(!raw)return null;
    return pbNormaliseState(JSON.parse(raw));
  }catch(_){return null}
}

function pbFingerprintProject(p){
  const id=String(p?.id||p?.projectId||p?.uuid||'').trim();
  if(id)return `id:${id}`;
  const name=String(p?.name||p?.projectName||p?.title||'').trim().toLowerCase();
  const address=String(p?.address||p?.adresse||'').trim().toLowerCase();
  const customer=String(p?.customer||p?.kunde||'').trim().toLowerCase();
  return `meta:${name}|${address}|${customer}`;
}

function pbRichness(p){
  let score=0;
  for(const key of ['areas','floorplans','photos','tileMaterials','rooms','bereiche','objects','walls']){
    score+=(Array.isArray(p?.[key])?p[key].length:0)*1000;
  }
  try{score+=JSON.stringify(p||{}).length}catch(_){}
  return score;
}

function pbMergeProjectData(base,incoming){
  if(!base)return JSON.parse(JSON.stringify(incoming));
  if(!incoming)return base;
  const richer=pbRichness(incoming)>pbRichness(base)?incoming:base;
  const other=richer===incoming?base:incoming;
  const out=JSON.parse(JSON.stringify(richer));
  for(const [target,aliases] of Object.entries({
    name:['name','projectName','title'],address:['address','adresse'],customer:['customer','kunde'],
    phone:['phone','telefon'],startDate:['startDate','datum'],owner:['owner','verantwortlich'],description:['description','beschreibung']
  })){
    if(out[target]===undefined||out[target]===null||out[target]===''){
      for(const k of aliases){if(other[k]!==undefined&&other[k]!==null&&other[k]!==''){out[target]=other[k];break}}
    }
  }
  for(const key of ['areas','floorplans','photos','tileMaterials','rooms','bereiche']){
    const arr=[],seen=new Set();
    for(const item of [...(Array.isArray(base[key])?base[key]:[]),...(Array.isArray(incoming[key])?incoming[key]:[])]){
      let sig; try{sig=String(item?.id||item?.name||item?.title||JSON.stringify(item))}catch(_){sig=String(Math.random())}
      if(seen.has(sig))continue; seen.add(sig); arr.push(JSON.parse(JSON.stringify(item)));
    }
    if(arr.length)out[key]=arr;
  }
  if(!Array.isArray(out.areas) && Array.isArray(out.bereiche))out.areas=out.bereiche;
  if(!Array.isArray(out.areas) && Array.isArray(out.rooms))out.areas=out.rooms;
  if(!Array.isArray(out.areas))out.areas=[];
  return out;
}

function pbExtractStatesDeep(root,label,maxDepth=7){
  const out=[],seen=new Set();
  function walk(v,path,depth){
    if(v===null||v===undefined||depth>maxDepth)return;
    if(typeof v!=='object')return;
    if(seen.has(v))return; seen.add(v);
    const direct=pbNormaliseState(v);
    if(direct?.projects?.length)out.push({label:path,data:direct,projects:direct.projects.length});
    if(Array.isArray(v)){
      v.slice(0,1000).forEach((x,i)=>walk(x,`${path}[${i}]`,depth+1));
    }else{
      Object.entries(v).slice(0,1000).forEach(([k,x])=>walk(x,`${path}.${k}`,depth+1));
    }
  }
  walk(root,label,0); return out;
}

function pbScanAllStates(){
  const found=[],dedupe=new Set();
  const storages=[{name:'localStorage',storage:localStorage},{name:'sessionStorage',storage:sessionStorage}];
  for(const holder of storages){
    try{
      for(let i=0;i<holder.storage.length;i++){
        const key=holder.storage.key(i); if(!key)continue;
        const raw=holder.storage.getItem(key); if(!raw)continue;
        let obj; try{obj=JSON.parse(raw)}catch(_){continue}
        const candidates=pbExtractStatesDeep(obj,`${holder.name}:${key}`);
        for(const c of candidates){
          let sig; try{sig=holder.name+'|'+key+'|'+JSON.stringify(c.data.projects.map(pbFingerprintProject))}catch(_){sig=holder.name+'|'+key+'|'+c.label}
          if(dedupe.has(sig))continue; dedupe.add(sig);
          found.push({storage:holder.name,key,path:c.label,data:c.data,projects:c.projects});
        }
      }
    }catch(_){ }
  }
  return found;
}

function pbMergedRecoveryState(){
  const states=pbScanAllStates(),map=new Map();
  for(const state of states){
    for(const p0 of state.data.projects){
      const p=pbMergeProjectData(null,p0),sig=pbFingerprintProject(p);
      if(!map.has(sig))map.set(sig,p); else map.set(sig,pbMergeProjectData(map.get(sig),p));
    }
  }
  return {projects:[...map.values()],recovery:{recoveredAt:new Date().toISOString(),sources:states.map(x=>x.path||`${x.storage}:${x.key}`),sourceCount:states.length}};
}

function loadState(){
  try{
    const indexed=window.PBStorage?.getStateSync?.();
    if(pbValidState(indexed))return indexed;
  }catch(_){}

  // Emergency fallback only. Normal v2.9.1 operation never scans all legacy copies.
  const direct=pbReadStorageStateFrom(localStorage,K3);
  if(direct?.projects?.length)return direct;
  return {projects:[]};
}

function pbMigrationId(){return crypto.randomUUID?crypto.randomUUID():`pb-${Date.now()}-${Math.random().toString(36).slice(2)}`}
function pbMigrateProject2946(p){
  if(!p||typeof p!=='object')return false;
  let changed=false;
  const set=(key,value)=>{if(p[key]===undefined||p[key]===null){p[key]=value;changed=true}};
  set('id',pbMigrationId());set('name','Projekt ohne Namen');set('address','');set('customer','');set('phone','');set('owner','');set('description','');
  if(!Array.isArray(p.areas)){p.areas=Array.isArray(p.bereiche)?p.bereiche:Array.isArray(p.rooms)?p.rooms:[];changed=true}
  if(!Array.isArray(p.floorplans)){p.floorplans=[];changed=true}if(!Array.isArray(p.tileMaterials)){p.tileMaterials=[];changed=true}
  p.areas.forEach(a=>{
    if(!a.id){a.id=pbMigrationId();changed=true}if(!Array.isArray(a.tasks)){a.tasks=[];changed=true}
    if(!Array.isArray(a.materials)){a.materials=[];changed=true}if(!Array.isArray(a.photos)){a.photos=[];changed=true}
    if(!a.status){a.status='Offen';changed=true}if(!a.priority){a.priority='Normal';changed=true}
  });
  p.floorplans.forEach(fp=>{if(!fp.id){fp.id=pbMigrationId();changed=true}if(!Array.isArray(fp.objects)){fp.objects=[];changed=true}});
  if(!p.tileSettings||typeof p.tileSettings!=='object'){p.tileSettings={layoutPattern:'',jointWidth:'',jointColor:'',siliconeColor:'',wastePercent:10};changed=true}
  if(!Number.isFinite(Number(p.tileSettings.wastePercent))){p.tileSettings.wastePercent=10;changed=true}

  const allText=[p.name,p.description,p.projectInformation,...p.areas.map(a=>a.name),...p.areas.flatMap(a=>(a.tasks||[]).map(t=>t.text))].join(' ').toLowerCase();
  const objects=p.floorplans.flatMap(fp=>fp.objects||[]),types=new Set(objects.map(o=>o?.type));
  const hasFloor=p.floorplans.some(fp=>Number(fp.floorAreaM2)>0),hasWallTiles=objects.some(o=>o?.type==='wall'&&Array.isArray(o.tileAreas)&&o.tileAreas.length);
  const hasAbdichtung=p.floorplans.some(fp=>fp.abdichtung?.lastAnalysis||fp.abdichtung?.materialList?.length);
  const hasSanitary=objects.some(o=>['wc','shower','walkInShower','bathtub','sink','kitchenSink','drain'].includes(o?.type));
  const hasGlass=types.has('glass');
  const taskText=p.areas.flatMap(a=>(a.tasks||[]).map(t=>String(t.text||''))).join(' ').toLowerCase();
  const statuses=p.areas.map(a=>String(a.status||'').toLowerCase()),photos=p.areas.flatMap(a=>a.photos||[]);
  let inferredPhase='anfrage';
  if(p.floorplans.length||hasFloor)inferredPhase='aufmass';
  if(p.tileMaterials.length)inferredPhase='offerte';
  if(statuses.some(s=>s.includes('arbeit')))inferredPhase='ausfuehrung';
  if(statuses.length&&statuses.every(s=>s.includes('abgeschlossen')))inferredPhase='abnahme';
  if(photos.some(ph=>String(ph.kind||'').toLowerCase()==='nachher')&&statuses.every(s=>s.includes('abgeschlossen')))inferredPhase='abnahme';
  const objectType=/\bwc\b|toilet/.test(allText)?'WC-Umbau':/küche|kueche/.test(allText)?'Küche':/dusche/.test(allText)&&!/bad/.test(allText)?'Dusche':/bad|badezimmer|wanne/.test(allText)?'Badumbau':'Badumbau';
  const old=p.plattenleger&&typeof p.plattenleger==='object'?p.plattenleger:{};
  p.plattenleger={...old,
    phase:old.phase||inferredPhase,objectType:old.objectType||objectType,constructionStart:old.constructionStart||p.startDate||'',
    acceptanceDate:old.acceptanceDate||'',siteNote:old.siteNote||'',scope:{
      demontage:/demont|abbruch|entsorg/.test(taskText),untergrund:/untergrund|ausgleich|grundier|spachtel/.test(taskText),
      abdichtung:hasAbdichtung||/abdicht/.test(taskText),bodenplatten:hasFloor,wandplatten:hasWallTiles,
      silikon:/silikon/.test(taskText),sanitaer:hasSanitary,duschglas:hasGlass,...(old.scope||{})
    },migrationVersion:294601,migratedAt:old.migratedAt||new Date().toISOString()
  };
  if(old.migrationVersion!==294601){p.plattenleger.migrationVersion=294601;p.plattenleger.migratedAt=new Date().toISOString();changed=true}
  return changed;
}
function pbMigrateAllProjects2946(state){
  let count=0;(state?.projects||[]).forEach(p=>{if(pbMigrateProject2946(p))count++});return count;
}
function pbPersistMigration2946(state,count){
  if(!count)return;
  try{localStorage.setItem(K3,JSON.stringify(state))}catch(_){}
  try{window.PBStorage?.saveState?.(state,{reason:'plattenleger-migration-294601'})}catch(_){}
}
let S=loadState(),A=null;
pbPersistMigration2946(S,pbMigrateAllProjects2946(S));
const $=x=>document.getElementById(x),u=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(36);

function save(){
  try{
    // v2.9.1: mark the active project for deterministic multi-device cloud sync.
    try{
      const active=S?.projects?.find?.(p=>p.id===A);
      if(active){ active._syncUpdatedAt=new Date().toISOString(); active._syncDevice=window.ProjectBauOneDrive?.deviceId?.()||'local'; }
    }catch(_){}
    let stored=null;
    try{
      const raw=localStorage.getItem(K3);
      const parsed=raw?JSON.parse(raw):null;
      stored=pbValidState(parsed)?parsed:null;
    }catch(_){}

    // Never overwrite recovered projects with an accidental blank startup state.
    if((S?.projects?.length||0)===0 && (stored?.projects?.length||0)>0){
      S=stored;
    }else{
      try{
        const objs=(typeof fpObjects!=='undefined'&&Array.isArray(fpObjects))?fpObjects:[];
        objs.forEach(fpV192EnsureDoorDefaults);
      }catch(_){}
      localStorage.setItem(K3,JSON.stringify(S));
      try{window.PBStorage?.saveState?.(S,{reason:'project-save'})}catch(_){}
    }
  }catch(e){
    console.error('Projekt Bau Speichern',e);
  }
  render();
  try{window.ProjectBauOneDrive?.scheduleAutoSync?.('project-save')}catch(_){}
}
function cur(){return S.projects.find(p=>p.id===A)}
function formatCHF(value){
  const n=Number(value); if(!Number.isFinite(n)) return '-';
  const p=n.toFixed(2).split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,'’');
  return `CHF ${p[0]}.${p[1]}`;
}
function formatCHNumber(value,decimals=2){
  const n=Number(value); if(!Number.isFinite(n)) return '-';
  const p=n.toFixed(decimals).split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,'’');
  return p.join('.');
}

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmtDate(s){
  if(!s)return '-';
  const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

$('create').onclick=()=>{
  if(!$('name').value.trim())return alert('Projektname ist erforderlich.');
  S.projects.unshift({id:u(),name:$('name').value.trim(),address:$('address').value.trim(),customer:$('customer').value.trim(),phone:$('phone').value.trim(),startDate:$('startDate').value,owner:$('owner').value.trim(),description:$('description').value.trim(),areas:[]});
  A=S.projects[0].id;['name','address','customer','phone','startDate','owner','description'].forEach(x=>$(x).value='');save()
};
function pbSaveProjectDetails(){
  const p=cur();
  if(!p){alert('Kein Projekt geöffnet.');return false;}
  const name=$('editProjectName')?.value?.trim()||'';
  if(!name){alert('Projektname ist erforderlich.');$('editProjectName')?.focus();return false;}
  p.name=name;
  p.address=$('editProjectAddress')?.value?.trim()||'';
  p.customer=$('editProjectCustomer')?.value?.trim()||'';
  p.phone=$('editProjectPhone')?.value?.trim()||'';
  p.startDate=$('editProjectStartDate')?.value||'';
  p.owner=$('editProjectOwner')?.value?.trim()||'';
  p.description=$('editProjectDescription')?.value?.trim()||'';
  p.updatedAt=new Date().toISOString();
  save();
  pbActionToast('Projektdetails gespeichert.');
  return true;
}
function pbAddArea(){
  const p=cur();
  if(!p){alert('Kein Projekt geöffnet.');return false;}
  const n=$('areaName')?.value?.trim()||'';
  if(!n){alert('Bitte zuerst einen Bereichsnamen eingeben.');$('areaName')?.focus();return false;}
  p.areas=p.areas||[];
  p.areas.push({id:u(),name:n,priority:$('priority')?.value||'Normal',worker:'',status:'Offen',tasks:[],materials:[],photos:[]});
  $('areaName').value='';
  p.updatedAt=new Date().toISOString();
  save();
  pbActionToast('Bereich hinzugefügt.');
  return true;
}
function pbDeleteProject(){
  const p=cur();
  if(!p){alert('Kein Projekt geöffnet.');return false;}
  if(!confirm(`Projekt „${p.name||''}“ wirklich löschen?`))return false;
  try{window.ProjectBauOneDrive?.recordProjectDeletion?.(p.id)}catch(_){}
  S.projects=S.projects.filter(x=>x.id!==p.id);A=null;save();
  pbActionToast('Projekt gelöscht.');
  return true;
}
function pbActionToast(message){
  let n=document.getElementById('pbActionToast');
  if(!n){n=document.createElement('div');n.id='pbActionToast';n.className='pb-action-toast';document.body.appendChild(n)}
  n.textContent=message;n.classList.add('show');clearTimeout(pbActionToast._t);pbActionToast._t=setTimeout(()=>n.classList.remove('show'),1800);
}
function pbBindTap(el,handler){
  if(!el)return;
  el.type='button';
  let last=0;
  const run=e=>{
    const now=Date.now(); if(now-last<450)return; last=now;
    e?.preventDefault?.();e?.stopPropagation?.();handler(e);
  };
  el.onclick=run;
  el.addEventListener('pointerup',e=>{if(e.pointerType==='touch'||e.pointerType==='pen')run(e)},{passive:false});
}

function pbSaveProjectInformation(){
  const p=cur();
  if(!p){alert('Kein Projekt geöffnet.');return false;}
  p.projectInformation=$('projectInformationText')?.value||'';
  p.updatedAt=new Date().toISOString();
  save();
  const st=$('projectInformationStatus');
  if(st)st.textContent='Gespeichert: '+new Date().toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit'});
  pbActionToast('Projektinformationen gespeichert.');
  return true;
}
pbBindTap($('saveProjectDetails'),pbSaveProjectDetails);
pbBindTap($('saveProjectInformation'),pbSaveProjectInformation);
pbBindTap($('savePlattenlegerCockpit'),savePlattenlegerCockpit);
pbBindTap($('addArea'),pbAddArea);
pbBindTap($('deleteProject'),pbDeleteProject);
$('workerView').onclick=()=>document.body.classList.toggle('worker-mode');
$('backup').onclick=()=>{let a=document.createElement('a'),b=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});a.href=URL.createObjectURL(b);a.download='ProjektBau_Yedek.json';a.click()};
$('restore').onchange=async e=>{try{let d=JSON.parse(await e.target.files[0].text());if(!Array.isArray(d.projects))throw 0;S=d;A=null;save()}catch{alert('Ungültige Sicherungsdatei.')}};
pbBindTap($('printReport'),()=>generateDirectPDFReport());

function render(){
  pbPersistMigration2946(S,pbMigrateAllProjects2946(S));
  let b=$('projects');b.innerHTML=S.projects.length?'':'Noch keine Projekte vorhanden.';
  S.projects.forEach(p=>{
    const pl=ensurePlattenlegerProject(p),phaseLabel=PL_PHASES.find(x=>x[0]===pl.phase)?.[1]||'Anfrage';
    const d=document.createElement('div');
    d.className='project';
    d.dataset.projectId=p.id;
    d.setAttribute('role','button');
    d.setAttribute('tabindex','0');
    d.innerHTML=`<div><b>${esc(p.name)}</b><div class=muted>${esc(p.address||'Keine Adresse')} · ${p.areas.length} Bereiche · ${esc(phaseLabel)} · ${esc(pl.objectType||'Badumbau')}</div></div><button type="button" class="secondary project-open">Öffnen</button>`;

    let touchStartX=0, touchStartY=0, touchMoved=false, touchOpenedAt=0;

    const openProject=()=>{
      A=p.id;
      renderP(); // proje listesini tekrar render etme; tablette dokunma event zincirini bozmasın
      requestAnimationFrame(()=>{
        const panel=$('panel');
        if(panel){
          try{ panel.scrollIntoView({block:'start',behavior:'smooth'}); }catch(_){}
        }
      });
    };

    // Normal click: mouse + Samsung/Android'ın dokunmadan ürettiği click.
    d.addEventListener('click',ev=>{
      if(Date.now()-touchOpenedAt < 700) return; // touchend sonrası ghost click
      ev.preventDefault();
      ev.stopPropagation();
      openProject();
    });

    // Tablet fallback: PointerEvent davranışından bağımsız gerçek touch olayları.
    d.addEventListener('touchstart',ev=>{
      if(!ev.touches || ev.touches.length!==1) return;
      touchStartX=ev.touches[0].clientX;
      touchStartY=ev.touches[0].clientY;
      touchMoved=false;
    },{passive:true});

    d.addEventListener('touchmove',ev=>{
      if(!ev.touches || ev.touches.length!==1) return;
      const dx=ev.touches[0].clientX-touchStartX;
      const dy=ev.touches[0].clientY-touchStartY;
      if(Math.hypot(dx,dy)>12) touchMoved=true;
    },{passive:true});

    d.addEventListener('touchend',ev=>{
      if(touchMoved) return; // kaydırma proje açmasın
      touchOpenedAt=Date.now();
      ev.preventDefault();
      ev.stopPropagation();
      openProject();
    },{passive:false});

    d.addEventListener('keydown',ev=>{
      if(ev.key==='Enter' || ev.key===' '){
        ev.preventDefault();
        openProject();
      }
    });

    b.appendChild(d);
  });
  renderP()
}

const PL_PHASES=[
  ['anfrage','Anfrage'],['aufmass','Aufmass'],['offerte','Offerte'],['vorbereitung','AVOR'],
  ['ausfuehrung','Ausführung'],['abnahme','Abnahme'],['abgeschlossen','Abgeschlossen']
];

const PL_PHASE_CONTENT={
  anfrage:{title:'Kundenanfrage',desc:'Erstkontakt, Kundenwunsch und Besichtigung erfassen.',fields:[
    ['requestDate','Eingangsdatum','date'],['source','Anfrage über','select',['Telefon','E-Mail','Empfehlung','Website','Hornbach','Sonstiges']],['contact','Kontaktperson','text'],
    ['visitDate','Besichtigungstermin','datetime-local'],['budget','Budget / Kostenvorstellung (CHF)','number'],['requestNotes','Kundenwunsch / Ausgangslage','textarea','wide']
  ],checks:[['contactConfirmed','Kontaktdaten bestätigt'],['visitConfirmed','Besichtigung vereinbart'],['plansReceived','Pläne/Unterlagen erhalten']]},
  aufmass:{title:'Aufmass',desc:'Raumzustand, Masse, Anschlüsse und offene Punkte dokumentieren.',fields:[
    ['measureDate','Aufmassdatum','date'],['measurer','Aufgenommen durch','text'],['roomCount','Anzahl Räume','number'],
    ['substrate','Untergrund / Bestand','select',['Zementestrich','Anhydrit','Beton','Gips','Mauerwerk','Holz','Unbekannt']],['moisture','Feuchteprüfung / Wert','text'],['measureNotes','Aufmassnotizen / offene Masse','textarea','wide']
  ],checks:[['floorplanReady','Grundriss erstellt'],['wallViewsReady','Wandansichten kontrolliert'],['photosReady','Bestandsfotos vorhanden'],['connectionsChecked','Sanitäranschlüsse geprüft'],['substrateChecked','Untergrund geprüft']]},
  offerte:{title:'Offerte',desc:'Angebotsdaten, Kalkulation, Gültigkeit und Versandstatus.',fields:[
    ['offerNo','Offertennummer','text'],['offerDate','Offertendatum','date'],['validUntil','Gültig bis','date'],
    ['netAmount','Nettobetrag (CHF)','number'],['vat','MWST','select',['8.1 %','0 %','inklusive']],['offerStatus','Status','select',['Entwurf','Kalkuliert','Gesendet','Nachverhandlung','Angenommen','Abgelehnt']],['offerNotes','Kalkulations-/Kundenhinweis','textarea','wide']
  ],checks:[['scopeComplete','Leistungsumfang vollständig'],['materialCalculated','Material kalkuliert'],['laborCalculated','Arbeitszeit kalkuliert'],['offerPdf','Offerte/PDF erstellt'],['offerSent','Offerte versendet']]},
  vorbereitung:{title:'AVOR · Arbeitsvorbereitung',desc:'Personal, Material, Lieferungen und Baustellenstart koordinieren.',fields:[
    ['siteManager','Bauleiter / Verantwortlich','text'],['team','Mitarbeiter / Team','text'],['supplier','Lieferant','text'],
    ['deliveryDate','Materiallieferung','date'],['startMeeting','Startbesprechung','datetime-local'],['schedule','Termin- und Arbeitsablauf','textarea','wide'],['avorNotes','Besonderheiten / Fremdgewerke','textarea','wide']
  ],checks:[['orderPlaced','Material bestellt'],['deliveryConfirmed','Liefertermin bestätigt'],['accessReady','Zugang/Schlüssel geklärt'],['subcontractorsReady','Fremdgewerke koordiniert'],['drawingsReleased','Pläne/Verlegeplan freigegeben']]},
  ausfuehrung:{title:'Ausführung',desc:'Baufortschritt, Stunden, Zusatzarbeiten und Hindernisse führen.',fields:[
    ['executionStart','Effektiver Baustart','date'],['progress','Fortschritt (%)','number'],['hours','Arbeitsstunden','number'],
    ['dailyLog','Bautagesbericht / ausgeführte Arbeiten','textarea','wide'],['extras','Regie / Nachträge','textarea','double'],['obstacles','Behinderungen / offene Entscheide','textarea']
  ],checks:[['demolitionDone','Demontage abgeschlossen'],['substrateDone','Untergrund vorbereitet'],['sealingDone','Abdichtung dokumentiert'],['tilesDone','Platten verlegt'],['groutDone','Verfugt'],['siliconeDone','Silikonfugen ausgeführt'],['sanitaryDone','Sanitärmontage abgeschlossen']]},
  abnahme:{title:'Abnahme',desc:'Abnahmeprotokoll, Mängel und Kundenfreigabe dokumentieren.',fields:[
    ['acceptanceDate','Abnahmedatum','date'],['acceptanceCustomer','Kunde / Vertreter','text'],['protocolNo','Protokollnummer','text'],
    ['defects','Mängel / Restarbeiten','textarea','wide'],['followUp','Nachbesserungstermin','date'],['signatureStatus','Unterschrift','select',['Offen','Digital unterschrieben','Papier unterschrieben','Nicht erforderlich']]
  ],checks:[['cleaned','Baustelle gereinigt'],['documentsHanded','Pflege-/Produktunterlagen übergeben'],['keysReturned','Schlüssel übergeben'],['photosFinal','Nachher-Fotos vollständig'],['accepted','Abnahme erfolgt']]},
  abgeschlossen:{title:'Projektabschluss',desc:'Schlussrechnung, Zahlung, Garantieunterlagen und Archivierung.',fields:[
    ['invoiceNo','Rechnungsnummer','text'],['invoiceDate','Rechnungsdatum','date'],['invoiceAmount','Bruttobetrag (CHF)','number'],
    ['paymentStatus','Zahlungsstatus','select',['Offen','Teilbezahlt','Bezahlt','Mahnung']],['paidDate','Bezahlt am','date'],['archiveNotes','Abschluss-/Garantienotiz','textarea','wide']
  ],checks:[['finalInvoice','Schlussrechnung erstellt'],['paymentComplete','Zahlung vollständig'],['finalPhotos','Fotodokumentation abgeschlossen'],['warrantyDocs','Garantieunterlagen abgelegt'],['cloudBackup','OneDrive-Sicherung geprüft'],['archived','Projekt archiviert']]}
};

const AUFMASS_REPEAT={
  walls:{title:'Wände / Bauteile',add:'+ Wand hinzufügen',cols:[['name','Wand A'],['width','Breite cm','number'],['height','Höhe cm','number'],['thickness','Stärke cm','number'],['angle','Winkel °','number'],['note','Nische / Vorsprung / Notiz']]},
  connections:{title:'Sanitäranschlüsse',add:'+ Anschluss hinzufügen',cols:[['type','WC / Lavabo / Dusche'],['wall','Wand A/B…'],['fromLeft','Abstand links cm','number'],['height','Höhe cm','number'],['diameter','Ø mm','number'],['action','Bleibt / Versetzen / Neu'],['note','Notiz']]},
  materials:{title:'Vorgesehene Materialien',add:'+ Material hinzufügen',cols:[['group','Fliesen / Abdichtung…'],['material','Material / Produkt'],['article','Artikel / System'],['qty','Menge','number'],['unit','m² / m / St.'],['supplier','Lieferant'],['note','Notiz']]},
  works:{title:'Auszuführende Arbeiten',add:'+ Arbeit hinzufügen',cols:[['work','Arbeitsposition'],['qty','Menge','number'],['unit','m² / m / St. / Std.'],['hours','Stunden','number'],['responsible','Firma / Mitarbeiter'],['offer','Offerte: Ja/Nein']]},
  trades:{title:'Fremdgewerke',add:'+ Fremdgewerk hinzufügen',cols:[['trade','Sanitär / Elektro…'],['company','Firma'],['contact','Kontakt / Telefon'],['date','Termin','date'],['responsibility','Leistungsumfang']]},
  decisions:{title:'Offene Entscheide',add:'+ offenen Punkt hinzufügen',cols:[['topic','Entscheid / offene Frage'],['responsible','Verantwortlich'],['due','Termin','date'],['status','Offen / Erledigt']]}
};

function aufmassField(key,label,type='text',options=null,cls=''){
  if(type==='textarea')return `<label class="${cls}">${esc(label)}<textarea rows="3" data-pl-phase-field="${key}"></textarea></label>`;
  if(type==='select')return `<label class="${cls}">${esc(label)}<select data-pl-phase-field="${key}">${options.map(o=>`<option>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label class="${cls}">${esc(label)}<input type="${type}" data-pl-phase-field="${key}"${type==='number'?' step="0.01"':''}></label>`;
}
function aufmassChecks(items){return `<div class="aufmass-check-grid">${items.map(([k,l])=>`<label><input type="checkbox" data-pl-phase-check="${k}"> ${esc(l)}</label>`).join('')}</div>`}
function aufmassSection(title,help,body,open=false){return `<details class="aufmass-section" ${open?'open':''}><summary><span>${esc(title)}</span><span>${esc(help)}</span></summary><div class="aufmass-section-body">${body}</div></details>`}
function aufmassRepeat(name,data){
  const cfg=AUFMASS_REPEAT[name],rows=Array.isArray(data[name])?data[name]:[];
  return `<div class="aufmass-repeat"><div class="aufmass-repeat-head"><strong>${esc(cfg.title)}</strong><button type="button" data-aufmass-add="${name}">${esc(cfg.add)}</button></div><div data-aufmass-list="${name}">`+
    rows.map((row,index)=>`<div class="aufmass-repeat-row" data-aufmass-array="${name}" style="--cols:${cfg.cols.length}">${cfg.cols.map(([key,placeholder,type='text'])=>`<input data-array-field="${key}" type="${type}" value="${esc(row[key]??'')}" placeholder="${esc(placeholder)}"${type==='number'?' step="0.01"':''}>`).join('')}<button type="button" data-aufmass-delete="${name}" data-index="${index}">×</button></div>`).join('')+'</div></div>';
}
const PB_MEASURE_UNITS=['m²','m1','Stk.','pauschal','GL','Std.','kg','l'];
function pbMeasureNumber(v){return Number(String(v??'').trim().replace(',','.'))||0}
function pbMeasureFormula(v){
  const clean=String(v??'').trim().replace(/,/g,'.').replace(/[x×]/gi,'*');
  if(!clean)return 0;if(!/^[0-9+\-*/().\s]+$/.test(clean))return pbMeasureNumber(clean);
  try{return Number(Function(`"use strict";return (${clean})`)())||0}catch(_){return pbMeasureNumber(clean)}
}
function pbDefaultMeasureGroups(){return [
  {title:'Allgemeinarbeiten',notes:'',rows:[['Baustelleneinrichtung','1','1','','GL'],['Schützen von bestehenden Bauteilen','1','1','','GL'],['Lieferung','1','1','','Stk.'],['Entsorgung & Recycling','1','1','','Stk.']].map(x=>({item:x[0],factor:x[1],formula:x[2],note:x[3],unit:x[4]}))},
  {title:'Bad / Raum 1',notes:'',rows:[]}
]}
function pbMeasureSummary(groups){
  const map=new Map();(groups||[]).forEach(g=>(g.rows||[]).forEach(r=>{const key=`${r.item||'Position'}|||${r.unit||''}`,sum=pbMeasureNumber(r.factor||1)*pbMeasureFormula(r.formula);map.set(key,(map.get(key)||0)+sum)}));return map;
}
function pbRenderMeasureGroups(data){
  const groups=Array.isArray(data.measureGroups)&&data.measureGroups.length?data.measureGroups:pbDefaultMeasureGroups(),summary=pbMeasureSummary(groups);
  data.measureGroups=groups;
  const groupHtml=groups.map((g,gi)=>{const subtotal=pbMeasureSummary([g]);return `<section class="pb-measure-group" data-measure-group="${gi}"><div class="pb-measure-group-title"><input data-group-title value="${esc(g.title||'Raum')}" aria-label="Bereichsname"><span><button type="button" data-measure-row-add="${gi}">+ Position</button><button type="button" class="danger" data-measure-group-delete="${gi}">×</button></span></div><div class="pb-measure-table-head"><span>Gegenstand</span><span>Faktor</span><span>Formel</span><span>Anmerkung</span><span>Summe</span><span>Einheit</span><span></span></div><div class="pb-measure-rows">${(g.rows||[]).map((r,ri)=>{const total=pbMeasureNumber(r.factor||1)*pbMeasureFormula(r.formula);return `<div class="pb-measure-row" data-measure-row="${ri}"><input data-mr="item" value="${esc(r.item||'')}" placeholder="Gegenstand"><input data-mr="factor" value="${esc(r.factor??'1')}" inputmode="decimal"><input data-mr="formula" value="${esc(r.formula||'')}" placeholder="z. B. 2,40 × 1,20"><input data-mr="note" value="${esc(r.note||'')}" placeholder="Anmerkung"><output>${formatCHNumber(total,3)}</output><select data-mr="unit">${PB_MEASURE_UNITS.map(u=>`<option ${u===(r.unit||'m²')?'selected':''}>${u}</option>`).join('')}</select><button type="button" class="danger" data-measure-row-delete="${gi}:${ri}">×</button></div>`}).join('')}</div><textarea data-group-notes rows="2" placeholder="Notizen zum Bereich">${esc(g.notes||'')}</textarea><div class="pb-measure-subtotal"><strong>Zwischensumme</strong>${[...subtotal].map(([k,v])=>`<span>${esc(k.split('|||')[0])} <b>${formatCHNumber(v,2)} ${esc(k.split('|||')[1])}</b></span>`).join('')}</div></section>`}).join('');
  return `<div class="pb-measure-document"><div class="pb-flow-actions"><span>Aufmass bearbeiten und anschliessend direkt als Offerte übernehmen.</span><button type="button" class="primary" data-open-offer>Offerte Taslagı erstellen →</button></div><div class="pb-measure-meta"><label>Aufmass-Nr.<input data-pl-phase-field="measureNo" value="${esc(data.measureNo||'')}" placeholder="M-2026-001"></label><label>Bezeichnung<input data-pl-phase-field="measureTitle" value="${esc(data.measureTitle||'Sanierung Nasszellen')}"></label><label>Aufmassdatum<input type="date" data-pl-phase-field="measureDate" value="${esc(data.measureDate||'')}"></label><label>Bearbeiter<input data-pl-phase-field="measurer" value="${esc(data.measurer||'')}"></label><label class="wide">Anmerkung<textarea rows="2" data-pl-phase-field="generalNotes">${esc(data.generalNotes||'')}</textarea></label></div>${groupHtml}<button type="button" class="primary pb-add-room" data-measure-group-add>+ Neuer Raum / Bereich</button><section class="pb-measure-total"><h3>Summe</h3>${[...summary].map(([k,v])=>`<div><span>${esc(k.split('|||')[0])}</span><strong>${formatCHNumber(v,2)} ${esc(k.split('|||')[1])}</strong></div>`).join('')||'<p>Noch keine Positionen vorhanden.</p>'}</section></div>`;
}

function pbOfferDraft(c){
  c.phaseData=c.phaseData||{};const data=c.phaseData.offerte=c.phaseData.offerte||{};
  if(!Array.isArray(data.sections)){
    const source=c.phaseData.aufmass?.measureGroups||[];
    data.sections=source.map(g=>({title:g.title||'Leistungen',rows:(g.rows||[]).map(r=>({title:r.item||'',description:r.note||'',qty:String(pbMeasureNumber(r.factor||1)*pbMeasureFormula(r.formula)),unit:r.unit||'m²',unitPrice:'0',discount:'0'}))}));
  }
  data.offerNo=data.offerNo||`A-${new Date().getFullYear()}-`;
  data.offerDate=data.offerDate||new Date().toISOString().slice(0,10);data.validDays=data.validDays||'30';data.vat=data.vat||'8.1';
  data.execution=data.execution||'Nach Vereinbarung';data.title=data.title||c.phaseData.aufmass?.measureTitle||'Sanierung / Bauarbeiten';
  data.intro=data.intro||'Vielen Dank für Ihr Interesse. Gerne unterbreiten wir Ihnen mit dieser Offerte unser Angebot für Ihr Projekt.';
  data.payment=data.payment||'40 % nach Vertragsabschluss\n50 % nach Baubeginn\n10 % nach Bauabnahme';
  data.closing=data.closing||'Vielen Dank für Ihr Vertrauen. Sämtliche Arbeiten werden fachgerecht nach den vereinbarten Grundlagen ausgeführt.';
  return data;
}
function pbOfferTotals(data){let net=0;(data.sections||[]).forEach(s=>(s.rows||[]).forEach(r=>net+=pbMeasureNumber(r.qty)*pbMeasureNumber(r.unitPrice)*(1-pbMeasureNumber(r.discount)/100)));const vat=net*pbMeasureNumber(data.vat)/100;return{net,vat,gross:net+vat}}
function pbRenderOffer(c){
  const d=pbOfferDraft(c),t=pbOfferTotals(d);
  const sections=d.sections.map((s,si)=>{let st=0;(s.rows||[]).forEach(r=>st+=pbMeasureNumber(r.qty)*pbMeasureNumber(r.unitPrice)*(1-pbMeasureNumber(r.discount)/100));return `<section class="pb-offer-section" data-offer-section="${si}"><div class="pb-offer-section-head"><input data-os-title value="${esc(s.title||'Titel')}" aria-label="Titel"><span><button type="button" data-offer-row-add="${si}">+ Position</button><button type="button" class="danger" data-offer-section-delete="${si}">×</button></span></div><div class="pb-offer-head"><span>Leistung / Material</span><span>Menge</span><span>Einheit</span><span>Einzelpreis</span><span>Rabatt %</span><span>Gesamtpreis</span><span></span></div>${(s.rows||[]).map((r,ri)=>{const sum=pbMeasureNumber(r.qty)*pbMeasureNumber(r.unitPrice)*(1-pbMeasureNumber(r.discount)/100);return `<div class="pb-offer-row" data-offer-row="${ri}"><div><input data-or="title" value="${esc(r.title||'')}" placeholder="Leistung / Material"><textarea data-or="description" rows="2" placeholder="Beschreibung">${esc(r.description||'')}</textarea></div><input data-or="qty" value="${esc(r.qty||'')}" inputmode="decimal"><select data-or="unit">${PB_MEASURE_UNITS.map(u=>`<option ${u===(r.unit||'m²')?'selected':''}>${u}</option>`).join('')}</select><input data-or="unitPrice" value="${esc(r.unitPrice||'0')}" inputmode="decimal"><input data-or="discount" value="${esc(r.discount||'0')}" inputmode="decimal"><output>${formatCHNumber(sum,2)} CHF</output><button type="button" class="danger" data-offer-row-delete="${si}:${ri}">×</button></div>`}).join('')}<div class="pb-offer-subtotal">Titelsumme <strong>${formatCHNumber(st,2)} CHF</strong></div></section>`}).join('');
  return `<div class="pb-offer-editor"><div class="pb-flow-actions"><button type="button" class="secondary" data-back-measure>← Aufmass</button><span>Offerte taslağındaki bütün alanlar manuel olarak değiştirilebilir.</span><button type="button" class="primary" data-create-order>Auftrag erstellen →</button></div><div class="pb-offer-meta"><label>Offerte-Nr.<input data-offer-field="offerNo" value="${esc(d.offerNo)}"></label><label>Datum<input type="date" data-offer-field="offerDate" value="${esc(d.offerDate)}"></label><label>Gültigkeit (Tage)<input data-offer-field="validDays" value="${esc(d.validDays)}" inputmode="numeric"></label><label>Ausführungstermin<input data-offer-field="execution" value="${esc(d.execution)}"></label><label class="wide">Bezeichnung<input data-offer-field="title" value="${esc(d.title)}"></label><label class="wide">Einleitung<textarea data-offer-field="intro" rows="4">${esc(d.intro)}</textarea></label></div>${sections}<button type="button" class="primary pb-add-room" data-offer-section-add>+ Neuer Titel</button><div class="pb-offer-summary"><div><span>Netto</span><strong>${formatCHNumber(t.net,2)} CHF</strong></div><label>MWST %<input data-offer-field="vat" value="${esc(d.vat)}" inputmode="decimal"></label><div><span>MWST</span><strong>${formatCHNumber(t.vat,2)} CHF</strong></div><div class="gross"><span>Brutto</span><strong>${formatCHNumber(t.gross,2)} CHF</strong></div></div><div class="pb-offer-texts"><label>Zahlungsbedingungen<textarea data-offer-field="payment" rows="5">${esc(d.payment)}</textarea></label><label>Schlusstext / Garantie<textarea data-offer-field="closing" rows="5">${esc(d.closing)}</textarea></label></div></div>`;
}
function renderProfessionalAufmass(c,data){
  return pbRenderMeasureGroups(data);
  /* Legacy structured checklist remains below for backwards data compatibility. */
  const missing=[];
  if(!data.measureDate)missing.push('Aufmassdatum');if(!data.measurer)missing.push('Aufgenommen durch');
  if(!(data.walls||[]).length)missing.push('mindestens eine Wand');if(!(data.connections||[]).length)missing.push('Sanitäranschlüsse');
  if(!data.substrateChecked)missing.push('Untergrundprüfung');if(!data.existingPhotos)missing.push('Bestandsfotos');
  if(!(data.works||[]).length)missing.push('auszuführende Arbeiten');if(!(data.materials||[]).length)missing.push('Materialliste');
  const total=8,done=total-missing.length,pct=Math.round(done/total*100);
  const sections=[
    aufmassSection('1 · Allgemeine Angaben','Zugang, Logistik, Baustelle',`<div class="aufmass-fields">${aufmassField('measureDate','Aufmassdatum','date')}${aufmassField('measurer','Aufgenommen durch')}${aufmassField('contactPerson','Anwesende Kontaktperson')}${aufmassField('floorDoor','Etage / Wohnung / Tür')}${aufmassField('workHours','Erlaubte Arbeitszeiten')}${aufmassField('occupancy','Bewohnt während Umbau?','select',['Ja','Nein','Teilweise'])}${aufmassField('generalNotes','Zugang, Parkierung, Lift, Schlüssel, Transportweg, Container','textarea',null,'wide')}</div>${aufmassChecks([['parkingChecked','Parkierung/Entladen geklärt'],['liftChecked','Lift/Transportweg geprüft'],['keyChecked','Schlüssel/Zugang geklärt'],['protectionNeeded','Schutzmassnahmen erforderlich'],['containerPossible','Container möglich']])}`,true),
    aufmassSection('2 · Bestand und Zustand','Untergrund, Feuchte, Schäden',`<div class="aufmass-fields">${aufmassField('constructionYear','Baujahr / letzte Sanierung')}${aufmassField('wallBase','Wandaufbau','select',['Beton','Backstein','Gips','Leichtbau','Holz','Unbekannt'])}${aufmassField('floorBase','Bodenaufbau','select',['Zementestrich','Anhydrit','Beton','Holz','Alte Platten','Unbekannt'])}${aufmassField('moisture','Feuchteprüfung / Wert')}${aufmassField('levelDeviation','Bodenabweichung / Gefälle')}${aufmassField('conditionNotes','Risse, Hohlstellen, Schimmel, Wasserschäden, Asbestverdacht','textarea',null,'wide')}</div>${aufmassChecks([['substrateChecked','Untergrund geprüft'],['wallsPlumb','Wände auf Lot geprüft'],['floorLevel','Boden nivelliert geprüft'],['moistureDamage','Feuchte/Schaden vorhanden'],['asbestosSuspected','Asbestverdacht'],['tileOnTile','Platte auf Platte möglich']])}`,true),
    aufmassSection('3 · Raum- und Wandmasse','Grundriss, Höhen, Öffnungen',`<div class="aufmass-fields">${aufmassField('roomHeight','Raumhöhe cm','number')}${aufmassField('roomCount','Anzahl Räume','number')}${aufmassField('ceilingType','Decke / Dachschräge')}${aufmassField('doorMeasure','Tür B×H / Öffnungsrichtung')}${aufmassField('windowMeasure','Fenster B×H / Brüstung')}${aufmassField('measureNotes','Kolonnen, Schächte, Vorwand, Ablagen, Nischen, offene Masse','textarea',null,'wide')}</div>${aufmassRepeat('walls',data)}${aufmassChecks([['floorplanReady','Grundriss erstellt'],['wallViewsReady','Wandansichten kontrolliert'],['anglesChecked','Ecken/Winkel geprüft'],['openingsChecked','Tür/Fenster geprüft']])}`),
    aufmassSection('4 · Sanitäranschlüsse','Koordinaten und Leitungen – keine Produktliste',`${aufmassRepeat('connections',data)}${aufmassChecks([['connectionsChecked','Alle Anschlüsse geprüft'],['drainChecked','Ablauf/Gefälle geprüft'],['waterShutoff','Absperrung geklärt'],['relocationNeeded','Anschlüsse müssen versetzt werden']])}`),
    aufmassSection('5 · Elektro und Lüftung','Anschlüsse, Licht, Heizung',`<div class="aufmass-fields">${aufmassField('electricNotes','Steckdosen, Schalter, Licht, Spiegel, Waschmaschine, Bodenheizung','textarea',null,'wide')}${aufmassField('ventilation','Lüftung / Fenster')}${aufmassField('heating','Heizkörper / Bodenheizung')}</div>${aufmassChecks([['electricianNeeded','Elektriker erforderlich'],['mirrorPower','Spiegelanschluss vorhanden'],['ventChecked','Lüftung geprüft'],['floorHeating','Bodenheizung vorgesehen']])}`),
    aufmassSection('6 · Demontage und Entsorgung','Bestand entfernen und abführen',`<div class="aufmass-fields">${aufmassField('demolitionAreaWall','Wandplatten demontieren m²','number')}${aufmassField('demolitionAreaFloor','Bodenplatten demontieren m²','number')}${aufmassField('wasteEstimate','Menge / Gewicht / Mulde')}${aufmassField('demolitionNotes','Wanne, Dusche, WC, Möbel, Vorwand, Decke, Tür, Transport','textarea',null,'wide')}</div>${aufmassChecks([['removeTiles','Platten entfernen'],['removeScreed','Unterlagsboden entfernen'],['removeSealing','Abdichtung entfernen'],['removeFixtures','Apparate demontieren'],['wasteTransport','Entsorgung/Transport kalkuliert']])}`),
    aufmassSection('7 · Untergrundvorbereitung','Ausgleich, Aufbau, Gefälle',`<div class="aufmass-fields">${aufmassField('levelingThickness','Ausgleichsdicke mm','number')}${aufmassField('slopePct','Gefälle %','number')}${aufmassField('substrateArea','Vorbereitungsfläche m²','number')}${aufmassField('substrateNotes','Aufbau und Produkte','textarea',null,'wide')}</div>${aufmassChecks([['primer','Grundierung'],['leveling','Ausgleich/Spachtelung'],['slopeBuild','Gefälleaufbau'],['decoupling','Entkopplung'],['drywall','Trockenbau/Bauplatten'],['soundproof','Schallschutz']])}`),
    aufmassSection('8 · Abdichtung','Flächen und Detailpunkte',`<div class="aufmass-fields">${aufmassField('sealingClass','Beanspruchungsklasse')}${aufmassField('sealFloorArea','Boden m²','number')}${aufmassField('sealWallArea','Wand m²','number')}${aufmassField('sealTape','Dichtband m','number')}${aufmassField('sealCorners','Innen-/Aussenecken St.')}${aufmassField('sealCollars','Manschetten St.')}${aufmassField('sealSystem','System / Hersteller','text')}${aufmassField('sealingNotes','Dusche, Wanne, Nische, Türschwelle, Duschrinne','textarea',null,'double')}</div>${aufmassChecks([['sealWholeFloor','Ganzer Boden'],['sealShowerWalls','Duschwände'],['sealNiches','Nischen'],['sealDrain','Rinne/Ablauf'],['sealDocumentPhotos','Zwischenfotos erforderlich']])}`),
    aufmassSection('9 · Fliesenplanung','Format, Fugen, Profile, Verlegung',`<div class="aufmass-fields">${aufmassField('tileFormatFloor','Bodenformat')}${aufmassField('tileFormatWall','Wandformat')}${aufmassField('tileThickness','Dicke mm','number')}${aufmassField('tileDirection','Verlegerichtung / Verband')}${aufmassField('jointWidth','Fugenbreite mm','number')}${aufmassField('jointColor','Fugenfarbe')}${aufmassField('siliconeColor','Silikonfarbe')}${aufmassField('wastePct','Verschnitt %','number')}${aufmassField('tileNotes','Startpunkt, Symmetrie, Dekor, Profile, Gehrung, Bohrungen, Sockel','textarea',null,'wide')}</div>${aufmassChecks([['rectified','Rektifiziert'],['slipClassChecked','Rutschklasse geprüft'],['mitre45','45° Gehrung'],['profilesNeeded','Profile erforderlich'],['layoutApproval','Verlegeplan/Freigabe erforderlich']])}`),
    aufmassSection('10 · Materialien','Geplante Produkte und Mengen',aufmassRepeat('materials',data)),
    aufmassSection('11 · Auszuführende Arbeiten','Menge, Einheit, Stunden, Verantwortung',aufmassRepeat('works',data)),
    aufmassSection('12 · Fremdgewerke','Sanitär, Elektro, Gipser, Maler, Glaser…',aufmassRepeat('trades',data)),
    aufmassSection('13 · Offene Entscheide','Kundenentscheide und Termine',aufmassRepeat('decisions',data)),
    aufmassSection('14 · Fotodokumentation','Pflichtbilder vor Ort',`${aufmassChecks([['existingPhotos','Bestandsfotos vorhanden'],['photoAllWalls','Alle Wände fotografiert'],['photoFloorCeiling','Boden/Decke fotografiert'],['photoOpenings','Tür/Fenster fotografiert'],['photoConnections','Anschlüsse fotografiert'],['photoDamage','Schäden/Feuchte fotografiert'],['photoElectrical','Elektro/Lüftung fotografiert']])}<div class="aufmass-fields" style="margin-top:10px">${aufmassField('photoNotes','Fotohinweise / fehlende Aufnahmen','textarea',null,'wide')}</div>`)
  ];
  return `<div class="aufmass-pro">${sections.join('')}<div class="aufmass-completion"><div class="aufmass-completion-head"><strong>Aufmass-Vollständigkeit</strong><span class="aufmass-complete-badge">${pct} %</span></div><div class="aufmass-progress"><i style="width:${pct}%"></i></div><div class="aufmass-missing">${missing.length?'Fehlt: '+esc(missing.join(', ')):'✓ Pflichtangaben vollständig. Aufmass kann abgeschlossen werden.'}</div>${aufmassChecks([['aufmassComplete','Aufmass vollständig geprüft und abgeschlossen']])}</div></div>`;
}

function phaseFieldHtml(field,data){
  const [key,label,type,arg]=field,value=data[key]??'',cls=arg==='wide'?'wide':arg==='double'?'double':'';
  if(type==='textarea')return `<label class="${cls}">${esc(label)}<textarea rows="3" data-pl-phase-field="${key}">${esc(value)}</textarea></label>`;
  if(type==='select')return `<label class="${cls}">${esc(label)}<select data-pl-phase-field="${key}">${(arg||[]).map(o=>`<option ${String(o)===String(value)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label class="${cls}">${esc(label)}<input data-pl-phase-field="${key}" type="${type}" value="${esc(value)}"${type==='number'?' step="0.01"':''}></label>`;
}

function readPlattenlegerPhaseData(c,phase=c.phase){
  c.phaseData=c.phaseData||{};const data=c.phaseData[phase]=c.phaseData[phase]||{};
  document.querySelectorAll('[data-pl-phase-field]').forEach(el=>data[el.dataset.plPhaseField]=el.value);
  document.querySelectorAll('[data-pl-phase-check]').forEach(el=>data[el.dataset.plPhaseCheck]=el.checked);
  document.querySelectorAll('[data-aufmass-list]').forEach(list=>{
    const name=list.dataset.aufmassList;data[name]=[...list.querySelectorAll('[data-aufmass-array]')].map(row=>{
      const item={};row.querySelectorAll('[data-array-field]').forEach(el=>item[el.dataset.arrayField]=el.value);return item;
    });
  });
  const measureGroups=[...document.querySelectorAll('[data-measure-group]')];
  if(measureGroups.length)data.measureGroups=measureGroups.map(group=>({
    title:group.querySelector('[data-group-title]')?.value||'Raum',notes:group.querySelector('[data-group-notes]')?.value||'',
    rows:[...group.querySelectorAll('[data-measure-row]')].map(row=>{const item={};row.querySelectorAll('[data-mr]').forEach(el=>item[el.dataset.mr]=el.value);return item;})
  }));
  if(phase==='offerte'){
    document.querySelectorAll('[data-offer-field]').forEach(el=>data[el.dataset.offerField]=el.value);
    const sections=[...document.querySelectorAll('[data-offer-section]')];if(sections.length)data.sections=sections.map(sec=>({title:sec.querySelector('[data-os-title]')?.value||'Titel',rows:[...sec.querySelectorAll('[data-offer-row]')].map(row=>{const item={};row.querySelectorAll('[data-or]').forEach(el=>item[el.dataset.or]=el.value);return item;})}));
  }
}

function renderPlattenlegerPhaseContent(c){
  c.phaseData=c.phaseData||{};const schema=PL_PHASE_CONTENT[c.phase]||PL_PHASE_CONTENT.anfrage,data=c.phaseData[c.phase]||{};
  const host=$('plattenlegerPhaseContent');if(!host)return;
  if(c.phase==='aufmass')host.innerHTML=`<div class="plattenleger-phase-head"><div><h4>Professionelles Bad-Aufmass</h4><p>Vollständige Aufnahme für Badumbau, Offerte, Material und Ausführung.</p></div><span class="plattenleger-phase-badge">Aufmass</span></div>${renderProfessionalAufmass(c,data)}`;
  else if(c.phase==='offerte')host.innerHTML=`<div class="plattenleger-phase-head"><div><h4>Offerte Taslagı</h4><p>Aufmass übernehmen, Positionen und Preise frei bearbeiten.</p></div><span class="plattenleger-phase-badge">Offerte</span></div>${pbRenderOffer(c)}`;
  else host.innerHTML=`<div class="plattenleger-phase-head"><div><h4>${esc(schema.title)}</h4><p>${esc(schema.desc)}</p></div><span class="plattenleger-phase-badge">${esc(PL_PHASES.find(x=>x[0]===c.phase)?.[1]||'Phase')}</span></div>`+
    `<div class="plattenleger-phase-fields">${schema.fields.map(f=>phaseFieldHtml(f,data)).join('')}</div>`+
    `<div class="plattenleger-phase-checks">${schema.checks.map(([key,label])=>`<label><input type="checkbox" data-pl-phase-check="${key}" ${data[key]?'checked':''}> ${esc(label)}</label>`).join('')}</div>`;
  host.querySelectorAll('[data-pl-phase-field]').forEach(el=>{if(data[el.dataset.plPhaseField]!==undefined)el.value=data[el.dataset.plPhaseField]});
  host.querySelectorAll('[data-pl-phase-check]').forEach(el=>el.checked=!!data[el.dataset.plPhaseCheck]);
  host.querySelectorAll('[data-aufmass-add]').forEach(btn=>pbBindTap(btn,()=>{
    readPlattenlegerPhaseData(c,'aufmass');const name=btn.dataset.aufmassAdd;data[name]=Array.isArray(data[name])?data[name]:[];data[name].push({});renderPlattenlegerPhaseContent(c);
  }));
  host.querySelectorAll('[data-aufmass-delete]').forEach(btn=>pbBindTap(btn,()=>{
    readPlattenlegerPhaseData(c,'aufmass');const name=btn.dataset.aufmassDelete,index=Number(btn.dataset.index);if(Array.isArray(data[name]))data[name].splice(index,1);renderPlattenlegerPhaseContent(c);
  }));
  host.querySelectorAll('[data-measure-row-add]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'aufmass');const gi=Number(btn.dataset.measureRowAdd);data.measureGroups[gi].rows.push({factor:'1',formula:'',unit:'m²'});renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-measure-row-delete]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'aufmass');const [gi,ri]=btn.dataset.measureRowDelete.split(':').map(Number);data.measureGroups[gi].rows.splice(ri,1);renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-measure-group-delete]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'aufmass');data.measureGroups.splice(Number(btn.dataset.measureGroupDelete),1);renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-measure-group-add]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'aufmass');data.measureGroups.push({title:`Raum ${data.measureGroups.length}`,notes:'',rows:[]});renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('.pb-measure-row input,.pb-measure-row select').forEach(el=>el.addEventListener('change',()=>{readPlattenlegerPhaseData(c,'aufmass');renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-open-offer]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'aufmass');pbOfferDraft(c);c.phase='offerte';const sel=$('plProjectPhase');if(sel)sel.value='offerte';save();renderPlattenlegerCockpit(cur())}));
  host.querySelectorAll('[data-back-measure]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'offerte');c.phase='aufmass';const sel=$('plProjectPhase');if(sel)sel.value='aufmass';save();renderPlattenlegerCockpit(cur())}));
  host.querySelectorAll('[data-offer-row-add]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'offerte');const d=pbOfferDraft(c),si=Number(btn.dataset.offerRowAdd);d.sections[si].rows.push({qty:'1',unit:'m²',unitPrice:'0',discount:'0'});renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-offer-row-delete]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'offerte');const d=pbOfferDraft(c),[si,ri]=btn.dataset.offerRowDelete.split(':').map(Number);d.sections[si].rows.splice(ri,1);renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-offer-section-add]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'offerte');pbOfferDraft(c).sections.push({title:'Neuer Titel',rows:[]});renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-offer-section-delete]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'offerte');pbOfferDraft(c).sections.splice(Number(btn.dataset.offerSectionDelete),1);renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('.pb-offer-row input,.pb-offer-row select,[data-offer-field="vat"]').forEach(el=>el.addEventListener('change',()=>{readPlattenlegerPhaseData(c,'offerte');renderPlattenlegerPhaseContent(c)}));
  host.querySelectorAll('[data-create-order]').forEach(btn=>pbBindTap(btn,()=>{readPlattenlegerPhaseData(c,'offerte');const p=cur(),d=pbOfferDraft(c),totals=pbOfferTotals(d);p.orders=Array.isArray(p.orders)?p.orders:[];p.orders.push({id:'order_'+Date.now(),sourceOfferNo:d.offerNo,status:'Entwurf',createdAt:new Date().toISOString(),title:d.title,sections:JSON.parse(JSON.stringify(d.sections)),net:totals.net,vat:totals.vat,gross:totals.gross});save();pbActionToast('Auftrag-Entwurf wurde erstellt. Auftrag-Modul wird später erweitert.') }));
}

function ensurePlattenlegerProject(p){
  p.plattenleger=p.plattenleger||{};
  const c=p.plattenleger;
  if(!c.phase)c.phase='anfrage';
  if(!c.objectType)c.objectType='Badumbau';
  if(!c.phaseData||typeof c.phaseData!=='object')c.phaseData={};
  c.scope={demontage:false,untergrund:false,abdichtung:false,bodenplatten:true,wandplatten:true,silikon:true,sanitaer:false,duschglas:false,...(c.scope||{})};
  return c;
}

function projectPlattenlegerMetrics(p){
  let floor=0,wall=0,abdichtung=0,silicone=0,sanitary=0,closedPlans=0;
  const sanitaryTypes=new Set(['wc','shower','walkInShower','glass','bathtub','sink','drain','kitchenSink','mirror']);
  (p.floorplans||[]).forEach(fp=>{
    const objects=Array.isArray(fp.objects)?fp.objects:[];
    const floorM2=Number(fp.floorAreaM2);
    if(Number.isFinite(floorM2)&&floorM2>0){floor+=floorM2;closedPlans++}
    objects.forEach(o=>{
      if(o?.type==='wall'){
        (o.tileAreas||[]).forEach(a=>wall+=Math.max(0,Number(a.width)||0)*Math.max(0,Number(a.height)||0)/10000);
        const inner=Number(o.innerLengthCm);
        const raw=Math.hypot(Number(o.x2)-Number(o.x1),Number(o.y2)-Number(o.y1));
        silicone+=(Number.isFinite(inner)&&inner>0?inner:raw)/100;
      }else if(sanitaryTypes.has(o?.type))sanitary++;
    });
    const seal=fp.abdichtung?.lastAnalysis;
    if(Number.isFinite(Number(seal?.totalArea)))abdichtung+=Number(seal.totalArea);
  });
  const waste=Math.max(0,Number(p.tileSettings?.wastePercent??10)||0);
  const tiledNet=floor+wall,tiledOrder=tiledNet*(1+waste/100);
  return {floor,wall,abdichtung,silicone,sanitary,tiledNet,tiledOrder,waste,closedPlans,totalPlans:(p.floorplans||[]).length};
}

function renderPlattenlegerCockpit(p){
  const c=ensurePlattenlegerProject(p),phaseIndex=Math.max(0,PL_PHASES.findIndex(x=>x[0]===c.phase));
  const phasebar=$('plattenlegerPhasebar');
  if(phasebar){
    phasebar.innerHTML=PL_PHASES.map((x,i)=>`<button type="button" data-pl-phase="${x[0]}" class="plattenleger-phase ${i<phaseIndex?'done':''} ${i===phaseIndex?'active':''}">${esc(x[1])}</button>`).join('');
    phasebar.querySelectorAll('[data-pl-phase]').forEach(btn=>pbBindTap(btn,()=>{
      const select=$('plProjectPhase');if(select)select.value=btn.dataset.plPhase;
      savePlattenlegerCockpit();
    }));
  }
  if($('plProjectPhase'))$('plProjectPhase').value=c.phase;
  if($('plProjectPhase'))$('plProjectPhase').onchange=()=>savePlattenlegerCockpit();
  if($('plObjectType'))$('plObjectType').value=c.objectType;
  if($('plConstructionStart'))$('plConstructionStart').value=c.constructionStart||'';
  if($('plAcceptanceDate'))$('plAcceptanceDate').value=c.acceptanceDate||'';
  if($('plSiteNote'))$('plSiteNote').value=c.siteNote||'';
  document.querySelectorAll('[data-pl-scope]').forEach(input=>input.checked=!!c.scope[input.dataset.plScope]);
  renderPlattenlegerPhaseContent(c);
  const m=projectPlattenlegerMetrics(p),fmt=v=>formatCHNumber(v,2);
  const kpis=$('plattenlegerKpis');
  if(kpis)kpis.innerHTML=[
    ['Bodenfläche',`${fmt(m.floor)} m²`],['Wandplatten',`${fmt(m.wall)} m²`],
    [`Fliesen inkl. ${formatCHNumber(m.waste,0)} %`,`${fmt(m.tiledOrder)} m²`],['Abdichtung',`${fmt(m.abdichtung)} m²`],
    ['Silikon / Umfang',`${fmt(m.silicone)} m`],['Sanitärobjekte',`${m.sanitary} St.`]
  ].map(x=>`<div class="plattenleger-kpi"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join('');
  const photoCount=(p.areas||[]).reduce((n,a)=>n+(a.photos||[]).length,0);
  const checks=[
    [m.totalPlans>0,'Grundriss erfasst'],[m.totalPlans>0&&m.closedPlans===m.totalPlans,'Alle Grundrisse geschlossen'],
    [(p.tileMaterials||[]).length>0,'Fliesenmaterial erfasst'],[!c.scope.abdichtung||m.abdichtung>0,'Abdichtung berechnet'],
    [photoCount>0,'Fotodokumentation vorhanden'],[!!p.customer&&!!p.address,'Kunde und Adresse vollständig']
  ];
  const checkEl=$('plattenlegerChecks');if(checkEl)checkEl.innerHTML=checks.map(x=>`<span class="plattenleger-check ${x[0]?'ok':''}">${x[0]?'✓':'!'} ${esc(x[1])}</span>`).join('');
}

function savePlattenlegerCockpit(){
  const p=cur();if(!p)return;
  const c=ensurePlattenlegerProject(p);
  readPlattenlegerPhaseData(c,c.phase);
  c.phase=$('plProjectPhase')?.value||'anfrage';c.objectType=$('plObjectType')?.value||'Badumbau';
  c.constructionStart=$('plConstructionStart')?.value||'';c.acceptanceDate=$('plAcceptanceDate')?.value||'';c.siteNote=$('plSiteNote')?.value||'';
  document.querySelectorAll('[data-pl-scope]').forEach(input=>c.scope[input.dataset.plScope]=input.checked);
  c.updatedAt=new Date().toISOString();p.updatedAt=c.updatedAt;save();pbActionToast('Plattenleger-Cockpit gespeichert.');
}

function renderP(){
  let p=cur();
  if(!p){$('panel').classList.add('hidden');return}
  p.floorplans=p.floorplans||[];
  p.tileMaterials=p.tileMaterials||[];
  p.tileSettings=p.tileSettings||{layoutPattern:'',jointWidth:'',jointColor:'',siliconeColor:'',wastePercent:10};
  $('panel').classList.remove('hidden');
  $('pTitle').textContent=p.name;
  $('pMeta').textContent=[p.address,p.customer&&'Kunde: '+p.customer,p.owner&&'Verantwortlich: '+p.owner].filter(Boolean).join(' · ');
  $('summary').innerHTML=[['Telefon',p.phone||'-'],['Startdatum',fmtDate(p.startDate)],['Bereiche',p.areas.length],['Beschreibung',p.description||'-']].map(x=>`<div><small>${esc(x[0])}</small><br><b>${esc(x[1])}</b></div>`).join('');
  renderPlattenlegerCockpit(p);
  const pe=$('projectEditFields');
  if(pe){
    $('editProjectName').value=p.name||''; $('editProjectAddress').value=p.address||'';
    $('editProjectCustomer').value=p.customer||''; $('editProjectPhone').value=p.phone||'';
    $('editProjectStartDate').value=p.startDate||''; $('editProjectOwner').value=p.owner||'';
    $('editProjectDescription').value=p.description||'';
  }
  if($('projectInformationText')) $('projectInformationText').value=p.projectInformation||'';
  $('areas').innerHTML='';
  p.areas.forEach(a=>$('areas').appendChild(area(p,a)));
  renderFloorplans(p);
}
function area(p,a){
  a.tasks=a.tasks||[];a.materials=a.materials||[];a.photos=a.photos||[];
  let d=document.createElement('div');d.className='area';
  d.innerHTML=`<div class=title><div><h3>${esc(a.name)}</h3><small>${esc(a.priority)}</small></div><button class="danger editor delArea">Bereich löschen</button></div>
  <div class=grid><label>Mitarbeiter / Team<input class=worker></label><label>Status<select class=status><option>Offen</option><option>In Arbeit</option><option>Wartet</option><option>Abgeschlossen</option></select></label></div>
  <div class=sub><div class=title><h4>Auszuführende Arbeiten</h4><button class="secondary addT editor">+ Aufgabe</button></div><div class=tasks></div></div>
  <div class=sub><div class=title><h4>Material / Menge</h4><button class="secondary addM editor">+ Material</button></div><div class=mats></div></div>
  <div class="photoBox editor">
    <select class=kind>
      <option>Vorher</option>
      <option>Nachher</option>
      <option>Detail</option>
    </select>
    <div class="photo-source-actions">
      <label class="primary file">Foto aufnehmen
        <input class="cameraInput" type="file" accept="image/*" capture="environment">
      </label>
      <button type="button" class="secondary galleryButton">Foto auswählen</button>
    </div>
  </div>
  <div class=photos></div>`;
  d.querySelector('.worker').value=a.worker||'';d.querySelector('.status').value=a.status||'Offen';
  d.querySelector('.worker').onchange=e=>{a.worker=e.target.value;save()};d.querySelector('.status').onchange=e=>{a.status=e.target.value;save()};
  pbBindTap(d.querySelector('.delArea'),()=>{if(confirm(`Bereich „${a.name||''}“ wirklich löschen?`)){p.areas=p.areas.filter(x=>x.id!==a.id);p.updatedAt=new Date().toISOString();save();pbActionToast('Bereich gelöscht.')}});
  a.tasks.forEach(t=>d.querySelector('.tasks').appendChild(row(a.tasks,t,'Arbeitsbeschreibung')));
  pbBindTap(d.querySelector('.addT'),()=>{a.tasks.push({id:u(),text:''});p.updatedAt=new Date().toISOString();save();pbActionToast('Aufgabe hinzugefügt.');});
  a.materials.forEach(m=>d.querySelector('.mats').appendChild(row(a.materials,m,'60×120 seramik – 12 m²')));
  pbBindTap(d.querySelector('.addM'),()=>{a.materials.push({id:u(),text:''});p.updatedAt=new Date().toISOString();save();pbActionToast('Material hinzugefügt.');});
  const addSelectedPhotos=async(files)=>{
    for(const f of files){
      a.photos.push({
        id:u(),
        kind:d.querySelector('.kind').value,
        title:'',
        note:'',
        data:await img(f)
      });
    }
    save();
  };
  d.querySelector('.cameraInput').onchange=async e=>{
    if(e.target.files && e.target.files.length) await addSelectedPhotos(e.target.files);
    e.target.value='';
  };
  pbBindTap(d.querySelector('.galleryButton'),async()=>{
    try{
      // Bevorzugt: echter System-Dateidialog. Kein Kamera-"capture".
      if(window.showOpenFilePicker){
        const handles=await window.showOpenFilePicker({
          multiple:true,
          types:[{
            description:'Bilder',
            accept:{
              'image/*':['.jpg','.jpeg','.png','.webp','.gif','.bmp','.heic','.heif']
            }
          }]
        });
        const files=[];
        for(const handle of handles){
          files.push(await handle.getFile());
        }
        if(files.length) await addSelectedPhotos(files);
        return;
      }

      // Fallback für Browser ohne File System Access API:
      // bewusst KEIN accept=image/* und KEIN capture, damit der Dateidialog erscheint.
      const picker=document.createElement('input');
      picker.type='file';
      picker.multiple=true;
      picker.style.display='none';
      document.body.appendChild(picker);

      picker.onchange=async()=>{
        const files=[...picker.files].filter(f=>{
          const name=(f.name||'').toLowerCase();
          return (f.type&&f.type.startsWith('image/')) ||
            /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/.test(name);
        });
        if(!files.length){
          alert('Bitte Bilddateien auswählen.');
        }else{
          await addSelectedPhotos(files);
        }
        picker.remove();
      };

      picker.click();
    }catch(err){
      if(err && err.name==='AbortError') return;
      alert('Der Dateidialog konnte nicht geöffnet werden.');
    }
  });
  a.photos.forEach((ph,i)=>d.querySelector('.photos').appendChild(photoCard(a,ph,i)));
  return d
}
function row(arr,it,ph){
  let r=document.createElement('div');r.className='row';r.innerHTML=`<input placeholder="${ph}"><button class="danger editor">Löschen</button>`;
  r.querySelector('input').value=it.text||'';r.querySelector('input').onchange=e=>{it.text=e.target.value;save()};
  pbBindTap(r.querySelector('button'),()=>{arr.splice(arr.findIndex(x=>x.id===it.id),1);save();pbActionToast('Eintrag gelöscht.');});return r
}
function photoCard(a,ph,i){
  ph.title=ph.title||'';ph.note=ph.note||'';
  let c=document.createElement('div');c.className='photo';
  c.innerHTML=`<img><div class=body><span class=tag>${esc(ph.kind||'Detail')}</span>
  <div class=photo-fields>
    <label>Titel / Position<input class=photoTitle placeholder="Örn. Badezimmer - duş duvarı"></label>
    <label>Beschreibung im PDF<textarea class=photoNote rows=5 placeholder="Auszuführende Arbeiten für dieses Foto beschreiben..."></textarea></label>
  </div>
  <div class="photo-actions editor"><button class="primary editPhoto">✎ Foto bearbeiten</button><button class="secondary up">↑ Nach oben</button><button class="secondary down">↓ Nach unten</button><button class="danger del">Löschen</button></div></div>`;
  c.querySelector('img').src=ph.data;c.querySelector('.photoTitle').value=ph.title;c.querySelector('.photoNote').value=ph.note;
  const editExisting=()=>{ if(window.ProjectBauPhotoEditor?.openExisting) window.ProjectBauPhotoEditor.openExisting(ph,a); else alert('Fotoeditor wird noch geladen. Bitte erneut versuchen.'); };
  pbBindTap(c.querySelector('.editPhoto'),editExisting); c.querySelector('img').style.cursor='pointer'; c.querySelector('img').onclick=editExisting;
  c.querySelector('.photoTitle').onchange=e=>{ph.title=e.target.value;save()};c.querySelector('.photoNote').onchange=e=>{ph.note=e.target.value;save()};
  c.querySelector('.up').disabled=i===0;c.querySelector('.down').disabled=i===a.photos.length-1;
  pbBindTap(c.querySelector('.up'),()=>{if(i>0){[a.photos[i-1],a.photos[i]]=[a.photos[i],a.photos[i-1]];save();pbActionToast('Foto verschoben.')}});
  pbBindTap(c.querySelector('.down'),()=>{if(i<a.photos.length-1){[a.photos[i+1],a.photos[i]]=[a.photos[i],a.photos[i+1]];save();pbActionToast('Foto verschoben.')}});
  pbBindTap(c.querySelector('.del'),()=>{if(confirm('Foto wirklich löschen?')){a.photos=a.photos.filter(x=>x.id!==ph.id);save();pbActionToast('Foto gelöscht.')}});return c
}
function img(f){
  return new Promise(ok=>{let r=new FileReader(),i=new Image();r.onload=()=>i.src=r.result;i.onload=()=>{let w=Math.min(1400,i.width),h=Math.round(i.height*w/i.width),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(i,0,0,w,h);ok(c.toDataURL('image/jpeg',.8))};r.readAsDataURL(f)})
}


function pdfImageFormat(data){
  if(/^data:image\/png/i.test(data))return 'PNG';
  if(/^data:image\/webp/i.test(data))return 'WEBP';
  return 'JPEG';
}

function addImageContain(doc,data,x,y,w,h){
  try{
    const props=doc.getImageProperties(data);
    const ratio=Math.min(w/props.width,h/props.height);
    const iw=props.width*ratio,ih=props.height*ratio;
    doc.addImage(data,pdfImageFormat(data),x+(w-iw)/2,y+(h-ih)/2,iw,ih,undefined,'FAST');
  }catch(e){console.error(e)}
}

function generateDirectPDFReport(){
  const p=cur();
  if(!p)return;
  const projectInformation=(p.projectInformation||'').trim();

  const items=[];
  (p.areas||[]).forEach(area=>(area.photos||[]).forEach(photo=>items.push({area,photo})));

  if(!window.jspdf || !window.jspdf.jsPDF){
    alert('Das PDF-Modul konnte nicht geladen werden. Bitte Seite neu laden.');
    return;
  }

  const pdfTab=window.open('about:blank','_blank');

  try{
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    const reportDate=new Date().toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'});
    const photoPages=Math.ceil(items.length/2);
    const totalPages=1+photoPages;

    // Seite 1: Projektinformationen / auszuführende Arbeiten
    doc.setTextColor(90);doc.setFont('helvetica','bold');doc.setFontSize(8);
    doc.text('PROJEKT BAU · BAUDOKUMENTATION',12,12);
    doc.setTextColor(20);doc.setFontSize(19);
    doc.text(String(p.name||'Projekt'),12,20);
    doc.setFont('helvetica','normal');doc.setFontSize(9);
    doc.text(`Seite 1 / ${totalPages}`,198,12,{align:'right'});
    doc.text(`Berichtsdatum: ${reportDate}`,198,17,{align:'right'});

    let y=29;
    const rows=[
      ['Adresse',p.address],['Kunde / Firma',p.customer],['Verantwortlich',p.owner],
      ['Telefon',p.phone],['Startdatum',fmtDate(p.startDate)]
    ].filter(r=>r[1]);
    doc.setFontSize(9);
    rows.forEach(([label,value])=>{
      doc.setFont('helvetica','bold');doc.text(`${label}:`,12,y);
      doc.setFont('helvetica','normal');doc.text(String(value),42,y);
      y+=5;
    });
    y=Math.max(y+6,58);
    doc.setDrawColor(200);doc.line(12,y-5,198,y-5);

    doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(15);
    doc.text('AUSZUFÜHRENDE ARBEITEN / PROJEKTINFORMATIONEN',12,y);
    y+=9;
    doc.setFont('helvetica','normal');doc.setFontSize(10.5);

    const info=projectInformation || 'Keine Projektinformationen erfasst.';
    const infoLines=doc.splitTextToSize(info,186);
    const lineHeight=5.2;
    for(const line of infoLines){
      if(y>280){
        doc.setDrawColor(200);doc.line(12,289,198,289);
        doc.setTextColor(100);doc.setFontSize(7.5);
        doc.text('Projekt Bau',12,294);
        doc.addPage('a4','portrait');
        y=18;
        doc.setTextColor(90);doc.setFont('helvetica','bold');doc.setFontSize(8);
        doc.text('PROJEKT BAU · PROJEKTINFORMATIONEN',12,12);
        doc.setTextColor(20);doc.setFont('helvetica','normal');doc.setFontSize(10.5);
      }
      doc.text(line,12,y); y+=lineHeight;
    }
    doc.setDrawColor(200);doc.line(12,289,198,289);
    doc.setTextColor(100);doc.setFontSize(7.5);
    doc.text('Projekt Bau',12,294);
    doc.text(String(p.name||'Projekt'),198,294,{align:'right'});

    // Ab Seite 2: Fotodokumentation
    for(let pageIndex=0;pageIndex<photoPages;pageIndex++){
      doc.addPage('a4','portrait');

      doc.setTextColor(90);doc.setFont('helvetica','bold');doc.setFontSize(8);
      doc.text('PROJEKT BAU · BAUDOKUMENTATION',12,12);
      doc.setTextColor(20);doc.setFontSize(19);
      doc.text(String(p.name||'Projekt'),12,20);

      let hy=27;
      rows.forEach(([label,value])=>{
        doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(`${label}:`,12,hy);
        doc.setFont('helvetica','normal');doc.text(String(value),39,hy);
        hy+=5;
      });

      const visiblePage=pageIndex+2;
      doc.setFont('helvetica','normal');doc.setFontSize(9);
      doc.text(`Seite ${visiblePage} / ${totalPages}`,198,12,{align:'right'});
      doc.text(`Berichtsdatum: ${reportDate}`,198,17,{align:'right'});
      doc.setLineWidth(.5);doc.line(12,48,198,48);

      for(let slot=0;slot<2;slot++){
        const item=items[pageIndex*2+slot];
        if(!item)continue;
        const py=55+slot*116,h=108;
        doc.setDrawColor(170);doc.setLineWidth(.25);
        doc.roundedRect(12,py,186,h,2,2,'S');
        doc.line(98,py,98,py+h);
        addImageContain(doc,item.photo.data,13,py+1,84,106);

        const tx=102,tw=92;let ty=py+8;
        doc.setTextColor(100);doc.setFont('helvetica','bold');doc.setFontSize(7.5);
        doc.text('BEREICH / POSITION',tx,ty);ty+=6;
        doc.setTextColor(20);doc.setFontSize(13);
        const titleLines=doc.splitTextToSize(String(item.photo.title||item.area.name||'-'),tw);
        doc.text(titleLines,tx,ty);ty+=titleLines.length*5.4+3;

        const status=`${item.photo.kind||'Detail'} · ${item.area.status||'Offen'}`;
        doc.setFontSize(8.5);doc.setFont('helvetica','bold');
        const badgeW=Math.min(50,doc.getTextWidth(status)+6);
        doc.roundedRect(tx,ty-4,badgeW,7,3,3,'S');doc.text(status,tx+3,ty+.5);ty+=10;

        const tasks=(item.area.tasks||[]).map(x=>x.text).filter(Boolean).join(' • ');
        const materials=(item.area.materials||[]).map(x=>x.text).filter(Boolean).join(' • ');
        const sections=[
          ['BESCHREIBUNG / AUSZUFÜHRENDE ARBEITEN',item.photo.note||tasks||'-'],
          ...(materials?[['MATERIAL / MENGE',materials]]:[]),
          ...(item.area.worker?[['MITARBEITER / TEAM',item.area.worker]]:[]),
          ...(item.area.priority?[['PRIORITÄT',item.area.priority]]:[])
        ];
        for(const [label,value] of sections){
          if(ty>py+h-9)break;
          doc.setTextColor(100);doc.setFont('helvetica','bold');doc.setFontSize(7.1);doc.text(label,tx,ty);ty+=4;
          doc.setTextColor(20);doc.setFont('helvetica','normal');doc.setFontSize(9);
          let lines=doc.splitTextToSize(String(value||'-'),tw);
          const maxLines=Math.max(1,Math.floor((py+h-ty-3)/4.1));
          lines=lines.slice(0,maxLines);doc.text(lines,tx,ty);ty+=lines.length*4.1+4;
        }
      }

      doc.setDrawColor(200);doc.line(12,289,198,289);
      doc.setTextColor(100);doc.setFontSize(7.5);
      doc.text('Projekt Bau',12,294);
      doc.text(`${String(p.name||'Projekt')} · ${visiblePage}/${totalPages}`,198,294,{align:'right'});
    }

    const blob=doc.output('blob');
    const url=URL.createObjectURL(blob);
    if(pdfTab)pdfTab.location.replace(url);
    else{const link=document.createElement('a');link.href=url;link.target='_blank';link.click();}
    setTimeout(()=>URL.revokeObjectURL(url),180000);
  }catch(err){
    if(pdfTab)pdfTab.close();
    console.error(err);
    alert('Der PDF-Bericht konnte nicht erstellt werden.');
  }
}

function buildPrintReport(){
  const p=cur(); if(!p)return;
  const items=[];
  
  p.areas.forEach(a=>(a.photos||[]).forEach(ph=>items.push({area:a,photo:ph})));
  const root=$('printReportRoot'); root.innerHTML='';
  if(!items.length){alert('Für den PDF-Bericht muss mindestens ein Foto vorhanden sein.');return}

  const totalPages=Math.ceil(items.length/2);
  const reportDate=new Date().toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'});

  for(let i=0;i<items.length;i+=2){
    const pageNo=Math.floor(i/2)+1;
    const page=document.createElement('section'); page.className='pdf-page';
    page.innerHTML=`<div class="pdf-header">
      <div>
        <div class="pdf-brand">PROJEKT BAU · BAUDOKUMENTATION</div>
        <h1>${esc(p.name)}</h1>
        <div class="pdf-meta">
          ${p.address?`<strong>Adresse:</strong> ${esc(p.address)}<br>`:''}
          ${p.customer?`<strong>Kunde / Firma:</strong> ${esc(p.customer)}<br>`:''}
          ${p.owner?`<strong>Verantwortlich:</strong> ${esc(p.owner)}<br>`:''}
          ${p.phone?`<strong>Telefon:</strong> ${esc(p.phone)}<br>`:''}
          <strong>Startdatum:</strong> ${esc(fmtDate(p.startDate))}
        </div>
      </div>
      <div class="pdf-page-no">Seite ${pageNo} / ${totalPages}<br>Berichtsdatum: ${esc(reportDate)}</div>
    </div>
    <div class="pdf-items"></div>
    <div class="pdf-footer"><span>Projekt Bau</span><span>${esc(p.name)} · ${pageNo}/${totalPages}</span></div>`;

    const box=page.querySelector('.pdf-items');
    for(let j=0;j<2;j++){
      const it=items[i+j];
      if(!it){continue}

      const tasks=(it.area.tasks||[]).map(x=>x.text).filter(Boolean).join(' • ');
      const mats=(it.area.materials||[]).map(x=>x.text).filter(Boolean).join(' • ');
      const description=it.photo.note||tasks||'-';

      const card=document.createElement('div');card.className='pdf-item';
      card.innerHTML=`<div class="pdf-photo"><img src="${it.photo.data}"></div>
      <div class="pdf-text">
        <div><div class="pdf-label">Bereich / Position</div><h3>${esc(it.photo.title||it.area.name)}</h3></div>
        <div><span class="pdf-status">${esc(it.photo.kind||'Detail')} · ${esc(it.area.status||'Offen')}</span></div>
        <div><div class="pdf-label">Beschreibung / Auszuführende Arbeiten</div><div class="pdf-value">${esc(description)}</div></div>
        ${mats?`<div><div class="pdf-label">Material / Menge</div><div class="pdf-value">${esc(mats)}</div></div>`:''}
        ${it.area.worker?`<div><div class="pdf-label">Mitarbeiter / Team</div><div class="pdf-value">${esc(it.area.worker)}</div></div>`:''}
        <div><div class="pdf-label">Priorität</div><div class="pdf-value">${esc(it.area.priority||'Normal')}</div></div>
      </div>`;
      box.appendChild(card)
    }
    root.appendChild(page)
  }
}



let tileEditingId=null;
let tilePhotoData=null;

function renderTileLibrary(project){
  const list=$('tileMaterialList');
  if(!list)return;

  project.tileMaterials=project.tileMaterials||[];
  project.tileSettings=project.tileSettings||{layoutPattern:'',jointWidth:'',jointColor:'',siliconeColor:'',wastePercent:10};

  const layout=$('tileLayoutPattern'),jointW=$('tileJointWidth'),jointC=$('tileJointColor'),silicone=$('tileSiliconeColor'),waste=$('tileWastePercent');
  if(layout)layout.value=project.tileSettings.layoutPattern||'';
  if(jointW)jointW.value=project.tileSettings.jointWidth||'';
  if(jointC)jointC.value=project.tileSettings.jointColor||'';
  if(silicone)silicone.value=project.tileSettings.siliconeColor||'';
  if(waste)waste.value=project.tileSettings.wastePercent??10;

  list.innerHTML='';
  if(!project.tileMaterials.length){
    list.innerHTML='<div class="muted">Noch keine Fliesenmaterialien erfasst.</div>';
    return;
  }

  project.tileMaterials.forEach(item=>{
    const card=document.createElement('article');
    card.className='tile-material-card';

    const image=item.photo
      ? `<img class="tile-material-image" src="${item.photo}" alt="${esc(item.model||'Fliese')}">`
      : '<div class="tile-material-placeholder">Kein Fliesenfoto</div>';

    const price=item.price?`CHF ${formatCHNumber(Number(item.price),2)}`:'–';

    card.innerHTML=`
      ${image}
      <div>
        <div class="tile-material-title">${esc([item.brand,item.model].filter(Boolean).join(' · ')||'Fliese')}</div>
        <div class="tile-material-meta">
          <div><b>Format:</b> ${esc(item.format||'–')}</div>
          <div><b>Farbe:</b> ${esc(item.color||'–')}</div>
          <div><b>Oberfläche:</b> ${esc(item.surface||'–')}</div>
          <div><b>Menge:</b> ${esc(item.quantity||'–')}</div>
          <div><b>Preis:</b> ${price}</div>
        </div>
        <div class="tile-material-actions">
          <button class="secondary editTile">Bearbeiten</button>
          <button class="danger deleteTile">Löschen</button>
        </div>
      </div>`;

    card.querySelector('.editTile').onclick=()=>openTileMaterialModal(item);
    card.querySelector('.deleteTile').onclick=()=>{
      if(confirm('Fliesenmaterial wirklich löschen?')){
        project.tileMaterials=project.tileMaterials.filter(x=>x.id!==item.id);
        save();
      }
    };
    list.appendChild(card);
  });
}

function openTileMaterialModal(item=null){
  tileEditingId=item?.id||null;
  tilePhotoData=item?.photo||null;

  const set=(id,val)=>{const el=$(id);if(el)el.value=val??''};
  set('tileBrand',item?.brand);
  set('tileModel',item?.model);
  set('tileFormat',item?.format);
  set('tileColor',item?.color);
  set('tileSurface',item?.surface);
  set('tileArticle',item?.article);
  set('tileQuantity',item?.quantity);
  set('tilePrice',item?.price);
  set('tileNotes',item?.notes);

  updateTilePhotoPreview();
  $('tileMaterialModal').classList.remove('hidden');
}

function closeTileMaterialModal(){
  $('tileMaterialModal').classList.add('hidden');
  tileEditingId=null;
  tilePhotoData=null;
  const input=$('tilePhotoInput');if(input)input.value='';
}

function updateTilePhotoPreview(){
  const host=$('tilePhotoPreview');
  if(!host)return;
  host.innerHTML=tilePhotoData
    ? `<img src="${tilePhotoData}" alt="Fliesenfoto">`
    : 'Noch kein Bild ausgewählt';
}

async function tileImageFromFile(file){
  return await img(file);
}

function saveTileMaterialRecord(){
  const p=cur();if(!p)return;
  p.tileMaterials=p.tileMaterials||[];

  const value=id=>$(id)?.value?.trim?.()??$(id)?.value??'';
  const record={
    id:tileEditingId||u(),
    brand:value('tileBrand'),
    model:value('tileModel'),
    format:value('tileFormat'),
    color:value('tileColor'),
    surface:value('tileSurface'),
    article:value('tileArticle'),
    quantity:value('tileQuantity'),
    price:value('tilePrice'),
    notes:value('tileNotes'),
    photo:tilePhotoData
  };

  const index=p.tileMaterials.findIndex(x=>x.id===record.id);
  if(index>=0)p.tileMaterials[index]=record;
  else p.tileMaterials.push(record);

  save();
  closeTileMaterialModal();
}

function saveTileProjectSettings(){
  const p=cur();if(!p)return;
  p.tileSettings=p.tileSettings||{};
  p.tileSettings.layoutPattern=$('tileLayoutPattern')?.value||'';
  p.tileSettings.jointWidth=$('tileJointWidth')?.value||'';
  p.tileSettings.jointColor=$('tileJointColor')?.value||'';
  p.tileSettings.siliconeColor=$('tileSiliconeColor')?.value||'';
  p.tileSettings.wastePercent=Number($('tileWastePercent')?.value||10);
  localStorage.setItem(K3,JSON.stringify(S));
}

function initTileTools(){
  const add=$('addTileMaterial');if(add)add.onclick=()=>openTileMaterialModal();
  const close=$('closeTileMaterialModal');if(close)close.onclick=closeTileMaterialModal;
  const cancel=$('cancelTileMaterial');if(cancel)cancel.onclick=closeTileMaterialModal;
  const saveBtn=$('saveTileMaterial');if(saveBtn)saveBtn.onclick=saveTileMaterialRecord;

  const photo=$('tilePhotoInput');
  if(photo)photo.onchange=async e=>{
    const file=e.target.files?.[0];
    if(file){
      tilePhotoData=await tileImageFromFile(file);
      updateTilePhotoPreview();
    }
  };

  ['tileLayoutPattern','tileJointWidth','tileJointColor','tileSiliconeColor','tileWastePercent']
    .forEach(id=>{
      const el=$(id);
      if(el)el.onchange=saveTileProjectSettings;
    });
}

let fp3DMode=false,fpViewMode='2d',fpWallView3D=false,fpWallViewSelectedId='',fp3DOptions={floorMaterialId:'',wallMaterialId:'',showCeiling:false,tileOriginX:0,tileOriginY:0,tileRotation:0};
let fpProject=null,fpRecord=null,fpTool='select',fpObjects=[],fpUndoStack=[],fpRedoStack=[];
let fpDrawing=false,fpStart=null,fpPreview=null,fpSelectedId=null,fpDragOffset=null,fpLastWallEnd=null,fpWallStartAnchor=null,fpObjectRotateDrag=null,fpPinchState=null,fpPickingFloorTileOrigin=false,fpDraggingFloorTileOrigin=false,fpFloorTileDragStart=null,fpEditingWallTileAreaId=null;
let fpWallMoveHold={timer:null,ready:false,wallId:null,start:null,moved:false,connected:[]};
let fpZoom=1,fpViewOffsetX=0,fpViewOffsetY=0,fpLastRenderError='',fpObjectWallSnap=true,fpGrid=5,fpFineStep=1,fpWallThickness=15,fpSnapEnabled=true,fpShowGrid=true,fpShowPositions=true,fpShowMeasures=true,fpAngleSnap=true,fpActiveLayer='walls',fpPanStart=null,fpLayerVisibility={walls:true,openings:true,sanitary:true,furniture:true,notes:true},fpEndpointDrag=null;

const fpCanvas=$('floorplanCanvas'),fpCtx=fpCanvas.getContext('2d');

function cloneObjects(){return JSON.parse(JSON.stringify(fpObjects))}
function pushHistory(){
  fpUndoStack.push(cloneObjects());
  if(fpUndoStack.length>60)fpUndoStack.shift();
  fpRedoStack=[];
}
function restoreObjects(arr){fpObjects=JSON.parse(JSON.stringify(arr));fpSelectedId=null;drawFloorplan();updateSelectedInfo()}

function layerForType(type){
  if(type==='wall')return 'walls';
  if(type==='door'||type==='window'||type==='niche')return 'openings';
  if(['wc','shower','walkInShower','glass','bathtub','sink','drain','kitchenSink','mirror'].includes(type))return 'sanitary';
  if(['stove','fridge','washingMachine','table','chair','sofa','bed','cabinet','plant'].includes(type))return 'furniture';
  return 'notes';
}

function isLayerVisible(o){
  return fpLayerVisibility[layerForType(o.type)]!==false;
}

function snapAnglePoint(start,p){
  const rawX=Number(p.x),rawY=Number(p.y);
  if(!fpAngleSnap)return {x:snap(rawX),y:snap(rawY)};

  const dx=rawX-start.x;
  const dy=rawY-start.y;
  const ax=Math.abs(dx),ay=Math.abs(dy);

  if(ax<.5 && ay<.5)return {x:start.x,y:start.y};

  // Strong orthogonal lock:
  // if the pointer is reasonably close to horizontal/vertical,
  // force the wall to be mathematically exact.
  const orthoTolerance=.40;

  if(ay <= ax*orthoTolerance){
    return {x:snap(rawX),y:start.y};
  }
  if(ax <= ay*orthoTolerance){
    return {x:start.x,y:snap(rawY)};
  }

  // Otherwise allow an exact 45° diagonal.
  const length=Math.max(ax,ay);
  return {
    x:snap(start.x + Math.sign(dx||1)*length),
    y:snap(start.y + Math.sign(dy||1)*length)
  };
}



function fpEndpointScreenPosition(end){
  const rect=fpCanvas?.getBoundingClientRect?.();
  if(!rect || !rect.width || !rect.height)return null;
  const sx=rect.width/Math.max(1,fpCanvas.width);
  const sy=rect.height/Math.max(1,fpCanvas.height);
  return {
    x:rect.left+(Number(end.x)*fpZoom+fpViewOffsetX)*sx,
    y:rect.top +(Number(end.y)*fpZoom+fpViewOffsetY)*sy
  };
}

function fpMagneticEndpointFromEvent(ev){
  if(!fpCanvas || ev?.clientX==null || ev?.clientY==null)return null;
  const coarse=window.matchMedia?.('(pointer: coarse)')?.matches;
  const radiusPx=coarse?110:72;
  let best=null,bestPx=Infinity;

  for(const w of (fpObjects||[])){
    if(w?.type!=='wall')continue;
    for(const end of [
      {x:Number(w.x1),y:Number(w.y1),wallId:w.id,end:'start'},
      {x:Number(w.x2),y:Number(w.y2),wallId:w.id,end:'end'}
    ]){
      const sp=fpEndpointScreenPosition(end);
      if(!sp)continue;
      const d=Math.hypot(Number(ev.clientX)-sp.x,Number(ev.clientY)-sp.y);
      if(d<=radiusPx && d<bestPx){
        best={...end,screenDistance:d};
        bestPx=d;
      }
    }
  }
  return best;
}

function nearestWallEndpoint(p,maxDistance=null){
  // v2.9.43 TRUE MAGNET:
  // Compare in real CSS screen pixels. Canvas backing pixels can be 2x/3x on
  // tablets, therefore a simple px/zoom calculation made the magnet too weak.
  const z=Math.max(.15,Number(fpZoom)||1);
  const rect=fpCanvas?.getBoundingClientRect?.();
  const backingScale=(rect&&rect.width>0&&fpCanvas?.width) ? fpCanvas.width/rect.width : 1;
  const coarse=window.matchMedia?.('(pointer: coarse)')?.matches;
  const magnetPx=coarse?72:46;
  const limit=Number.isFinite(Number(maxDistance))
    ? Number(maxDistance)
    : (magnetPx*backingScale/z);

  let best=null,bestDist=Infinity;
  for(const w of fpObjects){
    if(w.type!=='wall')continue;
    for(const end of [
      {x:Number(w.x1),y:Number(w.y1),wallId:w.id,end:'start'},
      {x:Number(w.x2),y:Number(w.y2),wallId:w.id,end:'end'}
    ]){
      const d=Math.hypot(Number(p.x)-end.x,Number(p.y)-end.y);
      if(d<=limit && d<bestDist){
        best={...end,distance:d,screenDistance:d*z/backingScale};
        bestDist=d;
      }
    }
  }
  return best;
}

function rayWallIntersection(start,end){
  const dx=end.x-start.x;
  const dy=end.y-start.y;
  const horizontal=Math.abs(dy)<0.001 && Math.abs(dx)>0.001;
  const vertical=Math.abs(dx)<0.001 && Math.abs(dy)>0.001;
  if(!horizontal && !vertical)return null;

  const dir=horizontal?Math.sign(dx):Math.sign(dy);
  let best=null;
  let bestForward=Infinity;

  for(const w of fpObjects){
    if(w.type!=='wall')continue;

    const ax=Number(w.x1),ay=Number(w.y1);
    const bx=Number(w.x2),by=Number(w.y2);

    // Ignore a wall endpoint that is effectively the current start point.
    if(Math.min(Math.hypot(ax-start.x,ay-start.y),Math.hypot(bx-start.x,by-start.y))<3)continue;

    let ix,iy;

    if(horizontal){
      // Segment must cross the horizontal ray Y.
      const minY=Math.min(ay,by)-0.001;
      const maxY=Math.max(ay,by)+0.001;
      if(start.y<minY || start.y>maxY)continue;

      if(Math.abs(by-ay)<0.001){
        // Collinear horizontal wall: use nearest endpoint in forward direction.
        const candidates=[ax,bx].filter(x=>(x-start.x)*dir>3);
        if(!candidates.length)continue;
        ix=candidates.sort((u,v)=>Math.abs(u-start.x)-Math.abs(v-start.x))[0];
        iy=start.y;
      }else{
        const t=(start.y-ay)/(by-ay);
        if(t<-0.001||t>1.001)continue;
        ix=ax+t*(bx-ax);
        iy=start.y;
      }

      const forward=(ix-start.x)*dir;
      if(forward<=3)continue;
      if(forward<bestForward){
        bestForward=forward;
        best={x:ix,y:iy,distance:forward,axis:'horizontal'};
      }
    }else{
      const minX=Math.min(ax,bx)-0.001;
      const maxX=Math.max(ax,bx)+0.001;
      if(start.x<minX || start.x>maxX)continue;

      if(Math.abs(bx-ax)<0.001){
        const candidates=[ay,by].filter(y=>(y-start.y)*dir>3);
        if(!candidates.length)continue;
        iy=candidates.sort((u,v)=>Math.abs(u-start.y)-Math.abs(v-start.y))[0];
        ix=start.x;
      }else{
        const t=(start.x-ax)/(bx-ax);
        if(t<-0.001||t>1.001)continue;
        iy=ay+t*(by-ay);
        ix=start.x;
      }

      const forward=(iy-start.y)*dir;
      if(forward<=3)continue;
      if(forward<bestForward){
        bestForward=forward;
        best={x:ix,y:iy,distance:forward,axis:'vertical'};
      }
    }
  }

  return best;
}

function smartWallEndpoint(start,p){
  // v2.9.43 drawing rule:
  // During drawing, walls are ALWAYS mathematically horizontal or vertical.
  // Arbitrary angles are entered later in the selected-wall inspector.
  const raw={x:Number(p.x),y:Number(p.y)};
  const dx=raw.x-Number(start.x);
  const dy=raw.y-Number(start.y);
  const horizontal=Math.abs(dx)>=Math.abs(dy);

  let base=horizontal
    ? {x:snap(raw.x),y:Number(start.y)}
    : {x:Number(start.x),y:snap(raw.y)};

  // If an existing corner is close to the pointer AND lies nearly on the chosen
  // axis, use its exact saved coordinate. This closes rooms without tiny gaps.
  const corner=nearestWallEndpoint(raw);
  if(corner && Math.hypot(corner.x-start.x,corner.y-start.y)>3){
    const axisTolerance=Math.max(3,28/Math.max(.15,Number(fpZoom)||1));
    const aligns=horizontal
      ? Math.abs(corner.y-start.y)<=axisTolerance
      : Math.abs(corner.x-start.x)<=axisTolerance;

    if(aligns){
      base=horizontal
        ? {x:Number(corner.x),y:Number(start.y)}
        : {x:Number(start.x),y:Number(corner.y)};
      return {
        point:base,
        target:{x:base.x,y:base.y,distance:Math.hypot(base.x-start.x,base.y-start.y),axis:'corner'},
        snapped:true
      };
    }
  }

  // Retain opposite-wall intersection for orthogonal walls.
  const target=rayWallIntersection(start,base);
  if(!target)return {point:base,target:null,snapped:false};

  const pointerDistance=Math.hypot(base.x-start.x,base.y-start.y);
  const targetDistance=Math.hypot(target.x-start.x,target.y-start.y);
  const snapTolerance=Math.max(25,Math.min(70,targetDistance*.10));
  const close=Math.abs(pointerDistance-targetDistance)<=snapTolerance;
  const passed=pointerDistance>=targetDistance;

  if(close||passed){
    return {
      point:{x:Number(target.x),y:Number(target.y)},
      target,
      snapped:true
    };
  }
  return {point:base,target,snapped:false};
}

function drawLiveWallDimension(preview){
  if(!preview || preview.type!=='wall')return;

  const x1=Number(preview.x1),y1=Number(preview.y1);
  const x2=Number(preview.x2),y2=Number(preview.y2);
  const mx=(x1+x2)/2,my=(y1+y2)/2;
  const len=Math.round(dist({x:x1,y:y1},{x:x2,y:y2}));

  fpCtx.save();

  // Live dimension bubble.
  const zoom=(typeof fpZoom==='number'&&fpZoom>0)?fpZoom:1;
  fpCtx.font=`bold ${16/zoom}px Arial`;
  fpCtx.textAlign='center';
  fpCtx.textBaseline='middle';

  const text=`${formatDimensionMeters(len)} m`;
  const pad=7/zoom;
  const tw=fpCtx.measureText(text).width+pad*2;
  const th=28/zoom;

  fpCtx.fillStyle='rgba(37,99,235,.96)';
  fpCtx.strokeStyle='#ffffff';
  fpCtx.lineWidth=1.5/zoom;
  fpCtx.fillRect(mx-tw/2,my-th/2-24/zoom,tw,th);
  fpCtx.strokeRect(mx-tw/2,my-th/2-24/zoom,tw,th);
  fpCtx.fillStyle='#ffffff';
  fpCtx.fillText(text,mx,my-24/zoom);

  // Start point marker.
  fpCtx.fillStyle=fpWallStartAnchor?'#16a34a':'#2563eb';
  fpCtx.beginPath();
  fpCtx.arc(x1,y1,(fpWallStartAnchor?12:5)/zoom,0,Math.PI*2);
  fpCtx.fill();
  if(fpWallStartAnchor){
    fpCtx.strokeStyle='#16a34a';
    fpCtx.lineWidth=3/zoom;
    fpCtx.beginPath();
    fpCtx.arc(x1,y1,18/zoom,0,Math.PI*2);
    fpCtx.stroke();
  }

  // Opposite wall target marker / guide.
  if(preview.snapTarget){
    const t=preview.snapTarget;
    fpCtx.strokeStyle=preview.snappedToTarget?'#16a34a':'#2563eb';
    fpCtx.fillStyle=preview.snappedToTarget?'#16a34a':'#2563eb';
    fpCtx.lineWidth=2/zoom;
    fpCtx.setLineDash([7/zoom,5/zoom]);

    fpCtx.beginPath();
    fpCtx.moveTo(x1,y1);
    fpCtx.lineTo(t.x,t.y);
    fpCtx.stroke();

    fpCtx.setLineDash([]);
    fpCtx.beginPath();
    fpCtx.arc(t.x,t.y,8/zoom,0,Math.PI*2);
    fpCtx.stroke();

    fpCtx.font=`bold ${12/zoom}px Arial`;
    fpCtx.textAlign='left';
    fpCtx.fillStyle=preview.snappedToTarget?'#15803d':'#1d4ed8';
    fpCtx.fillText(
      preview.snappedToTarget ? 'Duvara yakalandı' : `Karşı duvar: ${Math.round(t.distance)} cm`,
      t.x+12/zoom,t.y-10/zoom
    );
  }

  fpCtx.restore();
}

function duplicateSelected(){
  const o=selectedObject();
  if(!o)return;
  pushHistory();
  const copy=JSON.parse(JSON.stringify(o));
  copy.id=uidObj();
  if(copy.type==='wall'){
    copy.x1+=20;copy.x2+=20;copy.y1+=20;copy.y2+=20;
  }else{
    copy.x=(copy.x||0)+20;copy.y=(copy.y||0)+20;
  }
  fpObjects.push(copy);
  fpSelectedId=copy.id;
  drawFloorplan();
  updateSelectedInfo();
}



function wallLetter(index){
  let n=index+1,s='';
  while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}
  return s;
}
function refreshWallLetters(){
  let i=0;
  for(const o of fpObjects){
    if(o.type==='wall')o.wallLabel=wallLetter(i++);
  }
}
function refreshOpeningPanel(){
  const o=selectedObject();
  const panel=$('fpOpeningPanel');
  const dir=$('fpOpeningDirection');
  const title=$('fpOpeningTitle');
  const width=$('fpOpeningWidth');
  const height=$('fpOpeningHeight');
  const side=$('fpOpeningSide');
  const face=$('fpWallFace');
  const swingRow=$('fpDoorSwingRow');
  const sillRow=$('fpWindowSillRow');
  const sill=$('fpWindowSillHeight');

  const isOpening=!!o&&(o.type==='door'||o.type==='window');
  if(panel)panel.classList.toggle('hidden',!isOpening);
  if(!isOpening)return;

  ensureOpeningDefaults(o);

  if(title)title.textContent=o.type==='door'?'Tür':'Fenster';
  if(dir)dir.value=o.openingDirection||'right';
  if(width)width.value=Math.round(Number(o.widthCm)||90);
  if(height)height.value=Math.round(Number(o.heightCm)||(o.type==='door'?205:120));
  if(side)side.value=o.openingSide||'inside';
  if(face)face.value=o.wallFace||'inside';

  if(swingRow)swingRow.classList.toggle('hidden',o.type!=='door');
  if(sillRow)sillRow.classList.toggle('hidden',o.type!=='window');
  if(sill)sill.value=Math.round(Number(o.sillHeightCm)||90);
}

function ensureOpeningDefaults(o){
  if(!o||(o.type!=='door'&&o.type!=='window'))return;
  if(!Number.isFinite(Number(o.widthCm)))o.widthCm=o.type==='door'?90:100;
  if(!Number.isFinite(Number(o.depthCm)))o.depthCm=15;
  if(!Number.isFinite(Number(o.heightCm)))o.heightCm=o.type==='door'?205:120;
  if(o.type==='window'&&!Number.isFinite(Number(o.sillHeightCm)))o.sillHeightCm=90;
  if(o.openingDirection!=='left'&&o.openingDirection!=='right')o.openingDirection='right';
  if(o.openingSide!=='inside'&&o.openingSide!=='outside')o.openingSide='inside';
  if(o.wallFace!=='inside'&&o.wallFace!=='outside')o.wallFace='inside';
}

function assignWallPlacementMeta(o,placed){
  if(!o||!placed)return;
  if(placed.wallId)o.wallId=placed.wallId;
  if(Number.isFinite(Number(placed.wallInteriorSign)))o.wallInteriorSign=Number(placed.wallInteriorSign);
  if(o.type==='niche'){
    o.nicheEmbedded=placed.nicheEmbedded!==false;
    if(Number.isFinite(Number(placed.nicheOpeningX)))o.nicheOpeningX=Number(placed.nicheOpeningX);
    if(Number.isFinite(Number(placed.nicheOpeningY)))o.nicheOpeningY=Number(placed.nicheOpeningY);
  }
}

function reSnapOpeningToWall(o){
  if(!o||(o.type!=='door'&&o.type!=='window'))return;
  const near=nearestWallForObject({x:Number(o.x)||0,y:Number(o.y)||0});
  if(!near)return;
  const placed=snapObjectToWall(o,near.point.x,near.point.y);
  o.x=placed.x;o.y=placed.y;o.rotation=placed.rotation;
  assignWallPlacementMeta(o,placed);
}

function changeOpeningDirection(){
  const o=selectedObject();
  if(!o||(o.type!=='door'&&o.type!=='window'))return;
  const v=$('fpOpeningDirection')?.value;
  if(v!=='left'&&v!=='right')return;
  pushHistory();
  o.openingDirection=v;
  drawFloorplan();
  updateSelectedInfo();
  if(fp3DMode)refresh3D();
}

function changeOpeningSide(){
  const o=selectedObject();
  if(!o||o.type!=='door')return;
  const v=$('fpOpeningSide')?.value;
  if(v!=='inside'&&v!=='outside')return;
  pushHistory();
  o.openingSide=v;
  drawFloorplan();
  updateSelectedInfo();
  if(fp3DMode)refresh3D();
}

function changeOpeningWallFace(){
  const o=selectedObject();
  if(!o||(o.type!=='door'&&o.type!=='window'))return;
  const v=$('fpWallFace')?.value;
  if(v!=='inside'&&v!=='outside')return;
  pushHistory();
  o.wallFace=v;
  reSnapOpeningToWall(o);
  drawFloorplan();
  updateSelectedInfo();
  if(fp3DMode)refresh3D();
}

function changeOpeningDimensions(){
  const o=selectedObject();
  if(!o||(o.type!=='door'&&o.type!=='window'))return;

  const width=Math.max(20,Math.min(500,Number($('fpOpeningWidth')?.value)||Number(o.widthCm)||90));
  const height=Math.max(20,Math.min(400,Number($('fpOpeningHeight')?.value)||Number(o.heightCm)||(o.type==='door'?205:120)));

  pushHistory();
  o.widthCm=width;
  o.heightCm=height;

  if(o.type==='window'){
    o.sillHeightCm=Math.max(0,Math.min(300,Number($('fpWindowSillHeight')?.value)||0));
  }

  reSnapOpeningToWall(o);
  drawFloorplan();
  updateSelectedInfo();
  if(fp3DMode)refresh3D();
}

function wallAngleDeg(o){
  if(!o||o.type!=='wall')return 0;
  let deg=Math.atan2(Number(o.y2)-Number(o.y1),Number(o.x2)-Number(o.x1))*180/Math.PI;
  if(deg<0)deg+=360;
  return deg;
}

function nearestCadAngle(deg){
  const allowed=[0,45,90,135,180,225,270,315];
  let best=allowed[0],bestDiff=Infinity;
  for(const a of allowed){
    const d=Math.min(Math.abs(deg-a),360-Math.abs(deg-a));
    if(d<bestDiff){bestDiff=d;best=a}
  }
  return best;
}


/* === v2.9.43 INNER-LENGTH WALL INPUT MODEL ===
   The user-facing wall length is ALWAYS the effective inner dimension.
   The saved geometric outer/miter length is:
       outer = inner + 2 * wallThickness
   Example: inner 277 cm, wall 10 cm -> outer geometry 297 cm.
*/
function fpWallInnerInputLength2936(wall){
  if(!wall||wall.type!=='wall')return 0;
  const stored=Number(wall.innerLengthCm);
  if(Number.isFinite(stored)&&stored>0)return stored;

  // Legacy migration only once.
  const raw=Math.hypot(Number(wall.x2)-Number(wall.x1),Number(wall.y2)-Number(wall.y1));
  const t=Math.max(0,Number(wall.thickness||fpWallThickness||15));
  const inferred=Math.max(.1,raw-2*t);
  wall.innerLengthCm=inferred;
  wall.outerLengthCm=raw;
  return inferred;
}

function fpCurrentWallThickness2937(wall){
  const candidates=[
    document.getElementById('fpWallThickness')?.value,
    document.getElementById('fpQuickWallThickness')?.value,
    wall?.thickness,
    fpWallThickness,
    15
  ];
  for(const v of candidates){
    const n=Number(v);
    if(Number.isFinite(n)&&n>0)return n;
  }
  return 15;
}
function fpWallOuterGeometryLength2936(innerLength,wall){
  const t=fpCurrentWallThickness2937(wall);
  return Math.max(0,Number(innerLength)||0)+2*t;
}
function fpApplyInnerLengthToWall2936(wall,innerLength,angleDeg){
  if(!wall||wall.type!=='wall')return;
  const inner=Math.max(.1,Number(innerLength)||0);
  const t=fpCurrentWallThickness2937(wall);

  // v2.9.43: one source of truth for thickness.
  wall.thickness=t;
  fpWallThickness=t;

  // IMPORTANT: thickness is added ONCE per end only.
  const outer=inner+2*t;
  const rad=Number(angleDeg)*Math.PI/180;

  wall.innerLengthCm=inner;
  wall.outerLengthCm=outer;

  wall.x2=Number(wall.x1)+Math.cos(rad)*outer;
  wall.y2=Number(wall.y1)+Math.sin(rad)*outer;

  if(Math.abs(Math.cos(rad))<1e-10)wall.x2=Number(wall.x1);
  if(Math.abs(Math.sin(rad))<1e-10)wall.y2=Number(wall.y1);

  wall.x2=Math.round(wall.x2*1000)/1000;
  wall.y2=Math.round(wall.y2*1000)/1000;
}
function setSelectedWallGeometry(){
  const o=selectedObject();
  if(!o||o.type!=='wall')return;

  const lenInput=$('fpWallLength');
  const angleInput=$('fpWallAngle');

  // IMPORTANT: this value is the effective INNER length.
  const innerLength=Number(lenInput?.value);
  if(!Number.isFinite(innerLength)||innerLength<=0)return;

  let angleDeg=wallAngleDeg(o);
  const requested=angleInput?.value;
  if(requested!=='' && requested!=null && requested!=='auto' && Number.isFinite(Number(requested))){
    angleDeg=((Number(requested)%360)+360)%360;
  }

  pushHistory();
  fpApplyInnerLengthToWall2936(o,innerLength,angleDeg);

  drawFloorplan();
  updateSelectedInfo();
  updateWallEndpointFields?.();
  updateWallQuickPanel?.();
}



function ensureWallTileAreas(wall){
  if(!wall)return [];
  if(!Array.isArray(wall.tileAreas))wall.tileAreas=[];
  return wall.tileAreas;
}

function wallTileAreaM2(area){
  return Math.max(0,Number(area?.width||0))*Math.max(0,Number(area?.height||0))/10000;
}

function wallTileTotalM2(wall){
  return ensureWallTileAreas(wall).reduce((sum,area)=>sum+wallTileAreaM2(area),0);
}

function wallRawGeometryLengthCm2936(wall){
  return dist({x:Number(wall.x1),y:Number(wall.y1)},{x:Number(wall.x2),y:Number(wall.y2)});
}

function fpWallLengthSanity2937(wall){
  const inner=fpWallInnerInputLength2936(wall);
  const t=fpCurrentWallThickness2937(wall);
  const outer=Math.hypot(Number(wall.x2)-Number(wall.x1),Number(wall.y2)-Number(wall.y1));
  return {inner,thickness:t,expectedOuter:inner+2*t,actualOuter:outer};
}
function wallLengthCm(wall){
  // Public/user-facing wall length = effective inner length.
  return fpWallInnerInputLength2936(wall);
}

function sanitizeWallTileDraft(wall){
  const wallLen=wallLengthCm(wall);
  const roomHeightCm=Math.max(1,Number(fpRecord?.roomHeightM||2.4)*100);

  let offset=Math.max(0,Number($('fpWallTileOffset')?.value||0));
  let width=Math.max(1,Number($('fpWallTileWidth')?.value||100));
  let bottom=Math.max(0,Number($('fpWallTileBottom')?.value||0));
  let height=Math.max(1,Number($('fpWallTileHeight')?.value||120));

  offset=Math.min(offset,wallLen);
  width=Math.min(width,Math.max(1,wallLen-offset));

  bottom=Math.min(bottom,roomHeightCm);
  height=Math.min(height,Math.max(1,roomHeightCm-bottom));

  return {
    id:`tile_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    offset:Math.round(offset*10)/10,
    width:Math.round(width*10)/10,
    bottom:Math.round(bottom*10)/10,
    height:Math.round(height*10)/10,
    tileW:Math.max(1,Number($('fpWallTileSizeW')?.value||60)),
    tileH:Math.max(1,Number($('fpWallTileSizeH')?.value||60)),
    jointMm:Math.max(0,Number($('fpWallTileJoint')?.value||2)),
    pattern:$('fpWallTilePattern')?.value||'straight',
    materialId:$('fpWallTileMaterial')?.value||'',
    syncToFloor:true
  };
}

function updateWallTileDraftInfo(){
  const o=selectedObject();
  const info=$('fpWallTilePreviewInfo');
  if(!o || o.type!=='wall' || !info)return;

  const draft=sanitizeWallTileDraft(o);
  info.textContent=
    `Fläche: ${formatCHNumber(wallTileAreaM2(draft),2)} m² · `+
    `${Math.round(draft.width)} × ${Math.round(draft.height)} cm`;
}


function setWallTileEditMode(areaId=null){
  fpEditingWallTileAreaId=areaId||null;

  const add=$('fpWallTileAdd');
  const update=$('fpWallTileUpdate');
  const cancel=$('fpWallTileCancelEdit');

  if(add)add.classList.toggle('hidden',!!fpEditingWallTileAreaId);
  if(update)update.classList.toggle('hidden',!fpEditingWallTileAreaId);
  if(cancel)cancel.classList.toggle('hidden',!fpEditingWallTileAreaId);
}

function loadWallTileAreaForEdit(areaId){
  const wall=selectedObject();
  if(!wall||wall.type!=='wall')return;

  const area=ensureWallTileAreas(wall).find(a=>a.id===areaId);
  if(!area)return;

  setWallTileEditMode(areaId);

  const set=(id,value)=>{
    const el=$(id);
    if(el)el.value=String(value??'');
  };

  set('fpWallTileOffset',area.offset??0);
  set('fpWallTileWidth',area.width??100);
  set('fpWallTileBottom',area.bottom??0);
  set('fpWallTileHeight',area.height??120);
  set('fpWallTileSizeW',area.tileW??60);
  set('fpWallTileSizeH',area.tileH??60);
  set('fpWallTileJoint',area.jointMm??2);
  set('fpWallTilePattern',area.pattern||'straight');

  const mat=$('fpWallTileMaterial');
  if(mat){
    refreshCadTileMaterialSelects();
    mat.value=area.materialId||'';
  }
  wall._draftTileMaterialId=area.materialId||'';

  updateWallTileDraftInfo();
  renderWallTileList();
}

function cancelWallTileAreaEdit(){
  setWallTileEditMode(null);
  const wall=selectedObject();
  if(wall?.type==='wall')wall._draftTileMaterialId='';
  updateWallTileDraftInfo();
  renderWallTileList();
}

function updateWallTileArea(){
  const wall=selectedObject();
  if(!wall||wall.type!=='wall'||!fpEditingWallTileAreaId)return;

  const areas=ensureWallTileAreas(wall);
  const index=areas.findIndex(a=>a.id===fpEditingWallTileAreaId);
  if(index<0){
    cancelWallTileAreaEdit();
    return;
  }

  const edited=sanitizeWallTileDraft(wall);
  edited.id=areas[index].id;

  const materialId=
    $('fpWallTileMaterial')?.value ||
    wall._draftTileMaterialId ||
    areas[index].materialId ||
    '';

  edited.materialId=materialId;

  pushHistory();
  areas[index]=edited;

  wall._draftTileMaterialId='';
  setWallTileEditMode(null);

  save();
  drawFloorplan();
  renderWallTileList();
  updateWallQuickPanel();

  if(fp3DMode)refresh3D();
}

function renderWallTileList(){
  const wall=selectedObject();
  const list=$('fpWallTileList');
  const total=$('fpWallTileAreaTotal');

  if(!list||!total)return;

  if(!wall || wall.type!=='wall'){
    list.innerHTML='';
    total.textContent='0.00 m²';
    return;
  }

  const areas=ensureWallTileAreas(wall);
  total.textContent=`${formatCHNumber(wallTileTotalM2(wall),2)} m²`;

  if(!areas.length){
    list.innerHTML='<div style="font-size:11px;color:#64748b">Noch keine Fliesenfläche.</div>';
    return;
  }

  list.innerHTML=areas.map((area,index)=>{
    const pattern=
      area.pattern==='half'?'Halbverband':
      area.pattern==='vertical'?'Hochformat':'Gerade';

    return `
      <div class="fp-wall-tile-item ${fpEditingWallTileAreaId===area.id?'fp-wall-tile-editing':''}">
        <div>
          <strong>F${index+1} · ${formatCHNumber(wallTileAreaM2(area),2)} m²</strong>
          <small>${Math.round(area.width)} × ${Math.round(area.height)} cm · ab ${Math.round(area.offset)} cm · UK ${Math.round(area.bottom)} cm</small>
          <small>Fliese ${Math.round(area.tileW)} × ${Math.round(area.tileH)} cm · ${pattern}</small>
          ${fpEditingWallTileAreaId===area.id?'<div class="fp-wall-tile-edit-note">Diese Fliesenfläche wird bearbeitet.</div>':''}
        </div>
        <div class="fp-wall-tile-item-actions">
          <button type="button" data-wall-tile-edit="${area.id}" title="Bearbeiten">✎</button>
          <button type="button" data-wall-tile-delete="${area.id}" title="Löschen">×</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-wall-tile-edit]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-wall-tile-edit');
      loadWallTileAreaForEdit(id);
    };
  });

  list.querySelectorAll('[data-wall-tile-delete]').forEach(btn=>{
    btn.onclick=()=>{
      const wallNow=selectedObject();
      if(!wallNow||wallNow.type!=='wall')return;

      const id=btn.getAttribute('data-wall-tile-delete');
      pushHistory();
      wallNow.tileAreas=ensureWallTileAreas(wallNow).filter(a=>a.id!==id);
      if(fpEditingWallTileAreaId===id)setWallTileEditMode(null);

      save();
      drawFloorplan();
      renderWallTileList();
      updateWallQuickPanel();
    };
  });
}


function chosenTileMaterialId(source='floor'){
  if(source==='wall'){
    return $('fpWallTileMaterial')?.value || selectedObject()?._draftTileMaterialId || ensureFloorTileConfig()?.materialId || '';
  }
  return $('fpFloorTileMaterial')?.value || ensureFloorTileConfig()?.materialId || $('fpWallTileMaterial')?.value || '';
}

function applyTileToWholeFloor(materialId){
  const cfg=ensureFloorTileConfig();
  if(!cfg)return;

  readFloorTileControls(cfg);
  if(materialId)cfg.materialId=materialId;
  cfg.enabled=true;

  syncFloorTileTo3D(cfg);
}

function applyTileToAllWalls(materialId, source='floor'){
  if(!fpRecord)return;
  const walls=(fpObjects||[]).filter(o=>o.type==='wall');
  if(!walls.length)return;

  const roomHeightCm=Math.max(1,Number(fpRecord.roomHeightM||2.4)*100);
  const floorCfg=ensureFloorTileConfig();

  const tileW=Math.max(1,
    source==='wall'
      ? Number($('fpWallTileSizeW')?.value||floorCfg?.tileW||60)
      : Number(floorCfg?.tileW||$('fpFloorTileW')?.value||60)
  );
  const tileH=Math.max(1,
    source==='wall'
      ? Number($('fpWallTileSizeH')?.value||floorCfg?.tileH||60)
      : Number(floorCfg?.tileH||$('fpFloorTileH')?.value||60)
  );
  const jointMm=Math.max(0,
    source==='wall'
      ? Number($('fpWallTileJoint')?.value||floorCfg?.jointMm||2)
      : Number(floorCfg?.jointMm||$('fpFloorTileJoint')?.value||2)
  );

  walls.forEach((wall,index)=>{
    const len=dist({x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2});
    wall.tileAreas=[{
      id:`tile_all_${Date.now()}_${index}`,
      offset:0,
      width:Math.round(len*10)/10,
      bottom:0,
      height:Math.round(roomHeightCm*10)/10,
      tileW,
      tileH,
      jointMm,
      pattern:'straight',
      materialId:materialId||'',
      syncToFloor:true
    }];
    wall._draftTileMaterialId=materialId||'';
  });
}

function applyChosenTileEverywhere(target,source='floor'){
  const materialId=chosenTileMaterialId(source);
  if(!materialId){
    alert('Bitte zuerst ein Fliesenbild / Material auswählen.');
    return;
  }

  pushHistory();

  if(target==='floor' || target==='room'){
    applyTileToWholeFloor(materialId);
  }
  if(target==='walls' || target==='room'){
    applyTileToAllWalls(materialId,source);
  }

  save();
  updateFloorTilePanel();
  updateWallQuickPanel();
  drawFloorplan();

  // Refresh immediately when 3D is open. When 2D is open, current3DData()
  // will carry the same data as soon as 3D is opened.
  if(fp3DMode)refresh3D();
}

function addWallTileArea(){
  const wall=selectedObject();
  if(!wall || wall.type!=='wall')return;

  const area=sanitizeWallTileDraft(wall);if(wall._draftTileMaterialId)area.materialId=wall._draftTileMaterialId;
  if(area.width<=0 || area.height<=0)return;

  pushHistory();
  ensureWallTileAreas(wall).push(area);
  setWallTileEditMode(null);
  save();

  drawFloorplan();
  renderWallTileList();
  updateWallQuickPanel();
}

function wallTileBandPoints(wall,area){
  const dx=Number(wall.x2)-Number(wall.x1);
  const dy=Number(wall.y2)-Number(wall.y1);
  const len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len;

  const start=Math.max(0,Math.min(len,Number(area.offset||0)));
  const end=Math.max(start,Math.min(len,start+Number(area.width||0)));

  return {
    x1:Number(wall.x1)+ux*start,
    y1:Number(wall.y1)+uy*start,
    x2:Number(wall.x1)+ux*end,
    y2:Number(wall.y1)+uy*end,
    ux,uy
  };
}

function drawWallTileAreas2D(wall){
  const areas=ensureWallTileAreas(wall);
  if(!areas.length)return;

  const z=Math.max(.2,fpZoom||1);
  const baseWidth=Math.max(8,(Number(wall.thickness||15))/2);

  areas.forEach((area,index)=>{
    const p=wallTileBandPoints(wall,area);

    fpCtx.save();

    // Thick cyan overlay on the selected part of the wall.
    fpCtx.strokeStyle='rgba(8,145,178,.88)';
    fpCtx.lineWidth=baseWidth+8/z;
    fpCtx.lineCap='butt';
    fpCtx.setLineDash([7/z,4/z]);
    fpCtx.beginPath();
    fpCtx.moveTo(p.x1,p.y1);
    fpCtx.lineTo(p.x2,p.y2);
    fpCtx.stroke();
    fpCtx.setLineDash([]);

    const mx=(p.x1+p.x2)/2;
    const my=(p.y1+p.y2)/2;
    const nx=-p.uy,ny=p.ux;

    fpCtx.fillStyle='#0e7490';
    fpCtx.font=`bold ${11/z}px Arial`;
    fpCtx.textAlign='center';
    fpCtx.textBaseline='middle';
    fpCtx.fillText(
      `F${index+1} · ${Math.round(area.width)}×${Math.round(area.height)} cm · ${formatCHNumber(wallTileAreaM2(area),2)} m²`,
      mx+nx*(24/z),
      my+ny*(24/z)
    );

    fpCtx.restore();
  });
}


function ensureFloorTileConfig(){if(!fpRecord)return null;if(!fpRecord.floorTile)fpRecord.floorTile={enabled:false,tileW:60,tileH:60,jointMm:2,pattern:'straight',originMode:'manual',originX:0,originY:0,align:'room',materialId:''};return fpRecord.floorTile}
function roomBoundsCm(){const w=(fpObjects||[]).filter(o=>o.type==='wall');if(!w.length)return null;const xs=[],ys=[];w.forEach(v=>{xs.push(+v.x1,+v.x2);ys.push(+v.y1,+v.y2)});return{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)}}
function resolveFloorTileOrigin(c){const b=roomBoundsCm();if(!b)return{x:+c.originX||0,y:+c.originY||0};const m=c.originMode||'manual';if(m==='topLeft')return{x:b.minX,y:b.minY};if(m==='topRight')return{x:b.maxX,y:b.minY};if(m==='bottomLeft')return{x:b.minX,y:b.maxY};if(m==='bottomRight')return{x:b.maxX,y:b.maxY};if(m==='center')return{x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};return{x:+c.originX||0,y:+c.originY||0}}

function floorTileOriginHandleHit(p){
  const c=ensureFloorTileConfig();
  if(!c?.enabled || (c.originMode||'manual')!=='manual')return false;
  const o=resolveFloorTileOrigin(c);
  const r=22/Math.max(.2,fpZoom||1);
  return Math.hypot(p.x-o.x,p.y-o.y)<=r;
}
function setFloorTileOriginFromPoint(p,live=true){
  const c=ensureFloorTileConfig();if(!c)return;
  c.enabled=true;c.originMode='manual';
  // Manuel Einteilung: no grid snapping. User can slide joints continuously.
  c.originX=Math.round(Number(p.x)*10)/10;
  c.originY=Math.round(Number(p.y)*10)/10;
  const ox=$('fpFloorTileOriginX'),oy=$('fpFloorTileOriginY'),mode=$('fpFloorTileOriginMode');
  if(ox)ox.value=String(c.originX);
  if(oy)oy.value=String(c.originY);
  if(mode)mode.value='manual';
  syncFloorTileTo3D(c);
  if(live){drawFloorplan();if(fp3DMode)refresh3D();}
}

function readFloorTileControls(c){c.tileW=Math.max(1,+$('fpFloorTileW')?.value||60);c.tileH=Math.max(1,+$('fpFloorTileH')?.value||60);c.jointMm=Math.max(0,+$('fpFloorTileJoint')?.value||0);c.pattern=$('fpFloorTilePattern')?.value||'straight';c.originMode=$('fpFloorTileOriginMode')?.value||'manual';c.align=$('fpFloorTileAlign')?.value||'room';c.originX=+$('fpFloorTileOriginX')?.value||0;c.originY=+$('fpFloorTileOriginY')?.value||0;c.materialId=$('fpFloorTileMaterial')?.value||''}

function tileMaterialOptionsHtml(selected=''){
  const mats=fpProject?.tileMaterials||[];
  return '<option value="">Neutral</option>'+mats.map(m=>{
    const label=[m.brand,m.model,m.format].filter(Boolean).join(' · ')||'Fliese';
    return `<option value="${m.id}" ${m.id===selected?'selected':''}>${esc(label)}</option>`;
  }).join('');
}
async function createTileMaterialFromUpload(file){
  if(!file||!fpProject)return '';
  const photo=await tileImageFromFile(file);
  const rec={
    id:u(),brand:'',model:file.name.replace(/\.[^.]+$/,''),format:'',color:'',
    surface:'',article:'',quantity:'',price:'',notes:'CAD Upload',photo
  };
  fpProject.tileMaterials=fpProject.tileMaterials||[];
  fpProject.tileMaterials.push(rec);
  save();
  return rec.id;
}
function refreshCadTileMaterialSelects(){
  const fc=ensureFloorTileConfig();
  const fs=$('fpFloorTileMaterial');
  if(fs){fs.innerHTML=tileMaterialOptionsHtml(fc?.materialId||'');fs.value=fc?.materialId||'';}
  const wall=selectedObject();
  const ws=$('fpWallTileMaterial');
  if(ws){
    const current=wall?.type==='wall' ? (wall._draftTileMaterialId||'') : '';
    ws.innerHTML=tileMaterialOptionsHtml(current);ws.value=current;
  }
}

function updateFloorTilePanel(){const c=ensureFloorTileConfig();if(!c)return;for(const [id,v] of Object.entries({fpFloorTileW:c.tileW,fpFloorTileH:c.tileH,fpFloorTileJoint:c.jointMm,fpFloorTilePattern:c.pattern,fpFloorTileOriginMode:c.originMode,fpFloorTileAlign:c.align,fpFloorTileOriginX:c.originX,fpFloorTileOriginY:c.originY})){const e=$(id);if(e)e.value=String(v)}refreshCadTileMaterialSelects();const ms=$('fpFloorTileMaterial');if(ms)ms.value=c.materialId||'';updateFloorTileInfo()}
function updateFloorTileInfo(){const c=ensureFloorTileConfig(),i=$('fpFloorTileInfo');if(!c||!i)return;const ar=calculateFloorAreaM2(fpObjects),o=resolveFloorTileOrigin(c),ta=(+c.tileW||60)*(+c.tileH||60)/10000,n=ar&&ta?Math.ceil(ar/ta):0;i.textContent=`Bodenfläche: ${ar==null?'—':formatCHNumber(ar,2)+' m²'} · Fliese ${Math.round(c.tileW)}×${Math.round(c.tileH)} cm · Start X ${Math.round(o.x)} / Y ${Math.round(o.y)} cm · ca. ${n} Fliesen ohne Verschnitt`}
function syncFloorTileTo3D(c){if(!c)return;const o=resolveFloorTileOrigin(c);fp3DOptions.tileOriginX=Math.round(o.x);fp3DOptions.tileOriginY=Math.round(o.y);fp3DOptions.tileRotation=c.align==='45'?45:0;fp3DOptions.floorMaterialId=c.materialId||'';if(fpRecord)fpRecord.threeDOptions={...fp3DOptions}}
function applyFloorTileConfig(){const c=ensureFloorTileConfig();if(!c)return;pushHistory();readFloorTileControls(c);c.enabled=true;syncFloorTileTo3D(c);updateFloorTilePanel();drawFloorplan();if(fp3DMode)refresh3D()}
function centerFloorTileLayout(){const c=ensureFloorTileConfig(),b=roomBoundsCm();if(!c||!b)return;readFloorTileControls(c);const rx=((b.maxX-b.minX)%c.tileW+c.tileW)%c.tileW,ry=((b.maxY-b.minY)%c.tileH+c.tileH)%c.tileH;c.originMode='manual';c.originX=b.minX+rx/2;c.originY=b.minY+ry/2;c.enabled=true;syncFloorTileTo3D(c);updateFloorTilePanel();drawFloorplan();if(fp3DMode)refresh3D()}
function drawFloorTiles2D(){const c=ensureFloorTileConfig();if(!c?.enabled)return;const p=getRoomPolygon(),b=roomBoundsCm();if(!p||!b)return;let tw=+c.tileW||60,th=+c.tileH||60;if(c.pattern==='vertical')[tw,th]=[th,tw];const o=resolveFloorTileOrigin(c),z=Math.max(.2,fpZoom||1);fpCtx.save();fpCtx.strokeStyle='rgba(14,116,144,.55)';fpCtx.lineWidth=.8/z;fpCtx.beginPath();p.forEach((q,k)=>k?fpCtx.lineTo(q.x,q.y):fpCtx.moveTo(q.x,q.y));fpCtx.closePath();fpCtx.clip();fpCtx.translate(o.x,o.y);fpCtx.rotate(c.align==='45'?Math.PI/4:0);fpCtx.translate(-o.x,-o.y);const mg=Math.max(b.maxX-b.minX,b.maxY-b.minY)*1.5+500,sx=Math.floor((b.minX-mg-o.x)/tw)*tw+o.x,ex=Math.ceil((b.maxX+mg-o.x)/tw)*tw+o.x,sy=Math.floor((b.minY-mg-o.y)/th)*th+o.y,ey=Math.ceil((b.maxY+mg-o.y)/th)*th+o.y;for(let x=sx;x<=ex;x+=tw){fpCtx.beginPath();fpCtx.moveTo(x,sy);fpCtx.lineTo(x,ey);fpCtx.stroke()}for(let y=sy,row=0;y<=ey;y+=th,row++){fpCtx.beginPath();fpCtx.moveTo(sx,y);fpCtx.lineTo(ex,y);fpCtx.stroke();let sh=0;if(c.pattern==='half'&&row%2)sh=tw/2;if(c.pattern==='third')sh=(row%3)*tw/3;if(sh)for(let x=sx+sh;x<=ex;x+=tw){fpCtx.beginPath();fpCtx.moveTo(x,y);fpCtx.lineTo(x,y+th);fpCtx.stroke()}}fpCtx.restore();fpCtx.save();fpCtx.strokeStyle='#0e7490';fpCtx.fillStyle='#0e7490';fpCtx.lineWidth=2/z;fpCtx.beginPath();fpCtx.arc(o.x,o.y,9/z,0,Math.PI*2);fpCtx.fillStyle='rgba(255,255,255,.95)';fpCtx.fill();fpCtx.stroke();fpCtx.beginPath();fpCtx.moveTo(o.x-5/z,o.y);fpCtx.lineTo(o.x+5/z,o.y);fpCtx.moveTo(o.x,o.y-5/z);fpCtx.lineTo(o.x,o.y+5/z);fpCtx.stroke();fpCtx.font=`bold ${11/z}px Arial`;fpCtx.fillStyle='#0e7490';fpCtx.fillText('Fliesenstart · ziehen',o.x+13/z,o.y-11/z);fpCtx.restore()}

function updateWallQuickPanel(){
  const panel=$('fpWallQuickPanel');
  const o=selectedObject();
  if(!panel)return;

  if(!o || o.type!=='wall'){
    panel.classList.add('hidden');
    setWallTileEditMode(null);
    return;
  }

  panel.classList.remove('hidden');

  const length=fpWallInnerInputLength2936(o);
  const current=wallAngleDeg(o);
  const snapped=nearestCadAngle(current);
  const diff=Math.min(Math.abs(current-snapped),360-Math.abs(current-snapped));

  const setValue=(id,val)=>{
    const el=$(id);
    if(el)el.value=String(val);
  };

  // Länge = lichte Innenlänge. Niemals aus der Aussen-Geometrie überschreiben.
  setValue('fpQuickWallLength',Math.round(length));
  setValue('fpQuickWallThickness',Math.round(Number(o.thickness||15)));
  setValue('fpQuickWallX1',Math.round(Number(o.x1)));
  setValue('fpQuickWallY1',Math.round(Number(o.y1)));
  setValue('fpQuickWallX2',Math.round(Number(o.x2)));
  setValue('fpQuickWallY2',Math.round(Number(o.y2)));

  const angle=$('fpQuickWallAngle');
  if(angle)angle.value=diff<0.5?String(snapped):'auto';

  refreshCadTileMaterialSelects();
  renderWallTileList();
  updateWallTileDraftInfo();
}

function applyWallQuickPanel(){
  const o=selectedObject();
  if(!o || o.type!=='wall')return;

  const length=Number($('fpQuickWallLength')?.value);
  const angleValue=$('fpQuickWallAngle')?.value;
  const thickness=Number($('fpQuickWallThickness')?.value);
  const x1=Number($('fpQuickWallX1')?.value);
  const y1=Number($('fpQuickWallY1')?.value);
  const x2=Number($('fpQuickWallX2')?.value);
  const y2=Number($('fpQuickWallY2')?.value);

  pushHistory();

  if([x1,y1,x2,y2].every(Number.isFinite)){
    o.x1=x1;o.y1=y1;o.x2=x2;o.y2=y2;
  }

  if(Number.isFinite(thickness) && thickness>0){
    o.thickness=thickness;
    fpWallThickness=thickness;
    const normalThickness=$('fpWallThickness');
    if(normalThickness)normalThickness.value=String(thickness);
  }

  if(Number.isFinite(length) && length>0){
    let angleDeg=wallAngleDeg(o);

    if(angleValue && angleValue!=='auto'){
      angleDeg=Number(angleValue);
    }else if(fpAngleSnap){
      angleDeg=nearestCadAngle(angleDeg);
    }

    // Eingabewert ist immer lichte Innenlänge.
    fpApplyInnerLengthToWall2936(o,length,angleDeg);
  }

  drawFloorplan();
  updateSelectedInfo();
  updateWallQuickPanel();
}


function updateWallEndpointFields(){
  const o=selectedObject();
  const ids=['fpWallX1','fpWallY1','fpWallX2','fpWallY2'];
  const lenEl=$('fpWallLength');
  const angleEl=$('fpWallAngle');

  if(!o||o.type!=='wall'){
    ids.forEach(id=>{const el=$(id);if(el)el.value='';});
    if(lenEl)lenEl.value='';
    if(angleEl)angleEl.value='auto';
    return;
  }

  const map={fpWallX1:o.x1,fpWallY1:o.y1,fpWallX2:o.x2,fpWallY2:o.y2};
  Object.entries(map).forEach(([id,val])=>{const el=$(id);if(el)el.value=Math.round(val);});

  const length=fpWallInnerInputLength2936(o);
  if(lenEl)lenEl.value=String(Math.round(length));

  if(angleEl){
    const current=wallAngleDeg(o);
    const snapped=nearestCadAngle(current);
    const diff=Math.min(Math.abs(current-snapped),360-Math.abs(current-snapped));
    angleEl.value=diff<0.5?String(snapped):'auto';
  }
}

function setWallEndpointsFromFields(){
  const o=selectedObject();
  if(!o||o.type!=='wall')return;
  const vals={
    x1:Number($('fpWallX1')?.value),y1:Number($('fpWallY1')?.value),
    x2:Number($('fpWallX2')?.value),y2:Number($('fpWallY2')?.value)
  };
  if(Object.values(vals).some(v=>!Number.isFinite(v)))return;
  pushHistory();
  Object.assign(o,vals);
  const raw2938=Math.hypot(o.x2-o.x1,o.y2-o.y1);
  const t2938=Math.max(0,Number(o.thickness||fpWallThickness||15));
  o.outerLengthCm=raw2938;
  o.innerLengthCm=Math.max(.1,raw2938-2*t2938);
  drawFloorplan();
  updateSelectedInfo();
}


function populate3DMaterialSelects(project){
  const floor=$('fp3DFloorMaterial'),wall=$('fp3DWallMaterial');
  if(!floor||!wall)return;
  const mats=(project?.tileMaterials||[]);
  const html='<option value="">Neutral</option>'+mats.map(m=>`<option value="${m.id}">${esc([m.brand,m.model,m.format].filter(Boolean).join(' · ')||'Fliese')}</option>`).join('');
  floor.innerHTML=html;wall.innerHTML=html;
  floor.value=fp3DOptions.floorMaterialId||'';
  wall.value=fp3DOptions.wallMaterialId||'';
}

function fpWallViewWalls(){
  return (fpObjects||[]).filter(o=>o?.type==='wall');
}

function fpWallViewLetter(index){
  let n=index+1,s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s;
}

function fpSelectWallView(wallId){
  if(!fpWallViewWalls().some(w=>w.id===wallId))return;
  fpWallViewSelectedId=wallId;
  const select=$('fpWallViewSelect');if(select)select.value=wallId;
  document.querySelectorAll('#fpWallViewButtons button').forEach(btn=>btn.classList.toggle('active',btn.dataset.wallId===wallId));
  if(fpWallView3D)openWallView3D();else drawWallElevation();
}

function fpEnsureWallViewSelection(){
  const walls=fpWallViewWalls();
  if(!walls.some(w=>w.id===fpWallViewSelectedId))fpWallViewSelectedId=walls[0]?.id||'';
  const select=$('fpWallViewSelect');
  if(select){
    select.innerHTML=walls.length
      ? walls.map((w,i)=>`<option value="${esc(w.id)}">Wand ${i+1} · ${formatCHNumber(wallLengthCm(w),0)} cm</option>`).join('')
      : '<option value="">Keine geschlossene Wand vorhanden</option>';
    select.value=fpWallViewSelectedId;
  }
  const buttons=$('fpWallViewButtons');
  if(buttons){
    buttons.innerHTML='';
    walls.forEach((w,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.dataset.wallId=w.id;
      btn.textContent=`Wand ${fpWallViewLetter(i)}`;btn.title=`Wand ${fpWallViewLetter(i)} · ${formatCHNumber(wallLengthCm(w),0)} cm`;
      btn.classList.toggle('active',w.id===fpWallViewSelectedId);
      pbBindTap(btn,()=>fpSelectWallView(w.id));buttons.appendChild(btn);
    });
  }
  return walls.find(w=>w.id===fpWallViewSelectedId)||null;
}

function fpNearestWallViewHit(o){
  if(!o)return null;
  const walls=fpWallViewWalls();
  const explicit=walls.find(w=>w.id===o.wallId);
  if(explicit)return {wall:explicit,t:null,dist:0};
  const px=Number(o.x),py=Number(o.y);
  if(!Number.isFinite(px)||!Number.isFinite(py))return null;
  let best=null;
  walls.forEach(w=>{
    const x1=Number(w.x1),y1=Number(w.y1),dx=Number(w.x2)-x1,dy=Number(w.y2)-y1,l2=dx*dx+dy*dy;
    if(l2<.001)return;
    const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));
    const dist=Math.hypot(px-(x1+dx*t),py-(y1+dy*t));
    if(!best||dist<best.dist)best={wall:w,t,dist};
  });
  return best;
}

function fpWallObjectMetrics(o){
  const type=o?.type||'';
  const width=Math.max(1,Number(o.widthCm??o.width??o.lengthCm??o.length??(type==='door'?90:type==='window'?100:type==='mirror'?80:type==='niche'?60:type==='glass'?90:60))||60);
  const height=Math.max(1,Number(o.heightCm??o.height??(type==='door'?210:type==='window'?120:type==='mirror'?80:type==='niche'?40:type==='glass'?200:80))||80);
  const bottom=Math.max(0,Number(o.mountHeightCm??o.sillHeightCm??o.bottomCm??o.zCm??(type==='window'?90:0))||0);
  return {width,height,bottom};
}

function fpWallObjectLabel(o){
  return ({door:'Tür',window:'Fenster',glass:'Duschglas',mirror:'Spiegel',niche:'Nische',shower:'Dusche',walkInShower:'Bodengleiche Dusche',sink:'Lavabo',wc:'WC',bathtub:'Badewanne'}[o?.type]||o?.name||'Objekt');
}

function drawWallElevation(targetCanvas=null){
  const canvas=targetCanvas||$('fpWallElevationCanvas'),wall=fpEnsureWallViewSelection();
  if(!canvas)return;
  const host=canvas.parentElement,rect=host.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=Math.max(1,rect.width),H=Math.max(1,rect.height);ctx.clearRect(0,0,W,H);ctx.fillStyle='#e8edf2';ctx.fillRect(0,0,W,H);
  if(!wall){ctx.fillStyle='#64748b';ctx.font='600 15px system-ui';ctx.textAlign='center';ctx.fillText('Bitte zuerst einen geschlossenen Raum zeichnen.',W/2,H/2);return;}
  const wallLen=Math.max(1,wallLengthCm(wall));
  const roomH=Math.max(100,(Number(fpRecord?.roomHeightM)||2.4)*100);
  const padX=58,padTop=45,padBottom=62,scale=Math.min((W-padX*2)/wallLen,(H-padTop-padBottom)/roomH);
  const left=(W-wallLen*scale)/2,top=padTop+(H-padTop-padBottom-roomH*scale)/2,bottom=top+roomH*scale;
  ctx.fillStyle='#faf9f6';ctx.strokeStyle='#334155';ctx.lineWidth=2;ctx.fillRect(left,top,wallLen*scale,roomH*scale);ctx.strokeRect(left,top,wallLen*scale,roomH*scale);
  const dx=Number(wall.x2)-Number(wall.x1),dy=Number(wall.y2)-Number(wall.y1),raw=Math.hypot(dx,dy)||1;
  const mounted=(fpObjects||[]).filter(o=>o!==wall&&o.type!=='wall'&&o.type!=='text').map(o=>({o,hit:fpNearestWallViewHit(o)})).filter(x=>x.hit?.wall?.id===wall.id&&(x.hit.dist<=80||x.o.wallId===wall.id));
  const colors={door:'#bf7b45',window:'#76bce8',glass:'#75d7eb',mirror:'#a7c7df',niche:'#94a3b8',shower:'#7dd3fc',walkInShower:'#38bdf8'};
  mounted.forEach(({o,hit})=>{
    const t=hit.t==null?Math.max(0,Math.min(1,((Number(o.x)-Number(wall.x1))*dx+(Number(o.y)-Number(wall.y1))*dy)/(raw*raw))):hit.t;
    const m=fpWallObjectMetrics(o),x=left+t*wallLen*scale-m.width*scale/2,y=bottom-(m.bottom+m.height)*scale;
    ctx.save();ctx.fillStyle=(colors[o.type]||'#cbd5e1')+'aa';ctx.strokeStyle=colors[o.type]||'#64748b';ctx.lineWidth=2;ctx.fillRect(x,y,m.width*scale,m.height*scale);ctx.strokeRect(x,y,m.width*scale,m.height*scale);
    ctx.fillStyle='#0f172a';ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText(fpWallObjectLabel(o),x+m.width*scale/2,Math.max(top+13,y+15));ctx.restore();
  });
  ctx.strokeStyle='#2563eb';ctx.fillStyle='#1d4ed8';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(left,bottom+22);ctx.lineTo(left+wallLen*scale,bottom+22);ctx.moveTo(left,bottom+14);ctx.lineTo(left,bottom+30);ctx.moveTo(left+wallLen*scale,bottom+14);ctx.lineTo(left+wallLen*scale,bottom+30);ctx.stroke();
  ctx.font='700 13px system-ui';ctx.textAlign='center';ctx.fillText(`${formatCHNumber(wallLen,0)} cm`,W/2,bottom+43);
  ctx.save();ctx.translate(left-30,(top+bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText(`${formatCHNumber(roomH,0)} cm`,0,0);ctx.restore();
  const index=fpWallViewWalls().findIndex(w=>w.id===wall.id);ctx.fillStyle='#0f172a';ctx.font='800 16px system-ui';ctx.textAlign='left';ctx.fillText(`Wand ${fpWallViewLetter(index)} · 2D Elevation`,left,top-17);
}

async function generateAllWallsAndFloorPdf(){
  if(!window.jspdf?.jsPDF){alert('PDF-Modul ist nicht geladen.');return}
  const walls=fpWallViewWalls();if(!walls.length){alert('Keine Wände vorhanden.');return}
  const oldWall=fpWallViewSelectedId,oldKind=fpWallView3D,oldMode=fpViewMode;
  const oldZoom=fpZoom,oldOffsetX=fpViewOffsetX,oldOffsetY=fpViewOffsetY;
  const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  const pageW=297,pageH=210,margin=12,project=fpProject?.name||'Projekt Bau',room=fpRecord?.name||'Grundriss';
  const addHeader=(title,page)=>{doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(title,margin,12);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`${project} · ${room}`,pageW-margin,11,{align:'right'});doc.setDrawColor(210);doc.line(margin,16,pageW-margin,16);doc.text(`Projekt Bau PRO · Seite ${page}`,pageW-margin,pageH-5,{align:'right'})};
  try{
    fitFloorplan2D();drawFloorplan();
    addHeader('Boden / Grundriss',1);
    const floorImage=fpCanvas.toDataURL('image/png');
    const maxW=pageW-margin*2,maxH=pageH-27;const ratio=Math.min(maxW/fpCanvas.width,maxH/fpCanvas.height);
    const iw=fpCanvas.width*ratio,ih=fpCanvas.height*ratio;doc.addImage(floorImage,'PNG',(pageW-iw)/2,19,iw,ih,undefined,'FAST');
    const printHost=document.createElement('div');printHost.style.cssText='position:fixed;left:-10000px;top:0;width:1400px;height:850px;';
    const printCanvas=document.createElement('canvas');printCanvas.id='fpWallElevationPrintCanvas';printHost.appendChild(printCanvas);document.body.appendChild(printHost);
    for(let i=0;i<walls.length;i++){
      fpWallViewSelectedId=walls[i].id;
      drawWallElevation(printCanvas);
      doc.addPage('a4','landscape');addHeader(`Wand ${fpWallViewLetter(i)} · Elevation`,i+2);
      const img=printCanvas.toDataURL('image/png'),cw=printCanvas.width,ch=printCanvas.height,r=Math.min(maxW/cw,maxH/ch);
      const w=cw*r,h=ch*r;doc.addImage(img,'PNG',(pageW-w)/2,19,w,h,undefined,'FAST');
    }
    printHost.remove();
    doc.save(`Wandansichten_${String(room).replace(/[^a-zA-Z0-9_-]+/g,'_')}.pdf`);
  }catch(error){console.error('Wandansichten PDF',error);alert('PDF konnte nicht erstellt werden.')}
  finally{
    fpZoom=oldZoom;fpViewOffsetX=oldOffsetX;fpViewOffsetY=oldOffsetY;drawFloorplan();
    fpWallViewSelectedId=oldWall;fpWallView3D=oldKind;fpViewMode=oldMode;fpEnsureWallViewSelection();
    if(oldMode==='wall')setWallViewKind(oldKind?'3d':'2d');
  }
}

function openWallView3D(){
  const wall=fpEnsureWallViewSelection(),host=$('fpWall3DViewport');
  if(!wall||!host)return;
  const open=()=>window.ProjectBau3D?(window.ProjectBau3D.open(host,current3DData()),window.ProjectBau3D.wallView?.(wall.id)):setTimeout(open,180);
  requestAnimationFrame(open);
}

function setWallViewKind(kind){
  fpWallView3D=kind==='3d';
  fp3DMode=fpViewMode==='wall'&&fpWallView3D;
  $('fpWall2DViewport')?.classList.toggle('hidden',fpWallView3D);
  $('fpWall3DViewport')?.classList.toggle('hidden',!fpWallView3D);
  $('fpWallView2D')?.classList.toggle('active',!fpWallView3D);
  $('fpWallView3D')?.classList.toggle('active',fpWallView3D);
  if(fpWallView3D)openWallView3D();else requestAnimationFrame(drawWallElevation);
}

function current3DData(){
  return {
    objects:fpObjects,
    record:fpRecord,
    project:fpProject,
    options:{...fp3DOptions,layerVisibility:{...fpLayerVisibility},wallViewSelectedId:fpViewMode==='wall'&&fpWallView3D?fpWallViewSelectedId:''}
  };
}

function refresh3D(){
  if(!fp3DMode || !window.ProjectBau3D)return;
  window.ProjectBau3D.update(current3DData());
}

function setFloorplanView(mode){
  fpViewMode=mode;
  fp3DMode=mode==='3d'||(mode==='wall'&&fpWallView3D);
  const w2=$('fp2DWorkspace'),w3=$('fp3DWorkspace'),b2=$('fpView2D'),b3=$('fpView3D');
  const ww=$('fpWallWorkspace');

  if(w2)w2.classList.toggle('hidden',mode!=='2d');
  if(w3)w3.classList.toggle('hidden',mode!=='3d');
  if(ww)ww.classList.toggle('hidden',mode!=='wall');
  setTimeout(forceWorkspaceRootRefit,80);
  if(b2)b2.classList.toggle('active',!fp3DMode);
  if(b3)b3.classList.toggle('active',fp3DMode);

  document.querySelectorAll('.pro-mode-tab[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  if(mode==='wall'){
    fpEnsureWallViewSelection();
    setWallViewKind(fpWallView3D?'3d':'2d');
  }else if(fp3DMode){
    populate3DMaterialSelects(fpProject);
    const host=$('fp3DViewport');
    const open3D=()=>{
      if(window.ProjectBau3D&&host){
        window.ProjectBau3D.open(host,current3DData());
        requestAnimationFrame(()=>window.ProjectBau3D?.fitView?.());
      }else{
        setTimeout(open3D,180);
      }
    };
    requestAnimationFrame(open3D);
  }else{
    requestAnimationFrame(()=>{
      drawFloorplan();
      requestAnimationFrame(fitFloorplan2D);
    });
  }
}

function renderFloorplans(project){
  const list=$('floorplanList'); if(!list)return; list.innerHTML='';
  project.floorplans=project.floorplans||[];
  if(!project.floorplans.length){list.innerHTML='<div class="muted">Noch keine Grundrisse vorhanden.</div>';return}
  project.floorplans.forEach(fp=>{
    const card=document.createElement('div');card.className='floorplan-card';
    card.innerHTML=`<div class="floorplan-card-title">${esc(fp.name||'Grundriss')}</div>
      <div class="muted" style="margin-bottom:8px">${fp.floorAreaM2!=null?`Bodenfläche: ${formatCHNumber(fp.floorAreaM2,2)} m²`:''}${fp.roomHeightM?`${fp.floorAreaM2!=null?' · ':''}Raumhöhe: ${formatCHNumber(fp.roomHeightM,2)} m`:''}</div>
      ${fp.image?`<img src="${fp.image}" alt="${esc(fp.name||'Grundriss')}">`:''}
      ${Array.isArray(fp.objects)&&fp.objects.some(o=>o?.type==='wall')&&!fp.updatedAt?`<div class="muted" style="font-size:9px;margin:4px 0">Vorschau wird beim nächsten Speichern aktualisiert.</div>`:''}
      <div class="floorplan-card-actions"><button class="secondary editFp">Bearbeiten</button><button class="danger delFp">Löschen</button></div>`;
    card.querySelector('.editFp').onclick=()=>openFloorplan(project,fp);
    card.querySelector('.delFp').onclick=()=>{if(confirm('Grundriss wirklich löschen?')){project.floorplans=project.floorplans.filter(x=>x.id!==fp.id);save()}};
    list.appendChild(card);
  });
}

function createNewFloorplan(){
  const p=cur();
  if(!p){alert('Bitte zuerst ein Projekt öffnen.');return}
  $('floorplanNameInput').value='';
  $('floorplanNameModal').classList.remove('hidden');
  setTimeout(()=>$('floorplanNameInput').focus(),50);
}
function cancelNewFloorplan(){$('floorplanNameModal').classList.add('hidden')}
function confirmNewFloorplan(){
  const p=cur(),name=$('floorplanNameInput').value.trim();
  if(!name){alert('Bitte einen Namen für den Grundriss eingeben.');return}
  p.floorplans=p.floorplans||[];
  const fp={id:u(),name,objects:[],image:null,grid:20,wallThickness:15};
  p.floorplans.push(fp);
  localStorage.setItem(K3,JSON.stringify(S));
  render();cancelNewFloorplan();openFloorplan(p,fp);
}


function calculateFloorAreaM2(objects){
  /*
   * v2.9.43 — BODENFLÄCHE = echte lichte Innenfläche
   *
   * Never use the outside wall polygon for room area.
   * Build the closed outside wall chain only to determine topology/orientation,
   * then offset every wall by its own thickness toward the room interior.
   * Consecutive inner wall faces are intersected mathematically.
   *
   * Example:
   *   lichte Innenmasse 201 × 277 cm
   *   = 55'677 cm²
   *   = 5.5677 m² -> 5.57 m²
   */
  const walls=(objects||[]).filter(o=>o?.type==='wall');
  if(walls.length<3)return null;

  const tolerance=30;
  const nodes=[];

  function findOrCreateNode(x,y){
    let best=null,bestDist=Infinity;
    for(const n of nodes){
      const d=Math.hypot(n.x-x,n.y-y);
      if(d<tolerance&&d<bestDist){best=n;bestDist=d;}
    }
    if(best){
      best.x=(best.x*best.count+x)/(best.count+1);
      best.y=(best.y*best.count+y)/(best.count+1);
      best.count++;
      return best;
    }
    const n={id:nodes.length,x,y,count:1,edges:[]};
    nodes.push(n);
    return n;
  }

  const edges=[];
  for(const w of walls){
    const n1=findOrCreateNode(Number(w.x1),Number(w.y1));
    const n2=findOrCreateNode(Number(w.x2),Number(w.y2));
    if(n1===n2)continue;
    const e={wall:w,a:n1.id,b:n2.id};
    edges.push(e);
    n1.edges.push(edges.length-1);
    n2.edges.push(edges.length-1);
  }

  if(nodes.length<3||edges.length<3)return null;
  if(nodes.some(n=>n.edges.length!==2))return null;

  // Order the closed wall cycle.
  const ordered=[];
  const used=new Set();
  let currentNode=nodes[0].id;
  let previousEdge=null;

  for(let guard=0;guard<edges.length+2;guard++){
    const n=nodes[currentNode];
    const edgeIndex=n.edges.find(ei=>ei!==previousEdge);
    if(edgeIndex==null||used.has(edgeIndex)){
      if(currentNode===nodes[0].id&&used.size===edges.length)break;
      return null;
    }
    const edge=edges[edgeIndex];
    used.add(edgeIndex);

    const forward=edge.a===currentNode;
    const nextNode=forward?edge.b:edge.a;
    ordered.push({
      wall:edge.wall,
      from:{x:nodes[currentNode].x,y:nodes[currentNode].y},
      to:{x:nodes[nextNode].x,y:nodes[nextNode].y}
    });

    previousEdge=edgeIndex;
    currentNode=nextNode;
    if(currentNode===nodes[0].id)break;
  }

  if(currentNode!==nodes[0].id||ordered.length!==edges.length)return null;

  // Determine outer polygon winding/centroid.
  const outerPts=ordered.map(e=>e.from);
  let outerTwice=0;
  for(let i=0;i<outerPts.length;i++){
    const p=outerPts[i],q=outerPts[(i+1)%outerPts.length];
    outerTwice+=p.x*q.y-q.x*p.y;
  }
  if(Math.abs(outerTwice)<1e-6)return null;

  // For a CCW polygon the room interior is left of every directed edge.
  // For CW it is right.
  const ccw=outerTwice>0;

  function innerLine(edge){
    const dx=edge.to.x-edge.from.x,dy=edge.to.y-edge.from.y;
    const L=Math.hypot(dx,dy);
    if(L<1e-6)return null;
    const ux=dx/L,uy=dy/L;
    let nx=-uy,ny=ux;
    if(!ccw){nx=-nx;ny=-ny;}
    const t=Math.max(0,Number(edge.wall.thickness||fpWallThickness||15));
    return {
      a:{x:edge.from.x+nx*t,y:edge.from.y+ny*t},
      b:{x:edge.to.x+nx*t,y:edge.to.y+ny*t}
    };
  }

  function infiniteIntersection(l1,l2){
    const x1=l1.a.x,y1=l1.a.y,x2=l1.b.x,y2=l1.b.y;
    const x3=l2.a.x,y3=l2.a.y,x4=l2.b.x,y4=l2.b.y;
    const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
    if(Math.abs(den)<1e-9)return null;
    const det1=x1*y2-y1*x2,det2=x3*y4-y3*x4;
    return {
      x:(det1*(x3-x4)-(x1-x2)*det2)/den,
      y:(det1*(y3-y4)-(y1-y2)*det2)/den
    };
  }

  const innerLines=ordered.map(innerLine);
  if(innerLines.some(x=>!x))return null;

  const innerPts=[];
  for(let i=0;i<innerLines.length;i++){
    const prev=innerLines[(i-1+innerLines.length)%innerLines.length];
    const cur=innerLines[i];
    const hit=infiniteIntersection(prev,cur);
    if(!hit||!Number.isFinite(hit.x)||!Number.isFinite(hit.y))return null;
    innerPts.push(hit);
  }

  let twiceArea=0;
  for(let i=0;i<innerPts.length;i++){
    const p=innerPts[i],q=innerPts[(i+1)%innerPts.length];
    twiceArea+=p.x*q.y-q.x*p.y;
  }

  const areaCm2=Math.abs(twiceArea)/2;
  if(!(areaCm2>0))return null;
  return areaCm2/10000;
}

function updateFloorRoomInfo(){
  const area=calculateFloorAreaM2(fpObjects);
  const areaEl=$('fpFloorArea');
  if(areaEl)areaEl.textContent=area===null?'Grundriss nicht geschlossen':`${formatCHNumber(area,2)} m²`;
  if(fpRecord)fpRecord.floorAreaM2=area;

  const h=$('fpRoomHeight');
  if(h && fpRecord && document.activeElement!==h)h.value=fpRecord.roomHeightM??'';
}


function fpNormalizeLegacyWall(w){
  if(!w || w.type!=='wall')return w;

  const n=v=>{
    const x=Number(v);
    return Number.isFinite(x)?x:null;
  };

  let x1=n(w.x1), y1=n(w.y1), x2=n(w.x2), y2=n(w.y2);

  // Older project variants used start/end field names.
  if(x1===null)x1=n(w.startX ?? w.xStart ?? w.fromX);
  if(y1===null)y1=n(w.startY ?? w.yStart ?? w.fromY);
  if(x2===null)x2=n(w.endX   ?? w.xEnd   ?? w.toX);
  if(y2===null)y2=n(w.endY   ?? w.yEnd   ?? w.toY);

  // Older object-like wall representation: center/x/y + length + angle.
  if([x1,y1,x2,y2].some(v=>v===null)){
    const cx=n(w.x ?? w.cx ?? w.centerX);
    const cy=n(w.y ?? w.cy ?? w.centerY);
    const length=n(w.lengthCm ?? w.length ?? w.widthCm ?? w.width);
    let angle=n(w.angleDeg ?? w.angle ?? w.rotation);

    if(cx!==null && cy!==null && length!==null && length>0){
      if(angle===null)angle=0;

      // Rotation may be radians in some old records.
      const rad=Math.abs(angle)<=Math.PI*2+0.01 ? angle : angle*Math.PI/180;
      const dx=Math.cos(rad)*length/2;
      const dy=Math.sin(rad)*length/2;

      x1=cx-dx; y1=cy-dy;
      x2=cx+dx; y2=cy+dy;
    }
  }

  // If only start point + length/angle exists.
  if(x1!==null && y1!==null && (x2===null || y2===null)){
    const length=n(w.lengthCm ?? w.length ?? w.widthCm ?? w.width);
    let angle=n(w.angleDeg ?? w.angle ?? w.rotation);
    if(length!==null && length>0){
      if(angle===null)angle=0;
      const rad=Math.abs(angle)<=Math.PI*2+0.01 ? angle : angle*Math.PI/180;
      x2=x1+Math.cos(rad)*length;
      y2=y1+Math.sin(rad)*length;
    }
  }

  if([x1,y1,x2,y2].every(Number.isFinite) && Math.hypot(x2-x1,y2-y1)>.1){
    w.x1=x1; w.y1=y1; w.x2=x2; w.y2=y2;
  }

  const thickness=n(w.thickness ?? w.wallThickness ?? w.depthCm);
  if(thickness!==null && thickness>0)w.thickness=thickness;
  else if(!Number.isFinite(Number(w.thickness)))w.thickness=15;

  return w;
}

function fpRepairLegacyWalls(objects){
  if(!Array.isArray(objects))return objects;
  objects.forEach(fpNormalizeLegacyWall);
  return objects;
}


function openFloorplan(project,record){
  fpProject=project;fpRecord=record;
  fpObjects=Array.isArray(record.objects)?JSON.parse(JSON.stringify(record.objects)):[];
  fpRepairLegacyWalls(fpObjects);
  refreshWallLetters();
  fpGrid=record.grid||5;fpFineStep=record.fineStep||1;fpWallThickness=record.wallThickness||15;
  fp3DMode=false;fpViewMode='2d';fpWallView3D=false;fpWallViewSelectedId='';fp3DOptions=record.threeDOptions||{floorMaterialId:'',wallMaterialId:'',showCeiling:false,tileOriginX:0,tileOriginY:0,tileRotation:0};fpUndoStack=[];fpRedoStack=[];fpSelectedId=null;fpLastWallEnd=null;fpZoom=1;fpActiveLayer=record.activeLayer||'walls';fpLayerVisibility={
    walls:true,
    openings:true,
    sanitary:true,
    furniture:true,
    notes:true,
    ...(record.layerVisibility||{})
  };
  // Construction walls must never disappear merely because an older record saved the layer disabled.
  fpLayerVisibility.walls=true;
  const roomHeight=$('fpRoomHeight');if(roomHeight)roomHeight.value=record.roomHeightM??'';
  const tileX=$('fpTileOriginX'),tileY=$('fpTileOriginY'),tileRot=$('fpTileRotation');
  if(tileX)tileX.value=fp3DOptions.tileOriginX??0;
  if(tileY)tileY.value=fp3DOptions.tileOriginY??0;
  if(tileRot)tileRot.value=String(fp3DOptions.tileRotation??0);
  $('fpGridSize').value=String(fpGrid);
  const fine=$('fpFineStep');if(fine)fine.value=String(fpFineStep);
  $('fpWallThickness').value=String(fpWallThickness);
  $('fpSnap').checked=true;fpSnapEnabled=true;
  const gridToggle=$('fpShowGrid'),posToggle=$('fpShowPositions'),measureToggle=$('fpShowMeasures');
  if(gridToggle)gridToggle.checked=true;
  if(posToggle)posToggle.checked=false;
  if(measureToggle)measureToggle.checked=true;
  fpShowGrid=true;fpShowPositions=false;fpShowMeasures=true;
  $('floorplanEditorTitle').textContent=`Grundriss · ${record.name}`;
  $('floorplanModal').classList.remove('hidden');
  setTimeout(forceWorkspaceRootRefit,100);
  setTimeout(forceWorkspaceRootRefit,300);
  setTimeout(safeTabletWorkspaceRefit,120);
  setTimeout(safeTabletWorkspaceRefit,380);
  setTimeout(()=>{initTabletCadUi();if(fp3DMode)window.ProjectBau3D?.fitView?.();else fitFloorplan2D?.();},220);
  setTimeout(()=>{if(fp3DMode)window.ProjectBau3D?.fitView?.();else fitFloorplan2D?.();},180);
  setTimeout(()=>{if(!fp3DMode)fitFloorplan2D?.();},420);
  setFloorTool('select');fpSelectedId=null;setFloorplanView('2d');drawFloorplan();updateSelectedInfo();requestAnimationFrame(()=>requestAnimationFrame(()=>{fitFloorplan2D();setTimeout(fitFloorplan2D,120)}));
}

function saveCurrentFloorplan(options={}){
  if(!fpRecord)return false;

  try{
    fpRepairLegacyWalls(fpObjects);
    drawFloorplan();

    fpRecord.objects=cloneObjects();

    try{
      fpRecord.image=fpCanvas?.toDataURL?.('image/png')||fpRecord.image||'';
    }catch(_){}

    fpRecord.grid=fpGrid;
    fpRecord.fineStep=fpFineStep;
    fpRecord.wallThickness=fpWallThickness;
    fpRecord.activeLayer=fpActiveLayer;
    fpRecord.layerVisibility={...fpLayerVisibility};
    fpRecord.threeDOptions={...fp3DOptions};
    fpRecord.floorAreaM2=calculateFloorAreaM2(fpObjects);
    fpRecord.updatedAt=new Date().toISOString();

    // Save project database without changing the currently opened floorplan.
    try{localStorage.setItem(K3,JSON.stringify(S))}catch(_){}
    try{window.PBStorage?.saveState?.(S,{reason:'floorplan-save'})}catch(_){}
    try{window.ProjectBauPro?.save?.()}catch(_){}
    try{window.ProjectBauOneDrive?.scheduleAutoSync?.('floorplan-save')}catch(_){}

    return true;
  }catch(e){
    console.error('Grundriss speichern',e);
    return false;
  }
}

function saveFloorplanAndGoHome(){
  const ok=saveCurrentFloorplan({reason:'home'});
  if(!ok){
    alert('Grundriss konnte nicht gespeichert werden.');
    return;
  }

  closeFloorplan();

  // Return to the project/dashboard view and refresh it immediately.
  try{
    A=null;
    render();
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }catch(e){
    console.error('Home Navigation',e);
  }
}


function closeFloorplan(){$('floorplanModal').classList.add('hidden');fpProject=null;fpRecord=null}
function setFloorTool(tool){
  endObjectRotation();
  if(tool!=='wall')fpLastWallEnd=null;
  fpTool=tool;fpSelectedId=null;fpEndpointDrag=null;updateSelectedInfo();
  document.querySelectorAll('.fp-tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  if(fpCanvas){
    fpCanvas.classList.remove('cad-pan-mode','cad-crosshair','cad-select');
    fpCanvas.classList.add(tool==='pan'?'cad-pan-mode':tool==='select'?'cad-select':'cad-crosshair');
  }
}
function snap(v){return fpSnapEnabled?Math.round(v/fpFineStep)*fpFineStep:v}
function fpPoint(ev){
  const r=fpCanvas.getBoundingClientRect();
  const canvasX=(ev.clientX-r.left)*(fpCanvas.width/r.width);
  const canvasY=(ev.clientY-r.top)*(fpCanvas.height/r.height);
  return {
    x:(canvasX-fpViewOffsetX)/fpZoom,
    y:(canvasY-fpViewOffsetY)/fpZoom
  };
}
function uidObj(){return 'fp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cmFromPixels(px){return Math.round(px)}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

function rotationHandlePosition(o){
  if(!o || o.type==='wall' || o.type==='text')return null;

  const scale=Number(o.scale||1);
  const width=Math.max(45,Number(o.widthCm||90)*scale);
  const depth=Math.max(45,Number(o.depthCm||70)*scale);

  // Local top-right corner + a small outward extension.
  const localX=width/2;
  const localY=-depth/2;
  const len=Math.hypot(localX,localY)||1;
  const extra=28/Math.max(.2,fpZoom||1);

  const ex=localX + (localX/len)*extra;
  const ey=localY + (localY/len)*extra;

  const rad=Number(o.rotation||0)*Math.PI/180;
  const c=Math.cos(rad),s=Math.sin(rad);

  return {
    x:Number(o.x||0)+ex*c-ey*s,
    y:Number(o.y||0)+ex*s+ey*c
  };
}

function rotationHandleHitTest(p,o){
  const h=rotationHandlePosition(o);
  if(!h)return false;
  const radius=22/Math.max(.2,fpZoom||1);
  return Math.hypot(p.x-h.x,p.y-h.y)<=radius;
}

function normalizeDegrees(v){
  let n=Number(v)||0;
  n=((n%360)+360)%360;
  return n;
}

function beginObjectRotation(o,p){
  const pointerAngle=Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI;
  fpObjectRotateDrag={
    objectId:o.id,
    pointerStart:pointerAngle,
    rotationStart:Number(o.rotation||0)
  };
  fpCanvas?.classList.add('cad-rotate-object');
}

function updateObjectRotationFromPointer(p){
  if(!fpObjectRotateDrag)return false;
  const o=fpObjects.find(x=>x.id===fpObjectRotateDrag.objectId);
  if(!o)return false;

  const pointerAngle=Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI;
  let delta=pointerAngle-fpObjectRotateDrag.pointerStart;

  // Avoid a jump when crossing -180 / +180.
  if(delta>180)delta-=360;
  if(delta<-180)delta+=360;

  const proposed=normalizeDegrees(fpObjectRotateDrag.rotationStart+delta);
  const previous=Number(o.rotation||0);

  o.rotation=proposed;

  // Keep the existing room-boundary protection.
  if(typeof objectFitsRoom==='function' && !objectFitsRoom(o,o.x,o.y,o.rotation)){
    o.rotation=previous;
  }

  const slider=$('fpRotation'),num=$('fpRotationNumber');
  if(slider)slider.value=String(Math.round(o.rotation||0));
  if(num)num.value=String(Math.round(o.rotation||0));

  return true;
}

function endObjectRotation(){
  fpObjectRotateDrag=null;
  fpCanvas?.classList.remove('cad-rotate-object');
}

function hitTest(p){
  const z=Math.max(.2,Number(fpZoom)||1);
  const objects=[...(fpObjects||[])];

  // Objects above walls: test in reverse drawing order.
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i];
    if(typeof isLayerVisible==='function'&&!isLayerVisible(o))continue;
    if(o.type==='wall')continue;
    const scale=Number(o.scale||1);
    const hw=Math.max(16/z,Number(o.widthCm||60)*scale/2);
    const hd=Math.max(16/z,Number(o.depthCm||40)*scale/2);
    const rad=-(Number(o.rotation||0))*Math.PI/180;
    const dx=p.x-Number(o.x||0),dy=p.y-Number(o.y||0);
    const lx=dx*Math.cos(rad)-dy*Math.sin(rad);
    const ly=dx*Math.sin(rad)+dy*Math.cos(rad);
    if(Math.abs(lx)<=hw+8/z && Math.abs(ly)<=hd+8/z)return o;
  }

  // Walls use a stable geometric distance test.
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i];
    if(o.type!=='wall')continue;
    const A={x:Number(o.x1),y:Number(o.y1)},B={x:Number(o.x2),y:Number(o.y2)};
    const dx=B.x-A.x,dy=B.y-A.y,l2=dx*dx+dy*dy||1;
    const t=Math.max(0,Math.min(1,((p.x-A.x)*dx+(p.y-A.y)*dy)/l2));
    const q={x:A.x+t*dx,y:A.y+t*dy};
    const tolerance=Math.max(Number(o.thickness||15)+8/z,16/z);
    if(Math.hypot(p.x-q.x,p.y-q.y)<=tolerance)return o;
  }
  return null;
}

function fpWallConnectedSnapshot(w,tolerance=2){
  if(!w)return [];
  const out=[];
  const endpoints=[
    {key:'start',x:Number(w.x1),y:Number(w.y1)},
    {key:'end',x:Number(w.x2),y:Number(w.y2)}
  ];

  for(const other of fpObjects){
    if(!other || other.type!=='wall' || other.id===w.id)continue;
    fpNormalizeLegacyWall?.(other);

    for(const own of endpoints){
      const candidates=[
        {end:'start',x:Number(other.x1),y:Number(other.y1)},
        {end:'end',x:Number(other.x2),y:Number(other.y2)}
      ];
      for(const c of candidates){
        if(![own.x,own.y,c.x,c.y].every(Number.isFinite))continue;
        if(Math.hypot(own.x-c.x,own.y-c.y)<=tolerance){
          out.push({
            wallId:other.id,
            end:c.end,
            ownEnd:own.key,
            orig:{
              x1:Number(other.x1),y1:Number(other.y1),
              x2:Number(other.x2),y2:Number(other.y2)
            }
          });
        }
      }
    }
  }
  return out;
}

function fpMoveConnectedWallEnds(snapshot,dx,dy){
  if(!Array.isArray(snapshot))return;

  for(const item of snapshot){
    const w=fpObjects.find(x=>x.id===item.wallId && x.type==='wall');
    if(!w || !item.orig)continue;

    if(item.end==='start'){
      w.x1=item.orig.x1+dx;
      w.y1=item.orig.y1+dy;
      w.x2=item.orig.x2;
      w.y2=item.orig.y2;
    }else{
      w.x1=item.orig.x1;
      w.y1=item.orig.y1;
      w.x2=item.orig.x2+dx;
      w.y2=item.orig.y2+dy;
    }
  }
}

function fpBeginHeldWallDrag(hit,startPoint){
  if(!hit || hit.type!=='wall')return false;

  const wall=fpObjects.find(x=>x.id===hit.id);
  if(!wall)return false;

  // History is taken only when the wall really becomes draggable,
  // not for a simple selection tap.
  pushHistory();

  fpWallMoveHold.ready=true;
  fpWallMoveHold.wallId=hit.id;
  fpWallMoveHold.connected=[]; // v2.9.43 selected wall only

  fpDragOffset={
    pStart:{x:startPoint.x,y:startPoint.y},
    orig:JSON.parse(JSON.stringify(wall))
  };

  fpEndpointDrag=null;
  fpCanvas.style.cursor='grabbing';
  return true;
}



/* === v2.9.43 HARD WALL STOP ===
   Objects cannot cross a wall. Collision is solved directly in the drag
   calculation, before the next frame is rendered. */
function fpCollisionObjectDims(o){
  const defs=fpDefaultObjectDimensions?.(o?.type)||[60,60];
  const scale=Math.max(.01,Number(o?.scale)||1);
  return {
    w:Math.max(1,Number(o?.widthCm||defs[0]||60))*scale,
    d:Math.max(1,Number(o?.depthCm||defs[1]||60))*scale
  };
}
function fpCollisionSupport(o,ax,ay){
  const {w,d}=fpCollisionObjectDims(o);
  const r=(Number(o?.rotation)||0)*Math.PI/180;
  const ux=Math.cos(r),uy=Math.sin(r);
  const vx=-Math.sin(r),vy=Math.cos(r);
  return Math.abs(ax*ux+ay*uy)*w/2 + Math.abs(ax*vx+ay*vy)*d/2;
}
function fpHardStopObjectAgainstWalls(o,desiredX,desiredY,originX,originY){
  if(!o || ['wall','text','mirror','niche','door','window'].includes(o.type)){
    return {x:Number(desiredX),y:Number(desiredY),hit:false};
  }

  let x=Number(desiredX),y=Number(desiredY);
  const ox=Number(originX),oy=Number(originY);
  let hit=false;
  const snapTolerance=12; // magnetic zone; final physical gap is exactly 0 cm

  // A corner may contact two walls.
  for(let pass=0;pass<4;pass++){
    let changed=false;

    for(const w of (fpObjects||[])){
      if(!w||w.type!=='wall')continue;

      // TRUE room-side inner face.
      const f=fpInnerWallFace2927(w);
      const x1=Number(f.a.x),y1=Number(f.a.y);
      const x2=Number(f.b.x),y2=Number(f.b.y);
      const dx=x2-x1,dy=y2-y1;
      const len=Math.hypot(dx,dy);
      if(!(len>0.5))continue;

      const tx=dx/len,ty=dy/len;
      const nx=-ty,ny=tx;

      const supportN=fpCollisionSupport(o,nx,ny);
      const supportT=fpCollisionSupport(o,tx,ty);

      // IMPORTANT:
      // f is already the physical room-side wall face.
      // Therefore contact clearance = object support ONLY.
      // Do NOT add wallThickness/2 here.
      const clearance=supportN;

      // finite wall span check
      const tang=(x-x1)*tx+(y-y1)*ty;
      if(tang+supportT<0 || tang-supportT>len)continue;

      const d0=(ox-x1)*nx+(oy-y1)*ny;
      let dd=(x-x1)*nx+(y-y1)*ny;

      let side=Math.sign(d0);
      if(!side)side=Math.sign(dd)||1;

      if(side>0){
        const movingToward=dd<d0;
        if(dd<clearance || (movingToward && dd-clearance<=snapTolerance)){
          const delta=clearance-dd;
          x+=nx*delta;y+=ny*delta;
          hit=true;changed=true;
        }
      }else{
        const movingToward=dd>d0;
        if(dd>-clearance || (movingToward && (-clearance)-dd<=snapTolerance)){
          const delta=-clearance-dd;
          x+=nx*delta;y+=ny*delta;
          hit=true;changed=true;
        }
      }
    }

    if(!changed)break;
  }

  return {x,y,hit};
}


/* === v2.9.43 ARCHITECTURAL INNER-FACE MEASUREMENT ===
   Every architectural measurement is based on the room-side wall face.
   At corners (including 45° / arbitrary angles) the effective corner is the
   mathematical intersection of the two room-side offset lines. Wall thickness
   therefore never becomes part of the room's effective measurement. */

function fpLineIntersectionInfinite(a1,a2,b1,b2){
  const adx=a2.x-a1.x,ady=a2.y-a1.y;
  const bdx=b2.x-b1.x,bdy=b2.y-b1.y;
  const den=adx*bdy-ady*bdx;
  if(Math.abs(den)<1e-9)return null;
  const qx=b1.x-a1.x,qy=b1.y-a1.y;
  const t=(qx*bdy-qy*bdx)/den;
  return {x:a1.x+t*adx,y:a1.y+t*ady,t};
}

function fpWallInnerFaceRaw(wall){
  const face=fpInnerWallFace2927(wall);
  return {
    wall,a:face.a,b:face.b,
    axisA:{x:Number(wall.x1),y:Number(wall.y1)},
    axisB:{x:Number(wall.x2),y:Number(wall.y2)},
    inn:face.inn,out:{nx:-face.inn.nx,ny:-face.inn.ny},
    half:face.t,
    len:Math.hypot(Number(wall.x2)-Number(wall.x1),Number(wall.y2)-Number(wall.y1))
  };
}

function fpWallsAtAxisCorner(wall,x,y,tol=1.25){
  const result=[];
  for(const w of (fpObjects||[])){
    if(!w || w.type!=='wall' || w.id===wall.id)continue;
    const d1=Math.hypot(Number(w.x1)-x,Number(w.y1)-y);
    const d2=Math.hypot(Number(w.x2)-x,Number(w.y2)-y);
    if(d1<=tol || d2<=tol)result.push(w);
  }
  return result;
}

function fpEffectiveInnerCorner(wall,which){
  const face=fpWallInnerFaceRaw(wall);
  const axis=which==='start'?face.axisA:face.axisB;
  const own=which==='start'?face.a:face.b;
  const neighbors=fpWallsAtAxisCorner(wall,axis.x,axis.y);

  let best=null,bestScore=Infinity;
  for(const n of neighbors){
    const nf=fpWallInnerFaceRaw(n);
    const hit=fpLineIntersectionInfinite(face.a,face.b,nf.a,nf.b);
    if(!hit)continue;

    // Reject pathological far-away intersections from almost-parallel lines.
    const d=Math.hypot(hit.x-own.x,hit.y-own.y);
    const maxReasonable=Math.max(250,face.half*12,nf.half*12);
    if(d>maxReasonable)continue;

    // Prefer the closest valid inner-face intersection.
    if(d<bestScore){best=hit;bestScore=d;}
  }
  return best ? {x:best.x,y:best.y} : {x:own.x,y:own.y};
}


/* === v2.9.43 ARCHITECTURAL MITER WALL MODEL === */
function fpRoomInteriorNormal2927(wall){
  const x1=Number(wall.x1),y1=Number(wall.y1),x2=Number(wall.x2),y2=Number(wall.y2);
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1;

  // Two possible normals.
  const n1={nx:-dy/L,ny:dx/L};
  const n2={nx:dy/L,ny:-dx/L};
  const mid={x:(x1+x2)/2,y:(y1+y2)/2};

  // 1) Closed room: choose the normal pointing to polygon centroid.
  const poly=typeof getRoomPolygon==='function'?getRoomPolygon():null;
  if(poly && poly.length>=3){
    const cx=poly.reduce((s,p)=>s+Number(p.x),0)/poly.length;
    const cy=poly.reduce((s,p)=>s+Number(p.y),0)/poly.length;
    const vx=cx-mid.x,vy=cy-mid.y;
    return (vx*n1.nx+vy*n1.ny)>=0?n1:n2;
  }

  // 2) Open L/U/chain: infer the interior from walls connected to either end.
  // The interior side is the side toward the neighbouring wall body.
  const connected=[];
  const tol=.08;
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall'||w.id===wall.id)continue;
    const pts=[
      {x:Number(w.x1),y:Number(w.y1)},
      {x:Number(w.x2),y:Number(w.y2)}
    ];
    const sharedStart=pts.some(p=>Math.hypot(p.x-x1,p.y-y1)<=tol);
    const sharedEnd=pts.some(p=>Math.hypot(p.x-x2,p.y-y2)<=tol);
    if(!sharedStart&&!sharedEnd)continue;

    // Use the non-shared endpoint as evidence for where the connected wall lies.
    for(const p of pts){
      const ds=Math.hypot(p.x-x1,p.y-y1);
      const de=Math.hypot(p.x-x2,p.y-y2);
      if(ds>tol&&de>tol)connected.push(p);
    }
  }

  if(connected.length){
    const ax=connected.reduce((s,p)=>s+p.x,0)/connected.length;
    const ay=connected.reduce((s,p)=>s+p.y,0)/connected.length;
    const vx=ax-mid.x,vy=ay-mid.y;
    return (vx*n1.nx+vy*n1.ny)>=0?n1:n2;
  }

  // 3) Last fallback: old outside-normal logic.
  const out=wallOutsideNormal(wall);
  return {nx:-Number(out.nx||0),ny:-Number(out.ny||0)};
}
function fpOuterWallFace2927(wall){
  return {a:{x:Number(wall.x1),y:Number(wall.y1)},b:{x:Number(wall.x2),y:Number(wall.y2)}};
}
function fpInnerWallFace2927(wall){
  const outer=fpOuterWallFace2927(wall);
  const inn=fpRoomInteriorNormal2927(wall);
  const t=Math.max(0,Number(wall.thickness||fpWallThickness||15));
  return {a:{x:outer.a.x+inn.nx*t,y:outer.a.y+inn.ny*t},
          b:{x:outer.b.x+inn.nx*t,y:outer.b.y+inn.ny*t},inn,t};
}
function fpWallsSharingOuterCorner2927(wall,which,tol=.05){
  const p=which==='start'?{x:Number(wall.x1),y:Number(wall.y1)}:{x:Number(wall.x2),y:Number(wall.y2)};
  return (fpObjects||[]).filter(w=>{
    if(!w||w.type!=='wall'||w.id===wall.id)return false;
    return Math.hypot(Number(w.x1)-p.x,Number(w.y1)-p.y)<=tol ||
           Math.hypot(Number(w.x2)-p.x,Number(w.y2)-p.y)<=tol;
  });
}
function fpMiterInnerCorner2927(wall,which){
  const f=fpInnerWallFace2927(wall);
  const own=which==='start'?f.a:f.b;
  let best=null,bestD=Infinity;
  for(const n of fpWallsSharingOuterCorner2927(wall,which,.05)){
    const nf=fpInnerWallFace2927(n);
    const hit=fpLineIntersectionInfinite(f.a,f.b,nf.a,nf.b);
    if(!hit)continue;
    const d=Math.hypot(hit.x-own.x,hit.y-own.y);
    if(d<bestD&&d<500){best={x:hit.x,y:hit.y};bestD=d;}
  }
  return best||own;
}
function fpEffectiveInnerWallSegment2927(wall){
  const x1=Number(wall.x1),y1=Number(wall.y1);
  const x2=Number(wall.x2),y2=Number(wall.y2);
  const dx=x2-x1,dy=y2-y1;
  const rawLen=Math.hypot(dx,dy);

  if(rawLen<0.001){
    const p={x:x1,y:y1};
    return {wall,x1,y1,x2,y2,a:p,b:p,len:0,trueInner:true};
  }

  const ux=dx/rawLen,uy=dy/rawLen;
  const t=Math.max(0,Number(wall.thickness||fpWallThickness||15));

  const joinedStart=fpWallsSharingOuterCorner2927(wall,'start',.08).length>0;
  const joinedEnd=fpWallsSharingOuterCorner2927(wall,'end',.08).length>0;

  const startInset=joinedStart?t:0;
  const endInset=joinedEnd?t:0;

  const s={x:x1+ux*startInset,y:y1+uy*startInset};
  const e={x:x2-ux*endInset,y:y2-uy*endInset};

  return {
    wall,
    x1:s.x,y1:s.y,x2:e.x,y2:e.y,
    a:s,b:e,
    len:(Number.isFinite(Number(wall.innerLengthCm))&&Number(wall.innerLengthCm)>0)?Number(wall.innerLengthCm):Math.max(0,rawLen-startInset-endInset),
    rawLen,
    startInset,
    endInset,
    trueInner:true,
    dimensionRule:'OUTER_MINUS_CONNECTED_WALL_THICKNESSES'
  };
}
function fpWallMiterPolygon2927(wall){
  const outer=fpOuterWallFace2927(wall),inner=fpInnerWallFace2927(wall);
  let s=fpMiterInnerCorner2927(wall,'start'),e=fpMiterInnerCorner2927(wall,'end');
  const dx=outer.b.x-outer.a.x,dy=outer.b.y-outer.a.y,L=Math.hypot(dx,dy)||1;
  const ux=dx/L,uy=dy/L,t=Math.max(0,Number(wall.thickness||fpWallThickness||15));
  if(fpWallsSharingOuterCorner2927(wall,'start',.05).length===0)s={x:inner.a.x+ux*t,y:inner.a.y+uy*t};
  if(fpWallsSharingOuterCorner2927(wall,'end',.05).length===0)e={x:inner.b.x-ux*t,y:inner.b.y-uy*t};
  return [outer.a,outer.b,e,s];
}
function fpOuterCornerCandidates2927(){
  const pts=[];
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall')continue;
    pts.push({x:Number(w.x1),y:Number(w.y1),wallId:w.id,end:'start'});
    pts.push({x:Number(w.x2),y:Number(w.y2),wallId:w.id,end:'end'});
  }
  return pts;
}
function fpMagneticOuterCornerFromEvent2927(ev){
  if(!fpCanvas||ev?.clientX==null||ev?.clientY==null)return null;
  const rect=fpCanvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  const sx=rect.width/Math.max(1,fpCanvas.width),sy=rect.height/Math.max(1,fpCanvas.height);
  const radiusPx=window.matchMedia?.('(pointer: coarse)')?.matches?120:76;
  let best=null,bestD=Infinity;
  for(const p of fpOuterCornerCandidates2927()){
    const px=rect.left+(p.x*fpZoom+fpViewOffsetX)*sx;
    const py=rect.top +(p.y*fpZoom+fpViewOffsetY)*sy;
    const d=Math.hypot(Number(ev.clientX)-px,Number(ev.clientY)-py);
    if(d<=radiusPx&&d<bestD){best={...p,screenDistance:d};bestD=d;}
  }
  return best;
}
function fpSnapPointToOuterCorner2927(point,maxWorld=35,excludeWallId=null){
  let best=null,bestD=Infinity;
  for(const p of fpOuterCornerCandidates2927()){
    if(excludeWallId&&p.wallId===excludeWallId)continue;
    const d=Math.hypot(Number(point.x)-p.x,Number(point.y)-p.y);
    if(d<=maxWorld&&d<bestD){best=p;bestD=d;}
  }
  return best?{...best}:null;
}

function fpDrawInnerDimensionPoints2929(){
  if(!fpShowMeasures)return;
  const z=Math.max(.2,Number(fpZoom)||1);
  fpCtx.save();
  fpCtx.fillStyle='#2563eb';
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall')continue;
    const g=fpEffectiveInnerWallSegment2927(w);
    for(const p of [g.a,g.b]){
      fpCtx.beginPath();
      fpCtx.arc(p.x,p.y,3.2/z,0,Math.PI*2);
      fpCtx.fill();
    }
  }
  fpCtx.restore();
}
function fpDrawOuterCornerMarkers2927(){
  if(!fpShowMeasures)return;
  const z=Math.max(.2,Number(fpZoom)||1);
  fpCtx.save();fpCtx.strokeStyle='rgba(37,99,235,.75)';fpCtx.lineWidth=1.4/z;
  for(const p of fpOuterCornerCandidates2927()){
    fpCtx.beginPath();
    fpCtx.moveTo(p.x-4/z,p.y-4/z);fpCtx.lineTo(p.x+4/z,p.y+4/z);
    fpCtx.moveTo(p.x+4/z,p.y-4/z);fpCtx.lineTo(p.x-4/z,p.y+4/z);fpCtx.stroke();
  }
  fpCtx.restore();
}
function fpEffectiveInnerWallSegment(wall){return fpEffectiveInnerWallSegment2927(wall);}


function fpInnerDimensionRule2933(wall){
  const g=fpEffectiveInnerWallSegment2927(wall);
  return {
    start:{x:g.x1,y:g.y1},
    end:{x:g.x2,y:g.y2},
    lengthCm:g.len,
    rawLengthCm:g.rawLen,
    startExtensionCm:g.startExtension||0,
    endExtensionCm:g.endExtension||0,
    rule:'INNER_CORNER_EQUALS_MITER_ENDPOINT_PLUS_THICKNESS'
  };
}
function fpWallDimensionGeometry(wall){
  const sx=Number(wall.x1),sy=Number(wall.y1);
  const ex=Number(wall.x2),ey=Number(wall.y2);
  const dx=ex-sx,dy=ey-sy;
  const len=Math.hypot(dx,dy);
  if(!(len>0.001))return {sx,sy,ex,ey,len:0,rawLen:0,startInset:0};
  return {
    sx,sy,ex,ey,len,rawLen:len,startInset:0,
    ux:dx/len,uy:dy/len,
    outsideGeometry:true
  };
}




/* === v2.9.28 WALL-TO-WALL HARD STOP ===
   New/interior walls stop exactly at the first wall they hit.
   They cannot be dragged/drawn through or beyond another wall. */
function fpSegIntersectionPoint(a,b,c,d){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y;
  const den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-9)return null;
  const qx=c.x-a.x,qy=c.y-a.y;
  const t=(qx*sy-qy*sx)/den;
  const u=(qx*ry-qy*rx)/den;
  if(t>=-1e-7&&t<=1+1e-7&&u>=-1e-7&&u<=1+1e-7)
    return {x:a.x+t*rx,y:a.y+t*ry,t,u};
  return null;
}

/* v2.9.28: A wall that starts on an existing boundary wall may only grow
   toward the room/interior side. Dragging toward the exterior returns the
   endpoint to the exact start point (= 0 cm outside). Works for open rooms too. */
function fpApproxRoomCenter(excludeId=null){
  const pts=[];
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall'||w.id===excludeId)continue;
    pts.push({x:Number(w.x1),y:Number(w.y1)},{x:Number(w.x2),y:Number(w.y2)});
  }
  if(!pts.length)return null;
  return {x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};
}
function fpKeepWallOnInteriorSide(start,end,anchorWallId){
  if(!anchorWallId)return {point:{x:Number(end.x),y:Number(end.y)},blocked:false};
  const w=(fpObjects||[]).find(q=>q&&q.type==='wall'&&q.id===anchorWallId);
  if(!w)return {point:{x:Number(end.x),y:Number(end.y)},blocked:false};

  const ax=Number(w.x1),ay=Number(w.y1),bx=Number(w.x2),by=Number(w.y2);
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;
  let nx=-dy/len,ny=dx/len;
  const mid={x:(ax+bx)/2,y:(ay+by)/2};
  const center=fpApproxRoomCenter(w.id);
  if(center && ((center.x-mid.x)*nx+(center.y-mid.y)*ny)<0){nx=-nx;ny=-ny}

  const vx=Number(end.x)-Number(start.x),vy=Number(end.y)-Number(start.y);
  const side=vx*nx+vy*ny;

  // Allow movement along the anchor wall, but never to its exterior side.
  if(side < -0.5){
    return {point:{x:Number(start.x),y:Number(start.y)},blocked:true};
  }
  return {point:{x:Number(end.x),y:Number(end.y)},blocked:false};
}
function fpClampWallEndToWalls(start,end,ignoreIds=[]){
  const ignore=new Set((ignoreIds||[]).filter(Boolean));
  let best=null;
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall'||ignore.has(w.id))continue;
    const hit=fpSegIntersectionPoint(
      {x:Number(start.x),y:Number(start.y)},{x:Number(end.x),y:Number(end.y)},
      {x:Number(w.x1),y:Number(w.y1)},{x:Number(w.x2),y:Number(w.y2)}
    );
    if(!hit)continue;
    // Ignore the wall on which the new wall starts (t≈0), but catch every
    // later collision. The first collision is the hard stop.
    if(hit.t<=0.0005)continue;
    if(!best||hit.t<best.t)best={...hit,wall:w};
  }
  if(!best)return {point:{x:Number(end.x),y:Number(end.y)},hit:null};
  return {
    point:{x:best.x,y:best.y},
    hit:{wallId:best.wall.id,x:best.x,y:best.y,distanceCm:0}
  };
}

/* === v2.9.28 ROBUST WALL COLLISION ENGINE ===
   1) New walls stay inside a closed room polygon.
   2) New walls stop before touching any placed object.
   3) Wall thickness is respected for object collision.
   4) Same rules apply while editing a wall endpoint. */

function fpPointInsideOrOnPolygon(p,poly,eps=0.75){
  if(!poly||poly.length<3)return true;
  if(pointInPolygon(p,poly))return true;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const q=nearestPointOnSegment(p,a,b);
    if(Math.hypot(p.x-q.x,p.y-q.y)<=eps)return true;
  }
  return false;
}

function fpClampSegmentInsideRoom(start,end,anchorWallId=null){
  const poly=getRoomPolygon?.();
  if(!poly||poly.length<3)return {point:{x:Number(end.x),y:Number(end.y)},hit:null};

  const sx=Number(start.x),sy=Number(start.y),ex=Number(end.x),ey=Number(end.y);
  const dx=ex-sx,dy=ey-sy;
  const len=Math.hypot(dx,dy);
  if(len<0.001)return {point:{x:sx,y:sy},hit:null};

  // Probe a few cm from the start. If the proposed direction immediately
  // leaves the room, stop exactly at the start point.
  const probeDist=Math.min(3,len*.25);
  const probe={x:sx+dx/len*probeDist,y:sy+dy/len*probeDist};
  if(!fpPointInsideOrOnPolygon(probe,poly,0.6)){
    return {point:{x:sx,y:sy},hit:{kind:'room-boundary',distanceCm:0}};
  }

  // If endpoint is already inside, no room-boundary clamp is needed.
  if(fpPointInsideOrOnPolygon({x:ex,y:ey},poly,0.6)){
    return {point:{x:ex,y:ey},hit:null};
  }

  // Find first polygon-edge intersection after start.
  let best=null;
  for(let i=0;i<poly.length;i++){
    const c=poly[i],d=poly[(i+1)%poly.length];
    const hit=fpSegIntersectionPoint({x:sx,y:sy},{x:ex,y:ey},c,d);
    if(!hit || hit.t<=0.0005)continue;
    if(!best||hit.t<best.t)best=hit;
  }
  if(!best)return {point:{x:sx,y:sy},hit:{kind:'room-boundary',distanceCm:0}};
  return {
    point:{x:best.x,y:best.y},
    hit:{kind:'room-boundary',x:best.x,y:best.y,distanceCm:0}
  };
}

function fpObjectCollisionPolygon(o,extra=0){
  if(!o || ['wall','text'].includes(o.type))return null;
  const corners=objectFootprintCorners(o);
  if(!corners||corners.length<4)return null;

  // Expand rectangle around its local axes by wall half thickness.
  const cx=Number(o.x)||0,cy=Number(o.y)||0;
  const rot=(Number(o.rotation)||0)*Math.PI/180;
  const ux={x:Math.cos(rot),y:Math.sin(rot)};
  const vy={x:-Math.sin(rot),y:Math.cos(rot)};
  const defs=fpDefaultObjectDimensions?.(o.type)||[60,60];
  const scale=Math.max(.01,Number(o.scale)||1);
  const hw=Math.max(1,Number(o.widthCm||defs[0]||60))*scale/2 + extra;
  const hd=Math.max(1,Number(o.depthCm||defs[1]||60))*scale/2 + extra;
  return [
    {x:cx-ux.x*hw-vy.x*hd,y:cy-ux.y*hw-vy.y*hd},
    {x:cx+ux.x*hw-vy.x*hd,y:cy+ux.y*hw-vy.y*hd},
    {x:cx+ux.x*hw+vy.x*hd,y:cy+ux.y*hw+vy.y*hd},
    {x:cx-ux.x*hw+vy.x*hd,y:cy-ux.y*hw+vy.y*hd}
  ];
}

function fpClampWallBeforeObjects(start,end,ignoreIds=[] , wallThickness=15){
  const ignore=new Set((ignoreIds||[]).filter(Boolean));
  const half=Math.max(0,Number(wallThickness)||15)/2;
  let best=null;

  for(const o of (fpObjects||[])){
    if(!o || ignore.has(o.id) || ['wall','text'].includes(o.type))continue;
    const poly=fpObjectCollisionPolygon(o,half);
    if(!poly)continue;

    // If the wall start is already inside the object's expanded footprint,
    // do not create an invalid overlap.
    if(fpPointInsideOrOnPolygon(start,poly,0.01)){
      return {point:{x:Number(start.x),y:Number(start.y)},hit:{kind:'object',objectId:o.id,distanceCm:0}};
    }

    for(let i=0;i<poly.length;i++){
      const c=poly[i],d=poly[(i+1)%poly.length];
      const hit=fpSegIntersectionPoint(start,end,c,d);
      if(!hit || hit.t<=0.0005)continue;
      if(!best || hit.t<best.t){
        best={...hit,object:o};
      }
    }
  }

  if(!best)return {point:{x:Number(end.x),y:Number(end.y)},hit:null};
  return {
    point:{x:best.x,y:best.y},
    hit:{kind:'object',objectId:best.object.id,x:best.x,y:best.y,distanceCm:0}
  };
}


/* === v2.9.28 WALL BODY MAGNET ===
   Magnetic contact is calculated from the visible wall faces, not only
   from the centre lines. */
function fpDistPointSeg2923(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,vv=vx*vx+vy*vy;
  let t=vv?((wx*vx+wy*vy)/vv):0;t=Math.max(0,Math.min(1,t));
  const q={x:a.x+t*vx,y:a.y+t*vy};
  return {d:Math.hypot(p.x-q.x,p.y-q.y),q,t};
}
function fpWallBodySnap2923(start,end,ignoreIds=[],thickness=15){
  const ignore=new Set((ignoreIds||[]).filter(Boolean)),half=(Number(thickness)||15)/2;
  let best=null;
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall'||ignore.has(w.id))continue;
    const A={x:Number(w.x1),y:Number(w.y1)},B={x:Number(w.x2),y:Number(w.y2)};
    const dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy)||1,n={x:-dy/L,y:dx/L};
    const wh=(Number(w.thickness)||15)/2;
    for(const p of [start,end]){
      const near=fpDistPointSeg2923(p,A,B);
      const signed=(p.x-near.q.x)*n.x+(p.y-near.q.y)*n.y,sgn=signed>=0?1:-1;
      const gap=Math.abs(signed)-wh-half;
      if(Math.abs(gap)<=18){
        const shift=-sgn*gap;
        const cand={start:{x:start.x+n.x*shift,y:start.y+n.y*shift},
                    end:{x:end.x+n.x*shift,y:end.y+n.y*shift},
                    gap:Math.abs(gap),wallId:w.id};
        if(!best||cand.gap<best.gap)best=cand;
      }
    }
  }
  return best;
}
function fpResolveWallEndpoint(start,end,opts={}){
  const anchorWallId=opts.anchorWallId||null;
  const ignoreIds=[...(opts.ignoreIds||[])];
  if(anchorWallId)ignoreIds.push(anchorWallId);

  // 1. Keep inside closed room when possible.
  let room=fpClampSegmentInsideRoom(start,end,anchorWallId);
  let p=room.point;

  // 2. Existing wall hard-stop.
  let walls=fpClampWallEndToWalls(start,p,ignoreIds);
  p=walls.point;

  // 3. Object hard-stop.
  const thickness=opts.wallThickness||fpWallThickness||15;
  let objects=fpClampWallBeforeObjects(start,p,ignoreIds,thickness);
  p=objects.point;

  // 4. Magnetic visible-face contact. Within 18 cm the complete new wall is
  // shifted flush against the nearest existing wall: exact visible gap 0 cm.
  const bodySnap=fpWallBodySnap2923(start,p,ignoreIds,thickness);
  if(bodySnap){
    const objectCollision=fpClampWallBeforeObjects(bodySnap.start,bodySnap.end,ignoreIds,thickness).hit;
    if(!objectCollision){
      return {
        point:bodySnap.end,
        startPoint:bodySnap.start,
        hit:{kind:'wall-face',wallId:bodySnap.wallId,distanceCm:0}
      };
    }
  }

  return {
    point:p,
    hit:objects.hit||walls.hit||room.hit||null
  };
}

/* === v2.9.28 SOLID CAD COLLISION ===
   Wall collision is based on the full visible wall rectangle, not centerlines.
   Contact is allowed; geometric overlap is forbidden. */

function fpWallRect2924(start,end,thickness=15){
  const sx=Number(start.x),sy=Number(start.y),ex=Number(end.x),ey=Number(end.y);
  const dx=ex-sx,dy=ey-sy,L=Math.hypot(dx,dy);
  if(L<0.001)return [];
  const nx=-dy/L,ny=dx/L,t=Math.max(.1,Number(thickness)||15);
  return [{x:sx,y:sy},{x:ex,y:ey},{x:ex+nx*t,y:ey+ny*t},{x:sx+nx*t,y:sy+ny*t}];
}

function fpPolyAxes2924(poly){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
    if(L>.0001)out.push({x:-dy/L,y:dx/L});
  }
  return out;
}
function fpProject2924(poly,axis){
  let min=Infinity,max=-Infinity;
  for(const p of poly){
    const v=p.x*axis.x+p.y*axis.y;
    if(v<min)min=v;if(v>max)max=v;
  }
  return {min,max};
}
function fpSolidOverlap2924(a,b,epsilon=.12){
  if(!a||!b||a.length<3||b.length<3)return false;
  const axes=[...fpPolyAxes2924(a),...fpPolyAxes2924(b)];
  for(const axis of axes){
    const A=fpProject2924(a,axis),B=fpProject2924(b,axis);
    // touching / sub-mm numerical overlap is allowed
    if(Math.min(A.max,B.max)-Math.max(A.min,B.min)<=epsilon)return false;
  }
  return true;
}

function fpObjectPoly2924(o){
  if(!o || ['wall','text'].includes(o.type))return null;
  const defs=fpDefaultObjectDimensions?.(o.type)||[60,60];
  const scale=Math.max(.01,Number(o.scale)||1);
  // v2.9.28: collision footprint is always based on exact entered dimensions.
  const w=Math.max(1,Number(o.widthCm ?? defs[0] ?? 60))*scale;
  const d=Math.max(1,Number(o.depthCm ?? defs[1] ?? 60))*scale;
  const cx=Number(o.x)||0,cy=Number(o.y)||0,r=(Number(o.rotation)||0)*Math.PI/180;
  const ux={x:Math.cos(r),y:Math.sin(r)},vy={x:-Math.sin(r),y:Math.cos(r)};
  const hw=w/2,hd=d/2;
  return [
    {x:cx-ux.x*hw-vy.x*hd,y:cy-ux.y*hw-vy.y*hd},
    {x:cx+ux.x*hw-vy.x*hd,y:cy+ux.y*hw-vy.y*hd},
    {x:cx+ux.x*hw+vy.x*hd,y:cy+ux.y*hw+vy.y*hd},
    {x:cx-ux.x*hw+vy.x*hd,y:cy-ux.y*hw+vy.y*hd}
  ];
}

function fpWallSolidCollision2924(start,end,opts={}){
  const ignore=new Set((opts.ignoreIds||[]).filter(Boolean));
  const rect=fpWallRect2924(start,end,opts.thickness||15);
  if(rect.length<4)return null;

  // Wall-vs-wall
  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall'||ignore.has(w.id))continue;
    const other=fpWallRect2924(
      {x:Number(w.x1),y:Number(w.y1)},
      {x:Number(w.x2),y:Number(w.y2)},
      Number(w.thickness)||15
    );
    if(fpSolidOverlap2924(rect,other,.15)){
      return {kind:'wall',id:w.id};
    }
  }

  // Wall-vs-object
  for(const o of (fpObjects||[])){
    if(!o||ignore.has(o.id)||['wall','text'].includes(o.type))continue;
    const op=fpObjectPoly2924(o);
    if(op && fpSolidOverlap2924(rect,op,.15)){
      return {kind:'object',id:o.id};
    }
  }
  return null;
}

function fpClampWallBySolid2924(start,desiredEnd,opts={}){
  const sx=Number(start.x),sy=Number(start.y),ex=Number(desiredEnd.x),ey=Number(desiredEnd.y);
  const dx=ex-sx,dy=ey-sy;
  const ignoreIds=[...(opts.ignoreIds||[])];
  const anchorId=opts.anchorWallId||null;
  if(anchorId)ignoreIds.push(anchorId);

  // Existing room/interior-side logic remains the first barrier.
  let requested={x:ex,y:ey};
  if(anchorId){
    requested=fpKeepWallOnInteriorSide({x:sx,y:sy},requested,anchorId).point;
  }

  // If requested full wall is valid, keep it.
  if(!fpWallSolidCollision2924({x:sx,y:sy},requested,{
    ignoreIds,thickness:opts.thickness||15
  })){
    return {point:requested,hit:null};
  }

  // Binary-search the furthest VALID endpoint. This is the critical part:
  // the wall physically stops at the exact first contact and never jumps through.
  let lo=0,hi=1,best={x:sx,y:sy};
  for(let i=0;i<34;i++){
    const t=(lo+hi)/2;
    const p={x:sx+(requested.x-sx)*t,y:sy+(requested.y-sy)*t};
    const collision=fpWallSolidCollision2924({x:sx,y:sy},p,{
      ignoreIds,thickness:opts.thickness||15
    });
    if(collision){
      hi=t;
    }else{
      lo=t;best=p;
    }
  }

  const hit=fpWallSolidCollision2924(
    {x:sx,y:sy},
    {x:sx+(requested.x-sx)*Math.min(1,hi+1e-5),
     y:sy+(requested.y-sy)*Math.min(1,hi+1e-5)},
    {ignoreIds,thickness:opts.thickness||15}
  );
  return {point:best,hit:hit||{kind:'solid-stop'}};
}

function fpClampWholeWallMove2924(orig,cand,o){
  const ddx=Number(cand.x1)-Number(orig.x1),ddy=Number(cand.y1)-Number(orig.y1);
  const ignoreIds=[o.id];

  const validAt=t=>{
    const s={x:Number(orig.x1)+ddx*t,y:Number(orig.y1)+ddy*t};
    const e={x:Number(orig.x2)+ddx*t,y:Number(orig.y2)+ddy*t};
    return !fpWallSolidCollision2924(s,e,{ignoreIds,thickness:o.thickness||15});
  };

  if(validAt(1))return cand;

  let lo=0,hi=1;
  for(let i=0;i<34;i++){
    const t=(lo+hi)/2;
    if(validAt(t))lo=t;else hi=t;
  }
  return {
    x1:Number(orig.x1)+ddx*lo,y1:Number(orig.y1)+ddy*lo,
    x2:Number(orig.x2)+ddx*lo,y2:Number(orig.y2)+ddy*lo
  };
}

/* === v2.9.28 CORNER-START OUTWARD DRAWING ===
   Magnet is intentionally asymmetric:
   - pointer DOWN near an existing OUTER corner -> exact corner capture.
   - drawing END does NOT magnetize to an existing corner.
   - if drawing started from an exact outer corner, the new wall may grow
     outward from the room boundary. */
function fpStartedFromOuterCorner2928(){
  return !!(fpWallStartAnchor && fpWallStartAnchor.wallId &&
            (fpWallStartAnchor.end==='start'||fpWallStartAnchor.end==='end'));
}
function fpAllowOutwardFromCorner2928(start,point,anchorWallId){
  if(fpStartedFromOuterCorner2928()){
    return {point:{x:Number(point.x),y:Number(point.y)},blocked:false};
  }
  return fpKeepWallOnInteriorSide(start,point,anchorWallId);
}

function floorStart(ev){
  if(!fpCanvas)return;
  if(fpPickingFloorTileOrigin){ev.preventDefault();const p=fpPoint(ev);setFloorTileOriginFromPoint(p,false);fpPickingFloorTileOrigin=false;updateFloorTilePanel();drawFloorplan();if(fp3DMode)refresh3D();return;}
  ev.preventDefault();

  const p=fpPoint(ev);
  updateCadMousePosition(p);

  // v2.2: drag the visible Fliesenstart handle directly in Auswahl mode.
  if(fpTool==='select' && floorTileOriginHandleHit(p)){
    pushHistory();
    fpDraggingFloorTileOrigin=true;
    fpFloorTileDragStart={x:p.x,y:p.y};
    fpDrawing=true;
    fpSelectedId=null;
    fpDragOffset=null;
    fpCanvas.style.cursor='grabbing';
    return;
  }

  if(fpTool==='pan'){
    fpPanStart={x:ev.clientX,y:ev.clientY,offsetX:fpViewOffsetX,offsetY:fpViewOffsetY};
    fpDrawing=true;
    return;
  }

  if(fpTool==='select'){
    // First check the rotation handle of the currently selected object.
    const current=fpObjects.find(x=>x.id===fpSelectedId);
    if(current && rotationHandleHitTest(p,current)){
      pushHistory();
      beginObjectRotation(current,p);
      fpDrawing=true;
      fpDragOffset=null;
      drawFloorplan();
      updateSelectedInfo();
      return;
    }

    const hit=hitTest(p);

  // v2.9.1: Wall touch drag.
  // Short tap = select only. Hold 500 ms = wall becomes draggable.
  if(fpTool==='select' && hit && hit.type==='wall'){
    fpSelectedId=hit.id;
    fpDragOffset=null;
    fpEndpointDrag=null;
    fpDrawing=true; // IMPORTANT: pointermove must continue during the hold period.

    if(fpWallMoveHold.timer)clearTimeout(fpWallMoveHold.timer);
    fpWallMoveHold={
      timer:null,
      ready:false,
      wallId:hit.id,
      start:{x:p.x,y:p.y},
      moved:false,
      connected:[]
    };

    const wallId=hit.id;
    const startPoint={x:p.x,y:p.y};

    fpWallMoveHold.timer=setTimeout(()=>{
      if(fpWallMoveHold.wallId===wallId && fpDrawing){
        fpBeginHeldWallDrag(hit,startPoint);
        drawFloorplan();
        updateSelectedInfo();
      }
    },500);

    updateSelectedInfo();
    drawFloorplan();
    ev.preventDefault();
    return;
  }

    fpSelectedId=hit?hit.id:null;
    if(hit){
      pushHistory();
      fpDragOffset={
        pStart:{x:p.x,y:p.y},
        orig:JSON.parse(JSON.stringify(hit))
      };
      fpDrawing=true;
    }else{
      fpDrawing=false;
    }
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if(fpTool==='wall'){
    pushHistory();

    const screenHit=fpMagneticOuterCornerFromEvent2927(ev)||fpMagneticEndpointFromEvent(ev);
    const rect=fpCanvas?.getBoundingClientRect?.();
    const cssToWorld=(rect&&rect.width>0)
      ? (fpCanvas.width/rect.width)/Math.max(.15,Number(fpZoom)||1)
      : 1;
    const coarse=window.matchMedia?.('(pointer: coarse)')?.matches;
    const chainWorldLimit=(coarse?110:72)*cssToWorld;
    const nearLast=fpLastWallEnd &&
      Math.hypot(Number(p.x)-Number(fpLastWallEnd.x),Number(p.y)-Number(fpLastWallEnd.y))<=chainWorldLimit;

    if(screenHit){
      fpWallStartAnchor={
        wallId:screenHit.wallId,
        end:screenHit.end,
        x:Number(screenHit.x),
        y:Number(screenHit.y)
      };
      fpStart={x:fpWallStartAnchor.x,y:fpWallStartAnchor.y};
    }else if(nearLast){
      fpWallStartAnchor={
        wallId:null,
        end:'chain',
        x:Number(fpLastWallEnd.x),
        y:Number(fpLastWallEnd.y)
      };
      fpStart={x:fpWallStartAnchor.x,y:fpWallStartAnchor.y};
    }else{
      fpWallStartAnchor=null;
      fpStart={x:snap(Number(p.x)),y:snap(Number(p.y))};
    }

    const connectedWall=fpWallStartAnchor?.wallId
      ? (fpObjects||[]).find(w=>w.type==='wall'&&w.id===fpWallStartAnchor.wallId)
      : connectedWallAtStart(fpStart);

    fpPreview={
      id:'preview',
      type:fpTool,
      x1:fpStart.x,
      y1:fpStart.y,
      x2:fpStart.x,
      y2:fpStart.y,
      thickness:fpWallThickness,
      layer:'walls',
      snapTarget:null,
      snappedToTarget:false,
      connectedWallId:connectedWall?.id||null
    };
    fpDrawing=true;
    drawFloorplan(fpPreview);
    return;
  }

  if(fpTool==='tileOrigin'){
    fp3DOptions.tileOriginX=Math.round(p.x);
    fp3DOptions.tileOriginY=Math.round(p.y);
    const tx=$('fpTileOriginX'),ty=$('fpTileOriginY');
    if(tx)tx.value=String(fp3DOptions.tileOriginX);
    if(ty)ty.value=String(fp3DOptions.tileOriginY);
    if(fpRecord)fpRecord.threeDOptions={...fp3DOptions};
    drawFloorplan();
    refresh3D();
    return;
  }

  pushHistory();
  const wallMountedTool=(fpTool==='mirror'||fpTool==='niche');
  const x=wallMountedTool?Number(p.x):snap(p.x);
  const y=wallMountedTool?Number(p.y):snap(p.y);

  if(fpTool==='text'){
    const text=prompt('Beschriftung eingeben:','');
    if(text){
      fpObjects.push({id:uidObj(),type:'text',x,y,text,rotation:0,scale:1,layer:'notes'});
    }
  }else{
    const dims={
      door:[90,15],window:[100,15],wc:[40,70],shower:[90,90],walkInShower:[100,100],glass:[100,1],
      bathtub:[180,80],sink:[60,50],drain:[15,15],
      kitchenSink:[60,60],stove:[60,60],fridge:[60,65],washingMachine:[60,65],
      table:[160,90],chair:[50,50],sofa:[220,90],bed:[200,100],cabinet:[120,60],plant:[45,45],mirror:[80,5],niche:[60,12]
    };
    const d=dims[fpTool]||[60,40];
    const newObj={
      id:uidObj(),type:fpTool,x,y,rotation:0,scale:1,
      widthCm:d[0],depthCm:d[1],layer:layerForType(fpTool),
      heightCm:fpTool==='door'?205:(fpTool==='window'?120:(fpTool==='mirror'?80:(fpTool==='niche'?60:(fpTool==='glass'?200:undefined)))),
      floorHeightCm:fpTool==='mirror'?110:(fpTool==='niche'?100:(fpTool==='window'?90:0)),
      mountHeightCm:fpTool==='mirror'?110:(fpTool==='niche'?100:undefined),
      sillHeightCm:fpTool==='window'?90:undefined,
      openingDirection:(fpTool==='door'||fpTool==='window')?'right':undefined,
      openingSide:fpTool==='door'?'inside':undefined,
      wallFace:(fpTool==='door'||fpTool==='window')?'inside':undefined,
      slopePct:fpTool==='walkInShower'?2.0:undefined,
      drainType:fpTool==='walkInShower'?'line':undefined,
      slopeDirection:fpTool==='walkInShower'?'back':undefined,
      drainLengthCm:fpTool==='walkInShower'?80:undefined, drainWidthCm:fpTool==='walkInShower'?5:undefined, drainOffsetCm:fpTool==='walkInShower'?10:undefined, recessCm:fpTool==='walkInShower'?0:undefined
    };
    const placed=constrainObjectPlacement(newObj,x,y);
    newObj.x=placed.x;
    newObj.y=placed.y;
    newObj.rotation=placed.rotation;
    assignWallPlacementMeta(newObj,placed);
    newObj._showSideDimensions=true;
    fpObjects.push(newObj);
  }
  drawFloorplan();
}

function floorMove(ev){
  if(!fpDrawing)return;
  ev.preventDefault();

  const p=fpPoint(ev);

  if(fpDraggingFloorTileOrigin){
    setFloorTileOriginFromPoint(p,true);
    return;
  }

  // Duvar için 500 ms bekleme dolmadan hiçbir konum değişikliği yapma.
  if(fpWallMoveHold.wallId && !fpWallMoveHold.ready){
    const dx=p.x-(fpWallMoveHold.start?.x||p.x);
    const dy=p.y-(fpWallMoveHold.start?.y||p.y);
    if(Math.hypot(dx,dy)>8){
      fpWallMoveHold.moved=true;
    }
    ev.preventDefault();
    return;
  }


  if(fpTool==='pan' && fpPanStart){
    const r=fpCanvas.getBoundingClientRect();
    const sx=fpCanvas.width/r.width;
    const sy=fpCanvas.height/r.height;
    fpViewOffsetX=fpPanStart.offsetX+(ev.clientX-fpPanStart.x)*sx;
    fpViewOffsetY=fpPanStart.offsetY+(ev.clientY-fpPanStart.y)*sy;
    drawFloorplan();
    return;
  }

  if(fpTool==='select' && fpObjectRotateDrag){
    if(updateObjectRotationFromPointer(p)){
      drawFloorplan();
      updateSelectedInfo();
    }
    return;
  }

  if(fpTool==='select' && fpSelectedId){
    const o=fpObjects.find(x=>x.id===fpSelectedId);
    if(!o || !fpDragOffset)return;

    const dx=p.x-fpDragOffset.pStart.x;
    const dy=p.y-fpDragOffset.pStart.y;
    const orig=fpDragOffset.orig;

    if(o.type==='wall'){
      if(fpEndpointDrag==='start'){
        const raw=snapAnglePoint({x:orig.x2,y:orig.y2},{x:orig.x1+dx,y:orig.y1+dy});
        const pre=fpResolveWallEndpoint({x:orig.x2,y:orig.y2},raw,{
          anchorWallId:o.connectedEnd?.wallId||null,
          ignoreIds:[o.id],
          wallThickness:o.thickness
        });
        const stop=fpClampWallBySolid2924({x:orig.x2,y:orig.y2},pre.point,{
          anchorWallId:o.connectedEnd?.wallId||null,
          ignoreIds:[o.id],
          thickness:o.thickness
        });
        const ep=stop.point;
        o.x1=ep.x;o.y1=ep.y;o.x2=orig.x2;o.y2=orig.y2;
        o.connectedStart=stop.hit?{wallId:stop.hit.wallId,end:'surface',distanceCm:0}:o.connectedStart;
      }else if(fpEndpointDrag==='end'){
        let raw=snapAnglePoint({x:orig.x1,y:orig.y1},{x:orig.x2+dx,y:orig.y2+dy});
        const anchorId=o.connectedStart?.wallId||connectedWallAtStart({x:orig.x1,y:orig.y1})?.id||null;
        raw=fpKeepWallOnInteriorSide({x:orig.x1,y:orig.y1},raw,anchorId).point;
        const pre=fpResolveWallEndpoint({x:orig.x1,y:orig.y1},raw,{
          anchorWallId:anchorId,
          ignoreIds:[o.id],
          wallThickness:o.thickness
        });
        const stop=fpClampWallBySolid2924({x:orig.x1,y:orig.y1},pre.point,{
          anchorWallId:anchorId,
          ignoreIds:[o.id],
          thickness:o.thickness
        });
        const ep=stop.point;
        o.x1=orig.x1;o.y1=orig.y1;o.x2=ep.x;o.y2=ep.y;
        o.connectedEnd=stop.hit?{wallId:stop.hit.wallId,end:'surface',distanceCm:0}:o.connectedEnd;
      }else{
        const targetDx=snap(orig.x1+dx)-orig.x1;
        const targetDy=snap(orig.y1+dy)-orig.y1;

        // Both endpoints move by exactly the same vector:
        // wall length and angle remain unchanged.
        let cand={
          x1:orig.x1+targetDx,y1:orig.y1+targetDy,
          x2:orig.x2+targetDx,y2:orig.y2+targetDy
        };
        const magnetic=fpWallBodySnap2923(
          {x:cand.x1,y:cand.y1},{x:cand.x2,y:cand.y2},[o.id],o.thickness
        );
        if(magnetic){
          cand={x1:magnetic.start.x,y1:magnetic.start.y,x2:magnetic.end.x,y2:magnetic.end.y};
        }

        // Solid-body continuous collision: move only up to first contact.
        cand=fpClampWholeWallMove2924(orig,cand,o);

        // Whole-wall dragging is valid only if both endpoints remain in the
        // room and the wall segment does not cross another wall/object.
        const roomPoly=getRoomPolygon?.();
        const roomOK=!roomPoly || roomPoly.length<3 ||
          (fpPointInsideOrOnPolygon({x:cand.x1,y:cand.y1},roomPoly,0.6) &&
           fpPointInsideOrOnPolygon({x:cand.x2,y:cand.y2},roomPoly,0.6));

        const wallHit=magnetic ? null : fpClampWallEndToWalls(
          {x:cand.x1,y:cand.y1},{x:cand.x2,y:cand.y2},[o.id]
        ).hit;
        const objHit=fpClampWallBeforeObjects(
          {x:cand.x1,y:cand.y1},{x:cand.x2,y:cand.y2},[o.id],o.thickness
        ).hit;

        if(roomOK && !wallHit && !objHit){
          o.x1=cand.x1;o.y1=cand.y1;o.x2=cand.x2;o.y2=cand.y2;
        }else{
          // Solid clamp already calculated the furthest valid position.
          // Keep that contact position rather than jumping through or back.
          const safe=fpClampWholeWallMove2924(orig,cand,o);
          o.x1=safe.x1;o.y1=safe.y1;o.x2=safe.x2;o.y2=safe.y2;
        }

        // v2.9.43: only the selected wall moves.
        // Connected / neighbouring walls stay exactly at their saved positions.
      }
    }else if(o.type==='mirror'||o.type==='niche'){
      o._showSideDimensions=true;
      // v2.3.2: wall-mounted object follows cursor along the wall,
      // never detaches and is not rounded to the CAD grid.
      const placed=projectWallObjectAlongWall(o,{x:p.x,y:p.y});
      if(placed){
        o.x=placed.x;
        o.y=placed.y;
        o.rotation=placed.rotation;
        assignWallPlacementMeta(o,placed);
      }
    }else{
      o._showSideDimensions=true;
      const desiredX=snap(orig.x+dx);
      const desiredY=snap(orig.y+dy);
      const placed=constrainObjectPlacement(o,desiredX,desiredY);

      // Rotation can affect the real collision envelope, therefore use the
      // proposed rotation before solving the wall contact.
      const oldRotation=o.rotation;
      o.rotation=placed.rotation;
      const stopped=fpHardStopObjectAgainstWalls(
        o,placed.x,placed.y,Number(orig.x),Number(orig.y)
      );
      const solidStopped=fpClampObjectMotion2942(
        o,stopped.x,stopped.y,placed.rotation,Number(orig.x),Number(orig.y)
      );
      o.x=solidStopped.x;
      o.y=solidStopped.y;
      assignWallPlacementMeta(o,placed);
      o._wallContact=!!stopped.hit;
      o._objectContact=!!solidStopped.hit;
    }
    if(document.getElementById('fp-object-properties')?.classList.contains('open')){
      fpRefreshPropertyDistances(o);
    }
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if((fpTool==='wall') && fpStart){
    const smart=smartWallEndpoint(fpStart,p);
    const connectedWallId=fpPreview?.connectedWallId||connectedWallAtStart(fpStart)?.id||null;
    const interior=fpAllowOutwardFromCorner2928(fpStart,smart.point,connectedWallId);
    const preliminary=fpResolveWallEndpoint(fpStart,interior.point,{
      anchorWallId:connectedWallId,
      wallThickness:fpWallThickness
    });
    const hardStop=(!connectedWallId && !fpWallStartAnchor?.wallId)
      ? {point:{x:preliminary.point.x,y:preliminary.point.y},startPoint:null,hit:null}
      : fpClampWallBySolid2924(fpStart,preliminary.point,{
          anchorWallId:fpStartedFromOuterCorner2928()?null:connectedWallId,
          ignoreIds:connectedWallId?[connectedWallId]:[],
          thickness:fpWallThickness
        });
    fpPreview={
      id:'preview',
      type:fpTool,
      x1:hardStop.startPoint?.x ?? fpStart.x,
      y1:hardStop.startPoint?.y ?? fpStart.y,
      x2:hardStop.point.x,
      y2:hardStop.point.y,
      thickness:fpWallThickness,
      layer:'walls',
      snapTarget:hardStop.hit||smart.target,
      snappedToTarget:!!hardStop.hit||smart.snapped,
      connectedWallId,
      wallHardStop:hardStop.hit
    };
    drawFloorplan(fpPreview);
  }
}

function floorEnd(ev){

  if(fpDraggingFloorTileOrigin){
    fpDraggingFloorTileOrigin=false;
    fpFloorTileDragStart=null;
    fpDrawing=false;
    fpCanvas.style.cursor='';
    updateFloorTilePanel();
    save();
    drawFloorplan();
    if(fp3DMode)refresh3D();
    return;
  }

  const heldWallWasReady=!!fpWallMoveHold.ready;
  const heldWallId=fpWallMoveHold.wallId;

  if(fpWallMoveHold.timer){
    clearTimeout(fpWallMoveHold.timer);
    fpWallMoveHold.timer=null;
  }

  if(!fpDrawing){
    fpWallMoveHold={timer:null,ready:false,wallId:null,start:null,moved:false,connected:[]};
    return;
  }
  ev.preventDefault();

  if(fpTool==='pan'){
    fpDrawing=false;fpPanStart=null;return;
  }

  if(fpTool==='select'){
    fpDrawing=false;
    fpDragOffset=null;
    fpEndpointDrag=null;
    endObjectRotation();

    if(heldWallWasReady && heldWallId){
      try{
        refreshWallLetters();
        saveCurrentFloorplan?.({reason:'wall-drag'});
      }catch(_){
        try{save()}catch(__){}
      }
    }

    fpWallMoveHold={
      timer:null,
      ready:false,
      wallId:null,
      start:null,
      moved:false,
      connected:[]
    };

    fpCanvas.style.cursor='';
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if((fpTool==='wall') && fpStart){
    const p=fpPoint(ev);
    const smart=smartWallEndpoint(fpStart,p);
    const connectedStartId=fpWallStartAnchor?.wallId||connectedWallAtStart(fpStart)?.id||null;
    const interior=fpAllowOutwardFromCorner2928(fpStart,smart.point,connectedStartId);
    const preliminary=fpResolveWallEndpoint(fpStart,interior.point,{
      anchorWallId:connectedStartId,
      wallThickness:fpWallThickness
    });
    const hardStop=(!connectedStartId && !fpWallStartAnchor?.wallId)
      ? {point:{x:preliminary.point.x,y:preliminary.point.y},startPoint:null,hit:null}
      : fpClampWallBySolid2924(fpStart,preliminary.point,{
          anchorWallId:fpStartedFromOuterCorner2928()?null:connectedStartId,
          ignoreIds:connectedStartId?[connectedStartId]:[],
          thickness:fpWallThickness
        });
    let ep=hardStop.point;
    // v2.9.43: endpoint intentionally does not magnetize to existing corners.

    let finalStart=hardStop.startPoint
      ? {x:Number(hardStop.startPoint.x),y:Number(hardStop.startPoint.y)}
      : {x:Number(fpStart.x),y:Number(fpStart.y)};
    if(fpWallStartAnchor && !hardStop.startPoint){
      if(fpWallStartAnchor.wallId){
        const anchorWall=(fpObjects||[]).find(w=>w.type==='wall'&&w.id===fpWallStartAnchor.wallId);
        if(anchorWall){
          finalStart=fpWallStartAnchor.end==='start'
            ? {x:Number(anchorWall.x1),y:Number(anchorWall.y1)}
            : {x:Number(anchorWall.x2),y:Number(anchorWall.y2)};
        }else{
          finalStart={x:Number(fpWallStartAnchor.x),y:Number(fpWallStartAnchor.y)};
        }
      }else{
        finalStart={x:Number(fpWallStartAnchor.x),y:Number(fpWallStartAnchor.y)};
      }
    }

    const obj={
      id:uidObj(),
      type:fpTool,
      x1:finalStart.x,
      y1:finalStart.y,
      x2:ep.x,
      y2:ep.y,
      thickness:fpWallThickness,
      layer:'walls'
    };

    if(fpWallStartAnchor?.wallId){
      obj.connectedStart={wallId:fpWallStartAnchor.wallId,end:fpWallStartAnchor.end};
    }
    if(hardStop.hit?.wallId){
      obj.connectedEnd={wallId:hardStop.hit.wallId,end:'surface',distanceCm:0};
    }
    if(hardStop.hit?.kind==='object'){
      obj.stoppedByObjectId=hardStop.hit.objectId;
    }
    const length=dist({x:obj.x1,y:obj.y1},{x:obj.x2,y:obj.y2});
    if(length>=8){
      fpObjects.push(obj);
      refreshWallLetters();

      // Next wall starts automatically from this exact end point.
      fpLastWallEnd={x:obj.x2,y:obj.y2};
    }

    fpDrawing=false;
    fpStart=null;
    fpPreview=null;
    fpWallStartAnchor=null;
    drawFloorplan();
    updateSelectedInfo();
  }
}
function deleteSelected(){
  if(!fpSelectedId)return;
  pushHistory();fpObjects=fpObjects.filter(o=>o.id!==fpSelectedId);fpSelectedId=null;drawFloorplan();updateSelectedInfo();
}


function getRoomPolygon(){
  const walls=(fpObjects||[]).filter(o=>o.type==='wall');
  if(walls.length<3)return null;

  const tolerance=30;
  const nodes=[];

  function getNode(x,y){
    let best=null,bestD=Infinity;
    for(const n of nodes){
      const d=Math.hypot(n.x-x,n.y-y);
      if(d<tolerance && d<bestD){best=n;bestD=d}
    }
    if(best)return best;
    const n={x:Number(x),y:Number(y),neighbors:[]};
    nodes.push(n);
    return n;
  }

  walls.forEach(w=>{
    const a=getNode(w.x1,w.y1),b=getNode(w.x2,w.y2);
    if(!a.neighbors.includes(b))a.neighbors.push(b);
    if(!b.neighbors.includes(a))b.neighbors.push(a);
  });

  if(nodes.length<3 || nodes.some(n=>n.neighbors.length!==2))return null;

  const first=nodes[0],poly=[];
  let current=first,previous=null;
  const seen=new Set();

  for(let guard=0;guard<nodes.length+2;guard++){
    poly.push({x:current.x,y:current.y});
    seen.add(current);
    const next=current.neighbors.find(n=>n!==previous);
    if(!next)return null;
    previous=current;
    current=next;
    if(current===first)break;
  }

  if(current!==first || seen.size!==nodes.length)return null;
  return poly;
}

function pointInPolygon(p,poly){
  if(!poly||poly.length<3)return true;
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    const intersects=((a.y>p.y)!==(b.y>p.y)) &&
      (p.x < (b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-9)+a.x);
    if(intersects)inside=!inside;
  }
  return inside;
}

function polygonCentroid(poly){
  if(!poly||!poly.length)return {x:0,y:0};
  return {
    x:poly.reduce((s,p)=>s+p.x,0)/poly.length,
    y:poly.reduce((s,p)=>s+p.y,0)/poly.length
  };
}

function nearestPointOnSegment(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y;
  const l2=dx*dx+dy*dy || 1;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
  return {x:a.x+t*dx,y:a.y+t*dy,t};
}

function nearestWallForObject(p){
  let best=null,bestD=Infinity;

  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall')continue;

    // v2.9.43: objects reference the true room-side INNER wall face,
    // never the wall axis / outer construction line.
    const f=fpInnerWallFace2927(w);
    const a={x:Number(f.a.x),y:Number(f.a.y)};
    const b={x:Number(f.b.x),y:Number(f.b.y)};
    const q=nearestPointOnSegment(p,a,b);
    const d=Math.hypot(Number(p.x)-q.x,Number(p.y)-q.y);

    if(d<bestD){
      bestD=d;
      best={
        wall:w,
        point:q,
        distance:d,
        a,b,
        innerFace:true
      };
    }
  }
  return best;
}

function objectFootprintCorners(o,x=o.x,y=o.y,rotation=o.rotation||0){
  const w=Math.max(1,Number(o.widthCm||60)*(o.scale||1));
  const d=Math.max(1,Number(o.depthCm||40)*(o.scale||1));
  const hw=w/2,hd=d/2;
  const rad=Number(rotation||0)*Math.PI/180;
  const c=Math.cos(rad),s=Math.sin(rad);
  const local=[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
  return local.map(([lx,ly])=>({
    x:x+lx*c-ly*s,
    y:y+lx*s+ly*c
  }));
}

function objectFitsRoom(o,x,y,rotation){
  if(o.type==='door'||o.type==='window')return true;
  const poly=getRoomPolygon();
  if(!poly)return true;

  // Touching the wall boundary is explicitly VALID (0 cm).
  return objectFootprintCorners(o,x,y,rotation).every(p=>{
    if(pointInPolygon(p,poly))return true;
    for(let i=0;i<poly.length;i++){
      const q=nearestPointOnSegment(p,poly[i],poly[(i+1)%poly.length]);
      if(Math.hypot(p.x-q.x,p.y-q.y)<=0.25)return true;
    }
    return false;
  });
}

function snapObjectToWall(o,x,y){
  if(!fpObjectWallSnap || o.type==='text'){
    return {x,y,rotation:o.rotation||0,snapped:false};
  }

  const near=nearestWallForObject({x,y});
  if(!near)return {x,y,rotation:o.rotation||0,snapped:false};

  const w=near.wall;
  const dx=Number(w.x2)-Number(w.x1);
  const dy=Number(w.y2)-Number(w.y1);
  const wallLen=Math.hypot(dx,dy)||1;
  const ux=dx/wallLen,uy=dy/wallLen;

  // Left normal of wall direction.
  const baseNx=-uy,baseNy=ux;
  let nx=baseNx,ny=baseNy;

  const wallAngle=Math.atan2(dy,dx)*180/Math.PI;
  const poly=getRoomPolygon();
  const roomC=polygonCentroid(poly);
  const mid={
    x:(Number(w.x1)+Number(w.x2))/2,
    y:(Number(w.y1)+Number(w.y2))/2
  };

  // nx/ny = normal pointing INTO the room.
  // Closed room: use room centroid. Open/incomplete room: use the side from
  // which the user is dragging the object, or the object's saved side.
  if(poly && poly.length>=3){
    const toCenter={x:roomC.x-mid.x,y:roomC.y-mid.y};
    if(nx*toCenter.x+ny*toCenter.y<0){nx=-nx;ny=-ny}
  }else{
    const savedSign=Number(o.wallInteriorSign);
    if(savedSign===1 || savedSign===-1){
      nx=baseNx*savedSign;ny=baseNy*savedSign;
    }else{
      const q=near.point;
      const pointerSide=(Number(x)-q.x)*baseNx+(Number(y)-q.y)*baseNy;
      if(pointerSide<0){nx=-baseNx;ny=-baseNy}
    }
  }

  const interiorSign=(nx*baseNx+ny*baseNy)>=0?1:-1;

  // Tür/Fenster: anchor to selected wall FACE.
  if(o.type==='door'||o.type==='window'){
    ensureOpeningDefaults(o);

    const q=near.point;
    const wallThickness=Math.max(1,Number(w.thickness||15));
    const face=o.wallFace||'inside';

    // Stored wall line is the room-side INNER FACE.
    // Outside face lies one full wall thickness opposite the inward normal.
    const faceOffset=face==='outside' ? -wallThickness : 0;

    return {
      x:Math.round((q.x+nx*faceOffset)*10)/10,
      y:Math.round((q.y+ny*faceOffset)*10)/10,
      rotation:wallAngle,
      snapped:true,
      wallId:w.id,
      wallInteriorSign:interiorSign
    };
  }

  const isWallMounted=(o.type==='mirror'||o.type==='niche');
  const snapDistance=isWallMounted?120:Math.max(55,Number(o.depthCm||40)*(o.scale||1)*.75);
  if(near.distance>snapDistance){
    return {x,y,rotation:o.rotation||0,snapped:false};
  }

  const depth=Math.max(1,Number(o.depthCm||40)*(o.scale||1));

  // NISCHE:
  // The stored wall line is the room-side inner wall face.
  // The niche OPENING lies exactly on that line; 100% of its depth extends
  // into the wall, opposite the room-facing normal.
  if(o.type==='niche'){
    const q=near.point;
    const sx=q.x-nx*(depth/2);
    const sy=q.y-ny*(depth/2);
    return {
      x:Math.round(sx*100)/100,
      y:Math.round(sy*100)/100,
      rotation:wallAngle,
      snapped:true,
      wallId:w.id,
      wallInteriorSign:interiorSign,
      nicheEmbedded:true,
      nicheOpeningX:Math.round(q.x*100)/100,
      nicheOpeningY:Math.round(q.y*100)/100
    };
  }

  // v2.9.43: near.point IS the true room-side inner wall face.
  // Furniture / sanitary objects are centered exactly depth/2 from it,
  // therefore their back edge touches the wall at exactly 0 cm.
  const offset=o.type==='mirror'?0:depth/2;
  const sx=near.point.x+nx*offset;
  const sy=near.point.y+ny*offset;
  let rotation=wallAngle;

  if(isWallMounted || objectFitsRoom(o,sx,sy,rotation)){
    return {
      x:Math.round(sx*100)/100,
      y:Math.round(sy*100)/100,
      rotation,
      snapped:true,
      wallId:w.id,
      wallInteriorSign:interiorSign
    };
  }

  rotation=wallAngle+90;
  if(objectFitsRoom(o,sx,sy,rotation)){
    return {
      x:Math.round(sx*100)/100,
      y:Math.round(sy*100)/100,
      rotation,
      snapped:true,
      wallId:w.id,
      wallInteriorSign:interiorSign
    };
  }

  return {x,y,rotation:o.rotation||0,snapped:false};
}


/* v2.9.43: Duschglas is an independent solid object.
   It may touch walls and other objects at exactly 0 cm, but never cross them. */
function fpPolygonAxes2942(poly){
  const axes=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length];
    const dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy)||1;
    axes.push({x:-dy/L,y:dx/L});
  }
  return axes;
}
function fpProject2942(poly,axis){
  let min=Infinity,max=-Infinity;
  for(const p of poly){const v=p.x*axis.x+p.y*axis.y;min=Math.min(min,v);max=Math.max(max,v)}
  return {min,max};
}
function fpFootprintsOverlap2942(a,b,eps=.05){
  const axes=[...fpPolygonAxes2942(a),...fpPolygonAxes2942(b)];
  for(const ax of axes){
    const A=fpProject2942(a,ax),B=fpProject2942(b,ax);
    // equality/contact is allowed: only positive penetration counts.
    if(A.max<=B.min+eps || B.max<=A.min+eps)return false;
  }
  return true;
}
function fpObjectHitsOther2942(o,x,y,rotation){
  if(!o || o.type==='door'||o.type==='window'||o.type==='wall'||o.type==='text')return false;
  const own=objectFootprintCorners(o,x,y,rotation);
  for(const other of (fpObjects||[])){
    if(!other||other===o||other.id===o.id)continue;
    if(other.type==='wall'||other.type==='text'||other.type==='door'||other.type==='window')continue;
    const op=objectFootprintCorners(other,Number(other.x)||0,Number(other.y)||0,Number(other.rotation)||0);
    if(fpFootprintsOverlap2942(own,op,.05))return true;
  }
  return false;
}
function fpPlacementValid2942(o,x,y,rotation){
  return objectFitsRoom(o,x,y,rotation) && !fpObjectHitsOther2942(o,x,y,rotation);
}
function fpClampObjectMotion2942(o,targetX,targetY,targetRotation,startX,startY){
  if(fpPlacementValid2942(o,targetX,targetY,targetRotation)){
    return {x:targetX,y:targetY,rotation:targetRotation,hit:false};
  }
  const sx=Number(startX),sy=Number(startY);
  if(!Number.isFinite(sx)||!Number.isFinite(sy) || !fpPlacementValid2942(o,sx,sy,Number(o.rotation)||0)){
    return {x:targetX,y:targetY,rotation:targetRotation,hit:true};
  }
  let lo=0,hi=1;
  for(let i=0;i<24;i++){
    const t=(lo+hi)/2;
    const x=sx+(targetX-sx)*t,y=sy+(targetY-sy)*t;
    if(fpPlacementValid2942(o,x,y,targetRotation))lo=t;else hi=t;
  }
  return {
    x:Math.round((sx+(targetX-sx)*lo)*100)/100,
    y:Math.round((sy+(targetY-sy)*lo)*100)/100,
    rotation:targetRotation,
    hit:true
  };
}

function constrainObjectPlacement(o,x,y){
  if(o.type==='wall'||o.type==='text')return {x,y,rotation:o.rotation||0,valid:true};

  const snapped=snapObjectToWall(o,x,y);
  const candidate={
    x:snapped.x,
    y:snapped.y,
    rotation:snapped.rotation,
    wallId:snapped.wallId,
    wallInteriorSign:snapped.wallInteriorSign
  };

  if(objectFitsRoom(o,candidate.x,candidate.y,candidate.rotation)){
    return {...candidate,valid:true,snapped:snapped.snapped};
  }

  // Keep current/last valid position instead of allowing outside.
  const currentX=Number(o.x),currentY=Number(o.y),currentRot=Number(o.rotation||0);
  if(objectFitsRoom(o,currentX,currentY,currentRot)){
    return {x:currentX,y:currentY,rotation:currentRot,valid:false,snapped:false};
  }

  // For old invalid data, move center toward room centroid as safe fallback.
  const poly=getRoomPolygon();
  if(poly){
    const c=polygonCentroid(poly);
    if(objectFitsRoom(o,c.x,c.y,currentRot)){
      return {x:c.x,y:c.y,rotation:currentRot,valid:false,snapped:false};
    }
  }

  return {x,y,rotation:o.rotation||0,valid:false,snapped:false};
}


function selectedObject(){return fpObjects.find(x=>x.id===fpSelectedId)||null}

function objectPositionCm(o){
  if(!o)return {x:null,y:null};
  if(o.type==='wall'){
    return {
      x:Math.round((Number(o.x1)+Number(o.x2))/2),
      y:Math.round((Number(o.y1)+Number(o.y2))/2)
    };
  }
  return {
    x:Math.round(Number(o.x||0)),
    y:Math.round(Number(o.y||0))
  };
}

function setSelectedPosition(){
  const o=selectedObject();
  if(!o)return;

  const xInput=$('fpObjectX'),yInput=$('fpObjectY');
  const x=Number(xInput?.value),y=Number(yInput?.value);
  if(!Number.isFinite(x)||!Number.isFinite(y))return;

  pushHistory();

  if(o.type==='wall'){
    const pos=objectPositionCm(o);
    const dx=x-pos.x,dy=y-pos.y;
    o.x1+=dx;o.x2+=dx;o.y1+=dy;o.y2+=dy;
  }else{
    const placed=constrainObjectPlacement(o,x,y);
    o.x=placed.x;
    o.y=placed.y;
    o.rotation=placed.rotation;
    assignWallPlacementMeta(o,placed);
    o._showSideDimensions=true;
  }

  drawFloorplan();
  updateSelectedInfo();
}

function setSelectedRotation(value,withHistory=false){
  const o=selectedObject();if(!o||o.type==='wall')return;
  if(withHistory)pushHistory();
  let v=Number(value);if(!Number.isFinite(v))v=0;
  v=((v%360)+360)%360;
  const oldRotation=o.rotation||0;
  o.rotation=v;
  if(!objectFitsRoom(o,o.x,o.y,o.rotation)){
    o.rotation=oldRotation;
    v=oldRotation;
  }
  const slider=$('fpRotation'),num=$('fpRotationNumber');
  if(slider)slider.value=String(Math.round(v));
  if(num)num.value=String(Math.round(v));
  drawFloorplan();updateSelectedInfo();
}
function setSelectedScale(value,withHistory=false){
  const o=selectedObject();if(!o||o.type==='wall')return;
  if(withHistory)pushHistory();
  let v=Number(value);
  if(!Number.isFinite(v))v=100;
  v=Math.max(25,Math.min(300,v));
  const oldScale=o.scale||1;
  o.scale=v/100;
  if(!fpPlacementValid2942(o,o.x,o.y,o.rotation||0)){
    o.scale=oldScale;
    v=oldScale*100;
  }
  const slider=$('fpScale'),num=$('fpScaleNumber');
  if(slider)slider.value=String(Math.round(v));
  if(num)num.value=String(Math.round(v));
  drawFloorplan();
  updateSelectedInfo();
}

function setSelectedDimensions(){
  const o=selectedObject();
  if(!o||o.type==='wall'||o.type==='text')return;

  const w=Number($('fpObjectWidth').value);
  const d=Number($('fpObjectDepth').value);
  if(!Number.isFinite(w)||!Number.isFinite(d)||w<=0||d<=0)return;

  const oldW=Number(o.widthCm||w);
  const oldD=Number(o.depthCm||d);

  pushHistory();
  o.widthCm=w;
  o.depthCm=d;

  // Real dimensions are authoritative; percentage scale remains an optional
  // additional visual scale but normally stays at 100%.
  if(!objectFitsRoom(o,o.x,o.y,o.rotation||0)){
    o.widthCm=oldW;
    o.depthCm=oldD;
    const wi=$('fpObjectWidth'),di=$('fpObjectDepth');
    if(wi)wi.value=String(oldW);
    if(di)di.value=String(oldD);
    return;
  }

  if(o.wallId && o.type!=='door' && o.type!=='window'){
    const near=nearestWallForObject({x:o.x,y:o.y});
    if(near){
      const placed=snapObjectToWall(o,near.point.x,near.point.y);
      o.x=placed.x;o.y=placed.y;o.rotation=placed.rotation;
      assignWallPlacementMeta(o,placed);
    }
  }

  save();
  drawFloorplan();
  updateSelectedInfo();
  if(fp3DMode)refresh3D();
}




function fpEnsureWallObjectDefaults(o){
  if(!o || (o.type!=='mirror' && o.type!=='niche'))return o;

  const mirror=o.type==='mirror';
  if(!Number.isFinite(Number(o.widthCm)) || Number(o.widthCm)<=0) o.widthCm=mirror?80:60;
  if(!Number.isFinite(Number(o.heightCm)) || Number(o.heightCm)<=0) o.heightCm=mirror?80:40;
  if(!Number.isFinite(Number(o.depthCm)) || Number(o.depthCm)<=0) o.depthCm=mirror?5:12;
  if(!Number.isFinite(Number(o.mountHeightCm)) || Number(o.mountHeightCm)<0) o.mountHeightCm=mirror?100:80;

  // Keep wall-mounted objects deterministic after migration from older versions.
  if(o.wallId==null)o.wallId=null;
  if(o.wallT==null && Number.isFinite(Number(o.wallPosition)))o.wallT=Number(o.wallPosition);
  if(o.type==='niche' && o.nicheEmbedded==null)o.nicheEmbedded=true;
  return o;
}

function refreshWallObjectPanel(){
  const o=selectedObject();
  const panel=$('fpWallObjectPanel');
  const title=$('fpWallObjectTitle');
  const width=$('fpWallObjectWidth');
  const height=$('fpWallObjectHeight');
  const depth=$('fpWallObjectDepth');
  const bottom=$('fpWallObjectBottom');
  const depthRow=$('fpWallObjectDepthRow');

  const active=!!o && (o.type==='mirror'||o.type==='niche');
  if(panel)panel.classList.toggle('hidden',!active);
  if(!active)return;

  fpEnsureWallObjectDefaults(o);

  if(title)title.textContent=o.type==='mirror'?'SPIEGEL':'NISCHE';
  if(width)width.value=String(Math.round(Number(o.widthCm)||80));
  if(height)height.value=String(Math.round(Number(o.heightCm)||80));
  if(depth)depth.value=String(Math.round(Number(o.depthCm)||(o.type==='mirror'?5:12)));
  if(bottom)bottom.value=String(Math.round(Number(o.mountHeightCm)||0));
  if(depthRow)depthRow.classList.toggle('hidden',o.type==='mirror');
}

function applyWallObjectPanel(){
  const o=selectedObject();
  if(!o || (o.type!=='mirror'&&o.type!=='niche'))return;

  const width=Math.max(10,Math.min(500,Number($('fpWallObjectWidth')?.value)||Number(o.widthCm)||80));
  const height=Math.max(10,Math.min(400,Number($('fpWallObjectHeight')?.value)||Number(o.heightCm)||80));
  const depth=Math.max(1,Math.min(100,Number($('fpWallObjectDepth')?.value)||Number(o.depthCm)||(o.type==='mirror'?5:12)));
  const bottom=Math.max(0,Math.min(300,Number($('fpWallObjectBottom')?.value)||0));

  pushHistory();
  o.widthCm=width;
  o.heightCm=height;
  if(o.type==='niche')o.depthCm=depth;
  fpSetUniversalFloorHeight(o,bottom);

  // Keep selected wall object exactly attached after size edits.
  const near=nearestWallForObject({x:o.x,y:o.y});
  if(near){
    const placed=snapObjectToWall(o,near.point.x,near.point.y);
    o.x=placed.x;
    o.y=placed.y;
    o.rotation=placed.rotation;
    assignWallPlacementMeta(o,placed);
  }

  save();
  drawFloorplan();
  updateSelectedInfo();
  if(fp3DMode)refresh3D();
}

function projectWallObjectAlongWall(o,pointer){
  if(!o || (o.type!=='mirror'&&o.type!=='niche'))return null;

  let wall=null;

  if(o.wallId){
    wall=(fpObjects||[]).find(w=>w.type==='wall'&&w.id===o.wallId)||null;
  }

  const pointerNear=nearestWallForObject(pointer);
  // Dragging the niche to a different wall must be possible.
  if(pointerNear?.wall && (!wall || pointerNear.distance<45)){
    wall=pointerNear.wall;
  }

  if(!wall)wall=pointerNear?.wall||null;

  if(!wall)return null;

  const a={x:Number(wall.x1),y:Number(wall.y1)};
  const b={x:Number(wall.x2),y:Number(wall.y2)};
  const q=nearestPointOnSegment(pointer,a,b);

  const placed=snapObjectToWall(o,q.x,q.y);

  // Prevent half of wall-mounted object from crossing the wall endpoint.
  const len=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const half=Math.max(0,Number(o.widthCm||60)*(o.scale||1)/2);
  const minT=Math.min(.49,half/len);
  const maxT=Math.max(.51,1-minT);
  const clampedT=Math.max(minT,Math.min(maxT,q.t));

  const cx=a.x+(b.x-a.x)*clampedT;
  const cy=a.y+(b.y-a.y)*clampedT;
  const final=snapObjectToWall(o,cx,cy);

  return {...final,wallId:wall.id};
}

function fpEnsureMirrorInspector(o){
  let box=document.getElementById('fpMirrorProperties');
  const host=document.getElementById('fpSelectionProperties') ||
             document.getElementById('fpProperties') ||
             document.querySelector('.fp-properties') ||
             document.querySelector('.cad-inspector');
  if(!o || o.type!=='mirror'){
    if(box)box.remove();
    return;
  }
  if(!host)return;
  if(!box){
    box=document.createElement('div');
    box.id='fpMirrorProperties';
    box.className='cad-inspector-section fp-mirror-properties';
    box.innerHTML=`
      <h4>SPIEGEL</h4>
      <label>Breite (cm)<input id="fpMirrorWidth" type="number" min="10" step="1"></label>
      <label>Höhe (cm)<input id="fpMirrorHeight" type="number" min="10" step="1"></label>
      <label>Unterkante ab Boden (cm)<input id="fpMirrorBottom" type="number" min="0" step="1"></label>`;
    host.appendChild(box);
  }
  const bind=(id,key,min)=>{
    const el=document.getElementById(id); if(!el)return;
    el.value=String(Number(o[key]??0));
    el.onchange=()=>{
      pushHistory();
      o[key]=Math.max(min,Number(el.value)||min);
      save(); drawFloorplan(); updateSelectedInfo();
      if(fp3DMode)refresh3D();
    };
  };
  bind('fpMirrorWidth','widthCm',10);
  bind('fpMirrorHeight','heightCm',10);
  bind('fpMirrorBottom','floorHeightCm',0);
  const mb=document.getElementById('fpMirrorBottom');
  if(mb)mb.onchange=()=>{pushHistory();fpSetUniversalFloorHeight(o,mb.value);save();drawFloorplan();updateSelectedInfo();if(fp3DMode)refresh3D();};
}

function fpEnsureNicheInspector(o){
  let box=document.getElementById('fpNicheProperties');
  const host=document.getElementById('fpSelectionProperties') ||
             document.getElementById('fpProperties') ||
             document.querySelector('.fp-properties') ||
             document.querySelector('.cad-inspector');
  if(!o || o.type!=='niche'){
    if(box)box.remove();
    return;
  }
  if(!host)return;
  if(!box){
    box=document.createElement('div');
    box.id='fpNicheProperties';
    box.className='cad-inspector-section fp-niche-properties';
    box.innerHTML=`
      <h4>NISCHE</h4>
      <label>Breite (cm)<input id="fpNicheWidth" type="number" min="10" step="1"></label>
      <label>Höhe (cm)<input id="fpNicheHeight" type="number" min="10" step="1"></label>
      <label>Tiefe (cm)<input id="fpNicheDepth" type="number" min="3" step="1"></label>
      <label>Unterkante ab Boden (cm)<input id="fpNicheBottom" type="number" min="0" step="1"></label>`;
    host.appendChild(box);
  }
  const bind=(id,key,min)=>{
    const el=document.getElementById(id);if(!el)return;
    el.value=String(Number(o[key]??0));
    el.onchange=()=>{
      pushHistory();
      o[key]=Math.max(min,Number(el.value)||min);
      if(key==='depthCm')o.depthCm=Math.max(3,o.depthCm);
      save();drawFloorplan();updateSelectedInfo();refresh3D();
    };
  };
  bind('fpNicheWidth','widthCm',10);
  bind('fpNicheHeight','heightCm',10);
  bind('fpNicheDepth','depthCm',3);
  bind('fpNicheBottom','floorHeightCm',0);
  const nb=document.getElementById('fpNicheBottom');
  if(nb)nb.onchange=()=>{pushHistory();fpSetUniversalFloorHeight(o,nb.value);save();drawFloorplan();updateSelectedInfo();refresh3D();};
}

function updateSelectedInfo(){
  setTimeout(()=>{
    const current=selectedObject();
    fpEnsureNicheInspector(current);
    fpEnsureMirrorInspector(current);
    refreshWallObjectPanel();
  },0);
  const el=$('fpSelectedInfo');if(!el)return;
  const o=fpObjects.find(x=>x.id===fpSelectedId);
  if(!o){el.textContent='Keine Auswahl';refreshOpeningPanel();updateWallQuickPanel();return}
  let txt=`Ausgewählt: ${o.type}`;
  const pos=objectPositionCm(o);
  txt+=` · X ${pos.x} cm · Y ${pos.y} cm`;
  if(o.type==='wall'){
    txt+=` · Innenlänge ${Math.round(fpWallInnerInputLength2936(o)*10)/10} cm`;
    txt+=` · Start ${Math.round(o.x1)}/${Math.round(o.y1)} cm · Ende ${Math.round(o.x2)}/${Math.round(o.y2)} cm`;
  } else {
    txt+=` · Drehung ${Math.round(o.rotation||0)}° · Grösse ${Math.round((o.scale||1)*100)}%`;
    const slider=$('fpRotation'),num=$('fpRotationNumber');
    if(slider)slider.value=String(Math.round(o.rotation||0));
    if(num)num.value=String(Math.round(o.rotation||0));
    const scaleSlider=$('fpScale'),scaleNum=$('fpScaleNumber');
    const scalePct=Math.round((o.scale||1)*100);
    if(scaleSlider)scaleSlider.value=String(scalePct);
    if(scaleNum)scaleNum.value=String(scalePct);
    const w=$('fpObjectWidth'),d=$('fpObjectDepth');
    if(w)w.value=o.widthCm||'';
    if(d)d.value=o.depthCm||'';
    if(o.type!=='text' && o.widthCm && o.depthCm)txt+=` · ${o.widthCm} × ${o.depthCm} cm`;
    if(o.type!=='text')txt+=` · Bodenhöhe ${Math.round(fpLegacyFloorHeight(o)*10)/10} cm`;
  }
  const posInputs=objectPositionCm(o);
  const xInput=$('fpObjectX'),yInput=$('fpObjectY');
  if(xInput)xInput.value=String(posInputs.x);
  if(yInput)yInput.value=String(posInputs.y);
  const wf=$('fpWalkInShowerFields');
  if(wf)wf.classList.toggle('hidden',o.type!=='walkInShower');
  if(o.type==='walkInShower'){
    const sl=$('fpShowerSlope'),dt=$('fpShowerDrainType'),sd=$('fpShowerSlopeDirection');
    if(sl)sl.value=String(Number(o.slopePct||2)); if(dt)dt.value=o.drainType||'line'; if(sd)sd.value=o.slopeDirection||'back';
    const dl=$('fpShowerDrainLength'),dw=$('fpShowerDrainWidth'),doff=$('fpShowerDrainOffset'),rec=$('fpShowerRecess');
    if(dl)dl.value=String(Number(o.drainLengthCm||80)); if(dw)dw.value=String(Number(o.drainWidthCm||5)); if(doff)doff.value=String(Number(o.drainOffsetCm??10)); if(rec)rec.value=String(Number(o.recessCm||0));
  }
  el.textContent=txt;
  updateCadInspector();
  updateWallEndpointFields();
  updateWallQuickPanel();
  refreshOpeningPanel();
}
function applyZoom(){
  const reset=$('fpZoomReset');
  if(reset)reset.textContent=`${Math.round(fpZoom*100)}%`;
  drawCadRulers();
  drawFloorplan();
}

function getFloorplanBounds(objects){
  const xs=[],ys=[];
  (objects||[]).filter(isLayerVisible).forEach(o=>{
    if(o.type==='wall'){
      xs.push(Number(o.x1),Number(o.x2));
      ys.push(Number(o.y1),Number(o.y2));
    }else{
      const hw=Math.max(35,Number(o.widthCm||70)*(o.scale||1)/2);
      const hd=Math.max(35,Number(o.depthCm||70)*(o.scale||1)/2);
      xs.push(Number(o.x||0)-hw,Number(o.x||0)+hw);
      ys.push(Number(o.y||0)-hd,Number(o.y||0)+hd);
    }
  });
  if(!xs.length)return null;
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
}

function resize2DCanvas(){
  if(!fpCanvas)return;
  const wrap=fpCanvas.parentElement;
  if(!wrap)return;

  const rect=wrap.getBoundingClientRect();
  const cssW=Math.max(700,Math.round(rect.width||wrap.clientWidth||1200));
  const cssH=Math.max(420,Math.round(rect.height||wrap.clientHeight||650));
  // v2.0.1: CAD zoom uses visible CSS pixels 1:1.
  const dpr=1;

  const pxW=Math.round(cssW);
  const pxH=Math.round(cssH);

  if(fpCanvas.width!==pxW)fpCanvas.width=pxW;
  if(fpCanvas.height!==pxH)fpCanvas.height=pxH;
}

function centerFloorplan2D(){
  if(fp3DMode||!fpCanvas)return;
  resize2DCanvas();
  const b=getFloorplanBounds(fpObjects);
  if(!b)return;
  const cx=(b.minX+b.maxX)/2;
  const cy=(b.minY+b.maxY)/2;
  fpViewOffsetX=fpCanvas.width/2-cx*fpZoom;
  fpViewOffsetY=fpCanvas.height/2-cy*fpZoom;
  const reset=$('fpZoomReset');
  if(reset)reset.textContent=`${Math.round(fpZoom*100)}%`;
  drawFloorplan();
}

function fitFloorplan2D(){
  if(fp3DMode||!fpCanvas)return;

  resize2DCanvas();

  const xs=[],ys=[];
  (fpObjects||[]).forEach(o=>{
    if(o.type==='wall'){
      if([o.x1,o.y1,o.x2,o.y2].every(v=>Number.isFinite(Number(v)))){
        xs.push(Number(o.x1),Number(o.x2));
        ys.push(Number(o.y1),Number(o.y2));
      }
    }else if(Number.isFinite(Number(o.x))&&Number.isFinite(Number(o.y))){
      const scale=Number(o.scale||1);
      const hw=Math.max(35,Number(o.widthCm||80)*scale/2);
      const hd=Math.max(35,Number(o.depthCm||80)*scale/2);
      xs.push(Number(o.x)-hw,Number(o.x)+hw);
      ys.push(Number(o.y)-hd,Number(o.y)+hd);
    }
  });

  if(!xs.length){
    fpZoom=1;
    fpViewOffsetX=80;
    fpViewOffsetY=80;
    drawFloorplan();
    return;
  }

  let minX=Math.min(...xs),maxX=Math.max(...xs);
  let minY=Math.min(...ys),maxY=Math.max(...ys);

  // v2.0.1: Auto-Fit uses the real plan geometry only.
  // External measurement lanes may never shrink the room itself.
  const bw=Math.max(80,maxX-minX);
  const bh=Math.max(80,maxY-minY);

  // Use the ACTUAL visible CAD size, not only backing-store dimensions.
  const wrap=fpCanvas.parentElement;
  const rect=wrap?.getBoundingClientRect?.();
  const cssW=Math.max(320,rect?.width||wrap?.clientWidth||window.innerWidth);
  const cssH=Math.max(260,rect?.height||wrap?.clientHeight||window.innerHeight);

  const canvasRect=fpCanvas.getBoundingClientRect();
  const sx=fpCanvas.width/Math.max(1,canvasRect.width);
  const sy=fpCanvas.height/Math.max(1,canvasRect.height);

  const visibleW=cssW*sx;
  const visibleH=cssH*sy;

  const isTablet=window.matchMedia('(pointer:coarse)').matches &&
                 window.matchMedia('(orientation:landscape)').matches;

  // Tablet: fill most of the available workspace.
  const fillX=isTablet?0.94:0.90;
  const fillY=isTablet?0.91:0.88;

  const marginCm=28;
  const fitX=(visibleW*fillX)/(bw+marginCm*2);
  const fitY=(visibleH*fillY)/(bh+marginCm*2);

  // Allow significantly larger automatic zoom on tablets.
  const maxZoom=isTablet?6.0:5.0;
  fpZoom=Math.max(.08,Math.min(maxZoom,fitX,fitY));

  const cx=(minX+maxX)/2;
  const cy=(minY+maxY)/2;

  fpViewOffsetX=fpCanvas.width/2-cx*fpZoom;

  // v2.0.1: exact centering in the available CAD workspace.
  fpViewOffsetY=fpCanvas.height/2-cy*fpZoom;

  const z=$('fpZoomReset');
  if(z)z.textContent=`${Math.round(fpZoom*100)}%`;

  drawFloorplan();
}


let fpDimensionLayoutBoxes=[];
let fpDimensionLayoutMap=new Map();
let fpDimensionLayoutBounds=null;

function resetDimensionLayout(){
  fpDimensionLayoutBoxes=[];
  fpDimensionLayoutMap=new Map();
  fpDimensionLayoutBounds=null;
}

function boxesOverlap(a,b,pad=6){
  return !(
    a.maxX+pad < b.minX ||
    b.maxX+pad < a.minX ||
    a.maxY+pad < b.minY ||
    b.maxY+pad < a.minY
  );
}

function expandBounds(base,b){
  if(!b)return base;
  if(!base)return {...b};
  base.minX=Math.min(base.minX,b.minX);
  base.minY=Math.min(base.minY,b.minY);
  base.maxX=Math.max(base.maxX,b.maxX);
  base.maxY=Math.max(base.maxY,b.maxY);
  return base;
}

function prepareDimensionLayout(){
  resetDimensionLayout();
  if(!fpShowMeasures)return;

  const walls=(fpObjects||[]).filter(o=>o?.type==='wall' && isLayerVisible(o));
  if(!walls.length)return;

  const z=Math.max(.2,fpZoom||1);
  const placed=[];

  // Longer walls first. Short dimensions can then move to a free outer lane
  // instead of hiding long main dimensions.
  const ordered=[...walls].sort((a,b)=>{
    const la=Math.hypot(a.x2-a.x1,a.y2-a.y1);
    const lb=Math.hypot(b.x2-b.x1,b.y2-b.y1);
    return lb-la;
  });

  for(const wall of ordered){
    const mg=fpWallDimensionGeometry(wall);
    const sx=mg.sx,sy=mg.sy,ex=mg.ex,ey=mg.ey;
    const dx=ex-sx,dy=ey-sy;
    const len=mg.len;
    if(len<1)continue;

    const ux=dx/len,uy=dy/len;
    const out=wallOutsideNormal(wall);
    const horizontal=Math.abs(dx)>=Math.abs(dy);
    const text=`${formatDimensionMeters(len)} m`;

    const fontPx=Math.max(12,14/z);
    // Stable approximation; actual text is usually slightly narrower.
    const textWidth=Math.max(34/z,text.length*fontPx*.60);
    const textHeight=Math.max(18/z,fontPx*1.35);

    const baseOffset=42;
    const laneStep=Math.max(28,26/z);

    let chosen=null;

    for(let lane=0;lane<14;lane++){
      const offset=baseOffset+lane*laneStep;
      const ax=sx+out.nx*offset,ay=sy+out.ny*offset;
      const bx=ex+out.nx*offset,by=ey+out.ny*offset;
      const mx=(ax+bx)/2,my=(ay+by)/2;

      const halfW=(horizontal?textWidth:textHeight)/2+9/z;
      const halfH=(horizontal?textHeight:textWidth)/2+9/z;

      const labelBox={
        minX:mx-halfW,maxX:mx+halfW,
        minY:my-halfH,maxY:my+halfH
      };

      // Full geometry box includes extension lines and endpoints.
      const fullBox={
        minX:Math.min(sx,ex,ax,bx,labelBox.minX),
        maxX:Math.max(sx,ex,ax,bx,labelBox.maxX),
        minY:Math.min(sy,ey,ay,by,labelBox.minY),
        maxY:Math.max(sy,ey,ay,by,labelBox.maxY)
      };

      const collides=placed.some(p=>{
        // Labels must never overlap. Dimension lines are allowed to cross only
        // at their extension endpoints, not through another label.
        return boxesOverlap(labelBox,p.labelBox,10/z);
      });

      if(!collides){
        chosen={
          wallId:wall.id,
          sx,sy,ex,ey,dx,dy,len,ux,uy,out,
          ax,ay,bx,by,mx,my,text,
          textWidth,textHeight,labelBox,fullBox,
          lane,offset,horizontal
        };
        break;
      }
    }

    // Absolute fallback: still render every dimension.
    if(!chosen){
      const lane=14;
      const offset=baseOffset+lane*laneStep;
      const ax=sx+out.nx*offset,ay=sy+out.ny*offset;
      const bx=ex+out.nx*offset,by=ey+out.ny*offset;
      const mx=(ax+bx)/2,my=(ay+by)/2;
      const labelBox={minX:mx-40/z,maxX:mx+40/z,minY:my-14/z,maxY:my+14/z};
      const fullBox={
        minX:Math.min(sx,ex,ax,bx,labelBox.minX),
        maxX:Math.max(sx,ex,ax,bx,labelBox.maxX),
        minY:Math.min(sy,ey,ay,by,labelBox.minY),
        maxY:Math.max(sy,ey,ay,by,labelBox.maxY)
      };
      chosen={
        wallId:wall.id,sx,sy,ex,ey,dx,dy,len,ux,uy,out,
        ax,ay,bx,by,mx,my,text,
        textWidth:70/z,textHeight:18/z,labelBox,fullBox,
        lane,offset,horizontal
      };
    }

    fpDimensionLayoutMap.set(wall.id,chosen);
    fpDimensionLayoutBoxes.push(chosen.labelBox);
    placed.push(chosen);
    fpDimensionLayoutBounds=expandBounds(fpDimensionLayoutBounds,chosen.fullBox);
  }
}

function getDimensionedFloorplanBounds(){
  let b=getFloorplanBounds(fpObjects);
  if(fpShowMeasures){
    prepareDimensionLayout();
    b=expandBounds(b,fpDimensionLayoutBounds);
  }
  return b;
}


function fpDrawAllObjectDimensions(){
  // Central object-dimension pass. Wall dimensions are rendered separately
  // in drawAllProfessionalWallDimensions(), so never duplicate wall measures here.
  if(!fpShowMeasures)return;
  for(const o of (fpObjects||[])){
    if(!o || o.type==='wall')continue;
    try{
      if(typeof isLayerVisible==='function' && !isLayerVisible(o))continue;
      fpDrawObjectOwnDimensions(o);
    }catch(e){
      console.error('Objektmass konnte nicht gezeichnet werden',o,e);
    }
  }
}

function drawFloorplan(preview=null){
  if(!fpCanvas||!fpCtx)return;

  try{
    resize2DCanvas();

    fpCtx.setTransform(1,0,0,1,0,0);
    fpCtx.clearRect(0,0,fpCanvas.width,fpCanvas.height);
    fpCtx.fillStyle='#ffffff';
    fpCtx.fillRect(0,0,fpCanvas.width,fpCanvas.height);

    const zoom=Number.isFinite(fpZoom)&&fpZoom>0?fpZoom:1;
    const ox=Number.isFinite(fpViewOffsetX)?fpViewOffsetX:0;
    const oy=Number.isFinite(fpViewOffsetY)?fpViewOffsetY:0;

    fpCtx.save();
    fpCtx.setTransform(zoom,0,0,zoom,ox,oy);

    const left=(-ox)/zoom;
    const top=(-oy)/zoom;
    const right=(fpCanvas.width-ox)/zoom;
    const bottom=(fpCanvas.height-oy)/zoom;

    if(fpShowGrid!==false){
      const step=20;
      const sx=Math.floor(left/step)*step;
      const ex=Math.ceil(right/step)*step;
      const sy=Math.floor(top/step)*step;
      const ey=Math.ceil(bottom/step)*step;

      for(let x=sx;x<=ex;x+=step){
        fpCtx.beginPath();
        fpCtx.strokeStyle=(Math.round(x)%100===0)?'#cbd5e1':'#eef2f7';
        fpCtx.lineWidth=((Math.round(x)%100===0)?1.1:.55)/zoom;
        fpCtx.moveTo(x,top);fpCtx.lineTo(x,bottom);fpCtx.stroke();
      }
      for(let y=sy;y<=ey;y+=step){
        fpCtx.beginPath();
        fpCtx.strokeStyle=(Math.round(y)%100===0)?'#cbd5e1':'#eef2f7';
        fpCtx.lineWidth=((Math.round(y)%100===0)?1.1:.55)/zoom;
        fpCtx.moveTo(left,y);fpCtx.lineTo(right,y);fpCtx.stroke();
      }
    }

    // Build the complete external dimension-chain layout before drawing
    // any wall. Every wall then uses its reserved lane.
    prepareDimensionLayout();

    // IMPORTANT: draw each object independently, so one malformed object cannot hide the whole plan.
    try{drawFloorTiles2D()}catch(e){console.error('Bodenfliesen 2D',e)}
    try{window.ProjectBauAbdichtung?.drawOverlay?.()}catch(e){console.error('Abdichtung Overlay',e)}

    // v2.9.1: Walls are always rendered first. This prevents sanitary/furniture
    // objects or old object ordering from hiding the room construction.
    (fpObjects||[]).filter(o=>o?.type==='wall').forEach(o=>{
      try{
        fpNormalizeLegacyWall(o);
        if(typeof isLayerVisible==='function' && !isLayerVisible(o))return;
        drawFpObject(o,false);
      }catch(objectError){
        console.error('2D Wand konnte nicht gezeichnet werden',o,objectError);
      }
    });

    (fpObjects||[]).filter(o=>o?.type!=='wall').forEach(o=>{
      try{
        if(typeof isLayerVisible==='function' && !isLayerVisible(o))return;
        drawFpObject(o,false);
      }catch(objectError){
        console.error('2D Objekt konnte nicht gezeichnet werden',o,objectError);
      }
    });

    // Final wall-edge pass: keep every wall readable even when an object touches it.
    try{
      const z=Math.max(.2,Number(fpZoom)||1);
      fpCtx.save();
      (fpObjects||[]).filter(o=>o?.type==='wall' && isLayerVisible(o)).forEach(w=>{
        // Repeat the complete wall body on the final layer.
        // This intentionally prioritizes readable construction geometry.
        drawWallHard(w,'#111827',1);
      });
      fpCtx.restore();
    }catch(e){console.error('Wandkontur Endpass',e)}

    // v2.9.43 TRUE CORNER:
    // The stored endpoints are the exact inner construction corner.
    // Butt-ended wall bodies stop exactly there; this miter pass fills only the
    // missing outer wedge. Result: no overlap, no half-thickness protrusion.
    try{drawAllWallJoints()}catch(e){console.error('Wandecken Endpass',e)}
    try{fpDrawAllObjectDimensions()}catch(e){console.error('Objektmasse',e)}
    try{fpDrawOuterCornerMarkers2927()}catch(e){console.error('Köşe marker',e)}
    try{fpDrawInnerDimensionPoints2929()}catch(e){console.error('İç ölçü marker',e)}

    if(preview){
      try{
        const connected=preview.connectedWallId
          ? fpObjects.find(o=>o.id===preview.connectedWallId)
          : connectedWallAtStart({x:preview.x1,y:preview.y1});

        // Keep the wall being continued clearly visible while drawing.
        if(connected){
          drawConnectedWallPreview(connected);

          // Visible magnetic-corner feedback at the exact shared coordinate.
          const z=Math.max(.2,Number(fpZoom)||1);
          fpCtx.save();
          fpCtx.strokeStyle='#16a34a';
          fpCtx.fillStyle='rgba(22,163,74,.14)';
          fpCtx.lineWidth=3/z;
          fpCtx.beginPath();
          fpCtx.arc(Number(preview.x1),Number(preview.y1),13/z,0,Math.PI*2);
          fpCtx.fill();
          fpCtx.stroke();
          fpCtx.beginPath();
          fpCtx.moveTo(Number(preview.x1)-18/z,Number(preview.y1));
          fpCtx.lineTo(Number(preview.x1)+18/z,Number(preview.y1));
          fpCtx.moveTo(Number(preview.x1),Number(preview.y1)-18/z);
          fpCtx.lineTo(Number(preview.x1),Number(preview.y1)+18/z);
          fpCtx.stroke();
          fpCtx.fillStyle='#15803d';
          fpCtx.font=`700 ${11/z}px Arial`;
          fpCtx.textAlign='left';
          fpCtx.fillText('Ecke gefangen',Number(preview.x1)+20/z,Number(preview.y1)-18/z);
          fpCtx.restore();
        }

        fpCtx.save();
        fpCtx.globalAlpha=.88;
        drawFpObject(preview,true);
        fpCtx.restore();

        // Live L-joint at the shared endpoint.
        if(connected){
          drawWallJointAt(
            {x:preview.x1,y:preview.y1},
            [connected,preview],
            '#2563eb'
          );
        }

        // CAD live measurement remains fully readable.
        drawLiveWallDimension(preview);
      }catch(e){console.error(e)}
    }

    // Tile origin
    const tx=Number(fp3DOptions?.tileOriginX),ty=Number(fp3DOptions?.tileOriginY);
    if(Number.isFinite(tx)&&Number.isFinite(ty)){
      fpCtx.save();
      fpCtx.strokeStyle='#2563eb';
      fpCtx.lineWidth=2/zoom;
      fpCtx.beginPath();fpCtx.arc(tx,ty,8/zoom,0,Math.PI*2);fpCtx.stroke();
      fpCtx.beginPath();
      fpCtx.moveTo(tx-14/zoom,ty);fpCtx.lineTo(tx+14/zoom,ty);
      fpCtx.moveTo(tx,ty-14/zoom);fpCtx.lineTo(tx,ty+14/zoom);fpCtx.stroke();
      fpCtx.restore();
    }

    // Room label only if bounds exist; failure never blocks plan.
    try{
      const b=getFloorplanBounds(fpObjects);
      if(fpRecord&&b){
        const area=calculateFloorAreaM2(fpObjects);
        let cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
        const w=235/zoom,h=100/zoom;

        // Keep the room information card away from dimension labels.
        const cardBox=()=>({minX:cx-w/2,maxX:cx+w/2,minY:cy-h/2,maxY:cy+h/2});
        let cardTry=0;
        while(fpDimensionLayoutBoxes.some(db=>boxesOverlap(cardBox(),db,10/zoom)) && cardTry<10){
          cy+=28/zoom;
          cardTry++;
        }

        fpCtx.save();
        fpCtx.fillStyle='rgba(255,255,255,.95)';
        fpCtx.strokeStyle='#94a3b8';
        fpCtx.lineWidth=1/zoom;
        if(fpCtx.roundRect)fpCtx.roundRect(cx-w/2,cy-h/2,w,h,7/zoom);
        else fpCtx.rect(cx-w/2,cy-h/2,w,h);
        fpCtx.fill();fpCtx.stroke();

        fpCtx.textAlign='center';fpCtx.fillStyle='#0f172a';
        fpCtx.font=`bold ${20/zoom}px Arial`;
        fpCtx.fillText((fpRecord.name||'Grundriss').toUpperCase(),cx,cy-22/zoom);
        fpCtx.font=`bold ${22/zoom}px Arial`;
        fpCtx.fillText(area==null?'—':`${formatCHNumber(area,2)} m²`,cx,cy+10/zoom);
        fpCtx.font=`${12/zoom}px Arial`;
        fpCtx.fillText(fpRecord.roomHeightM?`Raumhöhe: ${formatCHNumber(fpRecord.roomHeightM,2)} m`:'',cx,cy+34/zoom);
        fpCtx.restore();
      }
    }catch(e){console.error('Rauminfo',e)}

    // TOP LAYER:
    // Nothing is allowed to cover wall dimensions after this point.
    try{
      drawAllProfessionalWallDimensions();
    }catch(e){
      console.error('Wandmasse Endpass',e);
    }

    fpCtx.restore();
    fpLastRenderError='';

  }catch(renderError){
    fpLastRenderError=String(renderError?.message||renderError);
    console.error('2D Renderfehler',renderError);

    // Absolute fallback: draw walls directly in screen coordinates.
    try{
      fpCtx.setTransform(1,0,0,1,0,0);
      fpCtx.clearRect(0,0,fpCanvas.width,fpCanvas.height);
      fpCtx.fillStyle='#fff';fpCtx.fillRect(0,0,fpCanvas.width,fpCanvas.height);

      const walls=(fpObjects||[]).filter(o=>o.type==='wall');
      if(walls.length){
        const xs=walls.flatMap(w=>[Number(w.x1),Number(w.x2)]);
        const ys=walls.flatMap(w=>[Number(w.y1),Number(w.y2)]);
        const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        const scale=Math.min((fpCanvas.width-160)/Math.max(1,maxX-minX),(fpCanvas.height-160)/Math.max(1,maxY-minY));
        const offX=fpCanvas.width/2-((minX+maxX)/2)*scale;
        const offY=fpCanvas.height/2-((minY+maxY)/2)*scale;

        fpCtx.setTransform(scale,0,0,scale,offX,offY);
        fpCtx.strokeStyle='#111827';
        walls.forEach(w=>{
          fpCtx.lineWidth=Math.max(6,Number(w.thickness||15)/2);
          fpCtx.beginPath();fpCtx.moveTo(w.x1,w.y1);fpCtx.lineTo(w.x2,w.y2);fpCtx.stroke();
        });
      }
    }catch(fallbackError){
      console.error('2D Fallbackfehler',fallbackError);
    }
  }

  // Auxiliary UI updates AFTER drawing and protected independently.
  if(!preview){
    try{updateFloorRoomInfo()}catch(e){console.error(e)}
    try{updateCadInspector()}catch(e){console.error(e)}
    try{drawCadRulers()}catch(e){console.error(e)}
    try{refresh3D()}catch(e){console.error(e)}
    try{window.ProjectBauAbdichtung?.planChanged?.()}catch(e){console.error(e)}
  }
}

function drawMeasureText(text,x,y,angle=0){
  if(!fpShowMeasures)return;
  const z=Math.max(.2,Number(fpZoom)||1);
  fpCtx.save();
  fpCtx.translate(x,y);
  fpCtx.rotate(angle);

  const fontPx=14/z;
  const pad=5/z;
  const boxH=22/z;
  fpCtx.font=`700 ${fontPx}px Arial`;
  fpCtx.textAlign='center';
  fpCtx.textBaseline='middle';

  const w=fpCtx.measureText(text).width+pad*2;
  fpCtx.fillStyle='rgba(255,255,255,.97)';
  fpCtx.strokeStyle='#cbd5e1';
  fpCtx.lineWidth=1/z;
  fpCtx.fillRect(-w/2,-boxH/2,w,boxH);
  fpCtx.strokeRect(-w/2,-boxH/2,w,boxH);
  fpCtx.fillStyle='#0f172a';
  fpCtx.fillText(text,0,0);
  fpCtx.restore();
}

function drawPositionText(o,x,y){
  // v1.9.4: X/Y-Koordinaten werden im professionellen Plan nicht mehr angezeigt.
  return;
}


function wallsAtPoint(point, excludeId=null, tolerance=3){
  const result=[];
  for(const w of fpObjects){
    if(w.type!=='wall' || w.id===excludeId)continue;
    const d1=Math.hypot(Number(w.x1)-point.x,Number(w.y1)-point.y);
    const d2=Math.hypot(Number(w.x2)-point.x,Number(w.y2)-point.y);
    if(d1<=tolerance || d2<=tolerance)result.push(w);
  }
  return result;
}

function connectedWallAtStart(start){
  const walls=wallsAtPoint(start,null,4);
  if(!walls.length)return null;
  // Prefer the most recently drawn wall; this is normally the chain predecessor.
  return walls[walls.length-1];
}

function wallVisualWidth(w){
  return Math.max(1,Number(w?.thickness||15));
}



function wallBodyPolygon(w){
  const x1=Number(w.x1),y1=Number(w.y1),x2=Number(w.x2),y2=Number(w.y2);
  const dx=x2-x1,dy=y2-y1;
  const len=Math.hypot(dx,dy)||1;
  const half=Math.max(1,Number(w?.thickness||15))/2;
  const nx=-dy/len,ny=dx/len;
  return [
    {x:x1+nx*half,y:y1+ny*half},
    {x:x2+nx*half,y:y2+ny*half},
    {x:x2-nx*half,y:y2-ny*half},
    {x:x1-nx*half,y:y1-ny*half}
  ];
}
function drawWallHard(w,color='#111827',alpha=1){
  if(!w)return;
  fpNormalizeLegacyWall(w);

  const x1=Number(w.x1),y1=Number(w.y1),x2=Number(w.x2),y2=Number(w.y2);
  if(![x1,y1,x2,y2].every(Number.isFinite))return;

  const dx=x2-x1,dy=y2-y1;
  const len=Math.hypot(dx,dy);
  if(!(len>.1))return;

  const thickness=Math.max(2,Number(w.thickness||fpWallThickness||15));

  // v2.9.43 TRUE GEOMETRY:
  // The stored wall segment IS the centre axis of the visible wall body.
  // No side-dependent offset is allowed here. Two walls sharing an endpoint
  // therefore always meet at exactly the same visible construction corner.
  fpCtx.save();
  fpCtx.globalAlpha=alpha;
  fpCtx.strokeStyle=color;
  fpCtx.lineWidth=thickness;
  fpCtx.lineCap='butt';
  fpCtx.lineJoin='miter';
  fpCtx.beginPath();
  fpCtx.moveTo(x1,y1);
  fpCtx.lineTo(x2,y2);
  fpCtx.stroke();
  fpCtx.restore();
}
function drawWallBody(w,color='#111827',alpha=1){
  const p=wallBodyPolygon(w);
  if(!p.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)))return;
  fpCtx.save();
  fpCtx.globalAlpha=alpha;
  fpCtx.fillStyle=color;
  fpCtx.beginPath();
  fpCtx.moveTo(p[0].x,p[0].y);
  for(let i=1;i<p.length;i++)fpCtx.lineTo(p[i].x,p[i].y);
  fpCtx.closePath();
  fpCtx.fill();
  fpCtx.restore();
}

function drawWallJointAt(point,walls,color='#111827'){
  if(!point || !walls || walls.length<2)return;
  const unique=[...new Map(walls.map(w=>[w.id||`${w.x1}_${w.y1}_${w.x2}_${w.y2}`,w])).values()];
  if(unique.length<2)return;

  // The wall strokes terminate with butt caps exactly at this common endpoint.
  // Fill one sharp square centred on the shared coordinate. For orthogonal
  // construction walls this creates a precise closed L-corner with no gap and
  // no half-thickness overrun from either wall.
  const t=Math.max(...unique.map(w=>Math.max(2,Number(w.thickness||fpWallThickness||15))));
  fpCtx.save();
  fpCtx.fillStyle=color;
  fpCtx.fillRect(Number(point.x)-t/2,Number(point.y)-t/2,t,t);
  fpCtx.restore();
}
function drawAllWallJoints(){
  const walls=fpObjects.filter(o=>o.type==='wall');
  const seen=[];

  const addPoint=(p,w)=>{
    let group=seen.find(g=>Math.hypot(g.x-p.x,g.y-p.y)<=0.001);
    if(!group){
      group={x:p.x,y:p.y,walls:[]};
      seen.push(group);
    }
    group.walls.push(w);
  };

  walls.forEach(w=>{
    addPoint({x:Number(w.x1),y:Number(w.y1)},w);
    addPoint({x:Number(w.x2),y:Number(w.y2)},w);
  });

  seen.forEach(g=>{
    if(g.walls.length>=2){
      drawWallJointAt({x:g.x,y:g.y},g.walls,'#111827');
    }
  });
}

function drawConnectedWallPreview(w){
  if(!w)return;
  drawWallHard(w,'#2563eb',.38);
}

function fpDefaultObjectDimensions(type){
  const dims={
    door:[90,15],window:[100,15],wc:[40,70],shower:[90,90],walkInShower:[100,100],
    bathtub:[180,80],sink:[60,50],drain:[15,15],
    kitchenSink:[60,60],stove:[60,60],fridge:[60,65],washingMachine:[60,65],
    table:[160,90],chair:[50,50],sofa:[220,90],bed:[200,100],cabinet:[120,60],plant:[45,45],mirror:[80,5],niche:[60,12]
  };
  return dims[type]||[60,40];
}

function fpObjectDimensionScale(o){
  const [dw,dd]=fpDefaultObjectDimensions(o?.type);
  return {
    x:Math.max(.05,Number(o?.widthCm||dw)/Math.max(1,dw)),
    y:Math.max(.05,Number(o?.depthCm||dd)/Math.max(1,dd))
  };
}


function formatDimensionMeters(cm){
  const m=Number(cm||0)/100;
  return m.toLocaleString('de-CH',{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }).replace('.',',');
}

function fpRoomCenterForDimensions(){
  const poly=getRoomPolygon?.();
  if(!poly||poly.length<3)return null;
  return {
    x:poly.reduce((s,p)=>s+Number(p.x||0),0)/poly.length,
    y:poly.reduce((s,p)=>s+Number(p.y||0),0)/poly.length
  };
}

function wallOutsideNormal(wall){
  const x1=Number(wall.x1),y1=Number(wall.y1),x2=Number(wall.x2),y2=Number(wall.y2);
  const dx=x2-x1,dy=y2-y1;
  const len=Math.hypot(dx,dy)||1;

  const left={nx:-dy/len,ny:dx/len};
  const right={nx:dy/len,ny:-dx/len};

  const mx=(x1+x2)/2,my=(y1+y2)/2;
  const poly=getRoomPolygon?.();

  if(poly && poly.length>=3){
    // Test far enough away from the inner edge to get a reliable
    // inside/outside answer even with a thick wall.
    const probe=Math.max(18,Number(wall.thickness||15)+8);
    const lp={x:mx+left.nx*probe,y:my+left.ny*probe};
    const rp={x:mx+right.nx*probe,y:my+right.ny*probe};

    const lInside=pointInPolygon(lp,poly);
    const rInside=pointInPolygon(rp,poly);

    if(lInside && !rInside)return right;
    if(rInside && !lInside)return left;
  }

  // Fallback for temporarily open plans.
  const center=fpRoomCenterForDimensions();
  if(center){
    const toCenterX=center.x-mx,toCenterY=center.y-my;
    return (left.nx*toCenterX+left.ny*toCenterY>0)?right:left;
  }

  return left;
}

function drawAllProfessionalWallDimensions(){
  if(!fpShowMeasures)return;

  const walls=(fpObjects||[]).filter(o=>o?.type==='wall' && isLayerVisible(o));

  // Rebuild once from the final wall geometry.
  prepareDimensionLayout();

  let rendered=0;
  for(const wall of walls){
    // Hard fallback: if a wall somehow has no reserved layout,
    // rebuild its basic measure directly rather than silently omitting it.
    if(!fpDimensionLayoutMap.has(wall.id)){
      const mg=fpWallDimensionGeometry(wall);
      const sx=mg.sx,sy=mg.sy,ex=mg.ex,ey=mg.ey;
      const dx=ex-sx,dy=ey-sy;
      const len=mg.len;
      if(len>=1){
        const out=wallOutsideNormal(wall);
        const ux=dx/len,uy=dy/len;
        const offset=48;
        const ax=sx+out.nx*offset,ay=sy+out.ny*offset;
        const bx=ex+out.nx*offset,by=ey+out.ny*offset;
        fpDimensionLayoutMap.set(wall.id,{
          wallId:wall.id,sx,sy,ex,ey,dx,dy,len,ux,uy,out,
          ax,ay,bx,by,mx:(ax+bx)/2,my:(ay+by)/2,
          text:`${formatDimensionMeters(len)} m`,
          textWidth:70,textHeight:20,
          labelBox:{minX:(ax+bx)/2-40,maxX:(ax+bx)/2+40,minY:(ay+by)/2-14,maxY:(ay+by)/2+14},
          fullBox:{minX:Math.min(sx,ex,ax,bx),maxX:Math.max(sx,ex,ax,bx),minY:Math.min(sy,ey,ay,by),maxY:Math.max(sy,ey,ay,by)},
          lane:99,offset,horizontal:Math.abs(dx)>=Math.abs(dy)
        });
      }
    }

    if(fpDimensionLayoutMap.has(wall.id)){
      drawProfessionalWallDimension(wall);          // dış ölçü
      drawInnerEffectiveWallDimension2935(wall);    // iç efektif ölçü
      rendered++;
    }
  }

  // Do not silently lose a dimension again.
  if(rendered!==walls.length){
    console.error(`Massfehler: ${walls.length} Wände, aber ${rendered} Masse gezeichnet.`);
  }
}

function drawProfessionalWallDimension(wall){
  if(!fpShowMeasures || !wall)return;

  let d=fpDimensionLayoutMap.get(wall.id);
  if(!d){
    prepareDimensionLayout();
    d=fpDimensionLayoutMap.get(wall.id);
  }
  if(!d)return;

  const z=Math.max(.2,fpZoom||1);
  const {sx,sy,ex,ey,ux,uy,ax,ay,bx,by,mx,my,dx,dy,text,textWidth,out}=d;

  fpCtx.save();
  fpCtx.strokeStyle='#475569';
  fpCtx.fillStyle='#0f172a';
  fpCtx.lineWidth=Math.max(.75,1/z);
  fpCtx.lineCap='butt';

  const gap=5/z;

  // Hilfslinien start exactly on the room-side inner edge.
  fpCtx.beginPath();
  fpCtx.moveTo(sx+out.nx*gap,sy+out.ny*gap);
  fpCtx.lineTo(ax,ay);
  fpCtx.moveTo(ex+out.nx*gap,ey+out.ny*gap);
  fpCtx.lineTo(bx,by);
  fpCtx.stroke();

  // Main dimension line.
  fpCtx.beginPath();
  fpCtx.moveTo(ax,ay);
  fpCtx.lineTo(bx,by);
  fpCtx.stroke();

  // Architectural diagonal endpoint ticks.
  const tick=7/z;
  const tx=(ux+out.nx)*tick*.6;
  const ty=(uy+out.ny)*tick*.6;
  fpCtx.beginPath();
  fpCtx.moveTo(ax-tx,ay-ty);fpCtx.lineTo(ax+tx,ay+ty);
  fpCtx.moveTo(bx-tx,by-ty);fpCtx.lineTo(bx+tx,by+ty);
  fpCtx.stroke();

  let angle=Math.atan2(dy,dx);
  if(angle>Math.PI/2 || angle<-Math.PI/2)angle+=Math.PI;

  fpCtx.translate(mx,my);
  fpCtx.rotate(angle);
  fpCtx.font=`600 ${Math.max(12,14/z)}px Arial`;
  fpCtx.textAlign='center';
  fpCtx.textBaseline='middle';

  const actualW=fpCtx.measureText(text).width;
  const pad=6/z;
  const boxH=20/z;

  fpCtx.fillStyle='rgba(255,255,255,.99)';
  fpCtx.fillRect(-actualW/2-pad,-boxH/2,actualW+pad*2,boxH);
  fpCtx.fillStyle='#0f172a';
  fpCtx.fillText(text,0,0);
  fpCtx.restore();
}
function drawInnerEffectiveWallDimension2935(wall){
  try{
    if(!fpShowMeasures || !wall)return;

    const x1=Number(wall.x1), y1=Number(wall.y1);
    const x2=Number(wall.x2), y2=Number(wall.y2);
    const dx=x2-x1, dy=y2-y1;
    const rawLen=Math.hypot(dx,dy);
    if(rawLen<1)return;

    const ux=dx/rawLen, uy=dy/rawLen;
    const nx=-uy, ny=ux;
    const thickness=Math.max(0,Number(wall.thickness||fpWallThickness||15));

    // 45°/miter connection rule:
    // Every joined end consumes exactly one wall thickness from the effective
    // room-side length. Free ends do not.
    const joinedStart=fpWallsSharingOuterCorner2927(wall,'start',.08).length>0;
    const joinedEnd=fpWallsSharingOuterCorner2927(wall,'end',.08).length>0;

    const startInset=joinedStart ? thickness : 0;
    const endInset=joinedEnd ? thickness : 0;

    let sx=x1+ux*startInset;
    let sy=y1+uy*startInset;
    let ex=x2-ux*endInset;
    let ey=y2-uy*endInset;

    const innerLen=fpWallInnerInputLength2936(wall);

    // Center the inner WANDMASSE inside the raw outer geometry.
    const inset2938=Math.max(0,(rawLen-innerLen)/2);
    sx=x1+ux*inset2938; sy=y1+uy*inset2938;
    ex=x2-ux*inset2938; ey=y2-uy*inset2938;
    if(innerLen<1)return;

    // Determine the room-facing side from the existing outside normal.
    let out;
    try{
      out=wallOutsideNormal(wall);
    }catch(e){
      out={nx:-uy,ny:ux};
    }
    const inn={nx:-Number(out.nx||0),ny:-Number(out.ny||0)};

    const z=Math.max(.2,fpZoom||1);
    const offset=Math.max(24,thickness+18);
    const ax=sx+inn.nx*offset, ay=sy+inn.ny*offset;
    const bx=ex+inn.nx*offset, by=ey+inn.ny*offset;
    const mx=(ax+bx)/2, my=(ay+by)/2;
    const text=`${formatDimensionMeters(innerLen)} m`;

    fpCtx.save();
    fpCtx.strokeStyle='#2563eb';
    fpCtx.fillStyle='#1d4ed8';
    fpCtx.lineWidth=Math.max(.8,1.15/z);
    fpCtx.lineCap='butt';

    const gap=2/z;
    fpCtx.beginPath();
    fpCtx.moveTo(sx+inn.nx*gap,sy+inn.ny*gap); fpCtx.lineTo(ax,ay);
    fpCtx.moveTo(ex+inn.nx*gap,ey+inn.ny*gap); fpCtx.lineTo(bx,by);
    fpCtx.stroke();

    fpCtx.beginPath();
    fpCtx.moveTo(ax,ay); fpCtx.lineTo(bx,by); fpCtx.stroke();

    const tick=6/z;
    const tx=(ux+inn.nx)*tick*.6, ty=(uy+inn.ny)*tick*.6;
    fpCtx.beginPath();
    fpCtx.moveTo(ax-tx,ay-ty); fpCtx.lineTo(ax+tx,ay+ty);
    fpCtx.moveTo(bx-tx,by-ty); fpCtx.lineTo(bx+tx,by+ty);
    fpCtx.stroke();

    let angle=Math.atan2(dy,dx);
    if(angle>Math.PI/2||angle<-Math.PI/2)angle+=Math.PI;
    fpCtx.translate(mx,my);
    fpCtx.rotate(angle);
    fpCtx.font=`700 ${Math.max(11,13/z)}px Arial`;
    fpCtx.textAlign='center';
    fpCtx.textBaseline='middle';

    const tw=fpCtx.measureText(text).width;
    const pad=5/z, bh=18/z;
    fpCtx.fillStyle='rgba(255,255,255,.96)';
    fpCtx.fillRect(-tw/2-pad,-bh/2,tw+pad*2,bh);
    fpCtx.fillStyle='#1d4ed8';
    fpCtx.fillText(text,0,0);
    fpCtx.restore();

  }catch(e){
    console.warn('effective inner dimension',e);
  }
}

function fpRaySegmentIntersection(origin,dir,w){
  const ax=Number(w.x1),ay=Number(w.y1),bx=Number(w.x2),by=Number(w.y2);
  const sx=bx-ax,sy=by-ay;
  const cross=(x1,y1,x2,y2)=>x1*y2-y1*x2;
  const den=cross(dir.x,dir.y,sx,sy);
  if(Math.abs(den)<1e-8)return null;

  const qx=ax-origin.x,qy=ay-origin.y;
  const t=cross(qx,qy,sx,sy)/den;
  const u=cross(qx,qy,dir.x,dir.y)/den;
  if(t<0 || u<-1e-6 || u>1+1e-6)return null;
  return {x:origin.x+dir.x*t,y:origin.y+dir.y*t,distance:t,wall:w};
}

function fpObjectSideDimensionData(o){
  if(!o || o.type==='wall' || o.type==='text')return null;
  const walls=(fpObjects||[]).filter(w=>w?.type==='wall');
  if(!walls.length)return null;

  const rot=(Number(o.rotation)||0)*Math.PI/180;
  const ux={x:Math.cos(rot),y:Math.sin(rot)};
  const width=Math.max(1,Number(o.widthCm||fpDefaultObjectDimensions(o.type)?.[0]||60))*(Number(o.scale)||1);
  const center={x:Number(o.x)||0,y:Number(o.y)||0};

  const leftEdge={x:center.x-ux.x*width/2,y:center.y-ux.y*width/2};
  const rightEdge={x:center.x+ux.x*width/2,y:center.y+ux.y*width/2};

  function nearest(origin,dir){
    let best=null;
    for(const w of walls){
      const seg=fpEffectiveInnerWallSegment(w);
      const ew={x1:seg.x1,y1:seg.y1,x2:seg.x2,y2:seg.y2};
      const hit=fpRaySegmentIntersection(origin,dir,ew);
      if(hit && hit.distance>0.25 && (!best || hit.distance<best.distance)){hit.wall=w;best=hit;}
    }
    return best;
  }

  const left=nearest(leftEdge,{x:-ux.x,y:-ux.y});
  const right=nearest(rightEdge,ux);
  return {center,leftEdge,rightEdge,left,right,ux,width};
}

function fpDrawSideDimSegment(from,hit,label,side){
  if(!hit)return;
  const z=Math.max(.2,Number(fpZoom)||1);
  const to={x:hit.x,y:hit.y};
  const dx=to.x-from.x,dy=to.y-from.y;
  const len=Math.hypot(dx,dy);
  if(len<1)return;

  const ux=dx/len,uy=dy/len;
  const nx=-uy,ny=ux;
  const tick=7/z;

  fpCtx.save();
  fpCtx.strokeStyle='#2563eb';
  fpCtx.fillStyle='#1d4ed8';
  fpCtx.lineWidth=1.6/z;
  fpCtx.setLineDash([]);

  // Extension / dimension line.
  fpCtx.beginPath();
  fpCtx.moveTo(from.x,from.y);
  fpCtx.lineTo(to.x,to.y);
  fpCtx.stroke();

  // End ticks.
  fpCtx.beginPath();
  fpCtx.moveTo(from.x-nx*tick,from.y-ny*tick);
  fpCtx.lineTo(from.x+nx*tick,from.y+ny*tick);
  fpCtx.moveTo(to.x-nx*tick,to.y-ny*tick);
  fpCtx.lineTo(to.x+nx*tick,to.y+ny*tick);
  fpCtx.stroke();

  const mx=(from.x+to.x)/2,my=(from.y+to.y)/2;
  const text=`${Math.round(hit.distance)} cm`;
  fpCtx.font=`700 ${Math.max(11,13/z)}px Arial`;
  fpCtx.textAlign='center';fpCtx.textBaseline='middle';
  const tw=fpCtx.measureText(text).width;
  const pad=5/z, bh=19/z;
  fpCtx.fillStyle='rgba(255,255,255,.97)';
  fpCtx.fillRect(mx-tw/2-pad,my-bh/2,tw+2*pad,bh);
  fpCtx.fillStyle='#1d4ed8';
  fpCtx.fillText(text,mx,my);
  fpCtx.restore();
}

function fpDrawObjectSideWallDimensions(o){
  if(!fpShowMeasures || !o || o.type==='wall' || o.type==='text')return;
  // Persist after dropping. While dragging, selected object is always live.
  if(o.id!==fpSelectedId && !o._showSideDimensions)return;

  const d=fpObjectSideDimensionData(o);
  if(!d)return;

  fpDrawSideDimSegment(d.leftEdge,d.left,d.left?`${Math.round(d.left.distance)} cm`:'','left');
  fpDrawSideDimSegment(d.rightEdge,d.right,d.right?`${Math.round(d.right.distance)} cm`:'','right');
}


function fpDrawObjectFourWallDimensions(o){
  if(!fpShowMeasures || !o || o.type==='wall' || o.type==='text')return;
  if(o.id!==fpSelectedId && !o._showSideDimensions)return;

  const d=fpObjectFourWallDistances(o);
  if(!d)return;

  fpDrawSideDimSegment(d.edge.left,d.hit.left,'','left');
  fpDrawSideDimSegment(d.edge.right,d.hit.right,'','right');
  fpDrawSideDimSegment(d.edge.front,d.hit.front,'','front');
  fpDrawSideDimSegment(d.edge.back,d.hit.back,'','back');
}

function fpObjectRealDims(o){
  const [dw,dd]=fpDefaultObjectDimensions(o?.type);
  return {
    w:Math.max(1,Number(o?.widthCm||dw)),
    d:Math.max(1,Number(o?.depthCm||dd))
  };
}


function fpDrawExactObjectSize2925(o){
  if(!fpShowMeasures || !o || o.type==='wall' || o.type==='text' || o.id!==fpSelectedId)return;

  const dims=fpObjectRealDims(o);
  const w=Number(dims.w),d=Number(dims.d);
  const r=(Number(o.rotation)||0)*Math.PI/180;
  const ux={x:Math.cos(r),y:Math.sin(r)};
  const vy={x:-Math.sin(r),y:Math.cos(r)};
  const c={x:Number(o.x)||0,y:Number(o.y)||0};
  const z=Math.max(.2,Number(fpZoom)||1);
  const off=20/z;

  // Width dimension: exactly the entered Breite.
  const a={x:c.x-ux.x*w/2+vy.x*(d/2+off),y:c.y-ux.y*w/2+vy.y*(d/2+off)};
  const b={x:c.x+ux.x*w/2+vy.x*(d/2+off),y:c.y+ux.y*w/2+vy.y*(d/2+off)};

  fpCtx.save();
  fpCtx.strokeStyle='#2563eb';fpCtx.fillStyle='#1d4ed8';
  fpCtx.lineWidth=1.5/z;
  fpCtx.beginPath();fpCtx.moveTo(a.x,a.y);fpCtx.lineTo(b.x,b.y);fpCtx.stroke();

  // ticks
  for(const p of [a,b]){
    fpCtx.beginPath();
    fpCtx.moveTo(p.x-vy.x*5/z,p.y-vy.y*5/z);
    fpCtx.lineTo(p.x+vy.x*5/z,p.y+vy.y*5/z);fpCtx.stroke();
  }

  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  fpCtx.font=`700 ${13/z}px Arial`;fpCtx.textAlign='center';fpCtx.textBaseline='middle';
  const widthText=`${Math.round(w*10)/10} cm`;
  fpCtx.fillStyle='rgba(255,255,255,.94)';
  const tw=fpCtx.measureText(widthText).width+10/z;
  fpCtx.fillRect(mx-tw/2,my-10/z,tw,20/z);
  fpCtx.fillStyle='#1d4ed8';fpCtx.fillText(widthText,mx,my);

  // Depth dimension: exactly the entered Tiefe.
  const c1={x:c.x+ux.x*(w/2+off)-vy.x*d/2,y:c.y+ux.y*(w/2+off)-vy.y*d/2};
  const c2={x:c.x+ux.x*(w/2+off)+vy.x*d/2,y:c.y+ux.y*(w/2+off)+vy.y*d/2};
  fpCtx.beginPath();fpCtx.moveTo(c1.x,c1.y);fpCtx.lineTo(c2.x,c2.y);fpCtx.stroke();
  for(const p of [c1,c2]){
    fpCtx.beginPath();
    fpCtx.moveTo(p.x-ux.x*5/z,p.y-ux.y*5/z);
    fpCtx.lineTo(p.x+ux.x*5/z,p.y+ux.y*5/z);fpCtx.stroke();
  }
  const dx=(c1.x+c2.x)/2,dy=(c1.y+c2.y)/2;
  const depthText=`${Math.round(d*10)/10} cm`;
  const dtw=fpCtx.measureText(depthText).width+10/z;
  fpCtx.fillStyle='rgba(255,255,255,.94)';fpCtx.fillRect(dx-dtw/2,dy-10/z,dtw,20/z);
  fpCtx.fillStyle='#1d4ed8';fpCtx.fillText(depthText,dx,dy);
  fpCtx.restore();
}

function fpDrawObjectOwnDimensions(o){
  fpDrawObjectFourWallDimensions(o);
  fpDrawExactObjectSize2925(o);
}

function fpNearestWallForObject(o){
  if(!o || !fpObjects?.length)return null;
  const px=Number(o.x||0),py=Number(o.y||0);
  let best=null;

  for(const w of fpObjects){
    if(w.type!=='wall')continue;
    const x1=Number(w.x1),y1=Number(w.y1),x2=Number(w.x2),y2=Number(w.y2);
    const dx=x2-x1,dy=y2-y1;
    const l2=dx*dx+dy*dy;
    if(l2<1e-6)continue;

    const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));
    const qx=x1+t*dx,qy=y1+t*dy;
    const dist=Math.hypot(px-qx,py-qy);

    if(!best || dist<best.dist){
      best={wall:w,t,qx,qy,dist,len:Math.sqrt(l2)};
    }
  }
  return best;
}

function fpObjectWallDistance(o){
  const hit=fpNearestWallForObject(o);
  if(!hit)return null;

  const {wall,t,len,dist}=hit;
  // Only display wall-referenced placement if object is close enough to a wall.
  const maxDist=Math.max(85,Number(o.depthCm||60)*.85);
  if(dist>maxDist)return null;

  const fromStart=t*len;
  const fromEnd=(1-t)*len;

  // User wanted "soldan / başlangıçtan" style placement dimension.
  // Use wall drawing start as CAD reference.
  return {wall,cm:fromStart,fromEnd,hit};
}

function fpDrawObjectWallOffset(o){ return; }

function drawFpObject(o,preview=false){
  fpCtx.save();

  const selected=o.id===fpSelectedId;
  fpCtx.strokeStyle=selected?(o._wallContact?'#16a34a':'#2563eb'):'#111827';
  fpCtx.fillStyle=selected?'#2563eb':'#111827';
  fpCtx.lineCap='square';
  fpCtx.lineJoin='miter';

  if(o.type==='wall'){
    // v2.9.43 mitered architectural wall polygon.
    const poly2927=fpWallMiterPolygon2927(o);
    if(poly2927&&poly2927.length===4){
      fpCtx.save();
      fpCtx.beginPath();
      fpCtx.moveTo(poly2927[0].x,poly2927[0].y);
      for(let i=1;i<poly2927.length;i++)fpCtx.lineTo(poly2927[i].x,poly2927[i].y);
      fpCtx.closePath();
      fpCtx.fillStyle='#111827';fpCtx.fill();
      if(selected){
        fpCtx.strokeStyle='#2563eb';
        fpCtx.lineWidth=2/Math.max(.2,fpZoom||1);
        fpCtx.stroke();
      }
      fpCtx.restore();
      if(!selected)return;
    }

    // v2.9.1: authoritative robust wall pass.
    // Thick shifted stroke guarantees visibility on legacy/tablet projects.
    drawWallHard(o,'#111827',1);

    if(!preview){
      const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2;
      const len=cmFromPixels(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}));
      const ang=Math.atan2(o.y2-o.y1,o.x2-o.x1);

      // v1.9.9:
      // Keine zweite Wandlänge direkt auf / innerhalb der Wand.
      // Die Wandlänge wird ausschliesslich über
      // drawProfessionalWallDimension(o) ausserhalb des Grundrisses angezeigt.
      if(o.wallLabel){
        const z=(typeof fpZoom==='number'&&fpZoom>0)?fpZoom:1;
        fpCtx.save();
        fpCtx.beginPath();
        fpCtx.fillStyle='#2563eb';
        fpCtx.strokeStyle='#ffffff';
        fpCtx.lineWidth=2/z;
        fpCtx.arc(mx,my+22/z,15/z,0,Math.PI*2);
        fpCtx.fill();fpCtx.stroke();
        fpCtx.fillStyle='#ffffff';
        fpCtx.font=`900 ${16/z}px Arial`;
        fpCtx.textAlign='center';fpCtx.textBaseline='middle';
        fpCtx.fillText(o.wallLabel,mx,my+22/z);
        fpCtx.restore();
      }
      drawPositionText(o,mx,my+48);

      drawWallTileAreas2D(o);

      // v1.9.18: Wandmasse NICHT hier zeichnen.
      // Alle Wandmasse kommen erst nach allen Wänden / Ecken / Rauminfo
      // auf die oberste Zeichenebene.
      if(selected){
        // professionele Endpunktgriffe
        for(const p of [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]){
          fpCtx.beginPath();
          fpCtx.fillStyle='#fff';
          fpCtx.strokeStyle='#2563eb';
          fpCtx.lineWidth=3;
          fpCtx.arc(p.x,p.y,9,0,Math.PI*2);
          fpCtx.fill();fpCtx.stroke();
        }
      }
    }
    fpCtx.restore();
    return;
  }

  // alle anderen Objekte frei drehen/skaliert zeichnen
  fpCtx.translate(o.x||0,o.y||0);
  fpCtx.rotate((o.rotation||0)*Math.PI/180);

  // Visual size follows the real entered dimensions.
  const dimensionScale=fpObjectDimensionScale(o);
  fpCtx.scale(
    (o.scale||1)*dimensionScale.x,
    (o.scale||1)*dimensionScale.y
  );

  const ox=o.x||0,oy=o.y||0;
  fpCtx.translate(-ox,-oy);

  if(o.type==='door'){
    fpCtx.lineWidth=4;
    const dir=o.openingDirection||'right';
    const interiorSign=Number(o.wallInteriorSign)||1;
    const desiredSide=(o.openingSide||'inside')==='inside'?interiorSign:-interiorSign;
    const width=Math.max(30,Number(o.widthCm||90));
    const half=width/2;

    // wall opening / threshold
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-half,o.y);
    fpCtx.lineTo(o.x+half,o.y);
    fpCtx.stroke();

    const hingeX=dir==='right'?o.x-half:o.x+half;
    const freeX=dir==='right'?o.x+half:o.x-half;
    const freeY=o.y+desiredSide*width;

    // door leaf at 90° design representation
    fpCtx.beginPath();
    fpCtx.moveTo(hingeX,o.y);
    fpCtx.lineTo(freeX,o.y);
    fpCtx.stroke();

    // swing arc on selected side
    fpCtx.beginPath();
    if(dir==='right'){
      fpCtx.arc(hingeX,o.y,width,0,desiredSide>0?Math.PI/2:-Math.PI/2,desiredSide<0);
    }else{
      fpCtx.arc(hingeX,o.y,width,Math.PI,desiredSide>0?Math.PI/2:Math.PI*1.5,desiredSide>0);
    }
    fpCtx.stroke();

  }else if(o.type==='window'){
    const ww=Math.max(30,Number(o.widthCm||100));
    const half=ww/2;
    const frameDepth=Math.max(10,Number(o.depthCm||15));
    fpCtx.lineWidth=3;

    // double frame line, architectural window symbol
    fpCtx.strokeRect(o.x-half,o.y-frameDepth/2,ww,frameDepth);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-half,o.y);
    fpCtx.lineTo(o.x+half,o.y);
    fpCtx.stroke();

    fpCtx.lineWidth=2;
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-half+5,o.y-frameDepth/2+3);
    fpCtx.lineTo(o.x+half-5,o.y+frameDepth/2-3);
    fpCtx.moveTo(o.x-half+5,o.y+frameDepth/2-3);
    fpCtx.lineTo(o.x+half-5,o.y-frameDepth/2+3);
    fpCtx.stroke();

  }else if(o.type==='wc'){
    fpCtx.lineWidth=3;
    fpCtx.beginPath();fpCtx.roundRect(o.x-30,o.y-47,60,28,7);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.ellipse(o.x,o.y+8,30,43,0,0,Math.PI*2);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.ellipse(o.x,o.y+8,22,33,0,0,Math.PI*2);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.arc(o.x,o.y+13,5,0,Math.PI*2);fpCtx.stroke();

  }else if(o.type==='walkInShower'){
    const ww=Math.max(40,Number(o.widthCm||100)),dd=Math.max(40,Number(o.depthCm||100));
    fpCtx.lineWidth=3;fpCtx.strokeStyle='#2563eb';
    fpCtx.strokeRect(o.x-ww/2,o.y-dd/2,ww,dd);
    fpCtx.fillStyle='rgba(37,99,235,.07)';fpCtx.fillRect(o.x-ww/2,o.y-dd/2,ww,dd);
    fpCtx.strokeStyle='#64748b';fpCtx.lineWidth=2;
    const dir=o.slopeDirection||'back';
    const targets={back:[o.x,o.y-dd/2+12],front:[o.x,o.y+dd/2-12],left:[o.x-ww/2+12,o.y],right:[o.x+ww/2-12,o.y],center:[o.x,o.y]};
    const t=targets[dir]||targets.back;
    for(const q of [[o.x-ww*.32,o.y-dd*.32],[o.x+ww*.32,o.y-dd*.32],[o.x-ww*.32,o.y+dd*.32],[o.x+ww*.32,o.y+dd*.32]]){
      fpCtx.beginPath();fpCtx.moveTo(q[0],q[1]);fpCtx.lineTo(t[0],t[1]);fpCtx.stroke();
    }
    fpCtx.fillStyle='#111827';
    if((o.drainType||'line')==='line'){{const len=Math.min(ww-4,Number(o.drainLengthCm||80)), rw=Math.max(2,Number(o.drainWidthCm||5)), off=Math.max(0,Number(o.drainOffsetCm??10)); if(dir==='front'||dir==='back'){const yy=dir==='front'?o.y+dd/2-off:o.y-dd/2+off;fpCtx.fillRect(o.x-len/2,yy-rw/2,len,rw)}else{const xx=dir==='right'?o.x+ww/2-off:o.x-ww/2+off;fpCtx.fillRect(xx-rw/2,o.y-len/2,rw,len)}}}
    else {fpCtx.fillRect(t[0]-6,t[1]-6,12,12)}
    fpCtx.font='13px Arial';fpCtx.textAlign='center';fpCtx.fillText(`Gefälle ${Number(o.slopePct||2).toFixed(1)}%`,o.x,o.y+5);

  }else if(o.type==='shower'){
    // v2.9.43: symbol base MUST equal declared default 90 x 90 cm.
    // The surrounding dimensionScale then produces the entered dimensions
    // exactly (e.g. 80 cm renders as exactly 80 cm, not ~89 cm).
    fpCtx.lineWidth=4;
    fpCtx.strokeRect(o.x-45,o.y-45,90,90);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-40,o.y-40);fpCtx.lineTo(o.x+40,o.y+40);
    fpCtx.moveTo(o.x+40,o.y-40);fpCtx.lineTo(o.x-40,o.y+40);fpCtx.stroke();
    fpCtx.font='16px Arial';fpCtx.textAlign='center';fpCtx.fillText('Dusche',o.x,o.y+5);

  }else if(o.type==='bathtub'){
    fpCtx.lineWidth=4;
    fpCtx.strokeRect(o.x-90,o.y-40,180,80);
    fpCtx.beginPath();
    if(fpCtx.roundRect)fpCtx.roundRect(o.x-75,o.y-28,150,56,25);
    else fpCtx.rect(o.x-75,o.y-28,150,56);
    fpCtx.stroke();
    fpCtx.font='15px Arial';fpCtx.textAlign='center';fpCtx.fillText('Badewanne',o.x,o.y+5);

  }else if(o.type==='sink'){
    fpCtx.lineWidth=4;
    fpCtx.beginPath();fpCtx.ellipse(o.x,o.y,48,30,0,0,Math.PI*2);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.arc(o.x,o.y,5,0,Math.PI*2);fpCtx.fill();
    fpCtx.font='15px Arial';fpCtx.textAlign='center';fpCtx.fillText('Lavabo',o.x,o.y+50);

  }else if(o.type==='drain'){
    fpCtx.lineWidth=3;
    fpCtx.strokeRect(o.x-18,o.y-18,36,36);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-14,o.y-14);fpCtx.lineTo(o.x+14,o.y+14);
    fpCtx.moveTo(o.x+14,o.y-14);fpCtx.lineTo(o.x-14,o.y+14);fpCtx.stroke();

  }else if(o.type==='kitchenSink'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-50,o.y-40,100,80);
    fpCtx.beginPath();fpCtx.ellipse(o.x,o.y,32,22,0,0,Math.PI*2);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.arc(o.x,o.y,4,0,Math.PI*2);fpCtx.fill();

  }else if(o.type==='stove'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-45,o.y-45,90,90);
    for(const dx of [-20,20])for(const dy of [-20,20]){
      fpCtx.beginPath();fpCtx.arc(o.x+dx,o.y+dy,11,0,Math.PI*2);fpCtx.stroke();
    }

  }else if(o.type==='fridge'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-38,o.y-50,76,100);
    fpCtx.beginPath();fpCtx.moveTo(o.x-38,o.y-8);fpCtx.lineTo(o.x+38,o.y-8);fpCtx.stroke();

  }else if(o.type==='washingMachine'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-42,o.y-45,84,90);
    fpCtx.beginPath();fpCtx.arc(o.x,o.y+5,25,0,Math.PI*2);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.arc(o.x,o.y+5,15,0,Math.PI*2);fpCtx.stroke();

  }else if(o.type==='table'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-70,o.y-38,140,76);

  }else if(o.type==='chair'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-26,o.y-20,52,45);
    fpCtx.beginPath();fpCtx.moveTo(o.x-26,o.y-20);fpCtx.lineTo(o.x-26,o.y-40);fpCtx.lineTo(o.x+26,o.y-40);fpCtx.lineTo(o.x+26,o.y-20);fpCtx.stroke();

  }else if(o.type==='sofa'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-90,o.y-38,180,76);
    fpCtx.strokeRect(o.x-78,o.y-28,72,56);fpCtx.strokeRect(o.x+6,o.y-28,72,56);

  }else if(o.type==='bed'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-70,o.y-90,140,180);
    fpCtx.strokeRect(o.x-55,o.y-75,48,35);fpCtx.strokeRect(o.x+7,o.y-75,48,35);

  }else if(o.type==='cabinet'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-65,o.y-32,130,64);
    fpCtx.beginPath();fpCtx.moveTo(o.x,o.y-32);fpCtx.lineTo(o.x,o.y+32);fpCtx.stroke();

  }else if(o.type==='plant'){
    fpCtx.lineWidth=3;fpCtx.strokeRect(o.x-18,o.y+18,36,28);
    fpCtx.beginPath();fpCtx.moveTo(o.x,o.y+18);fpCtx.lineTo(o.x,o.y-24);fpCtx.stroke();
    for(const ang of [-1.2,-.6,0,.6,1.2]){
      fpCtx.beginPath();fpCtx.ellipse(o.x+Math.sin(ang)*18,o.y-6+Math.cos(ang)*12,10,5,ang,0,Math.PI*2);fpCtx.stroke();
    }

  }else if(o.type==='niche'){
    const nw=Math.max(20,Number(o.widthCm||60));
    const nd=Math.max(4,Number(o.depthCm||12));
    const roomSign=(Number(o.wallInteriorSign)||1)>=0?1:-1;
    const frontY=o.y+roomSign*nd/2;   // opening exactly at room-side wall face
    const backY=o.y-roomSign*nd/2;    // full depth inside wall

    fpCtx.lineWidth=2.6;
    fpCtx.fillStyle='rgba(226,232,240,.58)';
    fpCtx.fillRect(o.x-nw/2,Math.min(frontY,backY),nw,Math.abs(frontY-backY));

    // Back + side walls. The room-facing side deliberately remains OPEN.
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-nw/2,frontY);
    fpCtx.lineTo(o.x-nw/2,backY);
    fpCtx.lineTo(o.x+nw/2,backY);
    fpCtx.lineTo(o.x+nw/2,frontY);
    fpCtx.stroke();

    // Dashed back-depth cue.
    fpCtx.lineWidth=1.2;
    fpCtx.setLineDash([5,4]);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-nw/2+5,backY);
    fpCtx.lineTo(o.x+nw/2-5,backY);
    fpCtx.stroke();
    fpCtx.setLineDash([]);

    // Small arrows point from room opening into the wall.
    fpCtx.fillStyle='#2563eb';
    fpCtx.strokeStyle='#2563eb';
    const arrowLen=Math.min(nd*.55,18);
    for(const xx of [o.x-nw*.24,o.x+nw*.24]){
      fpCtx.beginPath();
      fpCtx.moveTo(xx,frontY);
      fpCtx.lineTo(xx,frontY-roomSign*arrowLen);
      fpCtx.stroke();
    }

  }else if(o.type==='glass'){
    const gw=Math.max(10,Number(o.widthCm||100));
    const gd=Math.max(1,Number(o.depthCm||1));
    fpCtx.lineWidth=Math.max(2,gd);
    fpCtx.strokeStyle='#0ea5e9';
    fpCtx.fillStyle='rgba(125,211,252,.16)';
    fpCtx.fillRect(o.x-gw/2,o.y-gd/2,gw,gd);
    fpCtx.strokeRect(o.x-gw/2,o.y-gd/2,gw,gd);
    fpCtx.setLineDash([8,5]);
    fpCtx.beginPath();fpCtx.moveTo(o.x-gw/2,o.y);fpCtx.lineTo(o.x+gw/2,o.y);fpCtx.stroke();
    fpCtx.setLineDash([]);
  }else if(o.type==='mirror'){
    const mw=Math.max(20,Number(o.widthCm||80));
    const md=Math.max(4,Number(o.depthCm||5));
    fpCtx.lineWidth=3;
    fpCtx.fillStyle='rgba(186,230,253,.28)';
    fpCtx.fillRect(o.x-mw/2,o.y-md/2,mw,md);
    fpCtx.strokeRect(o.x-mw/2,o.y-md/2,mw,md);
    fpCtx.lineWidth=1.5;
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-mw*.42,o.y+md*.18);
    fpCtx.lineTo(o.x-mw*.18,o.y-md*.18);
    fpCtx.moveTo(o.x+mw*.08,o.y+md*.18);
    fpCtx.lineTo(o.x+mw*.34,o.y-md*.18);
    fpCtx.stroke();

  }else if(o.type==='text'){
    fpCtx.font='bold 24px Arial';
    fpCtx.textAlign='left';
    fpCtx.fillText(o.text,o.x,o.y);
  }

  fpCtx.restore();

  // ölçüler nesnenin kendi çizimi içerisinde / merkezinde
  if(o.type!=='text' && o.widthCm && o.depthCm){
    drawMeasureText(`${o.widthCm} × ${o.depthCm} cm`,o.x,o.y);
  }

  if(fpShowPositions){
    drawPositionText(o,o.x,o.y+72*(o.scale||1));
  }

  if(selected){
    fpCtx.save();
    fpCtx.strokeStyle='#2563eb';
    fpCtx.lineWidth=2;
    fpCtx.setLineDash([7,5]);

    const scale=Number(o.scale||1);
    const bw=Math.max(45,Number(o.widthCm||90)*scale);
    const bd=Math.max(45,Number(o.depthCm||70)*scale);

    // Rotated selection rectangle.
    fpCtx.translate(o.x||0,o.y||0);
    fpCtx.rotate((o.rotation||0)*Math.PI/180);
    fpCtx.strokeRect(-bw/2,-bd/2,bw,bd);
    fpCtx.restore();

    const handle=rotationHandlePosition(o);
    if(handle){
      const z=Math.max(.2,fpZoom||1);
      const radius=14/z;

      // Connector line from top-right corner to handle.
      const rad=Number(o.rotation||0)*Math.PI/180;
      const cx=(o.x||0)+(bw/2)*Math.cos(rad)-(-bd/2)*Math.sin(rad);
      const cy=(o.y||0)+(bw/2)*Math.sin(rad)+(-bd/2)*Math.cos(rad);

      fpCtx.save();
      fpCtx.setLineDash([]);
      fpCtx.strokeStyle='#2563eb';
      fpCtx.fillStyle='#ffffff';
      fpCtx.lineWidth=2/z;

      fpCtx.beginPath();
      fpCtx.moveTo(cx,cy);
      fpCtx.lineTo(handle.x,handle.y);
      fpCtx.stroke();

      // White circular handle.
      fpCtx.beginPath();
      fpCtx.arc(handle.x,handle.y,radius,0,Math.PI*2);
      fpCtx.fill();
      fpCtx.stroke();

      // Rotation arrow glyph.
      fpCtx.fillStyle='#2563eb';
      fpCtx.font=`bold ${16/z}px Arial`;
      fpCtx.textAlign='center';
      fpCtx.textBaseline='middle';
      fpCtx.fillText('↻',handle.x,handle.y+0.5/z);

      fpCtx.restore();
    }
  }
}


function calculateWallPerimeterCm(objects){
  return (objects||[])
    .filter(o=>o.type==='wall')
    .reduce((sum,o)=>sum+dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}),0);
}

function updateCadInspector(){
  const o=selectedObject ? selectedObject() : null;
  const set=(id,val)=>{const el=$(id);if(el)el.textContent=val??'–'};

  const statusSel=$('fpStatusSelection');
  if(o){
    set('cadInspectorSelection',o.type==='wall'?'Wand':o.type);
    if(statusSel)statusSel.textContent=`Auswahl: ${o.type==='wall'?'Wand':o.type}`;
    set('cadPropType',o.type);
    const p=objectPositionCm(o);
    set('cadPropX',`${p.x} cm`);
    set('cadPropY',`${p.y} cm`);
    if(o.type==='wall'){
      set('cadPropSize',`${Math.round(fpWallInnerInputLength2936(o))} cm`);
      set('cadPropRotation',`${Math.round(wallAngleDeg(o))}°`);
    }else{
      set('cadPropSize',o.widthCm&&o.depthCm?`${o.widthCm} × ${o.depthCm} cm`:`${Math.round((o.scale||1)*100)} %`);
      set('cadPropRotation',`${Math.round(o.rotation||0)}°`);
    }
  }else{
    if(statusSel)statusSel.textContent='Keine Auswahl';
    set('cadInspectorSelection','Keine Auswahl');
    set('cadPropType','–');set('cadPropX','–');set('cadPropY','–');set('cadPropSize','–');set('cadPropRotation','–');
  }

  if(fpRecord){
    set('cadRoomName',fpRecord.name||'–');
    const area=calculateFloorAreaM2(fpObjects);
    set('cadRoomArea',area==null?'–':`${formatCHNumber(area,2)} m²`);
    set('cadRoomHeight',fpRecord.roomHeightM?`${formatCHNumber(fpRecord.roomHeightM,2)} m`:'–');
    set('cadRoomPerimeter',`${formatCHNumber(calculateWallPerimeterCm(fpObjects),0)} cm`);
  }
}

function updateCadMousePosition(p){
  const x=$('cadMouseX'),y=$('cadMouseY');
  if(x)x.textContent=`${Math.round(p.x)} cm`;
  if(y)y.textContent=`${Math.round(p.y)} cm`;
}

function drawCadRulers(){
  const top=$('fpRulerTop'),left=$('fpRulerLeft');
  if(top){
    let html='';
    for(let x=0;x<=1600;x+=100)html+=`<span style="display:inline-block;width:${100*fpZoom}px">${x} cm</span>`;
    top.innerHTML=html;
  }
  if(left){
    let html='';
    for(let y=0;y<=1100;y+=100)html+=`<div style="height:${100*fpZoom}px;padding-top:2px;text-align:center">${y}</div>`;
    left.innerHTML=html;
  }
}




function refitTabletCadArea(){
  if(!document.querySelector('.floorplan-modal-card.tablet-hardmode'))return;
  requestAnimationFrame(()=>{
    resize2DCanvas?.();
    if(fp3DMode)window.ProjectBau3D?.fitView?.();
    else fitFloorplan2D?.();
  });
}



function forceWorkspaceRootRefit(){
  requestAnimationFrame(()=>{
    try{
      if(fp3DMode){
        window.ProjectBau3D?.resize?.();
        window.ProjectBau3D?.fitView?.();
      }else{
        resize2DCanvas?.();
        fitFloorplan2D?.();
      }
    }catch(e){
      console.error('Workspace root refit',e);
    }
  });
}

function safeTabletWorkspaceRefit(){
  const card=document.querySelector('.floorplan-modal-card');
  if(!card || !card.classList.contains('tablet-hardmode'))return;

  requestAnimationFrame(()=>{
    try{
      if(fp3DMode){
        window.ProjectBau3D?.resize?.();
        window.ProjectBau3D?.fitView?.();
      }else{
        resize2DCanvas?.();
        fitFloorplan2D?.();
      }
    }catch(e){
      console.error('Tablet workspace refit',e);
    }
  });
}

function updateTabletViewportMetrics(){
  const root=document.documentElement;
  const visualH=window.visualViewport?.height||window.innerHeight;
  const layoutH=window.innerHeight;
  const keyboardOrBrowserInset=Math.max(0,layoutH-visualH);

  root.style.setProperty('--browser-bottom-inset',`${keyboardOrBrowserInset}px`);

  const card=document.querySelector('.floorplan-modal-card');
  if(!card || !card.classList.contains('tablet-hardmode'))return;

  // Re-fit CAD only after actual viewport metrics are stable.
  requestAnimationFrame(()=>{
    if(fp3DMode)window.ProjectBau3D?.fitView?.();
    else fitFloorplan2D?.();
  });
}

function initTabletCadUi(){
  const card=document.querySelector('.floorplan-modal-card');
  const toggleInspector=$('fpToggleInspector');
  const compact=$('fpCompactUi');

  const isTabletLandscape=()=>{
    const coarse=window.matchMedia('(pointer:coarse)').matches;
    const landscape=window.matchMedia('(orientation:landscape)').matches;
    const touch=(navigator.maxTouchPoints||0)>0;
    const shortSide=Math.min(window.innerWidth,window.innerHeight);
    return landscape && (coarse||touch) && shortSide>=500;
  };

  const applyMode=()=>{
    if(!card)return;
    if(isTabletLandscape()){
      card.classList.add('tablet-hardmode');
      card.classList.remove('tablet-compact','tablet-inspector-hidden');
      card.classList.remove('inspector-open'); // CAD canvas gets priority
    }else{
      card.classList.remove('tablet-hardmode','inspector-open');
    }
  };

  if(toggleInspector){
    toggleInspector.onclick=()=>{
      if(!card)return;
      if(card.classList.contains('tablet-hardmode')){
        card.classList.toggle('inspector-open');
      }else{
        card.classList.toggle('tablet-inspector-hidden');
      }
      setTimeout(()=>{
        if(fp3DMode)window.ProjectBau3D?.fitView?.();
        else fitFloorplan2D?.();
      },50);
    };
  }

  if(compact){
    compact.onclick=()=>{
      if(!card)return;
      if(!card.classList.contains('tablet-hardmode')){
        card.classList.toggle('tablet-compact');
      }
      requestAnimationFrame(()=>{
        if(fp3DMode)window.ProjectBau3D?.fitView?.();
        else fitFloorplan2D?.();
      });
    };
  }

  const refresh=()=>{
    applyMode();
    setTimeout(()=>{
      if(fp3DMode)window.ProjectBau3D?.fitView?.();
      else fitFloorplan2D?.();
    },120);
  };

  window.addEventListener('resize',()=>{refresh();updateTabletViewportMetrics()});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',()=>{
      updateTabletViewportMetrics();
      setTimeout(()=>{if(!fp3DMode)fitFloorplan2D?.();},120);
    });
  }
  window.addEventListener('orientationchange',()=>{setTimeout(refresh,250);setTimeout(safeTabletWorkspaceRefit,420)});
  applyMode();
  updateTabletViewportMetrics();
  setTimeout(refitTabletCadArea,80);
  setTimeout(refitTabletCadArea,300);
}


function fpV194CleanUiInit(){
  const pos=$('fpShowPositions');
  if(pos){
    pos.checked=false;
    fpShowPositions=false;
  }
}


function generateFloorplan2DPDF(){
  if(!fpRecord || !fpCanvas){
    alert('Kein Grundriss geöffnet.');
    return;
  }
  if(!window.jspdf || !window.jspdf.jsPDF){
    alert('Das PDF-Modul konnte nicht geladen werden. Bitte Seite neu laden.');
    return;
  }

  // Preserve the exact editor state.
  const state={
    zoom:fpZoom,
    offX:fpViewOffsetX,
    offY:fpViewOffsetY,
    grid:fpShowGrid,
    positions:fpShowPositions,
    selected:fpSelectedId
  };

  try{
    // Clean professional export: no editing grid, coordinates or selection handles.
    fpShowGrid=false;
    fpShowPositions=false;
    fpSelectedId=null;

    resize2DCanvas();
    fitFloorplan2D();
    drawFloorplan();

    // Export ONLY the actual drawing + external dimension chains.
    // This prevents a tiny plan in the middle of a huge blank canvas.
    const db=getDimensionedFloorplanBounds();
    if(!db)throw new Error('Keine Grundrissgrenzen');

    const worldPad=28;
    const cropMinX=db.minX-worldPad;
    const cropMinY=db.minY-worldPad;
    const cropMaxX=db.maxX+worldPad;
    const cropMaxY=db.maxY+worldPad;

    const px1=cropMinX*fpZoom+fpViewOffsetX;
    const py1=cropMinY*fpZoom+fpViewOffsetY;
    const px2=cropMaxX*fpZoom+fpViewOffsetX;
    const py2=cropMaxY*fpZoom+fpViewOffsetY;

    const sx=Math.max(0,Math.floor(px1));
    const sy=Math.max(0,Math.floor(py1));
    const sw=Math.min(fpCanvas.width-sx,Math.ceil(px2-px1));
    const sh=Math.min(fpCanvas.height-sy,Math.ceil(py2-py1));

    if(sw<20 || sh<20)throw new Error('Ungültiger PDF-Ausschnitt');

    const exportCanvas=document.createElement('canvas');
    const exportScale=2;
    exportCanvas.width=Math.max(1,Math.round(sw*exportScale));
    exportCanvas.height=Math.max(1,Math.round(sh*exportScale));
    const ectx=exportCanvas.getContext('2d');
    ectx.fillStyle='#ffffff';
    ectx.fillRect(0,0,exportCanvas.width,exportCanvas.height);
    ectx.imageSmoothingEnabled=true;
    ectx.drawImage(
      fpCanvas,
      sx,sy,sw,sh,
      0,0,exportCanvas.width,exportCanvas.height
    );

    const image=exportCanvas.toDataURL('image/png',1.0);

    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({
      orientation:'landscape',
      unit:'mm',
      format:'a4',
      compress:true
    });

    const pageW=297;
    const pageH=210;
    const margin=12;

    const projectName=fpProject?.name || 'Projekt Bau';
    const planName=fpRecord?.name || 'Grundriss';
    const floorArea=calculateFloorAreaM2(fpObjects);
    const roomHeight=Number(fpRecord?.roomHeightM||0);

    // Header
    doc.setTextColor(15,23,42);
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.text('PROJEKT BAU · GRUNDRISS',margin,11);

    doc.setFontSize(17);
    doc.text(planName,margin,20);

    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(71,85,105);
    doc.text(projectName,margin,26);

    doc.setFont('helvetica','bold');
    doc.setTextColor(15,23,42);
    doc.setFontSize(9);

    const areaText=floorArea==null?'—':`${formatCHNumber(floorArea,2)} m²`;
    const heightText=roomHeight>0?`${formatCHNumber(roomHeight,2)} m`:'—';

    doc.text(`Bodenfläche: ${areaText}`,pageW-margin,15,{align:'right'});
    doc.text(`Raumhöhe: ${heightText}`,pageW-margin,21,{align:'right'});

    doc.setDrawColor(203,213,225);
    doc.setLineWidth(.3);
    doc.line(margin,31,pageW-margin,31);

    // Canvas image fitted into the large central PDF area.
    const imgW=exportCanvas.width;
    const imgH=exportCanvas.height;
    const maxW=pageW-margin*2;
    const maxH=pageH-43;
    const ratio=Math.min(maxW/imgW,maxH/imgH);
    const drawW=imgW*ratio;
    const drawH=imgH*ratio;
    const x=(pageW-drawW)/2;
    const y=33+(maxH-drawH)/2;

    doc.addImage(image,'PNG',x,y,drawW,drawH,undefined,'FAST');

    // Footer
    doc.setDrawColor(226,232,240);
    doc.line(margin,pageH-10,pageW-margin,pageH-10);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(100,116,139);

    const now=new Date();
    const date=now.toLocaleDateString('de-CH',{
      day:'2-digit',month:'2-digit',year:'numeric'
    });
    doc.text(`Erstellt: ${date}`,margin,pageH-5);
    doc.text('Projekt Bau · Baudokumentation',pageW-margin,pageH-5,{align:'right'});

    // Direct download: no popup, therefore works on Samsung Internet / Chrome tablets.
    const safeName=String(planName||'Grundriss').replace(/[^a-zA-Z0-9_-]+/g,'_');
    doc.save(`Grundriss_${safeName}.pdf`);
  }catch(err){
    console.error('2D Grundriss PDF',err);
    alert('Der 2D-Grundriss konnte nicht als PDF erstellt werden.');
  }finally{
    // Restore the editor exactly as it was.
    fpZoom=state.zoom;
    fpViewOffsetX=state.offX;
    fpViewOffsetY=state.offY;
    fpShowGrid=state.grid;
    fpShowPositions=state.positions;
    fpSelectedId=state.selected;

    const gridToggle=$('fpShowGrid');
    if(gridToggle)gridToggle.checked=fpShowGrid;
    const posToggle=$('fpShowPositions');
    if(posToggle)posToggle.checked=fpShowPositions;

    drawFloorplan();
    updateSelectedInfo();
  }
}


function initFloorplanControls(){
  fpV194CleanUiInit();
  const newBtn=$('newFloorplanBtn');if(newBtn)newBtn.onclick=createNewFloorplan;
  const cancelName=$('cancelFloorplanName');if(cancelName)cancelName.onclick=cancelNewFloorplan;
  const confirmName=$('confirmFloorplanName');if(confirmName)confirmName.onclick=confirmNewFloorplan;
  const nameInput=$('floorplanNameInput');if(nameInput)nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')confirmNewFloorplan()});
  document.querySelectorAll('.fp-tool').forEach(b=>b.onclick=()=>setFloorTool(b.dataset.tool));
  const closeBtn=$('closeFloorplan');if(closeBtn)closeBtn.onclick=closeFloorplan;
  $('fpUndo').onclick=()=>{if(!fpUndoStack.length)return;fpRedoStack.push(cloneObjects());restoreObjects(fpUndoStack.pop())};
  $('fpRedo').onclick=()=>{if(!fpRedoStack.length)return;fpUndoStack.push(cloneObjects());restoreObjects(fpRedoStack.pop())};
  const rot=$('fpRotation'),rotNum=$('fpRotationNumber');
  if(rot){
    rot.onpointerdown=()=>{if(selectedObject())pushHistory()};
    rot.oninput=e=>setSelectedRotation(e.target.value,false);
  }
  if(rotNum){
    rotNum.onfocus=()=>{if(selectedObject())pushHistory()};
    rotNum.oninput=e=>setSelectedRotation(e.target.value,false);
  }
  const scale=$('fpScale'),scaleNum=$('fpScaleNumber');
  if(scale){
    scale.onpointerdown=()=>{if(selectedObject())pushHistory()};
    scale.oninput=e=>setSelectedScale(e.target.value,false);
  }
  if(scaleNum){
    scaleNum.onfocus=()=>{if(selectedObject())pushHistory()};
    scaleNum.oninput=e=>setSelectedScale(e.target.value,false);
  }
  const duplicate=$('fpDuplicate');if(duplicate)duplicate.onclick=duplicateSelected;
  const objectWallSnap=$('fpObjectWallSnap');
  if(objectWallSnap){
    objectWallSnap.checked=fpObjectWallSnap;
    objectWallSnap.onchange=e=>{fpObjectWallSnap=e.target.checked};
  }
  const angle=$('fpAngleSnap');if(angle)angle.onchange=e=>{fpAngleSnap=e.target.checked};
  const activeLayer=$('fpActiveLayer');if(activeLayer){
    activeLayer.value=fpActiveLayer;
    activeLayer.onchange=e=>{fpActiveLayer=e.target.value;if(fpRecord)fpRecord.activeLayer=fpActiveLayer};
  }
  document.querySelectorAll('.fp-layer-toggle').forEach(cb=>{
    cb.checked=fpLayerVisibility[cb.dataset.layer]!==false;
    cb.onchange=e=>{
      fpLayerVisibility[e.target.dataset.layer]=e.target.checked;
      if(fpRecord)fpRecord.layerVisibility={...fpLayerVisibility};
      drawFloorplan();
      if(fp3DMode)refresh3D();
    };
  });
  ['fpWallX1','fpWallY1','fpWallX2','fpWallY2'].forEach(id=>{
    const el=$(id);if(el)el.onchange=setWallEndpointsFromFields;
  });

  const openingDirection=$('fpOpeningDirection');
  if(openingDirection)openingDirection.onchange=changeOpeningDirection;

  const openingSide=$('fpOpeningSide');
  if(openingSide)openingSide.onchange=changeOpeningSide;

  const wallFace=$('fpWallFace');
  if(wallFace)wallFace.onchange=changeOpeningWallFace;

  ['fpOpeningWidth','fpOpeningHeight','fpWindowSillHeight'].forEach(id=>{
    const input=$(id);
    if(input)input.onchange=changeOpeningDimensions;
  });

  ['fpWallObjectWidth','fpWallObjectHeight','fpWallObjectDepth','fpWallObjectBottom'].forEach(id=>{
    const input=$(id);
    if(input)input.onchange=applyWallObjectPanel;
  });

  const floorTilePanelBtn=$('fpFloorTilePanelBtn');if(floorTilePanelBtn)floorTilePanelBtn.onclick=()=>{const p=$('fpFloorTilePanel');if(p){p.classList.toggle('hidden');if(!p.classList.contains('hidden'))updateFloorTilePanel();}};
  const floorTileClose=$('fpFloorTileClose');if(floorTileClose)floorTileClose.onclick=()=>$('fpFloorTilePanel')?.classList.add('hidden');
  const floorTileApply=$('fpFloorTileApply');if(floorTileApply)floorTileApply.onclick=applyFloorTileConfig;
  const floorTileCenter=$('fpFloorTileCenter');if(floorTileCenter)floorTileCenter.onclick=centerFloorTileLayout;
  const floorTilePickOrigin=$('fpFloorTilePickOrigin');if(floorTilePickOrigin)floorTilePickOrigin.onclick=()=>{fpPickingFloorTileOrigin=true;$('fpFloorTilePanel')?.classList.add('hidden');};
  ['fpFloorTileW','fpFloorTileH','fpFloorTileJoint','fpFloorTilePattern','fpFloorTileOriginMode','fpFloorTileAlign','fpFloorTileOriginX','fpFloorTileOriginY'].forEach(id=>{const e=$(id);if(e)e.onchange=()=>{const c=ensureFloorTileConfig();if(c){readFloorTileControls(c);updateFloorTileInfo();}}});

  const tileApplyFloorAll=$('fpTileApplyFloorAll');
  if(tileApplyFloorAll)tileApplyFloorAll.onclick=()=>applyChosenTileEverywhere('floor','floor');
  const tileApplyWallsAll=$('fpTileApplyWallsAll');
  if(tileApplyWallsAll)tileApplyWallsAll.onclick=()=>applyChosenTileEverywhere('walls','floor');
  const tileApplyRoomAll=$('fpTileApplyRoomAll');
  if(tileApplyRoomAll)tileApplyRoomAll.onclick=()=>applyChosenTileEverywhere('room','floor');

  const wallApplyFloorAll=$('fpWallTileApplyFloorAll');
  if(wallApplyFloorAll)wallApplyFloorAll.onclick=()=>applyChosenTileEverywhere('floor','wall');
  const wallApplyWallsAll=$('fpWallTileApplyWallsAll');
  if(wallApplyWallsAll)wallApplyWallsAll.onclick=()=>applyChosenTileEverywhere('walls','wall');
  const wallApplyRoomAll=$('fpWallTileApplyRoomAll');
  if(wallApplyRoomAll)wallApplyRoomAll.onclick=()=>applyChosenTileEverywhere('room','wall');

  const floorTileMaterial=$('fpFloorTileMaterial');
  if(floorTileMaterial)floorTileMaterial.onchange=()=>{const c=ensureFloorTileConfig();if(c){c.materialId=floorTileMaterial.value;c.enabled=true;syncFloorTileTo3D(c);save();drawFloorplan();refresh3D();}};
  const floorTileUpload=$('fpFloorTileUpload');
  if(floorTileUpload)floorTileUpload.onchange=async e=>{const id=await createTileMaterialFromUpload(e.target.files?.[0]);if(id){const c=ensureFloorTileConfig();c.materialId=id;c.enabled=true;syncFloorTileTo3D(c);save();refreshCadTileMaterialSelects();updateFloorTilePanel();drawFloorplan();refresh3D();}e.target.value='';};

  const wallTileMaterial=$('fpWallTileMaterial');
  if(wallTileMaterial)wallTileMaterial.onchange=()=>{const w=selectedObject();if(w?.type==='wall')w._draftTileMaterialId=wallTileMaterial.value;};
  const wallTileUpload=$('fpWallTileUpload');
  if(wallTileUpload)wallTileUpload.onchange=async e=>{const id=await createTileMaterialFromUpload(e.target.files?.[0]);if(id){const w=selectedObject();if(w?.type==='wall')w._draftTileMaterialId=id;refreshCadTileMaterialSelects();}e.target.value='';};

  const wallTileUpdate=$('fpWallTileUpdate');
  if(wallTileUpdate)wallTileUpdate.onclick=updateWallTileArea;

  const wallTileCancelEdit=$('fpWallTileCancelEdit');
  if(wallTileCancelEdit)wallTileCancelEdit.onclick=cancelWallTileAreaEdit;

  const wallTileAdd=$('fpWallTileAdd');
  if(wallTileAdd)wallTileAdd.onclick=addWallTileArea;

  ['fpWallTileOffset','fpWallTileWidth','fpWallTileBottom','fpWallTileHeight',
   'fpWallTileSizeW','fpWallTileSizeH','fpWallTileJoint'].forEach(id=>{
    const el=$(id);
    if(el)el.oninput=updateWallTileDraftInfo;
  });

  const wallTilePattern=$('fpWallTilePattern');
  if(wallTilePattern)wallTilePattern.onchange=updateWallTileDraftInfo;

  const quickApply=$('fpQuickWallApply');
  if(quickApply)quickApply.onclick=applyWallQuickPanel;

  const quickClose=$('fpWallQuickClose');
  if(quickClose)quickClose.onclick=()=>$('fpWallQuickPanel')?.classList.add('hidden');

  ['fpQuickWallLength','fpQuickWallAngle','fpQuickWallThickness',
   'fpQuickWallX1','fpQuickWallY1','fpQuickWallX2','fpQuickWallY2'].forEach(id=>{
    const el=$(id);
    if(el)el.onchange=applyWallQuickPanel;
  });

  const objectWidth=$('fpObjectWidth');
  const objectDepth=$('fpObjectDepth');
  if(objectWidth)objectWidth.onchange=setSelectedDimensions;
  if(objectDepth)objectDepth.onchange=setSelectedDimensions;
  const showerSlope=$('fpShowerSlope'),showerDrain=$('fpShowerDrainType'),showerDir=$('fpShowerSlopeDirection'),showerDrainLength=$('fpShowerDrainLength'),showerDrainWidth=$('fpShowerDrainWidth'),showerDrainOffset=$('fpShowerDrainOffset'),showerRecess=$('fpShowerRecess');
  const applyWalkIn=()=>{const o=selectedObject();if(!o||o.type!=='walkInShower')return;pushHistory();o.slopePct=Math.max(.5,Math.min(5,Number(showerSlope?.value||2)));o.drainType=showerDrain?.value||'line';o.slopeDirection=showerDir?.value||'back';o.drainLengthCm=Math.max(10,Number(showerDrainLength?.value||80));o.drainWidthCm=Math.max(1,Number(showerDrainWidth?.value||5));o.drainOffsetCm=Math.max(0,Number(showerDrainOffset?.value||0));o.recessCm=Math.max(0,Number(showerRecess?.value||0));save();drawFloorplan();refresh3D();updateSelectedInfo();};
  [showerSlope,showerDrain,showerDir,showerDrainLength,showerDrainWidth,showerDrainOffset,showerRecess].forEach(el=>{if(el){el.onchange=applyWalkIn;el.oninput=applyWalkIn;}});


  
  const quickThickness2937=$('fpQuickWallThickness');
  if(quickThickness2937)quickThickness2937.onchange=()=>{
    const o=selectedObject();
    if(!o||o.type!=='wall')return;
    const t=Number(quickThickness2937.value)||fpWallThickness||15;
    o.thickness=t;fpWallThickness=t;
    const normalThickness=$('fpWallThickness');
    if(normalThickness)normalThickness.value=String(t);
    fpApplyInnerLengthToWall2936(o,fpWallInnerInputLength2936(o),wallAngleDeg(o));
    drawFloorplan();updateSelectedInfo();updateWallEndpointFields?.();save?.();
  };

const wallLength=$('fpWallLength');
  const wallAngle=$('fpWallAngle');
  if(wallLength)wallLength.onchange=setSelectedWallGeometry;
  if(wallAngle)wallAngle.onchange=setSelectedWallGeometry;

  const objW=$('fpObjectWidth'),objD=$('fpObjectDepth');
  if(objW)objW.onchange=setSelectedDimensions;
  if(objD)objD.onchange=setSelectedDimensions;
  const objX=$('fpObjectX'),objY=$('fpObjectY');
  if(objX)objX.onchange=setSelectedPosition;
  if(objY)objY.onchange=setSelectedPosition;
  $('fpDeleteSelected').onclick=deleteSelected;
  $('fpClear').onclick=()=>{if(confirm('Grundriss vollständig löschen?')){pushHistory();fpObjects=[];fpSelectedId=null;drawFloorplan();updateSelectedInfo()}};
  const legacySave=$('fpSave');if(legacySave)legacySave.onclick=()=>{if(saveCurrentFloorplan())closeFloorplan()};
  const roomHeightInput=$('fpRoomHeight');
  if(roomHeightInput)roomHeightInput.onchange=e=>{
    if(!fpRecord)return;
    const v=Number(e.target.value);
    fpRecord.roomHeightM=Number.isFinite(v)&&v>0?v:null;
    localStorage.setItem(K3,JSON.stringify(S));
    updateFloorRoomInfo();
  };
  $('fpGridSize').onchange=e=>{fpGrid=Number(e.target.value)||5;drawFloorplan()};
  const fineStep=$('fpFineStep');
  if(fineStep)fineStep.onchange=e=>{
    fpFineStep=Number(e.target.value)||1;
    const st=$('fpFineStatus');if(st)st.textContent=`${fpFineStep} cm`;
  };
  $('fpWallThickness').onchange=e=>{
    const t=Number(e.target.value)||15;
    fpWallThickness=t;
    const o=selectedObject();
    if(o&&o.type==='wall'){
      pushHistory();
      o.thickness=t;
      // Keep the user-facing inner length unchanged while recalculating outer geometry.
      const inner=fpWallInnerInputLength2936(o);
      fpApplyInnerLengthToWall2936(o,inner,wallAngleDeg(o));
      drawFloorplan();
      updateSelectedInfo();
      updateWallEndpointFields?.();
      save?.();
    }
  };
  $('fpSnap').onchange=e=>{fpSnapEnabled=e.target.checked};
  const showGrid=$('fpShowGrid'),showPos=$('fpShowPositions'),showMeasures=$('fpShowMeasures');
  if(showGrid)showGrid.onchange=e=>{fpShowGrid=e.target.checked;drawFloorplan()};
  if(showPos)showPos.onchange=e=>{fpShowPositions=e.target.checked;drawFloorplan()};
  if(showMeasures)showMeasures.onchange=e=>{fpShowMeasures=e.target.checked;drawFloorplan()};
  $('fpZoomOut').onclick=()=>{fpZoom=Math.max(.05,fpZoom*0.9);centerFloorplan2D()};
  $('fpZoomIn').onclick=()=>{fpZoom=Math.min(8,fpZoom*1.1);centerFloorplan2D()};
  $('fpZoomReset').onclick=()=>fitFloorplan2D();
  const view2=$('fpView2D'),view3=$('fpView3D');
  if(view2)view2.onclick=()=>setFloorplanView('2d');
  if(view3)view3.onclick=()=>setFloorplanView('3d');

  const floorMat=$('fp3DFloorMaterial'),wallMat=$('fp3DWallMaterial'),ceiling=$('fp3DShowCeiling');
  if(floorMat)floorMat.onchange=e=>{fp3DOptions.floorMaterialId=e.target.value;refresh3D()};
  if(wallMat)wallMat.onchange=e=>{fp3DOptions.wallMaterialId=e.target.value;refresh3D()};
  if(ceiling)ceiling.onchange=e=>{fp3DOptions.showCeiling=e.target.checked;refresh3D()};

  const tileX=$('fpTileOriginX'),tileY=$('fpTileOriginY'),tileRot=$('fpTileRotation');
  const applyTileOrigin=()=>{
    fp3DOptions.tileOriginX=Number(tileX?.value||0);
    fp3DOptions.tileOriginY=Number(tileY?.value||0);
    fp3DOptions.tileRotation=Number(tileRot?.value||0);
    if(fpRecord)fpRecord.threeDOptions={...fp3DOptions};
    drawFloorplan();
    refresh3D();
  };
  if(tileX)tileX.onchange=applyTileOrigin;
  if(tileY)tileY.onchange=applyTileOrigin;
  if(tileRot)tileRot.onchange=applyTileOrigin;
  const reset3d=$('fp3DResetCamera');if(reset3d)reset3d.onclick=()=>window.ProjectBau3D?.resetCamera();
  const top3d=$('fp3DTopView');if(top3d)top3d.onclick=()=>window.ProjectBau3D?.topView?.();
  const normal3d=$('fp3DNormalView');if(normal3d)normal3d.onclick=()=>window.ProjectBau3D?.normalView?.();
  const wallSelect=$('fpWallViewSelect');if(wallSelect)wallSelect.onchange=()=>{fpWallViewSelectedId=wallSelect.value;if(fpWallView3D)openWallView3D();else drawWallElevation()};
  const wall2d=$('fpWallView2D');if(wall2d)wall2d.onclick=()=>setWallViewKind('2d');
  const wall3d=$('fpWallView3D');if(wall3d)wall3d.onclick=()=>setWallViewKind('3d');
  pbBindTap($('fpWallPdfAll'),generateAllWallsAndFloorPdf);

  const reset2d=$('fp2DReset');
  if(reset2d)reset2d.onclick=()=>{
    fpViewOffsetX=0;fpViewOffsetY=0;fpZoom=1;
    resize2DCanvas();fitFloorplan2D();
  };

  const fitBtn=$('fpFitView');
  if(fitBtn)fitBtn.onclick=()=>{
    if(fp3DMode)window.ProjectBau3D?.fitView?.();
    else fitFloorplan2D();
  };

  const full=$('fpFullscreen');
  if(full)full.onclick=()=>{
    const el=$('floorplanModal');
    if(!document.fullscreenElement)el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const fp2DPdf=$('fp2DPdfButton');
  if(fp2DPdf)fp2DPdf.onclick=generateFloorplan2DPDF;

  const fpPdf=$('fpPdfButton');
  if(fpPdf)fpPdf.onclick=()=>generateDirectPDFReport();
}

function initCadShell(){
  document.querySelectorAll('.cad-nav-item[data-scroll]').forEach(btn=>{
    btn.onclick=()=>{
      const target=document.querySelector(btn.dataset.scroll);
      if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
    };
  });

  const newFp=$('cadNewFloorplan');
  if(newFp)newFp.onclick=createNewFloorplan;

  const pdfBtns=[$('cadPdfReport'),$('cadPdfReportTop')].filter(Boolean);
  pdfBtns.forEach(b=>pbBindTap(b,()=>generateDirectPDFReport()));

  const saveBtn=$('cadSaveProject');
  if(saveBtn)saveBtn.onclick=()=>save();

  const resetBtn=$('cadResetView');
  if(resetBtn)resetBtn.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});

  document.querySelectorAll('[data-add-object]').forEach(btn=>{
    btn.onclick=()=>{
      setFloorTool(btn.dataset.addObject);
    };
  });
}


window.addEventListener('resize',()=>{
  if($('floorplanModal') && !$('floorplanModal').classList.contains('hidden')){
    if(fpViewMode==='wall'&&!fpWallView3D)requestAnimationFrame(drawWallElevation);
    else if(!fp3DMode)requestAnimationFrame(fitFloorplan2D);
  }
});


function initPinchZoom(){
  if(!fpCanvas)return;

  fpCanvas.addEventListener('touchstart',ev=>{
    if(ev.touches.length===2){
      ev.preventDefault();
      beginPinchZoom(ev);
    }
  },{passive:false});

  fpCanvas.addEventListener('touchmove',ev=>{
    if(ev.touches.length===2 && fpPinchState){
      ev.preventDefault();
      updatePinchZoom(ev);
    }
  },{passive:false});

  fpCanvas.addEventListener('touchend',ev=>{
    if(fpPinchState){
      ev.preventDefault();
      endPinchZoom(ev);
    }
  },{passive:false});

  fpCanvas.addEventListener('touchcancel',ev=>{
    if(fpPinchState){
      fpPinchState=null;
    }
  },{passive:false});
}

function initCadKeyboard(){
  document.addEventListener('keydown',e=>{
    if($('floorplanModal')?.classList.contains('hidden'))return;
    const tag=(document.activeElement?.tagName||'').toLowerCase();
    if(['input','textarea','select'].includes(tag))return;

    if(e.key==='Delete'||e.key==='Backspace'){
      e.preventDefault();deleteSelected();return;
    }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='d'){
      e.preventDefault();duplicateSelected();return;
    }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
      e.preventDefault();$('fpUndo')?.click();return;
    }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){
      e.preventDefault();$('fpRedo')?.click();return;
    }

    const o=selectedObject();
    if(o && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();
      const step=e.ctrlKey?1:fpFineStep;
      pushHistory();
      const dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;
      const dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
      if(o.type==='wall'){
        o.x1+=dx;o.x2+=dx;o.y1+=dy;o.y2+=dy;
      }else{
        const placed=constrainObjectPlacement(o,(o.x||0)+dx,(o.y||0)+dy);
        o.x=placed.x;o.y=placed.y;o.rotation=placed.rotation;
      }
      drawFloorplan();updateSelectedInfo();
    }
  });
}


function touchDistance(t1,t2){
  return Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
}
function touchMidpoint(t1,t2){
  return {
    x:(t1.clientX+t2.clientX)/2,
    y:(t1.clientY+t2.clientY)/2
  };
}
function screenToWorldFromClient(clientX,clientY){
  const r=fpCanvas.getBoundingClientRect();
  const canvasX=(clientX-r.left)*(fpCanvas.width/r.width);
  const canvasY=(clientY-r.top)*(fpCanvas.height/r.height);
  return {
    x:(canvasX-fpViewOffsetX)/fpZoom,
    y:(canvasY-fpViewOffsetY)/fpZoom,
    canvasX,canvasY
  };
}
function beginPinchZoom(ev){
  if(ev.touches.length!==2)return false;
  const t1=ev.touches[0],t2=ev.touches[1];
  const mid=touchMidpoint(t1,t2);
  const world=screenToWorldFromClient(mid.x,mid.y);

  fpPinchState={
    startDistance:touchDistance(t1,t2),
    startZoom:fpZoom,
    worldX:world.x,
    worldY:world.y
  };
  fpDrawing=false;
  fpDragOffset=null;
  fpObjectRotateDrag=null;
  return true;
}
function updatePinchZoom(ev){
  if(!fpPinchState || ev.touches.length!==2)return false;

  const t1=ev.touches[0],t2=ev.touches[1];
  const currentDistance=touchDistance(t1,t2);
  const ratio=currentDistance/Math.max(1,fpPinchState.startDistance);

  const newZoom=Math.max(.05,Math.min(8,fpPinchState.startZoom*ratio));
  const mid=touchMidpoint(t1,t2);
  const r=fpCanvas.getBoundingClientRect();
  const canvasX=(mid.x-r.left)*(fpCanvas.width/r.width);
  const canvasY=(mid.y-r.top)*(fpCanvas.height/r.height);

  fpZoom=newZoom;

  // Keep the world point under the midpoint of the two fingers.
  fpViewOffsetX=canvasX-fpPinchState.worldX*fpZoom;
  fpViewOffsetY=canvasY-fpPinchState.worldY*fpZoom;

  const z=$('fpZoomReset');
  if(z)z.textContent=`${Math.round(fpZoom*100)}%`;

  drawFloorplan();
  return true;
}
function endPinchZoom(ev){
  if(!fpPinchState)return;
  if(!ev.touches || ev.touches.length<2){
    fpPinchState=null;
  }
}

function initFloorplanCanvas(){
  if(!fpCanvas)return;

  fpCanvas.style.touchAction='none';
  fpCanvas.style.pointerEvents='auto';

  let activePointer=null;

  const down=e=>{
    if(fp3DMode)return;
    if(e.pointerType==='mouse' && e.button!==0)return;
    activePointer=e.pointerId;
    try{fpCanvas.setPointerCapture(e.pointerId)}catch(_){}
    e.preventDefault();
    floorStart(e);
  };
  const move=e=>{
    if(fp3DMode)return;
    if(activePointer!==null && e.pointerId!==activePointer)return;
    if(fpDrawing){e.preventDefault();floorMove(e)}
  };
  const finish=e=>{
    if(activePointer!==null && e.pointerId!==activePointer)return;
    if(fpDrawing||fpWallMoveHold.wallId||fpDraggingFloorTileOrigin){
      e.preventDefault();
      floorEnd(e);
    }
    try{fpCanvas.releasePointerCapture(e.pointerId)}catch(_){}
    activePointer=null;
  };

  fpCanvas.onpointerdown=down;
  fpCanvas.onpointermove=move;
  fpCanvas.onpointerup=finish;
  fpCanvas.onpointercancel=finish;
}

function pbSafeInit(name,fn){
  try{fn?.()}catch(err){console.error(`Projekt Bau Init: ${name}`,err)}
}

pbSafeInit('CAD Shell',initCadShell);
pbSafeInit('Tile Tools',initTileTools);
pbSafeInit('Tablet CAD',initTabletCadUi);
pbSafeInit('Floorplan Controls',initFloorplanControls);
pbSafeInit('Floorplan Canvas',initFloorplanCanvas);
pbSafeInit('Pinch Zoom',initPinchZoom);
pbSafeInit('CAD Keyboard',initCadKeyboard);

// Always render saved projects, even if an optional CAD control fails.
try{render()}catch(err){console.error('Projekt Bau Initial Render',err)}

// A second render after DOM/layout settlement fixes browsers that restore storage late.
setTimeout(()=>{try{render()}catch(err){console.error('Projekt Bau Delayed Render',err)}},60);


/* v1.9.2 ---------------------------------------------------------------
   Türhöhe + automatische Eigenschaften + Flächenabzüge
------------------------------------------------------------------------ */
function fpV192EnsureDoorDefaults(o){
  if(!o || o.type!=='door') return;
  if(!Number.isFinite(Number(o.heightCm))) o.heightCm=205;
  if(!Number.isFinite(Number(o.widthCm))) o.widthCm=90;
  if(!Number.isFinite(Number(o.width))) o.width=90;
  if(o.openingSide!=='inside'&&o.openingSide!=='outside')o.openingSide='inside';
  if(o.wallFace!=='inside'&&o.wallFace!=='outside')o.wallFace='inside';
}

function fpV192DoorHeightField(o){
  const host=document.querySelector('#fpPropertiesPanel, .fp-properties, .properties-panel, #propertiesPanel');
  if(!host) return;
  let box=document.getElementById('fpDoorProfessionalFields');
  if(!o || o.type!=='door'){
    if(box) box.remove();
    return;
  }
  fpV192EnsureDoorDefaults(o);
  if(!box){
    box=document.createElement('section');
    box.id='fpDoorProfessionalFields';
    box.className='fp-v192-door-fields';
    box.innerHTML=`
      <h4>TÜR</h4>
      <label>Türhöhe (cm)
        <input id="fpDoorHeightCm" type="number" min="50" max="400" step="1">
      </label>
      <small>Die Türhöhe wird in 2D/3D und bei der Wand-Flächenberechnung berücksichtigt.</small>`;
    host.appendChild(box);
  }
  const inp=document.getElementById('fpDoorHeightCm');
  if(inp){
    inp.value=Math.round(Number(o.heightCm)||200);
    inp.onchange=()=>{
      const cur=selectedObject();
      if(!cur || cur.type!=='door') return;
      pushHistory();
      cur.heightCm=Math.max(50,Math.min(400,Number(inp.value)||200));
      save();
      drawFloorplan();
      updateWallQuickPanel?.();
      if(fp3DMode) refresh3D();
    };
  }
}

function fpV192AutoShowProperties(o){
  // Auswahl soll die Eigenschaften ohne zusätzlichen Klick sichtbar machen.
  const candidates=[
    document.querySelector('#fpPropertiesPanel'),
    document.querySelector('.fp-properties'),
    document.querySelector('.properties-panel'),
    document.querySelector('#propertiesPanel')
  ].filter(Boolean);
  candidates.forEach(el=>{
    el.classList.remove('hidden','collapsed','is-collapsed');
    el.style.display='';
  });
  fpV192DoorHeightField(o);
}

function fpV192OpeningAreaM2(o){
  if(!o) return 0;
  const w=Math.max(0,Number(o.width)||Number(o.widthCm)||0);
  const h=Math.max(0,Number(o.heightCm)||Number(o.height)||0);
  return (w*h)/10000;
}

function fpV192BathFootprintM2(o){
  if(!o || !['bathtub','bath','badewanne'].includes(String(o.type||'').toLowerCase())) return 0;
  const w=Math.max(0,Number(o.width)||Number(o.widthCm)||0);
  const d=Math.max(0,Number(o.depth)||Number(o.depthCm)||Number(o.height)||0);
  return (w*d)/10000;
}

function fpV192CalculatedAreas(){
  const objects=(typeof fpObjects!=='undefined' && Array.isArray(fpObjects)) ? fpObjects :
                (typeof currentFloorplan==='function' && currentFloorplan()?.objects)||[];
  let doorWallDeduction=0, bathFloorDeduction=0;
  objects.forEach(o=>{
    if(o?.type==='door') doorWallDeduction += fpV192OpeningAreaM2(o);
    bathFloorDeduction += fpV192BathFootprintM2(o);
  });
  return {doorWallDeduction,bathFloorDeduction};
}

document.addEventListener('click',(ev)=>{
  const workspace=ev.target.closest?.('#fpCanvas, #floorplanCanvas, .fp-canvas-wrap, .floorplan-canvas, canvas, svg');
  if(workspace){
    setTimeout(()=>{
      const o=typeof selectedObject==='function'?selectedObject():null;
      if(o) fpV192AutoShowProperties(o);
    },0);
  }
},true);


(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmt=(v,d=2)=>{try{return new Intl.NumberFormat('de-CH',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(v)||0)}catch(_){return (Number(v)||0).toFixed(d)}};

function renderMaterials(){
  const host=$('fpProMaterialTable');if(!host)return;
  let r=null;try{r=window.ProjectBauAbdichtung?.analyze?.()}catch(_){}
  const rows=(r?.materials||[]).filter(x=>Number(x.qty)>0);
  if(!rows.length){host.innerHTML='<div class="pro-detail-empty" style="padding:16px">Noch keine Materialberechnung.</div>';return}
  host.innerHTML=`<table class="pro-material-grid"><thead><tr><th>Pos.</th><th>Material</th><th>Hersteller</th><th>Menge</th><th>Einheit</th><th>Gebinde</th><th>Bedarf</th><th>Hinweis</th></tr></thead><tbody>`+
  rows.map((x,i)=>`<tr class="${/Gefällsdichtecke|Dichtflansch|Duschrinne/i.test(x.name)?'row-special':''}"><td>${i+1}</td><td><strong>${esc(x.name)}</strong></td><td>${esc(x.brand||'Weber')}</td><td>${fmt(x.qty,x.unit==='St.'?0:2)}</td><td>${esc(x.unit||'')}</td><td>${esc(x.pack||'')}</td><td>${Number(x.packs)||0}</td><td>${hint(x.name)}</td></tr>`).join('')+
  `</tbody></table>`;
}
function hint(n){n=String(n||'');if(/grund/i.test(n))return'Grundierung';if(/DB 120|Dichtband/i.test(n))return'Anschluss- und Fugenband';if(/DEC innen/i.test(n))return'Innenecken';if(/DEC aussen/i.test(n))return'Aussenecken';if(/DEG|Gefällsdichtecke/i.test(n))return'Gefälle-/Wandanschluss';if(/DM 150/i.test(n))return'Manschette';if(/Dichtflansch/i.test(n))return'Bodengleiche Dusche';if(/Duschrinne/i.test(n))return'Rinnenablauf';return''}

function renderSummary(){
  const host=$('fpProAutoSealSummary');if(!host)return;
  let r=null;try{r=window.ProjectBauAbdichtung?.analyze?.()}catch(_){}
  if(!r){host.innerHTML='<div class="pro-detail-empty">Keine Berechnung.</div>';return}
  const values=[
    ['Abdichtung Bodenfläche',`${fmt(r.floorArea)} m²`],
    ['Abdichtung Wandfläche',`${fmt(r.wallArea)} m²`],
    ['Dichtband gesamt',`${fmt(r.tapeTotal||0)} m`],
    ['Innenecken (DEC innen)',`${r.corners?.inner||0} St.`],
    ['Aussenecken (DEC aussen)',`${r.corners?.outer||0} St.`],
    ['Gefällsdichtecken (DEG)',`${r.slopeCorners?.count||0} St.`],
    ['Manschetten',`${(r.penetrations?.floor||0)+(r.penetrations?.wall||0)} St.`],
    ['Nischen',`${r.openings?.nicheCount||0} St.`]
  ];
  host.innerHTML=values.map(v=>`<div class="pro-auto-kpi"><span>${v[0]}</span><strong>${v[1]}</strong></div>`).join('');
}
function renderDetail(){
  const title=$('fpProDetailTitle'),host=$('fpProDetailContent');if(!title||!host)return;
  const o=typeof selectedObject==='function'?selectedObject():null;
  if(!o){title.textContent='DETAIL';host.innerHTML='<div class="pro-detail-empty">Nische oder bodengleiche Dusche auswählen.</div>';return}
  if(o.type==='niche'){
    const w=Number(o.widthCm)||60,h=Number(o.heightCm)||40,d=Number(o.depthCm)||10,p=2*(w+h)/100;
    title.textContent=`NISCHE · ${Math.round(w)} × ${Math.round(h)} × ${Math.round(d)} cm`;
    host.innerHTML=`<div class="pro-niche-detail"><div class="pro-niche-diagram"></div><div>
      <div class="pro-detail-row"><span>Dichtband innen</span><strong>${fmt(p)} m</strong></div>
      <div class="pro-detail-row"><span>Dichtband aussen</span><strong>${fmt(p)} m</strong></div>
      <div class="pro-detail-row"><span>Innenecken (DEC innen)</span><strong>4 St.</strong></div>
      <div class="pro-detail-row"><span>Aussenecken (DEC aussen)</span><strong>4 St.</strong></div>
      <div class="pro-detail-total"><strong>Dichtband Nische gesamt</strong><br>${fmt(p*2)} m</div>
    </div></div>`;return;
  }
  if(o.type==='walkInShower'){
    title.textContent='BODENGLEICHE DUSCHE';
    host.innerHTML=`<div class="pro-detail-row"><span>Breite</span><strong>${Math.round(Number(o.widthCm)||100)} cm</strong></div>
    <div class="pro-detail-row"><span>Tiefe</span><strong>${Math.round(Number(o.depthCm)||100)} cm</strong></div>
    <div class="pro-detail-row"><span>Gefälle</span><strong>${fmt(Number(o.slopePct)||2,1)} %</strong></div>
    <div class="pro-detail-row"><span>Rinnenlänge</span><strong>${Math.round(Number(o.channelLengthCm)||Number(o.widthCm)||90)} cm</strong></div>`;return;
  }
  title.textContent='DETAIL';host.innerHTML=`<div class="pro-detail-row"><span>Objekt</span><strong>${esc(o.type||'')}</strong></div>`;
}
function refresh(){renderMaterials();renderSummary();renderDetail()}
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelector('[data-mode="2d"]')?.addEventListener('click',()=>setFloorplanView?.('2d'));
  document.querySelector('[data-mode="3d"]')?.addEventListener('click',()=>setFloorplanView?.('3d'));
  document.querySelector('[data-mode="wall"]')?.addEventListener('click',()=>setFloorplanView?.('wall'));
  $('fpHeader3D')?.addEventListener('click',()=>setFloorplanView?.('3d'));
  $('fpSavePrimary')?.addEventListener('click',()=>window.ProjectBauPro?.save?.());
  $('fpUndoHeader')?.addEventListener('click',()=>typeof undoFloorplan==='function'&&undoFloorplan());
  $('fpRedoHeader')?.addEventListener('click',()=>typeof redoFloorplan==='function'&&redoFloorplan());
  $('fpProMaterialPdf')?.addEventListener('click',()=>window.ProjectBauAbdichtung?.exportMaterialPdf?.());
  $('fpAbdichtungToolTop')?.addEventListener('click',()=>window.ProjectBauAbdichtung?.open?.());
  document.addEventListener('click',()=>setTimeout(refresh,120),true);
  document.addEventListener('change',()=>setTimeout(refresh,120),true);
  setInterval(refresh,1600);setTimeout(refresh,500);
});

/* v2.9.49 – Samsung/Android universal button activation.
   Converts a clean finger/pen release into one deterministic click without
   interfering with scrolling, inputs, selects, checkboxes or the CAD canvas. */
(()=>{
  let start=null;const activated=new WeakMap();
  const buttonFrom=target=>target?.closest?.('button,[role="button"]');
  document.addEventListener('pointerdown',ev=>{
    if(ev.pointerType!=='touch'&&ev.pointerType!=='pen')return;
    const button=buttonFrom(ev.target);start=button?{button,x:ev.clientX,y:ev.clientY,moved:false}:null;
  },true);
  document.addEventListener('pointermove',ev=>{
    if(!start)return;if(Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>12)start.moved=true;
  },true);
  document.addEventListener('pointercancel',()=>{start=null},true);
  document.addEventListener('pointerup',ev=>{
    if(!start)return;const state=start;start=null;
    const button=buttonFrom(ev.target);if(state.moved||!button||button!==state.button||button.disabled)return;
    const last=activated.get(button)||0;if(Date.now()-last<650)return;activated.set(button,Date.now());
    ev.preventDefault();ev.stopPropagation();button.click();
  },{capture:true,passive:false});
})();

/* Projekt Bau 2.9.54: non-destructive ERP navigation shell. */
(()=>{
  const ready=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn();
  ready(()=>{
    const workspace=document.getElementById('pbModuleWorkspace');
    const nav=[...document.querySelectorAll('.cad-nav-item')];
    const activate=btn=>{nav.forEach(x=>x.classList.toggle('active',x===btn));};
    const roadmap={
      Rechnungen:'Für Swiss QR-Rechnung, Zahlteil/PDF und sicheren E-Mail-Versand vorbereitet.',
      Hilfe:'Projekt Bau 2.9.54 PRO CLEAN · Lokale Daten, OneDrive, PDF, Aufmass sowie 2D/3D CAD bleiben unverändert verfügbar.'
    };
    document.querySelectorAll('.cad-nav-item[data-module]').forEach(btn=>btn.addEventListener('click',()=>{
      activate(btn);
      const name=btn.dataset.module;
      workspace.innerHTML=`<div class="pb-module-head"><div><span class="eyebrow">MODUL</span><h2>${name}</h2></div><button type="button" class="secondary" data-close-module>Schliessen</button></div><div class="pb-module-empty"><div class="pb-module-symbol">${btn.querySelector('.nav-icon')?.textContent||'•'}</div><h3>${name}</h3><p>${roadmap[name]||'Dieses Modul ist in der neuen Navigation vorbereitet und wird in einer kommenden Ausbaustufe mit den bestehenden Projektdaten verbunden.'}</p><small>Es wurden keine bestehenden Daten oder Funktionen verändert.</small></div>`;
      workspace.classList.remove('hidden');
      workspace.scrollIntoView({behavior:'smooth',block:'start'});
      workspace.querySelector('[data-close-module]').onclick=()=>workspace.classList.add('hidden');
    }));
    document.querySelectorAll('.cad-nav-item[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
      activate(btn); workspace?.classList.add('hidden');
    }));

    const search=document.getElementById('pbGlobalSearch');
    if(search) search.addEventListener('input',()=>{
      const q=search.value.trim().toLocaleLowerCase('de-CH');
      const projectHost=document.getElementById('projects');
      if(projectHost) [...projectHost.children].forEach(row=>row.hidden=!!q&&!row.textContent.toLocaleLowerCase('de-CH').includes(q));
      nav.forEach(item=>item.classList.toggle('pb-search-match',!!q&&item.textContent.toLocaleLowerCase('de-CH').includes(q)));
    });

    const host=document.getElementById('projects');
    if(host&&host.parentElement&&!document.getElementById('pbProjectTools')){
      const tools=document.createElement('div');
      tools.id='pbProjectTools'; tools.className='pb-list-tools';
      tools.innerHTML='<label>Filtern <input id="pbProjectFilter" type="search" placeholder="Projekt oder Kunde"></label><label>Sortieren <select id="pbProjectSort"><option value="default">Standard</option><option value="az">A–Z</option><option value="za">Z–A</option></select></label><span class="pb-list-hint">Schnellzugriff auf bestehende Projektdaten</span>';
      host.parentElement.insertBefore(tools,host);
      document.getElementById('pbProjectFilter').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase('de-CH');[...host.children].forEach(x=>x.hidden=!!q&&!x.textContent.toLocaleLowerCase('de-CH').includes(q));});
      document.getElementById('pbProjectSort').addEventListener('change',e=>{if(e.target.value==='default')return;[...host.children].sort((a,b)=>a.textContent.localeCompare(b.textContent,'de-CH')*(e.target.value==='za'?-1:1)).forEach(x=>host.appendChild(x));});
    }
  });
})();
window.ProjectBauProLayout={refresh};
})();


/* v2.7.0 layout regression fix */
(()=>{
  const byId=id=>document.getElementById(id);
  function toggleMaterialDrawer(force){
    const drawer=byId('fpProLowerWorkspace');
    if(!drawer)return;
    const open=typeof force==='boolean'?force:drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden',!open);
    if(open){
      try{window.ProjectBauProLayout?.refresh?.()}catch(_){ }
    }
    requestAnimationFrame(()=>{
      try{if(!fp3DMode)fitFloorplan2D?.();else window.ProjectBau3D?.fitView?.()}catch(_){ }
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    byId('fpHeaderMaterials')?.addEventListener('click',()=>toggleMaterialDrawer());
    byId('fpProDetailCollapse')?.addEventListener('click',()=>toggleMaterialDrawer(false));
    // The material drawer must never be open on initial CAD load.
    byId('fpProLowerWorkspace')?.classList.add('hidden');
    // Re-fit after fonts/layout have settled.
    setTimeout(()=>{try{fitFloorplan2D?.()}catch(_){ }},250);
    setTimeout(()=>{try{fitFloorplan2D?.()}catch(_){ }},850);
  });
  window.ProjectBauMaterialDrawer={open:()=>toggleMaterialDrawer(true),close:()=>toggleMaterialDrawer(false),toggle:()=>toggleMaterialDrawer()};
})();



/* v2.7.2 – non-destructive project recovery */
window.ProjectBauRecovery={
  scan(){
    return pbScanAllStates().map(x=>({
      storage:x.storage,
      key:x.key,
      projects:x.projects
    }));
  },
  recover(){
    const merged=pbMergedRecoveryState();
    if(!merged.projects.length)return 0;
    S=merged;
    A=null;
    try{localStorage.setItem(K3,JSON.stringify(S))}catch(_){}
    render();
    return merged.projects.length;
  }
};


document.addEventListener('DOMContentLoaded',()=>{
  const recoverBtn=document.getElementById('pbRecoverProjects');
  const status=document.getElementById('pbRecoveryStatus');

  if(status){
    const states=window.ProjectBauRecovery?.scan?.()||[];
    const total=states.reduce((n,x)=>n+(Number(x.projects)||0),0);
    status.textContent=states.length
      ? `${states.length} lokale Datenquelle(n) erkannt · ${total} Projektkopien`
      : 'Keine weitere lokale Projektdatenquelle erkannt.';
  }

  if(recoverBtn){
    recoverBtn.addEventListener('click',()=>{
      const count=window.ProjectBauRecovery?.recover?.()||0;
      if(status)status.textContent=count
        ? `${count} Projekt(e) wiederhergestellt.`
        : 'Keine wiederherstellbaren Projekte gefunden.';
      if(count)alert(`${count} Projekt(e) wurden aus den lokalen Browserdaten wiederhergestellt.`);
    });
  }
});


/* v2.7.6 – resilient CAD controls */
(()=>{
  let delegated=false;
  function installDelegation(){
    if(delegated)return;delegated=true;
    let lastActionAt=0,lastActionKey='';
    const routeCadAction=ev=>{
      if(ev.type==='pointerup'&&ev.pointerType==='mouse')return;
      const target=ev.target.closest?.('button,[data-add-object],[data-tool]');
      if(!target)return;
      const actionKey=target.id||target.dataset?.mode||target.dataset?.tool||target.dataset?.addObject||target.textContent?.trim();
      const now=Date.now();if(actionKey===lastActionKey&&now-lastActionAt<500)return;lastActionKey=actionKey;lastActionAt=now;

      if(target.id==='fp2DPdfButton'){
        ev.preventDefault();ev.stopPropagation();
        try{generateFloorplan2DPDF()}catch(err){console.error('2D PDF',err);alert('2D PDF konnte nicht erstellt werden.');}
        return;
      }
      if(target.id==='fpHomeButton'){
        ev.preventDefault();ev.stopPropagation();
        try{saveFloorplanAndGoHome()}catch(err){console.error('Home',err);alert('Grundriss konnte nicht gespeichert werden.');}
        return;
      }
      if(target.id==='fpSavePrimary'){
        ev.preventDefault();ev.stopPropagation();
        try{
          if(fpRecord)saveCurrentFloorplan({reason:'manual'});
          else window.ProjectBauPro?.save?.()||save();
        }catch(err){console.error('Speichern',err)}
        return;
      }
      if(target.dataset?.addObject){
        ev.preventDefault();
        try{setFloorTool(target.dataset.addObject)}catch(err){console.error('Objektwerkzeug',err)}
        return;
      }
      if(target.classList?.contains('fp-tool')&&target.dataset?.tool){
        ev.preventDefault();
        try{setFloorTool(target.dataset.tool)}catch(err){console.error('CAD Werkzeug',err)}
        return;
      }
      if(target.matches?.('[data-mode="2d"]')){
        ev.preventDefault();try{setFloorplanView('2d')}catch(err){console.error(err)};return;
      }
      if(target.matches?.('[data-mode="3d"]')||target.id==='fpHeader3D'){
        ev.preventDefault();try{setFloorplanView('3d')}catch(err){console.error(err)};return;
      }
      if(target.matches?.('[data-mode="wall"]')){
        ev.preventDefault();ev.stopPropagation();try{setFloorplanView('wall')}catch(err){console.error('Wandansicht',err)};return;
      }
      if(target.id==='fpAbdichtungToolTop'){
        ev.preventDefault();try{window.ProjectBauAbdichtung?.open?.()}catch(err){console.error(err)};return;
      }
      if(target.id==='fpModeFliesen'||target.id==='fpHeaderMaterials'){
        ev.preventDefault();ev.stopPropagation();try{window.ProjectBauMaterialDrawer?.open?.()}catch(err){console.error('Fliesen',err)};return;
      }
      if(target.id==='fpModeSanitaer'){
        ev.preventDefault();ev.stopPropagation();try{
          setFloorplanView('2d');fpActiveLayer='sanitary';if(fpRecord)fpRecord.activeLayer='sanitary';
          const layer=document.getElementById('fpActiveLayer');if(layer)layer.value='sanitary';
          setFloorTool('select');drawFloorplan();
        }catch(err){console.error('Sanitär',err)};return;
      }
      if(target.id==='fpPhotoDocOpen'){
        ev.preventDefault();ev.stopPropagation();try{window.ProjectBauPhotoEditor?.open?.()}catch(err){console.error('Fotodokumentation',err)};return;
      }
    };
    document.addEventListener('click',routeCadAction,true);
    document.addEventListener('pointerup',routeCadAction,{capture:true,passive:false});
    document.addEventListener('touchend',routeCadAction,{capture:true,passive:false});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDelegation,{once:true});
  else installDelegation();

  // Ensure project cards are present on first paint and after bfcache restore.
  const rerender=()=>{try{if(Array.isArray(S?.projects))render()}catch(err){console.error('Project list render',err)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(rerender,0),{once:true});
  else setTimeout(rerender,0);
  window.addEventListener('pageshow',()=>setTimeout(rerender,20));
})();





/* v2.9.1 – authoritative runtime version stamp */
(()=>{
  const VERSION='2.9.54 PRO CLEAN';
  function stampVersion(){
    document.querySelectorAll(
      '.cad-sidebar-footer strong,.pro-version,[data-app-version],#appVersion,.app-version'
    ).forEach(el=>{
      if(el)el.textContent=el.classList?.contains('pro-version') ? `v${VERSION}` : `Version ${VERSION}`;
    });
    document.documentElement.dataset.projektBauVersion=VERSION;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stampVersion);
  else stampVersion();
  setTimeout(stampVersion,250);
})();

document.addEventListener('DOMContentLoaded',()=>{
  const home=document.getElementById('fpHomeButton');
  if(home){
    home.addEventListener('touchend',ev=>{
      ev.preventDefault();
      ev.stopPropagation();
      saveFloorplanAndGoHome();
    },{passive:false});
  }
});


/* v2.9.1 – safety autosave */
(()=>{
  let lastAutoSave=0;
  const safeAutoSave=()=>{
    if(!fpRecord)return;
    const now=Date.now();
    if(now-lastAutoSave<800)return;
    lastAutoSave=now;
    try{saveCurrentFloorplan({reason:'lifecycle'})}catch(e){console.error('AutoSave lifecycle',e)}
  };

  window.addEventListener('pagehide',safeAutoSave);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')safeAutoSave();
  });
})();


/* === v2.9.43 Object Properties Editor === */
let fpPropertyObjectId = null;

function fpNum(v, fallback=0){
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}
function fpObjectBounds(o){
  if(!o) return {w:0,h:0};
  if(o.type==='wall') return {
    w:Math.abs(fpNum(o.x2)-fpNum(o.x1)),
    h:Math.abs(fpNum(o.y2)-fpNum(o.y1))
  };
  return {
    w:fpNum(o.w ?? o.width ?? o.breite, 60),
    h:fpNum(o.h ?? o.depth ?? o.tiefe, 60)
  };
}

function fpDistanceRayHit(origin,dir,ignoreWallId=null){
  let best=null;

  for(const w of (fpObjects||[])){
    if(!w||w.type!=='wall'||(ignoreWallId&&w.id===ignoreWallId))continue;

    const f=fpInnerWallFace2927(w);

    // Use true inner face, including a modest miter extension so a ray close
    // to a corner still terminates on the architectural room boundary.
    const dx=Number(f.b.x)-Number(f.a.x);
    const dy=Number(f.b.y)-Number(f.a.y);
    const L=Math.hypot(dx,dy)||1;
    const ux=dx/L,uy=dy/L;
    const t=Math.max(0,Number(w.thickness||fpWallThickness||15));

    const effectiveWall={
      x1:Number(f.a.x)-ux*t,
      y1:Number(f.a.y)-uy*t,
      x2:Number(f.b.x)+ux*t,
      y2:Number(f.b.y)+uy*t,
      id:w.id,
      type:'wall',
      sourceWall:w
    };

    const hit=fpRaySegmentIntersection(origin,dir,effectiveWall);
    if(hit&&hit.distance>=-0.001&&(!best||hit.distance<best.distance)){
      hit.wall=w;
      hit.innerFace=true;
      best=hit;
    }
  }
  return best;
}

function fpObjectFourWallDistances(o){
  if(!o || o.type==='wall' || o.type==='text')return null;

  const dims=fpCollisionObjectDims?.(o) || {
    w:Math.max(1,Number(o.widthCm||60)),
    d:Math.max(1,Number(o.depthCm||60))
  };
  const r=(Number(o.rotation)||0)*Math.PI/180;

  // Local object axes:
  // ux = left/right axis, vy = back direction. Front is -vy.
  const ux={x:Math.cos(r),y:Math.sin(r)};
  const vy={x:-Math.sin(r),y:Math.cos(r)};
  const center={x:Number(o.x)||0,y:Number(o.y)||0};

  const edge={
    left:{x:center.x-ux.x*dims.w/2,y:center.y-ux.y*dims.w/2},
    right:{x:center.x+ux.x*dims.w/2,y:center.y+ux.y*dims.w/2},
    front:{x:center.x-vy.x*dims.d/2,y:center.y-vy.y*dims.d/2},
    back:{x:center.x+vy.x*dims.d/2,y:center.y+vy.y*dims.d/2}
  };

  const hit={
    left:fpDistanceRayHit(edge.left,{x:-ux.x,y:-ux.y}),
    right:fpDistanceRayHit(edge.right,ux),
    front:fpDistanceRayHit(edge.front,{x:-vy.x,y:-vy.y}),
    back:fpDistanceRayHit(edge.back,vy)
  };

  return {center,dims,ux,vy,edge,hit};
}

function fpRefreshPropertyDistances(o){
  if(!o)return;
  const d=fpObjectFourWallDistances(o);
  if(!d)return;

  const set=(id,hit)=>{
    const el=document.getElementById(id);
    if(!el)return;
    const value=hit ? Math.max(0,Math.round(hit.distance*10)/10) : '';
    el.value=value;
  };

  set('fp-prop-left',d.hit.left);
  set('fp-prop-right',d.hit.right);
  set('fp-prop-front',d.hit.front);
  set('fp-prop-back',d.hit.back);

  o.distanceLeftCm=d.hit.left?Math.max(0,d.hit.left.distance):null;
  o.distanceRightCm=d.hit.right?Math.max(0,d.hit.right.distance):null;
  o.distanceFrontCm=d.hit.front?Math.max(0,d.hit.front.distance):null;
  o.distanceBackCm=d.hit.back?Math.max(0,d.hit.back.distance):null;
}

function fpMoveObjectToWallDistance(o,side,targetCm){
  if(!o || o.type==='wall')return false;
  const d=fpObjectFourWallDistances(o);
  if(!d)return false;

  const hit=d.hit[side];
  if(!hit)return false;

  const current=Math.max(0,Number(hit.distance)||0);
  const target=Math.max(0,Number(targetCm)||0);
  const delta=target-current;

  let vx=0,vy=0;
  if(side==='left'){vx=d.ux.x;vy=d.ux.y;}
  else if(side==='right'){vx=-d.ux.x;vy=-d.ux.y;}
  else if(side==='front'){vx=d.vy.x;vy=d.vy.y;}
  else if(side==='back'){vx=-d.vy.x;vy=-d.vy.y;}
  else return false;

  const ox=Number(o.x)||0,oy=Number(o.y)||0;
  const desiredX=ox+vx*delta;
  const desiredY=oy+vy*delta;

  // Hard-wall-stop remains authoritative. If target tries to push through
  // another wall, movement stops at 0 cm automatically.
  const stopped=fpHardStopObjectAgainstWalls(o,desiredX,desiredY,ox,oy);
  o.x=stopped.x;
  o.y=stopped.y;

  // Final numerical correction for an explicit 0 cm request.
  // Re-read the actual edge->inner-face distance and remove any residual.
  if(target<=0.001){
    const after=fpObjectFourWallDistances(o);
    const ah=after?.hit?.[side];
    if(ah && ah.distance>0.0001){
      const residual=Math.max(0,Number(ah.distance)||0);
      if(side==='left'){o.x+=after.ux.x*residual;o.y+=after.ux.y*residual;}
      else if(side==='right'){o.x-=after.ux.x*residual;o.y-=after.ux.y*residual;}
      else if(side==='front'){o.x+=after.vy.x*residual;o.y+=after.vy.y*residual;}
      else if(side==='back'){o.x-=after.vy.x*residual;o.y-=after.vy.y*residual;}
    }
  }

  o._wallContact=!!stopped.hit || target<=0.001;
  o._showSideDimensions=true;

  fpRefreshPropertyDistances(o);
  try{drawFloorplan();}catch(_){}
  try{updateSelectedInfo();}catch(_){}
  return true;
}

function fpBindDistanceDragControls(){
  const panel=document.getElementById('fp-object-properties');
  if(!panel || panel.dataset.distanceDragBound==='1')return;
  panel.dataset.distanceDragBound='1';

  panel.querySelectorAll('.fp-distance-drag').forEach(input=>{
    let drag=null;

    input.addEventListener('pointerdown',ev=>{
      if(ev.pointerType==='mouse' && ev.button!==0)return;
      const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
      if(!o)return;

      drag={
        pointerId:ev.pointerId,
        startX:ev.clientX,
        startValue:Math.max(0,fpNum(input.value,0)),
        side:input.dataset.distanceSide,
        historyPushed:false
      };
      try{input.setPointerCapture(ev.pointerId)}catch(_){}
      input.classList.add('dragging');
      ev.preventDefault();
    });

    input.addEventListener('pointermove',ev=>{
      if(!drag || ev.pointerId!==drag.pointerId)return;
      const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
      if(!o)return;

      if(!drag.historyPushed){
        try{pushHistory?.()}catch(_){}
        drag.historyPushed=true;
      }

      // 4 screen pixels = 1 cm gives accurate tablet control.
      const deltaCm=(ev.clientX-drag.startX)/4;
      const value=Math.max(0,Math.round((drag.startValue+deltaCm)*10)/10);
      input.value=value;
      fpMoveObjectToWallDistance(o,drag.side,value);
      ev.preventDefault();
    });

    const finish=ev=>{
      if(!drag)return;
      try{input.releasePointerCapture(drag.pointerId)}catch(_){}
      input.classList.remove('dragging');
      drag=null;
      try{save?.()}catch(_){}
    };
    input.addEventListener('pointerup',finish);
    input.addEventListener('pointercancel',finish);

    // Manual numeric entry remains supported.
    input.addEventListener('change',()=>{
      const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
      if(!o)return;
      try{pushHistory?.()}catch(_){}
      fpMoveObjectToWallDistance(o,input.dataset.distanceSide,fpNum(input.value,0));
      try{save?.()}catch(_){}
    });
  });
}


/* === v2.9.43 UNIVERSAL HEIGHT ABOVE FLOOR === */
function fpLegacyFloorHeight(o){
  if(!o)return 0;
  if(Number.isFinite(Number(o.floorHeightCm)))return Math.max(0,Number(o.floorHeightCm));
  if(o.type==='window' && Number.isFinite(Number(o.sillHeightCm)))return Math.max(0,Number(o.sillHeightCm));
  if((o.type==='mirror'||o.type==='niche') && Number.isFinite(Number(o.mountHeightCm)))return Math.max(0,Number(o.mountHeightCm));
  if(Number.isFinite(Number(o.z)))return Math.max(0,Number(o.z));
  return 0;
}
function fpSetUniversalFloorHeight(o,value){
  if(!o||o.type==='wall'||o.type==='text')return;
  const v=Math.max(0,Math.round((Number(value)||0)*10)/10);
  o.floorHeightCm=v;
  o.z=v; // compatibility

  // Keep old specialized renderers/data fields synchronized.
  if(o.type==='window')o.sillHeightCm=v;
  if(o.type==='mirror'||o.type==='niche')o.mountHeightCm=v;
}
function fpNormalizeUniversalFloorHeights(){
  for(const o of (fpObjects||[])){
    if(!o||o.type==='wall'||o.type==='text')continue;
    fpSetUniversalFloorHeight(o,fpLegacyFloorHeight(o));
  }
}

function fpBindFloorHeightDrag(){
  const input=document.getElementById('fp-prop-floorheight');
  if(!input || input.dataset.heightDragBound==='1')return;
  input.dataset.heightDragBound='1';
  let drag=null;

  input.addEventListener('pointerdown',ev=>{
    if(ev.pointerType==='mouse'&&ev.button!==0)return;
    const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
    if(!o)return;
    drag={
      id:ev.pointerId,startX:ev.clientX,
      startValue:fpLegacyFloorHeight(o),
      history:false
    };
    try{input.setPointerCapture(ev.pointerId)}catch(_){}
    input.classList.add('dragging');
    ev.preventDefault();
  });

  input.addEventListener('pointermove',ev=>{
    if(!drag||ev.pointerId!==drag.id)return;
    const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
    if(!o)return;
    if(!drag.history){try{pushHistory?.()}catch(_){}drag.history=true;}
    // 4 px = 1 cm.
    const v=Math.max(0,Math.round((drag.startValue+(ev.clientX-drag.startX)/4)*10)/10);
    input.value=v;
    fpSetUniversalFloorHeight(o,v);
    try{refresh3D?.()}catch(_){}
    try{drawFloorplan?.()}catch(_){}
    ev.preventDefault();
  });

  const finish=ev=>{
    if(!drag)return;
    try{input.releasePointerCapture(drag.id)}catch(_){}
    input.classList.remove('dragging');
    drag=null;
    try{save?.()}catch(_){}
    try{scheduleSave?.()}catch(_){}
  };
  input.addEventListener('pointerup',finish);
  input.addEventListener('pointercancel',finish);

  input.addEventListener('change',()=>{
    const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
    if(!o)return;
    try{pushHistory?.()}catch(_){}
    fpSetUniversalFloorHeight(o,input.value);
    try{save?.()}catch(_){}
    try{refresh3D?.()}catch(_){}
  });
}

function fpEnsurePropertyPanel(){
  let p=document.getElementById('fp-object-properties');
  if(p) return p;
  p=document.createElement('aside');
  p.id='fp-object-properties';
  p.innerHTML=`
    <div class="fp-prop-head">
      <strong>Objekt bearbeiten</strong>
      <button type="button" id="fp-prop-close">×</button>
    </div>
    <div id="fp-prop-name" class="fp-prop-name"></div>
    <div class="fp-prop-grid">
      <label>Breite (cm)<input id="fp-prop-width" inputmode="decimal"></label>
      <label>Tiefe (cm)<input id="fp-prop-depth" inputmode="decimal"></label>
      <label>Höhe (cm)<input id="fp-prop-height" inputmode="decimal"></label>
      <label>Drehwinkel (°)<input id="fp-prop-angle" inputmode="decimal"></label>
      <label class="fp-distance-label">Abstand links (cm)<input id="fp-prop-left" class="fp-distance-drag" data-distance-side="left" inputmode="decimal"><span>↔ ziehen</span></label>
      <label class="fp-distance-label">Abstand rechts (cm)<input id="fp-prop-right" class="fp-distance-drag" data-distance-side="right" inputmode="decimal"><span>↔ ziehen</span></label>
      <label class="fp-distance-label">Abstand vorne (cm)<input id="fp-prop-front" class="fp-distance-drag" data-distance-side="front" inputmode="decimal"><span>↔ ziehen</span></label>
      <label class="fp-distance-label">Abstand hinten (cm)<input id="fp-prop-back" class="fp-distance-drag" data-distance-side="back" inputmode="decimal"><span>↔ ziehen</span></label>
      <label class="fp-distance-label">Höhe ab Boden (cm)<input id="fp-prop-floorheight" class="fp-height-drag" inputmode="decimal"><span>↔ ziehen</span></label>
      <label>Einbautiefe (cm)<input id="fp-prop-inset" inputmode="decimal"></label>
      <label>Wandseite
        <select id="fp-prop-side">
          <option value="">Automatisch</option><option value="inside">Innen</option>
          <option value="outside">Aussen</option><option value="left">Links</option>
          <option value="right">Rechts</option>
        </select>
      </label>
      <label>Bezeichnung<input id="fp-prop-label"></label>
    </div>
    <label class="fp-prop-desc">Beschreibung<textarea id="fp-prop-desc" rows="3"></textarea></label>
    <div class="fp-prop-actions">
      <button type="button" id="fp-prop-rotate">90° drehen</button>
      <button type="button" id="fp-prop-duplicate">Duplizieren</button>
      <button type="button" id="fp-prop-save">Übernehmen</button>
    </div>`;
  document.body.appendChild(p);
  fpBindDistanceDragControls();
  fpBindFloorHeightDrag();
  document.getElementById('fp-prop-close').onclick=()=>p.classList.remove('open');
  document.getElementById('fp-prop-save').onclick=fpApplyPropertyPanel;
  document.getElementById('fp-prop-rotate').onclick=()=>{
    const el=document.getElementById('fp-prop-angle');
    el.value=(fpNum(el.value)+90)%360;
    fpApplyPropertyPanel();
  };
  document.getElementById('fp-prop-duplicate').onclick=()=>{
    const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId);
    if(!o)return;
    pushHistory?.();
    const c=JSON.parse(JSON.stringify(o));
    c.id='obj_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    if('x' in c)c.x=fpNum(c.x)+20;
    if('y' in c)c.y=fpNum(c.y)+20;
    if('x1' in c){c.x1=fpNum(c.x1)+20;c.x2=fpNum(c.x2)+20;c.y1=fpNum(c.y1)+20;c.y2=fpNum(c.y2)+20;}
    fpObjects.push(c); fpSelectedId=c.id; fpPropertyObjectId=c.id;
    renderFloorplan?.(); scheduleSave?.(); fpOpenPropertyPanel(c);
  };
  return p;
}
function fpOpenPropertyPanel(o){
  if(!o || o.type==='wall') return;
  fpSetUniversalFloorHeight(o,fpLegacyFloorHeight(o));
  const p=fpEnsurePropertyPanel(); fpPropertyObjectId=o.id;
  const b=fpObjectBounds(o);
  const set=(id,v)=>{const e=document.getElementById(id); if(e)e.value=(v??'');};
  document.getElementById('fp-prop-name').textContent=o.label||o.name||o.kind||o.type||'Objekt';
  set('fp-prop-width', o.widthCm ?? o.width ?? o.w ?? b.w);
  set('fp-prop-depth', o.depthCm ?? o.depth ?? o.h ?? b.h);
  set('fp-prop-height', o.heightCm ?? o.height ?? 0);
  set('fp-prop-angle', o.rotation ?? o.angle ?? 0);
  set('fp-prop-left', '');
  set('fp-prop-right', '');
  set('fp-prop-front', '');
  set('fp-prop-back', '');
  set('fp-prop-floorheight', fpLegacyFloorHeight(o));
  set('fp-prop-inset', o.insetDepthCm ?? o.inset ?? 0);
  set('fp-prop-side', o.wallSide ?? '');
  set('fp-prop-label', o.label ?? o.name ?? '');
  set('fp-prop-desc', o.description ?? '');
  const inset=document.getElementById('fp-prop-inset')?.closest('label');
  if(inset) inset.style.display=(String(o.kind||o.type||o.label||'').toLowerCase().includes('nische'))?'grid':'none';
  fpRefreshPropertyDistances(o);
  p.classList.add('open');
}
function fpApplyPropertyPanel(){
  const o=(fpObjects||[]).find(x=>x.id===fpPropertyObjectId); if(!o)return;
  pushHistory?.();
  const val=id=>document.getElementById(id)?.value;
  const width=Math.max(1,fpNum(val('fp-prop-width'),fpObjectBounds(o).w));
  const depth=Math.max(1,fpNum(val('fp-prop-depth'),fpObjectBounds(o).h));
  o.widthCm=width; o.depthCm=depth; o.heightCm=Math.max(0,fpNum(val('fp-prop-height')));
  o.rotation=fpNum(val('fp-prop-angle'))%360;
  // Four wall distances are geometric controls, not independent metadata.
  // Their values are applied live through fpMoveObjectToWallDistance().
  fpSetUniversalFloorHeight(o,fpNum(val('fp-prop-floorheight')));
  o.insetDepthCm=Math.max(0,fpNum(val('fp-prop-inset')));
  o.wallSide=val('fp-prop-side')||'';
  o.label=val('fp-prop-label')||o.label||o.name||'';
  o.description=val('fp-prop-desc')||'';
  // Keep compatibility with existing renderer fields.
  if('w' in o || !('width' in o)) o.w=width;
  if('h' in o || !('depth' in o)) o.h=depth;
  o.width=width; o.depth=depth; o.height=o.heightCm;
  o.angle=o.rotation; o.inset=o.insetDepthCm;
  const corrected=fpHardStopObjectAgainstWalls(o,o.x,o.y,o.x,o.y);
  o.x=corrected.x;o.y=corrected.y;
  renderFloorplan?.(); scheduleSave?.();
  document.getElementById('fp-object-properties')?.classList.remove('open');
}
/* Open properties with double-click/double-tap on selected object; long press supported on touch. */
(function(){
  let lastTap=0, hold=null;
  document.addEventListener('dblclick',e=>{
    if(!fpCanvas || e.target!==fpCanvas)return;
    const o=(fpObjects||[]).find(x=>x.id===fpSelectedId);
    if(o && o.type!=='wall') fpOpenPropertyPanel(o);
  },true);
  document.addEventListener('pointerdown',e=>{
    if(!fpCanvas || e.target!==fpCanvas)return;
    clearTimeout(hold);
    hold=setTimeout(()=>{
      const o=(fpObjects||[]).find(x=>x.id===fpSelectedId);
      if(o && o.type!=='wall') fpOpenPropertyPanel(o);
    },650);
  },true);
  ['pointerup','pointercancel','pointermove'].forEach(n=>document.addEventListener(n,()=>clearTimeout(hold),true));
})();



/* === v2.9.43 Visible Objekt-bearbeiten button === */
function fpEnsureObjectEditButton(){
  let b=document.getElementById('fp-object-edit-visible');
  if(b)return b;
  b=document.createElement('button');
  b.type='button';
  b.id='fp-object-edit-visible';
  b.textContent='✎ Objekt bearbeiten';
  b.hidden=true;
  b.addEventListener('click',()=>{
    const o=(fpObjects||[]).find(x=>x.id===fpSelectedId);
    if(o && o.type!=='wall') fpOpenPropertyPanel(o);
  });
  document.body.appendChild(b);
  return b;
}
function fpRefreshObjectEditButton(){
  const b=fpEnsureObjectEditButton();
  const o=(fpObjects||[]).find(x=>x.id===fpSelectedId);
  b.hidden=!(o && o.type!=='wall');
  if(!b.hidden){
    const n=o.label||o.name||o.kind||o.type||'Objekt';
    b.textContent='✎ Objekt bearbeiten · '+n;
  }
}
(function(){
  fpEnsureObjectEditButton();
  const refresh=()=>setTimeout(fpRefreshObjectEditButton,0);
  if(fpCanvas){
    ['pointerup','click','touchend'].forEach(n=>fpCanvas.addEventListener(n,refresh,true));
  }
  document.addEventListener('click',refresh,true);
  const oldRender=window.renderFloorplan;
  if(typeof oldRender==='function'){
    window.renderFloorplan=function(...args){
      const r=oldRender.apply(this,args);
      fpRefreshObjectEditButton();
      return r;
    };
  }
  setInterval(fpRefreshObjectEditButton,500);
})();
