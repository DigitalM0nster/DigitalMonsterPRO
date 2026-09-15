import test from "node:test";
import assert from "node:assert/strict";
import { WhaleCursorReaction, whaleCursorReactionConfig } from "./whaleCursorReaction.js";
import { createMobileWhaleMaterials } from "./mobileWhale/mobileWhaleMaterial.js";

function fixture() {
	const events = new EventTarget();
	const motion = { matches: false };
	const reaction = new WhaleCursorReaction(events, motion);
	const frame = { pointer: { x: .8, y: .6 }, interactionEnabled: true, pointerBlocked: false };
	const move = (type = "mouse") => {
		const event = new Event("pointermove");
		event.pointerType = type;
		events.dispatchEvent(event);
	};
	const run = (seconds = 1, fps = 60, ready = true) => {
		for (let i = 0; i < seconds * fps; i++) reaction.update(1 / fps, frame, ready);
	};
	return { events, motion, reaction, frame, move, run };
}

test("hover begins only after a real mouse/pen input and the prepared enter", () => {
	const f = fixture();
	f.run();
	assert.equal(f.reaction.strength, 0);
	f.move(); f.run(1, 60, false);
	assert.equal(f.reaction.yaw, 0);
	assert.equal(f.reaction.strength, 0);
	f.run();
	assert.ok(f.reaction.yaw > .05);
	assert.ok(f.reaction.pitch < -.02);
	assert.ok(f.reaction.strength > .99);
	f.move("touch"); f.run(4);
	assert.ok(Math.abs(f.reaction.yaw) < .00001);
	assert.ok(f.reaction.strength < .00001);
	f.reaction.dispose();
});

test("turn is frame-rate independent, bounded and continuous on immediate reversal", () => {
	const a = fixture(), b = fixture();
	a.move(); b.move(); a.run(1, 30); b.run(1, 120);
	assert.ok(Math.abs(a.reaction.yaw - b.reaction.yaw) < 1e-12);
	assert.ok(Math.abs(a.reaction.strength - b.reaction.strength) < 1e-12);
	const before = a.reaction.yaw;
	a.frame.pointer = { x: -10, y: 10 };
	a.run(1 / 30, 30);
	assert.ok(Math.abs(a.reaction.yaw - before) < .01, "no pose jump on reversal");
	a.run(5);
	assert.ok(Math.abs(a.reaction.yaw) <= whaleCursorReactionConfig.yaw + 1e-8);
	assert.ok(Math.abs(a.reaction.pitch) <= whaleCursorReactionConfig.pitch + 1e-8);
	a.reaction.dispose(); b.reaction.dispose();
});

test("hex non-owners and DOM blockers release the reaction even with a live visualPointer", () => {
	for (const blocked of ["interactionEnabled", "pointerBlocked"]) {
		const f = fixture(); f.move(); f.run();
		f.frame.visualPointer = { x: 1, y: 1 };
		f.frame[blocked] = blocked === "pointerBlocked";
		const prior = f.reaction.yaw;
		f.run(1 / 60);
		assert.ok(Math.abs(f.reaction.yaw - prior) < .01);
		f.run(5);
		assert.ok(Math.abs(f.reaction.yaw) < .00001);
		assert.ok(f.reaction.strength < .00001);
		f.reaction.dispose();
	}
});

test("a fast jump to the opposite corner approaches the diagonal limit without clipping early", () => {
	const f = fixture(); f.move();
	f.frame.pointer = { x: -1, y: -1 }; f.run(6);
	f.frame.pointer = { x: 1, y: 1 };
	const cfg = whaleCursorReactionConfig, reach = [];
	for (let i = 0; i < 180; i++) {
		f.reaction.update(1 / 60, f.frame, true);
		const x = f.reaction.yaw / cfg.yaw, y = -f.reaction.pitch / cfg.pitch;
		assert.ok(Math.hypot(x, y) <= 1 + 1e-8, "spring stays inside the blend domain");
		reach.push((x + y) / Math.SQRT2);
	}
	for (let i = 1; i < reach.length; i++) assert.ok(reach[i] > reach[i - 1], "no intermediate pause");
	assert.ok(reach[90] < .99, "approaches the endpoint instead of hitting a radial clamp");
	assert.ok(reach.at(-1) > .999);
	f.reaction.dispose();
});

test("reduced motion keeps local light; blur, leave and disposal release input", () => {
	const f = fixture(); f.motion.matches = true; f.move(); f.run();
	assert.equal(f.reaction.yaw, 0);
	assert.equal(f.reaction.pitch, 0);
	assert.ok(f.reaction.strength > .99);
	f.events.dispatchEvent(new Event("blur")); f.run(4);
	assert.ok(f.reaction.strength < .00001);
	f.move(); f.run();
	f.events.dispatchEvent(new Event("pointerout")); f.run(4);
	assert.ok(f.reaction.strength < .00001);
	f.reaction.dispose(); f.move(); f.run();
	assert.equal(f.reaction.strength, 0);
});

test("hover updates only prepared uniforms and retains the particle material", () => {
	const { body, shared } = createMobileWhaleMaterials();
	const cursorUniform = shared.uCursorPosition, cursor = cursorUniform.value;
	const f = fixture(); f.move();
	const version = body.version;
	for (let i = 0; i < 120; i++) {
		f.reaction.update(1 / 60, f.frame, true);
		f.reaction.applyUniforms(body.uniforms, 16 / 9);
	}
	assert.equal(body.uniforms.uCursorPosition, cursorUniform);
	assert.equal(cursorUniform.value, cursor);
	assert.equal(body.version, version, "no shader invalidation");
	assert.equal(shared.uCursorAspect.value, 16 / 9);
	assert.ok(shared.uCursorStrength.value > .99);
	body.dispose(); f.reaction.dispose();
});
