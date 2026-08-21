
(()=>{
'use strict';
const q=id=>document.getElementById(id);
let timer=null,dirty=false,installed=false;

function timeCH(){try{return new Intl.DateTimeFormat('de-CH',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())}catch(_){return new Date().toLocaleTimeString()}}
function saveState(state,text){[q('fpAutosaveBadge'),q('fpProSaveStatus')].forEach(n=>{if(!n)return;n.dataset.state=state;n.textContent=text})}
function persist(showToast=false){
  if(!fpRecord||!fpProject)return false;
  try{
    fpRecord.objects=typeof cloneObjects==='function'?cloneObjects():JSON.parse(JSON.stringify(fpObjects||[]));
    fpRecord.grid=Number(fpGrid)||5;fpRecord.fineStep=Number(fpFineStep)||1;fpRecord.wallThickness=Number(fpWallThickness)||15;
    fpRecord.activeLayer=fpActiveLayer||'walls';fpRecord.layerVisibility={...(fpLayerVisibility||{})};fpRecord.threeDOptions={...(fp3DOptions||{})};
    fpRecord.roomHeightM=Number(q('fpRoomHeight')?.value)||fpRecord.roomHeightM||2.4;
    fpRecord.floorAreaM2=typeof calculateFloorAreaM2==='function'?calculateFloorAreaM2(fpObjects||[]):fpRecord.floorAreaM2;
    fpRecord.updatedAt=new Date().toISOString();fpRecord.schemaVersion=2;
    try{if(!fp3DMode&&fpCanvas)fpRecord.image=fpCanvas.toDataURL('image/png')}catch(_){}
    localStorage.setItem(K3,JSON.stringify(S));dirty=false;saveState('saved',`Gespeichert · ${timeCH()}`);if(showToast)toast('Grundriss gespeichert');updateStatus();return true;
  }catch(e){console.error('Projekt Bau PRO save',e);saveState('error','Speicherfehler');return false}
}
function scheduleSave(){if(!fpRecord)return;dirty=true;saveState('dirty','Nicht gespeichert');clearTimeout(timer);timer=setTimeout(()=>persist(false),900)}
function toast(text){let n=document.querySelector('.fp-pro-toast');if(!n){n=document.createElement('div');n.className='fp-pro-toast';document.body.appendChild(n)}n.textContent=text;n.classList.add('show');clearTimeout(n._t);n._t=setTimeout(()=>n.classList.remove('show'),1700)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function label(o){const m={wall:'Wand',door:'Tür',window:'Fenster',sink:'Waschbecken',wc:'WC',shower:'Dusche',walkInShower:'Bodengleiche Dusche',bathtub:'Badewanne',drain:'Bodenablauf',table:'Tisch',chair:'Stuhl',sofa:'Sofa',bed:'Bett',cabinet:'Schrank'};return m[o?.type]||String(o?.type||'Objekt')}
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(l2<1e-9)return Math.hypot(px-x1,py-y1);const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))}
function endpointKey(x,y,tol=2){return `${Math.round(Number(x)/tol)}:${Math.round(Number(y)/tol)}`}
function analyze(){
  const objs=Array.isArray(fpObjects)?fpObjects:[],walls=objs.filter(o=>o?.type==='wall'),openings=objs.filter(o=>o?.type==='door'||o?.type==='window'),errors=[],warnings=[],info=[];
  if(walls.length<3)errors.push('Mindestens drei Wände sind erforderlich.');
  const deg=new Map();
  for(const w of walls){[[w.x1,w.y1],[w.x2,w.y2]].forEach(([x,y])=>{const k=endpointKey(x,y);deg.set(k,(deg.get(k)||0)+1)});const len=Math.hypot(Number(w.x2)-Number(w.x1),Number(w.y2)-Number(w.y1));if(len<10)warnings.push(`Sehr kurze Wand: ${Math.round(len)} cm.`)}
  const openEnds=[...deg.values()].filter(v=>v===1).length;if(openEnds)errors.push(`${openEnds} offener Wand-Endpunkt erkannt.`);
  let area=null;try{area=calculateFloorAreaM2(objs)}catch(_){}
  if(area==null||!Number.isFinite(Number(area)))errors.push('Grundriss ist nicht geschlossen.');else info.push(`Netto-Bodenfläche: ${formatCHNumber(area,2)} m².`);
  for(const o of openings){let best=Infinity;for(const w of walls)best=Math.min(best,segDist(Number(o.x)||0,Number(o.y)||0,Number(w.x1)||0,Number(w.y1)||0,Number(w.x2)||0,Number(w.y2)||0));if(best>30)errors.push(`${label(o)} ist keiner Wand zugeordnet.`);else if(best>12)warnings.push(`${label(o)} liegt ${Math.round(best)} cm von der Wandreferenz entfernt.`)}
  const hh=Number(q('fpRoomHeight')?.value);if(!Number.isFinite(hh)||hh<1.8||hh>4.5)warnings.push('Raumhöhe prüfen.');
  if(!errors.length&&!warnings.length)info.push('Keine geometrischen Probleme gefunden.');
  return {errors,warnings,info,walls:walls.length,openings:openings.length,area}
}
function showCheck(){
  const panel=q('fpProValidationPanel'),summary=q('fpProValidationSummary'),list=q('fpProValidationList');if(!panel||!summary||!list)return;
  const r=analyze(),grade=r.errors.length?'error':r.warnings.length?'warning':'ok';summary.dataset.grade=grade;
  summary.innerHTML=`<strong>${grade==='ok'?'Grundriss technisch OK':grade==='warning'?'Prüfung mit Hinweisen':'Prüfung nicht bestanden'}</strong><span>${r.walls} Wände · ${r.openings} Öffnungen · ${r.area==null?'keine Fläche':formatCHNumber(r.area,2)+' m²'}</span>`;
  let rows='';r.errors.forEach(x=>rows+=`<div class="fp-check-row error"><b>FEHLER</b><span>${esc(x)}</span></div>`);r.warnings.forEach(x=>rows+=`<div class="fp-check-row warning"><b>HINWEIS</b><span>${esc(x)}</span></div>`);r.info.forEach(x=>rows+=`<div class="fp-check-row ok"><b>OK</b><span>${esc(x)}</span></div>`);list.innerHTML=rows;panel.classList.remove('hidden')
}
function exportPlan(){
  if(!fpRecord)return;persist(false);
  const data={format:'ProjektBau-Floorplan',version:'2.0.0',exportedAt:new Date().toISOString(),project:{id:fpProject?.id,name:fpProject?.name,address:fpProject?.address,customer:fpProject?.customer},floorplan:JSON.parse(JSON.stringify(fpRecord))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(fpRecord.name||'Grundriss').replace(/[^\w\-]+/g,'_')}_ProjektBau.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
function updateStatus(){
  if(!q('floorplanModal')||q('floorplanModal').classList.contains('hidden'))return;
  const names={select:'Auswählen',pan:'Verschieben',wall:'Wand',door:'Tür',window:'Fenster',sink:'Objekte',text:'Text',tileOrigin:'Fliesenstart'},sel=typeof selectedObject==='function'?selectedObject():null;
  let area=null;try{area=calculateFloorAreaM2(fpObjects||[])}catch(_){}
  if(q('fpProToolStatus'))q('fpProToolStatus').textContent=`Werkzeug: ${names[fpTool]||fpTool}`;
  if(q('fpProSnapStatus'))q('fpProSnapStatus').textContent=`Fang: ${fpSnapEnabled?fpFineStep+' cm':'Aus'} · Raster ${fpGrid} cm`;
  if(q('fpProSelectionStatus'))q('fpProSelectionStatus').textContent=sel?`${label(sel)} ausgewählt`:'Keine Auswahl';
  if(q('fpProAreaStatus'))q('fpProAreaStatus').textContent=`Fläche: ${area==null?'offen':formatCHNumber(area,2)+' m²'}`
}
function install(){
  if(installed)return;installed=true;
  if(q('fpSave'))q('fpSave').onclick=()=>persist(true);
  q('fpProValidate')?.addEventListener('click',showCheck);q('fpProExport')?.addEventListener('click',exportPlan);q('fpProValidationClose')?.addEventListener('click',()=>q('fpProValidationPanel')?.classList.add('hidden'));
  if(typeof drawFloorplan==='function'){const original=drawFloorplan;drawFloorplan=function(...args){const r=original.apply(this,args);updateStatus();return r}}
  if(typeof setFloorTool==='function'){const original=setFloorTool;setFloorTool=function(...args){const r=original.apply(this,args);updateStatus();return r}}
  if(typeof updateSelectedInfo==='function'){const original=updateSelectedInfo;updateSelectedInfo=function(...args){const r=original.apply(this,args);updateStatus();return r}}
  q('floorplanModal')?.addEventListener('change',e=>{if(e.target.matches('input,select,textarea'))scheduleSave()},true);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();persist(true);return}const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;if(e.key.toLowerCase()==='f'){e.preventDefault();fp3DMode?window.ProjectBau3D?.fitView?.():fitFloorplan2D?.()}else if(e.key==='2')setFloorplanView?.('2d');else if(e.key==='3')setFloorplanView?.('3d');else if(e.key.toLowerCase()==='v')showCheck();else if(e.key==='Escape')setFloorTool?.('select')},true);
  window.addEventListener('beforeunload',()=>{if(dirty)persist(false)});setInterval(updateStatus,1000)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
window.ProjectBauPro={save:()=>persist(true),validate:showCheck,analyze,exportPlan,status:updateStatus}
})();
