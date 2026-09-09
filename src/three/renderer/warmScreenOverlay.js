import { compileSceneChunked } from "./compileSceneChunked.js";

/** Warm the real screen-output variant as well as the scene's RT variant. */
export async function warmScreenOverlay(overlay, renderer, camera, scheduler, targets = [null], modelsScene = null) {
	if (!overlay?.overlayScene) return;
	const mode = overlay.composeMode;
	const hidden = [];
	const fog = overlay.overlayScene.fog;
	try {
		overlay.setComposeMode?.("screen");
		const scene = overlay.overlayScene;
		scene.traverse((object) => {
			if (!object.visible) { hidden.push(object); object.visible = true; }
		});
		for (const target of targets) {
			// Even fog:false ShaderMaterials get a distinct r155 cache key when
			// their parent scene has fog (home's hex-baked label is one such case).
			scene.fog = target && modelsScene ? modelsScene.fog : fog;
			await compileSceneChunked(renderer, scene, overlay.overlayCamera ?? camera, scheduler, target);
			await scheduler.run(() => {
				const previousTarget = renderer.getRenderTarget();
				const autoClear = renderer.autoClear;
				try {
					renderer.setRenderTarget(target);
					renderer.autoClear = false;
					renderer.render(scene, overlay.overlayCamera ?? camera);
				} finally {
					renderer.setRenderTarget(previousTarget);
					renderer.autoClear = autoClear;
				}
			}, { gpu: true });
		}
	} finally {
		overlay.overlayScene.fog = fog;
		for (const object of hidden) object.visible = false;
		if (mode != null) overlay.setComposeMode?.(mode);
	}
}
