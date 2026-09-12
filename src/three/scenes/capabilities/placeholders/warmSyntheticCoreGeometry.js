import { Camera, Scene } from "three";

/** r155 uploads geometry before checking material.visible. Use that preparation
 * path one object at a time, with no shader draw, cloning or reparenting. The
 * normal full-scene RT draw still follows this under the loader curtain. */
export async function warmSyntheticCoreGeometry(renderer, scene, scheduler) {
	const objects = [];
	scene.traverse(object => {
		if (object.geometry && object.material && (object.isMesh || object.isLine || object.isPoints)) objects.push(object);
	});
	const view = new Scene();
	view.matrixWorldAutoUpdate = false;
	const camera = new Camera();
	for (const object of objects) {
		await scheduler.run(() => {
			const visible = object.visible, culled = object.frustumCulled, mask = object.layers.mask;
			const children = object.children.map(child => [child, child.visible]);
			const materials = [...new Set(Array.isArray(object.material) ? object.material : [object.material])]
				.filter(Boolean).map(material => [material, material.visible]);
			const autoClear = renderer.autoClear;
			try {
				object.visible = true;
				object.frustumCulled = false;
				object.layers.mask = camera.layers.mask;
				for (const [child] of children) child.visible = false;
				for (const [material] of materials) material.visible = false;
				view.children = [object];
				renderer.autoClear = false;
				renderer.render(view, camera);
			} finally {
				view.children = [];
				renderer.autoClear = autoClear;
				object.visible = visible;
				object.frustumCulled = culled;
				object.layers.mask = mask;
				for (const [child, wasVisible] of children) child.visible = wasVisible;
				for (const [material, wasVisible] of materials) material.visible = wasVisible;
			}
		});
	}
}
