import * as THREE from "three";
import { withFogUniforms } from "../utils/shaderFogUniforms.js";

const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vFlow;
varying vec3 vNormal;
varying vec3 vView;
void main(){
 #include <beginnormal_vertex>
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 #include <defaultnormal_vertex>
 #include <begin_vertex>
 #include <skinning_vertex>
 vec4 mvPosition=modelViewMatrix*vec4(transformed,1.);
 vFlow=uv;vNormal=normalize(transformedNormal);vView=-mvPosition.xyz;
 gl_Position=projectionMatrix*mvPosition;
}`;

const fragmentShader = `
uniform float uTime;uniform float uOpacity;uniform float uGlow;
uniform float uDetail;uniform vec3 uColor;
varying vec2 vFlow;varying vec3 vNormal;varying vec3 vView;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 float facing=abs(dot(normalize(vNormal),normalize(vView)));
 float rim=pow(1.-facing,2.3);
 vec2 grid=vFlow*vec2(112.,48.);
 grid.y+=sin(vFlow.x*5.4+vFlow.y*6.283)*.32;
 float row=floor(grid.y+.5);
 grid.x+=hash(vec2(row,9.))*.45;
 vec2 d=abs(fract(grid+.5)-.5),aa=max(fwidth(grid)*.65,vec2(.018));
 float line=1.-smoothstep(.028,.028+aa.y,d.y);
 float dotCore=line*(1.-smoothstep(.065,.065+aa.x,d.x));
 float halo=exp(-d.y*15.)*exp(-d.x*8.);
 float seed=hash(floor(grid+.5));
 float drift=.5+.5*sin(vFlow.x*8.-uTime*.45+row*.31);
 float ribbon=pow(.5+.5*sin(vFlow.x*10.-uTime*.5+row*.87),10.);
 float glint=step(.984,seed)*pow(.5+.5*sin(uTime*.7+seed*20.),6.);
 float key=pow(max(0.,dot(normalize(vNormal),normalize(vec3(-.35,.7,.55)))),8.);
 float forehead=exp(-pow((vFlow.x-.15)/.24,2.))*pow(facing,3.);
 float field=(line*.003+dotCore*(.08+pow(seed,2.)*.92)+halo*.035);
 float light=field*(.4+rim*1.2+key*2.8+forehead*6.+drift*.12+ribbon*.7)+dotCore*glint*2.6+rim*.003;
 light=mix(light,.17+rim*.14,uDetail);
 float alpha=clamp(light*1.3,0.,.98);
 // Bound the HDR peak so small-screen dots do not merge into a solid bloom patch.
 float radiance=min(light*uGlow,5.5);
 // Preserve radiance in additive compositing instead of squaring fine-dot alpha.
 gl_FragColor=vec4(uColor*radiance/max(alpha,.0001),alpha*uOpacity);
}`;

/** The UVs and skin are prepared offline. Motion changes uniforms and bone matrices only. */
export function createMobileWhaleMaterials() {
 const shared=withFogUniforms({
  uTime:{value:0},uColor:{value:new THREE.Color("#0376ff")},
  uOpacity:{value:.9},uGlow:{value:2.8},
 });
 const create=detail=>new THREE.ShaderMaterial({
  uniforms:{...shared,uDetail:{value:detail}},vertexShader,fragmentShader,
  extensions:{derivatives:true},transparent:true,depthWrite:true,
  blending:THREE.AdditiveBlending,toneMapped:false,
 });
 const body=create(0),details=create(1);
 body.name="Mobile whale / flowing light";details.name="Mobile whale / fine contours";
 return {body,details,shared};
}

export function createMobileWhaleTrail(shared) {
 const driftingCount=72,count=driftingCount+2;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count),glows=new Float32Array(count);
 for(let i=0;i<driftingCount;i++){
  const s=i/(driftingCount-1),a=i*2.399963;
  positions.set([-3.7+s*8.1,.82+Math.sin(s*Math.PI)*.38+Math.sin(a)*.12,Math.cos(a)*(.3+s*.3)],i*3);
  seeds[i]=(i*.618034)%1;
 }
 // Two soft head glints provide a bounded glow even in the low tier, without an RT blur.
 positions.set([-4.25,.24,.43,-3.2,.72,.62],driftingCount*3);
 glows[driftingCount]=glows[driftingCount+1]=1;
 seeds[driftingCount]=.3;seeds[driftingCount+1]=.7;
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,1));
 geometry.setAttribute("aGlow",new THREE.BufferAttribute(glows,1));
 const material=new THREE.ShaderMaterial({
  uniforms:shared,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`uniform float uTime;attribute float aSeed;attribute float aGlow;varying float vLight;varying float vGlow;
   void main(){float p=fract(aSeed+uTime*.035);vec3 pos=position;
    pos.x+=p*.55*(1.-aGlow);pos.y+=p*p*.3*(1.-aGlow);vGlow=aGlow;
    vLight=mix(sin(p*3.141593)*(.3+aSeed*.3),.75+.15*sin(uTime*.7+aSeed*6.),aGlow);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);gl_PointSize=mix(1.4+aSeed*1.4,28.+aSeed*12.,aGlow);}`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying float vLight;varying float vGlow;
   void main(){float r=length(gl_PointCoord-.5);float core=1.-smoothstep(.05,.5,r);
    core=mix(core,.09*exp(-r*r*22.)+.7*exp(-r*r*500.),vGlow);
    gl_FragColor=vec4(uColor*2.6,core*vLight*uOpacity);}`,
 });
 const points=new THREE.Points(geometry,material);points.name="Mobile whale / sparse trail";
 points.frustumCulled=false;points.renderOrder=4;
 return points;
}
