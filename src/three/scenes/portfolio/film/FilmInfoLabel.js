import * as THREE from "three";
import { createSceneHudAtlasChunked } from "../../../objects/sceneHud/sceneHudAtlas.js";
import { hudSnakeGlsl } from "../../../objects/sceneHud/sceneHudShaders.js";
import { CapabilitySceneSound } from "@/sounds/CapabilitySceneSound.js";
import { filmInfoCopy } from "@/pages/portfolio/data/filmProjectInfo.js";
import { siteLocaleReveal } from "@/functions/siteLocaleTransitionState.js";
import { filmHudVertex } from "./filmHudShaders.js";
import { FilmLabelTransition } from "./filmLabelTransition.js";
import { nextFilmPaint } from "./FilmMedia.js";

const LOCALES=["ru","en","zh"],HEIGHT=100;

/** The crane's approved letter snake, on the film's existing curved surface. */
export class FilmInfoLabel {
 constructor(hud) {this.hud=hud;this.motion=new FilmLabelTransition();this.sound=new CapabilitySceneSound();this.disposed=false;}
 async prepare(renderer) {
  const ctx=document.createElement("canvas").getContext("2d");ctx.font="400 64px FilmSans, sans-serif";
  const spacing=9,space=ctx.measureText(" ").width+spacing;
  const widths=[];
  const states=LOCALES.map(locale=>["about","back"].map((key,state)=>{
   const text=filmInfoCopy[locale][key].toUpperCase();
   const width=Math.ceil(Array.from(text).reduce((sum,char)=>sum+(char===" "?space:ctx.measureText(char).width+spacing),0)-spacing+16);
   widths[LOCALES.indexOf(locale)*2+state]=width;
   return [{text,x:8,y:HEIGHT/2,size:64,color:"#ffffff",row:0,font:ctx.font,tracking:spacing,space}];
  }));
  this.widths=widths;const width=Math.max(...widths);
  this.atlas=await createSceneHudAtlasChunked(1,states,"film-info-action",{width,height:HEIGHT,rowCount:1},()=>this.disposed,nextFilmPaint);
  if(!this.atlas)return;
  const material=new THREE.ShaderMaterial({
   uniforms:{uLabels:{value:this.atlas.texture},uLetterOrder:{value:this.atlas.orderTexture},uGlyphs:{value:this.atlas.glyphTexture},
    uGlyphCount:{value:this.atlas.glyphCount},uLocale:{value:0},uState:{value:0},uSnake:{value:1},uContentWidth:{value:widths[0]/width},
    uRect:{value:new THREE.Vector4()},uOpacity:{value:0},uGain:{value:1.08}},
   vertexShader:filmHudVertex,fragmentShader:`
    uniform sampler2D uLabels,uLetterOrder,uGlyphs;
    uniform float uGlyphCount,uLocale,uState,uSnake,uContentWidth,uOpacity,uGain;
    varying vec2 vUv;
    ${hudSnakeGlsl(2,[HEIGHT/2],{width,height:HEIGHT})}
    void main(){vec4 ink=snakeLabel(vec2(vUv.x*uContentWidth,vUv.y),uState);
     gl_FragColor=vec4(ink.rgb*uGain,ink.a*uOpacity);
     #include <colorspace_fragment>
    }`,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const mesh=new THREE.Mesh(this.hud.surfaceGeometry,material);mesh.renderOrder=20;mesh.frustumCulled=false;this.hud.root.add(mesh);
  this.layer={mesh,layout:{width:widths[0]/HEIGHT,height:1},setVisibility:opacity=>{material.uniforms.uOpacity.value=opacity;mesh.visible=opacity>0;}};
  this.atlasWidth=width;
  for(const texture of [this.atlas.texture,this.atlas.orderTexture,this.atlas.glyphTexture]){renderer.initTexture(texture);await nextFilmPaint();}
  await this.sound.prepare();
 }
 update(delta,locale,open,active,audible) {
  const key=Math.max(0,LOCALES.indexOf(locale))*2+Number(open);
  const reveal=this.motion.update(delta,key,siteLocaleReveal.value,active);
  const shown=this.motion.key,u=this.layer.mesh.material.uniforms;
  u.uLocale.value=Math.floor(shown/2);u.uState.value=shown%2;u.uSnake.value=reveal;
  u.uContentWidth.value=this.widths[shown]/this.atlasWidth;this.layer.layout.width=this.widths[shown]/HEIGHT;
  this.sound.update(delta,{enabled:false,hudEnabled:audible,hudReveal:reveal,hudVolume:.4});
  return this.layer;
 }
 dispose(){this.disposed=true;this.sound.dispose();this.layer?.mesh.material.dispose();this.layer?.mesh.removeFromParent();
  if(this.atlas)for(const texture of [this.atlas.texture,this.atlas.orderTexture,this.atlas.glyphTexture])texture.dispose();}
}
