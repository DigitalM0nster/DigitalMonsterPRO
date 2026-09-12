import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { batchSyntheticCoreDraws } from "./batchSyntheticCoreDraws.js";
import { tagAssemblyPart } from "./syntheticCoreAssembly.js";

const mesh = (parent, material, id) => {
	const geometry = tagAssemblyPart(new THREE.BoxGeometry(), {
		center: new THREE.Vector3(id, id + 1, id + 2), distance: id + .5, delay: id * .01,
	});
	geometry.clearGroups();
	const result = new THREE.Mesh(geometry, material); result.frustumCulled = false;
	parent.add(result); return result;
};
const nextFrame = () => Promise.resolve();

test("keeps exact vertex data, indices and per-panel assembly motion in one draw", async () => {
	const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
	const sources = [mesh(root, material, 1), mesh(root, material, 2)];
	const expected = Object.fromEntries(Object.keys(sources[0].geometry.attributes).map(key => [key,
		sources.flatMap(m => Array.from(m.geometry.attributes[key].array))]));
	let disposed = 0; sources.forEach(m => m.geometry.addEventListener("dispose", () => disposed++));
	assert.equal(await batchSyntheticCoreDraws(root, () => false, nextFrame), 1);
	assert.equal(root.children.length, 1); assert.equal(disposed, 2);
	const geometry = root.children[0].geometry;
	for (const [key, values] of Object.entries(expected)) assert.deepEqual(Array.from(geometry.attributes[key].array), values);
	const index = sources[0].geometry.index.array, count = sources[0].geometry.attributes.position.count;
	assert.deepEqual(Array.from(geometry.index.array), [...index, ...Array.from(index, i => i + count)]);
	assert.equal(root.children[0].material, material);
});

test("preserves independent rotors, named optics, transforms and alpha sorting", async () => {
	const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
	const rotor = new THREE.Group(); root.add(rotor); rotor.rotation.z = .3;
	mesh(root, material, 1); mesh(root, material, 2);
	mesh(rotor, material, 3); mesh(rotor, material, 4);
	const named = mesh(root, material, 5); named.name = "contained-energy-lens";
	const moved = mesh(root, material, 6); moved.position.x = 1;
	const alpha = material.clone(); alpha.transparent = true;
	const transparent = [mesh(root, alpha, 7), mesh(root, alpha, 8)];
	assert.equal(await batchSyntheticCoreDraws(root, () => false, nextFrame), 2);
	assert.equal(rotor.parent, root); assert.equal(rotor.children.length, 1); assert.equal(rotor.rotation.z, .3);
	for (const m of [named, moved, ...transparent]) assert.equal(m.parent, root);
});

test("cancellation during a preparation yield does not mutate or dispose the source", async () => {
	const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
	const sources = [mesh(root, material, 1), mesh(root, material, 2)];
	let cancelled = false, disposed = 0;
	sources.forEach(m => m.geometry.addEventListener("dispose", () => disposed++));
	assert.equal(await batchSyntheticCoreDraws(root, () => cancelled, async () => { cancelled = true; }), 0);
	assert.deepEqual(root.children, sources); assert.equal(disposed, 0);
});

test("a geometry still used by an excluded optical mesh remains alive", async () => {
	const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
	const original = mesh(root, material, 1); mesh(root, material, 2);
	const optical = original.clone(); optical.name = "retained-part"; root.add(optical);
	let disposed = false; original.geometry.addEventListener("dispose", () => { disposed = true; });
	assert.equal(await batchSyntheticCoreDraws(root, () => false, nextFrame), 1);
	assert.equal(disposed, false); assert.equal(optical.parent, root);
});
