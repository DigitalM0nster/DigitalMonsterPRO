import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers';
import { CityRoadFlow } from './CityRoadFlow.js';
import { sampleCityTrafficVehicle } from './cityTrafficMotion.js';
import { CITY_TRAFFIC_DEFAULTS } from './cityTrafficConfig.js';

test('roundabout traffic enters and leaves the road network instead of orbiting an isolated island', () => {
 const { paths, ribbons, branches, graph } = JSON.parse(readFileSync(new URL('../../../../../public/models/posibility5/city-flow-paths.json', import.meta.url), 'utf8'));
 const circles = ribbons.filter(path => path.kind === 'circulation');
 assert.equal(circles.length, 10);
 // Longer tangent transitions now cover part of the former circular arc.
 assert.ok(graph.minimumArcDegrees > 135, 'traffic must continue past intermediate exits');
 assert.equal(branches.length, graph.ports);
 for (const circle of circles) {
  assert.equal(circle.closed, true);
  assert.deepEqual(circle.points[0], circle.points.at(-1));
  const [cx, cy] = [[-85, -69], [94, 66]][circle.ring];
  const radius = [13.4, 12.7, 12, 11.3, 10.6][circle.lane - 1];
  let winding = 0;
  for (let i = 1; i < circle.points.length; i++) {
   const a = circle.points[i - 1], b = circle.points[i];
   assert.ok(Math.abs(Math.hypot(b[0] - cx, b[1] - cy) - radius) < 0.001);
   winding += Math.atan2((a[0] - cx) * (b[1] - cy) - (a[1] - cy) * (b[0] - cx),
    (a[0] - cx) * (b[0] - cx) + (a[1] - cy) * (b[1] - cy));
  }
  assert.ok(Math.abs(winding - Math.PI * 2) < 0.001, 'complete one-way circle');
  for (const branch of branches.filter(r => r.ring === circle.ring && r.lane === circle.lane)) {
   const join = branch.kind === 'entry' ? branch.points.at(-1) : branch.points[0];
   assert.ok(Math.abs(Math.hypot(join[0] - cx, join[1] - cy) - radius) < 0.001, 'branch joins the circulating lane');
   const a = branch.kind === 'entry' ? branch.points.at(-2) : branch.points[0];
   const b = branch.kind === 'entry' ? branch.points.at(-1) : branch.points[1];
   const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
   const alignment = (dx * -(join[1] - cy) + dy * (join[0] - cx)) / (length * radius);
   assert.ok(alignment > 0.9998, `${branch.name}: kink at the circle`);
   const approach = ribbons.find(r => r.kind === 'approach' && r.points.some(p => p[0] === a[0] && p[1] === a[1]));
   assert.ok(approach, 'branch and approach must share one uncut light ribbon');
  }
 }
 for (const [cx, cy] of [[-85, -69], [94, 66]]) {
  let approaches = 0;
  for (const path of paths) {
   const radii = path.points.map(([x, y]) => Math.hypot(x - cx, y - cy));
   if (Math.min(...radii) >= 16.6) continue;
   approaches++;
   assert.ok(Math.max(...radii) > 28, `${path.name}: isolated inner ring`);
   const start = radii.indexOf(Math.max(...radii));
   const ordered = path.closed ? radii.slice(start).concat(radii.slice(0, start + 1)) : radii;
   let entries = 0, exits = 0;
   for (let i = 1; i < ordered.length; i++) {
    if (ordered[i - 1] >= 22 && ordered[i] < 22) entries++;
    if (ordered[i - 1] < 22 && ordered[i] >= 22) exits++;
   }
   assert.ok(entries > 0, `${path.name}: missing entry`);
   assert.equal(entries, exits, `${path.name}: missing exit`);
   for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    const x = (a[0] + b[0]) / 2 - cx, y = (a[1] + b[1]) / 2 - cy;
    if (Math.hypot(x, y) < 13.5)
     assert.ok(x * (b[1] - a[1]) - y * (b[0] - a[0]) >= -0.00001, `${path.name}: opposing circulation`);
   }
  }
  assert.ok(approaches >= 3, 'roundabout must retain multiple connected approaches');
 }
 for (const path of paths) for (let i = 1; i < path.points.length - 1; i++) {
  const a = path.points[i - 1], b = path.points[i], c = path.points[i + 1];
  if (!(b[0] > -72 && b[0] < -50 && b[1] > -68 && b[1] < -41)) continue;
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (length > 1e-10)
   assert.ok((ux * vx + uy * vy) / length > Math.cos(6 * Math.PI / 180), `${path.name}: sharp east-junction corner`);
 }
 // Crossing turns belong inside the compact intersection, never on a taper.
 assert.equal(graph.eastJunction.type, "compact three-arm intersection");
 assert.ok(graph.eastJunction.medianGap <= 1);
 const segments = [];
 for (const [route, path] of paths.entries()) for (let i = 1; i < path.points.length; i++) {
  const a = path.points[i - 1], b = path.points[i];
  if (![a,b].every(p => p[0] > -72 && p[0] < -50 && p[1] > -62 && p[1] < -43)) continue;
  segments.push({route,a,b,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0])});
 }
 segments.sort((a,b) => a.minX - b.minX);
 const side = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for (let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length && segments[j].minX<segments[i].maxX;j++) {
  const p=segments[i],q=segments[j];
  if(p.route===q.route)continue;
  const crossed=side(p.a,p.b,q.a)*side(p.a,p.b,q.b)<-1e-12 && side(q.a,q.b,p.a)*side(q.a,q.b,p.b)<-1e-12;
  if(crossed) {
   const center=graph.eastJunction.center;
   assert.ok([p.a,p.b,q.a,q.b].every(v=>Math.hypot(v[0]-center[0],v[1]-center[1])<graph.eastJunction.radius),
    `${paths[p.route].name}/${paths[q.route].name}: crossing outside the intersection`);
  }
 }
});

test('outer streets continue beyond the old city boundary with compact opposing lanes', () => {
 const { paths, ribbons } = JSON.parse(readFileSync(new URL('../../../../../public/models/posibility5/city-flow-paths.json', import.meta.url), 'utf8'));
 for (const route of paths.filter(route => !route.closed)) {
  for (const [x, y] of [route.points[0], route.points.at(-1)]) {
   assert.ok(!(x > -143 && x < -140) && Math.abs(y - 201) > .01
     && !(x > 140 && x < 146 && y < 190) && Math.abs(y + 111) > .1,
   `${route.name}: still clipped at the old boundary`);
  }
 }
 const arterial = ribbons.filter(route => route.name.startsWith('Western arterial'));
 assert.equal(arterial.length, 7, 'draw each shared outer lane once');
 const banks = [[], []];
 for (const lane of arterial) {
  assert.ok(Math.max(lane.points[0][1], lane.points.at(-1)[1]) >= 355 - .0001);
  banks[lane.points.at(-1)[1] > lane.points[0][1] ? 1 : 0].push(lane.points[0][0]);
 }
 for (const bank of banks) {
  bank.sort((a, b) => a - b);
  for (let i = 1; i < bank.length; i++) assert.ok(Math.abs(bank[i] - bank[i - 1] - .55) < .0001);
 }
 assert.ok(Math.abs(banks[1][0] - banks[0].at(-1) - .9) < .0001, 'opposing traffic must not split into widely separated roads');
});

test('far approaches replace pointed hairpins with connected, smooth streets', () => {
 const { paths, ribbons, graph, background } = JSON.parse(readFileSync(new URL('../../../../../public/models/posibility5/city-flow-paths.json', import.meta.url), 'utf8'));
 assert.equal(graph.refinedApproaches.reconnectedHairpins, 2);
 assert.ok(graph.expandedEdges.east > 0 && graph.expandedEdges.south > 0);
 assert.ok(background.peripheralInstances >= 200, 'districts must extend around the city, not only in front of the camera');
 for (const route of [...paths, ...ribbons]) for (let i = 1; i < route.points.length - 1; i++) {
  const [a, b, c] = route.points.slice(i - 1, i + 2);
  if (!graph.refinedApproaches.regions.some(([x0, y0, x1, y1]) => b[0] >= x0 && b[0] <= x1 && b[1] >= y0 && b[1] <= y1)) continue;
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  if (Math.hypot(ux, uy) * Math.hypot(vx, vy) < 1e-9) continue;
  const angle = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  assert.ok(angle < 6 * Math.PI / 180, `${route.name}: sharp repaired approach at ${b}`);
 }
 const blockLoops = paths.filter(p => p.name.endsWith('/ connected west block'));
 assert.equal(blockLoops.length, 2);
 for (const route of blockLoops) {
  assert.equal(route.closed, true);
  assert.deepEqual(route.points[0], route.points.at(-1));
  assert.equal(route.scheduled, true);
  assert.ok(Math.max(...route.points.map(p => p[0])) - Math.min(...route.points.map(p => p[0])) > 100,
    'the repaired movement must retain the neighbouring street network');
 }
});

test('west crossroads connects every approach to straight, left, right and U-turn departures', () => {
 const { paths, graph } = JSON.parse(readFileSync(new URL('../../../../../public/models/posibility5/city-flow-paths.json', import.meta.url), 'utf8'));
 const junction = graph.westCrossroads;
 const [minX, minY, maxX, maxY] = junction.bounds;
 const inside = ([x, y]) => x >= minX - .0001 && x <= maxX + .0001 && y >= minY - .0001 && y <= maxY + .0001;
 const arm = ([x, y]) => [['W', Math.abs(x - minX)], ['E', Math.abs(x - maxX)], ['S', Math.abs(y - minY)], ['N', Math.abs(y - maxY)]].sort((a, b) => a[1] - b[1])[0][0];
 const movements = new Map(['N', 'E', 'S', 'W'].map(side => [side, new Set()]));
 for (const route of paths) for (const visit of route.junctionMovements ?? []) {
  const crossing = route.points.filter(inside);
  assert.ok(crossing.length > 3, `${route.name}: missing crossing geometry`);
  assert.equal(arm(crossing[0]), visit.entry);
  assert.equal(arm(crossing.at(-1)), visit.exit);
  assert.ok(!inside(route.points[0]) && !inside(route.points.at(-1)), 'journeys must continue outside the junction');
  assert.equal(route.scheduled, true, 'crossing movements must use the conflict-checked fleet');
  movements.get(visit.entry).add(visit.maneuver);
 }
 for (const [entry, choices] of movements) assert.deepEqual([...choices].sort(), ['left', 'right', 'straight', 'uturn'], `${entry}: missing a manoeuvre`);
 assert.equal(Object.keys(junction.movements).length, 16);
 assert.equal(junction.turns.filter(turn => turn.maneuver === 'uturn').length, 4);
 for (const turn of junction.turns) {
  assert.ok(turn.points.every(inside), `${turn.entry}-${turn.exit}: turn leaves the junction`);
  for (let i = 1; i < turn.points.length - 1; i++) {
   const [a, b, c] = turn.points.slice(i - 1, i + 2);
   const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
   const angle = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
   assert.ok(angle < 6 * Math.PI / 180, 'no sharp corner in a turning trajectory');
  }
 }
});

function intersects(a, b) {
 const dx=b.x-a.x,dz=b.z-a.z;
 const al=.95/4.5*a.size,aw=.42/4.5*a.size,bl=.95/4.5*b.size,bw=.42/4.5*b.size;
 for(const [x,z] of [[a.dx,a.dz],[a.dz,-a.dx],[b.dx,b.dz],[b.dz,-b.dx]]) {
  const ra=al*Math.abs(a.dx*x+a.dz*z)+aw*Math.abs(a.dz*x-a.dx*z);
  const rb=bl*Math.abs(b.dx*x+b.dz*z)+bw*Math.abs(b.dz*x-b.dx*z);
  if(Math.abs(dx*x+dz*z)>=ra+rb)return false;
 }
 return true;
}

test('prepared city traffic passes without intersections, stops or extra uploads at 3x', async()=>{
 const originalRaf=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=(fn)=>setImmediate(fn);
 let flow;
 try {
  const paths=JSON.parse(readFileSync(new URL('../../../../../public/models/posibility5/city-flow-paths.json',import.meta.url),'utf8'));
  flow=await CityRoadFlow.create(paths);flow.setSettings(CITY_TRAFFIC_DEFAULTS);
  const attrs=flow.cars.geometry.attributes;
  const cars=Array.from(attrs.aSize.array,(size,id)=>({id,size,
   route:attrs.aRoute.array.slice(id*4,id*4+4),motion:attrs.aMotion.array.slice(id*4,id*4+4),
   closed:attrs.aClosed.array[id],x:0,z:0,dx:0,dz:0,travel:0,previous:null}));
  let passingSamples=0,returnSamples=0;
  for(let frame=0;frame<1200;frame++) {
   for(const car of cars) {
    sampleCityTrafficVehicle(flow.prepared,car.route,car.motion,car.closed,frame/10,car);
    if(car.previous!==null) {
     const progress=(car.travel-car.previous+1)%1;
     assert.ok(progress>0&&progress<.1,`stopped or reversed vehicle ${car.id}`);
    }
    car.previous=car.travel;
    if(Math.abs(car.offset)>.25)passingSamples++;
    if(Math.abs(car.offset)<.005)returnSamples++;
   }
   const visible=cars.filter(c=>c.closed||(c.travel*c.route[3]>5&&(1-c.travel)*c.route[3]>5)).sort((a,b)=>a.x-b.x);
   for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length&&visible[j].x-visible[i].x<.7;j++) {
    if(Math.abs(visible[i].z-visible[j].z)<.7)
     assert.equal(intersects(visible[i],visible[j]),false,`vehicles ${visible[i].id}/${visible[j].id} at ${frame/10}s`);
   }
  }
  assert.ok(passingSamples>100,'actual lateral overtakes must occur');
  assert.ok(returnSamples>passingSamples,'traffic must return from overtaking');
  // All scheduled fleets repeat after the same headway. Validate a full period
  // with the largest body, including merges shared by different vehicle routes.
  const scheduled = cars.filter(car => paths.paths[car.route[0]].scheduled);
  for (const car of scheduled) car.size = 1.2;
  for (let time = 0; time < paths.schedule.headway; time += 0.025) {
   for (const car of scheduled) sampleCityTrafficVehicle(flow.prepared, car.route, car.motion, car.closed, time, car);
   scheduled.sort((a,b) => a.x - b.x);
   for (let i = 0; i < scheduled.length; i++) for (let j = i + 1; j < scheduled.length && scheduled[j].x - scheduled[i].x < 0.7; j++) {
    if (Math.abs(scheduled[i].z - scheduled[j].z) < 0.7)
     assert.equal(intersects(scheduled[i], scheduled[j]), false, `scheduled merge ${scheduled[i].id}/${scheduled[j].id} at ${time}s`);
   }
  }
  const texture=flow.pathTexture,version=texture.version,geometry=flow.cars.geometry;
  for(const speed of [1,3]) {
   flow.speed=speed;const before=flow.points.material.uniforms.uTime.value;
   for(let i=0;i<600;i++)flow.update(1/60,1);
   assert.ok(Math.abs(flow.points.material.uniforms.uTime.value-before-10*speed)<1e-7);
   assert.equal(texture.version,version,'path data must never upload during movement');
   assert.equal(flow.cars.geometry,geometry);
  }
  assert.equal(flow.cars.material.uniforms.uTime,flow.points.material.uniforms.uTime);
 } finally {
  flow?.dispose();
  if(originalRaf)globalThis.requestAnimationFrame=originalRaf;else delete globalThis.requestAnimationFrame;
 }
});
