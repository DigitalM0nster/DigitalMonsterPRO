import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { FilmMedia } from './FilmMedia.js';
import { FilmVolume } from './FilmVolume.js';

class Video extends EventTarget {
 constructor(){super();this.paused=true;this.readyState=2;this.HAVE_CURRENT_DATA=2;this.duration=44;this.currentTime=0;this.loads=0;this.videoWidth=1920;this.videoHeight=1080;}
 setAttribute(){}
 removeAttribute(){this.src='';}
 load(){this.loads++;}
 play(){this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
 get currentTime(){return this._currentTime??0;}
 set currentTime(value){this._currentTime=value;this.ended=false;}
}
function create(){
 globalThis.document=Object.assign(new EventTarget(),{hidden:false,createElement:()=>new Video()});
 const media=new FilmMedia([{video:'/one.mp4'},{video:'/two.mp4'},{}]);
 media.entries.filter(Boolean).forEach(entry=>{entry.ready=true;});media.posters=['poster-one','poster-two','poster-three'].map(name=>({name,dispose(){}}));return media;
}

test('fallback video texture reuses paused frames and uploads completed seeks, including to the same time',()=>{
 const media=create(),entry=media.entries[0],{video,texture}=entry;
 texture.update();const initial=texture.version;
 for(let i=0;i<120;i++)texture.update();assert.equal(texture.version,initial);
 video.currentTime=10;video.readyState=1;texture.update();assert.equal(texture.version,initial);
 video.readyState=2;video.dispatchEvent(new Event('seeked'));texture.update();
 assert.equal(texture.version,initial+1);
 for(let i=0;i<120;i++)texture.update();assert.equal(texture.version,initial+1);
 video.dispatchEvent(new Event('seeked'));texture.update();assert.equal(texture.version,initial+2);
 video.paused=false;
 for(let i=0;i<3;i++)texture.update();assert.equal(texture.version,initial+5,'playing fallback is never throttled');
 video.paused=true;video.dispatchEvent(new Event('pause'));texture.update();
 assert.equal(texture.version,initial+6,'final playback frame is retained');
 for(let i=0;i<120;i++)texture.update();assert.equal(texture.version,initial+6);
 media.dispose();const disposedVersion=texture.version;
 video.dispatchEvent(new Event('seeked'));texture.update();assert.equal(texture.version,disposedVersion);
});

test('metadata preload still waits for every decoded first frame and uploads all video textures',async(t)=>{
 const media=create();
 globalThis.requestAnimationFrame=callback=>queueMicrotask(callback);
 t.after(()=>{media.dispose();delete globalThis.requestAnimationFrame;});
 t.mock.method(THREE.TextureLoader.prototype,'loadAsync',async()=>new THREE.Texture());
 for(const entry of media.entries.filter(Boolean)){
  entry.video.readyState=0;entry.ready=false;
  assert.equal(entry.video.preload,'metadata');
 }
 const uploads=[];let finished=false;
 const pending=media.prepare({initTexture:texture=>uploads.push(texture)}).then(()=>{finished=true;});
 for(const entry of media.entries.filter(Boolean))entry.video.dispatchEvent(new Event('loadedmetadata'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(finished,false);assert.equal(uploads.filter(texture=>texture.isVideoTexture).length,0);
 const [first,second]=media.entries;
 first.video.readyState=2;first.video.dispatchEvent(new Event('loadeddata'));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);
 second.video.readyState=2;second.video.dispatchEvent(new Event('loadeddata'));
 await pending;
 assert.equal(finished,true);
 assert.deepEqual(uploads.filter(texture=>texture.isVideoTexture),[first.texture,second.texture]);
 assert.equal(first.video.loads,1);assert.equal(second.video.loads,1);
});
test('every film owns its own prepared texture; still and failed films use their own poster',()=>{
 const media=create();assert.notEqual(media.get(0),media.get(1));assert.equal(media.get(2).name,'poster-three');
 media.entries[1].onError();assert.equal(media.get(1).name,'poster-two');assert.equal(media.get(0),media.entries[0].texture);media.dispose();
});
test('switching and rapid reversal pause previous films without loading or allocating again',async()=>{
 const media=create();const originals=media.entries.slice();media.setAllowed(true);assert.equal(media.playing,true);
 for(const index of [1,0,1,2,0,1]){media.select(index);await Promise.resolve();await Promise.resolve();}
 await Promise.resolve();
 assert.equal(media.entries[0].video.paused,true);assert.equal(media.entries[1].video.paused,false);
 assert.deepEqual(media.entries,originals);assert.equal(media.entries[0].video.loads,0);assert.equal(media.entries[1].video.loads,0);media.dispose();
});
test('pause, seek and return are project-specific, site mute and leaving stop audio',async()=>{
 const media=create();media.setVolume(1);media.setAllowed(true);await Promise.resolve();await Promise.resolve();media.seek(.5);media.toggle();
 assert.equal(media.video.currentTime,22);assert.equal(media.playing,false);media.select(1);
 assert.equal(media.progress,0);for(let i=0;i<120;i++)media.updateSound(1/60,true);assert.ok(media.video.volume>.99);
 for(let i=0;i<120;i++)media.updateSound(1/60,false);assert.equal(media.video.muted,true);
 media.select(0);assert.equal(media.playing,false);assert.equal(media.progress,.5);media.setAllowed(false);assert.equal(media.video.paused,true);media.dispose();
});
test('a late play rejection from the old project cannot block the selected project',async()=>{
 const media=create();let reject;media.entries[0].video.play=()=>new Promise((_,r)=>{reject=r;});
 media.setAllowed(true);media.select(1);reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));
 await Promise.resolve();await Promise.resolve();assert.equal(media.active.blocked,false);assert.equal(media.playing,true);media.dispose();
});

test('player volume survives project changes and local mute restores the chosen level',()=>{
 const media=create();media.setAllowed(true);media.setVolume(.35);
 const settle=audible=>{for(let i=0;i<150;i++)media.updateSound(1/60,audible);};
 settle(true);assert.ok(Math.abs(media.video.volume-.35)<.001);
 media.toggleMute();settle(true);assert.equal(media.video.muted,true);assert.equal(media.userVolume,.35);
 media.select(1);assert.equal(media.volumeLevel,0);media.toggleMute();settle(true);
 assert.equal(media.volumeLevel,.35);assert.ok(Math.abs(media.video.volume-.35)<.001);
 settle(false);assert.equal(media.video.muted,true);assert.equal(media.volumeLevel,.35);
 settle(true);assert.ok(Math.abs(media.video.volume-.35)<.001);
 media.setVolume(-3);assert.equal(media.volumeLevel,0);media.toggleMute();assert.equal(media.volumeLevel,.5);
 media.setVolume(4);media.setVolume(NaN);assert.equal(media.volumeLevel,1);media.dispose();
});

test('video stays silent until the first screen interaction, then sound and slider rise together to half',()=>{
 const media=create();media.setAllowed(true);
 for(let i=0;i<90;i++)media.updateSound(1/60,true);
 assert.equal(media.volumeLevel,0);assert.equal(media.video.volume,0);assert.equal(media.video.muted,true);
 assert.equal(media.revealSound(),true);assert.equal(media.volumeLevel,0);
 let previous=0;
 for(let i=0;i<60;i++){
  media.updateSound(1/60,true);
  assert.ok(media.volumeLevel>=previous&&media.volumeLevel<=.5);
  assert.equal(media.video.volume,media.volumeLevel,'the visible rise matches the sound');
  if(i===20)assert.ok(media.volumeLevel>.05&&media.volumeLevel<.3,'the rise is gradual');
  previous=media.volumeLevel;
 }
 assert.equal(media.volumeLevel,.5);assert.equal(media.volumeIntro,null);
 assert.equal(media.revealSound(),false);
 media.select(1);assert.equal(media.volumeLevel,.5);assert.equal(media.revealSound(),false);
 assert.equal(media.video.loads,0);media.dispose();
});

test('manual volume and mute override the first-hover rise, including an explicit zero',()=>{
 const media=create();media.setAllowed(true);media.revealSound();media.updateSound(.05,true);
 media.setVolume(.2);assert.equal(media.volumeIntro,null);assert.equal(media.revealSound(),false);
 for(let i=0;i<90;i++)media.updateSound(1/60,true);
 assert.equal(media.volumeLevel,.2);
 media.toggleMute();assert.equal(media.revealSound(),false);
 for(let i=0;i<90;i++)media.updateSound(1/60,true);
 assert.equal(media.video.muted,true);media.dispose();
 const manual=create();manual.setAllowed(true);manual.setVolume(0);
 assert.equal(manual.revealSound(),false);manual.updateSound(.05,true);
 assert.equal(manual.video.volume,0);manual.dispose();
});

test('hidden, paused and inactive films cannot start the intro; site mute suspends its rise',async()=>{
 const media=create();assert.equal(media.revealSound(),false);media.setAllowed(true);
 document.hidden=true;assert.equal(media.revealSound(),false);document.hidden=false;
 media.toggle();assert.equal(media.revealSound(),false);media.toggle();
 assert.equal(media.revealSound(),true);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 for(let i=0;i<60;i++)media.updateSound(1/60,false);
 assert.equal(media.volumeLevel,0);assert.equal(media.video.volume,0);
 media.updateSound(.05,true);const level=media.volumeLevel;assert.ok(level>0);
 media.setAllowed(false);
 for(let i=0;i<120;i++)media.updateSound(1/60,true);
 assert.equal(media.volumeLevel,level);assert.equal(media.video.muted,true);media.dispose();
});

test('curved volume targets separate mute from the rail and map both endpoints on desktop and mobile',()=>{
 const geometry=new THREE.PlaneGeometry(1,1),material=new THREE.MeshBasicMaterial();
 const control=new FilmVolume(geometry,material);
 for(const layout of [{width:8.4,compact:false},{width:3.8,compact:false},{width:2.5,compact:true},{width:1.5,compact:true}]){
  control.update({layout,reveal:1,video:true,volume:.35,muted:false,delta:1/60,warm:true});
  const uv=along=>({x:.5+control.x,y:.5+(control.start+along/control.aspect*control.length)*2.05});
  assert.equal(control.contains(uv(.5),'mute'),true);assert.equal(control.contains(uv(.5),'volume'),false);
  assert.equal(control.contains(uv(1.35),'volume'),true);
  assert.ok(control.progressAt(uv(1.35))<1e-10);assert.ok(control.progressAt(uv(control.aspect-.18))>1-1e-10);
  assert.equal(control.progressAt(uv(-10)),0);assert.equal(control.progressAt(uv(20)),1);
  assert.ok(control.start>-.5/2.05&&control.start+control.length<.5/2.05);
  assert.ok(control.x>.35&&control.x<.5);
  assert.equal(control.contains({...uv(1.35),x:.5},'volume'),false);
 }
 control.dispose();geometry.dispose();material.dispose();
});

test('a completed video is consumed once, never loops itself, and the next video restarts without reloading',async()=>{
 const media=create();media.setAllowed(true);await Promise.resolve();await Promise.resolve();
 const first=media.video;assert.equal(first.loop,false);
 first.currentTime=first.duration;first.ended=true;first.paused=true;
 media.syncPlayback();assert.equal(first.paused,true);
 assert.equal(media.consumeEnded(),true);assert.equal(media.consumeEnded(),false);
 media.entries[1].video.currentTime=17;media.entries[1].paused=true;
 media.restart(1);media.select(1);await Promise.resolve();await Promise.resolve();
 assert.equal(media.video.currentTime,0);assert.equal(media.playing,true);assert.equal(media.consumeEnded(),false);
 assert.equal(media.video.loads,0);assert.equal(first.paused,true);
 media.select(0);assert.equal(media.video.currentTime,0);assert.equal(media.video.ended,false);media.dispose();
});

test('end-of-video does not advance a paused, hidden or inactive presentation',()=>{
 const media=create();media.video.ended=true;
 assert.equal(media.consumeEnded(),false);media.setAllowed(true);document.hidden=true;
 assert.equal(media.consumeEnded(),false);document.hidden=false;media.active.paused=true;
 assert.equal(media.consumeEnded(),false);media.active.paused=false;
 assert.equal(media.consumeEnded(),true);media.seek(.25);assert.equal(media.consumeEnded(),false);media.dispose();
});
test('prepare uploads all available film textures before returning, then switching reuses them',async()=>{
 const media=create();const saved=THREE.TextureLoader.prototype.loadAsync;
 globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
 media.entries.filter(Boolean).forEach(entry=>{entry.video.load=()=>queueMicrotask(()=>entry.video.dispatchEvent(new Event('loadeddata')));});
 const uploads=[];
 try{
  await media.prepare({initTexture:texture=>uploads.push(texture)});
  assert.equal(uploads.length,5);
  assert.ok(media.entries.filter(Boolean).every(entry=>uploads.includes(entry.texture)));
  const versions=media.entries.filter(Boolean).map(entry=>entry.texture.version);
  media.entries.filter(Boolean).forEach(entry=>entry.texture.update());
  assert.deepEqual(media.entries.filter(Boolean).map(entry=>entry.texture.version),versions,'prepared paused frames do not re-upload on first use');
  media.select(1);media.select(0);assert.equal(uploads.length,5);
 }finally{media.dispose();THREE.TextureLoader.prototype.loadAsync=saved;delete globalThis.requestAnimationFrame;}
});
