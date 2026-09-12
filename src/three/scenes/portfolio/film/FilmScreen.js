import * as THREE from "three";
import { FilmProjection } from "./FilmProjection.js";
import { FilmScreenControls } from "./FilmScreenControls.js";
import { createFilmGlitchTiles } from "./filmGlitchTiles.js";
import { bendFilmGeometry } from "./filmSurface.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { hologramVertex, hologramFragment, hologramFrameFragment } from "./filmHologramShaders.js";
import { hologramFields, loadHologramSettings } from "./filmHologramConfig.js";
import { FilmHologramDevTools } from "./FilmHologramDevTools.js";

export class FilmScreen {
 constructor(media,reducedMotion) {
  this.media=media;this.root=new THREE.Group();this.root.name="PortfolioFilmScreen";
  this.art=new THREE.Group();this.root.add(this.art);
  this.projection=new FilmProjection({reduced:reducedMotion,low:getGraphicsTier()==="low"});this.art.add(this.projection.root);
  this.frameGeometry=bendFilmGeometry(new THREE.PlaneGeometry(1.05,.54,64,2));
  this.hitGeometry=bendFilmGeometry(new THREE.PlaneGeometry(1,1/2.05,64,1));
  this.controls=new FilmScreenControls(this.hitGeometry);this.art.add(this.controls.root);
  this.geometry=this.createMosaic(getGraphicsTier()==="low");
  const openTuning=new URLSearchParams(location.search).get("hologramDev")==="1";
  const allowTuning=import.meta.env.DEV||openTuning;
  this.hologramSettings=loadHologramSettings(allowTuning);
  this.hologramValues={...this.hologramSettings};
  this.uniforms={uFrom:{value:media.get(0)},uTo:{value:media.get(0)},uFromAspect:{value:media.aspect(0)},uToAspect:{value:media.aspect(0)},
   uProgress:{value:0},uDirection:{value:1},uOpacity:{value:1},uReduced:{value:reducedMotion?1:0},
   uTime:{value:0},uGlitchTime:{value:0},uFocus:{value:0},uDpr:{value:1},uLow:{value:getGraphicsTier()==="low"?1:0},uHeaderEnd:{value:-.378}};
  for(const [key] of hologramFields)this.uniforms[`uHolo${key}`]={value:this.hologramValues[key]};
  this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:hologramVertex,fragmentShader:hologramFragment,
   extensions:{derivatives:true},transparent:true,depthWrite:false,side:THREE.DoubleSide,
   // Add emitted RGB, but accumulate coverage normally: SRC_ALPHA on alpha would square it
   // and unnecessarily darken the image again in the site's transparent compositing passes.
   blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneFactor,
   blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor,toneMapped:false});
  this.image=new THREE.Mesh(this.geometry,this.material);this.image.frustumCulled=false;this.art.add(this.image);
  this.frameMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,
   vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:hologramFrameFragment,extensions:{derivatives:true},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  this.frame=new THREE.Mesh(this.frameGeometry,this.frameMaterial);this.frame.position.z=.015;this.frame.renderOrder=6;this.art.add(this.frame);
  this.hit=new THREE.Mesh(this.hitGeometry,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  this.hit.position.z=.002;this.hit.userData.filmAction="inspect";this.art.add(this.hit);
  if(allowTuning)this.hologramDevTools=new FilmHologramDevTools(this.hologramSettings,openTuning,(key,value)=>{
   // Apply to the rendered material immediately, including paused/zero-delta frames.
   this.hologramValues[key]=value;this.uniforms[`uHolo${key}`].value=value;
  });
 }
 createMosaic(low){
  // Small fragments need fewer curve segments, keeping the denser mosaic inexpensive.
  const quad=new THREE.PlaneGeometry(1,1,1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=quad.index;geometry.attributes.position=quad.attributes.position;geometry.attributes.uv=quad.attributes.uv;
  const blocks=createFilmGlitchTiles(low),rects=new Float32Array(blocks.length*4),seeds=new Float32Array(blocks.length);
  blocks.forEach((block,i)=>{rects.set([block.x,block.y,block.width,block.height],i*4);seeds[i]=block.seed;});
  geometry.setAttribute("aRect",new THREE.InstancedBufferAttribute(rects,4));
  geometry.setAttribute("aSeed",new THREE.InstancedBufferAttribute(seeds,1));geometry.instanceCount=blocks.length;
  return geometry;
 }
 update(motion,reveal,focus,layout,pointer,reduced,delta=0){
  const u=this.uniforms;if(!reduced)u.uTime.value+=Math.min(delta,.05);
  u.uFocus.value=focus;
  const target=this.hologramSettings;
  const tuneMix=1-Math.exp(-Math.min(delta,.05)*12);
  for(const [key] of hologramFields){
   this.hologramValues[key]+=(target[key]-this.hologramValues[key])*tuneMix;
   u[`uHolo${key}`].value=this.hologramValues[key];
  }
  // Integrate frequency: tuning it cannot jump the random event clock.
  if(!reduced)u.uGlitchTime.value+=Math.min(delta,.05)*this.hologramValues.speed;
  u.uFrom.value=this.media.get(motion.index);u.uTo.value=this.media.get(motion.destination);
  u.uFromAspect.value=this.media.aspect(motion.index);u.uToAspect.value=this.media.aspect(motion.destination);
  u.uProgress.value=Math.abs(motion.progress);u.uDirection.value=Math.sign(motion.progress)||1;u.uOpacity.value=reveal;
  this.root.position.set(layout.x,layout.y-(1-reveal)*.22,0).multiplyScalar(layout.compositionScale);
  this.root.scale.setScalar(layout.width*layout.compositionScale*(1+focus*(layout.compact?.02:.15)));
  this.root.rotation.set((.075+pointer.y*.012)*(1-focus)*(reduced?0:1),(-.14+pointer.x*.022)*(1-focus)*(layout.compact||reduced?0:1),0);
  this.projection.update(delta,reveal,focus);
 }
 dispose(){this.hologramDevTools?.dispose();this.controls.dispose();this.projection.dispose();this.geometry.dispose();this.frameGeometry.dispose();this.hitGeometry.dispose();this.material.dispose();this.frameMaterial.dispose();this.hit.material.dispose();}
}
