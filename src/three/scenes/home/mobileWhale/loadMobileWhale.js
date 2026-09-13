import * as THREE from "three";
import { createGLTFLoader } from "../../../assets/gltfLoader.js";
import { createMobileWhaleMaterials, createMobileWhaleTrail } from "./mobileWhaleMaterial.js";

export const MOBILE_WHALE_URL="/models/home/whale-mobile.glb";
// Choose once under the curtain. Rotation keeps the same rig and prepared materials.
export const usesMobileWhale=(width,height)=>width<=768||(width<=1024&&height<480);

export async function loadMobileWhale() {
 const gltf=await createGLTFLoader().loadAsync(MOBILE_WHALE_URL);
 const root=gltf.scene,materials=createMobileWhaleMaterials(),meshes=[];
 const sourceMaterials=new Set();
 root.traverse(object=>{
  if(!object.isMesh)return;
  sourceMaterials.add(object.material);
  object.material=object.material.name==="Fine facial contours"?materials.details:materials.body;
  object.castShadow=object.receiveShadow=false;object.frustumCulled=false;
  object.renderOrder=3;meshes.push(object);
 });
 for(const material of sourceMaterials)material.dispose();
 root.scale.setScalar(150);
 root.userData.mobileWhale=true;
 root.animations=gltf.animations;
 const mixer=new THREE.AnimationMixer(root);
 const swimAction=gltf.animations[0]?mixer.clipAction(gltf.animations[0]):null;
 swimAction?.setLoop(THREE.LoopRepeat,Infinity);swimAction?.play();
 root.add(createMobileWhaleTrail(materials.shared));
 const bounds=new THREE.Box3();
 // Sample the complete swim before Start; fin/tail motion must fit too.
 for(let sample=0;sample<9;sample++){
  mixer.setTime((gltf.animations[0]?.duration||0)*sample/9);
  root.updateMatrixWorld(true);
  bounds.union(new THREE.Box3().setFromObject(root,true));
  await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 root.userData.mobileBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
 mixer.setTime(0);root.updateMatrixWorld(true);
 return {root,mixer,swimAction,animations:gltf.animations,particles:null,
  particleMeshes:meshes,hologramMaterial:materials.body,renderMode:"hologram"};
}
