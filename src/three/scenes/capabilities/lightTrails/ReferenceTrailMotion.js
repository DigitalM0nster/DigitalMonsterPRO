import { Vector2, Vector3 } from "three";
import { createReferenceNoise } from "./referenceTrailNoise.js";

export const REFERENCE_TRAIL_COUNT = 7;
export const REFERENCE_POINT_COUNT = 42;
export const REFERENCE_BONE_LENGTH = 8;
const STEP = 1 / 60;
const TAU = Math.PI * 2;
const SCALE = 0.095;
export const REFERENCE_FLIGHT_SPEED = 160;
const sineInOut = (t) => 0.5 - Math.cos(t * Math.PI) * 0.5;
const powerInOut = (t) => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;

/** Artisans d'idées' unconstrained, free-base FABRIK chain.
 * With no fixed base or joint limits, the backward pass reaches the target
 * exactly; the forward pass is the identity. Keep the existing point storage.
 */
export function solveFreeTrailChain(points, target) {
	points[points.length - 1].copy(target);
	for (let index = points.length - 2; index >= 0; index -= 1) {
		const point = points[index];
		const next = points[index + 1];
		const dx = point.x - next.x;
		const dy = point.y - next.y;
		const dz = point.z - next.z;
		const length = Math.hypot(dx, dy, dz);
		if (length < 1e-9) {
			point.set(next.x, next.y + REFERENCE_BONE_LENGTH, next.z);
		} else {
			const ratio = REFERENCE_BONE_LENGTH / length;
			point.set(next.x + dx * ratio, next.y + dy * ratio, next.z + dz * ratio);
		}
	}
}

/** Same target motion, 41 bones, mouse lerps, depth tweens and staggered spin
 * as the reference. Scene scale/translation only adapt its units to our camera.
 */
export class ReferenceTrailMotion {
	constructor(data, random) {
		this.data = data;
		this.currentData = new Float32Array(data.length);
		this.previousData = new Float32Array(data.length);
		this.random = random;
		this.noise = createReferenceNoise();
		this.screenOffsetX = -45;
		this.elapsed = 0;
		this.accumulator = 0;
		this.pointer = new Vector2();
		this.touchRelease = -1;
		this.touchFrom = new Vector2();
		this.spinElapsed = -1;
		this.spinDuration = 1.25;
		this.spinRadius = 0;
		this.spinDirection = 1;
		this.lines = Array.from({ length: REFERENCE_TRAIL_COUNT }, () => ({
			points: Array.from({ length: REFERENCE_POINT_COUNT }, (_, index) =>
				new Vector3(-70, -40 - index * REFERENCE_BONE_LENGTH, 100)),
			target: new Vector3(),
			mouse: new Vector2(),
			mouseLerp: 0.02 + random() * 0.08,
			phase: random() * TAU,
			depth: 0,
			depthFrom: 0,
			depthTo: 0,
			depthElapsed: -1,
			depthWait: 1 + random() * 2,
		}));
		// Settle the initially vertical chains under prepare, before the first reveal.
		for (let frame = 0; frame < 240; frame += 1) this._step(STEP);
		this._writeData();
		this.previousData.set(this.currentData);
		this.data.set(this.currentData);
	}

	startSpin() {
		if (this.spinElapsed >= 0) return false;
		this.spinElapsed = 0;
		this.spinDirection = this.random() > 0.5 ? 1 : -1;
		this.spinRadius = 30 + this.random() * 30;
		this.spinDuration = 1.2 + this.random() * 0.1;
		return true;
	}

	releaseTouch() {
		this.touchFrom.copy(this.pointer);
		this.touchRelease = 0;
	}

	update(delta, pointer, acceptsPointer) {
		if (acceptsPointer && pointer) {
			this.pointer.set(
				Math.max(-1, Math.min(1, Number(pointer.x) || 0)),
				Math.max(-1, Math.min(1, Number(pointer.y) || 0)),
			);
			this.touchRelease = -1;
		}
		const dt = Math.max(0, Math.min(delta, 0.05));
		if (dt === 0) return false;
		this.accumulator += dt;
		while (this.accumulator >= STEP - 1e-9) {
			this.accumulator = Math.max(0, this.accumulator - STEP);
			this.previousData.set(this.currentData);
			this._step(STEP);
			this._writeData();
		}
		// Keep the original fixed-step solver, but draw between its last two
		// states on every frame. Otherwise 120/144/165 Hz repeats stale geometry
		// while the camera keeps moving, producing visible cursor-driven judder.
		const alpha = this.accumulator / STEP;
		for (let index = 0; index < this.data.length; index += 1) {
			this.data[index] = this.previousData[index]
				+ (this.currentData[index] - this.previousData[index]) * alpha;
		}
		return true;
	}

	_step(dt) {
		this.elapsed += dt;
		if (this.touchRelease >= 0) {
			this.touchRelease = Math.min(1, this.touchRelease + dt);
			this.pointer.copy(this.touchFrom).multiplyScalar((1 - this.touchRelease) ** 3);
		}
		if (this.spinElapsed >= 0) {
			this.spinElapsed += dt;
			if (this.spinElapsed >= this.spinDuration * 2 + 0.07 * 6) this.spinElapsed = -1;
		}
		const noiseX = this.noise.noise(this.elapsed * 0.1, this.elapsed * 0.1) * 15;
		const noiseY = this.noise.noise(1337 + this.elapsed * 0.05, 7331 + this.elapsed * 0.05) * 5;
		for (let index = 0; index < this.lines.length; index += 1) {
			const line = this.lines[index];
			// Camera-relative equivalent of the reference rig flying at 20 * 8 units/s.
			// Old points move towards/past the viewer; new targets stay ahead of it.
			for (const point of line.points) point.z += REFERENCE_FLIGHT_SPEED * dt;
			line.mouse.x += (this.pointer.x * 30 - line.mouse.x) * line.mouseLerp;
			line.mouse.y += (this.pointer.y * 30 - line.mouse.y) * line.mouseLerp;
			this._updateDepth(line, dt);
			const phase = this.elapsed * 1.44 + line.phase;
			line.target.set(
				this.screenOffsetX + Math.sin(phase) * 1.69 + line.mouse.x + noiseX,
				-25 + Math.cos(phase) * 3.18 + line.mouse.y + noiseY,
				-156 + line.depth,
			);
			const spinTime = this.spinElapsed - index * 0.07;
			if (this.spinElapsed >= 0 && spinTime >= 0) {
				const progress = Math.min(1, spinTime / (this.spinDuration * 2));
				const outAndBack = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
				const radius = this.spinRadius * this.spinDirection * sineInOut(outAndBack);
				const angle = TAU * this.spinDirection * sineInOut(progress);
				line.target.x += Math.cos(angle) * radius;
				line.target.y += Math.sin(angle) * radius;
			}
			solveFreeTrailChain(line.points, line.target);
		}
	}

	_updateDepth(line, dt) {
		if (line.depthElapsed < 0) {
			line.depthWait -= dt;
			if (line.depthWait > 0) return;
			line.depthFrom = line.depth;
			line.depthTo = (20 + this.random() * 30) * (this.random() > 0.5 ? 1 : -1);
			line.depthElapsed = 0;
		}
		line.depthElapsed = Math.min(3, line.depthElapsed + dt);
		line.depth = line.depthFrom + (line.depthTo - line.depthFrom) * powerInOut(line.depthElapsed / 3);
		if (line.depthElapsed >= 3) {
			line.depthElapsed = -1;
			line.depthWait = 1 + this.random() * 2;
		}
	}

	_writeData() {
		for (let lineIndex = 0; lineIndex < this.lines.length; lineIndex += 1) {
			const points = this.lines[lineIndex].points;
			for (let index = 0; index < points.length; index += 1) {
				const offset = (lineIndex * REFERENCE_POINT_COUNT + index) * 4;
				const point = points[index];
				this.currentData[offset] = point.x * SCALE + 0.72;
				this.currentData[offset + 1] = point.y * SCALE + 0.25;
				this.currentData[offset + 2] = point.z * SCALE + 6.2;
				this.currentData[offset + 3] = 1;
			}
		}
	}
}
