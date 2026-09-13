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
 // glTF flips Blender's V. Restore the authored flow coordinates and regions.
 vFlow=vec2(uv.x,1.-uv.y);vNormal=normalize(transformedNormal);vView=-mvPosition.xyz;
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
 float region=floor(vFlow.y*.5+.001);
 vec2 flow=vec2(vFlow.x,vFlow.y-region*2.);
 float light;
 if(uDetail>.5){
  // Lip, eyelid and fin beads follow arc-length UVs baked into the animated skin.
  float along=flow.x*62.;
  float cell=floor(along),d=abs(fract(along)-.5);
  float aa=max(fwidth(along)*.55,.035);
  float bead=1.-smoothstep(.12,.30+aa,d);
  float sparkle=pow(hash(vec2(cell,region+2.)),5.);
  float travel=pow(.5+.5*sin(flow.x*6.-uTime*.6+region),12.);
  float strength=region<.5?.76:region<1.5?.22:region<2.5?.8:region<3.5?.34:.58;
  light=(bead*(.35+sparkle*.65)+.035)*strength*(.8+travel*.7);
 }else{
 vec2 density=region<.5?vec2(320.,100.):region<1.5?vec2(144.,26.):vec2(100.,22.);
 vec2 grid=flow*density;
 // Slightly stagger points along each streamline; never move the anatomy itself.
 grid.y+=sin(flow.x*6.+flow.y*6.283)*.16;
 float row=floor(grid.y+.5);
 grid.x+=hash(vec2(row,9.))*.7;
 vec2 pixelWidth=fwidth(grid);
 vec2 d=abs(fract(grid+.5)-.5),aa=max(pixelWidth*.55,vec2(.018));
 float line=1.-smoothstep(.025,.025+aa.y,d.y);
 float dotCore=line*(1.-smoothstep(.06,.06+aa.x,d.x));
 float halo=exp(-d.y*19.)*exp(-d.x*12.);
 float seed=hash(floor(grid+.5));
 float drift=.5+.5*sin(flow.x*8.-uTime*.35+row*.31);
 float ribbon=pow(.5+.5*sin(flow.x*11.-uTime*.5+row*.63),12.);
 float glint=step(.988,seed)*pow(.5+.5*sin(uTime*.7+seed*20.),8.);
 float key=pow(max(0.,dot(normalize(vNormal),normalize(vec3(-.4,.75,.55)))),5.);
 float latitude=asin(sin(flow.y*6.283185));
 float head=exp(-pow((flow.x-.17)/.22,2.));
 float brow=exp(-pow((latitude-.67)/.28,2.))*head;
 float throat=exp(-pow((latitude+.62)/.34,2.))*head;
 vec2 eyeDistance=vec2((flow.x-.26207)/.010,(latitude-.25)/.033);
 float socket=1.-.97*exp(-dot(eyeDistance,eyeDistance)*1.7);
 float contour=region<.5?(.35+head*1.1+brow*6.5+throat*2.4)*socket:
   .70+pow(abs(cos(flow.y*6.283185)),12.)*1.4;
 float rowStrength=.20+.8*pow(hash(vec2(row,4.)),1.8);
 float field=line*.0015+dotCore*(.10+pow(seed,2.)*.9)+halo*.02;
 // Preserve light energy when several beads fall inside a small-screen pixel.
 float coverage=max(.30,1./max(1.,pixelWidth.x*1.4)/max(1.,pixelWidth.y*1.4));
 light=(field*(contour+rim*.7+key*.65)*(rowStrength+drift*.08+ribbon*.7)+dotCore*glint*.9)*coverage+rim*.001;
 }
 float alpha=clamp(light*1.3,0.,.98);
 // Bound the HDR peak so small-screen dots do not merge into a solid bloom patch.
 float radiance=min(light*uGlow,3.2);
 // Preserve radiance in additive compositing instead of squaring fine-dot alpha.
 vec3 tint=mix(uColor,vec3(.12,.66,1.),smoothstep(.65,2.5,radiance)*.32);
 gl_FragColor=vec4(tint*radiance/max(alpha,.0001),alpha*uOpacity);
}`;

/** The UVs and skin are prepared offline. Motion changes uniforms and bone matrices only. */
export function createMobileWhaleMaterials() {
 const shared=withFogUniforms({
  uTime:{value:0},uColor:{value:new THREE.Color("#079eff")},
  uOpacity:{value:.9},uGlow:{value:2.8},uPointViewport:{value:900},
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

/** Transparent beads still need a solid depth silhouette, independent of triangle order. */
export function createWhaleDepthOccluder(source) {
 const depth=source.clone(false);
 depth.name="Whale / shared skin depth";
 depth.material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,toneMapped:false});
 depth.renderOrder=2;
 // SkinnedMesh.copy shares geometry, bones and bind matrices; there is no second rig.
 depth.frustumCulled=false;
 return depth;
}

export function createMobileWhaleTrail(shared) {
 const driftingCount=72,count=driftingCount+4;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count),glows=new Float32Array(count);
 for(let i=0;i<driftingCount;i++){
  const s=i/(driftingCount-1),a=i*2.399963;
  positions.set([-3.7+s*8.1,.82+Math.sin(s*Math.PI)*.38+Math.sin(a)*.12,Math.cos(a)*(.3+s*.3)],i*3);
  seeds[i]=(i*.618034)%1;
 }
 // Four restrained highlights sit above the head flow, including on low without bloom.
 positions.set([-4.40,.01,.60,-3.95,.30,.82,-3.40,.63,.90,-2.8,.99,.83],driftingCount*3);
 for(let i=0;i<4;i++){glows[driftingCount+i]=1;seeds[driftingCount+i]=.18+i*.19;}
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,1));
 geometry.setAttribute("aGlow",new THREE.BufferAttribute(glows,1));
 const material=new THREE.ShaderMaterial({
  uniforms:shared,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`uniform float uTime;uniform float uPointViewport;attribute float aSeed;attribute float aGlow;varying float vLight;varying float vGlow;
   void main(){float p=fract(aSeed+uTime*.035);vec3 pos=position;
    pos.x+=p*.55*(1.-aGlow);pos.y+=p*p*.3*(1.-aGlow);vGlow=aGlow;
    vLight=mix(sin(p*3.141593)*(.3+aSeed*.3),.75+.15*sin(uTime*.7+aSeed*6.),aGlow);
    vec4 viewPosition=modelViewMatrix*vec4(pos,1.);gl_Position=projectionMatrix*viewPosition;
    float projectedScale=projectionMatrix[1][1]*length(modelViewMatrix[0].xyz)/max(.01,-viewPosition.z);
    float glowSize=clamp(projectedScale*uPointViewport*(.14+aSeed*.04),4.,80.);
    gl_PointSize=mix(1.4+aSeed*1.4,glowSize,aGlow);}`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying float vLight;varying float vGlow;
   void main(){float r=length(gl_PointCoord-.5);float core=1.-smoothstep(.05,.5,r);
    core=mix(core,.18*exp(-r*r*28.)+1.3*exp(-r*r*650.),vGlow);
    gl_FragColor=vec4(mix(uColor,vec3(.16,.68,1.),vGlow*.6)*3.2,core*vLight*uOpacity);}`,
 });
 const points=new THREE.Points(geometry,material);points.name="Mobile whale / sparse trail";
 points.frustumCulled=false;points.renderOrder=5;
 const viewport=new THREE.Vector4();
 points.onBeforeRender=renderer=>{shared.uPointViewport.value=renderer.getCurrentViewport(viewport).w;};
 return points;
}
