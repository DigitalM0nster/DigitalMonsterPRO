import * as THREE from "three";
import { withFogUniforms } from "../utils/shaderFogUniforms.js";
export { createMobileWhaleTrail } from "./mobileWhaleTrail.js";

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 _light;
uniform float uTime,uViewportHeight,uParticleDensity,uParticleScale;
varying float vEnergy;
varying float vKey;
void main(){
 #include <beginnormal_vertex>
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 #include <defaultnormal_vertex>
 #include <begin_vertex>
 #include <skinning_vertex>
 vec4 viewPosition=modelViewMatrix*vec4(transformed,1.);
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
 float projected=.028*_light.y*uParticleScale*length(modelViewMatrix[0].xyz)*uViewportHeight*projectionMatrix[1][1];
 if(isPerspectiveMatrix(projectionMatrix))projected/=max(.001,-viewPosition.z);
 gl_PointSize=clamp(projected*visible,2.,15.);
 gl_Position=projectionMatrix*viewPosition;
}`;

const fragmentShader = `
uniform vec3 uColor;
uniform float uGlow,uOpacity;
varying float vEnergy;
varying float vKey;
void main(){
 vec2 p=gl_PointCoord-.5;float radius2=dot(p,p);
 if(radius2>.25)discard;
 float core=exp(-radius2*64.);
 float halo=exp(-radius2*24.)*.035;
 vec3 tint=mix(uColor,vec3(.09,.72,1.),clamp(vKey,0.,.8));
 gl_FragColor=vec4(tint*min(vEnergy*uGlow,6.),(core+halo)*uOpacity);
}`;

/** Actual skinned points; no surface texture, UV deformation or separate eye mesh. */
export function createMobileWhaleMaterials(){
const shared=withFogUniforms({
 uTime:{value:0},uColor:{value:new THREE.Color("#009fff")},
  uOpacity:{value:.92},uGlow:{value:3.4},uViewportHeight:{value:679},
  uParticleDensity:{value:1},uParticleScale:{value:1},
 });
 const body=new THREE.ShaderMaterial({uniforms:shared,vertexShader,fragmentShader,
  transparent:true,depthWrite:false,depthTest:true,
  blending:THREE.AdditiveBlending,toneMapped:false});
 body.name="Whale / continuous surface particles";
 return {body,shared};
}

/** A single prepared skin hides the far side without painting any opaque colour. */
export function createWhaleDepthOccluder(source){
 const depth=source.clone(false);
 depth.name="Whale / shared skin depth";
 depth.material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,toneMapped:false});
 depth.material.polygonOffset=true;depth.material.polygonOffsetFactor=1;depth.material.polygonOffsetUnits=1;
 depth.renderOrder=2;depth.frustumCulled=false;
 return depth;
}
