import * as THREE from "three";

const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));
const sameValues = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

function prepareMember(mesh) {
	// Keep the original full bounds: changing the visible count must not shrink
	// the outer object bound or prevent a hidden building from returning.
	mesh.computeBoundingSphere();
	const attributes = [mesh.instanceMatrix, mesh.instanceColor,
		...Object.values(mesh.geometry.attributes).filter(a => a.isInstancedBufferAttribute)].filter(Boolean);
	return { mesh, attributes: attributes.map(attribute => {
		attribute.setUsage(THREE.DynamicDrawUsage);
		return { attribute, source: attribute.array.slice() };
	}) };
}

function writeVisible(member, previous, selected, count) {
	let first = count, last = -1;
	for (let slot = 0; slot < count; slot++) {
		if (previous[slot] === selected[slot]) continue;
		first = Math.min(first, slot); last = slot;
		for (const { attribute, source } of member.attributes) {
			const offset = selected[slot] * attribute.itemSize, target = slot * attribute.itemSize;
			for (let component = 0; component < attribute.itemSize; component++) attribute.array[target + component] = source[offset + component];
		}
	}
	if (last >= first) for (const { attribute } of member.attributes) {
		// A render can be skipped after preparation (e.g. an outer frustum test).
		// Retain any pending dirty range until Three has actually uploaded it.
		const start = first * attribute.itemSize, end = (last + 1) * attribute.itemSize;
		const pendingStart = attribute.updateRange.count > 0 ? attribute.updateRange.offset : start;
		const pendingEnd = attribute.updateRange.count > 0 ? pendingStart + attribute.updateRange.count : end;
		attribute.updateRange.offset = Math.min(start, pendingStart);
		attribute.updateRange.count = Math.max(end, pendingEnd) - attribute.updateRange.offset;
		attribute.needsUpdate = true;
	}
	member.mesh.count = count;
}

/** Static city only. Prepare immutable transforms once; compact the existing
 * instance buffers only when the camera's visible set changes. No runtime
 * allocation, new geometry/material, texture upload or shader variant.
 */
export class CityInstanceVisibility {
	static async prepare(root, cancelled = () => false, yieldFrame = nextPaint) {
		const groups = [], meshes = [], owners = new Map();
		root.updateMatrixWorld(true);
		root.traverse(mesh => {
			for (const attribute of Object.values(mesh.geometry?.attributes ?? {})) {
				if (attribute.isInstancedBufferAttribute) owners.set(attribute, (owners.get(attribute) ?? 0) + 1);
			}
			if (!mesh.isInstancedMesh || mesh.count < 32 || mesh.children.length || !mesh.frustumCulled) return;
			if (mesh.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender || mesh.onAfterRender !== THREE.Mesh.prototype.onAfterRender) return;
			if ((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m.transparent)) return;
			if (Object.values(mesh.geometry.attributes).some(a => a.isInstancedBufferAttribute && a.meshPerAttribute !== 1)) return;
			meshes.push(mesh);
		});
		const matrix = new THREE.Matrix4(), sphere = new THREE.Sphere();
		for (let index = 0; index < meshes.length; index++) {
			if (index % 3 === 0) await yieldFrame();
			if (cancelled()) return null;
			const mesh = meshes[index];
			if (Object.values(mesh.geometry.attributes).some(a => a.isInstancedBufferAttribute && owners.get(a) > 1)) {
				const source = mesh.geometry;
				mesh.geometry = source.clone();
				let retained = false;
				root.traverse(object => { if (object.geometry === source) retained = true; });
				if (!retained) source.dispose();
			}
			mesh.geometry.computeBoundingSphere();
			let group = groups.find(g => g.count === mesh.count && g.mesh.parent === mesh.parent
				&& g.mesh.matrix.equals(mesh.matrix) && sameValues(g.matrices, mesh.instanceMatrix.array));
			if (!group) {
				group = { mesh, count: mesh.count, matrices: mesh.instanceMatrix.array.slice(), members: [],
					prototype: new THREE.Sphere().makeEmpty(), bounds: new Float64Array(mesh.count * 4),
					selected: new Uint32Array(mesh.count), previous: Uint32Array.from({ length: mesh.count }, (_, i) => i),
					projection: new THREE.Matrix4(), valid: false };
				groups.push(group);
			}
			group.prototype.union(mesh.geometry.boundingSphere);
			group.members.push(prepareMember(mesh));
		}
		for (const group of groups) {
			for (let i = 0; i < group.count; i++) {
				matrix.fromArray(group.matrices, i * 16);
				sphere.copy(group.prototype).applyMatrix4(matrix);
				const offset = i * 4;
				group.bounds[offset] = sphere.center.x; group.bounds[offset + 1] = sphere.center.y;
				group.bounds[offset + 2] = sphere.center.z; group.bounds[offset + 3] = sphere.radius + .001;
			}
		}
		return new CityInstanceVisibility(groups);
	}

	constructor(groups) {
		this.groups = groups;
		this.viewProjection = new THREE.Matrix4(); this.projection = new THREE.Matrix4();
		this.frustum = new THREE.Frustum();
	}

	update(camera) {
		this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		for (const group of this.groups) {
			this.projection.multiplyMatrices(this.viewProjection, group.mesh.matrixWorld);
			if (group.valid && group.projection.equals(this.projection)) continue;
			group.projection.copy(this.projection); group.valid = true;
			this.frustum.setFromProjectionMatrix(this.projection);
			let count = 0;
			for (let i = 0; i < group.count; i++) {
				const offset = i * 4, b = group.bounds;
				let visible = true;
				for (const plane of this.frustum.planes) {
					if (plane.normal.x * b[offset] + plane.normal.y * b[offset + 1] + plane.normal.z * b[offset + 2] + plane.constant < -b[offset + 3]) {
						visible = false; break;
					}
				}
				if (visible) group.selected[count++] = i;
			}
			for (const member of group.members) writeVisible(member, group.previous, group.selected, count);
			// The inactive tail remains in the fixed buffer. Remember its actual
			// contents too, so expanding the draw never exposes stale instances.
			for (let i = 0; i < count; i++) group.previous[i] = group.selected[i];
		}
	}

	restore() {
		for (const group of this.groups) {
			for (let i = 0; i < group.count; i++) group.selected[i] = i;
			for (const member of group.members) writeVisible(member, group.previous, group.selected, group.count);
			for (let i = 0; i < group.count; i++) group.previous[i] = i;
			group.valid = false;
		}
	}

	dispose() { this.groups.length = 0; }
}
