import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveFrameSkipper } from "./adaptiveFrameSkip.js";

function simulation(t, { width = 390, coarse = true } = {}) {
	let time = 1;
	const originalWindow = globalThis.window;
	globalThis.window = { innerWidth: width, matchMedia: () => ({ matches: coarse }) };
	t.after(() => { globalThis.window = originalWindow; });
	t.mock.method(performance, "now", () => time);
	const skipper = new AdaptiveFrameSkipper();
	return {
		skipper,
		run(frames, interval, options = {}) {
			return Array.from({ length: frames }, (_, index) => {
				time += typeof interval === "function" ? interval(index) : interval;
				return skipper.shouldSkipRender(options);
			});
		},
	};
}

for (const hz of [30, 60, 120]) {
	for (const tier of ["low", "medium", "high"]) {
		test(`mobile ${tier} renders every native ${hz} Hz frame`, t => {
			const sim = simulation(t);
			assert.equal(sim.run(180, 1000 / hz, { tier }).filter(Boolean).length, 0);
			assert.ok(Math.abs(sim.skipper.getFps() - hz) < 0.01, "FPS telemetry remains live");
		});
	}
}

test("mobile missed frames and long pauses never trigger additional skipped renders", t => {
	const sim = simulation(t);
	const frames = sim.run(210, i => i % 20 === 0 ? 350 : i % 3 === 0 ? 66 : 33, { tier: "low" });
	assert.equal(frames.filter(Boolean).length, 0);
	assert.ok(sim.skipper.getFps() < 32, "exercise the former 1/7 branch");
});

test("wide touch devices retain the mobile policy", t => {
	const sim = simulation(t, { width: 1366, coarse: true });
	assert.equal(sim.run(120, 1000 / 30, { tier: "low" }).filter(Boolean).length, 0);
});

test("desktop Low retains one draw per seven frames under actual overload", t => {
	const sim = simulation(t, { width: 1280, coarse: false });
	const frames = sim.run(210, 1000 / 20, { tier: "low" });
	assert.equal(frames.slice(-70).filter(skip => !skip).length, 10);
});

test("desktop Medium retains alternate-frame shedding and recovers", t => {
	const sim = simulation(t, { width: 1280, coarse: false });
	assert.equal(sim.run(120, 1000 / 30, { tier: "medium" }).slice(-60).filter(Boolean).length, 30);
	assert.equal(sim.run(120, 1000 / 60, { tier: "medium" }).slice(-60).filter(Boolean).length, 0);
});

test("responsive-device classification updates after viewport resize", t => {
	const sim = simulation(t, { width: 1280, coarse: false });
	sim.run(90, 50, { tier: "low" });
	window.innerWidth = 800;
	assert.equal(sim.run(70, 50, { tier: "low" }).filter(Boolean).length, 0);
	window.innerWidth = 1280;
	assert.equal(sim.run(70, 50, { tier: "low" }).filter(skip => !skip).length, 10);
});

test("explicit render cap remains independent of the mobile adaptive bypass", t => {
	const sim = simulation(t);
	const frames = sim.run(120, 17, { tier: "low", renderFpsCap: 30 });
	assert.equal(frames.filter(skip => !skip).length, 60);
});

test("callers may explicitly select desktop or mobile policy", t => {
	const sim = simulation(t, { width: 1280, coarse: false });
	assert.equal(sim.run(140, 50, { tier: "low", mobile: true }).filter(Boolean).length, 0);
	assert.equal(sim.run(70, 50, { tier: "low", mobile: false }).filter(skip => !skip).length, 10);
});
