import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { resolveAboutResponsiveLayout } from "../../../pages/about/aboutResponsiveLayout.js";
import { createAboutCompactFraming, fitAboutCompactCamera } from "./aboutCompactFraming.js";
import * as spring from "../../render/transition/segmentScrollSpring.js";
import { ABOUT_OPEN_STORY_ANCHOR, ABOUT_STORY_STOPS, getAboutStoryStepTarget, getAboutStorySegment, chaseAboutStoryValue } from "../../../pages/about/aboutStoryTiming.js";

const source = readFileSync(new URL("./AboutScene.js", import.meta.url), "utf8");
const start = source.indexOf("\t_applyCompactCamera(camera, sceneProgress) {");
const end = source.indexOf("\n\t/**", start);
const ResponsiveScene = vm.runInNewContext(`(class { ${source.slice(start, end)} })`, { fitAboutCompactCamera });

const runtimeSource = readFileSync(new URL("../../../pages/about/aboutExperienceRuntime.js", import.meta.url), "utf8");
const runtimeHelpers = runtimeSource.slice(0, runtimeSource.indexOf("function ensureAboutExperience()"))
	.replace(/^import[^;]+;\r?\n/gm, "").replace(/export /g, "");
function createScrollRuntime(width, height) {
	const viewport = { innerWidth: width, innerHeight: height };
	const runtime = vm.runInNewContext(`${runtimeHelpers}\n({getPixelsPerStoryUnit,getRuntimeStorySegment,applyStageTargetRest,getStoryChaseConfig,snapStoryPair,storyNeedsAnimation})`, {
		...spring, window: viewport, ABOUT_STAGE_COUNT: 4, ABOUT_OPEN_STORY_ANCHOR, ABOUT_STORY_STOPS, getAboutStorySegment,
		CAROUSEL_WHEEL_PROGRESS_FACTOR: 0.001, CAROUSEL_PROGRESS_COMMIT_EPS: 1e-4,
		CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE: .005, CAROUSEL_PROGRESS_TARGET_MIN: -1.5, CAROUSEL_PROGRESS_TARGET_MAX: 1.5,
	});
	return { runtime, viewport };
}

test("About compact framing is finite, reversible, and follows the reserved model area", () => {
	for (const [width, height] of [[330, 568], [480, 800], [640, 360], [768, 1024], [980, 640], [1920, 480]]) {
		const layout = resolveAboutResponsiveLayout(width, height);
		const model = new THREE.Group(); model.name = "AboutModelAsset"; model.position.set(0.7, 0.1, 0);
		model.add(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 1)));
		const root = new THREE.Group(); root.add(model);
		const scene = Object.assign(new ResponsiveScene(), {
			_viewport: { width, height }, _compactLayout: layout, root,
			_compactFraming: createAboutCompactFraming(model), _storyProgress: 0,
		});
		const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
		camera.position.set(0, 0, 8);
		const initialMatrix = new THREE.Matrix4();
		for (const progress of [0, 0.25, 0.75, 0.25, 0]) {
			scene._applyCompactCamera(camera, progress);
			const projected = new THREE.Box2();
			const { min, max } = scene._compactFraming.box;
			for (let i = 0; i < 8; i += 1) {
				const point = new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).project(camera);
				projected.expandByPoint(new THREE.Vector2(point.x, point.y));
			}
			const center = projected.getCenter(new THREE.Vector2());
			assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
			assert.ok(Math.abs(center.x - (layout.modelCenterX / width * 2 - 1)) < 1e-8);
			assert.ok(Math.abs(center.y - (1 - 2 * layout.modelCenterY / height - progress * 0.24)) < 1e-8);
			if (progress === 0) {
				if (initialMatrix.elements[0] === 1) initialMatrix.copy(camera.projectionMatrix);
				else assert.deepEqual(camera.projectionMatrix.elements, initialMatrix.elements);
			}
		}
		assert.ok(layout.textWidth >= 270 || width > height);
		assert.ok(layout.actionY + 44 <= height - layout.bottom);
	}
});

test("About moving parts and epic close stay framed without reading scene geometry again", () => {
	const model = new THREE.Group(); model.name = "AboutModelAsset";
	const core = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5)); model.add(core);
	const front = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2)); front.name = "Front"; model.add(front);
	const epic = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.1)); epic.name = "AboutEpicTextPlane"; model.add(epic);
	const framing = createAboutCompactFraming(model);
	model.traverse = () => assert.fail("Runtime traversal");
	for (const part of [core, front, epic]) part.geometry.computeBoundingBox = () => assert.fail("Runtime geometry read");
	for (const [width, height] of [[330, 740], [640, 360]]) {
		const layout = resolveAboutResponsiveLayout(width, height);
		const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
		camera.position.set(0, 0, 8);
		const first = new THREE.Matrix4();
		for (const story of [0, 0.5, 1, 2, 3, 4, 3, 2, 1, 0.5, 0]) {
			model.rotation.z = story * 0.07;
			front.position.set(story * 2, story, 1);
			epic.position.set(story - 2, 1, 0);
			model.updateMatrixWorld(true);
			fitAboutCompactCamera(framing, camera, { width, height }, layout, story, 0);
			assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
			for (let corner = 0; corner < 8; corner += 1) {
				const { min, max } = framing.box;
				const p = new THREE.Vector3(corner & 1 ? max.x : min.x, corner & 2 ? max.y : min.y, corner & 4 ? max.z : min.z).project(camera);
				assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
			}
			if (story === 0) {
				if (first.elements[0] === 1) first.copy(camera.projectionMatrix);
				else assert.deepEqual(camera.projectionMatrix.elements, first.elements);
			}
		}
	}
});

test("About finale frames the small closing text instead of the surrounding assembly", () => {
	const model = new THREE.Group(); model.name = "AboutModelAsset";
	model.add(new THREE.Mesh(new THREE.BoxGeometry(8, 8, 2)));
	const epic = new THREE.Mesh(new THREE.BoxGeometry(.5, .12, .01));
	epic.name = "AboutEpicTextPlane"; model.add(epic);
	model.updateMatrixWorld(true);
	const framing = createAboutCompactFraming(model);
	for (const [width, height] of [[330, 740], [330, 568], [640, 360]]) {
		const layout = resolveAboutResponsiveLayout(width, height);
		const camera = new THREE.PerspectiveCamera(40, width / height, .1, 100);
		camera.position.set(0, 0, 12);
		const forward = new Map();
		for (const story of [3.55, 3.7, 3.9, 4, 3.9, 3.7, 3.55]) {
			fitAboutCompactCamera(framing, camera, { width, height }, layout, story, 0);
			assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
			if (forward.has(story)) assert.deepEqual(camera.projectionMatrix.elements, forward.get(story));
			else forward.set(story, camera.projectionMatrix.elements.slice());
			if (story === 4) {
				const left = new THREE.Vector3(-.25, 0, 0).project(camera);
				const right = new THREE.Vector3(.25, 0, 0).project(camera);
				assert.ok((right.x - left.x) * width / 2 > width * (layout.portrait ? .75 : .45), "Closing text remains readable");
			}
		}
	}
});

test("About full desktop keeps its authored camera projection", () => {
	assert.equal(resolveAboutResponsiveLayout(1920, 1080), null);
	const scene = Object.assign(new ResponsiveScene(), { _viewport: { width: 1920, height: 1080 }, _compactLayout: null });
	const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 100);
	const before = camera.projectionMatrix.clone();
	scene._applyCompactCamera(camera, 0.7);
	assert.deepEqual(camera.projectionMatrix.elements, before.elements);
});

test("five wheel gestures visit every model pose; inertia and large deltas cannot skip steps", () => {
 const start = runtimeSource.indexOf("\tconst onWheel = (event) => {");
 const end = runtimeSource.indexOf("\n\tconst onKeyDown", start);
 let now = 0;
 const state = { current: 0, target: 0, lastWheelAt: -Infinity, wheelDirection: 0, wheelBoundaryGesture: false,
  scrollIntent: null, WHEEL_IDLE_MS: 180, STORY_MAX: 4,
  sceneCanvasOwnsInput: () => false, ownsInput: () => true, isSceneDevToolsWheelTarget: () => false,
  normalizeWheelDelta: e => e.deltaY, getSceneCarousel: () => ({ isInteractionLocked: () => false }),
  performance: { now: () => now }, isRouteEdgeStory: s => s < 0 || s > 4,
  getAboutStoryStepTarget, publish() {}, startAnimation() {}, boundaryCalls: 0,
 };
 state.applyInputPixels = () => { state.boundaryCalls++; };
 const context = vm.createContext(state);
 const onWheel = vm.runInContext(runtimeSource.slice(start, end) + "\nonWheel", context);
 const wheel = delta => onWheel({ deltaY: delta, deltaX: 0, preventDefault() {} });
 for (const expected of [.5, 1, 2, 3, 4]) {
  now += 400; wheel(120);
  assert.equal(state.target, expected);
  for (const delta of [120, 60, 10, 2, 9999]) { now += 20; wheel(delta); assert.equal(state.target, expected); }
  assert.notEqual(state.current, state.target, "input must not teleport rendered progress");
  state.current = state.target;
 }
 assert.equal(state.boundaryCalls, 0, "fifth gesture must finish About before route leave");
 now += 400; wheel(120); assert.equal(state.boundaryCalls, 1);
 // Reverse midway through 1→2: return to pose 1, with no jump in rendered progress.
 state.target = 2; state.current = 1.4; state.wheelDirection = 1; state.wheelBoundaryGesture = false;
 now += 20; wheel(-120); assert.equal(state.target, 1); assert.equal(state.current, 1.4);
 state.current = 1;
 for (const expected of [.5, 0]) { now += 400; wheel(-120); assert.equal(state.target, expected); state.current = expected; }
});

test("the final model transition takes twice as long in either direction", () => {
	for (const width of [390, 1440]) {
		const { runtime } = createScrollRuntime(width, 900);
		const duration = (from, target) => {
			let current = from;
			const motion = { velocity: 0 };
			for (let frame = 1; frame < 3000; frame++) {
				current = chaseAboutStoryValue(current, target, 1 / 120, runtime.getStoryChaseConfig(current, target).smooth, motion);
				({ current } = runtime.snapStoryPair(current, target));
				if (current === target) return frame;
			}
			assert.fail("transition did not settle");
		};
		assert.ok(Math.abs(duration(3, 4) - duration(2, 3) * 2) <= 3);
		assert.ok(Math.abs(duration(4, 3) - duration(3, 2) * 2) <= 3);
		assert.equal(runtime.getStoryChaseConfig(3.5, 4.1).smooth, runtime.getStoryChaseConfig(0, -0.1).smooth);
	}
});

test("all six poses settle on desktop and touch with equal swipe distance and stable route boundaries", () => {
 for (const [width, height] of [[390, 740], [768, 1024], [1440, 900]]) {
  const { runtime } = createScrollRuntime(width, height);
  const settle = (current, target) => {
   const motion = { velocity: 0 };
   for (let frame = 0; frame < 900; frame++) {
    target = runtime.applyStageTargetRest(target, 1 / 60);
    current = chaseAboutStoryValue(current, target, 1 / 60, runtime.getStoryChaseConfig(current, target).smooth, motion);
    ({current, target} = runtime.snapStoryPair(current, target));
   }
   return current;
  };
  for (let i = 0; i < ABOUT_STORY_STOPS.length - 1; i++) {
   const a = ABOUT_STORY_STOPS[i], b = ABOUT_STORY_STOPS[i + 1], span = b - a;
   assert.equal(settle(a, b), b); assert.equal(settle(b, a), a);
   const distance = runtime.getPixelsPerStoryUnit(a, 100, "touch") * span;
   assert.equal(distance, width <= 1024 ? Math.max(320, Math.min(700, height * .78)) : 2000);
   assert.equal(runtime.getPixelsPerStoryUnit(b, -100, "touch") * span, distance);
   assert.equal(settle(a, a + span * .7), b);
   assert.equal(settle(b, a + span * .3), a);
  }
  assert.equal(runtime.getPixelsPerStoryUnit(0, -100, "wheel"), 1000);
  assert.equal(runtime.getPixelsPerStoryUnit(4, 100, "wheel"), 1000);
  assert.equal(runtime.applyStageTargetRest(5.3, 1/60), 5.3);
 }
});

test("eased starts preserve forward step duration within 6% at different frame rates", () => {
 for (const width of [390, 1440]) for (const fps of [30, 60, 144]) {
  const { runtime } = createScrollRuntime(width, 900);
  for (let i = 0; i < ABOUT_STORY_STOPS.length - 1; i++) {
   const from = ABOUT_STORY_STOPS[i], target = ABOUT_STORY_STOPS[i + 1];
   const duration = eased => {
    let current = from; const motion = { velocity: 0 };
    for (let frame = 1; frame < fps * 20; frame++) {
     const cfg = runtime.getStoryChaseConfig(current, target);
     current = eased ? chaseAboutStoryValue(current, target, 1 / fps, cfg.smooth, motion)
      : spring.chaseSegmentValue(current, target, 1 / fps, cfg);
     if (eased) ({current} = runtime.snapStoryPair(current, target));
     else if (Math.abs(target - current) <= .005) current = target;
     if (current === target) return frame / fps;
    }
    assert.fail("did not settle");
   };
   const before = duration(false), after = duration(true);
   assert.ok(Math.abs(after - before) <= before * .06 + 1 / fps, JSON.stringify({fps, width, from, before, after}));
  }
 }
});
