import * as THREE from "three";
import { withFogUniforms } from "../utils/shaderFogUniforms.js";
import { smoothSinePhase } from "../heroCamera.js";
import { whaleDepthMistGLSL } from "./whaleComposition.js";
export { createMobileWhaleTrail } from "./mobileWhaleTrail.js";

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 _light;
uniform float uTime,uViewportHeight,uParticleDensity,uParticleScale,uPointScale;
uniform vec2 uCursorPosition;
uniform float uCursorStrength,uCursorAspect;
uniform vec2 uTouchPosition,uSonarPosition;
uniform float uTouchStrength,uSonarAge,uSonarStrength;
varying float vEnergy;
varying float vKey;
varying float vCursorLight;
varying float vSonarLight;
varying float vDepthMist;
${whaleDepthMistGLSL}
void main(){
 #include <beginnormal_vertex>
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 #include <defaultnormal_vertex>
 #include <begin_vertex>
 #include <skinning_vertex>
 vec4 viewPosition=modelViewMatrix*vec4(transformed,1.);
 vDepthMist=whaleDepthMist(viewPosition.xyz,modelViewMatrix);
 vec3 n=normalize(transformedNormal);
 vec3 viewDirection=isPerspectiveMatrix(projectionMatrix)?normalize(-viewPosition.xyz):vec3(0.,0.,1.);
 vec3 keyDirection=normalize(vec3(-.38+sin(uTime*.16)*.13,.65,1.));
 float key=pow(max(0.,dot(n,keyDirection)),3.);
 float roughness=24.+32.*_light.z;
 float specular=pow(max(0.,dot(n,normalize(keyDirection+viewDirection))),roughness);
 float sweep=pow(.5+.5*sin(position.x*2.3+position.y*3.1-uTime*.34),9.);
 float rim=pow(1.-abs(dot(n,viewDirection)),3.);
 float visible = step(_light.z, uParticleDensity);
 // Every current keeps its path and UV-less geometry. Density only hides repeated beads.
 vKey=key*.4+specular*sweep;
 float grain=.62+.38*_light.z;
 vEnergy=visible*_light.x*2.*grain*(.72+key*.3+sweep*.5+specular*sweep*(.7+2.1*pow(_light.z,5.))+rim*.18);
 // Major currents catch stronger light without adding parallel rows of points.
 vEnergy*=mix(1.,1.45,step(.49,_light.w));
 // The authored sprite calibration corresponds to the existing pointScale=6.
 float projected=.028*_light.y*(uPointScale/6.)*uParticleScale*length(modelViewMatrix[0].xyz)*uViewportHeight*projectionMatrix[1][1];
 if(isPerspectiveMatrix(projectionMatrix))projected/=max(.001,-viewPosition.z);
 // Keep subpixel controls responsive instead of flooring every small bead to 2px.
 vEnergy*=min(projected*projected,1.);
 gl_PointSize=clamp(projected,1.,64.)*(1.+vDepthMist*1.25);
 gl_Position=projectionMatrix*viewPosition;
 vec2 screen=gl_Position.xy/max(.001,gl_Position.w);
 vSonarLight=0.;
 if(uSonarStrength>.001 && uSonarAge<2.4){
  vec2 delta=screen-uSonarPosition;delta.x*=uCursorAspect;
  float ring=(length(delta)-uSonarAge*.7)/.025;
  float envelope=smoothstep(0.,.10,uSonarAge)*(1.-smoothstep(1.5,2.4,uSonarAge));
  vSonarLight=exp(-ring*ring)*envelope*uSonarStrength;
 }
 // A circular screen-space pool follows the pointer on visible surface beads.
 // Radius is relative to viewport height, independent of scene/output DPR.
 vCursorLight=0.;
 // Stroking adds only light. Keep the skin, particle positions and silhouette intact.
 if(uTouchStrength>.001 && gl_Position.w>0.){
  vec2 touchDelta=screen-uTouchPosition;touchDelta.x*=uCursorAspect;
  vCursorLight=(1.-smoothstep(0.,.28,length(touchDelta)))*uTouchStrength;
 }
 if(uCursorStrength>.001 && gl_Position.w>0.){
  vec2 cursorDelta=gl_Position.xy/gl_Position.w-uCursorPosition;
  cursorDelta.x*=uCursorAspect;
  vCursorLight=max(vCursorLight,(1.-smoothstep(0.,.28,length(cursorDelta)))*uCursorStrength);
 }
}`;

const fragmentShader = `
uniform vec3 uColor;
uniform float uGlow,uOpacity,uEntranceReveal;
varying float vEnergy;
varying float vKey;
varying float vCursorLight;
varying float vSonarLight;
varying float vDepthMist;
void main(){
 vec2 p=gl_PointCoord-.5;float radius2=dot(p,p);
 if(radius2>.25)discard;
 float core=exp(-radius2*64.);
 float halo=exp(-radius2*24.)*.035;
 vec3 tint=mix(uColor,vec3(.09,.72,1.),clamp(vKey,0.,.8));
 tint=mix(tint,vec3(.09,.72,1.),vCursorLight*.45);
 tint=mix(tint,vec3(.22,.85,1.),vSonarLight*.75);
 // A soft HDR shoulder keeps glow controls responsive above the old hard clip.
 // Radiance still approaches the same ceiling, without a sudden white flood.
 float energy=vEnergy*uGlow*(1.+vCursorLight*.4+vSonarLight*1.3);
 float radiance=6.*energy/(6.+energy);
 float spread=1.+vDepthMist*1.25;
 float transmission=(1.-vDepthMist*.94)/(spread*spread);
 gl_FragColor=vec4(tint*radiance,(core+halo)*uOpacity*uEntranceReveal*transmission);
}`;

/** Actual skinned points; no surface texture, UV deformation or separate eye mesh. */
export function createMobileWhaleMaterials(){
const shared=withFogUniforms({
 uTime:{value:0},uColor:{value:new THREE.Color("#009fff")},
  uOpacity:{value:.92},uGlow:{value:3.4},uViewportHeight:{value:679},
  uParticleDensity:{value:1},uParticleScale:{value:1},uPointScale:{value:6},
  uModelOpacity:{value:0},uEntranceReveal:{value:1},
  uCursorPosition:{value:new THREE.Vector2()},uCursorStrength:{value:0},uCursorAspect:{value:1},
  uTouchPosition:{value:new THREE.Vector2()},uTouchStrength:{value:0},
  uSonarPosition:{value:new THREE.Vector2()},uSonarAge:{value:3},uSonarStrength:{value:0},
 });
 const body=new THREE.ShaderMaterial({uniforms:shared,vertexShader,fragmentShader,
  transparent:true,depthWrite:false,depthTest:true,
  blending:THREE.AdditiveBlending,toneMapped:false});
 body.name="Whale / continuous surface particles";
 return {body,shared};
}

/** Transparent skin must not hide rear particles through an invisible depth mask. */
export function createWhaleDepthOccluder(source,shared){
 const depth=source.clone(false);
 depth.name="Whale / surface and shared skin depth";
 depth.material=new THREE.ShaderMaterial({
  uniforms:{uModelOpacity:shared?.uModelOpacity??{value:0},uColor:shared?.uColor??{value:new THREE.Color("#0f93cc")},
   uEntranceReveal:shared?.uEntranceReveal??{value:1}},
  vertexShader:`
   #include <common>
   #include <skinning_pars_vertex>
   varying vec3 vSkinNormal;
   varying float vDepthMist;
   ${whaleDepthMistGLSL}
   void main(){
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    vSkinNormal=normalize(transformedNormal);
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vDepthMist=whaleDepthMist(mvPosition.xyz,modelViewMatrix);
   }`,
  fragmentShader:`
   uniform vec3 uColor;
   uniform float uModelOpacity,uEntranceReveal;
   varying vec3 vSkinNormal;
   varying float vDepthMist;
   void main(){
    vec3 n=normalize(vSkinNormal);
    float key=max(0.,dot(n,normalize(vec3(-.4,.65,1.))));
    float rim=pow(1.-abs(n.z),3.);
    gl_FragColor=vec4(uColor*(.16+.55*key)+vec3(.02,.06,.08)*rim,uModelOpacity*uEntranceReveal*(1.-vDepthMist*.94));
   }`,
  transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
 });
 depth.material.polygonOffset=true;depth.material.polygonOffsetFactor=1;depth.material.polygonOffsetUnits=1;
 depth.renderOrder=2;depth.frustumCulled=false;
 // Read shared live controls at draw time, including the entrance fade.
 // Depth writes are a render state change; no new material/program is needed.
 depth.onBeforeRender=()=>{
  const u=depth.material.uniforms;
  depth.material.depthWrite=u.uModelOpacity.value*u.uEntranceReveal.value>=1;
 };
 return depth;
}

/** Shared uniforms reach the prepared points and solid skin, including live edits. */
export function applyMobileWhaleVisuals(material,config,tier,elapsed=0){
 const u=material.uniforms;
 u.uPointScale.value=Math.max(0,config.pointScale??6);
 u.uParticleScale.value=Math.max(0,config.particleScale??1);
 u.uParticleDensity.value=THREE.MathUtils.clamp(config.particleDensity??1,0,1);
 u.uOpacity.value=THREE.MathUtils.clamp(config.opacity??1,0,1);
 u.uModelOpacity.value=THREE.MathUtils.clamp(config.modelOpacity??0,0,1);
 u.uColor.value.set(config.colorTint??"#0f93cc");
 const base=config.emissiveIntensity??3.05;
 const speed=config.glowPulse?.speed??0;
 const pulse=speed>0?.5+.5*smoothSinePhase(elapsed*speed*Math.PI*2,config.glowPulse?.smooth??.7):0;
 const glow=THREE.MathUtils.lerp(base,config.glowPulse?.max??base,pulse);
 u.uGlow.value=Math.max(0,glow)*(tier==="medium"?2.1:tier==="high"?3.4:4.2)/3.05;
}
