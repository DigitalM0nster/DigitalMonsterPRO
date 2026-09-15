import * as THREE from "three";
import { createGLTFLoader } from "../../../assets/gltfLoader.js";
import { createMobileWhaleMaterials, createMobileWhaleTrail, createWhaleDepthOccluder } from "./mobileWhaleMaterial.js";
import { SkinnedWhalePoints } from "./SkinnedWhalePoints.js";
import { prepareWhaleReactionActions, sampleWhaleReactions } from "./whaleSkeletalReactions.js";

export const MOBILE_WHALE_URL="/models/home/whale-mobile.glb?v=authored-curiosity-r2";

/** Load, bind and prepare both point draws before the site's Start gate. */
export async function loadMobileWhale(options={}){
 const gltf=await createGLTFLoader().loadAsync(MOBILE_WHALE_URL);
 const root=gltf.scene,materials=createMobileWhaleMaterials();
 let skin,cloud;
 const sourceMaterials=new Set();
 root.traverse(object=>{
  if(object.material)sourceMaterials.add(object.material);
  if(object.isSkinnedMesh&&object.isMesh)skin=object;
  if(object.isPoints)cloud=object;
 });
 if(!skin||!cloud)throw new Error("Whale GLB requires a rigged surface and POINTS primitive");
 const points=new SkinnedWhalePoints(cloud.geometry,materials.body,skin);
 const depth=createWhaleDepthOccluder(skin,materials.shared);
 skin.parent.add(points,depth);
 cloud.removeFromParent();skin.removeFromParent();
 for(const material of sourceMaterials)material.dispose();
 points.skeleton.computeBoneTexture();
 const rig=root.getObjectByName("MobileWhaleRig");
 const emitters=JSON.parse(rig?.userData.wakeEmitters||"[]");
 const trail=createMobileWhaleTrail(materials.shared,points,emitters,options.wakeConfig);
 points.parent.add(trail);
 root.scale.setScalar(150);root.userData.authoredWhale=true;
 const referenceFrame=rig?.userData.referenceHeadBounds;
 if(referenceFrame?.length===6)root.userData.referenceHeadBounds={
  min:referenceFrame.slice(0,3).map(value=>value*150),
  max:referenceFrame.slice(3).map(value=>value*150),
 };
 root.animations=gltf.animations;
 const mixer=new THREE.AnimationMixer(root);
 const swimClip=gltf.animations.find(clip=>clip.name==="MobileWhale_CalmSwim");
 const swimAction=swimClip?mixer.clipAction(swimClip):null;
 swimAction?.setLoop(THREE.LoopRepeat,Infinity);swimAction?.play();
 const reactionActions=prepareWhaleReactionActions(mixer,gltf.animations);
 await points.prepareBounds();
 const bounds=new THREE.Box3();
 for(let sample=0;sample<12;sample++){
  mixer.setTime((swimClip?.duration||0)*sample/12);
  root.updateMatrixWorld(true);points.expandSwimBounds(bounds);
  await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 // Include directed and diagonal reaches at several swim phases in the cage.
 // Every action is evaluated before Start; runtime only scrubs these bindings.
 for(const [x,y] of [[-1,0],[1,0],[0,1],[0,-1],[-1,-1],[-1,1],[1,-1],[1,1]]){
  for(let sample=0;sample<4;sample++){
   mixer.setTime((swimClip?.duration||0)*sample/4);
   sampleWhaleReactions(reactionActions,x,y,1,1);mixer.update(0);
   root.updateMatrixWorld(true);points.expandSwimBounds(bounds);
   await new Promise(resolve=>requestAnimationFrame(resolve));
  }
 }
 root.userData.swimBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
 mixer.setTime(0);root.updateMatrixWorld(true);
 return {root,mixer,swimAction,reactionActions,animations:gltf.animations,particles:null,
	particleMeshes:[points],hologramMaterial:materials.body,trail,renderMode:"hologram"};
}
