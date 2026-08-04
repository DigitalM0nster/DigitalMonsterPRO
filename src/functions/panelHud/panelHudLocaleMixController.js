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
 *   prepareWipe: (desiredLocale: string, helpers: {
 *     isCancelled: () => boolean,
 *   }) => Promise<boolean | object>,
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
	let runGeneration = 0;
	/** @type {{
	 *   id: number,
	 *   animations: Set<{
	 *     rafId: number,
	 *     finish: () => void,
	 *   }>,
	 * } | null} */
	let activeRun = null;
	/** @type {number | null} */
	let wipeProgress = null;

	function isRunCurrent(run) {
		return Boolean(busy && activeRun === run && run.id === runGeneration);
	}

	function stopRunAnimations(run) {
		if (!run) {
			return;
		}
		for (const animation of [...run.animations]) {
			animation.finish();
		}
	}

	/**
	 * @param {NonNullable<typeof activeRun>} run
	 * @param {{
	 *   from: number,
	 *   to: number,
	 *   durationMs: number,
	 *   onTick: (value: number) => void,
	 * }} opts
	 */
	function animateValue(run, opts) {
		if (!isRunCurrent(run)) {
			return Promise.resolve();
		}

		const from = Number(opts.from) || 0;
		const to = Number(opts.to) || 0;
		const durationMs = Math.max(1, Number(opts.durationMs) || 1);
		const distance = Math.abs(to - from);
		if (distance <= 0.001) {
			if (isRunCurrent(run)) {
				opts.onTick(to);
			}
			return Promise.resolve();
		}

		const startedAt = performance.now();
		return new Promise((resolve) => {
			let settled = false;
			const animation = {
				rafId: 0,
				finish: () => {
					if (settled) {
						return;
					}
					settled = true;
					if (animation.rafId) {
						cancelAnimationFrame(animation.rafId);
						animation.rafId = 0;
					}
					run.animations.delete(animation);
					resolve();
				},
			};
			run.animations.add(animation);

			const tick = (now) => {
				animation.rafId = 0;
				if (!isRunCurrent(run)) {
					animation.finish();
					return;
				}
				const t = clamp01((now - startedAt) / durationMs);
				opts.onTick(from + (to - from) * t);
				if (!isRunCurrent(run) || settled) {
					animation.finish();
					return;
				}
				if (t < 1) {
					animation.rafId = requestAnimationFrame(tick);
					return;
				}
				opts.onTick(to);
				animation.finish();
			};
			animation.rafId = requestAnimationFrame(tick);
		});
	}

	function setBusy(next) {
		busy = next;
		if (!next) {
			wipeProgress = null;
			baseHooks.onWipePhaseChange?.(false);
		}
		baseHooks.onBusyChange?.(next);
	}

	return {
		isBusy: () => busy,
		/** @returns {number | null} wipe mix only — null during settle / idle */
		getWipeProgress: () => wipeProgress,
		cancel() {
			runGeneration += 1;
			const cancelledRun = activeRun;
			activeRun = null;
			stopRunAnimations(cancelledRun);
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
			const requestGeneration = ++runGeneration;

			if (!hooks.shouldAnimate()) {
				const ok = await hooks.onInstantSwap(desiredNow);
				if (requestGeneration !== runGeneration) {
					return false;
				}
				if (ok !== false) {
					hooks.setDisplayedLocale(desiredNow);
				}
				return ok !== false;
			}

			if (desiredNow === hooks.getDisplayedLocale()) {
				return true;
			}

			const run = {
				id: requestGeneration,
				animations: new Set(),
			};
			const isCancelled = () => !isRunCurrent(run);
			const animateRunValue = (opts) => animateValue(run, opts);
			activeRun = run;
			setBusy(true);

			try {
				while (!isCancelled()) {
					const desired = hooks.getDesiredLocale();
					if (desired === hooks.getDisplayedLocale()) {
						break;
					}

					await hooks.settle({ isCancelled, animateValue: animateRunValue });
					if (isCancelled()) {
						return false;
					}

					const wipeLocale = hooks.getDesiredLocale();
					if (wipeLocale === hooks.getDisplayedLocale()) {
						break;
					}

					const prepared = await hooks.prepareWipe(wipeLocale, { isCancelled });
					if (!prepared || isCancelled()) {
						return false;
					}

					const skipWipe = typeof prepared === "object" && prepared.skipWipe === true;
					if (!skipWipe) {
						wipeProgress = 0;
						hooks.onWipePhaseChange?.(true);
						if (isCancelled()) {
							return false;
						}
						hooks.onWipeTick(0);
						if (isCancelled()) {
							return false;
						}

						await animateRunValue({
							from: 0,
							to: 1,
							durationMs: Math.max(1, hooks.getDurationMs()),
							onTick: (t) => {
								wipeProgress = t;
								hooks.onWipeTick(t);
							},
						});

						if (isCancelled()) {
							return false;
						}
					}

					await hooks.onWipeDone(wipeLocale, prepared);
					if (isCancelled()) {
						return false;
					}
					wipeProgress = null;
					hooks.onWipePhaseChange?.(false);
					if (isCancelled()) {
						return false;
					}
					hooks.setDisplayedLocale(wipeLocale);
				}
				return !isCancelled();
			} finally {
				stopRunAnimations(run);
				if (activeRun === run && run.id === runGeneration) {
					activeRun = null;
					wipeProgress = null;
					hooks.onWipePhaseChange?.(false);
					setBusy(false);
				}
			}
		},
	};
}
