import { compileSceneChunked } from "./compileSceneChunked.js";

/** Warm the real screen-output variant as well as the scene's RT variant. */
export async function warmScreenOverlay(overlay, renderer, camera, scheduler, targets = [null], modelsScene = null) {
	if (!overlay?.overlayScene) return;
	const mode = overlay.composeMode;
	const hidden = [];
	const fog = overlay.overlayScene.fog;
	const restoreDraw = overlay.beginScreenWarmupDraw?.();
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
			// Some overlays have a separate clip-space decoration in the models scene
			// (Home's mouse/comet). Include its real mesh in this same RT warm job.
			const modelMeshes = (target ? overlay.getWarmupModelMeshes?.() ?? [] : []).map(object => ({
				object, parent: object.parent, index: object.parent?.children.indexOf(object) ?? -1, visible: object.visible,
			}));
			try {
				for (const { object } of modelMeshes) { scene.add(object); object.visible = true; }
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
			} finally {
				for (const { object, parent, index, visible } of modelMeshes.sort((a, b) => a.index - b.index)) {
					object.removeFromParent();
					if (parent) {
						parent.add(object);
						parent.children.splice(parent.children.indexOf(object), 1);
						parent.children.splice(index, 0, object);
					}
					object.visible = visible;
				}
			}
		}
	} finally {
		restoreDraw?.();
		overlay.overlayScene.fog = fog;
		for (const object of hidden) object.visible = false;
		if (mode != null) overlay.setComposeMode?.(mode);
	}
}
