import * as THREE from "three";
import { CASE3_BLOCK_HOVER as CFG } from "./case3InteractConfig.js";

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _localOrigin = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();
const _ndc = new THREE.Vector2();
const _idleColor = new THREE.Color();
const _hotColor = new THREE.Color();

/**
 * Ray ↔ Y-rotated OBB. Returns hit distance or -1.
 * Boxes live in `constructionBlocks` local space.
 */
function rayObbDistance(ox, oy, oz, dx, dy, dz, cx, cy, cz, hx, hy, hz, cos, sin) {
	// World(local group) → box local (undo yaw around Y)
	const px = ox - cx;
	const pz = oz - cz;
	const lx = px * cos + pz * sin;
	const ly = oy - cy;
	const lz = -px * sin + pz * cos;
	const ldx = dx * cos + dz * sin;
	const ldy = dy;
	const ldz = -dx * sin + dz * cos;

	let tMin = 0;
	let tMax = Infinity;

	// X slab
	if (Math.abs(ldx) < 1e-8) {
		if (lx < -hx || lx > hx) return -1;
	} else {
		const inv = 1 / ldx;
		let t1 = (-hx - lx) * inv;
		let t2 = (hx - lx) * inv;
		if (t1 > t2) {
			const tmp = t1;
			t1 = t2;
			t2 = tmp;
		}
		tMin = t1 > tMin ? t1 : tMin;
		tMax = t2 < tMax ? t2 : tMax;
		if (tMin > tMax) return -1;
	}

	// Y slab
	if (Math.abs(ldy) < 1e-8) {
		if (ly < -hy || ly > hy) return -1;
	} else {
		const inv = 1 / ldy;
		let t1 = (-hy - ly) * inv;
		let t2 = (hy - ly) * inv;
		if (t1 > t2) {
			const tmp = t1;
			t1 = t2;
			t2 = tmp;
		}
		tMin = t1 > tMin ? t1 : tMin;
		tMax = t2 < tMax ? t2 : tMax;
		if (tMin > tMax) return -1;
	}

	// Z slab
	if (Math.abs(ldz) < 1e-8) {
		if (lz < -hz || lz > hz) return -1;
	} else {
		const inv = 1 / ldz;
		let t1 = (-hz - lz) * inv;
		let t2 = (hz - lz) * inv;
		if (t1 > t2) {
			const tmp = t1;
			t1 = t2;
			t2 = tmp;
		}
		tMin = t1 > tMin ? t1 : tMin;
		tMax = t2 < tMax ? t2 : tMax;
		if (tMin > tMax) return -1;
	}

	return tMin >= 0 ? tMin : tMax >= 0 ? tMax : -1;
}

/**
 * Construction-block hover only.
 * No THREE.Raycaster — O(blocks) ray/OBB when pointer NDC moves; visuals snap on change.
 */
export function createCase3PointerInteract({ constructionBlocks, store, disposables }) {
	const blocks = constructionBlocks.userData.blocks ?? [];
	const stripMeshes = constructionBlocks.userData.stripMeshes ?? [];
	const lineGlow = constructionBlocks.userData.lineGlow;
	const baseStripHeight = lineGlow?.coreHeight ?? 0.01;

	/** @type {Array<{ cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, cos: number, sin: number }>} */
	const obbs = blocks.map((definition) => {
		const rotation = definition.rotation ?? 0;
		return {
			cx: definition.x,
			cy: (definition.baseY ?? 0) + definition.height * 0.5,
			cz: definition.z,
			hx: definition.width * 0.5,
			hy: definition.height * 0.5,
			hz: definition.depth * 0.5,
			cos: Math.cos(rotation),
			sin: Math.sin(rotation),
		};
	});

	const edgeGeometry = new THREE.BoxGeometry(1, 1, 1);
	const edgeMaterial = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		vertexColors: false,
		wireframe: true,
		transparent: true,
		opacity: CFG.edgeOpacity,
		depthWrite: false,
		fog: true,
		toneMapped: false,
	});
	const edges = new THREE.InstancedMesh(edgeGeometry, edgeMaterial, Math.max(blocks.length, 1));
	edges.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(blocks.length, 1) * 3), 3);
	const dummy = new THREE.Object3D();
	_idleColor.fromArray(CFG.edgeIdleRgb);
	blocks.forEach((definition, index) => {
		dummy.position.set(definition.x, (definition.baseY ?? 0) + definition.height / 2, definition.z);
		dummy.scale.set(definition.width * 1.01, definition.height * 1.01, definition.depth * 1.01);
		dummy.rotation.y = definition.rotation ?? 0;
		dummy.updateMatrix();
		edges.setMatrixAt(index, dummy.matrix);
		edges.setColorAt(index, _idleColor);
	});
	edges.instanceMatrix.needsUpdate = true;
	if (edges.instanceColor) edges.instanceColor.needsUpdate = true;
	edges.frustumCulled = false;
	constructionBlocks.add(edges);
	disposables.push(edgeGeometry, edgeMaterial);

	const stageBlockSet = new Set(
		constructionBlocks.userData.stageBlockIndices ?? CFG.stageBlockIndices ?? [],
	);
	const stageStripSet = new Set(constructionBlocks.userData.stageStripIndices ?? []);

	constructionBlocks.userData.setArchitectureBrightness?.(CFG.brightnessIdle);

	let hoveredIndex = -1;
	let hoverKey = "";
	let pointerBlocked = true;
	let lastPointerX = Number.NaN;
	let lastPointerY = Number.NaN;
	let lastCanHit = false;

	const resolveHover = (blockIndex) => {
		if (blockIndex < 0) {
			return { key: "", blockSet: null, stripSet: null };
		}
		if (stageBlockSet.has(blockIndex)) {
			return { key: "stage", blockSet: stageBlockSet, stripSet: stageStripSet };
		}
		return {
			key: `solo:${blockIndex}`,
			blockSet: new Set([blockIndex]),
			stripSet: null,
		};
	};

	const applyHover = (blockIndex) => {
		hoveredIndex = blockIndex;
		const resolved = resolveHover(blockIndex);
		hoverKey = resolved.key;
		const hot = Boolean(resolved.blockSet);

		constructionBlocks.userData.setArchitectureBrightness?.(
			hot ? CFG.brightnessHot : CFG.brightnessIdle,
		);

		_idleColor.fromArray(CFG.edgeIdleRgb);
		_hotColor.fromArray(CFG.edgeHotRgb);
		for (let i = 0; i < blocks.length; i += 1) {
			const edgeHot = resolved.blockSet?.has(i) ?? false;
			edges.setColorAt(i, edgeHot ? _hotColor : _idleColor);
		}
		if (edges.instanceColor) edges.instanceColor.needsUpdate = true;

		for (let i = 0; i < stripMeshes.length; i += 1) {
			const { strip, core } = stripMeshes[i];
			let stripHot = false;
			if (resolved.stripSet) {
				stripHot = resolved.stripSet.has(i);
			} else if (resolved.blockSet) {
				stripHot = strip.blockIndex === blockIndex;
			}
			const rgb = stripHot ? CFG.stripHotRgb : CFG.stripIdleRgb;
			core.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
			core.scale.y = baseStripHeight * (stripHot ? CFG.stripHotHeightMul : 1);
		}

		if (store?.cursor) {
			store.cursor.caseHovered = hot;
		}
	};

	const pickBlock = (camera, pointerX, pointerY) => {
		_ndc.set(pointerX, pointerY);
		_origin.setFromMatrixPosition(camera.matrixWorld);
		_dir.set(_ndc.x, _ndc.y, 0.5).unproject(camera).sub(_origin).normalize();

		constructionBlocks.updateWorldMatrix(true, false);
		_invMatrix.copy(constructionBlocks.matrixWorld).invert();
		_localOrigin.copy(_origin).applyMatrix4(_invMatrix);
		_localDir.copy(_dir).transformDirection(_invMatrix);

		let bestT = Infinity;
		let best = -1;
		const ox = _localOrigin.x;
		const oy = _localOrigin.y;
		const oz = _localOrigin.z;
		const dx = _localDir.x;
		const dy = _localDir.y;
		const dz = _localDir.z;

		for (let i = 0; i < obbs.length; i += 1) {
			const box = obbs[i];
			const t = rayObbDistance(ox, oy, oz, dx, dy, dz, box.cx, box.cy, box.cz, box.hx, box.hy, box.hz, box.cos, box.sin);
			if (t >= 0 && t < bestT) {
				bestT = t;
				best = i;
			}
		}
		return best;
	};

	return {
		setPointerState(state) {
			pointerBlocked = Boolean(state?.pointerBlocked);
		},
		/**
		 * @param {number} _delta
		 * @param {{
		 *   camera: THREE.Camera | null,
		 *   pointer: { x?: number, y?: number },
		 *   interactionEnabled: boolean,
		 *   activePage: boolean,
		 *   pointerBlocked?: boolean,
		 * }} frame
		 */
		update(_delta, frame) {
			const canHit =
				frame.activePage &&
				frame.interactionEnabled !== false &&
				!pointerBlocked &&
				!frame.pointerBlocked &&
				Boolean(frame.camera);

			const px = frame.pointer?.x ?? 0;
			const py = frame.pointer?.y ?? 0;
			const pointerMoved =
				!Number.isFinite(lastPointerX) ||
				Math.abs(px - lastPointerX) >= CFG.pointerEpsilon ||
				Math.abs(py - lastPointerY) >= CFG.pointerEpsilon;
			const gateChanged = canHit !== lastCanHit;

			if (!canHit) {
				lastCanHit = false;
				if (hoveredIndex >= 0) applyHover(-1);
				return;
			}

			if (!pointerMoved && !gateChanged) {
				return;
			}

			lastPointerX = px;
			lastPointerY = py;
			lastCanHit = true;

			const next = pickBlock(frame.camera, px, py);
			const nextKey = resolveHover(next).key;
			if (nextKey !== hoverKey) {
				applyHover(next);
			}
		},
		clearHover() {
			lastPointerX = Number.NaN;
			lastPointerY = Number.NaN;
			lastCanHit = false;
			if (hoveredIndex >= 0) applyHover(-1);
		},
	};
}
