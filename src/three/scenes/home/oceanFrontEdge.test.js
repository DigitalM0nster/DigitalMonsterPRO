import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { heroCamera, HERO_LOOK_AT, getHeroCameraForSceneProgress } from "./heroCamera.js";
import { oceanFrontEdgeGlsl } from "./shaders/oceanFrontEdge.glsl.js";
import { createAmbientFlowState, updateAmbientFlowState } from "./utils/ambientParticleFlow.js";

const source=readFileSync(new URL("./DigitalWhaleScene.js",import.meta.url),"utf8");
const method=(start,end)=>source.slice(source.indexOf(`\t${start}`),source.indexOf(`\n\t${end}`,source.indexOf(`\t${start}`)));
const methods=method("syncCamera(","/** Автоскролл")+method("_syncOceanScroll() {","/** Сдвигаем")
 +method("_accumulateScrollSpeeds(delta","_applyWhaleTransform")
 +method("_applyOceanTilt() {","_publishSceneProgressDebug");
const config={ocean:{tiltX:.31,rotationY:-.02,mouseTiltX:.1,mouseTiltY:.1}};
const Scene=vm.runInNewContext(`class Scene { ${methods} }\nScene`,{
 heroCamera,HERO_LOOK_AT,getHeroCameraForSceneProgress,digitalWhaleConfig:config,
 getOceanTileScrollX:(phase,slot)=>slot*120+((phase%120)+120)%120,
});

test("home camera ignores the pointer while forward/reverse route poses remain continuous",()=>{
 const scene=new Scene();scene.cameraPos=new THREE.Vector3();scene.lookAtTarget=new THREE.Vector3();scene.oceanGroup=new THREE.Group();
 for(const progress of [-1,-.5,-.001,0,.001,.5,1,0]){
  scene.smoothPointer={x:0,y:0};scene.syncCamera(progress);const pose=[...scene.cameraPos,...scene.lookAtTarget];
  for(const pointer of [{x:1,y:-1},{x:-1,y:1},{x:.4,y:.8}]){
   scene.smoothPointer=pointer;scene.syncCamera(progress);scene._applyOceanTilt();
   assert.deepEqual([...scene.cameraPos,...scene.lookAtTarget],pose);
   assert.equal(scene.oceanGroup.rotation.x,.31);assert.equal(scene.oceanGroup.rotation.y,-.02);
  }
 }
 scene.syncCamera(.5);const forward=scene.cameraPos.clone();scene.syncCamera(-.5);
 assert.ok(forward.distanceTo(scene.cameraPos)>1,"route movement is preserved");
});

test("point-ocean tiles move right and wrap without reversing",()=>{
 const scene=new Scene();scene.oceanSurfaceGroup=new THREE.Group();scene._oceanRenderMode="points";
 scene._oceanScrollPhase=new THREE.Vector2();scene._oceanCoverageOffsetX=-40;
 scene.oceanSurfaceTiles=[-1,0,1].map(slot=>({slot,group:new THREE.Group()}));
 scene.oceanMaterial={uniforms:{uScrollPhase:{value:new THREE.Vector2()}}};
 scene.oceanGridMaterial={uniforms:{uScrollPhase:{value:new THREE.Vector2()}}};
 for(const phase of [0,119.99,120,120.01,99999,-120]){
  scene.oceanScrollAccum=phase;scene.oceanScrollAutoZ=phase*1.75;scene._syncOceanScroll();
  const offset=((phase%120)+120)%120;
  scene.oceanSurfaceTiles.forEach((tile,index)=>assert.ok(
   Math.abs(tile.group.position.x-([-120,0,120][index]+offset))<1e-9));
  assert.equal(scene.oceanMaterial.uniforms.uScrollPhase.value.x,0,"tile motion is not applied twice in the shader");
  assert.deepEqual(scene.oceanGridMaterial.uniforms.uScrollPhase.value,scene.oceanMaterial.uniforms.uScrollPhase.value);
 }
});

test("configured horizontal speed can change magnitude but not rightward direction",()=>{
 const scene=new Scene();scene.oceanScrollAuto=4;scene.oceanScrollAutoZ=0;
 scene._deepScrollAuto=0;scene._whaleAmbientScrollAuto=0;
 for(const speed of [2,-2,0]){
  const before=scene.oceanScrollAuto;
  scene._accumulateScrollSpeeds(.5,{ocean:{scrollSpeedX:speed},ambient:{}});
  assert.ok(scene.oceanScrollAuto>=before);
 }
});

test("nearby particles integrate a changing swim direction without reprojecting old motion",()=>{
	const flow=createAmbientFlowState();
	updateAmbientFlowState(flow,0,new THREE.Vector3(1,0,0),20);
	updateAmbientFlowState(flow,1,new THREE.Vector3(1,0,0),20);
	assert.deepEqual(flow.offset.toArray(),[1,0]);
	updateAmbientFlowState(flow,2,new THREE.Vector3(0,0,-1),20);
	assert.deepEqual(flow.offset.toArray(),[1,-1]);
	assert.deepEqual(flow.direction.toArray(),[0,0,-1]);
});

// Execute the numeric GLSL helper itself, using Three's matching smoothstep.
const edge=vm.runInNewContext(`${oceanFrontEdgeGlsl.replace(/float (\w+)\(float (\w+)\)/g,"function $1($2)")}
({weight:oceanMotionWeight,height:oceanFrontHeight})`,{smoothstep:(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b)});
test("foreground height is motionless, with a smooth blend to animated open water and the reference contour",()=>{
 for(const z of [22,21.5,18,14])assert.equal(edge.weight(z),0);
 for(const z of [2,0,-40,-73])assert.equal(edge.weight(z),1);
 let previous=0;
 for(let z=14;z>=2;z-=.1){const weight=edge.weight(z);assert.ok(weight>=previous&&weight<=1);previous=weight;}
 assert.ok(edge.weight(14-.001)<1e-7);assert.ok(1-edge.weight(2+.001)<1e-7);
 const ocean=new THREE.Object3D();ocean.position.set(5.1,4.7,12.8);ocean.rotation.set(.31,-.02,0);ocean.scale.set(.4,1,.4);ocean.updateMatrixWorld();
 const camera=new THREE.PerspectiveCamera(50,1917/930,.1,2000);camera.position.set(heroCamera.x,heroCamera.y,heroCamera.z);
 camera.lookAt(HERO_LOOK_AT.x,HERO_LOOK_AT.y,HERO_LOOK_AT.z);camera.updateMatrixWorld();
 for(const [x,targetY] of [[-47.559,.19],[-41.637,.205],[-34.855,.20],[-15.793,.34]]){
  const base=new THREE.Vector3(x,0,22).applyMatrix4(ocean.matrixWorld);
  const projected=new THREE.Vector3(x,edge.height(base.x),22).applyMatrix4(ocean.matrixWorld).project(camera);
  assert.ok(Math.abs((1-projected.y)/2-targetY)<.02,"fixed silhouette follows the supplied reference");
 }
});
