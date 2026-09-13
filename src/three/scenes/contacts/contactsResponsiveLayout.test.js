import test from "node:test";
import assert from "node:assert/strict";
import { resolveContactsResponsiveLayout, resolveContactsResponsiveHit } from "./contactsResponsiveLayout.js";

test("compact contacts keeps all eight 44px link targets inside the safe viewport", () => {
	for (const [width, height] of [[330, 568], [480, 800], [640, 360], [768, 1024], [980, 640], [1280, 480], [1920, 480]]) {
		const layout = resolveContactsResponsiveLayout(width, height);
		assert.ok(layout, `${width}×${height}`);
		assert.ok(layout.rowHeight >= 44);
		assert.ok(layout.listX >= 16 && layout.listX + layout.listWidth <= width - 16);
		assert.ok(layout.listY >= layout.top);
		assert.ok(layout.listY + layout.listHeight <= height - layout.bottom);
		for (let index = 0; index < 8; index++) {
			const x = layout.listX + (index % layout.columns + 0.5) * layout.listWidth / layout.columns;
			const y = layout.listY + (Math.floor(index / layout.columns) + 0.5) * layout.rowHeight;
			assert.equal(resolveContactsResponsiveHit(layout, x, y), index);
		}
		assert.equal(resolveContactsResponsiveHit(layout, 0, 0), -1);
		assert.equal(resolveContactsResponsiveHit(layout, width, height), -1);
	}
});

test("normal desktop contacts uses its original authored layout", () => {
	for (const size of [[1280, 720], [1440, 900], [1680, 1050], [1920, 1080], [2560, 1440]]) {
		assert.equal(resolveContactsResponsiveLayout(...size), null);
	}
});
