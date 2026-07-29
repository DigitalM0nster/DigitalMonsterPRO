import * as THREE from "three";

/** Chapter / enter radar sweep across the Case3 ground grid. */
export const CASE3_RADAR = {
	durationSec: 1.35,
	baseOpacity: 0.58,
	ringBand: 1.15,
	ringBoost: 1.55,
	wedgeHalfAngle: 0.28,
	wedgeBoost: 0.75,
	pointsBoost: 0.35,
	cityBoost: 0.22,
	maxRadius: 28,
	color: 0x008fd4,
};

/**
 * Ground grid with a one-shot radar sweep (expanding ring + soft wedge).
 * Driven only by uniforms — no geometry rebuild / texture upload.
 *
 * @param {number} gridSize
 * @param {number} divisions
 * @param {object[]} disposables
 */
export function createCase3GridRadar(gridSize, divisions, disposables) {
	const group = new THREE.Group();
	group.name = "case3GridRadar";
	const half = gridSize / 2;
	const positions = [];

	for (let index = 0; index <= divisions; index += 1) {
		const coordinate = -half + (index / divisions) * gridSize;
		positions.push(-half, 0, coordinate, half, 0, coordinate);
		positions.push(coordinate, 0, -half, coordinate, 0, half);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

	const uniforms = {
		fogColor: { value: new THREE.Color(0x00050b) },
		fogDensity: { value: 0.074 },
		fogNear: { value: 1 },
		fogFar: { value: 2000 },
		uColor: { value: new THREE.Color(CASE3_RADAR.color) },
		uBaseOpacity: { value: CASE3_RADAR.baseOpacity },
		uSweep: { value: 0 },
		uCenter: { value: new THREE.Vector2(0.75, -0.85) },
		uMaxRadius: { value: CASE3_RADAR.maxRadius },
		uRingBand: { value: CASE3_RADAR.ringBand },
		uRingBoost: { value: CASE3_RADAR.ringBoost },
		uWedgeHalf: { value: CASE3_RADAR.wedgeHalfAngle },
		uWedgeBoost: { value: CASE3_RADAR.wedgeBoost },
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: /* glsl */ `
			#include <common>
			#include <fog_pars_vertex>
			varying vec2 vXZ;
			void main() {
				vXZ = position.xz;
				#include <begin_vertex>
				#include <project_vertex>
				#include <fog_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			#include <common>
			#include <fog_pars_fragment>
			uniform vec3 uColor;
			uniform float uBaseOpacity;
			uniform float uSweep;
			uniform vec2 uCenter;
			uniform float uMaxRadius;
			uniform float uRingBand;
			uniform float uRingBoost;
			uniform float uWedgeHalf;
			uniform float uWedgeBoost;
			varying vec2 vXZ;

			void main() {
				float sweep = clamp(uSweep, 0.0, 1.0);
				float alive = step(0.001, sweep) * (1.0 - smoothstep(0.72, 1.0, sweep));
				vec2 d = vXZ - uCenter;
				float r = length(d);
				float sweepR = sweep * uMaxRadius;
				float ring = 1.0 - smoothstep(0.0, uRingBand, abs(r - sweepR));
				ring *= alive;

				float ang = atan(d.y, d.x);
				float wedgeAng = sweep * 6.28318530718 - 3.14159265359;
				float delta = mod(ang - wedgeAng + 3.14159265359, 6.28318530718) - 3.14159265359;
				float wedge = 1.0 - smoothstep(0.0, uWedgeHalf, abs(delta));
				wedge *= alive * (1.0 - smoothstep(uMaxRadius * 0.92, uMaxRadius, r));

				float glow = ring * uRingBoost + wedge * uWedgeBoost;
				float alpha = uBaseOpacity + glow;
				if (alpha < 0.01) discard;
				vec3 color = uColor * (0.75 + glow * 0.9);
				gl_FragColor = vec4(color, min(alpha, 1.0));
				#include <fog_fragment>
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
		fog: true,
	});

	const lines = new THREE.LineSegments(geometry, material);
	lines.frustumCulled = false;
	group.add(lines);
	group.userData.material = material;
	disposables.push(geometry, material);

	let active = false;
	let sweep = 0;

	return {
		group,
		/** @param {number} x @param {number} z */
		setCenter(x, z) {
			uniforms.uCenter.value.set(x, z);
		},
		/** Start / restart the chapter-enter sweep. */
		trigger() {
			active = true;
			sweep = 0.001;
			uniforms.uSweep.value = sweep;
		},
		/**
		 * @param {number} delta
		 * @returns {{ intensity: number }} intensity 0…1 for sibling FX (points / city)
		 */
		update(delta) {
			if (!active) {
				return { intensity: 0 };
			}
			sweep += delta / Math.max(CASE3_RADAR.durationSec, 0.05);
			if (sweep >= 1) {
				active = false;
				sweep = 0;
				uniforms.uSweep.value = 0;
				return { intensity: 0 };
			}
			uniforms.uSweep.value = sweep;
			const intensity = (1 - THREE.MathUtils.smoothstep(sweep, 0.72, 1)) * Math.min(sweep * 4, 1);
			return { intensity };
		},
		isActive() {
			return active;
		},
	};
}
