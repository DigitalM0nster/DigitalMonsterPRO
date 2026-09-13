// These ring pages have no page-local touch progress owner. Film, About and cases
// keep their existing handlers, including their internal story/seek gestures.
export function usesSharedCarouselTouch(sceneId) {
	return sceneId === "home" || sceneId === "contacts" || [
		"capabilities:mmk1", "capabilities:lightTrails", "capabilities:syntheticCore", "capabilities:spatialMatrix",
	].includes(sceneId);
}

const TOUCH_CONTROLS = "[data-about-reading-panel], button, input, textarea, select, [contenteditable='true'], [role='button']";

/** Native channel links allow site swipes, but retain their ordinary tap action. */
export function isCarouselTouchControlTarget(target) {
	if (target?.closest?.(TOUCH_CONTROLS)) return true;
	const link = target?.closest?.("a[href]");
	const channelList = link?.closest?.("[data-contacts-channel-list]");
	const blocker = target?.closest?.("[data-canvas-pointer-blocker]");
	if (channelList && (!blocker || blocker === channelList)
		&& !channelList.parentElement?.closest?.("[data-canvas-pointer-blocker]")) return false;
	return Boolean(blocker || target?.closest?.("a"));
}

const INTENT_PX = 8;
const TOUCH_TO_WHEEL = 3; // Same finger distance as the film's existing site swipe.
let activeController = null;
export const isCarouselTouchSceneBlocked = () => activeController?.blocksScene() ?? false;
export const isCarouselTouchOrbitBlocked = () => activeController?.blocksOrbit() ?? false;
export const isCarouselTouchTargetHeld = sceneId => activeController?.holdsTarget(sceneId) ?? false;

/** Input adapter only: the existing carousel owns the target, spring and commits. */
export function attachCarouselTouch({ target, getStartOwner, canContinue, addDelta, isBlockedTarget, now = () => performance.now() }) {
	let gesture = null;
	let blockUntil = 0;
	let suppressClickUntil = 0;
	let releaseX = 0, releaseY = 0;
	const controller = {
		blocksScene: () => gesture?.axis === "vertical" || now() < blockUntil,
		blocksOrbit: () => Boolean(gesture && gesture.axis !== "horizontal" && gesture.axis !== "orbit"
			&& (gesture.axis !== null || now() - gesture.startedAt < 220)) || now() < blockUntil,
		holdsTarget: sceneId => {
			if (!gesture || gesture.axis !== "vertical" || gesture.stopped) return false;
			// Validate on every spring tick, even when the held finger is motionless.
			if (gesture.owner !== sceneId || !canContinue(gesture.owner)) { gesture.stopped = true; return false; }
			return true;
		},
	};
	activeController = controller;

	const finish = () => {
		if (gesture?.consumed) {
			blockUntil = now() + 80; // Includes a swipe and release between two Three frames.
			suppressClickUntil = now() + 650;
			releaseX = gesture.x; releaseY = gesture.y;
		}
		gesture = null;
	};
	const onStart = event => {
		if (event.touches.length !== 1) { finish(); return; }
		finish();
		// A fresh deliberate contact must not inherit a previous swipe's click guard.
		blockUntil = suppressClickUntil = 0;
		if (isBlockedTarget(event.target)) return;
		const touch = event.touches[0];
		const owner = getStartOwner(touch, event);
		if (!usesSharedCarouselTouch(owner)) return;
		gesture = { id: touch.identifier, owner, startX: touch.clientX, startY: touch.clientY,
			x: touch.clientX, y: touch.clientY, axis: null, consumed: false, stopped: false, startedAt: now() };
	};
	const onMove = event => {
		if (!gesture) return;
		if (event.touches.length !== 1) { finish(); return; }
		const touch = event.touches[0];
		if (touch.identifier !== gesture.id) { finish(); return; }
		const previousY = gesture.y;
		gesture.x = touch.clientX; gesture.y = touch.clientY;
		if (!canContinue(gesture.owner)) gesture.stopped = true;
		if (gesture.stopped) {
			// A captured swipe never transfers to About/film or a new scene mid-contact.
			if (gesture.consumed && event.cancelable) event.preventDefault();
			return;
		}
		const dx = touch.clientX - gesture.startX, dy = touch.clientY - gesture.startY;
		if (!gesture.axis) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_PX) return;
			gesture.consumed = true;
			if (now() - gesture.startedAt >= 220) gesture.axis = "orbit";
			else if (Math.abs(dy) >= Math.abs(dx) * 1.15) gesture.axis = "vertical";
			else if (Math.abs(dx) >= Math.abs(dy) * 1.15) gesture.axis = "horizontal";
			else if (Math.hypot(dx, dy) >= 24) gesture.axis = Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
			if (!event.cancelable) { finish(); return; }
			event.preventDefault();
			if (gesture.axis === "vertical") addDelta(-dy * TOUCH_TO_WHEEL);
			return;
		}
		if (!event.cancelable) { finish(); return; }
		event.preventDefault(); // Keep the browser from cancelling the owned pointer stream.
		if (gesture.axis === "vertical") addDelta((previousY - touch.clientY) * TOUCH_TO_WHEEL);
	};
	const onEnd = event => {
		if (gesture && !Array.from(event.touches).some(touch => touch.identifier === gesture.id)) finish();
	};
	const onPointerEnd = event => {
		// Window-level link handlers must honor defaultPrevented, while the renderer
		// still receives pointerup and clears pointerDown normally.
		if (event.pointerType === "touch" && (gesture?.consumed || now() < blockUntil) && event.cancelable) event.preventDefault();
	};
	const onPointerCancel = event => { if (event.pointerType === "touch") finish(); };
	const onClick = event => {
		if (event.detail === 0 || (event.pointerType === "mouse" && !event.sourceCapabilities?.firesTouchEvents) || now() >= suppressClickUntil
			|| isBlockedTarget(event.target) || Math.hypot(event.clientX - releaseX, event.clientY - releaseY) > 48) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		suppressClickUntil = 0;
	};
	const onBlur = () => finish();
	target.addEventListener("touchstart", onStart, { capture: true, passive: true });
	target.addEventListener("touchmove", onMove, { capture: true, passive: false });
	target.addEventListener("touchend", onEnd, { capture: true, passive: true });
	target.addEventListener("touchcancel", onBlur, { capture: true, passive: true });
	target.addEventListener("pointerup", onPointerEnd, { capture: true, passive: false });
	target.addEventListener("pointercancel", onPointerCancel, { capture: true, passive: true });
	target.addEventListener("click", onClick, { capture: true });
	target.addEventListener("blur", onBlur);
	return () => {
		for (const [name, listener] of [["touchstart", onStart], ["touchmove", onMove], ["touchend", onEnd],
			["touchcancel", onBlur], ["pointerup", onPointerEnd], ["pointercancel", onPointerCancel], ["click", onClick]]) target.removeEventListener(name, listener, true);
		target.removeEventListener("blur", onBlur);
		gesture = null; blockUntil = suppressClickUntil = 0;
		if (activeController === controller) activeController = null;
	};
}
