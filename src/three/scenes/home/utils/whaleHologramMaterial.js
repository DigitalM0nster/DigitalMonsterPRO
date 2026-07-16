import * as THREE from "three";

import { whaleHologramFragmentShader, whaleHologramVertexShader } from "../shaders/digitalWhaleShaders.js";
import { withFogUniforms } from "./shaderFogUniforms.js";
import { digitalWhaleConfig } from "../digitalWhaleConfig.js";

function isWhaleMesh(object) {
	if (object.isSkinnedMesh || object.isMesh) {
		return Boolean(object.geometry?.attributes?.position);
	}

	return object.isLineSegments || object.isLine;
}

export function createWhaleHologramMaterial() {
	const material = new THREE.ShaderMaterial({
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(digitalWhaleConfig.whale.colorTint) },
			uOpacity: { value: digitalWhaleConfig.whale.opacity },
			uGlow: { value: digitalWhaleConfig.whale.emissiveIntensity },
		}),
		vertexShader: whaleHologramVertexShader,
		fragmentShader: whaleHologramFragmentShader,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		fog: true,
	});

	material.skinning = true;

	return material;
}

/** Показывает FBX-меши с общим holo-материалом (low/medium). */
export function applyWhaleHologram(root) {
	const material = createWhaleHologramMaterial();
	const meshes = [];

	root.traverse((object) => {
		if (!isWhaleMesh(object)) {
			return;
		}

		object.visible = true;
		object.castShadow = false;
		object.receiveShadow = false;
		object.renderOrder = 3;
		object.material = material;
		meshes.push(object);
	});

	if (meshes.length === 0) {
		console.warn("[applyWhaleHologram] в FBX нет mesh — голограмма не применена");
	}

	return { material, meshes };
}

export function applyWhaleHologramVisuals(material, options = {}) {
	if (!material?.uniforms) {
		return;
	}

	const glow = options.emissiveIntensity ?? 0.5;
	const opacity = options.opacity ?? 1;

	material.uniforms.uColor.value.set(options.colorTint ?? "#00e5ff");
	material.uniforms.uGlow.value = 0.35 + glow * 1.8;
	material.uniforms.uOpacity.value = opacity;
}
