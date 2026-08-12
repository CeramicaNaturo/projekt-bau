
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
$('printReport').onclick=()=>generateDirectPDFReport();

function render(){
  let b=$('projects');b.innerHTML=S.projects.length?'':'Noch keine Projekte vorhanden.';
  S.projects.forEach(p=>{let d=document.createElement('div');d.className='project';d.innerHTML=`<div><b>${esc(p.name)}</b><div class=muted>${esc(p.address||'Keine Adresse')} · ${p.areas.length} Bereiche</div></div><button class=secondary>Öffnen</button>`;d.querySelector('button').onclick=()=>{A=p.id;render()};b.appendChild(d)});
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

  const pdfTab=window.open('about:blank','_blank');

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
let fpDrawing=false,fpStart=null,fpPreview=null,fpSelectedId=null,fpDragOffset=null;
let fpZoom=1,fpGrid=5,fpFineStep=1,fpWallThickness=15,fpSnapEnabled=true,fpShowGrid=true,fpShowPositions=true,fpShowMeasures=true,fpAngleSnap=true,fpActiveLayer='walls',fpPanStart=null,fpLayerVisibility={walls:true,openings:true,sanitary:true,furniture:true,notes:true},fpEndpointDrag=null;

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
  if(type==='door'||type==='window')return 'openings';
  if(['wc','shower','bathtub','sink','drain','kitchenSink'].includes(type))return 'sanitary';
  if(['stove','fridge','washingMachine','table','chair','sofa','bed','cabinet','plant'].includes(type))return 'furniture';
  return 'notes';
}

function isLayerVisible(o){
  return fpLayerVisibility[layerForType(o.type)]!==false;
}

function snapAnglePoint(start,p){
  if(!fpAngleSnap)return {x:snap(p.x),y:snap(p.y)};
  const dx=p.x-start.x,dy=p.y-start.y;
  const len=Math.hypot(dx,dy);
  if(len<1)return {x:start.x,y:start.y};
  const step=Math.PI/4;
  const ang=Math.atan2(dy,dx);
  const snapped=Math.round(ang/step)*step;
  return {
    x:snap(start.x+Math.cos(snapped)*len),
    y:snap(start.y+Math.sin(snapped)*len)
  };
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

function updateWallEndpointFields(){
  const o=selectedObject();
  const ids=['fpWallX1','fpWallY1','fpWallX2','fpWallY2'];
  if(!o||o.type!=='wall'){
    ids.forEach(id=>{const el=$(id);if(el)el.value='';});
    return;
  }
  const map={fpWallX1:o.x1,fpWallY1:o.y1,fpWallX2:o.x2,fpWallY2:o.y2};
  Object.entries(map).forEach(([id,val])=>{const el=$(id);if(el)el.value=Math.round(val);});
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
      ${fp.image?`<img src="${fp.image}" alt="${esc(fp.name||'Grundriss')}">`:''}<div class="floorplan-card-actions"><button class="secondary editFp">Bearbeiten</button><button class="danger delFp">Löschen</button></div>`;
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

function openFloorplan(project,record){
  fpProject=project;fpRecord=record;
  fpObjects=Array.isArray(record.objects)?JSON.parse(JSON.stringify(record.objects)):[];
  fpGrid=record.grid||5;fpFineStep=record.fineStep||1;fpWallThickness=record.wallThickness||15;
  fp3DMode=false;fp3DOptions=record.threeDOptions||{floorMaterialId:'',wallMaterialId:'',showCeiling:false,tileOriginX:0,tileOriginY:0,tileRotation:0};fpUndoStack=[];fpRedoStack=[];fpSelectedId=null;fpZoom=1;fpActiveLayer=record.activeLayer||'walls';fpLayerVisibility=record.layerVisibility||{walls:true,openings:true,sanitary:true,furniture:true,notes:true};
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
  if(posToggle)posToggle.checked=true;
  if(measureToggle)measureToggle.checked=true;
  fpShowGrid=true;fpShowPositions=true;fpShowMeasures=true;
  $('floorplanEditorTitle').textContent=`Grundriss · ${record.name}`;
  $('floorplanModal').classList.remove('hidden');
  setFloorTool('select');setFloorplanView('2d');drawFloorplan();updateSelectedInfo();requestAnimationFrame(()=>requestAnimationFrame(fitFloorplan2D));
}
function closeFloorplan(){$('floorplanModal').classList.add('hidden');fpProject=null;fpRecord=null}
function setFloorTool(tool){
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
  return {
    x:(ev.clientX-r.left)*(fpCanvas.width/r.width),
    y:(ev.clientY-r.top)*(fpCanvas.height/r.height)
  };
}
function uidObj(){return 'fp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cmFromPixels(px){return Math.round(px)}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function hitTest(p){
  for(let i=fpObjects.length-1;i>=0;i--){
    const o=fpObjects[i]; if(!isLayerVisible(o))continue;
    if(o.type==='wall'){
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
  if(!fpCanvas)return;
  ev.preventDefault();

  const p=fpPoint(ev);
  updateCadMousePosition(p);

  if(fpTool==='pan'){
    const wrap=fpCanvas.parentElement;
    fpPanStart={x:ev.clientX,y:ev.clientY,scrollLeft:wrap.scrollLeft,scrollTop:wrap.scrollTop};
    fpDrawing=true;
    return;
  }

  if(fpTool==='select'){
    const hit=hitTest(p);
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
    fpStart={x:snap(p.x),y:snap(p.y)};
    fpPreview={
      id:'preview',
      type:fpTool,
      x1:fpStart.x,
      y1:fpStart.y,
      x2:fpStart.x,
      y2:fpStart.y,
      thickness:fpWallThickness,
      layer:'walls'
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
  const x=snap(p.x),y=snap(p.y);

  if(fpTool==='text'){
    const text=prompt('Beschriftung eingeben:','');
    if(text){
      fpObjects.push({id:uidObj(),type:'text',x,y,text,rotation:0,scale:1,layer:'notes'});
    }
  }else{
    const dims={
      door:[90,15],window:[100,15],wc:[40,70],shower:[90,90],
      bathtub:[180,80],sink:[60,50],drain:[15,15],
      kitchenSink:[60,60],stove:[60,60],fridge:[60,65],washingMachine:[60,65],
      table:[160,90],chair:[50,50],sofa:[220,90],bed:[200,100],cabinet:[120,60],plant:[45,45]
    };
    const d=dims[fpTool]||[60,40];
    fpObjects.push({
      id:uidObj(),type:fpTool,x,y,rotation:0,scale:1,
      widthCm:d[0],depthCm:d[1],layer:layerForType(fpTool)
    });
  }
  drawFloorplan();
}

function floorMove(ev){
  if(!fpDrawing)return;
  ev.preventDefault();

  const p=fpPoint(ev);

  if(fpTool==='pan' && fpPanStart){
    const wrap=fpCanvas.parentElement;
    wrap.scrollLeft=fpPanStart.scrollLeft-(ev.clientX-fpPanStart.x);
    wrap.scrollTop=fpPanStart.scrollTop-(ev.clientY-fpPanStart.y);
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
    }else{
      o.x=snap(orig.x+dx);
      o.y=snap(orig.y+dy);
    }
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if((fpTool==='wall') && fpStart){
    const ep=snapAnglePoint(fpStart,p);
    fpPreview={
      id:'preview',
      type:fpTool,
      x1:fpStart.x,
      y1:fpStart.y,
      x2:ep.x,
      y2:ep.y,
      thickness:fpWallThickness,
      layer:'walls'
    };
    drawFloorplan(fpPreview);
  }
}

function floorEnd(ev){
  if(!fpDrawing)return;
  ev.preventDefault();

  if(fpTool==='pan'){
    fpDrawing=false;fpPanStart=null;return;
  }

  if(fpTool==='select'){
    fpDrawing=false;
    fpDragOffset=null;
    fpEndpointDrag=null;
    return;
  }

  if((fpTool==='wall') && fpStart){
    const p=fpPoint(ev);
    const obj={
      id:uidObj(),
      type:fpTool,
      x1:fpStart.x,
      y1:fpStart.y,
      x2:snap(p.x),
      y2:snap(p.y),
      thickness:fpWallThickness
    };

    const length=dist({x:obj.x1,y:obj.y1},{x:obj.x2,y:obj.y2});
    if(length>=8){
      fpObjects.push(obj);
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
    o.x=x;o.y=y;
  }

  drawFloorplan();
  updateSelectedInfo();
}

function setSelectedRotation(value,withHistory=false){
  const o=selectedObject();if(!o||o.type==='wall')return;
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
  const o=selectedObject();if(!o||o.type==='wall')return;
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

function setSelectedDimensions(){
  const o=selectedObject();
  if(!o||o.type==='wall'||o.type==='text')return;
  const w=Number($('fpObjectWidth').value),d=Number($('fpObjectDepth').value);
  if(!Number.isFinite(w)||!Number.isFinite(d)||w<=0||d<=0)return;
  pushHistory();
  o.widthCm=w;o.depthCm=d;
  drawFloorplan();updateSelectedInfo();
}
function updateSelectedInfo(){
  const el=$('fpSelectedInfo');if(!el)return;
  const o=fpObjects.find(x=>x.id===fpSelectedId);
  if(!o){el.textContent='Keine Auswahl';return}
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
  el.textContent=txt;
  updateCadInspector();
  updateWallEndpointFields();
}
function applyZoom(){
  if(!fpCanvas)return;
  fpCanvas.style.transform='none';
  fpCanvas.style.width=`${Math.max(1,Math.round(fpCanvas.width*fpZoom))}px`;
  fpCanvas.style.height=`${Math.max(1,Math.round(fpCanvas.height*fpZoom))}px`;
  const reset=$('fpZoomReset');
  if(reset)reset.textContent=`${Math.round(fpZoom*100)}%`;
  drawCadRulers();
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

function centerFloorplan2D(){
  if(fp3DMode)return;
  const wrap=fpCanvas?.parentElement;
  const b=getFloorplanBounds(fpObjects);
  if(!wrap||!b)return;
  const cx=((b.minX+b.maxX)/2)*fpZoom;
  const cy=((b.minY+b.maxY)/2)*fpZoom;
  wrap.scrollLeft=Math.max(0,cx-wrap.clientWidth/2);
  wrap.scrollTop=Math.max(0,cy-wrap.clientHeight/2);
}

function fitFloorplan2D(){
  if(fp3DMode||!fpCanvas)return;
  const wrap=fpCanvas.parentElement;
  const b=getFloorplanBounds(fpObjects);
  if(!wrap)return;

  if(!b){
    fpZoom=1;
    applyZoom();
    wrap.scrollLeft=0;wrap.scrollTop=0;
    return;
  }

  const margin=80;
  const vw=Math.max(240,wrap.clientWidth);
  const vh=Math.max(240,wrap.clientHeight);
  const bw=Math.max(80,b.maxX-b.minX);
  const bh=Math.max(80,b.maxY-b.minY);

  fpZoom=Math.max(.25,Math.min(1.6,(vw-margin*2)/bw,(vh-margin*2)/bh));
  applyZoom();
  requestAnimationFrame(centerFloorplan2D);
}

function drawFloorplan(preview=null){
  if(!preview){updateFloorRoomInfo();updateCadInspector();drawCadRulers();refresh3D();}

  fpCtx.clearRect(0,0,fpCanvas.width,fpCanvas.height);
  fpCtx.fillStyle='#ffffff';
  fpCtx.fillRect(0,0,fpCanvas.width,fpCanvas.height);

  if(fpShowGrid){
    // feines 10-cm Raster + stärkeres Hauptraster
    for(let x=0;x<=fpCanvas.width;x+=10){
      fpCtx.beginPath();
      fpCtx.strokeStyle=(x%100===0)?'#cbd5e1':'#eef2f7';
      fpCtx.lineWidth=(x%100===0)?1.2:.6;
      fpCtx.moveTo(x,0);fpCtx.lineTo(x,fpCanvas.height);fpCtx.stroke();
    }
    for(let y=0;y<=fpCanvas.height;y+=10){
      fpCtx.beginPath();
      fpCtx.strokeStyle=(y%100===0)?'#cbd5e1':'#eef2f7';
      fpCtx.lineWidth=(y%100===0)?1.2:.6;
      fpCtx.moveTo(0,y);fpCtx.lineTo(fpCanvas.width,y);fpCtx.stroke();
    }
  }

  fpObjects.filter(isLayerVisible).forEach(drawFpObject);

  if(preview){
    fpCtx.save();
    fpCtx.globalAlpha=.65;
    drawFpObject(preview,true);
    fpCtx.restore();
  }

  // Fliesenstartpunkt im 2D-Plan
  if(Number.isFinite(Number(fp3DOptions.tileOriginX)) && Number.isFinite(Number(fp3DOptions.tileOriginY))){
    const tx=Number(fp3DOptions.tileOriginX),ty=Number(fp3DOptions.tileOriginY);
    fpCtx.save();
    fpCtx.strokeStyle='#2563eb';
    fpCtx.fillStyle='#2563eb';
    fpCtx.lineWidth=2;
    fpCtx.beginPath();fpCtx.arc(tx,ty,9,0,Math.PI*2);fpCtx.stroke();
    fpCtx.beginPath();
    fpCtx.moveTo(tx-16,ty);fpCtx.lineTo(tx+16,ty);
    fpCtx.moveTo(tx,ty-16);fpCtx.lineTo(tx,ty+16);
    fpCtx.stroke();
    fpCtx.font='bold 12px Arial';
    fpCtx.textAlign='left';
    fpCtx.fillText(`Fliesenstart X ${Math.round(tx)} · Y ${Math.round(ty)} cm`,tx+14,ty-12);
    fpCtx.restore();
  }

  // Raum-Informationsblock mittig im geschlossenen Bereich
  if(fpRecord){
    const area=calculateFloorAreaM2(fpObjects);
    const bounds=getFloorplanBounds(fpObjects);
    const cx=bounds?(bounds.minX+bounds.maxX)/2:fpCanvas.width/2;
    const cy=bounds?(bounds.minY+bounds.maxY)/2:fpCanvas.height/2;
    const boxW=250,boxH=112;

    fpCtx.save();
    fpCtx.fillStyle='rgba(255,255,255,.96)';
    fpCtx.strokeStyle='#94a3b8';
    fpCtx.lineWidth=1.5;
    fpCtx.roundRect(cx-boxW/2,cy-boxH/2,boxW,boxH,8);
    fpCtx.fill();fpCtx.stroke();

    fpCtx.fillStyle='#0f172a';
    fpCtx.font='bold 22px Arial';
    fpCtx.textAlign='center';
    fpCtx.fillText((fpRecord.name||'Grundriss').toUpperCase(),cx,cy-27);

    fpCtx.font='13px Arial';
    fpCtx.fillText('Bodenfläche',cx,cy-5);
    fpCtx.font='bold 24px Arial';
    fpCtx.fillText(area===null?'—':`${formatCHNumber(area,2)} m²`,cx,cy+22);

    fpCtx.font='13px Arial';
    fpCtx.fillStyle='#475569';
    fpCtx.fillText(fpRecord.roomHeightM?`Raumhöhe: ${formatCHNumber(fpRecord.roomHeightM,2)} m`:'Raumhöhe: —',cx,cy+45);
    fpCtx.restore();
  }
}

function drawMeasureText(text,x,y,angle=0){
  if(!fpShowMeasures)return;
  fpCtx.save();
  fpCtx.translate(x,y);
  fpCtx.rotate(angle);

  fpCtx.font='bold 15px Arial';
  fpCtx.textAlign='center';
  fpCtx.textBaseline='middle';

  const pad=5;
  const w=fpCtx.measureText(text).width+pad*2;
  fpCtx.fillStyle='rgba(255,255,255,.96)';
  fpCtx.strokeStyle='#cbd5e1';
  fpCtx.lineWidth=1;
  fpCtx.fillRect(-w/2,-11,w,22);
  fpCtx.strokeRect(-w/2,-11,w,22);

  fpCtx.fillStyle='#0f172a';
  fpCtx.fillText(text,0,0);
  fpCtx.restore();
}

function drawPositionText(o,x,y){
  if(!fpShowPositions)return;
  fpCtx.save();
  fpCtx.font='12px Arial';
  fpCtx.textAlign='center';
  fpCtx.fillStyle='#64748b';
  fpCtx.fillText(`X ${Math.round(x)} · Y ${Math.round(y)} cm`,x,y);
  fpCtx.restore();
}

function drawFpObject(o,preview=false){
  fpCtx.save();

  const selected=o.id===fpSelectedId;
  fpCtx.strokeStyle=selected?'#2563eb':'#111827';
  fpCtx.fillStyle=selected?'#2563eb':'#111827';
  fpCtx.lineCap='square';
  fpCtx.lineJoin='miter';

  if(o.type==='wall'){
    const thicknessPx=Math.max(8,(o.thickness||15)/2);
    fpCtx.lineWidth=thicknessPx;
    fpCtx.beginPath();
    fpCtx.moveTo(o.x1,o.y1);
    fpCtx.lineTo(o.x2,o.y2);
    fpCtx.stroke();

    if(!preview){
      const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2;
      const len=cmFromPixels(dist({x:o.x1,y:o.y1},{x:o.x2,y:o.y2}));
      const ang=Math.atan2(o.y2-o.y1,o.x2-o.x1);

      drawMeasureText(`${len} cm`,mx,my-20,0);
      drawPositionText(o,mx,my+28);

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
  fpCtx.scale(o.scale||1,o.scale||1);
  const ox=o.x||0,oy=o.y||0;
  fpCtx.translate(-ox,-oy);

  if(o.type==='door'){
    fpCtx.lineWidth=5;
    fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();
    fpCtx.beginPath();fpCtx.arc(o.x-45,o.y,90,0,-Math.PI/2,true);fpCtx.stroke();

  }else if(o.type==='window'){
    fpCtx.lineWidth=4;
    fpCtx.strokeRect(o.x-55,o.y-10,110,20);
    fpCtx.beginPath();
    fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();

  }else if(o.type==='wc'){
    fpCtx.lineWidth=4;
    fpCtx.beginPath();fpCtx.ellipse(o.x,o.y+15,34,44,0,0,Math.PI*2);fpCtx.stroke();
    fpCtx.strokeRect(o.x-32,o.y-45,64,28);
    fpCtx.font='bold 18px Arial';fpCtx.textAlign='center';fpCtx.fillText('WC',o.x,o.y+21);

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
    const ss=72*(o.scale||1);
    fpCtx.strokeRect(o.x-ss,o.y-ss,ss*2,ss*2);
    fpCtx.restore();
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
      set('cadPropRotation','–');
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
  const duplicate=$('fpDuplicate');if(duplicate)duplicate.onclick=duplicateSelected;
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

  const objW=$('fpObjectWidth'),objD=$('fpObjectDepth');
  if(objW)objW.onchange=setSelectedDimensions;
  if(objD)objD.onchange=setSelectedDimensions;
  const objX=$('fpObjectX'),objY=$('fpObjectY');
  if(objX)objX.onchange=setSelectedPosition;
  if(objY)objY.onchange=setSelectedPosition;
  $('fpDeleteSelected').onclick=deleteSelected;
  $('fpClear').onclick=()=>{if(confirm('Grundriss vollständig löschen?')){pushHistory();fpObjects=[];fpSelectedId=null;drawFloorplan();updateSelectedInfo()}};
  $('fpSave').onclick=()=>{if(!fpRecord)return;drawFloorplan();fpRecord.objects=cloneObjects();fpRecord.image=fpCanvas.toDataURL('image/png');fpRecord.grid=fpGrid;fpRecord.fineStep=fpFineStep;fpRecord.wallThickness=fpWallThickness;fpRecord.activeLayer=fpActiveLayer;fpRecord.layerVisibility={...fpLayerVisibility};fpRecord.threeDOptions={...fp3DOptions};fpRecord.floorAreaM2=calculateFloorAreaM2(fpObjects);save();closeFloorplan()};
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
  $('fpZoomOut').onclick=()=>{fpZoom=Math.max(.25,fpZoom-.1);applyZoom();requestAnimationFrame(centerFloorplan2D)};
  $('fpZoomIn').onclick=()=>{fpZoom=Math.min(3,fpZoom+.1);applyZoom();requestAnimationFrame(centerFloorplan2D)};
  $('fpZoomReset').onclick=()=>{fpZoom=1;applyZoom();requestAnimationFrame(centerFloorplan2D)};
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
        o.x=(o.x||0)+dx;o.y=(o.y||0)+dy;
      }
      drawFloorplan();updateSelectedInfo();
    }
  });
}

function initFloorplanCanvas(){
  if(!fpCanvas)return;

  fpCanvas.style.touchAction='none';

  fpCanvas.onpointerdown=e=>{
    if(e.button!==undefined && e.button!==0 && e.pointerType==='mouse')return;
    try{fpCanvas.setPointerCapture(e.pointerId)}catch(_){}
    floorStart(e);
  };

  fpCanvas.onpointermove=e=>{
    if(fpDrawing)floorMove(e);
  };

  fpCanvas.onpointerup=e=>{
    floorEnd(e);
    try{fpCanvas.releasePointerCapture(e.pointerId)}catch(_){}
  };

  fpCanvas.onpointercancel=e=>{
    if(fpDrawing){
      fpDrawing=false;
      fpStart=null;
      fpPreview=null;
      drawFloorplan();
    }
    try{fpCanvas.releasePointerCapture(e.pointerId)}catch(_){}
  };
}
initCadShell();initTileTools();initFloorplanControls();initFloorplanCanvas();initCadKeyboard();

render();
