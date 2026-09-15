import * as THREE from "three";
import { whaleDepthMistGLSL } from "./whaleComposition.js";
import { prepareWhaleWakeFlow } from "./whaleWakeFlow.js";
import { getOceanSpaceCeilingY } from "../utils/oceanSurfaceClip.js";

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
  this.onBeforeRender=(renderer,scene,camera)=>{
   renderer.getCurrentViewport(viewport);material.uniforms.uViewportHeight.value=viewport.w;
   const u=material.uniforms,surface=this.oceanSurface;
   u.uOceanClipEnabled.value=surface?.visible?1:0;
   if(surface?.visible){
    // Follow the actual water transform, independently of the whale's rig/pose.
    u.uWhaleToOcean.value.copy(surface.matrixWorld).invert();
    if(camera)u.uCameraOcean.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(u.uWhaleToOcean.value);
    u.uWhaleToOcean.value.multiply(this.matrixWorld);
    u.uOceanCeilingY.value=getOceanSpaceCeilingY({},this.oceanConfig);
    u.uOceanEdgeCeilingY.value=-(Math.abs(this.oceanConfig?.waveAmp??.9)*.65
     +Math.abs(this.oceanConfig?.rippleAmp??.15)*.55+.05);
   }
  };
  this.frustumCulled=false;this.renderOrder=5;this.name="Whale / rigged wave trails";
 }
 setOceanSurface(surface,config,zNear){
  this.oceanSurface=surface;this.oceanConfig=config;
  this.material.uniforms.uOceanZNear.value=zNear??0;
 }
 updateMatrixWorld(force){
  super.updateMatrixWorld(force);
  if(this.isSkinnedMesh)this.bindMatrixInverse.copy(this.matrixWorld).invert();
 }
}

export function createMobileWhaleTrail(shared,source,emitters=[],config={}){
 // Prepare the maximum once; the dev count control only changes GPU visibility.
 const perStream=32,anchors=prepareWhaleWakeFlow(emitters,source),count=anchors.length*perStream;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
 const directions=new Float32Array(count*3),bends=new Float32Array(count*3);
 const indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 const names=source?.skeleton.bones.map(bone=>bone.name)||[];
 let randomState=74621;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 anchors.forEach((anchor,stream)=>{
  const skin=Object.entries(anchor.weights);
  for(let i=0;i<perStream;i++){
   const index=stream*perStream+i;
   positions.set(anchor.position,index*3);
   directions.set(anchor.direction,index*3);bends.set(anchor.bend,index*3);
   seeds.set([(i+random())/perStream,random(),random(),random()],index*4);
   skin.forEach(([name,weight],j)=>{indices[index*4+j]=names.indexOf(name);weights[index*4+j]=weight;});
  }
 });
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,4));
 geometry.setAttribute("aFlowDirection",new THREE.BufferAttribute(directions,3));
 geometry.setAttribute("aFlowBend",new THREE.BufferAttribute(bends,3));
 geometry.setAttribute("skinIndex",new THREE.BufferAttribute(indices,4));
 geometry.setAttribute("skinWeight",new THREE.BufferAttribute(weights,4));
 const uniforms={
  uTime:shared.uTime,
  uEntranceReveal:shared.uEntranceReveal,
  uViewportHeight:{value:679},
  uWhaleToOcean:{value:new THREE.Matrix4()},uOceanClipEnabled:{value:0},
  uOceanCeilingY:{value:-1.5},uOceanFadeBand:{value:1.1},
  uOceanEdgeCeilingY:{value:-.8},
  uCameraOcean:{value:new THREE.Vector3()},uOceanZNear:{value:0},
  uColor:{value:new THREE.Color(config.color??"#38d4ff")},
  uOpacity:{value:1},uGlow:{value:3.4},uParticleDensity:{value:.5},uPointScale:{value:1},
  uTrailSpeed:{value:.05},uFlowX:{value:.84},uFlowY:{value:.36},uSpread:{value:.64},uWander:{value:1},
  uMotionEnergy:{value:.15},uFlowTurn:{value:new THREE.Vector2()},
 };
 const material=new THREE.ShaderMaterial({
  uniforms,transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`
   #include <common>
   #include <skinning_pars_vertex>
    uniform float uTime,uViewportHeight,uParticleDensity,uPointScale,uTrailSpeed,uFlowX,uFlowY,uSpread,uWander,uEntranceReveal;
   uniform float uMotionEnergy;
   uniform vec2 uFlowTurn;
   uniform mat4 uWhaleToOcean;
   uniform float uOceanClipEnabled,uOceanCeilingY,uOceanFadeBand,uOceanEdgeCeilingY;
   uniform vec3 uCameraOcean;
   uniform float uOceanZNear;
   attribute vec4 aSeed;
   attribute vec3 aFlowDirection,aFlowBend;
   varying float vLight;
   ${whaleDepthMistGLSL}
   vec3 rotateWake(vec3 value,vec2 turn){
    float cy=cos(turn.x),sy=sin(turn.x),cp=cos(turn.y),sp=sin(turn.y);
    vec3 yawed=vec3(cy*value.x-sy*value.z,value.y,sy*value.x+cy*value.z);
    return vec3(cp*yawed.x-sp*yawed.y,sp*yawed.x+cp*yawed.y,yawed.z);
   }
   void main(){
    float activity=mix(.34,1.,smoothstep(0.,1.,uMotionEnergy));
    float visible=step(aSeed.y,uParticleDensity*activity);
    #include <skinbase_vertex>
    #include <begin_vertex>
    // Skin only the live emission origin. The wake displacement stays in root
    // space, so an already detached stream cannot reverse with a flapping fin.
    #include <skinning_vertex>
    float age=fract(aSeed.x+uTime*(uTrailSpeed*mix(1.75,3.25,uMotionEnergy)+aSeed.y*uTrailSpeed));
    float phase=position.x*3.7+position.y*2.3+uTime*.17;
    float curl=sin(age*7.5+phase)-sin(phase);
    float ripple=sin(age*16.+phase*1.3+aSeed.z*1.7)-sin(phase*1.3+aSeed.z*1.7);
    float spread=age*age;
    // Curved anatomical flow in 3D, then skin both the origin and its trajectory.
    // +X follows head -> tail and already recedes into depth in the hero pose.
    float travel=age*(.74+aSeed.y*.52);
    vec3 particleFan=vec3((aSeed.z-.5)*.05,(aSeed.w-.5)*.14,(aSeed.y-.5)*.12);
    vec3 stableDirection=rotateWake(aFlowDirection+particleFan,uFlowTurn);
    vec3 stableBend=rotateWake(aFlowBend,uFlowTurn);
    transformed+=(stableDirection*travel+stableBend*travel*travel)*uFlowX;
    transformed.y+=travel*uFlowY;
    transformed+=vec3(.08,.7,.35)*(curl*.04+ripple*.015)*age*uWander;
    transformed+=vec3(aSeed.y-.5,aSeed.z-.5,aSeed.w-.5)*spread*uSpread*mix(.2,.38,uMotionEnergy);
    vLight=visible*age*(.11+.39*pow(aSeed.w,2.))*mix(.58,1.12,uMotionEnergy);
    float envelope=smoothstep(0.,.10,age)*(1.-smoothstep(.42,1.,age));
    vLight*=envelope;
    // Cull the complete sprite below the lowest wave trough, fading beforehand.
    // Evaluated AFTER skinning, so lifted fins/cursor poses cannot cross the water.
    vec3 oceanPosition=(uWhaleToOcean*vec4(transformed,1.)).xyz;
    float underwater=1.-smoothstep(uOceanCeilingY-uOceanFadeBand,uOceanCeilingY,oceanPosition.y);
    // A submerged particle behind the grid must not shine through it. Test its
    // camera ray at the near water edge as well as its own physical depth.
    if(uCameraOcean.z>uOceanZNear && oceanPosition.z<uOceanZNear){
     float edgeT=(uCameraOcean.z-uOceanZNear)/(uCameraOcean.z-oceanPosition.z);
     float edgeY=mix(uCameraOcean.y,oceanPosition.y,edgeT);
     // A narrow edge fade avoids erasing the wake well below the visible grid.
     underwater*=1.-smoothstep(uOceanEdgeCeilingY-.2,uOceanEdgeCeilingY,edgeY);
    }
    vLight*=mix(1.,underwater,uOceanClipEnabled);
    vec4 viewPosition=modelViewMatrix*vec4(transformed,1.);
    float distanceMist=max(whaleDepthMist(viewPosition.xyz,modelViewMatrix),1.-uEntranceReveal);
    vLight*=1.-distanceMist*.82;
    gl_Position=projectionMatrix*viewPosition;
    float pixels=.019*uViewportHeight*projectionMatrix[1][1]*length(modelViewMatrix[0].xyz)*uPointScale;
    if(isPerspectiveMatrix(projectionMatrix))pixels/=max(.001,-viewPosition.z);
    gl_PointSize=clamp(pixels*(.58+.6*aSeed.w)*visible*(1.+distanceMist*1.1),1.2*visible,10.);
   }`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity,uGlow;varying float vLight;
   void main(){float r2=dot(gl_PointCoord-.5,gl_PointCoord-.5);if(r2>.25||vLight<=0.)discard;
    float core=exp(-r2*36.);gl_FragColor=vec4(uColor*(1.4+uGlow*.6),core*vLight*uOpacity);}`,
 });
 const trail=new RiggedTrail(geometry,material,source);
 trail.applyConfig=(next={})=>{
  uniforms.uColor.value.set(next.color??"#38d4ff");
  uniforms.uOpacity.value=Math.max(0,next.alpha??.32)*2.875;
  uniforms.uGlow.value=Math.max(0,next.glow??3.4);
  uniforms.uParticleDensity.value=THREE.MathUtils.clamp((next.count??200)/count,0,1);
  uniforms.uPointScale.value=Math.max(0,next.pointScale??1.6)/1.6;
  uniforms.uTrailSpeed.value=Math.max(0,next.speed??.05);
  uniforms.uFlowX.value=next.flowX??.84;
  uniforms.uFlowY.value=next.flowY??.36;
  uniforms.uSpread.value=Math.max(0,next.spread??.18);
  uniforms.uWander.value=Math.max(0,next.wanderAmp??2.8)/2.8;
 };
 trail.setMotionActivity=(energy=0,direction=null)=>{
  uniforms.uMotionEnergy.value=THREE.MathUtils.clamp(energy,0,1);
  if(direction){
   const horizontal=Math.hypot(direction.x??1,direction.z??0);
   uniforms.uFlowTurn.value.set(
    Math.atan2(direction.z??0,direction.x??1),
    Math.atan2(direction.y??0,Math.max(1e-6,horizontal)),
   );
  }
 };
 trail.applyConfig(config);
 return trail;
}
