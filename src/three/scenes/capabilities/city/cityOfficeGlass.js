import * as THREE from "three";
import { applyCityDistrictWindowShader } from "./cityDistrictWindows.js";

/** Coated curtain glazing and occupied office suites, without per-window meshes. */
export function createCityOfficeGlass(environment, windowState) {
  const material = new THREE.MeshStandardMaterial({
    name: "CityArchitectural-office", color: new THREE.Color(0.012, 0.023, 0.034),
    roughness: 0.035, metalness: 0, envMap: environment, envMapIntensity: 6,
    side: THREE.FrontSide, fog: true, dithering: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOfficeReflection = { value: material.cityOfficeEnvironment };
    shader.uniforms.uOfficeProbePosition = { value: material.cityOfficeProbePosition };
    shader.uniforms.uOfficeProbeMin = { value: material.cityOfficeProbeBounds.min };
    shader.uniforms.uOfficeProbeMax = { value: material.cityOfficeProbeBounds.max };
    shader.uniforms.uOfficeParallax = material.cityOfficeParallax ??= { value: 1 };
    shader.uniforms.uOfficeLightIntensity = windowState?.intensity ?? { value: 1 };
    shader.vertexShader = `
      #ifndef USE_UV1
        attribute vec2 uv1;
      #endif
      varying vec2 vOfficeMetric;
      varying vec3 vOfficeWorld;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vOfficeMetric = uv1;
      vec4 officePosition = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        officePosition = instanceMatrix * officePosition;
      #endif
      vOfficeWorld = (modelMatrix * officePosition).xyz;
    `);
    shader.fragmentShader = `varying vec2 vOfficeMetric;
      varying vec3 vOfficeWorld;
      uniform float uOfficeLightIntensity;
      float officeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <envmap_physical_pars_fragment>", `
      uniform samplerCube uOfficeReflection;
      uniform vec3 uOfficeProbePosition;
      uniform vec3 uOfficeProbeMin;
      uniform vec3 uOfficeProbeMax;
      uniform float uOfficeParallax;
      vec3 getIBLIrradiance(const in vec3 normal) { return vec3(0.0); }
      vec3 getIBLRadiance(const in vec3 viewDir, const in vec3 normal, const in float roughness) {
        vec3 direction = inverseTransformDirection(reflect(-viewDir, normal), viewMatrix);
        // Local box projection: an infinite-distance cubemap magnifies the
        // neighbour's windows on a facade seen from far away. Intersect each
        // fragment's reflected ray with the neighbourhood volume, then sample
        // that point from the capture position. No raymarch or extra texture.
        vec3 safeRay = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), direction))
          * max(abs(direction), vec3(0.00001));
        vec3 farPlane = max((uOfficeProbeMin - vOfficeWorld) / safeRay,
          (uOfficeProbeMax - vOfficeWorld) / safeRay);
        float distanceToBox = max(0.0, min(min(farPlane.x, farPlane.y), farPlane.z));
        vec3 projected = vOfficeWorld + direction * distanceToBox - uOfficeProbePosition;
        direction = normalize(mix(direction, normalize(projected), uOfficeParallax));
        // The frozen cube retains architectural edges. Hardware mip selection
        // filters by pixel footprint, without a frosted PMREM convolution.
        return textureCube(uOfficeReflection, direction).rgb * envMapIntensity;
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      // Physical bays and storeys, authored in the facade plane. Filter joints
      // analytically instead of introducing thousands of geometry strips.
      vec2 officeGrid = vOfficeMetric / vec2(0.28, 0.36);
      vec2 officePixel = max(fwidth(officeGrid), vec2(0.0001));
      vec2 officeEdge = min(fract(officeGrid), 1.0 - fract(officeGrid));
      vec2 officeLine = (1.0 - smoothstep(vec2(0.011, 0.018),
        vec2(0.011, 0.018) + officePixel, officeEdge))
        * (1.0 - smoothstep(vec2(0.25), vec2(0.85), officePixel));
      float officeFrame = max(officeLine.x, officeLine.y);
      float officeSpandrel = (1.0 - smoothstep(0.045, 0.07 + officePixel.y, officeEdge.y))
        * (1.0 - smoothstep(0.3, 0.9, officePixel.y));
      // The unit of occupancy is an office suite along one storey, not a
      // randomly illuminated pixel. Adjacent panes share light and colour.
      float officeFloor = floor(officeGrid.y);
      float officeSuite = floor((officeGrid.x + mod(officeFloor, 3.0) * 2.0) / 6.0);
      float officeFloorActive = step(0.68, officeHash(vec2(officeFloor, 83.0)));
      float officeOccupied = officeFloorActive * step(0.60, officeHash(vec2(officeSuite, officeFloor)));
      float officePane = (1.0 - officeFrame) * (1.0 - officeSpandrel);
      float officeColour = officeHash(vec2(officeSuite + 31.0, officeFloor));
      vec3 officeLight = officeColour < 0.47 ? vec3(0.57, 0.76, 1.0)
        : officeColour < 0.92 ? vec3(0.91, 0.94, 1.0) : vec3(1.0, 0.94, 0.73);
      // A dim room behind the pane and a narrow ceiling luminaire. Emitting
      // the whole suite at HDR intensity produces an implausible neon bar.
      vec2 officeInside = smoothstep(vec2(0.065), vec2(0.11) + officePixel, officeEdge);
      float officeUnresolved = smoothstep(0.25, 0.65, max(officePixel.x, officePixel.y));
      float officeInterior = mix(officeInside.x * officeInside.y, 0.61, officeUnresolved);
      float officeY = fract(officeGrid.y);
      float officeCeiling = smoothstep(0.56, 0.64 + officePixel.y, officeY)
        * (1.0 - smoothstep(0.78, 0.86 + officePixel.y, officeY));
      // Preserve average light energy when a pane is smaller than a pixel;
      // shrinking the facade must not switch occupied floors off.
      officeCeiling = mix(officeCeiling, 0.22, officeUnresolved);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.056, 0.065), officeFrame);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      roughnessFactor = 0.035;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", `
      #include <lights_physical_fragment>
      // A neutral dielectric coating, not metallic blue paint. Keep the view-
      // dependent Fresnel term; never add a diffuse or emissive reflection wash.
      material.specularColor = mix(vec3(0.13, 0.145, 0.16), vec3(0.04), officeFrame);
      material.specularColor *= mix(1.0, 0.38, officeOccupied * officePane);
      // Do not average roughness with subpixel mullions: that turns the entire
      // facade frosted at oblique angles. Coverage attenuates specular energy;
      // only a fully resolved opaque frame gets the rough frame lobe.
      material.roughness = min(1.0, mix(0.035, 0.32, step(0.98, officeFrame)) + geometryRoughness);
      material.diffuseColor *= mix(1.0, 0.55, officeSpandrel);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += officeLight / dot(officeLight, vec3(0.2126, 0.7152, 0.0722))
        * officeOccupied * officePane * officeInterior * (0.22 + officeCeiling * 1.0) * uOfficeLightIntensity;
    `);
    applyCityDistrictWindowShader(shader, windowState);
  };
  material.customProgramCacheKey = () => "city-office-coated-glass-v7";
  return material;
}
