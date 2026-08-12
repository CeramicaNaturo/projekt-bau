
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
let fpDrawing=false,fpStart=null,fpPreview=null,fpSelectedId=null,fpDragOffset=null,fpLastWallEnd=null,fpObjectRotateDrag=null,fpPinchState=null;
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
  if(type==='door'||type==='window')return 'openings';
  if(['wc','shower','bathtub','sink','drain','kitchenSink'].includes(type))return 'sanitary';
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

  const text=`${len} cm`;
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
  const panel=$('fpOpeningPanel'),sel=$('fpOpeningDirection'),title=$('fpOpeningTitle');
  const isOpening=!!o&&(o.type==='door'||o.type==='window');
  if(panel)panel.classList.toggle('hidden',!isOpening);
  if(!isOpening)return;
  if(title)title.textContent=o.type==='door'?'Tür':'Fenster';
  if(sel)sel.value=o.openingDirection||'right';
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
  refreshWallLetters();
  fpGrid=record.grid||5;fpFineStep=record.fineStep||1;fpWallThickness=record.wallThickness||15;
  fp3DMode=false;fp3DOptions=record.threeDOptions||{floorMaterialId:'',wallMaterialId:'',showCeiling:false,tileOriginX:0,tileOriginY:0,tileRotation:0};fpUndoStack=[];fpRedoStack=[];fpSelectedId=null;fpLastWallEnd=null;fpZoom=1;fpActiveLayer=record.activeLayer||'walls';fpLayerVisibility=record.layerVisibility||{walls:true,openings:true,sanitary:true,furniture:true,notes:true};
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
  setTimeout(()=>{initTabletCadUi();if(fp3DMode)window.ProjectBau3D?.fitView?.();else fitFloorplan2D?.();},220);
  setTimeout(()=>{if(fp3DMode)window.ProjectBau3D?.fitView?.();else fitFloorplan2D?.();},180);
  setTimeout(()=>{if(!fp3DMode)fitFloorplan2D?.();},420);
  setFloorTool('select');setFloorplanView('2d');drawFloorplan();updateSelectedInfo();requestAnimationFrame(()=>requestAnimationFrame(()=>{fitFloorplan2D();setTimeout(fitFloorplan2D,120)}));
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
      snappedToTarget:false
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
    const newObj={
      id:uidObj(),type:fpTool,x,y,rotation:0,scale:1,
      widthCm:d[0],depthCm:d[1],layer:layerForType(fpTool),
      openingDirection:(fpTool==='door'||fpTool==='window')?'right':undefined
    };
    const placed=constrainObjectPlacement(newObj,x,y);
    newObj.x=placed.x;
    newObj.y=placed.y;
    newObj.rotation=placed.rotation;
    fpObjects.push(newObj);
  }
  drawFloorplan();
}

function floorMove(ev){
  if(!fpDrawing)return;
  ev.preventDefault();

  const p=fpPoint(ev);

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
    }else{
      const desiredX=snap(orig.x+dx);
      const desiredY=snap(orig.y+dy);
      const placed=constrainObjectPlacement(o,desiredX,desiredY);
      o.x=placed.x;
      o.y=placed.y;
      o.rotation=placed.rotation;
    }
    drawFloorplan();
    updateSelectedInfo();
    return;
  }

  if((fpTool==='wall') && fpStart){
    const smart=smartWallEndpoint(fpStart,p);
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
      snappedToTarget:smart.snapped
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
  if(!fpObjectWallSnap || o.type==='text')return {x,y,rotation:o.rotation||0,snapped:false};

  const near=nearestWallForObject({x,y});
  if(!near)return {x,y,rotation:o.rotation||0,snapped:false};

  const w=near.wall;
  const dx=Number(w.x2)-Number(w.x1);
  const dy=Number(w.y2)-Number(w.y1);
  const wallLen=Math.hypot(dx,dy)||1;
  const ux=dx/wallLen,uy=dy/wallLen;
  let nx=-uy,ny=ux;

  const wallAngle=Math.atan2(dy,dx)*180/Math.PI;
  const poly=getRoomPolygon();
  const roomC=polygonCentroid(poly);

  // Pick normal pointing toward the room interior.
  const mid={
    x:(Number(w.x1)+Number(w.x2))/2,
    y:(Number(w.y1)+Number(w.y2))/2
  };
  const toCenter={x:roomC.x-mid.x,y:roomC.y-mid.y};
  if(nx*toCenter.x+ny*toCenter.y<0){nx=-nx;ny=-ny}

  // Door/window belongs exactly on wall axis.
  if(o.type==='door'||o.type==='window'){
    const q=near.point;
    return {
      x:snap(q.x),
      y:snap(q.y),
      rotation:wallAngle,
      snapped:true,
      wallId:w.id
    };
  }

  // Only snap furniture/sanitary when near enough to a wall.
  const snapDistance=Math.max(55,Number(o.depthCm||40)*(o.scale||1)*.75);
  if(near.distance>snapDistance){
    return {x,y,rotation:o.rotation||0,snapped:false};
  }

  // Object depth is perpendicular to wall after rotation.
  const depth=Math.max(1,Number(o.depthCm||40)*(o.scale||1));
  const wallThickness=Number(w.thickness||15);
  const offset=depth/2 + wallThickness/2 + 1;

  const sx=near.point.x+nx*offset;
  const sy=near.point.y+ny*offset;
  let rotation=wallAngle;

  // Try wall-parallel orientation first.
  if(objectFitsRoom(o,sx,sy,rotation)){
    return {x:snap(sx),y:snap(sy),rotation,snapped:true,wallId:w.id};
  }

  // If width/depth orientation makes it invalid, try perpendicular orientation.
  rotation=wallAngle+90;
  if(objectFitsRoom(o,sx,sy,rotation)){
    return {x:snap(sx),y:snap(sy),rotation,snapped:true,wallId:w.id};
  }

  return {x,y,rotation:o.rotation||0,snapped:false};
}

function constrainObjectPlacement(o,x,y){
  if(o.type==='wall'||o.type==='text')return {x,y,rotation:o.rotation||0,valid:true};

  const snapped=snapObjectToWall(o,x,y);
  const candidate={
    x:snapped.x,
    y:snapped.y,
    rotation:snapped.rotation
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
  const w=Number($('fpObjectWidth').value),d=Number($('fpObjectDepth').value);
  if(!Number.isFinite(w)||!Number.isFinite(d)||w<=0||d<=0)return;
  pushHistory();
  o.widthCm=w;o.depthCm=d;
  drawFloorplan();updateSelectedInfo();
}
function updateSelectedInfo(){
  const el=$('fpSelectedInfo');if(!el)return;
  const o=fpObjects.find(x=>x.id===fpSelectedId);
  if(!o){el.textContent='Keine Auswahl';refreshOpeningPanel();return}
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
  const dpr=Math.min(window.devicePixelRatio||1,1.5);

  const pxW=Math.round(cssW*dpr);
  const pxH=Math.round(cssH*dpr);

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

  const minX=Math.min(...xs),maxX=Math.max(...xs);
  const minY=Math.min(...ys),maxY=Math.max(...ys);
  const bw=Math.max(100,maxX-minX);
  const bh=Math.max(100,maxY-minY);

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
  const fillX=isTablet?0.78:0.72;
  const fillY=isTablet?0.76:0.70;

  const fitX=(visibleW*fillX)/bw;
  const fitY=(visibleH*fillY)/bh;

  // Allow significantly larger automatic zoom on tablets.
  const maxZoom=isTablet?4.5:3.0;
  fpZoom=Math.max(.08,Math.min(maxZoom,fitX,fitY));

  const cx=(minX+maxX)/2;
  const cy=(minY+maxY)/2;

  fpViewOffsetX=fpCanvas.width/2-cx*fpZoom;

  // Slight upward bias because the object palette occupies the bottom visually.
  const verticalBias=isTablet ? fpCanvas.height*0.04 : 0;
  fpViewOffsetY=fpCanvas.height/2-cy*fpZoom-verticalBias;

  const z=$('fpZoomReset');
  if(z)z.textContent=`${Math.round(fpZoom*100)}%`;

  drawFloorplan();
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

    // IMPORTANT: draw each object independently, so one malformed object cannot hide the whole plan.
    (fpObjects||[]).forEach(o=>{
      try{
        if(typeof isLayerVisible==='function' && !isLayerVisible(o))return;
        drawFpObject(o,false);
      }catch(objectError){
        console.error('2D Objekt konnte nicht gezeichnet werden',o,objectError);
      }
    });

    if(preview){
      try{
        fpCtx.save();
        fpCtx.globalAlpha=.78;
        drawFpObject(preview,true);
        fpCtx.restore();

        // CAD live measurement must remain fully opaque and readable.
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
        const cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
        const w=235/zoom,h=100/zoom;

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
    const dir=o.openingDirection||'right';
    if(dir==='right'){
      fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();
      fpCtx.beginPath();fpCtx.arc(o.x-45,o.y,90,0,-Math.PI/2,true);fpCtx.stroke();
    }else{
      fpCtx.beginPath();fpCtx.moveTo(o.x+45,o.y);fpCtx.lineTo(o.x-45,o.y);fpCtx.stroke();
      fpCtx.beginPath();fpCtx.arc(o.x+45,o.y,90,Math.PI,Math.PI*1.5,false);fpCtx.stroke();
    }

  }else if(o.type==='window'){
    fpCtx.lineWidth=4;
    fpCtx.strokeRect(o.x-55,o.y-10,110,20);
    const dir=o.openingDirection||'right';
    fpCtx.beginPath();fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+45,o.y);fpCtx.stroke();
    fpCtx.beginPath();
    if(dir==='right'){
      fpCtx.moveTo(o.x-45,o.y);fpCtx.lineTo(o.x+35,o.y-42);fpCtx.lineTo(o.x+35,o.y+42);
    }else{
      fpCtx.moveTo(o.x+45,o.y);fpCtx.lineTo(o.x-35,o.y-42);fpCtx.lineTo(o.x-35,o.y+42);
    }
    fpCtx.stroke();

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
  window.addEventListener('orientationchange',()=>setTimeout(refresh,250));
  applyMode();
  updateTabletViewportMetrics();
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
initCadShell();initTileTools();initTabletCadUi();initFloorplanControls();initFloorplanCanvas();initPinchZoom();initCadKeyboard();

render();
