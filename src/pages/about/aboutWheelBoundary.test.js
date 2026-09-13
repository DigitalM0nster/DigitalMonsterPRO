import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import states, { ABOUT_STAGE_COUNT } from "./states.js";
import * as timing from "./aboutStoryTiming.js";
import * as spring from "../../three/render/transition/segmentScrollSpring.js";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const source = read("./aboutExperienceRuntime.js");
const carouselSource = read("../../three/render/transition/SceneCarousel.js");
const wheelSource = read("../../three/render/transition/carouselScroll.js");

function fixture(entry = 3, fps = 60, width = 1440) {
	let now = 0, id = 0, boundary = false;
	const frames = new Map(), timers = new Map(), listeners = new Map(), commits = [];
	const store = {};
	const carousel = {
		currentId: "about", previousId: "portfolioHub", nextId: "contacts",
		isInteractionLocked: () => false,
		isNavigationSettleActive: () => false,
		isAboutBoundaryDrive: () => boundary,
		clearAboutBoundaryDrive() { boundary = false; },
		adoptAboutBoundaryDrive(progress, target) { boundary = true; this.progress = progress; this.progressTarget = target; },
		commitAboutRouteLeave(direction) {
			commits.push(direction);
			this.currentId = direction === "forward" ? "contacts" : "portfolioHub";
		},
	};
	const noop = () => {};
	const context = {
		...timing, ...spring, states, ABOUT_STAGE_COUNT, store,
		performance: { now: () => now }, document: { querySelector: () => null },
		window: {
			innerWidth: width, innerHeight: 800,
			addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
			requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: key => frames.delete(key),
			setTimeout: (fn, ms) => { timers.set(++id, { at: now + ms, fn }); return id; }, clearTimeout: key => timers.delete(key),
		},
		getSceneCarousel: () => carousel,
		SCENE_ID_TO_PAGE: { portfolioHub: "/portfolio", contacts: "/contacts" },
		resolveAboutPanelHudStoryPair: () => ({ mix: 0 }),
		registerSiteNavigationProgressOwner: () => noop,
		subscribeSceneViewportResize: () => noop,
	};
	// Keep the real runtime, input handlers and spring; rendering/audio are inert.
	for (const match of source.matchAll(/^import \{([\s\S]*?)\} from [^;]+;/gm)) {
		for (const name of match[1].split(",").map(value => value.trim()).filter(Boolean)) {
			if (!(name in context)) context[name] = noop;
		}
	}
	for (const name of ["CAROUSEL_PROGRESS_COMMIT_EPS", "CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE", "CAROUSEL_PROGRESS_TARGET_MIN", "CAROUSEL_PROGRESS_TARGET_MAX", "CAROUSEL_WHEEL_PROGRESS_FACTOR"]) {
		const declaration = (carouselSource + wheelSource).match(new RegExp(`(?:export )?const ${name} = ([^;]+);`));
		context[name] = vm.runInNewContext(declaration[1]);
	}
	const code = source.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
	const runtime = vm.runInNewContext(`${code}\n({start: startAboutExperienceRuntime, reset: resetAboutExperienceState, stop: stopAboutExperienceRuntime})`, context);
	const f = {
		store, carousel, commits,
		get story() { return store.aboutExperience.storyProgress; },
		get target() { return store.aboutExperience.storyProgressTarget; },
		wheel(delta = 120) {
			listeners.get("wheel")({ deltaY: delta, deltaX: 0, deltaMode: 0, preventDefault() {} });
		},
		advance(ms) {
			const end = now + ms;
			while (now < end - 1e-6) {
				now = Math.min(end, now + 1000 / fps);
				for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); }
				for (const [key, frame] of [...frames]) { frames.delete(key); frame(now); }
			}
		},
		stop: runtime.stop,
	};
	runtime.start(); runtime.reset({ entryStory: entry });
	return f;
}

test("a wheel burst begun before the final pose settles can continue into contacts", () => {
	for (const fps of [30, 60, 144]) {
		for (const delta of [50, 120, 2000]) {
			const f = fixture(3, fps);
			f.wheel(); f.advance(400);
			assert.ok(f.story > 3 && f.story < 4);
			for (let i = 0; i < 300 && f.carousel.currentId === "about"; i++) {
				const before = f.story;
				f.wheel(delta);
				if (before < 4 - 1e-4) assert.equal(f.target, 4, "finish the final model pose before leaving");
				f.advance(50);
			}
			assert.equal(f.carousel.currentId, "contacts", `${fps}fps, delta ${delta}`);
			assert.deepEqual(f.commits, ["forward"]);
			f.stop();
		}
	}
});

test("continuous scrolling from the final step and back from the opening step never latches input off", () => {
	for (const [entry, direction, destination] of [[3, 1, "contacts"], [0.5, -1, "portfolioHub"]]) {
		const f = fixture(entry);
		for (let i = 0; i < 300 && f.carousel.currentId === "about"; i++) { f.wheel(120 * direction); f.advance(50); }
		assert.equal(f.carousel.currentId, destination);
		assert.equal(f.commits.length, 1);
		f.stop();
	}
});

test("interior inertia still selects only one pose, and settling alone never leaves About", () => {
	for (const [entry, expected] of [[0, 0.5], [3, 4]]) {
		const f = fixture(entry);
		for (let i = 0; i < 10; i++) { f.wheel(2000); f.advance(50); }
		f.advance(10000);
		assert.equal(f.story, expected);
		assert.equal(f.target, expected);
		assert.equal(f.carousel.currentId, "about");
		assert.equal(f.commits.length, 0);
		f.stop();
	}
});

test("a partial contacts transition can reverse, settle, and be entered again", () => {
	const f = fixture(4);
	f.wheel(200); f.advance(100);
	assert.ok(f.story > 4 && f.story < 5);
	f.wheel(-120); f.advance(10000);
	assert.equal(f.story, 4);
	assert.equal(f.carousel.currentId, "about");
	for (let i = 0; i < 100 && f.carousel.currentId === "about"; i++) { f.wheel(); f.advance(50); }
	assert.equal(f.carousel.currentId, "contacts");
	f.stop();
});
