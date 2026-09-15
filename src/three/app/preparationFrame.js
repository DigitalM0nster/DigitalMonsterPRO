import { cancelSharedAnimationFrame, requestSharedAnimationFrame } from "../../functions/sharedAnimationFrame.js";

export const BACKGROUND_PREPARATION_DELAY_MS = 32;

let backgroundChannel = null;
let nextBackgroundTaskId = 1;
const backgroundTasks = new Map();

function ensureBackgroundChannel() {
	if (backgroundChannel || typeof MessageChannel === "undefined") return backgroundChannel;
	backgroundChannel = new MessageChannel();
	backgroundChannel.port1.onmessage = ({ data: id }) => {
		const callback = backgroundTasks.get(id);
		if (!callback) return;
		backgroundTasks.delete(id);
		callback();
	};
	return backgroundChannel;
}

/** MessageChannel tasks avoid Chromium's one-second background timer clamp. */
export function postBackgroundPreparationTask(callback) {
	const channel = ensureBackgroundChannel();
	if (!channel) {
		const timerId = globalThis.setTimeout(callback, BACKGROUND_PREPARATION_DELAY_MS);
		return { type: "timer", id: timerId };
	}
	const id = nextBackgroundTaskId++;
	backgroundTasks.set(id, callback);
	channel.port2.postMessage(id);
	return { type: "message", id };
}

export function cancelBackgroundPreparationTask(task) {
	if (!task) return;
	if (task.type === "timer") globalThis.clearTimeout(task.id);
	else backgroundTasks.delete(task.id);
}

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
 * pause, while hidden desktops yield through MessageChannel without timer clamp.
 */
export function yieldToPreparationFrame({
	documentRef = globalThis.document,
	mobile = isMobilePreparationDevice(),
	requestFrame = requestSharedAnimationFrame,
	cancelFrame = cancelSharedAnimationFrame,
	postTask = postBackgroundPreparationTask,
	cancelTask = cancelBackgroundPreparationTask,
	now = () => performance.now(),
} = {}) {
	return new Promise((resolve) => {
		let frameId = 0;
		let backgroundTask = null;
		let settled = false;

		const cleanup = () => {
			if (frameId) cancelFrame(frameId);
			if (backgroundTask) cancelTask(backgroundTask);
			documentRef?.removeEventListener?.("visibilitychange", onVisibilityChange);
			frameId = 0;
			backgroundTask = null;
		};
		const finish = (timestamp = now()) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(timestamp);
		};
		const scheduleBackgroundFrame = () => {
			if (backgroundTask) return;
			backgroundTask = postTask(() => finish(now()));
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
