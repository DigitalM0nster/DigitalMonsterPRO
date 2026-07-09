import * as THREE from "three";

import { whaleWakeFragmentShader, whaleWakeVertexShader } from "../shaders/digitalWhaleShaders.js";
import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import { getGraphicsTier } from "@/utils/getGraphicsTier.js";

const WAKE_TIER_MUL = {
	// C2: −25% шлейфа на high (count в конфиге — эталон для dev).
	high: 0.75,
	medium: 0.55,
	low: 0.28,
};

const _wakePos = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _awayWorld = new THREE.Vector3();
const _awayLocal = new THREE.Vector3();
const _manualDriftDir = new THREE.Vector3();
const _driftDir = new THREE.Vector3();
const _invWhaleMatrix = new THREE.Matrix4();

function smoothstep01(t) {
	const x = THREE.MathUtils.clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

/** Fallback для hologram-режима без edge-партиклов. */
function resolveBodyAxisFromRoot(whaleRoot) {
	const box = new THREE.Box3().setFromObject(whaleRoot);
	const size = new THREE.Vector3();
	const center = new THREE.Vector3();
	box.getSize(size);
	box.getCenter(center);

	let axis = "x";
	if (size.y > size.x && size.y > size.z) {
		axis = "y";
	} else if (size.z > size.x && size.z > size.y) {
		axis = "z";
	}

	const head = axis === "x" ? box.min.x : axis === "y" ? box.min.y : box.min.z;
	const tail = axis === "x" ? box.max.x : axis === "y" ? box.max.y : box.max.z;

	return {
		mode: "bbox",
		axis,
		head,
		tail,
		bodyLength: Math.max(Math.abs(tail - head), 1e-3),
		center,
		spanA: axis === "x" ? size.y : size.x,
		spanB: axis === "z" ? size.y : size.z,
	};
}

/** Ось тела из живых позиций партиклов кита (локальные координаты whale.root). */
function resolveBodyFromParticlePositions(positions, count) {
	let minX = Infinity;
	let maxX = -Infinity;

	for (let i = 0; i < count; i++) {
		const x = positions[i * 3];
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
	}

	// FBX: голова у min X, хвост у max X — шлейф течёт к +X.
	return {
		mode: "particles",
		positions,
		count,
		headX: minX,
		tailX: maxX,
		bodyLength: Math.max(maxX - minX, 1e-3),
	};
}

/** 0 у головы, 1 у хвоста. */
function bodyTFromX(body, x) {
	return (x - body.headX) / body.bodyLength;
}

function pickAnchorIndex(body, cfg) {
	const spawnMin = cfg.spawnMinT ?? 0.32;
	const spawnMax = cfg.spawnMaxT ?? 0.88;

	for (let attempt = 0; attempt < 20; attempt++) {
		const index = Math.floor(Math.random() * body.count);
		const t = bodyTFromX(body, body.positions[index * 3]);
		if (t >= spawnMin && t <= spawnMax) {
			return index;
		}
	}

	return Math.floor(Math.random() * body.count);
}

function resetWakeParticle(state, index, body, cfg) {
	state.drift[index] = 0;
	state.sizes[index] = 0.65 + Math.random() * 0.85;
	state.speedJitter[index] = 0.75 + Math.random() * 0.5;
	state.phases[index] = Math.random() * Math.PI * 2;
	state.spawnBodyT[index] = 0.5;

	if (body.mode === "particles") {
		state.anchorIndex[index] = pickAnchorIndex(body, cfg);
		const anchorIndex = state.anchorIndex[index];
		state.spawnBodyT[index] = bodyTFromX(body, body.positions[anchorIndex * 3]);
		state.offsetA[index] = 0;
		state.offsetB[index] = 0;
		return;
	}

	const spawnMin = cfg.spawnMinT ?? 0.32;
	const spawnMax = cfg.spawnMaxT ?? 0.88;
	const spread = cfg.spread ?? 0.72;
	state.normT[index] = spawnMin + Math.random() * (spawnMax - spawnMin);
	state.spawnBodyT[index] = state.normT[index];
	state.offsetA[index] = (Math.random() - 0.5) * body.spanA * spread;
	state.offsetB[index] = (Math.random() - 0.5) * body.spanB * spread;
	state.anchorIndex[index] = -1;
}

function bboxPosition(body, normT, offsetA, offsetB, wander, phase, time, bodyLength, target) {
	const along = body.head + normT * body.bodyLength;
	const wobbleScale = wander * bodyLength * 0.012;
	const wobble =
		Math.sin(time * 1.35 + phase) * wobbleScale + Math.cos(time * 0.9 + phase * 1.4) * wobbleScale * 0.75;

	if (body.axis === "x") {
		return target.set(along + wobble * 0.12, body.center.y + offsetA, body.center.z + offsetB);
	}

	if (body.axis === "y") {
		return target.set(body.center.x + offsetA, along + wobble * 0.12, body.center.z + offsetB);
	}

	return target.set(body.center.x + offsetA, body.center.y + offsetB, along + wobble * 0.12);
}

function particleWakePosition(body, anchorIndex, drift, wander, phase, time, target) {
	const baseIndex = anchorIndex * 3;
	const px = body.positions[baseIndex];
	const py = body.positions[baseIndex + 1];
	const pz = body.positions[baseIndex + 2];

	const wobbleScale = wander * body.bodyLength * 0.012;
	const wobbleAlong = Math.sin(time * 1.1 + phase * 0.7) * wander * body.bodyLength * 0.006;
	const wobbleY = Math.sin(time * 1.35 + phase) * wobbleScale;
	const wobbleZ = Math.cos(time * 0.9 + phase * 1.4) * wobbleScale * 0.85;

	// Дрейф к хвосту (+X); глубина — отдельно, с учётом камеры.
	return target.set(px + drift + wobbleAlong, py + wobbleY, pz + wobbleZ);
}

/** Направление «от камеры» в локали whale.root. */
function resolveLocalAwayDir(localPos, whaleRoot, cameraPos, target) {
	whaleRoot.updateMatrixWorld(false);
	_invWhaleMatrix.copy(whaleRoot.matrixWorld).invert();

	_worldPos.copy(localPos).applyMatrix4(whaleRoot.matrixWorld);
	_awayWorld.subVectors(_worldPos, cameraPos);
	if (_awayWorld.lengthSq() < 1e-8) {
		return target.set(0, 0, 0);
	}
	_awayWorld.normalize();
	return target.copy(_awayWorld).transformDirection(_invWhaleMatrix);
}

/**
 * Ручной угол дрейфа в локали кита.
 * driftDepthAngle — в плоскости XZ: 0° = −Z, +90° = +X (к хвосту).
 * driftDepthAngleY — подъём/опускание.
 */
function resolveManualDriftDir(cfg, target) {
	const angleX = THREE.MathUtils.degToRad(cfg.driftDepthAngle ?? 0);
	const angleY = THREE.MathUtils.degToRad(cfg.driftDepthAngleY ?? 0);
	const cosY = Math.cos(angleY);

	target.set(Math.sin(angleX) * cosY, Math.sin(angleY), -Math.cos(angleX) * cosY);

	if (target.lengthSq() < 1e-8) {
		return target.set(0, 0, -1);
	}

	return target.normalize();
}

function resolveWakeDriftBlend(cfg) {
	if (cfg.driftCameraBlend !== undefined) {
		return THREE.MathUtils.clamp(cfg.driftCameraBlend, 0, 1);
	}
	return cfg.driftCameraAware ? 1 : 0;
}

/** Итоговое направление бокового/глубинного дрейфа (нормализованное). */
function resolveWakeDriftDir(localPos, cfg, whaleRoot, cameraPos, target) {
	resolveManualDriftDir(cfg, _manualDriftDir);
	const blend = resolveWakeDriftBlend(cfg);

	if (blend <= 1e-4 || !whaleRoot || !cameraPos) {
		return target.copy(_manualDriftDir);
	}

	resolveLocalAwayDir(localPos, whaleRoot, cameraPos, _awayLocal);
	if (_awayLocal.lengthSq() < 1e-8) {
		return target.copy(_manualDriftDir);
	}

	if (blend >= 1 - 1e-4) {
		return target.copy(_awayLocal);
	}

	return target.copy(_manualDriftDir).lerp(_awayLocal, blend).normalize();
}

/** Боковой дрейф шлейфа: сила × направление (угол настраивается в конфиге). */
function applyWakeDriftOffset(localPos, driftAmount, driftStrength, spawnBodyT, cfg, whaleRoot, cameraPos, target) {
	if (!driftStrength) {
		return target.copy(localPos);
	}

	const magnitude = driftAmount * Math.abs(driftStrength);
	const sign = driftStrength < 0 ? 1 : -1;
	const rearT = THREE.MathUtils.clamp((spawnBodyT - 0.35) / 0.65, 0, 1);
	const rearBoost = 1 + rearT * (cfg.rearDepthBias ?? 0.65);
	const offset = magnitude * sign * rearBoost;

	resolveWakeDriftDir(localPos, cfg, whaleRoot, cameraPos, _driftDir);
	if (_driftDir.lengthSq() < 1e-8) {
		return target.copy(localPos);
	}

	return target.set(
		localPos.x + _driftDir.x * offset,
		localPos.y + _driftDir.y * offset,
		localPos.z + _driftDir.z * offset,
	);
}

function initWakeState(count, body, cfg) {
	const state = {
		count,
		anchorIndex: new Int32Array(count),
		drift: new Float32Array(count),
		normT: new Float32Array(count),
		offsetA: new Float32Array(count),
		offsetB: new Float32Array(count),
		sizes: new Float32Array(count),
		speedJitter: new Float32Array(count),
		phases: new Float32Array(count),
		spawnBodyT: new Float32Array(count),
		life: new Float32Array(count),
		positions: new Float32Array(count * 3),
	};

	for (let i = 0; i < count; i++) {
		resetWakeParticle(state, i, body, cfg);
	}

	return state;
}

function buildWakeGeometry(state) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(state.positions, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(state.sizes, 1));
	geometry.setAttribute("aLife", new THREE.BufferAttribute(state.life, 1));
	return geometry;
}

function resolveWakeCount(cfg, tier = getGraphicsTier()) {
	const mul = WAKE_TIER_MUL[tier] ?? WAKE_TIER_MUL.medium;
	return Math.max(0, Math.round((cfg.count ?? 96) * mul));
}

function resolveBody(getBodySamples, whaleRoot) {
	const samples = getBodySamples?.();
	if (samples?.positions && samples.count > 0) {
		return resolveBodyFromParticlePositions(samples.positions, samples.count);
	}

	if (samples?.whaleRoot || whaleRoot) {
		return resolveBodyAxisFromRoot(samples?.whaleRoot ?? whaleRoot);
	}

	return null;
}

/**
 * Шлейф из позиций edge-партиклов кита: спавн на теле, дрейф к хвосту (+X).
 * @param {{ config?: object, getBodySamples?: () => object, whaleRoot?: THREE.Object3D, getCameraWorldPosition?: () => THREE.Vector3 }} options
 */
export function createWhaleWake(options = {}) {
	const whaleRoot = options.whaleRoot ?? null;
	const getBodySamples = options.getBodySamples ?? null;
	const getCameraWorldPosition = options.getCameraWorldPosition ?? null;
	let cfg = { ...(options.config ?? digitalWhaleConfig.whale?.wake) };

	let body = resolveBody(getBodySamples, whaleRoot) ?? resolveBodyAxisFromRoot(whaleRoot);
	let count = resolveWakeCount(cfg);
	let state = initWakeState(count, body, cfg);
	let geometry = buildWakeGeometry(state);

	const material = new THREE.ShaderMaterial({
		fog: false,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: {
			uColor: { value: new THREE.Color(cfg.color ?? "#38d4ff") },
			uPointScale: { value: cfg.pointScale ?? 3.2 },
			uAlphaMult: { value: cfg.alpha ?? 0.38 },
		},
		vertexShader: whaleWakeVertexShader,
		fragmentShader: whaleWakeFragmentShader,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 2;
	points.frustumCulled = false;

	function rebuild(nextCfg = cfg) {
		cfg = { ...nextCfg };
		geometry.dispose();
		count = resolveWakeCount(cfg);
		body = resolveBody(getBodySamples, whaleRoot) ?? body;
		state = initWakeState(count, body, cfg);
		geometry = buildWakeGeometry(state);
		points.geometry = geometry;
		applyConfig(cfg);
		return geometry;
	}

	function applyConfig(nextCfg = cfg) {
		cfg = { ...nextCfg };
		const nextCount = resolveWakeCount(cfg);

		if (nextCount !== count) {
			rebuild(cfg);
			return;
		}

		material.uniforms.uColor.value.set(cfg.color ?? "#38d4ff");
		material.uniforms.uPointScale.value = cfg.pointScale ?? 3.2;
		material.uniforms.uAlphaMult.value = cfg.alpha ?? 0.38;
	}

	function update(delta, elapsed) {
		if (count === 0) {
			return;
		}

		const nextBody = resolveBody(getBodySamples, whaleRoot);
		if (nextBody) {
			body = nextBody;
		}

		const speed = cfg.speed ?? 0.42;
		const tailFadeT = cfg.tailFadeT ?? 0.18;
		const wander = cfg.wanderAmp ?? 3.5;
		const driftStrength = cfg.driftZRatio ?? -0.65;
		const spawnMin = cfg.spawnMinT ?? 0.32;
		const cameraPos = getCameraWorldPosition?.() ?? null;
		const positionAttr = geometry.attributes.position;
		const lifeAttr = geometry.attributes.aLife;

		for (let i = 0; i < count; i++) {
			state.drift[i] += speed * state.speedJitter[i] * delta * body.bodyLength;

			let pos;
			let bodyT;
			const maxDrift = body.bodyLength * 0.55;

			if (body.mode === "particles") {
				const anchorIndex = state.anchorIndex[i];
				pos = particleWakePosition(body, anchorIndex, state.drift[i], wander, state.phases[i], elapsed, _wakePos);
				pos = applyWakeDriftOffset(
					pos,
					state.drift[i],
					driftStrength,
					state.spawnBodyT[i],
					cfg,
					whaleRoot,
					cameraPos,
					_wakePos,
				);
				bodyT = bodyTFromX(body, pos.x);

				if (bodyT >= 1 - tailFadeT || state.drift[i] >= maxDrift) {
					resetWakeParticle(state, i, body, cfg);
					pos = particleWakePosition(
						body,
						state.anchorIndex[i],
						0,
						wander,
						state.phases[i],
						elapsed,
						_wakePos,
					);
					pos = applyWakeDriftOffset(pos, 0, driftStrength, state.spawnBodyT[i], cfg, whaleRoot, cameraPos, _wakePos);
					bodyT = bodyTFromX(body, pos.x);
				}
			} else {
				state.normT[i] += speed * state.speedJitter[i] * delta;
				if (state.normT[i] >= 0.98) {
					resetWakeParticle(state, i, body, cfg);
				}

				pos = bboxPosition(
					body,
					state.normT[i],
					state.offsetA[i],
					state.offsetB[i],
					wander,
					state.phases[i],
					elapsed,
					body.bodyLength,
					_wakePos,
				);
				const traveled = Math.max(0, state.normT[i] - spawnMin) * body.bodyLength;
				pos = applyWakeDriftOffset(
					pos,
					traveled,
					driftStrength,
					state.spawnBodyT[i],
					cfg,
					whaleRoot,
					cameraPos,
					_wakePos,
				);
				bodyT = state.normT[i];
			}

			const distToTail = 1 - bodyT;
			const tailFade = smoothstep01(distToTail / Math.max(tailFadeT, 0.001));
			const bodyGlow = smoothstep01((bodyT - spawnMin) / 0.22);
			state.life[i] = tailFade * (0.35 + bodyGlow * 0.65);

			const index = i * 3;
			state.positions[index] = pos.x;
			state.positions[index + 1] = pos.y;
			state.positions[index + 2] = pos.z;
		}

		positionAttr.needsUpdate = true;
		lifeAttr.needsUpdate = true;
	}

	function dispose() {
		geometry.dispose();
		material.dispose();
	}

	return {
		points,
		get geometry() {
			return geometry;
		},
		material,
		applyConfig,
		update,
		dispose,
		getCount: () => count,
	};
}
