(()=>{
'use strict';
const $=id=>document.getElementById(id);
let lastAnalysis=null,debounce=null;

const PRODUCT={
  membrane:{
    name:'webersys DW20',
    rollM:20,
    widthM:1
  },
  sealing:{
    name:'weber Superflex D1',
    kgPerM2:2.5,
    packKg:20
  },
  primer:{
    name:'weber grund rapid',
    kgPerM2:.15,
    packKg:10
  },
  tape:{
    name:'weber DB 120',
    rollM:50
  },
  cornerInner:{
    name:'weber DEC innen',
    pack:25
  },
  cornerOuter:{
    name:'weber DEC aussen',
    pack:25
  },
  collar:{
    name:'weber DM 150',
    pack:10
  },
  cutProtection:{
    name:'webersys SZ',
    rollM:10
  },
  tileAdhesive:{
    name:'webercol 800 pro S1',
    kgPerM2:4.0,
    packKg:20
  },
  grout:{
    name:'weber FM C88',
    kgPerM2:.5,
    packKg:5
  },
  slopeRail:{
    name:'Gefällskeilschiene',
    stockM:2
  },
  geberitFlange:{name:'Geberit Dichtflansch'},
  geberitChannel:{name:'Geberit Duschrinne'}
};

function cfg(){
  if(!fpRecord)return null;
  fpRecord.abdichtung=fpRecord.abdichtung||{};
  const c=fpRecord.abdichtung;
  if(!c.classMode)c.classMode='auto';
  if(!c.showerType)c.showerType='auto';
  if(!Number.isFinite(Number(c.wastePct)))c.wastePct=10;
  if(!Number.isFinite(Number(c.extraWallCollars)))c.extraWallCollars=0;
  if(c.overlay===undefined)c.overlay=true;
  return c;
}
function cm(v){return Number(v)||0}
function ceil(v){return Math.ceil(Math.max(0,Number(v)||0))}
function fmt(v,d=2){try{return formatCHNumber(Number(v)||0,d)}catch(_){return (Number(v)||0).toFixed(d)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function walls(){return (fpObjects||[]).filter(o=>o.type==='wall')}
function objs(type){return (fpObjects||[]).filter(o=>o.type===type)}
function showers(){return (fpObjects||[]).filter(o=>o.type==='shower'||o.type==='walkInShower')}
function roomHeightCm(){return Math.max(100,Number(fpRecord?.roomHeightM||2.4)*100)}
function floorArea(){try{return calculateFloorAreaM2(fpObjects||[])||0}catch(_){return 0}}
function wallLen(w){return Math.hypot(cm(w.x2)-cm(w.x1),cm(w.y2)-cm(w.y1))}
function roomName(){return String(fpRecord?.name||'').toLowerCase()}
function pointLineProjection(p,w){
  const ax=cm(w.x1),ay=cm(w.y1),bx=cm(w.x2),by=cm(w.y2);
  const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1;
  const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.y-ay)*dy)/l2));
  const x=ax+dx*t,y=ay+dy*t;
  return {t,x,y,d:Math.hypot(p.x-x,p.y-y)};
}
function nearestWall(o){
  const ranked=walls().map(w=>({w,p:pointLineProjection({x:cm(o.x),y:cm(o.y)},w)})).sort((a,b)=>a.p.d-b.p.d);
  return ranked[0]||null;
}
function detectClass(){
  const c=cfg();
  if(c?.classMode&&c.classMode!=='auto')return c.classMode;
  const n=roomName();
  if(/schlach|käserei|brauerei|grossküche|grosswäsch|lebensmittel|intensiv.*reinig|öffentlich.*wellness/.test(n))return 'A4.3';
  if(/öffentlich|gewerb|hotel|wellness|garderobe/.test(n))return 'A4.2';
  return 'A4.1';
}
function detectShowerType(){
  const c=cfg();
  if(c?.showerType&&c.showerType!=='auto')return c.showerType;
  if(objs('walkInShower').length)return 'levelOpen';
  return objs('shower').length?'tray':'none';
}
function detectExample(){
  const bath=objs('bathtub').length>0,sh=showers().length>0,st=detectShowerType();
  const n=roomName();
  if(/küche/.test(n)&&objs('kitchenSink').length)return {nr:9,label:'Gewerbliche Küche'};
  if(bath&&sh)return {nr:st==='levelClosed'?5:4,label:st==='levelClosed'?'Badewanne + bodenebene geschlossene Dusche':'Badewanne + bodenebene Dusche'};
  if(bath)return {nr:1,label:'Häusliches Bad mit Badewanne'};
  if(sh)return {nr:st==='tray'?3:2,label:st==='tray'?'Häusliche Dusche mit Duschwanne':'Offene bodenebene Dusche'};
  return {nr:0,label:'Wasserbeanspruchter Innenraum'};
}
function wetRoom(){
  const n=roomName();
  return /bad|dusche|wc|wellness|garderobe|küche|wäsch/.test(n)||showers().length||objs('bathtub').length||objs('drain').length;
}

/* ---------------- WALL SEALING RECTANGLES ---------------- */
function baseWallRects(){
  const map=new Map();
  for(const w of walls()){
    const rects=[];
    for(const ar of (Array.isArray(w.tileAreas)?w.tileAreas:[])){
      rects.push({
        offset:Math.max(0,cm(ar.offset)),
        width:Math.max(0,cm(ar.width)),
        bottom:Math.max(0,cm(ar.bottom)),
        height:Math.max(0,cm(ar.height)),
        source:'tile'
      });
    }
    map.set(w.id,rects);
  }
  return map;
}
function addWetZone(map,o,kind){
  const all=walls();if(!all.length)return;
  const width=Math.max(30,cm(o.widthCm)||(kind==='bath'?180:90));
  const depth=Math.max(30,cm(o.depthCm)||(kind==='bath'?80:90));
  const threshold=Math.max(90,depth*.75+45);
  const ranked=all.map(w=>({w,p:pointLineProjection({x:cm(o.x),y:cm(o.y)},w)})).sort((a,b)=>a.p.d-b.p.d);
  const chosen=ranked.filter(x=>x.p.d<=threshold).slice(0,2);
  if(!chosen.length&&ranked[0])chosen.push(ranked[0]);
  for(const x of chosen){
    const len=wallLen(x.w);
    const wet=Math.min(len,width+60);
    const center=x.p.t*len;
    const off=Math.max(0,Math.min(len-wet,center-wet/2));
    const arr=map.get(x.w.id)||[];
    arr.push({offset:off,width:wet,bottom:0,height:roomHeightCm(),source:kind});
    map.set(x.w.id,arr);
  }
}
function wallRects(){
  const map=baseWallRects();
  showers().forEach(o=>addWetZone(map,o,'shower'));
  objs('bathtub').forEach(o=>addWetZone(map,o,'bath'));
  return map;
}
function rectIntersectionArea(a,b){
  const x1=Math.max(a.offset,b.offset),x2=Math.min(a.offset+a.width,b.offset+b.width);
  const y1=Math.max(a.bottom,b.bottom),y2=Math.min(a.bottom+a.height,b.bottom+b.height);
  return Math.max(0,x2-x1)*Math.max(0,y2-y1);
}
function rectUnionArea(rects){
  const clean=rects.filter(r=>r.width>0&&r.height>0);
  if(!clean.length)return 0;
  const xs=[...new Set(clean.flatMap(r=>[r.offset,r.offset+r.width]))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++){
    const x1=xs[i],x2=xs[i+1];if(x2<=x1)continue;
    const ys=[];
    for(const r of clean)if(r.offset<x2&&r.offset+r.width>x1)ys.push([r.bottom,r.bottom+r.height]);
    ys.sort((a,b)=>a[0]-b[0]);
    let s=null,e=null,covered=0;
    for(const [a,b] of ys){
      if(s===null){s=a;e=b}
      else if(a<=e)e=Math.max(e,b);
      else{covered+=e-s;s=a;e=b}
    }
    if(s!==null)covered+=e-s;
    area+=(x2-x1)*covered;
  }
  return area/10000;
}

/* ---------------- OPENINGS / NICHES ---------------- */
function openingRectOnWall(o,w){
  const hit=pointLineProjection({x:cm(o.x),y:cm(o.y)},w);
  const width=Math.max(1,cm(o.widthCm)||(o.type==='door'?90:100));
  const wallLength=wallLen(w);
  const center=hit.t*wallLength;
  const offset=Math.max(0,Math.min(Math.max(0,wallLength-width),center-width/2));
  let bottom=0,height=0;
  if(o.type==='door'){bottom=0;height=Math.max(1,cm(o.heightCm)||205)}
  else if(o.type==='window'){bottom=Math.max(0,cm(o.sillHeightCm)||90);height=Math.max(1,cm(o.heightCm)||120)}
  else if(o.type==='niche'){bottom=Math.max(0,cm(o.mountHeightCm)||100);height=Math.max(1,cm(o.heightCm)||60)}
  return {offset,width,bottom,height,source:o.type,object:o};
}
function openingDetails(rectMap){
  const items=[];
  let subtractCm2=0,nicheAddCm2=0,openingTapeM=0;
  let nicheInnerCorners=0,nicheOuterCorners=0;
  let doorCount=0,windowCount=0,nicheCount=0;

  for(const o of (fpObjects||[]).filter(x=>['door','window','niche'].includes(x.type))){
    const hit=nearestWall(o);if(!hit)continue;
    const w=hit.w,op=openingRectOnWall(o,w);
    const rects=rectMap.get(w.id)||[];
    let overlap=0;
    for(const r of rects)overlap+=rectIntersectionArea(r,op);
    overlap=Math.min(overlap,op.width*op.height);
    if(overlap<=0)continue;

    const ratio=overlap/(op.width*op.height||1);
    subtractCm2+=overlap;

    // Anschluss perimeter only for the portion that lies in a waterproofed wall zone.
    // For a rectangular opening this is conservatively the full perimeter once it intersects.
    openingTapeM+=2*(op.width+op.height)/100;

    if(o.type==='door')doorCount++;
    if(o.type==='window')windowCount++;

    if(o.type==='niche'){
      nicheCount++;
      const d=Math.max(1,cm(o.depthCm)||12);
      // Add back + 4 reveal surfaces. Front opening already subtracted above.
      const back=op.width*op.height;
      const reveals=2*d*op.height+2*d*op.width;
      nicheAddCm2+=(back+reveals)*ratio;

      // Every niche: mouth produces 4 external corners; rear box produces 4 internal corners.
      nicheOuterCorners+=4;
      nicheInnerCorners+=4;

      // Additional niche internal corner Dichtband: four back edges.
      openingTapeM+=2*(op.width+op.height)/100;
    }

    items.push({type:o.type,wallId:w.id,rect:op,overlapCm2:overlap,ratio});
  }
  return {
    items,
    subtractArea:subtractCm2/10000,
    nicheAddArea:nicheAddCm2/10000,
    openingTapeM,
    nicheInnerCorners,
    nicheOuterCorners,
    doorCount,windowCount,nicheCount
  };
}

/* ---------------- ROOM CORNERS ---------------- */
function roomPolygon(){
  try{return getRoomPolygon?.()||null}catch(_){return null}
}
function signedArea(poly){
  let a=0;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++)a+=poly[j].x*poly[i].y-poly[i].x*poly[j].y;
  return a/2;
}
function polygonCornerTypes(){
  const poly=roomPolygon();
  if(!poly?.length)return {inner:0,outer:0,total:0,details:[]};
  const ccw=signedArea(poly)>0;
  let inner=0,outer=0;
  const details=[];
  for(let i=0;i<poly.length;i++){
    const p0=poly[(i-1+poly.length)%poly.length],p1=poly[i],p2=poly[(i+1)%poly.length];
    const ax=p1.x-p0.x,ay=p1.y-p0.y,bx=p2.x-p1.x,by=p2.y-p1.y;
    const cross=ax*by-ay*bx;
    const convex=ccw?cross>0:cross<0;
    // From the room interior: convex polygon corner = Innenecke; concave = Aussenecke.
    if(convex)inner++;else outer++;
    details.push({x:p1.x,y:p1.y,type:convex?'inner':'outer'});
  }
  return {inner,outer,total:poly.length,details};
}
function perimeterM(){
  const poly=roomPolygon();if(!poly?.length)return 0;
  let p=0;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    p+=Math.hypot(b.x-a.x,b.y-a.y);
  }
  return p/100;
}

/* ---------------- TAPES / COLLARS ---------------- */
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
    const e1=[{x:cm(w1.x1),y:cm(w1.y1),s:true},{x:cm(w1.x2),y:cm(w1.y2),s:false}];
    const e2=[{x:cm(w2.x1),y:cm(w2.y1),s:true},{x:cm(w2.x2),y:cm(w2.y2),s:false}];
    for(const a of e1)for(const b of e2){
      if(Math.hypot(a.x-b.x,a.y-b.y)<=tol){
        const A=intervalsAtWallEnd(w1,rectMap.get(w1.id)||[],a.s);
        const B=intervalsAtWallEnd(w2,rectMap.get(w2.id)||[],b.s);
        total+=intervalIntersectionLength(A,B)/100;
      }
    }
  }
  return total;
}
function zargenBandM(){
  let total=0;
  objs('bathtub').forEach(o=>total+=(cm(o.widthCm||180)+2*cm(o.depthCm||80))/100);
  objs('shower').forEach(o=>total+=(cm(o.widthCm||90)+2*cm(o.depthCm||90))/100);
  return total;
}
function penetrations(){
  const floor=objs('drain').length + objs('walkInShower').filter(o=>String(o.drainType||'').includes('point')).length;
  const automaticWall=[
    ...objs('sink'),...objs('kitchenSink'),...objs('shower'),...objs('bathtub')
  ].length;
  const extra=Math.max(0,Math.round(Number(cfg()?.extraWallCollars)||0));
  return {floor,wall:automaticWall+extra,extra};
}

/* ---------------- WALK-IN EXTRAS ---------------- */
function walkInExtras(){
  const list=objs('walkInShower');
  let railM=0;const channels=[];
  for(const o of list){
    const w=Math.max(30,cm(o.widthCm||100)),d=Math.max(30,cm(o.depthCm||100));
    const dir=o.slopeDirection||'back';
    if(dir==='center')railM+=(2*w+2*d)/100;
    else if(dir==='left'||dir==='right')railM+=2*w/100;
    else railM+=2*d/100;
    const channelCm=Math.max(20,cm(o.channelLengthCm)||((dir==='left'||dir==='right')?d:w));
    channels.push(Math.round(channelCm));
  }
  return {count:list.length,railM,channels};
}

/* ---------------- MAIN ANALYSIS ---------------- */
function analyze(){
  const c=cfg();if(!c)return null;
  const rectMap=wallRects();
  let grossWallArea=0;
  for(const rects of rectMap.values())grossWallArea+=rectUnionArea(rects);

  const openings=openingDetails(rectMap);
  const netWallArea=Math.max(0,grossWallArea-openings.subtractArea+openings.nicheAddArea);
  const floor=wetRoom()?floorArea():0;
  const total=floor+netWallArea;

  const roomCorners=polygonCornerTypes();
  const corners={
    roomInner:roomCorners.inner,
    roomOuter:roomCorners.outer,
    nicheInner:openings.nicheInnerCorners,
    nicheOuter:openings.nicheOuterCorners,
    inner:roomCorners.inner+openings.nicheInnerCorners,
    outer:roomCorners.outer+openings.nicheOuterCorners
  };

  const perimeter=wetRoom()?perimeterM():0;
  const vertical=verticalTapeM(rectMap);
  const zargen=zargenBandM();
  const tapeBase=perimeter+vertical+zargen+openings.openingTapeM;
  const pen=penetrations();
  const walk=walkInExtras();

  const waste=Math.max(0,Number(c.wastePct)||0)/100;
  const membraneNeed=total*(1+waste);
  const sealingKg=total*PRODUCT.sealing.kgPerM2*(1+waste);
  const primerKg=total*PRODUCT.primer.kgPerM2*(1+waste);
  const tapeNeed=tapeBase*(1+waste);
  const cutProtection=tapeBase*(1+waste);
  const adhesiveKg=total*PRODUCT.tileAdhesive.kgPerM2*(1+waste);
  const groutKg=total*PRODUCT.grout.kgPerM2*(1+waste);

  const materials=[
    {brand:'Weber',name:PRODUCT.primer.name,qty:primerKg,unit:'kg',packs:ceil(primerKg/PRODUCT.primer.packKg),pack:`Gebinde ${PRODUCT.primer.packKg} kg`},
    {brand:'Weber',name:PRODUCT.sealing.name,qty:sealingKg,unit:'kg',packs:ceil(sealingKg/PRODUCT.sealing.packKg),pack:`Gebinde ${PRODUCT.sealing.packKg} kg`},
    {brand:'Weber',name:PRODUCT.membrane.name,qty:membraneNeed,unit:'m²',packs:ceil(membraneNeed/(PRODUCT.membrane.rollM*PRODUCT.membrane.widthM)),pack:`Rolle ${PRODUCT.membrane.rollM} × ${PRODUCT.membrane.widthM} m`},
    {brand:'Weber',name:PRODUCT.tape.name+' · Dichtband',qty:tapeNeed,unit:'m',packs:ceil(tapeNeed/PRODUCT.tape.rollM),pack:`Rolle ${PRODUCT.tape.rollM} m`},
    {brand:'Weber',name:PRODUCT.cornerInner.name,qty:corners.inner,unit:'St.',packs:ceil(corners.inner/PRODUCT.cornerInner.pack),pack:`Karton ${PRODUCT.cornerInner.pack} St.`},
    {brand:'Weber',name:PRODUCT.cornerOuter.name,qty:corners.outer,unit:'St.',packs:ceil(corners.outer/PRODUCT.cornerOuter.pack),pack:`Karton ${PRODUCT.cornerOuter.pack} St.`},
    {brand:'Weber',name:PRODUCT.collar.name+' · Boden',qty:pen.floor,unit:'St.',packs:ceil(pen.floor/PRODUCT.collar.pack),pack:`Karton ${PRODUCT.collar.pack} St.`},
    {brand:'Weber',name:PRODUCT.collar.name+' · Wand',qty:pen.wall,unit:'St.',packs:ceil(pen.wall/PRODUCT.collar.pack),pack:`Karton ${PRODUCT.collar.pack} St.`},
    {brand:'Weber',name:PRODUCT.cutProtection.name,qty:cutProtection,unit:'m',packs:ceil(cutProtection/PRODUCT.cutProtection.rollM),pack:`Rolle ${PRODUCT.cutProtection.rollM} m`},
    {brand:'Weber',name:PRODUCT.tileAdhesive.name,qty:adhesiveKg,unit:'kg',packs:ceil(adhesiveKg/PRODUCT.tileAdhesive.packKg),pack:`Sack ${PRODUCT.tileAdhesive.packKg} kg`},
    {brand:'Weber',name:PRODUCT.grout.name,qty:groutKg,unit:'kg',packs:ceil(groutKg/PRODUCT.grout.packKg),pack:`Gebinde ${PRODUCT.grout.packKg} kg`},
    {brand:'',name:PRODUCT.slopeRail.name,qty:walk.railM*(1+waste),unit:'m',packs:ceil(walk.railM*(1+waste)/PRODUCT.slopeRail.stockM),pack:`Stangen à ${PRODUCT.slopeRail.stockM} m`},
    {brand:'Geberit',name:PRODUCT.geberitFlange.name,qty:walk.count,unit:'St.',packs:walk.count,pack:'1 St. pro bodengleicher Dusche'},
    {brand:'Geberit',name:PRODUCT.geberitChannel.name,qty:walk.count,unit:'St.',packs:walk.count,pack:walk.channels.length?`Rinnenlänge: ${walk.channels.map(v=>v+' cm').join(' / ')}`:'–'}
  ];

  const result={
    cls:detectClass(),
    example:detectExample(),
    showerType:detectShowerType(),
    floorArea:floor,
    grossWallArea,
    openingSubtractArea:openings.subtractArea,
    nicheAddArea:openings.nicheAddArea,
    wallArea:netWallArea,
    totalArea:total,
    perimeter,
    verticalTape:vertical,
    openingTape:openings.openingTapeM,
    zargenBand:zargen,
    tapeTotal:tapeBase,
    corners,
    openings,
    penetrations:pen,
    walkIn:walk,
    wastePct:c.wastePct,
    rectMap,
    materials
  };

  lastAnalysis=result;
  if(fpRecord){
    fpRecord.abdichtung.lastAnalysis={
      ...result,
      rectMap:undefined,
      openings:{...openings,items:undefined},
      materials
    };
    fpRecord.abdichtung.updatedAt=new Date().toISOString();
  }
  return result;
}

function showerText(v){return ({none:'Keine Dusche',tray:'Duschwanne',levelOpen:'Bodeneben · offen',levelClosed:'Bodeneben · geschlossen'})[v]||v}
function render(){
  const r=analyze();if(!r)return;
  const detected=$('fpAbdichtungDetected'),sum=$('fpSealSummary'),mats=$('fpSealMaterials');
  if(detected)detected.innerHTML=
    `<div><b>Erkannt:</b> Beispiel ${r.example.nr||'–'} · ${esc(r.example.label)}</div>`+
    `<div><b>Klasse:</b> ${r.cls} · <b>Dusche:</b> ${esc(showerText(r.showerType))}</div>`;

  if(sum)sum.innerHTML=`
    <div class="fp-seal-kpi"><span>Boden abdichten</span><strong>${fmt(r.floorArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Wand brutto</span><strong>${fmt(r.grossWallArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Tür/Fenster/Nische Abzug</span><strong>− ${fmt(r.openingSubtractArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Nischen-Innenflächen</span><strong>+ ${fmt(r.nicheAddArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Wand netto abdichten</span><strong>${fmt(r.wallArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Gesamt Abdichtung</span><strong>${fmt(r.totalArea)} m²</strong></div>
    <div class="fp-seal-kpi"><span>Boden-Wand Dichtband</span><strong>${fmt(r.perimeter)} m</strong></div>
    <div class="fp-seal-kpi"><span>Vertikale Ecken Dichtband</span><strong>${fmt(r.verticalTape)} m</strong></div>
    <div class="fp-seal-kpi"><span>Tür/Fenster/Nische Anschlüsse</span><strong>${fmt(r.openingTape)} m</strong></div>
    <div class="fp-seal-kpi"><span>Wannen-/Duschrandband</span><strong>${fmt(r.zargenBand)} m</strong></div>
    <div class="fp-seal-kpi"><span>Innenecken</span><strong>${r.corners.inner} St.</strong></div>
    <div class="fp-seal-kpi"><span>Aussenecken</span><strong>${r.corners.outer} St.</strong></div>
    <div class="fp-seal-kpi"><span>Nischen erkannt</span><strong>${r.openings.nicheCount} St.</strong></div>
    <div class="fp-seal-kpi"><span>Tür / Fenster erkannt</span><strong>${r.openings.doorCount} / ${r.openings.windowCount}</strong></div>`;

  if(mats)mats.innerHTML=
    `<div class="fp-seal-material-head"><strong>Automatischer Materialbedarf</strong><span>inkl. ${fmt(r.wastePct,0)} % Reserve</span></div>`+
    r.materials.filter(x=>Number(x.qty)>0).map(x=>
      `<div class="fp-seal-material-row"><div><b>${esc(x.brand?x.brand+' · '+x.name:x.name)}</b><small>${esc(x.pack)}</small></div>`+
      `<div><strong>${fmt(x.qty,x.unit==='St.'?0:2)} ${x.unit}</strong><span>${x.packs} Gebinde</span></div></div>`
    ).join('');
}
function syncControls(){
  const c=cfg();if(!c)return;
  if($('fpSealClass'))$('fpSealClass').value=c.classMode;
  if($('fpSealShowerType'))$('fpSealShowerType').value=c.showerType;
  if($('fpSealWaste'))$('fpSealWaste').value=c.wastePct;
  if($('fpSealWallCollars'))$('fpSealWallCollars').value=c.extraWallCollars;
  if($('fpSealOverlay'))$('fpSealOverlay').checked=c.overlay!==false;
}
function readControls(){
  const c=cfg();if(!c)return;
  c.classMode=$('fpSealClass')?.value||'auto';
  c.showerType=$('fpSealShowerType')?.value||'auto';
  c.wastePct=Math.max(0,Number($('fpSealWaste')?.value)||0);
  c.extraWallCollars=Math.max(0,Math.round(Number($('fpSealWallCollars')?.value)||0));
  c.overlay=$('fpSealOverlay')?.checked!==false;
  try{save()}catch(_){try{localStorage.setItem(K3,JSON.stringify(S))}catch(__){}}
  render();try{drawFloorplan()}catch(_){}
}
function open(){syncControls();render();$('fpAbdichtungPanel')?.classList.remove('hidden');try{drawFloorplan()}catch(_){}}
function close(){$('fpAbdichtungPanel')?.classList.add('hidden')}
function saveMaterial(){
  const r=analyze();if(!r||!fpRecord)return;
  fpRecord.abdichtung.materialList=r.materials;
  fpRecord.abdichtung.materialText=r.materials.filter(x=>Number(x.qty)>0).map(x=>`${x.brand?x.brand+' ':''}${x.name}: ${fmt(x.qty,x.unit==='St.'?0:2)} ${x.unit} · ${x.packs} Gebinde`).join('\n');
  try{save()}catch(_){}
}
function pdfSafe(v){return String(v??'').replace(/[®]/g,'').replace(/[–—]/g,'-')}
function projectMaterialRows(){
  const rows=[],r=analyze();
  if(r)r.materials.filter(x=>Number(x.qty)>0).forEach(x=>rows.push({
    group:'Abdichtung / Dusche',
    name:(x.brand?x.brand+' · ':'')+x.name,
    qty:`${fmt(x.qty,x.unit==='St.'?0:2)} ${x.unit}`,
    pack:x.pack||'',
    packs:x.packs?String(x.packs):''
  }));
  const tiles=fpProject?.tileMaterials||[];
  tiles.forEach(x=>{
    const name=[x.brand,x.model].filter(Boolean).join(' ')||'Fliesenmaterial';
    rows.push({group:'Fliesen / Projektmaterial',name,qty:x.quantity?String(x.quantity):'',pack:[x.format,x.color,x.surface].filter(Boolean).join(' · '),packs:x.article?`Art. ${x.article}`:''});
  });
  return rows;
}
function exportMaterialPdf(){
  if(!window.jspdf?.jsPDF){alert('PDF-Modul ist nicht geladen.');return}
  const rows=projectMaterialRows();if(!rows.length){alert('Keine Materialien vorhanden.');return}
  const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const pw=210,margin=15,rowH=9;let y=18,lastGroup='';
  const room=fpRecord?.name||'Grundriss',project=fpProject?.name||'Projekt Bau';
  function header(){doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('Projekt Bau - Materialliste',margin,y);y+=7;doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(pdfSafe(project),margin,y);doc.text(pdfSafe(room),pw-margin,y,{align:'right'});y+=5;doc.setDrawColor(210);doc.line(margin,y,pw-margin,y);y+=7}
  function pageBreak(need=18){if(y+need>282){doc.addPage();y=18;lastGroup='';header()}}
  header();
  for(const row of rows){
    pageBreak(22);
    if(row.group!==lastGroup){y+=2;doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(35,55,75);doc.text(pdfSafe(row.group),margin,y);y+=6;lastGroup=row.group}
    doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(9);
    const nameLines=doc.splitTextToSize(pdfSafe(row.name),85);doc.text(nameLines,margin,y);
    doc.setFont('helvetica','normal');doc.text(pdfSafe(row.qty),118,y);
    if(row.packs)doc.text(pdfSafe(row.packs),pw-margin,y,{align:'right'});
    const details=doc.splitTextToSize(pdfSafe(row.pack),75);if(details.length){doc.setFontSize(7.5);doc.setTextColor(90);doc.text(details,margin,y+4)}
    y+=Math.max(rowH,4+details.length*3.2,nameLines.length*4.2+3);doc.setDrawColor(235);doc.line(margin,y-2,pw-margin,y-2);
  }
  y+=4;pageBreak(16);doc.setFontSize(7.5);doc.setTextColor(100);doc.text('Automatisch aus Grundriss, Abdichtungszonen, Öffnungen und Detailpunkten ermittelt.',margin,y);
  doc.save(`Materialliste_${String(room).replace(/[^a-zA-Z0-9_-]+/g,'_')}.pdf`);
}
function drawOverlay(){
  const c=cfg();if(!c?.overlay)return;
  const r=lastAnalysis||analyze();if(!r||!fpCtx)return;
  const z=Math.max(.1,Number(fpZoom)||1),poly=roomPolygon();
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
  // Highlight room corners according to type.
  if(r.corners&&poly?.length){
    const details=polygonCornerTypes().details;
    fpCtx.save();fpCtx.font=`bold ${10/z}px Arial`;fpCtx.textAlign='center';fpCtx.textBaseline='middle';
    for(const d of details){
      fpCtx.fillStyle=d.type==='inner'?'#16a34a':'#dc2626';
      fpCtx.beginPath();fpCtx.arc(d.x,d.y,7/z,0,Math.PI*2);fpCtx.fill();
      fpCtx.fillStyle='#fff';fpCtx.fillText(d.type==='inner'?'I':'A',d.x,d.y);
    }
    fpCtx.restore();
  }
}
function planChanged(){clearTimeout(debounce);debounce=setTimeout(()=>{if(!$('fpAbdichtungPanel')?.classList.contains('hidden'))render();else lastAnalysis=null},250)}
function install(){
  $('fpAbdichtungTool')?.addEventListener('click',open);
  $('fpAbdichtungClose')?.addEventListener('click',close);
  $('fpSealRecalculate')?.addEventListener('click',()=>{readControls();render()});
  $('fpSealSaveMaterial')?.addEventListener('click',saveMaterial);
  $('fpSealMaterialPdf')?.addEventListener('click',exportMaterialPdf);
  ['fpSealClass','fpSealShowerType','fpSealWaste','fpSealWallCollars','fpSealOverlay'].forEach(id=>$(id)?.addEventListener('change',readControls));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
window.ProjectBauAbdichtung={open,analyze,render,drawOverlay,planChanged,exportMaterialPdf};
})();
