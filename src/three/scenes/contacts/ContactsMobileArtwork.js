import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
const ARC=Math.PI*2/3;
const ease=t=>{const x=THREE.MathUtils.clamp(t,0,1);return x*x*x*(10+x*(-15+6*x));};

const glassVertex = `varying vec3 vNormal;varying vec3 vView;varying vec3 vLocal;
void main(){vLocal=position;vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;
vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}`;
const glassFragment = `uniform float opacity;uniform float dim;varying vec3 vNormal;varying vec3 vView;varying vec3 vLocal;
void main(){vec3 n=normalize(vNormal),v=normalize(vView);
float rim=pow(1.-abs(dot(n,v)),2.4);
float spec=pow(max(0.,dot(n,normalize(v+vec3(-.7,.95,.65)))),110.);
float sweep=pow(max(0.,1.-abs(vLocal.x*.65+vLocal.y-.52)*2.),5.);
float grain=fract(sin(dot(floor(vLocal.xy*680.),vec2(127.1,311.7)))*43758.5453);
vec3 c=vec3(.008,.028,.046)+vec3(.055,.16,.24)*sweep*.65;
c+=vec3(.16,.5,.72)*rim*1.8+vec3(.65,.85,1.)*spec*.35+grain*.0015;
gl_FragColor=vec4(c*dim,opacity);}`;

/** Mobile art lives in the same scene/RT as the desktop contacts. All meshes,
 * logo maps and shader programs exist before Start; switching moves complete cards. */
export class ContactsMobileArtwork {
 constructor(textures,{createLogoMaterial,onLogoReveal=()=>{},onLogoHide=()=>{}}) {
  this.root=new THREE.Group();this.root.name="Contacts / mobile glass cards";
  this.root.visible=false;this.card=new THREE.Group();this.root.add(this.card);
  this.time=0;this.pointer=new THREE.Vector2();this.logos=[];this.materials=[];this.geometries=[];
  this.selected=3;
  this.requested=3;this.phase="idle";this.cycleProgress=0;
  this.onLogoReveal=onLogoReveal;this.onLogoHide=onLogoHide;
  this.order=[3,...textures.keys()].filter((value,index,array)=>array.indexOf(value)===index);
  this.motionPreference=typeof window!=="undefined"?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
  this.geometry=new RoundedBoxGeometry(2,2,.20,6,.10);this.geometries.push(this.geometry);
  const path=new THREE.CurvePath();
  const shape=new THREE.Shape();const s=.96,r=.12;
  shape.moveTo(-s+r,-s);shape.lineTo(s-r,-s);shape.quadraticCurveTo(s,-s,s,-s+r);
  shape.lineTo(s,s-r);shape.quadraticCurveTo(s,s,s-r,s);shape.lineTo(-s+r,s);
  shape.quadraticCurveTo(-s,s,-s,s-r);shape.lineTo(-s,-s+r);shape.quadraticCurveTo(-s,-s,-s+r,-s);
  const pts=shape.getPoints(18).map(p=>new THREE.Vector3(p.x,p.y,.102));
  for(let i=1;i<pts.length;i++)path.add(new THREE.LineCurve3(pts[i-1],pts[i]));
  const rimGeometry=new THREE.TubeGeometry(path,192,.007,6,false);this.geometries.push(rimGeometry);
  const plate=(group,dim)=>{
   const material=new THREE.ShaderMaterial({vertexShader:glassVertex,fragmentShader:glassFragment,
    transparent:true,depthWrite:false,toneMapped:false,uniforms:{opacity:{value:1},dim:{value:dim}}});
   const rim=new THREE.MeshBasicMaterial({color:new THREE.Color(.3,.85,1.4),transparent:true,opacity:dim*.8,depthWrite:false,toneMapped:false});
   rim.userData.baseOpacity=dim*.8;
   const backRim=new THREE.Mesh(rimGeometry,rim);backRim.position.z=-.20;
   group.add(new THREE.Mesh(this.geometry,material),new THREE.Mesh(rimGeometry,rim),backRim);
   group.children[1].renderOrder=1;backRim.renderOrder=1;
   this.materials.push(material,rim);
   return [material,rim];
  };
  const logoGeometry=new THREE.PlaneGeometry(1.04,1.04);this.geometries.push(logoGeometry);
  for(const [index,map] of textures){
   const group=new THREE.Group();group.renderOrder=index===3?20:10;this.card.add(group);
   const surfaces=plate(group,1);
   const material=createLogoMaterial(map,index);
   const mesh=new THREE.Mesh(logoGeometry,material);mesh.position.z=.108;mesh.visible=index===3;
   const slot=this.order.indexOf(index),pose=this._slotPose(slot,new THREE.Vector4());
   mesh.renderOrder=2;mesh.visible=true;group.add(mesh);group.visible=slot<3;
   group.position.set(pose.x,pose.y,pose.z);group.rotation.y=pose.w;
   group.renderOrder=100+pose.z;
   this.logos.push({index,mesh,group,surfaces,weight:slot<3?1:0,dim:slot===0?1:slot===1?.45:.22,
    pose,logoProgress:0});
   this.materials.push(material);
  }
  this.root.traverse(node=>{node.frustumCulled=false;node.raycast=()=>{};});
 }
 _slotPose(slot,target){
  return this._arcPose(slot===0?0:slot===1?-ARC:ARC,target);
 }
 _arcPose(angle,target){
  return target.set(1.2*Math.sin(angle),.08*(1-Math.cos(angle)),1.2*(Math.cos(angle)-1),0);
 }
 _assignRight(index){
  const slot=this.order.indexOf(index);if(slot===2)return;
  const incoming=this.logos.find(l=>l.index===index),right=this.logos.find(l=>l.index===this.order[2]);
  // Rear faces are blank and identical: exchange their prepared channel owners,
  // preserving the physical poses. The visible right-hand plate never jumps.
  for(const key of ["x","y","z","w"]){
   [incoming.pose[key],right.pose[key]]=[right.pose[key],incoming.pose[key]];
  }
  [incoming.dim,right.dim]=[right.dim,incoming.dim];
  [incoming.weight,right.weight]=[right.weight,incoming.weight];
  [this.order[slot],this.order[2]]=[this.order[2],this.order[slot]];
 }
 update(delta,frame,index,reveal=1) {
  if(!this.root.visible&&!this.warming)return;
  const dt=this.warming?0:Math.min(.05,Math.max(0,delta));this.time+=dt;
  const p=frame?.interactionEnabled&&!frame.pointerBlocked?frame.pointer:null;
  this.pointer.x+=((p?.x??0)-this.pointer.x)*(1-Math.exp(-dt*3));
  this.pointer.y+=((p?.y??0)-this.pointer.y)*(1-Math.exp(-dt*3));
  const motion=this.motionPreference?.matches?0:1;
  this.card.rotation.set(-.10+this.pointer.y*.04*motion,this.pointer.x*.035*motion,-.12+Math.sin(this.time*.35)*.012*motion);
  this.card.position.y=Math.sin(this.time*.6)*.022*motion;
  if(this.logos.some(l=>l.index===index))this.requested=index;
  if(this.phase==="idle"&&this.requested!==this.selected&&!this.warming){
   this._assignRight(this.requested);this.phase="cycle";this.cycleProgress=0;this.onLogoHide();
  }
  if(this.phase==="cycle")this.cycleProgress=Math.min(1,this.cycleProgress+dt/(motion?1.05:.45));
  if(this.phase==="cycle"&&this.cycleProgress>=1){
   const left=this.order[1];this.order[1]=this.order[0];this.order[0]=this.order[2];this.order[2]=left;
   this.selected=this.order[0];this.phase="idle";
  }
  const decay=Math.exp(-10*dt);
  for(const logo of this.logos){
   const slot=this.order.indexOf(logo.index),active=slot===0,visible=slot<3;
   // Render each complete transparent plate together, back to front. Global
   // per-mesh depth sorting otherwise puts a rear glass face over the front logo.
   const moving=this.phase==="cycle",t=this.cycleProgress;
   let angle=slot===0?0:slot===1?-ARC:ARC;
   if(moving){
    if(slot===0)angle=-ARC*ease(t/.68);
    else if(slot===1)angle=-ARC-ARC*ease(t);
    else if(slot===2)angle=ARC*(1-ease((t-.28)/.72));
   }
   this._arcPose(angle,logo.pose);
   logo.weight=visible?1:0;
   logo.dim+=((1-.42*(1-Math.cos(angle)))-logo.dim)*(1-decay);
   logo.group.position.set(logo.pose.x,logo.pose.y,logo.pose.z);
   // Parallel faces plus separate depth lanes prevent physical intersections.
   logo.group.rotation.set(0,0,0);
   logo.group.scale.setScalar(1-.16*(1-Math.cos(angle)));
   logo.group.renderOrder=100+logo.pose.z;
   const opacity=this.warming?1:THREE.MathUtils.clamp(logo.weight,0,1)*reveal;
   const showLogo=active&&!moving&&reveal>.95;
   const previous=logo.logoProgress;
   if(!this.warming)logo.logoProgress=THREE.MathUtils.clamp(previous+dt*(showLogo?1/1.1:-1/.22),0,1);
   if(previous===0&&logo.logoProgress>0&&!this.warming)this.onLogoReveal();
   const u=logo.mesh.material.uniforms,p=this.warming?.5:logo.logoProgress;
   u.opacity.value=opacity;u.revealLinear.value=p;u.revealProgress.value=p*p*(3-2*p);u.revealEnter.value=showLogo?1:0;
   logo.mesh.position.z=.108+p*.10;
   logo.surfaces[0].uniforms.opacity.value=opacity;
   logo.surfaces[0].uniforms.dim.value=logo.dim;
   logo.surfaces[1].opacity=logo.surfaces[1].userData.baseOpacity*opacity*logo.dim;
   logo.group.visible=this.warming||logo.weight>.001;
   logo.mesh.visible=this.warming||logo.logoProgress>0;
  }
 }
 applyCamera(camera,layout,width,height,progress=0) {
  if(!layout&&!this.warming){this.root.visible=false;return;}
  const box=layout?.modelRect??{left:width*.3,right:width*.7,top:height*.3,bottom:height*.7};
  const depth=6,unit=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/height;
  this.root.position.copy(camera.position);this.root.quaternion.copy(camera.quaternion);
  this.root.translateX(((box.left+box.right-width)/2+camera.projectionMatrix.elements[8]*width/2)*unit);
  this.root.translateY(((height-box.top-box.bottom)/2+camera.projectionMatrix.elements[9]*height/2+progress*height*.14)*unit);
  this.root.translateZ(-depth);
  const widthFill=layout?.portrait?.78:.68;
  const heightFill=layout?.portrait?.96:.91;
  const size=Math.max(45,Math.min((box.right-box.left)*widthFill,(box.bottom-box.top)*heightFill));
  this.root.scale.setScalar(size*unit/2);
  this.root.visible=true;
 }
 beginWarmupDraw(){
  const saved={visible:this.root.visible,logos:this.logos.map(l=>[l.group.visible,l.mesh.visible,l.mesh.material.uniforms.opacity.value,l.surfaces[0].uniforms.opacity.value,l.surfaces[1].opacity,l.mesh.material.uniforms.revealProgress.value,l.mesh.material.uniforms.revealLinear.value])};
  this.warming=true;this.root.visible=true;
  for(const l of this.logos){l.group.visible=true;l.mesh.visible=true;l.mesh.material.uniforms.opacity.value=1;l.mesh.material.uniforms.revealProgress.value=.5;l.mesh.material.uniforms.revealLinear.value=.5;l.surfaces[0].uniforms.opacity.value=1;l.surfaces[1].opacity=.8;}
  return saved;
 }
 endWarmupDraw(saved){
  this.warming=false;if(!saved)return;this.root.visible=saved.visible;
  this.logos.forEach((l,i)=>{const s=saved.logos[i];l.group.visible=s[0];l.mesh.visible=s[1];l.mesh.material.uniforms.opacity.value=s[2];l.surfaces[0].uniforms.opacity.value=s[3];l.surfaces[1].opacity=s[4];l.mesh.material.uniforms.revealProgress.value=s[5];l.mesh.material.uniforms.revealLinear.value=s[6];});
 }
 dispose(){this.root.removeFromParent();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();}
}
