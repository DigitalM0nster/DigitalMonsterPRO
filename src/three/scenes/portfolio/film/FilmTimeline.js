import * as THREE from "three";
import { filmSurfaceGLSL } from "./filmSurface.js";
import { filmPaletteGLSL } from "./filmPalette.js";

const vertex = `uniform vec4 uRect;varying vec2 vUv;
${filmSurfaceGLSL}
void main(){vUv=uv;vec3 p=filmSurface(vec3(uRect.xy+position.xy*uRect.zw,.014));
gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const fragment = `varying vec2 vUv;
${filmPaletteGLSL}
uniform float uOpacity;uniform float uProgress;uniform float uAspect;uniform float uHover;
uniform float uCompact;uniform float uElapsed;uniform float uDuration;uniform sampler2D uTimeAtlas;
float roundedBox(vec2 p,vec2 halfSize,float radius){
 vec2 q=abs(p)-halfSize+radius;return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
}
float timeGlyph(float slot,float time){
 time=floor(clamp(time,0.,5999.));
 if(slot<.5)return floor(time/600.);
 if(slot<1.5)return mod(floor(time/60.),10.);
 if(slot<2.5)return 10.;
 if(slot<3.5)return mod(floor(time/10.),6.);
 return mod(time,10.);
}
void main(){
 float trackEnd=mix(.54,.68,uCompact),timeStart=mix(.61,.74,uCompact);
 if(vUv.x>timeStart){
  float cells=mix(11.,5.,uCompact),column=(vUv.x-timeStart)/(.99-timeStart)*cells;
  float slot=floor(column),glyph=slot<5.?timeGlyph(slot,uElapsed):slot<6.?11.:timeGlyph(slot-6.,uDuration);
  float y=(vUv.y-.5)*cells*(22./36.)/((.99-timeStart)*uAspect)+.5;
  float mask=step(0.,y)*step(y,1.)*step(column,cells);
  float ink=texture2D(uTimeAtlas,vec2((glyph+fract(column))/12.,clamp(y,0.,1.))).a*mask;
  gl_FragColor=vec4(vec3(1.+uHover*.12),ink*uOpacity);
 }else{
 // One continuous rectangular channel, with the same silhouette before and after the playhead.
 float length=(trackEnd-.03)*uAspect;
 vec2 p=vec2((vUv.x-.03)*uAspect,vUv.y-.5);
 float distance=roundedBox(p-vec2(length*.5,0.),vec2(length*.5,.0525),.016);
 float aa=max(fwidth(distance),.006);
 float channel=1.-smoothstep(-aa,aa,distance);
 float rim=channel*smoothstep(-.018-aa,-.018+aa,distance);
 float head=length*uProgress,filled=1.-smoothstep(head-.055,head+.055,p.x);
 float glass=.8+.2*(1.-smoothstep(0.,.065,abs(p.y-.0175)));
 vec3 channelColor=vec3(1.)*mix(.080,.84*glass,filled);
 channelColor+=vec3(1.)*.44*rim*(.5+.3*filled);
 float channelAlpha=channel*mix(.70,.94,filled);
 // A small luminous rectangle replaces the thin vertical stick. Hover changes light, never size.
 float thumbDistance=roundedBox(p-vec2(head,0.),vec2(.19,.09),.018);
 float thumbAA=max(fwidth(thumbDistance),.006);
 float thumb=1.-smoothstep(-thumbAA,thumbAA,thumbDistance);
 float halo=exp(-max(thumbDistance,0.)*18.)*(.08+.04*uHover);
 float glow=exp(-max(distance,0.)*22.)*channel*.08;
 float a=max(channelAlpha,max(thumb,halo));
 vec3 light=channelColor*channelAlpha*(1.-thumb);
 light+=vec3(1.)*1.38*thumb*(1.+uHover*.08);
 light+=vec3(1.)*.65*(halo+glow);
 #ifdef FILM_LOW
 float railHalo=exp(-max(distance,0.)*18.)*.14*(.3+.7*filled);
 gl_FragColor=filmLowWhite(channel*mix(.14,1.,filled)*(1.-thumb)+thumb*1.65+halo*2.+railHalo,a,uOpacity);
 #else
 gl_FragColor=vec4(light*filmUiGain/max(a,.0001),a*uOpacity);
 #endif
 }
 #include <colorspace_fragment>
}`;

const panelFragment=`varying vec2 vUv;uniform float uOpacity;uniform float uAspect;uniform float uHover;
${filmPaletteGLSL}
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
void main(){
 vec2 p=vec2((vUv.x-.5)*uAspect,vUv.y-.5);float edge=uAspect*.5-.035;
 float body=(1.-smoothstep(.12,.49,abs(p.y)))*(1.-smoothstep(edge-.68,edge+.025,abs(p.x)));
 float d=min(segment(p,vec2(-edge,.12),vec2(-edge,.35)),segment(p,vec2(-edge,.35),vec2(-edge+.26,.35)));
 d=min(d,min(segment(p,vec2(edge,-.12),vec2(edge,-.35)),segment(p,vec2(edge,-.35),vec2(edge-.26,-.35))));
 float corner=1.-smoothstep(.007,.027,d),a=max(body*.44,corner*.28);
 vec3 light=vec3(1.)*(.015*body*.44+.39*filmUiGain*corner*(.28+uHover*.12));
 #ifdef FILM_LOW
 gl_FragColor=filmLowWhite(corner*.6+exp(-d*26.)*(.12+.12*uHover),a,uOpacity);
 #else
 gl_FragColor=vec4(light/max(a,.0001),a*uOpacity);
 #endif
 #include <colorspace_fragment>
}`;

function prepareTimeAtlas(){
 const canvas=document.createElement("canvas");canvas.width=22*12;canvas.height=36;
 const ctx=canvas.getContext("2d");ctx.font="400 28px FilmDigits, sans-serif";ctx.fillStyle="#fff";ctx.textAlign="center";
 for(const [i,char] of [..."0123456789:/"].entries()){
  const m=ctx.measureText(char);ctx.fillText(char,i*22+11,18+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);
 }
 const texture=new THREE.CanvasTexture(canvas);texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
 return texture;
}

/** One prepared shader bar; pointer hits reuse the screen's exact curved geometry. */
export class FilmTimeline {
 constructor(surfaceGeometry,hitMaterial){
  this.geometry=new THREE.PlaneGeometry(1,1,48,1);
  // FilmHud has loaded the shared fonts before FilmScreen is constructed under the curtain.
  this.timeAtlas=prepareTimeAtlas();
  this.material=new THREE.ShaderMaterial({uniforms:{uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uProgress:{value:0},uAspect:{value:1},uHover:{value:0},uCompact:{value:0},uElapsed:{value:0},uDuration:{value:0},uTimeAtlas:{value:this.timeAtlas}},
   vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=12;
  this.panelMaterial=new THREE.ShaderMaterial({uniforms:{uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uAspect:{value:1},uHover:{value:0}},vertexShader:vertex,fragmentShader:panelFragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  this.panel=new THREE.Mesh(this.geometry,this.panelMaterial);this.panel.frustumCulled=false;this.panel.renderOrder=10;
  this.hit=new THREE.Mesh(surfaceGeometry,hitMaterial);this.hit.position.z=.018;
  this.hit.userData={filmAction:"seek",filmControl:true,enabled:false};
  this.alpha=0;this.hover=0;this.preview=null;
 }
 update({layout,reveal,video,seekable,progress,duration,hovered,delta,warm}){
  const width=layout.width,start=-.5+.56/width;
  this.length=Math.min(layout.compact?.6:.36,1-1.12/width);this.start=start;this.trackEnd=layout.compact?.68:.54;
  this.y=-.5/2.05+.25/width;this.hitHeight=.46/width;
  const u=this.material.uniforms,ease=1-Math.exp(-Math.min(delta,.05)*12);
  this.alpha+=((video?reveal:0)-this.alpha)*ease;
  this.hover+=((hovered||this.preview!==null?1:0)-this.hover)*ease;
  u.uRect.value.set(start+this.length/2,this.y,this.length,.26/width);
  u.uOpacity.value=warm?1:this.alpha;u.uHover.value=this.hover;
  u.uProgress.value=this.preview??progress;u.uAspect.value=this.length*width/.26;
  u.uCompact.value=layout.compact?1:0;u.uDuration.value=Number.isFinite(duration)?duration:0;
  u.uElapsed.value=u.uProgress.value*u.uDuration.value;
  const panelStart=-.5+.055/width,panelEnd=start+this.length+.055/width,panelHeight=.46/width,pu=this.panelMaterial.uniforms;
  pu.uRect.value.set((panelStart+panelEnd)/2,this.y,panelEnd-panelStart,panelHeight);
  pu.uAspect.value=(panelEnd-panelStart)/panelHeight;pu.uOpacity.value=u.uOpacity.value;pu.uHover.value=this.hover;
  this.hit.userData.enabled=video&&seekable&&reveal>.1;
 }
 contains(uv){
  const x=uv.x-.5,y=(uv.y-.5)/2.05;
  return x>=this.start&&x<=this.start+this.length*this.trackEnd&&Math.abs(y-this.y)<=this.hitHeight/2;
 }
 progressAt(uv){return THREE.MathUtils.clamp(((uv.x-.5-this.start)/this.length-.03)/(this.trackEnd-.03),0,1);}
 dispose(){this.geometry.dispose();this.material.dispose();this.panelMaterial.dispose();this.timeAtlas.dispose();}
}
