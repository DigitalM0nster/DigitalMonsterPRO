import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));

function batchKey(mesh) {
	const geometry = mesh.geometry, material = mesh.material;
	// Only anonymous, stationary hardware owned by this generated core. Named
	// optical parts and independently animated meshes retain their identities.
	if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.name || mesh.children.length
		|| !mesh.matrixAutoUpdate || mesh.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender
		|| mesh.onAfterRender !== THREE.Mesh.prototype.onAfterRender || Object.keys(mesh.userData).length
		|| !mesh.visible || mesh.frustumCulled || Array.isArray(material)
		|| mesh.position.lengthSq() !== 0 || mesh.quaternion.x !== 0 || mesh.quaternion.y !== 0
		|| mesh.quaternion.z !== 0 || mesh.quaternion.w !== 1
		|| mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1
		|| geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity
		|| Object.keys(geometry.morphAttributes).length) return null;
	// Alpha-sorted surfaces cannot share a draw. Additive energy rails can.
	if (material.transparent && (material.blending !== THREE.AdditiveBlending || material.depthWrite)) return null;
	const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b));
	if (attributes.some(([, a]) => a.isInterleavedBufferAttribute)) return null;
	return [material.id, Boolean(geometry.index), mesh.renderOrder, mesh.layers.mask, mesh.castShadow, mesh.receiveShadow,
		...attributes.map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`)].join("|");
}

/** Prepare-only: keep parent transforms, all triangles and assembly attributes. */
export async function batchSyntheticCoreDraws(root, isDisposed = () => false, yieldFrame = nextPaint) {
	const batches = [], references = new Map();
	root.traverse(parent => {
		if (parent.geometry) references.set(parent.geometry, (references.get(parent.geometry) ?? 0) + 1);
		const buckets = new Map();
		for (const mesh of parent.children) {
			if (!mesh.isMesh) continue;
			const key = batchKey(mesh);
			if (key == null) continue;
			if (!buckets.has(key)) buckets.set(key, []);
			buckets.get(key).push(mesh);
		}
		for (const meshes of buckets.values()) if (meshes.length > 1) batches.push({ parent, meshes });
	});
	let savedDraws = 0;
	for (const { parent, meshes } of batches) {
		await yieldFrame();
		if (isDisposed()) break;
		const geometry = mergeGeometries(meshes.map(mesh => mesh.geometry));
		if (!geometry) continue;
		const first = meshes[0], merged = new THREE.Mesh(geometry, first.material);
		merged.name = "core-batched-hardware";
		merged.frustumCulled = false;
		merged.renderOrder = first.renderOrder;
		merged.layers.mask = first.layers.mask;
		merged.castShadow = first.castShadow; merged.receiveShadow = first.receiveShadow;
		parent.add(merged);
		for (const mesh of meshes) {
			parent.remove(mesh);
			const remaining = references.get(mesh.geometry) - 1;
			references.set(mesh.geometry, remaining);
			if (remaining === 0) mesh.geometry.dispose();
		}
		savedDraws += meshes.length - 1;
	}
	return savedDraws;
}
