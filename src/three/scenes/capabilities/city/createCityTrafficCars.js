import * as THREE from "three";
import { cityTrafficMotionShader } from "./cityTrafficMotion.js";

/** Small road-aligned bodies sharing one instanced draw. */
export function createCityTrafficCars(routes, motions, closed, sizes, transforms, rows, time, strengths) {
	const box = new THREE.BoxGeometry(1, 1, 1);
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.index = box.index;
	geometry.attributes.position = box.attributes.position;
	geometry.attributes.normal = box.attributes.normal;
	geometry.setAttribute("aRoute", new THREE.InstancedBufferAttribute(new Float32Array(routes), 4));
	geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
	geometry.setAttribute("aMotion", new THREE.InstancedBufferAttribute(new Float32Array(motions), 4));
	geometry.setAttribute("aClosed", new THREE.InstancedBufferAttribute(new Float32Array(closed), 1));
	geometry.setAttribute("aStrength", new THREE.InstancedBufferAttribute(new Float32Array(strengths), 1));
	geometry.instanceCount = sizes.length;
	const material = new THREE.ShaderMaterial({
		name: "CityTrafficCarBodies",
		fog: true,
		transparent: true,
		depthWrite: false,
		uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
			uPaths: { value: null }, uRows: { value: rows }, uTime: { value: 0 },
			uLightVariation: { value: 1 },
			uBodyScale: { value: 1 }, uDensity: { value: 1 },
			uFrontIntensity: { value: 5.5 }, uRearIntensity: { value: 0.9 },
			uBlueColor: { value: new THREE.Color("#69d3ff") }, uWhiteColor: { value: new THREE.Color("#f9fcff") },
			uYellowColor: { value: new THREE.Color("#ffdd89") }, uWhiteShare: { value: 0.15 }, uYellowShare: { value: 0.02 },
		}]),
		vertexShader: /* glsl */ `
			${cityTrafficMotionShader}
			uniform float uBodyScale;
			uniform float uDensity;
			attribute float aSize;
			attribute float aStrength;
			varying float vStrength;
			varying float vFade;
			varying vec3 vLocal;
			varying vec3 vFace;
			varying float vLampTint;
			#include <fog_pars_vertex>
			void main() {
				vec3 center, direction;
				cityVehicle(center, direction, vFade);
				vFade *= step(fract(aRoute.y * 43.0 + aRoute.x * 19.3), uDensity);
				vStrength = aStrength;
				vec3 side = vec3(direction.z, 0.0, -direction.x);
				vec3 carPosition = center + uBodyScale * (direction * position.z * (0.95 * 2.0 / 4.5) * aSize
					+ side * position.x * (0.42 * 2.0 / 4.5) * aSize
					+ vec3(0.0, (position.y + 0.5) * (0.2 * 2.0 / 4.5), 0.0));
				vLocal = position;
				vFace = normal;
				vLampTint = fract(aRoute.y * 127.1 + aRoute.x * 13.7);
				vec4 mvPosition = modelViewMatrix * vec4(carPosition, 1.0);
				gl_Position = projectionMatrix * mvPosition;
				#include <fog_vertex>
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uBlueColor;
			uniform vec3 uWhiteColor;
			uniform vec3 uYellowColor;
			uniform float uWhiteShare;
			uniform float uYellowShare;
			uniform float uFrontIntensity;
			uniform float uRearIntensity;
			uniform float uLightVariation;
			varying float vStrength;
			varying vec3 vLocal;
			varying vec3 vFace;
			varying float vLampTint;
			varying float vFade;
			#include <fog_pars_fragment>
			void main() {
				vec3 color = vec3(0.025, 0.3, 0.5) * (0.5 + max(0.0, vFace.y) * 0.5);
				if (vFace.y > 0.5 && abs(vLocal.x) < 0.36 && abs(vLocal.z) < 0.2)
					color = vec3(0.004, 0.04, 0.07);
				float lampPair = step(0.22, abs(vLocal.x))
					* (1.0 - step(0.45, abs(vLocal.x))) * (1.0 - step(0.18, abs(vLocal.y)));
				float headlights = step(0.5, vFace.z) * lampPair;
				float taillights = step(0.5, -vFace.z) * lampPair;
				vec3 frontColor = vLampTint < 1.0 - uWhiteShare - uYellowShare ? uBlueColor
					: (vLampTint < 1.0 - uYellowShare ? uWhiteColor : uYellowColor);
				// Bright flare sprites are separate, so body scaling never shrinks them.
				float strength = mix(1.0, vStrength, uLightVariation);
				color += frontColor * headlights * uFrontIntensity * 0.27 * strength;
				color += vec3(1.0, 0.018, 0.008) * taillights * uRearIntensity * 0.33 * strength;
				gl_FragColor = vec4(color, vFade);
				#include <fog_fragment>
			}
		`,
	});
	material.uniforms.uPaths.value = transforms;
	material.uniforms.uTime = time;
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = "CityTrafficCars";
	mesh.frustumCulled = false;
	return mesh;
}
