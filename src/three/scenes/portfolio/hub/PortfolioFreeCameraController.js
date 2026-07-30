import * as THREE from "three";

const MOVEMENT_CODES = new Set([
	"KeyW",
	"KeyA",
	"KeyS",
	"KeyD",
	"KeyQ",
	"KeyE",
	"Space",
	"AltLeft",
	"AltRight",
	"ShiftLeft",
	"ShiftRight",
]);

function isEditableTarget(target) {
	return (
		target instanceof HTMLInputElement
		|| target instanceof HTMLTextAreaElement
		|| target instanceof HTMLSelectElement
		|| (target instanceof HTMLElement && target.isContentEditable)
	);
}

function round(value, digits = 4) {
	const multiplier = 10 ** digits;
	return Math.round(value * multiplier) / multiplier;
}

function vectorToArray(vector) {
	return [round(vector.x), round(vector.y), round(vector.z)];
}

export class PortfolioFreeCameraController {
	constructor(inputElement) {
		this.inputElement = inputElement;
		this.enabled = false;
		this.pointerLocked = false;
		this.moveSpeed = 3.5;
		this.fastMultiplier = 3;
		this.rollSpeed = THREE.MathUtils.degToRad(55);
		this.mouseSensitivity = 0.0018;
		this.pitchLimit = THREE.MathUtils.degToRad(89);
		this.yaw = 0;
		this.pitch = 0;
		this.roll = 0;
		this.fov = 40;
		this.position = new THREE.Vector3();
		this.quaternion = new THREE.Quaternion();
		this._euler = new THREE.Euler(0, 0, 0, "YXZ");
		this._forward = new THREE.Vector3();
		this._right = new THREE.Vector3();
		this._movement = new THREE.Vector3();
		this._worldUp = new THREE.Vector3(0, 1, 0);
		this._lookDirection = new THREE.Vector3();
		this._lookAt = new THREE.Vector3();
		this._keys = new Set();
		this._camera = null;

		this._onKeyDown = this._onKeyDown.bind(this);
		this._onKeyUp = this._onKeyUp.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onPointerLockChange = this._onPointerLockChange.bind(this);
		this._onInputPointerDown = this._onInputPointerDown.bind(this);
		this._onWindowBlur = this._onWindowBlur.bind(this);

		window.addEventListener("keydown", this._onKeyDown, true);
		window.addEventListener("keyup", this._onKeyUp, true);
		window.addEventListener("blur", this._onWindowBlur);
		document.addEventListener("mousemove", this._onMouseMove);
		document.addEventListener("pointerlockchange", this._onPointerLockChange);
		this.inputElement?.addEventListener("pointerdown", this._onInputPointerDown);
	}

	_onKeyDown(event) {
		if (!this.enabled || isEditableTarget(event.target)) {
			return;
		}

		if (event.code === "KeyC" && !event.repeat) {
			event.preventDefault();
			void this.copySnapshot();
			return;
		}

		if (!MOVEMENT_CODES.has(event.code)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		this._keys.add(event.code);
	}

	_onKeyUp(event) {
		if (!MOVEMENT_CODES.has(event.code)) {
			return;
		}
		this._keys.delete(event.code);
		if (this.enabled) {
			event.preventDefault();
		}
	}

	_onWindowBlur() {
		this._keys.clear();
	}

	_onInputPointerDown(event) {
		if (!this.enabled || event.button !== 0 || document.pointerLockElement === this.inputElement) {
			return;
		}
		const request = this.inputElement?.requestPointerLock?.();
		request?.catch?.(() => {});
	}

	_onPointerLockChange() {
		this.pointerLocked = document.pointerLockElement === this.inputElement;
	}

	_onMouseMove(event) {
		if (!this.enabled || !this.pointerLocked) {
			return;
		}
		this.yaw -= event.movementX * this.mouseSensitivity;
		this.pitch -= event.movementY * this.mouseSensitivity;
		this.pitch = THREE.MathUtils.clamp(this.pitch, -this.pitchLimit, this.pitchLimit);
		this._syncQuaternion();
	}

	_syncQuaternion() {
		this._euler.set(this.pitch, this.yaw, this.roll, "YXZ");
		this.quaternion.setFromEuler(this._euler);
	}

	syncFromCamera(camera) {
		if (!camera) {
			return;
		}
		this._camera = camera;
		this.position.copy(camera.position);
		this.quaternion.copy(camera.quaternion);
		this._euler.setFromQuaternion(camera.quaternion, "YXZ");
		this.pitch = this._euler.x;
		this.yaw = this._euler.y;
		this.roll = this._euler.z;
		this.fov = camera.fov;
	}

	setEnabled(enabled, camera = this._camera) {
		const next = Boolean(enabled);
		if (next === this.enabled) {
			return;
		}
		this.enabled = next;
		this._keys.clear();
		if (next) {
			this.syncFromCamera(camera);
			return;
		}
		if (document.pointerLockElement === this.inputElement) {
			document.exitPointerLock?.();
		}
	}

	reset(camera, config) {
		if (!camera || !config) {
			return;
		}
		camera.position.fromArray(config.position);
		camera.up.set(0, 1, 0);
		if (Array.isArray(config.quaternion) && config.quaternion.length === 4) {
			camera.quaternion.fromArray(config.quaternion).normalize();
		} else {
			this._lookAt.fromArray(config.lookAt);
			camera.lookAt(this._lookAt);
		}
		camera.fov = config.fov;
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
		this.syncFromCamera(camera);
	}

	update(delta, camera = this._camera) {
		if (!this.enabled || !camera) {
			return false;
		}
		this._camera = camera;
		const dt = Math.min(Math.max(delta, 0), 0.05);
		const rollInput = (this._keys.has("KeyQ") ? 1 : 0) - (this._keys.has("KeyE") ? 1 : 0);
		if (rollInput !== 0) {
			this.roll += rollInput * this.rollSpeed * dt;
			this._syncQuaternion();
		}

		this._movement.set(0, 0, 0);
		this._forward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
		this._right.set(1, 0, 0).applyQuaternion(this.quaternion).normalize();
		const forwardInput = (this._keys.has("KeyW") ? 1 : 0) - (this._keys.has("KeyS") ? 1 : 0);
		const rightInput = (this._keys.has("KeyD") ? 1 : 0) - (this._keys.has("KeyA") ? 1 : 0);
		const verticalInput = (this._keys.has("Space") ? 1 : 0) - (this._keys.has("AltLeft") || this._keys.has("AltRight") ? 1 : 0);
		this._movement.addScaledVector(this._forward, forwardInput);
		this._movement.addScaledVector(this._right, rightInput);
		this._movement.addScaledVector(this._worldUp, verticalInput);
		if (this._movement.lengthSq() > 1) {
			this._movement.normalize();
		}
		const isFast = this._keys.has("ShiftLeft") || this._keys.has("ShiftRight");
		const speed = this.moveSpeed * (isFast ? this.fastMultiplier : 1);
		this.position.addScaledVector(this._movement, speed * dt);
		this.apply(camera);
		return true;
	}

	apply(camera = this._camera) {
		if (!this.enabled || !camera) {
			return false;
		}
		this._camera = camera;
		camera.position.copy(this.position);
		camera.quaternion.copy(this.quaternion);
		camera.up.set(0, 1, 0);
		if (camera.fov !== this.fov) {
			camera.fov = this.fov;
			camera.updateProjectionMatrix();
		}
		camera.updateMatrixWorld(true);
		return true;
	}

	getSnapshot(camera = this._camera) {
		if (camera) {
			if (this.enabled) {
				this.apply(camera);
			} else {
				this.syncFromCamera(camera);
			}
		}
		this._lookDirection.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
		this._lookAt.copy(this.position).add(this._lookDirection);
		return {
			position: vectorToArray(this.position),
			lookAt: vectorToArray(this._lookAt),
			rotationDeg: [
				round(THREE.MathUtils.radToDeg(this.pitch), 3),
				round(THREE.MathUtils.radToDeg(this.yaw), 3),
				round(THREE.MathUtils.radToDeg(this.roll), 3),
			],
			quaternion: [
				round(this.quaternion.x, 6),
				round(this.quaternion.y, 6),
				round(this.quaternion.z, 6),
				round(this.quaternion.w, 6),
			],
			lookDirection: vectorToArray(this._lookDirection),
			fov: round(this.fov, 2),
		};
	}

	getSnapshotText(camera = this._camera) {
		const snapshot = this.getSnapshot(camera);
		return `portfolioHubCamera = ${JSON.stringify(snapshot, null, 2)}`;
	}

	async copySnapshot(camera = this._camera) {
		const text = this.getSnapshotText(camera);
		try {
			await navigator.clipboard.writeText(text);
			console.info("[portfolioCamera] copied to clipboard\n" + text);
			return true;
		} catch {
			console.info("[portfolioCamera] clipboard unavailable\n" + text);
			return false;
		}
	}

	dispose() {
		this.setEnabled(false);
		window.removeEventListener("keydown", this._onKeyDown, true);
		window.removeEventListener("keyup", this._onKeyUp, true);
		window.removeEventListener("blur", this._onWindowBlur);
		document.removeEventListener("mousemove", this._onMouseMove);
		document.removeEventListener("pointerlockchange", this._onPointerLockChange);
		this.inputElement?.removeEventListener("pointerdown", this._onInputPointerDown);
		this.inputElement = null;
		this._camera = null;
	}
}
