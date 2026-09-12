import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CityInstanceVisibility } from "./CityInstanceVisibility.js";

const nextFrame = () => Promise.resolve();
function fixture() {
	const root = new THREE.Group(), geometry = new THREE.BoxGeometry(.3, 1, .3);
	geometry.setAttribute("aCityDistrict", new THREE.InstancedBufferAttribute(Float32Array.from({ length: 64 }, (_, i) => i), 1));
	const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 64);
	for (let i = 0; i < 64; i++) {
		mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation((i % 8) - 3.5, 0, i < 32 ? -15 : 15));
		mesh.setColorAt(i, new THREE.Color().setRGB(i / 64, .5, .9));
	}
	root.add(mesh); root.updateMatrixWorld(true);
	const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 100);
	camera.updateMatrixWorld(true);
	return { root, mesh, camera };
}

test("only offscreen buildings are excluded; camera reversal restores exact transforms, IDs and colours", async () => {
	const { root, mesh, camera } = fixture();
	const matrices = mesh.instanceMatrix.array.slice(), colors = mesh.instanceColor.array.slice();
	const visibility = await CityInstanceVisibility.prepare(root, () => false, nextFrame);
	visibility.update(camera); assert.equal(mesh.count, 32);
	assert.equal(mesh.geometry.attributes.aCityDistrict.getX(0), 0);
	camera.rotation.y = Math.PI; camera.updateMatrixWorld(true);
	visibility.update(camera); assert.equal(mesh.count, 32);
	for (let i = 0; i < mesh.count; i++) {
		const id = mesh.geometry.attributes.aCityDistrict.getX(i);
		assert.equal(id, i + 32);
		assert.deepEqual(mesh.instanceMatrix.array.slice(i * 16, (i + 1) * 16), matrices.slice(id * 16, (id + 1) * 16));
		assert.deepEqual(mesh.instanceColor.array.slice(i * 3, (i + 1) * 3), colors.slice(id * 3, (id + 1) * 3));
	}
	camera.rotation.y = 0; camera.updateMatrixWorld(true); visibility.update(camera);
	assert.equal(mesh.count, 32); assert.equal(mesh.geometry.attributes.aCityDistrict.getX(0), 0);
	visibility.restore(); assert.equal(mesh.count, 64);
	assert.deepEqual(mesh.instanceMatrix.array, matrices); assert.deepEqual(mesh.instanceColor.array, colors);
	assert.deepEqual(Array.from(mesh.geometry.attributes.aCityDistrict.array), Array.from({ length: 64 }, (_, i) => i));
});

test("unchanged visibility does not upload buffers or replace any render resource", async () => {
	const { root, mesh, camera } = fixture();
	const visibility = await CityInstanceVisibility.prepare(root, () => false, nextFrame);
	visibility.update(camera);
	const attribute = mesh.instanceMatrix, version = attribute.version, array = attribute.array, geometry = mesh.geometry, material = mesh.material;
	visibility.update(camera);
	camera.position.x = .001; camera.updateMatrixWorld(true); visibility.update(camera);
	assert.equal(attribute.version, version); assert.equal(mesh.instanceMatrix, attribute);
	assert.equal(attribute.array, array); assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
});

test("facade and roof use one conservative visibility decision including roof overhangs", async () => {
	const { root, mesh, camera } = fixture();
	const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), mesh.material, 64);
	roof.instanceMatrix.array.set(mesh.instanceMatrix.array); root.add(roof); root.updateMatrixWorld(true);
	const visibility = await CityInstanceVisibility.prepare(root, () => false, nextFrame);
	assert.equal(visibility.groups.length, 1); assert.equal(visibility.groups[0].members.length, 2);
	visibility.update(camera); assert.equal(mesh.count, roof.count);
	assert.deepEqual(mesh.instanceMatrix.array, roof.instanceMatrix.array);
	// Outer Three.js culling must retain the original all-building sphere.
	assert.ok(mesh.boundingSphere.radius > 15);
});

test("empty views can return and cancelled preparation leaves the source draw complete", async () => {
	const { root, mesh, camera } = fixture();
	assert.equal(await CityInstanceVisibility.prepare(root, () => true, nextFrame), null);
	assert.equal(mesh.count, 64);
	const visibility = await CityInstanceVisibility.prepare(root, () => false, nextFrame);
	camera.position.set(1000, 0, 0); camera.updateMatrixWorld(true); visibility.update(camera); assert.equal(mesh.count, 0);
	camera.position.set(0, 0, 0); camera.updateMatrixWorld(true); visibility.update(camera); assert.equal(mesh.count, 32);
});

test("two groups sharing instance attributes receive independent visibility buffers during prepare", async () => {
	const { root, mesh, camera } = fixture();
	const other = new THREE.InstancedMesh(mesh.geometry, mesh.material, 64);
	other.instanceMatrix.array.set(mesh.instanceMatrix.array); other.rotation.y = Math.PI; root.add(other);
	const visibility = await CityInstanceVisibility.prepare(root, () => false, nextFrame);
	assert.notEqual(mesh.geometry.attributes.aCityDistrict, other.geometry.attributes.aCityDistrict);
	root.updateMatrixWorld(true); visibility.update(camera);
	assert.equal(mesh.geometry.attributes.aCityDistrict.getX(0), 0);
	assert.equal(other.geometry.attributes.aCityDistrict.getX(0), 32);
});
