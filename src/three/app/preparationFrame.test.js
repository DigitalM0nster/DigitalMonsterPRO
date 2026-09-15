import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_PREPARATION_DELAY_MS, isMobilePreparationDevice, yieldToPreparationFrame } from "./preparationFrame.js";

function createDocument(visibilityState) {
	const listeners = new Set();
	return {
		visibilityState,
		addEventListener: (_, listener) => listeners.add(listener),
		removeEventListener: (_, listener) => listeners.delete(listener),
		dispatchVisibility: () => { for (const listener of listeners) listener(); },
	};
}

test("mobile preparation detection does not mistake a narrow desktop window for a phone", () => {
	assert.equal(isMobilePreparationDevice({ navigatorRef: { userAgentData: { mobile: false } } }), false);
	assert.equal(isMobilePreparationDevice({ navigatorRef: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }), false);
	assert.equal(isMobilePreparationDevice({ navigatorRef: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile" } }), true);
	assert.equal(isMobilePreparationDevice({ navigatorRef: { platform: "MacIntel", maxTouchPoints: 5 } }), true);
});

test("hidden desktop preparation uses a restrained timer instead of waiting for rAF", async () => {
	const documentRef = createDocument("hidden");
	let requestedFrames = 0, delay = -1;
	const promise = yieldToPreparationFrame({
		documentRef,
		mobile: false,
		requestFrame: () => { requestedFrames++; return 1; },
		setTimer: (callback, milliseconds) => { delay = milliseconds; queueMicrotask(callback); return 1; },
		clearTimer: () => {},
		now: () => 17,
	});
	assert.equal(await promise, 17);
	assert.equal(requestedFrames, 0);
	assert.equal(delay, BACKGROUND_PREPARATION_DELAY_MS);
});

test("hidden mobile preparation remains paused on the browser animation frame", async () => {
	const documentRef = createDocument("hidden");
	let frameCallback, timers = 0;
	const promise = yieldToPreparationFrame({
		documentRef,
		mobile: true,
		requestFrame: (callback) => { frameCallback = callback; return 3; },
		cancelFrame: () => {},
		setTimer: () => { timers++; return 1; },
		clearTimer: () => {},
	});
	assert.equal(timers, 0);
	frameCallback(21);
	assert.equal(await promise, 21);
});

test("a desktop tab hidden during an awaited paint switches to the background timer", async () => {
	const documentRef = createDocument("visible");
	let cancelled = 0, timerCallback;
	const promise = yieldToPreparationFrame({
		documentRef,
		mobile: false,
		requestFrame: () => 9,
		cancelFrame: (id) => { cancelled = id; },
		setTimer: (callback) => { timerCallback = callback; return 4; },
		clearTimer: () => {},
		now: () => 29,
	});
	documentRef.visibilityState = "hidden";
	documentRef.dispatchVisibility();
	assert.equal(cancelled, 9);
	timerCallback();
	assert.equal(await promise, 29);
});
