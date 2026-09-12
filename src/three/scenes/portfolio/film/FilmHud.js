import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import * as THREE from "three";
import { nextFilmPaint } from "./FilmMedia.js";
import { filmSurfacePoint, filmSurfaceNormal } from "./filmSurface.js";
import { filmHudVertex, filmHudTextFragment, filmHudRuleFragment } from "./filmHudShaders.js";
import { filmPalette } from "./filmPalette.js";
import { FilmProjectPicker } from "./FilmProjectPicker.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { loadFilmMsdf, createFilmMsdfGeometry } from "./filmMsdfText.js";

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
  const geometry=createFilmMsdfGeometry(this.msdf,rows,ctx,{width:canvas.width,height:canvas.height,spacing,align});
  if(!geometry){
  rows.forEach((row,i)=>{
   const metrics=ctx.measureText(row),baseline=4+(i+.5)*92+(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2;
   let x=align==="left"?8:(canvas.width-measure(row))/2;for(const char of row){ctx.strokeText(char,x,baseline);ctx.fillText(char,x,baseline);x+=ctx.measureText(char).width+spacing;}
  });
  }
  const texture=geometry?this.msdf.texture:new THREE.CanvasTexture(canvas);
  if(!geometry)texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  const material=new THREE.ShaderMaterial({
   defines:geometry?{FILM_MSDF:1}:{},
   uniforms:{uMap:{value:texture},uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uGain:{value:gain},uInk:{value:new THREE.Color(color)},
    uMsdfRange:{value:new THREE.Vector2((this.msdf?.atlas.distanceRange??1)/(this.msdf?.atlas.width??1),(this.msdf?.atlas.distanceRange??1)/(this.msdf?.atlas.height??1))}},
   vertexShader:filmHudVertex,fragmentShader:filmHudTextFragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const mesh=new THREE.Mesh(geometry??this.surfaceGeometry,material);mesh.renderOrder=20;mesh.frustumCulled=false;this.root.add(mesh);
  const layer={mesh,texture,layout:{width:canvas.width/canvas.height,height:1,rows:rows.length},layerCfg:{text},setVisibility:opacity=>{
   material.uniforms.uOpacity.value=opacity;
   // Warmup shows every prepared label; idle Medium only submits the visible ones.
   if(this.msdf)mesh.visible=opacity>0;
  }};
  this.layers.push(layer);return layer;
 }
 button(action) {
  const mesh=new THREE.Mesh(this.hitGeometry,this.hitMaterial);mesh.userData.filmAction=action;
  this.root.add(mesh);this.hitTargets.push(mesh);return mesh;
 }
 surfaceRule(vertical=false,color=filmPalette.accent) {
  const material=new THREE.ShaderMaterial({
   defines:this.msdf||getGraphicsTier()==="low"?{FILM_RULE_GLOW:1}:{},
   uniforms:{uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uVertical:{value:vertical?1:0},uColor:{value:new THREE.Color(color)}},
   vertexShader:filmHudVertex,fragmentShader:filmHudRuleFragment,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const mesh=new THREE.Mesh(this.surfaceGeometry,material);mesh.frustumCulled=false;mesh.renderOrder=19;
  this.root.add(mesh);this.surfaceRules.push(mesh);return mesh;
 }
 async prepare(renderer,posters) {
  await prepareFont();
  if(getGraphicsTier()==="medium")this.msdf=await loadFilmMsdf();
  this.names=[];this.serials=[];this.previousLabels=[];this.nextLabels=[];
  for(const [i,p] of this.projects.entries()){
   const name=p.name.toUpperCase();
   this.names.push(this.text(name,{spacing:14,gain:1.25}));
   const serial=this.text(String(i+1).padStart(2,"0"),{face:"FilmDigits",spacing:4,gain:1.1});
   serial.mesh.renderOrder=34;this.serials.push(serial);
   this.previousLabels.push(this.text(`‹ ${String(i+1).padStart(2,"0")}`,{face:"FilmDigits",spacing:5,gain:1.1}));
   this.nextLabels.push(this.text(`${String(i+1).padStart(2,"0")} ›`,{face:"FilmDigits",spacing:5,gain:1.1}));
   await nextFilmPaint();
  }
  for(const locale of ["ru","en","zh"]){
   const details=this.projects.map(p=>this.text((locale==="ru"?p.detail:p[locale]).toUpperCase(),{spacing:9}));
   const compactDetails=details.map(layer=>{
    const rows=[""];for(const word of layer.layerCfg.text.split(" ")){if((rows.at(-1)+" "+word).trim().length>23&&rows.at(-1))rows.push("");rows[rows.length-1]+=(rows.at(-1)?" ":"")+word;}
    return rows.length>1?this.text(rows.join("\n"),{spacing:7}):layer;
   });
   const sides=this.projects.map(p=>this.text(p.sideCopy[locale],{spacing:8,align:"left"}));
   this.locales[locale]={details,compactDetails,sides};
   await nextFilmPaint();
  }
  this.previous={hit:this.button("prev"),alpha:0};
  this.next={hit:this.button("next"),alpha:0};
  this.leftRail=this.surfaceRule(true,filmPalette.text);this.leftRailShort=this.surfaceRule(true,filmPalette.text);this.leftDash=this.surfaceRule(false,filmPalette.text);
  this.captionLeft=this.surfaceRule();this.captionRight=this.surfaceRule();
  this.picker=new FilmProjectPicker(this,posters,getScenePixelRatio(renderer));
  for(const texture of new Set(this.layers.map(layer=>layer.texture))){renderer.initTexture(texture);await nextFilmPaint();}
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
 update({motion,reveal,focus,layout,locale,warm=false,delta=1/60,reduced=false}) {
  const {compact}=layout;
  const titleY=compact?-.345:-.298,titleHeight=compact?.088:.047,titleLimit=compact?.54:.40;
  const alpha=reveal*(1-focus*.92);
  for(const layer of this.layers)layer.setVisibility(warm?.02:0);
  this.picker.update({layout,locale,motion,alpha,focus,delta,warm,reduced});
  const copy=this.locales[locale]??this.locales.en,p=Math.abs(motion.progress);
  for(let i=0;i<this.projects.length;i++){
   const a=i===motion.index?(motion.busy?1-Math.min(1,p*2):1):i===motion.destination?Math.max(0,(p-.5)*2):0;
   // Keep the project serial in the upper-left frame notch; the controls live below the film.
   const serialHeight=compact?.066:.035,serialLimit=compact?.10:.052;
   const serialWidth=this.surfaceWidth(this.serials[i],serialHeight,serialLimit);
   this.placeSurface(this.serials[i],-.447+serialWidth/2,.252,serialHeight,serialLimit,a*alpha);
   this.placeSurface(this.names[i],0,titleY,titleHeight,titleLimit,a*alpha);
   const detail=compact?copy.compactDetails[i]:copy.details[i],rows=detail.layout.rows;
   this.placeSurface(detail,0,compact?-.438-(rows-1)*.029:-.345,compact?.058*rows:.022,compact?.84:.58,a*alpha);
   this.placeSurface(copy.sides[i],-.567,-.125,.069,.064,compact?0:a*alpha*.9);
  }
  this.headerEnd=-.447+(compact?.10:.052)+.014;
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
  const previousIndex=(motion.selectionIndex+this.projects.length-1)%this.projects.length,nextIndex=(motion.selectionIndex+1)%this.projects.length;
  for(const [button,layer,side] of [[this.previous,this.previousLabels[previousIndex],-1],[this.next,this.nextLabels[nextIndex],1]]){
   button.alpha+=((this.hovered===button.hit.userData.filmAction?1:.80)-button.alpha)*.16;
   const x=side*(compact?.41:.415);
   this.placeSurface(layer,x,titleY,compact?.070:.034,compact?.16:.10,alpha*button.alpha);
   this.placeHit(button.hit,x,titleY,compact?.17:.10,compact?.13:.06,reveal>.1&&focus<.5);
  }
  if(warm)for(const layer of this.layers)layer.setVisibility(.02);
 }
 setHover(action){this.hovered=action;this.picker?.hover(action);}
 dispose(){
  this.picker?.dispose();
  for(const layer of this.layers){layer.mesh.material.dispose();if(layer.mesh.geometry!==this.surfaceGeometry)layer.mesh.geometry.dispose();}
  for(const texture of new Set(this.layers.map(layer=>layer.texture)))texture.dispose();
  for(const line of this.surfaceRules)line.material.dispose();
  this.surfaceGeometry.dispose();
  this.hitGeometry.dispose();this.hitMaterial.dispose();
 }
}
