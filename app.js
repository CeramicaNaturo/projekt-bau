
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

let fpProject=null,fpRecord=null,fpTool='wall',fpObjects=[],fpDrawing=false,fpStart=null;
const fpCanvas=$('floorplanCanvas'),fpCtx=fpCanvas.getContext('2d');

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
  if(!p){
    alert('Bitte zuerst ein Projekt öffnen.');
    return;
  }
  const modal=$('floorplanNameModal');
  const input=$('floorplanNameInput');
  if(!modal||!input){
    alert('Grundriss-Dialog konnte nicht geöffnet werden.');
    return;
  }
  input.value='';
  modal.classList.remove('hidden');
  setTimeout(()=>input.focus(),50);
}

function cancelNewFloorplan(){
  const modal=$('floorplanNameModal');
  if(modal)modal.classList.add('hidden');
}

function confirmNewFloorplan(){
  const p=cur();
  const input=$('floorplanNameInput');
  if(!p||!input)return;
  const name=input.value.trim();
  if(!name){
    alert('Bitte einen Namen für den Grundriss eingeben.');
    input.focus();
    return;
  }
  p.floorplans=p.floorplans||[];
  const fp={id:u(),name,objects:[],image:null};
  p.floorplans.push(fp);
  localStorage.setItem(K3,JSON.stringify(S));
  render();
  cancelNewFloorplan();
  openFloorplan(p,fp);
}
function openFloorplan(project,record){fpProject=project;fpRecord=record;fpObjects=Array.isArray(record.objects)?JSON.parse(JSON.stringify(record.objects)):[];$('floorplanEditorTitle').textContent=`Grundriss · ${record.name}`;$('floorplanModal').classList.remove('hidden');setFloorTool('wall');drawFloorplan()}
function closeFloorplan(){$('floorplanModal').classList.add('hidden');fpProject=null;fpRecord=null}
function setFloorTool(tool){fpTool=tool;document.querySelectorAll('.fp-tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool))}
function initFloorplanControls(){
  const newBtn=$('newFloorplanBtn');
  if(newBtn)newBtn.onclick=createNewFloorplan;
  const cancelName=$('cancelFloorplanName');
  if(cancelName)cancelName.onclick=cancelNewFloorplan;
  const confirmName=$('confirmFloorplanName');
  if(confirmName)confirmName.onclick=confirmNewFloorplan;
  const nameInput=$('floorplanNameInput');
  if(nameInput)nameInput.addEventListener('keydown',e=>{
    if(e.key==='Enter')confirmNewFloorplan();
  });
  document.querySelectorAll('.fp-tool').forEach(b=>b.onclick=()=>setFloorTool(b.dataset.tool));
  const closeBtn=$('closeFloorplan'); if(closeBtn)closeBtn.onclick=closeFloorplan;
  const undoBtn=$('fpUndo'); if(undoBtn)undoBtn.onclick=()=>{fpObjects.pop();drawFloorplan()};
  const clearBtn=$('fpClear'); if(clearBtn)clearBtn.onclick=()=>{if(confirm('Grundriss vollständig löschen?')){fpObjects=[];drawFloorplan()}};
  const saveBtn=$('fpSave'); if(saveBtn)saveBtn.onclick=()=>{if(!fpRecord)return;drawFloorplan();fpRecord.objects=JSON.parse(JSON.stringify(fpObjects));fpRecord.image=fpCanvas.toDataURL('image/png');save();closeFloorplan()};
}
function fpPoint(ev){const r=fpCanvas.getBoundingClientRect(),t=ev.touches?ev.touches[0]:ev;return{x:(t.clientX-r.left)*fpCanvas.width/r.width,y:(t.clientY-r.top)*fpCanvas.height/r.height}}
function snap(v){return Math.round(v/20)*20}
function floorStart(ev){const p=fpPoint(ev);ev.preventDefault();if(fpTool==='wall'){fpDrawing=true;fpStart={x:snap(p.x),y:snap(p.y)};return}const x=snap(p.x),y=snap(p.y);if(fpTool==='text'){const text=prompt('Beschriftung eingeben:','');if(text)fpObjects.push({type:'text',x,y,text})}else fpObjects.push({type:fpTool,x,y});drawFloorplan()}
function floorMove(ev){if(!fpDrawing||fpTool!=='wall')return;const p=fpPoint(ev);ev.preventDefault();drawFloorplan({type:'wall',x1:fpStart.x,y1:fpStart.y,x2:snap(p.x),y2:snap(p.y)})}
function floorEnd(ev){if(!fpDrawing||fpTool!=='wall')return;const t=ev.changedTouches&&ev.changedTouches[0]?ev.changedTouches[0]:ev,r=fpCanvas.getBoundingClientRect(),p={x:(t.clientX-r.left)*fpCanvas.width/r.width,y:(t.clientY-r.top)*fpCanvas.height/r.height};fpObjects.push({type:'wall',x1:fpStart.x,y1:fpStart.y,x2:snap(p.x),y2:snap(p.y)});fpDrawing=false;fpStart=null;drawFloorplan();ev.preventDefault()}
function initFloorplanCanvas(){
  if(!fpCanvas)return;
  fpCanvas.addEventListener('mousedown',floorStart);
  fpCanvas.addEventListener('mousemove',floorMove);
  window.addEventListener('mouseup',floorEnd);
  fpCanvas.addEventListener('touchstart',floorStart,{passive:false});
  fpCanvas.addEventListener('touchmove',floorMove,{passive:false});
  fpCanvas.addEventListener('touchend',floorEnd,{passive:false});
}
function drawFloorplan(preview=null){fpCtx.clearRect(0,0,fpCanvas.width,fpCanvas.height);fpCtx.fillStyle='#fff';fpCtx.fillRect(0,0,fpCanvas.width,fpCanvas.height);fpCtx.strokeStyle='#eef0f3';fpCtx.lineWidth=1;for(let x=0;x<=fpCanvas.width;x+=20){fpCtx.beginPath();fpCtx.moveTo(x,0);fpCtx.lineTo(x,fpCanvas.height);fpCtx.stroke()}for(let y=0;y<=fpCanvas.height;y+=20){fpCtx.beginPath();fpCtx.moveTo(0,y);fpCtx.lineTo(fpCanvas.width,y);fpCtx.stroke()}[...fpObjects,...(preview?[preview]:[])].forEach(drawFpObject)}
function drawFpObject(o){fpCtx.save();fpCtx.strokeStyle='#111827';fpCtx.fillStyle='#111827';fpCtx.lineWidth=8;fpCtx.lineCap='round';fpCtx.lineJoin='round';if(o.type==='wall'){fpCtx.beginPath();fpCtx.moveTo(o.x1,o.y1);fpCtx.lineTo(o.x2,o.y2);fpCtx.stroke()}else if(o.type==='door'){fpCtx.lineWidth=5;fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();fpCtx.beginPath();fpCtx.arc(o.x-45,o.y,90,0,-Math.PI/2,true);fpCtx.stroke()}else if(o.type==='window'){fpCtx.lineWidth=5;fpCtx.strokeRect(o.x-55,o.y-10,110,20);fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke()}else if(o.type==='wc'){fpCtx.lineWidth=4;fpCtx.beginPath();fpCtx.ellipse(o.x,o.y+15,34,44,0,0,Math.PI*2);fpCtx.stroke();fpCtx.strokeRect(o.x-32,o.y-45,64,28);fpCtx.font='bold 22px Arial';fpCtx.textAlign='center';fpCtx.fillText('WC',o.x,o.y+22)}else if(o.type==='shower'){fpCtx.lineWidth=4;fpCtx.strokeRect(o.x-50,o.y-50,100,100);fpCtx.font='18px Arial';fpCtx.textAlign='center';fpCtx.fillText('Dusche',o.x,o.y+5)}else if(o.type==='sink'){fpCtx.lineWidth=4;fpCtx.beginPath();fpCtx.ellipse(o.x,o.y,48,30,0,0,Math.PI*2);fpCtx.stroke();fpCtx.font='17px Arial';fpCtx.textAlign='center';fpCtx.fillText('Lavabo',o.x,o.y+55)}else if(o.type==='text'){fpCtx.font='bold 24px Arial';fpCtx.textAlign='left';fpCtx.fillText(o.text,o.x,o.y)}fpCtx.restore()}

initFloorplanControls();
initFloorplanCanvas();
render();
