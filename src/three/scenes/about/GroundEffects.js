import * as THREE from "three";
import { ABOUT_COLORS, ABOUT_GROUND } from "./aboutSceneConfig.js";

function createRingsMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			uVisibility: { value: 1 },
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(ABOUT_COLORS.cyan) },
		},
		vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform float uVisibility;
			uniform float uTime;
			uniform vec3 uColor;
			varying vec2 vUv;
			void main() {
				vec2 p = vUv * 2.0 - 1.0;
				float r = length(p);
				float angle = atan(p.y, p.x);
				float rings = 0.0;
				float radii[4];
				radii[0] = 0.28;
				radii[1] = 0.42;
				radii[2] = 0.58;
				radii[3] = 0.76;
				for (int i = 0; i < 4; i++) {
					float d = abs(r - radii[i]);
					float line = smoothstep(0.012, 0.0, d);
					float dash = i == 1 || i == 3
						? step(0.45, fract(angle / 6.28318530718 * (8.0 + float(i) * 3.0) + uTime * 0.08 * float(i + 1)))
						: 1.0;
					rings += line * dash * (0.35 - float(i) * 0.05);
				}
				float alpha = rings * uVisibility * 0.85;
				if (alpha < 0.01) discard;
				gl_FragColor = vec4(uColor * (0.8 + rings), alpha);
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		toneMapped: false,
	});
}

function createGlowMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			uVisibility: { value: 0 },
			uColor: { value: new THREE.Color(ABOUT_COLORS.groundGlow) },
		},
		vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform float uVisibility;
			uniform vec3 uColor;
			varying vec2 vUv;
			void main() {
				vec2 p = vUv * 2.0 - 1.0;
				float r = length(p);
				float glow = exp(-r * r * 2.8) * (1.0 - smoothstep(0.55, 1.0, r));
				float alpha = glow * uVisibility * 0.7;
				if (alpha < 0.01) discard;
				gl_FragColor = vec4(uColor * (1.0 + glow), alpha);
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		toneMapped: false,
	});
}

/**
 * Concentric tech rings (scene 1–2) + soft ground glow (scene 3).
 */
export function createGroundEffects({ mobile = false } = {}) {
	const group = new THREE.Group();
	group.name = "GroundEffects";

	const ringsGeo = new THREE.PlaneGeometry(ABOUT_GROUND.glowScale * 1.15, ABOUT_GROUND.glowScale * 1.15);
	const ringsMat = createRingsMaterial();
	const rings = new THREE.Mesh(ringsGeo, ringsMat);
	rings.rotation.x = -Math.PI / 2;
	rings.position.y = ABOUT_GROUND.ringY;
	rings.renderOrder = 0;
	group.add(rings);

	const glowGeo = new THREE.PlaneGeometry(ABOUT_GROUND.glowScale, ABOUT_GROUND.glowScale);
	const glowMat = createGlowMaterial();
	const glow = new THREE.Mesh(glowGeo, glowMat);
	glow.rotation.x = -Math.PI / 2;
	glow.position.y = ABOUT_GROUND.glowY;
	glow.renderOrder = 0;
	glow.visible = !mobile;
	group.add(glow);

	return {
		group,
		applyMotion(motion) {
			ringsMat.uniforms.uVisibility.value = motion.groundRings;
			rings.visible = motion.groundRings > 0.02;
			glowMat.uniforms.uVisibility.value = mobile ? 0 : motion.groundGlow;
			glow.visible = !mobile && motion.groundGlow > 0.02;
		},
		updateIdle(elapsed) {
			ringsMat.uniforms.uTime.value = elapsed;
		},
		dispose() {
			ringsGeo.dispose();
			ringsMat.dispose();
			glowGeo.dispose();
			glowMat.dispose();
		},
	};
}
