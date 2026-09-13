import * as THREE from "three";
import { createGLTFLoader } from "../../../assets/gltfLoader.js";
import { createMobileWhaleMaterials, createMobileWhaleTrail, createWhaleDepthOccluder } from "./mobileWhaleMaterial.js";

export const MOBILE_WHALE_URL="/models/home/whale-mobile.glb";
// Prepare once for every viewport. Resizing keeps the rig and shader resources.

export async function loadMobileWhale() {
 const gltf=await createGLTFLoader().loadAsync(MOBILE_WHALE_URL);
 const root=gltf.scene,materials=createMobileWhaleMaterials(),meshes=[];
 const sourceMaterials=new Set();
 root.traverse(object=>{
  if(!object.isMesh)return;
  sourceMaterials.add(object.material);
  const isContour=object.material.name==="Fine facial contours";
  object.material=isContour?materials.details:materials.body;
  object.castShadow=object.receiveShadow=false;object.frustumCulled=false;
  // Surface depth must precede the contour pass, hiding the far eye and lip.
  object.renderOrder=isContour?4:3;meshes.push(object);
 });
 // Draco may reorder body/fin triangles. Write the closest skin depth first so
 // the rear fin cannot shine through the cheek before its transparent dots draw.
 for(const mesh of meshes){
  if(mesh.material===materials.body)mesh.parent.add(createWhaleDepthOccluder(mesh));
 }
 for(const material of sourceMaterials)material.dispose();
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
 root.add(createMobileWhaleTrail(materials.shared));
 const bounds=new THREE.Box3();
 // Sample the complete swim before Start; fin/tail motion must fit too.
 for(let sample=0;sample<9;sample++){
  mixer.setTime((gltf.animations[0]?.duration||0)*sample/9);
  root.updateMatrixWorld(true);
  // Exclude the shared depth copy and yield between the two skinned primitives.
  for(const mesh of meshes){
   bounds.union(new THREE.Box3().setFromObject(mesh,true));
   await new Promise(resolve=>requestAnimationFrame(resolve));
  }
 }
 root.userData.swimBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
 mixer.setTime(0);root.updateMatrixWorld(true);
 return {root,mixer,swimAction,animations:gltf.animations,particles:null,
  particleMeshes:meshes,hologramMaterial:materials.body,renderMode:"hologram"};
}
