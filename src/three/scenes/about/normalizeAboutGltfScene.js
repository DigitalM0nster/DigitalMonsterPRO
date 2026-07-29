import * as THREE from "three";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/** Blender: AboutEpicTextPlane (ru) / AboutEpicTextPlaneEN / AboutEpicTextPlaneZH */
export const ABOUT_EPIC_TEXT_PLANE_NAMES_BY_LOCALE = {
	ru: ["AboutEpicTextPlane", "AboutEpicTextPlaneRU", "EpicTextPlane"],
	en: ["AboutEpicTextPlaneEN", "EpicTextPlaneEN"],
	zh: ["AboutEpicTextPlaneZH", "EpicTextPlaneZH"],
};

/** AboutEpicTextPlane | AboutEpicTextPlaneEN | AboutEpicTextPlaneZH | EpicTextPlane* */
const EPIC_PLANE_NAME_RE = /^(About)?EpicTextPlane([._-]?RU|[._-]?EN|[._-]?ZH)?$/i;

const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldMat = new THREE.Matrix4();
const _parentInv = new THREE.Matrix4();
const _localMat = new THREE.Matrix4();

/**
 * @param {string} [name]
 * @returns {boolean}
 */
export function isAboutEpicTextPlaneName(name) {
	return EPIC_PLANE_NAME_RE.test(String(name || ""));
}

/**
 * @param {string} [name]
 * @returns {"ru" | "en" | "zh" | null}
 */
export function localeFromAboutEpicTextPlaneName(name) {
	const n = String(name || "");
	if (/[._-]?EN$/i.test(n) || /EN$/i.test(n)) return "en";
	if (/[._-]?ZH$/i.test(n) || /ZH$/i.test(n)) return "zh";
	if (/[._-]?RU$/i.test(n)) return "ru";
	if (isAboutEpicTextPlaneName(n)) return "ru";
	return null;
}

/**
 * @param {THREE.Object3D} root
 * @param {string} [locale]
 * @returns {THREE.Object3D | null}
 */
export function findAboutEpicTextPlane(root, locale = "ru") {
	if (!root) return null;
	const key = normalizeSiteLocale(locale);
	const names = ABOUT_EPIC_TEXT_PLANE_NAMES_BY_LOCALE[key] ?? ABOUT_EPIC_TEXT_PLANE_NAMES_BY_LOCALE.ru;
	for (const name of names) {
		const hit = root.getObjectByName(name);
		if (hit) return hit;
	}
	/** Fallback: default RU plane if locale mesh missing from GLB. */
	if (key !== "ru") {
		return findAboutEpicTextPlane(root, "ru");
	}
	return null;
}

/**
 * @param {THREE.Object3D} root
 * @returns {THREE.Object3D[]}
 */
export function findAllAboutEpicTextPlanes(root) {
	if (!root) return [];
	/** @type {THREE.Object3D[]} */
	const found = [];
	const seen = new Set();
	for (const names of Object.values(ABOUT_EPIC_TEXT_PLANE_NAMES_BY_LOCALE)) {
		for (const name of names) {
			const hit = root.getObjectByName(name);
			if (!hit || seen.has(hit.uuid)) continue;
			seen.add(hit.uuid);
			found.push(hit);
		}
	}
	/** Catch any extra authored names matching the pattern. */
	root.traverse((object) => {
		if (seen.has(object.uuid)) return;
		if (!isAboutEpicTextPlaneName(object.name)) return;
		seen.add(object.uuid);
		found.push(object);
	});
	return found;
}

/**
 * @param {THREE.Object3D} epicPlane
 * @param {THREE.Object3D} parent
 */
function reparentEpicPlaneKeepWorld(epicPlane, parent) {
	if (!epicPlane || !parent || epicPlane.parent === parent) return;

	epicPlane.updateWorldMatrix(true, false);
	parent.updateWorldMatrix(true, false);
	epicPlane.matrixWorld.decompose(_worldPos, _worldQuat, _worldScale);

	epicPlane.parent?.remove(epicPlane);
	parent.add(epicPlane);

	parent.updateWorldMatrix(true, false);
	_parentInv.copy(parent.matrixWorld).invert();
	_worldMat.compose(_worldPos, _worldQuat, _worldScale);
	_localMat.multiplyMatrices(_parentInv, _worldMat);
	_localMat.decompose(epicPlane.position, epicPlane.quaternion, epicPlane.scale);
	epicPlane.matrixAutoUpdate = true;
	epicPlane.userData.aboutEpicTextPlane = true;
}

/**
 * Keep Blender animation targets in one authored space (no mesh recenter):
 *   AboutModel (+ asset meshes)
 *   AboutLookAt / AboutCamera — siblings, same space as model
 *   AboutEpicTextPlane under the asset
 *
 * Also accepts a glTF camera node under common Blender export names.
 *
 * @param {THREE.Object3D} gltfScene
 * @returns {THREE.Object3D}
 */
export function findAboutCameraObject(root) {
	if (!root) return null;
	for (const name of ["AboutCamera", "Camera", "Camera.001"]) {
		const hit = root.getObjectByName(name);
		if (hit) return hit;
	}
	let found = null;
	root.traverse((object) => {
		if (found) return;
		if (object.isCamera || object.type === "PerspectiveCamera" || object.type === "OrthographicCamera") {
			found = object;
		}
	});
	return found;
}

/**
 * @param {THREE.Object3D} gltfScene
 * @returns {THREE.Object3D}
 */
export function normalizeAboutGltfScene(gltfScene) {
	if (!gltfScene) return gltfScene;

	const aboutModel = gltfScene.getObjectByName("AboutModel");
	const asset = gltfScene.getObjectByName("AboutModelAsset");
	const lookAt = gltfScene.getObjectByName("AboutLookAt");
	const camera = findAboutCameraObject(gltfScene);
	const epicPlanes = findAllAboutEpicTextPlanes(gltfScene);

	const root = new THREE.Group();
	root.name = "AboutUsModel";

	/** Content group kept for AABB helpers — position stays identity (Blender space). */
	const content = new THREE.Group();
	content.name = "AboutUsContent";
	root.add(content);

	if (aboutModel) {
		aboutModel.parent?.remove(aboutModel);
		content.add(aboutModel);
	} else if (asset) {
		asset.parent?.remove(asset);
		asset.position.set(0, 0, 0);
		asset.rotation.set(0, 0, 0);
		asset.scale.set(1, 1, 1);
		asset.updateMatrix();
		content.add(asset);
	} else {
		return gltfScene;
	}

	if (lookAt) {
		lookAt.parent?.remove(lookAt);
		root.add(lookAt);
		lookAt.visible = false;
	}
	if (camera) {
		camera.parent?.remove(camera);
		root.add(camera);
		camera.visible = false;
		if (!camera.name || camera.name === "Camera" || camera.name === "Camera.001") {
			camera.name = "AboutCamera";
		}
	}

	const epicParent = asset ?? aboutModel ?? content;
	if (epicParent) {
		for (const epicPlane of epicPlanes) {
			reparentEpicPlaneKeepWorld(epicPlane, epicParent);
		}
	}

	return root;
}

/**
 * Content AABB for centering / scale — skip helpers / epic title.
 * @param {THREE.Object3D} root
 * @returns {THREE.Box3}
 */
export function computeAboutContentBox(root) {
	const box = new THREE.Box3();
	const meshBox = new THREE.Box3();
	const scope = root.getObjectByName("AboutUsContent") ?? root;
	scope.updateMatrixWorld(true);

	scope.traverse((object) => {
		if (!object.isMesh && !object.isLine && !object.isLineSegments) return;
		if (
			isAboutEpicTextPlaneName(object.name)
			|| object.userData?.aboutEpicTextPlane
			|| object.name === "AboutLookAt"
			|| object.name === "AboutCamera"
		) {
			return;
		}

		const geometry = object.geometry;
		if (!geometry) return;
		if (!geometry.boundingBox) geometry.computeBoundingBox();
		if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

		meshBox.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
		box.union(meshBox);
	});

	return box;
}
