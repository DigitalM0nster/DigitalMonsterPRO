/**
 * Case HUD enter/exit reveal (GPU enterProgress) + logo_reveal scroll sound.
 * Keeps from/to canvases idle-safe; only drives the enterProgress uniform.
 */
import {
	clearCasePanelHudCanvas,
	clearCasePanelHudContent,
	getCasePanelHudEnterProgress,
	getCasePanelHudState,
	setCasePanelHudEnterProgress,
	setCasePanelHudEnterTravelSign,
	setCasePanelHudState,
} from "./casePanelHudBridge.js";
import { stopCaseStudyAnimationFrame } from "./caseStudyAnimationFrame.js";
import {
	preloadCaseStudyTextTransitionSound,
	resetCaseStudyTextTransitionSound,
	suppressCaseStudyTextTransitionSound,
	updateCaseStudyTextTransitionSound,
} from "@/sounds/caseStudyTextTransitionSound.js";
import {
	getCaseChromeMosaicEnterMs,
	getCaseChromeMosaicExitMs,
} from "@/portfolio/ui/CaseStudyCanvas/caseChromeMosaicConfig.js";
import { store } from "@/store.jsx";

/** @deprecated Prefer getCaseChromeMosaicEnterMs() — kept for click-mosaic pace. */
export const CASE_PANEL_HUD_REVEAL_MS = 720;
/** @deprecated Prefer getCaseChromeMosaicExitMs() */
export const CASE_PANEL_HUD_EXIT_MS = 220;

/** @type {'idle' | 'entering' | 'exiting'} */
let phase = "idle";
/** @type {'full' | 'band'} full = left+nav; band = left text only (project nav stays). */
let mosaicScope = "full";
let rafId = 0;
let delayId = 0;
let lastFrameTs = 0;

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

export function getCasePanelHudRevealPhase() {
	return phase;
}

/** @returns {'full' | 'band'} */
export function getCasePanelHudRevealMosaicScope() {
	return mosaicScope;
}

export function isCasePanelHudRevealBusy() {
	return phase === "entering" || phase === "exiting";
}

export function isCasePanelHudRevealExiting() {
	return phase === "exiting";
}

/** Cancel in-flight enter (Strict Mode / effect remount). Leaves HUD hidden at 0. */
export function cancelCasePanelHudEnter() {
	if (phase !== "entering") {
		return;
	}
	cancelRevealTimers();
	phase = "idle";
	mosaicScope = "full";
	setCasePanelHudEnterTravelSign(1);
	setCasePanelHudEnterProgress(0);
}

/** Cancel any in-flight enter/exit (DEV preview / remount). */
export function cancelCasePanelHudReveal() {
	if (phase === "idle" && !rafId && !delayId) {
		return;
	}
	cancelRevealTimers();
	phase = "idle";
	mosaicScope = "full";
	setCasePanelHudEnterTravelSign(1);
	// Keep 0 (hidden) — null would idle-paint chrome without mosaic (flash).
	setCasePanelHudEnterProgress(0);
}

/** Drop HUD + case work after exit (or immediate leave).
 * @param {{ keepChrome?: boolean }} [options] keepChrome: case→case — leave shared nav canvas.
 */
export function releaseCasePanelHud(options = {}) {
	cancelRevealTimers();
	phase = "idle";
	mosaicScope = "full";
	setCasePanelHudEnterTravelSign(1);
	// Stay at 0 (hidden). null = idle-visible and would flash full chrome on the DOM overlay.
	setCasePanelHudEnterProgress(0);
	if (options.keepChrome) {
		clearCasePanelHudContent({ keepEnterProgress: true });
	} else {
		clearCasePanelHudCanvas({ keepEnterProgress: true });
	}
	store.openedCase = false;
	stopCaseStudyAnimationFrame();
	resetCaseStudyTextTransitionSound();
}

/**
 * Mosaic roll-up 0→1 with scroll text-transition sound.
 * @param {{ delayMs?: number, onComplete?: () => void, mosaicScope?: 'full' | 'band' }} [options]
 */
export function playCasePanelHudEnter(options = {}) {
	const delayMs = Math.max(0, options.delayMs ?? 0);
	const onComplete = options.onComplete;
	mosaicScope = options.mosaicScope === "band" ? "band" : "full";
	cancelRevealTimers();
	phase = "entering";
	setCasePanelHudEnterTravelSign(1);

	const hud = getCasePanelHudState();
	if (hud.mosaic) {
		const baseColumns = Math.max(1, Math.round(hud.mosaic.columns ?? 28));
		const baseRows = Math.max(1, Math.round(hud.mosaic.rows ?? 24));
		const alreadyDense = baseColumns >= 50 || baseRows >= 40;
		const contentRect = hud.mosaic.contentRectUv ?? hud.mosaic.rectUv;
		setCasePanelHudState({
			mosaic: {
				...hud.mosaic,
				columns: alreadyDense ? baseColumns : baseColumns * 3,
				rows: alreadyDense ? baseRows : baseRows * 2,
				// Never expand content into project-nav UVs — nav is a separate screen layer.
				rectUv: contentRect,
				contentRectUv: contentRect,
				chromeFollowEnter: mosaicScope === "full",
			},
		});
	}

	setCasePanelHudEnterProgress(0);
	void preloadCaseStudyTextTransitionSound();

	const startAnim = () => {
		delayId = 0;
		if (phase !== "entering") {
			return;
		}
		lastFrameTs = performance.now();
		const startedAt = lastFrameTs;
		const tick = (now) => {
			if (phase !== "entering") {
				return;
			}
			const progress = clamp01((now - startedAt) / getCaseChromeMosaicEnterMs());
			const delta = Math.max(0, (now - lastFrameTs) / 1000);
			lastFrameTs = now;
			setCasePanelHudEnterProgress(progress);
			updateCaseStudyTextTransitionSound(delta, progress);
			if (progress < 1) {
				rafId = requestAnimationFrame(tick);
				return;
			}
			rafId = 0;
			phase = "idle";
			mosaicScope = "full";
			setCasePanelHudEnterProgress(null);
			onComplete?.();
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
 * Opposite of enter: mosaic tiles leave upward 1→0.
 * Leave-site (default): then release canvases.
 * Case→case band: keep canvases/nav; only clear enterProgress.
 * @param {{ onComplete?: () => void, mosaicScope?: 'full' | 'band', release?: boolean }} [options]
 */
export function playCasePanelHudExit(options = {}) {
	const onComplete = options.onComplete;
	const shouldRelease = options.release !== false;
	const force = options.force === true;

	// Already exiting (hexNavigation + React routePhase both call this) — don't restart.
	if (phase === "exiting" && !force) {
		return;
	}

	cancelRevealTimers();

	const state = getCasePanelHudState();
	if (!state.fromCanvas?.width && shouldRelease) {
		releaseCasePanelHud();
		onComplete?.();
		return;
	}

	mosaicScope = options.mosaicScope === "band" ? "band" : "full";
	phase = "exiting";
	// Exit scrub of logo_reveal sounds awful (high reverse rate) and fights hex SFX.
	suppressCaseStudyTextTransitionSound(getCaseChromeMosaicExitMs() + 200);

	// Painter skips paints while exiting — push rect/grid onto the bridge now.
	const hud = getCasePanelHudState();
	if (hud.mosaic) {
		const baseColumns = Math.max(1, Math.round(hud.mosaic.columns ?? 28));
		const baseRows = Math.max(1, Math.round(hud.mosaic.rows ?? 24));
		const alreadyDense = baseColumns >= 50 || baseRows >= 40;
		const contentRect = hud.mosaic.contentRectUv ?? hud.mosaic.rectUv;
		setCasePanelHudState({
			mosaic: {
				...hud.mosaic,
				columns: alreadyDense ? baseColumns : baseColumns * 3,
				rows: alreadyDense ? baseRows : baseRows * 2,
				rectUv: contentRect,
				contentRectUv: contentRect,
				chromeFollowEnter: mosaicScope === "full",
			},
		});
	}

	const current = getCasePanelHudEnterProgress();
	const startProgress = current == null ? 1 : clamp01(current);
	if (startProgress <= 0.001) {
		phase = "idle";
		if (shouldRelease) {
			releaseCasePanelHud();
		} else {
			finishExitHold(mosaicScope);
		}
		onComplete?.();
		return;
	}

	// Leave upward (not reverse of enter-from-below).
	setCasePanelHudEnterTravelSign(-1);
	setCasePanelHudEnterProgress(startProgress);
	store.openedCase = true;

	lastFrameTs = performance.now();
	const startedAt = lastFrameTs;
	const duration = Math.max(80, getCaseChromeMosaicExitMs() * startProgress);

	const tick = (now) => {
		if (phase !== "exiting") {
			return;
		}
		const linear = clamp01((now - startedAt) / duration);
		const progress = startProgress * (1 - linear);
		lastFrameTs = now;
		setCasePanelHudEnterProgress(progress);
		if (progress > 0.001) {
			rafId = requestAnimationFrame(tick);
			return;
		}
		rafId = 0;
		phase = "idle";
		if (shouldRelease) {
			releaseCasePanelHud();
		} else {
			finishExitHold(mosaicScope);
		}
		onComplete?.();
	};
	rafId = requestAnimationFrame(tick);
}

/**
 * After exit without release: stay at progress 0.
 * full → chrome stays mosaiced-empty (no idle snap).
 * band → chrome was live; keep band so nav stays painted.
 * @param {'full' | 'band'} scope
 */
function finishExitHold(scope) {
	setCasePanelHudEnterProgress(0);
	if (scope === "band") {
		const held = getCasePanelHudState();
		if (held.mosaic) {
			setCasePanelHudState({
				mosaic: {
					...held.mosaic,
					chromeFollowEnter: false,
				},
			});
		}
		mosaicScope = "band";
		return;
	}
	// full exit preview / interrupted leave — keep scope full so paintChromeLive
	// stays on mosaic path (progress 0 → blank), never snaps to non-mosaic chrome.
	mosaicScope = "full";
}
