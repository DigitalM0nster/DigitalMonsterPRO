import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import draco3d from "draco3d";
import { applyMobileWhaleVisuals, createMobileWhaleMaterials, createMobileWhaleTrail, createWhaleDepthOccluder } from "./mobileWhaleMaterial.js";
import { prepareWhaleReactionActions, sampleWhaleReactions } from "./whaleSkeletalReactions.js";
import { setWhaleViewRotation } from "./whaleComposition.js";

const bytes=readFileSync(new URL("../../../../../public/models/home/whale-mobile.glb",import.meta.url));
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function floats(index){
 const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView];
 assert.equal(accessor.componentType,5126);
 const start=(view.byteOffset||0)+(accessor.byteOffset||0),values=[];
 for(let i=0;i<accessor.count*components[accessor.type];i++)values.push(binary.readFloatLE(start+i*4));
 return values;
}

test("mobile export contains one shared skin, real compressed points and a complete swim",()=>{
 assert.ok(bytes.length<800000,"skin, 3D currents and animation fit the 800 KB budget");
 assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,13);
 assert.deepEqual(gltf.animations.map(a=>a.name),["MobileWhale_CalmSwim","Whale_LookLeft","Whale_LookRight","Whale_LookUp","Whale_LookDown","Whale_LookCurious"]);
 const primitives=gltf.meshes.flatMap(mesh=>mesh.primitives);
 assert.equal(primitives.length,2,"one occlusion surface and one visible point primitive");
 const points=primitives.find(primitive=>primitive.mode===0);
 assert.ok(points,"actual GL_POINTS, not beads painted onto triangles");
 for(const attribute of ["POSITION","NORMAL","JOINTS_0","WEIGHTS_0","_LIGHT","_FLOW"])
  assert.ok(Number.isInteger(points.attributes[attribute]),attribute);
 for(const primitive of primitives)assert.ok(primitive.extensions.KHR_draco_mesh_compression);
 assert.ok(!gltf.materials.some(material=>/facial|eye|contour/i.test(material.name)),"no eye overlay primitive");
});

async function decodedPoints(){
 const module=await draco3d.createDecoderModule({});
 const primitive=gltf.meshes.flatMap(mesh=>mesh.primitives).find(p=>p.mode===0);
 const extension=primitive.extensions.KHR_draco_mesh_compression,view=gltf.bufferViews[extension.bufferView];
 const buffer=new module.DecoderBuffer(),decoder=new module.Decoder(),points=new module.PointCloud();
 const data=binary.subarray(view.byteOffset,view.byteOffset+view.byteLength);buffer.Init(data,data.length);
 const status=decoder.DecodeBufferToPointCloud(buffer,points);assert.ok(status.ok(),status.error_msg());
 const result={};
 for(const [name,id] of Object.entries(extension.attributes)){
  const attribute=decoder.GetAttributeByUniqueId(points,id),values=new module.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(points,attribute,values);
  result[name]=Float32Array.from({length:values.size()},(_,i)=>values.GetValue(i));module.destroy(values);
 }
 for(const object of [status,points,decoder,buffer])module.destroy(object);
 return result;
}
const decoded=decodedPoints();

test("fitted whale keeps its head nearer than its tail across viewport sizes and scene tilt",()=>{
 for(const aspect of [390/844,1280/720,1920/1080]){
  const camera=new THREE.PerspectiveCamera(50,aspect,.1,2000);
  camera.position.set(-11.5,1.5,26.5);camera.lookAt(10,-1.5,-38);camera.updateMatrixWorld();
  const parent=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.31,-.02,0));
  const rotation=setWhaleViewRotation(new THREE.Quaternion(),parent,camera.quaternion);
  const model=new THREE.Matrix4().compose(new THREE.Vector3(6.4,-4.3,-6.8),rotation,new THREE.Vector3(5,5,5));
  const view=new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,parent).multiply(model);
  const head=new THREE.Vector3(-3.7,0,0).applyMatrix4(view);
  const tail=new THREE.Vector3(3.4,0,0).applyMatrix4(view);
  assert.ok(head.z-tail.z>15,"tail lies deep behind the head, not parallel to the screen");
  assert.ok(tail.x>head.x,"tail recedes toward the right side of the composition");
 }
});

test("decoded points have finite surface normals and normalized weights for the shared rig",async()=>{
 const attributes=await decoded,positions=attributes.POSITION;
 assert.ok(positions.length/3>15000&&positions.length/3<26000);
 for(const [name,values] of Object.entries(attributes))assert.ok(values.every(Number.isFinite),name);
 for(let i=0;i<positions.length/3;i++){
  const sum=attributes.WEIGHTS_0.slice(i*4,i*4+4).reduce((a,b)=>a+b,0);
  assert.equal(sum,255);
  assert.ok(attributes.JOINTS_0.slice(i*4,i*4+4).every(j=>j>=0&&j<13&&Number.isInteger(j)));
  const normal=new THREE.Vector3().fromArray(attributes.NORMAL,i*3);
  assert.ok(normal.length()>.98&&normal.length()<1.02,"unit surface normal");
 }
});

test("eye currents are single full-body paths with well-spaced beads, not local eye outlines",async()=>{
 const data=await decoded;
 for(const name of ["eye-upper-body-current/-1","eye-lower-body-current/-1"]){
  const path=gltf.extras.particlePaths.find(p=>p.name===name);assert.ok(path);
  const beads=[];
  for(let i=0;i<data._FLOW.length;i+=2)if(Math.round(data._FLOW[i])===path.id)
   beads.push({t:data._FLOW[i+1],p:new THREE.Vector3().fromArray(data.POSITION,i/2*3)});
  beads.sort((a,b)=>a.t-b.t);
  assert.ok(beads.length>150);
  assert.ok(beads[0].p.x< -4.1&&beads.at(-1).p.x>2.5,"current continues both before and after the eye");
  const steps=beads.slice(1).map((b,i)=>b.p.distanceTo(beads[i].p)).sort((a,b)=>a-b);
  assert.ok(steps[Math.floor(steps.length/2)]>.035,"bead spacing is real geometry");
  const eye=beads.filter(b=>b.p.x> -2.85&&b.p.x< -1.20);
  assert.ok(eye.length>30);
  for(let i=1;i<eye.length;i++)assert.ok(eye[i].p.distanceTo(eye[i-1].p)<.11,"no missing stretch through the eye");
 }
});

test("Blender reactions deform several bones, preserve swim at neutral and reverse cleanly",()=>{
 const root=new THREE.Group();
 const objects=gltf.nodes.map(node=>{
  const object=new THREE.Object3D();object.name=node.name;
  if(node.translation)object.position.fromArray(node.translation);
  if(node.rotation)object.quaternion.fromArray(node.rotation);
  if(node.scale)object.scale.fromArray(node.scale);
  return object;
 });
 gltf.nodes.forEach((node,i)=>node.children?.forEach(child=>objects[i].add(objects[child])));
 for(const node of objects)if(!node.parent)root.add(node);
 const clips=gltf.animations.map(animation=>new THREE.AnimationClip(animation.name,-1,
  animation.channels.map(channel=>{
   const sampler=animation.samplers[channel.sampler],path=channel.target.path;
   const Track=path==="rotation"?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
   const property={rotation:"quaternion",translation:"position",scale:"scale"}[path];
   return new Track(`${gltf.nodes[channel.target.node].name}.${property}`,floats(sampler.input),floats(sampler.output));
  })));
 const mixer=new THREE.AnimationMixer(root),swim=mixer.clipAction(clips[0]).play();
 mixer.setTime(1.7);
 const body=root.getObjectByName("Body"),tail=root.getObjectByName("Tail02"),fin=root.getObjectByName("PectoralNear");
 const baseline=[body,tail,fin].map(b=>b.quaternion.clone());
 const rig=root.getObjectByName("MobileWhaleRig"),rootPose=rig.quaternion.clone(),rootPosition=rig.position.clone();
 const actions=prepareWhaleReactionActions(mixer,clips);
 sampleWhaleReactions(actions,0,0);mixer.update(0);
 for(const [i,bone] of [body,tail,fin].entries())assert.ok(bone.quaternion.angleTo(baseline[i])<1e-6,"neutral keeps the original swim");
 const poses=[];
 for(const [x,y] of [[-1,0],[1,0],[0,1],[0,-1]]){
  sampleWhaleReactions(actions,x,y);mixer.update(0);
  assert.ok(body.quaternion.angleTo(baseline[0])>.12,"authored nine-degree body reach");
  assert.ok(tail.quaternion.angleTo(baseline[1])>.06,"tail counterbend is independent");
  assert.ok(fin.quaternion.angleTo(baseline[2])>.04,"fin supports the gesture");
  poses.push(body.quaternion.clone());
  assert.ok(rig.quaternion.angleTo(rootPose)<1e-6,"no object turn");
  assert.ok(rig.position.distanceTo(rootPosition)<1e-6,"no object displacement");
 }
 for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)
  assert.ok(poses[i].angleTo(poses[j])>.15,"four distinct directional actions, not copies of swim");
 // Regression: an eased clip scrub decelerated to zero at neutral, then
 // accelerated again. The same small pointer step must keep moving every bone.
 for(const axis of ["x","y"]){
  const increments=[[],[],[]];let previous;
  for(let step=-12;step<=12;step++){
   const position=step/100;
   sampleWhaleReactions(actions,axis==="x"?position:0,axis==="y"?position:0);mixer.update(0);
   const current=[body,tail,fin].map(b=>b.quaternion.clone());
   if(previous)current.forEach((q,i)=>increments[i].push(q.angleTo(previous[i])));
   previous=current;
  }
  for(const speeds of increments)
   assert.ok(Math.min(...speeds)>.75*Math.max(...speeds),`${axis}: no braking or dead zone through neutral`);
 }
 sampleWhaleReactions(actions,1,0);mixer.update(0);
 assert.equal(actions[0].getEffectiveWeight(),1,"screen right uses the camera-corrected authored yaw");
 assert.equal(actions[1].getEffectiveWeight(),0);
 sampleWhaleReactions(actions,-1,0);mixer.update(0);
 assert.equal(actions[1].getEffectiveWeight(),1,"screen left uses the opposite yaw");
 sampleWhaleReactions(actions,1,1);mixer.update(0);
 const diagonal=body.quaternion.clone();
 for(let i=0;i<60;i++)mixer.update(1/60);
 assert.ok(swim.time>2.6,"base swimming continues while a reach is held");
 assert.ok(diagonal.toArray().every(Number.isFinite));
 mixer.setTime(1.7);sampleWhaleReactions(actions,0,0);mixer.update(0);
 for(const [i,bone] of [body,tail,fin].entries())assert.ok(bone.quaternion.angleTo(baseline[i])<1e-6,"release restores swim without drift");
 sampleWhaleReactions(actions,0,0,1,1);mixer.update(0);
 assert.ok(body.quaternion.angleTo(baseline[0])>.08,"curiosity lifts the front body");
 sampleWhaleReactions(actions,0,0,2,1);mixer.update(0);
 assert.ok(body.quaternion.angleTo(baseline[0])<1e-6,"curiosity ends at swimming pose");
 assert.equal(actions.length,5);
 mixer.stopAllAction();mixer.uncacheRoot(root);
});

test("tail lobes occupy a horizontal 3D fan and their tips flex beyond the stalk motion",async()=>{
 const data=await decoded,box=new THREE.Box3();
 const ids=new Set(gltf.extras.particlePaths.filter(path=>path.name.startsWith("Fluke")).map(path=>path.id));
 for(let i=0;i<data._FLOW.length;i+=2)if(ids.has(Math.round(data._FLOW[i])))
  box.expandByPoint(new THREE.Vector3().fromArray(data.POSITION,i/2*3));
 const size=box.getSize(new THREE.Vector3());
 assert.ok(size.z>3,"both lobes span across the creature in depth");
 assert.ok(size.y<.25,"resting fan is horizontal, not a vertical tail silhouette");
 for(const name of ["FlukeNearTip","FlukeFarTip"]){
  const channel=gltf.animations[0].channels.find(c=>gltf.nodes[c.target.node].name===name&&c.target.path==="rotation");
  const values=floats(gltf.animations[0].samplers[channel.sampler].output);
  const first=new THREE.Quaternion().fromArray(values),sample=new THREE.Quaternion();let range=0;
  for(let i=0;i<values.length;i+=4)range=Math.max(range,first.angleTo(sample.fromArray(values,i)));
  assert.ok(range>.5,"tip flex is visible independently of the gentle tail stalk");
 }
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
 for(const name of ["Tail02","Tail03","Peduncle","PectoralNear","PectoralFar","FlukeNear","FlukeFar","PectoralNearTip","PectoralFarTip","FlukeNearTip","FlukeFarTip"])assert.ok(moving.has(name),name);
});

test("body drift is subtle and wake anchors have normalized, valid rig influences",()=>{
 const rig=gltf.nodes.find(node=>node.name==="MobileWhaleRig"),emitters=JSON.parse(rig.extras.wakeEmitters);
 assert.equal(emitters.length,40);
 const names=gltf.skins[0].joints.map(index=>gltf.nodes[index].name);
 for(const emitter of emitters){
  assert.ok(emitter.position.every(Number.isFinite));
  const skin=Object.entries(emitter.weights);
  assert.ok(skin.length<=4);
  assert.ok(Math.abs(skin.reduce((sum,[,weight])=>sum+weight,0)-1)<1e-6);
  for(const [name] of skin)assert.ok(names.includes(name),name);
 }
 const channel=gltf.animations[0].channels.find(c=>gltf.nodes[c.target.node]===rig&&c.target.path==="translation");
 assert.ok(channel,"body suspension is part of the prepared animation");
 const positions=floats(gltf.animations[0].samplers[channel.sampler].output);
 assert.ok(Math.max(...positions.map(Math.abs))<.03,"less than three reference pixels of drift");
 assert.ok(Math.max(...positions)-Math.min(...positions)>.04,"drift is present");
});

test("surface points and irregular wake share one shader clock and rig without buffer uploads",()=>{
 const {body,shared}=createMobileWhaleMaterials();
 const source=new THREE.SkinnedMesh(new THREE.BufferGeometry(),body);
 const bones=gltf.skins[0].joints.map(index=>{const bone=new THREE.Bone();bone.name=gltf.nodes[index].name;source.add(bone);return bone;});
 source.bind(new THREE.Skeleton(bones));
 const emitters=JSON.parse(gltf.nodes.find(node=>node.name==="MobileWhaleRig").extras.wakeEmitters);
 const trail=createMobileWhaleTrail(shared,source,emitters);

 assert.equal(trail.material.uniforms.uTime,body.uniforms.uTime);
 assert.equal(trail.geometry.attributes.position.count,1920,"40 surface anchors with 48 prepared particles");
 assert.equal(trail.skeleton,source.skeleton,"emission follows the same swimming fins and tail");
 const version=trail.geometry.attributes.position.version;
 const index=trail.geometry.attributes.position.count-1,rest=new THREE.Vector3().fromBufferAttribute(trail.geometry.attributes.position,index);
 const before=THREE.SkinnedMesh.prototype.applyBoneTransform.call(trail,index,rest.clone());
 bones.find(bone=>bone.name==="FlukeNearTip").position.y=.3;
 source.updateMatrixWorld(true);source.skeleton.update();
 const after=THREE.SkinnedMesh.prototype.applyBoneTransform.call(trail,index,rest.clone());
 assert.ok(after.distanceTo(before)>.1,"tip emission moves with the flexing tail");
 assert.equal(trail.geometry.attributes.position.version,version,"swimming does not upload the point buffer again");
 const seeds=trail.geometry.attributes.aSeed;
 assert.equal(seeds.itemSize,4);
 assert.ok(new Set(Array.from(seeds.array).filter((_,i)=>i%4===1)).size>900,"independent wake speeds, no identical strings");
 assert.ok(!/vFlow|uv1|sampler2D/.test(body.vertexShader+body.fragmentShader));
 for(const uniform of Object.values(shared))assert.ok(!uniform.value?.isTexture);
 assert.equal(body.side,THREE.FrontSide);
 assert.equal(body.depthWrite,false,"transparent glow corners must not occlude later contours");
 assert.equal(body.depthTest,true,"the body still occludes the distant contours");
 body.dispose();trail.geometry.dispose();trail.material.dispose();source.geometry.dispose();source.skeleton.dispose();
});

test("transparent skin reveals rear fins, opaque skin occludes them on the same prepared rig",()=>{
 const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial();
 const mesh=new THREE.SkinnedMesh(geometry,material),bone=new THREE.Bone();
 mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
 mesh.position.set(2,3,4);mesh.scale.setScalar(1.5);mesh.rotation.z=.2;
 const depth=createWhaleDepthOccluder(mesh);
 assert.equal(depth.geometry,mesh.geometry);
 assert.equal(depth.skeleton,mesh.skeleton);
 assert.deepEqual(depth.bindMatrix.elements,mesh.bindMatrix.elements);
 assert.deepEqual(depth.position,mesh.position);
 assert.deepEqual(depth.quaternion.toArray(),mesh.quaternion.toArray());
 assert.deepEqual(depth.scale,mesh.scale);
 assert.equal(depth.children.length,0,"the existing bones are shared, never cloned");
 assert.equal(depth.material.colorWrite,true);
 assert.equal(depth.material.transparent,true);
 assert.equal(depth.material.uniforms.uModelOpacity.value,0);
 assert.equal(depth.material.depthWrite,false,"invisible surface cannot hide rear beads");
 const version=depth.material.version;
 for(const [opacity,reveal,writesDepth] of [[0,1,false],[.5,1,false],[1,1,true],[1,.5,false],[0,1,false]]){
  depth.material.uniforms.uModelOpacity.value=opacity;
  depth.material.uniforms.uEntranceReveal.value=reveal;
  depth.onBeforeRender();
  assert.equal(depth.material.depthWrite,writesDepth,`model ${opacity}, entrance ${reveal}`);
 }
 assert.equal(depth.material.version,version,"live transparency does not recompile the shader");
 assert.equal(depth.frustumCulled,false);
 depth.material.dispose();mesh.skeleton.dispose();geometry.dispose();material.dispose();
});

test("live point size and skin opacity update prepared materials independently on every tier",()=>{
 const {body,shared}=createMobileWhaleMaterials();
 const source=new THREE.SkinnedMesh(new THREE.BufferGeometry(),body);
 const skin=createWhaleDepthOccluder(source,shared);
 const bodyVersion=body.version,skinVersion=skin.material.version;
 const config={pointScale:8.05,particleScale:.65,particleDensity:1,opacity:1,
  modelOpacity:0,emissiveIntensity:8.8,colorTint:"#0f93cc",glowPulse:{max:6.3,speed:.2}};
 for(const tier of ["high","medium","low"]){
  applyMobileWhaleVisuals(body,config,tier);
  assert.equal(shared.uPointScale.value,8.05);assert.equal(shared.uParticleScale.value,.65);
  assert.equal(shared.uOpacity.value,1);assert.equal(skin.material.uniforms.uModelOpacity.value,0);
  applyMobileWhaleVisuals(body,{...config,pointScale:2,modelOpacity:.7},tier);
  assert.equal(shared.uPointScale.value,2);
  assert.equal(skin.material.uniforms.uModelOpacity.value,.7);
  assert.equal(shared.uOpacity.value,1,"surface alpha cannot change particle alpha");
  applyMobileWhaleVisuals(body,{...config,opacity:.15,modelOpacity:.7},tier);
  assert.equal(skin.material.uniforms.uModelOpacity.value,.7,"particle alpha cannot change surface alpha");
  applyMobileWhaleVisuals(body,{...config,emissiveIntensity:1,glowPulse:{max:1,speed:0}},tier);
  const dim=shared.uGlow.value;
  applyMobileWhaleVisuals(body,{...config,emissiveIntensity:10,glowPulse:{max:10,speed:0}},tier);
  assert.ok(Math.abs(shared.uGlow.value-dim*10)<1e-8,"live glow is not overwritten by fixed tier brightness");
  applyMobileWhaleVisuals(body,{...config,emissiveIntensity:1,glowPulse:{max:9,speed:1,smooth:0}},tier,.25);
  assert.ok(Math.abs(shared.uGlow.value-dim*9)<1e-8,"pulse peak reaches the shader");
 }
 assert.equal(body.version,bodyVersion);assert.equal(skin.material.version,skinVersion);
 skin.onBeforeRender();
 assert.equal(skin.material.depthWrite,false,"transparent surface reveals far-side particles");
 assert.equal(skin.geometry,source.geometry);assert.equal(skin.skeleton,source.skeleton);
 body.dispose();skin.material.dispose();source.geometry.dispose();
});
