import * as THREE from "three";
import {
	ABOUT_DISSOLVE_GLSL,
	applyAboutDissolveConfig,
	createAboutDissolveUniforms,
} from "./aboutDissolveShader.js";

/**
 * Side plates (`FrontBackSide` / `BackBackSide`): dark body + HUD grid + micro-specks only.
 * FrontBackSide uses a cloned instance driven by the same dissolve as Front.
 */
export function createAboutSideHudMaterial(cfg = {}) {
	const uniforms = {
		uColor: { value: new THREE.Color(cfg.color ?? "#050a14") },
		uHudColor: { value: new THREE.Color(cfg.hudColor ?? "#00b3ff") },
		uOpacity: { value: cfg.opacity ?? 1 },
		uGridScale: { value: cfg.gridScale ?? 64 },
		uGridOpacity: { value: cfg.gridOpacity ?? 0.65 },
		uSpeckDensity: { value: cfg.speckDensity ?? 65 },
		uSpeckOpacity: { value: cfg.speckOpacity ?? 1 },
		/** Soft random blink amount for micro-specks (0–1). */
		uFlicker: { value: cfg.flicker ?? 0.35 },
		uTime: { value: 0 },
		...createAboutDissolveUniforms(cfg.dissolve ?? {}),
	};

	/** Near-opaque side plates join the opaque pass (draw before transparent FX). */
	const isOpaquePlate = (cfg.opacity ?? 1) >= 0.999;

	const material = new THREE.ShaderMaterial({
		uniforms,
		transparent: true,
		depthWrite: isOpaquePlate,
		depthTest: true,
		side: THREE.DoubleSide,
		toneMapped: false,
		blending: THREE.NormalBlending,
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			varying vec3 vLocalPos;

			void main() {
				vUv = uv;
				vLocalPos = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uHudColor;
			uniform float uOpacity;
			uniform float uGridScale;
			uniform float uGridOpacity;
			uniform float uSpeckDensity;
			uniform float uSpeckOpacity;
			uniform float uFlicker;
			uniform float uTime;

			varying vec2 vUv;
			varying vec3 vLocalPos;

			float hash21(vec2 p) {
				p = fract(p * vec2(123.34, 456.21));
				p += dot(p, p + 45.32);
				return fract(p.x * p.y);
			}

			${ABOUT_DISSOLVE_GLSL}

			void main() {
				vec2 plateUv = vUv;
				if (length(plateUv) < 1e-4) {
					plateUv = vLocalPos.xz * 0.55 + 0.5;
				}

				vec2 gridUv = plateUv * uGridScale;
				vec2 gf = abs(fract(gridUv) - 0.5);
				float hatch = max(
					1.0 - smoothstep(0.0, 0.03, gf.x),
					1.0 - smoothstep(0.0, 0.03, gf.y)
				);
				float node = smoothstep(0.12, 0.02, length(gf)) * step(0.78, hash21(floor(gridUv)));
				float grid = (hatch * 0.55 + node * 1.25) * uGridOpacity;

				vec2 speckCell = floor(plateUv * uSpeckDensity);
				float rnd = hash21(speckCell);
				vec2 speckF = fract(plateUv * uSpeckDensity) - 0.5;
				float speck = smoothstep(0.14, 0.02, length(speckF)) * step(0.93, rnd);

				float phase = hash21(speckCell + 17.3) * 6.2831853;
				float speed = 1.1 + hash21(speckCell + 31.7) * 2.4;
				float blink = 0.5 + 0.5 * sin(uTime * speed + phase);
				blink *= 0.5 + 0.5 * sin(uTime * (speed * 0.37) + phase * 1.7);
				float flicker = mix(1.0, 0.55 + blink * 0.45, uFlicker);
				speck *= uSpeckOpacity * flicker;

				vec3 col = uColor;
				col += uHudColor * grid * 0.9;
				col += vec3(0.75, 0.92, 1.0) * speck * 1.15;

				float alpha = clamp(uOpacity + grid * 0.15 + speck * 0.2, 0.0, 1.0);

				vec2 dissolve = aboutDissolveSample(plateUv, vLocalPos, uTime);
				col += aboutDissolveGlow(uHudColor, dissolve.y);
				alpha *= dissolve.x;
				if (alpha < 0.004) discard;

				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	material.userData.isAboutSideHud = true;
	material.userData.uniforms = uniforms;

	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) uniforms.uColor.value.set(next.color);
		if (next.hudColor != null) uniforms.uHudColor.value.set(next.hudColor);
		if (next.opacity != null) {
			uniforms.uOpacity.value = next.opacity;
		}
		if (next.gridScale != null) uniforms.uGridScale.value = next.gridScale;
		if (next.gridOpacity != null) uniforms.uGridOpacity.value = next.gridOpacity;
		if (next.speckDensity != null) uniforms.uSpeckDensity.value = next.speckDensity;
		if (next.speckOpacity != null) uniforms.uSpeckOpacity.value = next.speckOpacity;
		if (next.flicker != null) uniforms.uFlicker.value = next.flicker;
		if (next.dissolve) applyAboutDissolveConfig(uniforms, next.dissolve);
	};

	material.userData.setTime = (elapsed) => {
		uniforms.uTime.value = elapsed;
	};

	return material;
}
