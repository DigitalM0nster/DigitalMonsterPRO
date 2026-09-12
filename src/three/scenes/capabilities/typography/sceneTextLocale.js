const localeIndex = locale => locale === "en" ? 1 : locale === "zh" ? 2 : 0;

/** A visible animation keeps ticking through a mix; idle/dormant text does not. */
export function canAdvanceSceneText({ started, current, transitioning }, animating = false) {
	return started && ((current && !transitioning) || (animating && (current || transitioning)));
}

/** Serializes locale changes over an existing, prepared text reveal.
 * One pending destination (the latest request), no timers, textures or callbacks.
 * The owner's natural clock pauses only during this hide/swap/show sequence.
 */
export class SceneTextLocale {
	constructor(appear = 1.15, disappear = 0.48) {
		this.appear = appear;
		this.disappear = disappear;
		this.locale = 0;
		this.reset();
	}

	get busy() { return this.phase !== 0; }

	reset() { this.phase = 0; this.reveal = 0; this.initialized = false; }

	update(delta, locale, naturalReveal, requested = true) {
		const desired = localeIndex(locale);
		if (!this.initialized) { this.locale = desired; this.initialized = true; }
		const step = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
		if (!this.busy) {
			this.reveal = naturalReveal;
			// Only replace an invisible atlas cell. A language click never interrupts
			// the owner's appearance/disappearance; re-check at its endpoint.
			if (naturalReveal <= 0) { this.locale = desired; return this.reveal; }
			if (naturalReveal < 1 || desired === this.locale || step === 0) return this.reveal;
			this.phase = -1;
		}
		if (this.phase < 0) {
			this.reveal = Math.max(0, this.reveal - step / this.disappear);
			if (this.reveal <= 1e-9) {
				this.reveal = 0;
				this.locale = desired;
				this.phase = requested ? 1 : 0;
			}
		} else {
			this.reveal = Math.min(1, this.reveal + step / this.appear);
			if (this.reveal >= 1 - 1e-9) {
				this.reveal = 1;
				this.phase = 0;
				// A request made during appearance is handled on the next update,
				// after this language has completed its animation.
			}
		}
		return this.reveal;
	}
}
