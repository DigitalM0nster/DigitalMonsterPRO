import * as THREE from "three";
import { applyCityDistrictWindowShader } from "./cityDistrictWindows.js";

export function decodeCityWindowCells(packed, size, encoding) {
 if (!Number.isInteger(size) || size < 1 || size > 2048) throw new Error("Invalid city window atlas size");
 if (encoding !== "rle8") {
  if (packed.length !== size * size) throw new Error("Invalid city window atlas");
  return packed;
 }
 if (packed.length % 3 !== 0) throw new Error("Truncated city window atlas");
 const bytes = new Uint8Array(size * size);
 let cursor = 0;
 for (let offset = 0; offset < packed.length; offset += 3) {
  const count = packed[offset] | (packed[offset + 1] << 8);
  if (!count || cursor + count > bytes.length) throw new Error("Invalid city window run");
  bytes.fill(packed[offset + 2], cursor, cursor + count);
  cursor += count;
 }
 if (cursor !== bytes.length) throw new Error("Incomplete city window atlas");
 return bytes;
}

/** One byte per authored facade cell; shared by every building instance. */
export async function loadCityWindowState(layout) {
 if (!layout) return null;
 const response = await fetch(layout.url);
 if (!response.ok) throw new Error("City window layout failed to load");
 const bytes = decodeCityWindowCells(new Uint8Array(await response.arrayBuffer()), layout.size, layout.encoding);
 const texture = new THREE.DataTexture(bytes, layout.size, layout.size, THREE.RedFormat, THREE.UnsignedByteType);
 texture.name = "CityAuthoredWindowCells";
 texture.minFilter = texture.magFilter = THREE.NearestFilter;
 texture.generateMipmaps = false; texture.needsUpdate = true;
 return { texture, size: layout.size, intensity: { value: 1 }, stableTangents: layout.stableTangents === true,
  authoredMetricUv: layout.authoredMetricUv === true,
  opening: { value: new THREE.Vector2(...(layout.opening ?? [0.13, 0.16])) },
  pitch: { value: new THREE.Vector2(...(layout.pitch ?? [0.28, 0.34])) },
  unitScale: { value: 0.055 } };
}

export function applyCityWindowShader(shader, state, curtainWall = false) {
 const authoredMetric = state.authoredMetricUv === true;
 shader.uniforms.uCityWindowMask = { value: state.texture };
 shader.uniforms.uCityWindowAtlasSize = { value: state.size };
 shader.uniforms.uCityWindowIntensity = state.intensity;
 shader.uniforms.uCityWindowOpening = state.opening;
 shader.uniforms.uCityWindowPitch = state.pitch;
 shader.uniforms.uCityWindowUnitScale = state.unitScale;
 shader.vertexShader = "varying vec2 vCityWindowUv;\nvarying vec3 vCityWindowWorld;\n" + shader.vertexShader;
 if (state.stableTangents) shader.vertexShader = `
  #ifndef USE_TANGENT
   attribute vec4 tangent;
  #endif
  varying vec2 vCityMetricWindowUv;
 ` + shader.vertexShader;
 if (authoredMetric) shader.vertexShader = `
  #ifndef USE_UV1
   attribute vec2 uv1;
  #endif
  #ifndef USE_UV2
   attribute vec2 uv2;
  #endif
  varying vec2 vCityMetricWindowUv;
  varying vec2 vCityAtlasCellSize;
 ` + shader.vertexShader;
 shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
  #include <begin_vertex>
  vCityWindowUv = uv;
  vec4 cityWindowPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    cityWindowPosition = instanceMatrix * cityWindowPosition;
  #endif
  vCityWindowWorld = (modelMatrix * cityWindowPosition).xyz;
  ${authoredMetric ? `
   mat4 cityMetricMatrix = modelMatrix;
   #ifdef USE_INSTANCING
    cityMetricMatrix = modelMatrix * instanceMatrix;
   #endif
   // Authoring uses upright prototypes with equal X/Z footprint scales.
   // UV1 is a face-local distance, independent of smoothed vertex normals.
   vec2 cityMetricScale = vec2(length(cityMetricMatrix[0].xyz), length(cityMetricMatrix[1].xyz));
   vCityMetricWindowUv = uv1 * cityMetricScale;
   vCityAtlasCellSize = uv2 * cityMetricScale;
  ` : ""}
  ${state.stableTangents ? `
   vec3 cityWindowTangent = tangent.xyz;
   #ifdef USE_INSTANCING
    cityWindowTangent = mat3(instanceMatrix) * cityWindowTangent;
   #endif
   cityWindowTangent = normalize(mat3(modelMatrix) * cityWindowTangent + vec3(1e-8));
   vCityMetricWindowUv = vec2(dot(vCityWindowWorld, cityWindowTangent), vCityWindowWorld.y);
  ` : ""}
 `);
 shader.fragmentShader = `
  varying vec2 vCityWindowUv;
  varying vec3 vCityWindowWorld;
  ${state.stableTangents || authoredMetric ? "varying vec2 vCityMetricWindowUv;" : ""}
  ${authoredMetric ? "varying vec2 vCityAtlasCellSize;" : ""}
  uniform sampler2D uCityWindowMask;
  uniform float uCityWindowAtlasSize;
  uniform float uCityWindowIntensity;
  uniform vec2 uCityWindowOpening;
  uniform vec2 uCityWindowPitch;
  uniform float uCityWindowUnitScale;
 ` + shader.fragmentShader;
 shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
  #include <color_fragment>
  vec2 cityUvDx = dFdx(vCityWindowUv), cityUvDy = dFdy(vCityWindowUv);
  vec3 cityWorldDx = dFdx(vCityWindowWorld), cityWorldDy = dFdy(vCityWindowWorld);
  float citySignedDet = cityUvDx.x * cityUvDy.y - cityUvDx.y * cityUvDy.x;
  float cityUvDet = max(abs(citySignedDet), 0.00000001);
  vec2 cityCellWorld = vec2(length(cityWorldDx * cityUvDy.y - cityWorldDy * cityUvDx.y),
    length(cityWorldDy * cityUvDx.x - cityWorldDx * cityUvDy.x)) / cityUvDet;
  // Metric grid independent of prototype UVs and instance stretching.
  vec3 cityBayAxis = normalize((cityWorldDx * cityUvDy.y - cityWorldDy * cityUvDx.y) * sign(citySignedDet) + vec3(1e-12));
  vec2 cityGridPitch = ${curtainWall ? "vec2(0.20, 0.34)" : "uCityWindowPitch"};
  vec2 cityPhysicalUv = ${state.stableTangents || authoredMetric ? "vCityMetricWindowUv" : "vec2(dot(vCityWindowWorld, cityBayAxis), vCityWindowWorld.y)"} / (uCityWindowUnitScale * cityGridPitch);
  vec2 cityWindowCell = floor(cityPhysicalUv);
  vec2 cityHalfPane = ${curtainWall ? "vec2(0.095, 0.143)" : "uCityWindowOpening * 0.5"} / cityGridPitch;
  vec2 cityWindowFootprint = max(abs(dFdx(cityPhysicalUv)) + abs(dFdy(cityPhysicalUv)), vec2(0.001));
  vec2 cityPaneLocal = fract(cityPhysicalUv) - 0.5;
  vec2 cityAtlasPerCell = cityGridPitch * uCityWindowUnitScale / max(${authoredMetric ? "vCityAtlasCellSize" : "cityCellWorld"}, vec2(0.00001));
  vec2 citySourceCenter = vCityWindowUv - cityPaneLocal * cityAtlasPerCell;
  vec2 cityCorner = cityHalfPane * cityAtlasPerCell;
  // A zero-UV roof/trim face must never sample neighbouring facade cells
  // when its UV derivatives vanish and the metric corner offsets grow.
  float cityAuthoredFacade = texture2D(uCityWindowMask,
    (floor(vCityWindowUv) + 0.5) / uCityWindowAtlasSize).r;
  // Validate the complete physical opening against the authored facade mask.
  float cityWindowStyle = min(min(
    texture2D(uCityWindowMask, (floor(citySourceCenter + cityCorner) + 0.5) / uCityWindowAtlasSize).r,
    texture2D(uCityWindowMask, (floor(citySourceCenter - cityCorner) + 0.5) / uCityWindowAtlasSize).r), min(
    texture2D(uCityWindowMask, (floor(citySourceCenter + cityCorner * vec2(1,-1)) + 0.5) / uCityWindowAtlasSize).r,
    texture2D(uCityWindowMask, (floor(citySourceCenter + cityCorner * vec2(-1,1)) + 0.5) / uCityWindowAtlasSize).r));
  // Box-filter coverage conserves the light of small panes without inflating
  // them into squares. No fuzzy halo is painted into the window itself.
  vec2 cityPaneEdges = max(vec2(0.0), min(cityPaneLocal + cityWindowFootprint * 0.5, cityHalfPane)
    - max(cityPaneLocal - cityWindowFootprint * 0.5, -cityHalfPane)) / cityWindowFootprint;
  float cityWindowDetail = 1.0 - smoothstep(0.9, 2.2, max(cityWindowFootprint.x, cityWindowFootprint.y));
  float cityWindowPane = cityPaneEdges.x * cityPaneEdges.y * step(0.01, min(cityWindowStyle, cityAuthoredFacade)) * cityWindowDetail;
  float cityCurtainWall = ${curtainWall ? "1.0" : "0.0"};
  vec2 cityPanelEdges = vec2(1.0) - smoothstep(vec2(0.47, 0.45),
    vec2(0.49, 0.48) + cityWindowFootprint * 0.4, abs(cityPaneLocal));
  // Narrow mullions and spandrel strips are part of the authored glass facade,
  // while a zero-UV roof or structural face must remain opaque.
  float cityOfficeFacade = cityCurtainWall * step(0.01, cityAuthoredFacade);
  float cityGlass = max(cityWindowPane, cityOfficeFacade * cityPanelEdges.x * cityPanelEdges.y);
  // A floor has a coherent occupancy and light level, but rooms switch
  // independently. There are no repeated rectangular blocks of lit cells.
  vec2 cityRoomGroup = vec2(0.0, cityWindowCell.y);
  // Interpolation can change the last bits of a constant float. Quantize the
  // building seed before hashing, otherwise one pane turns into sparkling noise.
  float cityBuildingSeed = floor(vCityBuilding * 255.0 + 0.5);
  // Facade joints use the same physical bays/floors as the openings. Plaster,
  // precast panels and tower cladding differ without recolouring individual rooms.
  float cityPrecast = step(0.42, cityBuildingSeed / 255.0);
  float cityCladding = step(0.78, cityBuildingSeed / 255.0);
  float cityFacadeMask = step(0.01, cityAuthoredFacade) * (1.0 - cityCurtainWall);
  float cityFloorJoint = cityJoint(cityPhysicalUv.y);
  float cityBayJoint = cityJoint(cityPhysicalUv.x / mix(3.0, 2.0, cityCladding));
  float cityPanelJoint = max(cityFloorJoint, cityBayJoint) * cityPrecast * cityFacadeMask;
  float cityPanelTone = cityHash(vec3(floor(cityPhysicalUv / vec2(3.0, 1.0)), cityBuildingSeed));
  diffuseColor.rgb *= (1.0 - cityPanelJoint * 0.22)
   * mix(1.0, 0.97 + cityPanelTone * 0.055, cityPrecast * cityFacadeMask);
  float cityRoom = cityHash(vec3(cityWindowCell, cityBuildingSeed * 7.0));
  float cityFloor = cityHash(vec3(cityRoomGroup, cityBuildingSeed * 13.0));
  float cityOccupancy = mix(${curtainWall ? "0.015, 0.05" : "0.035, 0.14"}, smoothstep(0.2, 0.9, cityFloor));
  float cityWindowLit = step(1.0 - cityOccupancy, cityRoom);
  float cityTemperature = cityHash(vec3(cityRoomGroup + 41.0, cityBuildingSeed * 17.0));
  vec3 cityWindowColor = mix(vec3(0.14, 0.52, 0.88), vec3(0.30, 0.65, 0.96), cityTemperature);
  // Stable groups of neighbouring rooms: 84% blue, 14% white, 2% warm yellow.
  // Match luminance so the new accents do not overpower the blue-window bloom.
  float cityPalette = cityHash(vec3(floor(cityWindowCell / vec2(3.0, 1.0)) + 67.0, cityBuildingSeed * 29.0));
  float cityBlueLuminance = dot(cityWindowColor, vec3(0.2126, 0.7152, 0.0722));
  cityWindowColor = mix(cityWindowColor, vec3(0.80, 0.84, 0.87), step(0.84, cityPalette));
  cityWindowColor = mix(cityWindowColor, vec3(1.0, 0.94, 0.48), step(0.98, cityPalette));
  cityWindowColor *= cityBlueLuminance / dot(cityWindowColor, vec3(0.2126, 0.7152, 0.0722));
  float cityRoomLight = cityHash(vec3(cityRoomGroup + 113.0, cityBuildingSeed * 23.0));
  // Every switched-on pane clears the scene's HDR bloom threshold at full
  // coverage. The occupation mask, not low emission, distinguishes dark rooms.
  float cityWindowPower = mix(3.0, 3.8, cityRoomLight) * mix(0.96, 1.0, cityRoom);
  vec3 cityGlassColor = ${curtainWall
    ? "mix(vec3(0.007, 0.016, 0.027), vec3(0.010, 0.022, 0.036), cityTemperature)"
    : "mix(vec3(0.005, 0.013, 0.022), vec3(0.009, 0.022, 0.034), cityTemperature)"};
  diffuseColor.rgb = mix(diffuseColor.rgb, cityGlassColor, cityGlass);
 `);
 if (curtainWall) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
  #include <normal_fragment_maps>
  // Tiny, stable pane-to-pane variations break up broad reflections without
  // live environment capture or normal textures per building.
  vec3 cityGlassUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  vec3 cityGlassRight = normalize(cross(normal, cityGlassUp) + vec3(1e-8));
  normal = normalize(normal + cityGlass * (1.0 - smoothstep(0.2, 0.8, cityWindowFootprint.x))
    * ((cityRoom - 0.5) * cityGlassRight * 0.002 + (cityFloor - 0.5) * cityGlassUp * 0.001));
 `);
 shader.fragmentShader = shader.fragmentShader.replace("#include <metalnessmap_fragment>", `
  #include <metalnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, mix(${curtainWall ? "0.08, 0.095" : "0.20, 0.28"}, cityTemperature), cityGlass);
  metalnessFactor = mix(metalnessFactor, ${curtainWall ? "0.08" : "0.04"}, cityGlass);
 `);
 shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", `
  #include <lights_physical_fragment>
  material.specularColor *= mix(0.25, ${curtainWall ? "2.7" : "1.25"}, cityGlass);
 `);
 shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>",
  THREE.ShaderChunk.lights_fragment_maps
   .replace("iblIrradiance += getIBLIrradiance( geometry.normal );", "if (cityGlass > 0.001) iblIrradiance += getIBLIrradiance( geometry.normal ) * cityGlass * 0.15;")
   .replace("radiance += getIBLRadiance( geometry.viewDir, geometry.normal, material.roughness );",
    `if (cityGlass > 0.001) radiance += getIBLRadiance( geometry.viewDir, geometry.normal, material.roughness ) * cityGlass * mix(${curtainWall ? "1.35, 0.60" : "1.15, 0.35"}, cityWindowLit);`)
 );
 shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
  #include <emissivemap_fragment>
  totalEmissiveRadiance += cityWindowColor * cityWindowPane * cityWindowLit * cityWindowPower * uCityWindowIntensity;
 `);
 applyCityDistrictWindowShader(shader, state);
}
