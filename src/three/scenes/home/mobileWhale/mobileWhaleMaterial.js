import * as THREE from "three";
import { withFogUniforms } from "../utils/shaderFogUniforms.js";
import { smoothSinePhase } from "../heroCamera.js";
import { whaleDepthMistGLSL } from "./whaleComposition.js";
export { createMobileWhaleTrail } from "./mobileWhaleTrail.js";

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 _light;
	uniform float uTime,uViewportHeight,uParticleDensity,uParticleScale,uPointScale,uEntranceReveal;
uniform vec2 uCursorPosition;
uniform float uCursorStrength,uCursorAspect;
uniform vec2 uTouchPosition;
uniform vec3 uSonarPosition,uSonarNormal;
uniform float uTouchStrength,uSonarAge,uSonarStrength;
uniform vec3 uSonarPosition2,uSonarNormal2;
uniform float uSonarAge2,uSonarStrength2;
varying float vEnergy;
varying float vKey;
varying float vCursorLight;
varying float vSonarLight;
varying float vDepthMist;
${whaleDepthMistGLSL}
float whaleSonarLight(vec3 sourcePosition,vec3 sourceNormal,float age,float strength){
 if(strength<=.001||age>=2.4)return 0.;
 float bend=clamp(1.-dot(normalize(normal),sourceNormal),0.,2.);
 float surfaceDistance=length(position-sourcePosition)*(1.+bend*.275);
 float radius=age*4.2;
 float ring=(surfaceDistance-radius)/(.12+radius*.025);
 float envelope=smoothstep(0.,.10,age)*(1.-smoothstep(1.5,2.4,age));
 return exp(-ring*ring)*envelope*strength/(1.+radius*.08);
}
void main(){
 #include <beginnormal_vertex>
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 #include <defaultnormal_vertex>
 #include <begin_vertex>
 #include <skinning_vertex>
 vec4 viewPosition=modelViewMatrix*vec4(transformed,1.);
	vDepthMist=max(whaleDepthMist(viewPosition.xyz,modelViewMatrix),1.-uEntranceReveal);
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
 // Two prepared rings can overlap. A repeat tap starts immediately while the
 // previous ring continues, so neither radius nor source position jumps.
 vSonarLight=min(1.,whaleSonarLight(uSonarPosition,uSonarNormal,uSonarAge,uSonarStrength)
  +whaleSonarLight(uSonarPosition2,uSonarNormal2,uSonarAge2,uSonarStrength2));
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
uniform float uGlow,uOpacity;
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
	// Distance mist widens and softens the points; global visibility stays binary.
	gl_FragColor=vec4(tint*radiance,(core+halo)*uOpacity*transmission);
}`;

/** Actual skinned points; no surface texture, UV deformation or separate eye mesh. */
export function createMobileWhaleMaterials(){
const shared=withFogUniforms({
 uTime:{value:0},uColor:{value:new THREE.Color("#009fff")},
  uOpacity:{value:.92},uGlow:{value:3.4},uViewportHeight:{value:679},
  uParticleDensity:{value:1},uParticleScale:{value:1},uPointScale:{value:6},
  uModelOpacity:{value:0},uModelColor:{value:new THREE.Color("#0091ff")},uEntranceReveal:{value:1},
  uCursorPosition:{value:new THREE.Vector2()},uCursorStrength:{value:0},uCursorAspect:{value:1},
  uTouchPosition:{value:new THREE.Vector2()},uTouchStrength:{value:0},
  uSonarPosition:{value:new THREE.Vector3()},uSonarNormal:{value:new THREE.Vector3(0,0,1)},
  uSonarAge:{value:3},uSonarStrength:{value:0},
  uSonarPosition2:{value:new THREE.Vector3()},uSonarNormal2:{value:new THREE.Vector3(0,0,1)},
  uSonarAge2:{value:3},uSonarStrength2:{value:0},
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
  uniforms:{uModelOpacity:shared?.uModelOpacity??{value:0},uModelColor:shared?.uModelColor??{value:new THREE.Color("#0091ff")},
   uEntranceReveal:shared?.uEntranceReveal??{value:1}},
  vertexShader:`
   #include <common>
   #include <skinning_pars_vertex>
   uniform float uEntranceReveal;
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
    vDepthMist=max(whaleDepthMist(mvPosition.xyz,modelViewMatrix),1.-uEntranceReveal);
   }`,
  fragmentShader:`
   uniform vec3 uModelColor;
   uniform float uModelOpacity,uEntranceReveal;
   varying vec3 vSkinNormal;
   varying float vDepthMist;
   void main(){
    vec3 n=normalize(vSkinNormal);
    float key=max(0.,dot(n,normalize(vec3(-.4,.65,1.))));
    float rim=pow(1.-abs(n.z),3.);
    float transmission=1.-vDepthMist*.94;
    // Skin opacity is continuous; entrance depth changes light without overriding it.
    gl_FragColor=vec4(uModelColor*(.16+.55*key+.12*rim)*transmission,uModelOpacity);
   }`,
  transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
 });
 depth.material.polygonOffset=true;depth.material.polygonOffsetFactor=1;depth.material.polygonOffsetUnits=1;
 depth.renderOrder=2;depth.frustumCulled=false;
 // A partially transparent skin must keep the prepared particles visible through it.
 // Only a fully opaque skin writes depth; changing this state never recompiles the shader.
 depth.onBeforeRender=()=>{
  const u=depth.material.uniforms;
  depth.material.depthWrite=u.uModelOpacity.value>=.999;
 };
 return depth;
}

/** Shared uniforms reach the prepared points and solid skin, including live edits. */
export function applyMobileWhaleVisuals(material,config,tier,elapsed=0){
 const u=material.uniforms;
 u.uPointScale.value=Math.max(0,config.pointScale??6);
 u.uParticleScale.value=Math.max(0,config.particleScale??1);
  u.uParticleDensity.value=THREE.MathUtils.clamp(config.particleDensity??1,0,1);
  u.uOpacity.value=(config.opacity??1)>=.5?1:0;
  u.uModelOpacity.value=THREE.MathUtils.clamp(config.modelOpacity??0,0,1);
 u.uColor.value.set(config.colorTint??"#0f93cc");
 u.uModelColor.value.set(config.modelColor??"#0091ff");
 const base=config.emissiveIntensity??3.05;
 const speed=config.glowPulse?.speed??0;
 const pulse=speed>0?.5+.5*smoothSinePhase(elapsed*speed*Math.PI*2,config.glowPulse?.smooth??.7):0;
 const glow=THREE.MathUtils.lerp(base,config.glowPulse?.max??base,pulse);
 u.uGlow.value=Math.max(0,glow)*(tier==="medium"?2.1:tier==="high"?3.4:4.2)/3.05;
}
