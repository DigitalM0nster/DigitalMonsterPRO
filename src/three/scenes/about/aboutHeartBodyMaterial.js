import * as THREE from "three";

/**
 * Futuristic processor / silicon-die body for HeartMain / HeartCenter.
 * Not plain metal — dark ceramic substrate, micro-traces, iridescent limb.
 */
export function createAboutHeartBodyMaterial(cfg = {}) {
	const uniforms = {
		uColor: { value: new THREE.Color(cfg.color ?? "#070c14") },
		uSheenColor: { value: new THREE.Color(cfg.sheenColor ?? "#1a3348") },
		uRimColor: { value: new THREE.Color(cfg.rimColor ?? "#5ee7ff") },
		uAccentColor: { value: new THREE.Color(cfg.accentColor ?? "#7b5cff") },
		uTraceColor: { value: new THREE.Color(cfg.traceColor ?? "#00b3ff") },
		uRimPower: { value: cfg.rimPower ?? 2.4 },
		uRimIntensity: { value: cfg.rimIntensity ?? 1.85 },
		uSheen: { value: cfg.sheen ?? 0.55 },
		uIridescence: { value: cfg.iridescence ?? 0.65 },
		uGridScale: { value: cfg.gridScale ?? 42 },
		uGridOpacity: { value: cfg.gridOpacity ?? 0.28 },
		uTraceOpacity: { value: cfg.traceOpacity ?? 0.4 },
		uSpeckDensity: { value: cfg.speckDensity ?? 70 },
		uSpeckOpacity: { value: cfg.speckOpacity ?? 0.55 },
		uEnergyOpacity: { value: cfg.energyOpacity ?? 0.22 },
		uEnergySpeed: { value: cfg.energySpeed ?? 0.35 },
		uTime: { value: 0 },
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		transparent: false,
		depthWrite: true,
		depthTest: true,
		side: THREE.DoubleSide,
		toneMapped: false,
		blending: THREE.NormalBlending,
		vertexShader: /* glsl */ `
			varying vec3 vWorldNormal;
			varying vec3 vLocalNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying vec2 vUv;

			void main() {
				vUv = uv;
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
			uniform vec3 uAccentColor;
			uniform vec3 uTraceColor;
			uniform float uRimPower;
			uniform float uRimIntensity;
			uniform float uSheen;
			uniform float uIridescence;
			uniform float uGridScale;
			uniform float uGridOpacity;
			uniform float uTraceOpacity;
			uniform float uSpeckDensity;
			uniform float uSpeckOpacity;
			uniform float uEnergyOpacity;
			uniform float uEnergySpeed;
			uniform float uTime;

			varying vec3 vWorldNormal;
			varying vec3 vLocalNormal;
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

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
				float fresnel = pow(1.0 - ndotv, uRimPower);

				/**
				 * Kill soft cyan fill on inner ring walls: only outer-facing
				 * surfaces get rim / iridescence (local normals vs radial out).
				 */
				vec2 radialXZ = vLocalPos.xz;
				float radialLen = length(radialXZ);
				vec3 outwardDir = radialLen > 1e-5
					? normalize(vec3(radialXZ.x, 0.0, radialXZ.y))
					: vec3(0.0, 1.0, 0.0);
				float facingOut = dot(normalize(vLocalNormal), outwardDir);
				float outerMask = smoothstep(-0.05, 0.4, facingOut);

				vec2 plateUv = vUv;
				if (length(plateUv) < 1e-4) {
					plateUv = vLocalPos.xz * 0.7 + 0.5;
				}

				/** Silicon die micro-grid + via pads. */
				vec2 gridUv = plateUv * uGridScale;
				vec2 gf = abs(fract(gridUv) - 0.5);
				float lineX = 1.0 - smoothstep(0.0, 0.028, gf.x);
				float lineY = 1.0 - smoothstep(0.0, 0.028, gf.y);
				float hatch = max(lineX, lineY);
				float via = smoothstep(0.11, 0.03, length(gf)) * step(0.82, hash21(floor(gridUv)));
				float grid = (hatch * 0.45 + via * 1.1) * uGridOpacity;

				/** Sparse Manhattan traces (processor routing). */
				float cell = hash21(floor(gridUv * 0.5));
				float traceH = lineX * step(0.62, cell) * step(cell, 0.78);
				float traceV = lineY * step(0.78, cell) * step(cell, 0.92);
				float traces = (traceH + traceV) * uTraceOpacity;

				/** Die micro-specks. */
				vec2 speckCell = floor(plateUv * uSpeckDensity);
				float rnd = hash21(speckCell + 9.1);
				vec2 speckF = fract(plateUv * uSpeckDensity) - 0.5;
				float speck = smoothstep(0.13, 0.03, length(speckF)) * step(0.94, rnd) * uSpeckOpacity;

				/** Soft sheen lobe — keep muted on inner walls. */
				vec3 L = normalize(vec3(0.35, 0.8, 0.45));
				float ndotl = clamp(dot(N, L), 0.0, 1.0);
				float sheen = pow(ndotl, 22.0) * uSheen * mix(0.25, 1.0, outerMask);

				/** Iridescent limb only on outer silhouette — not inside the metal. */
				float iriWave = sin(fresnel * 9.0 + plateUv.x * 6.0 + uTime * 0.2) * 0.5 + 0.5;
				vec3 iri = mix(uRimColor, uAccentColor, iriWave) * fresnel * uIridescence * outerMask;

				/** Slow energy sweep across the die. */
				float sweep = fract(plateUv.x * 0.65 - uTime * uEnergySpeed + noise(plateUv * 3.0) * 0.15);
				float band = smoothstep(0.0, 0.08, sweep) * (1.0 - smoothstep(0.12, 0.22, sweep));
				float energy = band * uEnergyOpacity * (0.35 + grid * 0.8) * mix(0.2, 1.0, outerMask);

				vec3 col = uColor;
				col = mix(col, uSheenColor, (0.12 + ndotl * 0.12) * mix(0.35, 1.0, outerMask));
				col += uSheenColor * sheen * 0.85;
				col += uTraceColor * (grid * 0.55 + traces * 1.1);
				col += vec3(0.7, 0.9, 1.0) * speck * 0.9;
				col += iri * uRimIntensity;
				col += uRimColor * fresnel * uRimIntensity * 0.35 * outerMask;
				col += uTraceColor * energy;

				gl_FragColor = vec4(col, 1.0);
			}
		`,
	});

	material.userData.isAboutHeartBody = true;
	material.userData.uniforms = uniforms;

	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) uniforms.uColor.value.set(next.color);
		if (next.sheenColor != null) uniforms.uSheenColor.value.set(next.sheenColor);
		if (next.rimColor != null) uniforms.uRimColor.value.set(next.rimColor);
		if (next.accentColor != null) uniforms.uAccentColor.value.set(next.accentColor);
		if (next.traceColor != null) uniforms.uTraceColor.value.set(next.traceColor);
		if (next.rimPower != null) uniforms.uRimPower.value = next.rimPower;
		if (next.rimIntensity != null) uniforms.uRimIntensity.value = next.rimIntensity;
		if (next.sheen != null) uniforms.uSheen.value = next.sheen;
		if (next.iridescence != null) uniforms.uIridescence.value = next.iridescence;
		if (next.gridScale != null) uniforms.uGridScale.value = next.gridScale;
		if (next.gridOpacity != null) uniforms.uGridOpacity.value = next.gridOpacity;
		if (next.traceOpacity != null) uniforms.uTraceOpacity.value = next.traceOpacity;
		if (next.speckDensity != null) uniforms.uSpeckDensity.value = next.speckDensity;
		if (next.speckOpacity != null) uniforms.uSpeckOpacity.value = next.speckOpacity;
		if (next.energyOpacity != null) uniforms.uEnergyOpacity.value = next.energyOpacity;
		if (next.energySpeed != null) uniforms.uEnergySpeed.value = next.energySpeed;
	};

	material.userData.setTime = (elapsed) => {
		uniforms.uTime.value = elapsed;
	};

	return material;
}
