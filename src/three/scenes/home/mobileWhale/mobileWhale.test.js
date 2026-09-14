import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createMobileWhaleMaterials } from "./mobileWhaleMaterial.js";
import { SkinnedWhalePoints } from "./SkinnedWhalePoints.js";
import { applyParticleAppearance, particleAppearance, PARTICLE_LEVEL_COUNT } from "./particleAppearance.js";

const bytes=readFileSync(new URL("../../../../../public/models/home/whale-mobile.glb",import.meta.url));
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
const components={SCALAR:1,VEC3:3,VEC4:4};
function floats(index){
 const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView];
 assert.equal(accessor.componentType,5126);
 const start=(view.byteOffset||0)+(accessor.byteOffset||0),values=[];
 for(let i=0;i<accessor.count*components[accessor.type];i++)values.push(binary.readFloatLE(start+i*4));
 return values;
}

test("mobile export contains a compact skinned whale, flow UVs and one complete swim",()=>{
 assert.equal(gltf.asset.extras.whaleParticleFormat,"four-line-roles-surface-v2");
 assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,9);
 assert.equal(gltf.animations.length,1);
 const primitives=gltf.meshes.flatMap(mesh=>mesh.primitives).filter(p=>p.mode!==0);
 assert.equal(primitives.length,1,"only the hidden authoring envelope uses triangles");
 for(const primitive of primitives){
  for(const attribute of ["POSITION","NORMAL","TEXCOORD_0","JOINTS_0","WEIGHTS_0"])
   assert.ok(Number.isInteger(primitive.attributes[attribute]),attribute);
  assert.ok(primitive.extensions.KHR_draco_mesh_compression);
 }
 assert.ok(!gltf.materials.some(material=>material.name==="Fine facial contours"),"no obsolete glow-card mesh remains");
});

test("main and secondary contours come from complete reference-guided paths, not isolated highlights",()=>{
 const source=JSON.parse(readFileSync(new URL("../../../../../tools/assets/mobileWhale/referenceFilamentPaths.json",import.meta.url),"utf8"));
 const main=source.paths.filter(path=>path.category===3);
 assert.ok(main.length>=8,"the main network contains head, jaw, fin and tail contours");
 for(const path of source.paths){
  assert.equal(path.points.length,path.light.length);
  assert.ok(path.points.length>2&&path.points.flat().every(Number.isFinite));
  if(path.category===3)assert.ok(["guide-main","tail-outline","reference-outline"].includes(path.roleSource),"bright photo fragments cannot silently become main lines");
  if(path.category===2)assert.equal(path.roleSource,"guide-secondary");
 }
 const length=path=>path.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path.points[i][0],p[1]-path.points[i][1]),0);
 assert.ok(main.some(path=>length(path)>500),"the nose-to-crest current remains one continuous path");
 assert.ok(main.filter(path=>path.points.some(([x])=>x>1000)).length>=4,"complete guided contours cover both flukes");
 assert.ok(source.guidance.source.endsWith("flowGuidanceLatest.png"),"latest red/yellow roles own the whole composition");
});

test("tail and both fins animate, and the six-second loop closes without a pop",()=>{
 const moving=new Set();
 for(const channel of gltf.animations[0].channels){
  const sampler=gltf.animations[0].samplers[channel.sampler];
  const times=floats(sampler.input),values=floats(sampler.output);
  assert.ok(values.every(Number.isFinite));
  assert.ok(Math.abs(times.at(-1)-times[0]-6)<.001);
  const width=components[gltf.accessors[sampler.output].type];
  for(let i=0;i<width;i++)assert.ok(Math.abs(values[i]-values[values.length-width+i])<.0001,"loop endpoints match");
  if(channel.target.path==="rotation"){
   const first=new THREE.Quaternion().fromArray(values),sample=new THREE.Quaternion();
   for(let i=0;i<values.length;i+=4){
    // A rotated bone basis can distribute one visible turn over several components.
    if(first.angleTo(sample.fromArray(values,i))>.02)moving.add(gltf.nodes[channel.target.node].name);
   }
  }
 }
 for(const name of ["Tail02","Tail03","Peduncle","PectoralNear","PectoralFar","FlukeNear","FlukeFar"])assert.ok(moving.has(name),name);
});

test("visible anatomy is an actual compressed point cloud with valid weights",async()=>{
 assert.ok(bytes.length<1500000,"the complete animated asset stays below 1.5 MB");
 const primitive=gltf.meshes.flatMap(mesh=>mesh.primitives).find(p=>p.mode===0);
 assert.ok(primitive,"GL_POINTS is present; the dots are not surface paint");
 const count=gltf.accessors[primitive.attributes.POSITION].count;
 assert.ok(count>6000&&count<35000,"single spaced reference chains have a bounded population");
 const {default:draco3d}=await import("draco3d");
 const module=await draco3d.createDecoderModule({});
 const decoder=new module.Decoder(),buffer=new module.DecoderBuffer(),cloud=new module.PointCloud();
 const ext=primitive.extensions.KHR_draco_mesh_compression,view=gltf.bufferViews[ext.bufferView];
 const data=binary.subarray(view.byteOffset,view.byteOffset+view.byteLength);
 buffer.Init(new Int8Array(data.buffer,data.byteOffset,data.byteLength),data.byteLength);
 const status=decoder.DecodeBufferToPointCloud(buffer,cloud);
 assert.ok(status.ok(),status.error_msg());assert.equal(cloud.num_points(),count);
 const read=semantic=>{
  const attr=decoder.GetAttributeByUniqueId(cloud,ext.attributes[semantic]);
  const values=new module.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(cloud,attr,values);
  const result=Float32Array.from({length:values.size()},(_,i)=>values.GetValue(i));
  module.destroy(values);return result;
 };
 const indices=read("JOINTS_0"),weights=read("WEIGHTS_0"),positions=read("POSITION"),light=read("_LIGHT"),shell=read("_SHELL");
 let bodyCount=0,wakeCount=0,surfaceCount=0;const roles=new Set(),illumination=new Set();
 const jointNames=gltf.skins[0].joints.map(i=>gltf.nodes[i].name),moving=new Set();
 for(let i=0;i<count;i++){
  assert.ok(shell[i]===0||shell[i]===255,"explicit shell side survives tangent-normal quantization");
  const kind=Math.round(light[i*4+3]*4/255);
  assert.ok([0,1,3].includes(kind),"anatomical curves, full-surface beads and edge emitters");
  if(kind===1)surfaceCount++;
  if(kind===3)wakeCount++;else{
   bodyCount++;roles.add(light[i*4]);illumination.add(light[i*4+1]);
   assert.ok([0,85,170,255].includes(light[i*4]),"one of four whole-line roles, separate from illumination");
  }
  let sum=0;
  for(let j=0;j<4;j++){
   const index=indices[i*4+j],weight=weights[i*4+j];
   assert.ok(Number.isInteger(index)&&index>=0&&index<9,"joint IDs survive compression exactly");
   if(weight>0)moving.add(jointNames[index]);
   sum+=weight;
  }
  assert.equal(sum,255,"normalized byte weights remain exactly one");
 }
 assert.ok(positions.every(Number.isFinite));
 assert.equal(gltf.asset.extras.surfaceMetrics.sharedSurface,true);
 assert.ok(gltf.asset.extras.surfaceMetrics.maxDepthStepPerReferencePixel<.14,"fin/body chart boundaries do not create spatial seams");
 assert.equal(gltf.asset.extras.surfaceMetrics.spacingReferencePx,5.8,"chain spacing is twice the previous 2.9px");
 assert.equal(surfaceCount,gltf.asset.extras.surfaceMetrics.surfaceCount);
 assert.ok(surfaceCount>1000,"a separate population covers the actual body, fins and tail");
 assert.ok(bodyCount>5000);assert.equal(roles.size,4);
 assert.ok(illumination.size>100,"light varies independently of the four line roles");
 assert.ok(wakeCount>1000&&wakeCount<3000,"the rigged edge wake has a bounded population");
 for(const name of ["PectoralNear","PectoralFar","FlukeNear","FlukeFar"])assert.ok(moving.has(name),name);
 assert.equal(gltf.accessors[primitive.attributes.WEIGHTS_0].normalized,true);
 for(const object of [status,cloud,buffer,decoder])module.destroy(object);
});

test("spatial particles preserve gaps and hide the far side without texture paint",()=>{
 const {body,shared}=createMobileWhaleMaterials();
 assert.equal(body.depthWrite,false,"no invisible solid silhouette seals the particle gaps");
 assert.equal(body.blending,THREE.AdditiveBlending);
 assert.equal(shared.uTransmission.value,0);
 for(const uniform of Object.values(shared))assert.ok(!uniform.value?.isTexture);
 body.dispose();
});

test("four whole-line roles update their prepared appearance independently",()=>{
 const {body}=createMobileWhaleMaterials(),u=body.uniforms;
 const colors=u.uFlowColors.value,levels=u.uFlowLevels.value;
 const custom=structuredClone(particleAppearance);
 custom.levels['02']={color:"#ff3366",brightness:2,size:1.4,bloom:0,opacity:.5};
 applyParticleAppearance(body,custom);
 assert.equal(u.uFlowColors.value,colors);assert.equal(u.uFlowLevels.value,levels);
 assert.equal(levels.length,PARTICLE_LEVEL_COUNT);
 assert.equal(colors[2].getHexString(),"ff3366");assert.equal(levels[2].x,2);
 assert.equal(levels[2].y,1.4);assert.equal(levels[2].z,0);assert.equal(levels[2].w,.5);
 assert.equal(levels[0].x,particleAppearance.levels['00'].brightness);
 applyParticleAppearance(body);assert.equal(levels[2].x,particleAppearance.levels['02'].brightness);
 body.dispose();
});

test("global controls preserve all four ratios and leave wake settings independent",()=>{
 const {body}=createMobileWhaleMaterials(),u=body.uniforms;
 const preparedLevels=[...u.uFlowLevels.value],preparedColors=[...u.uFlowColors.value];
 const wakeAppearance=u.uWakeAppearance.value,wakeMotion=u.uWakeMotion.value;
 const custom=structuredClone(particleAppearance);
 custom.global={color:"#ff8800",brightness:2,size:1.5,bloom:.5,opacity:.75};
 applyParticleAppearance(body,custom);
 for(let i=0;i<PARTICLE_LEVEL_COUNT;i++){
  const base=particleAppearance.levels[String(i).padStart(2,"0")],v=u.uFlowLevels.value[i];
  assert.equal(v,preparedLevels[i]);assert.equal(u.uFlowColors.value[i],preparedColors[i]);
  assert.deepEqual(v.toArray(),[base.brightness*2,base.size*1.5,base.bloom*.5,base.opacity*.75]);
  assert.ok(u.uFlowColors.value[i].r>u.uFlowColors.value[i].b,"hue shift makes an orange palette, not black blue particles");
 }
 assert.deepEqual(wakeAppearance.toArray(),[.6,.8,.35,1]);
 const bodyValues=u.uFlowLevels.value.map(v=>v.toArray());
 custom.wake={color:"#ff6633",brightness:1.7,size:1.2,bloom:2,opacity:.6,density:0,speed:0,travel:2,waviness:3,direction:90};
 applyParticleAppearance(body,custom);
 assert.equal(u.uWakeAppearance.value,wakeAppearance);assert.equal(u.uWakeMotion.value,wakeMotion);
 assert.deepEqual(wakeAppearance.toArray(),[1.7,1.2,2,.6]);assert.deepEqual(wakeMotion.toArray(),[0,2,3,0]);
 assert.equal(u.uWakeColor.value.getHexString(),"ff6633");
 assert.ok(u.uWakeDirection.value.distanceTo(new THREE.Vector2(0,1))<1e-8);
 assert.deepEqual(u.uFlowLevels.value.map(v=>v.toArray()),bodyValues);
 body.dispose();
});

test("GPU particle binding and prepared bounds match transformed bone motion",async()=>{
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute([1,0,0,0,1,0],3));
 geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute([0,1,0,0,1,0,0,0],4));
 geometry.setAttribute("skinWeight",new THREE.Uint8BufferAttribute([128,127,0,0,255,0,0,0],4,true));
 const material=createMobileWhaleMaterials().body,root=new THREE.Group();
 const source=new THREE.SkinnedMesh(geometry,material),a=new THREE.Bone(),b=new THREE.Bone();
 a.add(b);source.add(a);root.add(source);source.bind(new THREE.Skeleton([a,b]));
 const points=new SkinnedWhalePoints(geometry,material,source);root.add(points);
 assert.equal(points.isPoints,true);assert.equal(points.isMesh,undefined);
 assert.equal(points.skeleton,source.skeleton);assert.equal(points.children.length,0);
 await points.prepareBounds(async()=>{});
 const version=geometry.attributes.position.version;
 for(const angle of [0,.4,-.6,0]){
  root.position.set(3,-2,5);root.scale.setScalar(150);root.rotation.z=.3;
  b.rotation.y=angle;b.position.set(.4,1,.2);
  root.updateMatrixWorld(true);source.skeleton.update();
  const bounds=new THREE.Box3();points.expandSwimBounds(bounds);
  for(let i=0;i<2;i++){
   const expected=source.getVertexPosition(i,new THREE.Vector3());
   const actual=points.getVertexPosition(i,new THREE.Vector3());
   assert.ok(expected.distanceTo(actual)<1e-6,"same skin deformation and inverse bind");
   assert.ok(bounds.clone().expandByScalar(1e-6).containsPoint(actual.applyMatrix4(points.matrixWorld)),"every moved point remains inside the prepared influence envelope");
  }
 }
 assert.equal(geometry.attributes.position.version,version,"motion never rewrites the point buffer");
 root.clear();geometry.dispose();material.dispose();source.skeleton.dispose();
});
