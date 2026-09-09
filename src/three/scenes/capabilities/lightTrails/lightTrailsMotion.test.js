import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InfiniteLightTrailsWorld } from './InfiniteLightTrailsWorld.js';
import { ReferenceTrailMotion, REFERENCE_BONE_LENGTH } from './ReferenceTrailMotion.js';
import { createReferenceNoise } from './referenceTrailNoise.js';
import { ENVIRONMENT_FLIGHT_SPEED, TUNNEL_LENGTH, PASSAGE_RADIUS, WALL_ROWS, WALL_LANES, FRAME_SPACING } from './createLightTrailsEnvironment.js';
import { createLightTrailsParticles } from './createLightTrailsParticles.js';

function fixture() {
 const scene = new THREE.Scene();
 const input = new EventTarget();
 input.ownerDocument = { defaultView: new EventTarget() };
 const world = new InfiniteLightTrailsWorld(scene, input);
 world.setRenderEnabled(true);
 return {scene,input,world};
}
function advance(world, seconds, pointer, fps=60, extra={}) {
 for(let frame=0;frame<Math.round(seconds*fps);frame++) world.update(1/fps,{pointer,...extra},1);
}

test('reference chain keeps all 41 bone lengths and its free base through cursor reversals',()=>{
 const {world,scene}=fixture();
 const bases=world.trailMotion.lines.map(line=>line.points[0].clone());
 for(let frame=0;frame<480;frame++) {
  world.update(1/60,{pointer:{x:Math.sin(frame*.1)*.95,y:Math.cos(frame*.07)*.95}},1);
  for(const line of world.trailMotion.lines) {
   assert.ok(line.points.at(-1).distanceTo(line.target)<1e-9);
   for(let i=1;i<line.points.length;i++) assert.ok(Math.abs(line.points[i].distanceTo(line.points[i-1])-REFERENCE_BONE_LENGTH)<1e-8);
  }
 }
 assert.ok(world.trailMotion.lines.every((line,i)=>line.points[0].distanceTo(bases[i])>1));
 assert.ok(world.trailChainData.every(Number.isFinite));
 world.dispose(scene);
});

test('fixed 60 Hz reference solver matches at 30, 60 and 120 render fps',()=>{
 const results=[];
 for(const fps of [30,60,120]) {
  const {world,scene}=fixture();
  advance(world,2,{x:.6,y:-.3},fps);
  advance(world,2,{x:-.5,y:.4},fps);
  advance(world,2,{x:.2,y:-.1},fps);
  results.push([...world.trailChainData]);world.dispose(scene);
 }
 assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});

test('rendered trails advance every frame at high and uneven refresh rates',()=>{
 for(const deltas of [[1/120],[1/144],[1/165],[1/90,1/165,1/120,1/144]]) {
  const data=new Float32Array(42*7*4),motion=new ReferenceTrailMotion(data,()=>.5);
  const previousStorage=motion.previousData,currentStorage=motion.currentData;
  motion.update(1/60,{x:0,y:0},true);
  const last=data.slice();
  for(let frame=0;frame<330;frame++) {
   motion.update(deltas[frame%deltas.length],{x:Math.sin(frame*.01)*.8,y:.3},true);
   assert.ok(data.some((value,index)=>value!==last[index]),'no stale geometry between solver steps');
   last.set(data);
  }
  assert.equal(motion.previousData,previousStorage);
  assert.equal(motion.currentData,currentStorage);
  assert.ok(data.every(Number.isFinite));
 }
});

test('render interpolation leaves the physical solver unchanged',()=>{
 const data=new Float32Array(42*7*4),motion=new ReferenceTrailMotion(data,()=>.5);
 motion.update(1/60,{x:.7,y:.2},true);
 const head=motion.lines[0].points.at(-1).clone();
 const before=motion.previousData.slice(),after=motion.currentData.slice();
 motion.update(1/120,{x:.7,y:.2},true);
 assert.ok(motion.lines[0].points.at(-1).equals(head));
 for(let index=0;index<data.length;index++) {
  assert.equal(data[index],Math.fround((before[index]+after[index])*.5));
 }
});

test('reference flight pulls the old bend past the viewer after an edge sweep',()=>{
 const {world,scene}=fixture();
 advance(world,2,{x:-.95,y:.8});
 advance(world,.3,{x:.85,y:-.7});
 advance(world,5,{x:.85,y:-.7});
 for(const line of world.trailMotion.lines) {
  const tail=line.points[0],head=line.points.at(-1);
  assert.ok(tail.z>0,'old points must continue past the viewer');
  assert.ok(head.z < -100,'heads remain ahead in the reference depth range');
  assert.ok(tail.z-head.z>320,'idle chain stretches along the flight axis');
  assert.ok(Math.hypot(tail.x-head.x,tail.y-head.y)<20,'previous sideways bend washes out');
 }
 world.dispose(scene);
});

test('reference framing and seeded noise match the measured original',()=>{
 const noise=createReferenceNoise();
 assert.ok(Math.abs(noise.noise(.4,.4)-(-.42374247729151426))<1e-12);
 assert.ok(Math.abs(noise.noise(1337.2,7331.2)-.13575927301017562)<1e-12);
 const {world,scene}=fixture();
 const camera=new THREE.PerspectiveCamera(52,1.6,.01,200);
 world.applyCamera(camera,1);
 assert.equal(camera.fov,80);
 const head=new THREE.Vector3(-45*.095+.72,-25*.095+.25,-156*.095+6.2).project(camera);
 assert.ok(Math.abs(head.x-(-45/(156*Math.tan(40*Math.PI/180)*1.6)))<1e-10);
 assert.ok(head.x<0 && head.y<0,'bundle travels from lower-left towards a head below/left of center');
 assert.equal(world.trails.core.geometry.getAttribute('position').count,7*40*2);
 world.dispose(scene);
});

test('idle/leave retain the camera and reference cursor offset while organic motion continues',()=>{
 const {world,scene,input}=fixture();
 advance(world,5,{x:.65,y:-.4});
 const targetBefore=world.trailMotion.lines[0].target.clone();
 assert.ok(world.cameraPointer.distanceTo(new THREE.Vector2(.65,-.4))<.001);
 advance(world,1,{x:.65,y:-.4});
 assert.ok(world.trailMotion.lines[0].target.distanceTo(targetBefore)>.01);
 for(const exit of ['pointerleave','pointercancel','blur']) {
  const cameraTarget=world.cameraPointerTarget.clone();
  (exit==='blur'?input.ownerDocument.defaultView:input).dispatchEvent(new Event(exit));
  advance(world,2,{x:0,y:0});
  assert.ok(world.cameraPointer.distanceTo(cameraTarget)<.001);
  assert.ok(world.trailMotion.pointer.distanceTo(cameraTarget)<.001);
  input.dispatchEvent(new Event('pointermove'));
  const cameraBefore=new THREE.PerspectiveCamera();world.applyCamera(cameraBefore,1);
  world.update(1/60,{pointer:{x:.64,y:-.39}},1);
  const cameraAfter=new THREE.PerspectiveCamera();world.applyCamera(cameraAfter,1);
  assert.ok(cameraBefore.quaternion.angleTo(cameraAfter.quaternion)<.002);
  advance(world,2,{x:.65,y:-.4});
 }
 world.dispose(scene);
});

test('touch release retains camera; passive viewport motion does not enable blocked clicks',()=>{
 const {world,scene,input}=fixture();
 advance(world,3,{x:.6,y:.2});
 const up=new Event('pointerup');up.pointerType='touch';input.dispatchEvent(up);
 advance(world,2,{x:0,y:0});
 assert.ok(world.trailMotion.pointer.length()<.001);
 assert.ok(world.cameraPointer.distanceTo(new THREE.Vector2(.6,.2))<.001);
 input.dispatchEvent(new Event('pointermove'));
 advance(world,1,{x:0,y:0},60,{visualPointer:{x:1,y:1},pointerBlocked:true,interactionEnabled:false,pointerDown:true});
 assert.equal(world.trailMotion.spinElapsed,-1);
 assert.ok(world.cameraPointerTarget.equals(new THREE.Vector2(1,1)));
 assert.ok(world.trailMotion.pointer.equals(new THREE.Vector2(1,1)));
 world.dispose(scene);
});

test('crossing onto the left menu keeps passive motion, including viewport re-entry',()=>{
 const {world,scene,input}=fixture();
 advance(world,2,{x:.2,y:.1});
 const leave=new Event('pointerleave');leave.relatedTarget=new EventTarget();
 input.dispatchEvent(leave);
 world.setInteractionEnabled(false);
 advance(world,1,{x:0,y:0},60,{visualPointer:{x:-.95,y:.5},pointerBlocked:true,interactionEnabled:false,pointerDown:true});
 assert.ok(world.cameraPointerTarget.equals(new THREE.Vector2(-.95,.5)));
 assert.ok(world.trailMotion.pointer.equals(new THREE.Vector2(-.95,.5)));
 assert.equal(world.trailMotion.spinElapsed,-1);
 input.ownerDocument.defaultView.dispatchEvent(new Event('blur'));
 advance(world,.5,{x:0,y:0},60,{visualPointer:{x:0,y:0}});
 assert.ok(world.cameraPointerTarget.equals(new THREE.Vector2(-.95,.5)));
 input.ownerDocument.defaultView.dispatchEvent(new Event('pointermove'));
 advance(world,.5,{x:0,y:0},60,{visualPointer:{x:-.9,y:-.4},pointerBlocked:true,interactionEnabled:false});
 assert.ok(world.cameraPointerTarget.equals(new THREE.Vector2(-.9,-.4)));
 assert.ok(world.trailMotion.pointer.equals(new THREE.Vector2(-.9,-.4)));
 world.dispose(scene);
 world._pointerOutside=true;
 input.ownerDocument.defaultView.dispatchEvent(new Event('pointermove'));
 assert.equal(world._pointerOutside,true,'viewport listener is removed on dispose');
});

test('reference click is staggered across strands and completes a closed orbit',()=>{
 const dataA=new Float32Array(42*7*4),dataB=new Float32Array(42*7*4);
 const motion=new ReferenceTrailMotion(dataA,()=>.5),idle=new ReferenceTrailMotion(dataB,()=>.5);
 assert.equal(motion.startSpin(),true);
 for(let frame=0;frame<3;frame++){motion.update(1/60,{x:0,y:0},true);idle.update(1/60,{x:0,y:0},true);}
 assert.ok(motion.lines[0].target.distanceTo(idle.lines[0].target)>.001);
 assert.ok(motion.lines[6].target.distanceTo(idle.lines[6].target)<1e-9);
 for(let frame=0;frame<180;frame++){motion.update(1/60,{x:0,y:0},true);idle.update(1/60,{x:0,y:0},true);}
 assert.equal(motion.spinElapsed,-1);
 assert.ok(motion.lines.every((line,i)=>line.target.distanceTo(idle.lines[i].target)<1e-9));
});

test('warm/dormant cycles reuse resources, stop simulation, and remove input listeners on disposal',()=>{
 const {world,scene,input}=fixture();
 const geometry=world.environment.geometry,material=world.environment.material,texture=world.trailChainTexture;
 const points=world.trailMotion.lines[0].points;
 world.beginWarmupDraw();advance(world,.1,{x:.5,y:.5});world.endWarmupDraw();
 advance(world,.2,{x:-.5,y:-.5});world.setRenderEnabled(false);
 const time=world.trailMotion.elapsed;advance(world,.2,{x:.5,y:.5});assert.equal(world.trailMotion.elapsed,time);
 world.setRenderEnabled(true);advance(world,.2,{x:0,y:0});
 assert.equal(world.environment.geometry,geometry);assert.equal(world.environment.material,material);
 assert.equal(world.trailChainTexture,texture);assert.equal(world.trailMotion.lines[0].points,points);
 world.dispose(scene);input.dispatchEvent(new Event('pointerdown'));
 assert.equal(world.trailMotion.spinElapsed,-1);assert.equal(scene.children.length,0);
});

test('architectural environment joins the warm gate and reuses bounded topology through flight cycles',async()=>{
 const {world,scene}=fixture();
 assert.equal(world.readyPromise,world.environment.userData.readyPromise);
 await world.readyPromise;
 const buffers=[];
 world.environment.traverse(object=>{
  if(object.geometry)buffers.push([object.geometry,object.geometry.getAttribute('position').array.slice()]);
  if(object.material)assert.equal(object.material.uniforms.uTravel,world.environment.material.uniforms.uTravel);
 });
 assert.equal(buffers.length,2);
 assert.ok(world.environment.isInstancedMesh,'all suspended details share one prepared draw');
 const geometry=world.environment.geometry;
 let triangles=0;
 world.environment.traverse(object=>{if(object.isInstancedMesh)triangles+=object.geometry.index.count/3*object.count;});
 assert.ok(triangles<250000,'long sheet panels reduce the architecture geometry budget');
 assert.ok(Object.values(world.environment.material.uniforms).every(uniform=>!uniform.value?.isTexture),'native site background needs no environment textures');
 assert.equal(world.secondaryTrails.mesh.visible,false);
 const matrices=world.environment.instanceMatrix.array.slice();
 const depths=geometry.getAttribute('aDepth').array.slice();
 advance(world,TUNNEL_LENGTH/ENVIRONMENT_FLIGHT_SPEED+2,{x:.3,y:-.2});
 assert.deepEqual(world.environment.instanceMatrix.array,matrices);
 assert.deepEqual(geometry.getAttribute('aDepth').array,depths);
 for(const [geometry,positions] of buffers)assert.deepEqual(geometry.getAttribute('position').array,positions);
 const disposables=[...world.disposables];
 const disposed=new Set();
 for(const resource of disposables)resource.addEventListener('dispose',()=>disposed.add(resource));
 world.dispose(scene);
 assert.equal(disposed.size,new Set(disposables).size);
});

test('triangular architecture keeps a clear flight volume and bounded panel sizes',()=>{
 const {world,scene}=fixture();
 try {
  const mesh=world.environment,geometry=mesh.geometry;
  const style=geometry.getAttribute('aStyle'),motion=geometry.getAttribute('aMotion');
  const matrix=new THREE.Matrix4(),size=new THREE.Vector3(),normal=new THREE.Vector3(),center=new THREE.Vector3();
  let panels=0,ribs=0,lights=0,moving=0,catches=0,longPanels=0;
  for(let i=0;i<mesh.count;i++) {
   mesh.getMatrixAt(i,matrix);
   size.set(Math.hypot(...matrix.elements.slice(0,3)),Math.hypot(...matrix.elements.slice(4,7)),Math.hypot(...matrix.elements.slice(8,11)));
   center.setFromMatrixPosition(matrix);
   const kind=style.getX(i);
   assert.ok([...matrix.elements].every(Number.isFinite));
   if(kind===0||kind===3) {
    panels++;
    assert.ok(size.x<7 && size.y<24 && size.z<.37,'sheet cladding stays thin and within its structural bay');
    if(size.y>12)longPanels++;
    normal.set(...matrix.elements.slice(8,11)).normalize();
    const clearance=-center.dot(normal)-size.z*.5-motion.getY(i);
    assert.ok(clearance>PASSAGE_RADIUS-6,'even extended panels remain outside the flight volume');
    if(motion.getY(i)>0)moving++;
   } else if(kind===4) {
    catches++;
    assert.ok(size.x<.4 && size.y<1.5 && size.z<.13,'service catches stay small and nearly flush');
   } else if(kind===1) {
    normal.set(...matrix.elements.slice(4,7)).normalize();
    assert.ok(-center.dot(normal)-size.y*.5>31,'frames leave room for particles and camera');
    if(size.x>100)ribs++;
   } else if(kind===2) {
    lights++;
    assert.ok(size.y<.33,'light stays recessed and narrow');
    assert.ok(style.getZ(i)<=2.41,'emission has a bounded accent budget');
   }
  }
  assert.equal(panels,WALL_ROWS*WALL_LANES*2);
  assert.equal(longPanels,panels/2,'large plain sheets alternate with smaller service sections');
  assert.equal(catches,panels/8,'physical details are sparse rather than repeated on every plate');
  assert.equal(ribs,TUNNEL_LENGTH/FRAME_SPACING*3,'three structural sides per complete frame');
  assert.equal(lights,ribs*4);
  assert.ok(moving/panels>.04 && moving/panels<.09);
 } finally {world.dispose(scene);}
});

test('depth particles have bounded quality tiers and resize without rebuilding positions',()=>{
 let previousCount=0;
 for(const tier of ['low','medium','high']) {
  const uniforms={uTime:{value:0},uTravel:{value:0},uReveal:{value:1},uCycle:{value:TUNNEL_LENGTH}};
  const resources=[];
  const particles=createLightTrailsParticles(uniforms,resources,tier);
  const position=particles.geometry.getAttribute('position');
  assert.ok(position.count>previousCount && position.count<=3000);
  assert.ok(position.array.every(Number.isFinite));
  const life=particles.geometry.getAttribute('aLife');
  const details=particles.geometry.getAttribute('aParticle');
  let living=0,heads=0;
  for(let i=0;i<position.count;i++)if(details.getZ(i)>9) {
   living++;
   if(life.getY(i)===0)heads++;
   assert.ok(Math.hypot(position.getX(i),position.getY(i))<23.01,'swarm centres leave room for their orbit inside the shell');
  }
  assert.ok(living>=96 && living<position.count-1,'shoals stay inside the existing particle budget');
  assert.ok(heads>=24 && heads<=168,'bounded living heads, with prepared tails');
  assert.equal(particles.material.uniforms.uTravel,uniforms.uTravel);
  assert.equal(particles.material.depthTest,true,'solid structures occlude particles');
  assert.equal(particles.material.depthWrite,false,'dust does not mask other transparent effects');
  const positions=position.array.slice();
  for(const height of [720,1080]) {
   particles.onBeforeRender({getDrawingBufferSize:target=>target.set(1440,height),getRenderTarget:()=>null});
   assert.equal(particles.material.uniforms.uPixelScale.value,height/2);
  }
  particles.onBeforeRender({getDrawingBufferSize:target=>target.set(1440,1080),getRenderTarget:()=>({height:360})});
  assert.equal(particles.material.uniforms.uPixelScale.value,180,'particles use the active render target resolution');
  assert.deepEqual(position.array,positions);
  previousCount=position.count;
  for(const resource of resources)resource.dispose();
 }
});

test('faster environment flight stays independent of render rate and stops while dormant',()=>{
 for(const fps of [30,60,144]) {
  const {world,scene}=fixture();
  advance(world,11,{x:0,y:0},fps);
  assert.ok(Math.abs(world.travel-(11*ENVIRONMENT_FLIGHT_SPEED)%TUNNEL_LENGTH)<1e-8);
  const travel=world.travel;
  world.setRenderEnabled(false);advance(world,2,{x:0,y:0},fps);
  assert.equal(world.travel,travel);
  world.dispose(scene);
 }
});


