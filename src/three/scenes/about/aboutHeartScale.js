import * as THREE from "three";

function smoothstep01(t) {
	const x = THREE.MathUtils.clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

function isHeartObject(object) {
	return Boolean(object?.name) && /^Heart/i.test(object.name);
}

/**
 * Smoothly rotate Heart* (processor) during stage 2→3 (story 1→2).
 * Blue EdgeForParticles stay put — they dissolve in place, no spin.
 *
 * @param {THREE.Object3D} model
 * @param {{
 *   storyStart?: number,
 *   storyEnd?: number,
 *   angleDeg?: number,
 *   axis?: [number, number, number],
 * }} [cfg]
 */
export function createAboutHeartScale(model, cfg = {}) {
	if (!model) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	const storyStart = cfg.storyStart ?? 1;
	const storyEnd = Math.max(storyStart + 1e-4, cfg.storyEnd ?? 2);
	const angleRad = THREE.MathUtils.degToRad(cfg.angleDeg ?? -225);
	const axisArr = Array.isArray(cfg.axis) ? cfg.axis : [0, 1, 0];
	const axis = new THREE.Vector3(axisArr[0], axisArr[1], axisArr[2]);
	if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0);
	axis.normalize();

	/** @type {THREE.Object3D[]} */
	const heartLeaves = [];
	model.traverse((object) => {
		if (!isHeartObject(object)) return;
		const drawable = object.isMesh || object.isLine || object.isLineSegments;
		if (drawable) heartLeaves.push(object);
	});

	if (heartLeaves.length < 1) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	let sharedParent = heartLeaves[0].parent;
	for (let i = 1; i < heartLeaves.length; i += 1) {
		let p = heartLeaves[i].parent;
		while (p && p !== sharedParent && p !== model) p = p.parent;
		if (p !== sharedParent) {
			sharedParent = null;
			break;
		}
	}
	if (sharedParent === model) sharedParent = null;

	if (sharedParent) {
		let p = sharedParent;
		while (p && p !== model) {
			if (isHeartObject(p)) {
				sharedParent = p;
				break;
			}
			p = p.parent;
		}
	}

	/** @type {{ object: THREE.Object3D, restQuat: THREE.Quaternion }[]} */
	const targets = [];
	const seen = new Set();
	const addTarget = (object) => {
		if (!object || seen.has(object)) return;
		/** Skip if already covered by an ancestor target. */
		let p = object.parent;
		while (p) {
			if (seen.has(p)) return;
			p = p.parent;
		}
		seen.add(object);
		targets.push({
			object,
			restQuat: object.quaternion.clone(),
		});
	};

	if (sharedParent) {
		addTarget(sharedParent);
	} else {
		for (let i = 0; i < heartLeaves.length; i += 1) {
			addTarget(heartLeaves[i]);
		}
	}

	const deltaQuat = new THREE.Quaternion();
	const tmpQuat = new THREE.Quaternion();

	const applyStory = (story) => {
		const s = Number(story) || 0;
		const t = smoothstep01((s - storyStart) / (storyEnd - storyStart));
		const te = smoothstep01(t);
		deltaQuat.setFromAxisAngle(axis, angleRad * te);

		for (let i = 0; i < targets.length; i += 1) {
			const { object, restQuat } = targets[i];
			tmpQuat.copy(restQuat).multiply(deltaQuat);
			object.quaternion.copy(tmpQuat);
		}
	};

	applyStory(0);

	return {
		targetCount: targets.length,
		setProgress: applyStory,
		setStoryProgress: applyStory,
		dispose() {
			for (let i = 0; i < targets.length; i += 1) {
				targets[i].object.quaternion.copy(targets[i].restQuat);
			}
			targets.length = 0;
		},
	};
}
