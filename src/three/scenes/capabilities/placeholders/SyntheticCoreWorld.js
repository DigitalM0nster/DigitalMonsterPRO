import * as THREE from "three";
import { getGraphicsTier } from "../../../../functions/getGraphicsTier.js";
import { buildSyntheticCoreHardware } from "./syntheticCoreHardware.js";
import { batchSyntheticCoreDraws } from "./batchSyntheticCoreDraws.js";
import { createReactorEnvironment } from "./syntheticCoreMaterials.js";
import { SyntheticCoreHud } from "./SyntheticCoreHud.js";
import { createSyntheticCoreNetwork } from "./createSyntheticCoreNetwork.js";

const SYNTHETIC_CORE_CONFIG = { camera: [0, 0.5, 11.8], build: "core" };

/** Persistent authored world; all geometry, shaders and reflections prepare before Start. */
export class SyntheticCoreWorld {
	constructor(scene, renderer, sound = null) {
		this.variant = "syntheticCore";
		this.config = SYNTHETIC_CORE_CONFIG;
		this.group = new THREE.Group();
		this.group.name = "capability-synthetic-core";
		this.group.visible = false;
		this.target = new THREE.Vector3(0, 0, 0);
		this.cameraLookAt = null;
		this.cameraPosition = new THREE.Vector3(...this.config.camera);
		this.rotors = [];
		this.floaters = [];
		this.sound = sound;
		this.assemblyUniform = { value: 0 };
		this.assemblyTarget = 0;
		this.assemblyVelocity = 0;
		this.assemblyMovers = [];
		this.pulseMaterials = [];
		this.breathers = [];
		this.timeUniforms = [];
		this.elapsed = 0;
		this.interactionMaterials = [];
		this.interactionAssembly = null;
		this.interactionPlasmaMaterial = null;
		this.interactionHovered = false;
		this.interactionStrength = 0;
		this.interactionCharge = 0;
		this.interactionBurstAge = 10;
		this.interactionBurstStrength = 0;
		this.interactionPressElapsed = 0;
		this.interactionPressActive = false;
		this.interactionPressDragged = false;
		this.interactionPointerWasDown = false;
		this.interactionPointer = new THREE.Vector2();
		this.interactionPressPointer = new THREE.Vector2();
		this.interactionWorldPoint = new THREE.Vector3(100, 100, 100);
		this.interactionPressWorldPoint = new THREE.Vector3();
		this.interactionCenter = new THREE.Vector3();
		this.interactionSphere = new THREE.Sphere(this.interactionCenter, 2.28);
		this.interactionRaycaster = new THREE.Raycaster();
		this.disposed = false;
		this.environment = null;
		this.ownedMaterials = [];
		this.detail = getGraphicsTier() === "low" ? 0.5 : getGraphicsTier() === "medium" ? 0.75 : 1;
		scene.add(this.group);
		this.readyPromise = this._prepare(scene, renderer);
	}

	async _prepare(scene, renderer) {
		await new Promise(resolve => requestAnimationFrame(resolve));
		if (this.disposed) return;
		if (renderer) {
			this.environment = createReactorEnvironment(renderer);
			scene.environment = this.environment.texture;
		}
		const assembly = new THREE.Group();
		assembly.position.set(1.1, 0, 0);
		assembly.scale.setScalar(1.23);
		assembly.rotation.set(0.18, -0.38, -0.24);
		this.group.add(assembly);
		this.interactionAssembly = assembly;
		this.target.copy(assembly.position);
		this.cameraLookAt = new THREE.Vector3(-0.2, 0, 0);
		this.interactionSphere.radius = 3.25;
		await buildSyntheticCoreHardware(this, assembly, () => this.disposed);
		if (this.disposed) return;
		await batchSyntheticCoreDraws(this.group, () => this.disposed);
		if (this.disposed) return;
		const networkTime = { value: 0 };
		this.group.add(createSyntheticCoreNetwork({ time: networkTime, assembly: this.assemblyUniform, detail: this.detail }));
		this.timeUniforms.push(networkTime);
		await SyntheticCoreHud.prepare();
		if (this.disposed) return;
		this.hud = new SyntheticCoreHud(this.group, assembly.getObjectByName("contained-energy-lens"), renderer.domElement);
		if (this.disposed) return;
		if (!this.disposed) await this.sound?.prepare();
	}

	bindInput(element, canHandle) {
		this._inputCleanup?.();
		let press = null;
		const inputSurface = element.ownerDocument.defaultView;
		const down = event => { press = event.button === 0 && canHandle(event) ? { x: event.clientX, y: event.clientY, dragged: false } : null; };
		const move = event => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.dragged = true; };
		const cancel = () => { press = null; };
		const click = event => {
			const valid = press && !press.dragged && canHandle(event) && this._interactionCamera;
			press = null;
			if (!valid) return;
			const rect = element.getBoundingClientRect();
			this.interactionPointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
			this.interactionAssembly.updateWorldMatrix(true, false);
			this.interactionCenter.setFromMatrixPosition(this.interactionAssembly.matrixWorld);
			this.interactionRaycaster.setFromCamera(this.interactionPointer, this._interactionCamera);
			if (this.hud?.hitTest(this.interactionPointer)) {
				this.hud.activate();
				return;
			}
			if (this.interactionRaycaster.ray.intersectSphere(this.interactionSphere, this.interactionWorldPoint)) {
				this.assemblyTarget = this.assemblyTarget > 0.5 ? 0 : 1;
				this.interactionBurstAge = 0;
				this.interactionBurstStrength = 0.75;
			}
		};
		inputSurface.addEventListener("pointerdown", down);
		inputSurface.addEventListener("pointermove", move);
		inputSurface.addEventListener("pointercancel", cancel);
		inputSurface.addEventListener("click", click);
		this._inputCleanup = () => {
			inputSurface.removeEventListener("pointerdown", down);
			inputSurface.removeEventListener("pointermove", move);
			inputSurface.removeEventListener("pointercancel", cancel);
			inputSurface.removeEventListener("click", click);
		};
	}

	_resetInteraction() {
		this.interactionHovered = false;
		this.interactionStrength = 0;
		this.interactionCharge = 0;
		this.interactionBurstAge = 10;
		this.interactionBurstStrength = 0;
		this.interactionPressElapsed = 0;
		this.interactionPressActive = false;
		this.interactionPressDragged = false;
		this.interactionPointerWasDown = false;
		this.interactionWorldPoint.set(100, 100, 100);
		for (const material of this.interactionMaterials) {
			material.uniforms.uPointerWorld.value.copy(this.interactionWorldPoint);
			material.uniforms.uPointerStrength.value = 0;
			material.uniforms.uBurstAge.value = 10;
			material.uniforms.uBurstStrength.value = 0;
		}
		if (this.interactionPlasmaMaterial) {
			this.interactionPlasmaMaterial.uniforms.uInteraction.value = 0;
			this.interactionPlasmaMaterial.uniforms.uBurst.value = 0;
		}
	}

	_updateSyntheticInteraction(delta, frame, interactionOwned = true) {
		if (this.config.build !== "core") return false;
		const interactionEnabled = interactionOwned
			&& frame?.interactionEnabled !== false
			&& !frame?.pointerBlocked
			&& Boolean(frame?.camera);
		const pointer = frame?.visualPointer ?? frame?.pointer ?? { x: 0, y: 0 };
		this.interactionPointer.set(
			THREE.MathUtils.clamp(Number(pointer.x) || 0, -1, 1),
			THREE.MathUtils.clamp(Number(pointer.y) || 0, -1, 1),
		);

		let hovered = false;
		if (interactionEnabled && this.interactionAssembly) {
			this.interactionAssembly.updateWorldMatrix(true, false);
			this.interactionCenter.setFromMatrixPosition(this.interactionAssembly.matrixWorld);
			this.interactionRaycaster.setFromCamera(this.interactionPointer, frame.camera);
			hovered = Boolean(this.interactionRaycaster.ray.intersectSphere(
				this.interactionSphere,
				this.interactionWorldPoint,
			));
		}
		if (!hovered) this.interactionWorldPoint.set(100, 100, 100);
		this.interactionHovered = hovered;
		this.interactionStrength = THREE.MathUtils.damp(
			this.interactionStrength,
			hovered ? 1 : 0,
			hovered ? 8.5 : 4.2,
			delta,
		);

		const pointerDown = interactionEnabled && Boolean(frame?.pointerDown);
		if (!interactionEnabled && this.interactionPointerWasDown) {
			this.interactionPressActive = false;
			this.interactionPressDragged = false;
			this.interactionPressElapsed = 0;
			this.interactionPointerWasDown = false;
		}
		if (pointerDown && !this.interactionPointerWasDown) {
			this.interactionPressActive = hovered;
			this.interactionPressDragged = false;
			this.interactionPressElapsed = 0;
			this.interactionPressPointer.copy(this.interactionPointer);
			if (hovered) this.interactionPressWorldPoint.copy(this.interactionWorldPoint);
		}
		if (pointerDown && this.interactionPressActive) {
			this.interactionPressElapsed += delta;
			if (this.interactionPointer.distanceToSquared(this.interactionPressPointer) > 0.0016) {
				this.interactionPressDragged = true;
			}
		}
		if (!pointerDown && this.interactionPointerWasDown) {
			if (this.interactionPressActive && !this.interactionPressDragged) {
				const heldCharge = THREE.MathUtils.clamp(this.interactionPressElapsed / 1.15, 0, 1);
				this.interactionBurstAge = 0;
				this.interactionBurstStrength = 0.62 + heldCharge * 0.78;
				for (const material of this.interactionMaterials) {
					material.uniforms.uBurstOrigin.value.copy(this.interactionPressWorldPoint);
				}
			}
			this.interactionPressActive = false;
			this.interactionPressElapsed = 0;
		}
		this.interactionPointerWasDown = pointerDown;

		const chargeTarget = pointerDown
			&& this.interactionPressActive
			&& !this.interactionPressDragged
			? THREE.MathUtils.clamp(0.3 + this.interactionPressElapsed / 1.15, 0, 1)
			: 0;
		this.interactionCharge = THREE.MathUtils.damp(
			this.interactionCharge,
			chargeTarget,
			chargeTarget > this.interactionCharge ? 5.8 : 3.6,
			delta,
		);
		if (this.interactionBurstStrength > 0) {
			this.interactionBurstAge += delta;
			if (this.interactionBurstAge >= 2.45) {
				this.interactionBurstAge = 10;
				this.interactionBurstStrength = 0;
			}
		}
		const burstVisual = this.interactionBurstStrength
			* Math.max(0, 1 - this.interactionBurstAge * 0.42);
		for (const material of this.interactionMaterials) {
			material.uniforms.uPointerWorld.value.copy(this.interactionWorldPoint);
			material.uniforms.uPointerStrength.value = Math.max(
				this.interactionStrength,
				this.interactionCharge,
			);
			material.uniforms.uBurstAge.value = this.interactionBurstAge;
			material.uniforms.uBurstStrength.value = this.interactionBurstStrength;
		}
		if (this.interactionPlasmaMaterial) {
			this.interactionPlasmaMaterial.uniforms.uInteraction.value = Math.max(
				this.interactionStrength * 0.42,
				this.interactionCharge,
			);
			this.interactionPlasmaMaterial.uniforms.uBurst.value = burstVisual;
		}
		return hovered;
	}

	setRenderEnabled(enabled) {
		const nextVisible = enabled === true;
		if (!nextVisible && this.group.visible) this._resetInteraction();
		if (!nextVisible) this.sound?.stop();
		this.group.visible = nextVisible;
	}

	getOrbitTarget(target = new THREE.Vector3()) {
		// The orbit controller derives its pivot from the current view ray. Return
		// the exact authored look-at point so the radius cannot jump for one frame
		// when drag begins or reverses.
		return target.copy(this.cameraLookAt ?? this.target);
	}

	applyCamera(camera, parallax) {
		camera.position.copy(this.cameraPosition);
		if (this.cameraLookAt) this.cameraLookAt.x = camera.aspect < 0.8 ? 2.0 : -0.2;
		// Fit the same assembly and its surrounding field on narrow screens.
		camera.position.z *= Math.max(1, 0.98 / Math.max(0.4, camera.aspect)) * (1 + this.assemblyUniform.value * 0.30);
		camera.position.x += (Number(parallax?.x) || 0) * 0.65;
		camera.position.y += (Number(parallax?.y) || 0) * 0.45;
		camera.fov = 43;
		camera.updateProjectionMatrix();
		camera.lookAt(this.cameraLookAt ?? this.target);
		camera.updateMatrixWorld(true);
	}

	update(delta, active = false, frame = null, interactionOwned = true, locale = "ru") {
		if (!active || this.disposed || !this.group.visible) return false;
		const dt = Math.max(0, Math.min(0.05, Number(delta) || 0));
		this._interactionCamera = frame?.camera ?? this._interactionCamera;
		const hovered = this._updateSyntheticInteraction(dt, frame, interactionOwned);
		this.elapsed += dt;
		const progress = this.assemblyUniform.value;
		this.assemblyVelocity += ((this.assemblyTarget - progress) * 7.8 - this.assemblyVelocity * 5.9) * dt;
		this.assemblyUniform.value = THREE.MathUtils.clamp(progress + this.assemblyVelocity * dt, 0, 1);
		for (const mover of this.assemblyMovers) {
			const amount = THREE.MathUtils.smoothstep(this.assemblyUniform.value, mover.start ?? 0, mover.end ?? 1);
			mover.object.position[mover.axis ?? 'z'] = THREE.MathUtils.lerp(mover.from, mover.to, amount);
		}
		for (const floater of this.floaters) {
			const t = this.elapsed * 0.55 + floater.phase;
			floater.object.position.copy(floater.origin);
			floater.object.position.x += Math.sin(t * 0.7) * floater.amplitude;
			floater.object.position.y += Math.sin(t) * floater.amplitude;
			floater.object.position.z += Math.cos(t * 0.8) * floater.amplitude * 0.6;
		}
		const burstEnergy = this.interactionBurstStrength
			* Math.max(0, 1 - this.interactionBurstAge * 0.42);
		const interactionEnergy = Math.max(
			this.interactionStrength * 0.28,
			this.interactionCharge,
			burstEnergy,
		);
		for (const rotor of this.rotors) {
			rotor.object.rotation[rotor.axis] += rotor.speed * dt * (1 + interactionEnergy * 0.55 + (rotor.revealBoost ?? 0) * this.assemblyUniform.value);
		}
		for (const pulse of this.pulseMaterials) {
			pulse.material.opacity = pulse.base
				+ Math.sin(this.elapsed * 1.6 + pulse.phase) * pulse.range;
		}
		for (const uniform of this.timeUniforms) {
			uniform.value = this.elapsed;
		}
		for (const breather of this.breathers) {
			const scale = 1 + Math.sin(this.elapsed * breather.speed + breather.phase) * breather.amount;
			breather.object.scale.set(
				breather.base[0] * scale,
				breather.base[1] * scale,
				breather.base[2] * scale,
			);
		}
		this.hud?.update(dt, {
			time: this.elapsed, target: this.assemblyTarget, raycaster: this.interactionRaycaster,
			pointer: this.interactionPointer, camera: frame?.camera,
			enabled: interactionOwned && frame?.interactionEnabled !== false && !frame?.pointerBlocked && Boolean(frame?.camera),
			dragging: this.interactionPressDragged && Boolean(frame?.pointerDown), locale,
		});
		return hovered || this.hud?.hovered;
	}

	dispose(scene) {
		this.disposed = true;
		this.sound?.dispose();
		this.hud?.dispose();
		this._inputCleanup?.();
		this._inputCleanup = null;
		this._interactionCamera = null;
		if (this.environment && scene?.environment === this.environment.texture) scene.environment = null;
		this.environment?.dispose();
		this.environment = null;
		scene?.remove(this.group);
		const geometries = new Set();
		const materials = new Set(this.ownedMaterials);
		this.group.traverse((object) => {
			if (object.geometry) geometries.add(object.geometry);
			const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of objectMaterials) {
				if (material) materials.add(material);
			}
		});
		for (const geometry of geometries) geometry.dispose();
		for (const material of materials) material.dispose();
		this.group.clear();
	}
}
