import * as THREE from "three";
import { withCityParkDistricts } from "./cityParkDistricts.js";
import { CityDistrictMarkers } from "./CityDistrictMarkers.js";

/** One prepared draw for district paving, the inner light falloff and its rim. */
export class CityDistrictHighlight {
	constructor(data, renderer) {
		data = withCityParkDistricts(data);
		this.districts = data.districts;
		this.levels = new Float32Array(this.districts.length);
		this.hovered = -1;
		this.focus = new THREE.Vector3();
		this.pointerActive = false;
		this.buildings = this.districts.flatMap((district, id) => district.buildings.map(bounds => ({
			id, box: new THREE.Box3(new THREE.Vector3(...bounds.slice(0, 3)), new THREE.Vector3(...bounds.slice(3))),
		})));
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
		geometry.setAttribute("aDistrict", new THREE.Float32BufferAttribute(data.ids, 1));
		geometry.setAttribute("aKind", new THREE.Float32BufferAttribute(data.kinds, 1));
		geometry.computeBoundingSphere();
		const material = new THREE.ShaderMaterial({
			name: "CityDistrictPlatformGlow", transparent: true, depthWrite: false,
			blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
			uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLevels: { value: this.levels } }]),
			vertexShader: `
				uniform float uLevels[${this.levels.length}];
				attribute float aDistrict;
				attribute float aKind;
				varying float vLevel;
				varying vec3 vColor;
				#include <fog_pars_vertex>
				void main() {
					vLevel = uLevels[int(aDistrict + 0.5)];
					// The garden edge remains subtly discoverable before hover.
					if(aKind > 4.5) vLevel = .075 + vLevel * .925;
					vColor = aKind > 4.5 ? vec3(.12, 3.7, 5.0)
						: aKind > 3.5 ? vec3(.012, .26, .37)
						: aKind > 2.5 ? vec3(.005, .042, .05)
						: aKind > 1.5 ? vec3(0.18, 3.2, 8.5)
						: aKind > 0.5 ? vec3(0.016, 0.18, 0.52) : vec3(0.006, 0.027, 0.052);
					vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
					gl_Position = projectionMatrix * mvPosition;
					#include <fog_vertex>
				}`,
			fragmentShader: `
				varying float vLevel;
				varying vec3 vColor;
				#include <fog_pars_fragment>
				void main() {
					float alpha = vLevel;
					#ifdef FOG_EXP2
						alpha *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
					#endif
					gl_FragColor = vec4(vColor, alpha);
				}`,
		});
		// UniformsUtils clones typed arrays; retain the animation's single owner.
		material.uniforms.uLevels.value = this.levels;
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = "CityDistrictPlatforms";
		this.mesh.renderOrder = 1;
		this.markers = new CityDistrictMarkers(this.districts, this.levels, renderer, this.mesh.matrixWorld);
		this.mesh.add(this.markers.mesh);
	}

	update(delta, frame, interactionOwned) {
		this.markers.update(delta);
		this.pointerActive = Boolean(interactionOwned && !frame?.pointerDown && frame?.camera && frame?.pointer);
		if (frame?.camera) {
			this.mesh.updateWorldMatrix(true, false);
			this.markers.project(frame.camera);
		}
		// A building or a road never opens a card: only a visible circle is interactive.
		this.hovered = this.pointerActive ? this.markers.pick(frame.pointer) : -1;
		this.markers.hovered = this.hovered;
		if (this.hovered >= 0) this.focus.copy(this.markers.anchors[this.hovered]);
		for (let i = 0; i < this.levels.length; i++) {
			this.levels[i] = THREE.MathUtils.damp(this.levels[i], i === this.hovered ? 1 : 0, 7, delta);
			if (this.levels[i] < 0.0001) this.levels[i] = 0;
		}
		return this.hovered >= 0;
	}

	reset() { this.hovered = -1; this.markers.hovered = -1; this.pointerActive = false; this.levels.fill(0); }
	beginWarmupDraw() { this.levels.fill(0.01); }
	endWarmupDraw() { this.reset(); }
	dispose() { this.markers.dispose(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
