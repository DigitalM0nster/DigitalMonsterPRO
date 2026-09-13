import test from "node:test";
import assert from "node:assert/strict";
import { filmProjects } from "./data/filmProjects.js";
import { filmProjectInfo } from "./data/filmProjectInfo.js";
import { resolveFilmInfoPresentation, resolveFilmPresentation } from "./filmPresentationLayout.js";
import { attachFilmInfoView, updateFilmInfoView } from "./filmInteraction.js";

test("a mounted info control immediately adopts the scene frame; stale cleanup cannot detach its replacement", () => {
	const frame = { opacity: .6, anchorX: 640, anchorY: 630, clipTop: 400, clipBottom: 0 };
	updateFilmInfoView(frame);
	const first = [], second = [];
	const detachFirst = attachFilmInfoView(value => first.push(value));
	assert.deepEqual(first, [frame], "no route-mounted frame waiting at the default origin");
	const detachSecond = attachFilmInfoView(value => second.push(value));
	detachFirst();
	updateFilmInfoView({ opacity: 0 });
	assert.deepEqual(second, [frame, { opacity: 0 }]);
	assert.deepEqual(first, [frame]); detachSecond();
});

test("all published videos have complete localized information and the approved summary", () => {
	for (const project of filmProjects) for (const locale of ["ru", "en", "zh"]) {
		const content = filmProjectInfo[project.id][locale];
		for (const key of ["summary", "purpose", "solution"]) assert.ok(content[key]?.trim(), `${project.id}/${locale}/${key}`);
		assert.equal(locale === "ru" ? project.detail : project[locale], content.summary);
		assert.equal(content.result, undefined, "No measured outcome is claimed without evidence");
	}
});

test("desktop information fits within the projected screen and follows the caption", () => {
	const projection = { left: 240, right: 1050, top: 180, bottom: 540, anchorX: 644, anchorY: 652 };
	const card = resolveFilmInfoPresentation(1280, 720, projection);
	assert.ok(card.left > projection.left && card.left + card.width < projection.right);
	assert.ok(card.top > projection.top && card.top + card.height < projection.bottom);
	assert.equal(card.anchorX, projection.anchorX);
	assert.equal(card.anchorY, projection.anchorY);
});

test("compact information remains readable and reachable in portrait and short landscape viewports", () => {
	for (const [width, height] of [[330, 568], [390, 844], [768, 1024], [844, 390], [1280, 360]]) {
		const card = resolveFilmInfoPresentation(width, height);
		const layout = resolveFilmPresentation(width, height);
		assert.ok(card.left >= 12 && card.left + card.width <= width - 12);
		assert.ok(card.top >= 64 && card.top + card.height <= height - 70);
		assert.ok(card.anchorY + 22 <= height && card.anchorY >= layout.panel.top);
		assert.ok(card.height >= 100);
	}
});
