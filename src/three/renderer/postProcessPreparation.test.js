import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function bloomMethod(compile) {
	const source = readFileSync(new URL("../render/models/ModelsBloomPipeline.js", import.meta.url), "utf8");
	const start = source.indexOf("\tasync prepareProgramsUnderCurtain(");
	return vm.runInNewContext(`({${source.slice(start, source.indexOf("\n\t_getBloomConfigKey", start))}}).prepareProgramsUnderCurtain`, {
		compileSceneChunked: compile, getSiteBloomConfig: () => ({}),
	});
}

test("bloom prepares both blur variants with real targets and restores material on failure", async () => {
	for (const mipmap of [true, false]) for (const fail of [false, true]) {
		const makePass = name => ({ scene: name, camera: {}, renderTarget: `${name}-target` });
		const mip = { ...makePass("mip"), enabled: mipmap, fullscreenMaterial: null,
			downsamplingMaterial: "down", upsamplingMaterial: "up", downsamplingMipmaps: ["down-target"], upsamplingMipmaps: ["up-target"] };
		const effect = { luminancePass: makePass("luminance"), mipmapBlurPass: mip, blurPass: makePass("blur"), renderTarget: "blur-target" };
		const calls = [];
		const prepare = bloomMethod(async (renderer, scene, camera, scheduler, target) => {
			calls.push([scene, target]);
			if (scene === "mip") assert.equal(mip.fullscreenMaterial, target.startsWith("down") ? "down" : "up");
			if (fail && (target === "up-target" || target === "blur-target")) throw new Error("compile failed");
		});
		const owner = { renderer: {}, gfx: {}, _buildBloomChain: () => true,
			composer: { passes: [makePass("input"), makePass("effect")], inputBuffer: "composer-target" }, bloomEffect: effect };
		const result = prepare.call(owner, { run: job => job() });
		if (fail) await assert.rejects(result, /compile failed/); else await result;
		assert.equal(mip.fullscreenMaterial, null);
		assert.deepEqual(calls, [["input", "composer-target"], ["effect", "composer-target"], ["luminance", "luminance-target"],
			...(mipmap ? [["mip", "down-target"], ["mip", "up-target"]] : [["blur", "blur-target"]])]);
	}
});

test("failed bloom construction blocks preparation", async () => {
	const prepare = bloomMethod(() => assert.fail("must not compile a missing chain"));
	await assert.rejects(prepare.call({ _buildBloomChain: () => false }, { run: job => job() }), /not prepared/);
});

test("compositor compiles mapped background and models for both outputs, restoring map on failure", async () => {
	const source = readFileSync(new URL("../render/toScreen/ScreenCompositor.js", import.meta.url), "utf8");
	const start = source.indexOf("\tasync prepareProgramsUnderCurtain(");
	const method = source.slice(start, source.indexOf("\n\t/**", start));
	for (const fail of [false, true]) {
		const background = {}, previousMap = {}, target = {};
		const owner = { bgMesh: { material: { map: previousMap } }, layerTargets: { a: target } };
		const calls = [];
		const prepare = vm.runInNewContext(`({${method}}).prepareProgramsUnderCurtain`, {
			bgScene: "background", modelsScene: "models", screenCamera: {},
			compileSceneChunked: async (renderer, scene, camera, scheduler, output) => {
				assert.equal(owner.bgMesh.material.map, background);
				calls.push([scene, output]);
				if (fail && output === null) throw new Error("compile failed");
			},
		});
		const result = prepare.call(owner, {}, {}, background);
		if (fail) await assert.rejects(result, /compile failed/); else await result;
		assert.equal(owner.bgMesh.material.map, previousMap);
		assert.deepEqual(calls, [["background", target], ["models", target], ["background", null],
			...(fail ? [] : [["models", null]])]);
	}
});
