import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SceneTextLocale } from "./sceneTextLocale.js";
import { CapabilityNarrative } from "./CapabilityNarrative.js";
import { CityWorldTitle } from "../city/CityWorldTitle.js";
import { Mmk1HotspotDetails } from "../mmk1/Mmk1HotspotDetails.js";
import { Mmk1HotspotLabels } from "../mmk1/Mmk1HotspotLabels.js";
import { SyntheticCoreHud } from "../placeholders/SyntheticCoreHud.js";
import { CityDistrictHud } from "../city/CityDistrictHud.js";

const uniforms = (...names) => Object.fromEntries(names.map(name => [name, { value: 0 }]));
const instance = (Owner, values) => Object.assign(Object.create(Owner.prototype), values);

function title(variant) {
	const city = variant === "spatialMatrix";
	const owner = instance(city ? CityWorldTitle : CapabilityNarrative, {
		variant, elapsed: 1.7, warming: false, localeMotion: new SceneTextLocale(1.15, 0.95),
		uniforms: uniforms("uReveal", "uLocale", "uState", "uSide"),
	});
	const frame = { activeSceneId: `capabilities:${variant}`, store: { appStarted: true, hexShaderProgress: 0.4 } };
	return { owner, frame, u: owner.uniforms, reveal: "uReveal", step: locale => owner.update(1 / 60, frame, locale) };
}

function fixtures() {
	const titles = ["lightTrails", "syntheticCore", "spatialMatrix"].map(title);
	const panels = Array.from({ length: 5 }, () => ({ material: { uniforms: uniforms("uReveal", "uSnake", "uDetails", "uLocale") } }));
	const details = instance(Mmk1HotspotDetails, { introElapsed: 1, panels, markers: [{}, {}, {}, {}],
		bloomMesh: {}, localeMotions: panels.map(() => new SceneTextLocale(0.95, 0.95)) });
	const labelUniforms = uniforms("uSnake", "uDetails", "uLocale"), marker = {};
	const labels = instance(Mmk1HotspotLabels, { panels: [{ material: { uniforms: labelUniforms } }], markers: [marker],
		localeMotions: [new SceneTextLocale()], soundReveals: new Float32Array(1) });
	const coreUniforms = uniforms("uSnake", "uTime", "uHover", "uCoreHover", "uDetails", "uReveal", "uOpen", "uProbe", "uLink", "uPulse", "uLocale");
	const core = instance(SyntheticCoreHud, { uniforms: coreUniforms, localeMotion: new SceneTextLocale(), probeAge: 0,
		lens: { getWorldPosition() {}, getWorldScale(v) { v.set(1, 1, 1); }, material: { uniforms: uniforms("uFocus", "uProbe") } },
		hitSphere: new THREE.Sphere(), scale: new THREE.Vector3(), layout() {}, hitTest() { return false; } });
	const cityUniforms = uniforms("uSnake", "uReveal", "uLocale");
	const district = instance(CityDistrictHud, { uniforms: cityUniforms, localeMotion: new SceneTextLocale(),
		current: 0, highlight: { hovered: 0, focus: new THREE.Vector3() }, localAnchor: new THREE.Vector3() });
	return [...titles,
		{ owner: details, u: panels[4].material.uniforms, reveal: "uReveal", step: locale => details.update(1 / 60, null, null, locale, { started: true, current: true, transitioning: true }) },
		{ owner: labels, u: labelUniforms, reveal: "uSnake", step: locale => labels.update(1 / 60, marker, locale) },
		{ owner: core, u: coreUniforms, reveal: "uSnake", step: locale => { core.probeAge = 0; core.update(1 / 60, { time: 0, target: 0, enabled: false, camera: {}, locale }); } },
		{ owner: district, u: cityUniforms, reveal: "uSnake", step: locale => district.update(1 / 60, locale) },
	];
}

test("actual text owners finish appearance through scroll and serialize the last requested language", () => {
	for (const { owner, u, reveal, step } of fixtures()) {
		for (let i = 0; i < 100; i++) step("ru");
		assert.equal(u[reveal].value, 1, owner.constructor.name + " must not freeze during a hex mix");
		const originalUniforms = u, keys = Object.keys(u);
		let swaps = 0;
		for (let i = 0; i < 420; i++) {
			const previous = u.uLocale.value;
			step(i < 7 ? "en" : i < 55 ? "zh" : i < 85 ? "ru" : "en");
			if (previous !== u.uLocale.value) {
				assert.equal(u[reveal].value, 0, owner.constructor.name + " switched a visible atlas cell");
				swaps++;
			}
		}
		assert.ok(swaps > 0); assert.equal(u.uLocale.value, 1); assert.equal(u[reveal].value, 1);
		assert.equal(u, originalUniforms); assert.deepEqual(Object.keys(u), keys);
	}
});

test("the tunnel's disappearance continues when the scene loses pointer ownership during scroll", () => {
	const { owner, frame } = title("lightTrails");
	owner.elapsed = 1.5 + 6.1 - 0.5;
	frame.activeSceneId = "capabilities:syntheticCore";
	frame.interactionEnabled = false; frame.pointerBlocked = true;
	owner.update(1 / 60, frame, "ru");
	const before = owner.uniforms.uReveal.value;
	for (let i = 0; i < 40; i++) owner.update(1 / 60, frame, "en");
	assert.ok(before > 0); assert.equal(owner.uniforms.uReveal.value, 0);
	assert.equal(owner.uniforms.uLocale.value, 1);
});
