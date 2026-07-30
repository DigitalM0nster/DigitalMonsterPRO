/**
 * One native requestAnimationFrame queue for the long-running site loops.
 * Subscribers still decide whether their own layer needs work on that frame.
 */
let nativeFrameId = 0;
let nextCallbackId = 1;
const callbacks = new Map();

function reportCallbackError(error) {
	queueMicrotask(() => {
		throw error;
	});
}

function flushFrame(now) {
	nativeFrameId = 0;
	const batch = [...callbacks.entries()];
	callbacks.clear();

	for (const [, callback] of batch) {
		try {
			callback(now);
		} catch (error) {
			reportCallbackError(error);
		}
	}

	ensureNativeFrame();
}

function ensureNativeFrame() {
	if (nativeFrameId || callbacks.size === 0 || typeof window === "undefined") {
		return;
	}
	nativeFrameId = window.requestAnimationFrame(flushFrame);
}

export function requestSharedAnimationFrame(callback) {
	if (typeof callback !== "function") {
		return 0;
	}
	const id = nextCallbackId;
	nextCallbackId += 1;
	callbacks.set(id, callback);
	ensureNativeFrame();
	return id;
}

export function cancelSharedAnimationFrame(id) {
	if (!id) {
		return;
	}
	callbacks.delete(id);
	if (callbacks.size === 0 && nativeFrameId && typeof window !== "undefined") {
		window.cancelAnimationFrame(nativeFrameId);
		nativeFrameId = 0;
	}
}
