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
  const tex=textureLoader.load(dataUrl);
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
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : fallback,
    map,
    roughness:.68,
    metalness:.02
  });
}

function findTile(project,id){
  return (project?.tileMaterials||[]).find(t=>t.id===id) || null;
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

function objectMesh(o){
  const type=o.type;
  if(type==='door'){
    const mesh=simpleBox(o,2.05,0x9b6b43);
    mesh.scale.z=.35;
    return mesh;
  }
  if(type==='window'){
    const mesh=simpleBox(o,1.2,0x99c9e8);
    mesh.position.y=1.2;
    mesh.scale.z=.28;
    return mesh;
  }
  if(type==='wc'){
    const group=new THREE.Group();
    const bowl=new THREE.Mesh(
      new THREE.CapsuleGeometry(.22,.28,8,16),
      new THREE.MeshStandardMaterial({color:0xf7f7f7,roughness:.3})
    );
    bowl.rotation.x=Math.PI/2;
    bowl.scale.set(1,.65,1);
    bowl.position.y=.22;
    group.add(bowl);
    group.position.set(m(o.x),0,m(o.y));
    group.rotation.y=-(o.rotation||0)*Math.PI/180;
    group.scale.setScalar(o.scale||1);
    return group;
  }
  if(type==='shower'){
    const group=new THREE.Group();
    const base=new THREE.Mesh(
      new THREE.BoxGeometry(m(o.widthCm||90),.04,m(o.depthCm||90)),
      new THREE.MeshStandardMaterial({color:0xf3f5f7})
    );
    base.position.y=.02;group.add(base);
    const glassMat=new THREE.MeshStandardMaterial({color:0xbfe5f5,transparent:true,opacity:.28,roughness:.1});
    const w=m(o.widthCm||90),d=m(o.depthCm||90);
    const g1=new THREE.Mesh(new THREE.BoxGeometry(w,1.9,.012),glassMat);
    g1.position.set(0,.95,-d/2); group.add(g1);
    const g2=new THREE.Mesh(new THREE.BoxGeometry(.012,1.9,d),glassMat);
    g2.position.set(-w/2,.95,0); group.add(g2);
    group.position.set(m(o.x),0,m(o.y));
    group.rotation.y=-(o.rotation||0)*Math.PI/180;
    group.scale.setScalar(o.scale||1);
    return group;
  }
  if(type==='bathtub'){
    return simpleBox(o,.55,0xf4f5f6);
  }
  if(type==='sink'||type==='kitchenSink'){
    return simpleBox(o,.82,0xf0f2f4);
  }
  if(type==='stove') return simpleBox(o,.9,0x4c5563);
  if(type==='fridge') return simpleBox(o,1.85,0xe5e7eb);
  if(type==='washingMachine') return simpleBox(o,.85,0xf7f7f7);
  if(type==='table') return simpleBox(o,.75,0xa77b55);
  if(type==='chair') return simpleBox(o,.85,0x8b6d54);
  if(type==='sofa') return simpleBox(o,.78,0x72829a);
  if(type==='bed') return simpleBox(o,.48,0xd7c9b8);
  if(type==='cabinet') return simpleBox(o,2.1,0xa68a6a);
  if(type==='plant') return simpleBox(o,.7,0x558b5c);
  if(type==='drain') return simpleBox(o,.02,0x59616b);
  return null;
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

  const floorTile=findTile(project,options?.floorMaterialId);
  const wallTile=findTile(project,options?.wallMaterialId);

  const floorMat=materialForTile(
    floorTile,5,5,0xd8d8d3,
    {
      originX:options?.tileOriginX||0,
      originY:options?.tileOriginY||0,
      rotation:options?.tileRotation||0
    }
  );
  const wallMat=materialForTile(wallTile,4,2,0xf1f3f5);

  const floor=floorMesh(objects,floorMat);
  if(floor) rootGroup.add(floor);

  (objects||[]).filter(o=>o.type==='wall').forEach(w=>{
    const mesh=wallMesh(w,roomHeight,wallMat);
    if(mesh)rootGroup.add(mesh);
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
