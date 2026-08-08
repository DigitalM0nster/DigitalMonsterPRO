import * as THREE from "three";

const MAX_YAW_RAD = THREE.MathUtils.degToRad(25);
const DRAG_TO_YAW = 0.72;
const DRAG_RESPONSE = 12;
const RETURN_RESPONSE = 5.5;
const REST_EPSILON = THREE.MathUtils.degToRad(0.03);
const DRAG_START_THRESHOLD = 0.012;

/**
 * One camera-space drag bridge for prepared scenes. Each scene still computes
 * its canonical camera + pointer parallax first; this controller adds a bounded
 * Y yaw only for the final render, then smoothly decays back to that live base.
 */
export class SceneDragYawController {
	constructor(store) {
		this.store = store;
		this.sceneId = null;
		this.currentYaw = 0;
		this.targetYaw = 0;
		this.lastPointerX = 0;
		this.pointerWasDown = false;
		this.dragTravel = 0;
		this.dragConsumed = false;
		this.blockScenePointer = false;
		this.yawQuaternion = new THREE.Quaternion();
		this.worldY = new THREE.Vector3(0, 1, 0);
	}

	_isSecondCapability(sceneId, capabilityVariant = null) {
		return sceneId === "capabilities" && (
			capabilityVariant === "lightTrails"
			|| (
				capabilityVariant == null
				&& this.store?.capabilitiesExperience?.activeStageId === "light-trails"
			)
		);
	}

	update(delta, {
		sceneId = null,
		pointer = null,
		pointerDown = false,
		enabled = false,
	} = {}) {
		const nextSceneId = enabled && sceneId && !this._isSecondCapability(sceneId)
			? sceneId
			: null;
		if (nextSceneId !== this.sceneId) {
			this.sceneId = nextSceneId;
			this.currentYaw = 0;
			this.targetYaw = 0;
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
			if (!this.pointerWasDown) {
				this.lastPointerX = pointerX;
				this.dragTravel = 0;
				this.dragConsumed = false;
			} else {
				const deltaX = pointerX - this.lastPointerX;
				this.dragTravel += Math.abs(deltaX);
				if (this.dragTravel >= DRAG_START_THRESHOLD) {
					this.dragConsumed = true;
					this.targetYaw = THREE.MathUtils.clamp(
						this.targetYaw - deltaX * DRAG_TO_YAW,
						-MAX_YAW_RAD,
						MAX_YAW_RAD,
					);
				}
				this.lastPointerX = pointerX;
			}
		} else {
			this.targetYaw = 0;
			this.dragTravel = 0;
			this.dragConsumed = false;
		}
		// Keep scene-specific click/hotspot handlers blocked for the release frame
		// after a real drag, so releasing a rotated scene cannot become a click.
		this.blockScenePointer = this.dragConsumed || (!dragging && wasPointerDown && wasDragConsumed);
		this.pointerWasDown = dragging;

		const response = dragging ? DRAG_RESPONSE : RETURN_RESPONSE;
		this.currentYaw = THREE.MathUtils.damp(
			this.currentYaw,
			this.targetYaw,
			response,
			Math.max(0, Math.min(0.05, Number(delta) || 0)),
		);
		if (!dragging && Math.abs(this.currentYaw) < REST_EPSILON) {
			this.currentYaw = 0;
		}
	}

	isBlockingScenePointer() {
		return this.blockScenePointer;
	}

	apply(camera, sceneId, { capabilityVariant = null } = {}) {
		if (
			!camera
			|| sceneId !== this.sceneId
			|| this._isSecondCapability(sceneId, capabilityVariant)
			|| Math.abs(this.currentYaw) < REST_EPSILON
		) {
			return;
		}
		this.yawQuaternion.setFromAxisAngle(this.worldY, this.currentYaw);
		camera.quaternion.premultiply(this.yawQuaternion).normalize();
		camera.updateMatrixWorld(true);
	}

	dispose() {
		this.sceneId = null;
		this.currentYaw = 0;
		this.targetYaw = 0;
		this.pointerWasDown = false;
		this.dragTravel = 0;
		this.dragConsumed = false;
		this.blockScenePointer = false;
	}
}
