import * as THREE from "three";
import { createCityTrafficCars } from "./createCityTrafficCars.js";
import { CITY_TRAFFIC_DEFAULTS } from "./cityTrafficConfig.js";
import { prepareCityTrafficMotion, cityTrafficMotionShader } from "./cityTrafficMotion.js";

const ROUNDABOUTS = [[-85, -69], [94, 66]];
const noise = (seed) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

// Blender XY circulation: all roundabout lanes run counterclockwise.
// The preview contours have opposite winding on inner and outer road edges.
export function getRoadDirection(route) {
 if (route.direction != null) return route.direction;
 let circulation = 0;
 for (const [cx, cy] of ROUNDABOUTS) {
   for (let i = 1; i < route.points.length; i++) {
     const a = route.points[i - 1], b = route.points[i];
     const x = (a[0] + b[0]) * 0.5 - cx, y = (a[1] + b[1]) * 0.5 - cy;
     const radius = Math.hypot(x, y);
     if (radius > 7 && radius < 16) circulation += x * (b[1] - a[1]) - y * (b[0] - a[0]);
   }
 }
 return circulation < -1 ? -1 : 1;
}

const vertexShader = /* glsl */ `
 ${cityTrafficMotionShader}
 uniform float uPixelRatio;
 uniform float uFrontSize;
 uniform float uRearSize;
 uniform float uBodyScale;
 uniform float uDensity;
 attribute float aSize;
 attribute vec2 aLamp;
 attribute vec2 aLightStyle;
 varying float vEnergy;
 varying float vLampEnd;
 varying vec2 vLightStyle;
 #include <fog_pars_vertex>
 void main() {
   vec3 center, direction;
   float fade;
   cityVehicle(center, direction, fade);
   vec3 side = vec3(direction.z, 0.0, -direction.x);
   vec3 lampPosition = center
     + direction * aLamp.y * ((0.95 / 4.5) * aSize * uBodyScale + 0.035)
     + side * aLamp.x * (0.42 * 2.0 / 4.5) * 0.33 * aSize * uBodyScale
     + vec3(0.0, 0.065 * uBodyScale, 0.0);
   vec4 mvPosition = modelViewMatrix * vec4(lampPosition, 1.0);
   gl_Position = projectionMatrix * mvPosition;
   // Flare diameter is independent of the body dimensions and aSize.
   float size = aLamp.y > 0.0 ? uFrontSize : uRearSize;
   float diameter = aLamp.y > 0.0 ? 39.0 : 24.0;
   gl_PointSize = clamp(uPixelRatio * diameter / max(1.0, -mvPosition.z), 1.5, 8.0) * size;
   vEnergy = fade * step(fract(aRoute.y * 43.0 + aRoute.x * 19.3), uDensity);
   vLampEnd = aLamp.y;
   vLightStyle = aLightStyle;
   #include <fog_vertex>
 }
`;

const fragmentShader = /* glsl */ `
 varying float vEnergy;
 varying float vLampEnd;
 varying vec2 vLightStyle;
 uniform vec3 uBlueColor;
 uniform vec3 uWhiteColor;
 uniform vec3 uYellowColor;
 uniform float uWhiteShare;
 uniform float uYellowShare;
 uniform float uFrontIntensity;
 uniform float uRearIntensity;
 uniform float uLightVariation;
 #include <fog_pars_fragment>
 void main() {
   vec2 point = (gl_PointCoord - 0.5) * 2.0;
   float radius = length(point);
   if (radius > 1.0) discard;
   // A crisp HDR lamp feeds the site's bloom; no baked fuzzy sprite halo.
   float edge = max(fwidth(radius), 0.025);
   float alpha = (1.0 - smoothstep(0.38 - edge, 0.38 + edge, radius)) * vEnergy;
   #ifdef USE_FOG
     #ifdef FOG_EXP2
       alpha *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
     #else
       alpha *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
     #endif
   #endif
   vec3 frontColor = vLightStyle.x < 1.0 - uWhiteShare - uYellowShare ? uBlueColor
     : (vLightStyle.x < 1.0 - uYellowShare ? uWhiteColor : uYellowColor);
   vec3 color = vLampEnd > 0.0 ? frontColor : vec3(1.0, 0.018, 0.008);
   float intensity = (vLampEnd > 0.0 ? uFrontIntensity : uRearIntensity) * mix(1.0, vLightStyle.y, uLightVariation);
   gl_FragColor = vec4(color * intensity, alpha);
 }
`;

/** Prepared route lookup, using the light-trails scene's blue additive glow.
 * After prepare, only time and pixel ratio uniforms change; paths never upload again.
 */
export class CityRoadFlow {
 static async create(data) {
   const routes = data.paths.filter((path) => path.points.length > 1 && !path.name.startsWith("Smooth lane connection"))
     .map((path) => ({ ...path, direction: getRoadDirection(path) }));
   const prepared = await prepareCityTrafficMotion(routes);

   const routeAttributes = [];
   const motionAttributes = [];
   const particleAttributes = [];
   const sizes = [];
   const ribbon = { positions: [], distances: [], sides: [], directions: [], flow: [], opacity: [], indices: [] };
   const strands = data.ribbons ?? routes;
   for (let row = 0; row < strands.length; row++) {
     const route = strands[row];
     const points = route.points.map(([x, y, z]) => new THREE.Vector3(x, z + 0.22, -y));
     if (route.closed && !points[0].equals(points[points.length - 1])) points.push(points[0].clone());
     const distances = [0];
     for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]));
     const length = distances[distances.length - 1];
     if (length < 0.001) continue;
     const direction = getRoadDirection(route);
     const base = ribbon.positions.length / 3;
     for (let i = 0; i < points.length; i++) {
       const before = points[i === 0 && route.closed ? points.length - 2 : Math.max(0, i - 1)];
       const after = points[i === points.length - 1 && route.closed ? 1 : Math.min(points.length - 1, i + 1)];
       const dx = after.x - before.x, dz = after.z - before.z;
       const inverseLength = 0.42 / Math.max(0.001, Math.hypot(dx, dz));
       // The complete ring owns its glow; approach guides blend into it.
       const ringDistance = Math.min(...ROUNDABOUTS.map(([x, y]) => Math.hypot(points[i].x - x, points[i].z + y)));
       let opacity = route.kind === "approach" ? THREE.MathUtils.smoothstep(ringDistance, 13.05, 14.8) : 1;
       const junction = data.graph?.eastJunction;
       if (junction?.center) {
         const distance = Math.hypot(points[i].x - junction.center[0], points[i].z + junction.center[1]);
         // Solid guides stop at the shared junction. Faint dashed turn guides
         // leave the moving vehicles legible instead of drawing another loop.
         const inside = THREE.MathUtils.smoothstep(distance, 2.5, 3.5);
         const dash = (distances[i] % 0.65) < 0.23 ? 0.2 : 0.035;
         opacity *= inside + (1 - inside) * dash;
       }
       const crossroads = data.graph?.westCrossroads;
       if (crossroads?.center) {
         // Leave the crossing open: the old continuous turning ribbons imply
         // that cars are confined to those turns even when all exits are active.
         const distance = Math.hypot(points[i].x - crossroads.center[0], points[i].z + crossroads.center[1]);
         opacity *= THREE.MathUtils.smoothstep(distance, 5.5, 10.5);
       }
       if (route.fadeEnds) opacity *= THREE.MathUtils.smoothstep(Math.min(distances[i], length - distances[i]), 0, 2.5);
       for (const side of [-1, 1]) {
         ribbon.positions.push(points[i].x - dz * inverseLength * side, points[i].y - 0.05, points[i].z + dx * inverseLength * side);
         ribbon.distances.push(distances[i]);
         ribbon.sides.push(side);
         ribbon.directions.push(direction);
         ribbon.opacity.push(opacity);
         ribbon.flow.push(noise(row + 91), 8 + noise(row + 137) * 3,
           route.closed ? length / Math.max(1, Math.round(length / 90)) : 90);
       }
       if (i > 0) {
         const n = base + i * 2;
         ribbon.indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
       }
     }
     if (row % 12 === 11) await new Promise((resolve) => requestAnimationFrame(resolve));
   }
   for (let row = 0; row < routes.length; row++) {
     const route = routes[row];
     if (route.scheduled) {
       const schedule = route.trafficSchedule;
       if (!schedule || !Number.isInteger(schedule.count) || schedule.count < 1 || !(schedule.headway > 0))
         throw new Error(`Missing prepared traffic schedule: ${route.name}`);
       const { count, headway, phase } = schedule;
       for (let vehicle = 0; vehicle < count; vehicle++) {
         routeAttributes.push(row, (vehicle + phase) / count, prepared.costs[row] / (count * headway), prepared.costs[row]);
         motionAttributes.push(0, 0, 0, 0);
         particleAttributes.push(route.closed ? 1 : 0);
         sizes.push(0.85 + noise(row * 97 + vehicle * 13 + 103) * 0.35);
       }
       continue;
     }
     const pairs = Math.min(60, Math.max(1, Math.floor(prepared.lengths[row] / 10)));
     for (let pair = 0; pair < pairs; pair++) {
       const seed = row * 97 + pair * 13;
       const phase = ((pair + 0.35 + noise(seed) * 0.2) / pairs + noise(row + 73)) % 1;
       const cycles = Math.max(1, Math.floor(pairs * 0.4));
       for (const sign of [-1, 1]) {
         routeAttributes.push(row, phase, 2.2 + noise(row + 47) * 1.2, prepared.costs[row]);
         // Passing must fit the authored lane width, including denser approaches.
         motionAttributes.push(sign, Math.min(0.2 / pairs, 0.095 / cycles), cycles,
           Math.min(0.28, route.passingClearance ?? 0.28));
         particleAttributes.push(route.closed ? 1 : 0);
         sizes.push(0.85 + noise(seed + sign + 103) * 0.35);
       }
     }
     // Keep the preloader responsive while preparing many routes.
     if (row % 12 === 11) await new Promise((resolve) => requestAnimationFrame(resolve));
   }
   return new CityRoadFlow(prepared, routeAttributes, motionAttributes, particleAttributes, sizes, ribbon);
 }

 constructor(prepared, routes, motions, particles, sizes, ribbon) {
   this.prepared = prepared;
   this.pathTexture = prepared.texture;
   const lightRoutes = [], lightMotions = [], lightClosed = [], lightSizes = [], lightPairs = [], lightStyles = [];
   for (let vehicle = 0; vehicle < sizes.length; vehicle++) {
     const offset = vehicle * 4;
     const tint = (routes[offset + 1] * 127.1 + routes[offset] * 13.7) % 1;
     const strength = 0.08 + Math.pow(noise(vehicle + 619), 2.2) * 2.7;
     for (const end of [-1, 1]) {
       for (const side of [-1, 1]) {
         lightRoutes.push(...routes.slice(offset, offset + 4));
         lightMotions.push(...motions.slice(offset, offset + 4));
         lightClosed.push(particles[vehicle]);
         lightSizes.push(sizes[vehicle]);
         lightPairs.push(side, end);
         lightStyles.push(tint, strength);
       }
     }
   }
   const geometry = new THREE.BufferGeometry();
   geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lightClosed.length * 3), 3));
   geometry.setAttribute("aRoute", new THREE.Float32BufferAttribute(lightRoutes, 4));
   geometry.setAttribute("aMotion", new THREE.Float32BufferAttribute(lightMotions, 4));
   geometry.setAttribute("aClosed", new THREE.Float32BufferAttribute(lightClosed, 1));
   geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(lightSizes, 1));
   geometry.setAttribute("aLamp", new THREE.Float32BufferAttribute(lightPairs, 2));
   geometry.setAttribute("aLightStyle", new THREE.Float32BufferAttribute(lightStyles, 2));
   const material = new THREE.ShaderMaterial({
     name: "CityRoadFlowGlow",
     uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
       uPaths: { value: null }, uRows: { value: prepared.costs.length }, uTime: { value: 0 }, uPixelRatio: { value: 1 },
       uFrontSize: { value: 1 }, uRearSize: { value: 1 }, uBodyScale: { value: 1 }, uDensity: { value: 1 },
       uFrontIntensity: { value: 5.5 }, uRearIntensity: { value: 0.9 }, uLightVariation: { value: 1 },
       uWhiteShare: { value: 0.15 }, uYellowShare: { value: 0.02 },
       uBlueColor: { value: new THREE.Color(CITY_TRAFFIC_DEFAULTS.blueColor) },
       uWhiteColor: { value: new THREE.Color(CITY_TRAFFIC_DEFAULTS.whiteColor) },
       uYellowColor: { value: new THREE.Color(CITY_TRAFFIC_DEFAULTS.yellowColor) },
     }]),
     vertexShader, fragmentShader,
     extensions: { derivatives: true },
     toneMapped: false,
     transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
   });
   material.uniforms.uPaths.value = this.pathTexture;
   this.points = new THREE.Points(geometry, material);
   this.points.name = "CityRoadFlow";
   this.points.frustumCulled = false;
   this.points.renderOrder = 2;
   this.cars = createCityTrafficCars(routes, motions, particles, sizes, this.pathTexture, prepared.costs.length, material.uniforms.uTime, lightStyles.filter((_, i) => i % 8 === 1));
   this.cars.renderOrder = 1;
   for (const name of ["uBodyScale", "uDensity", "uFrontIntensity", "uRearIntensity", "uLightVariation", "uBlueColor", "uWhiteColor", "uYellowColor", "uWhiteShare", "uYellowShare"])
     this.cars.material.uniforms[name] = material.uniforms[name];
   const ribbonGeometry = new THREE.BufferGeometry();
   ribbonGeometry.setAttribute("position", new THREE.Float32BufferAttribute(ribbon.positions, 3));
   ribbonGeometry.setAttribute("aDistance", new THREE.Float32BufferAttribute(ribbon.distances, 1));
   ribbonGeometry.setAttribute("aSide", new THREE.Float32BufferAttribute(ribbon.sides, 1));
   ribbonGeometry.setAttribute("aDirection", new THREE.Float32BufferAttribute(ribbon.directions, 1));
   ribbonGeometry.setAttribute("aFlow", new THREE.Float32BufferAttribute(ribbon.flow, 3));
   ribbonGeometry.setAttribute("aOpacity", new THREE.Float32BufferAttribute(ribbon.opacity, 1));
   ribbonGeometry.setIndex(ribbon.indices);
   const ribbonMaterial = new THREE.ShaderMaterial({
     name: "CityHighwayFlow",
     uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uIntensity: { value: 1 } }]),
     transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true,
     vertexShader: `
       attribute float aDistance; attribute float aSide; attribute float aDirection; attribute float aOpacity;
       attribute vec3 aFlow; varying vec3 vFlow;
       varying float vDistance; varying float vSide; varying float vDirection; varying float vOpacity;
       #include <fog_pars_vertex>
       void main() {
         vDistance = aDistance; vSide = aSide; vDirection = aDirection;
         vFlow = aFlow;
         vOpacity = aOpacity;
         vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
         gl_Position = projectionMatrix * mvPosition;
         #include <fog_vertex>
       }
     `,
     fragmentShader: `
       uniform float uTime;
       uniform float uIntensity;
       varying float vDistance; varying float vSide; varying float vDirection; varying float vOpacity;
       varying vec3 vFlow;
       #include <fog_pars_fragment>
       void main() {
         float phase = fract((vDistance * vDirection - uTime * vFlow.y) / vFlow.z + vFlow.x);
         float flow = exp(-pow((phase - 0.5) * 5.5, 2.0));
         float edge = exp(-vSide * vSide * 5.0);
         float core = exp(-vSide * vSide * 35.0);
         float alpha = (edge * 0.6 + core * 0.4) * (0.016 + flow * 0.3) * vOpacity;
         #ifdef USE_FOG
           #ifdef FOG_EXP2
             alpha *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
           #else
             alpha *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
           #endif
         #endif
         gl_FragColor = vec4(vec3(0.025, 0.42, 0.8) * 1.5, alpha * uIntensity);
       }
     `,
   });
   this.highways = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
   this.highways.name = "CityHighwayFlow";
   this.speed = 1;
 }

 setSettings(settings) {
   const uniforms = this.points.material.uniforms;
   for (const key of ["frontSize", "rearSize", "bodyScale", "density", "frontIntensity", "rearIntensity", "lightVariation", "whiteShare", "yellowShare"]) {
     uniforms[`u${key[0].toUpperCase()}${key.slice(1)}`].value = settings[key];
   }
   for (const key of ["blueColor", "whiteColor", "yellowColor"]) {
     uniforms[`u${key[0].toUpperCase()}${key.slice(1)}`].value.set(settings[key]);
   }
   this.highways.material.uniforms.uIntensity.value = settings.roadIntensity;
   this.speed = settings.speed;
 }

 update(delta, pixelRatio) {
   const uniforms = this.points.material.uniforms;
   uniforms.uTime.value += Math.min(Math.max(delta || 0, 0), 0.05) * this.speed;
   uniforms.uPixelRatio.value = pixelRatio;
   this.highways.material.uniforms.uTime.value = uniforms.uTime.value;
 }

 dispose() {
   this.points.removeFromParent();
   this.points.geometry.dispose();
   this.points.material.dispose();
   this.pathTexture.dispose();
   this.highways.removeFromParent();
   this.highways.geometry.dispose();
   this.highways.material.dispose();
   this.cars.removeFromParent();
   this.cars.geometry.dispose();
   this.cars.material.dispose();
 }
}
