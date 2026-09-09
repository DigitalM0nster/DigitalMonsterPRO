import * as THREE from "three";

const STEP = 0.2;
export const CITY_PATH_SAMPLES = 2048;
const clamp = THREE.MathUtils.clamp;

function prepareLane(path) {
  const points = path.points.map(([x, y, z]) => new THREE.Vector3(x, z + 0.22, -y));
  if (path.direction === -1) points.reverse();
  if (path.closed && !points[0].equals(points.at(-1))) points.push(points[0].clone());
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const length = lengths.at(-1), count = Math.ceil(length / STEP) + 1;
  const positions = new Float32Array(count * 3), limits = new Float32Array(count), turns = new Float32Array(count);
  const point = new THREE.Vector3();
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const distance = length * i / (count - 1);
    while (segment < points.length - 1 && lengths[segment] < distance) segment++;
    point.lerpVectors(points[segment - 1], points[segment],
      (distance - lengths[segment - 1]) / Math.max(1e-7, lengths[segment] - lengths[segment - 1]));
    positions.set([point.x, point.y, point.z], i * 3);
  }
  const at = (i) => (path.closed ? (i % (count - 1) + count - 1) % (count - 1) : clamp(i, 0, count - 1)) * 3;
  const curvatureWindow = Math.max(1, Math.round(0.8 / (length / (count - 1))));
  for (let i = 0; i < count; i++) {
    const a = at(i - curvatureWindow), b = at(i), c = at(i + curvatureWindow);
    const ux = positions[b] - positions[a], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[b], vz = positions[c + 2] - positions[b + 2];
    const before = Math.hypot(ux, uz), after = Math.hypot(vx, vz);
    const angle = before * after > 1e-6 ? Math.acos(clamp((ux * vx + uz * vz) / (before * after), -1, 1)) : 0;
    const curvature = angle / Math.max(0.1, (before + after) * 0.5);
    turns[i] = curvature;
    limits[i] = clamp(Math.sqrt(0.28 / Math.max(0.001, curvature)), 0.55, 4.5);
  }
  // Anticipate a bend with bounded braking; a closed lane also propagates across its seam.
  const ds = length / (count - 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = count - 2; i >= 0; i--)
      limits[i] = Math.min(limits[i], Math.sqrt(limits[i + 1] ** 2 + 2 * 0.45 * ds));
    if (path.closed) limits[count - 1] = limits[0] = Math.min(limits[0], limits[count - 1]);
    for (let i = 1; i < count; i++)
      limits[i] = Math.min(limits[i], Math.sqrt(limits[i - 1] ** 2 + 2 * 0.24 * ds));
  }
  return { positions, limits, turns, length, count, closed: path.closed, clearance: path.passingClearance ?? 0.3 };
}

/** Arc length and bend-speed mapping prepared once. Runtime movement is a time uniform. */
export async function prepareCityTrafficMotion(paths) {
 const pixels = new Float32Array(CITY_PATH_SAMPLES * paths.length * 4);
 const lengths = [], costs = [];
 for (let row = 0; row < paths.length; row++) {
  const lane = prepareLane(paths[row]);
  const travel = new Float32Array(lane.count);
  const ds = lane.length / (lane.count - 1);
  let previous = 1 / clamp(lane.limits[0] / 3.2, 0.4, 1);
  for (let i = 1; i < lane.count; i++) {
   const current = 1 / clamp(lane.limits[i] / 3.2, 0.4, 1);
   travel[i] = travel[i - 1] + ds * (previous + current) * 0.5; previous = current;
  }
  const cost = travel[lane.count - 1];
  lengths.push(lane.length); costs.push(cost);
  const pairs = Math.min(60, Math.max(1, Math.floor(lane.length / 10)));
  const spanCost = cost * Math.min(0.2 / pairs, 0.095 / Math.max(1, Math.floor(pairs * 0.4)));
  const zones = [];
  let start = 0;
  for (let i = 1; lane.clearance > 0 && i < lane.count; i++) {
   if (lane.turns[i] < 0.025 && i < lane.count - 1) continue;
   if (travel[i - 1] - travel[start] > Math.max(45, spanCost * 24))
    zones.push([travel[start], travel[i - 1]]);
   start = i + 1;
  }
  let segment = 1;
  for (let sample = 0; sample < CITY_PATH_SAMPLES; sample++) {
   const distance = cost * sample / (CITY_PATH_SAMPLES - 1);
   while (segment < lane.count - 1 && travel[segment] < distance) segment++;
   const f = (distance - travel[segment - 1]) / Math.max(1e-7, travel[segment] - travel[segment - 1]);
   const index = (row * CITY_PATH_SAMPLES + sample) * 4;
   for (let axis = 0; axis < 3; axis++) pixels[index + axis] = THREE.MathUtils.lerp(
    lane.positions[(segment - 1) * 3 + axis], lane.positions[segment * 3 + axis], f);
   let clock = 0;
   for (const [begin, end] of zones) {
    const t = clamp((distance - begin) / (end - begin), 0, 1);
    clock += t * t * t * (10 + t * (-15 + t * 6));
   }
   pixels[index + 3] = clock;
  }
  if (row % 6 === 5) await new Promise((resolve) => requestAnimationFrame(resolve));
 }
 const texture = new THREE.DataTexture(pixels, CITY_PATH_SAMPLES, paths.length, THREE.RGBAFormat, THREE.FloatType);
 texture.name = 'CityTrafficPreparedMotion'; texture.needsUpdate = true;
 return { texture, lengths, costs, pixels };
}

// Reserved pair slots do not catch neighbouring slots. The minimum passing-zone
// length bounds the phase derivative, keeping longitudinal speed positive.
export const cityTrafficMotionShader = /* glsl */ `
 uniform sampler2D uPaths;
 uniform float uRows;
 uniform float uTime;
 attribute vec4 aRoute;
 attribute vec4 aMotion;
 attribute float aClosed;
 vec3 cityPath(float index) {
  float last = 2047.0;
  float bounded = aClosed > 0.5 ? mod(index + last, last) : clamp(index, 0.0, last);
  return texture2D(uPaths, vec2((bounded + 0.5) / 2048.0, (aRoute.x + 0.5) / uRows)).xyz;
 }
 void cityVehicle(out vec3 center, out vec3 direction, out float fade) {
  float base = aRoute.y + uTime * aRoute.z / aRoute.w;
  float clockIndex = fract(base) * 2047.0;
  vec2 clockUv = vec2((floor(clockIndex) + 0.5) / 2048.0, (aRoute.x + 0.5) / uRows);
  float clockA = texture2D(uPaths, clockUv).a;
  float clockB = texture2D(uPaths, clockUv + vec2(1.0 / 2048.0, 0.0)).a;
  float angle = 6.28318530718 * mix(clockA, clockB, fract(clockIndex));
  float angularRate = 6.28318530718 * (clockB - clockA) * 2047.0;
  float travel = fract(base + aMotion.x * aMotion.y * cos(angle));
  float sampleIndex = travel * 2047.0;
  float first = floor(sampleIndex), f = fract(sampleIndex);
  vec3 before = cityPath(first - 1.0), a = cityPath(first);
  vec3 b = cityPath(first + 1.0), after = cityPath(first + 2.0);
  vec3 tangent = normalize(mix(b - before, after - a, f));
  float offset = aMotion.x * aMotion.w * sin(angle);
  center = mix(a, b, f) + vec3(tangent.z, 0.0, -tangent.x) * offset;
  float longitudinal = max(0.0001, length(b - a) * 2047.0
    * (1.0 - aMotion.x * aMotion.y * angularRate * sin(angle)));
  float lateral = aMotion.x * aMotion.w * angularRate * cos(angle);
  direction = normalize(tangent * longitudinal + vec3(tangent.z, 0.0, -tangent.x) * lateral);
  float endFade = smoothstep(0.0, 4.0, travel * aRoute.w)
    * (1.0 - smoothstep(aRoute.w - 4.0, aRoute.w, travel * aRoute.w));
  fade = mix(endFade, 1.0, aClosed);
 }
`;

/** Reference sampler for deterministic validation of the shader trajectories. */
export function sampleCityTrafficVehicle(prepared, route, motion, closed, time, out) {
 const [row, phase, speed, cost] = route;
 const [sign, span, , clearance] = motion;
 const base = phase + time * speed / cost;
 const clockIndex = ((base % 1 + 1) % 1) * (CITY_PATH_SAMPLES - 1);
 const clockFirst = Math.floor(clockIndex);
 const clockA = prepared.pixels[(row * CITY_PATH_SAMPLES + clockFirst) * 4 + 3];
 const clockB = prepared.pixels[(row * CITY_PATH_SAMPLES + clockFirst + 1) * 4 + 3];
 const angle = Math.PI * 2 * THREE.MathUtils.lerp(clockA, clockB, clockIndex - clockFirst);
 const angularRate = Math.PI * 2 * (clockB - clockA) * (CITY_PATH_SAMPLES - 1);
 const travel = ((base + sign * span * Math.cos(angle)) % 1 + 1) % 1;
 const sample = travel * (CITY_PATH_SAMPLES - 1), first = Math.floor(sample), f = sample - first;
 const at = (i, axis) => {
  const last = CITY_PATH_SAMPLES - 1;
  const index = closed ? (i % last + last) % last : clamp(i, 0, last);
  return prepared.pixels[(row * CITY_PATH_SAMPLES + index) * 4 + axis];
 };
 let dx = THREE.MathUtils.lerp(at(first + 1, 0) - at(first - 1, 0), at(first + 2, 0) - at(first, 0), f);
 let dz = THREE.MathUtils.lerp(at(first + 1, 2) - at(first - 1, 2), at(first + 2, 2) - at(first, 2), f);
 const norm = Math.hypot(dx, dz); dx /= norm; dz /= norm;
 const offset = sign * clearance * Math.sin(angle);
 out.x = THREE.MathUtils.lerp(at(first, 0), at(first + 1, 0), f) + dz * offset;
 out.z = THREE.MathUtils.lerp(at(first, 2), at(first + 1, 2), f) - dx * offset;
 const forward = Math.max(.0001, Math.hypot(at(first + 1, 0)-at(first,0),at(first + 1,2)-at(first,2))
  * (CITY_PATH_SAMPLES - 1) * (1 - sign * span * angularRate * Math.sin(angle)));
 const side = sign * clearance * angularRate * Math.cos(angle);
 out.dx = (dx * forward + dz * side) / Math.hypot(forward, side);
 out.dz = (dz * forward - dx * side) / Math.hypot(forward, side);
 out.travel = travel; out.offset = offset;
 return out;
}
