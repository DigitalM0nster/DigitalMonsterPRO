import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { SceneDragOrbitController } from "../interaction/SceneDragOrbitController.js";
import { aboutStoryToModelProgress, aboutStoryToFrontDissolve } from "../../../pages/about/aboutStoryTiming.js";

const source = readFileSync(new URL("./AboutScene.js", import.meta.url), "utf8")
	.replace(/^import[\s\S]*?;\s*$/gm, "").replace("export class", "class");
const AboutScene = vm.runInNewContext(`${source}\nAboutScene`, {
	THREE, aboutStoryToModelProgress, aboutStoryToFrontDissolve,
	ABOUT_PARTICLES: {}, ABOUT_MATERIALS: { edgeParticles: {} },
	setAboutDissolveProgress: (u, p) => { if (u?.uDissolve) u.uDissolve.value = p; },
});

test("fully dissolved shell skips drawing, warms when hidden and returns intact on reverse", () => {
	const scene = Object.create(AboutScene.prototype);
	const materials = Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial());
	const [front, cell, seam, side] = materials;
	for (const mat of materials) mat.userData.uniforms = { uDissolve: { value: 0 } };
	scene._materialsByKey = { frontGlass: front, outerCell: cell, OuterCell: cell, OuterCellSeam: seam, outerCellSeam: seam };
	scene._frontBackSide = new THREE.Mesh(new THREE.PlaneGeometry(), side);
	const child = new THREE.Object3D(); scene._frontBackSide.add(child);
	scene.threeScene = new THREE.Scene(); scene.threeScene.add(scene._frontBackSide);
	scene._applyEdgeParticleVisibility = () => {};
	const ids = materials.map(mat => mat.uuid);
	for (const story of [0, 0.5, 0.75, 0.999, 1, 2, 4, 1, 0.999, 0.5, 0]) {
		scene._applyStoryProgress(story);
		assert.ok(materials.every(mat => mat.visible === (story < 1)));
		assert.equal(child.visible, true, "material culling must preserve child visibility");
		if (story === 2) {
			const token = scene.beginWarmupDraw();
			assert.equal(token.dissolveMaterials.length, 4, "aliases warm once");
			try {
				scene._applyStoryProgress(story);
				scene._showWarmupDrawNodes();
				assert.ok(materials.every(mat => mat.visible));
			} finally { scene.endWarmupDraw(token); }
			assert.ok(materials.every(mat => !mat.visible));
		}
	}
	assert.deepEqual(materials.map(mat => mat.uuid), ids);
	assert.ok(materials.every(mat => mat.userData.uniforms.uDissolve.value === 0));
});

function makeScene() {
	const scene = Object.create(AboutScene.prototype);
	const root = new THREE.Group();
	root.position.set(1.35, 0, 0); root.scale.setScalar(0.9);
	const content = new THREE.Group(); root.add(content);
	const model = new THREE.Group(); model.position.set(3, 2, -1); content.add(model);
	Object.assign(scene, {
		store: { appStarted: true }, _routeActive: true, _mixPreview: false,
		_contentMotionRoot: content, _modelPivot: model,
		_modelPivotLocal: new THREE.Vector3(0.2, 0.1, 0), _dragOrbitTarget: new THREE.Vector3(),
		_motionCenter: new THREE.Vector3(), _motionOffset: new THREE.Vector3(),
		_motionTime: 0, _motionScale: 3, _pointerTiltX: 0, _pointerTiltY: 0,
	});
	return scene;
}

test("hidden story geometry and locale strokes warm without changing the live scene, even after a failed draw", () => {
	const scene = Object.create(AboutScene.prototype);
	scene.threeScene = new THREE.Scene();
	const root = new THREE.Group(); root.visible = false;
	scene.threeScene.add(root);
	const lines = new THREE.Object3D(), points = new THREE.Object3D(), unrelated = new THREE.Object3D();
	root.add(lines, points, unrelated);
	const locales = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
	const letters = locales.flatMap(parent => {
		root.add(parent); parent.visible = false;
		const mesh = new THREE.Object3D(), stroke = new THREE.Object3D();
		parent.add(mesh, stroke); return [mesh, stroke];
	});
	for (const node of [lines, points, unrelated, ...letters]) node.visible = false;
	points.frustumCulled = false;
	scene._particles = { lines, points };
	scene._epicText = { getWarmupObjects: () => letters };
	const targets = [root, lines, points, ...locales, ...letters];
	const before = targets.map(node => [node.visible, node.frustumCulled]);
	const token = scene.beginWarmupDraw();
	assert.equal(token.length, targets.length, "shared parents are stored only once");
	assert.throws(() => {
		try {
			for (const node of targets) node.visible = false; // normal story update
			scene._showWarmupDrawNodes();
			for (const node of targets) { assert.equal(node.visible, true); assert.equal(node.frustumCulled, false); }
			assert.equal(unrelated.visible, false);
			throw new Error("draw failed");
		} finally { scene.endWarmupDraw(token); }
	}, /draw failed/);
	assert.deepEqual(targets.map(node => [node.visible, node.frustumCulled]), before);
	scene._showWarmupDrawNodes();
	assert.deepEqual(targets.map(node => [node.visible, node.frustumCulled]), before, "ordinary frames never force visibility");
});

test("cursor tilt and idle float stay subtle around the model centre without accumulating drift", () => {
	const scene = makeScene();
	const centre = scene.getDragOrbitTarget().clone();
	for (let i = 0; i < 3600; i++) {
		scene._updateModelMotion(1 / 60, { pointer: { x: 1, y: -1 } });
		assert.ok(scene.getDragOrbitTarget().distanceTo(centre) < 0.02);
		assert.ok(Math.abs(scene._contentMotionRoot.rotation.y) < 0.035);
	}
	assert.ok(Math.abs(scene._pointerTiltY - 0.025) < 1e-8);
	const before = scene.getDragOrbitTarget().clone();
	for (let i = 0; i < 60; i++) scene._updateModelMotion(1 / 60, { pointerBlocked: true });
	assert.ok(scene.getDragOrbitTarget().distanceTo(before) > 0.0001, "float continues without cursor motion");
	assert.ok(scene._pointerTiltY < 0.002, "blocked pointer eases back rather than fighting drag/chrome");
});

test("model motion freezes while dormant and under the preloader, preserving its pose", () => {
	const scene = makeScene();
	scene._updateModelMotion(0.016, { pointer: { x: 1, y: 1 } });
	const position = scene._contentMotionRoot.position.clone();
	const rotation = scene._contentMotionRoot.quaternion.clone();
	scene._routeActive = false;
	for (let i = 0; i < 120; i++) scene._updateModelMotion(0.016, { sceneRole: "next", carouselProgress: 0 });
	scene.store.appStarted = false;
	scene._updateModelMotion(0.016, { sceneRole: "current", carouselProgress: 0.6 });
	assert.ok(position.equals(scene._contentMotionRoot.position));
	assert.ok(rotation.equals(scene._contentMotionRoot.quaternion));
});

test("drag orbits the actual model centre and keeps off-axis framing without a first-drag snap", () => {
	const scene = makeScene();
	const target = scene.getDragOrbitTarget().clone();
	const base = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
	base.position.set(0, 3, 12); base.lookAt(0, 2, 0); base.updateMatrixWorld(true);
	const screenCentre = target.clone().project(base);
	const orbit = new SceneDragOrbitController(); orbit.sceneId = "about";
	for (const angle of [0.0006, 0.1, -0.35]) {
		const camera = base.clone();
		orbit.currentOrbit = angle;
		orbit.currentVerticalOrbit = 0.07;
		orbit.apply(camera, "about", { orbitTarget: target, preserveTarget: true });
		assert.ok(target.clone().project(camera).distanceTo(screenCentre) < 1e-9);
		assert.ok(Math.abs(camera.position.distanceTo(target) - base.position.distanceTo(target)) < 1e-9);
		assert.ok(orbit.orbitTarget.equals(target), "pivot must not slide to the view ray");
	}
});
