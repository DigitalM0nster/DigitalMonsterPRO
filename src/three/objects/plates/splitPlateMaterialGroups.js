import * as THREE from "three";

const FLAT_NORMAL_EPSILON = 1e-5;

function isFlatSideTriangle(normalAttribute, triangleStart) {
	let isFlatX = true;
	let isFlatY = true;

	for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
		const vertexIndex = triangleStart + vertexOffset;
		const x = normalAttribute.getX(vertexIndex);
		const y = normalAttribute.getY(vertexIndex);
		const z = normalAttribute.getZ(vertexIndex);

		isFlatX =
			isFlatX &&
			Math.abs(Math.abs(x) - 1) <= FLAT_NORMAL_EPSILON &&
			Math.abs(y) <= FLAT_NORMAL_EPSILON &&
			Math.abs(z) <= FLAT_NORMAL_EPSILON;
		isFlatY =
			isFlatY &&
			Math.abs(Math.abs(y) - 1) <= FLAT_NORMAL_EPSILON &&
			Math.abs(x) <= FLAT_NORMAL_EPSILON &&
			Math.abs(z) <= FLAT_NORMAL_EPSILON;
	}

	return isFlatX || isFlatY;
}

function reorderAttributeTriangles(attribute, triangleStarts) {
	if (attribute.isInterleavedBufferAttribute) {
		throw new Error("Plate geometry cannot split interleaved attributes");
	}

	const itemSize = attribute.itemSize;
	const source = attribute.array;
	const reordered = new source.constructor(source.length);
	let targetVertex = 0;

	for (const triangleStart of triangleStarts) {
		for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
			const sourceVertex = triangleStart + vertexOffset;
			const sourceOffset = sourceVertex * itemSize;
			const targetOffset = targetVertex * itemSize;

			for (let component = 0; component < itemSize; component += 1) {
				reordered[targetOffset + component] = source[sourceOffset + component];
			}
			targetVertex += 1;
		}
	}

	const result = new THREE.BufferAttribute(reordered, itemSize, attribute.normalized);
	result.name = attribute.name;
	result.gpuType = attribute.gpuType;
	return result;
}

/**
 * Keeps front, back and rounded bevels on material 0.
 * Only the four perfectly flat X/Y walls use material 1.
 */
export function splitPlateMaterialGroups(geometry) {
	if (!geometry || geometry.index || !geometry.getAttribute("normal")) {
		return geometry;
	}

	const normal = geometry.getAttribute("normal");
	const regularTriangles = [];
	const flatSideTriangles = [];

	for (let triangleStart = 0; triangleStart < normal.count; triangleStart += 3) {
		(isFlatSideTriangle(normal, triangleStart) ? flatSideTriangles : regularTriangles).push(triangleStart);
	}

	if (flatSideTriangles.length === 0 || regularTriangles.length === 0) {
		return geometry;
	}

	const triangleOrder = [...regularTriangles, ...flatSideTriangles];
	for (const [name, attribute] of Object.entries(geometry.attributes)) {
		geometry.setAttribute(name, reorderAttributeTriangles(attribute, triangleOrder));
	}

	const regularVertexCount = regularTriangles.length * 3;
	const sideVertexCount = flatSideTriangles.length * 3;
	geometry.clearGroups();
	geometry.addGroup(0, regularVertexCount, 0);
	geometry.addGroup(regularVertexCount, sideVertexCount, 1);

	return geometry;
}
