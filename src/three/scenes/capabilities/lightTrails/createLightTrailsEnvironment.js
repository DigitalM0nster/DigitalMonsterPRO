import * as THREE from "three";
import { templeVertexShader, templeFragmentShader } from "./lightTrailsTempleShaders.js";
import { createLightTrailsParticles } from "./createLightTrailsParticles.js";
import { getGraphicsTier } from "../../../../functions/getGraphicsTier.js";

export const TUNNEL_LENGTH = 1536;
export const ENVIRONMENT_FLIGHT_SPEED = 26;
export const PASSAGE_RADIUS = 36;
export const WALL_ROWS = 128;
export const WALL_LANES = 18;
export const FRAME_SPACING = 48;

function createModuleGeometry() {
 const c=0.025;
 const outline=[[-.5+c,-.5],[.5-c,-.5],[.5,-.5+c],[.5,.5-c],[.5-c,.5],[-.5+c,.5],[-.5,.5-c],[-.5,-.5+c]];
 // Flat sheet, narrow cut bevel, straight sides. Split the coincident edge
 // vertices so face normals cannot inflate the whole panel into a pillow.
 const positions=[0,0,.5],normals=[0,0,1],rims=[0],indices=[];
 for(const [scale,z,lateral,nz,rim] of [[.98,.5,0,1,0],[.98,.5,.999,.0476,1],[1,.29,.999,.0476,1],[1,.29,1,0,.4],[1,-.5,1,0,.4]]) {
  for(const [x,y] of outline) {
   const d=Math.hypot(x,y);
   positions.push(x*scale,y*scale,z);normals.push(x/d*lateral,y/d*lateral,nz);rims.push(rim);
  }
 }
 for(let i=0;i<8;i++) {
  const next=(i+1)%8;indices.push(0,1+i,1+next);
  for(const band of [1,3]) {
   const a=1+band*8+i,b=1+band*8+next;indices.push(a,a+8,b,b,a+8,b+8);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
 geometry.setAttribute("aRim",new THREE.Float32BufferAttribute(rims,1));geometry.setIndex(indices);
 return geometry;
}

/** Layered triangular passage: restrained luminous ribs and chamfered cladding. */
export function createLightTrailsEnvironment(disposables) {
 const geometry=createModuleGeometry();
 const uniforms={uTime:{value:0},uTravel:{value:0},uReveal:{value:0},uCycle:{value:TUNNEL_LENGTH}};
 const material=new THREE.ShaderMaterial({
  name:"light-trails-triangular-architecture",
  defines:{CIRCUIT_FINE_DETAIL:getGraphicsTier()==="low"?0:1},uniforms,
  vertexShader:templeVertexShader,fragmentShader:templeFragmentShader,
  transparent:true,depthWrite:true,toneMapped:false,
 });
 const records=[];
 const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),center=new THREE.Vector3();
 const tangent=new THREE.Vector3(),inward=new THREE.Vector3(),axial=new THREE.Vector3(0,0,-1),front=new THREE.Vector3(0,0,1);
 const corners=Array.from({length:3},(_,i)=>new THREE.Vector3(Math.cos(Math.PI/2+i*Math.PI*2/3)*PASSAGE_RADIUS*2,Math.sin(Math.PI/2+i*Math.PI*2/3)*PASSAGE_RADIUS*2,0));
 let state=31093;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const add=(x,y,z,sizeX,sizeY,sizeZ,depth,kind,seed,energy,motion=null)=>{
  matrix.makeBasis(x,y,z).scale(scale.set(sizeX,sizeY,sizeZ)).setPosition(center);
  records.push({matrix:matrix.elements.slice(),depth,style:[kind,seed,energy],motion:motion??[0,0,0]});
 };
 for(let side=0;side<3;side++) {
  const a=corners[side],b=corners[(side+1)%3],length=a.distanceTo(b),pitch=length/WALL_LANES;
  tangent.subVectors(b,a).normalize();inward.set(-tangent.y,tangent.x,0);
  for(let lane=0;lane<WALL_LANES;lane++) {
   const serviceLane=lane%3===1,span=serviceLane?1:2;
   for(let row=0;row<WALL_ROWS;row+=span) {
   const seed=random(),depth=96+(row+(span-1)*.5)*12,relief=.42+random()*.035;
   const motion=[random(),seed<.065?.16+random()*.2:0,.075+random()*.05];
   center.copy(a).lerp(b,(lane+.5)/WALL_LANES).addScaledVector(inward,relief);
   const finish=serviceLane?(row%4===0?2:1):0;
   add(tangent,axial,inward,pitch*.983,span*12-.15,.3+seed*.06,depth,side===1?3:0,seed,finish,motion);
   // Sparse physical catches, inset in the service band rather than extra blocks.
   if(serviceLane&&row%4===0) {
    center.addScaledVector(inward,.23).addScaledVector(tangent,pitch*.35);
    add(tangent,axial,inward,.38,1.45,.12,depth+3.5,4,seed,3,motion);
   }
   }
  }
 }
 for(let ring=0;ring<TUNNEL_LENGTH/FRAME_SPACING;ring++)for(let side=0;side<3;side++) {
  const a=corners[side].clone().multiplyScalar(.91),b=corners[(side+1)%3].clone().multiplyScalar(.91);
  const length=a.distanceTo(b),depth=96+ring*FRAME_SPACING;
  tangent.subVectors(b,a).normalize();inward.set(-tangent.y,tangent.x,0);
  center.copy(a).lerp(b,.5);
  add(tangent,inward,front,length,.95,2.2,depth,1,ring/32,.3);
  // Interrupted light is embedded into the rib rather than outlining every wall panel.
  for(let segment=0;segment<4;segment++) {
   center.copy(a).lerp(b,.14+segment*.24);center.z=1.14;
   add(tangent,inward,front,length*.19,.32,.16,depth,2,ring*.17+side*.31,(ring%3===0?2.4:.95)*(segment%2===0?1:.65));
  }
  for(const fraction of [.08,.5,.92]) {
   center.copy(a).lerp(b,fraction);center.z=1.6;
   add(tangent,inward,front,2.7,1.55,.65,depth,1,fraction,.5);
  }
 }
 const environment=new THREE.InstancedMesh(geometry,material,records.length);
 const depths=new Float32Array(records.length),styles=new Float32Array(records.length*3),motions=new Float32Array(records.length*3);
 records.forEach((record,i)=>{
  matrix.fromArray(record.matrix);environment.setMatrixAt(i,matrix);depths[i]=record.depth;
  styles.set(record.style,i*3);motions.set(record.motion,i*3);
 });
 geometry.setAttribute("aDepth",new THREE.InstancedBufferAttribute(depths,1));
 geometry.setAttribute("aStyle",new THREE.InstancedBufferAttribute(styles,3));
 geometry.setAttribute("aMotion",new THREE.InstancedBufferAttribute(motions,3));
 environment.instanceMatrix.needsUpdate=true;
 environment.name="capability-light-trails-triangular-passage";
 environment.frustumCulled=false;
 environment.add(createLightTrailsParticles(uniforms,disposables));
 environment.userData.readyPromise=Promise.resolve(true);
 disposables.push(geometry,material);
 return environment;
}
