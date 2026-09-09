import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { CityDistrictHud } from "./CityDistrictHud.js";
import { layoutDistrictHud } from "./cityDistrictHudLayout.js";
import { CITY_HUD_STATE_COUNT, createDistrictHudContent, districtHudState, districtHudMetrics } from "./cityDistrictHudContent.js";

test("nearby cards fit the scene viewport without covering the hovered point", () => {
	for (const [width, height] of [[1920, 1080], [1024, 768], [390, 844], [320, 568], [844, 390]]) {
		const left = width < 700 ? 16 : 128, right = width < 700 ? 12 : 132;
		const top = height - (width < 700 ? 16 : 72);
		for (const x of [left + 8, (width + left - right) / 2, width - right - 8]) {
			for (const y of [36, height / 2, height - 84]) {
				const p = layoutDistrictHud(width, height, x, y, {});
				assert.ok(p.x >= left && p.x + p.width <= width - right + .001);
				assert.ok(p.y >= 24 && p.y + p.height <= top + .001);
				const dx = Math.max(p.x - x, x - p.x - p.width, 0);
				const dy = Math.max(p.y - y, y - p.y - p.height, 0);
				if (width >= 700) {
					assert.ok(Math.hypot(dx, dy) >= 20, `card covers hover at ${width}×${height}: ${x}, ${y}`);
					assert.ok(Math.hypot(dx, dy) < 90, "card drifted away from its focus");
				} else {
					assert.equal(p.y + p.height, top, "narrow card must clear the navigation arc");
				}
			}
		}
	}
});

test("copy reflects building proportions and remains bounded to a reusable atlas", () => {
	const district = (kind, heights) => ({ kind, buildings: heights.map(h => [0, 0, 0, 3, h, 3]) });
	assert.equal(districtHudState(district("office", [6, 8, 9, 25])), 0);
	assert.equal(districtHudState(district("mixed", [6, 8, 9, 25])), 1);
	assert.equal(districtHudState(district("residential", [3, 4, 5, 6, 11])), 2);
	assert.equal(districtHudState(district("residential", [3, 4, 4, 5])), 3);
	assert.equal(districtHudState(district("mixed", [12, 14, 15, 17])), 4);
	const content = createDistrictHudContent();
	assert.equal(content.length, 3);
	assert.ok(content.every(locale => locale.length === CITY_HUD_STATE_COUNT));
	const data = JSON.parse(readFileSync(new URL("../../../../../public/models/posibility5/city-districts.json", import.meta.url)));
	for (const quarter of data.districts) {
		const state = districtHudState(quarter);
		assert.ok(state >= 0 && state < CITY_HUD_STATE_COUNT);
		assert.equal(districtHudMetrics(quarter).count, quarter.buildings.length);
	}
	const metrics = districtHudMetrics(district("mixed", [3, 6, 9, 12]));
	assert.deepEqual(Array.from(metrics.heights), [.25, .5, .75, 1, 0]);
	const park = { kind: "park", parkIndex: 0, buildings: [] };
	assert.equal(districtHudState(park), 5);
	assert.equal(districtHudMetrics(park).count, 4);
	assert.ok(content[0][5][1].text.includes("МАЯК"));
});

test("slow subpixel camera movement does not stall either end of the leader", () => {
	// Exercise the real layout without constructing browser-only atlas resources.
	const uniforms = {};
	for (const name of ["uViewport", "uOrigin", "uStart", "uEnd"]) uniforms[name] = { value: new THREE.Vector2() };
	for (const name of ["uOnscreen", "uScale", "uReveal"]) uniforms[name] = { value: 1 };
	const hud = Object.assign(Object.create(CityDistrictHud.prototype), {
		uniforms, parent: new THREE.Group(), viewport: new THREE.Vector2(), projected: new THREE.Vector3(),
		localAnchor: new THREE.Vector3(),
		origin: new THREE.Vector2(), placement: { side: 0 }, pixelRatio: 1,
		follow: 1 - Math.exp(-18 / 120), layoutPending: true,
	});
	const renderer = { getSize: target => target.set(1920, 1080) };
	const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, .1, 100);
	camera.position.z = 10; camera.updateMatrixWorld();
	const anchorAt = x => hud.localAnchor.set(x / 960 - 1, 600 / 540 - 1, 0).unproject(camera);
	anchorAt(500); hud.layout(renderer, camera);
	let previous = uniforms.uStart.value.x, initial = previous;
	for (let i = 1; i <= 120; i++) {
		anchorAt(500 + i * .05);
		hud.layoutPending = true; hud.layout(renderer, camera);
		assert.ok(uniforms.uStart.value.x > previous, "line must continue moving below the text pixel grid");
		assert.ok(Math.abs(uniforms.uEnd.value.x - (500 + i * .05)) < .00001);
		previous = uniforms.uStart.value.x;
	}
	assert.ok(previous - initial > 5.5);
});
