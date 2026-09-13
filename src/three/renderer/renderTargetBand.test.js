import test from "node:test";
import assert from "node:assert/strict";
import { Vector4 } from "three";
import { withRenderTargetBand } from "./renderTargetBand.js";

test("scissor covers rounded texels, survives nested binds and restores state on throw", () => {
	const target = { width: 390, height: 664, scissor: new Vector4(1, 2, 300, 600), scissorTest: false };
	const viewport = new Vector4(0, 0, 390, 664);
	let bound = target, native;
	const renderer = { getRenderTarget: () => bound, setRenderTarget(rt) { bound = rt; native = rt?.scissor.toArray(); } };
	assert.throws(() => withRenderTargetBand(renderer, target, { min: .251, max: .749 }, () => {
		renderer.setRenderTarget(target);
		assert.deepEqual(native, [0, 166, 390, 332]);
		assert.equal(target.scissorTest, true);
		renderer.setRenderTarget(null); renderer.setRenderTarget(target);
		assert.deepEqual(native, [0, 166, 390, 332]);
		throw Error("nested draw failed");
	}));
	assert.equal(bound, target);
	assert.deepEqual(native, [1, 2, 300, 600]);
	assert.equal(target.scissorTest, false);
	assert.deepEqual(viewport.toArray(), [0, 0, 390, 664]);
});
