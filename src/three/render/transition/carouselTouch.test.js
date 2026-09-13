import test from "node:test";
import assert from "node:assert/strict";
import { attachCarouselTouch, isCarouselTouchOrbitBlocked, isCarouselTouchSceneBlocked, isCarouselTouchControlTarget } from "./carouselTouch.js";
import { applyLocalSegmentTargetRest, chaseSegmentValue, CAROUSEL_PROGRESS_SMOOTH, getAbsChaseSmoothMul } from "./segmentScrollSpring.js";

class InputSurface {
	listeners = new Map();
	addEventListener(name, fn, options) { this.listeners.set(name, { fn, options }); }
	removeEventListener(name, fn) { if (this.listeners.get(name)?.fn === fn) this.listeners.delete(name); }
	emit(name, values = {}) {
		const event = { target: {}, cancelable: true, detail: 1, clientX: 100, clientY: 300,
			preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values };
		this.listeners.get(name)?.fn(event);
		return event;
	}
}

function setup(sceneId = "capabilities:mmk1", isBlockedTarget = target => target.blocked === true) {
	const surface = new InputSurface(), deltas = [];
	const state = { sceneId, time: 0, allowed: true, target: 0, progress: 0 };
	const detach = attachCarouselTouch({ target: surface,
		getStartOwner: () => state.allowed ? state.sceneId : null,
		canContinue: owner => state.allowed && owner === state.sceneId,
		isBlockedTarget,
		addDelta: delta => { deltas.push(delta); state.target += delta * .001; }, now: () => state.time });
	const touch = (x = 100, y = 300, id = 5) => ({ identifier: id, clientX: x, clientY: y });
	const start = (x = 100, y = 300, extra = {}) => surface.emit("touchstart", { touches: [touch(x, y)], ...extra });
	const move = (x, y, extra = {}) => surface.emit("touchmove", { touches: [touch(x, y)], ...extra });
	const end = () => { const up = surface.emit("pointerup", { pointerType: "touch" }); surface.emit("touchend", { touches: [] }); return up; };
	const settle = () => { for (let i = 0; i < 600; i++) {
		state.target = applyLocalSegmentTargetRest(state.target, 1 / 60);
		state.progress = chaseSegmentValue(state.progress, state.target, 1 / 60, { smooth: CAROUSEL_PROGRESS_SMOOTH, chaseMul: getAbsChaseSmoothMul(Math.abs(state.progress)) });
	} };
	return { surface, state, deltas, start, move, end, detach, touch, settle };
}

test("all six shared ring scenes accept a vertical swipe and preserve canonical spring settling", () => {
	for (const id of ["home", "capabilities:mmk1", "capabilities:lightTrails", "capabilities:syntheticCore", "capabilities:spatialMatrix", "contacts"]) {
		const s = setup(id);
		try {
			s.start();
			assert.equal(isCarouselTouchOrbitBlocked(), true, "pending intent must not tilt the 3D scene");
			assert.equal(isCarouselTouchSceneBlocked(), false, "a tap remains a valid scene interaction");
			assert.equal(s.move(101, 100).defaultPrevented, true);
			assert.deepEqual(s.deltas, [600]);
			assert.equal(isCarouselTouchSceneBlocked(), true);
			s.end(); s.settle();
			assert.ok(s.state.progress > .999, `${id}: existing spring advances after a deliberate swipe`);
		} finally { s.detach(); }
	}
});

test("film, About and case pages never acquire a second touch owner", () => {
	for (const id of ["portfolioHub", "about", "case1", "case7", null]) {
		const s = setup(id);
		try {
			s.start(); const event = s.move(100, 80);
			assert.deepEqual(s.deltas, []); assert.equal(event.defaultPrevented, undefined);
			assert.equal(isCarouselTouchOrbitBlocked(), false);
		} finally { s.detach(); }
	}
});

test("holding before moving gives orbit both axes without starting a page swipe", () => {
	const s = setup();
	try {
		s.start(); s.state.time = 250;
		assert.equal(isCarouselTouchOrbitBlocked(), false);
		s.move(100, 120);
		assert.equal(isCarouselTouchOrbitBlocked(), false);
		assert.equal(isCarouselTouchSceneBlocked(), false);
		assert.deepEqual(s.deltas, []);
		s.end(); s.state.time += 100;
		assert.equal(isCarouselTouchOrbitBlocked(), false);
	} finally { s.detach(); }
});

test("a downward swipe drives the same canonical spring towards the previous scene", () => {
	const s = setup("capabilities:spatialMatrix");
	try {
		s.start(100, 100); s.move(100, 300); s.end();
		assert.deepEqual(s.deltas, [-600]);
		s.settle(); assert.ok(s.state.progress < -.999);
	} finally { s.detach(); }
});

test("queued touch events retain swipe versus hold intent despite main-thread delay", () => {
	for (const sceneId of ["home", "capabilities:mmk1", "contacts"]) {
		for (const held of [false, true]) {
			const s = setup(sceneId);
			try {
				s.state.time = 500;
				s.start(100, 300, { timeStamp: 100 });
				// A quick swipe delivered late; a real hold delivered in one queued batch.
				s.state.time = held ? 510 : 900;
				s.move(100, 100, { timeStamp: held ? 370 : 140 });
				assert.deepEqual(s.deltas, held ? [] : [600]);
				assert.equal(isCarouselTouchOrbitBlocked(), !held);
				assert.equal(isCarouselTouchSceneBlocked(), !held);
			} finally { s.detach(); }
		}
	}
});

test("tap, native controls and another hex band do not become navigation", () => {
	const s = setup();
	try {
		s.start(100, 300, { target: { blocked: true } }); s.move(100, 100);
		assert.equal(isCarouselTouchOrbitBlocked(), false); assert.deepEqual(s.deltas, []);
		s.state.allowed = false; s.start(); s.move(100, 100); assert.deepEqual(s.deltas, []);
		s.state.allowed = true; s.start(); s.move(102, 297); assert.equal(s.end().defaultPrevented, undefined);
		assert.equal(s.surface.emit("click", { pointerType: "touch" }).stopped, undefined);
		assert.deepEqual(s.deltas, []);
	} finally { s.detach(); }
});

test("horizontal intent belongs to scene orbit and cannot turn into page scroll mid-drag", () => {
	const s = setup("capabilities:syntheticCore");
	try {
		s.start(); assert.equal(s.move(130, 302).defaultPrevented, true);
		assert.equal(isCarouselTouchOrbitBlocked(), false); assert.equal(isCarouselTouchSceneBlocked(), false);
		s.move(134, 150); assert.deepEqual(s.deltas, []);
		s.move(101, 300);
		assert.equal(s.end().defaultPrevented, true, "even a drag returning to its origin must not open a link");
		assert.equal(s.surface.emit("click", { pointerType: "touch" }).stopped, true);
	} finally { s.detach(); }
});

test("reversing a partial swipe feeds opposite deltas and returns with the existing spring", () => {
	const s = setup();
	try {
		s.start(); s.move(100, 80); s.move(100, 220);
		assert.deepEqual(s.deltas, [660, -420]);
		const target = s.state.target;
		s.surface.emit("touchcancel", { touches: [] });
		assert.equal(s.state.target, target, "cancel releases input without teleporting the progress target");
		s.settle(); assert.ok(Math.abs(s.state.progress) < .001);
	} finally { s.detach(); }
});

test("route commit or click lock stops the captured swipe without transferring input to the next owner", () => {
	for (const next of ["about", "portfolioHub", "capabilities:lightTrails"]) {
		const s = setup();
		try {
			s.start(); s.move(100, 100); s.state.sceneId = next; s.move(100, 80);
			assert.deepEqual(s.deltas, [600]);
			assert.equal(isCarouselTouchSceneBlocked(), true, "the held finger must not click the new scene");
			s.end(); s.start(); s.move(100, 100);
			assert.equal(s.deltas.length, next.startsWith("capabilities:") ? 2 : 1);
		} finally { s.detach(); }
	}
});

test("multitouch, native gesture cancellation and disposal cannot leave a locked owner", () => {
	const s = setup();
	try {
		s.start(); s.surface.emit("touchstart", { touches: [s.touch(), s.touch(140, 300, 9)] });
		s.move(100, 100); assert.deepEqual(s.deltas, []); assert.equal(isCarouselTouchOrbitBlocked(), false);
		s.start(); s.move(100, 80, { cancelable: false }); assert.deepEqual(s.deltas, []);
		s.state.time += 100; assert.equal(isCarouselTouchOrbitBlocked(), false);
		s.start(); s.move(100, 100); s.surface.emit("blur"); s.state.time += 100;
		assert.equal(isCarouselTouchSceneBlocked(), false);
		assert.equal(s.surface.listeners.get("touchmove").options.passive, false);
	} finally { s.detach(); }
	assert.equal(s.surface.listeners.size, 0); assert.equal(isCarouselTouchSceneBlocked(), false);
});

test("swipe click suppression spares global controls, keyboard, mouse and a fresh touch", () => {
	const s = setup();
	try {
		s.start(); s.move(100, 100); s.end();
		assert.equal(s.surface.emit("pointerup", { pointerType: "touch" }).defaultPrevented, true, "release guard also covers touchend-before-pointerup ordering");
		assert.equal(s.surface.emit("click", { detail: 0, clientY: 100 }).stopped, undefined);
		assert.equal(s.surface.emit("click", { pointerType: "mouse", clientY: 100 }).stopped, undefined);
		assert.equal(s.surface.emit("click", { pointerType: "touch", target: { blocked: true }, clientY: 100 }).stopped, undefined);
		assert.equal(s.surface.emit("click", { pointerType: "touch", clientY: 100 }).stopped, true);
		s.start(); s.end(); assert.equal(s.surface.emit("click", { pointerType: "touch" }).stopped, undefined);
	} finally { s.detach(); }
});

// Minimal ancestor tree for the tag/attribute selectors used by the input guard.
function node(tag, attributes = {}, parentElement = null) {
	return { tag, attributes, parentElement, closest(selectors) {
		for (let candidate = this; candidate; candidate = candidate.parentElement) {
			if (selectors.split(",").some(selector => {
				const name = selector.trim().match(/^[a-z]+/)?.[0];
				if (name && candidate.tag !== name) return false;
				return [...selector.matchAll(/\[([\w-]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)]
					.every(([, attribute, value]) => attribute in candidate.attributes && (value === undefined || candidate.attributes[attribute] === value));
			})) return candidate;
		}
		return null;
	} };
}

test("contacts channel anchors allow a normal 240px page swipe and cancel the external link click", () => {
	const list = node("nav", { "data-contacts-channel-list": "", "data-canvas-pointer-blocker": "true" });
	const anchor = node("a", { href: "https://example.com/" }, list), label = node("span", {}, anchor);
	assert.equal(isCarouselTouchControlTarget(label), false);
	const s = setup("contacts", isCarouselTouchControlTarget);
	try {
		s.start(100, 420, { target: label });
		for (let step = 1; step <= 12; step++) {
			s.move(100, 420 - step * 20, { target: label });
			s.state.target = applyLocalSegmentTargetRest(s.state.target, .02);
		}
		assert.equal(s.end().defaultPrevented, true);
		assert.equal(s.surface.emit("click", { pointerType: "touch", clientY: 180, target: label }).stopped, true);
		s.settle(); assert.ok(s.state.progress > .999, "240px at a natural pace must clear the canonical threshold");
		s.start(100, 300, { target: anchor });
		assert.equal(s.end().defaultPrevented, undefined);
		assert.equal(s.surface.emit("click", { pointerType: "touch", target: anchor }).defaultPrevented, undefined, "tap keeps the anchor's native action");
	} finally { s.detach(); }
});

test("the channel exception does not unlock global menu links, embedded controls or nested blockers", () => {
	const list = node("nav", { "data-contacts-channel-list": "", "data-canvas-pointer-blocker": "true" });
	for (const target of [node("a", { href: "/about" }), node("button", {}, list), node("input", {}, list),
		node("a", {}, list), node("a", { href: "/" }, node("div", { "data-canvas-pointer-blocker": "true" }, list)),
		node("a", { href: "/" }, node("nav", { "data-contacts-channel-list": "" }, node("header", { "data-canvas-pointer-blocker": "true" })))]) {
		assert.equal(isCarouselTouchControlTarget(target), true);
	}
	assert.equal(isCarouselTouchControlTarget(node("canvas")), false);
});
