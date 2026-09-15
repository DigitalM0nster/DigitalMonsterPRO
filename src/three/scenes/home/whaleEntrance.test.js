import test from "node:test";
import assert from "node:assert/strict";
import { createMobileWhaleMaterials, createMobileWhaleTrail, createWhaleDepthOccluder } from "./mobileWhale/mobileWhaleMaterial.js";
import { Mesh, BufferGeometry } from "three";
import { WhaleEntrance } from "./whaleEntrance.js";

test("a large whale emerges from darkness and approaches without sideways launch or overshoot", () => {
	const motion = new WhaleEntrance();
	let previous = motion.sample(0).offset.clone();
	let previousReveal = motion.reveal;
	assert.equal(previousReveal, 0, "completely dark before Start");
	for (let i = 1; i <= 360; i++) {
		const t = i / 360;
		const { offset, reveal, swimRate } = motion.sample(t);
		assert.ok(offset.x <= previous.x && offset.x >= 0);
		assert.ok(offset.y >= previous.y && offset.z >= previous.z);
		assert.ok(reveal >= previousReveal && reveal <= 1);
		assert.ok(swimRate >= .8 && swimRate <= 1);
		assert.ok(offset.x <= Math.abs(offset.z) * .09, "depth dominates the lateral motion");
		previous.copy(offset);
		previousReveal = reveal;
	}
	assert.deepEqual(motion.offset.toArray(), [0, -0, -0]);
	assert.equal(motion.reveal, 1);
	const tail = motion.sample(.999).offset.length();
	assert.ok(tail < .000001, "no position pop at completion");
	const firstMovement = motion.sample(.001).offset.clone();
	assert.ok(firstMovement.distanceTo(motion.sample(0).offset) < .000001);
	motion.sample(.5);
	assert.ok(motion.reveal > .7 && motion.offset.z < -6, "visible in depth before settling");
});

test("entrance is independent of frame cadence and clamps dormant/completed sampling", () => {
	const motion = new WhaleEntrance();
	const expected = motion.sample(.72).offset.toArray();
	for (const t of [0, .1, .4, .6, .2, .72]) motion.sample(t);
	assert.deepEqual(motion.offset.toArray(), expected);
	assert.deepEqual(motion.sample(-1).offset.toArray(), [1.2, -.6, -14]);
	assert.equal(motion.sample(2).offset.length(), 0);
	assert.equal(motion.swimRate, 1);
});

test("body, material surface and wake share one reveal without changing user opacity", () => {
	const { body, shared } = createMobileWhaleMaterials();
	const geometry = new BufferGeometry();
	const skin = createWhaleDepthOccluder(new Mesh(geometry), shared);
	const trail = createMobileWhaleTrail(shared);
	assert.equal(skin.material.uniforms.uEntranceReveal, shared.uEntranceReveal);
	assert.equal(trail.material.uniforms.uEntranceReveal, shared.uEntranceReveal);
	const opacity = shared.uOpacity.value;
	shared.uEntranceReveal.value = .2;
	assert.equal(shared.uOpacity.value, opacity);
	assert.equal(trail.material.uniforms.uEntranceReveal.value, .2);
	for (const material of [body, skin.material, trail.material]) material.dispose();
	geometry.dispose(); trail.geometry.dispose();
});
