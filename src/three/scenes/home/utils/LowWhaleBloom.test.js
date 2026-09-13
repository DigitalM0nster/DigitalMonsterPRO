import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LowWhaleBloom } from "./LowWhaleBloom.js";
import { setScenePixelRatio } from "../../../renderer/renderResolution.js";

test("Low bloom prepares scene-sized targets once even when the final canvas has double DPR", async () => {
	const geometry = new THREE.BufferGeometry();
	const material = new THREE.ShaderMaterial({ uniforms: {} });
	const particles = { geometry, material, points: new THREE.Points(geometry, material) };
	const bloom = new LowWhaleBloom(particles);
	const previous = { width: 1, height: 1 };
	let target = previous;
	const draws = [];
	const renderer = {
		getPixelRatio: () => 2, getSize: size => size.set(390, 664),
		getRenderTarget: () => target, setRenderTarget: value => { target = value; },
		compile() {}, render: () => draws.push([target.width, target.height]), autoClear: false,
	};
	setScenePixelRatio(renderer, 1);
	const scheduler = { run: async job => job(), breath: async () => {} };
	try {
		await bloom.prepare(renderer, scheduler);
		assert.deepEqual(draws, [[195, 332], [195, 332], [390, 664]]);
		assert.equal(target, previous);
		let resized = 0;
		for (const buffer of [...bloom.targets, bloom.output]) buffer.addEventListener("dispose", () => resized++);
		const sceneTarget = { width: 390, height: 664, texture: new THREE.Texture() };
		bloom.render(renderer, new THREE.Camera(), sceneTarget, particles);
		assert.equal(resized, 0, "the first real scene draw must reuse the warm buffers");
		assert.equal(target, previous);
		sceneTarget.texture.dispose();
	} finally {
		bloom.dispose(); geometry.dispose(); material.dispose();
	}
});
