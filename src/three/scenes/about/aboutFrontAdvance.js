import * as THREE from "three";
import { resolveAboutPlateTravelAxisLocal } from "./aboutPlateTravelAxis.js";

function smoothstep01(t) {
	const x = THREE.MathUtils.clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

const FRONT_MESH_NAMES = new Set(["Front", "FrontBackSide"]);

/**
 * Front plate advance toward camera. Stage 1 (story 0→1) + further on stage 2 (1→2).
 *
 * @param {THREE.Object3D} model
 * @param {{
 *   start?: number,
 *   end?: number,
 *   distance?: number,
 *   stage2Distance?: number,
 * }} [cfg]
 * @param {{ getCameraPosition?: () => THREE.Vector3 }} [ctx]
 */
export function createAboutFrontAdvance(model, cfg = {}, ctx = {}) {
	if (!model) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	const start = THREE.MathUtils.clamp(cfg.start ?? 0, 0, 1);
	const end = THREE.MathUtils.clamp(cfg.end ?? 1, start + 1e-3, 1);
	const distance = cfg.distance ?? 0.55;
	const stage2Distance = cfg.stage2Distance ?? 0.65;

	/** @type {{ mesh: THREE.Object3D, restPos: THREE.Vector3 }[]} */
	const parts = [];
	let frontMesh = null;

	model.updateMatrixWorld(true);
	model.traverse((object) => {
		if (!object.isMesh || !FRONT_MESH_NAMES.has(object.name)) return;
		if (object.name === "Front") frontMesh = object;
		parts.push({
			mesh: object,
			restPos: object.position.clone(),
		});
	});

	if (!frontMesh || parts.length === 0) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	/** Toward camera in parent-local space (works with any GLB asset euler). */
	const axis = resolveAboutPlateTravelAxisLocal(frontMesh, model, ctx.getCameraPosition, true);

	const tmpPos = new THREE.Vector3();

	const applyStory = (story) => {
		const s = Number(story) || 0;
		const p1 = THREE.MathUtils.clamp(s, 0, 1);
		const p2 = THREE.MathUtils.clamp(s - 1, 0, 1);
		const t1 = smoothstep01((p1 - start) / Math.max(1e-4, end - start));
		const t1e = t1 * t1 * (3 - 2 * t1);
		const t2e = smoothstep01(p2);
		const t2m = t2e * t2e * (3 - 2 * t2e);
		const travel = distance * t1e + stage2Distance * t2m;

		for (let i = 0; i < parts.length; i += 1) {
			const part = parts[i];
			tmpPos.copy(part.restPos).addScaledVector(axis, travel);
			part.mesh.position.copy(tmpPos);
		}
	};

	applyStory(0);

	return {
		partCount: parts.length,
		setProgress: applyStory,
		setStoryProgress: applyStory,
		dispose() {
			for (let i = 0; i < parts.length; i += 1) {
				parts[i].mesh.position.copy(parts[i].restPos);
			}
			parts.length = 0;
		},
	};
}
