import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
function method(path, start, end, context) {
	const source = read(path);
	const index = source.indexOf(`\n\t${start}`) + 2;
	return vm.runInNewContext(`({${source.slice(index, source.indexOf(end, index))}})`, context);
}
function renderer() {
	return {
		autoClear: true, target: "original", clears: [], draws: 0, toneMapping: "original-tone",
		getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
		setClearColor(color, alpha) { this.alpha = alpha; },
		clear(...flags) { this.clears.push({ flags, target: this.target, alpha: this.alpha }); },
		render() { if (this.autoClear) this.clear(true, true, true); this.draws++; },
	};
}
function verify(gl, alpha, restoresAutoClear = true) {
	assert.equal(gl.draws, 1);
	assert.equal(gl.clears.length, 1, "one clear including the renderer automatic path");
	assert.deepEqual(gl.clears[0].flags, [true, true, true]);
	assert.equal(gl.clears[0].alpha, alpha);
	assert.equal(gl.target, "original");
	assert.equal(gl.autoClear, restoresAutoClear);
}

test("scene layer clears transparent color/depth once and restores renderer state", () => {
	const gl = renderer(), scene = { getScene: () => ({}) };
	const subject = method("../scenes/SceneManager.js", "_renderSceneLayer(sceneId", "\n\t_getSceneToRender", { THREE: { NoToneMapping: 0 }, getSceneCarousel: () => ({}) });
	Object.assign(subject, { renderer: gl, scenes: new Map([["about", scene]]), camera: {},
		_isContextLost: () => false, getFrameContext: () => ({}), _withSceneProgressFrame: () => ({}), sceneDragOrbit: { apply() {} } });
	const target = { texture: {} };
	assert.equal(subject._renderSceneLayer("about", target), target.texture);
	verify(gl, 0); assert.equal(gl.toneMapping, "original-tone");
});

test("liquid and both hex outputs retain their opaque clear and caller target", () => {
	const gl = renderer();
	const background = method("./background/BackgroundPipeline.js", "_renderLiquidToTexture(skipLiquid", "\n\tupdate(delta", {});
	Object.assign(background, { renderer: gl, liquidMaterial: {}, draw: { scene: {}, camera: {} }, target: { texture: {} }, _syncUniforms() {} });
	background._renderLiquidToTexture(); verify(gl, 1);
	for (const name of ["renderModelsMixToTexture", "renderToScreen"]) {
		const rendererForHex = renderer();
		const subject = method("./overlay/HexGridOverlayPass.js", `${name}(`,
			name === "renderToScreen" ? "\n\tdispose()" : "\n\trenderToScreen(",
			{ syncHexGridMaterialBlendMode() {}, overlayScene: {}, overlayCamera: {} });
		Object.assign(subject, { renderer: rendererForHex, material: { uniforms: { textureA: { value: {} }, textureB: { value: {} } } },
			modelsMixTarget: { texture: {} }, _updateResolution() {}, _applyInputTextureColorSpace() {} });
		subject[name](); verify(rendererForHex, 1);
	}
});

test("background blit and keyed composite do not automatically clear a second time", () => {
	const source = read("./composerUtils.js");
	const fn = source.slice(source.indexOf("export function blitTextureToRenderTarget"), source.indexOf("export function blitTextureToScreen")).replace("export ", "");
	const blit = vm.runInNewContext(`${fn}\nblitTextureToRenderTarget`, { applyScreenTextureColorSpace() {} });
	const gl = renderer(); blit(gl, {}, {}, {}, {}, { material: {} }); verify(gl, 1, false);
	const keyed = method("./toScreen/ScreenCompositor.js", "compositeHexOverLiquidToLayer(gl", "\n\tdispose()", {
		applyScreenTextureColorSpace() {}, hexOverLiquidScene: {}, screenCamera: {},
	});
	Object.assign(keyed, { layerTargets: { a: { texture: {} } }, hexOverLiquidMaterial: { uniforms: { hexMap: {}, liquidMap: {}, hasLiquid: {} } } });
	const keyedGl = renderer(); keyed.compositeHexOverLiquidToLayer(keyedGl, "a", {}, {}); verify(keyedGl, 1, false);
});
