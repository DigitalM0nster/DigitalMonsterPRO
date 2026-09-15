let activeInput = null;
const clamp = value => Math.max(-1, Math.min(1, value));
const angleDelta = (value, base) => ((value - base + 540) % 360) - 180;
const neutralPointer = Object.freeze({ x: 0, y: 0 });

/** Touch presses retain real coordinates; an idle finger is not a hover cursor. */
export function resolveVisualPointer(inputKind, pointerDown, viewportPointer) {
	return inputKind === "touch" && !pointerDown ? neutralPointer : viewportPointer;
}

/** Screen-relative tilt from the comfortable pose held when the sensor starts. */
export function tiltToPointer(beta, gamma, neutral, screenAngle = 0, result = { x: 0, y: 0 }) {
	const pitch = angleDelta(beta, neutral.beta), roll = angleDelta(gamma, neutral.gamma);
	const angle = screenAngle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
	const deadZone = value => Math.sign(value) * Math.max(0, Math.abs(value) - .4);
	result.x = clamp(deadZone(roll * cos + pitch * sin) / 22);
	result.y = clamp(deadZone(-pitch * cos + roll * sin) / 22);
	return result;
}

/** Must be called synchronously from the locale/Start button gesture on iOS. */
export function requestDeviceTiltPermission() { return activeInput?.request() ?? Promise.resolve(false); }

export class DeviceTiltInput {
	constructor(environment = window) {
		this.env = environment; this.pointer = { x: 0, y: 0 }; this.target = { x: 0, y: 0 };
		this.neutral = null; this.available = false; this.listening = false; this.disposed = false; this.pending = null;
		this.onOrientation = event => {
			if (this.env.document?.hidden || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
			this.neutral ??= { beta: event.beta, gamma: event.gamma };
			tiltToPointer(event.beta, event.gamma, this.neutral, this.env.screen?.orientation?.angle ?? this.env.orientation ?? 0, this.target);
			this.available = true;
		};
		this.onRotate = () => { this.neutral = null; this.target.x = this.target.y = 0; };
		this.onVisibility = () => { if (!this.env.document?.hidden) this.onRotate(); };
		activeInput = this;
	}
	request() {
		if (this.pending) return this.pending;
		const api = this.env.DeviceOrientationEvent;
		if (this.disposed || !api || this.env.isSecureContext === false || !(this.env.navigator?.maxTouchPoints > 0)) return Promise.resolve(false);
		// Invoke before creating an asynchronous continuation: iOS requires activation.
		let permission;
		try { permission = typeof api.requestPermission === "function" ? api.requestPermission() : "granted"; }
		catch { return Promise.resolve(false); }
		this.pending = Promise.resolve(permission).then(result => {
			if (result !== "granted" || this.disposed) return false;
			if (!this.listening) {
				this.env.addEventListener("deviceorientation", this.onOrientation, { passive: true });
				this.env.addEventListener("orientationchange", this.onRotate, { passive: true });
				this.env.screen?.orientation?.addEventListener?.("change", this.onRotate);
				this.env.document?.addEventListener("visibilitychange", this.onVisibility);
				this.listening = true;
			}
			return true;
		}).catch(() => false);
		return this.pending;
	}
	update(delta) {
		if (!this.available || this.disposed || this.env.document?.hidden) return;
		const ease = 1 - Math.exp(-7 * Math.min(.05, Math.max(0, delta)));
		this.pointer.x += (this.target.x - this.pointer.x) * ease;
		this.pointer.y += (this.target.y - this.pointer.y) * ease;
	}
	getCameraPointer(inputKind) {
		return inputKind === "touch" && this.available && !this.disposed ? this.pointer : null;
	}
	dispose() {
		this.disposed = true;
		this.env.removeEventListener("deviceorientation", this.onOrientation);
		this.env.removeEventListener("orientationchange", this.onRotate);
		this.env.screen?.orientation?.removeEventListener?.("change", this.onRotate);
		this.env.document?.removeEventListener("visibilitychange", this.onVisibility);
		if (activeInput === this) activeInput = null;
	}
}
