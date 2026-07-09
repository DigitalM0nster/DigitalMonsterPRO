import * as THREE from "three";

import {
	ambientDriftFragmentShader,
	ambientDriftVertexShader,
} from "../shaders/digitalWhaleShaders.js";
import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import {
	getAmbientLocalSurfaceY,
	getOceanSpaceCeilingY,
} from "./oceanSurfaceClip.js";
import { withFogUniforms } from "./shaderFogUniforms.js";

function createDriftMaterial(color, options = {}) {
	const useFog = options.fog !== false;

	return new THREE.ShaderMaterial({
		fog: useFog,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(color) },
			uPointScale: { value: options.pointScale ?? 1.5 },
			uAlphaMult: { value: options.alpha ?? 0.4 },
			uGlow: { value: options.glow ?? 0.8 },
			uDriftAmp: { value: options.driftAmp ?? 0.35 },
			uLocalSurfaceY: { value: options.localSurfaceY ?? 5 },
			uAnchorY: { value: options.anchorY ?? 0 },
			uOceanCeilingY: { value: options.oceanCeilingY ?? -1 },
			uOceanFadeBand: { value: options.oceanFadeBand ?? 2.5 },
			uScrollPhase: { value: 0 },
			uWrapWidth: { value: options.wrapWidth ?? 40 },
		}),
		vertexShader: ambientDriftVertexShader,
		fragmentShader: ambientDriftFragmentShader,
	});
}

function fillDriftAttributes(count, phases, sizes, pulses) {
	for (let i = 0; i < count; i++) {
		phases[i] = Math.random() * Math.PI * 2;
		sizes[i] = 0.55 + Math.random() * 0.75;
		pulses[i] = Math.random();
	}
}

function getDeepLayoutKey(cfg, whaleCfg) {
	return [
		Math.round(cfg.deepCount ?? 0),
		cfg.deepSpreadX ?? 42,
		cfg.deepSpreadZ ?? 36,
		cfg.deepYMin ?? -16,
		cfg.deepYMax ?? 4,
		whaleCfg.whale?.posY ?? 0,
	].join("|");
}

function buildDeepGeometry(count, cfg, whaleCfg) {
	const positions = new Float32Array(count * 3);
	const phases = new Float32Array(count);
	const sizes = new Float32Array(count);
	const pulses = new Float32Array(count);

	const anchorY = whaleCfg.whale?.posY ?? 0;
	const ocean = whaleCfg.ocean ?? {};
	const localSurfaceY = getAmbientLocalSurfaceY(anchorY, cfg, ocean);

	const spreadX = cfg.deepSpreadX ?? 42;
	const spreadZ = cfg.deepSpreadZ ?? 36;
	const yMin = cfg.deepYMin ?? -16;
	const yMax = Math.min(cfg.deepYMax ?? 4, localSurfaceY);

	for (let i = 0; i < count; i++) {
		const index = i * 3;
		positions[index] = (Math.random() - 0.5) * spreadX;
		positions[index + 1] =
			yMax > yMin ? yMin + Math.random() * (yMax - yMin) : Math.min(yMin, localSurfaceY);
		positions[index + 2] = (Math.random() - 0.5) * spreadZ;
	}

	fillDriftAttributes(count, phases, sizes, pulses);

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aPulse", new THREE.BufferAttribute(pulses, 1));

	return geometry;
}

function applyDeepUniforms(material, cfg, whaleCfg) {
	const anchorY = whaleCfg.whale?.posY ?? 0;
	material.uniforms.uLocalSurfaceY.value = getAmbientLocalSurfaceY(
		anchorY,
		cfg,
		whaleCfg.ocean,
	);
	material.uniforms.uAnchorY.value = anchorY;
	material.uniforms.uOceanCeilingY.value = getOceanSpaceCeilingY(cfg, whaleCfg.ocean);
	material.uniforms.uOceanFadeBand.value = cfg.oceanFadeBand ?? 2.5;
	material.uniforms.uColor.value.set(cfg.deepColor ?? "#1a8eb8");
	material.uniforms.uPointScale.value = cfg.deepPointScale ?? 2.4;
	material.uniforms.uAlphaMult.value = cfg.deepAlpha ?? 0.62;
	material.uniforms.uGlow.value = cfg.deepGlow ?? 1.1;
	material.uniforms.uDriftAmp.value = cfg.deepDriftAmp ?? 0.38;
	material.uniforms.uWrapWidth.value = cfg.deepSpreadX ?? 42;
}

/** Мелкие частицы в толще воды под сеткой океана (локальные координаты вокруг якоря у кита). */
export function createDeepOceanParticles(
	config = digitalWhaleConfig.ambient,
	whaleConfig = digitalWhaleConfig,
) {
	let count = Math.max(0, Math.round(config.deepCount ?? 350));
	let layoutKey = getDeepLayoutKey(config, whaleConfig);
	let geometry = buildDeepGeometry(count, config, whaleConfig);

	const anchorY = whaleConfig.whale?.posY ?? 0;
	const ocean = whaleConfig.ocean ?? {};
	const localSurfaceY = getAmbientLocalSurfaceY(anchorY, config, ocean);

	const material = createDriftMaterial(config.deepColor ?? "#1a8eb8", {
		pointScale: config.deepPointScale ?? 2.4,
		alpha: config.deepAlpha ?? 0.62,
		glow: config.deepGlow ?? 1.1,
		driftAmp: config.deepDriftAmp ?? 0.38,
		localSurfaceY,
		anchorY,
		oceanCeilingY: getOceanSpaceCeilingY(config, ocean),
		wrapWidth: config.deepSpreadX ?? 42,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 8;
	points.frustumCulled = false;

	function rebuild(cfg = digitalWhaleConfig.ambient, whaleCfg = digitalWhaleConfig) {
		geometry.dispose();
		count = Math.max(0, Math.round(cfg.deepCount ?? 0));
		layoutKey = getDeepLayoutKey(cfg, whaleCfg);
		geometry = buildDeepGeometry(count, cfg, whaleCfg);
		points.geometry = geometry;
		return geometry;
	}

	function applyConfig(cfg = digitalWhaleConfig.ambient, whaleCfg = digitalWhaleConfig) {
		const nextKey = getDeepLayoutKey(cfg, whaleCfg);
		if (nextKey !== layoutKey) {
			rebuild(cfg, whaleCfg);
		}
		applyDeepUniforms(material, cfg, whaleCfg);
	}

	return {
		points,
		get geometry() {
			return geometry;
		},
		material,
		getCount: () => count,
		rebuild,
		update(elapsed, scrollPhase = 0) {
			material.uniforms.uTime.value = elapsed;
			material.uniforms.uScrollPhase.value = scrollPhase;
		},
		applyConfig,
	};
}

function getWhaleAmbientLayoutKey(cfg, whaleCfg) {
	return [
		Math.round(cfg.whaleAmbientCount ?? 0),
		cfg.whaleAmbientRadiusX ?? 22,
		cfg.whaleAmbientRadiusY ?? 12,
		cfg.whaleAmbientRadiusZ ?? 18,
		whaleCfg.whale?.posY ?? 0,
	].join("|");
}

function buildWhaleAmbientGeometry(count, cfg, whaleCfg) {
	const positions = new Float32Array(count * 3);
	const phases = new Float32Array(count);
	const sizes = new Float32Array(count);
	const pulses = new Float32Array(count);

	const anchorY = whaleCfg.whale?.posY ?? 0;
	const ocean = whaleCfg.ocean ?? {};
	const localSurfaceY = getAmbientLocalSurfaceY(anchorY, cfg, ocean);

	const radiusX = cfg.whaleAmbientRadiusX ?? 22;
	const radiusY = cfg.whaleAmbientRadiusY ?? 12;
	const radiusZ = cfg.whaleAmbientRadiusZ ?? 18;
	const yMin = -radiusY * 2;

	for (let i = 0; i < count; i++) {
		const index = i * 3;
		positions[index] = (Math.random() - 0.5) * radiusX * 2;
		let localY = (Math.random() - 0.5) * radiusY * 2;
		localY = Math.min(localY, localSurfaceY);
		localY = Math.max(localY, yMin);
		positions[index + 1] = localY;
		positions[index + 2] = (Math.random() - 0.5) * radiusZ * 2;
	}

	fillDriftAttributes(count, phases, sizes, pulses);

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aPulse", new THREE.BufferAttribute(pulses, 1));

	return geometry;
}

function applyWhaleAmbientUniforms(material, cfg, whaleCfg) {
	const anchorY = whaleCfg.whale?.posY ?? 0;
	material.uniforms.uLocalSurfaceY.value = getAmbientLocalSurfaceY(
		anchorY,
		cfg,
		whaleCfg.ocean,
	);
	material.uniforms.uAnchorY.value = anchorY;
	material.uniforms.uOceanCeilingY.value = getOceanSpaceCeilingY(cfg, whaleCfg.ocean);
	material.uniforms.uOceanFadeBand.value = cfg.oceanFadeBand ?? 2.5;
	material.uniforms.uColor.value.set(cfg.whaleAmbientColor ?? "#45d8ff");
	material.uniforms.uPointScale.value = cfg.whaleAmbientPointScale ?? 2.2;
	material.uniforms.uAlphaMult.value = cfg.whaleAmbientAlpha ?? 0.72;
	material.uniforms.uGlow.value = cfg.whaleAmbientGlow ?? 1.35;
	material.uniforms.uDriftAmp.value = cfg.whaleAmbientDriftAmp ?? 0.55;
	material.uniforms.uWrapWidth.value = (cfg.whaleAmbientRadiusX ?? 22) * 2;
}

/** Дрейфующие частицы вокруг кита — только под поверхностью океана. */
export function createWhaleAmbientParticles(
	config = digitalWhaleConfig.ambient,
	whaleConfig = digitalWhaleConfig,
) {
	let count = Math.max(0, Math.round(config.whaleAmbientCount ?? 90));
	let layoutKey = getWhaleAmbientLayoutKey(config, whaleConfig);
	let geometry = buildWhaleAmbientGeometry(count, config, whaleConfig);

	const anchorY = whaleConfig.whale?.posY ?? 0;
	const ocean = whaleConfig.ocean ?? {};
	const localSurfaceY = getAmbientLocalSurfaceY(anchorY, config, ocean);

	const material = createDriftMaterial(config.whaleAmbientColor ?? "#45d8ff", {
		fog: false,
		pointScale: config.whaleAmbientPointScale ?? 2.2,
		alpha: config.whaleAmbientAlpha ?? 0.72,
		glow: config.whaleAmbientGlow ?? 1.35,
		driftAmp: config.whaleAmbientDriftAmp ?? 0.55,
		localSurfaceY,
		anchorY,
		oceanCeilingY: getOceanSpaceCeilingY(config, ocean),
		wrapWidth: (config.whaleAmbientRadiusX ?? 22) * 2,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 7;
	points.frustumCulled = false;

	function rebuild(cfg = digitalWhaleConfig.ambient, whaleCfg = digitalWhaleConfig) {
		geometry.dispose();
		count = Math.max(0, Math.round(cfg.whaleAmbientCount ?? 0));
		layoutKey = getWhaleAmbientLayoutKey(cfg, whaleCfg);
		geometry = buildWhaleAmbientGeometry(count, cfg, whaleCfg);
		points.geometry = geometry;
		return geometry;
	}

	function applyConfig(cfg = digitalWhaleConfig.ambient, whaleCfg = digitalWhaleConfig) {
		const nextKey = getWhaleAmbientLayoutKey(cfg, whaleCfg);
		if (nextKey !== layoutKey) {
			rebuild(cfg, whaleCfg);
		}
		applyWhaleAmbientUniforms(material, cfg, whaleCfg);
	}

	return {
		points,
		get geometry() {
			return geometry;
		},
		material,
		getCount: () => count,
		rebuild,
		update(elapsed, scrollPhase = 0) {
			material.uniforms.uTime.value = elapsed;
			material.uniforms.uScrollPhase.value = scrollPhase;
		},
		applyConfig,
	};
}

export function createAmbientEffects() {
	const deepOcean = createDeepOceanParticles();
	const whaleAmbient = createWhaleAmbientParticles();

	const disposables = [
		deepOcean.geometry,
		deepOcean.material,
		whaleAmbient.geometry,
		whaleAmbient.material,
	];

	function replaceDisposable(prev, next) {
		if (!prev || prev === next) {
			return;
		}
		const idx = disposables.indexOf(prev);
		if (idx >= 0) {
			disposables[idx] = next;
		}
	}

	return {
		deepOcean,
		whaleAmbient,
		get disposables() {
			return disposables;
		},
		applyConfig(config = digitalWhaleConfig) {
			const prevDeepGeo = deepOcean.geometry;
			const prevWhaleGeo = whaleAmbient.geometry;

			deepOcean.applyConfig(config.ambient, config);
			whaleAmbient.applyConfig(config.ambient, config);

			replaceDisposable(prevDeepGeo, deepOcean.geometry);
			replaceDisposable(prevWhaleGeo, whaleAmbient.geometry);
		},
		update(delta, elapsed, config = digitalWhaleConfig, scrollPhases = {}) {
			deepOcean.update(elapsed, scrollPhases.deep ?? 0);
			whaleAmbient.update(elapsed, scrollPhases.whale ?? 0);
		},
	};
}
