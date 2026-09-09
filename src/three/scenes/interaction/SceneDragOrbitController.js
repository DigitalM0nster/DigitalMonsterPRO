import * as THREE from "three";

const MAX_ORBIT_RAD = THREE.MathUtils.degToRad(25);
const MAX_VERTICAL_ORBIT_RAD = THREE.MathUtils.degToRad(35);
const DRAG_TO_ORBIT = 0.72;
const DRAG_RESPONSE = 12;
const RETURN_RESPONSE = 5.5;
const REST_EPSILON = THREE.MathUtils.degToRad(0.03);
const DRAG_START_THRESHOLD = 0.012;
const MIN_ORBIT_RADIUS = 0.25;

/**
 * Adds a bounded orbit after a scene has computed its canonical
 * camera pose and pointer parallax. The camera moves around the point it was
 * already looking at instead of rotating in place, then decays back to the
 * live scene camera when the pointer is released.
 */
export class SceneDragOrbitController {
	constructor() {
		this.sceneId = null;
		this.currentOrbit = 0;
		this.targetOrbit = 0;
		this.currentVerticalOrbit = 0;
		this.targetVerticalOrbit = 0;
		this.lastPointerX = 0;
		this.lastPointerY = 0;
		this.pointerWasDown = false;
		this.dragTravel = 0;
		this.dragConsumed = false;
		this.blockScenePointer = false;
		this.orbitQuaternion = new THREE.Quaternion();
		this.worldY = new THREE.Vector3(0, 1, 0);
		this.orbitRight = new THREE.Vector3();
		this.orbitTarget = new THREE.Vector3();
		this.orbitOffset = new THREE.Vector3();
		this.viewDirection = new THREE.Vector3();
	}

	update(delta, {
		sceneId = null,
		pointer = null,
		pointerDown = false,
		enabled = false,
		verticalEnabled = false,
		maxVerticalOrbit = MAX_VERTICAL_ORBIT_RAD,
	} = {}) {
		const verticalLimit = Number.isFinite(maxVerticalOrbit)
			? THREE.MathUtils.clamp(maxVerticalOrbit, 0, MAX_VERTICAL_ORBIT_RAD)
			: MAX_VERTICAL_ORBIT_RAD;
		const nextSceneId = enabled && sceneId ? sceneId : null;
		if (nextSceneId !== this.sceneId) {
			this.sceneId = nextSceneId;
			this.currentOrbit = 0;
			this.targetOrbit = 0;
			this.currentVerticalOrbit = 0;
			this.targetVerticalOrbit = 0;
			this.pointerWasDown = false;
			this.dragTravel = 0;
			this.dragConsumed = false;
			this.blockScenePointer = false;
		}

		const dragging = Boolean(this.sceneId && pointerDown && pointer);
		const wasPointerDown = this.pointerWasDown;
		const wasDragConsumed = this.dragConsumed;
		if (dragging) {
			const pointerX = THREE.MathUtils.clamp(Number(pointer.x) || 0, -1, 1);
			const pointerY = THREE.MathUtils.clamp(Number(pointer.y) || 0, -1, 1);
			if (!this.pointerWasDown) {
				this.lastPointerX = pointerX;
				this.lastPointerY = pointerY;
				this.dragTravel = 0;
				this.dragConsumed = false;
			} else {
				const deltaX = pointerX - this.lastPointerX;
				const deltaY = verticalEnabled ? pointerY - this.lastPointerY : 0;
				this.dragTravel += Math.hypot(deltaX, deltaY);
				if (this.dragTravel >= DRAG_START_THRESHOLD) {
					this.dragConsumed = true;
					this.targetOrbit = THREE.MathUtils.clamp(
						this.targetOrbit - deltaX * DRAG_TO_ORBIT,
						-MAX_ORBIT_RAD,
						MAX_ORBIT_RAD,
					);
					this.targetVerticalOrbit = THREE.MathUtils.clamp(
						this.targetVerticalOrbit + deltaY * DRAG_TO_ORBIT,
						-verticalLimit,
						verticalLimit,
					);
				}
				this.lastPointerX = pointerX;
				this.lastPointerY = pointerY;
			}
		} else {
			this.targetOrbit = 0;
			this.targetVerticalOrbit = 0;
			this.dragTravel = 0;
			this.dragConsumed = false;
		}
		// Keep scene clicks blocked on the release frame after an actual drag.
		this.blockScenePointer = this.dragConsumed || (!dragging && wasPointerDown && wasDragConsumed);
		this.pointerWasDown = dragging;

		const response = dragging ? DRAG_RESPONSE : RETURN_RESPONSE;
		this.currentOrbit = THREE.MathUtils.damp(
			this.currentOrbit,
			this.targetOrbit,
			response,
			Math.max(0, Math.min(0.05, Number(delta) || 0)),
		);
		this.currentVerticalOrbit = THREE.MathUtils.damp(
			this.currentVerticalOrbit,
			verticalEnabled ? this.targetVerticalOrbit : 0,
			response,
			Math.max(0, Math.min(0.05, Number(delta) || 0)),
		);
		if (!dragging && Math.abs(this.currentOrbit) < REST_EPSILON) {
			this.currentOrbit = 0;
		}
		if (!dragging && Math.abs(this.currentVerticalOrbit) < REST_EPSILON) {
			this.currentVerticalOrbit = 0;
		}
	}

	isBlockingScenePointer() {
		return this.blockScenePointer;
	}

	apply(camera, sceneId, { orbitTarget = null } = {}) {
		if (
			!camera
			|| sceneId !== this.sceneId
			|| !orbitTarget
			|| (Math.abs(this.currentOrbit) < REST_EPSILON && Math.abs(this.currentVerticalOrbit) < REST_EPSILON)
		) {
			return;
		}

		this.orbitTarget.copy(orbitTarget);
		const orbitRadius = camera.position.distanceTo(this.orbitTarget);
		if (!Number.isFinite(orbitRadius) || orbitRadius < MIN_ORBIT_RADIUS) {
			return;
		}

		// Keep the pivot on the canonical view ray. Scene targets provide the
		// correct radius, while this alignment prevents a first-drag look snap for
		// authored camera quaternions (for example an active MMK-1 hotspot).
		this.viewDirection.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
		this.orbitTarget.copy(camera.position).addScaledVector(this.viewDirection, orbitRadius);
		this.orbitOffset.subVectors(camera.position, this.orbitTarget);
		this.orbitQuaternion.setFromAxisAngle(this.worldY, this.currentOrbit);
		this.orbitOffset.applyQuaternion(this.orbitQuaternion);
		// Pitch around the yawed camera's right axis, keeping clear of the poles.
		this.orbitRight.crossVectors(this.worldY, this.orbitOffset);
		if (this.orbitRight.lengthSq() > 0.000001) {
			this.orbitRight.normalize();
			const elevation = Math.asin(THREE.MathUtils.clamp(this.orbitOffset.y / orbitRadius, -1, 1));
			const nextElevation = THREE.MathUtils.clamp(elevation - this.currentVerticalOrbit, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
			this.orbitQuaternion.setFromAxisAngle(this.orbitRight, elevation - nextElevation);
			this.orbitOffset.applyQuaternion(this.orbitQuaternion);
		}
		camera.position.copy(this.orbitTarget).add(this.orbitOffset);
		camera.lookAt(this.orbitTarget);
		camera.updateMatrixWorld(true);
	}

	dispose() {
		this.sceneId = null;
		this.currentOrbit = 0;
		this.targetOrbit = 0;
		this.currentVerticalOrbit = 0;
		this.targetVerticalOrbit = 0;
		this.pointerWasDown = false;
		this.dragTravel = 0;
		this.dragConsumed = false;
		this.blockScenePointer = false;
	}
}
