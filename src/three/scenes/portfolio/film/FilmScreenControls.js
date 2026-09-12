import * as THREE from "three";
import { filmSurfaceNormal, filmSurfacePoint } from "./filmSurface.js";
import { FilmTimeline } from "./FilmTimeline.js";
import { FilmVolume } from "./FilmVolume.js";
import { filmPaletteGLSL } from "./filmPalette.js";

const vertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `varying vec2 vUv;uniform float uKind;uniform float uOpacity;uniform float uHover;
${filmPaletteGLSL}
float line(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
void main(){
 vec2 p=vUv-.5;float d=1.;
 if(uKind<.5){d=min(line(p,vec2(-.10,-.15),vec2(-.10,.15)),min(line(p,vec2(-.10,.15),vec2(.16,0.)),line(p,vec2(.16,0.),vec2(-.10,-.15))));}
 else if(uKind<1.5){d=min(line(p,vec2(-.065,-.14),vec2(-.065,.14)),line(p,vec2(.065,-.14),vec2(.065,.14)));}
 else{vec2 q=abs(p);float corner=uKind<2.5?.16:.065;
  d=min(line(q,vec2(.065,corner),vec2(.16,corner)),line(q,vec2(corner,.065),vec2(corner,.16)));}
 float ink=1.-smoothstep(.015,.032,d);
 vec2 q=abs(p)-.275;float box=length(max(q,0.))+min(max(q.x,q.y),0.)-.04;
 float plate=(1.-smoothstep(-.015,.012,box))*.48;
 float rim=(1.-smoothstep(.003,.017,abs(box)))*(.10+.28*uHover);
 if(uKind<1.5){
  float radius=length(p),angle=atan(p.y,p.x);
  plate=(1.-smoothstep(.23,.34,radius))*.34;
  float breaks=smoothstep(.08,.23,abs(sin(angle*2.)));
  rim=(1.-smoothstep(.007,.021,abs(radius-.31)))*breaks*(.30+.30*uHover);
 }
 float halo=exp(-d*48.)*uHover;
 float a=max(plate,max(ink,max(halo*.32,rim)));
 vec3 light=vec3(1.)*.014*plate;
 light+=vec3(1.)*filmUiGain*mix(1.18,2.2,uHover)*ink;
 light+=vec3(1.)*filmUiGain*.62*(halo*.7+rim);
 #ifdef FILM_LOW
 float localHalo=exp(-d*25.)*(.32+.32*uHover);
 gl_FragColor=filmLowWhite(ink*(1.45+.8*uHover)+rim*.7+localHalo,max(plate,ink),uOpacity);
 #else
 gl_FragColor=vec4(light/max(a,.0001),a*uOpacity);
 #endif
 #include <colorspace_fragment>
}`;

/** Prepared controls live on the same curved surface as the film. */
export class FilmScreenControls {
 constructor(surfaceGeometry) {
  this.root=new THREE.Group();this.root.name="Film / surface controls";
  this.geometry=new THREE.PlaneGeometry(1,1);
  this.hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  this.hovered=null;this.width=0;this.controls=[];this.hitTargets=[];
  for(const [action,kind,side] of [["play",0,-1],["inspect",2,1]]){
   const material=new THREE.ShaderMaterial({uniforms:{uKind:{value:kind},uOpacity:{value:0},uHover:{value:0}},
    vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(this.geometry,material);mesh.renderOrder=12;mesh.frustumCulled=false;
   const hit=new THREE.Mesh(this.geometry,this.hitMaterial);hit.userData.filmAction=action;hit.userData.filmControl=true;
   const control={action,side,mesh,hit,normal:new THREE.Vector3(),anchor:new THREE.Vector3(),hover:0,alpha:0};
   this.controls.push(control);this.hitTargets.push(hit);this.root.add(mesh,hit);
  }
  this.timeline=new FilmTimeline(surfaceGeometry,this.hitMaterial);
  this.root.add(this.timeline.panel,this.timeline.mesh,this.timeline.hit);this.hitTargets.push(this.timeline.hit);
  this.volume=new FilmVolume(surfaceGeometry,this.hitMaterial);
  this.root.add(this.volume.mesh,...this.volume.hits);this.hitTargets.push(...this.volume.hits);
 }
 layout(width,compact) {
  if(this.width===width&&this.compact===compact)return;
  this.width=width;this.compact=compact;
  const inset=.25/width;
  for(const control of this.controls){
   const x=control.side*(.5-inset),y=-.5/2.05+inset;
   control.anchor.set(...filmSurfacePoint(x,y));control.normal.set(...filmSurfaceNormal(x));
   control.mesh.rotation.y=Math.atan2(control.normal.x,control.normal.z);
   control.hit.quaternion.copy(control.mesh.quaternion);
   // A stationary, generous target prevents hover chatter as the glyph lifts away.
   control.hit.position.copy(control.anchor).addScaledVector(control.normal,.009);
   control.hit.scale.setScalar(.46/width);
  }
 }
 update({layout,reveal,playing,video,focus,reduced,delta,warm,progress=0,seekable=false,duration=0,volume=1,muted=false}) {
  this.layout(layout.width,layout.compact);
  const ease=1-Math.exp(-Math.min(delta,.05)*12);
  for(const control of this.controls){
   const enabled=control.action!=="play"||video;
   const target=enabled&&this.hovered===control.action?1:0;
   control.hover+=(target-control.hover)*ease;
   control.alpha+=((enabled?reveal:0)-control.alpha)*ease;
   const lift=.008+(reduced?0:control.hover)*.006;
   control.mesh.position.copy(control.anchor).addScaledVector(control.normal,lift);
   control.mesh.scale.setScalar((layout.compact?.44:.42)/layout.width*(1+(reduced?0:.035)*control.hover));
   const u=control.mesh.material.uniforms;
   u.uOpacity.value=warm?1:control.alpha;u.uHover.value=warm?0:control.hover;
   u.uKind.value=control.action==="play"?(playing?1:0):(focus>.5?3:2);
   control.hit.userData.enabled=enabled&&reveal>.1;
  }
  this.timeline.update({layout,reveal,video,seekable,progress,duration,hovered:this.hovered==="seek",delta,warm});
  this.volume.update({layout,reveal,video,volume,muted,hovered:this.hovered==="volume"||this.hovered==="mute",delta,warm});
 }
 setHover(action){this.hovered=action;}
 dispose(){this.volume.dispose();this.timeline.dispose();for(const control of this.controls)control.mesh.material.dispose();this.geometry.dispose();this.hitMaterial.dispose();}
}
