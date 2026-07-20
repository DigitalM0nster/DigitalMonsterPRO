import * as THREE from "three";

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

/** Прозрачный clear: модели в RT поверх liquid-фона. */
export function configureModelsRenderPass(composer) {
	const renderPass = composer.passes[0];
	if (renderPass?.clearPass) {
		renderPass.clearPass.setClearFlags(true, true, false);
		renderPass.clearPass.overrideClearColor = new THREE.Color(0x000000);
		renderPass.clearPass.overrideClearAlpha = 0;
	}
}

export function applyScreenTextureColorSpace(texture, gl) {
	if (!texture) {
		return;
	}
	// HDR-слой моделей уже linear — не помечать как sRGB.
	if (texture.colorSpace === THREE.LinearSRGBColorSpace) {
		return;
	}
	// Canvas UI glyphs (case/About left HUD) intentionally use NoColorSpace.
	// Hex-bake used to mutate them to sRGB → muted text wrong until a pair re-upload.
	if (texture.colorSpace === THREE.NoColorSpace) {
		return;
	}
	const outputSpace = gl.outputColorSpace ?? THREE.SRGBColorSpace;
	if ("colorSpace" in texture) {
		texture.colorSpace = outputSpace;
	}
}

export function blitTextureToRenderTarget(gl, texture, renderTarget, scene, camera, mesh) {
	applyScreenTextureColorSpace(texture, gl);
	const mat = mesh.material;
	if (mat.map !== texture) {
		mat.map = texture;
		mat.needsUpdate = true;
	}

	const prevTarget = gl.getRenderTarget();
	gl.setRenderTarget(renderTarget);
	gl.autoClear = true;
	gl.setClearColor(0x000000, 1);
	gl.clear(true, true, true);
	gl.render(scene, camera);
	gl.setRenderTarget(prevTarget);
	gl.autoClear = false;
}

export function blitTextureToScreen(gl, texture, scene, camera, mesh) {
	blitTextureToRenderTarget(gl, texture, null, scene, camera, mesh);
}
