import * as THREE from "three";
import {
	ABOUT_DISSOLVE_GLSL,
	applyAboutDissolveConfig,
	createAboutDissolveUniforms,
} from "./aboutDissolveShader.js";

/**
 * OUTER_cell body / OuterCellSeam materials.
 * @param {{ fibersMode?: "always" | "never" | "attrib" }} [cfg]
 *   - always → Blender material OuterCellSeam (whole mesh is seam)
 *   - never  → clean plate body (OuterCell / OUTER_cell*)
 *   - attrib → legacy aRib mask (unused when seams are separate meshes)
 */
export function createAboutOuterCellMaterial(cfg = {}) {
	const fibersMode = cfg.fibersMode === "always" || cfg.fibersMode === "attrib" ? cfg.fibersMode : "never";
	const uniforms = {
		uColor: { value: new THREE.Color(cfg.color ?? "#070c14") },
		uSheenColor: { value: new THREE.Color(cfg.sheenColor ?? "#1a3348") },
		uRimColor: { value: new THREE.Color(cfg.rimColor ?? "#5ee7ff") },
		uFiberColor: { value: new THREE.Color(cfg.fiberColor ?? "#7adfff") },
		uRimPower: { value: cfg.rimPower ?? 2.8 },
		uRimIntensity: { value: cfg.rimIntensity ?? 0.85 },
		uSheen: { value: cfg.sheen ?? 0.45 },
		/** Same micro-scale as the accidental heartBody rib look. */
		uFiberScale: { value: cfg.fiberScale ?? 56 },
		uFiberDensity: { value: cfg.fiberDensity ?? 0.55 },
		uFiberIntensity: { value: cfg.fiberIntensity ?? 4.2 },
		/** 0 = never, 1 = always, 2 = aRib attribute */
		uFibersMode: { value: fibersMode === "always" ? 1 : fibersMode === "attrib" ? 2 : 0 },
		uTime: { value: 0 },
		...createAboutDissolveUniforms(cfg.dissolve ?? {}),
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		transparent: true,
		depthWrite: true,
		depthTest: true,
		side: THREE.DoubleSide,
		toneMapped: false,
		blending: THREE.NormalBlending,
		/** Missing aRib → no seam → no fibers. */
		defaultAttributeValues: {
			aRib: [0],
		},
		vertexShader: /* glsl */ `
			attribute float aRib;

			varying vec3 vWorldNormal;
			varying vec3 vLocalNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying float vRib;

			void main() {
				vRib = aRib;
				vLocalPos = position;
				vLocalNormal = normalize(normal);
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPos = worldPos.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uSheenColor;
			uniform vec3 uRimColor;
			uniform vec3 uFiberColor;
			uniform float uRimPower;
			uniform float uRimIntensity;
			uniform float uSheen;
			uniform float uFiberScale;
			uniform float uFiberDensity;
			uniform float uFiberIntensity;
			uniform float uFibersMode;
			uniform float uTime;

			varying vec3 vWorldNormal;
			varying vec3 vLocalNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying float vRib;

			float hash21(vec2 p) {
				p = fract(p * vec2(123.34, 456.21));
				p += dot(p, p + 45.32);
				return fract(p.x * p.y);
			}

			/**
			 * Green-arrow look: irregular needle clusters — NOT axis-aligned columns.
			 * Short random-angle shards + sparse dots, broken periodicity.
			 */
			float irregularFibers(vec2 uv, float scale, float density) {
				/** Break vertical striping: warp + per-tile rotation. */
				vec2 warp = uv * scale;
				warp += vec2(
					hash21(floor(warp.yx * 0.37) + 2.1) - 0.5,
					hash21(floor(warp.xy * 0.29) + 7.4) - 0.5
				) * 1.35;

				vec2 cell = floor(warp);
				vec2 f = fract(warp) - 0.5;
				float h = hash21(cell);
				float h2 = hash21(cell + 19.7);
				float h3 = hash21(cell + 41.3);

				/** Cluster gate — empty tiles, dense clumps (like top fragments). */
				float cluster = step(1.0 - density * 0.85, h) * step(0.25, h2 + h3);

				/** Random angle needle (not grid-aligned). */
				float ang = h2 * 6.2831853;
				float ca = cos(ang);
				float sa = sin(ang);
				vec2 r = vec2(ca * f.x - sa * f.y, sa * f.x + ca * f.y);
				float halfLen = mix(0.08, 0.28, h3);
				float halfWid = mix(0.012, 0.035, h);
				float needle = step(abs(r.x), halfLen) * step(abs(r.y), halfWid);

				/** Second crossed shard at another angle. */
				float ang2 = h3 * 6.2831853 + 1.1;
				float ca2 = cos(ang2);
				float sa2 = sin(ang2);
				vec2 r2 = vec2(ca2 * f.x - sa2 * f.y, sa2 * f.x + ca2 * f.y);
				float needle2 = step(abs(r2.x), halfLen * 0.65) * step(abs(r2.y), halfWid * 0.9)
					* step(0.45, h2);

				/** Bright micro-dots offset inside the cell. */
				vec2 dotOff = vec2(h, h2) - 0.5;
				float micro = step(length(f - dotOff * 0.35), mix(0.03, 0.07, h3))
					* step(0.35, h);

				return cluster * max(max(needle, needle2), micro);
			}

			${ABOUT_DISSOLVE_GLSL}

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
				float fresnel = pow(1.0 - ndotv, uRimPower);

				/** 0 never · 1 always (OuterCellSeam mesh) · 2 aRib attrib */
				float seamMask = uFibersMode > 1.5
					? step(0.5, vRib)
					: (uFibersMode > 0.5 ? 1.0 : 0.0);

				vec3 L = normalize(vec3(0.35, 0.85, 0.4));
				float ndotl = clamp(dot(N, L), 0.0, 1.0);
				float sheen = pow(ndotl, 28.0) * uSheen;

				vec3 col = uColor;
				col = mix(col, uSheenColor, 0.08 + ndotl * 0.12);
				col += uSheenColor * sheen * 0.55;
				/** Subtle rim on clean plate body. */
				col += uRimColor * fresnel * uRimIntensity * 0.22 * (1.0 - seamMask);

				/** Microchips on OuterCellSeam (authored) / aRib seams. */
				if (seamMask > 0.5) {
					vec3 Lp = vLocalPos;
					vec3 an = abs(normalize(vLocalNormal));
					vec2 uvA = Lp.zy;
					vec2 uvB = Lp.xz;
					vec2 uvC = Lp.xy;
					float wA = an.x * an.x;
					float wB = an.y * an.y;
					float wC = an.z * an.z;
					float wSum = max(1e-4, wA + wB + wC);
					vec2 fiberUv = (uvA * wA + uvB * wB + uvC * wC) / wSum;
					fiberUv += hash21(floor(Lp.xy * 3.0 + Lp.z * 2.0)) * 0.15;

					float f1 = irregularFibers(fiberUv, uFiberScale, uFiberDensity);
					float f2 = irregularFibers(fiberUv.yx * 1.13 + 0.37, uFiberScale * 1.35, uFiberDensity * 0.8);
					float fibers = max(f1, f2 * 0.75) * seamMask;
					col += uFiberColor * fibers * uFiberIntensity;
					col += vec3(0.85, 0.97, 1.0) * fibers * uFiberIntensity * 0.55;
				}

				/** Stable surface UV — must not scramble hexTransition tiling. */
				vec2 dissolveUv = vec2(
					atan(vLocalPos.z, vLocalPos.x) * 0.3183 + 0.5,
					vLocalPos.y * 0.55 + length(vLocalPos.xz) * 0.25 + 0.5
				);
				vec2 dissolve = aboutDissolveSample(dissolveUv, vLocalPos, uTime);
				col += aboutDissolveGlow(uRimColor, dissolve.y);
				float alpha = dissolve.x;
				if (alpha < 0.004) discard;

				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	material.userData.isAboutOuterCell = true;
	material.userData.isAboutOuterCellSeam = fibersMode === "always";
	material.userData.uniforms = uniforms;

	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) uniforms.uColor.value.set(next.color);
		if (next.sheenColor != null) uniforms.uSheenColor.value.set(next.sheenColor);
		if (next.rimColor != null) uniforms.uRimColor.value.set(next.rimColor);
		if (next.fiberColor != null) uniforms.uFiberColor.value.set(next.fiberColor);
		if (next.rimPower != null) uniforms.uRimPower.value = next.rimPower;
		if (next.rimIntensity != null) uniforms.uRimIntensity.value = next.rimIntensity;
		if (next.sheen != null) uniforms.uSheen.value = next.sheen;
		if (next.fiberScale != null) uniforms.uFiberScale.value = next.fiberScale;
		if (next.fiberDensity != null) uniforms.uFiberDensity.value = next.fiberDensity;
		if (next.fiberIntensity != null) uniforms.uFiberIntensity.value = next.fiberIntensity;
		if (next.fibersMode === "always") uniforms.uFibersMode.value = 1;
		else if (next.fibersMode === "attrib") uniforms.uFibersMode.value = 2;
		else if (next.fibersMode === "never") uniforms.uFibersMode.value = 0;
		if (next.dissolve) applyAboutDissolveConfig(uniforms, next.dissolve);
	};

	material.userData.setTime = (elapsed) => {
		uniforms.uTime.value = elapsed;
	};

	return material;
}
