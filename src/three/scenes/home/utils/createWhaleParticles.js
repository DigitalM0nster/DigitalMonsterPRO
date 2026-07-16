import * as THREE from "three";

import {
	whaleMeshParticleFragmentShader,
	whaleMeshParticleVertexShader,
} from "../shaders/digitalWhaleShaders.js";
import { withFogUniforms } from "./shaderFogUniforms.js";
import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import {
	computeParticleBounds,
	getWhaleParticleFadeRegion,
	getWhaleParticleFadeRegionFadeMultiplier,
	isInsideParticleFadeRegion,
	resolveParticleFadeRegion,
} from "./whaleParticleRegionFade.js";

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _skinnedA = new THREE.Vector3();
const _skinnedB = new THREE.Vector3();
const _result = new THREE.Vector3();

/** Уникальные рёбра треугольников — совпадает с линиями wireframe в Blender. */
function collectTriangleEdges(geometry) {
	const positionAttr = geometry.attributes.position;
	const indexAttr = geometry.index;
	const edges = [];
	const seen = new Set();

	const addEdge = (a, b) => {
		if (a === b) {
			return;
		}

		const key = a < b ? `${a}:${b}` : `${b}:${a}`;
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		_va.fromBufferAttribute(positionAttr, a);
		_vb.fromBufferAttribute(positionAttr, b);
		const length = _va.distanceTo(_vb);

		if (length < 1e-6) {
			return;
		}

		edges.push({ a, b, length });
	};

	if (indexAttr) {
		for (let i = 0; i < indexAttr.count; i += 3) {
			const i0 = indexAttr.getX(i);
			const i1 = indexAttr.getX(i + 1);
			const i2 = indexAttr.getX(i + 2);
			addEdge(i0, i1);
			addEdge(i1, i2);
			addEdge(i2, i0);
		}
	} else {
		for (let i = 0; i < positionAttr.count; i += 3) {
			addEdge(i, i + 1);
			addEdge(i + 1, i + 2);
			addEdge(i + 2, i);
		}
	}

	return edges;
}

/** Линии из Line / LineSegments (если в FBX только edge-геометрия). */
function collectLineSegmentEdges(geometry) {
	const positionAttr = geometry.attributes.position;
	const indexAttr = geometry.index;
	const edges = [];

	if (indexAttr) {
		for (let i = 0; i < indexAttr.count; i += 2) {
			const a = indexAttr.getX(i);
			const b = indexAttr.getX(i + 1);
			_va.fromBufferAttribute(positionAttr, a);
			_vb.fromBufferAttribute(positionAttr, b);
			edges.push({ a, b, length: _va.distanceTo(_vb) });
		}
	} else {
		for (let i = 0; i < positionAttr.count - 1; i += 2) {
			_va.fromBufferAttribute(positionAttr, i);
			_vb.fromBufferAttribute(positionAttr, i + 1);
			edges.push({ a: i, b: i + 1, length: _va.distanceTo(_vb) });
		}
	}

	return edges;
}

function collectMeshEdges(mesh) {
	if (mesh.isLineSegments || mesh.isLine) {
		return collectLineSegmentEdges(mesh.geometry);
	}

	return collectTriangleEdges(mesh.geometry);
}

function sampleAlongEdges(mesh, edges, edgeSpacing) {
	const spacing = Math.max(0.02, edgeSpacing);
	const samples = [];

	for (const edge of edges) {
		const steps = Math.max(1, Math.ceil(edge.length / spacing));

		for (let step = 0; step <= steps; step++) {
			samples.push({
				mesh,
				a: edge.a,
				b: edge.b,
				t: step / steps,
			});
		}
	}

	return samples;
}

function writeSkinnedVertex(mesh, vertexIndex, target) {
	target.fromBufferAttribute(mesh.geometry.attributes.position, vertexIndex);

	if (mesh.isSkinnedMesh) {
		mesh.applyBoneTransform(vertexIndex, target);
	}

	target.applyMatrix4(mesh.matrix);
}

function sampleVertices(mesh, vertexStride) {
	const samples = [];
	const positionAttr = mesh.geometry?.attributes?.position;

	if (!positionAttr) {
		return samples;
	}

	const step = Math.max(1, Math.round(vertexStride));

	for (let vertexIndex = 0; vertexIndex < positionAttr.count; vertexIndex += step) {
		samples.push({ mesh, a: vertexIndex, b: vertexIndex, t: 0 });
	}

	return samples;
}

/** Множитель яркости по подстроке в имени mesh FBX (если в модели несколько mesh). */
function resolveMeshFadeMultiplier(mesh, rules) {
	if (!rules?.length) {
		return 1;
	}

	const name = (mesh.name || "").toLowerCase();

	for (const rule of rules) {
		const match = (rule.match || "").toLowerCase();
		if (match && name.includes(match)) {
			return THREE.MathUtils.clamp(rule.intensity ?? 0.35, 0, 1);
		}
	}

	return 1;
}

/**
 * Партиклы вдоль рёбер меша (не по сетке вершин). Позиции интерполируются между
 * концами ребра и каждый кадр пересчитываются через скелет.
 */
export function createWhaleParticles(meshes, options = {}) {
	const edgeSpacing = options.edgeSpacing ?? 0.1;
	const vertexStride = options.vertexStride ?? 2;
	const samples = [];
	let sampleMode = "edges";

	for (const mesh of meshes) {
		const edges = collectMeshEdges(mesh);
		samples.push(...sampleAlongEdges(mesh, edges, edgeSpacing));
	}

	if (samples.length === 0) {
		sampleMode = "vertices";
		for (const mesh of meshes) {
			samples.push(...sampleVertices(mesh, vertexStride));
		}
	}

	const count = samples.length;
	const vertexCacheByMesh = new Map();
	for (const { mesh, a, b } of samples) {
		let vertexCache = vertexCacheByMesh.get(mesh);
		if (!vertexCache) {
			vertexCache = new Map();
			vertexCacheByMesh.set(mesh, vertexCache);
		}
		if (!vertexCache.has(a)) {
			vertexCache.set(a, new THREE.Vector3());
		}
		if (!vertexCache.has(b)) {
			vertexCache.set(b, new THREE.Vector3());
		}
	}
	const positions = new Float32Array(count * 3);
	const baseIntensities = new Float32Array(count);
	const meshFadePerSample = new Float32Array(count);
	const meshFadeRules = digitalWhaleConfig.whale?.particleFade?.meshes ?? [];

	for (let i = 0; i < count; i++) {
		meshFadePerSample[i] = resolveMeshFadeMultiplier(samples[i].mesh, meshFadeRules);
		baseIntensities[i] = 0.45 + Math.random() * 0.55;
	}

	const intensities = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		intensities[i] = baseIntensities[i] * meshFadePerSample[i];
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));

	const material = new THREE.ShaderMaterial({
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(0x00e5ff) },
			uPointScale: { value: 2.2 },
			uAlphaMult: { value: 1 },
			uGlow: { value: 2.5 },
			uGrainBlurRadius: { value: 0 },
			uMuteStrength: { value: 0 },
			uMuteCenter: { value: new THREE.Vector3() },
			uMuteRadius: { value: new THREE.Vector3(1, 1, 1) },
		}),
		vertexShader: whaleMeshParticleVertexShader,
		fragmentShader: whaleMeshParticleFragmentShader,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		fog: true,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 3;
	points.frustumCulled = false;

	let particleBounds = null;
	const particleFadeBox = {};

	function applyRegionIntensityFade() {
		const region = getWhaleParticleFadeRegion();
		const box = resolveParticleFadeRegion(region, particleBounds, particleFadeBox);
		const intensityAttr = geometry.attributes.aIntensity;

		if (!box) {
			for (let i = 0; i < count; i++) {
				intensityAttr.setX(i, baseIntensities[i] * meshFadePerSample[i]);
			}
			intensityAttr.needsUpdate = true;
			return;
		}

		const insideFade = getWhaleParticleFadeRegionFadeMultiplier(region);

		for (let i = 0; i < count; i++) {
			let fade = meshFadePerSample[i];
			const x = positions[i * 3];
			const y = positions[i * 3 + 1];
			const z = positions[i * 3 + 2];

			if (isInsideParticleFadeRegion(x, y, z, box)) {
				fade *= insideFade;
			}

			intensityAttr.setX(i, baseIntensities[i] * fade);
		}

		intensityAttr.needsUpdate = true;
	}

	function updatePositions() {
		const positionAttr = geometry.attributes.position;

		for (const [mesh, vertexCache] of vertexCacheByMesh) {
			for (const [vertexIndex, vertex] of vertexCache) {
				writeSkinnedVertex(mesh, vertexIndex, vertex);
			}
		}

		for (let i = 0; i < samples.length; i++) {
			const { mesh, a, b, t } = samples[i];
			const vertexCache = vertexCacheByMesh.get(mesh);
			_skinnedA.copy(vertexCache.get(a));
			_skinnedB.copy(vertexCache.get(b));
			_result.lerpVectors(_skinnedA, _skinnedB, t);
			positionAttr.setXYZ(i, _result.x, _result.y, _result.z);
		}

		positionAttr.needsUpdate = true;

		if (!particleBounds) {
			particleBounds = computeParticleBounds(positionAttr, count);
			const region = getWhaleParticleFadeRegion();
			const box = resolveParticleFadeRegion(region, particleBounds, particleFadeBox);
			console.info("[createWhaleParticles] bounds (локальные координаты кита)", particleBounds);
			if (box) {
				console.info("[createWhaleParticles] region fade box", box);
			}
		}

		applyRegionIntensityFade();
	}

	updatePositions();

	if (count === 0) {
		console.warn("[createWhaleParticles] нет геометрии для партиклов — проверьте FBX");
	} else {
		console.info(`[createWhaleParticles] ${count} точек (${sampleMode}) на ${meshes.length} mesh`);
	}

	return {
		points,
		material,
		geometry,
		updatePositions,
		sampleCount: count,
	};
}
