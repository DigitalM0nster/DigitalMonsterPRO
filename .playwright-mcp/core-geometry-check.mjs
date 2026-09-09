import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SyntheticCoreWorld } from '../src/three/scenes/capabilities/placeholders/SyntheticCoreWorld.js';
globalThis.requestAnimationFrame = fn => setImmediate(fn);
const world = new SyntheticCoreWorld(new THREE.Scene());
await world.readyPromise;
const shell = world.group.getObjectByName('layered-containment-shell');
const iris = world.group.getObjectByName('turbine-aperture');
const lens = world.group.getObjectByName('contained-energy-lens');
const v = new THREE.Vector3(), c = new THREE.Vector3(), axis = new THREE.Vector3(), q = new THREE.Quaternion();
function bake(mesh, progress) {
 const {position, aPart, aAssembly} = mesh.geometry.attributes;
 const result = new Float32Array(position.count * 3);
 for(let i=0;i<position.count;i++) {
  v.fromBufferAttribute(position,i); c.fromBufferAttribute(aPart,i);
  const distance=aAssembly.getX(i),delay=aAssembly.getY(i),end=aAssembly.getZ(i);
  const t=distance>0.001?THREE.MathUtils.smoothstep(progress,delay,end):0;
  axis.set(-c.y,c.x,0.4).normalize();
  q.setFromAxisAngle(axis,t*(0.24+Math.sin(c.x*3+c.y*5+c.z*7)*0.16));
  v.sub(c).applyQuaternion(q).add(c).addScaledVector(axis.copy(c).normalize(),distance*t);
  v.applyMatrix4(mesh.matrixWorld).toArray(result,i*3);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(result,3));g.setIndex(Array.from({length:position.count},(_,i)=>i));return g;
}
const findings=[];
for(const progress of [0,0.05,0.12,0.25,0.4,0.55,0.7,0.85,1]) {
 for(const mover of world.assemblyMovers) mover.object.position[mover.axis??'z']=THREE.MathUtils.lerp(mover.from,mover.to,THREE.MathUtils.smoothstep(progress,mover.start??0,mover.end??1));
 for(const angle of [0,0.15,0.35]) {
  iris.rotation.z=angle; world.group.updateMatrixWorld(true);
  const shellParts=shell.children.filter(m=>m.isMesh).map(m=>bake(m,progress));
  const shellGeometry=mergeGeometries(shellParts);
  const bvh=new MeshBVH(shellGeometry,{maxLeafTris:8});
  const sphere=new THREE.Sphere(lens.getWorldPosition(new THREE.Vector3()),0.69*1.23);
  let lensIris=false;
  const collided=iris.children.filter(m=>m.isMesh).some(m=>{const g=bake(m,progress);g.boundsTree=new MeshBVH(g);lensIris||=g.boundsTree.intersectsSphere(sphere);const hit=bvh.intersectsGeometry(g,new THREE.Matrix4());g.dispose();return hit;});
  const lensShell=bvh.intersectsSphere(sphere);
  findings.push({progress,angle,collided:collided||lensIris||lensShell,irisShell:collided,lensIris,lensShell});
  shellParts.forEach(g=>g.dispose());shellGeometry.dispose();
 }
}
console.log(JSON.stringify({cases:findings.length,collisions:findings.filter(f=>f.collided)}));
world.dispose();
