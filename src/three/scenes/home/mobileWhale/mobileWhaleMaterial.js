import * as THREE from "three";
import { withFogUniforms } from "../utils/shaderFogUniforms.js";
import { applyParticleAppearance, readParticleAppearance, PARTICLE_LEVEL_COUNT } from "./particleAppearance.js";

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 _light;
attribute float _shell;
uniform float uTime, uViewportHeight, uSampleKeep, uTransmission;
uniform vec3 uFlowColors[${PARTICLE_LEVEL_COUNT}];
uniform vec4 uFlowLevels[${PARTICLE_LEVEL_COUNT}];
uniform vec3 uWakeColor;
uniform vec4 uWakeAppearance, uWakeMotion;
uniform vec2 uWakeDirection;
varying float vEnergy;
varying vec3 vColor;
varying float vBloom;
varying float vOpacity;
varying float vPixelFootprint;
void main(){
 #include <beginnormal_vertex>
 vec3 bindNormal=objectNormal;
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 #include <defaultnormal_vertex>
 #include <begin_vertex>
 float wake=step(.70,_light.w)*(1.-step(.80,_light.w));
 float surface=step(.20,_light.w)*(1.-step(.30,_light.w));
 float beadSeed=mix(fract(sin(dot(position,vec3(12.9898,78.233,37.719)))*43758.5453),_light.z,wake);
 // Category is constant along a connected filament. Source darkness is light,
 // not a hole in its geometry or a weaker particle category.
 int level=int(floor(clamp(_light.x,0.,1.)*${PARTICLE_LEVEL_COUNT - 1}.+.5));
 vec4 appearance=uFlowLevels[level];
 float brightness=appearance.x,pointScale=appearance.y;
 vColor=uFlowColors[level];
 vBloom=appearance.z;vOpacity=appearance.w;
 if(wake>.5){
  brightness=uWakeAppearance.x;pointScale=uWakeAppearance.y;
  vBloom=uWakeAppearance.z;vOpacity=uWakeAppearance.w;vColor=uWakeColor;
 }
 float motionTime=uTime*uWakeMotion.x;
 float age=fract(_light.z+motionTime*(.095+fract(_light.z*7.3)*.035));
 float life=1.;
 vec3 wakeOffset=vec3(0.);
 if(wake>.5){
  // Coherent curling streams detach from rigged silhouette anchors. Each
  // bead has its own lifetime; zero alpha conceals the return to its anchor.
  // The reference has one shared current, right/up across every edge.
  // Surface normals must not send belly/fin particles in the opposite direction.
  vec2 drift=uWakeDirection;
  vec2 crossFlow=vec2(-drift.y,drift.x);
  float curl=sin(age*7.5-position.x*2.2+motionTime*.22)*sin(age*3.141593);
  wakeOffset.xy=(drift*age*(.65+_light.z*.40)+crossFlow*curl*.16*uWakeMotion.z)*uWakeMotion.y;
  wakeOffset.z=sin(age*5.+position.x)*age*.14*uWakeMotion.z*uWakeMotion.y;
  life=smoothstep(0.,.07,age)*(1.-smoothstep(.42,1.,age));
 }else{
  // Only actual filament endpoints soften; interior unlit gaps stay whole.
  life=mix(.25,1.,_light.z);
  // Neighboring beads share the same smooth field, avoiding animated kinks.
  transformed += bindNormal * sin(uTime*.48 + position.x*1.7 + position.y*.8)*.003;
 }
 #include <skinning_vertex>
 // Anchor follows the rig; the water current keeps one direction across fins.
 transformed+=wakeOffset;
 vec4 mvPosition=modelViewMatrix*vec4(transformed,1.);
 vec3 n=normalize(transformedNormal);
 vec3 viewDirection=isPerspectiveMatrix(projectionMatrix)?normalize(-mvPosition.xyz):vec3(0.,0.,1.);
 float facing=dot(n,viewDirection);
 // Beads have no backfaces. In particular, the rim normal is tangent to the
 // reference view; culling it removes BOTH copies of a whole contour on yaw.
 // Select the authored shell hemisphere separately from its lighting normal.
 // This keeps silhouette chains continuous while the far-side copy stays dark.
 vec3 shellNormal=normalize(normalMatrix*vec3(0.,0.,_shell*2.-1.));
 float transmission=dot(shellNormal,viewDirection)>=0.?1.:uTransmission;
 // Light catches actual particles; no hand-placed stars or luminous cards.
 vec3 lightDirection=normalize(vec3(-.35+sin(uTime*.16)*.16,.65,1.));
 float key=pow(max(0.,dot(n,lightDirection)),3.);
 float specular=pow(max(0.,dot(n,normalize(lightDirection+viewDirection))),28.);
 float lightSweep=pow(.5+.5*sin(position.x*2.1+position.y*3.4-uTime*.24),14.);
 float rim=pow(1.-abs(facing),3.);
 float lineLight=.85+key*.25+_light.y*.25+lightSweep*(.2+rim*.6)+specular*pow(beadSeed,12.)*2.;
 // The quieter full-surface points reveal the actual rounded geometry via
 // directional light. Anatomical chains share it but retain stronger colour
 // and bloom; they do not need extra particles to become visible.
 float surfaceLight=(.24+pow(max(0.,dot(n,lightDirection)),1.2)*.95+rim*.12)*(.85+_light.y*.3);
 vEnergy=mix(lineLight,surfaceLight,surface)*transmission*life*brightness;
 float rank=fract(beadSeed*17.37+position.x*1.213);
 float keep=step(rank,uSampleKeep);
 if(wake>.5)keep*=1.-step(uWakeMotion.w,fract(_light.z*31.73));
 // Keep anatomical edges on every tier. Thinning is independent of size/light.
 if(_light.x>.50&&wake<.5)keep=1.;
 vEnergy*=keep;
 float beadScale=mix(.9,.74,wake)*(.95+beadSeed*.05);
 float projected=.018*beadScale*pointScale*length(modelViewMatrix[0].xyz)*uViewportHeight*projectionMatrix[1][1];
 if(isPerspectiveMatrix(projectionMatrix))projected/=max(.001,-mvPosition.z);
 gl_PointSize=clamp(projected,2.,18.);
 vPixelFootprint=1./gl_PointSize;
 gl_Position=projectionMatrix*mvPosition;
 if(keep<.5)gl_Position=vec4(2.,2.,2.,1.);
}`;

const fragmentShader = `
uniform vec3 uColor;uniform float uGlow,uOpacity;
varying float vEnergy;
varying vec3 vColor;
varying float vBloom;
varying float vOpacity;
varying float vPixelFootprint;
void main(){
 vec2 p=gl_PointCoord-.5;float r2=dot(p,p);
 if(r2>.25)discard;
 // Approximate the pixel integral of a Gaussian bead. Subpixel centers must
 // not disappear between pixels and look like random holes along the chain.
 float sharpness=105./(1.+105.*vPixelFootprint*vPixelFootprint/6.);
 float core=exp(-r2*sharpness)*(sharpness/105.);
 float halo=exp(-r2*21.)*.055*vBloom;
 float radiance=vEnergy*uGlow;
 vec3 tint=mix(vColor,min(vec3(1.),vColor*1.4+.04),smoothstep(.6,2.5,radiance)*.35);
 float energy=min(radiance,.9)+max(0.,radiance-.9)*vBloom;
 gl_FragColor=vec4(tint*min(energy,8.),(core+halo)*uOpacity*vOpacity);
}`;

/** One visible point draw, no opaque triangles or depth-only silhouette. */
export function createMobileWhaleMaterials() {
 const shared=withFogUniforms({
  uTime:{value:0},uColor:{value:new THREE.Color("#0088ff")},
  uOpacity:{value:1},uGlow:{value:3.4},uTransmission:{value:0},
  uFlowColors:{value:Array.from({length:PARTICLE_LEVEL_COUNT},()=>new THREE.Color())},
  uFlowLevels:{value:Array.from({length:PARTICLE_LEVEL_COUNT},()=>new THREE.Vector4())},
  uWakeColor:{value:new THREE.Color()},
  uWakeAppearance:{value:new THREE.Vector4()},uWakeMotion:{value:new THREE.Vector4()},
  uWakeDirection:{value:new THREE.Vector2()},
  uViewportHeight:{value:679},uSampleKeep:{value:1},
 });
 const body=new THREE.ShaderMaterial({uniforms:shared,vertexShader,fragmentShader,
  transparent:true,depthWrite:false,depthTest:true,
  blending:THREE.AdditiveBlending,toneMapped:false});
 body.name="Whale / anatomical 3D particles";
 applyParticleAppearance(body,readParticleAppearance());
 return {body,shared};
}
