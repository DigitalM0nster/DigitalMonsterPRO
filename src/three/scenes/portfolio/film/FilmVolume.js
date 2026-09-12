import * as THREE from "three";
import { filmSurfaceGLSL } from "./filmSurface.js";
import { filmPaletteGLSL } from "./filmPalette.js";

const vertex = `uniform vec4 uRect;varying vec2 vUv;
${filmSurfaceGLSL}
void main(){vUv=uv;vec3 p=filmSurface(vec3(uRect.xy+position.xy*uRect.zw,.014));
gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const fragment = `varying vec2 vUv;uniform float uAspect,uOpacity,uVolume,uMuted,uHover;
${filmPaletteGLSL}
float line(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
void main(){
 vec2 p=vec2(vUv.y*uAspect,vUv.x-.5),speaker=vec2(p.y+.55,p.x-.55);
 float d=min(line(speaker,vec2(.16,-.11),vec2(.16,.11)),line(speaker,vec2(.16,.11),vec2(.34,.11)));
 d=min(d,line(speaker,vec2(.16,-.11),vec2(.34,-.11)));
 d=min(d,min(line(speaker,vec2(.34,.11),vec2(.55,.27)),line(speaker,vec2(.34,-.11),vec2(.55,-.27))));
 d=min(d,line(speaker,vec2(.55,-.27),vec2(.55,.27)));
 if(uMuted>.5){d=min(d,min(line(speaker,vec2(.72,-.12),vec2(.95,.12)),line(speaker,vec2(.72,.12),vec2(.95,-.12))));}
 else{vec2 a=speaker-vec2(.49,0.);float arc=max(abs(length(a)-.33),.20-a.x);
  if(uVolume>.5)arc=min(arc,max(abs(length(a)-.49),.34-a.x));d=min(d,arc);}
 float aa=max(fwidth(d),.009),icon=1.-smoothstep(.018-aa,.018+aa,d);
 float start=1.35,end=uAspect-.18,head=mix(start,end,uVolume);
 float track=1.-smoothstep(.027,.027+max(fwidth(p.y),.012),abs(p.y));
 track*=smoothstep(start-.02,start,p.x)*(1.-smoothstep(end,end+.02,p.x));
 float fill=1.-smoothstep(head-.025,head+.025,p.x);
 vec2 q=abs(p-vec2(head,0.))-vec2(.09,.085);
 float td=length(max(q,0.))+min(max(q.x,q.y),0.);
 float thumb=1.-smoothstep(-.006,max(fwidth(td),.01),td);
 float halo=exp(-max(td,0.)*24.)*(.035+.04*uHover);
 float body=(1.-smoothstep(.18,.5,abs(p.y)))*.22;
 float alpha=max(body,max(icon,max(track*.8,max(thumb,halo))));
 vec3 light=vec3(body*.012)+vec3(1.)*filmUiGain*(icon*.84+track*mix(.12,.68,fill)*(1.-thumb)+thumb*1.15+halo);
 #ifdef FILM_LOW
 float iconHalo=exp(-d*19.)*(.20+.20*uHover);
 float localLight=icon*1.3+track*mix(.18,.85,fill)*(1.-thumb)+thumb*1.6+halo*2.+iconHalo;
 gl_FragColor=filmLowWhite(localLight,alpha,uOpacity);
 #else
 gl_FragColor=vec4(light/max(alpha,.0001),alpha*uOpacity);
 #endif
 #include <colorspace_fragment>
}`;

/** Prepared once; the slider and its pointer targets follow the film's curved surface. */
export class FilmVolume {
 constructor(surfaceGeometry,hitMaterial){
  this.geometry=new THREE.PlaneGeometry(1,1,8,1);
  this.material=new THREE.ShaderMaterial({uniforms:{uRect:{value:new THREE.Vector4()},uAspect:{value:1},uOpacity:{value:0},uVolume:{value:1},uMuted:{value:0},uHover:{value:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=12;
  this.hits=["mute","volume"].map(action=>{const hit=new THREE.Mesh(surfaceGeometry,hitMaterial);hit.position.z=.018;hit.userData={filmAction:action,filmControl:true,enabled:false};return hit;});
  this.hit=this.hits[1];this.alpha=0;this.hover=0;
 }
 update({layout,reveal,video,volume,muted,hovered,delta,warm}){
  const width=layout.width,stripWidth=Math.min(.28/width,.065);
  this.length=Math.min(1.55/width,.26);
  this.start=-.5/2.05+Math.min(.68/width,.18);
  this.x=.5-Math.min(.25/width,.1);this.hitWidth=Math.min(.44/width,.12);
  this.aspect=this.length/stripWidth;
  const ease=1-Math.exp(-Math.min(delta,.05)*12),u=this.material.uniforms;
  this.alpha+=((video?reveal:0)-this.alpha)*ease;this.hover+=((hovered?1:0)-this.hover)*ease;
  u.uRect.value.set(this.x,this.start+this.length/2,stripWidth,this.length);
  u.uAspect.value=this.aspect;u.uOpacity.value=warm?1:this.alpha;u.uHover.value=this.hover;
  u.uVolume.value=volume;u.uMuted.value=muted?1:0;
  for(const hit of this.hits)hit.userData.enabled=video&&reveal>.1;
 }
 contains(uv,action){
  const along=((uv.y-.5)/2.05-this.start)/this.length*this.aspect;
  return Math.abs(uv.x-.5-this.x)<=this.hitWidth/2&&along>=0&&along<=this.aspect&&(action==="mute"?along<1.1:along>=1.1);
 }
 progressAt(uv){return THREE.MathUtils.clamp((((uv.y-.5)/2.05-this.start)/this.length*this.aspect-1.35)/(this.aspect-.18-1.35),0,1);}
 dispose(){this.geometry.dispose();this.material.dispose();}
}
