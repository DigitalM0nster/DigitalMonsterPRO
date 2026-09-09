import test from "node:test";
import assert from "node:assert/strict";
import { PreparationScheduler, resolveFullWarm } from "./preparationScheduler.js";

test("production cannot bypass readiness; dev can explicitly reproduce full warm", () => {
	assert.equal(resolveFullWarm({ search: "?fullWarm=0" }), true);
	assert.equal(resolveFullWarm({ development: true }), false);
	assert.equal(resolveFullWarm({ development: true, search: "?tier=high&fullWarm=1" }), true);
});

test("small CPU jobs share a budget; GPU jobs never share a frame", async () => {
	let time = 0, frame = 0;
	const scheduler = new PreparationScheduler({ now: () => time, nextFrame: async () => { frame++; } });
	const frames = [];
	const job = () => { frames.push(frame); time += 2; };
	await scheduler.run(job);
	await scheduler.run(job);
	await scheduler.run(job);
	await scheduler.run(job, { gpu: true });
	await scheduler.run(job, { gpu: true });
	assert.deepEqual(frames, [0, 0, 1, 2, 3]);
	assert.equal(scheduler.stats.maxJobMs, 2);
});

test("an indivisible slow job is followed by an extra loader paint", async () => {
	let time = 0, frames = 0;
	const scheduler = new PreparationScheduler({ now: () => time, nextFrame: async () => { frames++; } });
	await scheduler.run(() => { time += 40; });
	await scheduler.run(() => {}, { gpu: true });
	assert.equal(frames, 2);
});

test("unmount during a yield cancels the pending GPU submission", async () => {
	let disposed = false, draws = 0;
	const scheduler = new PreparationScheduler({ cancelled: () => disposed, nextFrame: async () => { disposed = true; } });
	await assert.rejects(scheduler.run(() => { draws++; }, { gpu: true }), { name: "AbortError" });
	assert.equal(draws, 0);
});
