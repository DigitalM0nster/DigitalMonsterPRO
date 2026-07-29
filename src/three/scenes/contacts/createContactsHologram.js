import * as THREE from "three";
import { CONTACTS_HOLOGRAM } from "./contactsSceneConfig.js";
import contactsHologramPointsVertex from "../../shaders/contacts/contactsHologramPointsVertex.glsl.js";
import contactsHologramPointsFragment from "../../shaders/contacts/contactsHologramPointsFragment.glsl.js";

function hash01(seed) {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

function petalProfile(t, tipSharpness) {
	const tip = Math.max(0.6, tipSharpness);
	const base = Math.pow(Math.sin(Math.max(0, Math.min(1, t)) * Math.PI), 0.55);
	const taper = Math.pow(Math.max(0.001, 1 - t), tip);
	const tipZone = Math.max(0, Math.min(1, (t - 0.45) / 0.55));
	const tipZoneS = tipZone * tipZone * (3 - 2 * tipZone);
	return base * (1 - tipZoneS) + base * taper * tipZoneS * (1.2 + tip * 0.15);
}

function sampleLateral(i, isSpark) {
	const u = hash01(i * 3.9 + 0.4);
	const sign = u < 0.5 ? -1 : 1;
	const edge = Math.max(0.02, Math.min(1, Math.pow(hash01(i * 8.8 + 1.2), isSpark ? 0.22 : 0.38)));
	return { sign, edge };
}

/** Flower-arm sample — only production shape. */
function sampleFlowerPoint(i, isSpark, params) {
	const {
		petalCount,
		radius,
		twist,
		armWidth,
		coreHole,
		dish,
		densityPower,
		tipSharpness,
	} = params;

	const petals = Math.max(1, Math.round(petalCount));
	const rMax = Math.max(0.4, radius);
	const hole = Math.max(0.02, Math.min(0.85, coreHole));
	const power = Math.max(0.2, Math.min(2.5, densityPower));
	const tip = Math.max(0.6, tipSharpness);
	const lateral = sampleLateral(i, isSpark);

	let arm = Math.floor(hash01(i * 2.17) * petals) % petals;
	if (isSpark) arm = i % petals;
	const t = hole + hash01(i * 1.7 + 2.2) ** power * (1 - hole);
	const profile = petalProfile(t, tip);
	const half = Math.max(0.001, armWidth * Math.max(0.02, profile));
	const w = lateral.sign * half * lateral.edge;
	const edge = Math.abs(w) / half;
	const ang = (arm / petals) * Math.PI * 2 + t * twist * Math.PI * 2;
	const r = rMax * t;
	const nx = -Math.sin(ang);
	const ny = Math.cos(ang);
	const x = Math.cos(ang) * r + nx * w * rMax;
	const y = Math.sin(ang) * r + ny * w * rMax;
	const z =
		(1 - t) * -dish +
		profile * dish * 0.45 * (1 - edge) +
		(hash01(i + 4.4) - 0.5) * dish * 0.28;

	return {
		x,
		y,
		z,
		ang,
		rNorm: t,
		seed: hash01(arm * 17.3 + t * 91.1 + w * 13.7),
		size: (isSpark ? 0.48 : 0.2) + edge * 0.42 + hash01(i * 6.6) * 0.12,
		colorMix: ((arm / petals) * 0.7 + edge * 0.35 + hash01(i * 5.1) * 0.25) % 1,
		edge,
	};
}

function buildParticleBuffers(cfg) {
	const params = {
		petalCount: cfg.petalCount,
		radius: cfg.radius,
		twist: cfg.twist,
		armWidth: Math.max(0.02, cfg.armWidth),
		coreHole: cfg.coreHole,
		dish: cfg.dish,
		densityPower: cfg.densityPower,
		tipSharpness: cfg.tipSharpness,
	};
	const dustCount = Math.max(400, Math.round(cfg.dustCount));
	const sparkCount = Math.max(0, Math.round(cfg.sparkCount));
	const total = dustCount + sparkCount;

	const pos = new Float32Array(total * 3);
	const seed = new Float32Array(total);
	const radiusAttr = new Float32Array(total);
	const angle = new Float32Array(total);
	const size = new Float32Array(total);
	const colorMix = new Float32Array(total);
	const edgeAttr = new Float32Array(total);

	for (let i = 0; i < dustCount; i += 1) {
		const p = sampleFlowerPoint(i, false, params);
		const jitter =
			(hash01(i + 9.1) - 0.5) * 0.03 * params.radius * (1 - p.edge * 0.9);
		pos[i * 3] = p.x + jitter;
		pos[i * 3 + 1] = p.y + jitter * 0.75;
		pos[i * 3 + 2] = p.z;
		seed[i] = p.seed;
		radiusAttr[i] = p.rNorm;
		angle[i] = p.ang;
		size[i] = p.size;
		colorMix[i] = p.colorMix;
		edgeAttr[i] = p.edge;
	}
	for (let i = 0; i < sparkCount; i += 1) {
		const idx = dustCount + i;
		const p = sampleFlowerPoint(i + 10007, true, params);
		pos[idx * 3] = p.x;
		pos[idx * 3 + 1] = p.y;
		pos[idx * 3 + 2] = p.z;
		seed[idx] = p.seed;
		radiusAttr[idx] = p.rNorm;
		angle[idx] = p.ang;
		size[idx] = p.size;
		colorMix[idx] = p.colorMix;
		edgeAttr[idx] = p.edge;
	}

	return {
		pos,
		seed,
		radiusAttr,
		angle,
		size,
		colorMix,
		edgeAttr,
		petalCount: Math.max(1, Math.round(params.petalCount)),
	};
}

/** Compact soft-disk sprite — no Canvas2D. */
function createSoftGlowTexture() {
	const size = 32;
	const data = new Uint8Array(size * size * 4);
	const half = (size - 1) * 0.5;
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const dx = (x - half) / half;
			const dy = (y - half) / half;
			const d = Math.sqrt(dx * dx + dy * dy);
			const a = Math.max(0, 1 - d);
			const a4 = a * a * a * a;
			const i = (y * size + x) * 4;
			data[i] = 255;
			data[i + 1] = 250;
			data[i + 2] = 255;
			data[i + 3] = Math.round(a4 * 255);
		}
	}
	const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
	texture.needsUpdate = true;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.generateMipmaps = false;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	return texture;
}

function applyBuffersToGeometry(geometry, buffers) {
	geometry.setAttribute("position", new THREE.BufferAttribute(buffers.pos, 3));
	geometry.setAttribute("aSeed", new THREE.BufferAttribute(buffers.seed, 1));
	geometry.setAttribute("aRadius", new THREE.BufferAttribute(buffers.radiusAttr, 1));
	geometry.setAttribute("aAngle", new THREE.BufferAttribute(buffers.angle, 1));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(buffers.size, 1));
	geometry.setAttribute("aColorMix", new THREE.BufferAttribute(buffers.colorMix, 1));
	geometry.setAttribute("aEdge", new THREE.BufferAttribute(buffers.edgeAttr, 1));
	geometry.computeBoundingSphere();
}

/**
 * Particle-only flower hologram. Built once under the preloader curtain.
 * DEV: applyLook is free; rebuildShape rebuilds buffers only on demand.
 */
export function createContactsHologram(cfg = CONTACTS_HOLOGRAM) {
	const root = new THREE.Group();
	root.name = "ContactsHologram";

	const pixelRatio =
		typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

	const map = createSoftGlowTexture();
	const uniforms = {
		uTime: { value: 0 },
		uDistort: { value: cfg.distort },
		uBreath: { value: cfg.breath },
		uWaveSpeed: { value: cfg.waveSpeed },
		uPetalCount: { value: Math.max(1, Math.round(cfg.petalCount)) },
		uColorA: { value: new THREE.Color(cfg.colorA) },
		uColorB: { value: new THREE.Color(cfg.colorB) },
		uOpacity: { value: cfg.pointOpacity },
		uGlowBoost: { value: cfg.glowBoost },
		uPointSize: { value: cfg.pointSize },
		uPixelRatio: { value: pixelRatio },
		uMap: { value: map },
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: contactsHologramPointsVertex,
		fragmentShader: contactsHologramPointsFragment,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
	});

	const geometry = new THREE.BufferGeometry();
	const buffers = buildParticleBuffers(cfg);
	applyBuffersToGeometry(geometry, buffers);
	uniforms.uPetalCount.value = buffers.petalCount;

	const points = new THREE.Points(geometry, material);
	points.name = "ContactsHologramDust";
	points.frustumCulled = true;
	points.renderOrder = 2;
	root.add(points);

	return {
		root,
		/**
		 * Shader / look uniforms only — no buffer rebuild (safe every frame / slider tick).
		 * @param {typeof CONTACTS_HOLOGRAM} next
		 */
		applyLook(next = cfg) {
			uniforms.uDistort.value = next.distort;
			uniforms.uBreath.value = next.breath;
			uniforms.uWaveSpeed.value = next.waveSpeed;
			uniforms.uOpacity.value = next.pointOpacity;
			uniforms.uGlowBoost.value = next.glowBoost;
			uniforms.uPointSize.value = next.pointSize;
			uniforms.uColorA.value.set(next.colorA);
			uniforms.uColorB.value.set(next.colorB);
			// Petal count in shader is motion phase — keep in sync without rebuild when possible.
			uniforms.uPetalCount.value = Math.max(1, Math.round(next.petalCount));
		},
		/**
		 * Rebuild CPU particle buffers. Call only from DEV “Rebuild shape” — not on slider drag.
		 * @param {typeof CONTACTS_HOLOGRAM} next
		 */
		rebuildShape(next = cfg) {
			const nextBuffers = buildParticleBuffers(next);
			applyBuffersToGeometry(geometry, nextBuffers);
			uniforms.uPetalCount.value = nextBuffers.petalCount;
			this.applyLook(next);
		},
		update(elapsed) {
			uniforms.uTime.value = elapsed;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
			map.dispose();
		},
	};
}
