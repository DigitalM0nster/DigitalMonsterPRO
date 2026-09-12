// Offline capture clock: F8 pauses/resumes; F9 advances exactly 1/60 second.
// Source handlers and CSS animations remain original; only elapsed time is controlled.
(() => {
  if (!new URLSearchParams(location.search).has('capture')) return;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const RealDate = Date;
  let now = realNow(), last = now, frozen = false, uid = 1;
  const epoch = RealDate.now() - now, timers = new Map(), rafs = new Map(), animations = new Map();
  window.setTimeout = (fn, delay = 0, ...args) => {
    const id = uid++; timers.set(id,{fn,args,due:now+Math.max(1,Number(delay)||0),repeat:0}); return id;
  };
  window.setInterval = (fn, delay = 0, ...args) => {
    const id=uid++;timers.set(id,{fn,args,due:now+Math.max(1,Number(delay)||0),repeat:Math.max(1,Number(delay)||0)});return id;
  };
  window.clearTimeout = window.clearInterval = id => timers.delete(id);
  window.requestAnimationFrame = fn => {const id=uid++;rafs.set(id,fn);return id};
  window.cancelAnimationFrame = id => rafs.delete(id);
  Object.defineProperty(performance,'now',{value:()=>now});
  window.Date = class extends RealDate {constructor(...args){super(...(args.length ? args : [epoch+now]))} static now(){return epoch+now}};
  function syncAnimations(dt=0) {
    // Flush source class/style writes so newly-created CSS transitions join this frame.
    void document.documentElement.offsetWidth;
    const active = new Set(document.getAnimations());
    for (const animation of active) {
      if (!animations.has(animation)) {animations.set(animation,Number(animation.currentTime)||0);animation.pause()}
      else animations.set(animation,animations.get(animation)+dt);
      animation.currentTime = animations.get(animation);
    }
    for (const animation of animations.keys()) if (!active.has(animation)) animations.delete(animation);
  }
  function advance(dt) {
    const end=now+dt;
    for(let guard=0;guard<1000;guard++) {
      const due=[...timers].filter(([,v])=>v.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];
      if(!due)break;
      const [id,task]=due;now=task.due;
      if(task.repeat)task.due+=task.repeat;else timers.delete(id);
      if(typeof task.fn==='function')task.fn(...task.args);
    }
    now=end;const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn(now));
    if(frozen)syncAnimations(dt);
  }
  function pump(t) {if(!frozen)advance(Math.max(0,t-last));last=t;nativeRaf(pump)}
  nativeRaf(pump);
  window.addEventListener('keydown',e=>{
    if(e.key==='F8') {
      e.preventDefault();frozen=!frozen;
      if(frozen)syncAnimations();else {animations.forEach((_,a)=>a.play());animations.clear()}
      document.documentElement.dataset.captureMode=frozen?'paused':'live';
    }
    if(e.key==='F9' && frozen) {e.preventDefault();advance(1000/60)}
  },true);
})();
