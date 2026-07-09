import * as THREE from "three";
import {
	oceanGridLineFragmentShader,
	oceanGridLineVertexShader,
	oceanParticlesFragmentShader,
	oceanParticlesVertexShader,
	oceanSurfaceFragmentShader,
	oceanSurfaceVertexShader,
} from "../shaders/digitalWhaleShaders.js";
import { withFogUniforms } from "./shaderFogUniforms.js";
import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import { getGraphicsTier } from "@/utils/getGraphicsTier.js";
import { getOceanTileCountCap } from "./heroSceneTierScale.js";

/** Ширина одного тайла сетки по X — для бесшовного скролла. */
export const OCEAN_SURFACE_WIDTH = 120;

/** Глубина тайла по Z (от zNear вниз). */
export const OCEAN_SURFACE_DEPTH = 95;

/** Край сетки «ближе к камере» по Z (как в старой point-сетке). */
export const OCEAN_SURFACE_Z_NEAR = 22;

/** Минимум тайлов для бесшовного скролла; фактическое число — по ширине кадра. */
export const OCEAN_SURFACE_TILE_MIN_COUNT = 3;

/** @deprecated используй resolveOceanTileSlotCount */
export const OCEAN_SURFACE_TILE_OFFSETS = [-1, 0, 1];

/** Индексы слотов −N…+N для нечётного числа тайлов. */
export function resolveOceanTileSlotCount(tileCount) {
	const count = Math.max(OCEAN_SURFACE_TILE_MIN_COUNT, tileCount | 1);
	const half = Math.floor(count / 2);
	const slots = [];
	for (let slot = -half; slot <= half; slot++) {
		slots.push(slot);
	}
	return slots;
}

/**
 * Сколько тайлов нужно, чтобы закрыть горизонт кадра на плоскости океана.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Object3D} oceanSurfaceGroup
 * @param {{ scaleX?: number }} oceanConfig
 */
export function resolveOceanTileCountForCamera(camera, oceanSurfaceGroup, oceanConfig = {}) {
	if (!camera || !oceanSurfaceGroup) {
		return OCEAN_SURFACE_TILE_MIN_COUNT;
	}

	const scaleX = Math.max(oceanConfig.scaleX ?? 1, 1e-6);
	const anchor = new THREE.Vector3();
	oceanSurfaceGroup.getWorldPosition(anchor);

	const dist = Math.max(camera.position.distanceTo(anchor), 1);
	const fovRad = THREE.MathUtils.degToRad(camera.fov);
	const halfWorldX = Math.tan(fovRad * 0.5) * dist * camera.aspect * 1.3;
	const halfLocalX = halfWorldX / scaleX;
	const halfTiles = Math.ceil(halfLocalX / OCEAN_SURFACE_WIDTH) + 1;
	const tileCap = getOceanTileCountCap();

	return Math.max(OCEAN_SURFACE_TILE_MIN_COUNT, Math.min(halfTiles * 2 + 1, tileCap));
}

/** Фаза бесконечного скролла и позиция тайла по слоту. */
export function getOceanTileScrollX(scrollAccum, slot) {
	const w = OCEAN_SURFACE_WIDTH;
	const phase = ((scrollAccum % w) + w) % w;
	return slot * w + phase;
}

/**
 * Плоскость с сегментами — vertex shader искажает Y (волны + рябь).
 * @param {number} planeWidth — полная ширина одного mesh (может быть N × OCEAN_SURFACE_WIDTH)
 * @param {number} widthSegments
 * @param {number} depthSegments
 */
export function createOceanPlaneGeometry(planeWidth, widthSegments, depthSegments) {
	const geometry = new THREE.PlaneGeometry(
		planeWidth,
		OCEAN_SURFACE_DEPTH,
		widthSegments,
		depthSegments,
	);
	geometry.rotateX(-Math.PI / 2);
	const zCenter = OCEAN_SURFACE_Z_NEAR - OCEAN_SURFACE_DEPTH * 0.5;
	geometry.translate(0, 0, zCenter);
	return geometry;
}

/**
 * Океан — плоскость с геометрическими волнами; точки сетки — в fragment shader.
 * @param {[number, number]} gridSize — cols/rows (плотность процедурной сетки)
 * @param {[number, number]} meshSegments — сегменты плоскости для деформации (на один период 120)
 * @param {number} [tileCount=5] — ширина mesh = tileCount × OCEAN_SURFACE_WIDTH
 */
export function createOceanSurface(gridSize, meshSegments, tileCount = 5) {
	const [cols, rows] = gridSize;
	const [segX, segZ] = meshSegments;
	const tiles = Math.max(OCEAN_SURFACE_TILE_MIN_COUNT, tileCount | 1);
	const totalWidth = tiles * OCEAN_SURFACE_WIDTH;
	const segXTotal = Math.min(Math.max(segX * tiles, segX), 240);
	const geometry = createOceanPlaneGeometry(totalWidth, segXTotal, segZ);
	const o = digitalWhaleConfig.ocean;

	const material = new THREE.ShaderMaterial({
		fog: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uRippleCenter: {
				value: new THREE.Vector2(0, 0),
			},
			uRippleDir: { value: new THREE.Vector2(-1, 0) },
			uScrollPhase: { value: new THREE.Vector2(0, 0) },
			uPointColor: { value: new THREE.Color(o.pointColor) },
			uGridColor: { value: new THREE.Color(o.gridColor) },
			uGridCols: { value: cols },
			uGridRows: { value: rows },
			uSurfaceWidth: { value: OCEAN_SURFACE_WIDTH },
			uSurfaceDepth: { value: OCEAN_SURFACE_DEPTH },
			uSurfaceZNear: { value: OCEAN_SURFACE_Z_NEAR },
			uWaveAmp: { value: o.waveAmp },
			uRippleAmp: { value: o.rippleAmp },
			uPointScale: { value: o.pointScale },
			uAlphaMult: { value: o.pointAlpha },
			uGlow: { value: o.pointGlow },
			uGridAlpha: { value: o.gridAlpha },
		}),
		vertexShader: oceanSurfaceVertexShader,
		fragmentShader: oceanSurfaceFragmentShader,
	});

	const mesh = new THREE.Mesh(geometry, material);
	mesh.renderOrder = 10;

	return { mesh, geometry, material };
}

/**
 * High tier: классическая сетка из Points (круглые спрайты gl_PointSize).
 */
export function createOceanParticles(gridSize) {
	const [cols, rows] = gridSize;
	const width = OCEAN_SURFACE_WIDTH;
	const depth = OCEAN_SURFACE_DEPTH;
	const count = cols * rows;
	const positions = new Float32Array(count * 3);

	let index = 0;

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			// Центры ячеек: нет точки ровно на ±width/2 → стыки тайлов не дублируются.
			const u = (col + 0.5) / cols;
			const v = (row + 0.5) / rows;
			const x = (u - 0.5) * width;
			const z = OCEAN_SURFACE_Z_NEAR - v * depth;

			positions[index * 3] = x;
			positions[index * 3 + 1] = 0;
			positions[index * 3 + 2] = z;

			index++;
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const o = digitalWhaleConfig.ocean;

	const material = new THREE.ShaderMaterial({
		fog: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uRippleCenter: {
				value: new THREE.Vector2(0, 0),
			},
			uRippleDir: { value: new THREE.Vector2(-1, 0) },
			uScrollPhase: { value: new THREE.Vector2(0, 0) },
			uColor: { value: new THREE.Color(o.pointColor) },
			uWaveAmp: { value: o.waveAmp },
			uRippleAmp: { value: o.rippleAmp },
			uPointScale: { value: o.pointScale },
			uAlphaMult: { value: o.pointAlpha },
			uGlow: { value: o.pointGlow },
		}),
		vertexShader: oceanParticlesVertexShader,
		fragmentShader: oceanParticlesFragmentShader,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 10;

	return { points, geometry, material };
}

/** High tier: линии сетки между точками. */
export function createOceanGridLines(gridSize, geometry) {
	const [cols, rows] = gridSize;
	const positions = [];
	const basePositions = geometry.attributes.position;

	const getBase = (col, row) => {
		const i = row * cols + col;
		return {
			x: basePositions.getX(i),
			y: basePositions.getY(i),
			z: basePositions.getZ(i),
		};
	};

	const link = (a, b) => {
		positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
	};

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const a = getBase(col, row);
			if (col < cols - 1) {
				link(a, getBase(col + 1, row));
			}
			if (row < rows - 1) {
				link(a, getBase(col, row + 1));
			}
		}
	}

	const lineGeometry = new THREE.BufferGeometry();
	lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	const o = digitalWhaleConfig.ocean;

	const material = new THREE.ShaderMaterial({
		fog: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uRippleCenter: {
				value: new THREE.Vector2(0, 0),
			},
			uRippleDir: { value: new THREE.Vector2(-1, 0) },
			uScrollPhase: { value: new THREE.Vector2(0, 0) },
			uColor: { value: new THREE.Color(o.gridColor) },
			uWaveAmp: { value: o.waveAmp },
			uRippleAmp: { value: o.rippleAmp },
			uGridAlpha: { value: o.gridAlpha },
		}),
		vertexShader: oceanGridLineVertexShader,
		fragmentShader: oceanGridLineFragmentShader,
	});

	const lines = new THREE.LineSegments(lineGeometry, material);
	lines.renderOrder = 9;

	return { lines, geometry: lineGeometry, material };
}
