
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
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmtDate(s){if(!s)return'-';try{return new Date(s+'T00:00:00').toLocaleDateString('de-CH')}catch{return s}}

$('create').onclick=()=>{
  if(!$('name').value.trim())return alert('Proje adı gerekli.');
  S.projects.unshift({id:u(),name:$('name').value.trim(),address:$('address').value.trim(),customer:$('customer').value.trim(),phone:$('phone').value.trim(),startDate:$('startDate').value,owner:$('owner').value.trim(),description:$('description').value.trim(),areas:[]});
  A=S.projects[0].id;['name','address','customer','phone','startDate','owner','description'].forEach(x=>$(x).value='');save()
};
$('addArea').onclick=()=>{let p=cur(),n=$('areaName').value.trim();if(!p||!n)return;p.areas.push({id:u(),name:n,priority:$('priority').value,worker:'',status:'Açık',tasks:[],materials:[],photos:[]});$('areaName').value='';save()};
$('deleteProject').onclick=()=>{let p=cur();if(p&&confirm('Proje silinsin mi?')){S.projects=S.projects.filter(x=>x.id!==p.id);A=null;save()}};
$('workerView').onclick=()=>document.body.classList.toggle('worker-mode');
$('backup').onclick=()=>{let a=document.createElement('a'),b=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});a.href=URL.createObjectURL(b);a.download='ProjektBau_Yedek.json';a.click()};
$('restore').onchange=async e=>{try{let d=JSON.parse(await e.target.files[0].text());if(!Array.isArray(d.projects))throw 0;S=d;A=null;save()}catch{alert('Geçersiz yedek.')}};
$('printReport').onclick=()=>{buildPrintReport();setTimeout(()=>window.print(),100)};

function render(){
  let b=$('projects');b.innerHTML=S.projects.length?'':'Henüz proje yok.';
  S.projects.forEach(p=>{let d=document.createElement('div');d.className='project';d.innerHTML=`<div><b>${esc(p.name)}</b><div class=muted>${esc(p.address||'Adres yok')} · ${p.areas.length} bölüm</div></div><button class=secondary>Aç</button>`;d.querySelector('button').onclick=()=>{A=p.id;render()};b.appendChild(d)});
  renderP()
}
function renderP(){
  let p=cur();if(!p){$('panel').classList.add('hidden');return}
  $('panel').classList.remove('hidden');$('pTitle').textContent=p.name;$('pMeta').textContent=[p.address,p.customer&&'Müşteri: '+p.customer,p.owner&&'Sorumlu: '+p.owner].filter(Boolean).join(' · ');
  $('summary').innerHTML=[['Telefon',p.phone||'-'],['Başlangıç',fmtDate(p.startDate)],['Bölüm',p.areas.length],['Açıklama',p.description||'-']].map(x=>`<div><small>${esc(x[0])}</small><br><b>${esc(x[1])}</b></div>`).join('');
  $('areas').innerHTML='';p.areas.forEach(a=>$('areas').appendChild(area(p,a)))
}
function area(p,a){
  a.tasks=a.tasks||[];a.materials=a.materials||[];a.photos=a.photos||[];
  let d=document.createElement('div');d.className='area';
  d.innerHTML=`<div class=title><div><h3>${esc(a.name)}</h3><small>${esc(a.priority)}</small></div><button class="danger editor delArea">Bölümü Sil</button></div>
  <div class=grid><label>İşçi / ekip<input class=worker></label><label>Durum<select class=status><option>Açık</option><option>Devam ediyor</option><option>Bekliyor</option><option>Tamamlandı</option></select></label></div>
  <div class=sub><div class=title><h4>Yapılacak İşler</h4><button class="secondary addT editor">+ Görev</button></div><div class=tasks></div></div>
  <div class=sub><div class=title><h4>Malzeme / Ölçü</h4><button class="secondary addM editor">+ Malzeme</button></div><div class=mats></div></div>
  <div class="photoBox editor"><select class=kind><option>Önce</option><option>Sonra</option><option>Detay</option></select><label class="primary file">Fotoğraf Çek / Seç<input class=pi type=file accept="image/*" capture=environment multiple></label></div>
  <div class=photos></div>`;
  d.querySelector('.worker').value=a.worker||'';d.querySelector('.status').value=a.status||'Açık';
  d.querySelector('.worker').onchange=e=>{a.worker=e.target.value;save()};d.querySelector('.status').onchange=e=>{a.status=e.target.value;save()};
  d.querySelector('.delArea').onclick=()=>{if(confirm('Bölüm silinsin mi?')){p.areas=p.areas.filter(x=>x.id!==a.id);save()}};
  a.tasks.forEach(t=>d.querySelector('.tasks').appendChild(row(a.tasks,t,'Görev açıklaması')));
  d.querySelector('.addT').onclick=()=>{a.tasks.push({id:u(),text:''});save()};
  a.materials.forEach(m=>d.querySelector('.mats').appendChild(row(a.materials,m,'60×120 seramik – 12 m²')));
  d.querySelector('.addM').onclick=()=>{a.materials.push({id:u(),text:''});save()};
  d.querySelector('.pi').onchange=async e=>{for(let f of e.target.files)a.photos.push({id:u(),kind:d.querySelector('.kind').value,title:'',note:'',data:await img(f)});save()};
  a.photos.forEach((ph,i)=>d.querySelector('.photos').appendChild(photoCard(a,ph,i)));
  return d
}
function row(arr,it,ph){
  let r=document.createElement('div');r.className='row';r.innerHTML=`<input placeholder="${ph}"><button class="danger editor">Sil</button>`;
  r.querySelector('input').value=it.text||'';r.querySelector('input').onchange=e=>{it.text=e.target.value;save()};
  r.querySelector('button').onclick=()=>{arr.splice(arr.findIndex(x=>x.id===it.id),1);save()};return r
}
function photoCard(a,ph,i){
  ph.title=ph.title||'';ph.note=ph.note||'';
  let c=document.createElement('div');c.className='photo';
  c.innerHTML=`<img><div class=body><span class=tag>${esc(ph.kind||'Detay')}</span>
  <div class=photo-fields>
    <label>Başlık / Konum<input class=photoTitle placeholder="Örn. Badezimmer - duş duvarı"></label>
    <label>PDF'de görünecek açıklama<textarea class=photoNote rows=5 placeholder="Bu fotoğraf için yapılacak işi ayrıntılı yaz..."></textarea></label>
  </div>
  <div class="photo-actions editor"><button class="secondary up">↑ Yukarı</button><button class="secondary down">↓ Aşağı</button><button class="danger del">Sil</button></div></div>`;
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
  const p=cur();if(!p)return;
  const items=[];
  p.areas.forEach(a=>(a.photos||[]).forEach(ph=>items.push({area:a,photo:ph})));
  const root=$('printReportRoot');root.innerHTML='';
  if(!items.length){alert('PDF için en az bir fotoğraf ekleyin.');return}
  for(let i=0;i<items.length;i+=2){
    const page=document.createElement('section');page.className='pdf-page';
    page.innerHTML=`<div class=pdf-header><h1>${esc(p.name)}</h1><div class=pdf-meta>${esc(p.address||'')}<br>${p.customer?'Müşteri: '+esc(p.customer)+' · ':''}${p.owner?'Sorumlu: '+esc(p.owner)+' · ':''}Başlangıç: ${esc(fmtDate(p.startDate))}</div></div><div class=pdf-items></div>`;
    const box=page.querySelector('.pdf-items');
    for(let j=0;j<2;j++){
      const it=items[i+j];
      if(!it){let empty=document.createElement('div');empty.className='pdf-item pdf-empty';box.appendChild(empty);continue}
      const tasks=(it.area.tasks||[]).map(x=>x.text).filter(Boolean).join(' • ');
      const mats=(it.area.materials||[]).map(x=>x.text).filter(Boolean).join(' • ');
      const card=document.createElement('div');card.className='pdf-item';
      card.innerHTML=`<div class=pdf-photo><img src="${it.photo.data}"></div><div class=pdf-text>
        <div><div class=pdf-label>Bölüm / Başlık</div><h3>${esc(it.photo.title||it.area.name)}</h3></div>
        <div><div class=pdf-label>Fotoğraf türü</div><div class=pdf-value>${esc(it.photo.kind||'Detay')}</div></div>
        <div><div class=pdf-label>Açıklama / Yapılacak iş</div><div class=pdf-value>${esc(it.photo.note||tasks||'-')}</div></div>
        ${mats?`<div><div class=pdf-label>Malzeme / Ölçü</div><div class=pdf-value>${esc(mats)}</div></div>`:''}
        ${it.area.worker?`<div><div class=pdf-label>İşçi / Ekip</div><div class=pdf-value>${esc(it.area.worker)}</div></div>`:''}
      </div>`;
      box.appendChild(card)
    }
    root.appendChild(page)
  }
}
render();
