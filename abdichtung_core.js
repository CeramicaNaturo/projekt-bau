/* Projekt Bau v2.4.0 PRO · SIA 271/1 Abdichtungsplanung */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
let debounce=null;
let lastAnalysis=null;

const PRODUCT={
  membraneW:{name:'SikaCeram® Sealing Membrane W',rollM:30,widthM:1},
  membraneA:{name:'SikaCeram® Sealing Membrane A',rollM:30,widthM:1},
  sealingFix:{name:'SikaCeram® Sealing Fix',kgPerM2:.75,packKg:7.8},
  sealTape:{name:'Sika® SealTape F',rollM:25,widthMm:120,cornerPack:20,wallCollarPack:20,floorCollarPack:10}
};

function cfg(){
  if(!fpRecord)return null;
  fpRecord.abdichtung=fpRecord.abdichtung||{};
  const c=fpRecord.abdichtung;
  if(!c.classMode)c.classMode='auto';
  if(!c.showerType)c.showerType='auto';
  if(!c.system)c.system='membraneW';
  if(!Number.isFinite(Number(c.wastePct)))c.wastePct=10;
  if(!Number.isFinite(Number(c.extraWallCollars)))c.extraWallCollars=0;
  if(c.overlay===undefined)c.overlay=true;
  return c;
}
function cm(v){return Number(v)||0}
function m2(v){return Math.max(0,Number(v)||0)}
function ceil(n){return Math.ceil(Math.max(0,n))}
function fmt(n,d=2){try{return formatCHNumber(Number(n)||0,d)}catch(_){return (Number(n)||0).toFixed(d)}}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function walls(){return (fpObjects||[]).filter(o=>o.type==='wall')}
function objs(type){return (fpObjects||[]).filter(o=>o.type===type)}
function floorArea(){try{return calculateFloorAreaM2(fpObjects||[])||0}catch(_){return 0}}
function roomHeightCm(){return Math.max(100,Number(fpRecord?.roomHeightM||2.4)*100)}
function wallLen(w){return Math.hypot(cm(w.x2)-cm(w.x1),cm(w.y2)-cm(w.y1))}
function pointLineProjection(p,w){
  const ax=cm(w.x1),ay=cm(w.y1),bx=cm(w.x2),by=cm(w.y2),dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1;
  const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.y-ay)*dy)/l2));
  const x=ax+dx*t,y=ay+dy*t;
  return {t,x,y,d:Math.hypot(p.x-x,p.y-y)};
}
function roomName(){return String(fpRecord?.name||'').toLowerCase()}

function detectClass(){
  const c=cfg();
  if(c?.classMode && c.classMode!=='auto')return c.classMode;
  const name=roomName();
  if(/schlach|käserei|brauerei|grossküche|grosswäsch|lebensmittel|intensiv.*reinig|öffentlich.*wellness/.test(name))return 'A4.3';
  if(/öffentlich|gewerb|hotel|wellness|garderobe/.test(name))return 'A4.2';
  return 'A4.1';
}
function nearestDrainTo(o){
  const drains=objs('drain');
  if(!drains.length)return null;
  return drains.map(d=>({o:d,d:Math.hypot(cm(d.x)-cm(o.x),cm(d.y)-cm(o.y))})).sort((a,b)=>a.d-b.d)[0];
}
function detectShowerType(){
  const c=cfg();
  if(c?.showerType && c.showerType!=='auto')return c.showerType;
  const showers=objs('shower');
  if(!showers.length)return 'none';
  return showers.some(s=>nearestDrainTo(s)?.d<140)?'levelOpen':'tray';
}
function detectExample(){
  const hasBath=objs('bathtub').length>0,hasShower=objs('shower').length>0;
  const st=detectShowerType();
  const n=roomName();
  if(/küche/.test(n) && objs('kitchenSink').length && objs('stove').length)return {nr:9,label:'Gewerbliche Küche'};
  if(hasBath&&hasShower){
    if(st==='levelClosed')return {nr:5,label:'Häusliches Bad mit Badewanne und bodenebener geschlossener Dusche'};
    return {nr:4,label:'Häusliches Bad mit Badewanne und bodenebener Dusche'};
  }
  if(hasBath)return {nr:1,label:'Häusliches Bad mit Badewanne'};
  if(hasShower){
    if(st==='tray')return {nr:3,label:'Häusliche Dusche mit Duschwanne'};
    return {nr:2,label:'Häusliches Bad mit offener, bodenebener Dusche'};
  }
  return {nr:0,label:'Wasserbeanspruchter Innenraum'};
}

function baseWallRects(){
  const map=new Map();
  for(const w of walls()){
    const rects=[];
    for(const ar of (Array.isArray(w.tileAreas)?w.tileAreas:[])){
      rects.push({offset:Math.max(0,cm(ar.offset)),width:Math.max(0,cm(ar.width)),bottom:Math.max(0,cm(ar.bottom)),height:Math.max(0,cm(ar.height)),source:'tile'});
    }
    map.set(w.id,rects);
  }
  return map;
}
function addWetZone(map,o,kind){
  const all=walls(); if(!all.length)return;
  const wObj=Math.max(30,cm(o.widthCm)||(kind==='bath'?180:90));
  const dObj=Math.max(30,cm(o.depthCm)||(kind==='bath'?80:90));
  const threshold=Math.max(85,dObj*.75+45);
  const ranked=all.map(w=>({w,p:pointLineProjection({x:cm(o.x),y:cm(o.y)},w)})).sort((a,b)=>a.p.d-b.p.d);
  const chosen=ranked.filter(x=>x.p.d<=threshold).slice(0,2);
  if(!chosen.length && ranked[0])chosen.push(ranked[0]);
  for(const x of chosen){
    const len=wallLen(x.w);
    const wet=Math.min(len,wObj+60); // 30 cm lateral on each side
    const center=x.p.t*len;
    const off=Math.max(0,Math.min(len-wet,center-wet/2));
    const arr=map.get(x.w.id)||[];
    arr.push({offset:off,width:wet,bottom:0,height:roomHeightCm(),source:kind});
    map.set(x.w.id,arr);
  }
}
function wallRects(){
  const map=baseWallRects();
  objs('shower').forEach(o=>addWetZone(map,o,'shower'));
  objs('bathtub').forEach(o=>addWetZone(map,o,'bath'));
  return map;
}

function rectUnionArea(rects){
  const clean=rects.filter(r=>r.width>0&&r.height>0);
  if(!clean.length)return 0;
  const xs=[...new Set(clean.flatMap(r=>[r.offset,r.offset+r.width]))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++){
    const x1=xs[i],x2=xs[i+1]; if(x2<=x1)continue;
    const ys=[];
    for(const r of clean){if(r.offset<x2&&r.offset+r.width>x1)ys.push([r.bottom,r.bottom+r.height])}
    ys.sort((a,b)=>a[0]-b[0]);
    let covered=0,s=null,e=null;
    for(const [a,b] of ys){if(s===null){s=a;e=b}else if(a<=e){e=Math.max(e,b)}else{covered+=e-s;s=a;e=b}}
    if(s!==null)covered+=e-s;
    area+=(x2-x1)*covered;
  }
  return area/10000;
}
function perimeterM(){
  let poly=null; try{poly=getRoomPolygon()}catch(_){poly=null}
  if(!poly?.length)return 0;
  let p=0; for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];p+=Math.hypot(b.x-a.x,b.y-a.y)}
  return p/100;
}
function polygonCornerTypes(){
  let poly=null;try{poly=getRoomPolygon()}catch(_){poly=null}
  if(!poly?.length)return {inner:0,outer:0,total:0};
  let area=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)area+=poly[j].x*poly[i].y-poly[i].x*poly[j].y;
  const ccw=area>0;let inner=0,outer=0;
  for(let i=0;i<poly.length;i++){
    const p0=poly[(i-1+poly.length)%poly.length],p1=poly[i],p2=poly[(i+1)%poly.length];
    const cross=(p1.x-p0.x)*(p2.y-p1.y)-(p1.y-p0.y)*(p2.x-p1.x);
    const convex=ccw?cross>0:cross<0;
    if(convex)inner++;else outer++;
  }
  return {inner,outer,total:poly.length};
}
function intervalsAtWallEnd(w,rects,atStart){
  const len=wallLen(w),eps=2,out=[];
  for(const r of rects){
    const touches=atStart?r.offset<=eps:(r.offset+r.width)>=len-eps;
    if(touches)out.push([r.bottom,r.bottom+r.height]);
  }
  return out;
}
function intervalIntersectionLength(A,B){
  let sum=0;
  for(const a of A)for(const b of B)sum+=Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0]));
  return sum;
}
function verticalTapeM(rectMap){
  const ws=walls(),tol=4;let total=0;
  for(let i=0;i<ws.length;i++)for(let j=i+1;j<ws.length;j++){
    const w1=ws[i],w2=ws[j];
    const ends1=[{x:cm(w1.x1),y:cm(w1.y1),s:true},{x:cm(w1.x2),y:cm(w1.y2),s:false}];
    const ends2=[{x:cm(w2.x1),y:cm(w2.y1),s:true},{x:cm(w2.x2),y:cm(w2.y2),s:false}];
    for(const e1 of ends1)for(const e2 of ends2){
      if(Math.hypot(e1.x-e2.x,e1.y-e2.y)<=tol){
        const A=intervalsAtWallEnd(w1,rectMap.get(w1.id)||[],e1.s),B=intervalsAtWallEnd(w2,rectMap.get(w2.id)||[],e2.s);
        total+=intervalIntersectionLength(A,B)/100;
      }
    }
  }
  return total;
}
function zargenBandM(){
  let m=0;
  objs('bathtub').forEach(o=>m+=(cm(o.widthCm||180)+2*cm(o.depthCm||80))/100);
  if(detectShowerType()==='tray')objs('shower').forEach(o=>m+=(cm(o.widthCm||90)+2*cm(o.depthCm||90))/100);
  return m;
}
function wetRoom(){
  const n=roomName();
  return /bad|dusche|wc|wellness|garderobe|küche|wäsch/.test(n)||objs('shower').length||objs('bathtub').length||objs('drain').length;
}

function analyze(){
  const c=cfg(); if(!c)return null;
  const cls=detectClass(),example=detectExample(),rectMap=wallRects();
  let wallArea=0;for(const rects of rectMap.values())wallArea+=rectUnionArea(rects);
  const floor=wetRoom()?floorArea():0;
  const total=floor+wallArea;
  const perimeter=wetRoom()?perimeterM():0;
  const vertical=verticalTapeM(rectMap);
  const zargen=zargenBandM();
  const corners=polygonCornerTypes();
  const floorCollars=objs('drain').length;
  const wallCollars=Math.max(0,Math.round(Number(c.extraWallCollars)||0));
  const waste=Math.max(0,Number(c.wastePct)||0)/100;
  const membraneNeed=total*(1+waste);
  const tapeNeed=(perimeter+vertical+zargen)*(1+waste);
  const system=PRODUCT[c.system]||PRODUCT.membraneW;
  const fixKg=total*PRODUCT.sealingFix.kgPerM2*(1+waste);
  const result={cls,example,showerType:detectShowerType(),floorArea:floor,wallArea,totalArea:total,perimeter,verticalTape:vertical,zargenBand:zargen,corners,floorCollars,wallCollars,wastePct:c.wastePct,rectMap,materials:[
    {name:system.name,qty:membraneNeed,unit:'m²',packs:ceil(membraneNeed/(system.rollM*system.widthM)),pack:`Rolle ${system.rollM} m × ${system.widthM.toFixed(2)} m`},
    {name:PRODUCT.sealingFix.name,qty:fixKg,unit:'kg',packs:ceil(fixKg/PRODUCT.sealingFix.packKg),pack:`Gebinde ${PRODUCT.sealingFix.packKg} kg`},
    {name:PRODUCT.sealTape.name+' · Dichtband',qty:tapeNeed,unit:'m',packs:ceil(tapeNeed/PRODUCT.sealTape.rollM),pack:`Rolle ${PRODUCT.sealTape.rollM} m`},
    {name:PRODUCT.sealTape.name+' · Innenecke',qty:corners.inner,unit:'St.',packs:ceil(corners.inner/PRODUCT.sealTape.cornerPack),pack:`Schachtel ${PRODUCT.sealTape.cornerPack} St.`},
    {name:PRODUCT.sealTape.name+' · Aussenecke',qty:corners.outer,unit:'St.',packs:ceil(corners.outer/PRODUCT.sealTape.cornerPack),pack:`Schachtel ${PRODUCT.sealTape.cornerPack} St.`},
    {name:PRODUCT.sealTape.name+' · Bodenmanschette',qty:floorCollars,unit:'St.',packs:ceil(floorCollars/PRODUCT.sealTape.floorCollarPack),pack:`Schachtel ${PRODUCT.sealTape.floorCollarPack} St.`},
    {name:PRODUCT.sealTape.name+' · Wandmanschette',qty:wallCollars,unit:'St.',packs:ceil(wallCollars/PRODUCT.sealTape.wallCollarPack),pack:`Schachtel ${PRODUCT.sealTape.wallCollarPack} St.`}
  ]};
  lastAnalysis=result;
  if(fpRecord){fpRecord.abdichtung.lastAnalysis={...result,rectMap:undefined,materials:result.materials};fpRecord.abdichtung.updatedAt=new Date().toISOString()}
  return result;
}

function showerText(v){return ({none:'Keine Dusche',tray:'Duschwanne',levelOpen:'Bodeneben · offen',levelClosed:'Bodeneben · geschlossen'})[v]||v}
function render(){
  const r=analyze();if(!r)return;
  const detected=$('fpAbdichtungDetected'),sum=$('fpSealSummary'),mats=$('fpSealMaterials');
  if(detected)detected.innerHTML=`<div><b>Erkannt:</b> Beispiel ${r.example.nr||'–'} · ${esc(r.example.label)}</div><div><b>Klasse:</b> ${r.cls} · <b>Dusche:</b> ${esc(showerText(r.showerType))}</div>`;
  if(sum)sum.innerHTML=`
    <div class="fp-seal-kpi"><span>Boden abdichten</span><strong>${fmt(r.floorArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Wände abdichten</span><strong>${fmt(r.wallArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Gesamtfläche</span><strong>${fmt(r.totalArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Boden-Wand Dichtband</span><strong>${fmt(r.perimeter)} m</strong></div>
    <div class="fp-seal-kpi"><span>Vertikale Dichtbänder</span><strong>${fmt(r.verticalTape)} m</strong></div>
    <div class="fp-seal-kpi"><span>Wannen-/Duschrandband</span><strong>${fmt(r.zargenBand)} m</strong></div>`;
  if(mats)mats.innerHTML=`<div class="fp-seal-material-head"><strong>Automatischer Materialbedarf</strong><span>inkl. ${fmt(r.wastePct,0)} % Reserve</span></div>`+
    r.materials.filter(x=>x.qty>0).map(x=>`<div class="fp-seal-material-row"><div><b>${esc(x.name)}</b><small>${esc(x.pack)}</small></div><div><strong>${fmt(x.qty,x.unit==='St.'?0:2)} ${x.unit}</strong><span>${x.packs} Gebinde</span></div></div>`).join('');
}
function syncControls(){
  const c=cfg();if(!c)return;
  if($('fpSealClass'))$('fpSealClass').value=c.classMode;
  if($('fpSealShowerType'))$('fpSealShowerType').value=c.showerType;
  if($('fpSealSystem'))$('fpSealSystem').value=c.system;
  if($('fpSealWaste'))$('fpSealWaste').value=c.wastePct;
  if($('fpSealWallCollars'))$('fpSealWallCollars').value=c.extraWallCollars;
  if($('fpSealOverlay'))$('fpSealOverlay').checked=c.overlay!==false;
}
function readControls(){
  const c=cfg();if(!c)return;
  c.classMode=$('fpSealClass')?.value||'auto';
  c.showerType=$('fpSealShowerType')?.value||'auto';
  c.system=$('fpSealSystem')?.value||'membraneW';
  c.wastePct=Math.max(0,Number($('fpSealWaste')?.value)||0);
  c.extraWallCollars=Math.max(0,Math.round(Number($('fpSealWallCollars')?.value)||0));
  c.overlay=$('fpSealOverlay')?.checked!==false;
  try{save()}catch(_){try{localStorage.setItem(K3,JSON.stringify(S))}catch(__){}}
  render();try{drawFloorplan()}catch(_){ }
}
function open(){syncControls();render();$('fpAbdichtungPanel')?.classList.remove('hidden');try{drawFloorplan()}catch(_){}}
function close(){$('fpAbdichtungPanel')?.classList.add('hidden')}
function saveMaterial(){
  const r=analyze();if(!r||!fpRecord)return;
  fpRecord.abdichtung.materialList=r.materials;
  fpRecord.abdichtung.materialText=r.materials.filter(x=>x.qty>0).map(x=>`${x.name}: ${fmt(x.qty,x.unit==='St.'?0:2)} ${x.unit} · ${x.packs} Gebinde`).join('\n');
  try{save()}catch(_){ }
  const b=$('fpSealSaveMaterial');if(b){const old=b.textContent;b.textContent='Gespeichert ✓';setTimeout(()=>b.textContent=old,1400)}
}

function drawOverlay(){
  const c=cfg();if(!c?.overlay)return;
  const r=lastAnalysis||analyze();if(!r||!fpCtx)return;
  const z=Math.max(.1,Number(fpZoom)||1);
  let poly=null;try{poly=getRoomPolygon()}catch(_){poly=null}
  if(r.floorArea>0&&poly?.length){
    fpCtx.save();fpCtx.fillStyle='rgba(245,158,11,.16)';fpCtx.strokeStyle='rgba(217,119,6,.65)';fpCtx.lineWidth=2/z;
    fpCtx.beginPath();fpCtx.moveTo(poly[0].x,poly[0].y);poly.slice(1).forEach(p=>fpCtx.lineTo(p.x,p.y));fpCtx.closePath();fpCtx.fill();fpCtx.stroke();fpCtx.restore();
  }
  for(const w of walls()){
    const rects=r.rectMap.get(w.id)||[];if(!rects.length)continue;
    const dx=cm(w.x2)-cm(w.x1),dy=cm(w.y2)-cm(w.y1),len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    fpCtx.save();fpCtx.strokeStyle='rgba(14,116,144,.78)';fpCtx.lineCap='butt';
    for(const ar of rects){
      const x1=cm(w.x1)+ux*ar.offset,y1=cm(w.y1)+uy*ar.offset,x2=x1+ux*ar.width,y2=y1+uy*ar.width;
      fpCtx.lineWidth=8/z;fpCtx.beginPath();fpCtx.moveTo(x1,y1);fpCtx.lineTo(x2,y2);fpCtx.stroke();
    }
    fpCtx.restore();
  }
}
function planChanged(){clearTimeout(debounce);debounce=setTimeout(()=>{if(!$('fpAbdichtungPanel')?.classList.contains('hidden'))render();else lastAnalysis=null},300)}
function install(){
  $('fpAbdichtungTool')?.addEventListener('click',open);$('fpAbdichtungClose')?.addEventListener('click',close);$('fpSealRecalculate')?.addEventListener('click',()=>{readControls();render()});$('fpSealSaveMaterial')?.addEventListener('click',saveMaterial);
  ['fpSealClass','fpSealShowerType','fpSealSystem','fpSealWaste','fpSealWallCollars','fpSealOverlay'].forEach(id=>$(id)?.addEventListener('change',readControls));
  setInterval(()=>{if(fpRecord&&!$('fpAbdichtungPanel')?.classList.contains('hidden'))render()},1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
window.ProjectBauAbdichtung={open,analyze,render,drawOverlay,planChanged};
})();
