/** Present the already decoded video; the native player owns its controls until exit. */
export class FilmNativePlayer {
 constructor(media, entry) {
  this.media=media;this.entry=entry;this.video=entry.video;this.closed=false;this.entered=false;
  this.focus=document.activeElement;
  this.dialog=document.createElement("dialog");
  this.dialog.setAttribute("aria-label","Видеоплеер");
  this.dialog.setAttribute("data-canvas-pointer-blocker","true");
  this.dialog.style.cssText="position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#000;color:#fff;overflow:hidden";
  const close=document.createElement("button");
  close.type="button";close.textContent="✕";close.setAttribute("aria-label","Закрыть видео");
  close.style.cssText="position:absolute;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));width:44px;height:44px;z-index:1;border:1px solid #00a9ff;background:#020507;color:#e4f6ff;font-size:24px;cursor:pointer";
  close.addEventListener("click",()=>this.close());
  this.dialog.addEventListener("cancel",event=>{event.preventDefault();this.close();});
  this.onFullscreen=()=>{
   if(document.fullscreenElement===this.video)this.entered=true;
   else if(this.entered)this.close();
  };
  this.onNativeEnd=()=>this.close();
  document.addEventListener("fullscreenchange",this.onFullscreen);
  this.video.addEventListener("webkitendfullscreen",this.onNativeEnd);
  this.video.controls=true;
  this.video.style.cssText="display:block;width:100%;height:100%;object-fit:contain;background:#000";
  this.dialog.append(this.video,close);document.body.append(this.dialog);
 }
 open() {
  this.dialog.showModal();
  // Both APIs must run directly in the tap, before awaiting play or any other work.
  try {
   if(typeof this.video.webkitEnterFullscreen==="function")this.video.webkitEnterFullscreen();
   else if(typeof this.video.requestFullscreen==="function") {
    Promise.resolve(this.video.requestFullscreen()).catch(()=>{ /* Native controls remain in the HTML dialog. */ });
   }
  } catch { /* Unsupported fullscreen still leaves a usable ordinary video player. */ }
  if(this.video.ended)this.media.restart(this.media.index);
  this.entry.paused=false;this.entry.blocked=false;
  Promise.resolve(this.video.play()).catch(()=>{ /* The player's own Play button can retry. */ });
 }
 close() {
  if(this.closed)return;this.closed=true;
  const {media,entry,video}=this;
  document.removeEventListener("fullscreenchange",this.onFullscreen);
  video.removeEventListener("webkitendfullscreen",this.onNativeEnd);
  if(document.fullscreenElement===video)Promise.resolve(document.exitFullscreen()).catch(()=>{});
  if(video.webkitDisplayingFullscreen)video.webkitExitFullscreen?.();
  // Keep native seeking, pause and sound choices when returning to the scene.
  entry.paused=video.paused||video.ended;entry.blocked=false;
  media.setVolume(video.volume);media.userMuted=video.muted;media.volume=video.volume;
  video.controls=false;video.style.cssText="";video.remove();
  this.dialog.close();this.dialog.remove();
  media.nativePlayer=null;
  if(this.focus?.isConnected)this.focus.focus({preventScroll:true});
  media.syncPlayback();
 }
}
