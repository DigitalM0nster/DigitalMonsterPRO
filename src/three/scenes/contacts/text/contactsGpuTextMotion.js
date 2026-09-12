/** One owner-driven clock. Letter state stays on the GPU; no timers or letter fades. */
export class ContactsGpuTextMotion {
	constructor(uniforms, slots, resolveTiming, now = () => performance.now()) {
		this.uniforms = uniforms;
		this.slots = slots;
		this.resolveTiming = resolveTiming;
		this.now = now;
		this.active = false;
		this.waiters = [];
		this.setVisible(true);
	}

	_finishWaiters(completed) {
		for (const resolve of this.waiters.splice(0)) resolve(completed);
	}

	setVisible(visible) {
		this.active = false;
		this.uniforms.uMode.value = visible ? 0 : -1;
		// Compatibility with the existing column's readiness checks: endpoint metadata
		// changes only on start/finish, never once per letter per animation frame.
		for (const slot of this.slots) if (!slot.isSpace) {
			slot.appearPending = !visible;
			slot.mainAlpha = visible ? 1 : 0;
		}
		this._finishWaiters(false);
	}

	run(mode, options = {}) {
		// Repeated pointer hits share the current wave instead of stacking animations.
		if (mode === "hover" && (this.active || this.uniforms.uMode.value < 0)) return 0;
		this._finishWaiters(false);
		const timing = this.resolveTiming(options);
		this.uniforms.uTiming.value.set(timing.letters, timing.symbols, timing.fade, timing.scale);
		this.uniforms.uMode.value = mode === "appear" ? 1 : mode === "disappear" ? 2 : 3;
		this.uniforms.uTime.value = 0;
		this.startedAt = this.now();
		this.duration = timing.finish + (mode === "appear" ? Math.round(timing.fade * timing.scale) : 0);
		this.mode = mode;
		this.active = true;
		return timing.duration;
	}

	update(now) {
		if (!this.active) return;
		const elapsed = Math.max(0, now - this.startedAt);
		if (elapsed < this.duration) { this.uniforms.uTime.value = elapsed; return; }
		const waiters = this.waiters.splice(0);
		this.setVisible(this.mode !== "disappear");
		for (const resolve of waiters) resolve(true);
	}

	whenIdle() { return this.active ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve(true); }
}
