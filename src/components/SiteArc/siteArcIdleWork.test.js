import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("compact orbit skips layout work and resynchronizes when resized to desktop", () => {
	const source = readFileSync(new URL("./three/siteArcHost.js", import.meta.url), "utf8");
	const fn = source.slice(source.indexOf("export function syncSiteArcOverlay(" )).replace("export ", "");
	let builds = 0, currentAngle = 1;
	const sync = vm.runInNewContext(`${fn}\nsyncSiteArcOverlay`, {
		getSiteArcViewportOpacity: (w, h) => w <= 1024 || h <= 600 ? 0 : 1,
		isSiteArcNavigationActive: () => true,
		buildSiteArcGpuState: () => { builds++; return { introOpacity: 1, angle: currentAngle }; },
	});
	const arc = { visible: true, setVisible(v) { this.visible = v; }, syncState(s) { this.state = s; }, setComposeMode() {} };
	for (let i = 0; i < 120; i++) sync(arc, { viewportW: 980, viewportH: 800 });
	assert.equal(builds, 0); assert.equal(arc.visible, false);
	sync(arc, { viewportW: 1920, viewportH: 480 });
	assert.equal(builds, 0);
	currentAngle = 3;
	sync(arc, { viewportW: 1920, viewportH: 1080 });
	assert.equal(builds, 1); assert.equal(arc.visible, true); assert.equal(arc.state.angle, 3);
});

test("glow reuses its live reduced-motion query and does no query work at rest", () => {
	const source = readFileSync(new URL("./siteArcGlowMotion.js", import.meta.url), "utf8")
		.replace(/^import[^;]+;/gm, "").replaceAll("export ", "");
	let queries = 0;
	const query = { matches: false };
	const glow = vm.runInNewContext(`${source}\n({syncArcGlowTargetFromActive,tickArcGlowMotion,getArcGlowCenterAngleRad})`, {
		getGraphicsTier: () => "medium", window: { matchMedia() { queries++; return query; } },
	});
	glow.syncArcGlowTargetFromActive(0);
	for (let i = 0; i < 120; i++) glow.tickArcGlowMotion(.016);
	assert.equal(queries, 0);
	glow.syncArcGlowTargetFromActive(2);
	for (let i = 0; i < 10; i++) glow.tickArcGlowMotion(.016);
	assert.equal(queries, 1);
	assert.ok(glow.getArcGlowCenterAngleRad() < 2);
	query.matches = true;
	glow.tickArcGlowMotion(.016);
	assert.equal(glow.getArcGlowCenterAngleRad(), 2);
	assert.equal(queries, 1);
});
