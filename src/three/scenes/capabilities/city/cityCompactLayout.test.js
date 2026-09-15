import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CityWorldTitle } from "./CityWorldTitle.js";
import { CityDistrictMarkers } from "./CityDistrictMarkers.js";
import { coreNarrativeLayout } from "../typography/capabilityNarrativeContent.js";
import { layoutDistrictHud } from "./cityDistrictHudLayout.js";

function titleAt(width, height) {
	const title = Object.assign(Object.create(CityWorldTitle.prototype), {
		viewport: new THREE.Vector2(width, height), lastAspect: -1,
		anchor: new THREE.Vector3(), inverseParent: new THREE.Matrix4(),
		parent: new THREE.Group(), baseScale: new THREE.Vector3(1, 1, 1),
		mesh: new THREE.Object3D(), uniforms: {
			uScreen: { value: false }, uCompact: { value: 0 },
			uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() },
		},
	});
	title.mesh.material = {};
	title.layout(width / height);
	return title.uniforms;
}

test("compact city captions preserve portrait size and leave the right landscape half free", () => {
	for (const [w, h] of [[330, 568], [480, 800], [768, 1024], [980, 740], [1024, 768], [640, 360], [844, 390], [980, 480]]) {
		const u = titleAt(w, h), landscape = h <= 480 && w > h;
		assert.equal(u.uScreen.value, true);
		assert.equal(u.uCompact.value, 1);
		assert.equal(u.uOrigin.value.x, 12);
		assert.equal(u.uOrigin.value.y, h <= 480 ? 66 : 84);
		assert.equal(u.uSize.value.x, landscape ? Math.min(380, w * .48 - 24) : Math.min(560, w - 24));
		assert.equal(u.uSize.value.y, u.uSize.value.x / 4);
		if (landscape) assert.ok(u.uOrigin.value.x + u.uSize.value.x < w * .48);
	}
	assert.equal(titleAt(1920, 1080).uScreen.value, false);
});

test("compact city circles clear the actual caption and keep shader, hit and leader endpoints identical", () => {
	for (const [w, h] of [[330, 568], [330, 740], [480, 800], [768, 1024], [980, 740], [640, 360], [844, 390], [980, 480]]) {
		const camera = new THREE.PerspectiveCamera(40, w / h, .1, 1000);
		camera.position.z = 10; camera.updateMatrixWorld();
		const depth = new THREE.Vector3().project(camera).z;
		const districts = [[.22, .40], [.46, .51], [.77, .43], [.82, .65], [.22, .73]].map(([x, y], i) => {
			const anchor = new THREE.Vector3(x * 2 - 1, 1 - y * 2, depth).unproject(camera);
			anchor.y -= 1.2;
			return { name: ["quarter-28", "quarter-27", "quarter-04", "quarter-26", "quarter-24"][i], anchor: anchor.toArray() };
		});
		const renderer = { getSize: target => target.set(w, h) };
		const markers = new CityDistrictMarkers(districts, new Float32Array(districts.length), renderer, new THREE.Matrix4());
		const anchors = markers.anchors.map(anchor => anchor.toArray());
		const u = titleAt(w, h), caption = { left: u.uOrigin.value.x, top: u.uOrigin.value.y,
			right: u.uOrigin.value.x + u.uSize.value.x, bottom: u.uOrigin.value.y + u.uSize.value.y };
		markers.project(camera);
		assert.ok(markers.count >= 2, `${w}×${h}: keep multiple districts reachable`);
		for (let i = 0; i < markers.count; i++) {
			const id = markers.accepted[i], point = markers.points[id], y = h - point.y;
			assert.ok(point.x - 36 >= caption.right + 7.99 || y - 36 >= caption.bottom + 7.99,
				`${w}×${h}: circle overlaps the prepared caption`);
			assert.ok(y - 36 >= (h <= 480 ? 66 : 84), "circle clears the header safe area");
			assert.ok(y + 36 <= h - (h <= 480 ? 56 : 84), "circle clears the dock reservation");
			const pointer = new THREE.Vector2(point.x / w * 2 - 1, point.y / h * 2 - 1);
			assert.equal(markers.pick(pointer), id);
			const projected = markers.anchors[id].clone().project(camera);
			assert.ok(Math.abs((projected.x + 1) * w / 2 + markers.offsets[id].x - point.x) < .001);
			assert.ok(Math.abs((projected.y + 1) * h / 2 + markers.offsets[id].y - point.y) < .001);
			assert.ok(Math.abs(markers.markerState[id * 4] - markers.offsets[id].x) < .001);
			assert.ok(Math.abs(markers.markerState[id * 4 + 1] - markers.offsets[id].y) < .001);
		}
		const states = Array.from(markers.markerState);
		markers.project(camera);
		assert.deepEqual(Array.from(markers.markerState), states, "placement must not accumulate on repeated draws");
		assert.deepEqual(markers.anchors.map(anchor => anchor.toArray()), anchors, "3D anchors retain their authored positions");
		markers.reset();
		assert.ok(markers.offsets.every(offset => offset.lengthSq() === 0));
		assert.ok(markers.magnetOffsets.every(offset => offset.lengthSq() === 0));
		markers.dispose();
	}
});

test("Core centers the left composition while preserving the portrait headline", () => {
	for (const w of [1280, 1920]) for (const h of [360, 480, 481, 500, 559, 560, 600]) {
		const layout = coreNarrativeLayout(w, h);
		if (h >= 560) assert.equal(layout.y, h * .35);
		else {
			assert.ok(layout.y >= 66);
			assert.ok(Math.abs(layout.y + (layout.height + 88) / 2 - h / 2) < 1 || layout.y === 66);
		}
	}
	for (const [w, h] of [[330, 568], [768, 1024], [980, 740], [640, 360], [980, 480]]) {
		const layout = coreNarrativeLayout(w, h);
		if (h > w) assert.equal(layout.y, 84);
		else assert.ok(Math.abs(layout.y + (layout.height + 88) / 2 - h / 2) < 1);
	}
});

test("City district cards share the new caption top and remain inside the viewport", () => {
	for (const [w, h] of [[330, 568], [768, 1024], [980, 740], [640, 360], [980, 480]]) {
		const card = layoutDistrictHud(w, h, w * .55, h * .5, {});
		assert.ok(Math.abs(h - card.y - card.height - (h <= 480 ? 66 : 84)) < 1e-8);
		assert.ok(card.x >= 12 && card.x + card.width <= w - 12);
		assert.ok(card.y >= (h < 480 ? 62 : 92));
	}
});

test("city circles cross the caption corner continuously during slow camera-relative motion", () => {
	const w = 640, h = 360, camera = new THREE.PerspectiveCamera(40, w / h, .1, 1000);
	camera.position.z = 10; camera.updateMatrixWorld();
	const depth = new THREE.Vector3().project(camera).z;
	const markers = new CityDistrictMarkers([{ name: "quarter-28", anchor: [0, -1.2, 0] }], new Float32Array(1),
		{ getSize: target => target.set(w, h) }, new THREE.Matrix4());
	let previous = null;
	for (let x = 310; x <= 450; x++) {
		markers.anchors[0].set(x / w * 2 - 1, 1 - 144 / h * 2, depth).unproject(camera);
		markers.project(camera);
		assert.equal(markers.count, 1);
		if (previous) assert.ok(markers.points[0].distanceTo(previous) < 2, "one-pixel motion must not switch the circle to another side");
		previous = markers.points[0].clone();
	}
	markers.dispose();
});
