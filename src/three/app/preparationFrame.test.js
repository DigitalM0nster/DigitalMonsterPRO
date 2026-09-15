import test from "node:test";
import assert from "node:assert/strict";
import { isMobilePreparationDevice, yieldToPreparationFrame } from "./preparationFrame.js";

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

test("hidden desktop preparation posts a task instead of waiting for rAF or a throttled timer", async () => {
	const documentRef = createDocument("hidden");
	let requestedFrames = 0, postedTasks = 0;
	const promise = yieldToPreparationFrame({
		documentRef,
		mobile: false,
		requestFrame: () => { requestedFrames++; return 1; },
		postTask: (callback) => { postedTasks++; queueMicrotask(callback); return { id: 1 }; },
		cancelTask: () => {},
		now: () => 17,
	});
	assert.equal(await promise, 17);
	assert.equal(requestedFrames, 0);
	assert.equal(postedTasks, 1);
});

test("hidden mobile preparation remains paused on the browser animation frame", async () => {
	const documentRef = createDocument("hidden");
	let frameCallback, postedTasks = 0;
	const promise = yieldToPreparationFrame({
		documentRef,
		mobile: true,
		requestFrame: (callback) => { frameCallback = callback; return 3; },
		cancelFrame: () => {},
		postTask: () => { postedTasks++; return { id: 1 }; },
		cancelTask: () => {},
	});
	assert.equal(postedTasks, 0);
	frameCallback(21);
	assert.equal(await promise, 21);
});

test("a desktop tab hidden during an awaited paint switches to a posted task", async () => {
	const documentRef = createDocument("visible");
	let cancelled = 0, taskCallback;
	const promise = yieldToPreparationFrame({
		documentRef,
		mobile: false,
		requestFrame: () => 9,
		cancelFrame: (id) => { cancelled = id; },
		postTask: (callback) => { taskCallback = callback; return { id: 4 }; },
		cancelTask: () => {},
		now: () => 29,
	});
	documentRef.visibilityState = "hidden";
	documentRef.dispatchVisibility();
	assert.equal(cancelled, 9);
	taskCallback();
	assert.equal(await promise, 29);
});
