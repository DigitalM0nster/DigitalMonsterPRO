import * as THREE from "three";
import { whaleDepthMistGLSL } from "./whaleComposition.js";
import { oceanFrontEdgeGlsl } from "../shaders/oceanFrontEdge.glsl.js";

// One prepared point draw. Anchors live in creature space, but deliberately do
// not inherit fin/tail bones: the detached spray must never steer with a flap.
class WhaleTrail extends THREE.Points {
 constructor(geometry,material,source){
  super(geometry,material);
  if(source){
   this.position.copy(source.position);this.quaternion.copy(source.quaternion);this.scale.copy(source.scale);
  }
  const viewport=new THREE.Vector4();
  const inverseOcean=new THREE.Matrix4();
  this.onBeforeRender=(renderer,scene,camera)=>{
   renderer.getCurrentViewport(viewport);material.uniforms.uViewportHeight.value=viewport.w;
   const u=material.uniforms,surface=this.oceanSurface;
   u.uOceanClipEnabled.value=surface?.visible?1:0;
   if(surface?.visible){
    surface.updateWorldMatrix(true,false);
    inverseOcean.copy(surface.matrixWorld).invert();
    u.uWhaleToOcean.value.multiplyMatrices(inverseOcean,this.matrixWorld);
    u.uOceanToWorld.value.copy(surface.matrixWorld);
    u.uCameraOcean.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverseOcean);
   }
  };
  this.frustumCulled=false;this.renderOrder=5;this.name="Whale / independent wave trails";
 }
 setOceanSurface(surface,zNear){
  this.oceanSurface=surface;
  this.material.uniforms.uOceanZNear.value=zNear;
 }
}

export function createMobileWhaleTrail(shared,source,emitters=[],config={}){
 // Prepare the maximum once; the dev count control only changes GPU visibility.
 const perStream=48,anchors=emitters.slice(0,40),count=anchors.length*perStream;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
 const originOffsets=new Float32Array(count*3);
 let randomState=74621;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 anchors.forEach((anchor,stream)=>{
  for(let i=0;i<perStream;i++){
   const index=stream*perStream+i;
   positions.set(anchor.position,index*3);
   const seedY=random(),seedZ=random(),seedW=random();
   seeds.set([(i+random())/perStream,seedY,seedZ,seedW],index*4);
   // Each prepared stream owns a small emission patch around its real surface
   // anchor. The vector is shared; the spray no longer erupts from one pixel.
   originOffsets.set([(seedY-.5)*2,(seedZ-.5)*1.25,(seedW-.5)*1.7],index*3);
  }
 });
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,4));
 geometry.setAttribute("aOriginOffset",new THREE.BufferAttribute(originOffsets,3));
 const uniforms={
  uTime:shared.uTime,
  uEntranceReveal:shared.uEntranceReveal,
  uViewportHeight:{value:679},
  uOceanClipEnabled:{value:0},uOceanZNear:{value:22},
  uWhaleToOcean:{value:new THREE.Matrix4()},uOceanToWorld:{value:new THREE.Matrix4()},
  uCameraOcean:{value:new THREE.Vector3()},
  uColor:{value:new THREE.Color(config.color??"#38d4ff")},
  uOpacity:{value:1},uGlow:{value:3.4},uParticleDensity:{value:.5},uPointScale:{value:1},
  uTrailSpeed:{value:.05},uFlowX:{value:.84},uFlowY:{value:.36},uSpread:{value:.64},uWander:{value:1},
 };
 const material=new THREE.ShaderMaterial({
  uniforms,transparent:true,depthWrite:false,
  blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`
   #include <common>
   uniform float uTime,uViewportHeight,uParticleDensity,uPointScale,uTrailSpeed,uFlowX,uFlowY,uSpread,uWander;
   uniform float uOceanClipEnabled,uOceanZNear;
   uniform mat4 uWhaleToOcean,uOceanToWorld;
   uniform vec3 uCameraOcean;
   attribute vec4 aSeed;
   attribute vec3 aOriginOffset;
   varying float vLight;
   ${whaleDepthMistGLSL}
   ${oceanFrontEdgeGlsl}
   void main(){
    float visible=step(aSeed.y,uParticleDensity);
    #include <begin_vertex>
    float sourceRadius=.025+min(uSpread,2.)*.018;
    transformed+=aOriginOffset*sourceRadius;
    // Source patches and all later displacement remain in stable creature
    // space. Only the creature root transform moves this whole prepared draw.
    float age=fract(aSeed.x+uTime*(uTrailSpeed*2.4+aSeed.y*uTrailSpeed));
    float phase=position.x*3.7+position.y*2.3+uTime*.17;
    float curl=sin(age*7.5+phase)-sin(phase);
    float ripple=sin(age*16.+phase*1.3+aSeed.z*1.7)-sin(phase*1.3+aSeed.z*1.7);
    float spread=age*age;
    // Original independent spray: the cursor and the whale's turn never alter
    // its directions, speed, density or brightness.
    transformed+=vec3(
     age*(uFlowX+aSeed.y*abs(uFlowX)*.75),
     age*(uFlowY+aSeed.z*max(abs(uFlowY),.12)*.7),
     0.
    );
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
    // Mask only at the visible foreground contour, using the ocean's own
    // height curve. No broad depth ceiling that erases body emission sites.
    vec3 oceanPosition=(uWhaleToOcean*vec4(transformed,1.)).xyz;
    if(uOceanClipEnabled>.5 && uCameraOcean.z>uOceanZNear && oceanPosition.z<uCameraOcean.z-.001){
     float edgeT=(uCameraOcean.z-uOceanZNear)/(uCameraOcean.z-oceanPosition.z);
     vec3 edge=mix(uCameraOcean,oceanPosition,edgeT);
     float worldX=(uOceanToWorld*vec4(edge.x,0.,uOceanZNear,1.)).x;
     float ceiling=oceanFrontHeight(worldX)-.08;
     float underwater=1.-smoothstep(ceiling-.22,ceiling,edge.y);
     vLight*=underwater;
     gl_PointSize*=underwater;
    }
   }`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity,uGlow,uEntranceReveal;varying float vLight;
   void main(){float r2=dot(gl_PointCoord-.5,gl_PointCoord-.5);if(r2>.25)discard;
    float core=exp(-r2*36.);gl_FragColor=vec4(uColor*(1.4+uGlow*.6),core*vLight*uOpacity*uEntranceReveal);}`,
 });
 const trail=new WhaleTrail(geometry,material,source);
 trail.applyConfig=(next={})=>{
  uniforms.uColor.value.set(next.color??"#38d4ff");
  uniforms.uOpacity.value=Math.max(0,next.alpha??.32)*2.875;
  uniforms.uGlow.value=Math.max(0,next.glow??3.4);
  uniforms.uParticleDensity.value=THREE.MathUtils.clamp((next.count??200)/count,0,1);
  uniforms.uPointScale.value=Math.max(0,next.pointScale??1.6)/1.6;
  uniforms.uTrailSpeed.value=Math.max(0,next.speed??.05);
  uniforms.uFlowX.value=next.flowX??.84;
  uniforms.uFlowY.value=next.flowY??.36;
  // Preserve the current panel's numeric range while restoring the old fan.
  uniforms.uSpread.value=Math.max(0,next.spread??.18)*.34;
  uniforms.uWander.value=Math.max(0,next.wanderAmp??2.8)/2.8;
 };
 trail.applyConfig(config);
 return trail;
}
