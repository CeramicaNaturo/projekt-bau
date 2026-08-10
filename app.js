
const K3='projekt-bau-v03',K2='projekt-bau-v02';
let S=loadState(),A=null;
const $=x=>document.getElementById(x),u=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(36);

function loadState(){
  try{
    const v3=localStorage.getItem(K3); if(v3) return JSON.parse(v3);
    const v2=localStorage.getItem(K2); if(v2){ const s=JSON.parse(v2); localStorage.setItem(K3,JSON.stringify(s)); return s; }
  }catch(e){}
  return {projects:[]};
}
function save(){localStorage.setItem(K3,JSON.stringify(S));render()}
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
$('printReport').onclick=()=>{buildPrintReport();setTimeout(()=>window.print(),100)};

function render(){
  let b=$('projects');b.innerHTML=S.projects.length?'':'Noch keine Projekte vorhanden.';
  S.projects.forEach(p=>{let d=document.createElement('div');d.className='project';d.innerHTML=`<div><b>${esc(p.name)}</b><div class=muted>${esc(p.address||'Keine Adresse')} · ${p.areas.length} Bereiche</div></div><button class=secondary>Aç</button>`;d.querySelector('button').onclick=()=>{A=p.id;render()};b.appendChild(d)});
  renderP()
}
function renderP(){
  let p=cur();
  if(!p){$('panel').classList.add('hidden');return}
  p.floorplans=p.floorplans||[];
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


let fpProject=null,fpRecord=null,fpTool='select',fpObjects=[],fpUndoStack=[],fpRedoStack=[];
let fpDrawing=false,fpStart=null,fpPreview=null,fpSelectedId=null,fpDragOffset=null;
let fpZoom=1,fpGrid=20,fpWallThickness=15,fpSnapEnabled=true;

const fpCanvas=$('floorplanCanvas'),fpCtx=fpCanvas.getContext('2d');

function cloneObjects(){return JSON.parse(JSON.stringify(fpObjects))}
function pushHistory(){
  fpUndoStack.push(cloneObjects());
  if(fpUndoStack.length>60)fpUndoStack.shift();
  fpRedoStack=[];
}
function restoreObjects(arr){fpObjects=JSON.parse(JSON.stringify(arr));fpSelectedId=null;drawFloorplan();updateSelectedInfo()}
function renderFloorplans(project){
  const list=$('floorplanList'); if(!list)return; list.innerHTML='';
  project.floorplans=project.floorplans||[];
  if(!project.floorplans.length){list.innerHTML='<div class="muted">Noch keine Grundrisse vorhanden.</div>';return}
  project.floorplans.forEach(fp=>{
    const card=document.createElement('div');card.className='floorplan-card';
    card.innerHTML=`<div class="floorplan-card-title">${esc(fp.name||'Grundriss')}</div>${fp.image?`<img src="${fp.image}" alt="${esc(fp.name||'Grundriss')}">`:''}<div class="floorplan-card-actions"><button class="secondary editFp">Bearbeiten</button><button class="danger delFp">Löschen</button></div>`;
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

function openFloorplan(project,record){
  fpProject=project;fpRecord=record;
  fpObjects=Array.isArray(record.objects)?JSON.parse(JSON.stringify(record.objects)):[];
  fpGrid=record.grid||20;fpWallThickness=record.wallThickness||15;
  fpUndoStack=[];fpRedoStack=[];fpSelectedId=null;fpZoom=1;
  $('fpGridSize').value=String(fpGrid);
  $('fpWallThickness').value=String(fpWallThickness);
  $('fpSnap').checked=true;fpSnapEnabled=true;
  $('floorplanEditorTitle').textContent=`Grundriss · ${record.name}`;
  $('floorplanModal').classList.remove('hidden');
  setFloorTool('select');applyZoom();drawFloorplan();updateSelectedInfo();
}
function closeFloorplan(){$('floorplanModal').classList.add('hidden');fpProject=null;fpRecord=null}
function setFloorTool(tool){
  fpTool=tool;fpSelectedId=null;updateSelectedInfo();
  document.querySelectorAll('.fp-tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
}
function snap(v){return fpSnapEnabled?Math.round(v/fpGrid)*fpGrid:v}
function fpPoint(ev){
  const r=fpCanvas.getBoundingClientRect(),t=ev.touches?ev.touches[0]:ev;
  return{x:(t.clientX-r.left)*fpCanvas.width/r.width,y:(t.clientY-r.top)*fpCanvas.height/r.height};
}
function uidObj(){return 'fp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cmFromPixels(px){return Math.round(px)}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function hitTest(p){
  for(let i=fpObjects.length-1;i>=0;i--){
    const o=fpObjects[i];
    if(o.type==='wall'||o.type==='dimension'){
      const A={x:o.x1,y:o.y1},B={x:o.x2,y:o.y2};
      const len=dist(A,B)||1;
      const t=Math.max(0,Math.min(1,((p.x-A.x)*(B.x-A.x)+(p.y-A.y)*(B.y-A.y))/(len*len)));
      const q={x:A.x+t*(B.x-A.x),y:A.y+t*(B.y-A.y)};
      if(dist(p,q)<20)return o;
    }else{
      const hs=70*(o.scale||1);if(Math.abs(p.x-o.x)<hs&&Math.abs(p.y-o.y)<hs)return o;
    }
  }
  return null;
}
function floorStart(ev){
  const p=fpPoint(ev);ev.preventDefault();
  if(fpTool==='select'){
    const hit=hitTest(p);fpSelectedId=hit?hit.id:null;
    if(hit){
      pushHistory();
      fpDragOffset={x:p.x-(hit.x||0),y:p.y-(hit.y||0),pStart:p,orig:JSON.parse(JSON.stringify(hit))};
      fpDrawing=true;
    }
    drawFloorplan();updateSelectedInfo();return;
  }
  if(fpTool==='wall'||fpTool==='dimension'){
    pushHistory();fpDrawing=true;fpStart={x:snap(p.x),y:snap(p.y)};
    return;
  }
  pushHistory();
  const x=snap(p.x),y=snap(p.y);
  if(fpTool==='text'){
    const text=prompt('Beschriftung eingeben:','');
    if(text)fpObjects.push({id:uidObj(),type:'text',x,y,text});
  }else{
    fpObjects.push({id:uidObj(),type:fpTool,x,y,rotation:0,scale:1});
  }
  drawFloorplan();
}
function floorMove(ev){
  const p=fpPoint(ev);ev.preventDefault();
  if(fpTool==='select'&&fpDrawing&&fpSelectedId){
    const o=fpObjects.find(x=>x.id===fpSelectedId);if(!o)return;
    const dx=p.x-fpDragOffset.pStart.x,dy=p.y-fpDragOffset.pStart.y,orig=fpDragOffset.orig;
    if(o.type==='wall'||o.type==='dimension'){
      o.x1=snap(orig.x1+dx);o.y1=snap(orig.y1+dy);o.x2=snap(orig.x2+dx);o.y2=snap(orig.y2+dy);
    }else{
      o.x=snap(orig.x+dx);o.y=snap(orig.y+dy);
    }
    drawFloorplan();return;
  }
  if(!fpDrawing||(fpTool!=='wall'&&fpTool!=='dimension'))return;
  fpPreview={id:'preview',type:fpTool,x1:fpStart.x,y1:fpStart.y,x2:snap(p.x),y2:snap(p.y),thickness:fpWallThickness};
  drawFloorplan(fpPreview);
}
function floorEnd(ev){
  if(fpTool==='select'){fpDrawing=false;fpDragOffset=null;return}
  if(!fpDrawing||(fpTool!=='wall'&&fpTool!=='dimension'))return;
  const t=ev.changedTouches&&ev.changedTouches[0]?ev.changedTouches[0]:ev,r=fpCanvas.getBoundingClientRect();
  const p={x:(t.clientX-r.left)*fpCanvas.width/r.width,y:(t.clientY-r.top)*fpCanvas.height/r.height};
  const obj={id:uidObj(),type:fpTool,x1:fpStart.x,y1:fpStart.y,x2:snap(p.x),y2:snap(p.y),thickness:fpWallThickness};
  if(dist({x:obj.x1,y:obj.y1},{x:obj.x2,y:obj.y2})>5)fpObjects.push(obj);
  fpDrawing=false;fpStart=null;fpPreview=null;drawFloorplan();ev.preventDefault();
}
function deleteSelected(){
  if(!fpSelectedId)return;
  pushHistory();fpObjects=fpObjects.filter(o=>o.id!==fpSelectedId);fpSelectedId=null;drawFloorplan();updateSelectedInfo();
}

function selectedObject(){return fpObjects.find(x=>x.id===fpSelectedId)||null}
function setSelectedRotation(value,withHistory=false){
  const o=selectedObject();if(!o||o.type==='wall'||o.type==='dimension')return;
  if(withHistory)pushHistory();
  let v=Number(value);if(!Number.isFinite(v))v=0;
  v=((v%360)+360)%360;
  o.rotation=v;
  const slider=$('fpRotation'),num=$('fpRotationNumber');
  if(slider)slider.value=String(Math.round(v));
  if(num)num.value=String(Math.round(v));
  drawFloorplan();updateSelectedInfo();
}
function setSelectedScale(value,withHistory=false){
  const o=selectedObject();if(!o||o.type==='wall'||o.type==='dimension')return;
  if(withHistory)pushHistory();
  let v=Number(value);
  if(!Number.isFinite(v))v=100;
  v=Math.max(25,Math.min(300,v));
  o.scale=v/100;
  const slider=$('fpScale'),num=$('fpScaleNumber');
  if(slider)slider.value=String(Math.round(v));
  if(num)num.value=String(Math.round(v));
  drawFloorplan();
  updateSelectedInfo();
}
function updateSelectedInfo(){
  const el=$('fpSelectedInfo');if(!el)return;
  const o=fpObjects.find(x=>x.id===fpSelectedId);
  if(!o){el.textContent='Keine Auswahl';return}
  let txt=`Ausgewählt: ${o.type}`;
  if(o.type==='wall'||o.type==='dimension')txt+=` · Länge ${cmFromPixels(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}))} cm`;
  else {
    txt+=` · Drehung ${Math.round(o.rotation||0)}° · Grösse ${Math.round((o.scale||1)*100)}%`;
    const slider=$('fpRotation'),num=$('fpRotationNumber');
    if(slider)slider.value=String(Math.round(o.rotation||0));
    if(num)num.value=String(Math.round(o.rotation||0));
    const scaleSlider=$('fpScale'),scaleNum=$('fpScaleNumber');
    const scalePct=Math.round((o.scale||1)*100);
    if(scaleSlider)scaleSlider.value=String(scalePct);
    if(scaleNum)scaleNum.value=String(scalePct);
  }
  el.textContent=txt;
}
function applyZoom(){
  fpCanvas.style.transform=`scale(${fpZoom})`;
  const wrap=fpCanvas.parentElement;
  wrap.style.setProperty('--fpzoom',fpZoom);
  $('fpZoomReset').textContent=`${Math.round(fpZoom*100)}%`;
}
function drawFloorplan(preview=null){
  fpCtx.clearRect(0,0,fpCanvas.width,fpCanvas.height);
  fpCtx.fillStyle='#fff';fpCtx.fillRect(0,0,fpCanvas.width,fpCanvas.height);

  fpCtx.strokeStyle='#eef2f7';fpCtx.lineWidth=1;
  for(let x=0;x<=fpCanvas.width;x+=fpGrid){fpCtx.beginPath();fpCtx.moveTo(x,0);fpCtx.lineTo(x,fpCanvas.height);fpCtx.stroke()}
  for(let y=0;y<=fpCanvas.height;y+=fpGrid){fpCtx.beginPath();fpCtx.moveTo(0,y);fpCtx.lineTo(fpCanvas.width,y);fpCtx.stroke()}

  fpObjects.forEach(drawFpObject);
  if(preview)drawFpObject(preview,true);
}
function drawFpObject(o,preview=false){
  fpCtx.save();
  const selected=o.id===fpSelectedId;
  fpCtx.strokeStyle=selected?'#2563eb':'#111827';
  fpCtx.fillStyle=selected?'#2563eb':'#111827';
  fpCtx.lineCap='round';fpCtx.lineJoin='round';

  if(o.type==='wall'){
    fpCtx.lineWidth=Math.max(8,(o.thickness||15)/2);
    fpCtx.beginPath();fpCtx.moveTo(o.x1,o.y1);fpCtx.lineTo(o.x2,o.y2);fpCtx.stroke();
    if(!preview){
      const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2;
      fpCtx.font='18px Arial';fpCtx.textAlign='center';fpCtx.fillStyle='#334155';
      fpCtx.fillText(`${cmFromPixels(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}))} cm`,mx,my-14);
    }
  }else if(o.type==='dimension'){
    fpCtx.lineWidth=2;
    fpCtx.beginPath();fpCtx.moveTo(o.x1,o.y1);fpCtx.lineTo(o.x2,o.y2);fpCtx.stroke();
    const ang=Math.atan2(o.y2-o.y1,o.x2-o.x1);
    for(const P of [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]){
      fpCtx.beginPath();
      fpCtx.moveTo(P.x-8*Math.cos(ang+Math.PI/2),P.y-8*Math.sin(ang+Math.PI/2));
      fpCtx.lineTo(P.x+8*Math.cos(ang+Math.PI/2),P.y+8*Math.sin(ang+Math.PI/2));fpCtx.stroke();
    }
    const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2;
    fpCtx.font='bold 20px Arial';fpCtx.textAlign='center';fpCtx.fillText(`${cmFromPixels(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}))} cm`,mx,my-10);
  }else{
    fpCtx.translate(o.x||0,o.y||0);
    fpCtx.rotate((o.rotation||0)*Math.PI/180);
    fpCtx.scale(o.scale||1,o.scale||1);
    const ox=o.x||0,oy=o.y||0;
    fpCtx.translate(-ox,-oy);
    if(o.type==='door'){
    fpCtx.lineWidth=5;fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.arc(o.x-45,o.y,90,0,-Math.PI/2,true);fpCtx.stroke();
  }else if(o.type==='window'){
    fpCtx.lineWidth=5;fpCtx.strokeRect(o.x-55,o.y-10,110,20);fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();
  }else if(o.type==='wc'){
    fpCtx.lineWidth=4;fpCtx.beginPath();fpCtx.ellipse(o.x,o.y+15,34,44,0,0,Math.PI*2);fpCtx.stroke();fpCtx.strokeRect(o.x-32,o.y-45,64,28);fpCtx.font='bold 22px Arial';fpCtx.textAlign='center';fpCtx.fillText('WC',o.x,o.y+22);
  }else if(o.type==='shower'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-50,o.y-50,100,100);fpCtx.font='18px Arial';fpCtx.textAlign='center';fpCtx.fillText('Dusche',o.x,o.y+5);
  }else if(o.type==='bathtub'){
    fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-90,o.y-40,180,80);fpCtx.beginPath();fpCtx.roundRect(o.x-75,o.y-28,150,56,25);fpCtx.stroke();fpCtx.font='16px Arial';fpCtx.textAlign='center';fpCtx.fillText('Badewanne',o.x,o.y+5);
  }else if(o.type==='sink'){
    fpCtx.lineWidth=4;fpCtx.beginPath();fpCtx.ellipse(o.x,o.y,48,30,0,0,Math.PI*2);fpCtx.stroke();fpCtx.font='17px Arial';fpCtx.textAlign='center';fpCtx.fillText('Lavabo',o.x,o.y+55);
  }else if(o.type==='drain'){
    fpCtx.lineWidth=3;fpCtx.strokeRect(o.x-18,o.y-18,36,36);fpCtx.beginPath();fpCtx.moveTo(o.x-14,o.y-14);fpCtx.lineTo(o.x+14,o.y+14);fpCtx.moveTo(o.x+14,o.y-14);fpCtx.lineTo(o.x-14,o.y+14);fpCtx.stroke();
  }else if(o.type==='text'){
    fpCtx.font='bold 24px Arial';fpCtx.textAlign='left';fpCtx.fillText(o.text,o.x,o.y);
  }
  }
  if(selected&&o.type!=='wall'&&o.type!=='dimension'){
    fpCtx.strokeStyle='#2563eb';fpCtx.lineWidth=2;fpCtx.setLineDash([6,4]);const ss=65*(o.scale||1);fpCtx.strokeRect(o.x-ss,o.y-ss,ss*2,ss*2);
  }
  fpCtx.restore();
}
function initFloorplanControls(){
  const newBtn=$('newFloorplanBtn');if(newBtn)newBtn.onclick=createNewFloorplan;
  const cancelName=$('cancelFloorplanName');if(cancelName)cancelName.onclick=cancelNewFloorplan;
  const confirmName=$('confirmFloorplanName');if(confirmName)confirmName.onclick=confirmNewFloorplan;
  const nameInput=$('floorplanNameInput');if(nameInput)nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')confirmNewFloorplan()});
  document.querySelectorAll('.fp-tool').forEach(b=>b.onclick=()=>setFloorTool(b.dataset.tool));
  $('closeFloorplan').onclick=closeFloorplan;
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
  $('fpDeleteSelected').onclick=deleteSelected;
  $('fpClear').onclick=()=>{if(confirm('Grundriss vollständig löschen?')){pushHistory();fpObjects=[];fpSelectedId=null;drawFloorplan();updateSelectedInfo()}};
  $('fpSave').onclick=()=>{if(!fpRecord)return;drawFloorplan();fpRecord.objects=cloneObjects();fpRecord.image=fpCanvas.toDataURL('image/png');fpRecord.grid=fpGrid;fpRecord.wallThickness=fpWallThickness;save();closeFloorplan()};
  $('fpGridSize').onchange=e=>{fpGrid=Number(e.target.value)||20;drawFloorplan()};
  $('fpWallThickness').onchange=e=>{fpWallThickness=Number(e.target.value)||15};
  $('fpSnap').onchange=e=>{fpSnapEnabled=e.target.checked};
  $('fpZoomOut').onclick=()=>{fpZoom=Math.max(.5,fpZoom-.1);applyZoom()};
  $('fpZoomIn').onclick=()=>{fpZoom=Math.min(2,fpZoom+.1);applyZoom()};
  $('fpZoomReset').onclick=()=>{fpZoom=1;applyZoom()};
}
function initFloorplanCanvas(){
  fpCanvas.addEventListener('mousedown',floorStart);fpCanvas.addEventListener('mousemove',floorMove);window.addEventListener('mouseup',floorEnd);
  fpCanvas.addEventListener('touchstart',floorStart,{passive:false});fpCanvas.addEventListener('touchmove',floorMove,{passive:false});fpCanvas.addEventListener('touchend',floorEnd,{passive:false});
}
initFloorplanControls();initFloorplanCanvas();

render();
