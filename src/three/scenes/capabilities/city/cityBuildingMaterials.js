import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { applyCityWindowShader } from "./cityWindowShader.js";
import { createCityOfficeGlass } from "./cityOfficeGlass.js";

const declarations = /* glsl */ `
varying vec3 vCitySurface;
varying float vCityBuilding;
varying float vCitySurfaceScale;
`;
const surfaceFragment = /* glsl */ `
uniform sampler2D uCitySurfaceDetail;
float cityHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float cityJoint(float coordinate) {
  float footprint = max(fwidth(coordinate), 0.0001);
  float distanceToJoint = abs(fract(coordinate + 0.5) - 0.5);
  return (1.0 - smoothstep(0.012, 0.012 + footprint, distanceToJoint))
    * (1.0 - smoothstep(0.12, 0.45, footprint));
}
`;

/** Static, periodic material data: aggregate, roughness, weathering, brushed metal.
 * Prepared once under the loader; mipmaps handle distant microdetail on the GPU.
 */
function createSurfaceDetailTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 43, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, period) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy);
    const a = hash(ix % period, iy % period), b = hash((ix + 1) % period, iy % period);
    const c = hash(ix % period, (iy + 1) % period), d = hash((ix + 1) % period, (iy + 1) % period);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const fine = noise(x / 2, y / 2, 64);
      const aggregate = noise(x / 8, y / 8, 16);
      pixels[offset] = Math.round((fine * 0.65 + aggregate * 0.35) * 255);
      pixels[offset + 1] = Math.round((fine * 0.35 + aggregate * 0.65) * 255);
      pixels[offset + 2] = Math.round(noise(x / 32, y / 32, 4) * 255);
      pixels[offset + 3] = Math.round((hash(y, 9) * 0.75 + fine * 0.25) * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = "CitySharedSurfaceDetail";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createSurface(name, role, park = false, windowState = null, environment = null, detailTexture = null) {
  if (role === "office") return createCityOfficeGlass(windowState?.environment ?? environment, windowState);
  const roof = role === "roof", metal = role === "metal", office = role === "office";
  const material = new THREE.MeshStandardMaterial({
    name, color: roof ? "#333e48" : metal ? "#819097" : "#67727b",
    metalness: metal ? 0.85 : 0, roughness: metal ? 0.48 : roof ? 0.97 : 0.88,
    envMap: windowState?.environment ?? (metal ? environment : null),
    envMapIntensity: metal ? 0.55 : office ? 4.0 : 1.05, fog: true, dithering: true,
    // Source architecture includes single-wall surfaces with mixed winding.
    // Preserve its opaque, double-sided contract when replacing GLB materials.
    side: THREE.DoubleSide, transparent: false, opacity: 1, depthWrite: true,
    vertexColors: !park,
  });
  // Included in CityModelWorld's deduplicated texture disposal.
  material.citySurfaceDetail = detailTexture;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCitySurfaceDetail = { value: detailTexture };
    shader.vertexShader = declarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vec4 cityPosition = vec4(position, 1.0);
      vec3 cityOrigin = vec3(0.0);
      #ifdef USE_INSTANCING
        cityPosition = instanceMatrix * cityPosition;
        cityOrigin = instanceMatrix[3].xyz;
      #endif
      vCitySurface = cityPosition.xyz;
      vCitySurfaceScale = length(modelMatrix[0].xyz);
      vCityBuilding = fract(sin(dot(cityOrigin, vec3(12.9898, 4.1414, 78.233))) * 43758.5453);
    `);
    shader.fragmentShader = declarations + surfaceFragment + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      vec3 cityFace = abs(normalize(cross(dFdx(vCitySurface), dFdy(vCitySurface))));
      vec2 citySurfaceUv = cityFace.y > max(cityFace.x, cityFace.z) ? vCitySurface.xz
        : (cityFace.x > cityFace.z ? vCitySurface.zy : vCitySurface.xy);
      vec2 cityDetailUv = citySurfaceUv / ${metal ? "vec2(0.5, 0.18)" : "vec2(0.38)"};
      vec4 cityDetail = texture2D(uCitySurfaceDetail, cityDetailUv);
      float cityDetailFade = 1.0 - smoothstep(0.04, 0.20, length(fwidth(cityDetailUv)));
      float cityWeather = texture2D(uCitySurfaceDetail, citySurfaceUv * vec2(0.24, 0.07)).b;
      float cityMaterialSeed = floor(vCityBuilding * 255.0 + 0.5) / 255.0;
      float cityDenseStone = step(0.67, cityMaterialSeed);
      float cityBase = mix(0.75, 1.0, smoothstep(0.05, 1.8, vCitySurface.y));
      diffuseColor.rgb *= mix(0.83, 1.12, cityMaterialSeed) * cityBase
        * (0.90 + cityWeather * 0.17 + (cityDetail.g - 0.5) * ${metal ? "0.035" : "0.09"});
      diffuseColor.rgb *= mix(vec3(1.045, 1.01, 0.96), vec3(0.94, 0.985, 1.035), cityMaterialSeed);
      float citySurfaceHeight = (cityDetail.${metal ? "a" : "r"} - 0.5) * ${metal ? "0.00012" : roof ? "0.0012" : "0.00055"};
      ${roof ? `
      // Membrane laps belong to upward roof faces, never to equipment walls.
      float cityRoofFacing = smoothstep(0.65, 0.85, cityFace.y);
      float cityRoofLap = max(cityJoint(vCitySurface.x / 0.16), cityJoint(vCitySurface.z / 0.65)) * cityRoofFacing;
      diffuseColor.rgb *= 1.0 - cityRoofLap * 0.18;
      citySurfaceHeight -= cityRoofLap * 0.0004;
      ` : ""}
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      roughnessFactor = ${metal ? "clamp(0.46 + (cityDetail.a - 0.5) * 0.22, 0.35, 0.60)"
        : roof ? "clamp(0.96 + (cityDetail.g - 0.5) * 0.08, 0.92, 1.0)"
          : "clamp(mix(0.92, 0.78, cityDenseStone) + (cityWeather - 0.5) * 0.08 + (cityDetail.g - 0.5) * 0.06, 0.74, 0.98)"};
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      // Relief is in physical city units, follows the existing lighting and
      // fades with distance. Flat glazing is excluded from mineral relief.
      float cityHeight = citySurfaceHeight * vCitySurfaceScale;
      vec3 cityDx = dFdx(-vViewPosition), cityDy = dFdy(-vViewPosition);
      vec3 cityR1 = cross(cityDy, normal), cityR2 = cross(normal, cityDx);
      float cityDet = dot(cityDx, cityR1);
      normal = normalize(abs(cityDet) * normal - sign(cityDet) * cityDetailFade
        * ${windowState ? "(1.0 - cityGlass)" : "1.0"}
        * (dFdx(cityHeight) * cityR1 + dFdy(cityHeight) * cityR2));
    `);
    if (park) shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      // Local spill from the authored path lights, prepared without extra lights
      // or shadow passes. Keep the same graphite surface as the architecture.
      vec2 parkA = vCitySurface.xz - vec2(-85.0, 69.0);
      vec2 parkB = vCitySurface.xz - vec2(94.0, -66.0);
      vec2 parkPoint = dot(parkA, parkA) < dot(parkB, parkB) ? parkA : parkB;
      float parkRadius = length(parkPoint);
      float pathDistance = min(abs(parkPoint.x), abs(parkPoint.y));
      float pathSpill = exp(-pathDistance * pathDistance * 2.8)
        * smoothstep(2.5, 3.5, parkRadius) * (1.0 - smoothstep(6.0, 7.3, parkRadius));
      float sculptureSpill = exp(-parkRadius * parkRadius * 0.38);
      float parkWash = (1.0 - smoothstep(5.8, 7.4, parkRadius)) * 0.45;
      totalEmissiveRadiance += vec3(0.003, 0.055, 0.12) * (pathSpill + sculptureSpill * 1.4 + parkWash);
    `);
    if (windowState) applyCityWindowShader(shader, windowState, office);
  };
  // Expose the shared texture to the scene's existing deduplicated disposal.
  if (windowState) material.cityWindowMask = windowState.texture;
  material.customProgramCacheKey = () => `city-mineral-surface-v13-${role}-${park}-${!!windowState}-${windowState?.authoredMetricUv}-${windowState?.stableTangents}`;
  return material;
}

/** Prepared shared surfaces; preserve curved walls but split normals at sharp corners. */
export async function replaceCitySurfaceMaterials(root, { normalsPrepared = false, windowState = null } = {}) {
  const replacements = new Map();
  const replaced = new Set();
  const meshes = [];
  const geometries = new Map();
  root.traverse((object) => {
    if (object.isMesh && object.material) meshes.push(object);
  });
  let detailTexture = null;
  for (const object of meshes) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let architectural = false;
    const next = materials.map((source) => {
      // Baked-style blue fill keeps planting and the basin readable without
      // point lights, shadow maps, or another rendering pass.
      if (source.name === "ISLAND | blue green tree canopies") {
        source.color.setRGB(0.014, 0.03, 0.045);
        source.emissive.setRGB(0.002, 0.018, 0.028);
      } else if (source.name === "ISLAND | still reflecting basin") {
        source.emissive.setRGB(0.001, 0.012, 0.025);
      }
      const role = ({
        "02 | Graphite roof + architecture": "trim",
        "FACADES | plain cool graphite": "facade",
        "ROOFS | rough mineral membrane": "roof",
        "DETAILS | brushed dark metal": "metal",
        "OFFICE | curtain wall glass": "office",
      })[source.name];
      if (!role) return source;
      architectural = true;
      const park = object.name.startsWith("ROUNDABOUT");
      const key = `${source.name}-${park}`;
      if (!replacements.has(key)) {
        detailTexture ??= createSurfaceDetailTexture();
        replacements.set(key, createSurface(`CityArchitectural-${role}`, role, park,
          !park && (role === "facade" || role === "office") ? windowState : null, windowState?.environment, detailTexture));
      }
      replaced.add(source);
      return replacements.get(key);
    });
    object.material = Array.isArray(object.material) ? next : next[0];
    if (architectural && !normalsPrepared) {
      const source = object.geometry;
      if (!geometries.has(source)) {
        geometries.set(source, toCreasedNormals(source, Math.PI / 5));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      object.geometry = geometries.get(source);
    }
  }
  const stillUsed = new Set(meshes.map((object) => object.geometry));
  for (const geometry of geometries.keys()) if (!stillUsed.has(geometry)) geometry.dispose();
  for (const material of replaced) material.dispose();
}
