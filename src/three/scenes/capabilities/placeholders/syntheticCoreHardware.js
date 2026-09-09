import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createReactorMetal, createEnergyFlowMaterial, createCoreLensMaterial, createFieldParticlesMaterial } from "./syntheticCoreMaterials.js";

import { tagAssemblyPart, bindAssemblyMaterial, createAssemblyLinks } from "./syntheticCoreAssembly.js";
import { buildCoreMechanism } from "./syntheticCoreMechanism.js";

const TAU = Math.PI * 2;
const breath = () => new Promise(resolve => requestAnimationFrame(resolve));
const random = n => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
const point = (radius, phi, theta) => new THREE.Vector3(radius * Math.sin(theta) * Math.cos(phi), radius * Math.sin(theta) * Math.sin(phi), radius * Math.cos(theta));

function batch(parent) {
 const buckets = new Map();
 let part = null;
 return {
  part(value) { part = value; },
  add(geometry, material, position = [0,0,0], rotation = [0,0,0]) {
   const flat = geometry.index ? geometry.toNonIndexed() : geometry;
   if (flat !== geometry) geometry.dispose();
   const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1,1,1));
   flat.applyMatrix4(matrix);
   tagAssemblyPart(flat, part);
   if (!buckets.has(material)) buckets.set(material, []);
   buckets.get(material).push(flat);
  },
  finish() {
   for (const [material, geometries] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.frustumCulled = false; parent.add(mesh);
    for (const geometry of geometries) geometry.dispose();
   }
   buckets.clear();
  },
  dispose() { for (const geometries of buckets.values()) for (const geometry of geometries) geometry.dispose(); buckets.clear(); },
 };
}

/** Curved armour with an actual inner wall, machined bevel and closed edges. */
function createShellPatch(radius, phi, span, theta, height, thickness = 0.10, detail = 1) {
 const positions = [], normals = [], uvs = [];
 const nx = Math.max(8, Math.ceil(span * (40 + detail * 40))), ny = Math.max(2, Math.ceil(height * (24 + detail * 40)));
 const bevelInset = Math.min(0.008, span * 0.12, height * 0.12);
 const vertex = (p, n, u, v) => { positions.push(p.x,p.y,p.z); normals.push(n.x,n.y,n.z); uvs.push(u,v); };
 const triangle = (a,b,c, smooth = 0) => {
  const n = new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
  for (const [i,p] of [a,b,c].entries()) vertex(p, smooth ? p.clone().normalize().multiplyScalar(smooth) : n, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
 };
 for (const side of [1,-1]) {
  const r = radius + (side === 1 ? thickness : 0);
  const inset = side === 1 ? bevelInset : 0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
   const get = (a,b) => point(r, phi + inset + (span - 2 * inset) * a / nx, theta + inset + (height - 2 * inset) * b / ny);
   const a=get(x,y),b=get(x+1,y),c=get(x+1,y+1),d=get(x,y+1);
   if(side===1){triangle(a,c,b,1);triangle(a,d,c,1);}else{triangle(a,b,c,-1);triangle(a,c,d,-1);}
  }
 }
 for (let edge=0;edge<4;edge++) for(let i=0;i<(edge%2?ny:nx);i++) {
  const count=edge%2?ny:nx;
  const uv = t => edge===0?[t,0]:edge===1?[1,t]:edge===2?[1-t,1]:[0,1-t];
  const [u0,v0]=uv(i/count),[u1,v1]=uv((i+1)/count);
  const get=(u,v,outer)=>point(radius+(outer?thickness:0),phi+(outer?bevelInset:0)+u*(span-(outer?bevelInset*2:0)),theta+(outer?bevelInset:0)+v*(height-(outer?bevelInset*2:0)));
  const a=get(u0,v0,false),b=get(u1,v1,false),c=get(u1,v1,true),d=get(u0,v0,true);
  const emit=(p,u,v)=>{
   const ph=phi+u*span,th=theta+v*height;
   const radial=p.clone().normalize();
   const tangentPhi=new THREE.Vector3(-Math.sin(ph),Math.cos(ph),0);
   const tangentTheta=new THREE.Vector3(Math.cos(th)*Math.cos(ph),Math.cos(th)*Math.sin(ph),-Math.sin(th));
   const normal=(edge%2?tangentPhi:tangentTheta).multiplyScalar(edge===0||edge===3?-1:1);
   normal.addScaledVector(radial,0.4).normalize();vertex(p,normal,u,v);
  };
  emit(a,u0,v0);emit(c,u1,v1);emit(b,u1,v1);emit(a,u0,v0);emit(d,u0,v0);emit(c,u1,v1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return g;
}

function irisBlade() {
 const s = new THREE.Shape();
 s.moveTo(0.91,-0.015);s.bezierCurveTo(1.13,-0.15,1.37,-0.26,1.68,-0.06);
 s.lineTo(1.66,0.10);s.bezierCurveTo(1.27,0.0,1.03,0.12,0.93,0.115);s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth:0.12,steps:1,bevelEnabled:true,bevelSize:0.008,bevelThickness:0.008,bevelSegments:5,curveSegments:36});
}

function addFlow(world, parent, points, radius, material, part = null) {
 const curve = new THREE.CatmullRomCurve3(points);
 const segments = Math.max(48, Math.ceil(curve.getLength() * (world.detail < 0.6 ? 18 : 32)));
 const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
 const mesh = new THREE.Mesh(tagAssemblyPart(geometry, part), material);mesh.frustumCulled=false;parent.add(mesh);
}

export async function buildSyntheticCoreHardware(world, assembly, isDisposed) {
 await breath(); if(isDisposed()) return;
 const shellPatch = (r,p,s,t,h,d) => createShellPatch(r,p,s,t,h,d,world.detail);
 const titanium=createReactorMetal(0x77838b,0.34), dark=createReactorMetal(0x202a32,0.43);
 const silver=createReactorMetal(0xa5adb1,0.29), inset=createReactorMetal(0x080e14,0.5);
 const warm=createReactorMetal(0x766150,0.32), energy=createEnergyFlowMaterial();
 world.ownedMaterials.push(titanium,dark,silver,inset,warm,energy);
 for(const material of [titanium,dark,silver,inset,warm,energy]) bindAssemblyMaterial(material,world.assemblyUniform);
 const parts=[];
 world.timeUniforms.push(energy.uniforms.uTime);
 const shell = new THREE.Group();shell.name='layered-containment-shell';assembly.add(shell);
 const bands=[{theta:0.74,height:0.39,count:10},{theta:1.17,height:0.52,count:13},{theta:1.74,height:0.49,count:11},{theta:2.29,height:0.54,count:8}];
 for(const [row,band] of bands.entries()) {
  const target=batch(shell);
  for(let i=0;i<band.count;i++) {
   const sector=TAU/band.count, phi=i*sector+row*0.19;
   const radius=2.08+random(i+row*32)*0.13;
   const span=sector*(i%4===0?0.82:0.91);
   const part={center:point(radius,phi+span/2,band.theta+band.height/2),distance:1.4+random(i+row*15)*0.45,delay:row*0.05+random(i)*0.1,end:0.65};
   parts.push(part);target.part(part);
   target.add(shellPatch(radius,phi,span,band.theta,band.height),i%4===0?dark:titanium);
   // Recesses, inset plates and micro channels break up the large curved skins.
   target.add(shellPatch(radius+0.107,phi+0.05,span*0.62,band.theta+0.08,band.height*0.53,0.015),inset);
   target.add(shellPatch(radius+0.127,phi+0.064,span*0.55,band.theta+0.10,band.height*0.43,0.018),i%3===0?warm:dark);
   for(let j=0;j<Math.round(5*world.detail);j++) {
    const t=band.theta+band.height*0.68+j*band.height*0.041;
    target.add(shellPatch(radius+0.102,phi+0.06,span*0.52,t,0.011,0.012),silver);
   }
   if(i%3===1) {
    const path=[];for(let j=0;j<=20;j++)path.push(point(radius+0.106,phi+0.08+span*0.68*j/20,band.theta+0.058));
    addFlow(world,shell,path,0.0035,energy,part);
   }
   if(i%2===1){await breath();if(isDisposed()){target.dispose();return;}}
  }
  target.finish();await breath();if(isDisposed())return;
 }
 const links=createAssemblyLinks(parts,world.assemblyUniform);shell.add(links);
 world.timeUniforms.push(links.material.uniforms.uTime);
 world.rotors.push({object:shell,axis:'z',speed:0.012});
 // The entire blade sweep stays inside the smallest shell radius (2.08).
 const iris=new THREE.Group();iris.name='turbine-aperture';iris.position.z=1.0;assembly.add(iris);
 const target=batch(iris);
 for(let i=0;i<18;i++){
  target.part({center:new THREE.Vector3(Math.cos(i*TAU/18)*1.2,Math.sin(i*TAU/18)*1.2,0.1),distance:0.25,delay:0.4});
  target.add(irisBlade(),i%3===0?dark:titanium,[0,0,i%2*0.025],[0,0,i*TAU/18]);
 }
 target.part(null);
 target.add(new THREE.TorusGeometry(0.79,0.085,24,192),dark,[0,0,0.13]);
 target.add(new THREE.TorusGeometry(0.704,0.0035,12,192),energy,[0,0,0.14]);
 target.add(new THREE.TorusGeometry(1.52,0.016,16,192),inset,[0,0,-0.04]);
 target.finish();world.rotors.push({object:iris,axis:'z',speed:-0.034});
 world.assemblyMovers.push({object:iris,from:1.0,to:1.75,start:0.38});
 const lensMaterial=createCoreLensMaterial();const lens=new THREE.Mesh(new THREE.SphereGeometry(0.69,64,48),lensMaterial);
 // The lens and its bezel are one rigid optical assembly throughout the motion.
 lens.position.z=0.18;lens.name='contained-energy-lens';iris.add(lens);
 await buildCoreMechanism(world,assembly,{titanium,dark,silver,warm,energy},batch,isDisposed);
 if(isDisposed())return;
 world.interactionPlasmaMaterial=lensMaterial;
 energy.uniforms.uInteraction=lensMaterial.uniforms.uInteraction;energy.uniforms.uBurst=lensMaterial.uniforms.uBurst;world.timeUniforms.push(lensMaterial.uniforms.uTime);
 const key=new THREE.DirectionalLight(0xddeeff,1.45);key.position.set(-3,5,5);
 const coreLight=new THREE.PointLight(0x72dcff,1.0,10,2);coreLight.position.set(-1,0.5,1.8);
 const rim=new THREE.PointLight(0x799bff,1.2,15,2);rim.position.set(2,2,-3);
 assembly.add(key,coreLight,rim);
 await breath();if(isDisposed())return;
 // Detached shield sections form a diagonal composition in the foreground and distance.
 const satellites=[{p:[-3.3,-3.0,0.4],r:[0.5,0.7,-0.8],scale:0.85},{p:[-3.4,2.6,-3.0],r:[1.0,-0.6,0.5],scale:0.62},{p:[3.6,-1.7,-2.3],r:[0.2,0.7,-0.5],scale:0.42}];
 for(const [index,config]of satellites.entries()) {
  const group=new THREE.Group();group.name=`suspended-shield-${index}`;group.position.set(...config.p);group.rotation.set(...config.r);group.scale.setScalar(config.scale);world.group.add(group);
  const bits=batch(group);
  for(let i=0;i<4;i++) {
   bits.add(shellPatch(2.2,i*0.4,0.37,0.8,0.64),titanium);
   bits.add(shellPatch(2.08,i*0.4,0.37,0.82,0.60),inset);
   for(let j=0;j<7;j++)bits.add(shellPatch(2.32,i*0.4+0.03,0.30,0.90+j*0.052,0.022,0.024),j%4===0?warm:dark);
   const path=[];for(let j=0;j<=20;j++)path.push(point(2.33,i*0.4+0.025+j*0.016,0.855));addFlow(world,group,path,0.008,energy);
  }
  bits.finish();world.rotors.push({object:group,axis:'y',speed:(index%2?-1:1)*0.013});
  world.floaters.push({object:group,origin:group.position.clone(),phase:index*2.1,amplitude:0.28+index*0.08});
 }
 await breath();if(isDisposed())return;
 const count=Math.round(850*world.detail), positions=new Float32Array(count*3),seeds=new Float32Array(count);
 for(let i=0;i<count;i++) {
  const a=random(i)*TAU, r=2.5+random(i+count)*5.0;
  positions.set([Math.cos(a)*r-0.6,Math.sin(a)*r*0.57,(random(i+count*2)-0.6)*8],i*3);seeds[i]=random(i+count*3);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
 const particlesMaterial=createFieldParticlesMaterial();world.group.add(new THREE.Points(geometry,particlesMaterial));world.timeUniforms.push(particlesMaterial.uniforms.uTime);

}
