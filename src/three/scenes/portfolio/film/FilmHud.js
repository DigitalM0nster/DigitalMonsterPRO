import * as THREE from "three";
import { nextFilmPaint } from "./FilmMedia.js";
import { filmSurfacePoint, filmSurfaceNormal } from "./filmSurface.js";
import { filmHudVertex, filmHudTextFragment, filmHudRuleFragment, filmHudNavigatorFragment } from "./filmHudShaders.js";
import { filmPalette } from "./filmPalette.js";

let fontReady;
const prepareFont = () => fontReady ??= Promise.all([
 ["FilmSans", "/fonts/MazzardM/MazzardM-Regular.woff"],
 ["FilmDigits", "/fonts/MazzardM/MazzardM-Regular.woff"],
].map(([name,path])=>new FontFace(name,`url(${path})`).load().then(font=>document.fonts.add(font))));

/** Bounded, immutable text textures. Only transforms/opacity change after prepare. */
export class FilmHud {
 constructor(projects) {
  this.projects=projects;this.root=new THREE.Group();this.root.name="Film / curved project HUD";
  this.layers=[];this.hitTargets=[];this.locales={};this.hovered=null;
  this.surfaceGeometry=new THREE.PlaneGeometry(1,1,64,1);
  this.surfaceRules=[];
  this.hitGeometry=new THREE.PlaneGeometry(1,1);
  this.hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
 }
 text(text,{face="FilmSans",spacing=5,color=filmPalette.text,gain=1,align="center"}={}) {
  const rows=text.split("\n"),font=`400 64px ${face}, sans-serif`;
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");ctx.font=font;
  const measure=row=>Array.from(row).reduce((w,char)=>w+ctx.measureText(char).width+spacing,0)-spacing;
  canvas.width=Math.ceil(Math.max(...rows.map(measure))+16);canvas.height=rows.length*92+8;
  ctx.font=font;ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=.65;ctx.lineJoin="round";ctx.textBaseline="alphabetic";
  rows.forEach((row,i)=>{
   const metrics=ctx.measureText(row),baseline=4+(i+.5)*92+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
   let x=align==="left"?8:(canvas.width-measure(row))/2;for(const char of row){ctx.strokeText(char,x,baseline);ctx.fillText(char,x,baseline);x+=ctx.measureText(char).width+spacing;}
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  const material=new THREE.ShaderMaterial({
   uniforms:{uMap:{value:texture},uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uGain:{value:gain}},
   vertexShader:filmHudVertex,fragmentShader:filmHudTextFragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const mesh=new THREE.Mesh(this.surfaceGeometry,material);mesh.renderOrder=20;mesh.frustumCulled=false;this.root.add(mesh);
  const layer={mesh,texture,layout:{width:canvas.width/canvas.height,height:1,rows:rows.length},layerCfg:{text},setVisibility:opacity=>{material.uniforms.uOpacity.value=opacity;}};
  this.layers.push(layer);return layer;
 }
 button(action) {
  const mesh=new THREE.Mesh(this.hitGeometry,this.hitMaterial);mesh.userData.filmAction=action;
  this.root.add(mesh);this.hitTargets.push(mesh);return mesh;
 }
 surfaceRule(vertical=false,color=filmPalette.accent) {
  const material=new THREE.ShaderMaterial({
   uniforms:{uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uVertical:{value:vertical?1:0},uColor:{value:new THREE.Color(color)}},
   vertexShader:filmHudVertex,fragmentShader:filmHudRuleFragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const mesh=new THREE.Mesh(this.surfaceGeometry,material);mesh.frustumCulled=false;mesh.renderOrder=19;
  this.root.add(mesh);this.surfaceRules.push(mesh);return mesh;
 }
 async prepare(renderer) {
  await prepareFont();
  this.names=[];this.nav=[];this.serials=[];this.headers=[];this.previousLabels=[];this.nextLabels=[];
  for(const [i,p] of this.projects.entries()){
   const name=p.name.toUpperCase();
   this.names.push(this.text(name,{spacing:14,gain:1.25}));
   this.serials.push(this.text(String(i+1).padStart(2,"0"),{face:"FilmDigits",spacing:4,gain:1.1}));
   this.headers.push(this.text(`${String(i+1).padStart(2,"0")} — ${name}`,{spacing:5,gain:1.1}));
   this.previousLabels.push(this.text(`‹ ${String(i+1).padStart(2,"0")}`,{face:"FilmDigits",spacing:5,gain:1.1}));
   this.nextLabels.push(this.text(`${String(i+1).padStart(2,"0")} ›`,{face:"FilmDigits",spacing:5,gain:1.1}));
   this.nav.push({layer:this.text(String(i+1).padStart(2,"0"),{face:"FilmDigits",spacing:4,gain:1.15}),hit:this.button(i),alpha:0});
   await nextFilmPaint();
  }
  for(const locale of ["ru","en","zh"]){
   const details=this.projects.map(p=>this.text((locale==="ru"?p.detail:p[locale]).toUpperCase(),{spacing:9}));
   const compactDetails=details.map(layer=>{
    const rows=[""];for(const word of layer.layerCfg.text.split(" ")){if((rows.at(-1)+" "+word).trim().length>23&&rows.at(-1))rows.push("");rows[rows.length-1]+=(rows.at(-1)?" ":"")+word;}
    return rows.length>1?this.text(rows.join("\n"),{spacing:7}):layer;
   });
   const sides=this.projects.map(p=>this.text(p.sideCopy[locale],{spacing:8,align:"left"}));
   const indexLabel=this.text(`${{ru:"ПРОЕКТЫ",en:"PROJECTS",zh:"项目"}[locale]} / ${String(this.projects.length).padStart(2,"0")}`,{spacing:10,align:"left"});
   this.locales[locale]={details,compactDetails,sides,indexLabel};
   await nextFilmPaint();
  }
  this.previous={hit:this.button("prev"),alpha:0};
  this.next={hit:this.button("next"),alpha:0};
  this.navigatorMaterial=new THREE.ShaderMaterial({uniforms:{uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uActive:{value:0},uCount:{value:this.projects.length},uHover:{value:0},uHoverOpacity:{value:0}},vertexShader:filmHudVertex,fragmentShader:filmHudNavigatorFragment,transparent:true,depthWrite:false,depthTest:false,toneMapped:false});
  this.navigator=new THREE.Mesh(this.surfaceGeometry,this.navigatorMaterial);this.navigator.frustumCulled=false;this.navigator.renderOrder=18;this.root.add(this.navigator);
  this.leftRail=this.surfaceRule(true,filmPalette.text);this.leftRailShort=this.surfaceRule(true,filmPalette.text);this.leftDash=this.surfaceRule(false,filmPalette.text);
  this.captionLeft=this.surfaceRule();this.captionRight=this.surfaceRule();
  for(const layer of this.layers){renderer.initTexture(layer.texture);await nextFilmPaint();}
 }
 surfaceWidth(layer,height,maxWidth) {return Math.min(maxWidth,height*layer.layout.width/layer.layout.height);}
 placeSurface(layer,x,y,height,maxWidth,opacity) {
  const width=this.surfaceWidth(layer,height,maxWidth);
  layer.mesh.material.uniforms.uRect.value.set(x,y,width,width*layer.layout.height/layer.layout.width);
  layer.setVisibility(opacity);
  return width;
 }
 placeHit(hit,x,y,width,height,enabled){
  hit.position.set(...filmSurfacePoint(x,y,.024));
  const normal=filmSurfaceNormal(x);hit.rotation.y=Math.atan2(normal[0],normal[2]);
  hit.scale.set(width,height,1);hit.userData.enabled=enabled;
 }
 update({motion,reveal,focus,layout,locale,warm=false,delta=1/60}) {
  const {compact}=layout;
  const titleY=compact?-.345:-.298,titleHeight=compact?.088:.047,titleLimit=compact?.54:.40;
  const alpha=reveal*(1-focus*.92);
  for(const layer of this.layers)layer.setVisibility(warm?.02:0);
  const copy=this.locales[locale]??this.locales.en,p=Math.abs(motion.progress);
  for(let i=0;i<this.projects.length;i++){
   const a=i===motion.index?(motion.busy?1-Math.min(1,p*2):1):i===motion.destination?Math.max(0,(p-.5)*2):0;
   const headerWidth=this.surfaceWidth(this.headers[i],compact?.047:.025,compact?.65:.34);
   this.placeSurface(this.headers[i],-.447+headerWidth/2,.252,compact?.047:.025,compact?.65:.34,a*reveal);
   this.placeSurface(this.serials[i],0,compact?-.285:-.266,compact?.045:.017,.050,a*alpha);
   this.placeSurface(this.names[i],0,titleY,titleHeight,titleLimit,a*alpha);
   const detail=compact?copy.compactDetails[i]:copy.details[i],rows=detail.layout.rows;
   this.placeSurface(detail,0,compact?-.438-(rows-1)*.029:-.345,compact?.058*rows:.022,compact?.84:.58,a*alpha);
   this.placeSurface(copy.sides[i],-.567,-.125,.069,.064,compact?0:a*alpha*.9);
  }
  this.headerEnd=-.447+THREE.MathUtils.lerp(this.surfaceWidth(this.headers[motion.index],compact?.047:.025,compact?.65:.34),this.surfaceWidth(this.headers[motion.destination],compact?.047:.025,compact?.65:.34),THREE.MathUtils.smoothstep(p,0,1))+.014;
  const fromWidth=this.surfaceWidth(this.names[motion.index],titleHeight,titleLimit);
  const toWidth=this.surfaceWidth(this.names[motion.destination],titleHeight,titleLimit);
  const inner=THREE.MathUtils.lerp(fromWidth,toWidth,THREE.MathUtils.smoothstep(p,0,1))/2+(compact?.04:.025);
  const outer=compact?.30:.35,lineWidth=Math.max(0,outer-inner),thickness=compact?.012:.005;
  for(const [mesh,side] of [[this.captionLeft,-1],[this.captionRight,1]]){
   mesh.material.uniforms.uRect.value.set(side*(inner+outer)/2,titleY,lineWidth,thickness);
   mesh.material.uniforms.uOpacity.value=alpha;
  }
  const rule=(mesh,x,y,w,h,opacity)=>{mesh.material.uniforms.uRect.value.set(x,y,w,h);mesh.material.uniforms.uOpacity.value=opacity;};
  rule(this.leftRail,-.522,-.020,.003,.32,compact?0:alpha*.65);
  rule(this.leftRailShort,-.534,.115,.003,.035,compact?0:alpha*.55);
  rule(this.leftDash,-.567,-.205,.014,.003,compact?0:alpha*.65);
  const step=compact?.11:.066,navCenter=compact?-.18:-.270,navY=compact?.342:.297,navHeight=compact?.060:.026;
  const labelWidth=this.surfaceWidth(copy.indexLabel,compact?.040:.017,compact?.35:.15);
  this.placeSurface(copy.indexLabel,navCenter-step*this.projects.length/2+labelWidth/2,compact?.407:.320,compact?.040:.017,compact?.35:.15,alpha*.85);
  const navEase=1-Math.exp(-Math.min(delta,.05)*14);
  for(const [i,n] of this.nav.entries()){
   const action=n.hit.userData.filmAction;
   const target=action===motion.selectionIndex?1:this.hovered===action?.92:.72;n.alpha+=(target-n.alpha)*navEase;
   const nx=navCenter+(i-(this.nav.length-1)/2)*step;
   this.placeSurface(n.layer,nx,navY,navHeight,step*.7,alpha*n.alpha);
   this.placeHit(n.hit,nx,navY,step*.92,compact?.115:.055,reveal>.1&&focus<.5);
  }
  const navU=this.navigatorMaterial.uniforms;
  navU.uRect.value.set(navCenter,navY,step*this.projects.length,compact?.13:.058);
  navU.uActive.value+=(motion.selectionIndex-navU.uActive.value)*navEase;
  navU.uOpacity.value=alpha;
  const navHovered=typeof this.hovered==="number";
  if(navHovered)navU.uHover.value=this.hovered;
  navU.uHoverOpacity.value+=((navHovered?1:0)-navU.uHoverOpacity.value)*navEase;
  const previousIndex=(motion.selectionIndex+this.projects.length-1)%this.projects.length,nextIndex=(motion.selectionIndex+1)%this.projects.length;
  for(const [button,layer,side] of [[this.previous,this.previousLabels[previousIndex],-1],[this.next,this.nextLabels[nextIndex],1]]){
   button.alpha+=((this.hovered===button.hit.userData.filmAction?1:.80)-button.alpha)*.16;
   const x=side*(compact?.41:.415);
   this.placeSurface(layer,x,titleY,compact?.070:.034,compact?.16:.10,alpha*button.alpha);
   this.placeHit(button.hit,x,titleY,compact?.17:.10,compact?.13:.06,reveal>.1&&focus<.5);
  }
  if(warm)for(const layer of this.layers)layer.setVisibility(.02);
 }
 setHover(action){this.hovered=action;}
 dispose(){
  for(const layer of this.layers){layer.mesh.material.dispose();layer.texture.dispose();}
  for(const line of this.surfaceRules)line.material.dispose();
  this.navigatorMaterial?.dispose();
  this.surfaceGeometry.dispose();
  this.hitGeometry.dispose();this.hitMaterial.dispose();
 }
}
