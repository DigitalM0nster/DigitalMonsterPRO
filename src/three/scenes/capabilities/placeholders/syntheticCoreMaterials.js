import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function createReactorEnvironment(renderer) {
 const room = new RoomEnvironment(renderer), generator = new THREE.PMREMGenerator(renderer);
 try { const target = generator.fromScene(room, 0.045); target.texture.name = "SyntheticCoreReflections"; return target; }
 finally { room.dispose(); generator.dispose(); }
}
export function createReactorMetal(color, roughness = 0.3) {
 return new THREE.MeshStandardMaterial({ color, roughness, metalness: 1, envMapIntensity: 1.0, fog: false });
}
const additive = { transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false };

export function createEnergyFlowMaterial() {
 return new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uInteraction:{value:0},uBurst:{value:0},uDeform:{value:0}},
  vertexShader:`varying vec2 vUv;uniform float uTime;uniform float uDeform;void main(){vUv=uv;vec3 p=position;p.y+=sin(p.x*3.2+uTime*0.8)*sin(uv.x*3.14159)*uDeform;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
  fragmentShader:`
   varying vec2 vUv; uniform float uTime; uniform float uInteraction; uniform float uBurst;
   void main(){
    float phase=fract(vUv.x*2.0-uTime*0.085);
    float head=exp(-pow((phase-0.8)*35.0,2.0));
    float tail=exp(-fract(0.8-phase)*15.0);
    vec3 color=vec3(0.055,0.36,0.57)*(0.45+tail);
    color+=vec3(0.6,1.7,2.2)*head*(1.0+uInteraction+uBurst*2.0);
    gl_FragColor=vec4(color,0.75);
   }`, ...additive,
 });
}
export function createCoreLensMaterial() {
 return new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uInteraction:{value:0},uBurst:{value:0},uFocus:{value:0},uProbe:{value:0},uHoverPoint:{value:new THREE.Vector3(0,0,1)}},
  vertexShader:`varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
   void main(){vNormal=normalize(normalMatrix*normal);vLocal=position;vec4 p=modelViewMatrix*vec4(position,1.0);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`
   varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
   uniform float uTime; uniform float uInteraction; uniform float uBurst;
   uniform float uFocus; uniform float uProbe; uniform vec3 uHoverPoint;
   void main(){
    float facing=max(0.0,dot(normalize(vNormal),normalize(vView)));
    float rim=pow(1.0-facing,3.5);
    float latitude=abs(sin(vLocal.y*92.0));
    float scan=pow(max(0.0,sin(vLocal.y*4.0-uTime*0.7)),18.0);
    float dots=step(0.93,sin(atan(vLocal.z,vLocal.x)*75.0))*step(0.91,latitude);
    vec3 color=vec3(0.005,0.019,0.028)+vec3(0.08,0.8,1.25)*rim*2.3;
    color+=vec3(0.15,0.8,1.1)*dots*(0.18+scan*1.8);
    color+=vec3(0.12,0.45,0.65)*rim*(uInteraction+uBurst*2.0);
    // Surface light invites interaction while the lens stays rigidly inside its bezel.
    float cycle=mod(uTime+1.0,5.4);
    float invitation=exp(-pow((sqrt(max(0.0,1.0-facing*facing))-cycle*0.68)*14.0,2.0))
     *(1.0-smoothstep(1.2,1.8,cycle))*(1.0-uFocus*0.7);
    float contact=pow(max(0.0,dot(normalize(vLocal),uHoverPoint)),18.0)*uFocus;
    float breath=pow(0.5+0.5*sin(uTime*1.6),4.0);
    color+=vec3(0.035,0.38,0.62)*invitation*(0.35+dots*1.5);
    color+=vec3(0.025,0.32,0.53)*contact*(0.55+scan+dots*2.8);
    color+=vec3(0.06,0.58,0.90)*(rim*(uFocus*1.35+breath*0.22)+uProbe*(0.18+rim+dots));
    gl_FragColor=vec4(color,1.0);
   }`,toneMapped:false,
 });
}
export function createFieldParticlesMaterial() {
 return new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0}},
  vertexShader:`attribute float aSeed; uniform float uTime; varying float vSeed;
   void main(){vSeed=aSeed;vec3 p=position;p.y+=sin(uTime*0.13+aSeed*39.0)*0.10;p.x+=cos(uTime*0.08+aSeed*22.0)*0.08;
    float angle=sin(uTime*0.08+aSeed*12.0)*0.045;
    p.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xy;
    vec4 mv=modelViewMatrix*vec4(p,1.0);gl_PointSize=clamp((70.0+aSeed*170.0)/max(1.0,-mv.z),2.5,16.0);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`varying float vSeed; void main(){float r=length(gl_PointCoord-0.5);if(r>0.5)discard;
   float alpha=exp(-r*r*26.0)*(0.35+vSeed*0.6);vec3 color=mix(vec3(0.13,0.65,0.88),vec3(0.6,1.15,1.4),pow(vSeed,8.0));gl_FragColor=vec4(color,alpha);}`,
  ...additive,
 });
}
