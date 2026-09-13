/** Swap prepared text only while invisible; rapid requests keep the latest label. */
export class FilmLabelTransition {
 constructor() { this.key=null;this.reveal=1;this.phase=0; }
 update(delta,key,localeReveal=1,active=true) {
  if(this.key===null||!active||localeReveal<=.00001){this.key=key;this.reveal=1;this.phase=0;}
  else {
   if(key!==this.key)this.phase=-1;
   const dt=Math.max(0,Math.min(.05,delta));
   if(this.phase<0){
    this.reveal=Math.max(0,this.reveal-dt/.24);
    if(this.reveal===0){this.key=key;this.phase=1;}
   }else if(this.phase>0){
    this.reveal=Math.min(1,this.reveal+dt/.52);
    if(this.reveal===1)this.phase=0;
   }
  }
  return Math.min(this.reveal,localeReveal);
 }
}
