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

    const globalCuts=floorGridIntersectionsAlongWall(w,currentData?.record?.floorTile,objects);
    const areaStart=offset,areaEnd=offset+width;
    const cuts=globalCuts.filter(d=>d>areaStart+.001&&d<areaEnd-.001).map(d=>d-(areaStart+width/2));
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

    for(let yy=-height/2+tileH;yy<height/2-.001;yy+=tileH){
      const geo=new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width/2,yy,.002),
        new THREE.Vector3(width/2,yy,.002)
      ]);
      plane.add(new THREE.Line(geo,lineMat));
    }

    group.add(plane);
  }
}

function wallMesh(w,height,material){
  const x1=m(w.x1), z1=m(w.y1), x2=m(w.x2), z2=m(w.y2);
  const dx=x2-x1,dz=z2-z1;
  const len=Math.hypot(dx,dz);
  if(len<.001) return null;
  const thickness=m(w.thickness||15);
  const geo=new THREE.BoxGeometry(len,height,thickness);
  const mesh=new THREE.Mesh(geo,material.clone());
  mesh.position.set((x1+x2)/2,height/2,(z1+z2)/2);
  mesh.rotation.y=-Math.atan2(dz,dx);
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

  // basin rim
  addBox(g,w,.07,d,0,.82,0,ceramic);
  // bowl cavity illusion
  addSphere(g,w*.38,.08,d*.32,0,.79,0,mat(0xdfe4e7,.18,0));
  addSphere(g,w*.30,.035,d*.25,0,.77,0,mat(0x9ea7ad,.22,.15));

  // pedestal / vanity support
  addCylinder(g,.11,.14,.70,0,.39,0,ceramic,32);

  // tap
  addCylinder(g,.018,.018,.23,0,.97,-d*.22,chrome,20);
  addCylinder(g,.014,.014,.15,0,.99,-d*.16,chrome,20,Math.PI/2,0,0);

  return finishObject(g,o);
}

function realisticWC(o){
  const g=new THREE.Group();
  const ceramic=CERAMIC(), chrome=CHROME();

  // base
  addBox(g,.34,.18,.48,0,.12,.08,ceramic);
  // bowl
  addSphere(g,.27,.19,.37,0,.30,.02,ceramic);
  // seat ring (dark thin)
  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(.19,.025,12,36),
    mat(0xe7e7e4,.35,0)
  );
  ring.scale.z=1.28;
  ring.rotation.x=Math.PI/2;
  ring.position.set(0,.43,-.02);
  g.add(ring);

  // cistern
  addBox(g,.38,.48,.20,0,.52,-.30,ceramic);
  addCylinder(g,.018,.018,.018,.12,.77,-.405,chrome,16);

  return finishObject(g,o);
}

function realisticShower(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||90),d=m(o.depthCm||90);

  // tray
  addBox(g,w,.045,d,0,.025,0,WHITE());
  addCylinder(g,.035,.035,.012,0,.055,0,CHROME(),24);

  // glass walls
  const glass=glassMat();
  addBox(g,w,1.95,.012,0,.98,-d/2,glass);
  addBox(g,.012,1.95,d,-w/2,.98,0,glass);

  // vertical frames
  const chrome=CHROME();
  addCylinder(g,.012,.012,1.95,-w/2,.98,-d/2,chrome,12);
  addCylinder(g,.012,.012,1.95,w/2,.98,-d/2,chrome,12);

  // shower bar / head
  addCylinder(g,.012,.012,1.45,w*.28,.90,d*.30,chrome,12);
  addSphere(g,.055,.018,.055,w*.28,1.58,d*.30,chrome);

  return finishObject(g,o);
}

function realisticBathtub(o){
  const g=new THREE.Group();
  const w=m(o.widthCm||180),d=m(o.depthCm||80);
  const ceramic=CERAMIC();

  // tub body
  addBox(g,w,.52,d,0,.28,0,ceramic);

  // inner cavity illusion
  addBox(g,w*.82,.16,d*.66,0,.48,0,mat(0xd9e0e4,.2,0));

  // rim
  addBox(g,w,.045,d,0,.56,0,ceramic);

  // chrome drain + faucet
  addCylinder(g,.03,.03,.012,-w*.28,.575,0,CHROME(),24);
  addCylinder(g,.018,.018,.20,w*.34,.66,-d*.34,CHROME(),16);

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
    // door leaf
    addBox(g,w,2.05,.045,0,1.025,0,WOOD());
    // handle
    addCylinder(g,.018,.018,.11,w*.34,1.05,.04,CHROME(),16,Math.PI/2);
    if((o.openingDirection||'right')==='left')g.rotation.y=Math.PI;
    return finishObject(g,o);
  }

  if(type==='window'){
    const g=new THREE.Group();
    const w=m(o.widthCm||100);
    // frame
    addBox(g,w,.055,.06,0,.58,0,CHROME());
    addBox(g,w,.055,.06,0,1.72,0,CHROME());
    addBox(g,.055,1.18,.06,-w/2,.15+1.13,0,CHROME());
    addBox(g,.055,1.18,.06,w/2,.15+1.13,0,CHROME());
    // glass
    addBox(g,w*.92,1.08,.02,0,1.15,0,glassMat());
    if((o.openingDirection||'right')==='left')g.rotation.y=Math.PI;
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
    const mesh=wallMesh(w,roomHeight,wallMat);
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
