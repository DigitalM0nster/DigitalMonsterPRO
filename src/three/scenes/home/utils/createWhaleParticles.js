import * as THREE from "three";

import {
	whaleMeshParticleFragmentShader,
	whaleMeshParticleVertexShader,
} from "../shaders/digitalWhaleShaders.js";
import { withFogUniforms } from "./shaderFogUniforms.js";
import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import { mediumHomeVisualConfig } from "../mediumHomeVisualConfig.js";
import { createWhaleParticleSkinning } from "./whaleParticleSkinning.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import {
	getWhaleParticleFadeRegion,
	getWhaleParticleFadeRegionFadeMultiplier,
	resolveParticleFadeRegion,
} from "./whaleParticleRegionFade.js";

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();

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
 * концами ребра после GPU skinning. Атрибуты частиц после prepare неизменны.
 */
export function createWhaleParticles(meshes, options = {}) {
	const edgeSpacing = options.edgeSpacing ?? 0.1;
	const vertexStride = options.vertexStride ?? 2;
	const samples = [];

	for (const mesh of meshes) {
		const edges = collectMeshEdges(mesh);
		samples.push(...sampleAlongEdges(mesh, edges, edgeSpacing));
	}

	if (samples.length === 0) {
		for (const mesh of meshes) {
			samples.push(...sampleVertices(mesh, vertexStride));
		}
	}

	// Stratified selection preserves coverage along the whole silhouette. This
	// runs only during prepare; particle buffers remain immutable after Start.
	if (getGraphicsTier() === "low" && samples.length > 10000) {
		const stride = samples.length / 10000;
		for (let i = 0; i < 10000; i++) samples[i] = samples[Math.floor(i * stride)];
		samples.length = 10000;
	}
	const count = samples.length;
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
	geometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));
	const skinning = createWhaleParticleSkinning(samples, geometry);
	const roundParticles = getGraphicsTier() === "medium";
	const lowParticles = getGraphicsTier() === "low";

	const material = new THREE.ShaderMaterial({
		defines: lowParticles ? { LOW_LOCAL_PARTICLE: 1 } : roundParticles ? { MEDIUM_ROUND_PARTICLE: 1 } : {},
		uniforms: withFogUniforms({
			...skinning.uniforms,
			uRegionMin: { value: new THREE.Vector3() },
			uRegionMax: { value: new THREE.Vector3() },
			uRegionFade: { value: 1 },
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(0x00e5ff) },
			uPointScale: { value: 2.2 },
			// DPR-1 Medium needs room for the round halo around its compact core.
			// High retains its original sprite size and grain profile.
			uRasterScale: { value: 1 },
			uLowFogRange: { value: new THREE.Vector2(18, 49) },
			uMediumColor: { value: new THREE.Color(mediumHomeVisualConfig.whaleColor) },
			uMediumEmission: { value: mediumHomeVisualConfig.whaleEmission },
			uMediumRadiance: { value: mediumHomeVisualConfig.whaleRadiance },
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
		...(roundParticles || lowParticles ? {
			// Keep the brightest light at each pixel, bounded by its HDR core.
			// Dim overlapping points cannot obscure a bright one or add a hotspot.
			blending: THREE.CustomBlending,
			blendEquation: THREE.MaxEquation,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneFactor,
			blendEquationAlpha: THREE.AddEquation,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		} : {}),
		fog: true,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 3;
	points.frustumCulled = false;
	// Root teardown and dev edge-spacing rebuild both dispose this material.
	material.addEventListener("dispose", skinning.dispose);

	const particleFadeBox = {};

	function updatePositions() {
		skinning.update();
		const region = getWhaleParticleFadeRegion();
		const box = resolveParticleFadeRegion(region, skinning.initialBounds, particleFadeBox);
		material.uniforms.uRegionFade.value = box ? getWhaleParticleFadeRegionFadeMultiplier(region) : 1;
		if (box) {
			material.uniforms.uRegionMin.value.set(box.minX, box.minY, box.minZ);
			material.uniforms.uRegionMax.value.set(box.maxX, box.maxY, box.maxZ);
		}
	}

	updatePositions();

	if (count === 0) {
		console.warn("[createWhaleParticles] нет геометрии для партиклов — проверьте FBX");
	}

	return {
		points,
		material,
		geometry,
		updatePositions,
		bodySamples: skinning.bodySamples,
		sampleCount: count,
	};
}
