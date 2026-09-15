import { cancelSharedAnimationFrame, requestSharedAnimationFrame } from "../../functions/sharedAnimationFrame.js";

export const BACKGROUND_PREPARATION_DELAY_MS = 32;

/** Device identity, independent of a narrow desktop browser window. */
export function isMobilePreparationDevice({
	navigatorRef = globalThis.navigator,
} = {}) {
	if (typeof navigatorRef?.userAgentData?.mobile === "boolean") {
		return navigatorRef.userAgentData.mobile;
	}
	if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigatorRef?.userAgent ?? "")) {
		return true;
	}
	return navigatorRef?.platform === "MacIntel" && navigatorRef?.maxTouchPoints > 1;
}

/**
 * Active tabs yield to a real paint. Hidden phones keep the browser-managed rAF
 * pause, while hidden desktops keep preparation moving at a restrained cadence.
 */
export function yieldToPreparationFrame({
	documentRef = globalThis.document,
	mobile = isMobilePreparationDevice(),
	requestFrame = requestSharedAnimationFrame,
	cancelFrame = cancelSharedAnimationFrame,
	setTimer = globalThis.setTimeout,
	clearTimer = globalThis.clearTimeout,
	now = () => performance.now(),
	backgroundDelayMs = BACKGROUND_PREPARATION_DELAY_MS,
} = {}) {
	return new Promise((resolve) => {
		let frameId = 0;
		let timerId = 0;
		let settled = false;

		const cleanup = () => {
			if (frameId) cancelFrame(frameId);
			if (timerId) clearTimer(timerId);
			documentRef?.removeEventListener?.("visibilitychange", onVisibilityChange);
			frameId = 0;
			timerId = 0;
		};
		const finish = (timestamp = now()) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(timestamp);
		};
		const scheduleBackgroundFrame = () => {
			if (timerId) return;
			timerId = setTimer(() => finish(now()), backgroundDelayMs);
		};
		const isHiddenDesktop = () => documentRef?.visibilityState === "hidden" && !mobile;
		const animationFramesAvailable = requestFrame !== requestSharedAnimationFrame || typeof window !== "undefined";
		function onVisibilityChange() {
			if (!isHiddenDesktop()) return;
			if (frameId) {
				cancelFrame(frameId);
				frameId = 0;
			}
			scheduleBackgroundFrame();
		}

		if (!animationFramesAvailable || isHiddenDesktop()) {
			scheduleBackgroundFrame();
			return;
		}

		documentRef?.addEventListener?.("visibilitychange", onVisibilityChange);
		frameId = requestFrame(finish);
	});
}
