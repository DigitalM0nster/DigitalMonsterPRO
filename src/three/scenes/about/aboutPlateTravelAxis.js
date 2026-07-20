import * as THREE from "three";

const _worldPos = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _invParent = new THREE.Matrix4();
const _local = new THREE.Vector3();

/**
 * Parent-local travel axis for Front / Back plates.
 * Always toward (or away from) the camera — independent of GLB stand-up euler.
 *
 * @param {THREE.Object3D} mesh
 * @param {THREE.Object3D} model
 * @param {(() => THREE.Vector3) | undefined} getCameraPosition
 * @param {boolean} towardCamera — true = Front advance, false = Back retreat
 */
export function resolveAboutPlateTravelAxisLocal(mesh, model, getCameraPosition, towardCamera) {
	mesh.getWorldPosition(_worldPos);
	const cameraPos =
		typeof getCameraPosition === "function" ? getCameraPosition() : new THREE.Vector3(0, 0, 8);
	_toCam.copy(cameraPos).sub(_worldPos);

	if (_toCam.lengthSq() < 1e-8) {
		_local.set(0, 0, towardCamera ? 1 : -1);
		return _local.clone();
	}

	_toCam.normalize();
	const parentWorld = mesh.parent?.matrixWorld ?? model.matrixWorld;
	_invParent.copy(parentWorld).invert();
	_local.copy(_toCam).transformDirection(_invParent);
	if (_local.lengthSq() < 1e-8) {
		_local.set(0, 0, 1);
	}
	_local.normalize();
	if (!towardCamera) {
		_local.negate();
	}
	return _local.clone();
}
