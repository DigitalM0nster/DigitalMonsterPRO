import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { Mmk1CameraHotspots } from "./Mmk1CameraHotspots.js";
import { getMmk1DetailLayout } from "./mmk1HotspotDetailsConfig.js";

const viewports = [[330, 740], [330, 568], [640, 360], [768, 1024], [1280, 480], [1920, 480]];

function fixture(width, height) {
	const camera = new THREE.PerspectiveCamera(49, width / height, .1, 100);
	camera.position.z = 10; camera.updateMatrixWorld();
	const renderer = { getSize: target => target.set(width, height) };
	const input = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ width, height }) };
	const hotspots = new Mmk1CameraHotspots(new THREE.Scene(), input, { renderer });
	const depth = new THREE.Vector3().project(camera).z;
	const fractions = [[.72, .56], [.74, .57], [1.1, .72], [.18, .18]];
	for (const [i, marker] of hotspots.markers.entries()) marker.userData.anchor.set(fractions[i][0] * 2 - 1, 1 - fractions[i][1] * 2, depth).unproject(camera);
	hotspots.syncCamera(camera);
	return { camera, hotspots };
}

test("compact crane circles stay on actual projected anchors; obscured or offscreen circles cannot be picked", () => {
	for (const [width, height] of viewports) {
		const { camera, hotspots } = fixture(width, height);
		const anchors = hotspots.markers.map(marker => marker.userData.anchor.toArray());
		for (const selectedId of [null, hotspots.markers[3].name, "__overview__"]) {
			hotspots.selectedId = selectedId; hotspots._layoutMarkers(camera);
			for (const marker of hotspots.markers) {
				const projected = marker.userData.anchor.clone().project(camera);
				assert.ok(projected.distanceTo(marker.userData.screenAnchor) < 1e-9, `${width}×${height}: anchor was displaced`);
				if (marker.userData.layoutVisible === false) {
					assert.notEqual(hotspots._pickMarker(camera, projected, width, height), marker, "a culled circle has no ghost hit area");
				} else {
					marker.userData.magnetOffset.set(9, 0); hotspots._positionMarker(marker, camera);
					const displayed = marker.position.clone().project(camera);
					assert.ok(Math.abs((displayed.x - projected.x) * width / 2 - 9) < 1e-7);
					marker.userData.magnetOffset.set(0, 0);
				}
			}
		}
		assert.deepEqual(hotspots.markers.map(marker => marker.userData.anchor.toArray()), anchors);
		assert.equal(hotspots.markers[2].userData.layoutVisible, false, "offscreen detail stays offscreen");
		hotspots.dispose();
	}
});

test("phone and short-height cards leave space for header, native return and bottom dock", () => {
	for (const [width, height] of viewports) {
		for (let index = 0; index < 5; index++) {
			const card = getMmk1DetailLayout(index, width, height), top = height - card.y - card.height;
			assert.ok(top >= (height <= 480 ? 66 : 84));
			assert.ok(card.y >= (height <= 480 ? 50 : 64));
			assert.ok(card.x >= 12 && card.x + card.width <= width - 12);
			if (index !== 4) assert.ok(top >= (height <= 480 ? 116 : 144) - 1e-7);
			if (width === 330 && index !== 4) assert.ok(26 * card.scale >= 14, "phone body retains readable physical size");
		}
	}
});

test("off-axis overview projection is retained by the private camera and eased through close/return flights", () => {
	const { camera, hotspots } = fixture(330, 740);
	camera.projectionMatrix.elements[8] = .42; camera.projectionMatrix.elements[9] = -.18;
	camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
	hotspots.syncCamera(camera);
	assert.equal(hotspots.camera.projectionMatrix.elements[8], .42);
	assert.equal(hotspots.camera.projectionMatrix.elements[9], -.18);
	hotspots._startFlight(hotspots.markers[0].userData.hotspotDefinition, camera);
	hotspots.applyCamera(camera); assert.equal(camera.projectionMatrix.elements[8], .42);
	hotspots.flight.progress = .5; hotspots.applyCamera(camera);
	assert.ok(Math.abs(camera.projectionMatrix.elements[8] - .21) < 1e-9);
	hotspots.flight.progress = 1; hotspots.applyCamera(camera); assert.equal(camera.projectionMatrix.elements[8], 0);
	hotspots.startOverviewFlight(camera, { position: camera.position, quaternion: camera.quaternion, fov: 49, shiftX: .42, shiftY: -.18 });
	hotspots.applyCamera(camera); assert.equal(camera.projectionMatrix.elements[8], 0);
	hotspots.flight.progress = 1; hotspots.applyCamera(camera);
	assert.equal(camera.projectionMatrix.elements[8], .42); assert.equal(camera.projectionMatrix.elements[9], -.18);
	hotspots.dispose();
});

test("mobile close-ups inherit the same live root transform as their crane", () => {
	const { camera, hotspots } = fixture(330, 740);
	const root = new THREE.Group(), model = new THREE.Group(), crane = new THREE.Group();
	root.position.set(0, -2.15, 0); root.scale.setScalar(.72);
	hotspots.modelsParent.add(root); root.add(model); model.add(crane); hotspots.bindToObject(crane);
	const definition = hotspots.markers[1].userData.hotspotDefinition;
	const expected = new THREE.Vector3().fromArray(definition.camera.position).sub(new THREE.Vector3(4.15, -3.18, 0)).applyMatrix4(root.matrixWorld);
	hotspots._startFlight(definition, camera);
	assert.ok(hotspots.toPosition.distanceTo(expected) < 1e-9);
	hotspots.dispose();
});

// Exercise the real framing method without initializing loaders, DOM or WebGL.
const sceneSource = readFileSync(new URL("./Mmk1CapabilityScene.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?$/gm, "").replaceAll("import.meta.env.DEV", "false").replace("export class Mmk1CapabilityScene", "class Mmk1CapabilityScene");
const context = vm.createContext({ THREE, Case3Scene: class {} });
vm.runInContext(`${sceneSource}\nglobalThis.SceneClass = Mmk1CapabilityScene;`, context);

function sceneFixture(width, height) {
	const scene = Object.create(context.SceneClass.prototype), graph = new THREE.Scene();
	const root = new THREE.Group(), model = new THREE.Group(), crane = new THREE.Group();
	graph.add(root); root.add(model); model.add(crane);
	root.position.set(4.15, -3.18, 0); model.position.y = .3; crane.position.set(1.1467, 0, -.4534);
	graph.updateMatrixWorld(true); const reference = crane.matrixWorld.clone();
	if (width <= 768) { root.position.set(0, -2.15, 0); root.scale.setScalar(.72); }
	graph.updateMatrixWorld(true);
	scene.craneMesh = crane; scene._defaultCraneRotationY = 0;
	scene.renderer = { getSize: target => target.set(width, height) };
	scene.getCraneAnchorReferenceMatrix = () => reference;
	scene._responsiveViewport = new THREE.Vector2(); scene._responsiveTowerLocal = new THREE.Vector3();
	scene._responsiveTower = new THREE.Vector3(); scene._responsiveFoot = new THREE.Vector3();
	scene._responsiveCraneMatrix = new THREE.Matrix4(); scene._responsiveCraneRotation = new THREE.Euler(); scene._responsiveCraneQuaternion = new THREE.Quaternion();
	const camera = new THREE.PerspectiveCamera(49, width / height, .1, 100);
	camera.position.set(.3, -2, 8.25); camera.lookAt(1.6, -.2, 1.6); camera.updateMatrixWorld(true);
	return { scene, camera };
}

test("responsive framing uses the approved phone camera and keeps landscape/tablet framing stable", () => {
	for (const [width, height] of viewports) {
		const { scene, camera } = sceneFixture(width, height);
		scene._applyResponsiveOverviewCamera(camera);
		const tower = scene._responsiveTowerLocal.clone().applyMatrix4(scene.craneMesh.matrixWorld).project(camera);
		const foot = new THREE.Vector3().applyMatrix4(scene.craneMesh.matrixWorld).project(camera);
		const span = Math.abs(tower.y - foot.y) / 2;
		assert.ok(span >= .43 && span <= .7, `${width}×${height}: tower occupies ${span} of viewport height`);
		if (width <= 768 && height > width) {
			assert.ok(camera.position.distanceTo(new THREE.Vector3(-2.1304, 2.9855, 6.8661)) < 1e-9);
			assert.ok(1 - Math.abs(camera.quaternion.dot(new THREE.Quaternion(-.042621, -.347981, -.015839, .936398).normalize())) < 1e-12);
			assert.equal(camera.fov, 54.65);
			assert.equal(camera.projectionMatrix.elements[8], 0);
			assert.equal(camera.projectionMatrix.elements[9], 0);
			continue;
		}
		assert.ok(Math.abs((tower.x + 1) / 2 - .72) < 1e-9, `${width}×${height}: crane must stay on the right`);
		const { hotspots } = fixture(width, height);
		for (const marker of hotspots.markers) marker.userData.anchor.fromArray(marker.userData.hotspotDefinition.point);
		hotspots.bindToObject(scene.craneMesh, scene.getCraneAnchorReferenceMatrix()); hotspots.syncCamera(camera);
		assert.equal(hotspots.markers[1].userData.layoutVisible, true, `${width}×${height}: the visible cab remains interactive`);
		hotspots.dispose();
	}
});

test("ordinary desktop author camera and text layout remain unchanged", () => {
	for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]]) {
		const { scene, camera } = sceneFixture(width, height), matrix = camera.projectionMatrix.clone(), position = camera.position.clone();
		scene._applyResponsiveOverviewCamera(camera);
		assert.deepEqual(camera.projectionMatrix.elements, matrix.elements); assert.deepEqual(camera.position, position);
		assert.equal(camera.fov, 49);
		const overview = getMmk1DetailLayout(4, width, height);
		assert.equal(overview.y, Math.max(48, height * .58 - 176));
	}
});
