import * as THREE from "three";

export const CITY_WINDOW_LIGHT_ATTRIBUTE = "aWindowLight";

const CLUSTER_COLUMNS = 3;
const CLUSTER_ROWS = 2;
const ACTIVE_CLUSTER_CHANCE = 0.42;
const ACTIVE_WINDOW_CHANCE = 0.3;
const SCATTERED_WINDOW_CHANCE = 0.018;

function hashString(value = "") {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function hashUnit(x, y, z = 0) {
	let hash = 2166136261;
	for (const value of [x, y, z]) {
		hash ^= Math.round(value * 1000);
		hash = Math.imul(hash, 16777619);
		hash ^= hash >>> 13;
	}
	return (hash >>> 0) / 4294967295;
}

function collectWindowVertexGroups(geometry) {
	const position = geometry.getAttribute("position");
	if (!position) return [];

	const index = geometry.index?.array;
	if (!index) {
		const groupSize = position.count % 6 === 0 ? 6 : 3;
		const groups = [];
		for (let offset = 0; offset < position.count; offset += groupSize) {
			groups.push(Array.from(
				{ length: Math.min(groupSize, position.count - offset) },
				(_, indexInGroup) => offset + indexInGroup,
			));
		}
		return groups;
	}

	const parents = Int32Array.from({ length: position.count }, (_, vertexIndex) => vertexIndex);
	const findRoot = (vertexIndex) => {
		let root = vertexIndex;
		while (parents[root] !== root) root = parents[root];
		while (parents[vertexIndex] !== vertexIndex) {
			const parent = parents[vertexIndex];
			parents[vertexIndex] = root;
			vertexIndex = parent;
		}
		return root;
	};
	const join = (left, right) => {
		const leftRoot = findRoot(left);
		const rightRoot = findRoot(right);
		if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
	};

	for (let offset = 0; offset + 2 < index.length; offset += 3) {
		join(index[offset], index[offset + 1]);
		join(index[offset], index[offset + 2]);
	}

	const groupsByRoot = new Map();
	for (const vertexIndex of new Set(index)) {
		const root = findRoot(vertexIndex);
		const group = groupsByRoot.get(root) ?? [];
		group.push(vertexIndex);
		groupsByRoot.set(root, group);
	}
	return [...groupsByRoot.values()];
}

/** Assigns one stable light value per modeled window; no per-frame noise or allocations. */
export function addCityWindowLightPattern(object) {
	const geometry = object.geometry;
	const position = geometry?.getAttribute("position");
	if (!position) return;

	const vertexGroups = collectWindowVertexGroups(geometry);
	if (vertexGroups.length === 0) return;

	const centers = vertexGroups.map((vertexGroup) => {
		const center = new THREE.Vector3();
		for (const vertexIndex of vertexGroup) {
			center.x += position.getX(vertexIndex);
			center.y += position.getY(vertexIndex);
			center.z += position.getZ(vertexIndex);
		}
		return center.multiplyScalar(1 / vertexGroup.length).applyMatrix4(object.matrixWorld);
	});
	const bounds = new THREE.Box3().setFromPoints(centers);
	const boundsSize = bounds.getSize(new THREE.Vector3());
	const boundsCenter = bounds.getCenter(new THREE.Vector3());
	const useRadialColumns = Math.min(boundsSize.x, boundsSize.z) > Math.max(boundsSize.x, boundsSize.z) * 0.72;
	const useXColumns = boundsSize.x >= boundsSize.z;
	const rowCount = THREE.MathUtils.clamp(Math.round(Math.sqrt(vertexGroups.length) * 0.72), 5, 24);
	const columnCount = THREE.MathUtils.clamp(Math.round(vertexGroups.length / rowCount), 8, 36);
	const meshSeed = hashString(object.name);
	const lightValues = new Float32Array(position.count);

	for (let groupIndex = 0; groupIndex < vertexGroups.length; groupIndex += 1) {
		const center = centers[groupIndex];
		const normalizedY = boundsSize.y > 1e-5
			? THREE.MathUtils.clamp((center.y - bounds.min.y) / boundsSize.y, 0, 0.999999)
			: 0.5;
		let normalizedColumn;
		if (useRadialColumns) {
			normalizedColumn = (Math.atan2(
				center.z - boundsCenter.z,
				center.x - boundsCenter.x,
			) + Math.PI) / (Math.PI * 2);
		} else {
			const axisSize = useXColumns ? boundsSize.x : boundsSize.z;
			const axisMin = useXColumns ? bounds.min.x : bounds.min.z;
			const axisValue = useXColumns ? center.x : center.z;
			normalizedColumn = axisSize > 1e-5
				? THREE.MathUtils.clamp((axisValue - axisMin) / axisSize, 0, 0.999999)
				: 0.5;
		}

		const row = Math.floor(normalizedY * rowCount);
		const column = Math.floor(normalizedColumn * columnCount);
		const clusterRow = Math.floor(row / CLUSTER_ROWS);
		const clusterColumn = Math.floor(column / CLUSTER_COLUMNS);
		const clusterIsActive = hashUnit(clusterColumn, clusterRow, meshSeed) < ACTIVE_CLUSTER_CHANCE;
		const lightChance = clusterIsActive ? ACTIVE_WINDOW_CHANCE : SCATTERED_WINDOW_CHANCE;
		const windowRandom = hashUnit(center.x, center.y, center.z + meshSeed);
		const brightnessRandom = hashUnit(center.z, center.x, center.y + meshSeed * 0.5);
		const brightness = windowRandom < lightChance
			? THREE.MathUtils.lerp(0.68, 1, brightnessRandom)
			: 0;

		for (const vertexIndex of vertexGroups[groupIndex]) {
			lightValues[vertexIndex] = brightness;
		}
	}

	geometry.setAttribute(
		CITY_WINDOW_LIGHT_ATTRIBUTE,
		new THREE.Float32BufferAttribute(lightValues, 1),
	);
}
