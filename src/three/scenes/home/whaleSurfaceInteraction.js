import { Matrix4, PerspectiveCamera, Raycaster, Ray, Sphere, Triangle, Vector2, Vector3 } from "three";

const SONAR_DURATION = 2.4;
const RESPONSE_CHANNEL_COUNT = 2;

/** Thirteen prepared bone ellipsoids, not a per-frame raycast of 20k particles. */
export class WhaleSurfaceHit {
	constructor(points) {
		this.surfaceMesh = points.surfaceMesh;
		this.intersections = [];
		this.triangle = new Triangle(); this.barycentric = new Vector3(); this.vertex = new Vector3();
		this.raycaster = new Raycaster(); this.ray = new Ray();
		this.matrix = new Matrix4(); this.hit = new Vector3();
		this.sphere = new Sphere(new Vector3(), 1);
		this.camera = new PerspectiveCamera();
		this.proxies = points.boneBounds.flatMap((box, index) => {
			if (box.isEmpty()) return [];
			const center = box.getCenter(new Vector3()), radius = box.getSize(new Vector3()).multiplyScalar(.5);
			radius.max(new Vector3(.025, .025, .025));
			const shape = new Matrix4().makeScale(radius.x, radius.y, radius.z).setPosition(center);
			return [{ bone: points.skeleton.bones[index],
				local: points.skeleton.boneInverses[index].clone().multiply(points.bindMatrix).multiply(shape) }];
		});
	}
	syncCamera(position, target, fov, aspect) {
		this.camera.position.copy(position); this.camera.lookAt(target);
		this.camera.fov = fov; this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
	}
	contains(pointer) {
		this.raycaster.setFromCamera(pointer, this.camera);
		for (const proxy of this.proxies) {
			this.matrix.copy(proxy.bone.matrixWorld).multiply(proxy.local).invert();
			this.ray.copy(this.raycaster.ray).applyMatrix4(this.matrix);
			if (this.ray.intersectSphere(this.sphere, this.hit)) return true;
		}
		return false;
	}

	/** One precise triangle hit per accepted tap. Hover keeps the cheap bone proxies. */
	pick(pointer, position, normal) {
		const mesh = this.surfaceMesh;
		if (!mesh) return false;
		this.raycaster.setFromCamera(pointer, this.camera);
		// Refresh the existing sphere for the current pose; no geometry/material changes.
		mesh.computeBoundingSphere();
		this.intersections.length = 0;
		mesh.raycast(this.raycaster, this.intersections);
		let nearest = null;
		for (const hit of this.intersections) if (!nearest || hit.distance < nearest.distance) nearest = hit;
		if (!nearest) return false;
		const { a, b, c } = nearest.face;
		mesh.getVertexPosition(a, this.triangle.a);
		mesh.getVertexPosition(b, this.triangle.b);
		mesh.getVertexPosition(c, this.triangle.c);
		this.matrix.copy(mesh.matrixWorld).invert();
		this.hit.copy(nearest.point).applyMatrix4(this.matrix);
		this.triangle.getBarycoord(this.hit, this.barycentric);
		// Return bind-pose coordinates: the light pattern then deforms with the same skin.
		position.set(0, 0, 0); normal.set(0, 0, 0);
		const attributes = mesh.geometry.attributes;
		for (const [index, weight] of [[a, this.barycentric.x], [b, this.barycentric.y], [c, this.barycentric.z]]) {
			position.addScaledVector(this.vertex.fromBufferAttribute(attributes.position, index), weight);
			normal.addScaledVector(this.vertex.fromBufferAttribute(attributes.normal, index), weight);
		}
		normal.normalize();
		return true;
	}
}

export class WhaleSurfaceInteraction {
	constructor({ eventTarget = window, canInteract, viewport = () => [window.innerWidth, window.innerHeight] }) {
		this.events = eventTarget; this.canInteract = canInteract; this.viewport = viewport;
		this.pointer = new Vector2(); this.lastPointer = new Vector2();
		this.sonarPositions = Array.from({ length: RESPONSE_CHANNEL_COUNT }, () => new Vector3());
		this.sonarNormals = Array.from({ length: RESPONSE_CHANNEL_COUNT }, () => new Vector3(0, 0, 1));
		this.sonarAges = new Float32Array(RESPONSE_CHANNEL_COUNT);
		this.sonarStrengths = new Float32Array(RESPONSE_CHANNEL_COUNT);
		this.responseTimes = new Float32Array(RESPONSE_CHANNEL_COUNT);
		this.responseProgresses = new Float32Array(RESPONSE_CHANNEL_COUNT);
		this.responseWeights = new Float32Array(RESPONSE_CHANNEL_COUNT);
		this.responseEnergies = new Float32Array(RESPONSE_CHANNEL_COUNT);
		this.responseDirections = Array.from({ length: RESPONSE_CHANNEL_COUNT }, () => new Vector2());
		this.pendingChannels = new Uint8Array(RESPONSE_CHANNEL_COUNT);
		this.responseDirection = new Vector2();
		this.hitPosition = new Vector3(); this.hitNormal = new Vector3(0, 0, 1);
		this.touchPosition = new Vector2();
		this.reset();
		this.onDown = event => {
			this.down = null;
			if (event.button !== 0 || !this.canInteract(event) || !this.eventHits(event)) return;
			this.down = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
		};
		this.onMove = event => {
			if (this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 10) this.down = null;
		};
		this.onUp = event => {
			const down = this.down; this.down = null;
			if (!down || event.pointerId !== down.id || event.timeStamp - down.time > 500
				|| Math.hypot(event.clientX - down.x, event.clientY - down.y) > 10
				|| !this.canInteract(event) || !this.eventHits(event)) return;
			if (!this.surface?.pick(this.pointer, this.hitPosition, this.hitNormal)) return;
			let channel = -1;
			for (let i = 0; i < RESPONSE_CHANNEL_COUNT; i++) {
				if (this.sonarAges[i] >= SONAR_DURATION && this.responseProgresses[i] >= 1) {
					channel = i; break;
				}
			}
			// Two prepared channels cover normal repeated input. If both are still
			// active, replace only the older/fainter one instead of touching the
			// current dominant gesture.
			if (channel < 0) channel = this.responseEnergies[0] <= this.responseEnergies[1] ? 0 : 1;
			this.sonarPositions[channel].copy(this.hitPosition);
			this.sonarNormals[channel].copy(this.hitNormal);
			this.responseDirections[channel].copy(this.pointer);
			this.pendingChannels[channel] = 1;
			this.activeResponseChannel = channel;
			this.pendingSonar = true; this.pendingResponse = true;
		};
		this.cancel = () => {
			this.down = null; this.pendingSonar = false; this.pendingResponse = false;
			this.pendingChannels.fill(0);
		};
		for (const [type, listener] of [["pointerdown", this.onDown], ["pointermove", this.onMove],
			["pointerup", this.onUp], ["pointercancel", this.cancel], ["blur", this.cancel], ["wheel", this.cancel]])
			eventTarget.addEventListener(type, listener, { passive: true });
	}
	eventHits(event) {
		const [width, height] = this.viewport();
		this.pointer.set(event.clientX / width * 2 - 1, 1 - event.clientY / height * 2);
		return this.surface?.contains(this.pointer) === true;
	}
	reset() {
		this.down = null; this.pendingSonar = false; this.pendingResponse = false;
		this.pendingChannels.fill(0); this.sonarAges.fill(3); this.sonarStrengths.fill(0); this.touch = 0;
		this.responseTime = 2.2; this.responseDuration = 2.2;
		this.responseTimes.fill(this.responseDuration); this.responseProgresses.fill(1);
		this.responseWeights.fill(0); this.responseEnergies.fill(0);
		for (const direction of this.responseDirections) direction.set(0, 0);
		this.activeResponseChannel = 0;
		this.sonarPosition = this.sonarPositions[0]; this.sonarNormal = this.sonarNormals[0];
		this.sonarAge = 3; this.sonarStrength = 0;
		this.responseProgress = 1; this.responseWeight = 0; this.responseEnergy = 0;
		this.responseDirection.set(0, 0);
		this.wasHovering = false;
	}
	update(delta, frame, ready, hoverPointer, reducedMotion) {
		const dt = Math.min(.1, Math.max(0, delta || 0));
		const owned = ready && frame?.interactionEnabled && !frame.pointerBlocked;
		const hovering = Boolean(owned && (hoverPointer || frame.pointerDown) && this.surface?.contains(frame.pointer));
		if (hovering) {
			if (!this.wasHovering) this.touchPosition.copy(frame.pointer);
			else this.touchPosition.lerp(frame.pointer, 1 - Math.exp(-12 * dt));
		}
		this.touch += ((hovering && !reducedMotion ? 1 : 0) - this.touch) * (1 - Math.exp(-7 * dt));
		let energySum = 0, strongestWeight = 0;
		this.responseDirection.set(0, 0);
		for (let i = 0; i < RESPONSE_CHANNEL_COUNT; i++) {
			this.sonarAges[i] = Math.min(3, this.sonarAges[i] + dt);
			if (this.pendingChannels[i] && owned) {
				this.sonarAges[i] = 0; this.sonarStrengths[i] = reducedMotion ? .25 : 1;
				this.responseTimes[i] = 0; this.responseWeights[i] = reducedMotion ? .16 : 1;
			}
			this.responseTimes[i] = Math.min(this.responseDuration, this.responseTimes[i] + dt);
			this.responseProgresses[i] = this.responseTimes[i] / this.responseDuration;
			const envelope = Math.sin(Math.PI * this.responseProgresses[i]);
			this.responseEnergies[i] = this.responseWeights[i] * envelope * envelope;
			if (this.responseProgresses[i] >= 1) this.responseWeights[i] = this.responseEnergies[i] = 0;
			if (!owned) {
				this.sonarStrengths[i] *= Math.exp(-8 * dt);
				this.responseWeights[i] *= Math.exp(-8 * dt);
				this.responseEnergies[i] *= Math.exp(-8 * dt);
			}
			energySum += this.responseEnergies[i];
			strongestWeight = Math.max(strongestWeight, this.responseWeights[i]);
			this.responseDirection.addScaledVector(this.responseDirections[i], this.responseEnergies[i]);
		}
		if (energySum > 1e-6) this.responseDirection.multiplyScalar(1 / energySum);
		this.responseEnergy = Math.min(1, energySum); this.responseWeight = strongestWeight;
		const active = this.activeResponseChannel;
		this.responseTime = this.responseTimes[active]; this.responseProgress = this.responseProgresses[active];
		this.sonarPosition = this.sonarPositions[active]; this.sonarNormal = this.sonarNormals[active];
		this.sonarAge = this.sonarAges[active]; this.sonarStrength = this.sonarStrengths[active];
		this.pendingSonar = false;
		this.pendingResponse = false;
		this.pendingChannels.fill(0);
		if (!owned) {
			this.down = null;
		}
		this.wasHovering = hovering;
		if (hovering) this.lastPointer.copy(frame.pointer);
	}
	applyUniforms(uniforms) {
		if (!uniforms?.uTouchStrength) return;
		uniforms.uTouchStrength.value = this.touch;
		uniforms.uTouchPosition.value.copy(this.touchPosition);
		uniforms.uSonarPosition.value.copy(this.sonarPositions[0]);
		uniforms.uSonarNormal.value.copy(this.sonarNormals[0]);
		uniforms.uSonarAge.value = this.sonarAges[0];
		uniforms.uSonarStrength.value = this.sonarStrengths[0];
		uniforms.uSonarPosition2?.value.copy(this.sonarPositions[1]);
		uniforms.uSonarNormal2?.value.copy(this.sonarNormals[1]);
		if (uniforms.uSonarAge2) uniforms.uSonarAge2.value = this.sonarAges[1];
		if (uniforms.uSonarStrength2) uniforms.uSonarStrength2.value = this.sonarStrengths[1];
	}
	dispose() {
		for (const [type, listener] of [["pointerdown", this.onDown], ["pointermove", this.onMove],
			["pointerup", this.onUp], ["pointercancel", this.cancel], ["blur", this.cancel], ["wheel", this.cancel]])
			this.events.removeEventListener(type, listener);
		this.surface = null; this.reset();
	}
}
