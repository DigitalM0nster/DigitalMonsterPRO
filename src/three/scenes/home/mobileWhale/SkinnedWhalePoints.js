import * as THREE from "three";

/** POINTS rasterization with Three's GPU skinning and one shared rig. */
export class SkinnedWhalePoints extends THREE.Points {
 constructor(geometry,material,source) {
  super(geometry,material);
  this.isSkinnedMesh=true;
  this.skeleton=source.skeleton;
  this.bindMatrix=source.bindMatrix.clone();
  this.bindMatrixInverse=source.bindMatrixInverse.clone();
  this.position.copy(source.position);this.quaternion.copy(source.quaternion);this.scale.copy(source.scale);
  this.name="Whale / skinned anatomical particles";
  this.frustumCulled=false;this.renderOrder=3;
  const viewport=new THREE.Vector4();
  this.onBeforeRender=renderer=>{
   renderer.getCurrentViewport(viewport);
   material.uniforms.uViewportHeight.value=viewport.w;
  };
 }
 updateMatrixWorld(force) {
  super.updateMatrixWorld(force);
  this.bindMatrixInverse.copy(this.matrixWorld).invert();
 }
 // Used only by preparation/tests. Animation stays entirely on the GPU.
 getVertexPosition(index,target) {
  target.fromBufferAttribute(this.geometry.attributes.position,index);
  return THREE.SkinnedMesh.prototype.applyBoneTransform.call(this,index,target);
 }
 async prepareBounds(yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve))) {
  // A skinned point is a convex combination of its joint transforms. The
  // transformed influence cages conservatively enclose every particle.
  this.boneBounds=this.skeleton.bones.map(()=>new THREE.Box3());
  const {position,skinIndex,skinWeight}=this.geometry.attributes,p=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
   p.fromBufferAttribute(position,i);
   for(let j=0;j<4;j++)if(skinWeight.array[i*4+j]>0)this.boneBounds[skinIndex.array[i*4+j]].expandByPoint(p);
   if((i+1)%4096===0)await yieldFrame();
  }
 }
 expandSwimBounds(bounds) {
  const matrix=new THREE.Matrix4(),box=new THREE.Box3();
  for(let i=0;i<this.boneBounds.length;i++){
   if(this.boneBounds[i].isEmpty())continue;
   matrix.copy(this.matrixWorld).multiply(this.bindMatrixInverse)
    .multiply(this.skeleton.bones[i].matrixWorld).multiply(this.skeleton.boneInverses[i]).multiply(this.bindMatrix);
   bounds.union(box.copy(this.boneBounds[i]).applyMatrix4(matrix));
  }
 }
}
