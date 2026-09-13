import test from "node:test";
import assert from "node:assert/strict";
import { FilmLabelTransition } from "./filmLabelTransition.js";

test("label swaps only at zero reveal, then assembles the latest request",()=>{
 const m=new FilmLabelTransition();m.update(0,0);let previous=m.key;
 for(let i=0;i<90;i++){
  const wanted=i<4?1:5,reveal=m.update(1/60,wanted);
  if(m.key!==previous)assert.equal(reveal,0);
  previous=m.key;
 }
 assert.equal(m.key,5);assert.equal(m.reveal,1);assert.equal(m.phase,0);
});
test("global language swap adopts the prepared cell while fully hidden",()=>{
 const m=new FilmLabelTransition();m.update(0,0);
 assert.equal(m.update(.03,0,.3),.3);
 assert.equal(m.update(.03,2,0),0);assert.equal(m.key,2);
 assert.equal(m.update(.03,2,.2),.2);
 assert.equal(m.update(.03,2,1),1);
});
test("warm and dormant updates settle silently, without starting a pending animation",()=>{
 const m=new FilmLabelTransition();m.update(0,0);m.update(.03,1);
 m.update(0,4,1,false);assert.equal(m.key,4);assert.equal(m.phase,0);assert.equal(m.reveal,1);
});
