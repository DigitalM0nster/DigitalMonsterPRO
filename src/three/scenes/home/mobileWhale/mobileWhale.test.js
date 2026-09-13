import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createMobileWhaleMaterials, createMobileWhaleTrail, createWhaleDepthOccluder } from "./mobileWhaleMaterial.js";

const bytes=readFileSync(new URL("../../../../../public/models/home/whale-mobile.glb",import.meta.url));
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
const components={SCALAR:1,VEC3:3,VEC4:4};
function floats(index){
 const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView];
 assert.equal(accessor.componentType,5126);
 const start=(view.byteOffset||0)+(accessor.byteOffset||0),values=[];
 for(let i=0;i<accessor.count*components[accessor.type];i++)values.push(binary.readFloatLE(start+i*4));
 return values;
}

test("mobile export contains a compact skinned whale, flow UVs and one complete swim",()=>{
 assert.ok(bytes.length<160000,"the complete animated asset stays below 160 KB");
 assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,9);
 assert.equal(gltf.animations.length,1);
 const primitives=gltf.meshes.flatMap(mesh=>mesh.primitives);
 assert.equal(primitives.length,2,"body and facial details use just two draw calls");
 for(const primitive of primitives){
  for(const attribute of ["POSITION","NORMAL","TEXCOORD_0","JOINTS_0","WEIGHTS_0"])
   assert.ok(Number.isInteger(primitive.attributes[attribute]),attribute);
  assert.ok(primitive.extensions.KHR_draco_mesh_compression);
 }
 assert.ok(gltf.materials.some(material=>material.name==="Fine facial contours"));
});

test("tail and both fins animate, and the six-second loop closes without a pop",()=>{
 const moving=new Set();
 for(const channel of gltf.animations[0].channels){
  const sampler=gltf.animations[0].samplers[channel.sampler];
  const times=floats(sampler.input),values=floats(sampler.output);
  assert.ok(values.every(Number.isFinite));
  assert.ok(Math.abs(times.at(-1)-times[0]-6)<.001);
  const width=components[gltf.accessors[sampler.output].type];
  for(let i=0;i<width;i++)assert.ok(Math.abs(values[i]-values[values.length-width+i])<.0001,"loop endpoints match");
  if(values.some((value,i)=>Math.abs(value-values[i%width])>.02))moving.add(gltf.nodes[channel.target.node].name);
 }
 for(const name of ["Tail02","Tail03","Peduncle","PectoralNear","PectoralFar","FlukeNear","FlukeFar"])assert.ok(moving.has(name),name);
});

test("body, fine contours and the bounded trail share one shader clock without bitmap textures",()=>{
 const {body,details,shared}=createMobileWhaleMaterials(),trail=createMobileWhaleTrail(shared);
 assert.equal(body.uniforms.uTime,details.uniforms.uTime);
 assert.equal(trail.material.uniforms.uTime,body.uniforms.uTime);
 assert.ok(trail.geometry.attributes.position.count<=100,"glow and trail keep a small fixed particle budget");
 for(const uniform of Object.values(shared))assert.ok(!uniform.value?.isTexture);
 assert.equal(body.side,THREE.FrontSide);
 body.dispose();details.dispose();trail.geometry.dispose();trail.material.dispose();
});

test("rear fins are occluded by a depth pass reusing the animated surface and rig",()=>{
 const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial();
 const mesh=new THREE.SkinnedMesh(geometry,material),bone=new THREE.Bone();
 mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
 mesh.position.set(2,3,4);mesh.scale.setScalar(1.5);mesh.rotation.z=.2;
 const depth=createWhaleDepthOccluder(mesh);
 assert.equal(depth.geometry,mesh.geometry);
 assert.equal(depth.skeleton,mesh.skeleton);
 assert.deepEqual(depth.bindMatrix.elements,mesh.bindMatrix.elements);
 assert.deepEqual(depth.position,mesh.position);
 assert.deepEqual(depth.quaternion.toArray(),mesh.quaternion.toArray());
 assert.deepEqual(depth.scale,mesh.scale);
 assert.equal(depth.children.length,0,"the existing bones are shared, never cloned");
 assert.equal(depth.material.colorWrite,false);
 assert.equal(depth.material.transparent,false);
 assert.equal(depth.material.depthWrite,true);
 assert.equal(depth.frustumCulled,false);
 depth.material.dispose();mesh.skeleton.dispose();geometry.dispose();material.dispose();
});
