import test from "node:test";
import assert from "node:assert/strict";
import { Scene, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import { PreparationScheduler } from "../../../app/preparationScheduler.js";
import { warmSyntheticCoreGeometry } from "./warmSyntheticCoreGeometry.js";

test("geometry warm preserves ownership and visibility, including errors and cancellation", async () => {
	for (const failure of [null, "render", "cancel"]) {
		const scene = new Scene(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
		const parent = new Mesh(geometry, material), child = new Mesh(geometry, material);
		parent.add(child); scene.add(parent); parent.visible = false; child.layers.set(2);
		let time = 0, cancelled = false, calls = 0;
		const renderer = { autoClear: true, render(view) {
			calls++;
			const object = view.children[0];
			assert.equal(object.geometry, geometry);
			assert.equal(material.visible, false);
			assert.equal(object.visible, true);
			assert.equal(view.matrixWorldAutoUpdate, false);
			assert.equal(object.parent, object === parent ? scene : parent);
			assert.equal(renderer.autoClear, false);
			time += 4;
			if (failure === "render") throw new Error("draw failed");
		} };
		const scheduler = new PreparationScheduler({ now: () => time, cancelled: () => cancelled,
			nextFrame: async () => { if (failure === "cancel") cancelled = true; } });
		const result = warmSyntheticCoreGeometry(renderer, scene, scheduler);
		if (failure) await assert.rejects(result); else await result;
		assert.equal(calls, failure ? 1 : 2);
		assert.equal(parent.parent, scene); assert.equal(child.parent, parent);
		assert.equal(parent.visible, false); assert.equal(child.visible, true);
		assert.equal(child.layers.mask, 4); assert.equal(parent.frustumCulled, true);
		assert.equal(material.visible, true); assert.equal(renderer.autoClear, true);
		geometry.dispose(); material.dispose();
	}
});
