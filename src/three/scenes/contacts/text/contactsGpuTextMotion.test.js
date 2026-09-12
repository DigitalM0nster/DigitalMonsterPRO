import assert from "node:assert/strict";
import test from "node:test";
import { Vector4 } from "three";
import { ContactsGpuTextMotion } from "./contactsGpuTextMotion.js";

function setup() {
	const uniforms = { uMode: { value: 0 }, uTime: { value: 0 }, uTiming: { value: new Vector4() } };
	const slots = [{ isSpace: false, appearPending: false, mainAlpha: 1 }];
	const motion = new ContactsGpuTextMotion(uniforms, slots,
		() => ({ letters: 75, symbols: 50, fade: 100, scale: 0.5, duration: 200, finish: 225 }), () => 1000);
	return { motion, uniforms, slots };
}

test("appear waits for every letter and its fade; frames never mutate letter metadata", async () => {
	const { motion, uniforms, slots } = setup();
	motion.setVisible(false);
	assert.equal(motion.run("appear"), 200);
	const completion = motion.whenIdle();
	const metadata = JSON.stringify(slots);
	for (let t = 1000; t < 1275; t += 5) motion.update(t);
	assert.equal(JSON.stringify(slots), metadata);
	assert.equal(motion.active, true);
	motion.update(1275);
	assert.equal(await completion, true);
	assert.equal(uniforms.uMode.value, 0);
	assert.equal(slots[0].mainAlpha, 1);
	const settled = JSON.stringify(uniforms);
	motion.update(100000);
	assert.equal(JSON.stringify(uniforms), settled);
});

test("dormant/dispose cancels waiting completion; a later enter can finish normally", async () => {
	const { motion, uniforms } = setup();
	motion.run("disappear");
	const leaving = motion.whenIdle();
	motion.setVisible(false);
	assert.equal(await leaving, false);
	assert.equal(uniforms.uMode.value, -1);
	assert.equal(motion.run("hover"), 0);
	motion.run("appear");
	const entering = motion.whenIdle();
	motion.update(1275);
	assert.equal(await entering, true);
});

test("repeated hover reuses the wave; route exit replaces it and settles hidden", async () => {
	const { motion, uniforms } = setup();
	motion.run("hover");
	motion.update(1050);
	assert.equal(motion.run("hover"), 0);
	assert.equal(uniforms.uTime.value, 50);
	const hover = motion.whenIdle();
	motion.run("disappear");
	assert.equal(await hover, false);
	const exit = motion.whenIdle();
	motion.update(1225);
	assert.equal(await exit, true);
	assert.equal(uniforms.uMode.value, -1);
});
