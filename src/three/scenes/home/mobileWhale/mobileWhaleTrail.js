import * as THREE from "three";
import { whaleDepthMistGLSL } from "./whaleComposition.js";

// One prepared point draw. Emission anchors share the creature's original rig.
class RiggedTrail extends THREE.Points {
 constructor(geometry,material,source){
  super(geometry,material);
  if(source){
   this.isSkinnedMesh=true;this.skeleton=source.skeleton;
   this.bindMatrix=source.bindMatrix.clone();this.bindMatrixInverse=source.bindMatrixInverse.clone();
   this.position.copy(source.position);this.quaternion.copy(source.quaternion);this.scale.copy(source.scale);
  }
  const viewport=new THREE.Vector4();
  this.onBeforeRender=renderer=>{renderer.getCurrentViewport(viewport);material.uniforms.uViewportHeight.value=viewport.w;};
  this.frustumCulled=false;this.renderOrder=5;this.name="Whale / rigged wave trails";
 }
 updateMatrixWorld(force){
  super.updateMatrixWorld(force);
  if(this.isSkinnedMesh)this.bindMatrixInverse.copy(this.matrixWorld).invert();
 }
}

export function createMobileWhaleTrail(shared,source,emitters=[],config={}){
 // Prepare the maximum once; the dev count control only changes GPU visibility.
 const perStream=48,anchors=emitters.slice(0,40),count=anchors.length*perStream;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
 const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 const names=source?.skeleton.bones.map(bone=>bone.name)||[];
 let randomState=74621;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 anchors.forEach((anchor,stream)=>{
  const skin=Object.entries(anchor.weights);
  for(let i=0;i<perStream;i++){
   const index=stream*perStream+i;
   positions.set(anchor.position,index*3);
   seeds.set([(i+random())/perStream,random(),random(),random()],index*4);
   skin.forEach(([name,weight],j)=>{indices[index*4+j]=names.indexOf(name);weights[index*4+j]=weight;});
  }
 });
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,4));
 geometry.setAttribute("skinIndex",new THREE.BufferAttribute(indices,4));
 geometry.setAttribute("skinWeight",new THREE.BufferAttribute(weights,4));
 const uniforms={
  uTime:shared.uTime,
  uEntranceReveal:shared.uEntranceReveal,
  uViewportHeight:{value:679},
  uColor:{value:new THREE.Color(config.color??"#38d4ff")},
  uOpacity:{value:1},uGlow:{value:3.4},uParticleDensity:{value:.5},uPointScale:{value:1},
  uTrailSpeed:{value:.05},uFlowX:{value:.84},uFlowY:{value:.36},uSpread:{value:.64},uWander:{value:1},
 };
 const material=new THREE.ShaderMaterial({
  uniforms,transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`
   #include <common>
   #include <skinning_pars_vertex>
   uniform float uTime,uViewportHeight,uParticleDensity,uPointScale,uTrailSpeed,uFlowX,uFlowY,uSpread,uWander;
   attribute vec4 aSeed;varying float vLight;
   ${whaleDepthMistGLSL}
   void main(){
    float visible=step(aSeed.y,uParticleDensity);
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    float age=fract(aSeed.x+uTime*(uTrailSpeed*2.4+aSeed.y*uTrailSpeed));
    float phase=position.x*3.7+position.y*2.3+uTime*.17;
    float curl=sin(age*7.5+phase)-sin(phase);
    float ripple=sin(age*16.+phase*1.3+aSeed.z*1.7)-sin(phase*1.3+aSeed.z*1.7);
    float spread=age*age;
    // Shared mean flow with independently dispersed particles, not rigid strings.
    transformed+=vec3(age*(uFlowX+aSeed.y*abs(uFlowX)*.75),age*(uFlowY+aSeed.z*abs(uFlowY)*.7),0.);
    transformed+=vec3(-.35,1.,.25)*(curl*.10+ripple*.025)*age*uWander;
    transformed+=vec3(aSeed.y-.5,aSeed.z-.5,aSeed.w-.5)*spread*uSpread;
    vLight=visible*age*(.13+.45*pow(aSeed.w,2.));
    float envelope=smoothstep(0.,.10,age)*(1.-smoothstep(.42,1.,age));
    vLight*=envelope;
    vec4 viewPosition=modelViewMatrix*vec4(transformed,1.);
    vLight*=1.-whaleDepthMist(viewPosition.xyz,modelViewMatrix)*.94;
    gl_Position=projectionMatrix*viewPosition;
    float pixels=.019*uViewportHeight*projectionMatrix[1][1]*length(modelViewMatrix[0].xyz)*uPointScale;
    if(isPerspectiveMatrix(projectionMatrix))pixels/=max(.001,-viewPosition.z);
    gl_PointSize=clamp(pixels*(.58+.6*aSeed.w)*visible,1.2*visible,8.);
   }`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity,uGlow,uEntranceReveal;varying float vLight;
   void main(){float r2=dot(gl_PointCoord-.5,gl_PointCoord-.5);if(r2>.25)discard;
    float core=exp(-r2*36.);gl_FragColor=vec4(uColor*(1.4+uGlow*.6),core*vLight*uOpacity*uEntranceReveal);}`,
 });
 const trail=new RiggedTrail(geometry,material,source);
 trail.applyConfig=(next={})=>{
  uniforms.uColor.value.set(next.color??"#38d4ff");
  uniforms.uOpacity.value=Math.max(0,next.alpha??.32)*2.875;
  uniforms.uGlow.value=Math.max(0,next.glow??3.4);
  uniforms.uParticleDensity.value=THREE.MathUtils.clamp((next.count??200)/400,0,1);
  uniforms.uPointScale.value=Math.max(0,next.pointScale??1.6)/1.6;
  uniforms.uTrailSpeed.value=Math.max(0,next.speed??.05);
  uniforms.uFlowX.value=next.flowX??.84;
  uniforms.uFlowY.value=next.flowY??.36;
  uniforms.uSpread.value=Math.max(0,next.spread??.18)*(.64/.18);
  uniforms.uWander.value=Math.max(0,next.wanderAmp??2.8)/2.8;
 };
 trail.applyConfig(config);
 return trail;
}
