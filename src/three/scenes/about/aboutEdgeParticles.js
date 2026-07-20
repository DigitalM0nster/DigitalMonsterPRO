import * as THREE from "three";
import { ABOUT_MATERIALS, ABOUT_PARTICLES } from "./aboutSceneConfig.js";
import { ABOUT_EDGE_DISSOLVE_GLSL } from "./aboutEdgeParticleDissolve.js";

function createSoftGlowTexture() {
	const size = 64;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(0.3, "rgba(180,230,255,0.9)");
	gradient.addColorStop(0.65, "rgba(0,160,255,0.35)");
	gradient.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

function hash01(seed) {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

/**
 * Closed outer XZ silhouette from the host mesh.
 * Uses farthest-radius samples per angle so frames with a hole (InsideLarge)
 * and thin edge strips (EdgeForParticles) both yield the outer rim.
 * @returns {{ loop: { x: number, z: number }[], centerX: number, centerZ: number, y0: number, y1: number } | null}
 */
function extractSilhouetteLoop(geometry) {
	const pos = geometry.getAttribute("position");
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

	const ySpan = yMax - yMin;
	if (ySpan < 1e-6) return null;

	const bins = 160;
	/** @type {({ x: number, z: number, r: number } | null)[]} */
	const best = new Array(bins).fill(null);
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const dx = x - cx;
		const dz = z - cz;
		const r = Math.hypot(dx, dz);
		if (r < 1e-5) continue;
		const ang = Math.atan2(dz, dx);
		const bin = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * bins) % bins;
		const prev = best[bin];
		if (!prev || r > prev.r) best[bin] = { x, z, r };
	}

	const loop = [];
	for (let b = 0; b < bins; b += 1) {
		if (best[b]) loop.push({ x: best[b].x, z: best[b].z });
	}
	if (loop.length < 8) return null;

	const yPad = ySpan * 0.08;
	return { loop, centerX: cx, centerZ: cz, y0: yMin + yPad, y1: yMax - yPad };
}

/** Even arc-length resample of a closed XZ loop. */
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
	if (total < 1e-6) return loop.slice();

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

/**
 * Neon lattice (rings × spokes × Y) — same look as before, but the outer profile
 * is the real `EdgeForParticles` silhouette scaled inward for inner rings.
 */
export function createAboutEdgeParticles(mesh, cfg = ABOUT_MATERIALS.edgeParticles) {
	if (!mesh?.geometry) {
		return { update() {}, dispose() {}, materials: [] };
	}

	const color = new THREE.Color(cfg.color ?? "#00b3ff");
	const pointSize = cfg.pointSize ?? 0.05;
	const maxPointSizePx = cfg.maxPointSizePx ?? 16;
	const lineIntensity = cfg.lineIntensity ?? 1.1;
	const nodeIntensity = cfg.nodeIntensity ?? 2.6;
	const travelSpeed = cfg.travelSpeed ?? 1.15;
	const pulseSpeed = cfg.pulseSpeed ?? 2.4;
	const opacity = cfg.opacity ?? 1;

	const frame = ABOUT_PARTICLES;
	const rings = Math.max(2, Math.round(cfg.rings ?? 4));
	const spokes = Math.max(8, Math.round(cfg.spokes ?? 36));
	const yLayers = Math.max(1, Math.round(cfg.yLayers ?? 3));
	const loopSegments = Math.max(spokes, Math.round(cfg.loopSegments ?? 64));
	const travelers = Math.max(8, Math.round(cfg.travelers ?? 64));
	/** Innermost ring as fraction of the real silhouette (same ratio as old inner/outer half). */
	const innerScale = THREE.MathUtils.clamp(
		cfg.innerScale ??
			(cfg.innerHalf != null && cfg.outerHalf != null
				? cfg.innerHalf / Math.max(cfg.outerHalf, 1e-4)
				: (frame.innerHalf ?? 0.44) / Math.max(frame.outerHalf ?? 0.94, 1e-4)),
		0.15,
		0.92,
	);

	const silhouette = extractSilhouetteLoop(mesh.geometry);
	if (!silhouette) {
		return { update() {}, dispose() {}, materials: [] };
	}

	const { centerX, centerZ, y0, y1 } = silhouette;
	const profile = resampleClosedLoop(silhouette.loop, loopSegments);

	mesh.userData.sharesGeometry = true;
	if (mesh.name === "EdgeForParticles" && mesh.material) {
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const mat of mats) {
			if (!mat) continue;
			mat.visible = false;
			mat.colorWrite = false;
			mat.depthWrite = false;
		}
	}

	/** @type {{ a: THREE.Vector3, b: THREE.Vector3, seed: number }[]} */
	const segments = [];
	const nodeMap = new Map();
	const tmpA = new THREE.Vector3();
	const tmpB = new THREE.Vector3();

	const markNode = (x, y, z) => {
		const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
		if (!nodeMap.has(key)) nodeMap.set(key, { x, y, z, seed: hash01(x * 11.3 + y * 5.7 + z * 8.1) });
	};

	const pushSeg = (ax, ay, az, bx, by, bz, seed) => {
		segments.push({
			a: new THREE.Vector3(ax, ay, az),
			b: new THREE.Vector3(bx, by, bz),
			seed,
		});
		markNode(ax, ay, az);
		markNode(bx, by, bz);
	};

	/** ring 0 = inner, last = real EdgeForParticles silhouette. */
	const ringScale = (ringIndex) => {
		const u = rings <= 1 ? 1 : ringIndex / (rings - 1);
		return THREE.MathUtils.lerp(innerScale, 1, u);
	};

	const layerY = (layerIndex) => {
		if (yLayers <= 1) return (y0 + y1) * 0.5;
		const u = layerIndex / (yLayers - 1);
		return THREE.MathUtils.lerp(y0, y1, u);
	};

	/** Sample silhouette at t∈[0,1), scaled toward center. */
	const at = (scale, t) => {
		const n = profile.length;
		const u = (((t % 1) + 1) % 1) * n;
		const i0 = Math.floor(u) % n;
		const i1 = (i0 + 1) % n;
		const f = u - Math.floor(u);
		const x = profile[i0].x + (profile[i1].x - profile[i0].x) * f;
		const z = profile[i0].z + (profile[i1].z - profile[i0].z) * f;
		return {
			x: centerX + (x - centerX) * scale,
			z: centerZ + (z - centerZ) * scale,
		};
	};

	/**
	 * Rings = arcs along the real silhouette (XZ mesh form).
	 * Microchip detail = pure depth jogs on local Y (→ world Z after Rx stand-up).
	 * Do not jog local Z — that reads as screen Y.
	 */
	/**
	 * Dashed silhouette crumbs only — no continuous clear outline rings.
	 * Depth jogs stay as short pure-Y stubs.
	 */
	const depthJog = Math.max(0.045, (y1 - y0) * 0.45);
	for (let layer = 0; layer < yLayers; layer += 1) {
		const y = layerY(layer);
		for (let ring = 0; ring < rings; ring += 1) {
			const scale = ringScale(ring);
			const isOuter = ring === rings - 1;
			for (let i = 0; i < loopSegments; i += 1) {
				const seed = hash01(ring * 13.1 + layer * 3.7 + i);
				/** ~40% keep — denser outer crumbs, still broken (no clear outline). */
				if (seed > 0.4) continue;
				if (hash01(seed + 0.09) > 0.5 && hash01(ring * 13.1 + layer * 3.7 + (i - 1)) <= 0.4) {
					continue;
				}
				const t0 = i / loopSegments;
				const t1 = (i + 1) / loopSegments;
				const p0 = at(scale, t0);
				const p1 = at(scale, t1);
				pushSeg(p0.x, y, p0.z, p1.x, y, p1.z, seed);
				if (isOuter && hash01(seed + 2.2) > 0.45) {
					const dir = hash01(seed + 3.3) > 0.5 ? 1 : -1;
					const amt = depthJog * (0.55 + hash01(seed + 3.8) * 0.45);
					const y1j = THREE.MathUtils.clamp(y + amt * dir, y0, y1);
					pushSeg(p0.x, y, p0.z, p0.x, y1j, p0.z, seed + 0.33);
					markNode(p0.x, y1j, p0.z);
				}
			}
		}
	}

	/** Sparse radial buses — not solid spokes. */
	for (let layer = 0; layer < yLayers; layer += 1) {
		const y = layerY(layer);
		for (let s = 0; s < spokes; s += 1) {
			if (hash01(s * 2.7 + layer) > 0.45) continue;
			const t = s / spokes;
			for (let ring = 0; ring < rings - 1; ring += 1) {
				if (hash01(s * 9.2 + ring * 2.4 + layer) > 0.5) continue;
				const p0 = at(ringScale(ring), t);
				const p1 = at(ringScale(ring + 1), t);
				pushSeg(p0.x, y, p0.z, p1.x, y, p1.z, hash01(s * 9.2 + ring * 2.4 + layer));
			}
		}
	}

	/** Sparse pure-Y posts. */
	if (yLayers > 1) {
		for (let s = 0; s < spokes; s += 1) {
			const t = s / spokes;
			for (let ring = 0; ring < rings; ring += 1) {
				if (hash01(s * 3.1 + ring) > 0.55) continue;
				const p = at(ringScale(ring), t);
				for (let layer = 0; layer < yLayers - 1; layer += 1) {
					pushSeg(
						p.x,
						layerY(layer),
						p.z,
						p.x,
						layerY(layer + 1),
						p.z,
						hash01(s * 4.4 + ring * 7.1 + layer * 1.9),
					);
				}
			}
		}
	}

	const segmentCount = segments.length;
	const linePositions = new Float32Array(segmentCount * 2 * 3);
	const lineAlong = new Float32Array(segmentCount * 2);
	const lineSeed = new Float32Array(segmentCount * 2);
	for (let s = 0; s < segmentCount; s += 1) {
		const { a, b, seed } = segments[s];
		const o = s * 6;
		linePositions[o] = a.x;
		linePositions[o + 1] = a.y;
		linePositions[o + 2] = a.z;
		linePositions[o + 3] = b.x;
		linePositions[o + 4] = b.y;
		linePositions[o + 5] = b.z;
		lineAlong[s * 2] = 0;
		lineAlong[s * 2 + 1] = 1;
		lineSeed[s * 2] = seed;
		lineSeed[s * 2 + 1] = seed;
	}

	const nodes = [...nodeMap.values()];
	const nodeCount = nodes.length;
	const travelerCount = travelers;
	const pointCount = nodeCount + travelerCount;

	const pointPositions = new Float32Array(pointCount * 3);
	const pointSeed = new Float32Array(pointCount);
	const pointWeight = new Float32Array(pointCount);
	const pointAlong = new Float32Array(pointCount);
	const pointSegSeed = new Float32Array(pointCount);

	for (let i = 0; i < nodeCount; i += 1) {
		const n = nodes[i];
		pointPositions[i * 3] = n.x;
		pointPositions[i * 3 + 1] = n.y;
		pointPositions[i * 3 + 2] = n.z;
		pointSeed[i] = n.seed;
		pointWeight[i] = 1.35;
		pointAlong[i] = 0;
		pointSegSeed[i] = n.seed;
	}

	/** Travelers: move along random grid segments each frame. */
	const travelerState = new Array(travelerCount);
	for (let i = 0; i < travelerCount; i += 1) {
		const segIndex = Math.floor(hash01(i * 17.3 + 2.1) * segmentCount) % segmentCount;
		const seg = segments[segIndex];
		const along = hash01(i * 5.9);
		const speed = 0.9 + hash01(i * 3.3) * 1.4;
		const dir = hash01(i * 8.1) > 0.5 ? 1 : -1;
		travelerState[i] = { segIndex, along, speed, dir };
		const pi = nodeCount + i;
		tmpA.lerpVectors(seg.a, seg.b, along);
		pointPositions[pi * 3] = tmpA.x;
		pointPositions[pi * 3 + 1] = tmpA.y;
		pointPositions[pi * 3 + 2] = tmpA.z;
		pointSeed[pi] = hash01(i * 2.7);
		pointWeight[pi] = 2.2;
		pointAlong[pi] = along;
		pointSegSeed[pi] = seg.seed;
	}

	const lineGeo = new THREE.BufferGeometry();
	lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
	lineGeo.setAttribute("aAlong", new THREE.BufferAttribute(lineAlong, 1));
	lineGeo.setAttribute("aSeed", new THREE.BufferAttribute(lineSeed, 1));

	const lineUniforms = {
		uColor: { value: color.clone() },
		uTime: { value: 0 },
		uIntensity: { value: lineIntensity },
		uTravelSpeed: { value: travelSpeed },
		uOpacity: { value: opacity * 0.75 },
		uDissolve: { value: 0 },
		uDissolveMode: { value: Number(cfg.dissolveMode ?? 5) },
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
			attribute float aSeed;
			varying float vAlong;
			varying float vSeed;
			void main() {
				vAlong = aAlong;
				vSeed = aSeed;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uTime;
			uniform float uIntensity;
			uniform float uTravelSpeed;
			uniform float uOpacity;
			varying float vAlong;
			varying float vSeed;

			${ABOUT_EDGE_DISSOLVE_GLSL}

			void main() {
				vec2 dissolve = edgeDissolveSample(vSeed, vAlong, uTime);
				if (dissolve.x < 0.02) discard;
				float pulse = fract(vAlong * 0.9 - uTime * uTravelSpeed + vSeed);
				float runner = 1.0 - smoothstep(0.0, 0.2, abs(pulse - 0.5) * 2.0);
				float base = 0.18 + runner * 0.95;
				float alpha = base * uIntensity * uOpacity * dissolve.x;
				if (alpha < 0.01) discard;
				vec3 col = uColor * (0.5 + runner * 1.35);
				col += uColor * dissolve.y * 1.8;
				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	const lines = new THREE.LineSegments(lineGeo, lineMat);
	lines.name = "AboutEdgeParticleLines";
	lines.frustumCulled = false;
	lines.renderOrder = 5;
	mesh.add(lines);

	const pointGeo = new THREE.BufferGeometry();
	pointGeo.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));
	pointGeo.setAttribute("aSeed", new THREE.BufferAttribute(pointSeed, 1));
	pointGeo.setAttribute("aWeight", new THREE.BufferAttribute(pointWeight, 1));
	pointGeo.setAttribute("aAlong", new THREE.BufferAttribute(pointAlong, 1));
	pointGeo.setAttribute("aSegSeed", new THREE.BufferAttribute(pointSegSeed, 1));

	const glowMap = createSoftGlowTexture();
	const pointUniforms = {
		uColor: { value: color.clone() },
		uTime: { value: 0 },
		uSize: { value: pointSize },
		uNodeIntensity: { value: nodeIntensity },
		uTravelSpeed: { value: travelSpeed },
		uPulseSpeed: { value: pulseSpeed },
		uOpacity: { value: opacity },
		uMap: { value: glowMap },
		uMaxPointSize: { value: maxPointSizePx },
		uDissolve: { value: 0 },
		uDissolveMode: { value: Number(cfg.dissolveMode ?? 5) },
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
			attribute float aAlong;
			attribute float aSegSeed;
			uniform float uTime;
			uniform float uSize;
			uniform float uPulseSpeed;
			uniform float uNodeIntensity;
			uniform float uMaxPointSize;
			uniform float uDissolve;
			uniform float uDissolveMode;
			varying float vGlow;
			varying float vSeed;
			varying float vAlong;

			void main() {
				vSeed = aSeed;
				vAlong = aAlong;
				float flicker = 0.55 + 0.45 * sin(uTime * uPulseSpeed + aSeed * 6.2831);
				flicker *= 0.75 + 0.25 * sin(uTime * (uPulseSpeed * 1.6) + aSeed * 3.7);
				vGlow = aWeight * flicker * uNodeIntensity;

				float mode = floor(uDissolveMode + 0.5);
				float d = clamp(uDissolve, 0.0, 1.0);
				/** Spark / glitch: inflate then snuff point size. */
				float sizeMul = 1.0;
				if (mode > 2.5 && mode < 3.5) {
					sizeMul = mix(1.0, 2.4, smoothstep(0.0, 0.4, d)) * (1.0 - smoothstep(0.45, 1.0, d));
				} else if (mode > 4.5) {
					sizeMul = mix(1.0, 1.7, d * fract(sin(aSeed * 40.0) * 7.0));
				}

				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_Position = projectionMatrix * mv;
				float atten = uSize * sizeMul * (300.0 / max(-mv.z, 0.1));
				float wScale = aWeight > 1.8 ? 1.55 : (0.75 + aWeight * 0.6);
				gl_PointSize = min(atten * wScale, uMaxPointSize * (aWeight > 1.8 ? 1.25 : 1.0) * sizeMul);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uOpacity;
			uniform float uTime;
			uniform sampler2D uMap;
			varying float vGlow;
			varying float vSeed;
			varying float vAlong;

			${ABOUT_EDGE_DISSOLVE_GLSL}

			void main() {
				vec2 dissolve = edgeDissolveSample(vSeed, vAlong, uTime);
				if (dissolve.x < 0.02) discard;
				vec4 tex = texture2D(uMap, gl_PointCoord);
				float alpha = tex.a * vGlow * uOpacity * dissolve.x;
				if (alpha < 0.02) discard;
				vec3 col = uColor * (0.75 + tex.r * 1.6) * vGlow;
				col += uColor * dissolve.y * 2.2;
				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	const points = new THREE.Points(pointGeo, pointMat);
	points.name = "AboutEdgeParticles";
	points.frustumCulled = false;
	points.renderOrder = 6;
	mesh.add(points);

	const positionAttr = pointGeo.getAttribute("position");
	const alongAttr = pointGeo.getAttribute("aAlong");

	let baseOpacity = opacity;
	let baseLineIntensity = lineIntensity;
	let baseNodeIntensity = nodeIntensity;
	let visibility = 1;
	let dissolve = 0;

	const applyVisibility = () => {
		const alive = (1 - dissolve) * visibility;
		const op = baseOpacity;
		lineUniforms.uOpacity.value = op * 0.75;
		pointUniforms.uOpacity.value = op;
		lineUniforms.uIntensity.value = baseLineIntensity;
		pointUniforms.uNodeIntensity.value = baseNodeIntensity;
		lineUniforms.uDissolve.value = dissolve;
		pointUniforms.uDissolve.value = dissolve;
		const show = alive > 0.004;
		lines.visible = show;
		points.visible = show;
		lineMat.visible = show;
		pointMat.visible = show;
	};

	const applyConfig = (next = {}) => {
		if (next.color != null) {
			lineUniforms.uColor.value.set(next.color);
			pointUniforms.uColor.value.set(next.color);
		}
		if (next.lineIntensity != null) {
			baseLineIntensity = next.lineIntensity;
		}
		if (next.nodeIntensity != null) {
			baseNodeIntensity = next.nodeIntensity;
		}
		if (next.travelSpeed != null) {
			lineUniforms.uTravelSpeed.value = next.travelSpeed;
			pointUniforms.uTravelSpeed.value = next.travelSpeed;
		}
		if (next.pulseSpeed != null) pointUniforms.uPulseSpeed.value = next.pulseSpeed;
		if (next.opacity != null) {
			baseOpacity = next.opacity;
		}
		if (next.pointSize != null) pointUniforms.uSize.value = next.pointSize;
		if (next.maxPointSizePx != null) pointUniforms.uMaxPointSize.value = next.maxPointSizePx;
		if (next.dissolveMode != null) {
			lineUniforms.uDissolveMode.value = Number(next.dissolveMode);
			pointUniforms.uDissolveMode.value = Number(next.dissolveMode);
		}
		applyVisibility();
	};

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
	for (let s = 0; s < segmentCount; s += 1) {
		linkEnd(segments[s].a, s);
		linkEnd(segments[s].b, s);
	}
	const pickNextSegment = (fromPoint, excludeIndex) => {
		const list = adj.get(qKey(fromPoint));
		if (!list || list.length < 1) return excludeIndex;
		let best = excludeIndex;
		let bestScore = -1;
		for (let i = 0; i < list.length; i += 1) {
			const s = list[i];
			if (s === excludeIndex) continue;
			const score = hash01(excludeIndex * 2.3 + s * 1.9 + fromPoint.x);
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

	return {
		lines,
		points,
		materials: [lineMat, pointMat],
		applyConfig,
		/**
		 * 1 = fully visible, 0 = gone (legacy gate; prefer setDissolve).
		 */
		setVisibility(progress) {
			const next = Number(progress);
			visibility = THREE.MathUtils.clamp(Number.isFinite(next) ? next : 0, 0, 1);
			applyVisibility();
		},
		/**
		 * 0 = intact, 1 = fully dissolved. mode: 0…5 (fade / seed / scan / spark / ring / glitch).
		 */
		setDissolve(progress, mode) {
			const next = Number(progress);
			dissolve = THREE.MathUtils.clamp(Number.isFinite(next) ? next : 0, 0, 1);
			if (mode != null && Number.isFinite(Number(mode))) {
				lineUniforms.uDissolveMode.value = Number(mode);
				pointUniforms.uDissolveMode.value = Number(mode);
			}
			applyVisibility();
		},
		addTime(delta) {
			if (visibility <= 0.004 || dissolve >= 0.995) return;
			const d = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.1);
			lineUniforms.uTime.value += d;
			pointUniforms.uTime.value += d;

			const speedScale = pointUniforms.uTravelSpeed.value;
			for (let i = 0; i < travelerCount; i += 1) {
				const st = travelerState[i];
				st.along += d * st.speed * speedScale * st.dir;

				while (st.along > 1 || st.along < 0) {
					const seg = segments[st.segIndex];
					const end = st.along >= 1 ? seg.b : seg.a;
					tmpB.copy(end);
					st.along = st.along > 1 ? st.along - 1 : st.along + 1;
					const next = pickNextSegment(tmpB, st.segIndex);
					st.segIndex = next;
					const nextSeg = segments[next];
					const startAtA = nextSeg.a.distanceToSquared(tmpB) <= nextSeg.b.distanceToSquared(tmpB);
					st.dir = startAtA ? 1 : -1;
					st.along = startAtA ? st.along : 1 - st.along;
				}

				const seg = segments[st.segIndex];
				tmpA.lerpVectors(seg.a, seg.b, st.along);
				const pi = nodeCount + i;
				positionAttr.setXYZ(pi, tmpA.x, tmpA.y, tmpA.z);
				alongAttr.setX(pi, st.along);
			}
			positionAttr.needsUpdate = true;
			alongAttr.needsUpdate = true;
		},
		setTime(elapsed) {
			lineUniforms.uTime.value = elapsed;
			pointUniforms.uTime.value = elapsed;
		},
		dispose() {
			mesh.remove(lines);
			mesh.remove(points);
			lineGeo.dispose();
			pointGeo.dispose();
			lineMat.dispose();
			pointMat.dispose();
			glowMap.dispose();
		},
	};
}
