
const KEY = 'tadilat-proje-mini-v01';
let state = loadState();
let activeProjectId = null;
let deferredPrompt = null;

function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); }
function loadState(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {projects:[]}; }
  catch { return {projects:[]}; }
}
function saveState(){
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}
function esc(s=''){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

const $ = id => document.getElementById(id);

$('createProjectBtn').onclick = () => {
  const name = $('projectName').value.trim();
  if(!name) return alert('Lütfen proje adını yazın.');
  const p = {
    id:uid(), name,
    address:$('projectAddress').value.trim(),
    customer:$('customerName').value.trim(),
    owner:$('projectOwner').value.trim(),
    description:$('projectDescription').value.trim(),
    createdAt:new Date().toISOString(), areas:[]
  };
  state.projects.unshift(p);
  activeProjectId = p.id;
  ['projectName','projectAddress','customerName','projectOwner','projectDescription'].forEach(x=>$(x).value='');
  saveState();
};

$('addAreaBtn').onclick = () => {
  const p = getActive();
  if(!p) return;
  const name = $('areaName').value.trim();
  if(!name) return alert('Bölüm adını yazın.');
  p.areas.push({
    id:uid(), name, priority:$('areaPriority').value,
    workNote:'', materialNote:'', worker:'', status:'Açık', photos:[]
  });
  $('areaName').value='';
  saveState();
};

$('deleteProjectBtn').onclick = () => {
  const p=getActive(); if(!p) return;
  if(!confirm(`"${p.name}" projesi silinsin mi?`)) return;
  state.projects = state.projects.filter(x=>x.id!==p.id);
  activeProjectId = null; saveState();
};

$('printBtn').onclick = () => window.print();

$('exportAllBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`TadilatProjeMini_Yedek_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};

$('importAllInput').onchange = async e => {
  const f=e.target.files[0]; if(!f) return;
  try{
    const data=JSON.parse(await f.text());
    if(!data || !Array.isArray(data.projects)) throw new Error();
    state=data; activeProjectId=null; saveState();
  }catch{ alert('Geçerli bir yedek dosyası değil.'); }
  e.target.value='';
};

function getActive(){ return state.projects.find(p=>p.id===activeProjectId); }

function render(){
  renderProjects();
  renderActive();
}

function renderProjects(){
  const box=$('projectList');
  if(!state.projects.length){ box.className='project-list empty-state'; box.textContent='Henüz proje yok.'; return; }
  box.className='project-list'; box.innerHTML='';
  state.projects.forEach(p=>{
    const d=document.createElement('div'); d.className='project-item';
    d.innerHTML=`<div><div class="project-name">${esc(p.name)}</div>
      <div class="project-meta">${esc(p.address || 'Adres yok')} · ${p.areas.length} bölüm · ${new Date(p.createdAt).toLocaleDateString('de-CH')}</div></div>
      <button class="secondary">Aç</button>`;
    d.querySelector('button').onclick=()=>{activeProjectId=p.id; render(); window.scrollTo({top:$('projectPanel').offsetTop-70,behavior:'smooth'});};
    box.appendChild(d);
  });
}

function renderActive(){
  const p=getActive(), panel=$('projectPanel');
  if(!p){ panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  $('activeProjectTitle').textContent=p.name;
  $('activeProjectMeta').textContent=[p.address,p.customer&&`Müşteri: ${p.customer}`,p.owner&&`Sorumlu: ${p.owner}`].filter(Boolean).join(' · ');
  const list=$('areaList'); list.innerHTML='';
  p.areas.forEach(area => list.appendChild(renderArea(p,area)));
}

function renderArea(project, area){
  const node=$('areaTemplate').content.firstElementChild.cloneNode(true);
  node.querySelector('.area-title').textContent=area.name;
  node.querySelector('.priority-badge').textContent=area.priority;
  const work=node.querySelector('.work-note'), material=node.querySelector('.material-note'), worker=node.querySelector('.worker'), status=node.querySelector('.status');
  work.value=area.workNote; material.value=area.materialNote; worker.value=area.worker; status.value=area.status;

  const bind=(el,key)=>el.addEventListener('change',()=>{area[key]=el.value; saveState();});
  bind(work,'workNote'); bind(material,'materialNote'); bind(worker,'worker'); bind(status,'status');

  node.querySelector('.delete-area').onclick=()=>{
    if(!confirm(`"${area.name}" bölümü silinsin mi?`)) return;
    project.areas=project.areas.filter(x=>x.id!==area.id); saveState();
  };

  node.querySelector('.photo-input').onchange=async e=>{
    const files=[...e.target.files];
    for(const f of files){
      const data=await compressImage(f,1280,.78);
      area.photos.push({id:uid(),data,note:''});
    }
    e.target.value=''; saveState();
  };

  const photos=node.querySelector('.photos');
  area.photos.forEach(photo=>{
    const card=document.createElement('div'); card.className='photo-card';
    card.innerHTML=`<img alt="Proje fotoğrafı"><div class="photo-body">
      <textarea placeholder="Bu fotoğraf için yapılacak işi yazın..."></textarea>
      <div class="photo-actions"><button class="danger ghost">Fotoğrafı Sil</button></div></div>`;
    card.querySelector('img').src=photo.data;
    const ta=card.querySelector('textarea'); ta.value=photo.note||'';
    ta.onchange=()=>{photo.note=ta.value; saveState();};
    card.querySelector('button').onclick=()=>{ area.photos=area.photos.filter(x=>x.id!==photo.id); saveState(); };
    photos.appendChild(card);
  });
  return node;
}

function compressImage(file,maxWidth=1280,quality=.78){
  return new Promise((resolve,reject)=>{
    const img=new Image(), reader=new FileReader();
    reader.onload=()=>img.src=reader.result; reader.onerror=reject;
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth}
      const c=document.createElement('canvas'); c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      resolve(c.toDataURL('image/jpeg',quality));
    };
    reader.readAsDataURL(file);
  });
}

window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault(); deferredPrompt=e; $('installBtn').classList.remove('hidden');
});
$('installBtn').onclick=async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('installBtn').classList.add('hidden');
};

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
