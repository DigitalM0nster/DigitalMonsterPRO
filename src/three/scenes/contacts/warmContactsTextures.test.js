import test from "node:test";
import assert from "node:assert/strict";
import { Scene, Mesh, PlaneGeometry, ShaderMaterial, Texture } from "three";
import { PreparationScheduler } from "../../app/preparationScheduler.js";
import { warmContactsTextures } from "./warmContactsTextures.js";

test("hidden/static maps upload once, excluding prepared logos and render targets", async () => {
	const scene = new Scene(), texture = new Texture(), logo = new Texture(), rt = new Texture();
	rt.isRenderTargetTexture = true;
	const material = new ShaderMaterial({ uniforms: { map: { value: texture }, maps: { value: [texture, logo, rt] } } });
	material.map = texture;
	const mesh = new Mesh(new PlaneGeometry(), material); mesh.visible = false; scene.add(mesh);
	const uploads = [];
	await warmContactsTextures({ initTexture: t => uploads.push(t) }, scene,
		new PreparationScheduler({ nextFrame: async () => {} }), [logo]);
	assert.deepEqual(uploads, [texture]);
	assert.equal(mesh.visible, false); assert.equal(material.uniforms.map.value, texture);
	mesh.geometry.dispose(); material.dispose(); texture.dispose(); logo.dispose(); rt.dispose();
});

test("cancellation after a budget yield prevents the next upload", async () => {
	const textures = [new Texture(), new Texture()];
	const scene = { traverse: cb => cb({ material: { uniforms: { maps: { value: textures } } } }) };
	let time = 0, cancelled = false, uploads = 0;
	const scheduler = new PreparationScheduler({ now: () => time, cancelled: () => cancelled,
		nextFrame: async () => { cancelled = true; } });
	await assert.rejects(warmContactsTextures({ initTexture: () => { uploads++; time += 4; } }, scene, scheduler), { name: "AbortError" });
	assert.equal(uploads, 1);
});
