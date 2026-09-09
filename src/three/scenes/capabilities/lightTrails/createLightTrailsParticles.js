import * as THREE from "three";
import { getGraphicsTier } from "../../../../functions/getGraphicsTier.js";

export const PARTICLE_COUNTS = {low:800,medium:1600,high:2600};
export const SWARM_LAYOUTS = {low:[8,3,4],medium:[14,5,5],high:[24,7,5]};

const vertexShader = /* glsl */ `
 attribute vec3 aParticle;
 attribute vec3 aLife;
 uniform float uTime;
 uniform float uTravel;
 uniform float uReveal;
 uniform float uCycle;
 uniform float uPixelScale;
 varying float vOpacity;
 varying float vBrightness;
 varying float vLife;
 void main() {
  float depth=mod(position.z-uTravel+uCycle,uCycle);
  vec3 p=vec3(position.xy,64.0-depth);
  bool horizon=aParticle.z<0.0;
  bool living=aParticle.z>9.0;
  if(horizon)p=vec3(0.0,0.0,-1460.0);
  else if(living) {
   float lag=aLife.y*0.055;
   float t=uTime-lag;
   float phase=aParticle.z;
   depth=mod(position.z-uTravel+uTime*(7.0+aLife.z)+uCycle,uCycle)+lag*18.0;
   p=vec3(position.xy,64.0-depth);
   p.xy+=vec2(sin(t*0.23+phase)*3.6,cos(t*0.19+phase*1.7)*3.2);
   float orbit=t*(0.7+aLife.z*0.08)+aLife.x;
   p.xy+=vec2(cos(orbit),sin(orbit*1.13))*1.35;
   p.xy+=vec2(sin(t*2.1+aLife.x),cos(t*1.7+aLife.x))*0.24;
  }
  else p.xy+=vec2(sin(uTime*0.12+aParticle.z),cos(uTime*0.1+aParticle.z))*0.24;
  vec4 view=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*view;
  // Match the architecture's infinite-far depth so dust is occluded by solid monoliths.
  float near=max(0.5,projectionMatrix[3][2]/(projectionMatrix[2][2]-1.0));
  gl_Position.z=-view.z-2.0*near;
  float size=aParticle.x*uPixelScale*projectionMatrix[1][1]/max(1.0,-view.z);
  gl_PointSize=horizon?clamp(150.0*uPixelScale/-view.z,1.0,96.0):clamp(size,1.0,living?10.0:7.0);
  float coverage=min(1.0,size*size);
  vOpacity=uReveal*coverage*smoothstep(3.0,18.0,-view.z)
   *(1.0-smoothstep(700.0,1150.0,depth));
  if(horizon)vOpacity=uReveal*0.7;
  vBrightness=aParticle.y;
  if(living)vBrightness*=0.8+0.2*sin(uTime*2.2+aLife.x);
  vLife=living?1.0:0.0;
 }
`;

const fragmentShader = /* glsl */ `
 varying float vOpacity;
 varying float vBrightness;
 varying float vLife;
 void main() {
  vec2 p=gl_PointCoord*2.0-1.0;
  float r=dot(p,p);
  if(r>1.0||vOpacity<0.002) discard;
  float soft=exp(-r*4.5)*(1.0-smoothstep(0.65,1.0,r));
  vec3 color=mix(vec3(0.16,0.55,0.9),vec3(0.85,1.35,1.65),min(1.0,vBrightness*0.65));
  color=mix(color,vec3(0.24,1.05,1.4),vLife*0.55);
  gl_FragColor=vec4(color*vBrightness,soft*vOpacity*0.8);
 }
`;

/** A prepared dust volume: stable seeds, no particle spawning or position uploads in flight. */
export function createLightTrailsParticles(sharedUniforms,disposables,tier=getGraphicsTier()) {
 const count=PARTICLE_COUNTS[tier]??PARTICLE_COUNTS.medium;
 const positions=new Float32Array(count*3),details=new Float32Array(count*3),life=new Float32Array(count*3);
 let state=74093;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<count;i++) {
  const angle=random()*Math.PI*2;
  const radius=i%3===0?24+random()*25:3+random()*26;
  positions.set([Math.cos(angle)*radius,Math.sin(angle)*radius,random()*sharedUniforms.uCycle.value],i*3);
  details.set([0.1+random()*0.22,0.3+Math.pow(random(),3)*1.45,random()*Math.PI*2],i*3);
 }
 // Small independently drifting shoals, with sampled tails in the same prepared Points draw.
 const [groups,members,tailSamples]=SWARM_LAYOUTS[tier]??SWARM_LAYOUTS.medium;
 let liveIndex=0;
 for(let group=0;group<groups;group++) {
  const angle=random()*Math.PI*2,radius=7+random()*16;
  const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
  const depth=(group+random())/groups*sharedUniforms.uCycle.value;
  const seed=10+random()*Math.PI*2,speed=1.5+random()*3;
  for(let member=0;member<members;member++) {
   const phase=random()*Math.PI*2,size=0.52+random()*0.28;
   for(let tail=0;tail<tailSamples;tail++,liveIndex++) {
    positions.set([x,y,depth],liveIndex*3);
    details.set([size*(1-tail/(tailSamples+1)),tail===0?1.75:0.65*(1-tail/tailSamples),seed],liveIndex*3);
    life.set([phase,tail,speed],liveIndex*3);
   }
  }
 }
 // One prepared point supplies the distant light focus, with no extra draw or moving destination.
 positions.set([0,0,1460],(count-1)*3);
 details.set([1,6,-1],(count-1)*3);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aParticle",new THREE.BufferAttribute(details,3));
 geometry.setAttribute("aLife",new THREE.BufferAttribute(life,3));
 const material=new THREE.ShaderMaterial({
  uniforms:{...sharedUniforms,uPixelScale:{value:450}},vertexShader,fragmentShader,
  transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false,
 });
 const particles=new THREE.Points(geometry,material);
 const drawingSize=new THREE.Vector2();
 particles.name="capability-light-trails-depth-particles";
 particles.frustumCulled=false;
 particles.renderOrder=1;
 particles.onBeforeRender=renderer=>{
  renderer.getDrawingBufferSize(drawingSize);
  material.uniforms.uPixelScale.value=(renderer.getRenderTarget()?.height??drawingSize.y)*0.5;
 };
 disposables.push(geometry,material);
 return particles;
}
