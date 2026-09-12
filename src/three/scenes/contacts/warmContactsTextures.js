/** Upload prepared, static maps before the full scene draw. Texture uploads share
 * the CPU preparation budget; the later real RT draw still gets its own frame. */
export async function warmContactsTextures(renderer, scene, scheduler, alreadyPrepared = []) {
	const textures = new Set();
	const add = value => {
		if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
	};
	scene.traverse(object => {
		for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
			if (!material) continue;
			for (const value of Object.values(material)) add(value);
			for (const uniform of Object.values(material.uniforms ?? {})) {
				if (Array.isArray(uniform.value)) uniform.value.forEach(add);
				else add(uniform.value);
			}
		}
	});
	for (const texture of alreadyPrepared) textures.delete(texture);
	for (const texture of textures) await scheduler.run(() => renderer.initTexture(texture));
}
