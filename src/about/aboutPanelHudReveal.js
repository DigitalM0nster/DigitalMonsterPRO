/**
 * About HUD reveal helpers (legacy enter/exit timers).
 *
 * Binding: ABOUT_PANEL_HUD.md — stage content = story mixProgress only;
 * route leave = hex cut, not mosaic exit. Do not call playAboutPanelHudEnter
 * or playAboutPanelHudExit from site transition / story sync.
 */
import {
	clearAboutPanelHudContent,
	getAboutPanelHudEnterProgress,
	getAboutPanelHudState,
	setAboutPanelHudEnterProgress,
	setAboutPanelHudEnterTravelSign,
	setAboutPanelHudState,
} from "@/about/aboutPanelHudBridge.js";
import {
	getCaseChromeMosaicEnterMs,
	getCaseChromeMosaicExitMs,
} from "@/portfolio/ui/CaseStudyCanvas/caseChromeMosaicConfig.js";

/** @type {'idle' | 'entering' | 'exiting'} */
let phase = "idle";
let rafId = 0;
let delayId = 0;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function cancelRevealTimers() {
	if (rafId) {
		cancelAnimationFrame(rafId);
		rafId = 0;
	}
	if (delayId) {
		window.clearTimeout(delayId);
		delayId = 0;
	}
}

function densifyMosaicForReveal() {
	const hud = getAboutPanelHudState();
	if (!hud.mosaic) {
		return null;
	}
	const baseColumns = Math.max(1, Math.round(hud.mosaic.columns ?? 28));
	const baseRows = Math.max(1, Math.round(hud.mosaic.rows ?? 24));
	const alreadyDense = baseColumns >= 50 || baseRows >= 40;
	const contentRect = hud.mosaic.contentRectUv ?? hud.mosaic.rectUv;
	const rest = alreadyDense ? null : { columns: baseColumns, rows: baseRows };
	setAboutPanelHudState({
		mosaic: {
			...hud.mosaic,
			columns: alreadyDense ? baseColumns : baseColumns * 3,
			rows: alreadyDense ? baseRows : baseRows * 2,
			rectUv: contentRect,
			contentRectUv: contentRect,
			chromeFollowEnter: false,
		},
	});
	return rest;
}

export function getAboutPanelHudRevealPhase() {
	return phase;
}

export function isAboutPanelHudRevealBusy() {
	return phase === "entering" || phase === "exiting";
}

export function isAboutPanelHudRevealExiting() {
	return phase === "exiting";
}

export function cancelAboutPanelHudReveal() {
	if (phase === "idle" && !rafId && !delayId) {
		return;
	}
	cancelRevealTimers();
	phase = "idle";
	setAboutPanelHudEnterTravelSign(1);
	setAboutPanelHudEnterProgress(0);
}

export function releaseAboutPanelHud() {
	cancelRevealTimers();
	phase = "idle";
	setAboutPanelHudEnterTravelSign(1);
	setAboutPanelHudEnterProgress(0);
	clearAboutPanelHudContent({ keepEnterProgress: true });
}

/**
 * @param {{ delayMs?: number, onComplete?: () => void }} [options]
 */
export function playAboutPanelHudEnter(options = {}) {
	const delayMs = Math.max(0, options.delayMs ?? 0);
	const onComplete = options.onComplete;
	cancelRevealTimers();
	phase = "entering";
	setAboutPanelHudEnterTravelSign(1);

	const mosaicRest = densifyMosaicForReveal();
	setAboutPanelHudEnterProgress(0);

	const finishEnter = () => {
		if (phase !== "entering") {
			return;
		}
		phase = "idle";
		if (mosaicRest) {
			const live = getAboutPanelHudState();
			if (live.mosaic) {
				setAboutPanelHudState({
					mosaic: {
						...live.mosaic,
						columns: mosaicRest.columns,
						rows: mosaicRest.rows,
						chromeFollowEnter: false,
					},
				});
			}
		}
		setAboutPanelHudEnterProgress(null);
		onComplete?.();
	};

	const startAnim = () => {
		delayId = 0;
		if (phase !== "entering") {
			return;
		}
		const startedAt = performance.now();
		const tick = (now) => {
			if (phase !== "entering") {
				return;
			}
			const progress = clamp01((now - startedAt) / getCaseChromeMosaicEnterMs());
			setAboutPanelHudEnterProgress(progress);
			if (progress < 1) {
				rafId = requestAnimationFrame(tick);
				return;
			}
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				finishEnter();
			});
		};
		rafId = requestAnimationFrame(tick);
	};

	if (delayMs > 0) {
		delayId = window.setTimeout(startAnim, delayMs);
	} else {
		startAnim();
	}
}

/**
 * @param {{ onComplete?: () => void, release?: boolean, force?: boolean }} [options]
 */
export function playAboutPanelHudExit(options = {}) {
	const onComplete = options.onComplete;
	const shouldRelease = options.release !== false;
	const force = options.force === true;

	if (phase === "exiting" && !force) {
		return;
	}

	cancelRevealTimers();

	const state = getAboutPanelHudState();
	if (!state.fromCanvas?.width && shouldRelease) {
		releaseAboutPanelHud();
		onComplete?.();
		return;
	}

	phase = "exiting";
	densifyMosaicForReveal();

	const current = getAboutPanelHudEnterProgress();
	const startProgress = current == null ? 1 : clamp01(current);
	if (startProgress <= 0.001) {
		phase = "idle";
		if (shouldRelease) {
			releaseAboutPanelHud();
		} else {
			setAboutPanelHudEnterProgress(0);
		}
		onComplete?.();
		return;
	}

	setAboutPanelHudEnterTravelSign(-1);
	setAboutPanelHudEnterProgress(startProgress);

	const startedAt = performance.now();
	const duration = Math.max(80, getCaseChromeMosaicExitMs() * startProgress);

	const tick = (now) => {
		if (phase !== "exiting") {
			return;
		}
		const linear = clamp01((now - startedAt) / duration);
		const progress = startProgress * (1 - linear);
		setAboutPanelHudEnterProgress(progress);
		if (progress > 0.001) {
			rafId = requestAnimationFrame(tick);
			return;
		}
		rafId = 0;
		phase = "idle";
		if (shouldRelease) {
			releaseAboutPanelHud();
		} else {
			setAboutPanelHudEnterProgress(0);
		}
		onComplete?.();
	};
	rafId = requestAnimationFrame(tick);
}
