import * as THREE from "three";

const hash = (x) => { const h = Math.sin(x * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };

/** Capture the neighbouring architecture once, before Start. A face per frame;
 * no CubeCamera updates or reflection renders during navigation or flight.
 */
export async function prepareCityOfficeReflections(renderer, model, cityGroup, windowState, cancelled = () => false) {
 const capture = new THREE.Scene();
 const placement = new THREE.Group();
 placement.position.copy(cityGroup.position);
 placement.quaternion.copy(cityGroup.quaternion);
 placement.scale.copy(cityGroup.scale);
 capture.add(placement); placement.add(model);
 for (const child of cityGroup.children) if (child.isLight) {
  const light = child.clone(); placement.add(light);
  if (child.target) { light.target = child.target.clone(); placement.add(light.target); }
 }
 // Night sky: the city must not reflect a bright blue-hour studio backdrop.
 // The silhouettes themselves come from the actual city, not a random skyline.
 const skyGeometry = new THREE.SphereGeometry(80, 24, 12);
 const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vDirection;
   void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vDirection;
   void main() {
    vec3 d = normalize(vDirection);
    float horizon = exp(-abs(d.y) * 3.0);
    vec3 sky = mix(vec3(0.002, 0.004, 0.009), vec3(0.017, 0.024, 0.039), horizon);
    gl_FragColor = vec4(sky, 1.0);
   }`,
 });
 const sky = new THREE.Mesh(skyGeometry, skyMaterial); capture.add(sky);
 const hidden = new Map(), reflectedMaterials = new Map();
 model.traverse(o => {
  if (!o.isMesh) return;
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
   if (m.envMap && !reflectedMaterials.has(m)) reflectedMaterials.set(m, m.envMapIntensity);
   if (m.name === "CityArchitectural-office" && !hidden.has(m)) {
    hidden.set(m, m.visible); m.visible = false;
   }
  }
 });
 const cube = new THREE.WebGLCubeRenderTarget(256, {
  type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearMipmapLinearFilter,
 });
 const camera = new THREE.CubeCamera(0.03, 110, cube);
 camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem();
 capture.updateMatrixWorld(true);
 camera.position.copy(placement.localToWorld(new THREE.Vector3(-33, 18, 0)));
 camera.updateMatrixWorld(true); sky.position.copy(camera.position);
 let complete = false;
 try {
  for (let face = 0; face < 6; face++) {
   await new Promise(resolve => requestAnimationFrame(resolve));
   if (cancelled()) return null;
   // Other preloader tasks share the renderer: restore it before yielding.
   const previous = renderer.getRenderTarget(), activeFace = renderer.getActiveCubeFace();
   const mip = renderer.getActiveMipmapLevel(), xr = renderer.xr.enabled;
   const tone = renderer.toneMapping, autoClear = renderer.autoClear;
   const windowIntensity = windowState?.intensity.value;
   try {
    // This low-resolution probe captures architectural massing and glazing.
    // Subpixel HDR window lamps would enlarge into distracting bright squares.
    if (windowState) windowState.intensity.value = 0;
    // Do not recapture the broad synthetic fill used by the ordinary house
    // glass as bright little sky panels inside this local night reflection.
    for (const [m, intensity] of reflectedMaterials) m.envMapIntensity = intensity * 0.15;
    renderer.xr.enabled = false; renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true;
    cube.texture.generateMipmaps = face === 5;
    renderer.setRenderTarget(cube, face); renderer.render(capture, camera.children[face]);
   } finally {
    renderer.setRenderTarget(previous, activeFace, mip);
    renderer.xr.enabled = xr; renderer.toneMapping = tone; renderer.autoClear = autoClear;
    if (windowState) windowState.intensity.value = windowIntensity;
    for (const [m, intensity] of reflectedMaterials) m.envMapIntensity = intensity;
   }
  }
  cube.texture.name = "CityOfficesFrozenNeighbourReflections";
  cube.cityProbePosition = camera.position.clone();
  // Neighbourhood scale between the office envelope and a city-wide probe:
  // an overly tight box compresses neighbours into a miniature mosaic.
  cube.cityProbeBounds = new THREE.Box3(new THREE.Vector3(-65, -5, -35), new THREE.Vector3(0, 48, 35))
   .applyMatrix4(placement.matrixWorld);
  complete = true;
  return cube;
 } finally {
  for (const [material, visible] of hidden) material.visible = visible;
  placement.remove(model); capture.clear();
  if (!complete) cube.dispose();
  skyGeometry.dispose(); skyMaterial.dispose();
 }
}

/** Small static night environment, filtered once under the scene's readyPromise. */
export async function createCityReflectionEnvironment(renderer, cancelled = () => false) {
 const width = 512, height = 256, pixels = new Float32Array(width * height * 4);
 for (let y = 0; y < height; y++) {
  const elevation = y / height - 0.5;
  for (let x = 0; x < width; x++) {
   const u = x / width, sector = Math.floor(u * 38);
   const roof = 0.04 + hash(sector) * 0.20;
   const silhouette = elevation < roof && elevation > -0.11;
   const cloud = Math.max(0, Math.sin(u * Math.PI * 12 + elevation * 7)
     + Math.sin(u * Math.PI * 22 - elevation * 17) * 0.4 - 0.15);
   const skyline = silhouette ? 0.10 + hash(sector + 53) * 0.07
     : 0.36 + Math.max(0, elevation) * 0.40 + cloud * 0.20;
   const broadLight = Math.exp(-(((u - 0.17) / 0.09) ** 2)) * 1.3
     + Math.exp(-(((u - 0.68) / 0.15) ** 2)) * 0.65;
   const facadeStripe = silhouette && x % 9 < 2 && y % 4 < 2 ? 0.40 : 0;
   const energy = skyline + broadLight * (silhouette ? 0.12 : 1) + facadeStripe;
   const i = (y * width + x) * 4;
   pixels[i] = energy * 0.54; pixels[i + 1] = energy * 0.74;
   pixels[i + 2] = energy; pixels[i + 3] = 1;
  }
  if (y % 32 === 31) {
   await new Promise(resolve => requestAnimationFrame(resolve));
   if (cancelled()) return null;
  }
 }
 const source = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
 source.mapping = THREE.EquirectangularReflectionMapping;
 source.needsUpdate = true;
 const generator = new THREE.PMREMGenerator(renderer);
 try {
  generator.compileEquirectangularShader();
  await new Promise(resolve => requestAnimationFrame(resolve));
  if (cancelled()) return null;
  const target = generator.fromEquirectangular(source);
  target.texture.name = "CityStaticNightReflections";
  return target;
 } finally {
  source.dispose(); generator.dispose();
 }
}
