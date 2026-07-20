import * as THREE from "three";
import { ABOUT_COLORS, ABOUT_PARTICLES } from "./aboutSceneConfig.js";
import { ABOUT_EDGE_DISSOLVE_GLSL } from "./aboutEdgeParticleDissolve.js";

function hash01(seed) {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

function createSoftGlowTexture() {
	const size = 64;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(0.22, "rgba(190,235,255,0.95)");
	g.addColorStop(0.55, "rgba(0,170,255,0.4)");
	g.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

/**
 * Outer XZ silhouette from host mesh (farthest radius per angle).
 * InsideLarge / EdgeForParticles are often outer-rim shells without a hole —
 * the inner rim is then a scaled copy of this loop.
 */
function extractSilhouetteLoop(geometry) {
	const pos = geometry?.getAttribute?.("position");
	if (!pos || pos.count < 4) return null;

	let yMin = Infinity;
	let yMax = -Infinity;
	let cx = 0;
	let cz = 0;
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		yMin = Math.min(yMin, y);
		yMax = Math.max(yMax, y);
		cx += x;
		cz += z;
	}
	cx /= pos.count;
	cz /= pos.count;

	const bins = 192;
	/** @type {({ x: number, z: number, r: number } | null)[]} */
	const best = new Array(bins).fill(null);
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const dx = x - cx;
		const dz = z - cz;
		const r = Math.hypot(dx, dz);
		if (r < 1e-5) continue;
		const bin = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * bins) % bins;
		const prev = best[bin];
		if (!prev || r > prev.r) best[bin] = { x, z, r };
	}

	const loop = [];
	for (let b = 0; b < bins; b += 1) {
		if (best[b]) loop.push({ x: best[b].x, z: best[b].z, r: best[b].r });
	}
	if (loop.length < 8) return null;

	return {
		loop,
		centerX: cx,
		centerZ: cz,
		y: (yMin + yMax) * 0.5,
		y0: yMin,
		y1: yMax,
	};
}

function measureLocalY(mesh) {
	const pos = mesh?.geometry?.getAttribute?.("position");
	if (!pos || pos.count < 2) return null;
	let y0 = Infinity;
	let y1 = -Infinity;
	for (let i = 0; i < pos.count; i += 1) {
		const y = pos.getY(i);
		y0 = Math.min(y0, y);
		y1 = Math.max(y1, y);
	}
	if (!(y1 > y0)) return null;
	return { y0, y1 };
}

function resampleClosedLoop(loop, count) {
	const n = loop.length;
	const segLen = new Float32Array(n);
	let total = 0;
	for (let i = 0; i < n; i += 1) {
		const a = loop[i];
		const b = loop[(i + 1) % n];
		const len = Math.hypot(b.x - a.x, b.z - a.z);
		segLen[i] = len;
		total += len;
	}
	if (total < 1e-6) return loop.map((p) => ({ x: p.x, z: p.z }));

	const out = [];
	for (let k = 0; k < count; k += 1) {
		let d = (k / count) * total;
		let i = 0;
		while (i < n && d > segLen[i]) {
			d -= segLen[i];
			i += 1;
		}
		i = Math.min(i, n - 1);
		const a = loop[i];
		const b = loop[(i + 1) % n];
		const u = segLen[i] > 1e-8 ? d / segLen[i] : 0;
		out.push({
			x: a.x + (b.x - a.x) * u,
			z: a.z + (b.z - a.z) * u,
		});
	}
	return out;
}

function buildRadiusTable(loop, cx, cz, bins = 256) {
	const radii = new Float32Array(bins);
	const counts = new Float32Array(bins);
	for (let i = 0; i < loop.length; i += 1) {
		const dx = loop[i].x - cx;
		const dz = loop[i].z - cz;
		const r = Math.hypot(dx, dz);
		const ang = Math.atan2(dz, dx);
		const bin = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * bins) % bins;
		radii[bin] = Math.max(radii[bin], r);
		counts[bin] += 1;
	}
	for (let b = 0; b < bins; b += 1) {
		if (counts[b] > 0) continue;
		let found = 0;
		for (let d = 1; d < bins && found === 0; d += 1) {
			const a = (b - d + bins) % bins;
			const c = (b + d) % bins;
			if (counts[a] > 0) {
				radii[b] = radii[a];
				found = 1;
			} else if (counts[c] > 0) {
				radii[b] = radii[c];
				found = 1;
			}
		}
	}
	return radii;
}

function radiusAt(radii, cx, cz, x, z) {
	const bins = radii.length;
	const dx = x - cx;
	const dz = z - cz;
	const r = Math.hypot(dx, dz);
	const ang = Math.atan2(dz, dx);
	const u = ((ang + Math.PI) / (Math.PI * 2)) * bins;
	const i0 = Math.floor(u) % bins;
	const i1 = (i0 + 1) % bins;
	const t = u - Math.floor(u);
	const R = radii[i0] * (1 - t) + radii[i1] * t;
	return { r, R: Math.max(R, 1e-5) };
}

function scaleLoopPoint(p, cx, cz, scale) {
	return {
		x: cx + (p.x - cx) * scale,
		z: cz + (p.z - cz) * scale,
	};
}

function silhouetteInAnchorSpace(raw, fromMesh, anchor) {
	if (!raw || !fromMesh || !anchor || fromMesh === anchor) return raw;
	fromMesh.updateWorldMatrix?.(true, false);
	anchor.updateWorldMatrix?.(true, false);
	if (!fromMesh.matrixWorld || !anchor.matrixWorld) return raw;

	const toAnchor = new THREE.Matrix4()
		.copy(anchor.matrixWorld)
		.invert()
		.multiply(fromMesh.matrixWorld);
	const v = new THREE.Vector3();
	const loop = raw.loop.map((p) => {
		v.set(p.x, raw.y, p.z).applyMatrix4(toAnchor);
		return { x: v.x, z: v.z };
	});
	v.set(raw.centerX, raw.y, raw.centerZ).applyMatrix4(toAnchor);
	return {
		loop,
		centerX: v.x,
		centerZ: v.z,
		y: v.y,
		y0: raw.y0,
		y1: raw.y1,
	};
}

/**
 * One 3D chip map across all Y floors of InsideLarge.
 * Nodes live on a grid in X × Y(layers) × Z; edges run along +X, +Y and +Z
 * so travelers move through the full volume — not on separate 2D floors.
 *
 * @param {THREE.Object3D} anchor
 * @param {{ mobile?: boolean, silhouetteMesh?: THREE.Mesh | null }} [opts]
 */
export function createAboutInsideParticles(anchor, { mobile = false, silhouetteMesh = null } = {}) {
	const cfg = ABOUT_PARTICLES;
	const shapeMesh = silhouetteMesh?.geometry ? silhouetteMesh : anchor;
	const rawSilhouette = extractSilhouetteLoop(shapeMesh?.geometry);
	const silhouette = silhouetteInAnchorSpace(rawSilhouette, shapeMesh, anchor);
	if (!silhouette) {
		return { update() {}, dispose() {}, materials: [] };
	}

	const { centerX: cx, centerZ: cz } = silhouette;
	const volY = measureLocalY(anchor) ?? { y0: silhouette.y0, y1: silhouette.y1 };
	const ySpan = Math.max(1e-4, volY.y1 - volY.y0);
	const yInset = THREE.MathUtils.clamp(cfg.thicknessInset ?? 0.1, 0.02, 0.4);
	const y0 = volY.y0 + ySpan * yInset;
	const y1 = volY.y1 - ySpan * yInset;
	const yLayers = Math.max(2, Math.round(cfg.yLayers ?? (mobile ? 3 : 4)));
	const layerY = (layerIndex) => {
		if (yLayers <= 1) return (y0 + y1) * 0.5;
		return THREE.MathUtils.lerp(y0, y1, layerIndex / (yLayers - 1));
	};

	const loopSegs = mobile ? 72 : 128;
	const outerLoop = resampleClosedLoop(silhouette.loop, loopSegs);
	const outerRadii = buildRadiusTable(outerLoop, cx, cz, 256);

	const ratio = (cfg.innerHalf ?? 0.48) / Math.max(cfg.outerHalf ?? 0.94, 1e-4);
	const innerScale = THREE.MathUtils.clamp(cfg.innerScale ?? ratio, 0.25, 0.85);
	const shellInset = THREE.MathUtils.clamp(cfg.shellInset ?? 0.035, 0.005, 0.12);
	const outerScale = 1 - shellInset;

	const inBand = (lx, lz, pad = 0) => {
		const { r, R } = radiusAt(outerRadii, cx, cz, lx, lz);
		const outer = R * outerScale * (1 - pad);
		const inner = R * innerScale * (1 + pad);
		return r <= outer && r >= inner;
	};

	let maxR = 0;
	for (let i = 0; i < outerRadii.length; i += 1) maxR = Math.max(maxR, outerRadii[i]);
	const radialNorm = Math.max(maxR * outerScale, 1e-4);
	/** 0 = center, 1 = outer rim — drives center-out PCB appear. */
	const radial01 = (x, z) => {
		const dx = x - cx;
		const dz = z - cz;
		return THREE.MathUtils.clamp(Math.hypot(dx, dz) / radialNorm, 0, 1);
	};

	const cell = mobile ? 0.055 : 0.034;
	const g0 = Math.ceil((-maxR) / cell) - 1;
	const g1 = Math.floor(maxR / cell) + 1;

	/** @type {Map<string, { ix: number, iy: number, iz: number, x: number, y: number, z: number, seed: number }>} */
	const nodes = new Map();
	const nKey = (ix, iy, iz) => `${ix},${iy},${iz}`;

	for (let iz = g0; iz <= g1; iz += 1) {
		for (let ix = g0; ix <= g1; ix += 1) {
			const x = cx + ix * cell;
			const z = cz + iz * cell;
			if (!inBand(x, z, 0.02)) continue;
			const base = hash01(ix * 17.13 + iz * 9.37);
			if (base > 0.48) continue;
			for (let iy = 0; iy < yLayers; iy += 1) {
				/** Sparse occupancy per floor so the single 3D map stays readable. */
				if (hash01(base + iy * 3.7 + ix * 0.11) > 0.62) continue;
				nodes.set(nKey(ix, iy, iz), {
					ix,
					iy,
					iz,
					x,
					y: layerY(iy),
					z,
					seed: hash01(ix * 2.1 + iy * 5.3 + iz * 7.9),
				});
			}
		}
	}

	/** @type {{ a: THREE.Vector3, b: THREE.Vector3, seed: number, weight: number, axis: string }[]} */
	const traces = [];
	const edgeSet = new Set();
	const pushEdge = (a, b, seed, weight, axis) => {
		const ka = `${a.ix},${a.iy},${a.iz}`;
		const kb = `${b.ix},${b.iy},${b.iz}`;
		const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
		if (edgeSet.has(ek)) return;
		edgeSet.add(ek);
		traces.push({
			a: new THREE.Vector3(a.x, a.y, a.z),
			b: new THREE.Vector3(b.x, b.y, b.z),
			seed,
			weight,
			axis,
		});
	};

	/**
	 * Inner volume: axis-aligned grid as the base.
	 *
	 * Model is stood up with rotation.x = π/2, so the face toward camera is
	 * local X × Z (screen X × Y). "X+Y" diagonals the eye can see are therefore
	 * local X+Z on the same floor — not local X+Y (that is thickness / depth).
	 */
	const pushFaceDiag = (a, dix, diz, seed, weight) => {
		const tx = a.x + dix * cell;
		const tz = a.z + diz * cell;
		if (!inBand(tx, tz, 0.02)) return;
		const bix = a.ix + dix;
		const biz = a.iz + diz;
		const key = nKey(bix, a.iy, biz);
		let b = nodes.get(key);
		if (!b) {
			b = {
				ix: bix,
				iy: a.iy,
				iz: biz,
				x: tx,
				y: a.y,
				z: tz,
				seed: hash01(seed + 0.37),
			};
			nodes.set(key, b);
		}
		pushEdge(a, b, seed, weight, "xy");
	};

	const seededNodes = [...nodes.values()];
	for (const node of seededNodes) {
		const right = nodes.get(nKey(node.ix + 1, node.iy, node.iz));
		if (right && hash01(node.seed + 1.1) > 0.22) {
			pushEdge(node, right, node.seed + 1, 0.9, "x");
		}
		const forward = nodes.get(nKey(node.ix, node.iy, node.iz + 1));
		if (forward && hash01(node.seed + 2.2) > 0.22) {
			pushEdge(node, forward, node.seed + 2, 0.9, "z");
		}
		const up = nodes.get(nKey(node.ix, node.iy + 1, node.iz));
		if (up && hash01(node.seed + 3.3) > 0.28) {
			pushEdge(node, up, node.seed + 3, 1.15, "y");
		}
		const right2 = nodes.get(nKey(node.ix + 2, node.iy, node.iz));
		if (right2 && hash01(node.seed + 4.4) > 0.55) {
			pushEdge(node, right2, node.seed + 4, 0.7, "x");
		}
		const forward2 = nodes.get(nKey(node.ix, node.iy, node.iz + 2));
		if (forward2 && hash01(node.seed + 5.5) > 0.55) {
			pushEdge(node, forward2, node.seed + 5, 0.7, "z");
		}
		/** Face X+Y (local X+Z): ~10% of nodes. */
		if (hash01(node.seed + 6.6) <= 0.1) {
			const signZ = hash01(node.seed + 7.1) > 0.5 ? 1 : -1;
			pushFaceDiag(node, 1, signZ, node.seed + 6, 1.05);
		}
	}

	/**
	 * No continuous silhouette outlines (those read as "clear lines").
	 * Keep only short dashed rim crumbs + pure depth jogs on the mesh form.
	 */
	/** ~3× outer rails vs prior pair; still dashed (no continuous outline). */
	const rimScales = [
		outerScale * 0.998,
		outerScale * 0.985,
		outerScale * 0.97,
		outerScale * 0.955,
		innerScale * 1.02,
		innerScale * 1.06,
	];
	const rimLoop = resampleClosedLoop(outerLoop, mobile ? 96 : 144);
	const pushRimSeg = (ax, ay, az, bx, by, bz, seed, weight, axis) => {
		if (Math.hypot(bx - ax, by - ay, bz - az) < 1e-6) return;
		traces.push({
			a: new THREE.Vector3(ax, ay, az),
			b: new THREE.Vector3(bx, by, bz),
			seed,
			weight,
			axis,
		});
	};
	const rimVias = [];
	const rimWeight = 0.9;
	const depthJog = Math.max(cell * 2.2, (y1 - y0) * 0.42);
	for (let ri = 0; ri < rimScales.length; ri += 1) {
		const scale = rimScales[ri];
		const isOuter = ri < 4;
		const floors = isOuter ? [0, yLayers - 1] : [Math.floor((yLayers - 1) * 0.5)];
		for (let f = 0; f < floors.length; f += 1) {
			const iy = floors[f];
			const y = layerY(iy);
			for (let i = 0; i < rimLoop.length; i += 1) {
				const seed = ri * 31 + iy * 7 + i * 0.13;
				/** Keep ~35% crumbs — denser, still broken. */
				if (hash01(seed) > 0.35) continue;
				if (hash01(seed + 0.07) > 0.5 && hash01(ri * 3 + (i - 1) * 0.13) <= 0.35) continue;
				const p0 = scaleLoopPoint(rimLoop[i], cx, cz, scale);
				const p1 = scaleLoopPoint(rimLoop[(i + 1) % rimLoop.length], cx, cz, scale);
				pushRimSeg(p0.x, y, p0.z, p1.x, y, p1.z, seed, rimWeight, "rim");
				rimVias.push({ x: p0.x, y, z: p0.z, seed, weight: 1.1 });
				if (isOuter && hash01(seed + 2.4) > 0.4) {
					const dir = hash01(seed + 3.1) > 0.5 ? 1 : -1;
					const amt = depthJog * (0.55 + hash01(seed + 3.7) * 0.45);
					const y1j = THREE.MathUtils.clamp(y + amt * dir, y0, y1);
					pushRimSeg(p0.x, y, p0.z, p0.x, y1j, p0.z, seed + 0.5, rimWeight, "z");
					rimVias.push({ x: p0.x, y: y1j, z: p0.z, seed: seed + 0.6, weight: 1.1 });
				}
			}
		}
	}

	const segCount = traces.length;
	const linePos = new Float32Array(Math.max(1, segCount) * 6);
	/** Segment 0→1 — pulse runners (must stay per-trace, not radial). */
	const lineAlong = new Float32Array(Math.max(1, segCount) * 2);
	/** Radial 0→1 — center-out appear only. */
	const lineRadial = new Float32Array(Math.max(1, segCount) * 2);
	const lineSeed = new Float32Array(Math.max(1, segCount) * 2);
	const lineWeight = new Float32Array(Math.max(1, segCount) * 2);
	for (let s = 0; s < segCount; s += 1) {
		const t = traces[s];
		const o = s * 6;
		linePos[o] = t.a.x;
		linePos[o + 1] = t.a.y;
		linePos[o + 2] = t.a.z;
		linePos[o + 3] = t.b.x;
		linePos[o + 4] = t.b.y;
		linePos[o + 5] = t.b.z;
		lineAlong[s * 2] = 0;
		lineAlong[s * 2 + 1] = 1;
		lineRadial[s * 2] = radial01(t.a.x, t.a.z);
		lineRadial[s * 2 + 1] = radial01(t.b.x, t.b.z);
		lineSeed[s * 2] = t.seed;
		lineSeed[s * 2 + 1] = t.seed;
		lineWeight[s * 2] = t.weight;
		lineWeight[s * 2 + 1] = t.weight;
	}

	const nodeList = [...nodes.values()];
	const substrate = [];
	const subStep = mobile ? cell * 0.8 : cell * 0.65;
	for (let iy = 0; iy < yLayers; iy += 1) {
		const y = layerY(iy);
		for (let z = cz - maxR; z <= cz + maxR; z += subStep) {
			for (let x = cx - maxR; x <= cx + maxR; x += subStep) {
				if (!inBand(x, z, 0.03)) continue;
				if (hash01(x * 40 + z * 17 + iy * 9) > 0.7) continue;
				substrate.push({ x, y, z, seed: hash01(x * 3 + z + iy) });
			}
		}
	}

	const viaPoints = [
		...nodeList.map((n) => ({
			x: n.x,
			y: n.y,
			z: n.z,
			seed: n.seed,
			weight: n.iy === 0 || n.iy === yLayers - 1 ? 1.35 : 1.1,
		})),
		...rimVias,
	];

	const travelers = Math.max(16, Math.round(cfg.travelers ?? (mobile ? 48 : 90)));
	const pointCount = viaPoints.length + substrate.length + travelers;
	const pointPos = new Float32Array(pointCount * 3);
	const pointSeed = new Float32Array(pointCount);
	const pointWeight = new Float32Array(pointCount);
	const pointAlong = new Float32Array(pointCount);
	const pointRadial = new Float32Array(pointCount);

	let pi = 0;
	for (let i = 0; i < viaPoints.length; i += 1, pi += 1) {
		pointPos[pi * 3] = viaPoints[i].x;
		pointPos[pi * 3 + 1] = viaPoints[i].y;
		pointPos[pi * 3 + 2] = viaPoints[i].z;
		pointSeed[pi] = viaPoints[i].seed;
		pointWeight[pi] = viaPoints[i].weight;
		pointAlong[pi] = viaPoints[i].seed;
		pointRadial[pi] = radial01(viaPoints[i].x, viaPoints[i].z);
	}
	for (let i = 0; i < substrate.length; i += 1, pi += 1) {
		pointPos[pi * 3] = substrate[i].x;
		pointPos[pi * 3 + 1] = substrate[i].y;
		pointPos[pi * 3 + 2] = substrate[i].z;
		pointSeed[pi] = substrate[i].seed;
		pointWeight[pi] = 0.32;
		pointAlong[pi] = substrate[i].seed;
		pointRadial[pi] = radial01(substrate[i].x, substrate[i].z);
	}
	const travelerBase = pi;

	const tmp = new THREE.Vector3();
	const end = new THREE.Vector3();
	const qKey = (v) =>
		`${Math.round(v.x * 250)},${Math.round(v.y * 250)},${Math.round(v.z * 250)}`;
	/** @type {Map<string, number[]>} */
	const adj = new Map();
	const linkEnd = (v, segIndex) => {
		const k = qKey(v);
		let list = adj.get(k);
		if (!list) {
			list = [];
			adj.set(k, list);
		}
		list.push(segIndex);
	};
	for (let s = 0; s < segCount; s += 1) {
		linkEnd(traces[s].a, s);
		linkEnd(traces[s].b, s);
	}
	const pickNextSegment = (fromPoint, excludeIndex, preferAxis) => {
		const list = adj.get(qKey(fromPoint));
		if (!list || list.length < 1) return excludeIndex;
		let best = excludeIndex;
		let bestScore = -1e12;
		for (let i = 0; i < list.length; i += 1) {
			const s = list[i];
			if (s === excludeIndex) continue;
			const seg = traces[s];
			let score = hash01(excludeIndex * 3.1 + s * 1.7 + fromPoint.x);
			if (seg.axis === preferAxis) score += 0.35;
			if (seg.axis === "xy") score += 0.08;
			if (seg.axis === "rim") score -= 0.12;
			if (score > bestScore) {
				bestScore = score;
				best = s;
			}
		}
		if (best !== excludeIndex) return best;
		for (let i = 0; i < list.length; i += 1) {
			if (list[i] !== excludeIndex) return list[i];
		}
		return excludeIndex;
	};

	const axes = /** @type {const} */ (["x", "y", "z"]);
	const travelerState = [];
	for (let i = 0; i < travelers; i += 1) {
		/** Seed travelers on inner (non-rim) segments when possible. */
		let segIndex = 0;
		if (segCount > 0) {
			const start = Math.floor(hash01(i * 11.1) * segCount) % segCount;
			segIndex = start;
			for (let k = 0; k < Math.min(segCount, 200); k += 1) {
				const s = (start + k) % segCount;
				if (traces[s].axis !== "rim") {
					segIndex = s;
					break;
				}
			}
		}
		const along = hash01(i * 4.2);
		const dir = hash01(i * 7.7) > 0.5 ? 1 : -1;
		travelerState.push({
			segIndex,
			along,
			dir,
			speed: 0.85 + hash01(i * 2.2) * 1.35,
			hops: 0,
		});
		const idx = travelerBase + i;
		if (segCount > 0) {
			const seg = traces[segIndex];
			tmp.lerpVectors(seg.a, seg.b, along);
			pointPos[idx * 3] = tmp.x;
			pointPos[idx * 3 + 1] = tmp.y;
			pointPos[idx * 3 + 2] = tmp.z;
		}
		pointSeed[idx] = hash01(i);
		pointWeight[idx] = 2.4;
		pointAlong[idx] = along;
		pointRadial[idx] = segCount > 0
			? radial01(pointPos[idx * 3], pointPos[idx * 3 + 2])
			: along;
	}

	const lineGeo = new THREE.BufferGeometry();
	lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
	lineGeo.setAttribute("aAlong", new THREE.BufferAttribute(lineAlong, 1));
	lineGeo.setAttribute("aRadial", new THREE.BufferAttribute(lineRadial, 1));
	lineGeo.setAttribute("aSeed", new THREE.BufferAttribute(lineSeed, 1));
	lineGeo.setAttribute("aWeight", new THREE.BufferAttribute(lineWeight, 1));

	const color = new THREE.Color(cfg.color ?? ABOUT_COLORS.particle);
	const appearMode = Number(cfg.appearMode ?? 4);
	const lineUniforms = {
		uColor: { value: color.clone() },
		uTime: { value: 0 },
		uIntensity: { value: cfg.lineIntensity ?? 2.6 },
		uPulseIntensity: { value: cfg.linePulseIntensity ?? 3.2 },
		uTravelSpeed: { value: cfg.travelSpeed ?? 0.55 },
		uOpacity: { value: cfg.opacity ?? 1 },
		/** 1 = hidden, 0 = fully assembled (inverted dissolve for appear). */
		uDissolve: { value: 1 },
		uDissolveMode: { value: appearMode },
	};

	const lineMat = new THREE.ShaderMaterial({
		uniforms: lineUniforms,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		vertexShader: /* glsl */ `
			attribute float aAlong;
			attribute float aRadial;
			attribute float aSeed;
			attribute float aWeight;
			varying float vAlong;
			varying float vRadial;
			varying float vSeed;
			varying float vWeight;
			void main() {
				vAlong = aAlong;
				vRadial = aRadial;
				vSeed = aSeed;
				vWeight = aWeight;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uTime;
			uniform float uIntensity;
			uniform float uPulseIntensity;
			uniform float uTravelSpeed;
			uniform float uOpacity;
			varying float vAlong;
			varying float vRadial;
			varying float vSeed;
			varying float vWeight;

			${ABOUT_EDGE_DISSOLVE_GLSL}

			void main() {
				vec2 appear = edgeDissolveSample(vSeed, vRadial, uTime);
				if (appear.x < 0.02) discard;
				float pulse = fract(vAlong - uTime * uTravelSpeed * 0.35 + vSeed);
				float runner = pow(1.0 - smoothstep(0.0, 0.1, abs(pulse - 0.5) * 2.0), 1.6);
				float base = 0.55 * uIntensity * vWeight;
				float alpha = (base + runner * uPulseIntensity * 0.85) * uOpacity * 0.55 * appear.x;
				if (alpha < 0.02) discard;
				vec3 col = uColor * (base * 0.85 + runner * 1.8);
				col += uColor * appear.y * 1.15;
				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	/**
	 * White PCB at fixed -45° yaw — does not spin with Heart / blue lattice.
	 */
	const spin = new THREE.Group();
	spin.name = "AboutInsideParticleSpin";
	const yawDeg = cfg.yawDeg ?? -45;
	const yawAxis = Array.isArray(cfg.yawAxis) ? cfg.yawAxis : [0, 1, 0];
	const yaw = new THREE.Vector3(yawAxis[0], yawAxis[1], yawAxis[2]);
	if (yaw.lengthSq() < 1e-8) yaw.set(0, 1, 0);
	yaw.normalize();
	spin.quaternion.setFromAxisAngle(yaw, THREE.MathUtils.degToRad(yawDeg));
	anchor.add(spin);

	const lines = new THREE.LineSegments(lineGeo, lineMat);
	lines.name = "AboutMicrochipTraces";
	lines.frustumCulled = false;
	lines.renderOrder = 4;
	spin.add(lines);

	const pointGeo = new THREE.BufferGeometry();
	pointGeo.setAttribute("position", new THREE.BufferAttribute(pointPos, 3));
	pointGeo.setAttribute("aSeed", new THREE.BufferAttribute(pointSeed, 1));
	pointGeo.setAttribute("aWeight", new THREE.BufferAttribute(pointWeight, 1));
	pointGeo.setAttribute("aAlong", new THREE.BufferAttribute(pointAlong, 1));
	pointGeo.setAttribute("aRadial", new THREE.BufferAttribute(pointRadial, 1));

	const glowMap = createSoftGlowTexture();
	const pointUniforms = {
		uColor: { value: color.clone() },
		uTime: { value: 0 },
		uSize: { value: (cfg.size ?? 0.045) * (mobile ? 0.9 : 1) },
		uNodeIntensity: { value: cfg.nodeIntensity ?? 4.2 },
		uPulseSpeed: { value: cfg.pulseSpeed ?? 1.8 },
		uOpacity: { value: cfg.opacity ?? 1 },
		uMap: { value: glowMap },
		uMaxPointSize: { value: cfg.maxPointSizePx ?? 14 },
		uDissolve: { value: 1 },
		uDissolveMode: { value: appearMode },
	};

	const pointMat = new THREE.ShaderMaterial({
		uniforms: pointUniforms,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		vertexShader: /* glsl */ `
			attribute float aSeed;
			attribute float aWeight;
			attribute float aRadial;
			uniform float uTime;
			uniform float uSize;
			uniform float uPulseSpeed;
			uniform float uNodeIntensity;
			uniform float uMaxPointSize;
			uniform float uDissolve;
			uniform float uDissolveMode;
			varying float vGlow;
			varying float vSeed;
			varying float vRadial;
			void main() {
				vSeed = aSeed;
				vRadial = aRadial;
				float flicker = 0.78 + 0.22 * sin(uTime * uPulseSpeed + aSeed * 6.2831);
				vGlow = aWeight * flicker * uNodeIntensity;

				float mode = floor(uDissolveMode + 0.5);
				float d = clamp(uDissolve, 0.0, 1.0);
				/** Spark assemble: points bloom while forming. */
				float sizeMul = 1.0;
				if (mode > 2.5 && mode < 3.5) {
					float form = 1.0 - d;
					sizeMul = mix(0.35, 2.2, smoothstep(0.0, 0.55, form))
						* (1.0 - smoothstep(0.7, 1.0, form) * 0.35);
				}

				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_Position = projectionMatrix * mv;
				float scale = aWeight > 2.0 ? 1.85 : (aWeight > 0.9 ? 1.15 : 0.55);
				float maxPx = aWeight > 2.0 ? uMaxPointSize * 1.35 : (aWeight > 0.9 ? uMaxPointSize : uMaxPointSize * 0.55);
				gl_PointSize = min(uSize * scale * sizeMul * (280.0 / max(-mv.z, 0.1)), maxPx * sizeMul);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uOpacity;
			uniform float uTime;
			uniform sampler2D uMap;
			varying float vGlow;
			varying float vSeed;
			varying float vRadial;

			${ABOUT_EDGE_DISSOLVE_GLSL}

			void main() {
				vec2 appear = edgeDissolveSample(vSeed, vRadial, uTime);
				if (appear.x < 0.02) discard;
				vec4 tex = texture2D(uMap, gl_PointCoord);
				float alpha = tex.a * vGlow * uOpacity * 0.85 * appear.x;
				if (alpha < 0.02) discard;
				vec3 col = uColor * (0.65 + tex.r * 1.45);
				col += uColor * appear.y * 1.2;
				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	const points = new THREE.Points(pointGeo, pointMat);
	points.name = "AboutMicrochipVias";
	points.frustumCulled = false;
	points.renderOrder = 5;
	spin.add(points);

	const positionAttr = pointGeo.getAttribute("position");
	const alongAttr = pointGeo.getAttribute("aAlong");
	const radialAttr = pointGeo.getAttribute("aRadial");
	const baseOpacity = cfg.opacity ?? 1;
	let reveal = 0;

	let currentAppearMode = appearMode;

	const applyReveal = (next, mode = currentAppearMode) => {
		reveal = THREE.MathUtils.clamp(Number(next) || 0, 0, 1);
		if (mode != null && Number.isFinite(Number(mode))) {
			currentAppearMode = Number(mode);
		}
		/** Invert dissolve: 1 = gone, 0 = fully assembled. */
		const dissolve = 1 - reveal;
		lineUniforms.uOpacity.value = baseOpacity;
		pointUniforms.uOpacity.value = baseOpacity;
		lineUniforms.uDissolve.value = dissolve;
		pointUniforms.uDissolve.value = dissolve;
		lineUniforms.uDissolveMode.value = currentAppearMode;
		pointUniforms.uDissolveMode.value = currentAppearMode;
		const show = reveal > 0.004;
		lines.visible = show;
		points.visible = show;
	};
	applyReveal(0);

	return {
		points,
		lines,
		materials: [lineMat, pointMat],
		/**
		 * 0 = hidden, 1 = fully on. Optional mode switches appear variant live.
		 */
		setRevealProgress(progress, mode) {
			applyReveal(progress, mode);
		},
		update(elapsed, delta = 1 / 60) {
			if (reveal <= 0.004) return;
			const d = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.1);
			lineUniforms.uTime.value = elapsed;
			pointUniforms.uTime.value = elapsed;
			if (segCount < 1) return;
			const speed = lineUniforms.uTravelSpeed.value;
			for (let i = 0; i < travelers; i += 1) {
				const st = travelerState[i];
				st.along += d * st.speed * speed * st.dir;
				let guard = 0;
				while ((st.along > 1 || st.along < 0) && guard < 8) {
					guard += 1;
					const seg = traces[st.segIndex];
					end.copy(st.along >= 1 ? seg.b : seg.a);
					st.along = st.along > 1 ? st.along - 1 : st.along + 1;
					/** Mostly X/Y/Z; occasionally prefer a rare X+Y jog. */
					const preferAxis =
						st.hops % 7 === 0 ? "xy" : axes[(st.hops + i) % 3];
					const best = pickNextSegment(end, st.segIndex, preferAxis);
					st.segIndex = best;
					st.hops += 1;
					const next = traces[best];
					const atA = next.a.distanceToSquared(end) <= next.b.distanceToSquared(end);
					st.dir = atA ? 1 : -1;
					st.along = atA ? Math.min(st.along, 1) : 1 - Math.min(st.along, 1);
				}
				const seg = traces[st.segIndex];
				tmp.lerpVectors(seg.a, seg.b, THREE.MathUtils.clamp(st.along, 0, 1));
				positionAttr.setXYZ(travelerBase + i, tmp.x, tmp.y, tmp.z);
				alongAttr.setX(travelerBase + i, THREE.MathUtils.clamp(st.along, 0, 1));
				radialAttr.setX(travelerBase + i, radial01(tmp.x, tmp.z));
			}
			positionAttr.needsUpdate = true;
			alongAttr.needsUpdate = true;
			radialAttr.needsUpdate = true;
		},
		dispose() {
			spin.remove(lines);
			spin.remove(points);
			anchor.remove(spin);
			lineGeo.dispose();
			pointGeo.dispose();
			lineMat.dispose();
			pointMat.dispose();
			glowMap.dispose();
		},
	};
}
