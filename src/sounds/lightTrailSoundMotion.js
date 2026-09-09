const POINTS = [41, 35, 29];
const WEIGHTS = [0.6, 0.3, 0.1];
const STRANDS = 7;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Energy of painted lateral movement; opposing strands cannot cancel each other. */
export class LightTrailSoundMotion {
	constructor() {
		this.previous = new Float32Array(STRANDS * POINTS.length * 2);
		this.reset();
	}

	reset() {
		this.initialized = false;
		this.amount = 0;
		this.pan = 0;
		this.speed = 0;
	}

	update(delta, data) {
		const validDelta = Number.isFinite(delta) && delta > 0 && delta <= 0.12;
		let energy = 0, headX = 0;
		for (let strand = 0; strand < STRANDS; strand++) {
			for (let sample = 0; sample < POINTS.length; sample++) {
				const offset = (strand * 42 + POINTS[sample]) * 4;
				const previous = (strand * POINTS.length + sample) * 2;
				const x = data[offset], y = data[offset + 1];
				const dx = x - this.previous[previous], dy = y - this.previous[previous + 1];
				energy += (dx * dx + dy * dy) * WEIGHTS[sample] / STRANDS;
				this.previous[previous] = x; this.previous[previous + 1] = y;
				if (sample === 0) headX += x / STRANDS;
			}
		}
		const speed = validDelta && this.initialized ? Math.sqrt(energy) / delta : 0;
		if (!validDelta || !this.initialized || !Number.isFinite(speed) || speed > 80) {
			this.amount = 0; this.speed = 0; this.initialized = validDelta;
			return;
		}
		this.speed = speed;
		// This is the gesture accent; the controller keeps a separate audible idle tone.
		const target = clamp((speed - 0.65) / 5.8, 0, 1);
		const response = target > this.amount ? 8 : 3.8;
		this.amount += (target - this.amount) * (1 - Math.exp(-delta * response));
		this.pan += (clamp(headX / 9, -0.7, 0.7) - this.pan) * (1 - Math.exp(-delta * 8));
	}
}
