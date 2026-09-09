// Rebuild the high-tier whale from the canonical FBX, without changing particles.
// node tools/assets/prepareWhaleHigh.mjs [--verify]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.FileReader ??= class {
	readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
	readAsDataURL(blob) { blob.arrayBuffer().then(value => {
		this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`; this.onloadend?.();
	}); }
};
const sourceUrl = new URL("../../public/models/allModels/FBX/animated_whale_01.fbx", import.meta.url);
const targetUrl = new URL("../../public/models/home/whale-high.glb", import.meta.url);
const source = await readFile(sourceUrl);
const sourceRoot = new FBXLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), "");
const swim = sourceRoot.animations.find(clip => clip.name === "SWIM-delphinidae");
if (!swim) throw new Error("Canonical SWIM clip missing");

// High hides both source meshes and renders sampled edges only. A single inert
// material prevents glTF from splitting them into material-group primitives.
const hiddenMaterial = new THREE.MeshBasicMaterial({ name: "WhaleParticleSource" });
sourceRoot.traverse(object => { if (object.isMesh) object.material = hiddenMaterial; });

const bytes = process.argv.includes("--verify")
	? await readFile(targetUrl)
	: new Uint8Array(await new GLTFExporter().parseAsync(sourceRoot, { binary: true, animations: [swim], onlyVisible: false }));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer, "");
if (gltf.scene.children.length !== 1 || gltf.animations.length !== 1) throw new Error("Unexpected exported hierarchy/clips");
const targetRoot = gltf.scene.children[0];
const meshes = [];
sourceRoot.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
let vertices = 0;
for (const mesh of meshes) {
	const target = targetRoot.getObjectByName(mesh.name);
	if (!target?.isSkinnedMesh) throw new Error(`Missing skinned mesh: ${mesh.name}`);
	const a = mesh.geometry.attributes.position.array, b = target.geometry.attributes.position.array;
	if (a.length !== b.length || a.some((value, i) => value !== b[i])) throw new Error(`Vertex order/positions changed: ${mesh.name}`);
	if (JSON.stringify(mesh.geometry.index?.array ?? null) !== JSON.stringify(target.geometry.index?.array ?? null)) {
		throw new Error(`Particle edge topology changed: ${mesh.name}`);
	}
	vertices += a.length / 3;
}
const originalMixer = new THREE.AnimationMixer(sourceRoot), exportedMixer = new THREE.AnimationMixer(targetRoot);
originalMixer.clipAction(swim).play(); exportedMixer.clipAction(gltf.animations[0]).play();
const a = new THREE.Vector3(), b = new THREE.Vector3();
let maxPositionError = 0;
for (let sample = 0; sample < 9; sample++) {
	const time = swim.duration * sample / 9;
	originalMixer.setTime(time); exportedMixer.setTime(time);
	sourceRoot.updateMatrixWorld(true); targetRoot.updateMatrixWorld(true);
	for (const mesh of meshes) {
		const target = targetRoot.getObjectByName(mesh.name);
		for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
			a.fromBufferAttribute(mesh.geometry.attributes.position, i);
			b.fromBufferAttribute(target.geometry.attributes.position, i);
			mesh.applyBoneTransform(i, a); target.applyBoneTransform(i, b);
			mesh.localToWorld(a); target.localToWorld(b);
			maxPositionError = Math.max(maxPositionError, a.distanceTo(b));
		}
	}
}
if (maxPositionError > 0.001) throw new Error(`SWIM deformation changed: ${maxPositionError}`);
if (!process.argv.includes("--verify")) {
	await mkdir(new URL(".", targetUrl), { recursive: true });
	await writeFile(targetUrl, bytes);
}
console.log(JSON.stringify({ sourceBytes: source.byteLength, targetBytes: bytes.byteLength, vertices, samples: 9, maxPositionError }));
