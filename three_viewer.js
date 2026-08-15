import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls, host;
let rootGroup = null;
let gridHelper = null;
let currentData = null;
let resizeObserver = null;

const textureLoader = new THREE.TextureLoader();

function m(cm){ return Number(cm || 0) / 100; }

function disposeObject(obj){
  obj.traverse(child=>{
    if(child.geometry) child.geometry.dispose?.();
    if(child.material){
      const mats=Array.isArray(child.material)?child.material:[child.material];
      mats.forEach(mat=>{
        if(mat.map) mat.map.dispose?.();
        mat.dispose?.();
      });
    }
  });
}

function ensureScene(container){
  if(host === container && renderer) return;

  if(renderer){
    resizeObserver?.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  }

  host = container;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef4fb);

  camera = new THREE.PerspectiveCamera(48, 1, 0.01, 200);
  camera.position.set(6,5.5,7);

  renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.innerHTML='';
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.screenSpacePanning = true;
  controls.minDistance = 1;
  controls.maxDistance = 35;
  controls.maxPolarAngle = Math.PI * .49;

  const hemi = new THREE.HemisphereLight(0xffffff,0x8492a6,2.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff,2.4);
  sun.position.set(8,12,6);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  scene.add(sun);

  gridHelper = new THREE.GridHelper(20,100,0x9aa9ba,0xd5dee8);
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  animate();
}

function resize(){
  if(!renderer || !host) return;
  const w=Math.max(1,host.clientWidth);
  const h=Math.max(1,host.clientHeight);
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

function animate(){
  if(!renderer) return;
  requestAnimationFrame(animate);
  controls?.update();
  renderer.render(scene,camera);
}

function makeTexture(dataUrl, repeatX=1, repeatY=1, options={}){
  if(!dataUrl) return null;
  const tex=textureLoader.load(
    dataUrl,
    ()=>{tex.needsUpdate=true;},
    undefined,
    err=>console.error('Fliesentextur konnte nicht geladen werden',err)
  );
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(Math.max(.25,repeatX),Math.max(.25,repeatY));

  const ox=Number(options.originX||0)/100;
  const oy=Number(options.originY||0)/100;
  tex.offset.set(-ox*Math.max(.25,repeatX),-oy*Math.max(.25,repeatY));

  tex.center.set(.5,.5);
  tex.rotation=THREE.MathUtils.degToRad(Number(options.rotation||0));
  tex.anisotropy=8;
  tex.needsUpdate=true;
  return tex;
}

function materialForTile(tile, repeatX=1, repeatY=1, fallback=0xd8dee7, options={}){
  const map=tile?.photo ? makeTexture(tile.photo,repeatX,repeatY,options) : null;
  const material=new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : fallback,
    map,
    roughness: map ? .48 : .68,
    metalness:.02
  });
  material.needsUpdate=true;
  return material;
}

function findTile(project,id){
  return (project?.tileMaterials||[]).find(t=>t.id===id) || null;
}


function roomCentroid3D(objects){
  const pts=buildPolygon(objects);
  if(!pts||!pts.length)return null;
  return {
    x:pts.reduce((s,p)=>s+p.x,0)/pts.length,
    z:pts.reduce((s,p)=>s+p.y,0)/pts.length
  };
}

function wallInteriorNormal3D(w,objects){
  const x1=m(w.x1),z1=m(w.y1),x2=m(w.x2),z2=m(w.y2);
  const dx=x2-x1,dz=z2-z1;
  const len=Math.hypot(dx,dz)||1;

  let nx=-dz/len,nz=dx/len;

  const c=roomCentroid3D(objects);
  if(c){
    const mx=(x1+x2)/2,mz=(z1+z2)/2;
    const vx=c.x-mx,vz=c.z-mz;
    if(nx*vx+nz*vz<0){
      nx=-nx;
      nz=-nz;
    }
  }

  return {nx,nz};
}


function floorGridIntersectionsAlongWall(w,floorCfg,objects){
  if(!floorCfg?.enabled)return [];
  const x1=m(w.x1),z1=m(w.y1),x2=m(w.x2),z2=m(w.y2);
  const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz)||1;
  const origin=resolveFloorTileOrigin3D(floorCfg,objects);
  let tw=Math.max(.01,m(floorCfg.tileW||60)),th=Math.max(.01,m(floorCfg.tileH||60));
  if(floorCfg.pattern==='vertical')[tw,th]=[th,tw];
  const ang=floorCfg.align==='45'?Math.PI/4:0,ca=Math.cos(ang),sa=Math.sin(ang);
  const local=(x,z)=>({x:(x-origin.x)*ca+(z-origin.z)*sa,z:-(x-origin.x)*sa+(z-origin.z)*ca});
  const a=local(x1,z1),b=local(x2,z2),ddx=b.x-a.x,ddz=b.z-a.z;
  const ts=[];
  if(Math.abs(ddx)>1e-9){
    const lo=Math.min(a.x,b.x),hi=Math.max(a.x,b.x);
    for(let gx=Math.ceil(lo/tw)*tw;gx<hi-1e-9;gx+=tw){const q=(gx-a.x)/ddx;if(q>1e-6&&q<1-1e-6)ts.push(q);}
  }
  if(Math.abs(ddz)>1e-9){
    const lo=Math.min(a.z,b.z),hi=Math.max(a.z,b.z);
    for(let gz=Math.ceil(lo/th)*th;gz<hi-1e-9;gz+=th){const q=(gz-a.z)/ddz;if(q>1e-6&&q<1-1e-6)ts.push(q);}
  }
  return [...new Set(ts.map(q=>Math.round(q*100000)/100000))].sort((x,y)=>x-y).map(q=>q*len);
}

function addWallTileAreaMeshes(group,w,roomHeight,objects){
  const areas=Array.isArray(w.tileAreas)?w.tileAreas:[];
  if(!areas.length)return;

  const x1=m(w.x1),z1=m(w.y1),x2=m(w.x2),z2=m(w.y2);
  const dx=x2-x1,dz=z2-z1;
  const wallLen=Math.hypot(dx,dz)||1;
  const ux=dx/wallLen,uz=dz/wallLen;
  const rotationY=-Math.atan2(dz,dx);
  const thickness=m(w.thickness||15);
  const interior=wallInteriorNormal3D(w,objects);

  for(const area of areas){
    const offset=Math.max(0,m(area.offset||0));
    const width=Math.max(.001,Math.min(m(area.width||0),wallLen-offset));
    const bottom=Math.max(0,m(area.bottom||0));
    const height=Math.max(.001,Math.min(m(area.height||0),roomHeight-bottom));
    if(width<=.001||height<=.001)continue;

    const cx=x1+ux*(offset+width/2);
    const cz=z1+uz*(offset+width/2);

    const tile=findTile(currentData?.project,area.materialId||currentData?.options?.wallMaterialId);
    const repeatX=Math.max(1,width/Math.max(.01,m(area.tileW||60)));
    const repeatY=Math.max(1,height/Math.max(.01,m(area.tileH||60)));
    const mat=materialForTile(tile,repeatX,repeatY,0xd8f1f4,{
      originX:0,originY:0,rotation:0
    });
    mat.side=THREE.DoubleSide;

    const plane=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);
    plane.position.set(
      cx+interior.nx*(thickness/2+.006),
      bottom+height/2,
      cz+interior.nz*(thickness/2+.006)
    );
    plane.rotation.y=rotationY;
    plane.receiveShadow=true;

    const tileW=Math.max(.05,m(area.tileW||60));
    const tileH=Math.max(.05,m(area.tileH||60));
    const lineMat=new THREE.LineBasicMaterial({
      color:0x6b8790,
      transparent:true,
      opacity:.72
    });

    const floorCfg=currentData?.record?.floorTile;
    const globalCuts=(area.syncToFloor!==false)
      ? floorGridIntersectionsAlongWall(w,floorCfg,objects)
      : [];
    const areaStart=offset,areaEnd=offset+width;
    const cuts=globalCuts
      .filter(d=>d>areaStart+.001&&d<areaEnd-.001)
      .map(d=>d-(areaStart+width/2));
    if(cuts.length){
      cuts.forEach(xx=>{
        const geo=new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(xx,-height/2,.002),
          new THREE.Vector3(xx,height/2,.002)
        ]);
        plane.add(new THREE.Line(geo,lineMat));
      });
    }else{
      for(let xx=-width/2+tileW;xx<width/2-.001;xx+=tileW){
        const geo=new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(xx,-height/2,.002),
          new THREE.Vector3(xx,height/2,.002)
        ]);
        plane.add(new THREE.Line(geo,lineMat));
      }
    }

    // Horizontal wall joints start exactly at floor level, so floor/wall
    // grout creates one continuous technical reference.
    const floorTileH = floorCfg?.enabled
      ? Math.max(.05,m(floorCfg.tileH||area.tileH||60))
      : tileH;
    const wallBottom = bottom;
    const firstJointWorld = Math.ceil((wallBottom+.0001)/floorTileH)*floorTileH;
    for(let worldY=firstJointWorld;worldY<bottom+height-.001;worldY+=floorTileH){
      const yy=worldY-(bottom+height/2);
      const geo=new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width/2,yy,.002),
        new THREE.Vector3(width/2,yy,.002)
      ]);
      plane.add(new THREE.Line(geo,lineMat));
    }

    group.add(plane);
  }
}

function wallOuterNormal3D(w,objects){
  const x1=m(w.x1),z1=m(w.y1),x2=m(w.x2),z2=m(w.y2);
  const dx=x2-x1,dz=z2-z1;
  const len=Math.hypot(dx,dz)||1;
  let nx=-dz/len,nz=dx/len;

  const c=roomCentroid3D(objects||[]);
  if(c){
    const mx=(x1+x2)/2,mz=(z1+z2)/2;
    // normal pointing toward room centre = inward -> flip to outward
    if(nx*(c.x-mx)+nz*(c.z-mz)>0){
      nx=-nx;nz=-nz;
    }
  }
  return {nx,nz};
}

function lineIntersectionXZ(a1,a2,b1,b2){
  const r={x:a2.x-a1.x,z:a2.z-a1.z};
  const s={x:b2.x-b1.x,z:b2.z-b1.z};
  const den=r.x*s.z-r.z*s.x;
  if(Math.abs(den)<1e-9)return null;
  const q={x:b1.x-a1.x,z:b1.z-a1.z};
  const tt=(q.x*s.z-q.z*s.x)/den;
  return {x:a1.x+tt*r.x,z:a1.z+tt*r.z};
}

function wallOuterLine3D(w,objects){
  const x1=m(w.x1),z1=m(w.y1),x2=m(w.x2),z2=m(w.y2);
  const {nx,nz}=wallOuterNormal3D(w,objects);
  const th=m(w.thickness||15);
  return {
    a:{x:x1+nx*th,z:z1+nz*th},
    b:{x:x2+nx*th,z:z2+nz*th}
  };
}

function connectedWallsAt3D(w,objects,atStart){
  const px=atStart?m(w.x1):m(w.x2);
  const pz=atStart?m(w.y1):m(w.y2);
  const tol=.035;
  return (objects||[]).filter(o=>{
    if(o===w||o.type!=='wall')return false;
    const a=Math.hypot(m(o.x1)-px,m(o.y1)-pz);
    const b=Math.hypot(m(o.x2)-px,m(o.y2)-pz);
    return Math.min(a,b)<tol;
  });
}

function wallOuterJointPoint3D(w,objects,atStart){
  const inner={
    x:atStart?m(w.x1):m(w.x2),
    z:atStart?m(w.y1):m(w.y2)
  };
  const selfLine=wallOuterLine3D(w,objects);
  const own=atStart?selfLine.a:selfLine.b;
  const others=connectedWallsAt3D(w,objects,atStart);

  for(const other of others){
    const otherLine=wallOuterLine3D(other,objects);
    const inter=lineIntersectionXZ(selfLine.a,selfLine.b,otherLine.a,otherLine.b);
    if(!inter)continue;

    const maxT=Math.max(m(w.thickness||15),m(other.thickness||15));
    if(Math.hypot(inter.x-inner.x,inter.z-inner.z)<=maxT*4){
      return inter;
    }
  }
  return own;
}

function wallMesh(w,height,material,objects){
  const x1=m(w.x1),z1=m(w.y1),x2=m(w.x2),z2=m(w.y2);
  const len=Math.hypot(x2-x1,z2-z1);
  if(len<.001)return null;

  // Saved wall line = room-side inner edge.
  const o1=wallOuterJointPoint3D(w,objects,true);
  const o2=wallOuterJointPoint3D(w,objects,false);

  const shape=new THREE.Shape();
  shape.moveTo(x1,z1);
  shape.lineTo(x2,z2);
  shape.lineTo(o2.x,o2.z);
  shape.lineTo(o1.x,o1.z);
  shape.closePath();

  const geo=new THREE.ExtrudeGeometry(shape,{
    depth:height,
    bevelEnabled:false,
    steps:1
  });

  // ExtrudeGeometry uses XY + Z depth; rotate so depth becomes vertical Y.
  geo.rotateX(Math.PI/2);
  geo.translate(0,height,0);

  const mesh=new THREE.Mesh(geo,material.clone());
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  return mesh;
}

function buildPolygon(objects){
  const walls=(objects||[]).filter(o=>o.type==='wall');
  if(walls.length<3) return null;

  const tol=.3;
  const nodes=[];
  function node(x,y){
    const px=m(x),py=m(y);
    let n=nodes.find(v=>Math.hypot(v.x-px,v.y-py)<tol);
    if(!n){ n={x:px,y:py,neighbors:[]}; nodes.push(n); }
    return n;
  }
  walls.forEach(w=>{
    const a=node(w.x1,w.y1),b=node(w.x2,w.y2);
    if(!a.neighbors.includes(b))a.neighbors.push(b);
    if(!b.neighbors.includes(a))b.neighbors.push(a);
  });
  if(nodes.some(n=>n.neighbors.length!==2)) return null;

  const first=nodes[0];
  const pts=[];
  let cur=first,prev=null;
  for(let guard=0;guard<nodes.length+2;guard++){
    pts.push(cur);
    const next=cur.neighbors.find(n=>n!==prev);
    prev=cur;cur=next;
    if(cur===first)break;
  }
  if(cur!==first || pts.length<3) return null;
  return pts;
}

function floorMesh(objects, material){
  const pts=buildPolygon(objects);
  if(!pts) return null;
  const shape=new THREE.Shape();
  shape.moveTo(pts[0].x,pts[0].y);
  pts.slice(1).forEach(p=>shape.lineTo(p.x,p.y));
  shape.closePath();
  const geo=new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI/2);
  const mesh=new THREE.Mesh(geo,material);
  mesh.position.y=.005;
  mesh.receiveShadow=true;
  return mesh;
}


function objectDefaultDims3D(type){
  const dims={
    door:[90,15],window:[100,15],wc:[40,70],shower:[90,90],
    bathtub:[180,80],sink:[60,50],drain:[15,15],
    kitchenSink:[60,60],stove:[60,60],fridge:[60,65],washingMachine:[60,65],
    table:[160,90],chair:[50,50],sofa:[220,90],bed:[200,100],cabinet:[120,60],plant:[45,45]
  };
  return dims[type]||[60,40];
}

function simpleBox(o,height,color=0xcbd5e1){
  const w=m(o.widthCm||60)*(o.scale||1);
  const d=m(o.depthCm||60)*(o.scale||1);
  const geo=new THREE.BoxGeometry(w,height,d);
  const mat=new THREE.MeshStandardMaterial({color,roughness:.72});
  const mesh=new THREE.Mesh(geo,mat);
  mesh.position.set(m(o.x),height/2,m(o.y));
  mesh.rotation.y=-(o.rotation||0)*Math.PI/180;
  mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh;
}


function mat(color, roughness=.55, metalness=0){
  return new THREE.MeshStandardMaterial({color,roughness,metalness});
}
function glassMat(){
  return new THREE.MeshPhysicalMaterial({
    color:0xd8f3ff,
    transparent:true,
    opacity:.28,
    roughness:.08,
    metalness:0,
    transmission:.55,
    thickness:.012,
    side:THREE.DoubleSide
  });
}
const CERAMIC=()=>mat(0xf7f7f4,.22,0);
const CHROME=()=>mat(0xbec6cf,.2,.78);
const DARK=()=>mat(0x30343b,.42,.35);
const WOOD=()=>mat(0xa7774f,.62,.02);
const FABRIC=()=>mat(0x7b8797,.82,0);
const WHITE=()=>mat(0xf1f3f5,.45,0);

function addBox(group,w,h,d,x,y,z,material,rx=0,ry=0,rz=0){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);
  mesh.rotation.set(rx,ry,rz);
  mesh.castShadow=true;mesh.receiveShadow=true;
  group.add(mesh);
  return mesh;
}
function addCylinder(group,rTop,rBottom,h,x,y,z,material,radial=32,rx=0,ry=0,rz=0){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,radial),material);
  mesh.position.set(x,y,z);
  mesh.rotation.set(rx,ry,rz);
  mesh.castShadow=true;mesh.receiveShadow=true;
  group.add(mesh);
  return mesh;
}
function addSphere(group,rx,ry,rz,x,y,z,material){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),material);
  mesh.scale.set(rx,ry,rz);
  mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=true;
  group.add(mesh);
  return mesh;
}
function finishObject(group,o){
  group.position.set(m(o.x),0,m(o.y));
  group.rotation.y=-(o.rotation||0)*Math.PI/180;
  group.scale.setScalar(o.scale||1);
  return group;
}

function realisticSink(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||60),d=m(o.depthCm||50);
  const ceramic=CERAMIC(), chrome=CHROME();

  // slim cabinet / pedestal body
  addBox(g,w*.72,.64,d*.62,0,.36,.04,mat(0xf0f1ef,.55,.02));

  // thick ceramic top
  addBox(g,w,.085,d,0,.78,0,ceramic);

  // oval basin with darker inner bowl
  addSphere(g,w*.40,.075,d*.34,0,.785,0,ceramic);
  addSphere(g,w*.31,.042,d*.25,0,.806,0,mat(0xcfd7dc,.22,.06));

  // drain
  addCylinder(g,.025,.025,.012,0,.825,0,chrome,24);

  // curved tap illusion: vertical stem + spout
  addCylinder(g,.018,.018,.23,0,.94,-d*.27,chrome,18);
  addCylinder(g,.014,.014,.16,0,1.04,-d*.18,chrome,18,Math.PI/2);

  return finishObject(g,o);
}

function realisticWC(o){
  const g=new THREE.Group();
  const ceramic=CERAMIC(), chrome=CHROME();
  const w=m(o.widthCm||40),d=m(o.depthCm||70);

  // floor foot + rounded bowl
  addBox(g,w*.70,.16,d*.42,0,.10,d*.10,ceramic);
  addSphere(g,w*.42,.18,d*.32,0,.29,d*.05,ceramic);

  // seat ring
  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(Math.min(w,d)*.30,.022,14,42),
    mat(0xf0f0ee,.30,0)
  );
  ring.scale.z=1.24;
  ring.rotation.x=Math.PI/2;
  ring.position.set(0,.43,d*.03);
  g.add(ring);

  // cistern against wall side
  addBox(g,w*.92,.50,d*.22,0,.55,-d*.34,ceramic);
  addCylinder(g,.016,.016,.018,w*.18,.81,-d*.455,chrome,16);

  return finishObject(g,o);
}

function realisticShower(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||90),d=m(o.depthCm||90);
  const chrome=CHROME(),glass=glassMat();

  // low tray with raised edge
  addBox(g,w,.035,d,0,.02,0,WHITE());
  addBox(g,w,.035,.025,0,.055,-d/2,WHITE());
  addBox(g,.025,.035,d,-w/2,.055,0,WHITE());
  addCylinder(g,.035,.035,.012,0,.052,0,chrome,24);

  // two glass panels
  addBox(g,w,1.95,.012,0,.99,-d/2,glass);
  addBox(g,.012,1.95,d,-w/2,.99,0,glass);

  // polished frames
  addCylinder(g,.010,.010,1.95,-w/2,.99,-d/2,chrome,12);
  addCylinder(g,.010,.010,1.95, w/2,.99,-d/2,chrome,12);
  addCylinder(g,.010,.010,1.95,-w/2,.99, d/2,chrome,12);

  // shower rail + mixer + head
  addCylinder(g,.011,.011,1.35,w*.28,.95,d*.30,chrome,12);
  addSphere(g,.065,.018,.065,w*.28,1.58,d*.30,chrome);
  addCylinder(g,.028,.028,.055,w*.28,.88,d*.30,chrome,20,Math.PI/2);

  return finishObject(g,o);
}

function realisticBathtub(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||180),d=m(o.depthCm||80);
  const ceramic=CERAMIC();

  // outer shell
  addBox(g,w,.50,d,0,.27,0,ceramic);

  // inset cavity illusion with two nested rounded volumes
  addSphere(g,w*.42,.16,d*.36,0,.47,0,mat(0xe5eaed,.18,0));
  addSphere(g,w*.34,.105,d*.28,0,.49,0,mat(0xcfd7dc,.20,.02));

  // rim
  addBox(g,w,.045,d,0,.555,0,ceramic);

  // drain and tap set
  addCylinder(g,.028,.028,.012,-w*.30,.575,0,CHROME(),24);
  addCylinder(g,.016,.016,.20,w*.36,.66,-d*.34,CHROME(),16);
  addCylinder(g,.012,.012,.13,w*.36,.76,-d*.27,CHROME(),16,Math.PI/2);

  return finishObject(g,o);
}

function realisticKitchenSink(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||60),d=m(o.depthCm||60);
  const steel=mat(0xb9c1c8,.24,.72);

  // counter block
  addBox(g,w,.07,d,0,.90,0,mat(0xd8d8d3,.5,.08));
  // inset bowl
  addBox(g,w*.66,.20,d*.56,0,.79,0,steel);
  // dark interior
  addBox(g,w*.56,.05,d*.46,0,.73,0,mat(0x808a93,.3,.45));

  // faucet
  addCylinder(g,.014,.014,.25,0,1.02,-d*.28,CHROME(),16);
  addCylinder(g,.012,.012,.16,0,1.12,-d*.20,CHROME(),16,Math.PI/2,0,0);

  // cabinet
  addBox(g,w*.94,.78,d*.86,0,.46,0,mat(0xe9e6df,.62,0));
  return finishObject(g,o);
}

function realisticStove(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||60),d=m(o.depthCm||60);

  addBox(g,w,.86,d,0,.43,0,mat(0x454b52,.38,.48));
  addBox(g,w*.96,.055,d*.96,0,.89,0,mat(0x15181c,.22,.6));

  const steel=CHROME();
  for(const x of [-w*.22,w*.22]){
    for(const z of [-d*.22,d*.22]){
      addCylinder(g,.075,.075,.012,x,.925,z,steel,32);
      addCylinder(g,.045,.045,.016,x,.934,z,DARK(),24);
    }
  }
  // oven window
  addBox(g,w*.72,.34,.015,0,.48,d/2+.008,mat(0x111827,.2,.45));
  return finishObject(g,o);
}

function realisticFridge(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||60),d=m(o.depthCm||65);
  addBox(g,w,1.85,d,0,.925,0,mat(0xe4e7ea,.34,.26));
  // freezer separation
  addBox(g,w*.92,.008,.012,0,1.15,d/2+.01,DARK());
  // handles
  addCylinder(g,.010,.010,.50,w*.32,1.40,d/2+.03,CHROME(),12);
  addCylinder(g,.010,.010,.38,w*.32,.70,d/2+.03,CHROME(),12);
  return finishObject(g,o);
}

function realisticWasher(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||60),d=m(o.depthCm||65);
  addBox(g,w,.86,d,0,.43,0,WHITE());
  // door
  const outer=new THREE.Mesh(new THREE.TorusGeometry(.19,.028,16,40),DARK());
  outer.rotation.x=Math.PI/2;
  outer.position.set(0,.42,d/2+.015);
  g.add(outer);
  addCylinder(g,.16,.16,.015,0,.42,d/2+.028,glassMat(),40,Math.PI/2);
  // control strip
  addBox(g,w*.9,.13,.02,0,.76,d/2+.02,mat(0xdde2e6,.35,.08));
  addCylinder(g,.035,.035,.02,w*.22,.77,d/2+.04,DARK(),24,Math.PI/2);
  return finishObject(g,o);
}

function realisticTable(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||160),d=m(o.depthCm||90);
  addBox(g,w,.07,d,0,.76,0,WOOD());
  const legMat=mat(0x5c4635,.62,.04);
  for(const x of [-w*.42,w*.42])for(const z of [-d*.38,d*.38]){
    addBox(g,.07,.74,.07,x,.37,z,legMat);
  }
  return finishObject(g,o);
}

function realisticChair(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||50),d=m(o.depthCm||50);
  addBox(g,w*.78,.06,d*.78,0,.48,0,WOOD());
  for(const x of [-w*.3,w*.3])for(const z of [-d*.3,d*.3]){
    addBox(g,.045,.48,.045,x,.24,z,mat(0x634a38,.66,.03));
  }
  addBox(g,w*.78,.56,.06,0,.78,-d*.34,WOOD());
  return finishObject(g,o);
}

function realisticSofa(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||220),d=m(o.depthCm||90);
  const fab=FABRIC();

  addBox(g,w,.26,d*.82,0,.26,0,fab);
  addBox(g,w*.92,.18,d*.60,0,.48,d*.08,mat(0x8693a4,.85,0));
  addBox(g,w*.92,.58,.18,0,.74,-d*.31,fab);
  addBox(g,.18,.48,d*.78,-w*.46,.51,0,fab);
  addBox(g,.18,.48,d*.78,w*.46,.51,0,fab);

  return finishObject(g,o);
}

function realisticBed(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||200),d=m(o.depthCm||100);

  addBox(g,w,.22,d,0,.18,0,WOOD());
  addBox(g,w*.96,.24,d*.92,0,.35,0,mat(0xf0ede8,.9,0));
  addBox(g,w*.86,.12,d*.25,0,.52,-d*.30,WHITE());
  addBox(g,w,.70,.10,0,.48,-d*.47,WOOD());

  return finishObject(g,o);
}

function realisticCabinet(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||120),d=m(o.depthCm||60);
  addBox(g,w,2.05,d,0,1.025,0,mat(0xc6b195,.64,.02));
  addBox(g,.012,1.92,.015,0,1.03,d/2+.012,mat(0x8f785d,.55,.08));
  addCylinder(g,.012,.012,.12,-.06,1.05,d/2+.025,CHROME(),12);
  addCylinder(g,.012,.012,.12,.06,1.05,d/2+.025,CHROME(),12);
  return finishObject(g,o);
}

function realisticPlant(o){
  const g=new THREE.Group();
  const [dw,dd]=objectDefaultDims3D('plant');
  const sx=Math.max(.05,Number(o.widthCm||dw)/dw);
  const sz=Math.max(.05,Number(o.depthCm||dd)/dd);
  // pot
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(.18,.23,.34,28),mat(0x9a6548,.72,.02));
  pot.position.y=.17;pot.castShadow=true;g.add(pot);
  // trunk
  addCylinder(g,.025,.035,.55,0,.58,0,mat(0x6b4f36,.75,0),12);
  // leaves
  const leafMat=mat(0x4f8d59,.65,0);
  const leafPos=[
    [-.18,.82,0], [.18,.85,.02], [0,.95,.14],
    [0,.90,-.16], [-.13,1.03,.10], [.14,1.08,-.05]
  ];
  leafPos.forEach(([x,y,z])=>addSphere(g,.17,.07,.09,x,y,z,leafMat));
  g.scale.x*=sx; g.scale.z*=sz;
  return finishObject(g,o);
}

function realisticDrain(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||15);
  addBox(g,w,.018,w,0,.012,0,CHROME());
  const dark=DARK();
  for(let i=-2;i<=2;i++){
    addBox(g,w*.72,.006,.008,0,.025,i*w*.12,dark);
    addBox(g,.008,.006,w*.72,i*w*.12,.026,0,dark);
  }
  return finishObject(g,o);
}

function objectMesh(o){
  const type=o.type;

  if(type==='door'){
    const g=new THREE.Group();
    const w=m(o.widthCm||90);
    const h=Math.max(.5,m(o.heightCm||205));
    const frame=mat(0xe9edf0,.42,.08);
    const wood=WOOD();
    const chrome=CHROME();

    // Visible frame posts + lintel
    addBox(g,.055,h+.08,.075,-w/2,h/2,0,frame);
    addBox(g,.055,h+.08,.075, w/2,h/2,0,frame);
    addBox(g,w+.11,.055,.075,0,h+.025,0,frame);

    // Door leaf as separate pivot group. 2D opening direction controls hinge side.
    const leaf=new THREE.Group();
    addBox(leaf,w*.98,h,.045,w*.49,h/2,0,wood);
    addCylinder(leaf,.016,.016,.11,w*.80,Math.min(h*.52,1.05),.045,chrome,16,Math.PI/2);

    const left=(o.openingDirection||'right')==='left';
    const inward=(o.openingSide||o.swingSide||'inside')!=='outside';

    leaf.position.x=left ? w/2 : -w/2;
    leaf.scale.x=left ? -1 : 1;

    // Give the leaf a visible opening angle so it cannot disappear inside the wall.
    let openDeg=Number(o.openAngleDeg);
    if(!Number.isFinite(openDeg))openDeg=35;
    const signed=(inward?1:-1)*(left?-1:1);
    leaf.rotation.y=THREE.MathUtils.degToRad(openDeg*signed);
    g.add(leaf);

    return finishObject(g,o);
  }
  if(type==='window'){
    const g=new THREE.Group();
    const w=m(o.widthCm||100);
    const h=Math.max(.5,m(o.heightCm||120));
    const sill=Math.max(.2,m(o.sillHeightCm||90));
    const frame=mat(0xdce1e5,.36,.18);

    addBox(g,w,.055,.08,0,sill,0,frame);
    addBox(g,w,.055,.08,0,sill+h,0,frame);
    addBox(g,.055,h,.08,-w/2,sill+h/2,0,frame);
    addBox(g,.055,h,.08, w/2,sill+h/2,0,frame);
    addBox(g,.035,h*.95,.025,0,sill+h/2,0,glassMat());

    // centre mullion for a more architectural appearance
    addBox(g,.035,h,.055,0,sill+h/2,0,frame);
    return finishObject(g,o);
  }
  if(type==='wc')return realisticWC(o);
  if(type==='shower')return realisticShower(o);
  if(type==='bathtub')return realisticBathtub(o);
  if(type==='sink')return realisticSink(o);
  if(type==='kitchenSink')return realisticKitchenSink(o);
  if(type==='stove')return realisticStove(o);
  if(type==='fridge')return realisticFridge(o);
  if(type==='washingMachine')return realisticWasher(o);
  if(type==='table')return realisticTable(o);
  if(type==='chair')return realisticChair(o);
  if(type==='sofa')return realisticSofa(o);
  if(type==='bed')return realisticBed(o);
  if(type==='cabinet')return realisticCabinet(o);
  if(type==='plant')return realisticPlant(o);
  if(type==='drain')return realisticDrain(o);

  return simpleBox(o,.5,0xcbd5e1);
}

function centerCamera(group){
  const box=new THREE.Box3().setFromObject(group);
  if(box.isEmpty())return;

  const center=box.getCenter(new THREE.Vector3());
  const sphere=box.getBoundingSphere(new THREE.Sphere());
  const radius=Math.max(.8,sphere.radius);

  if(gridHelper){
    gridHelper.position.x=center.x;
    gridHelper.position.z=center.z;
  }

  const vfov=THREE.MathUtils.degToRad(camera.fov);
  const hfov=2*Math.atan(Math.tan(vfov/2)*Math.max(.25,camera.aspect));
  const fitFov=Math.min(vfov,hfov);
  const distance=(radius/Math.sin(fitFov/2))*1.18;

  controls.target.set(center.x,Math.max(.7,Math.min(center.y,1.25)),center.z);

  const dir=new THREE.Vector3(1,.9,1).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(distance));
  camera.near=Math.max(.01,distance/200);
  camera.far=Math.max(100,distance*30);
  camera.updateProjectionMatrix();

  controls.minDistance=Math.max(.5,radius*.35);
  controls.maxDistance=Math.max(25,radius*12);
  controls.update();
}


function resolveFloorTileOrigin3D(c,objects){
  const pts=buildPolygon(objects||[]);
  if(!pts||!pts.length)return{x:m(c?.originX||0),z:m(c?.originY||0)};
  const xs=pts.map(q=>q.x),zs=pts.map(q=>q.y);
  const b={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
  switch(c?.originMode||'manual'){
    case 'topLeft':return{x:b.minX,z:b.minZ};
    case 'topRight':return{x:b.maxX,z:b.minZ};
    case 'bottomLeft':return{x:b.minX,z:b.maxZ};
    case 'bottomRight':return{x:b.maxX,z:b.maxZ};
    case 'center':return{x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};
    default:return{x:m(c?.originX||0),z:m(c?.originY||0)};
  }
}
function pointInPolygon3D(x,z,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i],b=pts[j];
    const hit=((a.y>z)!==(b.y>z))&&(x<(b.x-a.x)*(z-a.y)/((b.y-a.y)||1e-9)+a.x);
    if(hit)inside=!inside;
  }
  return inside;
}

function segIntersectionT(a,b,c,d){
  const rx=b.x-a.x, rz=b.z-a.z, sx=d.x-c.x, sz=d.z-c.z;
  const den=rx*sz-rz*sx;
  if(Math.abs(den)<1e-9)return null;
  const qx=c.x-a.x,qz=c.z-a.z;
  const tt=(qx*sz-qz*sx)/den, u=(qx*rz-qz*rx)/den;
  if(tt>=-1e-9&&tt<=1+1e-9&&u>=-1e-9&&u<=1+1e-9)return Math.max(0,Math.min(1,tt));
  return null;
}
function clipSegmentToPolygon3D(a,b,pts){
  const ts=[0,1];
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const c={x:pts[j].x,z:pts[j].y},d={x:pts[i].x,z:pts[i].y};
    const tt=segIntersectionT(a,b,c,d);
    if(tt!==null)ts.push(tt);
  }
  ts.sort((x,y)=>x-y);
  const uniq=ts.filter((v,i)=>i===0||Math.abs(v-ts[i-1])>1e-7);
  const out=[];
  for(let i=0;i<uniq.length-1;i++){
    const t1=uniq[i],t2=uniq[i+1];
    if(t2-t1<1e-7)continue;
    const mid=(t1+t2)/2;
    const mx=a.x+(b.x-a.x)*mid,mz=a.z+(b.z-a.z)*mid;
    if(pointInPolygon3D(mx,mz,pts)){
      out.push([
        {x:a.x+(b.x-a.x)*t1,z:a.z+(b.z-a.z)*t1},
        {x:a.x+(b.x-a.x)*t2,z:a.z+(b.z-a.z)*t2}
      ]);
    }
  }
  return out;
}

function addFloorTileGrid(group,data){
  const c=data?.record?.floorTile||data?.floorTile;
  if(!c?.enabled)return;
  const pts=buildPolygon(data.objects||[]);
  if(!pts||pts.length<3)return;

  // buildPolygon() ALREADY returns metres. Do not divide these coordinates by 100 again.
  const xs=pts.map(q=>q.x),zs=pts.map(q=>q.y);
  const mnx=Math.min(...xs),mxx=Math.max(...xs),mnz=Math.min(...zs),mxz=Math.max(...zs);
  let tw=Math.max(.01,m(c.tileW||60)),th=Math.max(.01,m(c.tileH||60));
  if(c.pattern==='vertical')[tw,th]=[th,tw];
  const o=resolveFloorTileOrigin3D(c,data.objects||[]);
  const angle=c.align==='45'?Math.PI/4:0;
  const ca=Math.cos(angle),sa=Math.sin(angle);
  const toLocal=(x,z)=>({x:(x-o.x)*ca+(z-o.z)*sa,z:-(x-o.x)*sa+(z-o.z)*ca});
  const toWorld=(x,z)=>({x:o.x+x*ca-z*sa,z:o.z+x*sa+z*ca});
  const lp=pts.map(q=>toLocal(q.x,q.y));
  const lx=lp.map(q=>q.x),lz=lp.map(q=>q.z);
  const minX=Math.min(...lx)-tw,maxX=Math.max(...lx)+tw,minZ=Math.min(...lz)-th,maxZ=Math.max(...lz)+th;
  const sx=Math.floor(minX/tw)*tw,ex=Math.ceil(maxX/tw)*tw,sz=Math.floor(minZ/th)*th,ez=Math.ceil(maxZ/th)*th;
  const matLine=new THREE.LineBasicMaterial({color:0x0e7490,transparent:true,opacity:.72});
  const tileGroup=new THREE.Group();

  // Draw only tile edges whose midpoint lies inside the room. This prevents the old
  // detached second grid from appearing outside the actual floor polygon.
  const addSeg=(a,b)=>{
    for(const [p1,p2] of clipSegmentToPolygon3D(a,b,pts)){
      tileGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p1.x,.014,p1.z),new THREE.Vector3(p2.x,.014,p2.z)
      ]),matLine));
    }
  };
  for(let x=sx;x<=ex+1e-9;x+=tw){
    for(let z=sz;z<ez-1e-9;z+=th){
      addSeg(toWorld(x,z),toWorld(x,Math.min(z+th,ez)));
    }
  }
  for(let z=sz;z<=ez+1e-9;z+=th){
    for(let x=sx;x<ex-1e-9;x+=tw){
      let shift=0;
      const row=Math.round((z-sz)/th);
      if(c.pattern==='half'&&row%2)shift=tw/2;
      if(c.pattern==='third')shift=(row%3)*tw/3;
      addSeg(toWorld(x+shift,z),toWorld(Math.min(x+tw+shift,ex+tw),z));
    }
  }
  group.add(tileGroup);
}

function texturedFloorSurface(objects,material){
  const pts=buildPolygon(objects);
  if(!pts||pts.length<3)return null;

  const shape=new THREE.Shape();
  shape.moveTo(pts[0].x,pts[0].y);
  pts.slice(1).forEach(p=>shape.lineTo(p.x,p.y));
  shape.closePath();

  const geo=new THREE.ShapeGeometry(shape);

  // Explicit UV mapping in room/world coordinates. This avoids relying on
  // ShapeGeometry's default UVs and makes uploaded tile images reliably visible.
  geo.computeBoundingBox();
  const bb=geo.boundingBox;
  const sizeX=Math.max(.001,bb.max.x-bb.min.x);
  const sizeY=Math.max(.001,bb.max.y-bb.min.y);
  const pos=geo.attributes.position;
  const uvs=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i);
    uvs.push((x-bb.min.x)/sizeX,(y-bb.min.y)/sizeY);
  }
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.rotateX(Math.PI/2);

  material.side=THREE.DoubleSide;
  material.needsUpdate=true;

  const mesh=new THREE.Mesh(geo,material);
  mesh.position.y=.011;
  mesh.receiveShadow=true;
  mesh.renderOrder=1;
  return mesh;
}

function rebuild(){
  if(!scene || !currentData) return;

  if(rootGroup){
    scene.remove(rootGroup);
    disposeObject(rootGroup);
  }
  rootGroup=new THREE.Group();
  scene.add(rootGroup);

  const {objects,record,project,options}=currentData;
  const roomHeight=Number(record?.roomHeightM)||2.4;

  const floorCfg=record?.floorTile||{};
  const floorTile=findTile(project,floorCfg.materialId||options?.floorMaterialId);
  const wallTile=findTile(project,options?.wallMaterialId);

  const roomPts=buildPolygon(objects)||[];
  const rw=roomPts.length?Math.max(...roomPts.map(p=>p.x))-Math.min(...roomPts.map(p=>p.x)):5;
  const rd=roomPts.length?Math.max(...roomPts.map(p=>p.y))-Math.min(...roomPts.map(p=>p.y)):5;
  const floorMat=materialForTile(
    floorTile,
    Math.max(1,rw/Math.max(.01,m(floorCfg.tileW||60))),
    Math.max(1,rd/Math.max(.01,m(floorCfg.tileH||60))),
    0xd8d8d3,
    {
      originX:floorCfg.originX||options?.tileOriginX||0,
      originY:floorCfg.originY||options?.tileOriginY||0,
      rotation:floorCfg.align==='45'?45:(options?.tileRotation||0)
    }
  );
  const wallMat=materialForTile(wallTile,4,2,0xf1f3f5);

  const floor = floorTile?.photo
    ? texturedFloorSurface(objects,floorMat)
    : floorMesh(objects,floorMat);
  if(floor) rootGroup.add(floor);

  addFloorTileGrid(rootGroup,currentData);

  (objects||[]).filter(o=>o.type==='wall').forEach(w=>{
    const mesh=wallMesh(w,roomHeight,wallMat,objects);
    if(mesh)rootGroup.add(mesh);
    addWallTileAreaMeshes(rootGroup,w,roomHeight,objects);
  });

  (objects||[]).filter(o=>o.type!=='wall'&&o.type!=='text').forEach(o=>{
    const mesh=objectMesh(o);
    if(mesh)rootGroup.add(mesh);
  });

  if(options?.showCeiling){
    const pts=buildPolygon(objects);
    if(pts){
      const shape=new THREE.Shape();
      shape.moveTo(pts[0].x,pts[0].y);
      pts.slice(1).forEach(p=>shape.lineTo(p.x,p.y));
      shape.closePath();
      const geo=new THREE.ShapeGeometry(shape);
      geo.rotateX(Math.PI/2);
      const mat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.2,side:THREE.DoubleSide});
      const ceiling=new THREE.Mesh(geo,mat);
      ceiling.position.y=roomHeight;
      rootGroup.add(ceiling);
    }
  }
  centerCamera(rootGroup);
}

window.ProjectBau3D={
  open(container,data){
    ensureScene(container);
    currentData=data;
    resize();
    rebuild();
    requestAnimationFrame(()=>{
      resize();
      if(rootGroup)centerCamera(rootGroup);
    });
  },
  update(data){
    currentData=data;
    rebuild();
  },
  resetCamera(){
    resize();
    if(rootGroup)centerCamera(rootGroup);
  },
  fitView(){
    resize();
    if(rootGroup)centerCamera(rootGroup);
  },
  resize
};
