import * as THREE from "three";
import { getGraphicsTier } from "../../../../functions/getGraphicsTier.js";

export const nextFilmPaint = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** All film textures are prepared under the curtain; only the selected decoder plays. */
export class FilmMedia {
 constructor(projects) {
  this.projects=projects;this.posters=[];this.index=0;this.allowed=false;this.disposed=false;this.volume=0;
  this.userVolume=0;this.userMuted=false;this.volumeInitialized=false;this.volumeIntro=null;
  this.entries=projects.map(project=>{
   if(!project.video)return null;
   const video=document.createElement("video");
   // Prepare the first decoded frame without seven full-video reads starving
   // models/fonts on the same origin. loadeddata + GPU upload still gate ready.
   Object.assign(video,{muted:true,defaultMuted:true,loop:false,playsInline:true,preload:"metadata",volume:0});
   video.setAttribute("playsinline","");
   const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;
   const entry={video,texture,ready:false,paused:false,blocked:false,pending:false};
   if(!("requestVideoFrameCallback" in video)){
    // Three's fallback dirties VideoTexture on every scene frame, even on pause.
    // Keep playing-frame updates unchanged; a paused image changes only on load,
    // seek completion or the final playback frame. No bitrate/resolution reduction.
    const update=texture.update.bind(texture);let lastTime=NaN,dirty=true;
    entry.onFrameChanged=()=>{dirty=true;};
    texture.update=()=>{
     if(video.readyState<2)return;
     if(!video.paused||dirty||video.currentTime!==lastTime){
      update();lastTime=video.currentTime;dirty=false;
     }
    };
    for(const event of ["loadeddata","seeked","pause"])video.addEventListener(event,entry.onFrameChanged);
   }
   entry.onLoaded=()=>{entry.ready=video.readyState>=2;this.syncPlayback();};
   entry.onError=()=>{entry.ready=false;video.pause();};
   video.addEventListener("loadeddata",entry.onLoaded);video.addEventListener("error",entry.onError);
   return entry;
  });
  this._onVisibility=()=>this.syncPlayback();document.addEventListener("visibilitychange",this._onVisibility);
 }
 get active(){return this.entries[this.index];}
 get video(){return this.active?.video;}
 get playing(){return !!(this.active?.ready&&!this.video.paused&&!this.video.ended);}
 async prepare(renderer){
  const ready=this.entries.map((entry,index)=>{
   if(!entry)return Promise.resolve();
   return new Promise(resolve=>{
    const finish=()=>{
     clearTimeout(timer);entry.video.removeEventListener("loadeddata",finish);entry.video.removeEventListener("error",finish);
     entry.ready=entry.video.readyState>=2&&!entry.video.error;resolve();
    };
    const timer=setTimeout(finish,12000);entry.finish=finish;
    entry.video.addEventListener("loadeddata",finish);entry.video.addEventListener("error",finish);
    const film=this.projects[index];entry.video.src=getGraphicsTier()==="low"?film.videoLow??film.video:film.video;entry.video.load();
   });
  });
  const loader=new THREE.TextureLoader();
  const results=await Promise.allSettled(this.projects.map(project=>loader.loadAsync(project.poster)));
  const failed=results.find(result=>result.status==="rejected");
  if(this.disposed||failed){
   for(const result of results)if(result.status==="fulfilled")result.value.dispose();
   this.entries.forEach(entry=>entry?.finish?.());
   if(failed&&!this.disposed)throw failed.reason;
   return;
  }
  this.posters=results.map(result=>result.value);
  for(const texture of this.posters){
   await nextFilmPaint();if(this.disposed)return;
   texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;
   texture.minFilter=texture.magFilter=THREE.LinearFilter;renderer.initTexture(texture);
  }
  await Promise.all(ready);
  for(const entry of this.entries){
   if(!entry?.ready)continue;
   await nextFilmPaint();if(this.disposed)return;entry.texture.update();renderer.initTexture(entry.texture);
  }
 }
 get(index){return this.entries[index]?.ready?this.entries[index].texture:this.posters[index];}
 aspect(index){const source=this.get(index)?.image;return(source?.videoWidth||source?.width||205)/(source?.videoHeight||source?.height||100);}
 select(index){
  if(index===this.index||this.disposed)return;
  this.video?.pause();this.index=index;this.volume=0;
  if(this.video?.ended)this.restart(index);
  if(this.video){this.video.volume=0;this.video.muted=true;}
  this.syncPlayback();
 }
 setAllowed(allowed){if(allowed===this.allowed)return;this.allowed=allowed;this.syncPlayback();}
 consumeEnded(){
  const entry=this.active;
  if(this.disposed||!this.allowed||document.hidden||!entry?.ready||entry.paused||entry.endedHandled||!entry.video.ended)return false;
  entry.endedHandled=true;return true;
 }
 restart(index){const entry=this.entries[index];if(!entry?.ready)return;entry.paused=false;entry.blocked=false;entry.endedHandled=false;entry.video.currentTime=0;}
 get volumeLevel(){return this.userMuted?0:this.userVolume;}
 revealSound(){
  if(this.volumeInitialized||this.disposed||!this.allowed||!this.active?.ready||this.active.paused||this.active.blocked||this.video.ended||document.hidden)return false;
  this.volumeInitialized=true;this.volumeIntro=0;return true;
 }
 setVolume(value){if(!Number.isFinite(value))return;this.volumeInitialized=true;this.volumeIntro=null;this.userVolume=THREE.MathUtils.clamp(value,0,1);this.userMuted=false;}
 toggleMute(){this.volumeInitialized=true;this.volumeIntro=null;if(this.volumeLevel===0){if(this.userVolume===0)this.userVolume=.5;this.userMuted=false;}else this.userMuted=true;}
 updateSound(delta,audible){
  if(!this.video)return;
  const dt=Math.min(delta,.05),canHear=audible&&this.allowed&&!document.hidden;
  const introducing=this.volumeIntro!==null;
  if(introducing&&canHear&&this.playing){
   this.volumeIntro=Math.min(1,this.volumeIntro+dt/.9);
   const p=this.volumeIntro;this.userVolume=.5*p*p*(3-2*p);
   if(p===1)this.volumeIntro=null;
  }
  const target=canHear?this.volumeLevel:0;
  // The first rise drives both the rail and actual audio with the same envelope.
  if(introducing&&canHear)this.volume=target;
  else this.volume+=(target-this.volume)*(1-Math.exp(-dt*7));
  this.video.volume=this.volume;this.video.muted=this.volume<.001;
 }
 toggle(){if(!this.active)return;if(this.video.ended)this.restart(this.index);else this.active.paused=this.active.blocked?false:!this.active.paused;this.active.blocked=false;this.syncPlayback();}
 get seekable(){return !!(this.active?.ready&&Number.isFinite(this.video.duration)&&this.video.duration>0);}
 get progress(){return this.seekable?THREE.MathUtils.clamp(this.video.currentTime/this.video.duration,0,1):0;}
 seek(progress){if(this.disposed||!this.seekable||!Number.isFinite(progress))return;this.active.endedHandled=false;this.video.currentTime=Math.min(this.video.duration-.001,THREE.MathUtils.clamp(progress,0,1)*this.video.duration);this.syncPlayback();}
 syncPlayback(){
  if(this.disposed)return;const entry=this.active;if(!entry)return;
  if(this.allowed&&!entry.paused&&!document.hidden&&entry.ready&&!entry.blocked&&!entry.video.ended){
   if(entry.video.paused&&!entry.pending){
    entry.pending=true;
    Promise.resolve(entry.video.play()).catch(error=>{
     if(error.name!=="AbortError"&&entry===this.active&&this.allowed&&!entry.paused&&!document.hidden)entry.blocked=true;
    }).finally(()=>{entry.pending=false;if(entry!==this.active||this.disposed)entry.video.pause();else this.syncPlayback();});
   }
  }else entry.video.pause();
 }
 dispose(){
  this.disposed=true;document.removeEventListener("visibilitychange",this._onVisibility);
  for(const entry of this.entries){
   if(!entry)continue;entry.finish?.();
   entry.video.removeEventListener("loadeddata",entry.onLoaded);entry.video.removeEventListener("error",entry.onError);
   if(entry.onFrameChanged)for(const event of ["loadeddata","seeked","pause"])entry.video.removeEventListener(event,entry.onFrameChanged);
   entry.video.pause();entry.video.removeAttribute("src");entry.video.load();entry.texture.dispose();
  }
  this.posters.forEach(texture=>texture.dispose());
 }
}
