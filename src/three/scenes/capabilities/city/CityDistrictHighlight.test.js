import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { CityDistrictHighlight } from "./CityDistrictHighlight.js";
import { bindCityDistrictWindows } from "./cityDistrictWindows.js";

const ring = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const data = {
	districts: [
		{ anchor: [1, 4, 1], contours: [{ outer: ring(0, 0, 5, 5), holes: [ring(2, 2, 3, 3)] }], buildings: [[0.5, 0, 0.5, 1.5, 3, 1.5]] },
		{ anchor: [8.5, 7, 1.5], contours: [{ outer: ring(7, 0, 12, 5), holes: [] }], buildings: [[8, 0, 1, 9, 6, 2]] },
	],
	positions: [0, 0.155, 0, 0, 0.155, 5, 5, 0.155, 0], ids: [0, 0, 0], kinds: [0, 0, 0],
};

const renderer = { getSize: target => target.set(1920, 1080) };
const cameraAt = (x = 5, z = 1) => {
	const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, .1, 1000);
	camera.position.set(x, 10, z + 15); camera.lookAt(x, 3, z); camera.updateMatrixWorld();
	return camera;
};
const markerPointer = (markers, id) => new THREE.Vector2(markers.points[id].x / 960 - 1, markers.points[id].y / 540 - 1);

test("only visible circles open cards; building facades and paving do not", () => {
	const highlight = new CityDistrictHighlight(data, renderer), camera = cameraAt();
	const markers = highlight.markers;
	markers.project(camera);
	assert.equal(markers.count, 2);
	for (const id of [0, 1]) {
		const pointer = markerPointer(markers, id);
		assert.equal(highlight.update(1 / 60, { camera, pointer }, true), true);
		assert.equal(highlight.hovered, id);
		assert.deepEqual(highlight.focus.toArray(), markers.anchors[id].toArray());
	}
	for (const point of [[1, 1.5, 1], [8.5, 3, 1.5], [4, .15, 4]]) {
		const p = new THREE.Vector3(...point).project(camera);
		highlight.update(1 / 60, { camera, pointer: new THREE.Vector2(p.x, p.y) }, true);
		assert.equal(highlight.hovered, -1, "a district surface must not be a hover target");
	}
	highlight.dispose();
});

test("blocked input fades the current district without reallocating prepared resources", () => {
	const highlight = new CityDistrictHighlight(data, renderer), levels = highlight.levels;
	const geometry = highlight.mesh.geometry, material = highlight.mesh.material;
	highlight.hovered = 0; levels[0] = 1;
	assert.equal(highlight.update(0.05, null, false), false);
	assert.equal(highlight.hovered, -1);
	assert.ok(levels[0] > 0 && levels[0] < 1);
	for (let i = 0; i < 40; i++) highlight.update(0.05, null, false);
	assert.equal(levels[0], 0);
	highlight.beginWarmupDraw(); assert.ok(levels.every(value => value > 0));
	highlight.endWarmupDraw(); assert.ok(levels.every(value => value === 0));
	assert.equal(highlight.mesh.geometry, geometry); assert.equal(highlight.mesh.material, material);
	assert.equal(material.uniforms.uLevels.value, levels);
	let disposed = 0;
	geometry.addEventListener("dispose", () => disposed++);
	material.addEventListener("dispose", () => disposed++);
	highlight.dispose(); assert.equal(disposed, 2);
});

test("circle hits track every frame and respect dragging and chrome ownership", () => {
	const highlight = new CityDistrictHighlight(data, renderer), camera = cameraAt();
	const markers = highlight.markers;
	markers.project(camera);
	const pointer = markerPointer(markers, 0), frame = { camera, pointer, pointerDown: false };
	const geometry = markers.mesh.geometry, material = markers.mesh.material, visible = markers.visible;
	for (let i = 0; i < 120; i++) {
		pointer.x = markers.points[0].x / 960 - 1 + (i % 2 ? 0 : 40 / 960);
		highlight.update(1 / 120, frame, true);
		assert.equal(highlight.hovered, i % 2 ? 0 : -1, "circle hits must not wait for a throttled raycast");
	}
	highlight.update(1 / 120, frame, false); assert.equal(highlight.hovered, -1);
	frame.pointerDown = true;
	highlight.update(1 / 120, frame, true); assert.equal(highlight.hovered, -1);
	assert.equal(markers.mesh.geometry, geometry); assert.equal(markers.mesh.material, material); assert.equal(markers.visible, visible);
	let disposed = 0;
	geometry.addEventListener("dispose", () => disposed++); material.addEventListener("dispose", () => disposed++);
	highlight.dispose(); assert.equal(disposed, 2);
});

test("overlapping, distant and offscreen markers cannot be hovered", () => {
	const crowded = { ...data, districts: [...data.districts, { ...data.districts[0], kind: "park" }] };
	const highlight = new CityDistrictHighlight(crowded, renderer), markers = highlight.markers;
	markers.anchors[2].copy(markers.anchors[0]);
	markers.project(cameraAt());
	assert.equal(markers.visible[0], 0); assert.equal(markers.visible[2], 1, "park retains priority in a crowded view");
	assert.equal(markers.pick(markerPointer(markers, 0)), 2);
	const camera = cameraAt(); camera.position.z += 100; camera.updateMatrixWorld();
	markers.project(camera); assert.equal(markers.count, 0);
	assert.equal(markers.pick(new THREE.Vector2()), -1);
	camera.position.z = -14; camera.lookAt(5, 10, -100); camera.updateMatrixWorld();
	markers.project(camera); assert.equal(markers.count, 0, "markers behind the camera are hidden");
	highlight.dispose();
});

test("authored quarters contain four or five buildings and retain prepared anchors", () => {
	const file = new URL("../../../../../public/models/posibility5/city-districts.json", import.meta.url);
	const data = JSON.parse(readFileSync(file));
	assert.equal(data.version, 2);
	assert.ok(data.districts.length > 50);
	for (const district of data.districts) {
		assert.ok([4, 5].includes(district.buildings.length), district.name);
		assert.ok(district.anchor.every(Number.isFinite));
		assert.ok(["office", "mixed", "residential"].includes(district.kind));
	}
	assert.ok(data.ids.every(id => id >= 0 && id < data.districts.length));
});

test("both parks retain their own visible marker above the central sculpture", () => {
	const source = JSON.parse(readFileSync(new URL("../../../../../public/models/posibility5/city-districts.json", import.meta.url)));
	const highlight = new CityDistrictHighlight(source, renderer);
	assert.equal(source.districts.length, 85, "preparing park overlays must not mutate the source");
	assert.equal(highlight.districts.length, 87); assert.equal(highlight.buildings.length, 396);
	assert.equal(highlight.mesh.geometry.attributes.position.count / 3 - source.ids.length / 3, 720);
	for (const [id, park] of highlight.districts.entries()) {
		if (park.kind !== "park") continue;
		const [x, , z] = park.anchor, markers = highlight.markers;
		markers.project(cameraAt(x, z));
		assert.equal(markers.visible[id], 1);
		assert.ok(markers.anchors[id].y > 4.72, "circle clears the top of the monument");
		assert.equal(markers.pick(markerPointer(markers, id)), id);
	}
	highlight.dispose();
});

test("window focus identifies instances independently while preserving shared draw geometry", () => {
	const highlight = new CityDistrictHighlight(data, renderer), model = new THREE.Group();
	const geometry = new THREE.BoxGeometry(1, 3, 1).translate(1, 1.5, 1);
	const material = new THREE.MeshBasicMaterial(); material.name = "CityArchitectural-office";
	const mesh = new THREE.InstancedMesh(geometry, material, 2);
	mesh.setMatrixAt(0, new THREE.Matrix4());
	mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(7.5, 0, 0));
	model.add(mesh); bindCityDistrictWindows(model, highlight);
	assert.equal(mesh.geometry, geometry);
	assert.equal(mesh.count, 2);
	assert.deepEqual(Array.from(geometry.attributes.aCityDistrict.array), [0, 1]);
	assert.equal(geometry.attributes.aCityDistrict.isInstancedBufferAttribute, true);
	highlight.dispose(); mesh.dispose(); geometry.dispose(); material.dispose();
});
