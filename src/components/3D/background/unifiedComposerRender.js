import * as THREE from "three";

/** Пустая сцена для RenderPass фона — не тянет модели из portal. */
export const unifiedBackgroundScene = new THREE.Scene();

/** Composer → RT (не на экран). */
export function renderComposerToTexture(composer, delta, gl) {
	const prevTarget = gl?.getRenderTarget?.() ?? null;

	composer.autoRenderToScreen = false;
	for (const pass of composer.passes) {
		pass.renderToScreen = false;
	}
	composer.render(delta);

	const texture = composer.outputBuffer?.texture ?? composer.inputBuffer?.texture ?? null;

	if (gl) {
		gl.setRenderTarget(prevTarget);
	}

	return texture;
}

export function configureBackgroundRenderPass(composer) {
	const renderPass = composer.passes[0];
	if (renderPass?.clearPass) {
		renderPass.clearPass.setClearFlags(true, true, true);
		renderPass.clearPass.overrideClearColor = new THREE.Color(0x000000);
		renderPass.clearPass.overrideClearAlpha = 1;
	}
}

/** RT → экран (fullscreen quad). */
export function blitTextureToScreen(gl, texture, scene, camera, mesh) {
	applyScreenTextureColorSpace(texture, gl);
	const mat = mesh.material;
	if (mat.map !== texture) {
		mat.map = texture;
		mat.needsUpdate = true;
	}

	const prevTarget = gl.getRenderTarget();
	gl.setRenderTarget(null);
	gl.autoClear = true;
	gl.setClearColor(0x000000, 1);
	gl.clear(true, true, true);
	gl.render(scene, camera);
	gl.setRenderTarget(prevTarget);
	gl.autoClear = false;
}

/** RT постобработки → корректный цвет на экране. */
export function applyScreenTextureColorSpace(texture, gl) {
	if (!texture) {
		return;
	}
	const outputSpace = gl.outputColorSpace ?? THREE.SRGBColorSpace;
	if ("colorSpace" in texture) {
		texture.colorSpace = outputSpace;
	}
}
