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
 if(uDetail>.5&&region>4.5&&region<5.5){
  vec2 p=flow-.5;
  float r2=dot(p,p);
  float core=6.*exp(-r2*1100.);
  float halo=.26*exp(-p.x*p.x*12.-p.y*p.y*100.);
  float star=1.25*exp(-abs(p.x+p.y*.4)*170.-abs(p.y)*14.)
   +.65*exp(-abs(p.y-p.x*.4)*160.-abs(p.x)*20.);
  float edge=1.-smoothstep(.30,.50,sqrt(r2));
  light=(core+halo+star)*edge*(.88+.12*sin(uTime*.8+vFlow.x*5.));
 }else if(uDetail>.5){
  // Lip, eyelid and fin beads follow arc-length UVs baked into the animated skin.
  float along=flow.x*62.;
  float cell=floor(along),d=abs(fract(along)-.5);
  float aa=max(fwidth(along)*.55,.035);
  float bead=1.-smoothstep(.12,.30+aa,d);
  float sparkle=pow(hash(vec2(cell,region+2.)),5.);
  float travel=pow(.5+.5*sin(flow.x*6.-uTime*.6+region),12.);
  float strength=region<.5?1.1:region<1.5?.22:region<2.5?1.2:region<3.5?.55:region<4.5?.68:.14;
  light=(bead*(.35+sparkle*.65)+.035)*strength*(.8+travel*.7);
 }else{
 vec2 density=region<.5?vec2(260.,112.):region<1.5?vec2(110.,38.):vec2(104.,38.);
 vec2 grid=flow*density;
 float q=sin(flow.y*6.283185);
 float underJaw=clamp((-q-.30)/.70,0.,1.);
 if(region<.5)grid.x+=7.*sin(underJaw*3.141593)*sin(flow.x*5.+.6);
 // Slightly stagger points along each streamline; never move the anatomy itself.
 grid.y+=sin(flow.x*6.+flow.y*6.283)*.16;
 float row=floor(grid.y+.5);
 grid.x+=hash(vec2(row,9.))*.7;
 vec2 pixelWidth=fwidth(grid);
 vec2 d=abs(fract(grid+.5)-.5),aa=max(pixelWidth*.55,vec2(.018));
 float line=1.-smoothstep(.025,.025+aa.y,d.y);
 float dotCore=line*(1.-smoothstep(.06,.06+aa.x,d.x));
 float jaw=region<.5?1.-smoothstep(-.35,-.27,q):0.;
 float jawLine=1.-smoothstep(.022,.022+aa.x,d.x);
 line=mix(line,jawLine,jaw);
 float halo=exp(-d.y*19.)*exp(-d.x*12.);
 float seed=hash(floor(grid+.5));
 float drift=.5+.5*sin(flow.x*8.-uTime*.35+row*.31);
 float ribbon=pow(.5+.5*sin(flow.x*11.-uTime*.5+row*.63),12.);
 float glint=step(.988,seed)*pow(.5+.5*sin(uTime*.7+seed*20.),8.);
 float key=pow(max(0.,dot(normalize(vNormal),normalize(vec3(-.4,.75,.55)))),5.);
 float head=exp(-pow((flow.x-.30)/.34,2.));
 float brow=exp(-pow((q-.86)/.16,2.))*head;
 float throat=jaw*head;
 vec2 eyeDistance=vec2((flow.x-.356)/.037,(q-.32)/.070);
 float socket=1.-.97*exp(-dot(eyeDistance,eyeDistance)*1.7);
 float shoulder=exp(-pow((flow.x-.67)/.17,2.));
 float contour=region<.5?(.62+head*.48+brow*4.2+throat*2.3+shoulder*1.85)*socket:
   1.0+pow(abs(cos(flow.y*6.283185)),12.)*2.1;
 float rowStrength=.14+.86*pow(hash(vec2(row,4.)),2.5);
 float field=line*(.003+ribbon*.008)+dotCore*(.13+pow(seed,2.)*.87)+halo*.024;
 // Preserve light energy when several beads fall inside a small-screen pixel.
 float coverage=max(.30,1./max(1.,pixelWidth.x*1.4)/max(1.,pixelWidth.y*1.4));
 light=(field*(contour+rim*.7+key*.65)*(rowStrength+drift*.08+ribbon*.7)+dotCore*glint*.9)*coverage+rim*.001;
 }
 float alpha=clamp(light*1.3,0.,.98);
 // Bound the HDR peak so small-screen dots do not merge into a solid bloom patch.
 float radiance=min(light*uGlow,uDetail>.5&&region>4.5&&region<5.5?8.:3.2);
 // Preserve radiance in additive compositing instead of squaring fine-dot alpha.
 vec3 tint=mix(uColor,vec3(.04,.54,1.),smoothstep(.65,5.,radiance)*.50);
 gl_FragColor=vec4(tint*radiance/max(alpha,.0001),alpha*uOpacity);
}`;

/** The UVs and skin are prepared offline. Motion changes uniforms and bone matrices only. */
export function createMobileWhaleMaterials() {
 const shared=withFogUniforms({
  uTime:{value:0},uColor:{value:new THREE.Color("#0084ff")},
  uOpacity:{value:.9},uGlow:{value:2.8},
 });
 const create=detail=>new THREE.ShaderMaterial({
  uniforms:{...shared,uDetail:{value:detail}},vertexShader,fragmentShader,
  extensions:{derivatives:true},transparent:true,depthWrite:true,
  blending:THREE.AdditiveBlending,toneMapped:false,
 });
 const body=create(0),details=create(1);
 // Halo corners are transparent; only the shared skin prepass owns depth.
 details.depthWrite=false;
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
 const count=480;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count);
 for(let i=0;i<count;i++){
  const s=i/(count-1),a=i*2.399963;
  const crest=-.70+Math.sin(s*Math.PI*.83)*1.95;
  positions.set([-4.25+s*9.,crest+Math.sin(a)*(.15+Math.sin(s*Math.PI)*.5),Math.cos(a)*.45],i*3);
  seeds[i]=(i*.618034)%1;
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
 geometry.setAttribute("aSeed",new THREE.BufferAttribute(seeds,1));
 const material=new THREE.ShaderMaterial({
  uniforms:shared,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`uniform float uTime;attribute float aSeed;varying float vLight;
   void main(){float p=fract(aSeed+uTime*.035);vec3 pos=position;
    pos.x+=p*.55;pos.y+=p*p*.3;
    vLight=sin(p*3.141593)*(.07+aSeed*.12);
    vec4 viewPosition=modelViewMatrix*vec4(pos,1.);gl_Position=projectionMatrix*viewPosition;
    gl_PointSize=1.1+aSeed*1.1;}`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying float vLight;
   void main(){float r=length(gl_PointCoord-.5);float core=1.-smoothstep(.05,.5,r);
    gl_FragColor=vec4(uColor*3.2,core*vLight*uOpacity);}`,
 });
 const points=new THREE.Points(geometry,material);points.name="Mobile whale / sparse trail";
 points.frustumCulled=false;points.renderOrder=5;
 return points;
}
