import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import { smoothSinePhase } from "../heroCamera.js";
import { createWhaleParticles } from "./createWhaleParticles.js";
import { applyWhaleHologram } from "./whaleHologramMaterial.js";
import { loadFbxQuiet } from "./loadFbxQuiet.js";

export const ANIMATED_WHALE_URL = "/models/allModels/FBX/animated_whale_01.fbx";

function disposeMaterial(material) {
	if (!material) {
		return;
	}

	const maps = ["map", "normalMap", "emissiveMap", "roughnessMap", "metalnessMap", "aoMap"];
	for (const key of maps) {
		material[key]?.dispose?.();
	}
	material.dispose?.();
}

function collectParticleMeshes(root) {
	const meshes = [];

	root.traverse((object) => {
		if (!isParticleSource(object)) {
			return;
		}

		object.visible = false;
		object.castShadow = false;
		object.receiveShadow = false;
		meshes.push(object);
	});

	return meshes;
}

function isParticleSource(object) {
	if (object.isSkinnedMesh || object.isMesh) {
		return Boolean(object.geometry?.attributes?.position);
	}

	return object.isLineSegments || object.isLine;
}

/**
 * Создаёт particle cloud и добавляет в корень FBX.
 */
export function attachWhaleParticles(root, particleMeshes, options = {}) {
	const particles = createWhaleParticles(particleMeshes, {
		edgeSpacing: options.edgeSpacing ?? 0.1,
	});
	root.add(particles.points);
	return particles;
}

/**
 * Пересобирает партиклы (например, при смене edgeSpacing в dev-панели).
 */
export function rebuildWhaleParticles(root, particleMeshes, previousParticles, options = {}) {
	if (previousParticles) {
		root.remove(previousParticles.points);
		previousParticles.geometry?.dispose?.();
		previousParticles.material?.dispose?.();
	}

	return attachWhaleParticles(root, particleMeshes, options);
}

/**
 * Загружает FBX-кита: particles (high) или hologram mesh (low/medium).
 * @param {{ edgeSpacing?: number, renderMode?: 'particles' | 'hologram' }} [options]
 */
export async function loadAnimatedWhale(options = {}) {
	const loader = new FBXLoader();
	const root = await loadFbxQuiet(loader, ANIMATED_WHALE_URL);

	const renderMode = options.renderMode === "hologram" ? "hologram" : "particles";

	let particles = null;
	let particleMeshes = [];
	let hologramMaterial = null;

	if (renderMode === "hologram") {
		const holo = applyWhaleHologram(root);
		hologramMaterial = holo.material;
		particleMeshes = holo.meshes;
		console.info(`[loadAnimatedWhale] hologram mode · ${holo.meshes.length} mesh`);
	} else {
		particleMeshes = collectParticleMeshes(root);
		console.info("[loadAnimatedWhale] mesh:", [...new Set(particleMeshes.map((mesh) => mesh.name || "(unnamed)"))]);

		if (particleMeshes.length === 0) {
			console.warn("[loadAnimatedWhale] в FBX нет mesh/line геометрии — партиклы не созданы");
		}

		particles = attachWhaleParticles(root, particleMeshes, options);
	}

	const mixer = new THREE.AnimationMixer(root);
	const clips = root.animations ?? [];
	const swimClip = clips.find((clip) => clip.name === "SWIM-delphinidae") ?? clips[0] ?? null;
	const swimAction = swimClip ? mixer.clipAction(swimClip) : null;
	swimAction?.setLoop(THREE.LoopRepeat, Infinity);
	swimAction?.play();

	return {
		root,
		mixer,
		swimAction,
		animations: root.animations ?? [],
		particles,
		particleMeshes,
		hologramMaterial,
		renderMode,
	};
}

/**
 * Пульсация свечения точек: emissiveIntensity ↔ glowPulse.max.
 */
export function resolveWhaleGlowIntensity(emissiveIntensity, glowPulse, elapsed = 0) {
	const base = emissiveIntensity ?? 3.05;
	if (!glowPulse || glowPulse.max == null || (glowPulse.speed ?? 0) <= 0) {
		return base;
	}

	const peak = glowPulse.max;
	const speed = glowPulse.speed ?? 0.22;
	const smooth = glowPulse.smooth ?? 0.7;
	const wave = 0.5 + 0.5 * smoothSinePhase(elapsed * speed * Math.PI * 2, smooth);
	return base + (peak - base) * wave;
}

/**
 * Обновляет цвет/яркость/размер партиклов кита.
 */
export function applyWhaleVisuals(particles, options = {}) {
	if (!particles?.material) {
		return;
	}

	const baseGlow = options.emissiveIntensity ?? 0.5;
	const glow =
		options.elapsed != null && options.glowPulse
			? resolveWhaleGlowIntensity(baseGlow, options.glowPulse, options.elapsed)
			: baseGlow;
	const opacity = options.opacity ?? 1;

	particles.material.uniforms.uGlow.value = 0.7 + glow * 3.2;
	particles.material.uniforms.uColor.value.set(options.colorTint ?? "#00e5ff");
	particles.material.uniforms.uAlphaMult.value = opacity;
	particles.material.uniforms.uPointScale.value = options.pointScale ?? 2.2;
	particles.material.uniforms.uGrainBlurRadius.value = options.grainBlurRadius ?? 0;
}

export function disposeWhaleRoot(root) {
	if (!root) {
		return;
	}

	const disposedMaterials = new Set();

	root.traverse((object) => {
		object.geometry?.dispose?.();
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of materials) {
			if (!material || disposedMaterials.has(material)) {
				continue;
			}
			disposedMaterials.add(material);
			disposeMaterial(material);
		}
	});
}
