import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ContactsMobileArtwork } from "./ContactsMobileArtwork.js";
import { resolveContactsResponsiveLayout } from "./contactsResponsiveLayout.js";

test("mobile contact artwork fits its reserved rectangle and exchanges prepared whole plates",()=>{
 const maps=new Map(Array.from({length:8},(_,i)=>[i,new THREE.Texture()]));
 let sounds=0;
 const art=new ContactsMobileArtwork(maps,{onLogoReveal:()=>sounds++,createLogoMaterial:map=>new THREE.ShaderMaterial({uniforms:{
  map:{value:map},opacity:{value:1},revealProgress:{value:0},revealLinear:{value:0},revealEnter:{value:0},
 }})});
 const camera=new THREE.PerspectiveCamera(40,390/844,.01,200);
 camera.position.set(4,2,12);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const layout=resolveContactsResponsiveLayout(390,844);
 art.applyCamera(camera,layout,390,844);
 art.update(1/60,{},3);art.root.updateMatrixWorld(true);
 const center=art.root.getWorldPosition(new THREE.Vector3()).project(camera);
 assert.ok(Math.abs((center.x+1)*195-195)<1e-6);
 assert.ok(Math.abs((1-center.y)*422-layout.modelCenterY)<1e-6);
 const materials=art.materials.slice(),versions=materials.map(m=>m.version);
 for(let i=0;i<90;i++)art.update(1/60,{},3);
 assert.equal(sounds,1);
 art.update(1/60,{},5);
 assert.ok(art.logos[3].group.position.x<0&&art.logos[5].group.position.x>.5,"front leaves left while the next plate waits on the right");
 assert.equal(art.logos[5].mesh.parent,art.logos[5].group,"logo stays attached to its plate");
 assert.ok(art.logos.every(l=>l.group.renderOrder===100+l.pose.z),"complete plates draw back-to-front by their current depth");
 assert.ok(art.logos.every(l=>!l.surfaces[0].depthWrite),"transparent card faces cannot leave occluding depth triangles");
 const before=art.logos[3].pose.clone();
 art.update(0,{},3);
 assert.ok(art.logos[3].pose.clone().sub(before).length()<1e-12,"reselection does not reset a visible plate pose");
 for(let i=0;i<240;i++){
  art.update(1/60,{},5);
  assert.equal(art.logos.filter(l=>l.group.visible).length,3,"exactly three physical cards throughout the cycle");
  assert.ok(art.logos.every(l=>l.index===art.selected||!l.mesh.visible),"rear cards never show logos");
  const cards=art.logos.filter(l=>l.group.visible);
  for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){
   const first=cards[a],second=cards[b],extent=first.group.scale.x+second.group.scale.x;
   const separated=Math.abs(first.pose.x-second.pose.x)>extent||Math.abs(first.pose.z-second.pose.z)>.1*extent;
   assert.ok(separated,"the solid plate boxes never intersect anywhere along their orbit");
  }
 }
 assert.equal(art.selected,5);assert.equal(art.phase,"idle");
 assert.equal(sounds,2,"logo sound starts once with the actual front reveal");
 assert.ok(art.logos[3].group.position.x<-.5,"previous front settles to the left rear");
 assert.deepEqual(art.materials,materials);
 assert.deepEqual(art.materials.map(m=>m.version),versions,"no shader recompiles during choice/animation");
 assert.ok([...maps.values()].every(t=>t.version===0),"shared logo maps are never repainted");
 const token=art.beginWarmupDraw();assert.ok(art.logos.every(l=>l.group.visible&&l.mesh.visible));
 art.endWarmupDraw(token);assert.equal(art.logos[1].group.visible,false);
 art.applyCamera(camera,null,1280,720);assert.equal(art.root.visible,false);
 const time=art.time;art.update(1,{},0);assert.equal(art.time,time,"hidden art does not animate");
 art.dispose();for(const map of maps.values())map.dispose();
});
