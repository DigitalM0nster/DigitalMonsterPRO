import * as THREE from "three";
import { filmHudVertex } from "./filmHudShaders.js";
import { filmPaletteGLSL } from "./filmPalette.js";
import { filmSurfaceNormal, filmSurfacePoint } from "./filmSurface.js";

const copy = {
 ru: { trigger: "ИЗБРАННЫЕ ПРОЕКТЫ", close: "ЗАКРЫТЬ", heading: "ИЗБРАННЫЕ ПРОЕКТЫ", compactHeading: "ПОДБОРКА", note: "НЕБОЛЬШАЯ ЧАСТЬ НАШИХ РАБОТ" },
 en: { trigger: "SELECTED PROJECTS", close: "CLOSE", heading: "SELECTED PROJECTS", compactHeading: "SELECTION", note: "A SMALL SELECTION OF OUR WORK" },
 zh: { trigger: "精选项目", close: "关闭", heading: "精选项目", compactHeading: "精选", note: "我们作品中的一小部分" },
};

/** Fit the selection into the existing screen, including the approved seven-project set. */
export function getFilmPickerCardLayout(index,count,compact){
 const multiple=count>5;
 const columns=compact?(multiple?2:1):(multiple?Math.ceil(count/2):count);
 const row=Math.floor(index/columns),rowCount=Math.min(columns,count-row*columns);
 const center=(index%columns-(rowCount-1)/2)*(compact?.464:Math.min(.179,.89/columns));
 const y=compact?(multiple?.097-row*.098:.105-row*.077):(multiple?.070-row*.187:.022);
 if(compact)return {x:center-(multiple?.179:.356),y,width:multiple?.075:.145,height:multiple?.058:.064,
  labelLeft:center-(multiple?.124:.227),labelY:y,labelHeight:multiple?.052:.060,labelLimit:multiple?.333:.61,
  hit:[center,y,multiple?.45:.89,multiple?.087:.075]};
 return {x:center,y,width:Math.min(.162,.89/columns*.91),height:multiple?.080:.107,
  labelY:multiple?.010-row*.187:-.065,labelHeight:.025,labelLimit:Math.min(.166,.89/columns*.94),
  hit:[center,multiple?.046-row*.187:-.010,Math.min(.176,.89/columns),multiple?.154:.218]};
}

/** The screen changes mode deliberately; pointer travel never opens or dismisses it. */
export class FilmProjectPickerState {
 constructor(){this.hovered=null;this.pinned=false;this.progress=0;}
 hover(action){
  const inside=action==="projects"||action==="project-picker"||typeof action==="number";
  this.hovered=inside?action:null;
 }
 open(){this.pinned=true;}
 toggle(){if(this.pinned)this.close();else this.open();}
 close(){this.pinned=false;}
 update(delta,active=true){
  const dt=Math.min(delta,.05);
  if(!active)this.close();
  const target=active&&this.pinned?1:0;
  this.progress+=(target-this.progress)*(1-Math.exp(-dt*16));
  if(this.progress<.001)this.progress=0;
  return this.progress;
 }
}

const screenFragment=`${filmPaletteGLSL}
varying vec2 vUv;uniform float uOpacity;
void main(){
 float center=1.-smoothstep(.0,.75,length((vUv-.5)*vec2(1.,.65)));
 vec3 color=vec3(.001,.003,.006)+vec3(.002,.006,.010)*center;
 gl_FragColor=vec4(color,uOpacity);
 #include <colorspace_fragment>
}`;

// A tangent plane, like play/fullscreen: its own depth gives real perspective parallax.
const triggerVertex=`uniform vec4 uRect;varying vec2 vUv;
#ifdef FILM_MSDF
attribute vec4 aGlyphRect,aGlyphUv;
#endif
void main(){
 vec2 local=position.xy;vUv=uv;
 #ifdef FILM_MSDF
 local=aGlyphRect.xy+uv*aGlyphRect.zw-.5;
 vUv=aGlyphUv.xy+uv*aGlyphUv.zw;
 #endif
 vec3 p=vec3(uRect.xy+local*uRect.zw,0.);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;

const triggerFragment=`${filmPaletteGLSL}
varying vec2 vUv;uniform float uOpacity;uniform float uAspect;uniform float uOpen;uniform float uHover;
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
void main(){
 vec2 p=(vUv-.5)*vec2(uAspect,1.);
 vec2 q=abs(p)-vec2(uAspect*.5-.045,.43);
 float d=max(q.x,q.y);
 float fill=1.-smoothstep(-.008,.025,d);
 float rim=(1.-smoothstep(.008,.035,abs(d)))*fill;
 float emphasis=max(uOpen,uHover);
 float divider=(1.-smoothstep(.007,.027,abs(p.x-(uAspect*.5-.66))))*(1.-smoothstep(.20,.27,abs(p.y)));
 vec2 arrow=p-vec2(uAspect*.5-.34,0.);
 float arrowDistance=min(segment(arrow,vec2(-.14,.07),vec2(0.,-.07)),segment(arrow,vec2(0.,-.07),vec2(.14,.07)));
 float closeDistance=min(segment(arrow,vec2(-.11,-.11),vec2(.11,.11)),segment(arrow,vec2(-.11,.11),vec2(.11,-.11)));
 arrowDistance=mix(arrowDistance,closeDistance,uOpen);
 float ink=1.-smoothstep(.016,.043,arrowDistance);
 vec3 base=mix(vec3(.003,.007,.012),vec3(.005,.023,.040),emphasis);
 vec3 border=filmAccent*mix(1.35,2.2,emphasis);
 float halo=exp(-abs(d)*32.)*mix(.22,.38,emphasis);
 vec3 color=mix(base,border,rim);
 color+=filmAccent*halo;
 color+=vec3(.08,.13,.17)*divider;
 color=mix(color,mix(vec3(1.2),filmAccent*1.8,emphasis),ink);
 #ifdef FILM_LOW
 float localHalo=exp(-abs(d)*24.)*(.22+.20*emphasis);
 float arrowHalo=exp(-arrowDistance*22.)*(.15+.15*emphasis);
 vec4 light=filmLowLight(rim*(1.1+.6*emphasis)+localHalo+ink*1.4+arrowHalo,fill*.96,1.);
 gl_FragColor=vec4(base+light.rgb,light.a*uOpacity);
 #else
 gl_FragColor=vec4(color,max(fill*.96,halo)*uOpacity);
 #endif
 #include <colorspace_fragment>
}`;

const cardFragment=`${filmPaletteGLSL}
varying vec2 vUv;uniform sampler2D uMap;uniform float uOpacity;uniform float uHover;uniform float uSelected;
uniform float uSourceAspect;uniform float uAspect;uniform float uDpr;
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
void main(){
 vec2 p=(vUv-.5)*vec2(uAspect,1.);
 float pixel=max(fwidth(p.x),fwidth(p.y));
 vec2 imageHalf=vec2(uAspect*.5-.04,.46);
 float imageAspect=imageHalf.x/imageHalf.y;
 vec2 uv=p/(imageHalf*2.)*vec2(min(1.,imageAspect/uSourceAspect),min(1.,uSourceAspect/imageAspect))+.5;
 vec3 rgb=texture2D(uMap,uv).rgb;
 rgb=mix(pow((rgb+.055)/1.055,vec3(2.4)),rgb/12.92,step(rgb,vec3(.04045)));
 float emphasis=max(uHover,uSelected*.65);
 rgb*=mix(.66,.88,emphasis);
 vec2 edge=imageHalf-abs(p);
 float imageMask=smoothstep(-pixel*.4,pixel*.4,min(edge.x,edge.y));
 // Equal-length optical marks with pixel-sized strokes, independent of card size or tilt.
 vec2 anchor=vec2(uAspect*.5-.014,.486);
 float stroke=pixel*uDpr;
 float reach=max(mix(.065,.095,uHover),stroke*3.);
 float d=min(segment(abs(p),anchor,anchor-vec2(reach,0.)),segment(abs(p),anchor,anchor-vec2(0.,reach)));
 float ink=1.-smoothstep(max(0.,stroke*.45-pixel*.5),stroke*.45+pixel*.5,d);
 float mark=ink*mix(.78,.95,uHover)*max(uSelected,uHover);
 float glow=exp(-d/(stroke*1.2))*uHover*.055;
 vec3 light=mix(filmAccent*1.05,mix(filmAccent,vec3(1.),.22)*1.15,uHover);
 float alpha=max(imageMask,max(mark,glow));
 vec3 color=rgb*imageMask+light*mark+filmAccent*glow;
 #ifdef FILM_LOW
 vec4 edgeLight=filmLowLight(mark+exp(-d/max(stroke*2.,.001))*.26*max(uHover,uSelected*.7),imageMask,1.);
 float coverage=max(imageMask,edgeLight.a);
 gl_FragColor=vec4((rgb*imageMask+edgeLight.rgb*edgeLight.a)/max(coverage,.0001),coverage*uOpacity);
 #else
 gl_FragColor=vec4(color/max(alpha,.0001),alpha*uOpacity);
 #endif
 #include <colorspace_fragment>
}`;

/** Every poster and label is prepared before Start; opening only animates uniforms. */
export class FilmProjectPicker {
 constructor(hud,posters,pixelRatio=1){
  this.hud=hud;this.state=new FilmProjectPickerState();this.root=new THREE.Group();
  this.root.name="Film / project selection screen";hud.root.add(this.root);
  this.locales={};this.cards=[];
  this.screen=this.mesh(screenFragment);this.screen.renderOrder=28;
  this.panelHit=hud.button("project-picker");this.panelHit.userData.filmPicker=true;this.root.add(this.panelHit);
  this.triggerHit=hud.button("projects");this.triggerHit.userData.filmPicker=true;
  this.triggerRoot=new THREE.Group();hud.root.add(this.triggerRoot);
  this.triggerNormal=new THREE.Vector3();this.triggerAnchor=new THREE.Vector3();
  this.trigger=this.mesh(triggerFragment,{uAspect:{value:1},uOpen:{value:0},uHover:{value:0}});
  this.trigger.material.vertexShader=triggerVertex;
  this.trigger.renderOrder=32;this.triggerRoot.add(this.trigger);this.triggerHover=0;
  for(const [locale,labels] of Object.entries(copy)){
   const trigger=hud.text(labels.trigger,{spacing:6,gain:1.5});
   const close=hud.text(labels.close,{spacing:6,gain:1.5});
   for(const layer of [trigger,close]){
    layer.mesh.material.vertexShader=triggerVertex;layer.mesh.renderOrder=33;this.triggerRoot.add(layer.mesh);
   }
   const heading=hud.text(labels.heading,{spacing:5,gain:1});
   const compactHeading=hud.text(labels.compactHeading,{spacing:4,gain:1});
   const note=hud.text(labels.note,{spacing:4,gain:1});
   for(const layer of [heading,compactHeading,note]){layer.mesh.renderOrder=31;this.root.add(layer.mesh);}
   this.locales[locale]={trigger,close,heading,compactHeading,note};
  }
  for(const [i,project] of hud.projects.entries()){
   const poster=posters[i],source=poster.image;
   const mesh=this.mesh(cardFragment,{uMap:{value:poster},uHover:{value:0},uSelected:{value:0},uSourceAspect:{value:source.width/source.height},uAspect:{value:16/9},uDpr:{value:pixelRatio}});
   mesh.material.extensions.derivatives=true;
   mesh.renderOrder=30;
   const text=project.name.toUpperCase();
   const label=hud.text(text,{spacing:3,gain:1.15});
   const desktopLabel=text.length>14?hud.text(text.replaceAll("-","\n"),{spacing:3,gain:1.15}):label;
   for(const layer of new Set([label,desktopLabel])){layer.mesh.renderOrder=31;this.root.add(layer.mesh);}
   const hit=hud.button(i);hit.userData.filmPicker=true;this.root.add(hit);
   this.cards.push({mesh,label,desktopLabel,hit,hover:0});
  }
 }
 mesh(fragmentShader,extra={}){
  const material=new THREE.ShaderMaterial({uniforms:{uRect:{value:new THREE.Vector4()},uOpacity:{value:0},...extra},
   vertexShader:filmHudVertex,fragmentShader,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(this.hud.surfaceGeometry,material);mesh.frustumCulled=false;mesh.renderOrder=29;this.root.add(mesh);return mesh;
 }
 hover(action){this.state.hover(action);}
 close(){this.state.close();}
 update({layout,locale,motion,alpha,focus,delta=1/60,warm=false,reduced=false}){
  const {compact}=layout,labels=this.locales[locale]??this.locales.en;
  const active=alpha>.1&&focus<.5;
  const progress=warm?1:this.state.update(delta,active),opacity=alpha*progress;
  this.root.visible=warm||progress>0;
  // The full surface fades as one layer; no sliding partial panel exposes the film behind it.
  const screenUniforms=this.screen.material.uniforms;
  screenUniforms.uRect.value.set(0,0,1.002,.49);screenUniforms.uOpacity.value=opacity;
  const triggerY=compact?.188:.210,labelHeight=compact?.055:.023;
  const labelLimit=compact?.40:.25;
  const labelWidth=this.hud.surfaceWidth(labels.trigger,labelHeight,labelLimit);
  const triggerHeight=compact?.070:.039,triggerWidth=Math.max(compact?.52:.20,labelWidth+(compact?.16:.070));
  const triggerX=.46-triggerWidth/2;
  const iconWidth=triggerHeight*.66;
  this.triggerHover+=((this.state.hovered==="projects"?1:0)-this.triggerHover)*(1-Math.exp(-Math.min(delta,.05)*16));
  this.triggerAnchor.set(...filmSurfacePoint(triggerX,triggerY));
  this.triggerNormal.set(...filmSurfaceNormal(triggerX));
  this.triggerRoot.position.copy(this.triggerAnchor).addScaledVector(this.triggerNormal,.022+(reduced?0:this.triggerHover*.012));
  this.triggerRoot.rotation.y=Math.atan2(this.triggerNormal.x,this.triggerNormal.z);
  this.triggerRoot.scale.setScalar(1+(reduced?0:this.triggerHover*.018));
  const triggerUniforms=this.trigger.material.uniforms;
  triggerUniforms.uRect.value.set(0,0,triggerWidth,triggerHeight);
  triggerUniforms.uAspect.value=triggerWidth/triggerHeight;triggerUniforms.uOpacity.value=alpha;
  triggerUniforms.uOpen.value=progress;triggerUniforms.uHover.value=this.triggerHover;
  this.hud.placeSurface(labels.trigger,-iconWidth/2,0,labelHeight,labelLimit,alpha*(1-progress));
  this.hud.placeSurface(labels.close,-iconWidth/2,0,labelHeight,labelLimit,opacity);
  // The hit area stays anchored while the visible plate lifts, preventing hover chatter.
  this.hud.placeHit(this.triggerHit,triggerX,triggerY,triggerWidth,compact?.085:.050,active);
  const rect=[0,0,1.012,.505];
  // Block the underlying play/fullscreen targets until the selection surface has faded out.
  this.hud.placeHit(this.panelHit,...rect,active&&progress>.08);
  const heading=compact?labels.compactHeading:labels.heading;
  const headingHeight=compact?.047:.025,headingLimit=compact?.27:.32;
  const headingWidth=this.hud.surfaceWidth(heading,headingHeight,headingLimit);
  this.hud.placeSurface(heading,-.444+headingWidth/2,compact?.188:.210,headingHeight,headingLimit,opacity*.8);
  const noteWidth=this.hud.surfaceWidth(labels.note,.019,.41);
  this.hud.placeSurface(labels.note,-.444+noteWidth/2,.173,.019,.41,compact?0:opacity*.6);
  const ease=1-Math.exp(-Math.min(delta,.05)*14);
  for(const [i,card] of this.cards.entries()){
   const hovered=this.state.hovered===i;card.hover+=((hovered?1:0)-card.hover)*ease;
   const placement=getFilmPickerCardLayout(i,this.cards.length,compact);
   const {x,y}=placement;
   const lift=compact||reduced?0:card.hover*.005,scale=1+(reduced?0:card.hover*.045);
   const w=placement.width*scale,h=placement.height*scale;
   const selected=i===motion.selectionIndex?1:0;
   const u=card.mesh.material.uniforms;u.uRect.value.set(x,y+lift,w,h);
   card.mesh.position.z=reduced?0:card.hover*.012;
   u.uOpacity.value=opacity;u.uHover.value=card.hover;u.uSelected.value=selected;u.uAspect.value=w/h;
   const layer=compact?card.label:card.desktopLabel,rows=layer.layout.rows;
   const labelAlpha=hovered||selected?1:.78;
   const labelHeight=placement.labelHeight*(compact?1:rows),labelLimit=placement.labelLimit;
   const labelWidth=this.hud.surfaceWidth(layer,labelHeight,labelLimit);
   this.hud.placeSurface(layer,compact?placement.labelLeft+labelWidth/2:x,placement.labelY-(compact?0:(rows-1)*.011),
    labelHeight,labelLimit,opacity*labelAlpha);
   this.hud.placeHit(card.hit,...placement.hit,active&&progress>.08);
  }
 }
 dispose(){this.trigger.material.dispose();this.screen.material.dispose();for(const card of this.cards)card.mesh.material.dispose();}
}
