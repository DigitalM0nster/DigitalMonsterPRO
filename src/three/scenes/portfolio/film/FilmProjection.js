import * as THREE from "three";
import { bendFilmGeometry, filmSurfacePoint } from "./filmSurface.js";
import { filmPalette, filmPaletteGLSL } from "./filmPalette.js";

const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragmentShader = `
${filmPaletteGLSL}
varying vec2 vUv;uniform float uOpacity;uniform float uTime;
void main(){
 vec2 p=(vUv-.5)*vec2(1.23,.69);
 float d=max(abs(p.x)-.49,abs(p.y)-.236);
 float cloud=.68+.15*sin(p.x*49.+p.y*32.+uTime*.17)+.12*sin(p.x*21.-p.y*47.-uTime*.11);
 float haze=exp(-d*d/.00035)*smoothstep(.0,.012,d);
 float corners=1.-smoothstep(.52,.60,abs(p.x));
 float atmosphere=haze*cloud*corners;
 gl_FragColor=vec4(filmAccent*.56,atmosphere*.17*uOpacity);
 #include <colorspace_fragment>
}`;

/** Sparse spatial cues and perimeter light scatter; the video has no physical chassis. */
export class FilmProjection {
 constructor({reduced=false,low=false}={}) {
  this.root=new THREE.Group();
  this.root.name="Film aerial light scatter";
  this.reduced=reduced;this.time=0;this.geometries=[];this.materials=[];
  const geometry=bendFilmGeometry(new THREE.PlaneGeometry(1.23,.69,64,2));
  this.geometries.push(geometry);
  this.hazeMaterial=new THREE.ShaderMaterial({uniforms:{uOpacity:{value:0},uTime:{value:0}},vertexShader,fragmentShader,
   transparent:true,depthWrite:false,toneMapped:false});
  this.materials.push(this.hazeMaterial);
  const haze=new THREE.Mesh(geometry,this.hazeMaterial);
  haze.position.z=-.008;
  this.root.add(haze);
  const marks=[];
  for(const side of [-1,1]) {
   const x=side*.552,z=side*.035;
   marks.push(x,-.22,z,x,-.12,z);
   marks.push(x,.13,z,x,.23,z);
  }
  const lineGeometry=new THREE.BufferGeometry();
  lineGeometry.setAttribute("position",new THREE.Float32BufferAttribute(marks,3));bendFilmGeometry(lineGeometry);
  this.geometries.push(lineGeometry);
  this.lineMaterial=new THREE.LineBasicMaterial({color:filmPalette.text,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  this.materials.push(this.lineMaterial);
  this.root.add(new THREE.LineSegments(lineGeometry,this.lineMaterial));
  const anchorGeometry=new THREE.PlaneGeometry(.040,.040);
  this.geometries.push(anchorGeometry);
  this.anchorMaterial=new THREE.ShaderMaterial({uniforms:{uOpacity:{value:0}},vertexShader,
   fragmentShader:`${filmPaletteGLSL}
   varying vec2 vUv;uniform float uOpacity;
   void main(){vec2 p=vUv-.5;float core=exp(-dot(p,p)*1650.);
    float halo=exp(-dot(p,p)*36.);float streak=exp(-p.y*p.y*2600.)*exp(-p.x*p.x*20.);
    vec3 light=filmAccent*(4.8*core+.51*halo+.64*streak);
    float a=max(core,max(halo*.18,streak*.24));
    gl_FragColor=vec4(light/max(a,.00001),a*uOpacity);
    #include <colorspace_fragment>
   }`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  this.materials.push(this.anchorMaterial);
  for(const x of [-.5,.5])for(const y of [-.246,.246]){
   const anchor=new THREE.Mesh(anchorGeometry,this.anchorMaterial);
   anchor.position.set(...filmSurfacePoint(x,y,.015));anchor.renderOrder=7;this.root.add(anchor);
  }
  const count=low||reduced?24:64;
  const points=new Float32Array(count*3);
  for(let i=0;i<count;i++) {
   const a=i*2.39996323,r=.52+(Math.sin(i*19.31)+1)*.025;
   points.set([Math.cos(a)*r,Math.sin(a)*r*.49,Math.sin(i*7.13)*.035],i*3);
  }
  const pointGeometry=new THREE.BufferGeometry();
  pointGeometry.setAttribute("position",new THREE.BufferAttribute(points,3));bendFilmGeometry(pointGeometry);
  this.geometries.push(pointGeometry);
  this.pointMaterial=new THREE.PointsMaterial({color:filmPalette.accent,size:.0014,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  this.materials.push(this.pointMaterial);
  this.dust=new THREE.Points(pointGeometry,this.pointMaterial);this.root.add(this.dust);
 }
 update(delta,reveal,focus) {
  if(!this.reduced)this.time+=Math.min(delta,.05);
  this.hazeMaterial.uniforms.uTime.value=this.time;
  this.hazeMaterial.uniforms.uOpacity.value=reveal*(1-focus*.45);
  this.lineMaterial.opacity=reveal*(1-focus)*.34;
  this.anchorMaterial.uniforms.uOpacity.value=reveal*(1-focus*.3);
  this.pointMaterial.opacity=reveal*(1-focus)*.3;
  this.dust.rotation.z=this.time*.006;
 }
 dispose(){this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
