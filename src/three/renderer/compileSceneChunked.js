import { Scene } from "three";

/**
 * r155 compile() walks the whole scene synchronously. Feed it one material at
 * a time with the original geometry/instance/skinning flags and ALL scene lights.
 * These flat views share resources, never reparent or clone GPU assets, and are
 * only passed to compile(), never render(). No renderer internals are patched.
 */
export async function compileSceneChunked(renderer, scene, camera, scheduler, target) {
	const context = new Scene();
	context.environment = scene.environment;
	context.fog = scene.fog;
	const lights = [];
	const objects = [];
	scene.traverseVisible((object) => {
		if (object.isLight) lights.push(Object.assign(Object.create(object), { children: [] }));
	});
	scene.traverse((object) => {
		if (object.material) objects.push(object);
	});
	for (const object of objects) {
		for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
			await scheduler.run(() => {
				const view = Object.assign(Object.create(object), { children: [], material });
				context.children = [...lights, view];
				const previousTarget = renderer.getRenderTarget();
				try {
					// Match actual scene-layer output; screen output compiles other variants.
					renderer.setRenderTarget(target);
					renderer.compile(context, camera);
				} finally {
					renderer.setRenderTarget(previousTarget);
					context.children = [];
				}
			});
		}
	}
}
