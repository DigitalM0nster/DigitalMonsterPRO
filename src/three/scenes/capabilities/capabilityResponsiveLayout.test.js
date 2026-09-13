import test from "node:test";
import assert from "node:assert/strict";
import { coreNarrativeLayout } from "./typography/capabilityNarrativeContent.js";
import { getMmk1DetailLayout } from "./mmk1/mmk1HotspotDetailsConfig.js";
import { layoutDistrictHud } from "./city/cityDistrictHudLayout.js";

const viewports = [[330, 568], [360, 640], [480, 800], [640, 960], [768, 1024], [980, 720], [1280, 720], [1440, 900], [1680, 1050], [1920, 1080], [2560, 1440], [640, 330], [844, 390], [1920, 480]];

test("prepared crane text and city cards remain inside the available viewport", () => {
	for (const [width, height] of viewports) {
		const panels = [0, 1, 2, 3, 4].map(index => getMmk1DetailLayout(index, width, height));
		panels.push(layoutDistrictHud(width, height, width / 2, height / 2, {}));
		for (const panel of panels) {
			assert.ok(panel.x >= 0 && panel.y >= 0, `${width}×${height}: negative origin`);
			assert.ok(panel.x + panel.width <= width + .001, `${width}×${height}: horizontal clipping`);
			assert.ok(panel.y + panel.height <= height + .001, `${width}×${height}: vertical clipping`);
		}
		if (width === 330) assert.ok(panels[0].scale * 26 >= 14, "phone body text must remain readable");
	}
});

test("core helper is reachable and does not overlap the title in portrait or short landscape", () => {
	for (const [width, height] of viewports) {
		const box = coreNarrativeLayout(width, height);
		assert.ok(box.x >= 0 && box.x + box.width <= width);
		assert.ok(box.y >= 0 && box.y + box.height <= height);
		assert.ok(box.helperX >= 35 && box.helperX + 244 <= width);
		const helperTop = height - box.helperY - 34;
		const helperLeft = box.helperX - 35;
		assert.ok(box.y + box.height < helperTop || box.x + box.width < helperLeft,
			`${width}×${height}: title overlaps the helper target`);
	}
});
