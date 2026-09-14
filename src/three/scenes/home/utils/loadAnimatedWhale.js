import { smoothSinePhase } from "../heroCamera.js";
import { createWhaleParticles } from "./createWhaleParticles.js";
// One authored model and prepared swim for phones and desktops.
export { loadMobileWhale as loadAnimatedWhale } from "../mobileWhale/loadMobileWhale.js";

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
	const pointScale = options.pointScale ?? 2.2;
	const particleScale = options.particleScale ?? 1;
	particles.material.uniforms.uPointScale.value = pointScale * particleScale;
	particles.material.uniforms.uGrainBlurRadius.value = options.grainBlurRadius ?? 0;

	const density = options.particleDensity;
	if (density != null && Number.isFinite(density)) {
		if (particles.material.uniforms.uSampleKeep) {
			particles.material.uniforms.uSampleKeep.value = Math.min(1, Math.max(0, density));
		}
		if (particles.material.uniforms.uParticleDensity) {
			particles.material.uniforms.uParticleDensity.value = Math.min(1, Math.max(0, density));
		}
	}

	if (particles.material.uniforms.uParticleScale) {
		particles.material.uniforms.uParticleScale.value = particleScale;
	}
}

export function disposeWhaleRoot(root) {
	if (!root) {
		return;
	}

	const disposedMaterials = new Set();
	const disposedGeometries = new Set();
	const skeletons = new Set();

	root.traverse((object) => {
		if (object.skeleton) skeletons.add(object.skeleton);
		if (object.geometry && !disposedGeometries.has(object.geometry)) {
			disposedGeometries.add(object.geometry);
			object.geometry.dispose();
		}
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of materials) {
			if (!material || disposedMaterials.has(material)) {
				continue;
			}
			disposedMaterials.add(material);
			disposeMaterial(material);
		}
	});
	for (const skeleton of skeletons) skeleton.dispose();
}
