import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("carousel diagnostics reuse identities at rest and publish changing scene values", () => {
	const source = readFileSync(new URL("./DigitalMonsterThreeApp.js", import.meta.url), "utf8");
	const method = source.slice(source.indexOf("\t_syncCarouselRenderState() {"), source.indexOf("\n\tsetPixelRatio(dpr)"))
		.replaceAll("import.meta.env.DEV", "true");
	let ids = ["about"], progress = 0, active = true;
	const carousel = {
		currentId: "about", previousId: "portfolioHub", nextId: "contacts", progress: 0, progressTarget: 0,
		getActiveSceneIds: () => ids.slice(), getSceneProgress: () => progress,
		getSceneProgressTarget: () => 1, getSceneProgressRole: () => "current",
		isInteractionLocked: () => false, getHexNavigationPhase: () => "idle", getHexTargetSceneId: () => null,
	};
	const Subject = vm.runInNewContext(`(class {${method}})`, { getSceneCarousel: () => carousel, CAROUSEL_SCENE_IDS: ["about", "contacts"] });
	const app = Object.assign(new Subject(), {
		store: { sceneCarouselRenderingIds: [], sceneCarouselSceneProgress: {} },
		sceneManager: { isCarouselHubActive: () => active }, _getHexShaderProgress: () => progress,
	});
	app._syncCarouselRenderState();
	const renderedIds = app.store.sceneCarouselRenderingIds;
	const snapshot = app.store.sceneCarouselSceneProgress;
	const entry = snapshot.about;
	for (let i = 0; i < 120; i++) app._syncCarouselRenderState();
	assert.equal(app.store.sceneCarouselRenderingIds, renderedIds);
	assert.equal(app.store.sceneCarouselSceneProgress, snapshot);
	assert.equal(snapshot.about, entry);
	progress = .6; ids = ["about", "contacts"];
	app._syncCarouselRenderState();
	assert.equal(snapshot.about, entry);
	assert.equal(entry.sceneProgress, .6);
	assert.equal(app.store.sceneCarouselRenderingIds.join(), "about,contacts");
	assert.equal(app.store.sceneCarouselRenderMode, "mix");
	progress = 0; app._syncCarouselRenderState();
	assert.equal(entry.sceneProgress, 0);
	active = false; app._syncCarouselRenderState();
	const empty = app.store.sceneCarouselRenderingIds;
	app._syncCarouselRenderState();
	assert.equal(app.store.sceneCarouselRenderingIds, empty);
});
