import { loadAudioBuffer } from "@/sounds/audioAssetCache.js";
import { SOUND_CATALOG } from "@/sounds/soundCatalog.js";
import { connectGainWithPanToMasterBus, getMasterAudioContext, resumeMasterAudioContext } from "@/sounds/masterAudioBus.js";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "@/sounds/pageVisibilitySound.js";
import { isSoundAudible, isSiteSoundMuteFading, registerSiteSoundMuteHandler } from "@/sounds/siteSoundToggle.js";

const VOLUME = .22;
const REST_FADE = .32;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let preparedBuffer;

async function prepareGrains(ctx) {
 const source=await loadAudioBuffer(SOUND_CATALOG.digital_sound,ctx);
 let peak=0;
 for(let channel=0;channel<source.numberOfChannels;channel++){
  for(const sample of source.getChannelData(channel))peak=Math.max(peak,Math.abs(sample));
  await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 // The site's source is deliberately very quiet. Normalise a private copy once,
 // then use the envelope's modest gain; never alter the cache used by menu sounds.
 const buffer=ctx.createBuffer(source.numberOfChannels,source.length,source.sampleRate);
 const gain=Math.min(128,.75/Math.max(.001,peak));
 for(let channel=0;channel<source.numberOfChannels;channel++){
  const input=source.getChannelData(channel),output=buffer.getChannelData(channel);
  for(let i=0;i<input.length;i++)output[i]=input[i]*gain;
  await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 return buffer;
}

/** A soft electrical scrub driven by the screen's painted mosaic, never by click intent. */
export class FilmTransitionSound {
 constructor() {
  this.buffer=null;this.voice=null;this.entries=new Set();this.lastProgress=null;this.index=null;this.phase=0;this.disposed=false;
  this.unbindMute=registerSiteSoundMuteHandler({onFadeStart:()=>this.stop(.10),onMuteComplete:()=>this.stop(.10)});
  this.unbindVisibility=registerPageVisibilitySoundHandlers({suspend:()=>this.stop(.10)});
 }
 async prepare() {
  const ctx=getMasterAudioContext();if(!ctx)return;
  preparedBuffer??=prepareGrains(ctx).catch(()=>{preparedBuffer=null;return null;});
  const buffer=await preparedBuffer;if(!this.disposed)this.buffer=buffer;
 }
 fade(entry,seconds=REST_FADE) {
  if(!entry||entry.stopping)return;
  entry.stopping=true;
  const now=entry.source.context.currentTime;
  entry.gain.gain.cancelScheduledValues(now);
  entry.gain.gain.setTargetAtTime(0,now,seconds/5);
  entry.source.stop(now+seconds);
  if(this.voice===entry)this.voice=null;
 }
 start(ctx,offset,rate) {
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  const low=ctx.createBiquadFilter(),high=ctx.createBiquadFilter();
  source.buffer=this.buffer;source.loop=true;source.playbackRate.value=rate;
  high.type="highpass";high.frequency.value=280;high.Q.value=.5;
  low.type="lowpass";low.frequency.value=3400;low.Q.value=.45;
  gain.gain.value=0;
  source.connect(high);high.connect(low);low.connect(gain);
  connectGainWithPanToMasterBus(ctx,gain,0);
  const entry={source,gain,low,high,offset,updatedAt:ctx.currentTime,stopping:false};
  this.entries.add(entry);this.voice=entry;
  source.onended=()=>{
   source.disconnect();gain.disconnect();low.disconnect();high.disconnect();
   this.entries.delete(entry);if(this.voice===entry)this.voice=null;
  };
  source.start(ctx.currentTime,offset);
  // Renewal requires visible animation frames: a dormant scene cannot strand a loop.
  source.stop(ctx.currentTime+.42);
  return entry;
 }
 update(delta,motion,enabled) {
  const progress=Math.abs(motion.progress),previous=this.lastProgress??progress;
  const changed=this.index!==motion.index,difference=Math.abs(progress-previous);
  this.lastProgress=progress;this.index=motion.index;
  if(changed){this.phase=0;this.stop(.12);return;}
  if(this.disposed||!enabled||!this.buffer||!isSoundAudible()||isSiteSoundMuteFading()||!isPageSoundAllowed(true)){
   this.stop(.12);return;
  }
  if(difference>.5||delta>.15){this.phase=0;this.stop(.12);return;}
  const speed=difference/Math.max(.001,delta),duration=this.buffer.duration;
  if(!motion.busy||speed<.015||speed*duration<.3){this.stop();return;}
  const ctx=getMasterAudioContext();
  if(ctx?.state!=="running"){void resumeMasterAudioContext();return;}
  // Both directions keep the same timbre; reversing the mosaic advances the soft grain bed.
  this.phase=(this.phase+difference)%1;
  const offset=this.phase*duration,rate=clamp(speed*duration,.65,1.8),now=ctx.currentTime;
  let entry=this.voice;
  let predicted=entry?(entry.offset+(now-entry.updatedAt)*entry.source.playbackRate.value)%duration:offset;
  const drift=Math.abs(predicted-offset);
  if(!entry||Math.min(drift,duration-drift)>.16){
   this.fade(entry,.10);entry=this.start(ctx,offset,rate);predicted=offset;
  }
  entry.offset=predicted;entry.updatedAt=now;
  const envelope=Math.pow(Math.max(0,Math.sin(progress*Math.PI)),.65);
  entry.source.playbackRate.setTargetAtTime(rate,now,.045);
  entry.gain.gain.cancelScheduledValues(now);
  entry.gain.gain.setTargetAtTime(VOLUME*envelope*Math.min(1,speed/.7),now,.035);
  entry.gain.gain.setTargetAtTime(0,now+.14,.065);
  entry.source.stop(now+.42);
 }
 stop(seconds=REST_FADE){for(const entry of this.entries)this.fade(entry,seconds);}
 dispose(){this.disposed=true;this.stop(.06);this.unbindMute();this.unbindVisibility();this.buffer=null;}
}
