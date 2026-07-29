import * as THREE from "three";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import {
	createBelkaEmeraldAssembly,
	createBelkaEmeraldGeometry,
	flattenTriangleNormals,
} from "./belkaEmeraldMaterial.js";
import { createBelkaSeamGodrays, isBelkaSeamRayName } from "./createBelkaSeamGodrays.js";
import { createBelkaShellParticles } from "./createBelkaShellParticles.js";
import {
	applyBelkaShellFx,
	bindBelkaShellMosaic,
	createBelkaShellMaterial,
	extractBelkaShellMaps,
	normalizeBelkaShellStyleId,
	setBelkaShellStyle,
} from "./belkaShellMaterial.js";
import { BELKA_DIAMOND_GLB, belkaGodrayTune, belkaSceneTune } from "./belkaSceneConfig.js";

function yieldToNextPaint() {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Crack cells:
 * - NutParts / NutParts001 / NutPart*
 * - NutBodyMain_cell* (current Blender export)
 * - Nut_cell* (legacy)
 */
function isBelkaNutCellName(name) {
	const n = String(name ?? "");
	return (
		/^NutParts?/i.test(n)
		|| /^NutBodyMain_cell/i.test(n)
		|| /^Nut_cell/i.test(n)
	);
}

function isBelkaInsideMaterial(mat) {
	return /inside/i.test(String(mat?.name ?? ""));
}

/**
 * Multi-material cells export as a Group (one Mesh per glTF primitive).
 * Single-material cells are plain Meshes. Collect the named root either way —
 * child meshes alone are unnamed and never match isBelkaNutCellName.
 * @param {THREE.Object3D} scene
 * @returns {THREE.Object3D[]}
 */
function collectBelkaCellRoots(scene) {
	/** @type {THREE.Object3D[]} */
	const roots = [];
	scene.traverse((obj) => {
		if (!isBelkaNutCellName(obj.name)) return;
		if (!obj.isMesh && !obj.isGroup) return;
		/** Child under an already-named cell group — skip (handled via parent). */
		if (obj.parent && isBelkaNutCellName(obj.parent.name)) return;
		roots.push(obj);
	});
	roots.sort((a, b) => String(a.name).localeCompare(String(b.name)));
	return roots;
}

/** @param {THREE.Object3D} root @param {(mesh: THREE.Mesh) => void} fn */
function forEachCellMesh(root, fn) {
	if (root?.isMesh) {
		fn(/** @type {THREE.Mesh} */ (root));
		return;
	}
	root?.traverse((obj) => {
		if (obj.isMesh) fn(/** @type {THREE.Mesh} */ (obj));
	});
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function createDecorMaterial(hex = "#d8fff4") {
	return new THREE.MeshStandardMaterial({
		color: new THREE.Color(hex),
		roughness: 0.35,
		metalness: 0.15,
		emissive: new THREE.Color(hex),
		emissiveIntensity: 0.22,
		toneMapped: false,
	});
}

/**
 * Load authored nut GLB once and build crack-rig + emerald + orbit decor meshes.
 */
export async function createBelkaNutAssembly() {
	const root = new THREE.Group();
	root.name = "BelkaNutAssembly";

	const loader = createGLTFLoader();
	const LOAD_MS = 10000;
	const gltf = await Promise.race([
		loader.loadAsync(BELKA_DIAMOND_GLB),
		new Promise((_, reject) => {
			setTimeout(() => reject(new Error("NutDiamond GLB load timeout")), LOAD_MS);
		}),
	]);

	const scene = gltf.scene;
	scene.updateMatrixWorld(true);

	/** @type {Map<string, THREE.Mesh>} */
	const byName = new Map();
	scene.traverse((obj) => {
		if (obj.isMesh) byName.set(obj.name, /** @type {THREE.Mesh} */ (obj));
	});

	const nutRoot = new THREE.Group();
	nutRoot.name = "BelkaNutRoot";
	root.add(nutRoot);

	/**
	 * Authored maps keep acorn ridges; shellStyle picks the look (DEV hotkey 4).
	 */
	const shellStyle = normalizeBelkaShellStyleId(belkaSceneTune.shellStyle);
	const hatSource = byName.get("NutHead") ?? byName.get("NutHat");
	const hatMaps = extractBelkaShellMaps(hatSource?.material);
	const hatMat = createBelkaShellMaterial({
		...hatMaps,
		mosaicScale: 22,
		/** Softer normals — hat scales must not explode the look. */
		normalScale: 0.85,
		roughness: Math.min(0.72, Math.max(0.45, (hatMaps.roughness ?? 0.65) * 1.05)),
		side: THREE.DoubleSide,
		style: shellStyle,
		part: "hat",
	});
	const disposables = [hatMat];
	/** @type {THREE.ShaderMaterial[]} */
	const shellMats = [hatMat];

	if (import.meta.env.DEV) {
		const meshNames = [...byName.keys()].sort();
		console.info(`[Belka] GLB meshes: ${meshNames.join(", ") || "(none)"}`);
		console.info(
			`[Belka] NutHead maps: color=${Boolean(hatMaps.map)} normal=${Boolean(hatMaps.normalMap)} roughness=${Boolean(hatMaps.roughnessMap)}`,
		);
	}

	/**
	 * Reparent Mesh or multi-primitive Group into nutRoot (world pose preserved).
	 * @param {THREE.Object3D} obj
	 * @param {THREE.Material | null} [mat] only applied when obj is a Mesh
	 */
	const adoptObject = (obj, mat = null) => {
		if (obj.isMesh && mat) {
			/** @type {THREE.Mesh} */ (obj).material = mat;
		}
		obj.traverse((child) => {
			if (!child.isMesh) return;
			child.castShadow = false;
			child.receiveShadow = false;
		});
		const wp = new THREE.Vector3();
		const wq = new THREE.Quaternion();
		const ws = new THREE.Vector3();
		obj.updateWorldMatrix(true, true);
		obj.matrixWorld.decompose(wp, wq, ws);
		obj.removeFromParent();
		nutRoot.add(obj);
		obj.position.copy(wp);
		obj.quaternion.copy(wq);
		obj.scale.copy(ws);
		return obj;
	};
	const adoptMesh = (mesh, mat = null) => adoptObject(mesh, mat);

	/**
	 * Authored godray planes: Godray / Godray001 / …
	 * Kept in place under nutRoot; godray material is applied later.
	 * @type {THREE.Mesh[]}
	 */
	const seamPlaneMeshes = [];
	for (const [name, mesh] of byName) {
		if (!isBelkaSeamRayName(name)) continue;
		adoptMesh(mesh);
		mesh.visible = false;
		mesh.renderOrder = 12;
		seamPlaneMeshes.push(mesh);
	}
	seamPlaneMeshes.sort((a, b) => a.name.localeCompare(b.name));

	/**
	 * Cell roots (Mesh or Group). Dual-slot Blender cells → Group with
	 * AcornBodyMaterial + AcornInsideMaterial child meshes.
	 */
	const cellRoots = collectBelkaCellRoots(scene);

	/**
	 * Optional closed body → particle source only (never drawn).
	 * Without it, sample 1–2 cells (full multi-cell sampling froze the preloader).
	 */
	const bodyMainMesh = byName.get("NutBodyMain") ?? null;
	await yieldToNextPaint();
	/** @type {THREE.Mesh[]} */
	const particleSampleMeshes = [];
	if (bodyMainMesh) {
		particleSampleMeshes.push(bodyMainMesh);
	} else {
		for (const root of cellRoots.slice(0, 2)) {
			forEachCellMesh(root, (m) => {
				if (!isBelkaInsideMaterial(m.material) && particleSampleMeshes.length < 2) {
					particleSampleMeshes.push(m);
				}
			});
		}
	}
	const shellParticles = await createBelkaShellParticles(particleSampleMeshes, {
		count: 1100,
		color: "#c07830",
		pointSize: 0.06,
	});
	nutRoot.add(shellParticles.root);
	disposables.push({ dispose: () => shellParticles.dispose() });
	if (bodyMainMesh) {
		bodyMainMesh.visible = false;
		bodyMainMesh.removeFromParent();
	}

	if (import.meta.env.DEV) {
		let insideParts = 0;
		for (const root of cellRoots) {
			forEachCellMesh(root, (m) => {
				if (isBelkaInsideMaterial(m.material)) insideParts += 1;
			});
		}
		console.info(
			`[Belka] cells ×${cellRoots.length}: ${cellRoots.map((m) => m.name).join(", ") || "(none)"}`
			+ ` | inside parts ×${insideParts}`
			+ ` | Godray ×${seamPlaneMeshes.length}`
			+ ((byName.has("NutHead") || byName.has("NutHat")) ? "" : " | NutHead missing")
			+ ` | particles ×${particleSampleMeshes.length} source(s)`,
		);
	}

	const shellBox = new THREE.Box3();
	for (const root of cellRoots) {
		root.updateWorldMatrix(true, true);
		shellBox.expandByObject(root);
	}
	if (!Number.isFinite(shellBox.min.y)) {
		shellBox.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
	}

	const pivot = new THREE.Vector3((shellBox.min.x + shellBox.max.x) * 0.5, shellBox.min.y + 0.04, (shellBox.min.z + shellBox.max.z) * 0.5);

	/**
	 * @type {{
	 *   mesh: THREE.Object3D,
	 *   mat: THREE.ShaderMaterial | null,
	 *   shellMats: THREE.ShaderMaterial[],
	 *   insideMats: THREE.Material[],
	 *   restPos: THREE.Vector3,
	 *   restQuat: THREE.Quaternion,
	 *   outward: THREE.Vector3,
	 *   axis: THREE.Vector3,
	 *   maxAngle: number,
	 * }[]}
	 */
	const cells = [];

	/** First outer-body mesh maps (skip AcornInsideMaterial — no textures). */
	/** @type {THREE.Material | null} */
	let bodyMapSource = null;
	for (const root of cellRoots) {
		forEachCellMesh(root, (m) => {
			if (!bodyMapSource && !isBelkaInsideMaterial(m.material)) {
				bodyMapSource = Array.isArray(m.material) ? m.material[0] : m.material;
			}
		});
		if (bodyMapSource) break;
	}
	const bodyMaps = extractBelkaShellMaps(bodyMapSource);
	if (import.meta.env.DEV) {
		console.info(
			`[Belka] Body maps: color=${Boolean(bodyMaps.map)} normal=${Boolean(bodyMaps.normalMap)} roughness=${Boolean(bodyMaps.roughnessMap)}`,
		);
	}

	for (let ci = 0; ci < cellRoots.length; ci += 1) {
		const root = cellRoots[ci];
		/** @type {THREE.ShaderMaterial[]} */
		const cellShellMats = [];
		/** @type {THREE.Material[]} */
		const cellInsideMats = [];

		forEachCellMesh(root, (part) => {
			const srcMat = Array.isArray(part.material) ? part.material[0] : part.material;
			if (isBelkaInsideMaterial(srcMat)) {
				/** Keep authored inside look — light cyan lift vs outer styles. */
				const insideMat = srcMat.clone();
				insideMat.name = srcMat.name || "AcornInsideMaterial";
				insideMat.side = THREE.FrontSide;
				insideMat.toneMapped = true;
				if ("emissive" in insideMat) {
					insideMat.emissive = new THREE.Color("#01dcf9");
					insideMat.emissiveIntensity = 0.08;
				}
				part.material = insideMat;
				part.renderOrder = 0;
				part.frustumCulled = false;
				part.visible = true;
				cellInsideMats.push(insideMat);
				disposables.push(insideMat);
				return;
			}
			const cellMat = createBelkaShellMaterial({
				...bodyMaps,
				mosaicScale: 14,
				normalScale: 1.2,
				side: THREE.FrontSide,
				style: shellStyle,
				part: "body",
			});
			disposables.push(cellMat);
			shellMats.push(cellMat);
			cellShellMats.push(cellMat);
			part.material = cellMat;
			bindBelkaShellMosaic(cellMat, part.geometry);
			part.renderOrder = 1;
			part.frustumCulled = false;
			part.visible = true;
		});

		adoptObject(root);
		root.visible = true;

		const cellBox = new THREE.Box3().setFromObject(root);
		const center = cellBox.getCenter(new THREE.Vector3());
		const outward = new THREE.Vector3(center.x - pivot.x, 0, center.z - pivot.z);
		if (outward.lengthSq() < 1e-8) outward.set(center.x, 0, center.z);
		if (outward.lengthSq() < 1e-8) outward.set(1, 0, 0);
		outward.normalize();

		const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward);
		if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
		axis.normalize();

		cells.push({
			mesh: root,
			mat: cellShellMats[0] ?? null,
			shellMats: cellShellMats,
			insideMats: cellInsideMats,
			restPos: root.position.clone(),
			restQuat: root.quaternion.clone(),
			outward,
			axis,
			/** Peel enough to match reference, still hinged at the bottom. */
			maxAngle: 0.48 + Math.min(0.14, cellBox.getSize(_v).length() * 0.035),
		});
	}
	await yieldToNextPaint();

	const hatMesh = byName.get("NutHead") ?? byName.get("NutHat");
	let hat = null;
	if (hatMesh) {
		adoptMesh(hatMesh, hatMat);
		bindBelkaShellMosaic(hatMat, hatMesh.geometry);
		hatMesh.renderOrder = 1;
		hat = {
			mesh: hatMesh,
			restPos: hatMesh.position.clone(),
			restQuat: hatMesh.quaternion.clone(),
		};
	}

	let diamondGeo;
	let gemWorldPos = new THREE.Vector3(0, 0.05, 0);
	const ico = byName.get("Icosphere");
	if (ico?.geometry) {
		ico.updateWorldMatrix(true, false);
		ico.getWorldPosition(gemWorldPos);
		let geo = ico.geometry.clone();
		/**
		 * Bake mesh world transform into geo, then express in cradle-local space.
		 * Skipping this left the gem soft / wrong-scale vs the old diamond path.
		 */
		geo.applyMatrix4(ico.matrixWorld);
		geo.translate(-gemWorldPos.x, -gemWorldPos.y, -gemWorldPos.z);
		const flat = geo.index ? geo.toNonIndexed() : geo;
		if (flat !== geo) geo.dispose();
		diamondGeo = flattenTriangleNormals(flat);
		ico.removeFromParent();
	} else {
		diamondGeo = createBelkaEmeraldGeometry(0.58);
	}

	const cradle = new THREE.Group();
	cradle.name = "BelkaEmeraldCradle";
	cradle.position.copy(gemWorldPos);
	nutRoot.add(cradle);

	const gem = createBelkaEmeraldAssembly(diamondGeo);
	cradle.add(gem.root);
	disposables.push({ dispose: () => gem.dispose() });

	const decorMatIt = createDecorMaterial("#c8f7ff");
	const decorMatFlower = createDecorMaterial("#01dcf9");
	disposables.push(decorMatIt, decorMatFlower);

	const prepDecor = (mesh, mat, targetSize = 0.16) => {
		if (!mesh) return null;
		mesh.material = mat;
		mesh.updateWorldMatrix(true, false);
		const box = new THREE.Box3().setFromObject(mesh);
		const size = box.getSize(new THREE.Vector3());
		const maxDim = Math.max(size.x, size.y, size.z) || 1;
		const s = targetSize / maxDim;
		mesh.geometry = mesh.geometry.clone();
		disposables.push(mesh.geometry);
		mesh.geometry.computeBoundingBox();
		const c = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
		mesh.geometry.translate(-c.x, -c.y, -c.z);
		mesh.geometry.scale(s, s, s);
		mesh.position.set(0, 0, 0);
		mesh.rotation.set(0, 0, 0);
		mesh.scale.set(1, 1, 1);
		mesh.removeFromParent();
		return mesh;
	};

	const itMesh = prepDecor(byName.get("ITMesh"), decorMatIt, 0.17);
	const flowerMesh = prepDecor(byName.get("Flower"), decorMatFlower, 0.15);

	/**
	 * Normalize from nut + gem only. SeamRay planes stick out far and would
	 * inflate the bbox → whole acorn scales down.
	 */
	nutRoot.updateMatrixWorld(true);
	const allBox = new THREE.Box3();
	const sizeSources = [];
	for (const c of cells) sizeSources.push(c.mesh);
	if (hat) sizeSources.push(hat.mesh);
	sizeSources.push(cradle);
	for (const obj of sizeSources) {
		if (obj) allBox.expandByObject(obj);
	}
	if (!Number.isFinite(allBox.min.x)) {
		allBox.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
	}
	const allSize = allBox.getSize(new THREE.Vector3());
	const allCenter = allBox.getCenter(new THREE.Vector3());
	nutRoot.position.sub(allCenter);
	const nutBasePos = nutRoot.position.clone();
	const maxDim = Math.max(allSize.x, allSize.y, allSize.z) || 1;
	const baseScale = 1.85 / maxDim;
	root.scale.setScalar(baseScale);

	pivot.sub(allCenter);
	/** Cradle local pos after centering (unchanged children + parent offset). */
	const cradleLocal = cradle.position.clone();

	/** Seam mid-angles — godrays out through cracks (after normalize so bbox stays clean). */
	const seamAngles = cells.map((c) => Math.atan2(c.outward.z, c.outward.x)).sort((a, b) => a - b);
	const seamDirs = [];
	if (seamAngles.length >= 2) {
		for (let i = 0; i < seamAngles.length; i += 1) {
			const a0 = seamAngles[i];
			let a1 = seamAngles[(i + 1) % seamAngles.length];
			if (i === seamAngles.length - 1) a1 += Math.PI * 2;
			const mid = (a0 + a1) * 0.5;
			seamDirs.push(new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid)));
		}
	} else {
		for (const c of cells) seamDirs.push(c.outward.clone());
	}

	const godrays = createBelkaSeamGodrays({
		planes: seamPlaneMeshes,
		directions: seamDirs,
		length: 1.45,
		height: 0.75,
		tipWidth: 0.1,
		color: belkaGodrayTune.color ?? "#01dcf9",
	});
	/**
	 * Authored Godray planes already sit in seams under nutRoot.
	 * Soft core (+ procedural fallback blades) live on godrays.root.
	 */
	godrays.root.position.copy(cradleLocal);
	nutRoot.add(godrays.root);
	godrays.setIntensity(0);
	godrays.applyTune(belkaGodrayTune);
	disposables.push({ dispose: () => godrays.dispose() });
	if (import.meta.env.DEV) {
		console.info(
			`[Belka] seam godrays: ${
				godrays.authored
					? `authored ×${seamPlaneMeshes.length}`
					: "procedural fallback"
			}`,
		);
	}

	const smoothstep = (edge0, edge1, x) => {
		const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
		return t * t * (3 - 2 * t);
	};

	let crackAmount = 0;
	const _godrayOrigin = new THREE.Vector3();
	/** Particle cover bursts → cracked shell visible (godrays after). */
	const PARTICLE_BURST_START = 0.42;
	const PARTICLE_BURST_END = 0.78;
	/** Last godray gain — drives tiny seam gap + hat bob. */
	let rayGain = 0;

	/**
	 * @param {number} crack01 peel amount
	 * @param {number} bodyFade01 0 = particle cover solid, 1 = cover gone / cells shown
	 * @param {number} shellRemain01 1 = shell solid, 0 = mosaic-dissolved away
	 * @param {number} time
	 * @param {number} seamGap01 tiny crack open synced with godrays (0–1)
	 */
	const applyCrack = (crack01, bodyFade01 = 0, shellRemain01 = 1, time = 0, seamGap01 = 0) => {
		crackAmount = THREE.MathUtils.clamp(crack01, 0, 1);
		const ease = crackAmount * crackAmount * (3 - 2 * crackAmount);
		const fade = THREE.MathUtils.clamp(bodyFade01, 0, 1);
		const shellRemain = THREE.MathUtils.clamp(shellRemain01, 0, 1);
		const gap = THREE.MathUtils.clamp(seamGap01, 0, 1);
		/** Mosaic dissolve amount (inverse of remain). */
		const dissolve = 1 - shellRemain;
		/** Cells always on until mosaic dissolve; particles burst, then godrays. */
		const particleBurst = smoothstep(PARTICLE_BURST_START, PARTICLE_BURST_END, fade);
		shellParticles.setProgress({
			burst: Math.max(particleBurst, dissolve),
			opacity: 1 - dissolve * 0.95,
		});
		shellParticles.update(time);

		applyBelkaShellFx(hatMat, {
			opacity: 1,
			dissolve,
			time,
			distort: 1.1 + dissolve * 0.7,
		});

		/**
		 * Hairline seam only — just enough that light can read through,
		 * before the big peel on 2→3. Amounts from belkaGodrayTune.
		 */
		const gapAngle = gap * (belkaGodrayTune.seamGapAngle ?? 0.002);
		const gapPush = gap * (belkaGodrayTune.seamGapPush ?? 0.005);
		const gapHat = gap * (belkaGodrayTune.seamGapHat ?? 0.002);

		for (const cell of cells) {
			const shellList = cell.shellMats?.length ? cell.shellMats : (cell.mat ? [cell.mat] : []);
			for (const mat of shellList) {
				applyBelkaShellFx(mat, {
					opacity: 1,
					dissolve,
					time,
					distort: 1 + dissolve * 0.65,
				});
			}
			for (const insideMat of cell.insideMats ?? []) {
				insideMat.transparent = dissolve > 0.02;
				insideMat.depthWrite = dissolve < 0.85;
				insideMat.opacity = Math.max(0, 1 - dissolve);
				insideMat.needsUpdate = true;
			}
			cell.mesh.visible = dissolve < 0.995;
			const angle = ease * cell.maxAngle + gapAngle;
			_q.setFromAxisAngle(cell.axis, angle);
			_v.copy(cell.restPos).sub(pivot).applyQuaternion(_q).add(pivot);
			_v.addScaledVector(cell.outward, ease * 0.07 + gapPush);
			_v.y -= ease * 0.09;
			cell.mesh.position.copy(_v);
			cell.mesh.quaternion.copy(cell.restQuat).premultiply(_q);
		}

		if (hat) {
			/**
			 * Cap clears early — same peel ease would leave shell swinging
			 * through the hat. Remap so hat is ~fully up by crack≈0.4.
			 */
			const hatT = THREE.MathUtils.clamp(crackAmount / 0.4, 0, 1);
			const hatEase = hatT * hatT * (3 - 2 * hatT);
			hat.mesh.visible = dissolve < 0.995;
			hat.mesh.position.copy(hat.restPos);
			hat.mesh.position.y += hatEase * 0.62 + gapHat;
			hat.mesh.quaternion.copy(hat.restQuat);
			hat.mesh.renderOrder = 1;
		}
	};

	applyCrack(0, 0, 1, 0, 0);

	let emeraldBaseScale = 1;
	/** Final gem size once shell is gone (× base). */
	const GEM_GROW_MAX = 1.65;
	let lastShellRemain = 1;

	const applyGemScale = (shellRemain = lastShellRemain) => {
		lastShellRemain = THREE.MathUtils.clamp(shellRemain, 0, 1);
		/** Grows with shell dissolve from the start: 1× → GEM_GROW_MAX. */
		const grow = THREE.MathUtils.lerp(GEM_GROW_MAX, 1, lastShellRemain);
		gem.setScale(emeraldBaseScale * grow);
	};
	applyGemScale(1);

	return {
		root,
		cradle,
		nutRoot,
		emerald: gem.shell,
		emeraldMat: gem.shellMat,
		gem,
		orbitDecor: [
			itMesh ? { mesh: itMesh, ringIndex: 0, angleOffset: 0.4, lift: 0.1, spin: 0.9 } : null,
			flowerMesh ? { mesh: flowerMesh, ringIndex: 1, angleOffset: 1.1, lift: 0.1, spin: -0.7 } : null,
		].filter(Boolean),
		setEmeraldScale(s) {
			emeraldBaseScale = Math.max(0.3, s);
			applyGemScale(lastShellRemain);
		},
		setNutScale(s) {
			root.scale.setScalar(baseScale * Math.max(0.4, s));
		},
		/** Live shell look switch (DEV / belkaSceneTune.shellStyle). */
		setShellStyle(styleId) {
			const id = normalizeBelkaShellStyleId(styleId);
			for (const m of shellMats) {
				setBelkaShellStyle(m, id);
			}
			return id;
		},
		getShellStyle() {
			return normalizeBelkaShellStyleId(shellMats[0]?.userData?.belkaShellStyle ?? belkaSceneTune.shellStyle);
		},
		/**
		 * Two-step story:
		 * - seam 0→1 (stage 1→2): particle cover bursts → seams + shake, cells closed
		 * - crack 0→1 (stage 2→3): cells peel / fall, hat lifts, shell + godrays dissolve
		 * @param {{ seam?: number, crack?: number, time?: number }} mix
		 */
		setStoryMix(mix = {}) {
			const seam = THREE.MathUtils.clamp(mix.seam ?? 0, 0, 1);
			const crack = THREE.MathUtils.clamp(mix.crack ?? 0, 0, 1);
			const time = mix.time ?? 0;

			/** Seams appear across 1→2; peel + vanish on 2→3. */
			const bodyFade = smoothstep(0.08, 0.92, seam);
			const peel = smoothstep(0.05, 1, crack);
			/** Mosaic dissolve through 2→3 — fully gone by stage 3. */
			const shellRemain = 1 - smoothstep(0.12, 0.95, peel);

			/**
			 * Order on 1→2: seam gap (+ particle burst) first, godrays after.
			 * Light must never precede visible cracks.
			 */
			const gap0 = belkaGodrayTune.gapStart ?? 0.2;
			const gap1 = belkaGodrayTune.gapEnd ?? 0.5;
			const in0 = belkaGodrayTune.inStart ?? 0.52;
			const in1 = belkaGodrayTune.inEnd ?? 0.92;
			const out0 = belkaGodrayTune.outStart ?? 0.08;
			const out1 = belkaGodrayTune.outEnd ?? 0.92;
			const rayOut = 1 - smoothstep(out0, out1, peel);
			const gapGain = smoothstep(gap0, gap1, seam) * rayOut;
			const rayIn = smoothstep(in0, in1, seam);
			/** Extra gate: rays only once particles have begun clearing the seams. */
			const coverClear = smoothstep(PARTICLE_BURST_START, PARTICLE_BURST_END, bodyFade);
			const storyGain = rayIn * rayOut * coverClear;
			const force = belkaGodrayTune.forceIntensity ?? 0;
			rayGain = force > 0.001 ? force : storyGain;
			applyCrack(
				peel,
				Math.max(bodyFade, peel > 0.001 ? 1 : bodyFade),
				shellRemain,
				time,
				gapGain,
			);
			applyGemScale(shellRemain);

			cradle.getWorldPosition(_godrayOrigin);
			godrays.setOrigin(_godrayOrigin);
			godrays.applyTune(belkaGodrayTune);
			godrays.setIntensity(rayGain * (belkaGodrayTune.intensity ?? 1.35));
			godrays.update(time);

			/** Shake peaks on 1→2, dies out as the shell falls open. */
			const shakeEnv = Math.sin(seam * Math.PI);
			const shakeAmount = shakeEnv * (1 - peel * 0.9);
			const amp = shakeAmount * 0.032;
			nutRoot.rotation.z = Math.sin(time * 26) * amp;
			nutRoot.rotation.x = Math.cos(time * 21) * amp * 0.75;
			nutRoot.position.x = nutBasePos.x + Math.sin(time * 31) * amp * 0.55;
			nutRoot.position.y = nutBasePos.y;
			nutRoot.position.z = nutBasePos.z + Math.cos(time * 27) * amp * 0.4;
		},

		update(time) {
			gem.update(time);
			godrays.update(time);
			shellParticles.update(time);
			for (const m of shellMats) {
				if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
			}
			const spin = 0.12 + crackAmount * 0.22;
			gem.root.rotation.y = time * spin;
			gem.root.rotation.x = -0.2 + Math.sin(time * 0.4) * 0.04;
			gem.root.rotation.z = 0.06 + Math.cos(time * 0.28) * 0.02;
			if (crackAmount > 0.15) {
				cradle.position.y = cradleLocal.y + Math.sin(time * 0.9) * 0.01 * crackAmount;
			}
			/** Soft hover bob once the cap is lifted (skip when shell already gone). */
			if (hat?.mesh.visible && (crackAmount > 0.05 || rayGain > 0.05)) {
				const hatT = THREE.MathUtils.clamp(crackAmount / 0.4, 0, 1);
				const peelLift = hatT * hatT * (3 - 2 * hatT) * 0.62;
				hat.mesh.position.y =
					hat.restPos.y
					+ peelLift
					+ rayGain * (belkaGodrayTune.seamGapHat ?? 0.002)
					+ Math.sin(time * 1.6) * 0.02 * Math.max(crackAmount, rayGain);
			}
		},
		/** Live DEV panel — seam godray look. */
		applyGodrayTune(tune = belkaGodrayTune) {
			godrays.applyTune(tune);
		},
		dispose() {
			for (const d of disposables) d.dispose?.();
		},
	};
}
