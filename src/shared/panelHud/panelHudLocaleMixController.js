/**
 * Shared left-panel HUD locale mosaic:
 * mid-stage settle → prepare wipe → mix 0→1 → chain if store locale changed.
 *
 * Page-specific paint / bridges stay in callers (About vs case canvas pools).
 */

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * @typedef {{
 *   getDesiredLocale: () => string,
 *   getDisplayedLocale: () => string,
 *   setDisplayedLocale: (locale: string) => void,
 *   shouldAnimate: () => boolean,
 *   getDurationMs: () => number,
 *   settle: (helpers: { isCancelled: () => boolean, animateValue: (opts: {
 *     from: number,
 *     to: number,
 *     durationMs: number,
 *     onTick: (value: number) => void,
 *   }) => Promise<void> }) => Promise<void>,
 *   prepareWipe: (desiredLocale: string) => Promise<boolean | object>,
 *   onWipeTick: (t: number) => void,
 *   onWipeDone: (desiredLocale: string, prepared: boolean | object) => (void | Promise<void>),
 *   onInstantSwap: (desiredLocale: string) => (boolean | Promise<boolean>),
 *   onBusyChange?: (busy: boolean) => void,
 *   onWipePhaseChange?: (active: boolean) => void,
 * }} PanelHudLocaleMixHooks
 */

/**
 * @param {PanelHudLocaleMixHooks} baseHooks
 */
export function createPanelHudLocaleMixController(baseHooks) {
	let busy = false;
	let cancelled = false;
	let rafId = 0;
	/** @type {number | null} */
	let wipeProgress = null;

	function stopRaf() {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
	}

	function isCancelled() {
		return cancelled || !busy;
	}

	/**
	 * @param {{
	 *   from: number,
	 *   to: number,
	 *   durationMs: number,
	 *   onTick: (value: number) => void,
	 * }} opts
	 */
	function animateValue(opts) {
		const from = Number(opts.from) || 0;
		const to = Number(opts.to) || 0;
		const durationMs = Math.max(1, Number(opts.durationMs) || 1);
		const distance = Math.abs(to - from);
		if (distance <= 0.001) {
			opts.onTick(to);
			return Promise.resolve();
		}

		const startedAt = performance.now();
		return new Promise((resolve) => {
			const tick = (now) => {
				if (isCancelled()) {
					resolve();
					return;
				}
				const t = clamp01((now - startedAt) / durationMs);
				opts.onTick(from + (to - from) * t);
				if (t < 1) {
					rafId = requestAnimationFrame(tick);
					return;
				}
				rafId = 0;
				opts.onTick(to);
				resolve();
			};
			rafId = requestAnimationFrame(tick);
		});
	}

	function setBusy(next) {
		busy = next;
		baseHooks.onBusyChange?.(next);
		if (!next) {
			wipeProgress = null;
			baseHooks.onWipePhaseChange?.(false);
		}
	}

	return {
		isBusy: () => busy,
		/** @returns {number | null} wipe mix only — null during settle / idle */
		getWipeProgress: () => wipeProgress,
		cancel() {
			cancelled = true;
			stopRaf();
			wipeProgress = null;
			baseHooks.onWipePhaseChange?.(false);
			setBusy(false);
		},
		/**
		 * @param {Partial<PanelHudLocaleMixHooks>} [callHooks]
		 * @returns {Promise<boolean>}
		 */
		async playTowardStore(callHooks = {}) {
			if (typeof document === "undefined") {
				return false;
			}
			if (busy) {
				return false;
			}

			const hooks = { ...baseHooks, ...callHooks };
			const desiredNow = hooks.getDesiredLocale();

			if (!hooks.shouldAnimate()) {
				const ok = await hooks.onInstantSwap(desiredNow);
				if (ok !== false) {
					hooks.setDisplayedLocale(desiredNow);
				}
				return ok !== false;
			}

			if (desiredNow === hooks.getDisplayedLocale()) {
				return true;
			}

			cancelled = false;
			stopRaf();
			setBusy(true);

			try {
				while (!cancelled) {
					const desired = hooks.getDesiredLocale();
					if (desired === hooks.getDisplayedLocale()) {
						break;
					}

					await hooks.settle({ isCancelled, animateValue });
					if (cancelled) {
						return false;
					}

					const wipeLocale = hooks.getDesiredLocale();
					if (wipeLocale === hooks.getDisplayedLocale()) {
						break;
					}

					const prepared = await hooks.prepareWipe(wipeLocale);
					if (!prepared || cancelled) {
						return false;
					}

					const skipWipe = typeof prepared === "object" && prepared.skipWipe === true;
					if (!skipWipe) {
						wipeProgress = 0;
						hooks.onWipePhaseChange?.(true);
						hooks.onWipeTick(0);

						await animateValue({
							from: 0,
							to: 1,
							durationMs: Math.max(1, hooks.getDurationMs()),
							onTick: (t) => {
								wipeProgress = t;
								hooks.onWipeTick(t);
							},
						});

						if (cancelled) {
							return false;
						}
					}

					await hooks.onWipeDone(wipeLocale, prepared);
					wipeProgress = null;
					hooks.onWipePhaseChange?.(false);
					hooks.setDisplayedLocale(wipeLocale);
				}
				return true;
			} finally {
				stopRaf();
				wipeProgress = null;
				hooks.onWipePhaseChange?.(false);
				setBusy(false);
			}
		},
	};
}
