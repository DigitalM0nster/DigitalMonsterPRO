import * as THREE from "three";
/** Blender export — re-run script writes this file; site reads it directly. */
import { ABOUT_STAGE_POSES as BLENDER_ABOUT_STAGE_POSES } from "../../../../tools/about-blender/ABOUT_STAGE_POSES.export.js";

/** Story keyframes 0…4 (stage rests + end). */
export const ABOUT_STAGE_POSE_COUNT = 5;

/**
 * Blender (sensor_fit=HORIZONTAL) exports horizontal FOV;
 * Three.js PerspectiveCamera.fov is vertical.
 */
export function blenderHorizontalFovToThreeVertical(hFovDeg, aspect) {
	const a = Math.max(Number(aspect) || 16 / 9, 1e-4);
	const h = THREE.MathUtils.degToRad(Number(hFovDeg) || 34);
	return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h * 0.5) / a));
}

function smoothstep01(t) {
	const x = THREE.MathUtils.clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

function clonePoseList(source) {
	return source.map((pose) => ({
		camera: { ...pose.camera },
		model: { ...pose.model },
	}));
}

/** Authored defaults — live clone of tools/about-blender/ABOUT_STAGE_POSES.export.js */
export function createDefaultAboutStagePoses() {
	return clonePoseList(BLENDER_ABOUT_STAGE_POSES);
}

/** Live poses used by AboutScene (Blender export + HMR refresh). */
export const ABOUT_STAGE_POSES = createDefaultAboutStagePoses();

export function cloneAboutStagePoses(source = ABOUT_STAGE_POSES) {
	return clonePoseList(source);
}

/** When Blender re-exports, pull new numbers into the live array (Vite HMR). */
if (import.meta.hot) {
	import.meta.hot.accept(
		"../../../../tools/about-blender/ABOUT_STAGE_POSES.export.js",
		(mod) => {
			const exported = mod?.ABOUT_STAGE_POSES;
			if (!Array.isArray(exported) || exported.length < ABOUT_STAGE_POSE_COUNT) return;
			const next = clonePoseList(exported);
			for (let i = 0; i < ABOUT_STAGE_POSE_COUNT; i += 1) {
				Object.assign(ABOUT_STAGE_POSES[i].camera, next[i].camera);
				Object.assign(ABOUT_STAGE_POSES[i].model, next[i].model);
			}
		},
	);
}

function lerpNum(a, b, t) {
	return a + (b - a) * t;
}

/**
 * @param {number} story
 * @param {typeof ABOUT_STAGE_POSES} [poses]
 */
export function sampleAboutStagePose(story, poses = ABOUT_STAGE_POSES) {
	const s = THREE.MathUtils.clamp(Number(story) || 0, 0, ABOUT_STAGE_POSE_COUNT - 1);
	const i0 = Math.floor(s);
	const i1 = Math.min(ABOUT_STAGE_POSE_COUNT - 1, i0 + 1);
	const t = smoothstep01(s - i0);
	const a = poses[i0];
	const b = poses[i1];
	const useLookAt = t < 0.5 ? a.camera.useLookAt : b.camera.useLookAt;
	return {
		camera: {
			x: lerpNum(a.camera.x, b.camera.x, t),
			y: lerpNum(a.camera.y, b.camera.y, t),
			z: lerpNum(a.camera.z, b.camera.z, t),
			rotX: lerpNum(a.camera.rotX, b.camera.rotX, t),
			rotY: lerpNum(a.camera.rotY, b.camera.rotY, t),
			rotZ: lerpNum(a.camera.rotZ, b.camera.rotZ, t),
			useLookAt,
			lookAtX: lerpNum(a.camera.lookAtX, b.camera.lookAtX, t),
			lookAtY: lerpNum(a.camera.lookAtY, b.camera.lookAtY, t),
			lookAtZ: lerpNum(a.camera.lookAtZ, b.camera.lookAtZ, t),
			fov: lerpNum(a.camera.fov, b.camera.fov, t),
		},
		model: {
			x: lerpNum(a.model.x, b.model.x, t),
			y: lerpNum(a.model.y, b.model.y, t),
			z: lerpNum(a.model.z, b.model.z, t),
			rotX: lerpNum(a.model.rotX, b.model.rotX, t),
			rotY: lerpNum(a.model.rotY, b.model.rotY, t),
			rotZ: lerpNum(a.model.rotZ, b.model.rotZ, t),
		},
	};
}

/**
 * Whole AboutUsModel group — one transform for all parts.
 * @param {THREE.Object3D} group — typically AboutScene.modelRoot
 */
export function createAboutModelPoseRig(group) {
	if (!group) {
		return { setStoryProgress() {}, dispose() {} };
	}

	const restPos = group.position.clone();
	const restQuat = group.quaternion.clone();
	const euler = new THREE.Euler(0, 0, 0, "YXZ");
	const deltaQuat = new THREE.Quaternion();
	const tmpQuat = new THREE.Quaternion();

	const applyStory = (story) => {
		const { model } = sampleAboutStagePose(story);
		euler.set(
			THREE.MathUtils.degToRad(model.rotX),
			THREE.MathUtils.degToRad(model.rotY),
			THREE.MathUtils.degToRad(model.rotZ),
		);
		deltaQuat.setFromEuler(euler);
		group.position.set(restPos.x + model.x, restPos.y + model.y, restPos.z + model.z);
		tmpQuat.copy(restQuat).multiply(deltaQuat);
		group.quaternion.copy(tmpQuat);
	};

	applyStory(0);

	return {
		setStoryProgress: applyStory,
		dispose() {
			group.position.copy(restPos);
			group.quaternion.copy(restQuat);
		},
	};
}

