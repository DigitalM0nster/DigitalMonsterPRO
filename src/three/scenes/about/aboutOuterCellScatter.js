import * as THREE from "three";
import { isAboutOuterCellMeshName } from "./aboutNeonMaterial.js";

function hash01(seed) {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

function smoothstep01(t) {
	const x = THREE.MathUtils.clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

/**
 * OUTER_cell* scatter driven by About storyProgress (0…4).
 * Stage 1 (0→1): detach; stage 2 (1→2): push farther.
 *
 * @param {THREE.Object3D} model
 * @param {{
 *   start?: number,
 *   end?: number,
 *   distance?: number,
 *   lift?: number,
 *   scaleOut?: number,
 *   stage2Distance?: number,
 *   stage2Lift?: number,
 * }} [cfg]
 */
export function createAboutOuterCellScatter(model, cfg = {}) {
	if (!model) {
		return { setProgress() {}, setStoryProgress() {}, dispose() {} };
	}

	const start = THREE.MathUtils.clamp(cfg.start ?? 0.12, 0, 1);
	const end = THREE.MathUtils.clamp(cfg.end ?? 0.55, start + 1e-3, 1);
	const distance = cfg.distance ?? 0.42;
	const lift = cfg.lift ?? 0.12;
	const scaleOut = THREE.MathUtils.clamp(cfg.scaleOut ?? 0.72, 0.2, 1);
	const stage2Distance = cfg.stage2Distance ?? 0.55;
	const stage2Lift = cfg.stage2Lift ?? 0.1;

	/** @type {{
	 *   mesh: THREE.Object3D,
	 *   restPos: THREE.Vector3,
	 *   restQuat: THREE.Quaternion,
	 *   restScale: THREE.Vector3,
	 *   dir: THREE.Vector3,
	 *   delay: number,
	 * }[]} */
	const cells = [];
	const origin = new THREE.Vector3();
	let count = 0;

	model.updateMatrixWorld(true);
	model.traverse((object) => {
		if (!object.isMesh || !isAboutOuterCellMeshName(object.name)) return;
		origin.add(object.position);
		count += 1;
	});
	if (count > 0) origin.multiplyScalar(1 / count);

	let index = 0;
	model.traverse((object) => {
		if (!object.isMesh || !isAboutOuterCellMeshName(object.name)) return;
		const seed = index * 17.13 + object.name.length * 3.7;
		const restPos = object.position.clone();
		const restQuat = object.quaternion.clone();
		const restScale = object.scale.clone();

		const dir = restPos.clone().sub(origin);
		if (dir.lengthSq() < 1e-8) {
			const a = hash01(seed) * Math.PI * 2;
			dir.set(Math.cos(a), (hash01(seed + 1) - 0.5) * 0.35, Math.sin(a));
		}
		dir.normalize();
		dir.y += (hash01(seed + 2) - 0.35) * 0.55;
		dir.normalize();

		cells.push({
			mesh: object,
			restPos,
			restQuat,
			restScale,
			dir,
			delay: hash01(seed + 7) * 0.08,
		});
		index += 1;
	});

	const tmpPos = new THREE.Vector3();
	const tmpScale = new THREE.Vector3();

	const applyStory = (story) => {
		const s = Number(story) || 0;
		const p1 = THREE.MathUtils.clamp(s, 0, 1);
		const p2 = THREE.MathUtils.clamp(s - 1, 0, 1);

		for (let i = 0; i < cells.length; i += 1) {
			const cell = cells[i];
			const local1 = smoothstep01(
				(p1 - start - cell.delay * (end - start)) / Math.max(1e-4, end - start),
			);
			const t1 = local1 * local1 * (3 - 2 * local1);
			const t2 = smoothstep01(p2 - cell.delay * 0.15);
			const t2e = t2 * t2 * (3 - 2 * t2);

			tmpPos
				.copy(cell.restPos)
				.addScaledVector(cell.dir, distance * t1 + stage2Distance * t2e);
			tmpPos.y += lift * t1 + stage2Lift * t2e;

			const sScale = THREE.MathUtils.lerp(1, scaleOut, Math.min(1, t1 * 0.85 + t2e * 0.2));
			tmpScale.copy(cell.restScale).multiplyScalar(sScale);

			cell.mesh.position.copy(tmpPos);
			cell.mesh.quaternion.copy(cell.restQuat);
			cell.mesh.scale.copy(tmpScale);
		}
	};

	applyStory(0);

	return {
		cellCount: cells.length,
		setProgress: applyStory,
		setStoryProgress: applyStory,
		dispose() {
			for (let i = 0; i < cells.length; i += 1) {
				const cell = cells[i];
				cell.mesh.position.copy(cell.restPos);
				cell.mesh.quaternion.copy(cell.restQuat);
				cell.mesh.scale.copy(cell.restScale);
			}
			cells.length = 0;
		},
	};
}
