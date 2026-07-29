import * as THREE from "three";
import { findAboutCameraObject, findAllAboutEpicTextPlanes } from "./normalizeAboutGltfScene.js";

/**
 * Drive About story from GLB clips only (Blender-authored TRS).
 * Scrubs every clip in the file on the same story clock:
 *   story 0…4 ↔ frames 0…40 @ 24fps (or max clip length).
 *
 * Expected helpers: AboutModel, AboutLookAt, AboutCamera, plus any
 * Heart* / Front* / Back* / OUTER_cell* actions baked in Blender.
 */

const DEFAULT_FPS = 24;
const DEFAULT_END_FRAME = 40;
/** Last-resort FOV if camera has no custom fov in the GLB. */
const DEFAULT_FOV = 34;

const _camPos = new THREE.Vector3();
const _lookPos = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

/**
 * Blender (sensor_fit=HORIZONTAL) FOV → Three.js PerspectiveCamera vertical FOV.
 * @param {number} hFovDeg
 * @param {number} aspect
 */
export function blenderHorizontalFovToThreeVertical(hFovDeg, aspect) {
	const a = Math.max(Number(aspect) || 16 / 9, 1e-4);
	const h = THREE.MathUtils.degToRad(Number(hFovDeg) || DEFAULT_FOV);
	return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h * 0.5) / a));
}

/**
 * @param {THREE.AnimationMixer} mixer
 * @param {THREE.AnimationClip | null} clip
 */
function bindPausedAction(mixer, clip) {
	if (!clip) return null;
	const action = mixer.clipAction(clip);
	action.enabled = true;
	action.setEffectiveWeight(1);
	action.play();
	action.paused = true;
	action.clampWhenFinished = true;
	return action;
}

/**
 * @param {THREE.AnimationClip[]} animations
 * @param {RegExp[]} nameTests
 */
function findNamedClip(animations, nameTests) {
	const clips = Array.isArray(animations) ? animations : [];
	for (const test of nameTests) {
		const hit = clips.find((c) => test.test(c.name));
		if (hit) return hit;
	}
	return null;
}

/**
 * @param {THREE.Object3D} root normalized AboutUsModel root
 * @param {THREE.AnimationClip[]} animations
 */
export function createAboutGltfStoryAnimRig(root, animations = []) {
	if (!root) {
		return {
			hasModel: false,
			hasLookAt: false,
			hasCamera: false,
			clipCount: 0,
			setStoryProgress() {},
			sampleCamera() {
				return {
					x: 0, y: 1.2, z: 8.2,
					lookAtX: 0, lookAtY: 0, lookAtZ: 0,
					fov: DEFAULT_FOV, rotX: 0, rotY: 0, rotZ: 0, useLookAt: true,
					fovIsVertical: false,
				};
			},
			dispose() {},
		};
	}

	const lookAt = root.getObjectByName("AboutLookAt");
	const cameraObj = findAboutCameraObject(root);
	const epicPlanes = findAllAboutEpicTextPlanes(root);

	if (lookAt) lookAt.visible = false;
	if (cameraObj) cameraObj.visible = false;

	for (const epicPlane of epicPlanes) {
		epicPlane.visible = false;
		epicPlane.userData.aboutEpicTextPlane = true;
		epicPlane.traverse((object) => {
			if (!object.isMesh && !object.isLine && !object.isLineSegments) return;
			object.frustumCulled = false;
			object.visible = false;
			object.renderOrder = 8;
			object.userData.aboutEpicTextPlane = true;
			const mat = Array.isArray(object.material) ? object.material[0] : object.material;
			if (!mat) {
				object.material = new THREE.MeshBasicMaterial({
					color: 0xf4fbff,
					side: THREE.DoubleSide,
					toneMapped: false,
					depthWrite: false,
				});
			} else {
				mat.side = THREE.DoubleSide;
				mat.toneMapped = false;
				mat.depthWrite = false;
				mat.needsUpdate = true;
			}
		});
	}

	const mixer = new THREE.AnimationMixer(root);
	const clips = Array.isArray(animations) ? animations.filter(Boolean) : [];
	/** @type {THREE.AnimationAction[]} */
	const actions = [];
	const seen = new Set();
	for (const clip of clips) {
		if (seen.has(clip.uuid)) continue;
		seen.add(clip.uuid);
		const action = bindPausedAction(mixer, clip);
		if (action) actions.push(action);
	}

	let endFrame = DEFAULT_END_FRAME;
	for (const clip of clips) {
		endFrame = Math.max(endFrame, Math.round((clip.duration || 0) * DEFAULT_FPS));
	}
	const duration = Math.max(endFrame / DEFAULT_FPS, 1e-4);

	const modelClip = findNamedClip(clips, [/^AboutModelAction/i, /AboutModel/i]);
	const lookClip = findNamedClip(clips, [/^AboutLookAtAction/i, /LookAt/i]);
	const cameraClip = findNamedClip(clips, [/^AboutCameraAction/i, /AboutCamera/i, /^CameraAction/i]);

	if (import.meta.env.DEV) {
		if (!modelClip) console.warn("[AboutGLTF] Missing AboutModelAction in GLB.");
		if (!lookClip) console.warn("[AboutGLTF] Missing AboutLookAtAction in GLB.");
		if (!cameraObj) {
			console.warn(
				"[AboutGLTF] No camera node in AboutUsModel.glb (looked for AboutCamera / Camera). "
				+ "In Blender: File → Export → glTF, enable Cameras, include AboutCamera in the export set, re-export.",
			);
		} else if (!cameraClip) {
			console.warn(
				"[AboutGLTF] Camera node found but no camera Action clip — keyframe AboutCamera or it stays at bind pose.",
			);
		}
		if (actions.length < 1) {
			console.warn("[AboutGLTF] No animation clips bound — About story will not move meshes.");
		} else {
			console.info(`[AboutGLTF] Scrubbing ${actions.length} clip(s) on story 0…4.`);
		}
	}

	const applyStory = (story) => {
		const s = THREE.MathUtils.clamp(Number(story) || 0, 0, 4);
		const time = THREE.MathUtils.clamp((s / 4) * duration, 0, duration);
		for (const action of actions) {
			action.time = time;
		}
		mixer.update(0);
	};

	applyStory(0);

	return {
		hasModel: Boolean(modelClip),
		hasLookAt: Boolean(lookClip),
		hasCamera: Boolean(cameraClip && cameraObj),
		clipCount: actions.length,
		setStoryProgress: applyStory,
		/** TRS from GLB helpers in AboutUsModel root space (matches Blender authoring). */
		sampleCamera() {
			root.updateMatrixWorld(true);

			if (cameraObj) {
				cameraObj.getWorldPosition(_camPos);
				root.worldToLocal(_camPos);
			} else {
				_camPos.set(0, 1.2, 8.2);
			}

			if (lookAt) {
				lookAt.getWorldPosition(_lookPos);
				root.worldToLocal(_lookPos);
			} else {
				_lookPos.set(0, 0, 0);
			}

			let rotX = 0;
			let rotY = 0;
			let rotZ = 0;
			if (cameraObj && !lookAt) {
				_euler.setFromQuaternion(cameraObj.quaternion, "YXZ");
				rotX = THREE.MathUtils.radToDeg(_euler.x);
				rotY = THREE.MathUtils.radToDeg(_euler.y);
				rotZ = THREE.MathUtils.radToDeg(_euler.z);
			}

			/**
			 * AboutScene expects Blender-style horizontal FOV (sensor_fit=HORIZONTAL).
			 * glTF / Three PerspectiveCamera.fov is vertical — convert back.
			 */
			let fov = DEFAULT_FOV;
			if (cameraObj?.isPerspectiveCamera && Number.isFinite(cameraObj.fov)) {
				const aspect = cameraObj.aspect > 1e-4 ? cameraObj.aspect : 16 / 9;
				const v = THREE.MathUtils.degToRad(cameraObj.fov);
				fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(v * 0.5) * aspect));
			} else if (Number.isFinite(cameraObj?.userData?.fov)) {
				fov = Number(cameraObj.userData.fov);
			}

			return {
				x: _camPos.x,
				y: _camPos.y,
				z: _camPos.z,
				lookAtX: _lookPos.x,
				lookAtY: _lookPos.y,
				lookAtZ: _lookPos.z,
				fov,
				rotX,
				rotY,
				rotZ,
				useLookAt: Boolean(lookAt) || !cameraObj,
				fovIsVertical: false,
			};
		},
		dispose() {
			mixer.stopAllAction();
			mixer.uncacheRoot(root);
		},
	};
}
