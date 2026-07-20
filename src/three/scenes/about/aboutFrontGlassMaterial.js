import * as THREE from "three";
import {
	ABOUT_DISSOLVE_GLSL,
	applyAboutDissolveConfig,
	createAboutDissolveUniforms,
} from "./aboutDissolveShader.js";

/**
 * Sci-fi glass for About `Front` plate:
 * near-black glossy volume, cyan fresnel rim, wispy plasma filaments, soft bloom food.
 */
export function createAboutFrontGlassMaterial(cfg = {}) {
	const uniforms = {
		uColor: { value: new THREE.Color(cfg.color ?? "#010408") },
		uRimColor: { value: new THREE.Color(cfg.rimColor ?? "#00e8ff") },
		uOpacity: { value: cfg.opacity ?? 0.42 },
		uRimPower: { value: cfg.rimPower ?? 2.1 },
		uRimIntensity: { value: cfg.rimIntensity ?? 2.85 },
		uInnerGlow: { value: cfg.innerGlow ?? 0.4 },
		uGridScale: { value: cfg.gridScale ?? 28 },
		uGridOpacity: { value: cfg.gridOpacity ?? 0.12 },
		uSpeckDensity: { value: cfg.speckDensity ?? 36 },
		uSpeckOpacity: { value: cfg.speckOpacity ?? 0.35 },
		uSpecIntensity: { value: cfg.specIntensity ?? 1.45 },
		uSpecPower: { value: cfg.specPower ?? 96 },
		uEnergyOpacity: { value: cfg.energyOpacity ?? 0.72 },
		uEnergyScale: { value: cfg.energyScale ?? 3.4 },
		uEnergySpeed: { value: cfg.energySpeed ?? 0.55 },
		uThickness: { value: cfg.thickness ?? 1.55 },
		/** Face-on minimum alpha — blocks liquidBackground through the plate body. */
		uFaceOpacity: { value: cfg.faceOpacity ?? 0.94 },
		uTime: { value: 0 },
		...createAboutDissolveUniforms(cfg.dissolve ?? {}),
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		depthFunc: THREE.LessEqualDepth,
		side: THREE.DoubleSide,
		toneMapped: false,
		blending: THREE.NormalBlending,
		/** Pull color pass in front of FrontDepthPrepass — kills black z-fight holes. */
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1,
		vertexShader: /* glsl */ `
			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying vec2 vUv;

			void main() {
				vUv = uv;
				vLocalPos = position;
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPos = worldPos.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uRimColor;
			uniform float uOpacity;
			uniform float uRimPower;
			uniform float uRimIntensity;
			uniform float uInnerGlow;
			uniform float uGridScale;
			uniform float uGridOpacity;
			uniform float uSpeckDensity;
			uniform float uSpeckOpacity;
			uniform float uSpecIntensity;
			uniform float uSpecPower;
			uniform float uEnergyOpacity;
			uniform float uEnergyScale;
			uniform float uEnergySpeed;
			uniform float uThickness;
			uniform float uFaceOpacity;
			uniform float uTime;

			varying vec3 vWorldNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying vec2 vUv;

			float hash21(vec2 p) {
				p = fract(p * vec2(123.34, 456.21));
				p += dot(p, p + 45.32);
				return fract(p.x * p.y);
			}

			float noise(vec2 p) {
				vec2 i = floor(p);
				vec2 f = fract(p);
				float a = hash21(i);
				float b = hash21(i + vec2(1.0, 0.0));
				float c = hash21(i + vec2(0.0, 1.0));
				float d = hash21(i + vec2(1.0, 1.0));
				vec2 u = f * f * (3.0 - 2.0 * f);
				return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
			}

			float fbm(vec2 p) {
				float v = 0.0;
				float a = 0.5;
				mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
				for (int i = 0; i < 5; i++) {
					v += a * noise(p);
					p = m * p * 2.05;
					a *= 0.5;
				}
				return v;
			}

			${ABOUT_DISSOLVE_GLSL}

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				if (dot(N, V) < 0.0) N = -N;

				float ndotv = clamp(dot(N, V), 0.0, 1.0);
				float fresnel = pow(1.0 - ndotv, uRimPower);
				float face = pow(ndotv, 1.35);

				// Sharp glossy highlight (top key) + softer fill — no point-light orbs.
				vec3 L1 = normalize(vec3(0.15, 0.95, 0.25));
				vec3 L2 = normalize(vec3(-0.65, 0.2, 0.6));
				float spec1 = pow(max(dot(N, normalize(L1 + V)), 0.0), uSpecPower);
				float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), uSpecPower * 0.4) * 0.35;
				float spec = (spec1 + spec2) * uSpecIntensity;

				vec2 plateUv = vUv;
				if (length(plateUv) < 1e-4) {
					plateUv = vLocalPos.xz * 0.55 + 0.5;
				}

				// Very subtle etched grid (reference is plasma-first, not HUD-first).
				vec2 gridUv = plateUv * uGridScale;
				vec2 gf = abs(fract(gridUv) - 0.5);
				float hatch = max(
					1.0 - smoothstep(0.0, 0.03, gf.x),
					1.0 - smoothstep(0.0, 0.03, gf.y)
				);
				float grid = hatch * uGridOpacity * (0.25 + fresnel);

				// Sparse dust.
				vec2 speckCell = floor(plateUv * uSpeckDensity);
				float rnd = hash21(speckCell);
				vec2 speckF = fract(plateUv * uSpeckDensity) - 0.5;
				float speck = smoothstep(0.14, 0.02, length(speckF)) * step(0.93, rnd);
				speck *= uSpeckOpacity * (0.25 + fresnel);

				// Wispy plasma filaments (domain-warped fbm ridges).
				vec2 eUv = plateUv * uEnergyScale;
				float t = uTime * uEnergySpeed;
				vec2 warp = vec2(
					fbm(eUv + vec2(t * 0.15, -t * 0.08)),
					fbm(eUv * 1.3 + vec2(-t * 0.1, t * 0.12))
				);
				float n1 = fbm(eUv * 1.4 + warp * 1.8);
				float n2 = fbm(eUv * 2.6 - warp.yx * 1.2 + vec2(t * 0.05, 0.0));
				float ridges = abs(n1 * 2.0 - 1.0);
				ridges = 1.0 - smoothstep(0.02, 0.28, ridges);
				float veil = smoothstep(0.35, 0.85, n2);
				float filaments = ridges * (0.45 + veil * 0.9);
				// Stronger near rims / bevels, softer on flat face.
				filaments *= mix(0.35, 1.35, fresnel) * (0.55 + face * 0.6);
				float energy = filaments * uEnergyOpacity;

				// Noisy rim break-up (etched / plasma edge, not a clean outline).
				float rimNoise = mix(0.65, 1.35, fbm(plateUv * 14.0 + t * 0.2));
				float rim = fresnel * rimNoise;

				float volume = mix(uThickness * 0.18, 1.05, fresnel);
				// Solid dark plate body face-on (not a window onto the site background).
				vec3 base = uColor * (0.55 + face * 0.7);
				vec3 col = base * max(volume, face * 0.85);

				col += uRimColor * rim * uRimIntensity;
				col += uRimColor * face * uInnerGlow * 0.25;
				col += uRimColor * energy * (1.25 + rim * 0.6);
				col += uRimColor * grid * 0.8;
				col += vec3(0.7, 0.92, 1.0) * speck;
				col += vec3(0.95, 0.98, 1.0) * spec;

				float bodyAlpha = mix(uFaceOpacity, uOpacity * 0.55, fresnel);
				float alpha = clamp(
					bodyAlpha * uOpacity
					+ rim * uRimIntensity * 0.35
					+ energy * 0.35
					+ grid * 0.12
					+ speck * 0.2
					+ spec * 0.15,
					0.0,
					0.985
				);
				// Keep the flat face sealed against the background layer.
				alpha = max(alpha, face * uFaceOpacity * uOpacity);

				vec2 dissolve = aboutDissolveSample(plateUv, vLocalPos, t);
				col += aboutDissolveGlow(uRimColor, dissolve.y);
				alpha *= dissolve.x;
				if (alpha < 0.004) discard;

				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	material.userData.isAboutFrontGlass = true;
	material.userData.uniforms = uniforms;

	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) uniforms.uColor.value.set(next.color);
		if (next.rimColor != null) uniforms.uRimColor.value.set(next.rimColor);
		if (next.opacity != null) uniforms.uOpacity.value = next.opacity;
		if (next.rimPower != null) uniforms.uRimPower.value = next.rimPower;
		if (next.rimIntensity != null) uniforms.uRimIntensity.value = next.rimIntensity;
		if (next.innerGlow != null) uniforms.uInnerGlow.value = next.innerGlow;
		if (next.gridScale != null) uniforms.uGridScale.value = next.gridScale;
		if (next.gridOpacity != null) uniforms.uGridOpacity.value = next.gridOpacity;
		if (next.speckDensity != null) uniforms.uSpeckDensity.value = next.speckDensity;
		if (next.speckOpacity != null) uniforms.uSpeckOpacity.value = next.speckOpacity;
		if (next.specIntensity != null) uniforms.uSpecIntensity.value = next.specIntensity;
		if (next.specPower != null) uniforms.uSpecPower.value = next.specPower;
		if (next.energyOpacity != null) uniforms.uEnergyOpacity.value = next.energyOpacity;
		if (next.energyScale != null) uniforms.uEnergyScale.value = next.energyScale;
		if (next.energySpeed != null) uniforms.uEnergySpeed.value = next.energySpeed;
		if (next.thickness != null) uniforms.uThickness.value = next.thickness;
		if (next.faceOpacity != null) uniforms.uFaceOpacity.value = next.faceOpacity;
		if (next.dissolve) applyAboutDissolveConfig(uniforms, next.dissolve);
	};

	material.userData.setTime = (elapsed) => {
		uniforms.uTime.value = elapsed;
	};

	return material;
}
