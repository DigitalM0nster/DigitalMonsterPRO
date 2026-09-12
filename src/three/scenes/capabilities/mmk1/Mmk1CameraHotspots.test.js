import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Mmk1CameraHotspots } from "./Mmk1CameraHotspots.js";
import { advanceHudSnake } from "../../../objects/sceneHud/sceneHudShaders.js";
import { getMmk1DetailLayout } from "./mmk1HotspotDetailsConfig.js";

function createFixture() {
	const scene = new THREE.Scene();
	const input = {
		addEventListener() {},
		removeEventListener() {},
		getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }),
	};
	const camera = new THREE.PerspectiveCamera(49, 1440 / 900, 0.1, 100);
	camera.position.set(4, 3, 18);
	camera.lookAt(4, 2, 0);
	camera.updateMatrixWorld(true);
	const hotspots = new Mmk1CameraHotspots(scene, input);
	const frame = { camera, pointer: { x: 2, y: 2 } };
	hotspots.syncCamera(camera);
	return { scene, camera, hotspots, frame };
}

function assertVisible(hotspots) {
	assert.equal(hotspots.group.visible, true);
	for (const marker of hotspots.markers) {
		assert.equal(marker.visible, true, marker.name);
		assert.ok(marker.material.opacity > 0, marker.name);
		assert.notEqual(marker.material.userData.hotspotUniforms.uReveal?.value, 0);
	}
}

test("crane magnets follow the cursor in screen pixels and keep drawing, labels and hits together", () => {
	const { hotspots, camera, frame } = createFixture();
	const marker = hotspots.markers[0], anchor = marker.userData.anchor.clone();
	const cameraPose = camera.matrixWorld.clone(), material = marker.material;
	const { screenAnchor, magnetOffset, magnetVelocity } = marker.userData;
	frame.pointer = { x: screenAnchor.x + 24 / 720, y: screenAnchor.y + 18 / 450 };
	let labelPosition;
	hotspots.labels = { layout: () => { labelPosition = marker.position.clone(); }, update() {}, dispose() {} };
	hotspots.update(1 / 60, frame);
	assert.equal(hotspots.hovered, marker);
	assert.ok(magnetOffset.length() > 0 && magnetOffset.length() < 9);
	for (let i = 0; i < 60; i++) hotspots.update(1 / 60, frame);
	assert.ok(Math.abs(magnetOffset.length() - 9) < .001);
	const displayed = marker.position.clone().project(hotspots.camera);
	assert.ok(Math.abs((displayed.x - screenAnchor.x) * 720 - magnetOffset.x) < 1e-8);
	assert.ok(Math.abs((displayed.y - screenAnchor.y) * 450 - magnetOffset.y) < 1e-8);
	assert.ok(labelPosition.distanceTo(marker.position) < 1e-9);
	const edge = { x: displayed.x + 30 / 720, y: displayed.y };
	assert.equal(hotspots._pickMarker(hotspots.camera, edge, 1440, 900), marker, "click target follows the displaced circle");
	assert.deepEqual(marker.userData.anchor, anchor, "attraction cannot feed back into the crane anchor");
	assert.deepEqual(camera.matrixWorld.elements, cameraPose.elements);
	assert.ok(hotspots.markers.slice(1).every(m => m.userData.magnetOffset.length() === 0));
	for (const compose of ["screen", "models"]) {
		hotspots.setComposeMode(compose); hotspots.syncCamera(camera);
		assert.ok(marker.position.distanceTo(labelPosition) < 1e-9);
	}
	hotspots.setPointerState({ pointerDown: true });
	hotspots.update(1 / 60, frame);
	assert.ok(magnetOffset.length() > 0 && magnetOffset.length() < 9, "dragging eases back to the anchor");
	for (let i = 0; i < 60; i++) hotspots.update(1 / 60, { ...frame, pointerBlocked: true });
	assert.equal(magnetOffset.length(), 0); assert.equal(magnetVelocity.length(), 0);
	assert.equal(marker.material, material);
	assertVisible(hotspots);
	hotspots.dispose();
});

test("hover text reverses from its current letter phase and settles in both directions", () => {
	let progress = advanceHudSnake(0, true, 0.46);
	assert.ok(Math.abs(progress - 0.4) < 1e-9);
	const leaving = advanceHudSnake(progress, false, 0.096);
	assert.ok(Math.abs(leaving - 0.2) < 1e-9);
	progress = advanceHudSnake(leaving, true, 0.115);
	assert.ok(Math.abs(progress - 0.3) < 1e-9);
	assert.equal(advanceHudSnake(progress, true, 2), 1);
	assert.equal(advanceHudSnake(progress, false, 1), 0);
});

test("screen composition and hex baking reuse all crane markers at a fixed pixel size", () => {
	const { hotspots, scene, camera } = createFixture();
	const markers = [...hotspots.markers];
	const pixelSize = () => hotspots.markers[0].scale.x * hotspots.viewport.y
		/ (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
	assert.ok(Math.abs(pixelSize() - 72) < 1e-9);
	hotspots.setComposeMode("screen");
	assert.equal(hotspots.group.parent, hotspots.overlayScene);
	hotspots.viewport.set(390, 844);
	camera.fov = 65;
	camera.aspect = 390 / 844;
	hotspots.syncCamera(camera);
	assert.ok(Math.abs(pixelSize() - 72) < 1e-9);
	hotspots.setComposeMode("models");
	assert.equal(hotspots.group.parent, scene);
	assert.deepEqual(hotspots.markers, markers);
	assertVisible(hotspots);
	hotspots.dispose();
});

test("only the selected marker fades out, cannot be picked again, and returns without recreation", () => {
	const { hotspots, camera, frame } = createFixture();
	const materials = hotspots.markers.map((marker) => marker.material);
	for (const index of [0, 1, 0, 3, 2]) {
		hotspots.pendingMarker = hotspots.markers[index];
		hotspots.update(1 / 60, frame);
		assert.ok(hotspots.markers[index].material.opacity > 0);
		assert.ok(hotspots.markers[index].material.opacity < 1);
		for (let tick = 0; tick < 100; tick += 1) {
			hotspots.update(1 / 60, frame);
		}
		assert.equal(hotspots.selectedId, hotspots.markers[index].name);
		for (const [i, marker] of hotspots.markers.entries()) assert.equal(marker.material.opacity, i === index ? 0 : 1);
		const point = hotspots.markers[index].position.clone().project(camera);
		assert.notEqual(hotspots._pickMarker(camera, point, 1440, 900), hotspots.markers[index]);
	}
	hotspots.startOverviewFlight(camera, camera);
	assert.equal(hotspots.markers[2].material.opacity, 0);
	for (let tick = 0; tick < 100; tick += 1) {
		hotspots.update(1 / 60, frame);
		assertVisible(hotspots);
	}
	assert.equal(hotspots.selectedId, null);
	assert.deepEqual(hotspots.markers.map((marker) => marker.material), materials);
	hotspots.dispose();
});

test("details and overview fit desktop, tablet, mobile and short landscape viewports", () => {
	for (const [width, height] of [[1440, 900], [1024, 768], [768, 500], [390, 844], [320, 568], [844, 390]]) {
		for (let index = 0; index < 5; index++) {
			const panel = getMmk1DetailLayout(index, width, height);
			assert.ok(panel.x >= 0 && panel.y >= 0);
			assert.ok(panel.x + panel.width <= width, `${index}: width ${width}`);
			assert.ok(panel.y + panel.height <= height, `${index}: height ${height}`);
		}
	}
});

test("warmup, blocked input and dormant reset never hide crane markers", () => {
	const { hotspots, scene, frame } = createFixture();
	assert.equal(hotspots.group.parent, scene);
	assertVisible(hotspots);
	for (const blockedFrame of [
		{ ...frame, interactionEnabled: false },
		{ ...frame, pointerBlocked: true },
	]) {
		hotspots.pendingMarker = hotspots.markers[0];
		hotspots.update(1 / 60, blockedFrame);
		assertVisible(hotspots);
		assert.equal(hotspots.active, false);
		assert.equal(hotspots.selectedId, null);
	}
	hotspots.update(1 / 60, frame, { interactionEnabled: false });
	assertVisible(hotspots);
	assert.equal(hotspots.active, false);
	hotspots.reset();
	assertVisible(hotspots);
	hotspots.update(1 / 60, frame);
	assertVisible(hotspots);
	assert.equal(hotspots.active, true);
	hotspots.dispose();
});

test("markers retain crane anchors and a private camera through another scene pass", () => {
	const { hotspots, camera, frame, scene } = createFixture();
	const crane = new THREE.Group();
	scene.add(crane);
	hotspots.bindToObject(crane);
	const anchorBefore = hotspots.markers[0].userData.anchor.clone();
	crane.position.x = 0.3;
	crane.rotation.y = 0.08;
	crane.updateMatrixWorld(true);
	const expected = anchorBefore.applyMatrix4(crane.matrixWorld);
	hotspots.syncCamera(camera);
	const cameraBefore = hotspots.camera.position.clone();
	camera.position.set(-100, 80, -90);
	camera.lookAt(0, 0, 0);
	camera.updateMatrixWorld(true);
	hotspots.update(1 / 60, { ...frame, interactionEnabled: false });
	assertVisible(hotspots);
	assert.ok(hotspots.markers[0].userData.anchor.distanceTo(expected) < 1e-9);
	assert.ok(hotspots.camera.position.distanceTo(cameraBefore) < 1e-9);
	hotspots.dispose();
});
