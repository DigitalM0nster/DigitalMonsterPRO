import { Scene } from "three";

/**
 * r155 compile() walks the whole scene synchronously. Feed it one material at
 * a time with the original geometry/instance/skinning flags and ALL scene lights.
 * These flat views share resources, never reparent or clone GPU assets, and are
 * only passed to compile(), never render(). The pinned build backport adds
 * compileAsync; submit chunks first, then await every submitted program.
 */
export async function compileSceneChunked(renderer, scene, camera, scheduler, target, { visibleOnly = false } = {}) {
	const context = new Scene();
	context.environment = scene.environment;
	context.fog = scene.fog;
	const lights = [];
	const objects = [];
	const pending = [];
	scene.traverseVisible((object) => {
		if (object.isLight) lights.push(Object.assign(Object.create(object), { children: [] }));
	});
	scene[visibleOnly ? "traverseVisible" : "traverse"]((object) => {
		if (object.material) objects.push(object);
	});
	for (const object of objects) {
		for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
			// A reflection capture excludes hidden surfaces; ordinary scene warmup
			// still prepares dormant objects/materials for their later reveal.
			if (visibleOnly && !material.visible) continue;
			await scheduler.run(() => {
				const view = Object.assign(Object.create(object), { children: [], material });
				context.children = [...lights, view];
				const previousTarget = renderer.getRenderTarget();
				const previousFace = renderer.getActiveCubeFace?.() ?? 0;
				const previousMip = renderer.getActiveMipmapLevel?.() ?? 0;
				try {
					// Match actual scene-layer output; screen output compiles other variants.
					renderer.setRenderTarget(target);
					if (renderer.compileAsync) {
						// Attach rejection handlers immediately: later submission/cancellation
						// may throw before we reach the final wait below.
						pending.push(renderer.compileAsync(context, camera).then(
							() => ({}), error => ({ error }),
						));
					} else {
						renderer.compile(context, camera);
					}
				} finally {
					renderer.setRenderTarget(previousTarget, previousFace, previousMip);
					context.children = [];
				}
			});
		}
	}
	const results = await Promise.all(pending);
	scheduler.check();
	for (const result of results) if ("error" in result) throw result.error;
}
