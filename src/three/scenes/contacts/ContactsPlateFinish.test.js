import assert from "node:assert/strict";
import test from "node:test";
import { Group, Texture } from "three";
import { ContactsPlateFinish } from "./ContactsPlateFinish.js";

test("switching and reversing contact selection reuse prepared artwork and preserve hit ownership", async () => {
	const texture = new Texture();
	const plates = [0, 1].map(projectIndex => ({ projectIndex, mesh: new Group() }));
	const finish = new ContactsPlateFinish(plates, { plateSize: 2.7, depth: 0.26 }, { loadAsync: async () => texture });
	await finish.readyPromise;
	const resources = finish.entries.map(({ mesh }) => [mesh, mesh.geometry, mesh.material, mesh.material.map]);
	const version = texture.version;
	const logos = { anchor: { visible: true }, currentProjectIndex: 0, _revealProgress: 1 };
	for (let i = 0; i < 120; i++) {
		logos.currentProjectIndex = i % 2;
		logos._revealProgress = (i % 10) / 10;
		finish.update(logos);
		for (const { projectIndex, mesh } of finish.entries) {
			assert.equal(mesh.material.opacity, projectIndex === logos.currentProjectIndex ? logos._revealProgress : 0);
			const hits = [];
			mesh.raycast({}, hits);
			assert.equal(hits.length, 0);
		}
	}
	logos.anchor.visible = false;
	finish.update(logos);
	assert.ok(finish.entries.every(({ mesh }) => !mesh.visible));
	assert.equal(texture.version, version);
	finish.entries.forEach(({ mesh }, i) => assert.deepEqual([mesh, mesh.geometry, mesh.material, mesh.material.map], resources[i]));
	finish.dispose();
	assert.ok(plates.every(({ mesh }) => mesh.children.length === 0));
});

test("warm draws cover hidden artwork and restore exact state after update", async () => {
	const finish = new ContactsPlateFinish([{ projectIndex: 0, mesh: new Group() }], { plateSize: 2.7, depth: 0.26 }, { loadAsync: async () => new Texture() });
	await finish.readyPromise;
	const mesh = finish.entries[0].mesh;
	const saved = [mesh.visible, mesh.frustumCulled, mesh.material.opacity];
	const token = finish.beginWarmupDraw();
	finish.update({ anchor: { visible: false } });
	assert.equal(mesh.visible, true);
	assert.equal(mesh.frustumCulled, false);
	assert.equal(mesh.material.opacity, 1);
	finish.endWarmupDraw(token);
	assert.deepEqual([mesh.visible, mesh.frustumCulled, mesh.material.opacity], saved);
	finish.dispose();
});

test("dispose during load releases the arriving texture without creating scene resources", async () => {
	let resolve;
	const texture = new Texture();
	let disposed = 0;
	texture.addEventListener("dispose", () => disposed++);
	const finish = new ContactsPlateFinish([], { plateSize: 2.7, depth: 0.26 }, { loadAsync: () => new Promise(done => { resolve = done; }) });
	finish.dispose();
	resolve(texture);
	assert.equal(await finish.readyPromise, false);
	assert.equal(disposed, 1);
	assert.equal(finish.geometry, undefined);
});
