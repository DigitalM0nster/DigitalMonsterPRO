import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { resolveAboutResponsiveLayout } from "../../../pages/about/aboutResponsiveLayout.js";
import { createAboutCompactFraming, fitAboutCompactCamera } from "./aboutCompactFraming.js";
import * as spring from "../../render/transition/segmentScrollSpring.js";
import { ABOUT_OPEN_STORY_ANCHOR, getAboutStorySegment } from "../../../pages/about/aboutStoryTiming.js";

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
		...spring, window: viewport, ABOUT_STAGE_COUNT: 4, ABOUT_OPEN_STORY_ANCHOR, getAboutStorySegment,
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

test("desktop opening wheel transition is 1.5 times faster in both directions without changing other intervals", () => {
	const { runtime } = createScrollRuntime(1440, 900);
	const baseline = runtime.getPixelsPerStoryUnit(1, 100, "wheel");
	for (const [story, delta] of [[0, 100], [0.2, 100], [0.2, -100], [0.5, -100]]) {
		assert.equal(runtime.getPixelsPerStoryUnit(story, delta, "wheel"), baseline / 1.5);
		assert.equal(runtime.getPixelsPerStoryUnit(story, delta, "touch"), baseline);
	}
	assert.equal(runtime.getPixelsPerStoryUnit(0.5, 100, "wheel"), baseline);
	assert.equal(runtime.getPixelsPerStoryUnit(2, -100, "wheel"), baseline);
	assert.equal(runtime.getPixelsPerStoryUnit(3, 100, "wheel"), baseline / 2);
	assert.equal(runtime.getPixelsPerStoryUnit(0, -100, "wheel"), 1000);
	assert.equal(runtime.getPixelsPerStoryUnit(4, 100, "wheel"), 1000);
});

test("Compact About has four reversible swipe stops and equally reachable touch boundaries", () => {
	for (const [width, height] of [[330, 568], [330, 740], [768, 1024], [980, 800], [640, 360]]) {
		const { runtime, viewport } = createScrollRuntime(width, height);
		const unit = runtime.getPixelsPerStoryUnit(0, 100, "touch");
		assert.ok(unit >= 320 && unit <= 700);
		assert.equal(runtime.getPixelsPerStoryUnit(1, -100, "touch"), unit);
		assert.equal(runtime.getPixelsPerStoryUnit(2, -100, "touch"), unit);
		assert.equal(runtime.getPixelsPerStoryUnit(2, 100, "touch") * 2, unit);
		assert.equal(runtime.getPixelsPerStoryUnit(4, -100, "touch") * 2, unit);
		assert.equal(runtime.getPixelsPerStoryUnit(0, -100, "touch"), unit);
		assert.equal(runtime.getPixelsPerStoryUnit(4, 100, "touch"), unit);
		assert.equal(runtime.getPixelsPerStoryUnit(-.2, -100, "touch"), unit);
		assert.equal(runtime.getPixelsPerStoryUnit(4.2, 100, "touch"), unit);
		assert.equal(runtime.getPixelsPerStoryUnit(0, -100, "wheel"), 1000);
		assert.equal(runtime.getPixelsPerStoryUnit(4, 100, "wheel"), 1000);
		const settle = (current, target) => {
			for (let frame = 0; frame < 240; frame += 1) {
				target = runtime.applyStageTargetRest(target, 1 / 60);
				current = spring.chaseSegmentValue(current, target, 1 / 60, runtime.getStoryChaseConfig(current, target));
				({ current, target } = runtime.snapStoryPair(current, target));
			}
			return { current, target };
		};
		for (const [from, target, expected] of [[0, .7, 1], [1, 1.7, 2], [2, 3.4, 4], [4, 2.6, 2], [2, 1.3, 1], [1, .3, 0], [0, .2, 0], [3.2, 2.6, 2]]) {
			assert.equal(settle(from, target).current, expected);
		}
		const swipe = unit * .61;
		assert.equal(settle(4, 4 + swipe / runtime.getPixelsPerStoryUnit(4, swipe, "touch")).current, 5, "Next swipe completes the contacts HEX");
		assert.equal(settle(0, -swipe / runtime.getPixelsPerStoryUnit(0, -swipe, "touch")).current, -1, "Reverse swipe completes the preceding HEX");
		if (width === 330 && height === 568) {
			assert.equal(settle(4, 4 + 240 * 1.12 / unit).current, 5, "The measured 240px phone swipe leaves About");
		}
		assert.equal(runtime.applyStageTargetRest(5.3, 1 / 60), 5.3, "Leave overshoot remains owned by the ring handoff");
		for (const stop of [0, 1, 2, 4]) assert.equal(runtime.applyStageTargetRest(stop, 1 / 60), stop);
		viewport.innerWidth = 1440; viewport.innerHeight = 900;
		assert.equal(runtime.getRuntimeStorySegment(.3).span, .5, "Desktop retains its opening stop");
		for (const stop of [0, 1, 2, 4]) assert.equal(runtime.applyStageTargetRest(stop, 1 / 60), stop, "Resize does not reset settled progress");
		assert.equal(runtime.getPixelsPerStoryUnit(1, 100, "touch"), 2000);
		assert.equal(runtime.getPixelsPerStoryUnit(4, 100, "touch"), 1000, "Desktop retains its original ring input scale");
	}
});
