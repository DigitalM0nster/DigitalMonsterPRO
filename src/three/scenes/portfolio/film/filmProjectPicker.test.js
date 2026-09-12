import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { FilmProjectPickerState, getFilmPickerCardLayout } from "./FilmProjectPicker.js";
import { filmProjects } from "../../../../pages/portfolio/data/filmProjects.js";
import { plannedPortfolioProjects } from "../../../../pages/portfolio/data/plannedProjects.js";

const advance=(state,frames=60,active=true)=>{for(let i=0;i<frames;i++)state.update(1/60,active);};

test("hover highlights projects without opening the selection screen",()=>{
 const state=new FilmProjectPickerState();
 for(const target of ["projects","inspect","project-picker",2,null]){
  state.hover(target);advance(state);assert.equal(state.progress,0);
 }
});

test("click opens the screen and moving the pointer outside does not dismiss it",()=>{
 const state=new FilmProjectPickerState();state.toggle();advance(state);
 assert.ok(state.progress>.99);
 for(const target of [2,"project-picker",null,"inspect"]){
  state.hover(target);advance(state);assert.ok(state.progress>.99);
 }
});

test("the close button stays closed under a stationary pointer",()=>{
 const state=new FilmProjectPickerState();state.hover("projects");state.toggle();advance(state);
 state.toggle();advance(state);assert.equal(state.progress,0);
 advance(state);assert.equal(state.progress,0);
 state.toggle();advance(state);assert.ok(state.progress>.99);
});

test("leaving the scene closes the screen and returning does not reopen it",()=>{
 const state=new FilmProjectPickerState();state.open();advance(state);
 advance(state,60,false);assert.equal(state.progress,0);assert.equal(state.pinned,false);
 advance(state);assert.equal(state.progress,0);
});

test("selecting a project or pressing Escape closes without reopening on hover",()=>{
 const state=new FilmProjectPickerState();state.open();state.hover(3);advance(state);
 state.close();advance(state);assert.equal(state.progress,0);
 state.hover("projects");advance(state);assert.equal(state.progress,0);
});

test("every approved project is selectable and has a real local poster",()=>{
 assert.deepEqual(filmProjects.map(p=>p.id),plannedPortfolioProjects.map(p=>p.id));
 for(const project of filmProjects){
  assert.ok(statSync(new URL('../../../../../public'+project.poster,import.meta.url)).size>1000,project.id);
  for (const source of [project.video, project.videoLow]) {
   assert.match(source, /presentation-v\d+-(1080|540)\.mp4$/, project.id);
   assert.ok(statSync(new URL('../../../../../public'+source,import.meta.url)).size>100000,source);
  }
 }
});

test("five and seven project targets fit the screen without overlapping each other or its header",()=>{
 for(const count of [5,7])for(const compact of [false,true]){
  const targets=Array.from({length:count},(_,i)=>getFilmPickerCardLayout(i,count,compact).hit);
  for(const [i,[x,y,w,h]] of targets.entries()){
   assert.ok(Math.abs(x)+w/2<=.49);
   assert.ok(y+h/2<=.144&&y-h/2>=-.245);
   for(const [otherX,otherY,otherW,otherH] of targets.slice(i+1)){
    assert.ok(Math.abs(x-otherX)>=(w+otherW)/2||Math.abs(y-otherY)>=(h+otherH)/2);
   }
  }
 }
});
