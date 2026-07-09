import * as THREE from "three";
import { easing } from "maath";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import { computeRouteSceneVisibility } from "@/three/scenes/utils/routeSceneVisibility.js";
import { freezeHiddenRoot, restoreRootForShow } from "@/three/scenes/utils/sceneRoot.js";
import { isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { createCase3FakeLitMaterial } from "./case3FakeLitMaterial.js";

const CASE3_PATH = "/portfolio/03";
const CYAN = new THREE.Color(0x00bfff);
const GRID_SIZE = 64;
const GRID_DIVISIONS = 104;
const ROOT_DESKTOP = new THREE.Vector3(4.15, -3.18, 0);
const ROOT_MOBILE = new THREE.Vector3(0, -2.15, 0);
const CRANE_ROTATION_Y = -Math.PI / 2 + 0.35;
const CASE3_CAMERA = {
	x: 0.3,
	y: -2,
	z: 8.25,
	lookX: 1.6,
	lookY: -0.2,
	lookZ: 1.6,
	fov: 49,
};

function isCase3Path(pathname) {
	return (String(pathname ?? "/").replace(/\/+$/, "") || "/") === CASE3_PATH;
}

function createRoundGlowTexture(disposables) {
	const canvas = document.createElement("canvas");
	canvas.width = 64;
	canvas.height = 64;
	const context = canvas.getContext("2d");
	const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(0.16, "rgba(170,240,255,1)");
	gradient.addColorStop(0.42, "rgba(0,190,255,0.72)");
	gradient.addColorStop(1, "rgba(0,120,255,0)");
	context.fillStyle = gradient;
	context.fillRect(0, 0, 64, 64);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	disposables.push(texture);
	return texture;
}

function createGrid(disposables) {
	const group = new THREE.Group();
	const size = GRID_SIZE;
	const divisions = GRID_DIVISIONS;
	const half = size / 2;
	const positions = [];

	for (let index = 0; index <= divisions; index += 1) {
		const coordinate = -half + (index / divisions) * size;
		positions.push(-half, 0, coordinate, half, 0, coordinate);
		positions.push(coordinate, 0, -half, coordinate, 0, half);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	const material = new THREE.LineBasicMaterial({
		color: 0x008fd4,
		transparent: true,
		opacity: 0.58,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		fog: true,
		toneMapped: false,
	});
	const lines = new THREE.LineSegments(geometry, material);
	group.add(lines);
	group.userData.material = material;
	disposables.push(geometry, material);
	return group;
}

function createGroundRings(disposables) {
	const group = new THREE.Group();
	const groundGlowTexture = createRoundGlowTexture(disposables);
	const glowGeometry = new THREE.PlaneGeometry(8.4, 8.4);
	const glowMaterial = new THREE.MeshBasicMaterial({
		color: 0x006fbd,
		map: groundGlowTexture,
		alphaMap: groundGlowTexture,
		transparent: true,
		opacity: 0.12,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		fog: true,
		toneMapped: true,
	});
	const groundGlow = new THREE.Mesh(glowGeometry, glowMaterial);
	groundGlow.rotation.x = -Math.PI / 2;
	groundGlow.position.y = -0.018;
	group.add(groundGlow);
	disposables.push(glowGeometry, glowMaterial);
	const ringDefinitions = [
		{ inner: 2.18, outer: 2.21, opacity: 0.72 },
		{ inner: 2.55, outer: 2.58, opacity: 0.35 },
		{ inner: 3.05, outer: 3.07, opacity: 0.18 },
	];

	for (const definition of ringDefinitions) {
		const geometry = new THREE.RingGeometry(definition.inner, definition.outer, 128);
		const material = new THREE.MeshBasicMaterial({
			color: CYAN,
			transparent: true,
			opacity: definition.opacity,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
			fog: true,
			toneMapped: false,
		});
		const ring = new THREE.Mesh(geometry, material);
		ring.rotation.x = -Math.PI / 2;
		group.add(ring);
		disposables.push(geometry, material);
	}

	const ticks = [];
	for (let index = 0; index < 72; index += 1) {
		if (index % 3 === 2) continue;
		const angle = (index / 72) * Math.PI * 2;
		const inner = index % 6 === 0 ? 2.66 : 2.75;
		const outer = 2.88;
		ticks.push(Math.cos(angle) * inner, 0.012, Math.sin(angle) * inner, Math.cos(angle) * outer, 0.012, Math.sin(angle) * outer);
	}
	const tickGeometry = new THREE.BufferGeometry();
	tickGeometry.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
	const tickMaterial = new THREE.LineBasicMaterial({
		color: 0x00d8ff,
		transparent: true,
		opacity: 0.65,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		fog: true,
		toneMapped: false,
	});
	group.add(new THREE.LineSegments(tickGeometry, tickMaterial));
	disposables.push(tickGeometry, tickMaterial);
	return group;
}

function createDigitalNodes(disposables) {
	const group = new THREE.Group();
	const nodePositions = [];
	const nodeColors = [];
	const verticalDefinitions = [];
	const spacing = GRID_SIZE / GRID_DIVISIONS;
	const halfDivisions = GRID_DIVISIONS / 2;
	const glowTexture = createRoundGlowTexture(disposables);

	for (let gx = -halfDivisions; gx <= halfDivisions; gx += 1) {
		for (let gz = -halfDivisions; gz <= halfDivisions; gz += 1) {
			const x = gx * spacing;
			const z = gz * spacing;
			nodePositions.push(x, 0.035, z);
			const brightness = 0.35 + ((gx * 17 + gz * 29) ** 2 % 19) / 32;
			nodeColors.push(0, brightness * 0.78, brightness);
			if (Math.hypot(x, z) > 3 && Math.abs(gx * 41 + gz * 67 + gx * gz * 13 + 997) % 137 === 0) {
				verticalDefinitions.push({ x, z, height: 0.45 + Math.random() * 1.45, phase: Math.random() });
			}
		}
	}

	const pointsGeometry = new THREE.BufferGeometry();
	pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
	pointsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(nodeColors, 3));
	const pointsMaterial = new THREE.PointsMaterial({
		color: 0xffffff,
		vertexColors: true,
		map: glowTexture,
		alphaMap: glowTexture,
		alphaTest: 0.015,
		size: 0.145,
		sizeAttenuation: true,
		transparent: true,
		opacity: 0.95,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		fog: true,
		toneMapped: false,
	});
	group.add(new THREE.Points(pointsGeometry, pointsMaterial));
	disposables.push(pointsGeometry, pointsMaterial);

	const linePositions = [];
	for (const definition of verticalDefinitions) {
		linePositions.push(definition.x, 0.03, definition.z, definition.x, definition.height, definition.z);
	}
	const lineGeometry = new THREE.BufferGeometry();
	lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
	const lineMaterial = new THREE.LineBasicMaterial({
		color: 0x00aaff,
		transparent: true,
		opacity: 0.68,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		fog: true,
		toneMapped: false,
	});
	group.add(new THREE.LineSegments(lineGeometry, lineMaterial));
	disposables.push(lineGeometry, lineMaterial);

	const beaconGeometry = new THREE.BufferGeometry();
	beaconGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(verticalDefinitions.length * 3), 3));
	const beaconMaterial = new THREE.PointsMaterial({
		color: 0xb8f4ff,
		map: glowTexture,
		alphaMap: glowTexture,
		alphaTest: 0.015,
		size: 0.22,
		sizeAttenuation: true,
		transparent: true,
		opacity: 1,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		fog: true,
		toneMapped: false,
	});
	const beacons = new THREE.Points(beaconGeometry, beaconMaterial);
	group.add(beacons);
	disposables.push(beaconGeometry, beaconMaterial);

	return { group, pointsMaterial, verticalDefinitions, beacons };
}

function createInstancedArchitecture(definitions, disposables, options = {}) {
	const group = new THREE.Group();
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const solidMaterial = options.material ?? createCase3FakeLitMaterial("blocks");
	const solids = new THREE.InstancedMesh(geometry, solidMaterial, definitions.length);
	const edgeMaterial =
		options.wireframeEdges === false
			? null
			: new THREE.MeshBasicMaterial({
					color: options.edgeColor ?? 0x006b9c,
					wireframe: true,
					transparent: true,
					opacity: options.edgeOpacity ?? 0.14,
					depthWrite: false,
					fog: true,
					toneMapped: false,
				});
	const edges = edgeMaterial ? new THREE.InstancedMesh(geometry, edgeMaterial, definitions.length) : null;
	const dummy = new THREE.Object3D();
	definitions.forEach((definition, index) => {
		dummy.position.set(definition.x, (definition.baseY ?? 0) + definition.height / 2, definition.z);
		dummy.scale.set(definition.width, definition.height, definition.depth);
		dummy.rotation.y = definition.rotation ?? 0;
		dummy.updateMatrix();
		solids.setMatrixAt(index, dummy.matrix);
		if (edges) {
			dummy.scale.multiplyScalar(1.004);
			dummy.updateMatrix();
			edges.setMatrixAt(index, dummy.matrix);
		}
	});
	solids.instanceMatrix.needsUpdate = true;
	solids.frustumCulled = false;
	group.add(solids);
	if (edges) {
		edges.instanceMatrix.needsUpdate = true;
		edges.frustumCulled = false;
		group.add(edges);
	}
	group.userData.definitions = definitions;
	group.userData.solids = solids;
	group.userData.solidMaterial = solidMaterial;
	group.userData.edges = edges;
	group.userData.updateInstances = () => {
		definitions.forEach((definition, index) => {
			dummy.position.set(definition.x, (definition.baseY ?? 0) + definition.height / 2, definition.z);
			dummy.scale.set(definition.width, definition.height, definition.depth);
			dummy.rotation.set(0, definition.rotation ?? 0, 0);
			dummy.updateMatrix();
			solids.setMatrixAt(index, dummy.matrix);
			if (edges) {
				dummy.scale.multiplyScalar(1.004);
				dummy.updateMatrix();
				edges.setMatrixAt(index, dummy.matrix);
			}
		});
		solids.instanceMatrix.needsUpdate = true;
		if (edges) edges.instanceMatrix.needsUpdate = true;
	};
	disposables.push(geometry, solidMaterial);
	if (edgeMaterial) disposables.push(edgeMaterial);
	return group;
}

function createCityEdgeLines(buildings, disposables) {
	const positions = [];
	const edgePairs = [
		[0, 1],
		[1, 3],
		[3, 2],
		[2, 0],
		[4, 5],
		[5, 7],
		[7, 6],
		[6, 4],
		[0, 4],
		[1, 5],
		[2, 6],
		[3, 7],
	];
	for (const building of buildings) {
		const halfW = building.width / 2;
		const halfD = building.depth / 2;
		const corners = [
			[-halfW, 0, -halfD],
			[halfW, 0, -halfD],
			[-halfW, building.height, -halfD],
			[halfW, building.height, -halfD],
			[-halfW, 0, halfD],
			[halfW, 0, halfD],
			[-halfW, building.height, halfD],
			[halfW, building.height, halfD],
		];
		const cosine = Math.cos(building.rotation ?? 0);
		const sine = Math.sin(building.rotation ?? 0);
		const transformed = corners.map(([x, y, z]) => [building.x + x * cosine + z * sine, y, building.z - x * sine + z * cosine]);
		for (const [from, to] of edgePairs) positions.push(...transformed[from], ...transformed[to]);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	const material = new THREE.LineBasicMaterial({
		color: 0x008bc7,
		transparent: true,
		opacity: 0.8,
		depthWrite: false,
		fog: true,
		toneMapped: false,
	});
	const lines = new THREE.LineSegments(geometry, material);
	lines.frustumCulled = false;
	lines.userData.material = material;
	disposables.push(geometry, material);
	return lines;
}

function createFogCity(disposables) {
	const buildings = [];
	for (let row = 0; row < 4; row += 1) {
		const z = -6.2 - row * 2.4;
		for (let column = -7; column <= 7; column += 1) {
			const hash = Math.abs(column * 37 + row * 71 + column * row * 19);
			const height = 1.0 + (hash % 9) * 0.34 + row * 0.16;
			buildings.push({
				x: column * 2.25 + (row % 2) * 0.7,
				z,
				width: 0.72 + (hash % 4) * 0.2,
				height,
				depth: 0.8 + ((hash + 3) % 4) * 0.22,
				rotation: ((hash % 5) - 2) * 0.025,
			});
		}
	}
	return createCityEdgeLines(buildings, disposables);
}

function createNeonConstructionBlocks(disposables) {
	const blockRotation = CRANE_ROTATION_Y;
	const blocks = [
		// Three centered steps; the crane model is lifted onto the upper plinth.
		{ x: 0, z: 0.08, localX: 0.3, localZ: -0.1, width: 1.85, height: 0.1, depth: 2.55, rotation: blockRotation },
		{ x: 0, z: 0.0, localX: 0.4, localZ: -0.1, width: 1.3, height: 0.1, depth: 2.0, baseY: 0.1, rotation: blockRotation },
		{ x: 0, z: -0.04, localX: 0.4, localZ: -0.2, width: 0.95, height: 0.1, depth: 1.5, baseY: 0.2, rotation: blockRotation },
		// Left composition: small rear block, tall hero block and a low slab towards the crane.
		{ x: -4.65, z: 0.22, localX: -1.0, localZ: -2.65, width: 0.8, height: 0.2, depth: 0.55, rotation: blockRotation },
		{ x: -3.4, z: -0.12, localX: -0.4, localZ: -1.95, width: 2.1, height: 0.7, depth: 0.75, rotation: blockRotation },
		{ x: -2.25, z: 0.28, localX: -0.55, localZ: -1.3, width: 0.95, height: 0.3, depth: 1.5, rotation: blockRotation },
		// Right composition: one large block close to the crane and a smaller outer block.
		{ x: 3.1, z: -0.12, localX: -0.7, localZ: -0.8, width: 1.75, height: 0.7, depth: 2.65, rotation: 0.44 },
		{ x: 4.45, z: 0.34, localX: 0.3, localZ: 1.5, width: 1.15, height: 0.45, depth: 1.15, rotation: blockRotation },
	];
	blocks.forEach((block) => {
		block.originX = block.x;
		block.originZ = block.z;
		const localX = block.localX ?? 0;
		const localZ = block.localZ ?? 0;
		const rotation = block.rotation ?? 0;
		const cosine = Math.cos(rotation);
		const sine = Math.sin(rotation);
		block.x = block.originX + localX * cosine + localZ * sine;
		block.z = block.originZ - localX * sine + localZ * cosine;
		block.localX = localX;
		block.localZ = localZ;
	});
	const blockMaterial = createCase3FakeLitMaterial("blocks");
	const group = createInstancedArchitecture(blocks, disposables, {
		material: blockMaterial,
		wireframeEdges: false,
	});
	group.userData.setArchitectureBrightness = (value) => {
		const uniforms = group.userData.solidMaterial?.uniforms;
		if (!uniforms) return;
		uniforms.uAmbient.value = 0.1 + value * 0.12;
		uniforms.uKeyStrength.value = 0.28 + value * 0.14;
	};
	// Keep the architectural pedestal behind the crane base and clear of the copy column.
	group.position.set(0.75, 0, -0.85);

	const stripGeometry = new THREE.BoxGeometry(1, 1, 1);
	const coreMaterial = new THREE.MeshBasicMaterial({
		color: new THREE.Color().setRGB(0, 2.35, 5.4),
		transparent: true,
		opacity: 1,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		fog: true,
		toneMapped: false,
	});
	const lineGlow = {
		coreOpacity: 1,
		coreHeight: 0.01,
		coreDepth: 0.0105,
	};
	const strips = [
		// 01. Far-left low block: line sits on the front lower edge.
		{ blockIndex: 3, x: 0.409, y: 0.01, z: 0, length: 0.48, axis: "z" },
		// 02-04. Left hero block: actual front/right corner, not a floating face stroke.
		{ blockIndex: 4, x: 0.598, y: 0.32, z: 0.37, length: 0.93, axis: "x" },
		{ blockIndex: 4, x: 1.071, y: 0.32, z: 0.118, length: 0.515, axis: "z" },
		{ blockIndex: 4, x: 2.394, y: 0.1, z: -0.283, length: 0.689, axis: "x" },
		// 05. Low slab: front lower edge between the left cluster and crane pedestal.
		{ blockIndex: 5, x: 2.362, y: 0.0075, z: -0.402, length: 1.374, axis: "z" },
		// 06-07. Main pedestal: two visible lower front/corner edges.
		{ blockIndex: 0, x: 0.378, y: 0.01, z: 1.276, length: 1.13, axis: "x" },
		{ blockIndex: 0, x: 0.693, y: 0.1, z: 0.567, length: 0.863, axis: "z" },
		// 08-09. Right large block: top front/right corner.
		{ blockIndex: 6, x: -0.42, y: 0.425, z: 1.335, length: 0.933, axis: "x" },
		{ blockIndex: 6, x: -0.91, y: 0.425, z: 0.63, length: 1.42, axis: "z" },
		// 10-11. Right outer block: low front/right corner.
		{ blockIndex: 7, x: 0, y: 0.305, z: 0.585, length: 0.86, axis: "x" },
		{ blockIndex: 7, x: 0.63, y: 0.32, z: 0.16, length: 0.75, axis: "z" },
	];
	for (const strip of strips) {
		const block = blocks[strip.blockIndex];
		strip.ratioX = strip.x / block.width;
		strip.ratioY = strip.y / block.height;
		strip.ratioZ = strip.z / block.depth;
		strip.lengthRatio = strip.length / (strip.axis === "z" ? block.depth : block.width);
	}
	const stripMeshes = [];
	for (const strip of strips) {
		const core = new THREE.Mesh(stripGeometry, coreMaterial);
		core.scale.set(strip.length, lineGlow.coreHeight, lineGlow.coreDepth);
		group.add(core);
		stripMeshes.push({ strip, core });
	}
	const updateComposition = () => {
		group.userData.updateInstances?.();
		for (const { strip, core } of stripMeshes) {
			const block = blocks[strip.blockIndex];
			const rotation = block.rotation ?? 0;
			const cosine = Math.cos(rotation);
			const sine = Math.sin(rotation);
			const localX = strip.ratioX * block.width;
			const localY = strip.ratioY * block.height;
			const localZ = strip.ratioZ * block.depth;
			const length = strip.lengthRatio * (strip.axis === "z" ? block.depth : block.width);
			core.position.set(block.x + localX * cosine + localZ * sine, (block.baseY ?? 0) + localY, block.z - localX * sine + localZ * cosine);
			core.rotation.y = rotation + (strip.axis === "z" ? Math.PI / 2 : 0);
			core.scale.x = length;
			core.scale.y = lineGlow.coreHeight;
			core.scale.z = lineGlow.coreDepth;
		}
	};
	group.userData.blocks = blocks;
	group.userData.strips = strips;
	group.userData.lineGlow = lineGlow;
	group.userData.setLineGlow = (config) => {
		lineGlow.coreOpacity = config.coreOpacity;
		lineGlow.coreHeight = config.coreHeight;
		lineGlow.coreDepth = config.coreDepth;
		coreMaterial.opacity = lineGlow.coreOpacity;
	};
	group.userData.updateComposition = updateComposition;
	updateComposition();
	disposables.push(stripGeometry, coreMaterial);
	return group;
}

function mergeCraneGeometry(sourceScene) {
	const geometries = [];
	sourceScene.updateMatrixWorld(true);
	sourceScene.traverse((object) => {
		if (!object.isMesh || !object.geometry?.attributes?.position) return;
		let geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
		geometry.applyMatrix4(object.matrixWorld);
		for (const attributeName of Object.keys(geometry.attributes)) {
			if (attributeName !== "position") geometry.deleteAttribute(attributeName);
		}
		geometry.clearGroups();
		geometries.push(geometry);
	});

	if (geometries.length === 0) return null;
	const merged = mergeGeometries(geometries, false);
	for (const geometry of geometries) geometry.dispose();
	merged?.computeVertexNormals();
	return merged;
}

export class Case3Scene {
	constructor(renderer, store) {
		this.renderer = renderer;
		this.store = store;
		this.threeScene = new THREE.Scene();
		this.threeScene.fog = new THREE.FogExp2(0x00050b, 0.074);
		this.root = new THREE.Group();
		this.threeScene.add(this.root);
		this.modelRoot = new THREE.Group();
		// The crane feet sit on the top construction step instead of intersecting the blocks.
		this.modelRoot.position.y = 0.3;
		this.root.add(this.modelRoot);
		this.disposables = [];
		this.loaded = false;
		this.showCase = false;
		this.activePage = false;
		this.exitHideComplete = false;
		this._mixPreview = false;
		/** Overlay scale-out только при уходе с кейсов (не case→case). */
		this._allowExitOverlay = false;
		this.elapsed = 0;
		this.cameraParallax = new THREE.Vector2();

		this.grid = createGrid(this.disposables);
		this.digital = createDigitalNodes(this.disposables);
		this.city = createFogCity(this.disposables);
		this.constructionBlocks = createNeonConstructionBlocks(this.disposables);
		this.root.add(this.city, this.grid, this.constructionBlocks, this.digital.group);

		this._hideRoot();
		this._loadCrane();
	}

	_applyDevConfig() {}

	_loadCrane() {
		createGLTFLoader()
			.loadAsync("/models/case3/crane1.glb")
			.then((gltf) => {
				if (!this.threeScene) return;
				const mergedGeometry = mergeCraneGeometry(gltf.scene);
				if (!mergedGeometry) throw new Error("Crane GLB contains no mesh geometry");
				const craneMaterial = createCase3FakeLitMaterial("crane");
				const crane = new THREE.Mesh(mergedGeometry, craneMaterial);
				this.disposables.push(mergedGeometry, craneMaterial);
				// Normalize from the source dimensions first; camera angle must not change model scale.
				const initialBox = new THREE.Box3().setFromObject(crane);
				const initialSize = initialBox.getSize(new THREE.Vector3());
				const scale = 8.2 / Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
				crane.scale.setScalar(scale);
				// The asset's boom points along depth. Rotate it into a low three-quarter elevation.
				crane.rotation.y = CRANE_ROTATION_Y;
				crane.updateMatrixWorld(true);
				const box = new THREE.Box3().setFromObject(crane);
				const center = box.getCenter(new THREE.Vector3());
				// The tower (not the full boom bounding-box center) belongs over the HUD rings.
				crane.position.set(-center.x - 0.38, -box.min.y, -center.z);
				this.modelRoot.add(crane);
				this.loaded = true;
				if (this.showCase || this._mixPreview) {
					this.playEnterAnimation();
				}
			})
			.catch((error) => console.error("[Case3Scene] crane load failed", error));
	}

	_hideRoot() {
		this.root.visible = false;
		this.root.scale.setScalar(0.001);
		this.activePage = false;
	}

	resetCarouselState() {
		this.showCase = false;
		this.exitHideComplete = false;
		this.elapsed = 0;
		this._hideRoot();
	}

	playEnterAnimation() {
		if (!this.loaded) return;
		this.root.visible = true;
		restoreRootForShow(this.root);
		this.activePage = true;
		this.exitHideComplete = false;
	}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		const { show, shouldWake } = computeRouteSceneVisibility({
			currentPage,
			teleportPage,
			routePhase,
			matchPage: isCase3Path,
		});
		this.showCase = show;
		// case→case: не перехватывать кадр следующего кейса во время scale-out крана.
		this._allowExitOverlay = !isPortfolioCasePath(currentPage);
		if (!show && isPortfolioCasePath(currentPage)) {
			this.exitHideComplete = true;
			this._hideRoot();
			return;
		}
		if (show && shouldWake) this.playEnterAnimation();
	}

	setMixPreviewActive(active) {
		this._mixPreview = active === true;
		if (this._mixPreview && this.loaded) {
			this.root.visible = true;
			this.root.scale.setScalar(1);
		}
	}

	shouldRender() {
		return this.loaded && this.root.visible && (this.showCase || this._mixPreview);
	}

	shouldRenderOverlay() {
		return (
			this._allowExitOverlay &&
			this.loaded &&
			this.root.visible &&
			!this.showCase &&
			!this._mixPreview &&
			!this.exitHideComplete
		);
	}

	shouldKeepUpdating() {
		return this.root.visible || this.showCase || this._mixPreview;
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return this.activePage || this._mixPreview ? 1 : 0;
	}

	getModelsGrainBlurConfig() {
		return { enabled: false };
	}

	applyCamera(camera, frame) {
		const progress = frame?.sceneProgress ?? 0;
		// Camera sits just above the floor and looks steeply upward at the tower.
		const parallaxX = this.cameraParallax.x;
		const parallaxY = this.cameraParallax.y;
		camera.position.set(CASE3_CAMERA.x + parallaxX * 0.18, CASE3_CAMERA.y - progress * 0.12 + parallaxY * 0.12, CASE3_CAMERA.z);
		camera.fov = CASE3_CAMERA.fov;
		camera.updateProjectionMatrix();
		camera.lookAt(CASE3_CAMERA.lookX + parallaxX * 0.08, CASE3_CAMERA.lookY - progress * 0.12 + parallaxY * 0.06, CASE3_CAMERA.lookZ);
	}

	update(delta, frame) {
		if (!this.loaded) return;
		this.elapsed += delta;
		const pointer = frame?.pointer ?? { x: 0, y: 0 };
		const pointerX = frame?.pointerBlocked ? 0 : THREE.MathUtils.clamp(pointer.x ?? 0, -1, 1);
		const pointerY = frame?.pointerBlocked ? 0 : THREE.MathUtils.clamp(pointer.y ?? 0, -1, 1);
		this.cameraParallax.x = THREE.MathUtils.damp(this.cameraParallax.x, pointerX, 4.2, delta);
		this.cameraParallax.y = THREE.MathUtils.damp(this.cameraParallax.y, pointerY, 4.2, delta);
		const mobile = (frame?.viewportWidth ?? window.innerWidth) <= 768;
		const target = mobile ? ROOT_MOBILE : ROOT_DESKTOP;
		easing.damp3(this.root.position, target, 0.6, delta);

		if (this.showCase || this._mixPreview) {
			this.root.visible = true;
			restoreRootForShow(this.root);
			easing.damp3(this.root.scale, mobile ? [0.72, 0.72, 0.72] : [1, 1, 1], 0.65, delta);
		} else {
			easing.damp3(this.root.scale, [0.001, 0.001, 0.001], 0.22, delta);
			if (this.root.scale.x < 0.002) {
				this.root.visible = false;
				this.exitHideComplete = true;
				freezeHiddenRoot(this.root);
			}
		}

		this.digital.pointsMaterial.opacity = 0.72 + Math.sin(this.elapsed * 1.8) * 0.2;
		const beaconPositions = this.digital.beacons.geometry.attributes.position;
		this.digital.verticalDefinitions.forEach((definition, index) => {
			const travel = (this.elapsed * 0.32 + definition.phase) % 1;
			beaconPositions.setXYZ(index, definition.x, 0.05 + travel * definition.height, definition.z);
		});
		beaconPositions.needsUpdate = true;
	}

	dispose() {
		this.threeScene = null;
		for (const disposable of this.disposables) disposable?.dispose?.();
		this.disposables = [];
	}
}
