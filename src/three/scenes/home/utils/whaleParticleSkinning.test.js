import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createWhaleParticleSkinning } from "./whaleParticleSkinning.js";

function reference(mesh, index, target) {
	target.fromBufferAttribute(mesh.geometry.attributes.position, index);
	if (mesh.isSkinnedMesh) mesh.applyBoneTransform(index, target);
	return target.applyMatrix4(mesh.matrix);
}

test("high SWIM palette matches original skinning, interpolated edges and wake bounds across a loop", async () => {
	const bytes = await readFile(new URL("../../../../../public/models/home/whale-high.glb", import.meta.url));
	const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
	const root = gltf.scene.children[0], samples = [];
	root.traverse(mesh => {
		if (!mesh.isSkinnedMesh) return;
		for (let a = 0; a < mesh.geometry.attributes.position.count; a++) {
			samples.push({ mesh, a, b: a, t: 0 });
			if (a % 13 === 0) samples.push({ mesh, a, b: (a + 1) % mesh.geometry.attributes.position.count, t: 0.37 });
		}
	});
	const geometry = new THREE.BufferGeometry();
	const skinning = createWhaleParticleSkinning(samples, geometry);
	const attributes = Object.values(geometry.attributes).map(attribute => ({ attribute, version: attribute.version, array: attribute.array }));
	const mixer = new THREE.AnimationMixer(root);
	mixer.clipAction(gltf.animations[0]).play();
	const a = new THREE.Vector3(), b = new THREE.Vector3(), actual = new THREE.Vector3();
	let maxError = 0;
	for (let frame = 0; frame <= 9; frame++) {
		// Include nontrivial parent transforms, as used by the hero sway/enter.
		root.position.set(4, -3, 8); root.rotation.y = frame * 0.07; root.scale.setScalar(0.03);
		mixer.setTime(gltf.animations[0].duration * frame / 9);
		root.updateMatrixWorld(true); skinning.update();
		let min = Infinity, max = -Infinity;
		samples.forEach((sample, index) => {
			reference(sample.mesh, sample.a, a); reference(sample.mesh, sample.b, b); a.lerp(b, sample.t);
			skinning.bodySamples.getPosition(index, actual);
			maxError = Math.max(maxError, a.distanceTo(actual));
			min = Math.min(min, a.x); max = Math.max(max, a.x);
		});
		const bounds = skinning.bodySamples.getXBounds();
		assert.ok(Math.abs(bounds.min - min) < 0.001 && Math.abs(bounds.max - max) < 0.001);
	}
	assert.ok(maxError < 0.001, `SWIM error ${maxError}`);
	for (const { attribute, version, array } of attributes) {
		assert.equal(attribute.version, version, "animation must not upload vertex attributes");
		assert.equal(attribute.array, array, "animation must retain attribute buffers");
	}
	let disposed = 0;
	skinning.uniforms.uWhaleBones.value.addEventListener("dispose", () => disposed++);
	skinning.dispose(); geometry.dispose();
	assert.equal(disposed, 1);
});

test("non-unit skin weights retain post-bind translation; plain line sources also work", () => {
	const source = new THREE.BufferGeometry();
	source.setAttribute("position", new THREE.Float32BufferAttribute([1, 2, 3, -2, 1, 4], 3));
	source.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0], 4));
	source.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.2, 0, 0, 0, 0.6, 0, 0, 0], 4));
	const mesh = new THREE.SkinnedMesh(source, new THREE.MeshBasicMaterial());
	const bone = new THREE.Bone(); mesh.add(bone);
	mesh.bind(new THREE.Skeleton([bone]));
	mesh.position.set(5, 6, -2); bone.position.set(3, -1, 4); mesh.updateMatrixWorld(true);
	const line = new THREE.LineSegments(source); line.position.set(-8, 2, 3); line.updateMatrixWorld(true);
	const samples = [mesh, line].map(mesh => ({ mesh, a: 0, b: 1, t: 0.31 }));
	const geometry = new THREE.BufferGeometry(), skinning = createWhaleParticleSkinning(samples, geometry);
	const a = new THREE.Vector3(), b = new THREE.Vector3(), actual = new THREE.Vector3();
	samples.forEach((sample, index) => {
		reference(sample.mesh, 0, a); reference(sample.mesh, 1, b); a.lerp(b, sample.t);
		assert.ok(a.distanceTo(skinning.bodySamples.getPosition(index, actual)) < 0.00001);
	});
	skinning.dispose(); geometry.dispose(); source.dispose(); mesh.material.dispose(); line.material.dispose();
});

test("coincident vertices retain different weights, bones and mesh transforms", () => {
	const source = new THREE.BufferGeometry();
	source.setAttribute("position", new THREE.Float32BufferAttribute(Array(5).fill([1, 2, 3]).flat(), 3));
	source.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([
		0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
	], 4));
	source.setAttribute("skinWeight", new THREE.Float32BufferAttribute([
		1, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0,
	], 4));
	const mesh = new THREE.SkinnedMesh(source, new THREE.MeshBasicMaterial());
	const bones = [new THREE.Bone(), new THREE.Bone()]; mesh.add(...bones);
	mesh.bind(new THREE.Skeleton(bones));
	const line = new THREE.LineSegments(source);
	const samples = [mesh, line].flatMap(mesh => Array.from({ length: 5 }, (_, a) => ({ mesh, a, b: a, t: 0 })));
	const geometry = new THREE.BufferGeometry(), skinning = createWhaleParticleSkinning(samples, geometry);
	const expected = new THREE.Vector3(), actual = new THREE.Vector3();
	for (let frame = 0; frame < 4; frame++) {
		bones[0].position.set(frame + 1, -frame, 2); bones[1].position.set(-frame - 3, 4, frame);
		mesh.position.set(frame, 0, 0); line.position.set(10 - frame, frame, 0);
		mesh.updateMatrixWorld(true); line.updateMatrixWorld(true); skinning.update();
		let min = Infinity, max = -Infinity;
		samples.forEach((sample, index) => {
			reference(sample.mesh, sample.a, expected);
			skinning.bodySamples.getPosition(index, actual);
			assert.ok(expected.distanceTo(actual) < 0.00001, `frame ${frame}, sample ${index}`);
			min = Math.min(min, expected.x); max = Math.max(max, expected.x);
		});
		assert.deepEqual(skinning.bodySamples.getXBounds(), { min, max });
		assert.equal(geometry.attributes.position.count, samples.length, "all particles remain on the GPU");
		assert.equal(geometry.attributes.aSkinWeightsA.getX(1), 0.5);
		assert.equal(geometry.attributes.aSkinIndicesA.getX(2), 1);
	}
	skinning.dispose(); geometry.dispose(); source.dispose(); mesh.material.dispose(); line.material.dispose();
});
