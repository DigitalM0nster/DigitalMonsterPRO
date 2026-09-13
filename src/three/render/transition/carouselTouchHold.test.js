import test from "node:test";
import assert from "node:assert/strict";
import { SceneCarousel } from "./SceneCarousel.js";
import { attachCarouselTouch, isCarouselTouchTargetHeld } from "./carouselTouch.js";
import { applyLocalSegmentTargetRest } from "./segmentScrollSpring.js";

class InputSurface {
	listeners = new Map();
	addEventListener(name, fn) { this.listeners.set(name, fn); }
	removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
	emit(name, values = {}) {
		const event = { target: {}, cancelable: true, preventDefault() {}, stopImmediatePropagation() {}, ...values };
		this.listeners.get(name)?.(event);
	}
}

function setup(path = "/contacts") {
	const target = new InputSurface(), carousel = new SceneCarousel(), commits = [];
	carousel.syncFromPage(path, { force: true });
	carousel.setOnCommit(commit => commits.push(commit));
	let time = 0, allowed = true;
	const detach = attachCarouselTouch({ target,
		getStartOwner: () => carousel.currentId,
		canContinue: owner => allowed && carousel.currentId === owner && !carousel.isInteractionLocked(),
		addDelta: pixels => carousel.addScrollDelta(pixels * .001),
		isBlockedTarget: () => false, now: () => time });
	const touch = (y, x = 100) => ({ identifier: 1, clientX: x, clientY: y });
	const start = (y = 400) => target.emit("touchstart", { touches: [touch(y)] });
	const move = (y, x = 100) => target.emit("touchmove", { touches: [touch(y, x)] });
	const advance = milliseconds => {
		let remaining = milliseconds;
		while (remaining > 1e-6) {
			const frame = Math.min(1000 / 60, remaining);
			time += frame; remaining -= frame; carousel.update(frame / 1000);
		}
	};
	const end = (cancel = false) => target.emit(cancel ? "touchcancel" : "touchend", { touches: [] });
	return { carousel, commits, start, move, advance, end, detach, block: () => { allowed = false; } };
}

test("a slow 240px swipe commits in both directions with 48/80ms input gaps using the real carousel", () => {
	for (const gap of [48, 80]) for (const direction of [-1, 1]) {
		const s = setup();
		try {
			s.start();
			for (let step = 1; step <= 12; step++) {
				s.move(400 - direction * step * 20); s.advance(gap);
				assert.ok(Math.abs(s.carousel.progressTarget - direction * step * .06) < 1e-9,
					`${gap}ms / ${direction}: finger distance must accumulate without rest decay`);
			}
			assert.ok(Math.abs(s.carousel.progress) > .2, "painted progress continues chasing during the hold");
			assert.equal(s.commits.length, 0, "0.72 target does not auto-finish while the finger is held");
			s.end(); s.advance(6000);
			assert.equal(s.commits.length, 1);
			assert.equal(s.carousel.currentId, direction > 0 ? "home" : "about");
		} finally { s.detach(); }
	}
});

test("holding and cancelling a sub-threshold swipe resumes the original spring without resetting progress", () => {
	for (const cancel of [false, true]) {
		const s = setup();
		try {
			s.start(); s.move(320); s.advance(1200);
			assert.equal(s.carousel.progressTarget, .24);
			assert.ok(s.carousel.progress > .2 && s.carousel.progress < .24);
			const before = s.carousel.progress;
			s.end(cancel);
			assert.equal(s.carousel.progress, before); assert.equal(s.carousel.progressTarget, .24);
			s.advance(16);
			assert.ok(s.carousel.progressTarget < .24);
			assert.ok(Math.abs(s.carousel.progress - before) < .01, "no release/cancel pose jump");
			s.advance(6000); assert.equal(s.commits.length, 0); assert.ok(Math.abs(s.carousel.progress) < .001);
		} finally { s.detach(); }
	}
});

test("a slow reversal can cross zero and commit the opposite scene without a premature commit", () => {
	const s = setup();
	try {
		s.start();
		for (let step = 1; step <= 12; step++) { s.move(400 - step * 20); s.advance(80); }
		for (let step = 1; step <= 24; step++) { s.move(160 + step * 20); s.advance(80); }
		assert.ok(Math.abs(s.carousel.progressTarget + .72) < 1e-9);
		assert.equal(s.carousel.scrollIntent, "backward"); assert.equal(s.commits.length, 0);
		s.end(); s.advance(6000);
		assert.equal(s.commits.length, 1); assert.equal(s.carousel.currentId, "about");
	} finally { s.detach(); }
});

test("owner change and click lock invalidate the hold even without another touchmove", () => {
	for (const change of [s => s.carousel.syncFromPage("/capabilities/light-trails", { force: true }), s => s.block()]) {
		const s = setup();
		try {
			s.start(); s.move(320); assert.equal(isCarouselTouchTargetHeld("contacts"), true);
			change(s); s.carousel.setProgressTarget(.24);
			s.advance(80); assert.ok(s.carousel.progressTarget < .24);
			assert.equal(isCarouselTouchTargetHeld(s.carousel.currentId), false);
			// Returning to the old route does not resurrect the still-held contact.
			s.carousel.syncFromPage("/contacts", { force: true });
			assert.equal(isCarouselTouchTargetHeld("contacts"), false);
		} finally { s.detach(); }
	}
});

test("wheel, pending touch, horizontal orbit and local-owner pages retain the existing rest response", () => {
	for (const mode of ["wheel", "pending", "horizontal", "about", "portfolioHub"]) {
		const s = setup(mode === "about" ? "/about" : mode === "portfolioHub" ? "/portfolio" : "/contacts");
		try {
			if (mode !== "wheel") s.start();
			if (mode === "horizontal") s.move(402, 130);
			if (mode === "about" || mode === "portfolioHub") s.move(160);
			s.carousel.addScrollDelta(.24);
			s.carousel._applyProgressTargetRest(.08);
			assert.equal(s.carousel.progressTarget, applyLocalSegmentTargetRest(.24, .08));
		} finally { s.detach(); }
	}
});
