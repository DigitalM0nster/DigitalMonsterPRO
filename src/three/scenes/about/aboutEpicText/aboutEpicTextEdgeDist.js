import * as THREE from "three";

/** Quantize enough to weld unwelded GLB letter verts without collapsing curves. */
const POS_KEY_SCALE = 1e4;

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function posKey(x, y, z) {
	return `${Math.round(x * POS_KEY_SCALE)}|${Math.round(y * POS_KEY_SCALE)}|${Math.round(z * POS_KEY_SCALE)}`;
}

/**
 * Boundary silhouette edges in XZ — works even when GLB letters are unwelded
 * (duplicate verts per triangle). Edges are merged by quantized position.
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ ax: number, az: number, bx: number, bz: number, nx: number, nz: number, y: number }[]}
 */
export function collectAboutEpicBoundaryEdges(geometry) {
	const pos = geometry?.getAttribute?.("position");
	if (!pos) return [];

	const index = geometry.index;
	const triCount = index ? index.count / 3 : pos.count / 3;

	/** Weld map: position key → compact id */
	/** @type {Map<string, number>} */
	const weld = new Map();
	/** @type {{ x: number, y: number, z: number }[]} */
	const welded = [];

	const weldIndex = (i) => {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		const key = posKey(x, y, z);
		let id = weld.get(key);
		if (id === undefined) {
			id = welded.length;
			weld.set(key, id);
			welded.push({ x, y, z });
		}
		return id;
	};

	/** @type {Map<string, { a: number, b: number, count: number, c: number }>} */
	const edges = new Map();

	const addEdge = (i0, i1, i2) => {
		const a = Math.min(i0, i1);
		const b = Math.max(i0, i1);
		if (a === b) return;
		const key = `${a}|${b}`;
		const prev = edges.get(key);
		if (prev) {
			prev.count += 1;
		} else {
			edges.set(key, { a, b, count: 1, c: i2 });
		}
	};

	for (let t = 0; t < triCount; t += 1) {
		const i0 = weldIndex(index ? index.getX(t * 3) : t * 3);
		const i1 = weldIndex(index ? index.getX(t * 3 + 1) : t * 3 + 1);
		const i2 = weldIndex(index ? index.getX(t * 3 + 2) : t * 3 + 2);
		addEdge(i0, i1, i2);
		addEdge(i1, i2, i0);
		addEdge(i2, i0, i1);
	}

	/** @type {ReturnType<typeof collectAboutEpicBoundaryEdges>} */
	const boundary = [];
	for (const e of edges.values()) {
		if (e.count !== 1) continue;
		const A = welded[e.a];
		const B = welded[e.b];
		const C = welded[e.c];
		if (!A || !B || !C) continue;

		const dx = B.x - A.x;
		const dz = B.z - A.z;
		const len = Math.hypot(dx, dz);
		if (len < 1e-8) continue;
		let nx = -dz / len;
		let nz = dx / len;
		const mx = (A.x + B.x) * 0.5;
		const mz = (A.z + B.z) * 0.5;
		if (nx * (C.x - mx) + nz * (C.z - mz) > 0) {
			nx = -nx;
			nz = -nz;
		}

		boundary.push({
			ax: A.x,
			az: A.z,
			bx: B.x,
			bz: B.z,
			nx,
			nz,
			y: (A.y + B.y) * 0.5,
		});
	}
	return boundary;
}

/**
 * Per-vertex distance (local XZ) to the letter silhouette boundary.
 * Spatial bins keep this O(verts × local edges), not O(verts × all edges) —
 * three locale meshes under the preloader must not freeze the main thread.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferAttribute | null}
 */
export function computeAboutEpicLetterEdgeDistance(geometry) {
	const pos = geometry?.getAttribute?.("position");
	if (!pos) return null;
	const boundary = collectAboutEpicBoundaryEdges(geometry);
	if (boundary.length === 0) return null;

	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (let e = 0; e < boundary.length; e += 1) {
		const { ax, az, bx, bz } = boundary[e];
		minX = Math.min(minX, ax, bx);
		maxX = Math.max(maxX, ax, bx);
		minZ = Math.min(minZ, az, bz);
		maxZ = Math.max(maxZ, az, bz);
	}
	const spanX = Math.max(maxX - minX, 1e-5);
	const spanZ = Math.max(maxZ - minZ, 1e-5);
	const bins = Math.max(12, Math.min(48, Math.ceil(Math.sqrt(boundary.length))));
	/** @type {number[][]} */
	const grid = Array.from({ length: bins * bins }, () => []);
	const toBin = (x, z) => {
		const ix = Math.max(0, Math.min(bins - 1, Math.floor(((x - minX) / spanX) * bins)));
		const iz = Math.max(0, Math.min(bins - 1, Math.floor(((z - minZ) / spanZ) * bins)));
		return ix + iz * bins;
	};
	for (let e = 0; e < boundary.length; e += 1) {
		const { ax, az, bx, bz } = boundary[e];
		const i0 = toBin(ax, az);
		const i1 = toBin(bx, bz);
		grid[i0].push(e);
		if (i1 !== i0) grid[i1].push(e);
	}

	const dist = new Float32Array(pos.count);
	for (let i = 0; i < pos.count; i += 1) {
		const px = pos.getX(i);
		const pz = pos.getZ(i);
		const ix = Math.max(0, Math.min(bins - 1, Math.floor(((px - minX) / spanX) * bins)));
		const iz = Math.max(0, Math.min(bins - 1, Math.floor(((pz - minZ) / spanZ) * bins)));
		let best = 1e9;
		for (let oz = -1; oz <= 1; oz += 1) {
			for (let ox = -1; ox <= 1; ox += 1) {
				const cx = ix + ox;
				const cz = iz + oz;
				if (cx < 0 || cz < 0 || cx >= bins || cz >= bins) continue;
				const cell = grid[cx + cz * bins];
				for (let k = 0; k < cell.length; k += 1) {
					const { ax, az, bx, bz } = boundary[cell[k]];
					const abx = bx - ax;
					const abz = bz - az;
					const apx = px - ax;
					const apz = pz - az;
					const abLen2 = abx * abx + abz * abz;
					const t = abLen2 > 1e-12 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLen2)) : 0;
					const qx = ax + abx * t - px;
					const qz = az + abz * t - pz;
					const d = Math.sqrt(qx * qx + qz * qz);
					if (d < best) best = d;
				}
			}
		}
		/** Fallback if bins missed (degenerate span). */
		if (!(best < 1e8)) {
			for (let e = 0; e < boundary.length; e += 1) {
				const { ax, az, bx, bz } = boundary[e];
				const abx = bx - ax;
				const abz = bz - az;
				const apx = px - ax;
				const apz = pz - az;
				const abLen2 = abx * abx + abz * abz;
				const t = abLen2 > 1e-12 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLen2)) : 0;
				const qx = ax + abx * t - px;
				const qz = az + abz * t - pz;
				const d = Math.sqrt(qx * qx + qz * qz);
				if (d < best) best = d;
			}
		}
		dist[i] = best;
	}
	return new THREE.BufferAttribute(dist, 1);
}

/**
 * True outline stroke: ribbon quads along silhouette edges, expanded OUTWARD only.
 * Not a scaled letter copy.
 *
 * @param {THREE.BufferGeometry} source letter mesh
 * @param {number} width stroke thickness (local units)
 * @param {number} [outset] gap between letter edge and stroke inner side
 * @returns {THREE.BufferGeometry | null}
 */
export function createAboutEpicOutlineStrokeGeometry(source, width, outset = 0) {
	const w = Math.max(Number(width) || 0, 1e-5);
	const gap = Math.max(Number(outset) || 0, 0);
	const boundary = collectAboutEpicBoundaryEdges(source);
	if (boundary.length === 0) return null;

	const vertCount = boundary.length * 4;
	const positions = new Float32Array(vertCount * 3);
	const uvs = new Float32Array(vertCount * 2);
	const edgeDist = new Float32Array(vertCount);
	const indices = new Uint32Array(boundary.length * 6);

	let along = 0;
	for (let e = 0; e < boundary.length; e += 1) {
		const { ax, az, bx, bz, nx, nz, y } = boundary[e];
		const segLen = Math.hypot(bx - ax, bz - az) || 1e-5;
		const u0 = along;
		const u1 = along + segLen;
		along = u1;

		const ix = gap * nx;
		const iz = gap * nz;
		const ox = (gap + w) * nx;
		const oz = (gap + w) * nz;

		const base = e * 4;
		const set = (vi, x, yy, z, u, v, ed) => {
			const o = (base + vi) * 3;
			positions[o] = x;
			positions[o + 1] = yy;
			positions[o + 2] = z;
			const uo = (base + vi) * 2;
			uvs[uo] = u;
			uvs[uo + 1] = v;
			edgeDist[base + vi] = ed;
		};

		set(0, ax + ix, y, az + iz, u0, 0, 0);
		set(1, bx + ix, y, bz + iz, u1, 0, 0);
		set(2, bx + ox, y, bz + oz, u1, 1, w);
		set(3, ax + ox, y, az + oz, u0, 1, w);

		const io = e * 6;
		indices[io] = base;
		indices[io + 1] = base + 1;
		indices[io + 2] = base + 2;
		indices[io + 3] = base;
		indices[io + 4] = base + 2;
		indices[io + 5] = base + 3;
	}

	const total = Math.max(along, 1e-5);
	for (let i = 0; i < vertCount; i += 1) {
		uvs[i * 2] /= total;
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
	geo.setAttribute("aEdgeDist", new THREE.BufferAttribute(edgeDist, 1));
	geo.setIndex(new THREE.BufferAttribute(indices, 1));
	geo.computeVertexNormals();
	return geo;
}
