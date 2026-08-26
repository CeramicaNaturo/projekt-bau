
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
  const merged=pbMergedRecoveryState();

  if(merged.projects.length){
    try{
      // Recovery is a COPY. We do not remove any older browser storage.
      localStorage.setItem(K3,JSON.stringify(merged));
    }catch(_){}
    return merged;
  }

  return {projects:[]};
}
let S=loadState(),A=null;
const $=x=>document.getElementById(x),u=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(36);

function save(){
  try{
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
    }
  }catch(e){
    console.error('Projekt Bau Speichern',e);
  }
  render();
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
$('addArea').onclick=()=>{let p=cur(),n=$('areaName').value.trim();if(!p||!n)return;p.areas.push({id:u(),name:n,priority:$('priority').value,worker:'',status:'Offen',tasks:[],materials:[],photos:[]});$('areaName').value='';save()};
$('deleteProject').onclick=()=>{let p=cur();if(p&&confirm('Projekt wirklich löschen?')){S.projects=S.projects.filter(x=>x.id!==p.id);A=null;save()}};
$('workerView').onclick=()=>document.body.classList.toggle('worker-mode');
$('backup').onclick=()=>{let a=document.createElement('a'),b=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});a.href=URL.createObjectURL(b);a.download='ProjektBau_Yedek.json';a.click()};
$('restore').onchange=async e=>{try{let d=JSON.parse(await e.target.files[0].text());if(!Array.isArray(d.projects))throw 0;S=d;A=null;save()}catch{alert('Ungültige Sicherungsdatei.')}};
$('printReport').onclick=()=>generateDirectPDFReport();

function render(){
  let b=$('projects');b.innerHTML=S.projects.length?'':'Noch keine Projekte vorhanden.';
  S.projects.forEach(p=>{
    const d=document.createElement('div');
    d.className='project';
    d.dataset.projectId=p.id;
    d.setAttribute('role','button');
    d.setAttribute('tabindex','0');
    d.innerHTML=`<div><b>${esc(p.name)}</b><div class=muted>${esc(p.address||'Keine Adresse')} · ${p.areas.length} Bereiche</div></div><button type="button" class="secondary project-open">Öffnen</button>`;

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
  d.querySelector('.delArea').onclick=()=>{if(confirm('Bereich wirklich löschen?')){p.areas=p.areas.filter(x=>x.id!==a.id);save()}};
  a.tasks.forEach(t=>d.querySelector('.tasks').appendChild(row(a.tasks,t,'Arbeitsbeschreibung')));
  d.querySelector('.addT').onclick=()=>{a.tasks.push({id:u(),text:''});save()};
  a.materials.forEach(m=>d.querySelector('.mats').appendChild(row(a.materials,m,'60×120 seramik – 12 m²')));
  d.querySelector('.addM').onclick=()=>{a.materials.push({id:u(),text:''});save()};
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
  d.querySelector('.galleryButton').onclick=async()=>{
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
  };
  a.photos.forEach((ph,i)=>d.querySelector('.photos').appendChild(photoCard(a,ph,i)));
  return d
}
function row(arr,it,ph){
  let r=document.createElement('div');r.className='row';r.innerHTML=`<input placeholder="${ph}"><button class="danger editor">Löschen</button>`;
  r.querySelector('input').value=it.text||'';r.querySelector('input').onchange=e=>{it.text=e.target.value;save()};
  r.querySelector('button').onclick=()=>{arr.splice(arr.findIndex(x=>x.id===it.id),1);save()};return r
}
function photoCard(a,ph,i){
  ph.title=ph.title||'';ph.note=ph.note||'';
  let c=document.createElement('div');c.className='photo';
  c.innerHTML=`<img><div class=body><span class=tag>${esc(ph.kind||'Detail')}</span>
  <div class=photo-fields>
    <label>Titel / Position<input class=photoTitle placeholder="Örn. Badezimmer - duş duvarı"></label>
    <label>Beschreibung im PDF<textarea class=photoNote rows=5 placeholder="Auszuführende Arbeiten für dieses Foto beschreiben..."></textarea></label>
  </div>
  <div class="photo-actions editor"><button class="secondary up">↑ Nach oben</button><button class="secondary down">↓ Nach unten</button><button class="danger del">Löschen</button></div></div>`;
  c.querySelector('img').src=ph.data;c.querySelector('.photoTitle').value=ph.title;c.querySelector('.photoNote').value=ph.note;
  c.querySelector('.photoTitle').onchange=e=>{ph.title=e.target.value;save()};c.querySelector('.photoNote').onchange=e=>{ph.note=e.target.value;save()};
  c.querySelector('.up').disabled=i===0;c.querySelector('.down').disabled=i===a.photos.length-1;
  c.querySelector('.up').onclick=()=>{if(i>0){[a.photos[i-1],a.photos[i]]=[a.photos[i],a.photos[i-1]];save()}};
  c.querySelector('.down').onclick=()=>{if(i<a.photos.length-1){[a.photos[i+1],a.photos[i]]=[a.photos[i],a.photos[i+1]];save()}};
  c.querySelector('.del').onclick=()=>{a.photos=a.photos.filter(x=>x.id!==ph.id);save()};return c
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

  const items=[];
  (p.areas||[]).forEach(area=>(area.photos||[]).forEach(photo=>items.push({area,photo})));

  if(!items.length){
    alert('Für den PDF-Bericht muss mindestens ein Foto vorhanden sein.');
    return;
  }
  if(!window.jspdf || !window.jspdf.jsPDF){
    alert('Das PDF-Modul konnte nicht geladen werden. Bitte Seite neu laden.');
    return;
  }

  try{
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    const totalPages=Math.ceil(items.length/2);
    const reportDate=new Date().toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'});

    for(let pageIndex=0;pageIndex<totalPages;pageIndex++){
      if(pageIndex>0)doc.addPage('a4','portrait');

      doc.setTextColor(90);doc.setFont('helvetica','bold');doc.setFontSize(8);
      doc.text('PROJEKT BAU · BAUDOKUMENTATION',12,12);

      doc.setTextColor(20);doc.setFontSize(19);
      doc.text(String(p.name||'Projekt'),12,20);

      let hy=27;
      const rows=[
        ['Adresse',p.address],['Kunde / Firma',p.customer],['Verantwortlich',p.owner],
        ['Telefon',p.phone],['Startdatum',fmtDate(p.startDate)]
      ].filter(r=>r[1]);

      doc.setFontSize(9);
      rows.forEach(([label,value])=>{
        doc.setFont('helvetica','bold');doc.text(`${label}:`,12,hy);
        doc.setFont('helvetica','normal');doc.text(String(value),39,hy);
        hy+=5;
      });

      doc.setFont('helvetica','normal');doc.setFontSize(9);
      doc.text(`Seite ${pageIndex+1} / ${totalPages}`,198,12,{align:'right'});
      doc.text(`Berichtsdatum: ${reportDate}`,198,17,{align:'right'});
      doc.setLineWidth(.5);doc.line(12,48,198,48);

      for(let slot=0;slot<2;slot++){
        const item=items[pageIndex*2+slot];
        if(!item)continue;

        const y=55+slot*116,h=108;
        doc.setDrawColor(170);doc.setLineWidth(.25);
        doc.roundedRect(12,y,186,h,2,2,'S');
        doc.line(98,y,98,y+h);

        addImageContain(doc,item.photo.data,13,y+1,84,106);

        const tx=102,tw=92;
        let ty=y+8;

        doc.setTextColor(100);doc.setFont('helvetica','bold');doc.setFontSize(7.5);
        doc.text('BEREICH / POSITION',tx,ty);ty+=6;

        doc.setTextColor(20);doc.setFontSize(13);
        const titleLines=doc.splitTextToSize(String(item.photo.title||item.area.name||'-'),tw);
        doc.text(titleLines,tx,ty);ty+=titleLines.length*5.4+3;

        const status=`${item.photo.kind||'Detail'} · ${item.area.status||'Offen'}`;
        doc.setFontSize(8.5);doc.setFont('helvetica','bold');
        const badgeW=Math.min(50,doc.getTextWidth(status)+6);
        doc.roundedRect(tx,ty-4,badgeW,7,3,3,'S');
        doc.text(status,tx+3,ty+.5);ty+=10;

        const tasks=(item.area.tasks||[]).map(x=>x.text).filter(Boolean).join(' • ');
        const materials=(item.area.materials||[]).map(x=>x.text).filter(Boolean).join(' • ');
        const sections=[
          ['BESCHREIBUNG / AUSZUFÜHRENDE ARBEITEN',item.photo.note||tasks||'-'],
          ...(materials?[['MATERIAL / MENGE',materials]]:[]),
          ...(item.area.worker?[['MITARBEITER / TEAM',item.area.worker]]:[]),
          ...(item.area.priority?[['PRIORITÄT',item.area.priority]]:[])
        ];

        for(const [label,value] of sections){
          if(ty>y+h-9)break;
          doc.setTextColor(100);doc.setFont('helvetica','bold');doc.setFontSize(7.1);
          doc.text(label,tx,ty);ty+=4;
          doc.setTextColor(20);doc.setFont('helvetica','normal');doc.setFontSize(9);
          let lines=doc.splitTextToSize(String(value||'-'),tw);
          const maxLines=Math.max(1,Math.floor((y+h-ty-3)/4.1));
          lines=lines.slice(0,maxLines);
          doc.text(lines,tx,ty);
          ty+=lines.length*4.1+4;
        }
      }

      doc.setDrawColor(200);doc.line(12,289,198,289);
      doc.setTextColor(100);doc.setFontSize(7.5);
      doc.text('Projekt Bau',12,294);
      doc.text(`${String(p.name||'Projekt')} · ${pageIndex+1}/${totalPages}`,198,294,{align:'right'});
    }

    const blob=doc.output('blob');
    const url=URL.createObjectURL(blob);

    if(pdfTab)pdfTab.location.replace(url);
    else{
      const link=document.createElement('a');
      link.href=url;link.target='_blank';link.click();
    }

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

let fp3DMode=false,fp3DOptions={floorMaterialId:'',wallMaterialId:'',showCeiling:false,tileOriginX:0,tileOriginY:0,tileRotation:0};
let fpProject=null,fpRecord=null,fpTool='select',fpObjects=[],fpUndoStack=[],fpRedoStack=[];
let fpDrawing=false,fpStart=null,fpPreview=null,fpSelectedId=null,fpDragOffset=null,fpLastWallEnd=null,fpObjectRotateDrag=null,fpPinchState=null,fpPickingFloorTileOrigin=false,fpDraggingFloorTileOrigin=false,fpFloorTileDragStart=null,fpEditingWallTileAreaId=null;
let fpWallMoveHold={timer:null,ready:false,wallId:null,start:null,moved:false};
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
  if(['wc','shower','walkInShower','bathtub','sink','drain','kitchenSink','mirror'].includes(type))return 'sanitary';
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


function nearestWallEndpoint(p,maxDistance=35){
  let best=null,bestDist=Infinity;
  for(const w of fpObjects){
    if(w.type!=='wall')continue;
    for(const pt of [{x:Number(w.x1),y:Number(w.y1)},{x:Number(w.x2),y:Number(w.y2)}]){
      const d=Math.hypot(p.x-pt.x,p.y-pt.y);
      if(d<=maxDistance && d<bestDist){
        best={x:pt.x,y:pt.y};
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
  const base=snapAnglePoint(start,p);
  const target=rayWallIntersection(start,base);
  if(!target)return {point:base,target:null,snapped:false};

  const pointerDistance=Math.hypot(base.x-start.x,base.y-start.y);
  const targetDistance=Math.hypot(target.x-start.x,target.y-start.y);

  // Snap when close to the opposite wall OR when the pointer passes it.
  const snapTolerance=Math.max(35,Math.min(80,targetDistance*.10));
  const close=Math.abs(pointerDistance-targetDistance)<=snapTolerance;
  const passed=pointerDistance>=targetDistance;

  if(close||passed){
    return {
      point:{x:snap(target.x),y:snap(target.y)},
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
  fpCtx.fillStyle='#2563eb';
  fpCtx.beginPath();
  fpCtx.arc(x1,y1,5/zoom,0,Math.PI*2);
  fpCtx.fill();

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

function setSelectedWallGeometry(){
  const o=selectedObject();
  if(!o||o.type!=='wall')return;

  const lenInput=$('fpWallLength');
  const angleInput=$('fpWallAngle');

  const length=Number(lenInput?.value);
  if(!Number.isFinite(length)||length<=0)return;

  let angleDeg=wallAngleDeg(o);
  const requested=angleInput?.value;

  if(requested && requested!=='auto'){
    angleDeg=Number(requested);
  }else if(fpAngleSnap){
    // Keep current direction, but guarantee mathematically exact CAD angle.
    angleDeg=nearestCadAngle(angleDeg);
  }

  pushHistory();

  const rad=angleDeg*Math.PI/180;

  // The first endpoint remains fixed; only the second endpoint moves.
  // This is predictable in a CAD workflow and keeps connected geometry stable.
  o.x2=o.x1+Math.cos(rad)*length;
  o.y2=o.y1+Math.sin(rad)*length;

  // Clean floating point noise, especially for 0° / 90°.
  if(Math.abs(Math.cos(rad))<1e-10)o.x2=o.x1;
  if(Math.abs(Math.sin(rad))<1e-10)o.y2=o.y1;

  // Store with sensible precision.
  o.x2=Math.round(o.x2*1000)/1000;
  o.y2=Math.round(o.y2*1000)/1000;

  drawFloorplan();
  updateSelectedInfo();
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

function wallLengthCm(wall){
  return dist({x:Number(wall.x1),y:Number(wall.y1)},{x:Number(wall.x2),y:Number(wall.y2)});
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

  const length=dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2});
  const current=wallAngleDeg(o);
  const snapped=nearestCadAngle(current);
  const diff=Math.min(Math.abs(current-snapped),360-Math.abs(current-snapped));

  const setValue=(id,val)=>{
    const el=$(id);
    if(el)el.value=String(val);
  };

  // Länge = lichte Innenlänge, nicht Aussen-/Mittellinienmass.
  o.innerLengthCm=Math.round(length*100)/100;
  setValue('fpQuickWallLength',Math.round(o.innerLengthCm));
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

    const rad=angleDeg*Math.PI/180;
    // Eingabewert ist immer lichte Innenlänge.
    o.innerLengthCm=length;
    o.x2=o.x1+Math.cos(rad)*length;
    o.y2=o.y1+Math.sin(rad)*length;

    if(Math.abs(Math.cos(rad))<1e-10)o.x2=o.x1;
    if(Math.abs(Math.sin(rad))<1e-10)o.y2=o.y1;

    o.x2=Math.round(o.x2*1000)/1000;
    o.y2=Math.round(o.y2*1000)/1000;
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

  const length=dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2});
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

function current3DData(){
  return {
    objects:fpObjects,
    record:fpRecord,
    project:fpProject,
    options:{...fp3DOptions}
  };
}

function refresh3D(){
  if(!fp3DMode || !window.ProjectBau3D)return;
  window.ProjectBau3D.update(current3DData());
}

function setFloorplanView(mode){
  fp3DMode=mode==='3d';
  const w2=$('fp2DWorkspace'),w3=$('fp3DWorkspace'),b2=$('fpView2D'),b3=$('fpView3D');

  if(w2)w2.classList.toggle('hidden',fp3DMode);
  if(w3)w3.classList.toggle('hidden',!fp3DMode);
  setTimeout(forceWorkspaceRootRefit,80);
  if(b2)b2.classList.toggle('active',!fp3DMode);
  if(b3)b3.classList.toggle('active',fp3DMode);

  if(fp3DMode){
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
  // Für die Flächenberechnung werden die Wände verwendet.
  const lines=(objects||[]).filter(o=>o.type==='wall');
  if(lines.length<3)return null;

  // Endpunkte müssen auf einem Tablet nicht pixelgenau zusammentreffen.
  // Punkte innerhalb dieser Toleranz werden als derselbe Eckpunkt behandelt.
  const tolerance=30;
  const nodes=[];

  function findOrCreateNode(x,y){
    let best=null,bestDist=Infinity;
    for(const n of nodes){
      const d=Math.hypot(n.x-x,n.y-y);
      if(d<tolerance && d<bestDist){
        best=n;bestDist=d;
      }
    }
    if(best){
      // Mittelwert stabilisiert leicht versetzte Finger-Endpunkte.
      best.x=(best.x*best.count+x)/(best.count+1);
      best.y=(best.y*best.count+y)/(best.count+1);
      best.count++;
      return best;
    }
    const n={id:nodes.length,x,y,count:1,neighbors:[]};
    nodes.push(n);
    return n;
  }

  for(const l of lines){
    const n1=findOrCreateNode(Number(l.x1),Number(l.y1));
    const n2=findOrCreateNode(Number(l.x2),Number(l.y2));
    if(n1===n2)continue;
    if(!n1.neighbors.includes(n2.id))n1.neighbors.push(n2.id);
    if(!n2.neighbors.includes(n1.id))n2.neighbors.push(n1.id);
  }

  if(nodes.length<3)return null;

  // Ein einfacher geschlossener Raum hat an jeder Ecke genau zwei Verbindungen.
  if(nodes.some(n=>n.neighbors.length!==2))return null;

  const polygon=[];
  const visited=new Set();
  const first=nodes[0];
  let current=first.id;
  let previous=null;

  for(let guard=0;guard<nodes.length+2;guard++){
    const n=nodes[current];
    if(!n)return null;

    polygon.push({x:n.x,y:n.y});
    visited.add(current);

    const next=n.neighbors.find(id=>id!==previous);
    if(next===undefined)return null;

    previous=current;
    current=next;

    if(current===first.id)break;
  }

  if(current!==first.id || visited.size!==nodes.length || polygon.length<3)return null;

  // Shoelace-Formel.
  // Im Grundriss gilt weiterhin 1 Canvas-Einheit = 1 cm.
  let twiceArea=0;
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i];
    const q=polygon[(i+1)%polygon.length];
    twiceArea+=p.x*q.y-q.x*p.y;
  }

  const areaCm2=Math.abs(twiceArea)/2;
  if(areaCm2<=0)return null;

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
  fp3DMode=false;fp3DOptions=record.threeDOptions||{floorMaterialId:'',wallMaterialId:'',showCeiling:false,tileOriginX:0,tileOriginY:0,tileRotation:0};fpUndoStack=[];fpRedoStack=[];fpSelectedId=null;fpLastWallEnd=null;fpZoom=1;fpActiveLayer=record.activeLayer||'walls';fpLayerVisibility={
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
    try{window.ProjectBauPro?.save?.()}catch(_){}

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

  // v1.9.16: In Auswahl-Modus bewegt sich eine Wand nicht sofort.
  // Kurzer Tap/Klick = nur auswählen. Erst nach 500 ms Halten darf gezogen werden.
  if(fpTool==='select' && hit && hit.type==='wall'){
    fpSelectedId=hit.id;
    fpDragOffset=null;

    if(fpWallMoveHold.timer)clearTimeout(fpWallMoveHold.timer);
    fpWallMoveHold={
      timer:null,
      ready:false,
      wallId:hit.id,
      start:{x:p.x,y:p.y},
      moved:false
    };

    fpWallMoveHold.timer=setTimeout(()=>{
      if(fpWallMoveHold.wallId===hit.id){
        fpWallMoveHold.ready=true;
        fpDragOffset={x:p.x,y:p.y};
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

    // Priority:
    // 1) clicked existing endpoint
    // 2) last wall endpoint (continuous wall chain)
    // 3) current pointer
    const endpointHit=nearestWallEndpoint(p,40);
    if(endpointHit){
      fpStart={x:snap(endpointHit.x),y:snap(endpointHit.y)};
    }else if(fpLastWallEnd){
      fpStart={x:snap(fpLastWallEnd.x),y:snap(fpLastWallEnd.y)};
    }else{
      fpStart={x:snap(p.x),y:snap(p.y)};
    }

    const connectedWall=connectedWallAtStart(fpStart);

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
      door:[90,15],window:[100,15],wc:[40,70],shower:[90,90],walkInShower:[100,100],
      bathtub:[180,80],sink:[60,50],drain:[15,15],
      kitchenSink:[60,60],stove:[60,60],fridge:[60,65],washingMachine:[60,65],
      table:[160,90],chair:[50,50],sofa:[220,90],bed:[200,100],cabinet:[120,60],plant:[45,45],mirror:[80,5],niche:[60,12]
    };
    const d=dims[fpTool]||[60,40];
    const newObj={
      id:uidObj(),type:fpTool,x,y,rotation:0,scale:1,
      widthCm:d[0],depthCm:d[1],layer:layerForType(fpTool),
      heightCm:fpTool==='door'?205:(fpTool==='window'?120:(fpTool==='mirror'?80:(fpTool==='niche'?60:undefined))),
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
        const ep=snapAnglePoint({x:orig.x2,y:orig.y2},{x:orig.x1+dx,y:orig.y1+dy});
        o.x1=ep.x;o.y1=ep.y;o.x2=orig.x2;o.y2=orig.y2;
      }else if(fpEndpointDrag==='end'){
        const ep=snapAnglePoint({x:orig.x1,y:orig.y1},{x:orig.x2+dx,y:orig.y2+dy});
        o.x1=orig.x1;o.y1=orig.y1;o.x2=ep.x;o.y2=ep.y;
      }else{
        o.x1=snap(orig.x1+dx);
        o.y1=snap(orig.y1+dy);
        o.x2=snap(orig.x2+dx);
        o.y2=snap(orig.y2+dy);
      }
    }else if(o.type==='mirror'||o.type==='niche'){
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
      const desiredX=snap(orig.x+dx);
      const desiredY=snap(orig.y+dy);
      const placed=constrainObjectPlacement(o,desiredX,desiredY);
      o.x=placed.x;
      o.y=placed.y;
      o.rotation=placed.rotation;
      assignWallPlacementMeta(o,placed);
    }
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if((fpTool==='wall') && fpStart){
    const smart=smartWallEndpoint(fpStart,p);
    const connectedWallId=fpPreview?.connectedWallId||connectedWallAtStart(fpStart)?.id||null;
    fpPreview={
      id:'preview',
      type:fpTool,
      x1:fpStart.x,
      y1:fpStart.y,
      x2:smart.point.x,
      y2:smart.point.y,
      thickness:fpWallThickness,
      layer:'walls',
      snapTarget:smart.target,
      snappedToTarget:smart.snapped,
      connectedWallId
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

  if(fpWallMoveHold.timer){
    clearTimeout(fpWallMoveHold.timer);
    fpWallMoveHold.timer=null;
  }
  fpWallMoveHold.ready=false;
  fpWallMoveHold.wallId=null;
  fpWallMoveHold.start=null;

  if(!fpDrawing)return;
  ev.preventDefault();

  if(fpTool==='pan'){
    fpDrawing=false;fpPanStart=null;return;
  }

  if(fpTool==='select'){
    fpDrawing=false;
    fpDragOffset=null;
    fpEndpointDrag=null;
    endObjectRotation();
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if((fpTool==='wall') && fpStart){
    const p=fpPoint(ev);
    const smart=smartWallEndpoint(fpStart,p);
    const ep=smart.point;

    const obj={
      id:uidObj(),
      type:fpTool,
      x1:fpStart.x,
      y1:fpStart.y,
      x2:ep.x,
      y2:ep.y,
      thickness:fpWallThickness,
      layer:'walls'
    };

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
  for(const w of fpObjects){
    if(w.type!=='wall')continue;
    const a={x:Number(w.x1),y:Number(w.y1)};
    const b={x:Number(w.x2),y:Number(w.y2)};
    const q=nearestPointOnSegment(p,a,b);
    const d=Math.hypot(p.x-q.x,p.y-q.y);
    if(d<bestD){
      bestD=d;
      best={wall:w,point:q,distance:d,a,b};
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
  return objectFootprintCorners(o,x,y,rotation).every(p=>pointInPolygon(p,poly));
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
  const toCenter={x:roomC.x-mid.x,y:roomC.y-mid.y};
  if(nx*toCenter.x+ny*toCenter.y<0){nx=-nx;ny=-ny}

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

  // Furniture / sanitary object: back edge is EXACTLY on the inner wall face.
  // No grid rounding is applied after wall snapping.
  const depth=Math.max(1,Number(o.depthCm||40)*(o.scale||1));
  const offset=(o.type==='mirror'||o.type==='niche')?0:depth/2;

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
  if(!objectFitsRoom(o,o.x,o.y,o.rotation||0)){
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
  o.mountHeightCm=bottom;

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

  if(!wall){
    const near=nearestWallForObject(pointer);
    wall=near?.wall||null;
  }

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
  bind('fpMirrorBottom','mountHeightCm',0);
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
  bind('fpNicheBottom','mountHeightCm',0);
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
    txt+=` · Länge ${cmFromPixels(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}))} cm`;
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
    const sx=Number(wall.x1),sy=Number(wall.y1);
    const ex=Number(wall.x2),ey=Number(wall.y2);
    const dx=ex-sx,dy=ey-sy;
    const len=Math.hypot(dx,dy);
    if(len<1)continue;

    const ux=dx/len,uy=dy/len;
    const out=wallOutsideNormal(wall);
    const horizontal=Math.abs(dx)>=Math.abs(dy);
    const text=`${formatDimensionMeters(len)} m`;

    const fontPx=Math.max(12,14/z);
    // Stable approximation; actual text is usually slightly narrower.
    const textWidth=Math.max(34/z,text.length*fontPx*.60);
    const textHeight=Math.max(18/z,fontPx*1.35);

    const baseOffset=Math.max(34,Number(wall.thickness||15)+22);
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

    // v2.8.3: Walls are always rendered first. This prevents sanitary/furniture
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

    // Close perpendicular wall corners as one continuous L-shaped construction.
    // v2.7.5: no separate miter wedge pass; safe wall polygons remain authoritative.
    try{fpDrawAllObjectDimensions()}catch(e){console.error('Objektmasse',e)}

    if(preview){
      try{
        const connected=preview.connectedWallId
          ? fpObjects.find(o=>o.id===preview.connectedWallId)
          : connectedWallAtStart({x:preview.x1,y:preview.y1});

        // Keep the wall being continued clearly visible while drawing.
        if(connected)drawConnectedWallPreview(connected);

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
  const t=Math.max(1,Number(w?.thickness||15));

  // Determine the outward normal without depending on wall-joint geometry.
  let out=null;
  try{out=wallOutsideNormal(w)}catch(_){}
  if(!out || !Number.isFinite(out.nx) || !Number.isFinite(out.ny)){
    out={nx:-dy/len,ny:dx/len};
  }

  return [
    {x:x1,y:y1},
    {x:x2,y:y2},
    {x:x2+out.nx*t,y:y2+out.ny*t},
    {x:x1+out.nx*t,y:y1+out.ny*t}
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

  // Try to keep the stored line as Innenkante.
  let nx=-dy/len, ny=dx/len;
  try{
    const n=wallOutsideNormal(w);
    if(n && Number.isFinite(n.nx) && Number.isFinite(n.ny)){
      nx=n.nx; ny=n.ny;
    }
  }catch(_){}

  const shift=thickness/2;
  const ax=x1+nx*shift, ay=y1+ny*shift;
  const bx=x2+nx*shift, by=y2+ny*shift;

  fpCtx.save();
  fpCtx.globalAlpha=alpha;
  fpCtx.strokeStyle=color;
  fpCtx.lineWidth=thickness;
  fpCtx.lineCap='square';
  fpCtx.lineJoin='miter';
  fpCtx.beginPath();
  fpCtx.moveTo(ax,ay);
  fpCtx.lineTo(bx,by);
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

function drawWallJointAt(point, walls, color='#111827'){
  if(!point || !walls || walls.length<2)return;

  // Most CAD room corners connect exactly two wall segments.
  // For more than two, fill every adjacent pair conservatively.
  const unique=[...new Map(walls.map(w=>[w.id||`${w.x1}_${w.y1}_${w.x2}_${w.y2}`,w])).values()];

  fpCtx.save();
  fpCtx.fillStyle=color;

  for(let i=0;i<unique.length;i++){
    for(let j=i+1;j<unique.length;j++){
      const w1=unique[i],w2=unique[j];

      const l1=wallOuterLine(w1);
      const l2=wallOuterLine(w2);
      const o1=wallOuterPointAtJoint(w1,point);
      const o2=wallOuterPointAtJoint(w2,point);
      const inter=lineIntersectionInfinite(l1.a,l1.b,l2.a,l2.b);

      if(!inter)continue;

      // Safety against almost-parallel walls producing a remote intersection.
      const maxT=Math.max(wallVisualWidth(w1),wallVisualWidth(w2));
      if(Math.hypot(inter.x-point.x,inter.y-point.y)>maxT*4)continue;

      // Exact miter wedge:
      // INNER joint -> outer edge 1 -> outer-line intersection -> outer edge 2.
      fpCtx.beginPath();
      fpCtx.moveTo(point.x,point.y);
      fpCtx.lineTo(o1.x,o1.y);
      fpCtx.lineTo(inter.x,inter.y);
      fpCtx.lineTo(o2.x,o2.y);
      fpCtx.closePath();
      fpCtx.fill();
    }
  }

  fpCtx.restore();
}
function drawAllWallJoints(){
  const walls=fpObjects.filter(o=>o.type==='wall');
  const seen=[];

  const addPoint=(p,w)=>{
    let group=seen.find(g=>Math.hypot(g.x-p.x,g.y-p.y)<=3);
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
  drawWallBody(w,'#2563eb',.38);
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
      const sx=Number(wall.x1),sy=Number(wall.y1);
      const ex=Number(wall.x2),ey=Number(wall.y2);
      const dx=ex-sx,dy=ey-sy;
      const len=Math.hypot(dx,dy);
      if(len>=1){
        const out=wallOutsideNormal(wall);
        const ux=dx/len,uy=dy/len;
        const offset=Math.max(42,Number(wall.thickness||15)+26);
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
      drawProfessionalWallDimension(wall);
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
}function fpObjectRealDims(o){
  const [dw,dd]=fpDefaultObjectDimensions(o?.type);
  return {
    w:Math.max(1,Number(o?.widthCm||dw)),
    d:Math.max(1,Number(o?.depthCm||dd))
  };
}

function fpDrawObjectOwnDimensions(o){ return; }

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
  fpCtx.strokeStyle=selected?'#2563eb':'#111827';
  fpCtx.fillStyle=selected?'#2563eb':'#111827';
  fpCtx.lineCap='square';
  fpCtx.lineJoin='miter';

  if(o.type==='wall'){
    // v2.8.3: authoritative robust wall pass.
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
    fpCtx.lineWidth=4;
    fpCtx.strokeRect(o.x-50,o.y-50,100,100);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-45,o.y-45);fpCtx.lineTo(o.x+45,o.y+45);
    fpCtx.moveTo(o.x+45,o.y-45);fpCtx.lineTo(o.x-45,o.y+45);fpCtx.stroke();
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
    fpCtx.lineWidth=3;
    fpCtx.fillStyle='rgba(226,232,240,.55)';
    fpCtx.fillRect(o.x-nw/2,o.y-nd/2,nw,nd);
    fpCtx.strokeRect(o.x-nw/2,o.y-nd/2,nw,nd);
    fpCtx.lineWidth=1.4;
    fpCtx.setLineDash([5,4]);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-nw/2+5,o.y);
    fpCtx.lineTo(o.x+nw/2-5,o.y);
    fpCtx.stroke();
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
      set('cadPropSize',`${Math.round(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}))} cm`);
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
  $('fpWallThickness').onchange=e=>{fpWallThickness=Number(e.target.value)||15};
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
  pdfBtns.forEach(b=>b.onclick=()=>generateDirectPDFReport());

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
  if($('floorplanModal') && !$('floorplanModal').classList.contains('hidden') && !fp3DMode){
    requestAnimationFrame(fitFloorplan2D);
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
    document.addEventListener('click',ev=>{
      const target=ev.target.closest?.('button,[data-add-object],[data-tool]');
      if(!target)return;

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
      if(target.id==='fpAbdichtungToolTop'){
        ev.preventDefault();try{window.ProjectBauAbdichtung?.open?.()}catch(err){console.error(err)};return;
      }
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDelegation,{once:true});
  else installDelegation();

  // Ensure project cards are present on first paint and after bfcache restore.
  const rerender=()=>{try{if(Array.isArray(S?.projects))render()}catch(err){console.error('Project list render',err)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(rerender,0),{once:true});
  else setTimeout(rerender,0);
  window.addEventListener('pageshow',()=>setTimeout(rerender,20));
})();





/* v2.8.3 – authoritative runtime version stamp */
(()=>{
  const VERSION='2.8.3 PRO';
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


/* v2.8.3 – safety autosave */
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
