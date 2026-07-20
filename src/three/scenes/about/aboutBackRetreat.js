import * as THREE from "three";
import { resolveAboutPlateTravelAxisLocal } from "./aboutPlateTravelAxis.js";

function smoothstep01(t) {
	const x = THREE.MathUtils.clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

const BACK_MESH_NAMES = new Set(["Back", "BackBackSide"]);

/**
 * Back plate detaches away from camera during stage 2→3 (story 1→2).
 *
 * @param {THREE.Object3D} model
 * @param {{
 *   storyStart?: number,
 *   storyEnd?: number,
 *   distance?: number,
 * }} [cfg]
 * @param {{ getCameraPosition?: () => THREE.Vector3 }} [ctx]
 */
export function createAboutBackRetreat(model, cfg = {}, ctx = {}) {
	if (!model) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	const storyStart = cfg.storyStart ?? 1;
	const storyEnd = Math.max(storyStart + 1e-4, cfg.storyEnd ?? 2);
	const distance = cfg.distance ?? 0.6;

	/** @type {{ mesh: THREE.Object3D, restPos: THREE.Vector3 }[]} */
	const parts = [];
	let backMesh = null;

	model.updateMatrixWorld(true);
	model.traverse((object) => {
		if (!object.isMesh || !BACK_MESH_NAMES.has(object.name)) return;
		if (object.name === "Back") backMesh = object;
		parts.push({
			mesh: object,
			restPos: object.position.clone(),
		});
	});

	if (!backMesh || parts.length === 0) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	/** Away from camera in parent-local space (works with any GLB asset euler). */
	const axis = resolveAboutPlateTravelAxisLocal(backMesh, model, ctx.getCameraPosition, false);

	const tmpPos = new THREE.Vector3();

	const applyStory = (story) => {
		const s = Number(story) || 0;
		const t = smoothstep01((s - storyStart) / (storyEnd - storyStart));
		const te = t * t * (3 - 2 * t);
		const travel = distance * te;

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
