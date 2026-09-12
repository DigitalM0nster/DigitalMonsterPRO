import * as THREE from "three";

/** Static edge endpoints; only this small affine bone palette changes per frame. */
export function createWhaleParticleSkinning(samples, geometry) {
	const groups = new Map();
	const vertices = [];
	const position = new THREE.Vector3(), indices = new THREE.Vector4(), weights = new THREE.Vector4();
	let boneCount = 0;
	function sourceVertex(mesh, index) {
		let group = groups.get(mesh);
		if (!group) {
			group = { mesh, offset: boneCount, vertices: new Map(), uniqueVertices: new Map() };
			groups.set(mesh, group);
			// One extra row supplies the post-bind translation for non-unit weight sums.
			boneCount += (mesh.isSkinnedMesh ? mesh.skeleton.bones.length : 1) + 1;
		}
		if (!group.vertices.has(index)) {
			const attrs = mesh.geometry.attributes;
			position.fromBufferAttribute(attrs.position, index);
			indices.set(group.offset, 0, 0, 0);
			weights.set(1, 0, 0, 0);
			if (mesh.isSkinnedMesh) {
				indices.fromBufferAttribute(attrs.skinIndex, index).addScalar(group.offset);
				weights.fromBufferAttribute(attrs.skinWeight, index);
			}
			// Exported triangle seams repeat the same skinned point. Share its CPU
			// calculation only; keep every particle and its GPU attributes unchanged.
			// Exact values (including signed zero), no spatial/weight quantization.
			const key = [position.x, position.y, position.z, indices.x, indices.y, indices.z, indices.w,
				weights.x, weights.y, weights.z, weights.w].map(value => Object.is(value, -0) ? "-0" : value).join(",");
			let vertexIndex = group.uniqueVertices.get(key);
			if (vertexIndex === undefined) {
				vertexIndex = vertices.length;
				group.uniqueVertices.set(key, vertexIndex);
				vertices.push({ position: position.clone(), indices: indices.clone(), weights: weights.clone(),
					group, value: new THREE.Vector3(), version: -1 });
			}
			group.vertices.set(index, vertexIndex);
		}
		return group.vertices.get(index);
	}
	const endpoints = new Uint32Array(samples.length * 2), mixes = new Float64Array(samples.length);
	samples.forEach(({ mesh, a, b, t }, i) => {
		endpoints[i * 2] = sourceVertex(mesh, a); endpoints[i * 2 + 1] = sourceVertex(mesh, b); mixes[i] = t;
	});
	const rows = Math.max(boneCount, 1);
	const palette = new Float32Array(rows * 12);
	const texture = new THREE.DataTexture(palette, 3, rows, THREE.RGBAFormat, THREE.FloatType);
	texture.name = "Whale bone palette";
	texture.generateMipmaps = false;
	const attributes = {
		position: new THREE.Float32BufferAttribute(samples.length * 3, 3),
		aEndpointB: new THREE.Float32BufferAttribute(samples.length * 3, 3),
		aSkinIndicesA: new THREE.Float32BufferAttribute(samples.length * 4, 4),
		aSkinIndicesB: new THREE.Float32BufferAttribute(samples.length * 4, 4),
		aSkinWeightsA: new THREE.Float32BufferAttribute(samples.length * 4, 4),
		aSkinWeightsB: new THREE.Float32BufferAttribute(samples.length * 4, 4),
		aEdge: new THREE.Float32BufferAttribute(samples.length * 2, 2),
	};
	function writeEndpoint(vertex, i, positionAttribute, indicesAttribute, weightsAttribute) {
		const { position, indices, weights } = vertex;
		positionAttribute.setXYZ(i, position.x, position.y, position.z);
		indicesAttribute.setXYZW(i, indices.x, indices.y, indices.z, indices.w);
		weightsAttribute.setXYZW(i, weights.x, weights.y, weights.z, weights.w);
	}
	for (let i = 0; i < samples.length; i++) {
		const a = vertices[endpoints[i * 2]], b = vertices[endpoints[i * 2 + 1]];
		writeEndpoint(a, i, attributes.position, attributes.aSkinIndicesA, attributes.aSkinWeightsA);
		writeEndpoint(b, i, attributes.aEndpointB, attributes.aSkinIndicesB, attributes.aSkinWeightsB);
		const { group } = a;
		attributes.aEdge.setXY(i, mixes[i], group.offset + (group.mesh.isSkinnedMesh ? group.mesh.skeleton.bones.length : 1));
	}
	for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);

	// Preweight the few CPU wake queries. In particular, X bounds must remain
	// exact without calling applyBoneTransform for every source vertex each frame.
	const starts = new Uint32Array(vertices.length + 1);
	const boneOffsets = [], weightedPositions = [];
	const postOffsets = new Uint32Array(vertices.length);
	const corrections = new Float64Array(vertices.length);
	vertices.forEach(({ position: p, indices, weights, group }, index) => {
		starts[index] = boneOffsets.length;
		let sum = 0;
		for (let i = 0; i < 4; i++) {
			const weight = weights.getComponent(i);
			if (weight === 0) continue;
			boneOffsets.push(indices.getComponent(i) * 12);
			weightedPositions.push(p.x * weight, p.y * weight, p.z * weight, weight);
			sum += weight;
		}
		postOffsets[index] = (group.offset + (group.mesh.isSkinnedMesh ? group.mesh.skeleton.bones.length : 1)) * 12;
		corrections[index] = 1 - sum;
	});
	starts[vertices.length] = boneOffsets.length;
	const offsets = new Uint32Array(boneOffsets), coefficients = new Float64Array(weightedPositions);
	for (const group of groups.values()) { group.vertices.clear(); group.uniqueVertices.clear(); }
	// The source vectors/maps are only needed while preparing attributes.
	for (let i = 0; i < vertices.length; i++) vertices[i] = { value: vertices[i].value, version: -1 };

	const matrix = new THREE.Matrix4(), post = new THREE.Matrix4();
	let version = 0, boundsVersion = -1;
	const xBounds = { min: Infinity, max: -Infinity };
	function writeMatrix(index, value) {
		const e = value.elements, offset = index * 12;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 4; col++) palette[offset + row * 4 + col] = e[col * 4 + row];
		}
	}
	function update() {
		for (const { mesh, offset } of groups.values()) {
			post.copy(mesh.matrix);
			if (mesh.isSkinnedMesh) {
				post.multiply(mesh.bindMatrixInverse);
				const { bones, boneInverses } = mesh.skeleton;
				for (let i = 0; i < bones.length; i++) {
					matrix.multiplyMatrices(post, bones[i].matrixWorld).multiply(boneInverses[i]).multiply(mesh.bindMatrix);
					writeMatrix(offset + i, matrix);
				}
				writeMatrix(offset + bones.length, post);
			} else {
				writeMatrix(offset, post);
				writeMatrix(offset + 1, post);
			}
		}
		version++;
		texture.needsUpdate = true;
	}
	function component(index, axis) {
		let value = 0;
		for (let i = starts[index]; i < starts[index + 1]; i++) {
			const j = offsets[i] + axis * 4, c = i * 4;
			value += palette[j] * coefficients[c] + palette[j + 1] * coefficients[c + 1]
				+ palette[j + 2] * coefficients[c + 2] + palette[j + 3] * coefficients[c + 3];
		}
		return value + corrections[index] * palette[postOffsets[index] + axis * 4 + 3];
	}
	function readVertex(index) {
		const vertex = vertices[index];
		if (vertex.version !== version) {
			vertex.value.set(component(index, 0), component(index, 1), component(index, 2));
			vertex.version = version;
		}
		return vertex.value;
	}
	function getPosition(index, target) {
		return target.lerpVectors(readVertex(endpoints[index * 2]), readVertex(endpoints[index * 2 + 1]), mixes[index]);
	}
	function getXBounds() {
		if (boundsVersion !== version) {
			xBounds.min = Infinity; xBounds.max = -Infinity;
			// Edge interpolation cannot extend beyond its endpoints. The wake only
			// needs these two scalars, not a full CPU copy of the animated cloud.
			for (let i = 0; i < vertices.length; i++) {
				const x = component(i, 0);
				xBounds.min = Math.min(xBounds.min, x); xBounds.max = Math.max(xBounds.max, x);
			}
			boundsVersion = version;
		}
		return xBounds;
	}
	update();
	const initialBounds = new THREE.Box3();
	for (let i = 0; i < vertices.length; i++) initialBounds.expandByPoint(readVertex(i));
	return {
		uniforms: { uWhaleBones: { value: texture }, uWhaleBoneRows: { value: rows } },
		initialBounds,
		bodySamples: { count: samples.length, getPosition, getXBounds },
		update,
		dispose: () => texture.dispose(),
	};
}
