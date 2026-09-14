import * as THREE from "three";
import { createGLTFLoader } from "../../../assets/gltfLoader.js";
import { createMobileWhaleMaterials } from "./mobileWhaleMaterial.js";
import { SkinnedWhalePoints } from "./SkinnedWhalePoints.js";

// A new authored geometry format must invalidate long-lived browser caches.
export const MOBILE_WHALE_URL="/models/home/whale-mobile.glb?v=surface-cloud-spacing-r10";
// Prepare once for every viewport. Resizing keeps the rig and shader resources.

export async function loadMobileWhale() {
 const gltf=await createGLTFLoader().loadAsync(MOBILE_WHALE_URL);
 if(gltf.parser.json.asset.extras?.whaleParticleFormat!=="four-line-roles-surface-v2"){
  throw new Error("Whale asset and particle shader formats do not match; rebuild the authored GLB");
 }
 const root=gltf.scene,materials=createMobileWhaleMaterials(),meshes=[];
 const sourceMaterials=new Set();let cloud;
 root.traverse(object=>{
  if(object.isPoints){cloud=object;sourceMaterials.add(object.material);return;}
  if(!object.isMesh)return;
  sourceMaterials.add(object.material);
  object.visible=false;
  object.castShadow=object.receiveShadow=false;object.frustumCulled=false;
  meshes.push(object);
 });
 if(!cloud||!meshes[0]?.skeleton)throw new Error("Whale asset is missing its authored particles or rig");
 const points=new SkinnedWhalePoints(cloud.geometry,materials.body,meshes[0]);
 cloud.parent.add(points);cloud.removeFromParent();
 points.skeleton.computeBoneTexture();
 for(const material of sourceMaterials)if(!meshes.some(mesh=>mesh.material===material))material.dispose();
 root.scale.setScalar(150);
 root.userData.authoredWhale=true;
 const referenceFrame=root.getObjectByName("MobileWhaleRig")?.userData.referenceHeadBounds;
 if(referenceFrame?.length===6){
  root.userData.referenceHeadBounds={
   min:referenceFrame.slice(0,3).map(value=>value*150),
   max:referenceFrame.slice(3).map(value=>value*150),
  };
 }
 root.animations=gltf.animations;
 const mixer=new THREE.AnimationMixer(root);
 const swimAction=gltf.animations[0]?mixer.clipAction(gltf.animations[0]):null;
 swimAction?.setLoop(THREE.LoopRepeat,Infinity);swimAction?.play();
 const bounds=new THREE.Box3();
 await points.prepareBounds();
 // Sample the complete swim before Start; fin/tail motion must fit too.
 for(let sample=0;sample<9;sample++){
  mixer.setTime((gltf.animations[0]?.duration||0)*sample/9);
  root.updateMatrixWorld(true);
  points.expandSwimBounds(bounds);
  await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 root.userData.swimBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
 mixer.setTime(0);root.updateMatrixWorld(true);
 return {root,mixer,swimAction,animations:gltf.animations,particles:null,
  particleMeshes:meshes,hologramMaterial:materials.body,renderMode:"anatomical-particles"};
}
